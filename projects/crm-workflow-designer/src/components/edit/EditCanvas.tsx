import { useCallback, useEffect, useState, type ReactNode } from 'react';
import React from 'react';
import { useStore } from 'zustand';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
} from '@xyflow/react';
import { useWorkflowStore } from '@/store/workflowStore';
import { ProcessPropertiesDialog } from './ProcessPropertiesDialog';
import { useWorkflowSave } from '@/hooks/useWorkflowSave';
import { usePublish } from '@/hooks/usePublish';
import { useEditMode } from '@/hooks/useEditMode';
import { useSimulationMode } from '@/hooks/useSimulationMode';
import { useAutoSimMode } from '@/hooks/useAutoSimMode';
import { useAutoSimPlayback } from '@/hooks/useAutoSimPlayback';
import { nodeTypes } from '@/nodes/nodeTypes';
import { edgeTypes } from '@/edges/edgeTypes';
import { isTemporaryId } from '@/services/assertGuid';
import { EditToolbar } from './EditToolbar';
import { StepPropertiesPanel } from './StepPropertiesPanel';
import { OutcomePropertiesPanel } from './OutcomePropertiesPanel';
import { SimulationPanel } from './SimulationPanel';
import { AutoSimulationPanel } from './AutoSimulationPanel';
import { AutoSimPlaybackHUD } from './AutoSimPlaybackHUD';
import { ValidationPanel } from './ValidationPanel';
import { ValidationService } from '@/services/ValidationService';
import { RoutePropertiesPanel } from './RoutePropertiesPanel';
import { StepNavigatorPanel } from './StepNavigatorPanel';
import { confirm } from '../ui/ConfirmDialog';
import { FitOnceMeasured } from '../common/FitOnceMeasured';
import { minimapNodeColor, MINIMAP_MASK_COLOR } from '../common/minimapTheme';
import { CanvasLegend } from '../common/CanvasLegend';
import type { ICrmAdapter } from '@/services/ICrmAdapter';

const validationService = new ValidationService();

const FIT_OPTIONS = { padding: 0.25, maxZoom: 1, duration: 300 } as const;

interface EditCanvasProps {
  adapter: ICrmAdapter;
  onExitEdit: () => void;
}

