'use client';

import React from 'react';
import { Text, makeStyles, tokens } from '@fluentui/react-components';
import { resolveWidget } from '@portal/widget-registry';
import type { WidgetInstance } from '@portal/widget-registry';
import { WidgetWrapper } from './WidgetWrapper';

interface WidgetGridProps {
  widgetInstances: WidgetInstance[];
  locale: string;
  emptyLabel?: string;
  emptySubtitle?: string;
}

const useStyles = makeStyles({
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: tokens.spacingHorizontalL,
    alignItems: 'start',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingVerticalM,
    minHeight: '300px',
    color: tokens.colorNeutralForeground3,
    textAlign: 'center',
  },
});

export function WidgetGrid({
  widgetInstances,
  locale,
  emptyLabel = 'No widgets configured',
  emptySubtitle = 'Contact your administrator to set up your dashboard',
}: WidgetGridProps) {
  const styles = useStyles();

  const visibleInstances = widgetInstances
    .filter((w) => w.isVisible)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  if (visibleInstances.length === 0) {
    return (
      <div className={styles.emptyState}>
        <Text size={400} weight="semibold">{emptyLabel}</Text>
        <Text size={300}>{emptySubtitle}</Text>
      </div>
    );
  }

  return (
    <div className={styles.grid}>
      {visibleInstances.map((instance) => {
        const definition = resolveWidget(instance.widgetType);

        if (!definition) {
          // Widget type not registered — skip silently
          return null;
        }

        const validationResult = definition.configSchema.safeParse(instance.configJson);
        const config = validationResult.success
          ? validationResult.data
          : definition.defaultConfig;

        const titleEn = definition.title.en;
        const titleAr = definition.title.ar;
        const displayTitle =
          instance.titleOverride ??
          (locale === 'ar' ? (instance.titleOverrideAr ?? titleAr) : titleEn);

        const WidgetComponent = definition.component;
        const columnSpan = Math.min(Math.max(instance.columnSpan, 1), 4);

        return (
          <div
            key={instance.id}
            style={{ gridColumn: `span ${columnSpan}` }}
          >
            <WidgetWrapper title={displayTitle}>
              <WidgetComponent
                instanceId={instance.id}
                title={displayTitle}
                config={config}
                columnSpan={columnSpan}
                locale={locale}
              />
            </WidgetWrapper>
          </div>
        );
      })}
    </div>
  );
}
