import { I18n } from 'i18n-js';
import { getLocales } from 'expo-localization';
import { I18nManager } from 'react-native';
import en from './en.json';
import ar from './ar.json';

export const i18n = new I18n({ en, ar });

const SUPPORTED_LOCALES = ['en', 'ar'] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

function isSupportedLocale(locale: string): locale is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(locale);
}

export function initI18n(): void {
  const deviceLocales = getLocales();
  const rawLocale = deviceLocales[0]?.languageCode ?? 'en';
  const locale: SupportedLocale = isSupportedLocale(rawLocale) ? rawLocale : 'en';

  i18n.locale = locale;
  i18n.enableFallback = true;
  i18n.defaultLocale = 'en';

  // Force RTL layout for Arabic.
  // Note: RTL change requires an app restart to fully propagate through all layouts.
  const shouldBeRtl = locale === 'ar';
  if (I18nManager.isRTL !== shouldBeRtl) {
    I18nManager.forceRTL(shouldBeRtl);
  }
}

export function t(key: string, options?: Record<string, unknown>): string {
  return i18n.t(key, options);
}

export function getCurrentLocale(): string {
  return i18n.locale;
}

export function isCurrentLocaleRtl(): boolean {
  return i18n.locale === 'ar';
}

export function setLocale(locale: SupportedLocale): void {
  i18n.locale = locale;
  const shouldBeRtl = locale === 'ar';
  if (I18nManager.isRTL !== shouldBeRtl) {
    I18nManager.forceRTL(shouldBeRtl);
  }
}
