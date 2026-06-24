/**
 * LanguageProvider — top-level i18n context provider.
 *
 * Responsibilities:
 *   - Fetch GET /api/languages once on mount
 *   - Run useLanguage to establish active language + RTL state
 *   - Initialise i18next with the resolved language
 *   - Wrap children in DirectionProvider
 *   - Expose language context to descendants via useLanguageContext
 *
 * This is the composition root for the i18n subsystem. All i18n state
 * flows down from here so that descendants (FormContext, DynamicFormRenderer)
 * can read the active language without prop-drilling.
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import type { LanguageConfig } from '@qdb/shared';
import { languageApi } from '../api/languageApi';
import { initI18n } from './i18n';
import { useLanguage, type UseLanguageReturn } from './useLanguage';
import { DirectionProvider } from './DirectionProvider';
import { logger } from '../utils/logger';

// ── Context ───────────────────────────────────────────────────────────────

interface LanguageContextValue extends UseLanguageReturn {
  /** All supported languages from GET /api/languages. */
  supportedLanguages: LanguageConfig[];
  /** True while the language list is being fetched. */
  isLanguagesLoading: boolean;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function useLanguageContext(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguageContext must be used inside LanguageProvider');
  }
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────

interface LanguageProviderProps {
  children: React.ReactNode;
}

export function LanguageProvider({ children }: LanguageProviderProps) {
  const [supportedLanguages, setSupportedLanguages] = useState<LanguageConfig[]>([]);
  const [isLanguagesLoading, setIsLanguagesLoading] = useState(true);

  // Fetch supported languages once on mount (no auth required per AG-003).
  useEffect(() => {
    let cancelled = false;

    async function fetchLanguages(): Promise<void> {
      try {
        // The apiClient interceptor unwraps the envelope, so response.data is
        // already typed as LanguageConfig[] — no cast required.
        const response = await languageApi.list();
        const languages = response.data;
        if (!cancelled) {
          const sorted = [...languages].sort(
            (a, b) => a.displayOrder - b.displayOrder,
          );
          setSupportedLanguages(sorted);
        }
      } catch (error) {
        // Non-fatal — the toggle simply does not render until languages load.
        // English is always functional without this list.
        logger.warn('Failed to load language configuration', {
          error,
          operation: 'fetchLanguages',
        });
      } finally {
        if (!cancelled) setIsLanguagesLoading(false);
      }
    }

    void fetchLanguages();
    return () => { cancelled = true; };
  }, []);

  const languageState = useLanguage(supportedLanguages);

  // Initialise i18next once the language is known. Idempotent if called again.
  initI18n(languageState.language);

  const contextValue: LanguageContextValue = {
    ...languageState,
    supportedLanguages,
    isLanguagesLoading,
  };

  return (
    <LanguageContext.Provider value={contextValue}>
      <DirectionProvider language={languageState.language} isRtl={languageState.isRtl}>
        {children}
      </DirectionProvider>
    </LanguageContext.Provider>
  );
}
