// src/components/SopCanvas/SopCanvas.tsx
import { useCallback, useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  useReactFlow,
  type NodeChange,
  type Connection,
  applyNodeChanges,
} from '@xyflow/react';
import type { Node } from '@xyflow/react';
import { useSopStore } from '@/store/sopStore';
import type { SopDesignerState, SopValidationResult } from '@/store/sopStore';
import { selectSopNodes, selectSopEdges, SOP_SYNTHETIC_PREFIX } from '@/store/sopSelectors';
import { validateSopForPublish } from '@/validators/sopValidator';
import { useSopSave } from '@/hooks/useSopSave';
import { nodeTypes } from '@/nodes/nodeTypes';
import { SOP_STATUS } from '@/types/SopTypes';
import type { ISopAdapter } from '@/services/ISopAdapter';
import type { SopStep, SopOutcome } from '@/types/SopTypes';
import { CreateProcessWizardModal } from '@/components/CreateProcessWizard/CreateProcessWizardModal';
import { SopStepPanel } from './SopStepPanel';
import { SopOutcomePanel } from './SopOutcomePanel';

interface SopCanvasProps {
  adapter: ISopAdapter;
  onBack(): void;
}

export function SopCanvas({ adapter, onBack }: SopCanvasProps) {
  const { fitView } = useReactFlow();
  const store = useSopStore();
  const { saveSopCanvas } = useSopSave();

  // Lazy init so the first render already has nodes; edges referencing those nodes
  // will be visible immediately instead of being silently dropped by ReactFlow.
  const [nodes, setNodes] = useState<Node[]>(() =>
    selectSopNodes(useSopStore.getState() as unknown as SopDesignerState)
  );
  const [showWizard, setShowWizard] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastIsError, setToastIsError] = useState(false);

  const state = useSopStore();

  useEffect(() => {
    setNodes(selectSopNodes(state));
  }, [state.steps, state.stepOrder, state.outcomes, state.nodePositions, state.selectedId, state.validationResults, state]);

  const edges = selectSopEdges(state);

  const sopSteps: SopStep[] = state.stepOrder.map((id) => state.steps[id]).filter(Boolean);

  useEffect(() => {
    setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 80);
  }, [fitView]);

  const showToast = useCallback((msg: string, isError = false) => {
    setToastMsg(msg);
    setToastIsError(isError);
    setTimeout(() => setToastMsg(null), 3500);
  }, []);

  const handleAddStep = useCallback(() => {
    const newSeq = state.stepOrder.length + 1;
    const tmpId = `tmp_step_${crypto.randomUUID()}`;
    const step: SopStep = {
      id: tmpId, name: `Step ${newSeq}`,
      description: '', sequenceNo: newSeq,
      sopId: state.sop?.id ?? '',
      roleId: null, roleName: null, roleStatus: null,
    };
    store.addStep(step, { x: 0, y: 0 }); // swimlane layout computes real position
    store.setSelected(tmpId);
  }, [state.stepOrder.length, state.sop, store]);

  const handlePublish = useCallback(async () => {
    const errors = validateSopForPublish(state);
    if (errors.length > 0) {
      store.setValidationResults(errors);
      return;
    }
    try {
      if (state.isDirty) await saveSopCanvas();
      await adapter.updateSop(state.sop!.id, { status: SOP_STATUS.PUBLISHED });
      store.setSop({ ...state.sop!, status: SOP_STATUS.PUBLISHED });
      store.setValidationResults([]);
      showToast('SOP published successfully.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Publish failed.', true);
    }
  }, [state, store, saveSopCanvas, adapter, showToast]);

  const handleSave = useCallback(async () => {
    try {
      await saveSopCanvas();
      showToast('SOP saved.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed.', true);
    }
  }, [saveSopCanvas, showToast]);

  const handleBack = useCallback(() => {
    if (state.isDirty) {
      if (!window.confirm('You have unsaved changes. Leave without saving?')) return;
    }
    store.resetSopCanvas();
    onBack();
  }, [state.isDirty, store, onBack]);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.id.startsWith(SOP_SYNTHETIC_PREFIX)) return;
    store.setSelected(node.id);
  }, [store]);

  const handlePaneClick = useCallback(() => {
    store.setSelected(null);
  }, [store]);

  const handleConnect = useCallback((connection: Connection) => {
    const { source, target } = connection;
    if (!source || !target) return;
    // outcome → step connection: set nextSopStepId
    if (state.outcomes[source] && state.steps[target]) {
      store.updateOutcome(source, { nextSopStepId: target });
    }
  }, [state.outcomes, state.steps, store]);

  const selectedStep = state.selectedId && state.steps[state.selectedId]
    ? state.steps[state.selectedId]
    : null;
  const selectedOutcome = state.selectedId && state.outcomes[state.selectedId]
    ? state.outcomes[state.selectedId]
    : null;

  const canPublish = state.sop?.status !== SOP_STATUS.PUBLISHED;

  return (
    <div style={shellStyle}>
      {toastMsg && (
        <ToastBanner message={toastMsg} isError={toastIsError} onClose={() => setToastMsg(null)} />
      )}

      {/* Toolbar */}
      <div style={toolbarStyle}>
        <button type="button" style={backBtnStyle} onClick={handleBack}>
          ← SOPs
        </button>
        <div style={toolbarDividerStyle} />
        <span style={sopNameStyle}>{state.sop?.name ?? 'SOP Designer'}</span>
        {state.sop?.status === SOP_STATUS.PUBLISHED && (
          <span style={publishedBadgeStyle}>Published</span>
        )}
        {state.isDirty && <span style={dirtyBadgeStyle}>Unsaved</span>}

        <div style={{ flex: 1 }} />

        <button type="button" style={addStepBtnStyle} onClick={handleAddStep} disabled={!state.sop}>
          + Add Step
        </button>
        <button
          type="button"
          style={state.isSaving ? saveBtnDisabledStyle : saveBtnStyle}
          onClick={() => void handleSave()}
          disabled={state.isSaving || !state.isDirty}
        >
          {state.isSaving ? 'Saving…' : 'Save'}
        </button>
        {canPublish && (
          <button type="button" style={publishBtnStyle} onClick={() => void handlePublish()}>
            Publish
          </button>
        )}
        {state.sop?.status === SOP_STATUS.PUBLISHED && (
          <button
            type="button"
            style={createProcessBtnStyle}
            onClick={() => setShowWizard(true)}
          >
            Create Process
          </button>
        )}
      </div>

      {/* Validation errors */}
      {state.validationResults.length > 0 && (
        <ValidationBanner
          results={state.validationResults}
          onDismiss={() => store.setValidationResults([])}
        />
      )}

      {/* Canvas + panel */}
      <div style={bodyStyle}>
        <div style={canvasWrapStyle}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={handleNodesChange}
            onNodeClick={handleNodeClick}
            onPaneClick={handlePaneClick}
            onConnect={handleConnect}
            nodesConnectable
            nodesDraggable={false}
            elementsSelectable
            deleteKeyCode={null}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            proOptions={{ hideAttribution: true }}
            minZoom={0.08}
            maxZoom={2.5}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        {selectedStep && (
          <SopStepPanel
            step={selectedStep}
            steps={sopSteps}
            outcomes={Object.values(state.outcomes).filter((o) => o.sopStepId === selectedStep.id)}
            adapter={adapter}
            onUpdateStep={(patch) => store.updateStep(selectedStep.id, patch)}
            onAddOutcome={() => {
              const existingCount = (state.outcomeOrder[selectedStep.id] ?? []).length;
              const tmpId = `tmp_outcome_${crypto.randomUUID()}`;
              const outcome: SopOutcome = {
                id: tmpId, name: `Outcome ${existingCount + 1}`,
                sequenceNo: existingCount + 1,
                sopStepId: selectedStep.id, nextSopStepId: null,
              };
              store.addOutcome(outcome);
              // swimlane layout computes position from outcomeOrder index
            }}
            onRemoveStep={() => {
              if (window.confirm('Delete this step and all its outcomes?')) {
                store.removeStep(selectedStep.id);
                store.setSelected(null);
              }
            }}
            onClose={() => store.setSelected(null)}
          />
        )}

        {selectedOutcome && (
          <SopOutcomePanel
            outcome={selectedOutcome}
            steps={sopSteps}
            onUpdate={(patch) => store.updateOutcome(selectedOutcome.id, patch)}
            onRemove={() => {
              if (window.confirm('Delete this outcome?')) {
                store.removeOutcome(selectedOutcome.id);
                store.setSelected(null);
              }
            }}
            onClose={() => store.setSelected(null)}
          />
        )}
      </div>

      {showWizard && state.sop && (
        <CreateProcessWizardModal
          sop={state.sop}
          sopSteps={sopSteps}
          isOpen={showWizard}
          onDismiss={() => setShowWizard(false)}
          onSuccess={(newProcessId) => {
            setShowWizard(false);
            showToast(`Process created successfully (ID: ${newProcessId.slice(0, 8)}…)`);
          }}
        />
      )}
    </div>
  );
}

