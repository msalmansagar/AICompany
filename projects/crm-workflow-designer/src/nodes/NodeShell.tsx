import type { ReactNode, CSSProperties } from 'react';

export interface NodeShellProps {
  borderColor: string;
  dotColor?: string;
  name: string;
  subtitle?: string;
  selected: boolean | undefined;
  nodeId: string;
  onDelete: (id: string) => void;
  viewMode: boolean;
  children?: ReactNode;
}

export function NodeShell({
  borderColor, dotColor, name, subtitle,
  selected, nodeId, onDelete, viewMode, children,
}: NodeShellProps) {
  return (
    <div style={shell(borderColor, selected)}>
      <div style={dot(dotColor ?? borderColor)} />
      {!viewMode && (
        <button
          style={deleteBtn}
          title="Delete node"
          onMouseDown={(e) => { e.stopPropagation(); onDelete(nodeId); }}
        >
          ×
        </button>
      )}
      <div style={content}>
        <div style={nameStyle}>{name || 'Untitled'}</div>
        {subtitle && <div style={subtitleStyle}>{subtitle}</div>}
        {children}
      </div>
    </div>
  );
}

function shell(borderColor: string, selected: boolean | undefined): CSSProperties {
  return {
    background: '#fff',
    border: `1px solid ${selected ? '#7c3aed' : '#d1d5db'}`,
    borderLeft: `5px solid ${borderColor}`,
    borderRadius: 4,
    minWidth: 180,
    maxWidth: 220,
    boxShadow: selected
      ? '0 0 0 2px rgba(124,58,237,0.3), 0 2px 8px rgba(0,0,0,0.12)'
      : '0 2px 6px rgba(0,0,0,0.08)',
    cursor: 'pointer',
    position: 'relative',
    padding: '10px 28px 10px 10px',
  };
}

function dot(color: string): CSSProperties {
  return {
    position: 'absolute',
    top: 8, left: 10,
    width: 8, height: 8,
    borderRadius: '50%',
    background: color,
  };
}

const deleteBtn: CSSProperties = {
  position: 'absolute',
  top: 4, right: 5,
  width: 18, height: 18,
  borderRadius: '50%',
  border: '1px solid #e2e8f0',
  background: '#f8fafc',
  color: '#94a3b8',
  fontSize: 13,
  lineHeight: '16px',
  textAlign: 'center',
  cursor: 'pointer',
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 5,
};

const content: CSSProperties = { paddingLeft: 16 };

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
