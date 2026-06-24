/**
 * useLanguageStore — React hook managing active language state.
 *
 * Backed by AsyncStorage for persistence (FR-016 / AC-009).
 * Uses React state (no Zustand dependency) — kept intentionally simple
 * since language changes are rare and do not need global store reactivity.
 *
 * Consumers call readPersistedLanguage() at app boot to hydrate state
 * before the first render.
 */
import { useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { i18n } from './i18nMobile';
import {
  LANGUAGE_STORAGE_KEY,
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  type SupportedLanguageCode,
} from './constants';

export interface LanguageState {
  language: SupportedLanguageCode;
  isRtl: boolean;
}

/**
 * Reads the persisted language from AsyncStorage.
 * Returns the DEFAULT_LANGUAGE if nothing is stored or storage fails.
 */
export async function readPersistedLanguage(): Promise<SupportedLanguageCode> {
  try {
    const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === 'en' || stored === 'ar') {
      return stored as SupportedLanguageCode;
    }
  } catch {
    // Storage failure — fall through to default
  }
  return DEFAULT_LANGUAGE;
}

/**
 * Persists the selected language to AsyncStorage and updates i18next.
 * Does NOT trigger RTL reload — caller is responsible for RtlManager.applyRtlIfChanged.
 */
export async function persistLanguage(code: SupportedLanguageCode): Promise<void> {
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  await i18n.changeLanguage(code);
}

/**
 * Returns whether the given language code requires RTL layout.
 * At launch only Arabic requires RTL. This list is driven by qdb_language_config
 * at runtime; this local fallback covers the bootstrap case.
 */
export function isRtlLanguage(code: SupportedLanguageCode): boolean {
  return code === 'ar';
}

/**
 * Validates a raw string against the supported language codes.
 * Returns the code if valid, otherwise DEFAULT_LANGUAGE.
 */
export function resolveLanguageCode(raw: string | null): SupportedLanguageCode {
  if (raw !== null && (SUPPORTED_LANGUAGES as readonly string[]).includes(raw)) {
    return raw as SupportedLanguageCode;
  }
  return DEFAULT_LANGUAGE;
}

/** React hook for active language state within a component tree. */
export function useLanguageState(initial: SupportedLanguageCode): {
  language: SupportedLanguageCode;
  isRtl: boolean;
  setLanguage: (code: SupportedLanguageCode) => void;
} {
  const [language, setLanguageState] = useState<SupportedLanguageCode>(initial);

  const setLanguage = useCallback((code: SupportedLanguageCode): void => {
    setLanguageState(code);
  }, []);

  return {
    language,
    isRtl: isRtlLanguage(language),
    setLanguage,
  };
}
