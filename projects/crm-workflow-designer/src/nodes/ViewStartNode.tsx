import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

export function ViewStartNode({ data }: NodeProps) {
  const isLR = (data as { layoutDir?: string }).layoutDir === 'LR';

  return (
    <div style={containerStyle}>
      <div style={circleStyle}>
        <span style={labelStyle}>START</span>
      </div>
      <Handle
        type="source"
        position={isLR ? Position.Right : Position.Bottom}
        id="out"
        style={handleStyle}
      />
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const circleStyle: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: '50%',
  background: 'var(--success)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 2px 8px rgba(22,163,74,0.4)',
};

const labelStyle: React.CSSProperties = {
  color: 'var(--text-on-primary)',
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: '0.06em',
};

const handleStyle: React.CSSProperties = {
  background: 'var(--success)',
  width: 10,
  height: 10,
  border: '2px solid var(--border)',
  borderRadius: '50%',
};
