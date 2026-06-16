import React from 'react';
import { redirect } from 'next/navigation';
import { auth } from '../../../../lib/auth';
import { getPortalConfig, getPortalId } from '../../../../lib/portal-config';
import { RegisterForm } from '../../../../components/auth/RegisterForm';
import type { PortalConfig } from '@portal/types';

interface RegisterPageProps {
  params: Promise<{ locale: string }>;
}

export default async function RegisterPage({ params }: RegisterPageProps) {
  const { locale } = await params;
  const session = await auth();

  if (session?.user) {
    redirect(`/${locale}/dashboard`);
  }

  let portalConfig: Pick<PortalConfig, 'portalName' | 'logoUrl' | 'primaryColor'> | null = null;
  try {
    portalConfig = await getPortalConfig(getPortalId());
  } catch {
    // Render with defaults if config is unavailable
  }

  return (
    <RegisterForm
      locale={locale}
      portalName={portalConfig?.portalName ?? 'Portal'}
      logoUrl={portalConfig?.logoUrl ?? null}
    />
  );
}
