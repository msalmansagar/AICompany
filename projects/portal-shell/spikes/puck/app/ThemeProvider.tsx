'use client';

import { FluentProvider, webLightTheme, type Theme } from '@fluentui/react-components';
import type { ReactNode } from 'react';

/**
 * Fluent UI v9 keeps its own font stack in `fontFamilyBase` and will override
 * anything set on <body> inside its own components. Pointing that token at the
 * same CSS custom property makes the theme token the single source of truth
 * for BOTH plain elements and Fluent components.
 */
function buildThemeFromTokens(base: Theme): Theme {
  return {
    ...base,
    fontFamilyBase: "var(--font-family-base, 'Segoe UI', Tahoma, sans-serif)",
  };
}

const arabicAwareTheme = buildThemeFromTokens(webLightTheme);

export function ThemeProvider({ children, dir }: { children: ReactNode; dir: 'rtl' | 'ltr' }) {
  return (
    <FluentProvider theme={arabicAwareTheme} dir={dir}>
      {children}
    </FluentProvider>
  );
}
