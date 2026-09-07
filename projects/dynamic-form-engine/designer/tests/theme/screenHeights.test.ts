// Screens render inside AppShell, below a 48px app bar. A screen sized to 100vh is
// therefore 48px taller than the space it has, and it overflows by exactly that —
// silently, because the overflow is at the bottom where the last element lives. The
// form list's status counts were pushed off-screen this way and looked missing.
//
// jsdom does not lay out, so this cannot be caught by rendering. It is a source rule.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SCREENS_DIR = join(__dirname, '../../src/screens');

function screenFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return screenFiles(path);
    return entry.name.endsWith('.tsx') ? [path] : [];
  });
}

describe('screens size to their container, not to the viewport', () => {
  for (const file of screenFiles(SCREENS_DIR)) {
    const name = file.slice(SCREENS_DIR.length + 1);

    it(`${name}_uses_no_viewport_height`, () => {
      expect(readFileSync(file, 'utf8')).not.toContain('100vh');
    });
  }
});
