import React, { useState } from 'react';
import {
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

import { SafeAreaView } from '../../src/components/ui/SafeAreaView';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { Colors } from '../../src/constants/Colors';
import { t } from '../../src/i18n';
import { useForgotPassword } from '../../src/hooks/useAuth';

// ---------------------------------------------------------------------------
// Form schema
// ---------------------------------------------------------------------------

const ForgotPasswordSchema = z.object({
  email: z.string().email({ message: t('auth.errors.invalidEmail') }),
});

type ForgotPasswordValues = z.infer<typeof ForgotPasswordSchema>;

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ForgotPasswordScreen(): React.JSX.Element {
  const [submitted, setSubmitted] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const forgotPasswordMutation = useForgotPassword();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(ForgotPasswordSchema),
    defaultValues: { email: '' },
  });

  function handleForgotPassword(values: ForgotPasswordValues): void {
    setApiError(null);
    forgotPasswordMutation.mutate(values.email, {
      onSuccess: () => setSubmitted(true),
      onError: () => setApiError(t('auth.errors.forgotPasswordFailed')),
    });
  }

  if (submitted) {
    return (
      <SafeAreaView>
        <View style={styles.successContainer}>
          <Text style={styles.successTitle}>{t('auth.forgotPasswordScreen.successTitle')}</Text>
          <Text style={styles.successBody}>{t('auth.forgotPasswordScreen.successBody')}</Text>
          <Button
            title={t('auth.forgotPasswordScreen.backToLogin')}
            onPress={() => router.replace('/auth/login')}
            variant="secondary"
            style={styles.backButton}
          />
        </View>
      </SafeAreaView>
    );
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
          <Text style={styles.title}>{t('auth.forgotPasswordScreen.title')}</Text>
          <Text style={styles.subtitle}>{t('auth.forgotPasswordScreen.subtitle')}</Text>

          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label={t('auth.forgotPasswordScreen.emailLabel')}
                placeholder={t('auth.emailPlaceholder')}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                returnKeyType="done"
                onSubmitEditing={handleSubmit(handleForgotPassword)}
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                error={errors.email?.message}
                testID="forgot-password-email-input"
              />
            )}
          />

          {apiError ? (
            <Text style={styles.apiError} accessibilityRole="alert">
              {apiError}
            </Text>
          ) : null}

          <Button
            title={t('auth.forgotPasswordScreen.submitButton')}
            onPress={handleSubmit(handleForgotPassword)}
            isLoading={forgotPasswordMutation.isPending}
            testID="forgot-password-submit-button"
          />

          <Pressable
            style={styles.backLink}
            onPress={() => router.back()}
            accessibilityRole="link"
          >
            <Text style={styles.backLinkText}>{t('auth.forgotPasswordScreen.backToLogin')}</Text>
          </Pressable>
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
    paddingTop: 48,
    paddingBottom: 32,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: 28,
  },
  apiError: {
    fontSize: 13,
    color: Colors.error,
    marginBottom: 12,
    textAlign: 'center',
  },
  backLink: {
    marginTop: 20,
    alignItems: 'center',
  },
  backLinkText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '500',
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  successBody: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  backButton: {
    alignSelf: 'center',
  },
});
