/**
 * Look-and-feel baseline — MSS Technologies global design tokens.
 *
 * Three-layer architecture (adapted from ui-ux-pro-max): primitives → semantic →
 * component. Every project inherits this and renders as one system. Change values
 * at the layer that matches your intent — swap a brand colour once in a primitive,
 * re-theme by remapping semantics, tweak one control via component tokens. Never
 * hardcode raw values in components; reference a token.
 *
 * Plain data (no framework) so it works anywhere — CSS variables, a Tailwind
 * config, a PCF control, React Native. `toCssVariables` flattens all layers to
 * `--mss-*` custom properties.
 */

// ── Layer 1 — Primitives: raw values. Foundational, change rarely. ──
export const primitives = {
  color: {
    blue: { 500: '#2563eb', 600: '#1d4ed8', 700: '#1e40af' },
    gray: { 50: '#f5f6f8', 100: '#eef0f3', 300: '#d9dde2', 500: '#5b6570', 900: '#1a1d21' },
    white: '#ffffff',
    green600: '#177245',
    amber600: '#b26a00',
    red600: '#b3261e',
  },
  space: { 1: '4px', 2: '8px', 3: '16px', 4: '24px', 5: '40px' },
  radius: { sm: '4px', md: '8px', lg: '16px', pill: '999px' },
  fontSize: { sm: '13px', md: '15px', lg: '20px' },
  fontWeight: { regular: 400, bold: 600 },
  // Latin + Arabic-capable stack — bilingual is a first-class default.
  fontFamily: "'Segoe UI', 'Noto Sans Arabic', system-ui, -apple-system, sans-serif",
} as const;

// ── Layer 2 — Semantic: purpose aliases → primitives. Re-theme here. ──
export interface SemanticTokens {
  colorBackground: string;
  colorForeground: string;
  colorSurface: string;
  colorSurfaceForeground: string;
  colorPrimary: string;
  colorPrimaryHover: string;
  colorPrimaryForeground: string;
  colorBorder: string;
  colorSuccess: string;
  colorWarning: string;
  colorDanger: string;
  spaceSection: string;
  spaceStack: string;
  spaceInline: string;
  /** Layout direction default; a project flips to 'rtl' per locale at runtime. */
  direction: 'ltr' | 'rtl';
}

export function semanticTokens(p: typeof primitives = primitives): SemanticTokens {
  return {
    colorBackground: p.color.gray[50],
    colorForeground: p.color.gray[900],
    colorSurface: p.color.white,
    colorSurfaceForeground: p.color.gray[900],
    colorPrimary: p.color.blue[600],
    colorPrimaryHover: p.color.blue[700],
    colorPrimaryForeground: p.color.white,
    colorBorder: p.color.gray[300],
    colorSuccess: p.color.green600,
    colorWarning: p.color.amber600,
    colorDanger: p.color.red600,
    spaceSection: p.space[5],
    spaceStack: p.space[3],
    spaceInline: p.space[2],
    direction: 'ltr',
  };
}

// ── Layer 3 — Component: per-component → semantic. Tweak one control here. ──
export function componentTokens(s: SemanticTokens = semanticTokens()) {
  return {
    buttonBg: s.colorPrimary,
    buttonForeground: s.colorPrimaryForeground,
    buttonHoverBg: s.colorPrimaryHover,
    buttonRadius: primitives.radius.md,
    cardBg: s.colorSurface,
    cardForeground: s.colorSurfaceForeground,
    cardBorder: s.colorBorder,
    cardPadding: primitives.space[4],
    cardRadius: primitives.radius.lg,
    inputBorder: s.colorBorder,
    inputRadius: primitives.radius.sm,
  };
}

/** Re-theme by overriding only the semantic aliases that differ (e.g. brand colour). */
export function withBrand(overrides: Partial<SemanticTokens>): SemanticTokens {
  return { ...semanticTokens(), ...overrides };
}

/** Flatten all three layers to CSS custom properties (`--mss-color-primary`, …). */
export function toCssVariables(semantic: SemanticTokens = semanticTokens()): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(semantic)) {
    if (key === 'direction') continue;
    vars[`--mss-${kebab(key)}`] = String(value);
  }
  for (const [key, value] of Object.entries(componentTokens(semantic))) {
    vars[`--mss-${kebab(key)}`] = String(value);
  }
  vars['--mss-font-family'] = primitives.fontFamily;
  return vars;
}

function kebab(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}
