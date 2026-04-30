import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useWorkflowStore } from '../store/workflowStore';

export function EndNode({ selected }: NodeProps) {
  const viewMode = useWorkflowStore((s) => s.viewMode);

  return (
    <div style={circleStyle(selected)}>
      <div style={label}>End</div>
      <Handle type="target" position={Position.Left} style={handle} isConnectable={!viewMode} />
    </div>
  );
}

function circleStyle(selected: boolean | undefined): React.CSSProperties {
  return {
    width: 72,
    height: 72,
    borderRadius: '50%',
    background: '#dc2626',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: selected
      ? '0 0 0 3px rgba(37,99,235,0.5), 0 4px 12px rgba(220,38,38,0.4)'
      : '0 4px 12px rgba(220,38,38,0.35)',
    cursor: 'pointer',
    border: selected ? '2px solid #2563eb' : '2px solid transparent',
  };
}

const label: React.CSSProperties = {
  color: '#fff',
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: 0.5,
};

const handle: React.CSSProperties = {
  width: 10,
  height: 10,
  background: '#fff',
  border: '2px solid #dc2626',
  borderRadius: '50%',
};
