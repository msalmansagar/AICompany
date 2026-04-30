import type { ReactNode, CSSProperties } from 'react';

export interface NodeShellProps {
  borderColor: string;
  dotColor?: string;
  name: string;
  subtitle?: string;
  selected: boolean | undefined;
  children?: ReactNode;
}

export function NodeShell({ borderColor, dotColor, name, subtitle, selected, children }: NodeShellProps) {
  return (
    <div style={shell(borderColor, selected)}>
      <div style={dot(dotColor ?? borderColor)} />
      <div style={content}>
        <div style={nameStyle}>{name}</div>
        {subtitle && <div style={subtitleStyle}>{subtitle}</div>}
        {children}
      </div>
    </div>
  );
}

function shell(borderColor: string, selected: boolean | undefined): CSSProperties {
  return {
    background: '#fff',
    border: `1px solid ${selected ? '#2563eb' : '#d1d5db'}`,
    borderLeft: `5px solid ${borderColor}`,
    borderRadius: 4,
    minWidth: 180,
    maxWidth: 220,
    boxShadow: selected
      ? '0 0 0 2px rgba(37,99,235,0.4), 0 2px 8px rgba(0,0,0,0.12)'
      : '0 2px 6px rgba(0,0,0,0.08)',
    cursor: 'pointer',
    position: 'relative',
    padding: '10px 12px 10px 10px',
  };
}

function dot(color: string): CSSProperties {
  return {
    position: 'absolute',
    top: 8,
    left: 10,
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: color,
  };
}

const content: CSSProperties = {
  paddingLeft: 16,
};

const nameStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 0.8,
  color: '#1e293b',
  textTransform: 'uppercase',
  lineHeight: 1.3,
};

const subtitleStyle: CSSProperties = {
  fontSize: 11,
  color: '#64748b',
  marginTop: 3,
  fontWeight: 400,
};
