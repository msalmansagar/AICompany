import { useState } from 'react';
import { useWorkflowStore } from '../store/workflowStore';
import { TriggerConfigPanel } from './TriggerConfigPanel';
import { ConditionConfigPanel } from './ConditionConfigPanel';
import { ActionConfigPanel } from './ActionConfigPanel';
import { ApprovalConfigPanel } from './ApprovalConfigPanel';

const NODE_COLORS: Record<string, string> = {
  trigger:   '#16a34a',
  condition: '#d97706',
  action:    '#2563eb',
  approval:  '#b45309',
  end:       '#dc2626',
};

const NODE_ICONS: Record<string, string> = {
  trigger:   '▶',
  condition: '◆',
  action:    '⚡',
  approval:  '✓',
  end:       '■',
};

type Tab = 'General' | 'On Entering' | 'Assignment' | 'On Exiting' | 'Docs';
const TABS: Tab[] = ['General', 'On Entering', 'Assignment', 'On Exiting', 'Docs'];

export function NodeConfigPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('General');
  const { selectedNodeId, nodes, viewMode, updateNodeData, deleteNode, setSelectedNodeId, dirtyFlag } =
    useWorkflowStore((s) => ({
      selectedNodeId: s.selectedNodeId,
      nodes: s.nodes,
      viewMode: s.viewMode,
      updateNodeData: s.updateNodeData,
      deleteNode: s.deleteNode,
      setSelectedNodeId: s.setSelectedNodeId,
      dirtyFlag: s.dirtyFlag,
    }));

  if (!selectedNodeId) return null;
  const node = nodes.find((n) => n.id === selectedNodeId);
  if (!node) return null;

  const nodeType = node.type ?? 'action';
  const color = NODE_COLORS[nodeType] ?? '#64748b';
  const icon = NODE_ICONS[nodeType] ?? '■';
  const nodeName = (node.data.nodeName as string) || formatType(nodeType);
  const isTerminating = !!(node.data.terminatingStage as boolean);

  function handleNameChange(name: string) {
    updateNodeData(selectedNodeId!, { nodeName: name });
  }

  function handleTerminatingChange(val: boolean) {
    updateNodeData(selectedNodeId!, { terminatingStage: val });
  }

  function handleClose() {
    setSelectedNodeId(null);
    setActiveTab('General');
  }

  return (
    <div style={panel}>
      {/* Purple top border */}
      <div style={topBorder(color)} />

      {/* Header */}
      <div style={header}>
        <div style={iconCircle(color)}>{icon}</div>
        <div style={headerText}>
          <div style={headerTitle}>{nodeName}</div>
          <span style={stageBadge}>Process Stage</span>
        </div>
        <button style={closeBtn} onClick={handleClose} title="Close">×</button>
      </div>

      {/* Tabs */}
      <div style={tabBar}>
        {TABS.map((tab) => (
          <button
            key={tab}
            style={tabBtn(activeTab === tab, color)}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={body}>
        {activeTab === 'General' && (
          <>
            <div style={fieldGroup}>
              <label style={fieldLabel}>
                <span style={lockIcon}>🔒</span> Stage Name
                {viewMode && <span style={requiredStar}> *</span>}
              </label>
              <input
                style={textInput(viewMode)}
                type="text"
                value={nodeName}
                readOnly={viewMode}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Enter stage name…"
              />
            </div>

            <div style={fieldGroup}>
              <label style={fieldLabel}>Node Type</label>
              <div style={readonlyValue}>{formatType(nodeType)}</div>
            </div>

            {/* Per-type config */}
            <div style={sectionDivider} />
            {nodeType === 'trigger' && <TriggerConfigPanel nodeId={selectedNodeId} />}
            {nodeType === 'condition' && <ConditionConfigPanel nodeId={selectedNodeId} />}
            {nodeType === 'action' && <ActionConfigPanel nodeId={selectedNodeId} />}
            {nodeType === 'approval' && <ApprovalConfigPanel nodeId={selectedNodeId} />}
            {nodeType === 'end' && (
              <p style={emptyMsg}>No additional configuration for End node.</p>
            )}

            {/* Terminating stage toggle */}
            <div style={sectionDivider} />
            <div style={toggleRow}>
              <div>
                <div style={toggleLabel}>Terminating stage</div>
                <div style={toggleHint}>Mark this as a final stage in the workflow</div>
              </div>
              <button
                style={toggle(isTerminating)}
                onClick={() => !viewMode && handleTerminatingChange(!isTerminating)}
                title={isTerminating ? 'On' : 'Off'}
              >
                <span style={toggleThumb(isTerminating)} />
              </button>
            </div>
            {isTerminating && <div style={terminatingBadge}>● Terminating stage</div>}
          </>
        )}

        {activeTab === 'On Entering' && (
          <div style={emptyTab}>
            <div style={emptyTabIcon}>→</div>
            <div style={emptyTabText}>On Entering actions</div>
            <div style={emptyTabHint}>Configure actions that run when this stage is entered.</div>
          </div>
        )}

        {activeTab === 'Assignment' && (
          <div style={emptyTab}>
            <div style={emptyTabIcon}>👤</div>
            <div style={emptyTabText}>Assignment rules</div>
            <div style={emptyTabHint}>Define who is assigned when this stage activates.</div>
          </div>
        )}

        {activeTab === 'On Exiting' && (
          <div style={emptyTab}>
            <div style={emptyTabIcon}>←</div>
            <div style={emptyTabText}>On Exiting actions</div>
            <div style={emptyTabHint}>Configure actions that run when this stage is exited.</div>
          </div>
        )}

        {activeTab === 'Docs' && (
          <div style={emptyTab}>
            <div style={emptyTabIcon}>📄</div>
            <div style={emptyTabText}>Documentation</div>
            <div style={emptyTabHint}>Add notes and documentation for this stage.</div>
          </div>
        )}
      </div>

      {/* Bottom action bar */}
      {!viewMode && (
        <div style={bottomBar}>
          {dirtyFlag && <span style={unsavedText}>unsaved changes</span>}
          <div style={bottomActions}>
            <button style={deleteBtnBottom} onClick={() => { deleteNode(selectedNodeId); handleClose(); }}>
              Delete Stage
            </button>
            <button style={saveBtnBottom}>Save</button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatType(type: string): string {
  const map: Record<string, string> = {
    trigger: 'Trigger', condition: 'Condition',
    action: 'Action', approval: 'Approval', end: 'End',
  };
  return map[type] ?? type;
}

// --- Styles ---

const panel: React.CSSProperties = {
  position: 'absolute',
  top: 48, right: 0, bottom: 0,
  width: 360,
  background: '#fff',
  borderLeft: '1px solid #e2e8f0',
  display: 'flex',
  flexDirection: 'column',
  zIndex: 20,
  boxShadow: '-4px 0 16px rgba(0,0,0,0.08)',
  overflow: 'hidden',
};

const topBorder = (color: string): React.CSSProperties => ({
  height: 4, background: color, flexShrink: 0,
});

const header: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 12,
  padding: '14px 16px 12px', borderBottom: '1px solid #f1f5f9', flexShrink: 0,
};

const iconCircle = (color: string): React.CSSProperties => ({
  width: 40, height: 40, borderRadius: 8, background: color,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: '#fff', fontSize: 16, flexShrink: 0,
});

const headerText: React.CSSProperties = { flex: 1, minWidth: 0 };

const headerTitle: React.CSSProperties = {
  fontSize: 15, fontWeight: 700, color: '#1e293b',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

const stageBadge: React.CSSProperties = {
  display: 'inline-block', marginTop: 4,
  fontSize: 10, fontWeight: 600,
  background: '#ede9fe', color: '#6d28d9',
  padding: '2px 8px', borderRadius: 4,
};

const closeBtn: React.CSSProperties = {
  background: 'none', border: 'none', fontSize: 20, color: '#94a3b8',
  cursor: 'pointer', padding: 0, lineHeight: 1, flexShrink: 0,
};

const tabBar: React.CSSProperties = {
  display: 'flex', borderBottom: '1px solid #e2e8f0', flexShrink: 0,
  overflowX: 'auto',
};

const tabBtn = (active: boolean, color: string): React.CSSProperties => ({
  background: 'none', border: 'none', borderBottom: active ? `2px solid ${color}` : '2px solid transparent',
  padding: '9px 12px', fontSize: 12, fontWeight: active ? 700 : 500,
  color: active ? color : '#64748b', cursor: 'pointer', whiteSpace: 'nowrap',
  marginBottom: -1,
});

const body: React.CSSProperties = {
  flex: 1, overflowY: 'auto', padding: '16px',
};

const fieldGroup: React.CSSProperties = { marginBottom: 16 };

const fieldLabel: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600,
  color: '#475569', marginBottom: 6,
};

const lockIcon: React.CSSProperties = { fontSize: 11, marginRight: 4 };
const requiredStar: React.CSSProperties = { color: '#dc2626' };

const textInput = (readOnly: boolean): React.CSSProperties => ({
  width: '100%', padding: '7px 10px', fontSize: 13,
  border: readOnly ? '1px solid transparent' : '1px solid #cbd5e1',
  borderRadius: 6, background: readOnly ? '#f8fafc' : '#fff',
  color: '#1e293b', outline: 'none', boxSizing: 'border-box',
  fontWeight: readOnly ? 700 : 400,
});

const readonlyValue: React.CSSProperties = {
  fontSize: 13, color: '#64748b', padding: '4px 0',
};

const sectionDivider: React.CSSProperties = {
  borderTop: '1px solid #f1f5f9', margin: '12px 0',
};

const toggleRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8,
};

const toggleLabel: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#1e293b' };
const toggleHint: React.CSSProperties = { fontSize: 11, color: '#94a3b8', marginTop: 2 };

const toggle = (on: boolean): React.CSSProperties => ({
  width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
  background: on ? '#7c3aed' : '#cbd5e1', position: 'relative', padding: 0, flexShrink: 0,
  transition: 'background 0.2s',
});

const toggleThumb = (on: boolean): React.CSSProperties => ({
  position: 'absolute', top: 3, left: on ? 21 : 3,
  width: 16, height: 16, borderRadius: '50%', background: '#fff',
  transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
});

const terminatingBadge: React.CSSProperties = {
  fontSize: 11, color: '#7c3aed', fontWeight: 600,
  background: '#ede9fe', padding: '3px 10px', borderRadius: 20,
  display: 'inline-block', marginTop: 4,
};

const emptyMsg: React.CSSProperties = { fontSize: 13, color: '#94a3b8', padding: '8px 0' };

const emptyTab: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  justifyContent: 'center', height: 200, gap: 8, color: '#94a3b8',
};
const emptyTabIcon: React.CSSProperties = { fontSize: 32 };
const emptyTabText: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: '#64748b' };
const emptyTabHint: React.CSSProperties = { fontSize: 12, textAlign: 'center', maxWidth: 220 };

const bottomBar: React.CSSProperties = {
  borderTop: '1px solid #e2e8f0', padding: '10px 16px',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
  background: '#f8fafc',
};
const unsavedText: React.CSSProperties = { fontSize: 12, color: '#94a3b8', fontStyle: 'italic' };
const bottomActions: React.CSSProperties = { display: 'flex', gap: 8 };
const deleteBtnBottom: React.CSSProperties = {
  background: 'none', border: '1px solid #fecaca', color: '#dc2626',
  borderRadius: 5, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
};
const saveBtnBottom: React.CSSProperties = {
  background: '#7c3aed', color: '#fff', border: 'none',
  borderRadius: 5, padding: '5px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
};
