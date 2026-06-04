import { Stack } from 'expo-router';
import { MsalProvider } from '../src/auth/MsalProvider';
import { DevBypassProvider } from '../src/context/DevBypassContext';

export default function RootLayout() {
  return (
    <DevBypassProvider>
      <MsalProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </MsalProvider>
    </DevBypassProvider>
  );
}
