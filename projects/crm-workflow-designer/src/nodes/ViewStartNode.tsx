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
  background: '#16a34a',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 2px 8px rgba(22,163,74,0.4)',
};

const labelStyle: React.CSSProperties = {
  color: '#fff',
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: '0.06em',
};

const handleStyle: React.CSSProperties = {
  background: '#16a34a',
  width: 10,
  height: 10,
  border: '2px solid #fff',
  borderRadius: '50%',
};
