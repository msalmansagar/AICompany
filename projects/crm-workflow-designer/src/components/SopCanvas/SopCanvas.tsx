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
import { selectSopNodes, selectSopEdges, SOP_SYNTHETIC_PREFIX, SOP_GATEWAY_PREFIX } from '@/store/sopSelectors';
import { validateSopForPublish } from '@/validators/sopValidator';
import { emptyEscalationFields } from '@/services/escalationFields';
import { useSopSave } from '@/hooks/useSopSave';
import { nodeTypes } from '@/nodes/nodeTypes';
import { SopPropertiesDialog } from './SopPropertiesDialog';
import { SOP_STATUS } from '@/types/SopTypes';
import type { ISopAdapter } from '@/services/ISopAdapter';
import type { SopStep, SopOutcome } from '@/types/SopTypes';
import { CreateProcessWizardModal } from '@/components/CreateProcessWizard/CreateProcessWizardModal';
import { SopStepPanel } from './SopStepPanel';
import { SopOutcomePanel } from './SopOutcomePanel';
import { confirm } from '@/components/ui/ConfirmDialog';

interface SopCanvasProps {
  adapter: ISopAdapter;
}

export function SopCanvas({ adapter }: SopCanvasProps) {
  const { fitView } = useReactFlow();
  const store = useSopStore();
  const { saveSopCanvas } = useSopSave();

  // Lazy init so the first render already has nodes; edges referencing those nodes
  // will be visible immediately instead of being silently dropped by ReactFlow.
  const [nodes, setNodes] = useState<Node[]>(() =>
    selectSopNodes(useSopStore.getState() as unknown as SopDesignerState)
  );
  const [showWizard, setShowWizard] = useState(false);
  const [showSopProperties, setShowSopProperties] = useState(false);
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
      stepType: 'step',
      ...emptyEscalationFields(),
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

  // Leaving is the sitemap's job now; SopListScreen carries the unsaved-changes
  // guard that used to live behind this screen's back button.

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.id.startsWith(SOP_SYNTHETIC_PREFIX)) return;
    // Gateway click selects the parent step so the step panel opens
    if (node.id.startsWith(SOP_GATEWAY_PREFIX)) {
      store.setSelected(node.id.slice(SOP_GATEWAY_PREFIX.length));
      return;
    }
    store.setSelected(node.id);
  }, [store]);

  const handlePaneClick = useCallback(() => {
    store.setSelected(null);
  }, [store]);

  const handleConnect = useCallback((connection: Connection) => {
    const { source, target } = connection;
    if (!source || !target) return;
    if (source.startsWith(SOP_GATEWAY_PREFIX)) return;
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

      {/* The sitemap owns navigation, so there is no back button here — the
          command bar carries only what acts on this SOP. */}
      <div className="cmdbar">
        <button type="button" className="cmd primary" onClick={handleAddStep} disabled={!state.sop}>
          + Add step
        </button>
        <span className="cmd-sep" />
        <button
          type="button"
          className="cmd"
          onClick={() => void handleSave()}
          disabled={state.isSaving || !state.isDirty}
        >
          {state.isSaving ? 'Saving…' : 'Save'}
        </button>
        {canPublish && (
          <button type="button" className="cmd" onClick={() => void handlePublish()}>
            Publish
          </button>
        )}
        {state.sop?.status === SOP_STATUS.PUBLISHED && (
          <button type="button" className="cmd" onClick={() => setShowWizard(true)}>
            Create process
          </button>
        )}
        <span className="cmd-sep" />
        <button
          type="button"
          className="cmd"
          onClick={() => setShowSopProperties(true)}
          disabled={!state.sop}
        >
          Properties
        </button>

        <span className="cmd-spacer" />

        <span style={sopNameStyle}>{state.sop?.name ?? 'SOP Designer'}</span>
        {state.sop?.status === SOP_STATUS.PUBLISHED && <span className="pill published">Published</span>}
        {state.isDirty && <span className="pill warning">Unsaved</span>}
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
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--text)" />
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
              void confirm({
                title: 'Delete step',
                message: 'Delete this step and all its outcomes?',
                tone: 'danger',
              }).then((confirmed) => {
                if (!confirmed) return;
                store.removeStep(selectedStep.id);
                store.setSelected(null);
              });
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
              void confirm({ title: 'Delete outcome', message: 'Delete this outcome?', tone: 'danger' }).then((confirmed) => {
                if (!confirmed) return;
                store.removeOutcome(selectedOutcome.id);
                store.setSelected(null);
              });
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

      {showSopProperties && state.sop && (
        <SopPropertiesDialog
          sop={state.sop}
          onClose={() => setShowSopProperties(false)}
          onSave={(patch) => {
            store.updateSop(patch);
            setShowSopProperties(false);
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
      background: isError ? 'var(--error-bg)' : 'var(--success-bg)',
      border: `1px solid ${isError ? 'var(--error)' : 'var(--success)'}`,
      borderRadius: 8, padding: '10px 16px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
      fontSize: 13, color: isError ? 'var(--error)' : 'var(--success)',
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

const sopNameStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 700, color: 'var(--text)',
};

const bodyStyle: React.CSSProperties = {
  flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0,
};

const canvasWrapStyle: React.CSSProperties = {
  flex: 1, position: 'relative', overflow: 'hidden',
};

const validationBannerStyle: React.CSSProperties = {
  flexShrink: 0,
  background: 'var(--error-bg)',
  borderBottom: '1px solid var(--error)',
  padding: '8px 14px',
  fontFamily: '"Segoe UI", system-ui, sans-serif',
};

const validationHeaderRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center',
  justifyContent: 'space-between', marginBottom: 4,
};

const validationTitleStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: 'var(--error)',
};

const validationDismissBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  fontSize: 16, color: 'var(--error)', padding: 0, lineHeight: 1,
};

const validationListStyle: React.CSSProperties = {
  margin: 0, padding: '0 0 0 16px',
};

const validationItemStyle: React.CSSProperties = {
  fontSize: 12, color: 'var(--error)', marginBottom: 2,
};

const validationCodeStyle: React.CSSProperties = {
  fontWeight: 700, marginRight: 6,
  background: 'var(--error-bg)', borderRadius: 3,
  padding: '0 4px', fontSize: 10,
};
