import React from 'react';
import { Text, makeStyles, tokens } from '@fluentui/react-components';
import { DocumentRegular } from '@fluentui/react-icons';
import { serverGet } from '../../../../lib/api-client';
import { RequestStatusBadge } from '../../../../components/requests/RequestStatusBadge';

interface UserRequest {
  id: string;
  referenceNumber: string;
  serviceTitle: string;
  serviceTitleAr: string;
  status: string;
  submittedOn: string;
  lastUpdated: string;
}

interface MyRequestsPageProps {
  params: Promise<{ locale: string }>;
}

export const metadata = { title: 'My Requests' };

function formatDate(dateString: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-QA' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(dateString));
}

export default async function MyRequestsPage({ params }: MyRequestsPageProps) {
  const { locale } = await params;

  let requests: UserRequest[] = [];
  try {
    const data = await serverGet<{ items: UserRequest[] }>('/api/services/my-requests');
    requests = data.items;
  } catch {
    // Non-fatal — show empty state
  }

  const title = locale === 'ar' ? 'طلباتي' : 'My Requests';
  const noRequestsLabel = locale === 'ar' ? 'لا توجد طلبات حتى الآن' : 'No requests yet';
  const noRequestsSubtitle = locale === 'ar'
    ? 'ستظهر طلبات الخدمة المقدمة هنا'
    : 'Your submitted service applications will appear here';
  const refLabel = locale === 'ar' ? 'الرقم المرجعي' : 'Reference';
  const submittedLabel = locale === 'ar' ? 'تاريخ التقديم' : 'Submitted';
  const updatedLabel = locale === 'ar' ? 'آخر تحديث' : 'Last Updated';
  const viewLabel = locale === 'ar' ? 'عرض التفاصيل' : 'View Details';

  return (
    <section aria-labelledby="requests-heading">
      <h1 id="requests-heading" className="text-2xl font-semibold mb-6">
        {title}
      </h1>

      {requests.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-4 min-h-64"
          style={{ color: tokens.colorNeutralForeground3 }}
        >
          <DocumentRegular fontSize={48} />
          <Text size={400} weight="semibold">{noRequestsLabel}</Text>
          <Text size={300}>{noRequestsSubtitle}</Text>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {requests.map((request) => (
            <a
              key={request.id}
              href={`/${locale}/my-requests/${request.id}`}
              className="block no-underline"
              aria-label={`View request ${request.referenceNumber}`}
            >
              <div
                className="p-4 rounded-lg border flex items-center justify-between gap-4 flex-wrap"
                style={{
                  backgroundColor: tokens.colorNeutralBackground1,
                  borderColor: tokens.colorNeutralStroke2,
                }}
              >
                <div className="flex flex-col gap-1">
                  <Text weight="semibold" size={400}>
                    {locale === 'ar' ? request.serviceTitleAr : request.serviceTitle}
                  </Text>
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    {refLabel}: {request.referenceNumber}
                  </Text>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex flex-col gap-1 text-end">
                    <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
                      {submittedLabel}: {formatDate(request.submittedOn, locale)}
                    </Text>
                    <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
                      {updatedLabel}: {formatDate(request.lastUpdated, locale)}
                    </Text>
                  </div>
                  <RequestStatusBadge
                    status={request.status as Parameters<typeof RequestStatusBadge>[0]['status']}
                    locale={locale}
                  />
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
