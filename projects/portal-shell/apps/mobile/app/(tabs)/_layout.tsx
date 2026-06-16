import React, { useEffect, useState } from 'react';
import { Tabs, Redirect } from 'expo-router';
import { TabBar } from '../../src/components/navigation/TabBar';
import { getAccessToken } from '../../src/lib/auth-store';

// All tab screens share this layout.
// The custom TabBar component renders the bottom navigation with RTL support,
// unread notification badge, and accessibility labels.
export default function TabsLayout(): React.JSX.Element | null {
  const [authChecked, setAuthChecked] = useState(false);
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    async function checkToken(): Promise<void> {
      const token = await getAccessToken();
      setHasToken(Boolean(token));
      setAuthChecked(true);
    }
    void checkToken();
  }, []);

  if (!authChecked) return null;
  if (!hasToken) return <Redirect href="/auth/login" />;

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="services/index" options={{ title: 'Services' }} />
      <Tabs.Screen name="my-requests/index" options={{ title: 'My Requests' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
