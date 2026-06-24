/**
 * DirectionProvider — RTL context wrapper (MODULE 1 per NFR-011).
 *
 * Responsibilities:
 *   - Wrap the form surface in a FluentProvider with dir="rtl"|"ltr"
 *   - Set document.documentElement.lang and .dir on every language change
 *     (FR-019 / AC-014 / AC-015)
 *   - Load Arabic fonts lazily when the active language is RTL (FR-018)
 *
 * This module receives a boolean isRtl and a string language as inputs.
 * It has no knowledge of how language was selected or what strings mean
 * — its sole job is to apply directionality (NFR-011 boundary).
 */
import React, { createContext, useContext, useEffect } from 'react';
import { FluentProvider } from '@fluentui/react-components';

// ── Arabic font loader ────────────────────────────────────────────────────

/**
 * Lazy-import Arabic font CSS only when an RTL language is active.
 * Both imports use font-display: swap (provided by Fontsource).
 * English sessions never load the Arabic font bundle (FR-018 / R-008).
 */
async function loadArabicFonts(): Promise<void> {
  await Promise.all([
    import('@fontsource-variable/cairo/index.css'),
    import('@fontsource/noto-sans-arabic/400.css'),
  ]);
}

// ── Direction context ─────────────────────────────────────────────────────

interface DirectionContextValue {
  language: string;
  isRtl: boolean;
  dir: 'rtl' | 'ltr';
}

const DirectionContext = createContext<DirectionContextValue>({
  language: 'en',
  isRtl: false,
  dir: 'ltr',
});

export function useDirection(): DirectionContextValue {
  return useContext(DirectionContext);
}

// ── Component ─────────────────────────────────────────────────────────────

interface DirectionProviderProps {
  language: string;
  isRtl: boolean;
  children: React.ReactNode;
}

/**
 * Wraps children in a FluentProvider with the correct dir attribute.
 * Also synchronises document.documentElement.lang and .dir (FR-019).
 */
export function DirectionProvider({
  language,
  isRtl,
  children,
}: DirectionProviderProps) {
  const dir: 'rtl' | 'ltr' = isRtl ? 'rtl' : 'ltr';

  // Sync HTML root attributes for screen readers (FR-019 / AC-014 / AC-015).
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = dir;
  }, [language, dir]);

  // Lazy-load Arabic fonts when RTL becomes active (FR-018 / R-008).
  useEffect(() => {
    if (isRtl) {
      void loadArabicFonts();
    }
  }, [isRtl]);

  const contextValue: DirectionContextValue = { language, isRtl, dir };

  return (
    <DirectionContext.Provider value={contextValue}>
      <FluentProvider dir={dir} lang={language}>
        {children}
      </FluentProvider>
    </DirectionContext.Provider>
  );
}
