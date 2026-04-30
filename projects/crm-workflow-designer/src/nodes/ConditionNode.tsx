import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ConditionNodeData } from '../types/WorkflowTypes';
import { useWorkflowStore } from '../store/workflowStore';
import { NodeShell } from './NodeShell';

const COLOR = '#d97706';

export function ConditionNode({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as ConditionNodeData;
  const { viewMode, deleteNode } = useWorkflowStore((s) => ({ viewMode: s.viewMode, deleteNode: s.deleteNode }));
  const subtitle = nodeData.field
    ? `${nodeData.field} ${nodeData.operator ?? ''} ${nodeData.value ?? ''}`.trim()
    : 'No condition set';

  return (
    <div style={{ position: 'relative' }}>
      <Handle type="target" position={Position.Left} style={handleStyle(COLOR)} isConnectable={!viewMode} />
      <NodeShell
        borderColor={COLOR}
        name={(data.nodeName as string) || 'Condition'}
        subtitle={subtitle}
        selected={selected}
        nodeId={id}
        onDelete={deleteNode}
        viewMode={viewMode}
      >
        <div style={branches}>
          <span style={trueTag}>True ↓</span>
          <span style={falseTag}>False ↓</span>
        </div>
      </NodeShell>
      <Handle type="source" position={Position.Bottom} id="true"
        style={{ ...handleStyle(COLOR), left: '30%' }} isConnectable={!viewMode} />
      <Handle type="source" position={Position.Bottom} id="false"
        style={{ ...handleStyle(COLOR), left: '70%' }} isConnectable={!viewMode} />
      <Handle type="source" position={Position.Right} style={handleStyle(COLOR)} isConnectable={!viewMode} />
    </div>
  );
}

function handleStyle(color: string): React.CSSProperties {
  return { width: 10, height: 10, background: '#fff', border: `2px solid ${color}`, borderRadius: '50%' };
}

const branches: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between',
  marginTop: 6, paddingTop: 5, borderTop: '1px solid #f1f5f9',
};
const trueTag: React.CSSProperties = { fontSize: 9, fontWeight: 700, color: '#16a34a', letterSpacing: 0.3 };
const falseTag: React.CSSProperties = { fontSize: 9, fontWeight: 700, color: '#dc2626', letterSpacing: 0.3 };
