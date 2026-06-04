/**
 * TokenChip.tsx
 * Visual pill rendered inside the editor to represent a resolved token.
 * Used in the preview pane to highlight token boundaries.
 * (In the live editor, tokens are stored as plain text; chips appear only in preview.)
 */

import * as React from 'react';

export interface TokenChipProps {
  readonly tokenSource: string;
  readonly resolvedValue: string | null;
  readonly hasError: boolean;
}

export const TokenChip: React.FC<TokenChipProps> = ({ tokenSource, resolvedValue, hasError }) => {
  const label = resolvedValue !== null ? resolvedValue : tokenSource;

  const bgColor = hasError ? '#fde7e9' : '#deecf9';
  const borderColor = hasError ? '#d13438' : '#0078d4';
  const textColor = hasError ? '#a4262c' : '#005a9e';

  return (
    <span
      title={tokenSource}
      style={{
        display: 'inline-block',
        padding: '1px 6px',
        borderRadius: '10px',
        border: `1px solid ${borderColor}`,
        backgroundColor: bgColor,
        color: textColor,
        fontSize: '12px',
        fontFamily: 'Segoe UI, sans-serif',
        cursor: 'default',
        userSelect: 'none',
        whiteSpace: 'nowrap'
      }}
    >
      {label}
    </span>
  );
};
