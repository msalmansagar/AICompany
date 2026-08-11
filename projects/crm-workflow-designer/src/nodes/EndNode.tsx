import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

export function EndNode(_props: NodeProps) {
  return (
    <div style={containerStyle}>
      <Handle
        type="target"
        position={Position.Top}
        id="target-top"
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
  flexDirection: 'column',
  alignItems: 'center',
};

const circleStyle: React.CSSProperties = {
  width: 64,
  height: 64,
  borderRadius: '50%',
  background: 'var(--error)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 2px 8px rgba(220, 38, 38, 0.4)',
};

const labelStyle: React.CSSProperties = {
  color: 'var(--text-on-primary)',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.05em',
};

const handleStyle: React.CSSProperties = {
  background: 'var(--error)',
  width: 10,
  height: 10,
};
