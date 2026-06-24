/**
 * RtlManager — thin wrapper around React Native I18nManager + Expo Updates.
 *
 * WHY this module exists: I18nManager.forceRTL does not take effect at runtime
 * without a full JS bundle reload (confirmed RN platform constraint, tracked in
 * Expo issue #39752). This service encapsulates the detect → force → reload
 * sequence so that every callsite stays clean.
 *
 * Cold-start path (initRtlFromStorage): reads AsyncStorage synchronously-ish
 * at app bootstrap, calls forceRTL BEFORE React tree mounts to prevent LTR flash.
 * Because AsyncStorage.getItem is always async, this returns a Promise that the
 * App entry point must await (or fire-and-forget before the first render).
 *
 * Change path (applyRtlIfChanged): called when the user changes language.
 * No-ops if RTL state is unchanged. Otherwise forces the new direction and
 * reloads via Updates.reloadAsync (OQ-005, C-002 path).
 */
import { I18nManager } from 'react-native';
import * as Updates from 'expo-updates';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LANGUAGE_STORAGE_KEY } from './constants';

/**
 * Applies RTL direction if it differs from the current I18nManager state.
 * Triggers Updates.reloadAsync when the direction changes.
 *
 * MUST only be called after user confirmation (restart prompt shown by caller).
 */
export async function applyRtlIfChanged(isRtl: boolean): Promise<void> {
  if (I18nManager.isRTL === isRtl) {
    return;
  }
  I18nManager.allowRTL(isRtl);
  I18nManager.forceRTL(isRtl);
  await Updates.reloadAsync();
}

/**
 * Reads the persisted language from AsyncStorage and sets the RTL direction
 * synchronously via I18nManager BEFORE the React tree mounts.
 *
 * Call this as early as possible in App.tsx / _layout.tsx entry point.
 * If storage is empty or unreadable, defaults to LTR (English).
 */
export async function initRtlFromStorage(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    const isRtl = stored === 'ar';
    I18nManager.allowRTL(isRtl);
    I18nManager.forceRTL(isRtl);
  } catch {
    // Storage read failure — default to LTR, no crash
    I18nManager.allowRTL(false);
    I18nManager.forceRTL(false);
  }
}
