/**
 * i18next initialisation for the mobile package.
 *
 * WHY: i18next is used for static chrome strings only (loading text, error
 * banners, onboarding labels). Form CONTENT comes resolved from the API
 * as a single-language FormDefinition DTO — i18next does not need to know
 * about form content strings.
 *
 * The same i18next core is shared with the web package (no DOM dependency).
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LANGUAGE } from './constants';

const EN_TRANSLATIONS = {
  common: {
    loading: 'Loading...',
    error: 'Something went wrong. Please try again.',
    retry: 'Retry',
    cancel: 'Cancel',
    confirm: 'Confirm',
  },
  onboarding: {
    title: 'Choose your language',
    subtitle: 'Select the language you prefer to use',
    continue: 'Continue',
    english: 'English',
    arabic: 'العربية',
  },
  language: {
    restartTitle: 'Layout change required',
    restartMessage:
      'The app needs to restart to apply the layout change. Your progress will be preserved.',
    restartConfirm: 'Restart now',
    restartCancel: 'Cancel',
  },
};

const AR_TRANSLATIONS = {
  common: {
    loading: 'جاري التحميل...',
    error: 'حدث خطأ. حاول مرة أخرى.',
    retry: 'إعادة المحاولة',
    cancel: 'إلغاء',
    confirm: 'تأкيد',
  },
  onboarding: {
    title: 'اختر لغتك',
    subtitle: 'اختر اللغة التي تفضل استخدامها',
    continue: 'متابعة',
    english: 'English',
    arabic: 'العربية',
  },
  language: {
    restartTitle: 'تغيير التخطيط مطلوب',
    restartMessage:
      'يحتاج التطبيق إلى إعادة التشغيل لتطبيق تغيير التخطيط.',
    restartConfirm: 'إعادة التشغيل الآن',
    restartCancel: 'إلغاء',
  },
};

if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .init({
      lng: DEFAULT_LANGUAGE,
      fallbackLng: DEFAULT_LANGUAGE,
      resources: {
        en: { translation: EN_TRANSLATIONS },
        ar: { translation: AR_TRANSLATIONS },
      },
      interpolation: {
        escapeValue: false, // React Native handles XSS
      },
      compatibilityJSON: 'v4',
    })
    .catch(() => {
      // i18n init failure must not crash the app
    });
}

export { i18n };
