import { Redirect } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { getAccessToken } from '../src/lib/auth-store';
import { Colors } from '../src/constants/Colors';

type Destination = '/(tabs)/dashboard' | '/auth/login' | null;

// Splash-guard: wait until we know whether a token exists before redirecting.
// Returning null keeps the splash screen visible.
export default function Index(): React.JSX.Element | null {
  const [destination, setDestination] = useState<Destination>(null);

  useEffect(() => {
    async function resolveDestination(): Promise<void> {
      const token = await getAccessToken();
      setDestination(token ? '/(tabs)/dashboard' : '/auth/login');
    }
    void resolveDestination();
  }, []);

  if (!destination) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  return <Redirect href={destination} />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
});
