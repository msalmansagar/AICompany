import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  // Validate that the locale is supported
  if (!locale || !routing.locales.includes(locale as 'en' | 'ar')) {
    locale = routing.defaultLocale;
  }

  const messages = locale === 'ar'
    ? (await import('@portal/i18n/src/ar.json')).default
    : (await import('@portal/i18n/src/en.json')).default;

  return {
    locale,
    messages,
  };
});
