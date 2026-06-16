'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { signIn } from 'next-auth/react';
import {
  Button,
  Input,
  Label,
  Text,
  makeStyles,
  tokens,
  Spinner,
  Divider,
} from '@fluentui/react-components';
import { MailRegular, LockClosedRegular, WindowsLogoRegular } from '@fluentui/react-icons';

const LoginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormValues = z.infer<typeof LoginSchema>;

interface LoginFormProps {
  logoUrl: string | null;
  portalName: string;
  ssoProviders: Array<'microsoft' | 'google'>;
  registrationEnabled: boolean;
  locale: string;
  callbackUrl?: string;
}

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    paddingInline: tokens.spacingHorizontalXXL,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusXLarge,
    padding: tokens.spacingVerticalXXL,
    boxShadow: tokens.shadow16,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  logoArea: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalM,
  },
  logo: {
    height: '48px',
    objectFit: 'contain',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  errorText: {
    color: tokens.colorPaletteRedForeground1,
    fontSize: tokens.fontSizeBase200,
  },
  globalError: {
    backgroundColor: tokens.colorPaletteRedBackground1,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalS,
    color: tokens.colorPaletteRedForeground1,
    fontSize: tokens.fontSizeBase200,
  },
  links: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: tokens.fontSizeBase200,
  },
  link: {
    color: tokens.colorBrandForeground1,
    textDecoration: 'none',
    ':hover': {
      textDecoration: 'underline',
    },
  },
  ssoSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  orDivider: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
});

export function LoginForm({
  logoUrl,
  portalName,
  ssoProviders,
  registrationEnabled,
  locale,
  callbackUrl = '/',
}: LoginFormProps) {
  const styles = useStyles();
  const [globalError, setGlobalError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isAr = locale === 'ar';

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(LoginSchema),
  });

  async function onSubmit(values: LoginFormValues) {
    setIsSubmitting(true);
    setGlobalError('');
    try {
      const result = await signIn('credentials', {
        email: values.email,
        password: values.password,
        redirect: false,
      });

      if (result?.error) {
        setGlobalError(
          isAr ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة' : 'Invalid email or password'
        );
      } else {
        window.location.href = callbackUrl;
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSsoSignIn(provider: 'microsoft' | 'google') {
    await signIn(provider === 'microsoft' ? 'microsoft-entra-id' : 'google', {
      callbackUrl,
    });
  }

  return (
    <div className={styles.container}>
      <div className={styles.card} role="main" aria-label="Sign in form">
        {/* Logo */}
        <div className={styles.logoArea}>
          {logoUrl && (
            <img src={logoUrl} alt={portalName} className={styles.logo} />
          )}
          <Text size={500} weight="semibold">{isAr ? 'مرحباً بعودتك' : 'Welcome back'}</Text>
          <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
            {isAr ? 'سجّل دخولك إلى حسابك للمتابعة' : 'Sign in to your account to continue'}
          </Text>
        </div>

        {/* SSO Buttons */}
        {ssoProviders.length > 0 && (
          <div className={styles.ssoSection}>
            {ssoProviders.includes('microsoft') && (
              <Button
                appearance="outline"
                icon={<WindowsLogoRegular />}
                onClick={() => void handleSsoSignIn('microsoft')}
                size="large"
              >
                {isAr ? 'تسجيل الدخول بـ Microsoft' : 'Sign in with Microsoft'}
              </Button>
            )}
            {ssoProviders.includes('google') && (
              <Button
                appearance="outline"
                onClick={() => void handleSsoSignIn('google')}
                size="large"
              >
                {isAr ? 'تسجيل الدخول بـ Google' : 'Sign in with Google'}
              </Button>
            )}
            <Divider>{isAr ? 'أو تابع باستخدام' : 'Or continue with'}</Divider>
          </div>
        )}

        {/* Credentials form */}
        <form className={styles.form} onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
          {globalError && (
            <div className={styles.globalError} role="alert">
              {globalError}
            </div>
          )}

          <div className={styles.field}>
            <Label htmlFor="email" required>
              {isAr ? 'البريد الإلكتروني' : 'Email address'}
            </Label>
            <Input
              id="email"
              type="email"
              contentBefore={<MailRegular />}
              placeholder={isAr ? '' : 'you@example.com'}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'email-error' : undefined}
              {...register('email')}
            />
            {errors.email && (
              <Text id="email-error" className={styles.errorText} role="alert">
                {errors.email.message}
              </Text>
            )}
          </div>

          <div className={styles.field}>
            <Label htmlFor="password" required>
              {isAr ? 'كلمة المرور' : 'Password'}
            </Label>
            <Input
              id="password"
              type="password"
              contentBefore={<LockClosedRegular />}
              placeholder={isAr ? 'أدخل كلمة المرور' : 'Enter your password'}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'password-error' : undefined}
              {...register('password')}
            />
            {errors.password && (
              <Text id="password-error" className={styles.errorText} role="alert">
                {errors.password.message}
              </Text>
            )}
          </div>

          <Button
            type="submit"
            appearance="primary"
            size="large"
            disabled={isSubmitting}
            icon={isSubmitting ? <Spinner size="tiny" /> : undefined}
          >
            {isSubmitting
              ? (isAr ? 'جارٍ تسجيل الدخول...' : 'Signing in...')
              : (isAr ? 'تسجيل الدخول' : 'Sign in')}
          </Button>
        </form>

        {/* Footer links */}
        <div className={styles.links}>
          <a href={`/${locale}/forgot-password`} className={styles.link}>
            {isAr ? 'نسيت كلمة المرور؟' : 'Forgot password?'}
          </a>
          {registrationEnabled && (
            <a href={`/${locale}/register`} className={styles.link}>
              {isAr ? 'إنشاء حساب' : 'Create account'}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
