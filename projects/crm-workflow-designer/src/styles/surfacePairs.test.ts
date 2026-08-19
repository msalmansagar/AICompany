import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALL_SURFACE_PAIRS, routeLabelPair } from './surfacePairs';
import type { SurfacePair } from './surfacePairs';

/**
 * The guard for a defect the compiler and the rest of the suite cannot see.
 *
 * Every route label on the canvas rendered its text in the same colour as its own
 * background — a contrast ratio of exactly 1.00, in all five theme blocks. Each
 * value was individually valid, so nothing failed. These tests resolve each pairing
 * against the real `tokens.css`, composite any translucent colour over the ground it
 * actually sits on, and assert the result stays readable.
 */

type TokenMap = Record<string, string>;
type Rgb = [number, number, number];

const MINIMUM_CONTRAST = 3;
const THEMES = ['default', 'light', 'dark', 'glass', 'vibrant'] as const;

const tokensCss = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8');
const themeTokens = parseThemeBlocks(tokensCss);

/** Splits tokens.css into one token map per `:root[data-theme=…]` block. */
function parseThemeBlocks(source: string): Record<string, TokenMap> {
  const blocks: Record<string, TokenMap> = {};
  const blockPattern = /:root(?:\[data-theme="(\w+)"\])?\s*\{([^}]*)\}/g;
  for (const block of source.matchAll(blockPattern)) {
    const name = block[1] ?? 'default';
    blocks[name] = { ...(blocks[name] ?? {}), ...parseDeclarations(block[2]) };
  }
  return blocks;
}

function parseDeclarations(body: string): TokenMap {
  const declarations: TokenMap = {};
  for (const decl of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    declarations[decl[1]] = decl[2].trim();
  }
  return declarations;
}

/** Follows `var(--x)` references until a literal colour is reached. */
function resolveToken(value: string, tokens: TokenMap, depth = 0): string {
  const reference = /^var\((--[\w-]+)\)$/.exec(value.trim());
  if (!reference || depth > 6) return value.trim();
  const next = tokens[reference[1]];
  return next ? resolveToken(next, tokens, depth + 1) : value.trim();
}

/** Parses a hex or rgb(a) literal into channels plus alpha, or null if unparseable. */
function parseColor(color: string): [number, number, number, number] | null {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color);
  if (short) return [...short.slice(1, 4).map((c) => parseInt(c + c, 16)), 1] as [number, number, number, number];
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (long) return [...long.slice(1, 4).map((c) => parseInt(c, 16)), 1] as [number, number, number, number];
  const functional = /rgba?\(([^)]+)\)/.exec(color);
  if (!functional) return null;
  const parts = functional[1].split(',').map((p) => parseFloat(p));
  return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
}

/** Composites a possibly-translucent colour onto an opaque backdrop. */
function compositeOver(color: string, backdrop: Rgb): Rgb | null {
  const parsed = parseColor(color);
  if (!parsed) return null;
  const [r, g, b, alpha] = parsed;
  if (alpha >= 1) return [r, g, b];
  const blend = (channel: number, under: number): number => Math.round(channel * alpha + under * (1 - alpha));
  return [blend(r, backdrop[0]), blend(g, backdrop[1]), blend(b, backdrop[2])];
}

function relativeLuminance([r, g, b]: Rgb): number {
  const channel = (value: number): number => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(foreground: Rgb, background: Rgb): number {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

/** The opaque ground a canvas chip ultimately rests on for a given theme. */
function canvasGround(tokens: TokenMap): Rgb {
  const canvas = compositeOver(resolveToken('var(--canvas-bg)', tokens), [255, 255, 255]) ?? [255, 255, 255];
  return compositeOver(resolveToken('var(--node-bg)', tokens), canvas) ?? canvas;
}

/** Measures a pairing as it will actually render in one theme. */
function measurePair(pair: SurfacePair, themeName: string): number {
  const tokens = { ...themeTokens.default, ...themeTokens[themeName] };
  const ground = canvasGround(tokens);
  const background = compositeOver(resolveToken(pair.background, tokens), ground) ?? ground;
  const foreground = compositeOver(resolveToken(pair.foreground, tokens), background);
  if (!foreground) throw new Error(`Unresolvable foreground "${pair.foreground}" in theme "${themeName}"`);
  return contrastRatio(foreground, background);
}

describe('tokens.css parsing', () => {
  it('should_find_every_declared_theme', () => {
    expect(Object.keys(themeTokens).sort()).toEqual([...THEMES].sort());
  });
});

describe('surface pair contrast', () => {
  for (const [pairName, pair] of Object.entries(ALL_SURFACE_PAIRS)) {
    for (const theme of THEMES) {
      it(`should_stay_readable_for_${pairName.replace(/\W+/g, '_')}_in_${theme}`, () => {
        expect(measurePair(pair, theme)).toBeGreaterThanOrEqual(MINIMUM_CONTRAST);
      });
    }
  }
});

describe('surface pair tokens', () => {
  // A mistyped token resolves to nothing and the element renders transparent, which
  // the contrast check alone would not catch — it would measure the ground instead.
  const declaredTokens = new Set(Object.keys(themeTokens.default));

  for (const [pairName, pair] of Object.entries(ALL_SURFACE_PAIRS)) {
    it(`should_only_reference_declared_tokens_for_${pairName.replace(/\W+/g, '_')}`, () => {
      const referenced = [pair.background, pair.foreground, pair.border]
        .map((value) => /^var\((--[\w-]+)\)$/.exec(value)?.[1])
        .filter((name): name is string => name !== undefined);
      expect(referenced).toHaveLength(3);
      expect(referenced.filter((name) => !declaredTokens.has(name))).toEqual([]);
    });
  }
});

describe('surface pair definition', () => {
  it('should_never_paint_text_in_its_own_background_colour', () => {
    const collisions = Object.entries(ALL_SURFACE_PAIRS)
      .filter(([, pair]) => pair.foreground === pair.background)
      .map(([name]) => name);
    expect(collisions).toEqual([]);
  });
});

describe('routeLabelPair', () => {
  it('should_return_a_distinct_foreground_for_each_kind', () => {
    const foregrounds = (['fallback', 'conditional', 'plain'] as const).map((k) => routeLabelPair(k).foreground);
    expect(new Set(foregrounds).size).toBe(3);
  });
});
