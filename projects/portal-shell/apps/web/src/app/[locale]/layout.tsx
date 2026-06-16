import React from 'react';
import type { Metadata } from 'next';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { SessionProvider } from 'next-auth/react';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { auth } from '../../lib/auth';
import { getPortalConfig, getPortalId } from '../../lib/portal-config';
import { makeQueryClient } from '../../lib/query-client';
import { PortalConfigProvider } from '../../contexts/PortalConfigContext';
import { ActiveEntityProvider } from '../../contexts/ActiveEntityContext';
import { QueryClientProviderWrapper } from '../../components/providers/QueryClientProviderWrapper';
import type { PortalConfig } from '@portal/types';

interface LocaleLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return [{ locale: 'en' }, { locale: 'ar' }];
}

export async function generateMetadata({
  params,
}: LocaleLayoutProps): Promise<Metadata> {
  const { locale } = await params;
  const portalId = getPortalId();

  let portalName = 'Portal';
  try {
    const config = await getPortalConfig(portalId);
    portalName = config.portalName;
  } catch {
    // Use fallback title on config fetch failure
  }

  return {
    title: portalName,
    description: `${portalName} — Government Services Portal`,
  };
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;

  // Enable static rendering for this locale
  setRequestLocale(locale);

  const messages = await getMessages();
  const portalId = getPortalId();
  const session = await auth();

  let portalConfig: PortalConfig | null = null;
  try {
    portalConfig = await getPortalConfig(portalId);
  } catch {
    // Portal config failed — render with a null-safe fallback in children
  }

  const isRtl = locale === 'ar';
  const queryClient = makeQueryClient();
  const dehydratedState = dehydrate(queryClient);

  return (
    <html lang={locale} dir={isRtl ? 'rtl' : 'ltr'} suppressHydrationWarning>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <FluentProvider theme={webLightTheme} dir={isRtl ? 'rtl' : 'ltr'}>
            <SessionProvider session={session}>
              <QueryClientProviderWrapper dehydratedState={dehydratedState}>
                {portalConfig ? (
                  <PortalConfigProvider value={portalConfig}>
                    <ActiveEntityProvider>
                      {children}
                    </ActiveEntityProvider>
                  </PortalConfigProvider>
                ) : (
                  children
                )}
              </QueryClientProviderWrapper>
            </SessionProvider>
          </FluentProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
