import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ActionNodeData } from '../types/WorkflowTypes';
import { useWorkflowStore } from '../store/workflowStore';
import { NodeShell } from './NodeShell';

const ACTION_LABELS: Record<string, string> = {
  updateField: 'Update Field',
  createRecord: 'Create Record',
  sendEmail: 'Send Email',
  assign: 'Assign',
  wait: 'Wait',
};

export function ActionNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as ActionNodeData;
  const viewMode = useWorkflowStore((s) => s.viewMode);
  const subtype = 'actionType' in nodeData ? nodeData.actionType : 'unknown';

  return (
    <NodeShell color="#2563eb" badge="ACTION" selected={selected}>
      <Handle type="target" position={Position.Top} isConnectable={!viewMode} />
      <div style={label}>{ACTION_LABELS[subtype] ?? subtype}</div>
      <div style={sub}>{describeAction(nodeData)}</div>
      <Handle type="source" position={Position.Bottom} isConnectable={!viewMode} />
    </NodeShell>
  );
}

function describeAction(data: ActionNodeData): string {
  if (!('actionType' in data)) return '';
  switch (data.actionType) {
    case 'updateField': return `${data.entity}.${data.field}`;
    case 'createRecord': return data.entity;
    case 'sendEmail': return `Template: ${data.templateId || 'none'}`;
    case 'assign': return `To ${data.assignToType}: ${data.assignToName || 'none'}`;
    case 'wait': return `${data.durationMinutes} min`;
  }
}

const label: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#1e293b' };
const sub: React.CSSProperties = { fontSize: 11, color: '#64748b', marginTop: 2 };
