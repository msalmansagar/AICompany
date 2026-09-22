import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Every class name a component renders must have a rule behind it.
 *
 * This exists because the first deployment inside Dynamics rendered as unstyled HTML. The three
 * stylesheets were ported from the approved prototype correctly — and then the components were
 * written against class names the prototype had never defined. `.uci-header` instead of
 * `.app-header`, `.cmd-button` instead of `.cmd`, `.data-grid` instead of `.grid`. Seventy-five of
 * the eighty-six class names in use resolved to nothing.
 *
 * Nothing caught it. The tests asserted the tokens existed, the deploy asserted `--primary` survived
 * the round trip, and the volume tests asserted DOM *counts* — none of which touches whether a
 * rendered element receives a rule. jsdom has no cascade, so a component suite cannot notice either.
 *
 * So the check is static: extract what the components ask for, extract what the stylesheets define,
 * and fail on the difference.
 *
 * It also rejects **computed** class names. `className={`pill ${tone}`}` cannot be verified, and the
 * approved design does not need it — the prototype maps every status onto one of five fixed tones.
 * A class name assembled from a value at runtime is how an unstyled element hides from this test.
 */

const SOURCE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STYLE_DIR = join(SOURCE_ROOT, 'styles');

/** Class names the host page owns, or that exist only to be found by a test. */
const NOT_STYLED_HERE = new Set(['clickable']);

function componentFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      if (entry === '__tests__' || entry === 'styles') continue;
      found.push(...componentFiles(path));
    } else if (/\.tsx?$/.test(entry)) {
      found.push(path);
    }
  }
  return found;
}

interface ClassUsage { name: string; file: string }

/**
 * Pulls every literal class name out of a source file, and every computed one separately.
 *
 * Three forms are read, because all three reach the DOM:
 *   • `className="grid"` — the plain attribute;
 *   • `` className={`pill ${tone}`} `` — a template, whose static words are still checkable;
 *   • `className={wide ? 'dialog lg' : 'dialog'}` — an expression holding string literals.
 *
 * The third was added in Phase 6. A ternary between two literals is the natural way to write a
 * variant, and until it was read here those class names reached the browser unchecked — which is the
 * one thing this test exists to prevent. The regex takes every quoted string inside the braces; a
 * false positive would be a word that has a CSS rule anyway, so erring wide costs nothing.
 */
function readClassNames(source: string, file: string) {
  const literal: ClassUsage[] = [];
  const computed: string[] = [];

  for (const match of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{([^{}]*)\})/g)) {
    const expression = match[3];
    if (expression !== undefined) {
      for (const quoted of expression.matchAll(/'([^']*)'|"([^"]*)"/g)) {
        const value = quoted[1] ?? quoted[2] ?? '';
        for (const name of value.split(/\s+/).filter(Boolean)) literal.push({ name, file });
      }
      continue;
    }
    const value = match[1] ?? match[2] ?? '';
    if (match[2] !== undefined && /\$\{/.test(value)) {
      // A template with interpolation: the static words are still checkable, the rest is not.
      for (const fragment of value.split(/\$\{[^}]*\}/)) {
        for (const name of fragment.split(/\s+/).filter(Boolean)) literal.push({ name, file });
      }
      // Flag only interpolation that is glued to a prefix — `pill-${tone}` invents a class name,
      // whereas `pill ${tone}` selects one that must itself exist.
      if (/[\w-]\$\{/.test(value)) computed.push(value.trim());
      continue;
    }
    for (const name of value.split(/\s+/).filter(Boolean)) literal.push({ name, file });
  }
  return { literal, computed };
}

function definedClassNames(): Set<string> {
  const names = new Set<string>();
  for (const file of readdirSync(STYLE_DIR).filter(f => f.endsWith('.css'))) {
    const css = readFileSync(join(STYLE_DIR, file), 'utf8');
    // Selectors only: a class name mentioned inside a declaration value is not a rule.
    for (const block of css.split('{')) {
      const selector = block.split('}').pop() ?? '';
      for (const match of selector.matchAll(/\.([a-zA-Z][\w-]*)/g)) names.add(match[1]!);
    }
  }
  return names;
}

describe('every class the workspace renders has a rule behind it', () => {
  const files = componentFiles(SOURCE_ROOT);
  const defined = definedClassNames();
  const usages = files.flatMap(file => readClassNames(readFileSync(file, 'utf8'), file).literal);

  it('has components and stylesheets to compare', () => {
    expect(files.length, 'no component files were scanned').toBeGreaterThan(15);
    expect(defined.size, 'no CSS rules were found').toBeGreaterThan(100);
    expect(usages.length, 'no class names were extracted').toBeGreaterThan(50);
  });

  it('defines a rule for every class name the components use', () => {
    const missing = [...new Set(
      usages.filter(u => !defined.has(u.name) && !NOT_STYLED_HERE.has(u.name))
        .map(u => `${u.name}  (${relative(SOURCE_ROOT, u.file).replace(/\\/g, '/')})`),
    )].sort();
    expect(missing, `class names with no rule:\n${missing.join('\n')}`).toEqual([]);
  });

  it('builds no class name by gluing a value onto a prefix', () => {
    const offenders = files.flatMap(file => {
      const { computed } = readClassNames(readFileSync(file, 'utf8'), file);
      return computed.map(value => `${relative(SOURCE_ROOT, file).replace(/\\/g, '/')}: ${value}`);
    });
    expect(offenders, `a computed class name cannot be verified:\n${offenders.join('\n')}`).toEqual([]);
  });
});
