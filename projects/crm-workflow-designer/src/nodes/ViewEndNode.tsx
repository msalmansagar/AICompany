import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

export function ViewEndNode({ data }: NodeProps) {
  const isLR = (data as { layoutDir?: string }).layoutDir === 'LR';

  return (
    <div style={containerStyle}>
      <Handle
        type="target"
        position={isLR ? Position.Left : Position.Top}
        id="in"
        style={handleStyle}
      />
      <div style={circleStyle}>
        <span style={labelStyle}>END</span>
      </div>
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
  background: '#dc2626',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 2px 8px rgba(220,38,38,0.4)',
};

const labelStyle: React.CSSProperties = {
  color: '#fff',
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: '0.06em',
};

const handleStyle: React.CSSProperties = {
  background: '#dc2626',
  width: 10,
  height: 10,
  border: '2px solid #fff',
  borderRadius: '50%',
};
