import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * V1 and V2 share one stylesheet bundle, so isolation has to be structural.
 *
 * Every V2 rule is scoped under `.dcp-v2`, so it cannot match anything V1 renders; V2 declares
 * nothing on `:root`, `html` or `body`; V1's stylesheets never mention V2; and V2's own components
 * use only V2's class namespace. Each rule is shown to recognise its violation, so a clean result is
 * a clean source rather than a pattern that could never fail.
 */

const SOURCE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const V1_STYLES = join(SOURCE_ROOT, 'styles');
const V2_ROOT = join(SOURCE_ROOT, 'v2');
const V2_STYLES = join(V2_ROOT, 'styles');

const cssIn = (dir: string) =>
  readdirSync(dir).filter(f => f.endsWith('.css')).map(f => ({ file: f, css: readFileSync(join(dir, f), 'utf8') }));

const sourcesIn = (dir: string): { file: string; text: string }[] =>
  readdirSync(dir).flatMap(entry => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return entry === 'styles' ? [] : sourcesIn(path);
    return /\.tsx?$/.test(entry) ? [{ file: path.slice(SOURCE_ROOT.length + 1), text: readFileSync(path, 'utf8') }] : [];
  });

/** Every selector in a stylesheet, including those inside `@media`, split on commas. */
export function selectorsOf(css: string): string[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  // Keyframe steps ('from', '50%') are not selectors, and an animation name is not a rule.
  const withoutKeyframes = clean.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  const out: string[] = [];
  for (const block of withoutKeyframes.split('{')) {
    const head = (block.split('}').pop() ?? '').trim();
    if (!head || head.startsWith('@')) continue;
    out.push(...head.split(',').map(s => s.trim()).filter(Boolean));
  }
  return out;
}

const isScoped = (selector: string) => selector === '.dcp-v2' || /^\.dcp-v2[\s.:[>]/.test(selector);
const TOUCHES_GLOBALS = /(^|[\s,>+~])(:root|html|body)\b/;
const MENTIONS_V2 = /\.dcp-v2|--v2-|\.v2-/;

/** Literal class names in a source file (attribute strings and string literals inside className). */
function classNamesIn(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{([^{}]*)\})/g)) {
    const raw = match[1] ?? match[2] ?? [...(match[3] ?? '').matchAll(/'([^']*)'/g)].map(m => m[1]).join(' ');
    names.push(...raw.replace(/\$\{[^}]*\}/g, ' ').split(/\s+/).filter(Boolean));
  }
  return names;
}

const V2_CLASS = /^(dcp-v2|v2-[a-z0-9-]+)$/;

describe('the rules themselves', () => {
  it('ignores keyframe steps', () => {
    expect(selectorsOf('@keyframes k { from { a: 1 } to { a: 2 } } .dcp-v2 .x { b: 1 }')).toEqual(['.dcp-v2 .x']);
  });

  it('finds selectors inside media queries', () => {
    expect(selectorsOf('@media (max-width:1px){ .dcp-v2 .a, .b { x: 1 } }')).toEqual(['.dcp-v2 .a', '.b']);
  });

  it.each([['.card'], ['body'], ['.dcp-v2x .a'], [':root']])('rejects %j as unscoped', selector => {
    expect(isScoped(selector)).toBe(false);
  });

  it.each([['.dcp-v2'], ['.dcp-v2 .v2-nav'], ['.dcp-v2.v2-fallback'], ['.dcp-v2 :focus-visible']])(
    'accepts %j as scoped', selector => {
      expect(isScoped(selector)).toBe(true);
    });

  it('recognises a global selector', () => {
    expect(['body', 'html, body', ':root', '.x > body'].every(s => TOUCHES_GLOBALS.test(s))).toBe(true);
  });

  it('reads class names from each form a component writes them in', () => {
    expect(classNamesIn('<a className="v2-a card" /> <b className={`v2-b ${x}`} /> <c className={on ? \'v2-c\' : \'grid\'} />'))
      .toEqual(['v2-a', 'card', 'v2-b', 'v2-c', 'grid']);
  });
});

describe('V2 stylesheets', () => {
  const sheets = cssIn(V2_STYLES);

  it('exist', () => {
    expect(sheets.length).toBeGreaterThan(1);
  });

  it('scope every selector under .dcp-v2', () => {
    const unscoped = sheets.flatMap(({ file, css }) => selectorsOf(css).filter(s => !isScoped(s)).map(s => `${file}: ${s}`));

    expect(unscoped).toEqual([]);
  });

  it('declare nothing on :root, html or body', () => {
    const globals = sheets.flatMap(({ file, css }) => selectorsOf(css).filter(s => TOUCHES_GLOBALS.test(s)).map(s => `${file}: ${s}`));

    expect(globals).toEqual([]);
  });
});

describe('V1 stylesheets', () => {
  it('never mention V2', () => {
    expect(cssIn(V1_STYLES).filter(({ css }) => MENTIONS_V2.test(css)).map(({ file }) => file)).toEqual([]);
  });
});

describe('V2 components', () => {
  const sources = sourcesIn(V2_ROOT);

  it('exist', () => {
    expect(sources.length).toBeGreaterThan(2);
  });

  it('use only the V2 class namespace', () => {
    const foreign = sources.flatMap(({ file, text }) => classNamesIn(text).filter(n => !V2_CLASS.test(n)).map(n => `${file}: ${n}`));

    expect(foreign).toEqual([]);
  });

  it('never restyle the document itself', () => {
    const offenders = sources.filter(({ text }) => /document\.(documentElement|body)\.(style|setAttribute|classList)/.test(text));

    expect(offenders.map(({ file }) => file)).toEqual([]);
  });
});
