import React, { useState } from 'react';
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

import { SafeAreaView } from '../../src/components/ui/SafeAreaView';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { Colors } from '../../src/constants/Colors';
import { t } from '../../src/i18n';
import { useRegister } from '../../src/hooks/useAuth';
import { ApiError } from '../../src/lib/api';

// ---------------------------------------------------------------------------
// Form schema
// ---------------------------------------------------------------------------

const RegisterFormSchema = z.object({
  firstName: z.string().min(1, { message: t('common.required') }),
  lastName: z.string().min(1, { message: t('common.required') }),
  email: z.string().email({ message: t('auth.errors.invalidEmail') }),
  password: z
    .string()
    .min(12, { message: t('auth.errors.passwordTooShort') })
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d])/, {
      message: t('auth.errors.passwordComplexity'),
    }),
  preferredLanguage: z.enum(['en', 'ar']),
});

type RegisterFormValues = z.infer<typeof RegisterFormSchema>;

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function RegisterScreen(): React.JSX.Element {
  const [apiError, setApiError] = useState<string | null>(null);
  const registerMutation = useRegister();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(RegisterFormSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      preferredLanguage: 'en',
    },
  });

  function handleRegister(values: RegisterFormValues): void {
    setApiError(null);
    registerMutation.mutate(values, {
      onSuccess: () => {
        Alert.alert(t('common.success'), t('auth.register.success'), [
          { text: 'OK', onPress: () => router.replace('/auth/login') },
        ]);
      },
      onError: (error) => {
        if (error instanceof ApiError && error.status === 409) {
          setApiError(t('auth.errors.registerFailed'));
        } else {
          setApiError(t('errors.server'));
        }
      },
    });
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
          <Text style={styles.title}>{t('auth.register.title')}</Text>

          <View style={styles.nameRow}>
            <View style={styles.nameField}>
              <Controller
                control={control}
                name="firstName"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label={t('auth.register.firstNameLabel')}
                    placeholder={t('auth.register.firstNamePlaceholder')}
                    autoComplete="given-name"
                    autoCapitalize="words"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    error={errors.firstName?.message}
                    testID="register-first-name-input"
                  />
                )}
              />
            </View>
            <View style={styles.nameField}>
              <Controller
                control={control}
                name="lastName"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label={t('auth.register.lastNameLabel')}
                    placeholder={t('auth.register.lastNamePlaceholder')}
                    autoComplete="family-name"
                    autoCapitalize="words"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    error={errors.lastName?.message}
                    testID="register-last-name-input"
                  />
                )}
              />
            </View>
          </View>

          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label={t('auth.register.emailLabel')}
                placeholder={t('auth.emailPlaceholder')}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                error={errors.email?.message}
                testID="register-email-input"
              />
            )}
          />

          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label={t('auth.register.passwordLabel')}
                secureTextEntry
                autoComplete="new-password"
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                error={errors.password?.message}
                testID="register-password-input"
              />
            )}
          />

          <Text style={styles.passwordHint}>{t('auth.register.passwordHint')}</Text>

          {apiError ? (
            <Text style={styles.apiError} accessibilityRole="alert">
              {apiError}
            </Text>
          ) : null}

          <Button
            title={t('auth.register.submitButton')}
            onPress={handleSubmit(handleRegister)}
            isLoading={registerMutation.isPending}
            testID="register-submit-button"
          />

          <Pressable
            style={styles.loginLink}
            onPress={() => router.replace('/auth/login')}
            accessibilityRole="link"
          >
            <Text style={styles.loginLinkText}>{t('auth.alreadyHaveAccount')}</Text>
            <Text style={styles.loginLinkAction}> {t('auth.signIn')}</Text>
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
    paddingTop: 32,
    paddingBottom: 32,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 28,
  },
  nameRow: {
    flexDirection: 'row',
    gap: 12,
  },
  nameField: {
    flex: 1,
  },
  passwordHint: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: -8,
    marginBottom: 16,
    lineHeight: 16,
  },
  apiError: {
    fontSize: 13,
    color: Colors.error,
    marginBottom: 12,
    textAlign: 'center',
  },
  loginLink: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  loginLinkText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  loginLinkAction: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '600',
  },
});
