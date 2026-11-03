import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

export function SopEndNode(_: NodeProps) {
  return (
    <div style={outerStyle}>
      <div style={innerStyle}>
        <span style={labelStyle}>End</span>
      </div>
      <Handle type="target" position={Position.Top} id="in" style={handleStyle} />
    </div>
  );
}

const outerStyle: React.CSSProperties = {
  width: 60, height: 60, borderRadius: '50%',
  background: 'var(--surface)', border: '3px solid var(--border-strong)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  boxShadow: '0 2px 10px rgba(30,41,59,0.3)',
};

const innerStyle: React.CSSProperties = {
  width: 44, height: 44, borderRadius: '50%',
  background: 'var(--surface)', border: '2px solid var(--border)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: 'var(--text-on-primary)', userSelect: 'none',
};

const handleStyle: React.CSSProperties = {
  background: 'var(--surface)', width: 10, height: 10,
  border: '2px solid var(--border)', borderRadius: '50%',
};
