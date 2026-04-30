import type { ReactNode, CSSProperties } from 'react';

interface NodeShellProps {
  color: string;
  badge: string;
  selected: boolean | undefined;
  children: ReactNode;
}

export function NodeShell({ color, badge, selected, children }: NodeShellProps) {
  const shell: CSSProperties = {
    background: '#fff',
    border: `2px solid ${selected ? '#2563eb' : color}`,
    borderRadius: 8,
    padding: '10px 16px',
    minWidth: 160,
    boxShadow: selected
      ? '0 0 0 3px rgba(37,99,235,0.3)'
      : '0 2px 6px rgba(0,0,0,0.1)',
    cursor: 'pointer',
  };

  const badgeStyle: CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    color,
    letterSpacing: 1,
    marginBottom: 4,
    textTransform: 'uppercase',
  };

  return (
    <div style={shell}>
      <div style={badgeStyle}>{badge}</div>
      {children}
    </div>
  );
}
