/**
 * useLanguage — language selection state manager (MODULE 2 per NFR-011).
 *
 * Responsibilities (this module only):
 *   - Read the active language code (URL param > localStorage > default "en")
 *   - Persist selection to localStorage
 *   - Sync selection to the URL ?lang= query param (replaceState, no history entry)
 *   - Expose the active language code, isRtl flag, and dir value
 *
 * This module has NO knowledge of RTL styling or string content —
 * it only manages the language code string (NFR-011 boundary).
 *
 * isRtl and dir are derived from the LanguageConfig returned by
 * GET /api/languages so that adding a new RTL language in future
 * requires no frontend code change (AG-004).
 */
import { useCallback, useEffect, useState } from 'react';
import { i18next } from './i18n';
import type { LanguageConfig } from '@qdb/shared';

const STORAGE_KEY = 'qdb_lang';
const DEFAULT_LANGUAGE = 'en';

// ── helpers ───────────────────────────────────────────────────────────────

function readLangFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('lang');
}

function readLangFromStorage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    // localStorage may be unavailable in restricted environments.
    return null;
  }
}

function writeLangToStorage(code: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // Silently ignore — storage failure must not crash the form.
  }
}

function writeLangToUrl(code: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set('lang', code);
  window.history.replaceState(null, '', url.toString());
}

/** Resolve the active language following the precedence chain. */
function resolveInitialLanguage(): string {
  return readLangFromUrl() ?? readLangFromStorage() ?? DEFAULT_LANGUAGE;
}

// ── hook ──────────────────────────────────────────────────────────────────

export interface UseLanguageReturn {
  /** Active BCP-47 language code (e.g. "en", "ar"). */
  language: string;
  /** True when the active language is RTL. Derived from LanguageConfig. */
  isRtl: boolean;
  /** "rtl" | "ltr" — convenience alias for HTML dir attribute. */
  dir: 'rtl' | 'ltr';
  /** Change the active language. Persists to storage and URL. */
  setLanguage: (code: string) => void;
}

/**
 * Provides language selection state.
 *
 * @param supportedLanguages — list from GET /api/languages. Pass an empty
 *   array before the fetch completes; the hook defaults to English (ltr)
 *   until the list is available.
 */
export function useLanguage(supportedLanguages: LanguageConfig[]): UseLanguageReturn {
  const [language, setLanguageState] = useState<string>(resolveInitialLanguage);

  // Derive RTL from the config list so no language code is hardcoded here.
  const activeConfig = supportedLanguages.find((l) => l.code === language);
  const isRtl = activeConfig?.isRtl ?? false;
  const dir: 'rtl' | 'ltr' = isRtl ? 'rtl' : 'ltr';

  // Keep i18next chrome namespace in sync with the active language.
  useEffect(() => {
    if (i18next.isInitialized && i18next.language !== language) {
      void i18next.changeLanguage(language);
    }
  }, [language]);

  const setLanguage = useCallback((code: string): void => {
    setLanguageState(code);
    writeLangToStorage(code);
    writeLangToUrl(code);
  }, []);

  return { language, isRtl, dir, setLanguage };
}
