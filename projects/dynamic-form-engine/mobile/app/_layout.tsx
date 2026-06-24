/**
 * RootLayout — app entry point.
 *
 * i18n bootstrap order (C-002, Challenge 4 mitigation):
 *  1. initRtlFromStorage is called in the useEffect as early as possible.
 *     This reads AsyncStorage and calls I18nManager.forceRTL synchronously
 *     before any form screens mount.
 *  2. i18nMobile module is imported to initialise i18next (side-effect import).
 *  3. LocaleProvider wraps the app so language state is available to all screens.
 *
 * NOTE: AsyncStorage.getItem is always async, so there is a brief window where
 * the React tree may render once in the default direction before RTL is applied.
 * On Arabic cold start this produces a one-frame LTR flash which is acceptable
 * for managed workflow — a synchronous native module would eliminate it but
 * requires bare workflow (deviation would require ADR).
 */
import React from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MsalProvider } from '../src/auth/MsalProvider';
import { DevBypassProvider } from '../src/context/DevBypassContext';
import { LocaleProvider } from '../src/context/LocaleContext';
import { initRtlFromStorage } from '../src/i18n/RtlManager';
// Side-effect import: initialises i18next on module load
import '../src/i18n/i18nMobile';

export default function RootLayout() {
  React.useEffect(() => {
    // Kick off RTL initialisation as early as possible (C-002 compliance).
    initRtlFromStorage().catch(() => {
      // Failure is safe — defaults to LTR
    });
  }, []);

  return (
    <SafeAreaProvider>
      <LocaleProvider>
        <DevBypassProvider>
          <MsalProvider>
            <Stack screenOptions={{ headerShown: false }} />
          </MsalProvider>
        </DevBypassProvider>
      </LocaleProvider>
    </SafeAreaProvider>
  );
}
