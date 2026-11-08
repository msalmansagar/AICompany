// Appearance palettes — the four themes of the design system, as data.
//
// Each app's styles/tokens.css themes everything that app draws itself. Fluent's
// own components (Dialog, Dropdown, Input, DataGrid) do not read CSS variables,
// so the same four palettes are carried here and mapped onto Fluent tokens by
// fluentAppearance.ts. They live in shared so the designer and the form runtime
// cannot drift into two different-looking products.
//
// These values and each tokens.css must agree. appearancePalettes.test.ts parses
// the stylesheets and asserts they do, so a colour changed in one place and not
// the other fails the suite rather than shipping a half-themed dialog.

/** Colour values one appearance resolves to. Mirrors a `:root[data-theme]` block. */
export interface AppearancePalette {
  primary: string;
  primaryHover: string;
  primaryPressed: string;
  primaryTint: string;
  primaryTint2: string;

  bg: string;
  surface: string;
  surfaceAlt: string;
  surfaceRaised: string;

  border: string;
  borderStrong: string;
  borderInput: string;

  text: string;
  textSecondary: string;
  textDisabled: string;

  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  error: string;
  errorBg: string;

  radius: string;
  radiusLg: string;
  shadow8: string;
  shadow16: string;
  shadow64: string;

  /** Whether Fluent should build this from its dark ramp rather than its light one. */
  isDark: boolean;
}

const FLUENT_SHADOW_8 = '0 1.6px 3.6px rgba(0, 0, 0, .13), 0 .3px .9px rgba(0, 0, 0, .11)';
const FLUENT_SHADOW_16 = '0 3.2px 7.2px rgba(0, 0, 0, .13), 0 .6px 1.8px rgba(0, 0, 0, .11)';
const FLUENT_SHADOW_64 = '0 12.8px 28.8px rgba(0, 0, 0, .22), 0 2.4px 7.2px rgba(0, 0, 0, .18)';

const LIGHT: AppearancePalette = {
  primary: '#0078d4',
  primaryHover: '#106ebe',
  primaryPressed: '#005a9e',
  primaryTint: '#deecf9',
  primaryTint2: '#eff6fc',

  bg: '#f3f2f1',
  surface: '#ffffff',
  surfaceAlt: '#faf9f8',
  surfaceRaised: '#ffffff',

  border: '#edebe9',
  borderStrong: '#e1dfdd',
  borderInput: '#8a8886',

  text: '#201f1e',
  textSecondary: '#605e5c',
  textDisabled: '#a19f9d',

  success: '#107c10',
  successBg: '#dff6dd',
  warning: '#ca7c11',
  warningBg: '#fff4ce',
  error: '#a4262c',
  errorBg: '#fde7e9',

  radius: '2px',
  radiusLg: '4px',
  shadow8: FLUENT_SHADOW_8,
  shadow16: FLUENT_SHADOW_16,
  shadow64: FLUENT_SHADOW_64,

  isDark: false,
};

const DARK: AppearancePalette = {
  primary: '#2899f5',
  primaryHover: '#3aa0f3',
  primaryPressed: '#1a86dc',
  primaryTint: '#0b3a5c',
  primaryTint2: '#10334d',

  bg: '#1b1a19',
  surface: '#292827',
  surfaceAlt: '#201f1e',
  surfaceRaised: '#323130',

  border: '#3b3a39',
  borderStrong: '#484644',
  borderInput: '#605e5c',

  text: '#f3f2f1',
  textSecondary: '#c8c6c4',
  textDisabled: '#797775',

  success: '#6bb700',
  successBg: '#1f2e10',
  warning: '#fce100',
  warningBg: '#3a3410',
  error: '#f1707b',
  errorBg: '#3a1416',

  radius: '2px',
  radiusLg: '4px',
  shadow8: '0 1.6px 3.6px rgba(0, 0, 0, .4)',
  shadow16: '0 3.2px 7.2px rgba(0, 0, 0, .5)',
  shadow64: '0 12.8px 28.8px rgba(0, 0, 0, .6)',

  isDark: true,
};