export function EditCanvas({ adapter, onExitEdit }: EditCanvasProps) {
  const [isEditingProperties, setEditingProperties] = useState(false);

  const {
    process,
    setProcess,
    selectedId,
    isDirty,
    toastMessage,
    toastType,
    stepOrder,
    isSimulating,
    isAutoSimulating,
    autoSimPhase,
    simHistory,
    validationResults,
    steps,
    outcomes,
    routes,
    outcomeOrder,
    deleteStep,
    deleteOutcome,
    selectNode,
    clearToast,
    setValidationResults,
    startSimulation,
    stopSimulation,
    simStepBack,
    startAutoSimulation,
    stopAutoSimulation,
  } = useWorkflowStore((s) => ({
    process: s.process,
    setProcess: s.setProcess,
    selectedId: s.selectedId,
    isDirty: s.isDirty,
    toastMessage: s.toastMessage,
    toastType: s.toastType,
    stepOrder: s.stepOrder,
    isSimulating: s.isSimulating,
    isAutoSimulating: s.isAutoSimulating,
    autoSimPhase: s.autoSimPhase,
    simHistory: s.simHistory,
    validationResults: s.validationResults,
    steps: s.steps,
    outcomes: s.outcomes,
    routes: s.routes,
    outcomeOrder: s.outcomeOrder,
    deleteStep: s.deleteStep,
    deleteOutcome: s.deleteOutcome,
    selectNode: s.selectNode,
    clearToast: s.clearToast,
    setValidationResults: s.setValidationResults,
    startSimulation: s.startSimulation,
    stopSimulation: s.stopSimulation,
    simStepBack: s.simStepBack,
    startAutoSimulation: s.startAutoSimulation,
    stopAutoSimulation: s.stopAutoSimulation,
  }));

  const { isSaving, save } = useWorkflowSave();
  const { isPublishing, publish } = usePublish();
  const editMode = useEditMode(adapter);
  const simMode = useSimulationMode();
  const autoSimMode = useAutoSimMode();
  useAutoSimPlayback();

  const { undo, redo, pastStates, futureStates } = useStore(useWorkflowStore.temporal);
  const canUndo = pastStates.length > 0;
  const canRedo = futureStates.length > 0;

  const canPublish = process !== null && !isTemporaryId(process.crmId);
  const processName = process?.name ?? 'New Process';
  const canSimulate = stepOrder.length > 0;
  const canSimStepBack = simHistory.length > 0;
  const validationErrorCount = validationResults.filter((v) => v.severity === 'error').length;
  const [showValidationPanel, setShowValidationPanel] = useState(false);
  const [showMiniMap, setShowMiniMap] = useState(false);

  // Live, debounced validation — keeps node error badges and the toolbar count
  // current as the workflow is edited, without waiting for the Validate button.
  useEffect(() => {
    if (!process) return;
    const handle = setTimeout(() => {
      setValidationResults(
        validationService.validate({ process, steps, outcomes, routes, stepOrder, outcomeOrder })
      );
    }, 400);
    return () => clearTimeout(handle);
  }, [process, steps, outcomes, routes, stepOrder, outcomeOrder, setValidationResults]);

  const handleValidate = useCallback(() => {
    if (!process) return;
    setValidationResults(validationService.validate({ process, steps, outcomes, routes, stepOrder, outcomeOrder }));
    setShowValidationPanel(true);
  }, [process, steps, outcomes, routes, stepOrder, outcomeOrder, setValidationResults]);

  // No manual delayed fit: each canvas passes the fitView prop to React Flow,
  // which now fires correctly because useSyncedNodes keeps nodes measured —
  // the old fixed 80ms delay raced measurement and mis-framed simulation.

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (!selectedId) return;

      if (selectedId.startsWith('step_')) {
        const stepId = selectedId.replace('step_', '');
        void confirm({
          title: 'Delete step',
          message: 'Delete this step? All connected outcomes will also be deleted.',
          tone: 'danger',
        }).then((confirmed) => {
          if (!confirmed) return;
          deleteStep(stepId);
          selectNode(null);
        });
      } else if (selectedId.startsWith('outcome_')) {
        const outcomeId = selectedId.replace('outcome_', '');
        void confirm({ title: 'Delete outcome', message: 'Delete this outcome?', tone: 'danger' }).then((confirmed) => {
          if (!confirmed) return;
          deleteOutcome(outcomeId);
          selectNode(null);
        });
      }
    },
    [selectedId, deleteStep, deleteOutcome, selectNode]
  );

  // Leaving the editor is the sitemap's job now, and App guards that against
  // discarding unsaved work — which is what this screen's back button did.

  const handleDiscard = useCallback(() => {
    void confirm({
      title: 'Discard changes',
      message: 'Discard all unsaved changes?',
      confirmLabel: 'Discard',
      tone: 'danger',
    }).then((confirmed) => {
      if (confirmed) onExitEdit();
    });
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
        workflowState={process?.workflowState}
        isDirty={isDirty}
        isSaving={isSaving}
        isPublishing={isPublishing}
        canPublish={canPublish}
        isSimulating={isSimulating}
        canSimulate={canSimulate}
        canSimStepBack={canSimStepBack}
        validationErrorCount={validationErrorCount}
        showMiniMap={showMiniMap}
        onAddStep={editMode.addStep}
        onReLayout={editMode.reLayout}
        onToggleMiniMap={() => setShowMiniMap((isOn) => !isOn)}
        onSave={() => void save()}
        onPublish={() => void publish()}
        onDiscard={handleDiscard}
        onUndo={() => undo()}
        onRedo={() => redo()}
        canUndo={canUndo}
        canRedo={canRedo}
        onValidate={handleValidate}
        onEditProperties={() => setEditingProperties(true)}
        onSimulate={startSimulation}
        onAutoSimulate={startAutoSimulation}
        onExitSimulation={stopSimulation}
        onSimStepBack={simStepBack}
        onSimReset={startSimulation}
      />

      <div style={bodyStyle}>
        <div style={canvasWrapStyle}>
          {isSimulating ? (
            <ReactFlow
              nodes={simMode.nodes}
              edges={simMode.edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={simMode.onNodesChange}
              nodesConnectable={false}
              nodesDraggable={false}
              elementsSelectable={false}
              deleteKeyCode={null}
              fitView
              fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
              proOptions={{ hideAttribution: true }}
              minZoom={0.08}
              maxZoom={2.5}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--canvas-grid)" />
              <Controls showInteractive={false} />
              <FitOnceMeasured options={FIT_OPTIONS} />
            </ReactFlow>
          ) : isAutoSimulating && autoSimPhase !== 'done' ? (
            <ReactFlow
              nodes={autoSimMode.nodes}
              edges={autoSimMode.edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={autoSimMode.onNodesChange}
              nodesConnectable={false}
              nodesDraggable={false}
              elementsSelectable={false}
              deleteKeyCode={null}
              fitView
              fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
              proOptions={{ hideAttribution: true }}
              minZoom={0.08}
              maxZoom={2.5}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--canvas-grid)" />
              <Controls showInteractive={false} />
              <FitOnceMeasured options={FIT_OPTIONS} />
            </ReactFlow>
          ) : (
            <ReactFlow
              nodes={editMode.nodes}
              edges={editMode.edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
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
              fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
              proOptions={{ hideAttribution: true }}
              minZoom={0.08}
              maxZoom={2.5}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--canvas-grid)" />
              <Controls showInteractive={false} />
              <FitOnceMeasured options={FIT_OPTIONS} />
              <CanvasLegend />
              {showMiniMap && (
                <MiniMap
                  nodeColor={minimapNodeColor}
                  maskColor={MINIMAP_MASK_COLOR}
                  style={{ bottom: 60 }}
                />
              )}
            </ReactFlow>
          )}

          {isSimulating && <SimulationPanel adapter={adapter} onExit={stopSimulation} />}
          {isAutoSimulating && autoSimPhase !== 'done' && (
            <AutoSimPlaybackHUD onStop={stopAutoSimulation} />
          )}
          {isAutoSimulating && autoSimPhase === 'done' && (
            <AutoSimulationPanel onClose={stopAutoSimulation} />
          )}
        </div>

        {!isSimulating && !isAutoSimulating && (
          <div className="editor-sidebar" style={sidebarStyle}>
            {showValidationPanel && (
              <ValidationPanel
                onNodeFocus={selectNode}
                onClose={() => setShowValidationPanel(false)}
              />
            )}
            {propertiesPanel}
          </div>
        )}
      </div>

      {/* Mounted only while open, so it always opens showing what is stored now. */}
      {isEditingProperties && process && (
        <ProcessPropertiesDialog
          process={process}
          adapter={adapter}
          stepCount={Object.keys(steps).length}
          onSave={(updated) => { setProcess(updated); setEditingProperties(false); }}
          onDismiss={() => setEditingProperties(false)}
        />
      )}
    </div>
  );
}

function resolvePropertiesPanel(
  selectedId: string | null,
  adapter: ICrmAdapter
): ReactNode {
  if (!selectedId) return <StepNavigatorPanel />;

  if (selectedId.startsWith('step_')) {
    const stepId = selectedId.replace('step_', '');
    return <StepPropertiesPanel stepId={stepId} adapter={adapter} />;
  }

  if (selectedId.startsWith('outcome_')) {
    return <OutcomePropertiesPanel outcomeId={selectedId} adapter={adapter} />;
  }

  if (selectedId.startsWith('route_edge_')) {
    const routeId = selectedId.replace('route_edge_', '');
    return <RoutePropertiesPanel routeId={routeId} adapter={adapter} />;
  }

  return <StepNavigatorPanel />;
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
  minWidth: 0,
  position: 'relative',
  overflow: 'hidden',
};

const sidebarStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
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
      background: isError ? 'var(--error-bg)' : 'var(--success-bg)',
      border: `1px solid ${isError ? 'var(--error)' : 'var(--success)'}`,
      borderRadius: 8, padding: '10px 16px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
      fontSize: 13, color: isError ? 'var(--error)' : 'var(--success)',
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


