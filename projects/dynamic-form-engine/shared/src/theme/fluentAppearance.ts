// Fluent mapping for an appearance.
//
// Fluent v9 builds a ~200-token Theme from a 16-shade brand ramp. That gets the
// brand right but leaves Fluent's stock neutrals, which are not the ones the
// design system uses — so a dialog would sit a shade off from the surface behind
// it. buildBrandRamp produces the ramp; fluentTokenOverrides restates the
// neutrals, semantics, radii and shadows in the palette's terms.
//
// Kept framework-free (plain records, no Fluent import) so this package does not
// take a React dependency. Each app applies it as:
//
//   const base = palette.isDark ? createDarkTheme(ramp) : createLightTheme(ramp);
//   const theme = { ...base, ...fluentTokenOverrides(palette) } as Theme;

import type { AppearancePalette } from './appearancePalettes.js';

/** The 16 shade keys Fluent's BrandVariants requires. */
export type BrandShade = 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90 | 100 | 110 | 120 | 130 | 140 | 150 | 160;

/**
 * Fluent's brand ramp: 16 shades keyed 10..160, where 80 is the brand colour.
 *
 * Keyed exactly rather than by `number` so it satisfies Fluent's BrandVariants
 * structurally, without this package importing a Fluent type.
 */
export type BrandRamp = Record<BrandShade, string>;

interface Rgb {
  red: number;
  green: number;
  blue: number;
}

const FLUENT_BRAND_SHADE = 80;

// Positive mixes towards white, negative towards black. Shade 80 is untouched so
// the brand colour survives the ramp exactly as authored.
const SHADE_MIX: readonly (readonly [BrandShade, number])[] = [
  [10, 0.85], [20, 0.72], [30, 0.6], [40, 0.48],
  [50, 0.36], [60, 0.24], [70, 0.12], [FLUENT_BRAND_SHADE, 0],
  [90, -0.1], [100, -0.2], [110, -0.3], [120, -0.4],
  [130, -0.5], [140, -0.6], [150, -0.7], [160, -0.8],
];

const FALLBACK_BRAND: Rgb = { red: 0, green: 120, blue: 212 };

function parseHex(colour: string): Rgb | null {
  const cleaned = colour.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null;
  return {
    red: parseInt(cleaned.slice(0, 2), 16),
    green: parseInt(cleaned.slice(2, 4), 16),
    blue: parseInt(cleaned.slice(4, 6), 16),
  };
}

function toHex({ red, green, blue }: Rgb): string {
  const clamp = (value: number): string =>
    Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
  return `#${clamp(red)}${clamp(green)}${clamp(blue)}`;
}

function mix(colour: Rgb, factor: number): Rgb {
  const towardsWhite = factor >= 0;
  const amount = Math.abs(factor);
  const blend = (channel: number): number =>
    towardsWhite ? channel + (255 - channel) * amount : channel * (1 - amount);
  return { red: blend(colour.red), green: blend(colour.green), blue: blend(colour.blue) };
}

/**
 * The 16-shade ramp Fluent needs, derived from one brand colour by luminance shift.
 *
 * A non-hex brand colour (glass and vibrant state some tints as rgba) falls back to
 * the Fluent blue rather than throwing — the ramp only drives Fluent's own brand
 * treatments, and a readable default beats a blank app.
 */
export function buildBrandRamp(brandColour: string): BrandRamp {
  const base = parseHex(brandColour) ?? FALLBACK_BRAND;
  const ramp = {} as BrandRamp;
  for (const [shade, factor] of SHADE_MIX) {
    ramp[shade] = toHex(mix(base, factor));
  }
  return ramp;
}

/**
 * Fluent tokens restated in the palette's terms, to spread over a theme built from
 * the brand ramp.
 *
 * Surfaces use `surfaceRaised` rather than `surface` wherever Fluent floats one
 * layer above another — menus, dialogs, tooltips. Under glass, `surface` is 55%
 * translucent, and a translucent menu over a translucent panel cannot be read.
 */
export function fluentTokenOverrides(palette: AppearancePalette): Record<string, string> {
  return {
    ...backgroundTokens(palette),
    ...foregroundTokens(palette),
    ...strokeTokens(palette),
    ...brandTokens(palette),
    ...statusTokens(palette),
    ...shapeTokens(palette),
  };
}