function ValidationBanner({ results, onDismiss }: { results: SopValidationResult[]; onDismiss(): void }) {
  return (
    <div style={validationBannerStyle}>
      <div style={validationHeaderRowStyle}>
        <span style={validationTitleStyle}>
          ⚠ {results.length} validation error{results.length !== 1 ? 's' : ''} — fix before publishing
        </span>
        <button type="button" onClick={onDismiss} style={validationDismissBtnStyle} title="Dismiss">×</button>
      </div>
      <ul style={validationListStyle}>
        {results.map((r, i) => (
          <li key={i} style={validationItemStyle}>
            <span style={validationCodeStyle}>{r.code}</span>
            {r.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ToastBanner({ message, isError, onClose }: { message: string; isError: boolean; onClose(): void }) {
  return (
    <div style={{
      position: 'absolute', top: 52, left: '50%', transform: 'translateX(-50%)',
      zIndex: 8000, display: 'flex', alignItems: 'center', gap: 10,
      background: isError ? '#fef2f2' : '#f0fdf4',
      border: `1px solid ${isError ? '#fca5a5' : '#86efac'}`,
      borderRadius: 8, padding: '10px 16px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
      fontSize: 13, color: isError ? '#991b1b' : '#166534',
      maxWidth: 480, minWidth: 260,
    }}>
      <span style={{ flex: 1 }}>{message}</span>
      <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'inherit', padding: 0 }}>
        ×
      </button>
    </div>
  );
}

const shellStyle: React.CSSProperties = {
  width: '100%', height: '100%', display: 'flex',
  flexDirection: 'column', overflow: 'hidden', position: 'relative',
};

const toolbarStyle: React.CSSProperties = {
  height: 48, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
  padding: '0 12px', background: '#fff',
  borderBottom: '1px solid #e2e8f0',
  fontFamily: '"Segoe UI", system-ui, sans-serif',
};

const backBtnStyle: React.CSSProperties = {
  height: 30, padding: '0 12px', background: 'transparent',
  border: '1px solid #e2e8f0', borderRadius: 5,
  fontSize: 12, fontWeight: 500, color: '#475569', cursor: 'pointer',
};

const toolbarDividerStyle: React.CSSProperties = {
  width: 1, height: 24, background: '#e2e8f0', flexShrink: 0,
};

const sopNameStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 700, color: '#0f172a',
};

const publishedBadgeStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: '#166534',
  background: '#dcfce7', border: '1px solid #86efac',
  borderRadius: 4, padding: '1px 7px',
};

const dirtyBadgeStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: '#92400e',
  background: '#fffbeb', border: '1px solid #fde68a',
  borderRadius: 4, padding: '1px 7px',
};

const addStepBtnStyle: React.CSSProperties = {
  height: 30, padding: '0 14px',
  background: '#f8fafc', border: '1px solid #e2e8f0',
  borderRadius: 5, fontSize: 12, fontWeight: 600,
  color: '#0f766e', cursor: 'pointer',
};

const saveBtnStyle: React.CSSProperties = {
  height: 30, padding: '0 14px',
  background: '#2563eb', border: 'none',
  borderRadius: 5, fontSize: 12, fontWeight: 600,
  color: '#fff', cursor: 'pointer',
};

const saveBtnDisabledStyle: React.CSSProperties = {
  ...saveBtnStyle, background: '#93c5fd', cursor: 'not-allowed',
};

const publishBtnStyle: React.CSSProperties = {
  height: 30, padding: '0 14px',
  background: '#0f766e', border: 'none',
  borderRadius: 5, fontSize: 12, fontWeight: 600,
  color: '#fff', cursor: 'pointer',
};

const createProcessBtnStyle: React.CSSProperties = {
  height: 30, padding: '0 14px',
  background: '#7c3aed', border: 'none',
  borderRadius: 5, fontSize: 12, fontWeight: 600,
  color: '#fff', cursor: 'pointer',
};

const bodyStyle: React.CSSProperties = {
  flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0,
};

const canvasWrapStyle: React.CSSProperties = {
  flex: 1, position: 'relative', overflow: 'hidden',
};

const validationBannerStyle: React.CSSProperties = {
  flexShrink: 0,
  background: '#fef2f2',
  borderBottom: '1px solid #fca5a5',
  padding: '8px 14px',
  fontFamily: '"Segoe UI", system-ui, sans-serif',
};

const validationHeaderRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center',
  justifyContent: 'space-between', marginBottom: 4,
};

const validationTitleStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: '#991b1b',
};

const validationDismissBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  fontSize: 16, color: '#991b1b', padding: 0, lineHeight: 1,
};

const validationListStyle: React.CSSProperties = {
  margin: 0, padding: '0 0 0 16px',
};

const validationItemStyle: React.CSSProperties = {
  fontSize: 12, color: '#7f1d1d', marginBottom: 2,
};

const validationCodeStyle: React.CSSProperties = {
  fontWeight: 700, marginRight: 6,
  background: '#fee2e2', borderRadius: 3,
  padding: '0 4px', fontSize: 10,
};
