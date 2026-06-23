'use client';

import React from 'react';
import { Badge, makeStyles, tokens } from '@fluentui/react-components';

interface NavBadgeProps {
  count: number;
  /** When true the badge renders even when collapsed (icon-only sidebar) */
  visibleWhenCollapsed?: boolean;
}

const useStyles = makeStyles({
  badge: {
    flexShrink: 0,
  },
});

export function NavBadge({ count, visibleWhenCollapsed = false }: NavBadgeProps) {
  const styles = useStyles();

  if (count <= 0) return null;

  const displayCount = count > 99 ? '99+' : count;

  return (
    <Badge
      className={styles.badge}
      color="danger"
      size="small"
      appearance="filled"
      aria-label={`${displayCount} items`}
    >
      {displayCount}
    </Badge>
  );
}
