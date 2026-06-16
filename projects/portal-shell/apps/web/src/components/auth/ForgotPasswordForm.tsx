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
import { MailRegular } from '@fluentui/react-icons';

const ForgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

type ForgotPasswordFormValues = z.infer<typeof ForgotPasswordSchema>;

interface ForgotPasswordFormProps {
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
  },
  link: {
    color: tokens.colorBrandForeground1,
    textDecoration: 'none',
    ':hover': { textDecoration: 'underline' },
    textAlign: 'center',
    fontSize: tokens.fontSizeBase200,
  },
});

export function ForgotPasswordForm({ logoUrl, portalName, locale }: ForgotPasswordFormProps) {
  const styles = useStyles();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const isAr = locale === 'ar';

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(ForgotPasswordSchema),
  });

  async function onSubmit(values: ForgotPasswordFormValues) {
    setIsSubmitting(true);
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: values.email }),
      });
      // Always show success — prevents email enumeration
      setIsSuccess(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card} role="main" aria-label="Reset password form">
        <div className={styles.logoArea}>
          {logoUrl && <img src={logoUrl} alt={portalName} className={styles.logo} />}
          <Text size={500} weight="semibold">
            {isAr ? 'إعادة تعيين كلمة المرور' : 'Reset your password'}
          </Text>
          <Text size={300} style={{ color: tokens.colorNeutralForeground3, textAlign: 'center' }}>
            {isAr
              ? 'أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة التعيين'
              : 'Enter your email and we will send you a reset link'}
          </Text>
        </div>

        {isSuccess ? (
          <div className={styles.successBox} role="alert">
            <Text>
              {isAr
                ? 'إذا كان هذا البريد الإلكتروني مسجلاً، ستتلقى رسالة بها رابط إعادة تعيين كلمة المرور.'
                : 'If this email is registered, you will receive a password reset link shortly.'}
            </Text>
          </div>
        ) : (
          <form className={styles.form} onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
            <div className={styles.field}>
              <Label htmlFor="reset-email" required>
                {isAr ? 'البريد الإلكتروني' : 'Email address'}
              </Label>
              <Input
                id="reset-email"
                type="email"
                contentBefore={<MailRegular />}
                placeholder={isAr ? '' : 'you@example.com'}
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'reset-email-error' : undefined}
                {...register('email')}
              />
              {errors.email && (
                <Text id="reset-email-error" className={styles.errorText} role="alert">
                  {errors.email.message}
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
                ? (isAr ? 'جارٍ الإرسال...' : 'Sending...')
                : (isAr ? 'إرسال رابط إعادة التعيين' : 'Send reset link')}
            </Button>
          </form>
        )}

        <a href={`/${locale}/login`} className={styles.link}>
          {isAr ? 'العودة إلى تسجيل الدخول' : 'Back to sign in'}
        </a>
      </div>
    </div>
  );
}
