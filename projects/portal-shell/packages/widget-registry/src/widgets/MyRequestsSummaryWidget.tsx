'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardHeader,
  Text,
  Skeleton,
  SkeletonItem,
  Badge,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  DocumentRegular,
  CheckmarkCircleRegular,
  DismissCircleRegular,
  ClockRegular,
  ErrorCircleRegular,
} from '@fluentui/react-icons';
import type { WidgetComponentProps } from '../types';

interface RequestSummary {
  submitted: number;
  underReview: number;
  approved: number;
  rejected: number;
  pendingDocs: number;
}

interface MyRequestsSummaryConfig {
  showRejected: boolean;
}

const useStyles = makeStyles({
  card: {
    height: '100%',
    minHeight: '160px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))',
    gap: tokens.spacingHorizontalM,
    paddingTop: tokens.spacingVerticalM,
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalXS,
    padding: tokens.spacingVerticalS,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  statCount: {
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
  },
  statLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    textAlign: 'center',
  },
  errorContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    color: tokens.colorPaletteRedForeground1,
    paddingTop: tokens.spacingVerticalM,
  },
});

async function fetchRequestSummary(): Promise<RequestSummary> {
  const response = await fetch('/api/requests?summary=true');
  if (!response.ok) {
    throw new Error('Failed to fetch request summary');
  }
  const data = (await response.json()) as { summary: RequestSummary };
  return data.summary;
}

export function MyRequestsSummaryWidget({
  instanceId,
  title,
  config,
}: WidgetComponentProps<MyRequestsSummaryConfig>) {
  const styles = useStyles();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['widget', 'my-requests-summary', instanceId],
    queryFn: fetchRequestSummary,
    staleTime: 60_000,
  });

  const stats = [
    { label: 'Submitted', count: data?.submitted ?? 0, icon: <DocumentRegular /> },
    { label: 'Under Review', count: data?.underReview ?? 0, icon: <ClockRegular /> },
    { label: 'Approved', count: data?.approved ?? 0, icon: <CheckmarkCircleRegular /> },
    { label: 'Pending Docs', count: data?.pendingDocs ?? 0, icon: <ErrorCircleRegular /> },
    ...(config.showRejected
      ? [{ label: 'Rejected', count: data?.rejected ?? 0, icon: <DismissCircleRegular /> }]
      : []),
  ];

  return (
    <Card className={styles.card} appearance="filled-alternative">
      <CardHeader header={<Text weight="semibold">{title}</Text>} />

      {isLoading && (
        <Skeleton>
          <div className={styles.grid}>
            {[1, 2, 3, 4].map((i) => (
              <SkeletonItem key={i} shape="rectangle" style={{ height: 80 }} />
            ))}
          </div>
        </Skeleton>
      )}

      {isError && (
        <div className={styles.errorContainer}>
          <DismissCircleRegular />
          <Text size={200}>Failed to load request summary</Text>
        </div>
      )}

      {data && (
        <div className={styles.grid}>
          {stats.map((stat) => (
            <div key={stat.label} className={styles.statItem}>
              {stat.icon}
              <Text className={styles.statCount}>{stat.count}</Text>
              <Text className={styles.statLabel}>{stat.label}</Text>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
