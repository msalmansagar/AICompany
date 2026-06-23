import React from 'react';
import { redirect } from 'next/navigation';
import { auth } from '../../../../lib/auth';
import { getPortalConfig, getPortalId } from '../../../../lib/portal-config';
import { LoginForm } from '../../../../components/auth/LoginForm';
import type { PortalConfig } from '@portal/types';

interface LoginPageProps {
  params: Promise<{ locale: string }>;
}

export default async function LoginPage({ params }: LoginPageProps) {
  const { locale } = await params;
  const session = await auth();

  if (session?.user) {
    redirect(`/${locale}/dashboard`);
  }

  let portalConfig: Pick<PortalConfig, 'portalName' | 'logoUrl' | 'primaryColor' | 'ssoProviders'> | null = null;
  try {
    portalConfig = await getPortalConfig(getPortalId());
  } catch {
    // Render with defaults if config is unavailable
  }

  return (
    <LoginForm
      locale={locale}
      portalName={portalConfig?.portalName ?? 'Portal'}
      logoUrl={portalConfig?.logoUrl ?? null}
      ssoProviders={portalConfig?.ssoProviders ?? []}
    />
  );
}
