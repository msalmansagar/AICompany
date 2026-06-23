'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardHeader,
  CardPreview,
  Text,
  Skeleton,
  SkeletonItem,
  Badge,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  MegaphoneRegular,
  DismissCircleRegular,
} from '@fluentui/react-icons';
import type { WidgetComponentProps } from '../types';

interface Announcement {
  id: string;
  title: string;
  body: string;
  heroImageUrl: string | null;
  publishedAt: string;
  slug: string;
}

interface AnnouncementsConfig {
  maxItems: number;
}

const useStyles = makeStyles({
  card: {
    height: '100%',
    minHeight: '200px',
  },
  heroImage: {
    width: '100%',
    height: '140px',
    objectFit: 'cover',
  },
  content: {
    paddingBlock: tokens.spacingVerticalM,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  announcementItem: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    paddingBlock: tokens.spacingVerticalS,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    ':last-child': {
      borderBottom: 'none',
    },
  },
  icon: {
    color: tokens.colorBrandForeground1,
    flexShrink: 0,
    marginBlockStart: '2px',
  },
  announcementContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: 0,
  },
  announcementTitle: {
    fontWeight: tokens.fontWeightSemibold,
  },
  announcementBody: {
    color: tokens.colorNeutralForeground2,
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
    overflow: 'hidden',
  },
  date: {
    color: tokens.colorNeutralForeground3,
  },
  errorContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    color: tokens.colorPaletteRedForeground1,
    paddingTop: tokens.spacingVerticalM,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    gap: tokens.spacingVerticalS,
    paddingBlock: tokens.spacingVerticalXXL,
    color: tokens.colorNeutralForeground3,
  },
});

function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(dateString));
}

async function fetchAnnouncements(maxItems: number): Promise<Announcement[]> {
  const response = await fetch(`/api/cms?type=announcement&status=published&limit=${maxItems}`);
  if (!response.ok) {
    throw new Error('Failed to fetch announcements');
  }
  const data = (await response.json()) as { items: Announcement[] };
  return data.items;
}

export function AnnouncementsWidget({
  instanceId,
  title,
  config,
}: WidgetComponentProps<AnnouncementsConfig>) {
  const styles = useStyles();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['widget', 'announcements', instanceId, config.maxItems],
    queryFn: () => fetchAnnouncements(config.maxItems),
    staleTime: 120_000,
  });

  const firstAnnouncement = data?.[0];

  return (
    <Card className={styles.card} appearance="filled-alternative">
      <CardHeader header={<Text weight="semibold">{title}</Text>} />

      {isLoading && (
        <Skeleton>
          <SkeletonItem shape="rectangle" style={{ height: 120, marginBottom: 8 }} />
          <SkeletonItem shape="rectangle" style={{ height: 48 }} />
        </Skeleton>
      )}

      {isError && (
        <div className={styles.errorContainer}>
          <DismissCircleRegular />
          <Text size={200}>Failed to load announcements</Text>
        </div>
      )}

      {data && data.length === 0 && (
        <div className={styles.emptyState}>
          <MegaphoneRegular fontSize={32} />
          <Text size={200}>No announcements</Text>
        </div>
      )}

      {firstAnnouncement?.heroImageUrl && (
        <CardPreview>
          <img
            src={firstAnnouncement.heroImageUrl}
            alt={firstAnnouncement.title}
            className={styles.heroImage}
          />
        </CardPreview>
      )}

      {data && data.length > 0 && (
        <div className={styles.content}>
          {data.map((item) => (
            <div key={item.id} className={styles.announcementItem}>
              <MegaphoneRegular className={styles.icon} />
              <div className={styles.announcementContent}>
                <Text size={300} className={styles.announcementTitle}>
                  {item.title}
                </Text>
                <Text size={200} className={styles.announcementBody}>
                  {item.body}
                </Text>
                <Text size={100} className={styles.date}>
                  {formatDate(item.publishedAt)}
                </Text>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
