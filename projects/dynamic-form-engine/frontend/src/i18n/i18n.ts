/**
 * i18next initialisation for STATIC UI CHROME strings only.
 *
 * Form content (labels, placeholders, validation messages) is resolved
 * server-side and arrives as a fully translated FormDefinition. This
 * module handles only the small set of strings that belong to the portal
 * shell itself: the language toggle label, loading text, and error banners.
 *
 * Translations are bundled as static JSON (en/ar chrome.json) to avoid
 * an extra network round-trip before the toggle renders.
 */
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import ICU from 'i18next-icu';

import enChrome from '../locales/en/chrome.json';
import arChrome from '../locales/ar/chrome.json';

const RESOURCES = {
  en: { chrome: enChrome },
  ar: { chrome: arChrome },
} as const;

export function initI18n(initialLanguage: string): void {
  if (i18next.isInitialized) return;

  void i18next
    .use(ICU)
    .use(initReactI18next)
    .init({
      lng: initialLanguage,
      fallbackLng: 'en',
      ns: ['chrome'],
      defaultNS: 'chrome',
      resources: RESOURCES,
      interpolation: {
        // React escapes by default — no need for i18next to double-escape.
        escapeValue: false,
      },
      react: {
        useSuspense: false,
      },
    });
}

export { i18next };
