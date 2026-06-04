import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { StartNodeData } from '@/store/selectors';

export function StartNode({ data }: NodeProps) {
  const nodeData = data as unknown as StartNodeData;

  return (
    <div style={containerStyle}>
      <div style={circleStyle}>
        <span style={labelStyle}>START</span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        style={handleStyle}
        id="source-bottom"
      />
    </div>
  );

  void nodeData;
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
  background: '#16a34a',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 2px 8px rgba(22, 163, 74, 0.4)',
};

const labelStyle: React.CSSProperties = {
  color: '#fff',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.05em',
};

const handleStyle: React.CSSProperties = {
  background: '#16a34a',
  width: 10,
  height: 10,
};
