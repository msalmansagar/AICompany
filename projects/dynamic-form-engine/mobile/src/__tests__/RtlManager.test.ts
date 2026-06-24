/**
 * RtlManager unit tests — TDD Red → Green
 *
 * Tests the RTL service that wraps I18nManager + Updates.reloadAsync.
 * expo-updates and AsyncStorage are mocked; I18nManager is spied on via the
 * jest-expo provided mock (which exists in the react-native mock context).
 */

// Mock expo-updates before importing RtlManager
jest.mock('expo-updates', () => ({
  reloadAsync: jest.fn(() => Promise.resolve()),
}));

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

import * as Updates from 'expo-updates';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nManager } from 'react-native';
import { applyRtlIfChanged, initRtlFromStorage } from '../i18n/RtlManager';

const mockReloadAsync = Updates.reloadAsync as jest.MockedFunction<typeof Updates.reloadAsync>;
const mockGetItem = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;

describe('RtlManager', () => {
  let allowRtlSpy: jest.SpyInstance;
  let forceRtlSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    // Spy on I18nManager methods — jest-expo provides a workable mock
    allowRtlSpy = jest.spyOn(I18nManager, 'allowRTL').mockImplementation(jest.fn());
    forceRtlSpy = jest.spyOn(I18nManager, 'forceRTL').mockImplementation(jest.fn());
    // Reset isRTL to false (LTR) for each test
    Object.defineProperty(I18nManager, 'isRTL', { value: false, writable: true, configurable: true });
  });

  afterEach(() => {
    allowRtlSpy.mockRestore();
    forceRtlSpy.mockRestore();
  });

  describe('applyRtlIfChanged', () => {
    it('should_not_call_reloadAsync_when_direction_unchanged_ltr', async () => {
      // Arrange: isRTL is false (LTR)
      // Act: request LTR (no change)
      await applyRtlIfChanged(false);
      // Assert: no reload
      expect(mockReloadAsync).not.toHaveBeenCalled();
    });

    it('should_call_reloadAsync_when_switching_ltr_to_rtl', async () => {
      // Arrange: isRTL is false (LTR)
      // Act: request RTL (direction changes)
      await applyRtlIfChanged(true);
      // Assert: reload triggered
      expect(mockReloadAsync).toHaveBeenCalledTimes(1);
    });

    it('should_set_allowRTL_and_forceRTL_before_reload', async () => {
      await applyRtlIfChanged(true);

      expect(allowRtlSpy).toHaveBeenCalledWith(true);
      expect(forceRtlSpy).toHaveBeenCalledWith(true);
      expect(mockReloadAsync).toHaveBeenCalledTimes(1);
    });

    it('should_not_call_reloadAsync_when_direction_unchanged_rtl', async () => {
      // Arrange: simulate app already in RTL mode
      Object.defineProperty(I18nManager, 'isRTL', { value: true, writable: true, configurable: true });
      // Act: request RTL (no change)
      await applyRtlIfChanged(true);
      // Assert: no reload
      expect(mockReloadAsync).not.toHaveBeenCalled();
    });
  });

  describe('initRtlFromStorage', () => {
    it('should_force_rtl_when_stored_language_is_ar', async () => {
      mockGetItem.mockResolvedValueOnce('ar');

      await initRtlFromStorage();

      expect(mockGetItem).toHaveBeenCalledWith('qdb_lang');
      expect(forceRtlSpy).toHaveBeenCalledWith(true);
    });

    it('should_force_ltr_when_stored_language_is_en', async () => {
      mockGetItem.mockResolvedValueOnce('en');

      await initRtlFromStorage();

      expect(forceRtlSpy).toHaveBeenCalledWith(false);
    });

    it('should_default_to_ltr_when_storage_is_empty', async () => {
      mockGetItem.mockResolvedValueOnce(null);

      await initRtlFromStorage();

      expect(forceRtlSpy).toHaveBeenCalledWith(false);
    });

    it('should_default_to_ltr_when_storage_throws', async () => {
      mockGetItem.mockRejectedValueOnce(new Error('storage unavailable'));

      await initRtlFromStorage();

      expect(forceRtlSpy).toHaveBeenCalledWith(false);
    });
  });
});
