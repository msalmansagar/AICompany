'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Button,
  Input,
  Label,
  Text,
  makeStyles,
  tokens,
  Spinner,
} from '@fluentui/react-components';
import { MailRegular, LockClosedRegular, PersonRegular } from '@fluentui/react-icons';

const RegisterSchema = z
  .object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    email: z.string().email('Please enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type RegisterFormValues = z.infer<typeof RegisterSchema>;

interface RegisterFormProps {
  logoUrl: string | null;
  portalName: string;
  locale: string;
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
  row: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: tokens.spacingHorizontalM,
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
  successBox: {
    backgroundColor: tokens.colorPaletteGreenBackground1,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalM,
    color: tokens.colorPaletteGreenForeground1,
    textAlign: 'center',
  },
  link: {
    color: tokens.colorBrandForeground1,
    textDecoration: 'none',
    ':hover': { textDecoration: 'underline' },
    textAlign: 'center',
    fontSize: tokens.fontSizeBase200,
  },
});

export function RegisterForm({ logoUrl, portalName, locale }: RegisterFormProps) {
  const styles = useStyles();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [serverError, setServerError] = useState('');

  const isAr = locale === 'ar';

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(RegisterSchema),
  });

  async function onSubmit(values: RegisterFormValues) {
    setIsSubmitting(true);
    setServerError('');
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: values.firstName,
          lastName: values.lastName,
          email: values.email,
          password: values.password,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        setServerError(data?.message ?? (isAr ? 'فشل إنشاء الحساب' : 'Registration failed'));
        return;
      }

      setIsSuccess(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card} role="main" aria-label="Create account form">
        <div className={styles.logoArea}>
          {logoUrl && <img src={logoUrl} alt={portalName} className={styles.logo} />}
          <Text size={500} weight="semibold">{isAr ? 'إنشاء حسابك' : 'Create your account'}</Text>
        </div>

        {isSuccess ? (
          <div className={styles.successBox} role="alert">
            <Text>
              {isAr
                ? 'تم إنشاء حسابك. يرجى التحقق من بريدك الإلكتروني.'
                : 'Account created! Please check your email to verify your address.'}
            </Text>
          </div>
        ) : (
          <form className={styles.form} onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
            {serverError && (
              <Text className={styles.errorText} role="alert">{serverError}</Text>
            )}

            <div className={styles.row}>
              <div className={styles.field}>
                <Label htmlFor="firstName" required>{isAr ? 'الاسم الأول' : 'First name'}</Label>
                <Input
                  id="firstName"
                  contentBefore={<PersonRegular />}
                  aria-invalid={!!errors.firstName}
                  {...register('firstName')}
                />
                {errors.firstName && (
                  <Text className={styles.errorText} role="alert">{errors.firstName.message}</Text>
                )}
              </div>
              <div className={styles.field}>
                <Label htmlFor="lastName" required>{isAr ? 'اسم العائلة' : 'Last name'}</Label>
                <Input
                  id="lastName"
                  aria-invalid={!!errors.lastName}
                  {...register('lastName')}
                />
                {errors.lastName && (
                  <Text className={styles.errorText} role="alert">{errors.lastName.message}</Text>
                )}
              </div>
            </div>

            <div className={styles.field}>
              <Label htmlFor="reg-email" required>{isAr ? 'البريد الإلكتروني' : 'Email address'}</Label>
              <Input
                id="reg-email"
                type="email"
                contentBefore={<MailRegular />}
                aria-invalid={!!errors.email}
                {...register('email')}
              />
              {errors.email && (
                <Text className={styles.errorText} role="alert">{errors.email.message}</Text>
              )}
            </div>

            <div className={styles.field}>
              <Label htmlFor="reg-password" required>{isAr ? 'كلمة المرور' : 'Password'}</Label>
              <Input
                id="reg-password"
                type="password"
                contentBefore={<LockClosedRegular />}
                aria-invalid={!!errors.password}
                {...register('password')}
              />
              {errors.password && (
                <Text className={styles.errorText} role="alert">{errors.password.message}</Text>
              )}
            </div>

            <div className={styles.field}>
              <Label htmlFor="confirmPassword" required>
                {isAr ? 'تأكيد كلمة المرور' : 'Confirm password'}
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                contentBefore={<LockClosedRegular />}
                aria-invalid={!!errors.confirmPassword}
                {...register('confirmPassword')}
              />
              {errors.confirmPassword && (
                <Text className={styles.errorText} role="alert">{errors.confirmPassword.message}</Text>
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
                ? (isAr ? 'جارٍ الإنشاء...' : 'Creating account...')
                : (isAr ? 'إنشاء حساب' : 'Create account')}
            </Button>
          </form>
        )}

        <a href={`/${locale}/login`} className={styles.link}>
          {isAr ? 'لديك حساب؟ تسجيل الدخول' : 'Already have an account? Sign in'}
        </a>
      </div>
    </div>
  );
}
