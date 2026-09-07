// The design system has two halves that must agree: styles/tokens.css, which
// themes everything the designer draws, and APPEARANCE_PALETTES, which themes
// Fluent's own components. Nothing at runtime forces them to match — a colour
// changed in one and not the other produces a dialog a shade off from the panel
// behind it, which reads as a rendering bug rather than a missed edit.
//
// So this parses the stylesheet and asserts the two halves state the same thing.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APPEARANCE_PALETTES, APPEARANCE_NAMES, type AppearancePalette } from '@qdb/shared';

const TOKENS_CSS = readFileSync(join(__dirname, '../../../shared/src/theme/tokens.css'), 'utf8');

/** CSS custom property → the palette field that must carry the same value. */
const VARIABLE_TO_FIELD: Record<string, keyof AppearancePalette> = {
  '--primary': 'primary',
  '--primary-hover': 'primaryHover',
  '--primary-pressed': 'primaryPressed',
  '--primary-tint': 'primaryTint',
  '--primary-tint-2': 'primaryTint2',
  '--bg': 'bg',
  '--surface': 'surface',
  '--surface-alt': 'surfaceAlt',
  '--surface-raised': 'surfaceRaised',
  '--border': 'border',
  '--border-strong': 'borderStrong',
  '--border-input': 'borderInput',
  '--text': 'text',
  '--text-secondary': 'textSecondary',
  '--text-disabled': 'textDisabled',
  '--success': 'success',
  '--success-bg': 'successBg',
  '--warning': 'warning',
  '--warning-bg': 'warningBg',
  '--error': 'error',
  '--error-bg': 'errorBg',
  '--radius': 'radius',
  '--radius-lg': 'radiusLg',
  '--shadow-8': 'shadow8',
  '--shadow-16': 'shadow16',
  '--shadow-64': 'shadow64',
};

// Declarations, not whitespace, are what must match: the stylesheet wraps long
// shadows across lines and the palette states them on one.
function normalise(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** The custom properties declared in one `:root[data-theme="..."]` block. */
function declarationsFor(appearance: string): Record<string, string> {
  const opening = `:root[data-theme="${appearance}"] {`;
  const start = TOKENS_CSS.indexOf(opening);
  if (start === -1) throw new Error(`tokens.css declares no block for "${appearance}"`);

  const bodyStart = start + opening.length;
  const end = TOKENS_CSS.indexOf('\n}', bodyStart);
  const body = TOKENS_CSS.slice(bodyStart, end);

  const declarations: Record<string, string> = {};
  for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    declarations[name] = normalise(value);
  }
  return declarations;
}

describe('tokens.css and APPEARANCE_PALETTES agree', () => {
  for (const appearance of APPEARANCE_NAMES) {
    describe(appearance, () => {
      const declarations = declarationsFor(appearance);
      const palette = APPEARANCE_PALETTES[appearance];

      for (const [variable, field] of Object.entries(VARIABLE_TO_FIELD)) {
        it(`declares_${variable}_as_the_palette_does`, () => {
          expect(declarations[variable]).toBe(normalise(String(palette[field])));
        });
      }
    });
  }

  it('offers_every_appearance_the_stylesheet_themes', () => {
    const themed = [...TOKENS_CSS.matchAll(/:root\[data-theme="([\w-]+)"\]/g)].map((m) => m[1]);
    expect([...new Set(themed)].sort()).toEqual([...APPEARANCE_NAMES].sort());
  });
});
