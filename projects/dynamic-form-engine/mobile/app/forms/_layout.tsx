import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useMsal } from '../../src/auth/MsalProvider';
import { useDevBypass } from '../../src/context/DevBypassContext';

export default function FormsLayout() {
  const { account } = useMsal();
  const { isDevBypass } = useDevBypass();
  const router = useRouter();

  useEffect(() => {
    if (!account && !isDevBypass) {
      router.replace('/');
    }
  }, [account, isDevBypass, router]);

  if (!account && !isDevBypass) return null;

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
