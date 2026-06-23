import React from 'react';
import { Text, Badge, makeStyles, tokens } from '@fluentui/react-components';
import { CalendarRegular, ArrowRightRegular } from '@fluentui/react-icons';
import { serverGet } from '../../../../lib/api-client';
import type { CmsSummary } from '@portal/types';
import type { Metadata } from 'next';

interface AnnouncementsPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}

export const metadata: Metadata = { title: 'Announcements' };

interface AnnouncementsListResponse {
  items: CmsSummary[];
  total: number;
  page: number;
  pageSize: number;
}

const useStyles = makeStyles({
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  item: {
    paddingBlock: tokens.spacingVerticalL,
    paddingInline: tokens.spacingHorizontalL,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    textDecoration: 'none',
    color: 'inherit',
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    transition: 'box-shadow 0.15s ease',
    ':hover': { boxShadow: tokens.shadow4 },
  },
  itemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  dateRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground3,
  },
  readMore: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorBrandForeground1,
    marginBlockStart: tokens.spacingVerticalXS,
    textDecoration: 'none',
  },
});

function formatDate(dateString: string | null, locale: string): string {
  if (!dateString) return '';
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-QA' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(dateString));
}

export default async function AnnouncementsPage({ params, searchParams }: AnnouncementsPageProps) {
  const { locale } = await params;
  const { page: pageParam } = await searchParams;
  const currentPage = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);

  let result: AnnouncementsListResponse = { items: [], total: 0, page: 1, pageSize: 20 };
  try {
    result = await serverGet<AnnouncementsListResponse>(
      `/api/cms?type=announcement&page=${currentPage}`,
    );
  } catch {
    // Non-fatal — show empty state
  }

  const title = locale === 'ar' ? 'الإعلانات' : 'Announcements';
  const emptyLabel = locale === 'ar' ? 'لا توجد إعلانات متاحة حالياً' : 'No announcements at this time';
  const readMoreLabel = locale === 'ar' ? 'اقرأ المزيد' : 'Read more';

  const totalPages = result.total > 0 ? Math.ceil(result.total / result.pageSize) : 1;

  return (
    <section aria-labelledby="announcements-heading">
      <h1
        id="announcements-heading"
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM }}>
          {result.items.map((item) => {
            const localTitle = locale === 'ar' ? item.titleAr : item.title;
            const localExcerpt = locale === 'ar' ? item.excerptAr : item.excerpt;
            const publishedDate = formatDate(item.publishedOn, locale);

            return (
              <div
                key={item.id}
                style={{
                  paddingBlock: tokens.spacingVerticalL,
                  paddingInline: tokens.spacingHorizontalL,
                  borderRadius: tokens.borderRadiusMedium,
                  border: `1px solid ${tokens.colorNeutralStroke2}`,
                  backgroundColor: tokens.colorNeutralBackground1,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: tokens.spacingHorizontalM,
                    flexWrap: 'wrap',
                    marginBlockEnd: tokens.spacingVerticalXS,
                  }}
                >
                  <Text weight="semibold" size={400}>
                    {localTitle}
                  </Text>
                  {publishedDate && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: tokens.spacingHorizontalXS,
                        color: tokens.colorNeutralForeground3,
                      }}
                    >
                      <CalendarRegular fontSize={14} />
                      <Text size={200}>{publishedDate}</Text>
                    </div>
                  )}
                </div>

                {item.tags.length > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: tokens.spacingHorizontalXS,
                      marginBlockEnd: tokens.spacingVerticalXS,
                    }}
                  >
                    {item.tags.map((tag) => (
                      <Badge key={tag} appearance="outline" size="small">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}

                {localExcerpt && (
                  <Text
                    size={300}
                    block
                    style={{
                      color: tokens.colorNeutralForeground2,
                      marginBlockEnd: tokens.spacingVerticalS,
                    }}
                  >
                    {localExcerpt}
                  </Text>
                )}

                <a
                  href={`/${locale}/announcements/${item.slug}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: tokens.spacingHorizontalXS,
                    color: tokens.colorBrandForeground1,
                    textDecoration: 'none',
                  }}
                  aria-label={`${readMoreLabel} — ${localTitle}`}
                >
                  <Text size={300} weight="semibold">{readMoreLabel}</Text>
                  <ArrowRightRegular fontSize={16} />
                </a>
              </div>
            );
          })}
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
              href={`/${locale}/announcements?page=${p}`}
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
