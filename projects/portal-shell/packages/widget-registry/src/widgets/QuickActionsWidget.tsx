'use client';

import React from 'react';
import {
  Card,
  CardHeader,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  AddCircleRegular,
  DocumentRegular,
  PersonRegular,
  SearchRegular,
  QuestionCircleRegular,
} from '@fluentui/react-icons';
import type { WidgetComponentProps } from '../types';

interface QuickAction {
  id: string;
  label: string;
  labelAr: string;
  url: string;
  /** Fluent icon name — mapped to a component in ICON_MAP */
  icon: string;
}

interface QuickActionsConfig {
  actions: QuickAction[];
  columns: 2 | 3 | 4;
}

const ICON_MAP: Record<string, React.ReactElement> = {
  AddCircleRegular: <AddCircleRegular />,
  DocumentRegular: <DocumentRegular />,
  PersonRegular: <PersonRegular />,
  SearchRegular: <SearchRegular />,
  QuestionCircleRegular: <QuestionCircleRegular />,
};

function resolveIcon(iconName: string): React.ReactElement {
  return ICON_MAP[iconName] ?? <DocumentRegular />;
}

const useStyles = makeStyles({
  card: {
    height: '100%',
    minHeight: '160px',
  },
  grid: {
    display: 'grid',
    gap: tokens.spacingHorizontalM,
    paddingTop: tokens.spacingVerticalM,
  },
  actionButton: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalXS,
    padding: tokens.spacingVerticalM,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    cursor: 'pointer',
    textDecoration: 'none',
    color: 'inherit',
    transition: 'background-color 0.15s ease',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
    ':active': {
      backgroundColor: tokens.colorNeutralBackground1Pressed,
    },
  },
  actionIcon: {
    fontSize: '24px',
    color: tokens.colorBrandForeground1,
  },
  actionLabel: {
    textAlign: 'center',
    fontSize: tokens.fontSizeBase200,
  },
  emptyState: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBlock: tokens.spacingVerticalXXL,
    color: tokens.colorNeutralForeground3,
  },
});

export function QuickActionsWidget({
  title,
  config,
  locale,
}: WidgetComponentProps<QuickActionsConfig>) {
  const styles = useStyles();
  const gridColumns = `repeat(${config.columns}, 1fr)`;

  return (
    <Card className={styles.card} appearance="filled-alternative">
      <CardHeader header={<Text weight="semibold">{title}</Text>} />

      {config.actions.length === 0 ? (
        <div className={styles.emptyState}>
          <Text size={200}>No quick actions configured</Text>
        </div>
      ) : (
        <div className={styles.grid} style={{ gridTemplateColumns: gridColumns }}>
          {config.actions.map((action) => (
            <a key={action.id} href={action.url} className={styles.actionButton}>
              <span className={styles.actionIcon}>{resolveIcon(action.icon)}</span>
              <Text className={styles.actionLabel}>
                {locale === 'ar' ? action.labelAr : action.label}
              </Text>
            </a>
          ))}
        </div>
      )}
    </Card>
  );
}
