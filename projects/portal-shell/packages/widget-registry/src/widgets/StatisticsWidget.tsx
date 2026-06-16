'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardHeader,
  Text,
  Skeleton,
  SkeletonItem,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { DismissCircleRegular, DataPieRegular } from '@fluentui/react-icons';
import type { WidgetComponentProps } from '../types';

interface StatisticKpi {
  key: string;
  label: string;
  labelAr: string;
  /** OData endpoint path relative to /api — e.g. "widgets/statistics?metric=total-users" */
  apiPath: string;
  /** Optional unit suffix, e.g. "%" */
  unit: string;
  /** Color token name from Fluent UI palette */
  color: 'brand' | 'success' | 'warning' | 'danger' | 'neutral';
}

interface StatisticsConfig {
  kpis: StatisticKpi[];
}

interface KpiValue {
  key: string;
  value: number | string;
}

const COLOR_MAP: Record<StatisticKpi['color'], string> = {
  brand: tokens.colorBrandForeground1,
  success: tokens.colorPaletteGreenForeground1,
  warning: tokens.colorPaletteYellowForeground2,
  danger: tokens.colorPaletteRedForeground1,
  neutral: tokens.colorNeutralForeground1,
};

const useStyles = makeStyles({
  card: {
    height: '100%',
    minHeight: '160px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
    gap: tokens.spacingHorizontalM,
    paddingTop: tokens.spacingVerticalM,
  },
  kpiItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalXS,
    padding: tokens.spacingVerticalM,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    textAlign: 'center',
  },
  kpiValue: {
    fontSize: tokens.fontSizeHero700,
    fontWeight: tokens.fontWeightBold,
    lineHeight: 1,
  },
  kpiLabel: {
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
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

async function fetchKpiValues(apiPaths: string[]): Promise<KpiValue[]> {
  const results = await Promise.all(
    apiPaths.map(async (path) => {
      const response = await fetch(`/api/${path}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch KPI: ${path}`);
      }
      return response.json() as Promise<KpiValue>;
    })
  );
  return results;
}

export function StatisticsWidget({
  instanceId,
  title,
  config,
  locale,
}: WidgetComponentProps<StatisticsConfig>) {
  const styles = useStyles();

  const apiPaths = config.kpis.map((kpi) => kpi.apiPath);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['widget', 'statistics', instanceId, apiPaths],
    queryFn: () => fetchKpiValues(apiPaths),
    staleTime: 300_000,
    enabled: config.kpis.length > 0,
  });

  const kpiValueMap = new Map<string, string | number>(
    (data ?? []).map((kv) => [kv.key, kv.value])
  );

  return (
    <Card className={styles.card} appearance="filled-alternative">
      <CardHeader header={<Text weight="semibold">{title}</Text>} />

      {isLoading && (
        <Skeleton>
          <div className={styles.grid}>
            {config.kpis.map((kpi) => (
              <SkeletonItem key={kpi.key} shape="rectangle" style={{ height: 88 }} />
            ))}
          </div>
        </Skeleton>
      )}

      {isError && (
        <div className={styles.errorContainer}>
          <DismissCircleRegular />
          <Text size={200}>Failed to load statistics</Text>
        </div>
      )}

      {config.kpis.length === 0 && (
        <div className={styles.emptyState}>
          <DataPieRegular fontSize={32} />
          <Text size={200}>No KPIs configured</Text>
        </div>
      )}

      {!isLoading && !isError && config.kpis.length > 0 && (
        <div className={styles.grid}>
          {config.kpis.map((kpi) => {
            const rawValue = kpiValueMap.get(kpi.key);
            const displayValue = rawValue !== undefined ? `${rawValue}${kpi.unit}` : '—';
            const color = COLOR_MAP[kpi.color];
            return (
              <div key={kpi.key} className={styles.kpiItem}>
                <Text className={styles.kpiValue} style={{ color }}>
                  {displayValue}
                </Text>
                <Text className={styles.kpiLabel}>
                  {locale === 'ar' ? kpi.labelAr : kpi.label}
                </Text>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
