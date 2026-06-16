import React from 'react';
import { getPortalConfig, getPortalId } from '../../../../lib/portal-config';
import { ForgotPasswordForm } from '../../../../components/auth/ForgotPasswordForm';
import type { PortalConfig } from '@portal/types';

interface ForgotPasswordPageProps {
  params: Promise<{ locale: string }>;
}

export default async function ForgotPasswordPage({ params }: ForgotPasswordPageProps) {
  const { locale } = await params;

  let portalConfig: Pick<PortalConfig, 'portalName' | 'logoUrl'> | null = null;
  try {
    portalConfig = await getPortalConfig(getPortalId());
  } catch {
    // Render with defaults if config is unavailable
  }

  return (
    <ForgotPasswordForm
      locale={locale}
      portalName={portalConfig?.portalName ?? 'Portal'}
      logoUrl={portalConfig?.logoUrl ?? null}
    />
  );
}
