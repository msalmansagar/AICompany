import React from 'react';
import { redirect } from 'next/navigation';
import { getCachedAuth } from '../../../lib/cached-auth';
import { AdminShell } from '../../../components/admin/AdminShell';
import type { UserProfile } from '@portal/types';

interface AdminLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function AdminLayout({ children, params }: AdminLayoutProps) {
  const { locale } = await params;
  const session = await getCachedAuth();

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
    <AdminShell user={user} locale={locale}>
      {children}
    </AdminShell>
  );
}
