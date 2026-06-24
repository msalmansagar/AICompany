/**
 * useLanguageStore unit tests — TDD Red → Green
 *
 * Tests AsyncStorage persistence, restore, and language code resolution.
 * NFR-011: language-toggle state management independently testable.
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('i18next', () => ({
  isInitialized: true,
  changeLanguage: jest.fn(() => Promise.resolve()),
}));

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: jest.fn() },
}));

// Mock i18nMobile to avoid i18next init side effects in tests
jest.mock('../i18n/i18nMobile', () => ({
  i18n: {
    isInitialized: true,
    changeLanguage: jest.fn(() => Promise.resolve()),
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  readPersistedLanguage,
  persistLanguage,
  isRtlLanguage,
  resolveLanguageCode,
} from '../i18n/useLanguageStore';

const mockGetItem = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;
const mockSetItem = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;

describe('useLanguageStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('readPersistedLanguage', () => {
    it('should_return_ar_when_ar_is_stored', async () => {
      mockGetItem.mockResolvedValueOnce('ar');
      const result = await readPersistedLanguage();
      expect(result).toBe('ar');
    });

    it('should_return_en_when_en_is_stored', async () => {
      mockGetItem.mockResolvedValueOnce('en');
      const result = await readPersistedLanguage();
      expect(result).toBe('en');
    });

    it('should_return_default_en_when_nothing_is_stored', async () => {
      mockGetItem.mockResolvedValueOnce(null);
      const result = await readPersistedLanguage();
      expect(result).toBe('en');
    });

    it('should_return_default_en_when_stored_value_is_unsupported', async () => {
      mockGetItem.mockResolvedValueOnce('fr');
      const result = await readPersistedLanguage();
      expect(result).toBe('en');
    });

    it('should_return_default_en_when_storage_throws', async () => {
      mockGetItem.mockRejectedValueOnce(new Error('storage error'));
      const result = await readPersistedLanguage();
      expect(result).toBe('en');
    });

    it('should_read_from_correct_storage_key', async () => {
      mockGetItem.mockResolvedValueOnce('ar');
      await readPersistedLanguage();
      expect(mockGetItem).toHaveBeenCalledWith('qdb_lang');
    });
  });

  describe('persistLanguage', () => {
    it('should_write_language_to_async_storage', async () => {
      mockSetItem.mockResolvedValueOnce();
      await persistLanguage('ar');
      expect(mockSetItem).toHaveBeenCalledWith('qdb_lang', 'ar');
    });

    it('should_write_en_to_async_storage', async () => {
      mockSetItem.mockResolvedValueOnce();
      await persistLanguage('en');
      expect(mockSetItem).toHaveBeenCalledWith('qdb_lang', 'en');
    });
  });

  describe('isRtlLanguage', () => {
    it('should_return_true_for_ar', () => {
      expect(isRtlLanguage('ar')).toBe(true);
    });

    it('should_return_false_for_en', () => {
      expect(isRtlLanguage('en')).toBe(false);
    });
  });

  describe('resolveLanguageCode', () => {
    it('should_return_ar_for_valid_ar_code', () => {
      expect(resolveLanguageCode('ar')).toBe('ar');
    });

    it('should_return_en_for_valid_en_code', () => {
      expect(resolveLanguageCode('en')).toBe('en');
    });

    it('should_return_default_for_unsupported_code', () => {
      expect(resolveLanguageCode('fr')).toBe('en');
    });

    it('should_return_default_for_null', () => {
      expect(resolveLanguageCode(null)).toBe('en');
    });

    it('should_return_default_for_empty_string', () => {
      expect(resolveLanguageCode('')).toBe('en');
    });
  });
});
