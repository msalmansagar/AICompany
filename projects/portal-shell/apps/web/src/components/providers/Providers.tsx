'use client';

import React, { useState } from 'react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { RendererProvider, createDOMRenderer, renderToStyleElements } from '@griffel/react';
import { NextIntlClientProvider } from 'next-intl';
import { SessionProvider } from 'next-auth/react';
import { useServerInsertedHTML } from 'next/navigation';
import type { Session } from 'next-auth';
import type { AbstractIntlMessages } from 'next-intl';
import type { PortalConfig } from '@portal/types';
import { PortalConfigProvider } from '../../contexts/PortalConfigContext';
import { ActiveEntityProvider } from '../../contexts/ActiveEntityContext';
import { QueryClientProviderWrapper } from './QueryClientProviderWrapper';

const DEFAULT_PORTAL_CONFIG: PortalConfig = {
  id: 'default',
  portalName: 'Portal',
  logoUrl: '',
  faviconUrl: '',
  primaryColor: '#0078d4',
  accentColor: '#005a9e',
  fontFamily: "'Segoe UI', sans-serif",
  backgroundColor: '#f3f2f1',
  navLayout: 'sidebar',
  sidebarDefaultState: 'expanded',
  authProvider: 'custom',
  ssoProviders: [],
  landingPage: 'dashboard',
  rtlEnabled: false,
  headerShowEntitySwitcher: false,
  headerShowSupport: false,
  headerSupportLabel: '',
  headerSupportUrl: '',
  headerShowNotifications: true,
  footerLeftLogoUrl: '',
  footerRightLogoUrl: '',
  footerPoweredByText: 'Powered by Maqsad AI',
  footerLinks: [],
  notificationPollIntervalSeconds: 30,
};

interface ProvidersProps {
  locale: string;
  messages: AbstractIntlMessages;
  session: Session | null;
  dehydratedState: unknown;
  portalConfig: PortalConfig | null;
  isRtl: boolean;
  children: React.ReactNode;
}

export function Providers({
  locale,
  messages,
  session,
  dehydratedState,
  portalConfig,
  isRtl,
  children,
}: ProvidersProps) {
  const [renderer] = useState(() => createDOMRenderer());
  const [hasInserted, setHasInserted] = useState(false);

  useServerInsertedHTML(() => {
    if (hasInserted) return null;
    setHasInserted(true);
    return <>{renderToStyleElements(renderer)}</>;
  });

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <RendererProvider renderer={renderer}>
        <FluentProvider theme={webLightTheme} dir={isRtl ? 'rtl' : 'ltr'}>
          <SessionProvider session={session}>
            <QueryClientProviderWrapper dehydratedState={dehydratedState}>
              <PortalConfigProvider value={portalConfig ?? DEFAULT_PORTAL_CONFIG}>
                <ActiveEntityProvider>
                  {children}
                </ActiveEntityProvider>
              </PortalConfigProvider>
            </QueryClientProviderWrapper>
          </SessionProvider>
        </FluentProvider>
      </RendererProvider>
    </NextIntlClientProvider>
  );
}