// Glass reads as light — dark text on frosted white — so Fluent builds it from
// the light ramp. Its surfaces are translucent, which is why Fluent's own
// components sit on --surface-raised rather than --surface: a menu at 55%
// opacity over another menu is unreadable.
const GLASS: AppearancePalette = {
  primary: '#5b5bd6',
  primaryHover: '#4d4dc7',
  primaryPressed: '#3f3fb0',
  primaryTint: 'rgba(91, 91, 214, .18)',
  primaryTint2: 'rgba(91, 91, 214, .10)',

  bg: 'rgba(248, 250, 255, .30)',
  surface: 'rgba(255, 255, 255, .55)',
  surfaceAlt: 'rgba(255, 255, 255, .38)',
  surfaceRaised: 'rgba(255, 255, 255, .72)',

  border: 'rgba(255, 255, 255, .55)',
  borderStrong: 'rgba(255, 255, 255, .72)',
  borderInput: 'rgba(110, 110, 150, .45)',

  text: '#1c1c2e',
  textSecondary: '#494963',
  textDisabled: '#9a9ab0',

  success: '#0f7a4f',
  successBg: 'rgba(16, 124, 74, .16)',
  warning: '#b5730a',
  warningBg: 'rgba(202, 124, 17, .16)',
  error: '#c0392b',
  errorBg: 'rgba(164, 38, 44, .16)',

  radius: '8px',
  radiusLg: '16px',
  shadow8: '0 4px 16px rgba(31, 38, 90, .10)',
  shadow16: '0 8px 28px rgba(31, 38, 90, .14)',
  shadow64: '0 24px 60px rgba(31, 38, 90, .24)',

  isDark: false,
};

const VIBRANT: AppearancePalette = {
  primary: '#7c3aed',
  primaryHover: '#6d28d9',
  primaryPressed: '#5b21b6',
  primaryTint: '#ede9fe',
  primaryTint2: '#f5f3ff',

  bg: 'rgba(250, 248, 255, .82)',
  surface: '#ffffff',
  surfaceAlt: '#f7f5ff',
  surfaceRaised: '#ffffff',

  border: 'rgba(124, 58, 237, .14)',
  borderStrong: 'rgba(124, 58, 237, .24)',
  borderInput: '#b9a7e8',

  text: '#1e1b2e',
  textSecondary: '#5a5470',
  textDisabled: '#a99fc0',

  success: '#0f9d58',
  successBg: '#e3f7ec',
  warning: '#d97706',
  warningBg: '#fef3e2',
  error: '#e11d48',
  errorBg: '#fde7ec',

  radius: '8px',
  radiusLg: '16px',
  shadow8: '0 6px 18px rgba(124, 58, 237, .16)',
  shadow16: '0 10px 30px rgba(124, 58, 237, .20)',
  shadow64: '0 26px 64px rgba(124, 58, 237, .32)',

  isDark: false,
};

/** The appearances offered in the theme picker, in the order they are shown. */
export const APPEARANCE_PALETTES = {
  light: LIGHT,
  dark: DARK,
  glass: GLASS,
  vibrant: VIBRANT,
} as const;

export type AppearanceName = keyof typeof APPEARANCE_PALETTES;

export const APPEARANCE_NAMES: readonly AppearanceName[] = ['light', 'dark', 'glass', 'vibrant'];

/** How an appearance presents itself in the picker. */
export interface AppearanceOption {
  name: AppearanceName;
  label: string;
  description: string;
  /** Swatch class defined in each app's components.css. */
  swatchClass: string;
}

/** The appearances offered in the picker, in the order they are shown. */
export const APPEARANCE_OPTIONS: readonly AppearanceOption[] = [
  { name: 'light', label: 'Light', description: 'Clean Fluent default', swatchClass: 'sw-light' },
  { name: 'dark', label: 'Dark', description: 'Low-light, easy on eyes', swatchClass: 'sw-dark' },
  { name: 'glass', label: 'Glass', description: 'Frosted glassmorphism', swatchClass: 'sw-glass' },
  { name: 'vibrant', label: 'Vibrant', description: 'Bold gradient accents', swatchClass: 'sw-vibrant' },
];

export function isAppearanceName(value: string | null): value is AppearanceName {
  return value !== null && (APPEARANCE_NAMES as readonly string[]).includes(value);
}
