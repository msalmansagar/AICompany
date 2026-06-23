import React from 'react';
import type { Metadata } from 'next';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { dehydrate } from '@tanstack/react-query';
import { getCachedAuth } from '../../lib/cached-auth';
import { getPortalConfig, getPortalId } from '../../lib/portal-config';
import { makeQueryClient } from '../../lib/query-client';
import { Providers } from '../../components/providers/Providers';
import { resolveTokensForSSR } from '../../lib/tokens/resolveTokens';
import { buildCSSCustomProperties } from '../../lib/tokens/injectTokenStyles';
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
  const session = await getCachedAuth();

  let portalConfig: PortalConfig | null = null;
  try {
    portalConfig = await getPortalConfig(portalId);
  } catch {
    // Portal config failed — render with a null-safe fallback in children
  }

  // Resolve the token map at SSR time (ADR-003-004).
  // layout-level call omits service/category/componentSlug — covers Levels 1 and 2.
  // On API failure resolveTokensForSSR returns {} so the portal renders without CSS vars.
  const tokenMap = await resolveTokensForSSR({
    renderTarget: 'portal',
    locale: locale === 'ar' ? 'ar' : 'en',
  });

  const cssVars = buildCSSCustomProperties(tokenMap);

  // Derive text direction: prefer token value so the token system controls it;
  // fall back to locale-based heuristic so the page is never directionless.
  const textDirection = tokenMap['text-direction'] ?? (locale === 'ar' ? 'rtl' : 'ltr');
  const isRtl = textDirection === 'rtl';

  const queryClient = makeQueryClient();
  const dehydratedState = dehydrate(queryClient);

  return (
    <html lang={locale} dir={textDirection} suppressHydrationWarning>
      <head>
        {cssVars.length > 0 && (
          <style dangerouslySetInnerHTML={{ __html: `:root { ${cssVars} }` }} />
        )}
      </head>
      <body>
        <Providers
          locale={locale}
          messages={messages}
          session={session}
          dehydratedState={dehydratedState}
          portalConfig={portalConfig}
          isRtl={isRtl}
        >
          {children}
        </Providers>
      </body>
    </html>
  );
}
