import React from 'react';
import { Badge } from '@fluentui/react-components';
import type { CmsStatus } from '@portal/types';

interface CmsStatusBadgeProps {
  status: CmsStatus;
}

const STATUS_CONFIG: Record<CmsStatus, { color: 'informative' | 'success' | 'subtle'; label: string }> = {
  draft: { color: 'informative', label: 'Draft' },
  published: { color: 'success', label: 'Published' },
  archived: { color: 'subtle', label: 'Archived' },
};

export function CmsStatusBadge({ status }: CmsStatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <Badge appearance="tint" color={config.color}>
      {config.label}
    </Badge>
  );
}
