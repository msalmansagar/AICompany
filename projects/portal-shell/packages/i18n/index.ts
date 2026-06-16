import en from './src/en.json';
import ar from './src/ar.json';

export { en, ar };

export type Locale = 'en' | 'ar';

export const locales: Locale[] = ['en', 'ar'];

export const defaultLocale: Locale = 'en';

export type Messages = typeof en;

/**
 * Returns the translation messages for the given locale.
 * Falls back to English when the locale is not recognised.
 */
export function getMessages(locale: string): Messages {
  if (locale === 'ar') {
    return ar as Messages;
  }
  return en;
}

/**
 * Returns true when the given locale renders right-to-left.
 */
export function isRtlLocale(locale: string): boolean {
  return locale === 'ar';
}

/**
 * Returns the HTML dir attribute value for the given locale.
 */
export function getHtmlDir(locale: string): 'ltr' | 'rtl' {
  return isRtlLocale(locale) ? 'rtl' : 'ltr';
}
