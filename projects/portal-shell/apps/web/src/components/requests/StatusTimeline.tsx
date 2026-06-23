import React from 'react';
import { Text, makeStyles, tokens } from '@fluentui/react-components';
import { CheckmarkCircleRegular } from '@fluentui/react-icons';
import { RequestStatusBadge } from './RequestStatusBadge';

interface TimelineEntry {
  id: string;
  status: string;
  changedBy: string;
  changedOn: string;
  note: string | null;
}

interface StatusTimelineProps {
  entries: TimelineEntry[];
  locale?: string;
  noHistoryLabel?: string;
}

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  entry: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
  },
  indicator: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    flexShrink: 0,
    width: '32px',
  },
  dot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    backgroundColor: tokens.colorBrandBackground,
    flexShrink: 0,
    marginTop: '4px',
  },
  line: {
    width: '2px',
    flex: 1,
    backgroundColor: tokens.colorNeutralStroke2,
    marginTop: '4px',
    marginBottom: 0,
    minHeight: '24px',
  },
  content: {
    paddingBottom: tokens.spacingVerticalL,
    flex: 1,
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
    marginBottom: '4px',
  },
  byLine: {
    color: tokens.colorNeutralForeground3,
  },
  note: {
    color: tokens.colorNeutralForeground2,
    marginTop: '4px',
  },
  emptyState: {
    color: tokens.colorNeutralForeground3,
    paddingBlock: tokens.spacingVerticalM,
  },
});

function formatDate(dateString: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-QA' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString));
}

export function StatusTimeline({
  entries,
  locale = 'en',
  noHistoryLabel = 'No status history available',
}: StatusTimelineProps) {
  const styles = useStyles();

  if (entries.length === 0) {
    return (
      <Text className={styles.emptyState} size={300}>
        {noHistoryLabel}
      </Text>
    );
  }

  return (
    <div className={styles.container} aria-label="Status timeline">
      {entries.map((entry, index) => (
        <div key={entry.id} className={styles.entry}>
          <div className={styles.indicator}>
            <div className={styles.dot} aria-hidden="true" />
            {index < entries.length - 1 && (
              <div className={styles.line} aria-hidden="true" />
            )}
          </div>
          <div className={styles.content}>
            <div className={styles.meta}>
              <RequestStatusBadge
                status={entry.status as Parameters<typeof RequestStatusBadge>[0]['status']}
                locale={locale}
              />
              <Text size={200} className={styles.byLine}>
                {locale === 'ar' ? `بواسطة ${entry.changedBy}` : `by ${entry.changedBy}`}
                {' · '}
                {formatDate(entry.changedOn, locale)}
              </Text>
            </div>
            {entry.note && (
              <Text size={200} className={styles.note}>
                {entry.note}
              </Text>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
