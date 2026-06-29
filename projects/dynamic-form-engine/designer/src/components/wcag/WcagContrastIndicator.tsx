import React from 'react';
import { Badge, Text } from '@fluentui/react-components';
import { calculateContrastRatio } from '@qdb/shared';

interface WcagContrastIndicatorProps {
  foregroundHex: string;
  backgroundHex: string;
  label: string;
}

function resolveBadgeColor(level: string): 'success' | 'warning' | 'danger' {
  if (level === 'AAA' || level === 'AA') return 'success';
  if (level === 'AA Large') return 'warning';
  return 'danger';
}

/**
 * Displays a WCAG 2.1 contrast ratio badge for a colour pair.
 * Used alongside each blocking contrast pair in ThemeStylePanel.
 */
export function WcagContrastIndicator({
  foregroundHex,
  backgroundHex,
  label,
}: WcagContrastIndicatorProps): React.ReactElement {
  const result = calculateContrastRatio(foregroundHex, backgroundHex);
  const badgeColor = resolveBadgeColor(result.level);

  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
      aria-label={`${label} contrast ratio: ${result.ratio}:1 — ${result.level}`}
    >
      <Badge
        appearance="tint"
        color={badgeColor}
        aria-hidden="true"
      >
        {result.level}
      </Badge>
      <Text size={100} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {result.ratio.toFixed(2)}:1
      </Text>
    </span>
  );
}
