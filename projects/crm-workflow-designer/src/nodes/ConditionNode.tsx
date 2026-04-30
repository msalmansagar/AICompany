import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ConditionNodeData } from '../types/WorkflowTypes';
import { useWorkflowStore } from '../store/workflowStore';
import { NodeShell } from './NodeShell';

export function ConditionNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as ConditionNodeData;
  const viewMode = useWorkflowStore((s) => s.viewMode);

  return (
    <NodeShell color="#d97706" badge="CONDITION" selected={selected}>
      <Handle type="target" position={Position.Top} isConnectable={!viewMode} />
      <div style={label}>{nodeData.field || 'No field'}</div>
      <div style={sub}>{nodeData.operator} {nodeData.value ?? ''}</div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="true"
        style={{ left: '30%' }}
        isConnectable={!viewMode}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        style={{ left: '70%' }}
        isConnectable={!viewMode}
      />
      <div style={branchLabels}>
        <span style={trueLabel}>T</span>
        <span style={falseLabel}>F</span>
      </div>
    </NodeShell>
  );
}

const label: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#1e293b' };
const sub: React.CSSProperties = { fontSize: 11, color: '#64748b', marginTop: 2 };
const branchLabels: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  marginTop: 8,
  paddingTop: 4,
  borderTop: '1px solid #f1f5f9',
};
const trueLabel: React.CSSProperties = { fontSize: 10, color: '#16a34a', fontWeight: 700 };
const falseLabel: React.CSSProperties = { fontSize: 10, color: '#dc2626', fontWeight: 700 };
