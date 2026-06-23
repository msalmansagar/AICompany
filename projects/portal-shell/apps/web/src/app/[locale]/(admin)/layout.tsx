import React from 'react';
import { redirect } from 'next/navigation';
import { auth } from '../../../lib/auth';
import { serverGet } from '../../../lib/api-client';
import { PortalShell } from '../../../components/shell/PortalShell';
import type { NavItem, UserProfile } from '@portal/types';

interface AdminLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

const ADMIN_NAV_ITEMS: NavItem[] = [
  {
    id: 'admin-portal',
    label: 'Portal Settings',
    labelAr: 'إعدادات البوابة',
    icon: 'SettingsRegular',
    pageCode: 'admin/portal',
    displayOrder: 1,
    isVisible: true,
    badgeSource: 'none',
    badgeValue: null,
    requiredRole: 'Admin',
    parentId: null,
  },
  {
    id: 'admin-nav',
    label: 'Navigation Builder',
    labelAr: 'منشئ التنقل',
    icon: 'NavigationRegular',
    pageCode: 'admin/nav',
    displayOrder: 2,
    isVisible: true,
    badgeSource: 'none',
    badgeValue: null,
    requiredRole: 'Admin',
    parentId: null,
  },
  {
    id: 'admin-cms',
    label: 'Content (CMS)',
    labelAr: 'المحتوى',
    icon: 'DocumentTextRegular',
    pageCode: 'admin/cms',
    displayOrder: 3,
    isVisible: true,
    badgeSource: 'none' as const,
    badgeValue: null,
    requiredRole: 'Admin',
    parentId: null,
  },
];

export default async function AdminLayout({ children, params }: AdminLayoutProps) {
  const { locale } = await params;
  const session = await auth();

  if (!session?.user) {
    redirect(`/${locale}/login`);
  }

  const roles = ((session as unknown as Record<string, unknown>)['roles'] as string[]) ?? [];
  if (!roles.includes('Admin')) {
    redirect(`/${locale}/dashboard`);
  }

  const user: UserProfile = {
    id: session.user.id ?? '',
    email: session.user.email ?? '',
    displayName: session.user.name ?? session.user.email ?? '',
    firstName: '',
    lastName: '',
    avatarUrl: session.user.image ?? null,
    roles,
    linkedEntityIds: [],
    preferredLanguage: (locale as 'en' | 'ar') ?? 'en',
  };

  return (
    <PortalShell navItems={ADMIN_NAV_ITEMS} user={user} locale={locale}>
      {children}
    </PortalShell>
  );
}
