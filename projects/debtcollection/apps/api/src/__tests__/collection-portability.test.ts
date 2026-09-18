import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Portability guard for the shared Collection logic.
 *
 * The approved architecture forbids a dependency on either organisation's CRM facility table and
 * forbids branching on the organisation inside business logic. A grep is a blunt instrument, but it
 * is the one that catches the regression on the day it is written rather than on an on-premises
 * deployment months later.
 */
const here = dirname(fileURLToPath(import.meta.url));
const roots = [
  resolve(here, '../services/collection'),
  resolve(here, '../../../../packages/domain/src'),
];

const FORBIDDEN_PHYSICAL_NAMES = ['qdb_facilitylimit', 'qdb_customerproduct', 'facilitylimit', 'customerproduct', 'qdb_facilityid', 'crmi_'];
const ORGANISATION_BRANCHES = [/===\s*['"](HL|BFD)['"]/, /case\s+['"](HL|BFD)['"]\s*:/];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

const files = roots.flatMap(sourceFiles);

describe('shared Collection logic', () => {
  it('scans a meaningful set of files', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files)('%s names no CRM facility entity', (file) => {
    const text = readFileSync(file, 'utf8').toLowerCase();
    for (const name of FORBIDDEN_PHYSICAL_NAMES) {
      // Documentation may mention what is forbidden; code may not reference it. Strip comments first.
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(code, `${file} references ${name}`).not.toContain(name);
    }
  });

  it.each(files.filter(f => /Service\.ts$|episode\.ts$|customerResolution\.ts$|snapshot\.ts$|misObservation\.ts$/.test(f)))(
    '%s does not branch on the organisation code', (file) => {
      const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const pattern of ORGANISATION_BRANCHES) expect(code, `${file} branches on HL/BFD`).not.toMatch(pattern);
    },
  );
});
