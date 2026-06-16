import React from 'react';
import { auth } from '../../../../lib/auth';
import { Text } from '@fluentui/react-components';
import { ProfileForm } from '../../../../components/auth/ProfileForm';

interface ProfilePageProps {
  params: Promise<{ locale: string }>;
}

export const metadata = { title: 'My Profile' };

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { locale } = await params;
  const session = await auth();

  const title = locale === 'ar' ? 'ملفي الشخصي' : 'My Profile';

  return (
    <section aria-labelledby="profile-heading">
      <h1 id="profile-heading" className="text-2xl font-semibold mb-6">
        {title}
      </h1>
      <ProfileForm
        initialName={session?.user?.name ?? ''}
        initialEmail={session?.user?.email ?? ''}
        locale={locale}
      />
    </section>
  );
}
