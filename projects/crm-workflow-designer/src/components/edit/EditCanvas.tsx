import { useCallback, useEffect, type ReactNode } from 'react';
import { useStore } from 'zustand';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  useReactFlow,
} from '@xyflow/react';
import { useWorkflowStore } from '@/store/workflowStore';
import { useWorkflowSave } from '@/hooks/useWorkflowSave';
import { usePublish } from '@/hooks/usePublish';
import { useEditMode } from '@/hooks/useEditMode';
import { nodeTypes } from '@/nodes/nodeTypes';
import { isTemporaryId } from '@/services/assertGuid';
import { EditToolbar } from './EditToolbar';
import { StepPropertiesPanel } from './StepPropertiesPanel';
import { OutcomePropertiesPanel } from './OutcomePropertiesPanel';
import type { ICrmAdapter } from '@/services/ICrmAdapter';

interface EditCanvasProps {
  adapter: ICrmAdapter;
  onExitEdit: () => void;
}

export function EditCanvas({ adapter, onExitEdit }: EditCanvasProps) {
  const { fitView } = useReactFlow();

  const {
    process,
    selectedId,
    isDirty,
    toastMessage,
    toastType,
    deleteStep,
    deleteOutcome,
    selectNode,
    clearToast,
  } = useWorkflowStore((s) => ({
    process: s.process,
    selectedId: s.selectedId,
    isDirty: s.isDirty,
    toastMessage: s.toastMessage,
    toastType: s.toastType,
    deleteStep: s.deleteStep,
    deleteOutcome: s.deleteOutcome,
    selectNode: s.selectNode,
    clearToast: s.clearToast,
  }));

  const { isSaving, save } = useWorkflowSave();
  const { isPublishing, publish } = usePublish();
  const editMode = useEditMode(adapter);

  const { undo, redo, pastStates, futureStates } = useStore(useWorkflowStore.temporal);
  const canUndo = pastStates.length > 0;
  const canRedo = futureStates.length > 0;

  const canPublish = process !== null && !isTemporaryId(process.crmId);
  const processName = process?.name ?? 'New Process';

  useEffect(() => {
    setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 80);
  }, [fitView]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (!selectedId) return;

      if (selectedId.startsWith('step_')) {
        const stepId = selectedId.replace('step_', '');
        const confirmed = window.confirm('Delete this step? All connected outcomes will also be deleted.');
        if (confirmed) {
          deleteStep(stepId);
          selectNode(null);
        }
      } else if (selectedId.startsWith('outcome_')) {
        const outcomeId = selectedId.replace('outcome_', '');
        const confirmed = window.confirm('Delete this outcome?');
        if (confirmed) {
          deleteOutcome(outcomeId);
          selectNode(null);
        }
      }
    },
    [selectedId, deleteStep, deleteOutcome, selectNode]
  );

  const handleDiscard = useCallback(() => {
    const confirmed = window.confirm('Discard all unsaved changes?');
    if (confirmed) onExitEdit();
  }, [onExitEdit]);

  const propertiesPanel = resolvePropertiesPanel(selectedId, adapter);

  return (
    <div
      style={shellStyle}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
      aria-label="Workflow edit canvas"
    >
      {toastMessage && (
        <Toast message={toastMessage} type={toastType ?? 'success'} onClose={clearToast} />
      )}
      <EditToolbar
        processName={processName}
        isDirty={isDirty}
        isSaving={isSaving}
        isPublishing={isPublishing}
        canPublish={canPublish}
        onAddStep={editMode.addStep}
        onSave={() => void save()}
        onPublish={() => void publish()}
        onDiscard={handleDiscard}
        onUndo={() => undo()}
        onRedo={() => redo()}
        canUndo={canUndo}
        canRedo={canRedo}
      />

      <div style={bodyStyle}>
        <div style={canvasWrapStyle}>
          <ReactFlow
            nodes={editMode.nodes}
            edges={editMode.edges}
            nodeTypes={nodeTypes}
            onNodesChange={editMode.onNodesChange}
            onNodeClick={editMode.onNodeClick}
            onEdgeClick={editMode.onEdgeClick}
            onPaneClick={editMode.onPaneClick}
            onConnect={editMode.onConnect}
            nodesConnectable
            nodesDraggable
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

        {propertiesPanel}
      </div>
    </div>
  );
}

function resolvePropertiesPanel(
  selectedId: string | null,
  adapter: ICrmAdapter
): ReactNode {
  if (!selectedId) return null;

  if (selectedId.startsWith('step_')) {
    const stepId = selectedId.replace('step_', '');
    return <StepPropertiesPanel stepId={stepId} adapter={adapter} />;
  }

  if (selectedId.startsWith('outcome_')) {
    return <OutcomePropertiesPanel outcomeId={selectedId} />;
  }

  return null;
}

const shellStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  outline: 'none',
};

const bodyStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  overflow: 'hidden',
  minHeight: 0,
};

const canvasWrapStyle: React.CSSProperties = {
  flex: 1,
  position: 'relative',
  overflow: 'hidden',
};

function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
}) {
  const isError = type === 'error';
  return (
    <div style={{
      position: 'absolute', top: 56, left: '50%', transform: 'translateX(-50%)',
      zIndex: 8000, display: 'flex', alignItems: 'center', gap: 10,
      background: isError ? '#fef2f2' : '#f0fdf4',
      border: `1px solid ${isError ? '#fca5a5' : '#86efac'}`,
      borderRadius: 8, padding: '10px 16px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
      fontSize: 13, color: isError ? '#991b1b' : '#166534',
      maxWidth: 480, minWidth: 260,
    }}>
      <span style={{ flex: 1 }}>{message}</span>
      <button
        type="button"
        onClick={onClose}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'inherit', padding: 0, lineHeight: 1 }}
      >
        ×
      </button>
    </div>
  );
}
