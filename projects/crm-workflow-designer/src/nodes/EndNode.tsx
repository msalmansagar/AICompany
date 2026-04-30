import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useWorkflowStore } from '../store/workflowStore';

export function EndNode({ id, data, selected }: NodeProps) {
  const { viewMode, deleteNode } = useWorkflowStore((s) => ({ viewMode: s.viewMode, deleteNode: s.deleteNode }));

  return (
    <div style={wrapper}>
      <div style={circleStyle(selected)}>
        <div style={label}>{(data.nodeName as string) || 'End'}</div>
      </div>
      {!viewMode && (
        <button style={deleteBtn} title="Delete node"
          onMouseDown={(e) => { e.stopPropagation(); deleteNode(id); }}>×</button>
      )}
      <Handle type="target" position={Position.Left} style={handle} isConnectable={!viewMode} />
    </div>
  );
}

function circleStyle(selected: boolean | undefined): React.CSSProperties {
  return {
    width: 72, height: 72, borderRadius: '50%', background: '#dc2626',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: selected
      ? '0 0 0 3px rgba(124,58,237,0.4), 0 4px 12px rgba(220,38,38,0.4)'
      : '0 4px 12px rgba(220,38,38,0.35)',
    cursor: 'pointer',
    border: selected ? '2px solid #7c3aed' : '2px solid transparent',
  };
}

const wrapper: React.CSSProperties = { position: 'relative', display: 'inline-block' };
const label: React.CSSProperties = { color: '#fff', fontSize: 13, fontWeight: 800, letterSpacing: 0.5 };
const deleteBtn: React.CSSProperties = {
  position: 'absolute', top: -4, right: -4,
  width: 18, height: 18, borderRadius: '50%',
  border: '1px solid #e2e8f0', background: '#fff', color: '#94a3b8',
  fontSize: 13, cursor: 'pointer', padding: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5,
};
const handle: React.CSSProperties = {
  width: 10, height: 10, background: '#fff', border: '2px solid #dc2626', borderRadius: '50%',
};
