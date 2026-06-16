import React from 'react';
import { notFound } from 'next/navigation';
import { tokens } from '@fluentui/react-components';
import { serverGet } from '../../../../../lib/api-client';
import { RichTextDisplay } from '../../../../../components/cms/RichTextDisplay';
import type { CmsContent } from '@portal/types';
import type { Metadata } from 'next';

interface CmsPageProps {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateMetadata({ params }: CmsPageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const content = await serverGet<CmsContent>(`/api/cms/${slug}`);
    return {
      title: content.title,
      description: content.metaDescription || content.excerpt,
    };
  } catch {
    return { title: 'Page' };
  }
}

export default async function CmsStaticPage({ params }: CmsPageProps) {
  const { locale, slug } = await params;

  let content: CmsContent;
  try {
    content = await serverGet<CmsContent>(`/api/cms/${slug}`);
  } catch {
    notFound();
  }

  const localTitle = locale === 'ar' ? content.titleAr : content.title;
  const localBody = locale === 'ar' ? content.bodyHtmlAr : content.bodyHtml;

  return (
    <article
      aria-labelledby="page-heading"
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      style={{ maxWidth: '760px', margin: '0 auto' }}
    >
      <h1
        id="page-heading"
        className="text-3xl font-semibold mb-8"
      >
        {localTitle}
      </h1>

      <RichTextDisplay
        html={localBody}
        dir={locale === 'ar' ? 'rtl' : 'ltr'}
      />
    </article>
  );
}
