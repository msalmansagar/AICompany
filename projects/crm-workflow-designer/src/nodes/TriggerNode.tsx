import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { TriggerNodeData } from '../types/WorkflowTypes';
import { useWorkflowStore } from '../store/workflowStore';
import { NodeShell } from './NodeShell';

export function TriggerNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as TriggerNodeData;
  const viewMode = useWorkflowStore((s) => s.viewMode);

  return (
    <NodeShell color="#16a34a" badge="TRIGGER" selected={selected}>
      <div style={label}>{nodeData.entity || 'No entity'}</div>
      <div style={sub}>{nodeData.event || 'No event'}</div>
      <Handle type="source" position={Position.Bottom} isConnectable={!viewMode} />
    </NodeShell>
  );
}

const label: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#1e293b' };
const sub: React.CSSProperties = { fontSize: 11, color: '#64748b', marginTop: 2 };
