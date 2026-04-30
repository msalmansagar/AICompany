import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ApprovalNodeData } from '../types/WorkflowTypes';
import { useWorkflowStore } from '../store/workflowStore';
import { NodeShell } from './NodeShell';

const COLOR = '#b45309';

export function ApprovalNode({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as ApprovalNodeData;
  const { viewMode, deleteNode } = useWorkflowStore((s) => ({ viewMode: s.viewMode, deleteNode: s.deleteNode }));
  const subtitle = nodeData.assignToName
    ? `${nodeData.assignToType ?? 'user'}: ${nodeData.assignToName}`
    : 'Assignee not set';

  return (
    <div style={{ position: 'relative' }}>
      <Handle type="target" position={Position.Left} style={handleStyle} isConnectable={!viewMode} />
      <NodeShell
        borderColor={COLOR}
        name={(data.nodeName as string) || 'Approval'}
        subtitle={subtitle}
        selected={selected}
        nodeId={id}
        onDelete={deleteNode}
        viewMode={viewMode}
      />
      <Handle type="source" position={Position.Right} style={handleStyle} isConnectable={!viewMode} />
      <Handle type="source" position={Position.Bottom} style={handleStyle} isConnectable={!viewMode} />
    </div>
  );
}

const handleStyle: React.CSSProperties = {
  width: 10, height: 10, background: '#fff', border: `2px solid ${COLOR}`, borderRadius: '50%',
};
