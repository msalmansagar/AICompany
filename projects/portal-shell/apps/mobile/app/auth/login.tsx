import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri, useAuthRequest } from 'expo-auth-session';

import { SafeAreaView } from '../../src/components/ui/SafeAreaView';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { Colors } from '../../src/constants/Colors';
import { t } from '../../src/i18n';
import { useLogin } from '../../src/hooks/useAuth';
import { useBiometric } from '../../src/hooks/useBiometric';
import { getAccessToken, isBiometricEnabled } from '../../src/lib/auth-store';
import { ApiError } from '../../src/lib/api';

// Required by expo-auth-session when using web browser redirect
WebBrowser.maybeCompleteAuthSession();

// ---------------------------------------------------------------------------
// Microsoft OIDC configuration
// Replace tenant ID with your actual Azure tenant when deploying
// ---------------------------------------------------------------------------
const MICROSOFT_DISCOVERY = {
  authorizationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
};

const MICROSOFT_CLIENT_ID = process.env['EXPO_PUBLIC_MICROSOFT_CLIENT_ID'] ?? '';

// ---------------------------------------------------------------------------
// Form schema
// ---------------------------------------------------------------------------

const LoginFormSchema = z.object({
  email: z.string().email({ message: t('auth.errors.invalidEmail') }),
  password: z.string().min(1, { message: t('auth.errors.passwordTooShort') }),
});

type LoginFormValues = z.infer<typeof LoginFormSchema>;

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function LoginScreen(): React.JSX.Element {
  const [biometricChecked, setBiometricChecked] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const loginMutation = useLogin();
  const { authenticate } = useBiometric();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(LoginFormSchema),
    defaultValues: { email: '', password: '' },
  });

  // ---------------------------------------------------------------------------
  // Biometric auto-prompt on mount
  // If there is already a stored token and biometric is enabled, prompt now.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    async function attemptBiometricUnlock(): Promise<void> {
      const [token, bioEnabled] = await Promise.all([
        getAccessToken(),
        isBiometricEnabled(),
      ]);

      if (token && bioEnabled) {
        const passed = await authenticate();
        if (passed) {
          router.replace('/(tabs)/dashboard');
          return;
        }
      }
      setBiometricChecked(true);
    }

    void attemptBiometricUnlock();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — intentionally run once

  // ---------------------------------------------------------------------------
  // Microsoft SSO
  // ---------------------------------------------------------------------------
  const [msRequest, msResponse, msPromptAsync] = useAuthRequest(
    {
      clientId: MICROSOFT_CLIENT_ID,
      scopes: ['openid', 'profile', 'email'],
      redirectUri: makeRedirectUri({ scheme: 'portal' }),
    },
    MICROSOFT_DISCOVERY,
  );

  useEffect(() => {
    if (msResponse?.type === 'success' && msResponse.params['code']) {
      // Exchange code with our API — the API handles token exchange with Microsoft
      loginMutation.mutate(
        { email: `__microsoft__${msResponse.params['code']}`, password: '' },
        {
          onError: () => {
            Alert.alert(t('common.error'), t('errors.server'));
          },
        },
      );
    }
  }, [msResponse]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Email/password submit
  // ---------------------------------------------------------------------------
  function handleEmailLogin(values: LoginFormValues): void {
    setApiError(null);
    loginMutation.mutate(values, {
      onError: (error) => {
        if (error instanceof ApiError && error.status === 401) {
          setApiError(t('auth.errors.loginFailed'));
        } else {
          setApiError(t('errors.server'));
        }
      },
    });
  }

  if (!biometricChecked) {
    // Still checking biometric — render nothing (splash still partially visible)
    return <View style={{ flex: 1, backgroundColor: Colors.background }} />;
  }

  return (
    <SafeAreaView>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoider}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo / branding area */}
          <View style={styles.logoArea}>
            <Text style={styles.appName}>Portal</Text>
            <Text style={styles.tagline}>{t('auth.welcomeSubtitle')}</Text>
          </View>

          {/* Email/password form */}
          <View style={styles.form}>
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('auth.emailLabel')}
                  placeholder={t('auth.emailPlaceholder')}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  returnKeyType="next"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  error={errors.email?.message}
                  testID="login-email-input"
                />
              )}
            />

            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('auth.passwordLabel')}
                  placeholder={t('auth.passwordPlaceholder')}
                  secureTextEntry
                  autoComplete="password"
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit(handleEmailLogin)}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  error={errors.password?.message}
                  testID="login-password-input"
                />
              )}
            />

            {apiError ? (
              <Text style={styles.apiError} accessibilityRole="alert">
                {apiError}
              </Text>
            ) : null}

            <Button
              title={t('auth.signIn')}
              onPress={handleSubmit(handleEmailLogin)}
              isLoading={loginMutation.isPending}
              testID="login-submit-button"
            />
          </View>

          {/* SSO divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* SSO buttons */}
          <View style={styles.ssoSection}>
            <Button
              title={t('auth.signInWithMicrosoft')}
              onPress={() => void msPromptAsync()}
              variant="secondary"
              disabled={!msRequest}
              style={styles.ssoButton}
              testID="login-microsoft-button"
            />
          </View>

          {/* Footer links */}
          <View style={styles.footerLinks}>
            <Pressable
              onPress={() => router.push('/auth/forgot-password')}
              accessibilityRole="link"
            >
              <Text style={styles.link}>{t('auth.forgotPassword')}</Text>
            </Pressable>

            <Pressable
              onPress={() => router.push('/auth/register')}
              accessibilityRole="link"
            >
              <Text style={styles.link}>{t('auth.createAccount')}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoider: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 32,
  },
  logoArea: {
    alignItems: 'center',
    marginBottom: 40,
  },
  appName: {
    fontSize: 36,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 15,
    color: Colors.textSecondary,
    marginTop: 6,
  },
  form: {
    marginBottom: 24,
  },
  apiError: {
    fontSize: 13,
    color: Colors.error,
    marginBottom: 12,
    textAlign: 'center',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.borderStrong,
  },
  dividerText: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginHorizontal: 12,
  },
  ssoSection: {
    gap: 12,
    marginBottom: 32,
  },
  ssoButton: {
    width: '100%',
  },
  footerLinks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  link: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '500',
  },
});
