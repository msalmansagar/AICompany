import React from 'react';
import { auth } from '../../../../lib/auth';
import { serverGet } from '../../../../lib/api-client';
import { WidgetGrid } from '../../../../components/dashboard/WidgetGrid';
import type { WidgetInstance } from '@portal/widget-registry';

// Register all built-in widgets so the dashboard can resolve them
import '@portal/widget-registry';

interface DashboardPageProps {
  params: Promise<{ locale: string }>;
}

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { locale } = await params;
  const session = await auth();
  const userName = session?.user?.name ?? '';

  let widgetInstances: WidgetInstance[] = [];
  try {
    const data = await serverGet<{ items: WidgetInstance[] }>('/api/portal/widgets');
    widgetInstances = data.items;
  } catch {
    // Non-fatal — render empty dashboard
  }

  return (
    <section aria-label="Dashboard">
      <h1 className="text-2xl font-semibold mb-6">
        {locale === 'ar' ? `مرحباً، ${userName}` : `Welcome back, ${userName}`}
      </h1>
      <WidgetGrid
        widgetInstances={widgetInstances}
        locale={locale}
        emptyLabel={locale === 'ar' ? 'لم يتم تكوين أي أدوات' : 'No widgets configured'}
        emptySubtitle={
          locale === 'ar'
            ? 'تواصل مع المسؤول لإعداد لوحة التحكم الخاصة بك'
            : 'Contact your administrator to set up your dashboard'
        }
      />
    </section>
  );
}
