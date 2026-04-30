import { useWorkflowStore } from '../store/workflowStore';
import { TriggerConfigPanel } from './TriggerConfigPanel';
import { ConditionConfigPanel } from './ConditionConfigPanel';
import { ActionConfigPanel } from './ActionConfigPanel';
import { ApprovalConfigPanel } from './ApprovalConfigPanel';

export function NodeConfigPanel() {
  const { selectedNodeId, nodes, viewMode } = useWorkflowStore((s) => ({
    selectedNodeId: s.selectedNodeId,
    nodes: s.nodes,
    viewMode: s.viewMode,
  }));

  if (!selectedNodeId) return null;

  const node = nodes.find((n) => n.id === selectedNodeId);
  if (!node) return null;

  return (
    <div style={panelStyle}>
      <div style={header}>
        <span style={title}>{node.type?.toUpperCase()} Configuration</span>
        {viewMode && <span style={viewBadge}>View Only</span>}
      </div>
      <div style={body}>
        {node.type === 'trigger' && <TriggerConfigPanel nodeId={selectedNodeId} />}
        {node.type === 'condition' && <ConditionConfigPanel nodeId={selectedNodeId} />}
        {node.type === 'action' && <ActionConfigPanel nodeId={selectedNodeId} />}
        {node.type === 'approval' && <ApprovalConfigPanel nodeId={selectedNodeId} />}
        {node.type === 'end' && <div style={endMsg}>No configuration required for End node.</div>}
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  right: 16,
  top: 64,
  width: 320,
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
  zIndex: 10,
  overflow: 'hidden',
};

const header: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px',
  background: '#f8fafc',
  borderBottom: '1px solid #e2e8f0',
};

const title: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#475569', letterSpacing: 0.5 };
const viewBadge: React.CSSProperties = { fontSize: 10, background: '#fef9c3', color: '#a16207', padding: '2px 6px', borderRadius: 4 };
const body: React.CSSProperties = { padding: 16 };
const endMsg: React.CSSProperties = { fontSize: 13, color: '#64748b' };
