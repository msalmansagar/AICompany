import React from 'react';
import { notFound } from 'next/navigation';
import { Text, Badge, makeStyles, tokens } from '@fluentui/react-components';
import { CalendarRegular, PersonRegular } from '@fluentui/react-icons';
import { serverGet } from '../../../../../lib/api-client';
import { RichTextDisplay } from '../../../../../components/cms/RichTextDisplay';
import type { CmsContent } from '@portal/types';
import type { Metadata } from 'next';

interface NewsDetailPageProps {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateMetadata({ params }: NewsDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const content = await serverGet<CmsContent>(`/api/cms/${slug}`);
    return {
      title: content.title,
      description: content.metaDescription || content.excerpt,
    };
  } catch {
    return { title: 'News Article' };
  }
}

const useStyles = makeStyles({
  heroImage: {
    width: '100%',
    maxHeight: '480px',
    objectFit: 'cover',
    borderRadius: tokens.borderRadiusLarge,
    marginBlockEnd: tokens.spacingVerticalXL,
    display: 'block',
  },
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    marginBlockEnd: tokens.spacingVerticalM,
    color: tokens.colorNeutralForeground3,
  },
  breadcrumbLink: {
    color: tokens.colorBrandForeground1,
    textDecoration: 'none',
    ':hover': { textDecoration: 'underline' },
  },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
    marginBlockEnd: tokens.spacingVerticalL,
    color: tokens.colorNeutralForeground3,
  },
  metaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  tags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalXS,
    marginBlockEnd: tokens.spacingVerticalL,
  },
  article: {
    maxWidth: '760px',
  },
});

function formatDate(dateString: string | null, locale: string): string {
  if (!dateString) return '';
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-QA' : 'en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(dateString));
}

export default async function NewsDetailPage({ params }: NewsDetailPageProps) {
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

  const newsLabel = locale === 'ar' ? 'الأخبار' : 'News';
  const backLabel = locale === 'ar' ? 'العودة إلى الأخبار' : 'Back to News';

  return (
    <article aria-labelledby="article-heading" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      {content.coverImageUrl && (
        <img
          src={content.coverImageUrl}
          alt={localTitle}
          className="w-full max-h-96 object-cover rounded-lg mb-8 block"
        />
      )}

      <nav aria-label="Breadcrumb" className="flex items-center gap-1 mb-4 text-sm">
        <a href={`/${locale}`} className="text-blue-600 hover:underline no-underline">
          {locale === 'ar' ? 'الرئيسية' : 'Home'}
        </a>
        <span style={{ color: tokens.colorNeutralForeground3 }}>/</span>
        <a href={`/${locale}/news`} className="text-blue-600 hover:underline no-underline">
          {newsLabel}
        </a>
        <span style={{ color: tokens.colorNeutralForeground3 }}>/</span>
        <span style={{ color: tokens.colorNeutralForeground2 }}>{localTitle}</span>
      </nav>

      <div style={{ maxWidth: '760px' }}>
        <h1
          id="article-heading"
          className="text-3xl font-semibold mb-4"
        >
          {localTitle}
        </h1>

        <div className="flex items-center gap-4 flex-wrap mb-4" style={{ color: tokens.colorNeutralForeground3 }}>
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

        <div className="mt-8 pt-6" style={{ borderBlockStart: `1px solid ${tokens.colorNeutralStroke2}` }}>
          <a
            href={`/${locale}/news`}
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
