import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { makeQueryClient } from '../src/lib/query-client';
import { initI18n } from '../src/i18n';

// Keep splash screen visible while fonts and i18n initialise
void SplashScreen.preventAutoHideAsync();

// Initialise locale and RTL once at module level before render
initI18n();

// Single QueryClient instance for the lifetime of the app
const queryClient = makeQueryClient();

export default function RootLayout(): React.JSX.Element {
  useEffect(() => {
    // Hide splash after first render cycle completes
    void SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <Stack screenOptions={{ headerShown: false }} />
          <StatusBar style="auto" />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
