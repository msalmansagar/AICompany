/** AsyncStorage key for persisted language preference (FR-016 / AC-009). */
export const LANGUAGE_STORAGE_KEY = 'qdb_lang';

/** Default language when no preference is stored (OQ-003 English-first). */
export const DEFAULT_LANGUAGE = 'en' as const;

/** Supported language codes at launch. */
export const SUPPORTED_LANGUAGES = ['en', 'ar'] as const;

export type SupportedLanguageCode = typeof SUPPORTED_LANGUAGES[number];
