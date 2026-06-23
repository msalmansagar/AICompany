import React from 'react';
import { notFound } from 'next/navigation';
import { Text, Badge, Button, makeStyles, tokens } from '@fluentui/react-components';
import { ArrowRightRegular } from '@fluentui/react-icons';
import { serverGet } from '../../../../../lib/api-client';
import { ServiceTabStrip } from '../../../../../components/services/ServiceTabStrip';

interface ServiceTab {
  id: string;
  label: string;
  labelAr: string;
  content: string;
  contentAr: string;
}

interface ServiceDetail {
  code: string;
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  category: string;
  heroImageUrl: string | null;
  formCode: string | null;
  tabs: ServiceTab[];
}

interface ServiceDetailPageProps {
  params: Promise<{ locale: string; code: string }>;
}

export default async function ServiceDetailPage({ params }: ServiceDetailPageProps) {
  const { locale, code } = await params;

  let service: ServiceDetail | null = null;
  try {
    service = await serverGet<ServiceDetail>(`/api/services/${code}`);
  } catch {
    notFound();
  }

  if (!service) notFound();

  const title = locale === 'ar' ? service.titleAr : service.title;
  const description = locale === 'ar' ? service.descriptionAr : service.description;
  const applyLabel = locale === 'ar' ? 'تقدم الآن' : 'Apply Now';

  return (
    <article aria-labelledby="service-title">
      {/* Hero section — matches Reyada portal layout */}
      <div
        className="flex gap-8 mb-8 flex-col md:flex-row"
        style={{ alignItems: 'flex-start' }}
      >
        {/* Left: Hero image */}
        {service.heroImageUrl && (
          <div className="flex-shrink-0">
            <img
              src={service.heroImageUrl}
              alt={`${title} service illustration`}
              className="rounded-lg object-cover"
              style={{ width: '100%', maxWidth: '400px', height: '260px', objectFit: 'cover' }}
            />
          </div>
        )}

        {/* Right: Meta + CTA */}
        <div className="flex flex-col gap-4 flex-1">
          <Badge appearance="tint" color="brand" size="medium">
            {service.category}
          </Badge>
          <h1
            id="service-title"
            className="text-3xl font-semibold"
            style={{ color: tokens.colorNeutralForeground1 }}
          >
            {title}
          </h1>
          <Text size={400} style={{ color: tokens.colorNeutralForeground2, lineHeight: '1.6' }}>
            {description}
          </Text>
          {service.formCode && (
            <div className="flex gap-4 flex-wrap">
              <a href={`/${locale}/forms/${service.formCode}`}>
                <Button appearance="primary" size="large" icon={<ArrowRightRegular />} iconPosition="after">
                  {applyLabel}
                </Button>
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Tab strip with configurable content sections */}
      {service.tabs.length > 0 && (
        <ServiceTabStrip tabs={service.tabs} locale={locale} />
      )}
    </article>
  );
}
