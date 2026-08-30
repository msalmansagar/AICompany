import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import React from 'react';
import { useStore } from 'zustand';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useReactFlow,
} from '@xyflow/react';
import { useWorkflowStore } from '@/store/workflowStore';
import { ProcessPropertiesDialog } from './ProcessPropertiesDialog';
import { BulkStepEditor } from './BulkStepEditor';
import { ReorderStepsDialog } from './ReorderStepsDialog';
import { PublishWarningsDialog } from './PublishWarningsDialog';
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
import { confirm } from '../ui/ConfirmDialog';
import { notify } from '../ui/Notify';
import { useDemoPlayback } from '@/hooks/useDemoPlayback';
import { DemoHUD } from './DemoHUD';
import { applyFlowVisibility, DEFAULT_FLOW_VISIBILITY } from '@/services/viewFilters';
import type { FlowVisibility } from '@/services/viewFilters';
import { FlowDisplayBar } from '../common/FlowDisplayBar';
import { FitOnceMeasured } from '../common/FitOnceMeasured';
import { SmartInitialView, LARGE_GRAPH_THRESHOLD } from '../common/SmartInitialView';
import { GoToStepPanel } from '../common/GoToStepPanel';
import { centerOnNode } from '../common/canvasNavigation';
import type { GoToStepItem } from '../common/GoToStepPanel';
import type { EditStepData } from '@/nodes/EditStepNode';
import { minimapNodeColor, MINIMAP_MASK_COLOR } from '../common/minimapTheme';
import { CanvasLegend } from '../common/CanvasLegend';
import type { ICrmAdapter } from '@/services/ICrmAdapter';

const validationService = new ValidationService();

const FIT_OPTIONS = { padding: 0.25, maxZoom: 1, duration: 300 } as const;

interface EditCanvasProps {
  adapter: ICrmAdapter;
  onExitEdit: () => void;
  onOpenSummary?: () => void;
}

