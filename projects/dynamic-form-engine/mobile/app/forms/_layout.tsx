import React from 'react';
import { Redirect, Stack } from 'expo-router';
import { useMsal } from '../../src/auth/MsalProvider';
import { useDevBypass } from '../../src/context/DevBypassContext';

export default function FormsLayout() {
  const { account } = useMsal();
  const { isDevBypass } = useDevBypass();

  if (!account && !isDevBypass) {
    return <Redirect href="/" />;
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#0078d4' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    />
  );
}
