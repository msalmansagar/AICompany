import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useWorkflowStore } from '../store/workflowStore';
import { NodeShell } from './NodeShell';

export function EndNode({ selected }: NodeProps) {
  const viewMode = useWorkflowStore((s) => s.viewMode);

  return (
    <NodeShell color="#64748b" badge="END" selected={selected}>
      <Handle type="target" position={Position.Top} isConnectable={!viewMode} />
      <div style={label}>End</div>
    </NodeShell>
  );
}

const label: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#64748b' };
