import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `@dcp/domain` ships to a browser, so it may not reach for anything only Node provides.
 *
 * The React workspace imports this package directly — the paging contract, the MIS types, the
 * lifecycle rules. A Node-only global compiles, type-checks, passes every unit test and then throws
 * `ReferenceError` in Dynamics, because vitest runs on Node and the test environment has the very
 * globals a browser lacks.
 *
 * That is not hypothetical: `paging.ts` encoded its continuation token with `Buffer`, and every list
 * holding more than one page failed in the real host while the whole suite stayed green. This scan
 * is the cheap, static half of the guard; `paging.test.ts` holds the behavioural half, which deletes
 * `Buffer` and proves the round trip still works.
 */

const SOURCE_ROOT = dirname(fileURLToPath(import.meta.url));

/** Globals Node supplies and a browser does not. */
const NODE_ONLY = [
  { pattern: /(^|[^.\w'"`])Buffer\s*\./, name: 'Buffer', instead: 'TextEncoder/TextDecoder with btoa/atob' },
  { pattern: /(^|[^.\w'"`])process\s*\./, name: 'process', instead: 'a value passed in by the caller' },
  { pattern: /(^|[^.\w'"`])__dirname\b/, name: '__dirname', instead: 'nothing — a browser has no filesystem' },
  { pattern: /(^|[^.\w'"`])require\s*\(/, name: 'require()', instead: 'an ES import' },
  { pattern: /from\s+['"]node:/, name: "a 'node:' import", instead: 'a platform-neutral equivalent' },
];

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) { found.push(...sourceFiles(path)); continue; }
    // Tests run on Node by definition, and are not bundled into the workspace.
    if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) found.push(path);
  }
  return found;
}

/** Strips comments, so prose describing the rule is not mistaken for a breach of it. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

describe('the domain package runs in a browser', () => {
  const files = sourceFiles(SOURCE_ROOT);

  it('has source files to scan', () => {
    expect(files.length, 'no source files were found').toBeGreaterThan(10);
  });

  for (const { pattern, name, instead } of NODE_ONLY) {
    it(`uses no ${name}`, () => {
      const offenders = files
        .filter(file => pattern.test(code(readFileSync(file, 'utf8'))))
        .map(file => relative(SOURCE_ROOT, file).replace(/\\/g, '/'));
      expect(offenders, `${name} is Node-only; use ${instead}. Found in: ${offenders.join(', ')}`).toEqual([]);
    });
  }

  /** The patterns must match the thing they forbid, or these are five ways of proving nothing. */
  it('recognises each Node-only global when it is present', () => {
    const samples = [
      'const a = Buffer.from(x);',
      'const b = process.env.HOME;',
      'const c = __dirname;',
      'const d = require("fs");',
      "import { readFileSync } from 'node:fs';",
    ];
    expect(samples).toHaveLength(NODE_ONLY.length);
    samples.forEach((sample, index) => {
      expect(NODE_ONLY[index]!.pattern.test(sample), `${NODE_ONLY[index]!.name} not caught in: ${sample}`).toBe(true);
    });
  });
});
