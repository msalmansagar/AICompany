import { useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useWorkflowStore } from '../store/workflowStore';
import { validateGraph } from '../validation/GraphValidator';
import { CrmApiService } from '../services/CrmApiService';
import { serialize, deserialize } from '../services/WorkflowSerializer';
import type { NodeType } from '../types/WorkflowTypes';

const NODE_TYPES: Array<{ type: NodeType; label: string; color: string }> = [
  { type: 'trigger', label: 'Trigger', color: '#16a34a' },
  { type: 'condition', label: 'Condition', color: '#d97706' },
  { type: 'action', label: 'Action', color: '#2563eb' },
  { type: 'approval', label: 'Approval', color: '#7c3aed' },
  { type: 'end', label: 'End', color: '#64748b' },
];

export function Toolbar() {
  const { screenToFlowPosition } = useReactFlow();
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const { nodes, edges, setNodes, setEdges, viewMode, setViewMode, crmContext, showToast, setDirty } =
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
    }));

  function addNode(type: NodeType) {
    setAddMenuOpen(false);
    const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    setNodes([
      ...nodes,
      {
        id: crypto.randomUUID(),
        type,
        position: { x: center.x + Math.random() * 40 - 20, y: center.y + Math.random() * 40 - 20 },
        data: {},
      },
    ]);
  }

  function handleValidate() {
    const wfNodes = nodes.map((n) => ({
      id: n.id,
      type: (n.type ?? 'end') as NodeType,
      position: n.position,
      data: n.data as Record<string, unknown>,
    }));
    const wfEdges = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label as 'true' | 'false' | undefined,
    }));
    const result = validateGraph(wfNodes, wfEdges);
    if (result.valid) {
      showToast('Workflow is valid.', 'success');
    } else {
      showToast(result.errors.join(' | '), 'error');
    }
  }

  async function handleSave() {
    if (!crmContext) { showToast('CRM context not available.', 'error'); return; }

    const wfNodes = nodes.map((n) => ({
      id: n.id,
      type: (n.type ?? 'end') as NodeType,
      position: n.position,
      data: n.data as Record<string, unknown>,
    }));
    const wfEdges = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
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
      const { nodes: loadedNodes, edges: loadedEdges } = deserialize(result.definition);
      setNodes(loadedNodes);
      setEdges(loadedEdges);
      setDirty(false);
      showToast('Workflow loaded.', 'success');
    } else {
      showToast(`Load failed: ${result.error}`, 'error');
    }
  }

  return (
    <div style={toolbar}>
      {!viewMode && (
        <div style={{ position: 'relative' }}>
          <button style={btn('#2563eb')} onClick={() => setAddMenuOpen((o) => !o)}>+ Add Node</button>
          {addMenuOpen && (
            <div style={menu}>
              {NODE_TYPES.map(({ type, label, color }) => (
                <button key={type} style={menuItem(color)} onClick={() => addNode(type)}>{label}</button>
              ))}
            </div>
          )}
        </div>
      )}
      {!viewMode && <button style={btn('#16a34a')} onClick={handleValidate}>Validate</button>}
      {!viewMode && <button style={btn('#0f766e')} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>}
      <button style={btn('#64748b')} onClick={handleLoad}>Load</button>
      <button style={btn(viewMode ? '#7c3aed' : '#94a3b8')} onClick={() => setViewMode(!viewMode)}>
        {viewMode ? 'Edit Mode' : 'View Mode'}
      </button>
    </div>
  );
}

const toolbar: React.CSSProperties = {
  position: 'absolute', top: 12, left: 12, display: 'flex', gap: 8, zIndex: 10,
};

function btn(color: string): React.CSSProperties {
  return {
    background: color, color: '#fff', border: 'none', borderRadius: 6,
    padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
  };
}

const menu: React.CSSProperties = {
  position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#fff',
  border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
  overflow: 'hidden', minWidth: 140, zIndex: 20,
};

function menuItem(color: string): React.CSSProperties {
  return {
    display: 'block', width: '100%', padding: '8px 16px', textAlign: 'left',
    background: 'none', border: 'none', borderBottom: '1px solid #f1f5f9',
    fontSize: 13, color, fontWeight: 600, cursor: 'pointer',
  };
}
