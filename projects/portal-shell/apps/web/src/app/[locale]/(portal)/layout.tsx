import React from 'react';
import { redirect } from 'next/navigation';
import { auth } from '../../../lib/auth';
import { serverGet } from '../../../lib/api-client';
import { PortalShell } from '../../../components/shell/PortalShell';
import type { NavItem, UserProfile } from '@portal/types';

interface PortalLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function PortalLayout({ children, params }: PortalLayoutProps) {
  const { locale } = await params;
  const session = await auth();

  // Guard: unauthenticated users go to login
  if (!session?.user) {
    redirect(`/${locale}/login`);
  }

  // Fetch nav items server-side (filtered by user role on the API)
  let navItems: NavItem[] = [];
  try {
    const navData = await serverGet<{ items: NavItem[] }>('/api/nav');
    navItems = navData.items;
  } catch {
    // Non-fatal — render with empty nav
  }

  // Build user profile from session
  const user: UserProfile = {
    id: session.user.id ?? '',
    email: session.user.email ?? '',
    displayName: session.user.name ?? session.user.email ?? '',
    firstName: '',
    lastName: '',
    avatarUrl: session.user.image ?? null,
    roles: ((session as unknown as Record<string, unknown>)['roles'] as string[]) ?? [],
    linkedEntityIds: [],
    preferredLanguage: (locale as 'en' | 'ar') ?? 'en',
  };

  return (
    <PortalShell navItems={navItems} user={user} locale={locale}>
      {children}
    </PortalShell>
  );
}
