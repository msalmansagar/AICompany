import React from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMsal } from '../src/auth/MsalProvider';
import { isAppConfigured } from '../src/config/appConfig';
import { useDevBypass } from '../src/context/DevBypassContext';

export default function LoginScreen() {
  const { account, signIn, isLoading, authError } = useMsal();
  const { enableDevBypass } = useDevBypass();
  const router = useRouter();
  const [signingIn, setSigningIn] = React.useState(false);

  React.useEffect(() => {
    if (account) {
      router.replace('/forms');
    }
  }, [account, router]);

  function handleDevBypass(): void {
    enableDevBypass();
    router.replace('/forms');
  }

  async function handleSignIn(): Promise<void> {
    setSigningIn(true);
    try {
      await signIn();
    } catch (error) {
      Alert.alert(
        'Sign In Failed',
        error instanceof Error ? error.message : 'An unexpected error occurred.'
      );
    } finally {
      setSigningIn(false);
    }
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" accessibilityLabel="Loading authentication" />
      </View>
    );
  }

  if (authError) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{authError}</Text>
      </View>
    );
  }

  const configured = isAppConfigured();

  return (
    <View style={styles.container}>
      {!configured && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Dev mode — Azure AD credentials not configured.{'\n'}
            Open app.json and replace the REPLACE_WITH_* values.
          </Text>
        </View>
      )}
      <Text style={styles.title}>QDB Forms</Text>
      <Text style={styles.subtitle}>Qatar Development Bank</Text>
      <TouchableOpacity
        style={[styles.button, !configured && styles.buttonDisabled]}
        onPress={handleSignIn}
        disabled={signingIn || !configured}
        accessibilityRole="button"
        accessibilityLabel="Sign in with your QDB account"
        accessibilityHint="Opens the Microsoft login page in your browser"
      >
        {signingIn
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.buttonText}>Sign in with QDB Account</Text>
        }
      </TouchableOpacity>

      {__DEV__ && (
        <TouchableOpacity
          style={styles.devButton}
          onPress={handleDevBypass}
          accessibilityRole="button"
          accessibilityLabel="Skip login for development"
        >
          <Text style={styles.devButtonText}>Skip login (Dev mode)</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#f5f5f5' },
  title: { fontSize: 28, fontWeight: '700', color: '#1a1a2e', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 48 },
  button: { backgroundColor: '#0078d4', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 8, minWidth: 220, alignItems: 'center' },
  buttonDisabled: { backgroundColor: '#9e9e9e' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  errorText: { color: '#d32f2f', textAlign: 'center', fontSize: 15 },
  banner: { backgroundColor: '#fff3cd', borderColor: '#ffc107', borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 32, width: '100%' },
  bannerText: { color: '#856404', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  devButton: { marginTop: 16, paddingVertical: 12, paddingHorizontal: 32 },
  devButtonText: { color: '#999', fontSize: 13, textDecorationLine: 'underline', textAlign: 'center' },
});
