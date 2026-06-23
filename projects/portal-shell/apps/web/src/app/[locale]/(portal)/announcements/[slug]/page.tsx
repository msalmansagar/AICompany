import React from 'react';
import { notFound } from 'next/navigation';
import { Text, Badge, tokens } from '@fluentui/react-components';
import { CalendarRegular, PersonRegular } from '@fluentui/react-icons';
import { serverGet } from '../../../../../lib/api-client';
import { RichTextDisplay } from '../../../../../components/cms/RichTextDisplay';
import type { CmsContent } from '@portal/types';
import type { Metadata } from 'next';

interface AnnouncementDetailPageProps {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateMetadata({ params }: AnnouncementDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const content = await serverGet<CmsContent>(`/api/cms/${slug}`);
    return {
      title: content.title,
      description: content.metaDescription || content.excerpt,
    };
  } catch {
    return { title: 'Announcement' };
  }
}

function formatDate(dateString: string | null, locale: string): string {
  if (!dateString) return '';
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-QA' : 'en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(dateString));
}

export default async function AnnouncementDetailPage({ params }: AnnouncementDetailPageProps) {
  const { locale, slug } = await params;

  let content: CmsContent;
  try {
    content = await serverGet<CmsContent>(`/api/cms/${slug}`);
  } catch {
    notFound();
  }

  const localTitle = locale === 'ar' ? content.titleAr : content.title;
  const localBody = locale === 'ar' ? content.bodyHtmlAr : content.bodyHtml;
  const publishedDate = formatDate(content.publishedOn, locale);

  const announcementsLabel = locale === 'ar' ? 'الإعلانات' : 'Announcements';
  const backLabel = locale === 'ar' ? 'العودة إلى الإعلانات' : 'Back to Announcements';

  return (
    <article aria-labelledby="announcement-heading" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 mb-4 text-sm">
        <a href={`/${locale}`} className="text-blue-600 hover:underline no-underline">
          {locale === 'ar' ? 'الرئيسية' : 'Home'}
        </a>
        <span style={{ color: tokens.colorNeutralForeground3 }}>/</span>
        <a href={`/${locale}/announcements`} className="text-blue-600 hover:underline no-underline">
          {announcementsLabel}
        </a>
        <span style={{ color: tokens.colorNeutralForeground3 }}>/</span>
        <span style={{ color: tokens.colorNeutralForeground2 }}>{localTitle}</span>
      </nav>

      <div style={{ maxWidth: '760px' }}>
        <h1
          id="announcement-heading"
          className="text-3xl font-semibold mb-4"
        >
          {localTitle}
        </h1>

        <div
          className="flex items-center gap-4 flex-wrap mb-4"
          style={{ color: tokens.colorNeutralForeground3 }}
        >
          <div className="flex items-center gap-1">
            <PersonRegular fontSize={16} />
            <Text size={300}>{content.authorName}</Text>
          </div>
          {publishedDate && (
            <div className="flex items-center gap-1">
              <CalendarRegular fontSize={16} />
              <Text size={300}>{publishedDate}</Text>
            </div>
          )}
        </div>

        {content.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {content.tags.map((tag) => (
              <Badge key={tag} appearance="outline" size="medium">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <RichTextDisplay
          html={localBody}
          dir={locale === 'ar' ? 'rtl' : 'ltr'}
        />

        <div
          className="mt-8 pt-6"
          style={{ borderBlockStart: `1px solid ${tokens.colorNeutralStroke2}` }}
        >
          <a
            href={`/${locale}/announcements`}
            className="text-blue-600 hover:underline no-underline"
            aria-label={backLabel}
          >
            ← {backLabel}
          </a>
        </div>
      </div>
    </article>
  );
}
