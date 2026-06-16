import React from 'react';
import {
  Card,
  CardHeader,
  CardPreview,
  CardFooter,
  Text,
  Badge,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { CalendarRegular, PersonRegular } from '@fluentui/react-icons';
import type { CmsSummary } from '@portal/types';
import { CmsStatusBadge } from './CmsStatusBadge';

interface CmsCardProps {
  item: CmsSummary;
  locale: string;
}

const useStyles = makeStyles({
  card: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    textDecoration: 'none',
    color: 'inherit',
    transition: 'box-shadow 0.15s ease',
    ':hover': {
      boxShadow: tokens.shadow8,
    },
  },
  coverImage: {
    width: '100%',
    aspectRatio: '16 / 9',
    objectFit: 'cover',
    display: 'block',
  },
  coverPlaceholder: {
    width: '100%',
    aspectRatio: '16 / 9',
    backgroundColor: tokens.colorNeutralBackground3,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryRow: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
    marginBlockEnd: tokens.spacingVerticalXS,
  },
  excerpt: {
    color: tokens.colorNeutralForeground2,
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
    overflow: 'hidden',
    flex: 1,
  },
  footer: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    paddingBlockStart: tokens.spacingVerticalS,
    borderBlockStart: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground3,
  },
  tags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalXS,
  },
});

function formatPublishedDate(dateString: string | null, locale: string): string {
  if (!dateString) return '';
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-QA' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(dateString));
}

export function CmsCard({ item, locale }: CmsCardProps) {
  const styles = useStyles();

  const localTitle = locale === 'ar' ? item.titleAr : item.title;
  const localExcerpt = locale === 'ar' ? item.excerptAr : item.excerpt;
  const publishedDate = formatPublishedDate(item.publishedOn, locale);

  return (
    <a
      href={`/${locale}/${item.contentType === 'news' ? 'news' : item.contentType === 'announcement' ? 'announcements' : 'pages'}/${item.slug}`}
      className={styles.card}
      aria-label={localTitle}
    >
      <Card appearance="outline" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <CardPreview>
          {item.coverImageUrl ? (
            <img
              src={item.coverImageUrl}
              alt={localTitle}
              className={styles.coverImage}
            />
          ) : (
            <div className={styles.coverPlaceholder}>
              <Text size={200} style={{ color: tokens.colorNeutralForeground4 }}>
                {localTitle.slice(0, 1)}
              </Text>
            </div>
          )}
        </CardPreview>

        <CardHeader
          header={
            <div>
              <div className={styles.categoryRow}>
                <Badge appearance="tint" color="brand">
                  {item.contentType}
                </Badge>
                <CmsStatusBadge status={item.status} />
              </div>
              <Text weight="semibold" size={400} block>
                {localTitle}
              </Text>
            </div>
          }
        />

        <Text size={300} className={styles.excerpt}>
          {localExcerpt}
        </Text>

        {item.tags.length > 0 && (
          <div className={styles.tags}>
            {item.tags.map((tag) => (
              <Badge key={tag} appearance="outline" size="small">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <CardFooter>
          <div className={styles.footer}>
            <div className={styles.metaRow}>
              <PersonRegular fontSize={14} />
              <Text size={200}>{item.authorName}</Text>
            </div>
            {publishedDate && (
              <div className={styles.metaRow}>
                <CalendarRegular fontSize={14} />
                <Text size={200}>{publishedDate}</Text>
              </div>
            )}
          </div>
        </CardFooter>
      </Card>
    </a>
  );
}
