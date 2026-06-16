import React from 'react';
import type { RequestStatus } from '@portal/types';
import { Badge } from '../ui/Badge';
import { t } from '../../i18n';

interface StatusBadgeProps {
  status: RequestStatus;
  testID?: string;
}

type BadgeVariant = 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral';

const STATUS_VARIANT_MAP: Record<RequestStatus, BadgeVariant> = {
  submitted: 'info',
  'under-review': 'warning',
  approved: 'success',
  rejected: 'error',
  'pending-docs': 'neutral',
};

export function StatusBadge({ status, testID }: StatusBadgeProps): React.JSX.Element {
  const variant = STATUS_VARIANT_MAP[status];
  const label = t(`requests.status.${status}`);

  return <Badge label={label} variant={variant} testID={testID} />;
}
