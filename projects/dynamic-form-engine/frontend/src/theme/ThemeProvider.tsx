import React, { useEffect, useMemo } from 'react';
import {
  FluentProvider,
  createLightTheme,
  createDarkTheme,
  type BrandVariants,
  type Theme,
} from '@fluentui/react-components';
import type { ThemeDefinition } from '@dfe/shared';

// ── Hex-to-RGB helper ───────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const cleaned = hex.replace('#', '');
  if (cleaned.length !== 6) return null;

  return {
    r: parseInt(cleaned.substring(0, 2), 16),
    g: parseInt(cleaned.substring(2, 4), 16),
    b: parseInt(cleaned.substring(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((c) => c.toString(16).padStart(2, '0'))
      .join('')
  );
}

// ── Brand palette builder ───────────────────────────────────
// Generates 16 shades (10..160) required by BrandVariants
// from a single primary hex color using luminance shifts.

function buildBrandVariants(primaryColor: string): BrandVariants {
  const rgb = hexToRgb(primaryColor);
  const { r, g, b } = rgb ?? { r: 0, g: 120, b: 212 };

  // shade 80 is the primary; lighter shades go towards 10, darker toward 160
  const shadeSteps: [keyof BrandVariants, number][] = [
    [10, 0.85],
    [20, 0.72],
    [30, 0.6],
    [40, 0.48],
    [50, 0.36],
    [60, 0.24],
    [70, 0.12],
    [80, 0], // primary
    [90, -0.1],
    [100, -0.2],
    [110, -0.3],
    [120, -0.4],
    [130, -0.5],
    [140, -0.6],
    [150, -0.7],
    [160, -0.8],
  ];

  const result: Partial<BrandVariants> = {};

  for (const [shade, factor] of shadeSteps) {
    if (factor >= 0) {
      // Mix towards white (lighten)
      result[shade] = rgbToHex(
        r + (255 - r) * factor,
        g + (255 - g) * factor,
        b + (255 - b) * factor,
      );
    } else {
      // Mix towards black (darken)
      const abs = Math.abs(factor);
      result[shade] = rgbToHex(r * (1 - abs), g * (1 - abs), b * (1 - abs));
    }
  }

  return result as BrandVariants;
}

// ── CSS custom property injector ────────────────────────────
// Writes all design tokens onto document.documentElement so
// non-Fluent elements (e.g. custom CSS, SectionRenderer divs)
// can consume them via var(--qdb-*).

function injectCssCustomProperties(theme: ThemeDefinition): void {
  const root = document.documentElement;

  const props: Record<string, string | undefined> = {
    '--qdb-color-primary': theme.primaryColor,
    '--qdb-color-secondary': theme.secondaryColor,
    '--qdb-color-background': theme.backgroundColor,
    '--qdb-color-surface': theme.surfaceColor,
    '--qdb-color-text-primary': theme.textPrimaryColor,
    '--qdb-color-text-secondary': theme.textSecondaryColor,
    '--qdb-color-border': theme.borderColor,
    '--qdb-color-error': theme.errorColor,
    '--qdb-color-success': theme.successColor,
    '--qdb-color-warning': theme.warningColor,
    '--qdb-font-family': theme.fontFamily,
    '--qdb-font-size-base': theme.baseFontSize,
    '--qdb-font-size-heading': theme.headingFontSize,
    '--qdb-font-size-label': theme.labelFontSize,
    '--qdb-font-size-input': theme.inputFontSize,
    '--qdb-border-radius': theme.borderRadius,
  };

  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined) {
      root.style.setProperty(key, value);
    }
  }
}

// ── Dynamic font loader ─────────────────────────────────────
// Injects a <link> element only when the fontUrl changes.
// Reuses the existing element when the URL is unchanged.

function loadFont(fontUrl: string | undefined): void {
  if (!fontUrl) return;

  const existing = document.querySelector<HTMLLinkElement>(
    'link[data-dfe-font]',
  );

  if (existing?.getAttribute('href') === fontUrl) return;

  existing?.remove();

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = fontUrl;
  link.setAttribute('data-dfe-font', 'true');
  document.head.appendChild(link);
}

// ── Fluent UI theme builder ─────────────────────────────────

function buildFluentTheme(theme: ThemeDefinition): Theme {
  const brandVariants = buildBrandVariants(theme.primaryColor);
  return theme.isDarkMode
    ? createDarkTheme(brandVariants)
    : createLightTheme(brandVariants);
}

// ── ThemeProvider ───────────────────────────────────────────
// Two nested FluentProviders:
// - Outer: global brand tokens derived from the workspace ThemeDefinition
// - Inner (optional): form-level overrides when the form has a distinct theme

interface ThemeProviderProps {
  theme: ThemeDefinition;
  formTheme?: ThemeDefinition;
  children: React.ReactNode;
}

function ThemeProviderInner({
  theme,
  formTheme,
  children,
}: ThemeProviderProps) {
  const globalFluentTheme = useMemo(() => buildFluentTheme(theme), [theme]);
  const formFluentTheme = useMemo(
    () => (formTheme ? buildFluentTheme(formTheme) : undefined),
    [formTheme],
  );

  useEffect(() => {
    injectCssCustomProperties(formTheme ?? theme);
    loadFont((formTheme ?? theme).fontUrl);
  }, [theme, formTheme]);

  const inner = formFluentTheme ? (
    <FluentProvider theme={formFluentTheme}>{children}</FluentProvider>
  ) : (
    children
  );

  return (
    <FluentProvider theme={globalFluentTheme}>{inner}</FluentProvider>
  );
}

// No custom comparator — React.memo uses default shallow equality so children
// propagate correctly when form state (e.g. activeTabIndex) changes.
// The Fluent theme objects are stable via useMemo inside, so FluentProvider
// does not re-render on every keystroke — only when the theme itself changes.
export const ThemeProvider = React.memo(ThemeProviderInner);
