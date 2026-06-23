import React from 'react';
import { notFound } from 'next/navigation';
import { Text, Card, CardHeader, makeStyles, tokens } from '@fluentui/react-components';
import { serverGet } from '../../../../../lib/api-client';
import { RequestStatusBadge } from '../../../../../components/requests/RequestStatusBadge';
import { StatusTimeline } from '../../../../../components/requests/StatusTimeline';

interface TimelineEntry {
  id: string;
  status: string;
  changedBy: string;
  changedOn: string;
  note: string | null;
}

interface RequestDetail {
  id: string;
  referenceNumber: string;
  serviceTitle: string;
  serviceTitleAr: string;
  status: string;
  submittedOn: string;
  lastUpdated: string;
  notes: string | null;
  timeline: TimelineEntry[];
}

interface RequestDetailPageProps {
  params: Promise<{ locale: string; id: string }>;
}

function formatDate(dateString: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-QA' : 'en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString));
}

export default async function RequestDetailPage({ params }: RequestDetailPageProps) {
  const { locale, id } = await params;

  let request: RequestDetail | null = null;
  try {
    request = await serverGet<RequestDetail>(`/api/services/my-requests/${id}`);
  } catch {
    notFound();
  }

  if (!request) notFound();

  const title = locale === 'ar' ? request.serviceTitleAr : request.serviceTitle;
  const backLabel = locale === 'ar' ? 'العودة إلى طلباتي' : 'Back to My Requests';
  const detailsLabel = locale === 'ar' ? 'تفاصيل الطلب' : 'Request Details';
  const timelineLabel = locale === 'ar' ? 'سجل الحالة' : 'Status Timeline';
  const refLabel = locale === 'ar' ? 'الرقم المرجعي' : 'Reference Number';
  const submittedLabel = locale === 'ar' ? 'تاريخ التقديم' : 'Submitted On';
  const updatedLabel = locale === 'ar' ? 'آخر تحديث' : 'Last Updated';
  const notesLabel = locale === 'ar' ? 'الملاحظات' : 'Notes';

  return (
    <section aria-labelledby="request-title">
      {/* Back link */}
      <a
        href={`/${locale}/my-requests`}
        className="inline-flex items-center gap-2 mb-6 no-underline"
        style={{ color: tokens.colorBrandForeground1 }}
      >
        ← {backLabel}
      </a>

      {/* Header */}
      <div className="flex items-center gap-4 mb-8 flex-wrap">
        <h1 id="request-title" className="text-2xl font-semibold">
          {title}
        </h1>
        <RequestStatusBadge
          status={request.status as Parameters<typeof RequestStatusBadge>[0]['status']}
          locale={locale}
        />
      </div>

      <div className="grid gap-6" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {/* Details card */}
        <Card appearance="outline">
          <CardHeader header={<Text weight="semibold" size={400}>{detailsLabel}</Text>} />
          <div className="flex flex-col gap-3 pb-4">
            <div className="flex flex-col gap-1">
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>{refLabel}</Text>
              <Text size={300} weight="semibold">{request.referenceNumber}</Text>
            </div>
            <div className="flex flex-col gap-1">
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>{submittedLabel}</Text>
              <Text size={300}>{formatDate(request.submittedOn, locale)}</Text>
            </div>
            <div className="flex flex-col gap-1">
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>{updatedLabel}</Text>
              <Text size={300}>{formatDate(request.lastUpdated, locale)}</Text>
            </div>
            {request.notes && (
              <div className="flex flex-col gap-1">
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>{notesLabel}</Text>
                <Text size={300}>{request.notes}</Text>
              </div>
            )}
          </div>
        </Card>

        {/* Status timeline */}
        <Card appearance="outline">
          <CardHeader header={<Text weight="semibold" size={400}>{timelineLabel}</Text>} />
          <div className="pb-4">
            <StatusTimeline
              entries={request.timeline}
              locale={locale}
              noHistoryLabel={locale === 'ar' ? 'لا يوجد سجل حالة' : 'No status history available'}
            />
          </div>
        </Card>
      </div>
    </section>
  );
}
