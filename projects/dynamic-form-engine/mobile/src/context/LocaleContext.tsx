/**
 * LocaleContext — manages active language state across the app.
 *
 * Hydrates from AsyncStorage on mount (FR-016 / AC-009).
 * On setLocale: persists to AsyncStorage, updates i18next, and triggers
 * RtlManager.applyRtlIfChanged when the RTL direction changes (OQ-005).
 *
 * If applyRtlIfChanged reloads the app, the component tree is destroyed
 * and the new language is applied on cold start via initRtlFromStorage.
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LANGUAGE_STORAGE_KEY, DEFAULT_LANGUAGE, type SupportedLanguageCode } from '../i18n/constants';
import { applyRtlIfChanged } from '../i18n/RtlManager';
import { persistLanguage, isRtlLanguage } from '../i18n/useLanguageStore';

/** @deprecated Use SupportedLanguageCode from i18n/constants. Kept for backward compat. */
export type SupportedLocale = SupportedLanguageCode;

export interface LocaleContextValue {
  locale: SupportedLanguageCode;
  setLocale: (locale: SupportedLanguageCode) => Promise<void>;
  isRtl: boolean;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLanguageCode>(DEFAULT_LANGUAGE);

  useEffect(() => {
    AsyncStorage.getItem(LANGUAGE_STORAGE_KEY)
      .then((stored) => {
        if (stored === 'en' || stored === 'ar') {
          setLocaleState(stored as SupportedLanguageCode);
        }
      })
      .catch(() => {
        // Storage failure — keep default language
      });
  }, []);

  const setLocale = useCallback(async (next: SupportedLanguageCode): Promise<void> => {
    await persistLanguage(next);
    setLocaleState(next);
    // If RTL direction changes, this will trigger a reload (OQ-005).
    // Caller is responsible for showing the restart prompt before calling setLocale.
    await applyRtlIfChanged(isRtlLanguage(next));
  }, []);

  return (
    <LocaleContext.Provider value={{ locale, setLocale, isRtl: isRtlLanguage(locale) }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used inside <LocaleProvider>');
  return ctx;
}
