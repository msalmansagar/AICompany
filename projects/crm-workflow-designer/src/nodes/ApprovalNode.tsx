import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ApprovalNodeData } from '../types/WorkflowTypes';
import { useWorkflowStore } from '../store/workflowStore';
import { NodeShell } from './NodeShell';

export function ApprovalNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as ApprovalNodeData;
  const viewMode = useWorkflowStore((s) => s.viewMode);

  return (
    <NodeShell color="#7c3aed" badge="APPROVAL" selected={selected}>
      <Handle type="target" position={Position.Top} isConnectable={!viewMode} />
      <div style={label}>{nodeData.assignToName || 'Unassigned'}</div>
      <div style={sub}>{nodeData.assignToType || 'user'}</div>
      <Handle type="source" position={Position.Bottom} isConnectable={!viewMode} />
    </NodeShell>
  );
}

const label: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#1e293b' };
const sub: React.CSSProperties = { fontSize: 11, color: '#64748b', marginTop: 2 };
