import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ActionNodeData } from '../types/WorkflowTypes';
import { useWorkflowStore } from '../store/workflowStore';
import { NodeShell } from './NodeShell';

const ACTION_COLORS: Record<string, string> = {
  updateField: '#2563eb',
  createRecord: '#0d9488',
  sendEmail:   '#7c3aed',
  assign:      '#4f46e5',
  wait:        '#64748b',
};

const ACTION_LABELS: Record<string, string> = {
  updateField:  'Update Field',
  createRecord: 'Create Record',
  sendEmail:    'Send Email',
  assign:       'Assign',
  wait:         'Wait / Delay',
};

export function ActionNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as ActionNodeData;
  const viewMode = useWorkflowStore((s) => s.viewMode);
  const subtype = 'actionType' in nodeData ? nodeData.actionType : 'updateField';
  const color = ACTION_COLORS[subtype] ?? '#64748b';
  const name = ACTION_LABELS[subtype] ?? subtype;
  const subtitle = getSubtitle(nodeData);

  return (
    <div style={{ position: 'relative' }}>
      <Handle type="target" position={Position.Left} style={handleStyle(color)} isConnectable={!viewMode} />
      <NodeShell borderColor={color} name={name} subtitle={subtitle} selected={selected} />
      <Handle type="source" position={Position.Right} style={handleStyle(color)} isConnectable={!viewMode} />
      <Handle type="source" position={Position.Bottom} style={handleStyle(color)} isConnectable={!viewMode} />
    </div>
  );
}

function getSubtitle(data: ActionNodeData): string {
  if (!('actionType' in data)) return '';
  switch (data.actionType) {
    case 'updateField':  return `${data.entity ? data.entity + '.' : ''}${data.field || 'field not set'}`;
    case 'createRecord': return data.entity || 'entity not set';
    case 'sendEmail':    return data.templateId ? `Template: ${data.templateId}` : 'template not set';
    case 'assign':       return data.assignToName || 'assignee not set';
    case 'wait':         return data.durationMinutes ? `${data.durationMinutes} min` : 'duration not set';
  }
}

function handleStyle(color: string): React.CSSProperties {
  return {
    width: 10,
    height: 10,
    background: '#fff',
    border: `2px solid ${color}`,
    borderRadius: '50%',
  };
}
