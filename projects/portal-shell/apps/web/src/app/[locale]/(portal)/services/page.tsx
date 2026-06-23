import React from 'react';
import { Text, Input, makeStyles, tokens } from '@fluentui/react-components';
import { SearchRegular } from '@fluentui/react-icons';
import { serverGet } from '../../../../lib/api-client';
import { ServiceCard } from '../../../../components/services/ServiceCard';

interface PortalService {
  code: string;
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  category: string;
  heroImageUrl: string | null;
}

interface ServicesPageProps {
  params: Promise<{ locale: string }>;
}

export const metadata = { title: 'Services' };

export default async function ServicesPage({ params }: ServicesPageProps) {
  const { locale } = await params;

  let services: PortalService[] = [];
  try {
    const data = await serverGet<{ items: PortalService[] }>('/api/services');
    services = data.items;
  } catch {
    // Non-fatal — show empty state
  }

  const title = locale === 'ar' ? 'الخدمات' : 'Services';
  const subtitle = locale === 'ar'
    ? 'تصفح الخدمات الحكومية المتاحة'
    : 'Browse available government services';
  const viewDetailsLabel = locale === 'ar' ? 'عرض التفاصيل' : 'View Details';
  const noServicesLabel = locale === 'ar' ? 'لا توجد خدمات متاحة' : 'No services available';

  return (
    <section aria-labelledby="services-heading">
      <h1 id="services-heading" className="text-2xl font-semibold mb-2">
        {title}
      </h1>
      <p className="text-base mb-8" style={{ color: tokens.colorNeutralForeground2 }}>
        {subtitle}
      </p>

      {services.length === 0 ? (
        <div
          className="flex items-center justify-center min-h-48"
          style={{ color: tokens.colorNeutralForeground3 }}
        >
          <Text size={400}>{noServicesLabel}</Text>
        </div>
      ) : (
        <div
          className="grid gap-6"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
        >
          {services.map((service) => (
            <ServiceCard
              key={service.code}
              code={service.code}
              title={locale === 'ar' ? service.titleAr : service.title}
              description={locale === 'ar' ? service.descriptionAr : service.description}
              category={service.category}
              imageUrl={service.heroImageUrl}
              locale={locale}
              viewDetailsLabel={viewDetailsLabel}
            />
          ))}
        </div>
      )}
    </section>
  );
}
