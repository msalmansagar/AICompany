/**
 * Look-and-feel baseline — MSS Technologies global design tokens.
 *
 * Every project inherits this and renders as one system. Values are
 * brand-neutral and client-agnostic; a project overrides only what it must,
 * via `overrideTokens`, rather than redefining the set. Keeping the shape
 * identical across projects is what makes the portfolio look coherent.
 *
 * Tokens are plain data (no framework) so they work in any runtime — CSS
 * variables, a Tailwind config, a PCF control, or a React Native StyleSheet.
 */

export interface DesignTokens {
  color: {
    /** Primary brand/action color. */
    primary: string;
    primaryContrast: string;
    /** Surfaces and text. */
    surface: string;
    surfaceMuted: string;
    text: string;
    textMuted: string;
    border: string;
    /** Semantic. */
    success: string;
    warning: string;
    danger: string;
  };
  space: { xs: string; sm: string; md: string; lg: string; xl: string };
  radius: { sm: string; md: string; lg: string; pill: string };
  font: {
    /** Latin + Arabic-capable stack — bilingual is a first-class default. */
    family: string;
    sizeSm: string;
    sizeMd: string;
    sizeLg: string;
    weightRegular: number;
    weightBold: number;
  };
  /** Layout direction default; a project flips to 'rtl' per locale at runtime. */
  direction: 'ltr' | 'rtl';
}

/** The neutral baseline. Swap `color.primary` per project brand; keep the rest. */
export const baseTokens: DesignTokens = {
  color: {
    primary: '#2563eb',
    primaryContrast: '#ffffff',
    surface: '#ffffff',
    surfaceMuted: '#f5f6f8',
    text: '#1a1d21',
    textMuted: '#5b6570',
    border: '#d9dde2',
    success: '#177245',
    warning: '#b26a00',
    danger: '#b3261e',
  },
  space: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '40px' },
  radius: { sm: '4px', md: '8px', lg: '16px', pill: '999px' },
  font: {
    family:
      "'Segoe UI', 'Noto Sans Arabic', system-ui, -apple-system, sans-serif",
    sizeSm: '13px',
    sizeMd: '15px',
    sizeLg: '20px',
    weightRegular: 400,
    weightBold: 600,
  },
  direction: 'ltr',
};

/** Produce project tokens by overriding only the fields that differ. */
export function overrideTokens(overrides: DeepPartial<DesignTokens>): DesignTokens {
  return {
    ...baseTokens,
    ...overrides,
    color: { ...baseTokens.color, ...overrides.color },
    space: { ...baseTokens.space, ...overrides.space },
    radius: { ...baseTokens.radius, ...overrides.radius },
    font: { ...baseTokens.font, ...overrides.font },
  };
}

/** Flatten tokens to CSS custom properties (`--mss-color-primary`, …). */
export function toCssVariables(tokens: DesignTokens): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [group, values] of Object.entries(tokens)) {
    if (typeof values === 'object') {
      for (const [key, value] of Object.entries(values)) {
        vars[`--mss-${group}-${kebab(key)}`] = String(value);
      }
    }
  }
  return vars;
}

function kebab(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