export function EditCanvas({ adapter, onExitEdit, onOpenSummary }: EditCanvasProps) {
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
  const { isPublishing, publish, pendingWarnings, dismissWarnings } = usePublish();
  const editMode = useEditMode(adapter);
  const demo = useDemoPlayback();
  const simMode = useSimulationMode();
  const autoSimMode = useAutoSimMode();
  useAutoSimPlayback();

  const { undo, redo, pastStates, futureStates } = useStore(useWorkflowStore.temporal);
  const canUndo = pastStates.length > 0;
  const canRedo = futureStates.length > 0;

  const canPublish = process !== null && !isTemporaryId(process.crmId);
  const processName = process?.name ?? 'New Process';
  const canSimulate = stepOrder.length > 0;
  // The demo replaces the editor's content with its own in-memory draft, so
  // it is offered whenever there is no unsaved work to clobber.
  const canDemo = !isDirty && !isSimulating && !isAutoSimulating;
  const canSimStepBack = simHistory.length > 0;
  const validationErrorCount = validationResults.filter((v) => v.severity === 'error').length;

  const reactFlow = useReactFlow();
  // The validation panel lives outside the canvas — focusing an issue both
  // selects the node and brings the camera to it.
  const focusIssueNode = useCallback(
    (canvasNodeId: string) => {
      selectNode(canvasNodeId);
      centerOnNode(reactFlow, canvasNodeId);
    },
    [selectNode, reactFlow]
  );

  const goToItems = useMemo<GoToStepItem[]>(
    () =>
      editMode.nodes
        .filter((node) => node.type === 'editStep')
        .map((node) => {
          const data = node.data as EditStepData;
          return { nodeId: node.id, label: data.name, sequenceNo: data.sequenceNo };
        })
        .sort((a, b) => a.sequenceNo - b.sequenceNo),
    [editMode.nodes]
  );
  const [showValidationPanel, setShowValidationPanel] = useState(false);
  const [showBulkEditor, setShowBulkEditor] = useState(false);
  const [showReorder, setShowReorder] = useState(false);
  // No explicit choice yet -> the minimap turns itself on for large graphs.
  const [miniMapPreference, setMiniMapPreference] = useState<boolean | null>(null);
  const showMiniMap = miniMapPreference ?? stepOrder.length > LARGE_GRAPH_THRESHOLD;
  const [showEdgeLabels, setShowEdgeLabels] = useState(true);
  const [flowVisibility, setFlowVisibility] = useState<FlowVisibility>(DEFAULT_FLOW_VISIBILITY);

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

  // CWFD-016 B3: the keyboard layer every editor is expected to have.
  // Shortcuts stay quiet inside form fields and during simulation, where the
  // canvas is read-only anyway.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'
      ) {
        return;
      }
      if (isSimulating || isAutoSimulating) return;

      const isModifier = e.ctrlKey || e.metaKey;
      if (isModifier && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) undo();
        return;
      }
      if (isModifier && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        if (canRedo) redo();
        return;
      }
      if (isModifier && e.key.toLowerCase() === 's') {
        // The browser's own Save dialog is never what anyone wants here.
        e.preventDefault();
        if (isDirty && !isSaving) void save();
        return;
      }
      if (e.key === 'Escape') {
        selectNode(null);
        return;
      }

      // Arrow nudge: 10px, or 50px with Shift — for squaring up a layout
      // without fighting the mouse.
      if (selectedId?.startsWith('step_') && e.key.startsWith('Arrow')) {
        const distance = e.shiftKey ? 50 : 10;
        const delta =
          e.key === 'ArrowUp' ? { x: 0, y: -distance }
          : e.key === 'ArrowDown' ? { x: 0, y: distance }
          : e.key === 'ArrowLeft' ? { x: -distance, y: 0 }
          : e.key === 'ArrowRight' ? { x: distance, y: 0 }
          : null;
        if (!delta) return;
        e.preventDefault();
        const node = editMode.nodes.find((n) => n.id === selectedId);
        if (!node) return;
        useWorkflowStore.getState().updateNodePosition(selectedId, {
          x: node.position.x + delta.x,
          y: node.position.y + delta.y,
        });
        return;
      }

      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
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
    [
      selectedId,
      deleteStep,
      deleteOutcome,
      selectNode,
      isSimulating,
      isAutoSimulating,
      canUndo,
      canRedo,
      undo,
      redo,
      isDirty,
      isSaving,
      save,
      editMode.nodes,
    ]
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

  // Store-raised toasts go through the one shared toast host. The bespoke
  // inline Toast lived at z-index 8000, off the layering scale entirely.
  useEffect(() => {
    if (!toastMessage) return;
    notify(toastMessage, toastType ?? 'success');
    clearToast();
  }, [toastMessage, toastType, clearToast]);

  // The same declutter filters the view toolbar has. Filtering the rendered
  // arrays leaves the store untouched — hidden work is still there on save.
  const visibleEdit = useMemo(
    () => applyFlowVisibility(editMode.nodes, editMode.edges, flowVisibility),
    [editMode.nodes, editMode.edges, flowVisibility]
  );

  const propertiesPanel = resolvePropertiesPanel(selectedId, adapter);

  return (
    <div
      style={shellStyle}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
      aria-label="Workflow edit canvas"
    >
      <EditToolbar
        processName={processName}
        canDemo={canDemo || demo.isPlaying}
        onOpenSummary={onOpenSummary}
        onDemo={demo.isPlaying ? demo.stop : demo.start}
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
        showEdgeLabels={showEdgeLabels}
        onAddStep={editMode.addStep}
        onReLayout={editMode.reLayout}
        onToggleMiniMap={() => setMiniMapPreference(!showMiniMap)}
        onToggleEdgeLabels={() => setShowEdgeLabels((isOn) => !isOn)}
        onSave={() => void save()}
        onPublish={() => void publish()}
        onDiscard={handleDiscard}
        onUndo={() => undo()}
        onRedo={() => redo()}
        canUndo={canUndo}
        canRedo={canRedo}
        onValidate={handleValidate}
        onEditProperties={() => setEditingProperties(true)}
        onBulkEdit={() => setShowBulkEditor(true)}
        onReorderSteps={() => setShowReorder(true)}
        onSimulate={startSimulation}
        onAutoSimulate={startAutoSimulation}
        onExitSimulation={stopSimulation}
        onSimStepBack={simStepBack}
        onSimReset={startSimulation}
      />

      <div style={bodyStyle}>
        <div
          style={canvasWrapStyle}
          className={!isSimulating && !isAutoSimulating && !showEdgeLabels ? 'edge-labels-hidden' : undefined}
        >
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
              nodes={visibleEdit.nodes}
              edges={visibleEdit.edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={editMode.onNodesChange}
              onNodeClick={editMode.onNodeClick}
              onEdgeClick={editMode.onEdgeClick}
              onPaneClick={editMode.onPaneClick}
              onConnect={editMode.onConnect}
              onReconnect={editMode.onReconnect}
              nodesConnectable
              nodesDraggable
              elementsSelectable
              deleteKeyCode={null}
              proOptions={{ hideAttribution: true }}
              minZoom={0.08}
              maxZoom={2.5}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--canvas-grid)" />
              <Controls showInteractive={false} />
              <SmartInitialView dir="LR" />
              <GoToStepPanel items={goToItems} onPick={selectNode} />
              <CanvasLegend />
              <FlowDisplayBar visibility={flowVisibility} onChange={setFlowVisibility} />
              {showMiniMap && (
                <MiniMap
                  nodeColor={minimapNodeColor}
                  maskColor={MINIMAP_MASK_COLOR}
                  style={{ bottom: 60 }}
                />
              )}
            </ReactFlow>
          )}

          {demo.isPlaying && demo.narration && (
            <DemoHUD
              narration={demo.narration}
              beatIndex={demo.beatIndex}
              beatCount={demo.beatCount}
              onStop={demo.stop}
            />
          )}
          {isSimulating && <SimulationPanel adapter={adapter} onExit={stopSimulation} />}
          {isAutoSimulating && autoSimPhase !== 'done' && (
            <AutoSimPlaybackHUD onStop={stopAutoSimulation} />
          )}
          {isAutoSimulating && autoSimPhase === 'done' && (
            <AutoSimulationPanel onClose={stopAutoSimulation} />
          )}
        </div>

        {/* The sidebar is for the selection. With nothing selected the canvas
            gets the full width; the step list lives on the summary screen. */}
        {!isSimulating && !isAutoSimulating && (showValidationPanel || propertiesPanel) && (
          <div className="editor-sidebar" style={sidebarStyle}>
            {showValidationPanel && (
              <ValidationPanel
                onNodeFocus={focusIssueNode}
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

      {showBulkEditor && (
        <BulkStepEditor adapter={adapter} onClose={() => setShowBulkEditor(false)} />
      )}

      {showReorder && <ReorderStepsDialog onClose={() => setShowReorder(false)} />}

      {pendingWarnings && (
        <PublishWarningsDialog
          warnings={pendingWarnings}
          onCancel={dismissWarnings}
          onPublishAnyway={() => {
            dismissWarnings();
            void publish({ acknowledgeWarnings: true });
          }}
        />
      )}
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
    return <OutcomePropertiesPanel outcomeId={selectedId} adapter={adapter} />;
  }

  if (selectedId.startsWith('route_edge_')) {
    const routeId = selectedId.replace('route_edge_', '');
    return <RoutePropertiesPanel routeId={routeId} adapter={adapter} />;
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
  minWidth: 0,
  position: 'relative',
  overflow: 'hidden',
};

const sidebarStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};
