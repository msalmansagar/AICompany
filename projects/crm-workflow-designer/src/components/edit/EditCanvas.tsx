import { useCallback, useEffect, type ReactNode } from 'react';
import React from 'react';
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
import type { ICrmAdapter } from '@/services/ICrmAdapter';

const validationService = new ValidationService();

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
    clearValidationResults,
    startSimulation,
    stopSimulation,
    simStepBack,
    startAutoSimulation,
    stopAutoSimulation,
  } = useWorkflowStore((s) => ({
    process: s.process,
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
    clearValidationResults: s.clearValidationResults,
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

  const handleValidate = useCallback(() => {
    if (!process) return;
    const results = validationService.validate({ process, steps, outcomes, routes, stepOrder, outcomeOrder });
    setValidationResults(results);
  }, [process, steps, outcomes, routes, stepOrder, outcomeOrder, setValidationResults]);

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

  const handleBack = useCallback(() => {
    if (isDirty) {
      const confirmed = window.confirm('You have unsaved changes. Leave without saving?');
      if (!confirmed) return;
    }
    onExitEdit();
  }, [isDirty, onExitEdit]);

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
        isSimulating={isSimulating}
        canSimulate={canSimulate}
        canSimStepBack={canSimStepBack}
        validationErrorCount={validationErrorCount}
        onBack={handleBack}
        onAddStep={editMode.addStep}
        onReLayout={editMode.reLayout}
        onSave={() => void save()}
        onPublish={() => void publish()}
        onDiscard={handleDiscard}
        onUndo={() => undo()}
        onRedo={() => redo()}
        canUndo={canUndo}
        canRedo={canRedo}
        onValidate={handleValidate}
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
              fitViewOptions={{ padding: 0.2 }}
              proOptions={{ hideAttribution: true }}
              minZoom={0.08}
              maxZoom={2.5}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#0f172a" />
              <Controls showInteractive={false} />
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
              fitViewOptions={{ padding: 0.2 }}
              proOptions={{ hideAttribution: true }}
              minZoom={0.08}
              maxZoom={2.5}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
              <Controls showInteractive={false} />
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
              fitViewOptions={{ padding: 0.2 }}
              proOptions={{ hideAttribution: true }}
              minZoom={0.08}
              maxZoom={2.5}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
              <Controls showInteractive={false} />
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
          <div style={sidebarStyle}>
            <ValidationPanel
              onNodeFocus={selectNode}
              onClose={clearValidationResults}
            />
            {propertiesPanel}
          </div>
        )}
      </div>
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
    return <OutcomePropertiesPanel outcomeId={selectedId} />;
  }

  if (selectedId.startsWith('route_edge_')) {
    const routeId = selectedId.replace('route_edge_', '');
    return <RoutePropertiesPanel routeId={routeId} adapter={adapter} />;
  }

  return <StepNavigatorPanel />;
}

function StepNavigatorPanel() {
  const { steps, stepOrder, selectNode } = useWorkflowStore((s) => ({
    steps: s.steps,
    stepOrder: s.stepOrder,
    selectNode: s.selectNode,
  }));

  return (
    <div style={navPanelStyle}>
      <div style={navHeaderStyle}>
        Steps
        <span style={navCountStyle}>{stepOrder.length}</span>
      </div>
      <div style={navBodyStyle}>
        {stepOrder.length === 0 ? (
          <div style={navEmptyStyle}>No steps yet. Click "Add Step" to begin.</div>
        ) : (
          stepOrder.map((stepId, idx) => {
            const step = steps[stepId];
            if (!step) return null;
            const assignDisplay =
              step.assignTo === 'user'
                ? step.assignedUserName ?? 'Unassigned'
                : step.assignTo === 'team'
                ? step.teamName ?? 'No team'
                : step.roundRobinTeamName ?? 'No team';
            return (
              <button
                key={stepId}
                type="button"
                style={navRowStyle}
                onClick={() => selectNode(`step_${stepId}`)}
              >
                <span style={navSeqStyle}>{idx + 1}</span>
                <div style={navInfoStyle}>
                  <span style={navStepNameStyle}>{step.name || 'Unnamed Step'}</span>
                  <span style={navAssignStyle}>{assignDisplay}</span>
                </div>
              </button>
            );
          })
        )}
        <div style={navHintStyle}>
          Click a step to edit · Drag handles to connect
        </div>
      </div>
    </div>
  );
}

const navPanelStyle: React.CSSProperties = {
  width: 280,
  flexShrink: 0,
  background: '#0f172a',
  borderLeft: '1px solid #1e293b',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const navHeaderStyle: React.CSSProperties = {
  padding: '10px 14px',
  fontSize: 11,
  fontWeight: 700,
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderBottom: '1px solid #1e293b',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

const navCountStyle: React.CSSProperties = {
  fontSize: 10,
  background: '#334155',
  color: '#94a3b8',
  borderRadius: 8,
  padding: '0 5px',
  fontWeight: 700,
};

const navBodyStyle: React.CSSProperties = {
  padding: '8px 10px',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  overflowY: 'auto',
  flex: 1,
};

const navEmptyStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#475569',
  fontStyle: 'italic',
  padding: '8px 4px',
};

const navRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  padding: '7px 8px',
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 5,
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
};

const navSeqStyle: React.CSSProperties = {
  minWidth: 20,
  height: 20,
  borderRadius: 4,
  background: '#334155',
  color: '#94a3b8',
  fontSize: 9,
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const navInfoStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
};

const navStepNameStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#e2e8f0',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const navAssignStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#64748b',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const navHintStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#334155',
  marginTop: 8,
  textAlign: 'center',
  fontStyle: 'italic',
};

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
