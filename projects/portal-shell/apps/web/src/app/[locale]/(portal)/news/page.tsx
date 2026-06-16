import React from 'react';
import { Text, makeStyles, tokens } from '@fluentui/react-components';
import { serverGet } from '../../../../lib/api-client';
import { CmsCard } from '../../../../components/cms/CmsCard';
import type { CmsSummary } from '@portal/types';
import type { Metadata } from 'next';

interface NewsPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}

export const metadata: Metadata = { title: 'News' };

const useStyles = makeStyles({
  grid: {
    display: 'grid',
    gap: tokens.spacingHorizontalL,
  },
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    gap: tokens.spacingHorizontalS,
    marginBlockStart: tokens.spacingVerticalXL,
  },
});

interface NewsListResponse {
  items: CmsSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export default async function NewsPage({ params, searchParams }: NewsPageProps) {
  const { locale } = await params;
  const { page: pageParam } = await searchParams;
  const currentPage = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);

  let result: NewsListResponse = { items: [], total: 0, page: 1, pageSize: 12 };
  try {
    result = await serverGet<NewsListResponse>(
      `/api/cms?type=news&page=${currentPage}`,
    );
  } catch {
    // Non-fatal — show empty state
  }

  const title = locale === 'ar' ? 'الأخبار' : 'News';
  const emptyLabel = locale === 'ar' ? 'لا توجد أخبار متاحة حالياً' : 'No news available at this time';

  const totalPages = result.total > 0 ? Math.ceil(result.total / result.pageSize) : 1;

  return (
    <section aria-labelledby="news-heading">
      <h1
        id="news-heading"
        className="text-2xl font-semibold mb-6"
      >
        {title}
      </h1>

      {result.items.length === 0 ? (
        <div
          className="flex items-center justify-center min-h-48"
          style={{ color: tokens.colorNeutralForeground3 }}
        >
          <Text size={400}>{emptyLabel}</Text>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: tokens.spacingHorizontalL,
          }}
        >
          {result.items.map((item) => (
            <CmsCard key={item.id} item={item} locale={locale} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav
          aria-label={locale === 'ar' ? 'التنقل بين الصفحات' : 'Pagination'}
          className="flex justify-center gap-2 mt-10"
        >
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <a
              key={p}
              href={`/${locale}/news?page=${p}`}
              aria-label={locale === 'ar' ? `الصفحة ${p}` : `Page ${p}`}
              aria-current={p === currentPage ? 'page' : undefined}
              className="px-3 py-1 rounded border text-sm"
              style={{
                backgroundColor:
                  p === currentPage
                    ? tokens.colorBrandBackground
                    : tokens.colorNeutralBackground1,
                color:
                  p === currentPage
                    ? tokens.colorNeutralForegroundOnBrand
                    : tokens.colorNeutralForeground1,
                borderColor: tokens.colorNeutralStroke1,
                textDecoration: 'none',
              }}
            >
              {p}
            </a>
          ))}
        </nav>
      )}
    </section>
  );
}
