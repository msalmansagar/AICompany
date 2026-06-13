import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

export function SopStartNode(_: NodeProps) {
  return (
    <div style={circleStyle}>
      <span style={labelStyle}>Start</span>
      <Handle type="source" position={Position.Bottom} id="out" style={handleStyle} />
    </div>
  );
}

const circleStyle: React.CSSProperties = {
  width: 60, height: 60, borderRadius: '50%',
  background: '#0f766e', border: '3px solid #0d9488',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  boxShadow: '0 2px 10px rgba(15,118,110,0.35)',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#fff', userSelect: 'none',
};

const handleStyle: React.CSSProperties = {
  background: '#0f766e', width: 10, height: 10,
  border: '2px solid #fff', borderRadius: '50%',
};
