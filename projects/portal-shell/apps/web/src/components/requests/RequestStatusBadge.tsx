import React from 'react';
import { Badge } from '@fluentui/react-components';

type RequestStatus =
  | 'submitted'
  | 'under-review'
  | 'approved'
  | 'rejected'
  | 'pending-docs'
  | 'cancelled'
  | 'completed';

interface RequestStatusBadgeProps {
  status: RequestStatus;
  locale?: string;
}

type BadgeColor = 'informative' | 'success' | 'warning' | 'danger' | 'important' | 'severe' | 'subtle';

interface StatusConfig {
  color: BadgeColor;
  labelEn: string;
  labelAr: string;
}

const STATUS_CONFIG: Record<RequestStatus, StatusConfig> = {
  submitted: { color: 'informative', labelEn: 'Submitted', labelAr: 'مقدَّم' },
  'under-review': { color: 'warning', labelEn: 'Under Review', labelAr: 'قيد المراجعة' },
  approved: { color: 'success', labelEn: 'Approved', labelAr: 'موافق عليه' },
  rejected: { color: 'danger', labelEn: 'Rejected', labelAr: 'مرفوض' },
  'pending-docs': { color: 'severe', labelEn: 'Pending Documents', labelAr: 'في انتظار المستندات' },
  cancelled: { color: 'subtle', labelEn: 'Cancelled', labelAr: 'ملغى' },
  completed: { color: 'success', labelEn: 'Completed', labelAr: 'مكتمل' },
};

export function RequestStatusBadge({ status, locale = 'en' }: RequestStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.submitted;
  const label = locale === 'ar' ? config.labelAr : config.labelEn;

  return (
    <Badge color={config.color} appearance="tint">
      {label}
    </Badge>
  );
}