function backgroundTokens(palette: AppearancePalette): Record<string, string> {
  return {
    colorNeutralBackground1: palette.surface,
    colorNeutralBackground1Hover: palette.surfaceAlt,
    colorNeutralBackground1Pressed: palette.surfaceAlt,
    colorNeutralBackground1Selected: palette.primaryTint2,
    colorNeutralBackground2: palette.surfaceAlt,
    colorNeutralBackground2Hover: palette.surface,
    colorNeutralBackground2Pressed: palette.surface,
    colorNeutralBackground3: palette.bg,
    colorNeutralBackground4: palette.bg,
    colorNeutralBackground5: palette.bg,
    colorNeutralBackground6: palette.surfaceAlt,
    colorNeutralBackgroundStatic: palette.surfaceRaised,
    colorNeutralBackgroundDisabled: palette.surfaceAlt,
    colorSubtleBackground: 'transparent',
    colorSubtleBackgroundHover: palette.surfaceAlt,
    colorSubtleBackgroundPressed: palette.surfaceAlt,
    colorSubtleBackgroundSelected: palette.primaryTint2,
  };
}

function foregroundTokens(palette: AppearancePalette): Record<string, string> {
  return {
    colorNeutralForeground1: palette.text,
    colorNeutralForeground1Hover: palette.text,
    colorNeutralForeground1Pressed: palette.text,
    colorNeutralForeground2: palette.text,
    colorNeutralForeground2Hover: palette.text,
    colorNeutralForeground3: palette.textSecondary,
    colorNeutralForeground4: palette.textSecondary,
    colorNeutralForegroundDisabled: palette.textDisabled,
    colorNeutralForegroundOnBrand: '#ffffff',
  };
}

function strokeTokens(palette: AppearancePalette): Record<string, string> {
  return {
    colorNeutralStroke1: palette.borderStrong,
    colorNeutralStroke1Hover: palette.borderInput,
    colorNeutralStroke1Pressed: palette.borderInput,
    colorNeutralStroke2: palette.border,
    colorNeutralStroke3: palette.border,
    colorNeutralStrokeSubtle: palette.border,
    colorNeutralStrokeAccessible: palette.borderInput,
    colorNeutralStrokeAccessibleHover: palette.borderInput,
    colorNeutralStrokeDisabled: palette.border,
  };
}

function brandTokens(palette: AppearancePalette): Record<string, string> {
  return {
    colorBrandBackground: palette.primary,
    colorBrandBackgroundHover: palette.primaryHover,
    colorBrandBackgroundPressed: palette.primaryPressed,
    colorBrandBackgroundSelected: palette.primaryHover,
    colorBrandBackground2: palette.primaryTint2,
    colorBrandBackgroundStatic: palette.primary,
    colorBrandForeground1: palette.primary,
    colorBrandForeground2: palette.primary,
    colorBrandForegroundLink: palette.primary,
    colorBrandForegroundLinkHover: palette.primaryHover,
    colorBrandStroke1: palette.primary,
    colorBrandStroke2: palette.primaryTint,
    colorCompoundBrandBackground: palette.primary,
    colorCompoundBrandBackgroundHover: palette.primaryHover,
    colorCompoundBrandBackgroundPressed: palette.primaryPressed,
    colorCompoundBrandForeground1: palette.primary,
    colorCompoundBrandForeground1Hover: palette.primaryHover,
    colorCompoundBrandStroke: palette.primary,
    colorCompoundBrandStrokeHover: palette.primaryHover,
  };
}

function statusTokens(palette: AppearancePalette): Record<string, string> {
  return {
    colorPaletteRedForeground1: palette.error,
    colorPaletteRedBackground1: palette.errorBg,
    colorPaletteRedBorder1: palette.error,
    colorPaletteRedBorder2: palette.error,
    colorPaletteGreenForeground1: palette.success,
    colorPaletteGreenBackground1: palette.successBg,
    colorPaletteGreenBorder2: palette.success,
    colorPaletteYellowForeground1: palette.warning,
    colorPaletteYellowBackground1: palette.warningBg,
    colorPaletteDarkOrangeForeground1: palette.warning,
    colorPaletteDarkOrangeBackground1: palette.warningBg,
    colorStatusDangerForeground1: palette.error,
    colorStatusDangerBackground1: palette.errorBg,
    colorStatusDangerBorder1: palette.error,
    colorStatusSuccessForeground1: palette.success,
    colorStatusSuccessBackground1: palette.successBg,
    colorStatusSuccessBorder1: palette.success,
    colorStatusWarningForeground1: palette.warning,
    colorStatusWarningBackground1: palette.warningBg,
  };
}

function shapeTokens(palette: AppearancePalette): Record<string, string> {
  return {
    borderRadiusSmall: palette.radius,
    borderRadiusMedium: palette.radius,
    borderRadiusLarge: palette.radiusLg,
    borderRadiusXLarge: palette.radiusLg,
    shadow4: palette.shadow8,
    shadow8: palette.shadow8,
    shadow16: palette.shadow16,
    shadow28: palette.shadow64,
    shadow64: palette.shadow64,
  };
}
