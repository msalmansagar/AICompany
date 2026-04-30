import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { TriggerNodeData } from '../types/WorkflowTypes';
import { useWorkflowStore } from '../store/workflowStore';

export function TriggerNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as TriggerNodeData;
  const viewMode = useWorkflowStore((s) => s.viewMode);

  return (
    <div style={circleStyle(selected)}>
      <div style={label}>Start</div>
      {nodeData.entity && <div style={entityLabel}>{nodeData.entity}</div>}
      <Handle type="source" position={Position.Right} style={handle} isConnectable={!viewMode} />
    </div>
  );
}

function circleStyle(selected: boolean | undefined): React.CSSProperties {
  return {
    width: 72,
    height: 72,
    borderRadius: '50%',
    background: '#16a34a',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: selected
      ? '0 0 0 3px rgba(37,99,235,0.5), 0 4px 12px rgba(22,163,74,0.4)'
      : '0 4px 12px rgba(22,163,74,0.35)',
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

const entityLabel: React.CSSProperties = {
  color: 'rgba(255,255,255,0.8)',
  fontSize: 9,
  marginTop: 1,
  maxWidth: 60,
  textAlign: 'center',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const handle: React.CSSProperties = {
  width: 10,
  height: 10,
  background: '#fff',
  border: '2px solid #16a34a',
  borderRadius: '50%',
};
