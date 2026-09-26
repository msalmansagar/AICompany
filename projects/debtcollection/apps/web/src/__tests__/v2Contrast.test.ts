import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Every text/background pair V2 draws meets WCAG 2.1 AA for normal text (4.5:1).
 *
 * Read from the token file itself, so changing a token re-checks every pair that uses it. Status and
 * bucket badges are checked on the tint they are actually drawn on.
 */

const TOKENS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'v2', 'styles', 'v2-tokens.css'), 'utf8');

function token(name: string): string {
  const match = new RegExp(`--v2-${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(TOKENS);
  if (!match) throw new Error(`token --v2-${name} not found as a hex colour`);
  return match[1]!;
}

const channels = (hex: string) => [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16));

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

/** `color-mix(in srgb, colour 12%, white)`, as the badges are drawn. */
function tint(hex: string, share: number): string {
  return `#${channels(hex).map(c => Math.round(c * share + 255 * (1 - share)).toString(16).padStart(2, '0')).join('')}`;
}

const WHITE = '#FFFFFF';

const PAIRS: readonly [string, string, string][] = [
  ['body text', token('text'), token('surface')],
  ['secondary text', token('text-2'), token('surface')],
  ['muted text on a card', token('text-muted'), token('surface')],
  ['muted text on the canvas', token('text-muted'), token('canvas')],
  ['muted text on a header row', token('text-muted'), token('surface-alt')],
  ['links', token('link'), token('surface')],
  ['navigation item', token('nav-text'), token('nav')],
  ['navigation section label', token('nav-section'), token('nav')],
  ['navigation subtitle', token('nav-subtle'), token('nav')],
  ['current navigation item', WHITE, token('nav-active')],
  ['primary button', WHITE, token('primary')],
  ['success badge', token('success'), token('success-bg')],
  ['warning badge', token('warning'), token('warning-bg')],
  ['danger badge', token('danger'), token('danger-bg')],
  ['info badge', token('info'), token('info-bg')],
  ['neutral badge', token('neutral'), token('neutral-bg')],
  ['selected chip', token('accent-ink'), token('accent-soft')],
  ['arrears figure', token('danger-strong'), token('surface')],
  ['next-action button', token('primary'), token('accent')],
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => [`bucket ${n} badge`, token(`bucket-${n}`), tint(token(`bucket-${n}`), 0.12)] as [string, string, string]),
];

describe('the contrast calculation', () => {
  it('matches the known black-on-white ratio', () => {
    expect(contrast('#000000', WHITE)).toBeCloseTo(21, 5);
  });

  it('matches a known mid-grey ratio', () => {
    expect(contrast('#767676', WHITE)).toBeCloseTo(4.54, 2);
  });
});

describe('one bucket palette across V1 and V2', () => {
  const V1_TOKENS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'styles', 'tokens.css'), 'utf8');

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])('bucket %i is the same hue in V1 and V2', (n) => {
    const v1 = new RegExp(`--bucket-${n}:\\s*(#[0-9A-Fa-f]{6})`).exec(V1_TOKENS)?.[1]?.toUpperCase();
    expect(v1).toBe(token(`bucket-${n}`).toUpperCase());
  });
});

describe('V2 text contrast', () => {
  it.each(PAIRS)('%s meets 4.5:1', (_what, foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });
});
