'use client';

import { useEffect, useMemo, type ReactNode } from 'react';
import { resolveTokens } from '../tokens/mockTokenApi';
import { buildCSSCustomProperties } from '../tokens/injectTokenStyles';
import { ThemeProvider } from './ThemeProvider';

const STYLE_ELEMENT_ID = 'qdb-theme-tokens';

/**
 * The full token pipeline in one place, mirroring portal-shell's
 * `app/[locale]/layout.tsx`:
 *
 *   resolveTokens(context)          → slug → value map   (DXP-P1-003 API)
 *   buildCSSCustomProperties(map)   → "--slug: value; …"
 *   :root { … }                     → injected into <head>
 *   tokenMap['text-direction']      → drives <html dir>
 *   var(--font-family-base)         → consumed by fonts.css AND Fluent's theme
 *
 * Direction comes FROM the token, with a locale fallback — exactly as the real
 * layout does, so the page is never directionless if resolution fails.
 */
export function TokenRoot({ locale, children }: { locale: 'ar' | 'en'; children: ReactNode }) {
  const tokenMap = useMemo(() => resolveTokens({ renderTarget: 'portal', locale }), [locale]);
  const dir = (tokenMap['text-direction'] ?? (locale === 'ar' ? 'rtl' : 'ltr')) as 'rtl' | 'ltr';

  useEffect(() => {
    const cssVars = buildCSSCustomProperties(tokenMap);

    let styleEl = document.getElementById(STYLE_ELEMENT_ID);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = STYLE_ELEMENT_ID;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `:root { ${cssVars} }`;

    document.documentElement.dir = dir;
    document.documentElement.lang = locale;
  }, [tokenMap, dir, locale]);

  return <ThemeProvider dir={dir}>{children}</ThemeProvider>;
}

/** Exposed so the spike pages can display what actually resolved. */
export function useResolvedTokens(locale: 'ar' | 'en') {
  return useMemo(() => resolveTokens({ renderTarget: 'portal', locale }), [locale]);
}
