import { useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useWorkflowStore } from '../store/workflowStore';
import { validateGraph } from '../validation/GraphValidator';
import { CrmApiService } from '../services/CrmApiService';
import { serialize, deserialize } from '../services/WorkflowSerializer';
import type { NodeType } from '../types/WorkflowTypes';

const NODE_TYPES: Array<{ type: NodeType; label: string; color: string; dot: string }> = [
  { type: 'trigger',   label: '● Trigger',   color: '#15803d', dot: '#16a34a' },
  { type: 'condition', label: '◆ Condition',  color: '#92400e', dot: '#d97706' },
  { type: 'action',    label: '■ Action',     color: '#1d4ed8', dot: '#2563eb' },
  { type: 'approval',  label: '■ Approval',   color: '#92400e', dot: '#b45309' },
  { type: 'end',       label: '● End',        color: '#991b1b', dot: '#dc2626' },
];

export function Toolbar() {
  const { screenToFlowPosition } = useReactFlow();
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const { nodes, edges, setNodes, setEdges, viewMode, setViewMode, crmContext, showToast, setDirty, dirtyFlag } =
    useWorkflowStore((s) => ({
      nodes: s.nodes,
      edges: s.edges,
      setNodes: s.setNodes,
      setEdges: s.setEdges,
      viewMode: s.viewMode,
      setViewMode: s.setViewMode,
      crmContext: s.crmContext,
      showToast: s.showToast,
      setDirty: s.setDirty,
      dirtyFlag: s.dirtyFlag,
    }));

  function addNode(type: NodeType) {
    setAddMenuOpen(false);
    const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    setNodes([
      ...nodes,
      {
        id: crypto.randomUUID(),
        type,
        position: { x: center.x + Math.random() * 60 - 30, y: center.y + Math.random() * 60 - 30 },
        data: {},
      },
    ]);
  }

  function handleValidate() {
    const wfNodes = nodes.map((n) => ({
      id: n.id, type: (n.type ?? 'end') as NodeType,
      position: n.position, data: n.data as Record<string, unknown>,
    }));
    const wfEdges = edges.map((e) => ({
      id: e.id, source: e.source, target: e.target,
      label: e.label as 'true' | 'false' | undefined,
    }));
    const result = validateGraph(wfNodes, wfEdges);
    showToast(
      result.valid ? 'Workflow is valid.' : result.errors.join(' | '),
      result.valid ? 'success' : 'error'
    );
  }

  async function handleSave() {
    if (!crmContext) { showToast('CRM context not available.', 'error'); return; }
    const wfNodes = nodes.map((n) => ({
      id: n.id, type: (n.type ?? 'end') as NodeType,
      position: n.position, data: n.data as Record<string, unknown>,
    }));
    const wfEdges = edges.map((e) => ({
      id: e.id, source: e.source, target: e.target,
      label: e.label as 'true' | 'false' | undefined,
    }));
    const validation = validateGraph(wfNodes, wfEdges);
    if (!validation.valid) {
      showToast('Fix validation errors before saving: ' + validation.errors[0], 'error');
      return;
    }
    const definition = serialize(nodes, edges);
    const service = new CrmApiService(crmContext);
    setSaving(true);
    const result = await service.saveWorkflow(definition, 'Workflow', crmContext.entityName ?? '', crmContext.recordId);
    setSaving(false);
    if (result.success) {
      setDirty(false);
      showToast(result.sizeWarning ? `Saved. Note: ${result.sizeWarning}` : 'Workflow saved.', 'success');
    } else {
      showToast(`Save failed: ${result.error}`, 'error');
    }
  }

  async function handleLoad() {
    if (!crmContext?.recordId) {
      showToast('No record ID in context. Open from a CRM workflow record.', 'error');
      return;
    }
    const service = new CrmApiService(crmContext);
    const result = await service.loadWorkflow(crmContext.recordId);
    if (result.success && result.definition) {
      const { nodes: ln, edges: le } = deserialize(result.definition);
      setNodes(ln); setEdges(le); setDirty(false);
      showToast('Workflow loaded.', 'success');
    } else {
      showToast(`Load failed: ${result.error}`, 'error');
    }
  }

  return (
    <div style={bar}>
      {/* Left: add node */}
      <div style={group}>
        {!viewMode && (
          <div style={{ position: 'relative' }}>
            <button style={primaryBtn} onClick={() => setAddMenuOpen((o) => !o)}>
              + New Stage
            </button>
            {addMenuOpen && (
              <div style={dropMenu}>
                {NODE_TYPES.map(({ type, label, dot }) => (
                  <button key={type} style={dropItem} onClick={() => addNode(type)}>
                    <span style={dropDot(dot)} />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Centre: workflow name */}
      <div style={centreTitle}>
        {dirtyFlag && !viewMode && <span style={unsavedDot} title="Unsaved changes" />}
        Workflow Designer
        {viewMode && <span style={viewBadge}>View Only</span>}
      </div>

      {/* Right: actions */}
      <div style={group}>
        {!viewMode && <button style={actionBtn} onClick={handleValidate}>✓ Validate</button>}
        {!viewMode && (
          <button style={{ ...actionBtn, ...(saving ? disabledBtn : {}) }} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : '💾 Save'}
          </button>
        )}
        <button style={actionBtn} onClick={handleLoad}>↑ Load</button>
        <button
          style={{ ...actionBtn, ...(viewMode ? activeBtn : {}) }}
          onClick={() => setViewMode(!viewMode)}
        >
          {viewMode ? '✏ Edit' : '👁 View'}
        </button>
      </div>
    </div>
  );
}

const bar: React.CSSProperties = {
  position: 'absolute',
  top: 0, left: 0, right: 0,
  height: 48,
  background: '#fff',
  borderBottom: '1px solid #e2e8f0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 16px',
  zIndex: 10,
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
};

const group: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, minWidth: 180,
};

const centreTitle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  fontSize: 14, fontWeight: 700, color: '#1e293b', letterSpacing: 0.2,
  position: 'absolute', left: '50%', transform: 'translateX(-50%)',
};

const unsavedDot: React.CSSProperties = {
  display: 'inline-block', width: 8, height: 8,
  borderRadius: '50%', background: '#f59e0b',
};

const viewBadge: React.CSSProperties = {
  fontSize: 10, background: '#fef9c3', color: '#a16207',
  padding: '2px 7px', borderRadius: 4, fontWeight: 600,
};

const primaryBtn: React.CSSProperties = {
  background: '#2563eb', color: '#fff', border: 'none',
  borderRadius: 5, padding: '6px 14px', fontSize: 13,
  fontWeight: 600, cursor: 'pointer',
};

const actionBtn: React.CSSProperties = {
  background: 'none', color: '#475569',
  border: '1px solid #e2e8f0', borderRadius: 5,
  padding: '5px 12px', fontSize: 12, fontWeight: 600,
  cursor: 'pointer',
};

const activeBtn: React.CSSProperties = {
  background: '#eff6ff', color: '#2563eb', borderColor: '#bfdbfe',
};

const disabledBtn: React.CSSProperties = {
  opacity: 0.6, cursor: 'not-allowed',
};

const dropMenu: React.CSSProperties = {
  position: 'absolute', top: '100%', left: 0, marginTop: 4,
  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
  boxShadow: '0 4px 16px rgba(0,0,0,0.12)', overflow: 'hidden',
  minWidth: 160, zIndex: 20,
};

const dropItem: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  width: '100%', padding: '9px 14px', textAlign: 'left',
  background: 'none', border: 'none',
  borderBottom: '1px solid #f8fafc',
  fontSize: 12, color: '#1e293b', fontWeight: 600, cursor: 'pointer',
};

function dropDot(color: string): React.CSSProperties {
  return { width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 };
}
