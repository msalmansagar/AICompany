'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardHeader,
  Text,
  Skeleton,
  SkeletonItem,
  Divider,
  Badge,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  InfoRegular,
  CheckmarkCircleRegular,
  WarningRegular,
  DismissCircleRegular,
} from '@fluentui/react-icons';
import type { WidgetComponentProps } from '../types';
import type { NotificationType } from '@portal/types';

interface ActivityItem {
  id: string;
  title: string;
  body: string;
  type: NotificationType;
  createdOn: string;
}

interface RecentActivityConfig {
  limit: number;
}

const useStyles = makeStyles({
  card: {
    height: '100%',
    minHeight: '200px',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    paddingTop: tokens.spacingVerticalS,
  },
  item: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalS,
    paddingBlock: tokens.spacingVerticalXS,
  },
  itemContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flex: 1,
    minWidth: 0,
  },
  itemTitle: {
    fontWeight: tokens.fontWeightSemibold,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  itemBody: {
    color: tokens.colorNeutralForeground2,
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
    overflow: 'hidden',
  },
  itemTime: {
    color: tokens.colorNeutralForeground3,
    flexShrink: 0,
    paddingBlockStart: '2px',
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
    justifyContent: 'center',
    alignItems: 'center',
    paddingBlock: tokens.spacingVerticalXXL,
    color: tokens.colorNeutralForeground3,
  },
});

const NOTIFICATION_ICONS: Record<NotificationType, React.ReactElement> = {
  info: <InfoRegular />,
  success: <CheckmarkCircleRegular style={{ color: '#107C10' }} />,
  warning: <WarningRegular style={{ color: '#C19C00' }} />,
  error: <DismissCircleRegular style={{ color: '#C50F1F' }} />,
};

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}

async function fetchRecentActivity(limit: number): Promise<ActivityItem[]> {
  const response = await fetch(`/api/notifications?limit=${limit}`);
  if (!response.ok) {
    throw new Error('Failed to fetch recent activity');
  }
  const data = (await response.json()) as { items: ActivityItem[] };
  return data.items;
}

export function RecentActivityWidget({
  instanceId,
  title,
  config,
}: WidgetComponentProps<RecentActivityConfig>) {
  const styles = useStyles();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['widget', 'recent-activity', instanceId, config.limit],
    queryFn: () => fetchRecentActivity(config.limit),
    staleTime: 30_000,
  });

  return (
    <Card className={styles.card} appearance="filled-alternative">
      <CardHeader header={<Text weight="semibold">{title}</Text>} />

      {isLoading && (
        <Skeleton>
          <div className={styles.list}>
            {[1, 2, 3].map((i) => (
              <SkeletonItem key={i} shape="rectangle" style={{ height: 48 }} />
            ))}
          </div>
        </Skeleton>
      )}

      {isError && (
        <div className={styles.errorContainer}>
          <DismissCircleRegular />
          <Text size={200}>Failed to load recent activity</Text>
        </div>
      )}

      {data && data.length === 0 && (
        <div className={styles.emptyState}>
          <Text size={200}>No recent activity</Text>
        </div>
      )}

      {data && data.length > 0 && (
        <div className={styles.list}>
          {data.map((item, index) => (
            <React.Fragment key={item.id}>
              <div className={styles.item}>
                {NOTIFICATION_ICONS[item.type]}
                <div className={styles.itemContent}>
                  <Text size={200} className={styles.itemTitle}>
                    {item.title}
                  </Text>
                  <Text size={100} className={styles.itemBody}>
                    {item.body}
                  </Text>
                </div>
                <Text size={100} className={styles.itemTime}>
                  {formatRelativeTime(item.createdOn)}
                </Text>
              </div>
              {index < data.length - 1 && <Divider />}
            </React.Fragment>
          ))}
        </div>
      )}
    </Card>
  );
}
