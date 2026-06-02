import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  ConnectionLineType,
  ConnectionMode,
  type Connection,
  type Node,
  type Edge,
  type IsValidConnection,
  useReactFlow,
  Panel,
} from '@xyflow/react';
import { useCallback, useEffect, useState, useRef } from 'react';
import { useWorkflowStore } from '../store/workflowStore';
import { deriveNodes, deriveEdges } from '../store/selectors';
import { nodeTypes } from '../nodes/nodeTypes';
import { edgeTypes } from '../edges/edgeTypes';
import { PropertiesPanel } from '../panels/PropertiesPanel';
import { Toolbar } from './Toolbar';
import { WorkflowToolbox } from './WorkflowToolbox';
import { ValidationToast } from './ValidationToast';
import { useAutoLayout } from '../hooks/useAutoLayout';

function CanvasActionBar() {
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const { applyAutoLayout } = useAutoLayout();
  const [showGrid, setShowGrid] = useState(true);
  const toggleGrid = useCallback(() => setShowGrid((v) => !v), []);

  return (
    <Panel position="top-right" style={canvasBarStyle}>
      <CBtn title="Fit View" onClick={() => void fitView({ padding: 0.2 })}>⊡</CBtn>
      <CBtn title="Zoom In" onClick={() => void zoomIn()}>+</CBtn>
      <CBtn title="Zoom Out" onClick={() => void zoomOut()}>−</CBtn>
      <div style={barSep} />
      <CBtn title="Auto Layout" onClick={() => void applyAutoLayout()}>⊞</CBtn>
      <CBtn title="Toggle Grid" onClick={toggleGrid} active={showGrid}>⊹</CBtn>
    </Panel>
  );
}

function CBtn({ title, onClick, children, active }: {
  title: string; onClick: () => void; children: React.ReactNode; active?: boolean;
}) {
  return (
    <button type="button" title={title} onClick={onClick} style={cBtnStyle(active ?? false)}>
      {children}
    </button>
  );
}

export function WorkflowCanvas() {
  const store = useWorkflowStore();
  const {
    selectNode,
    isPreviewMode,
    updateNodePosition,
    addStep,
    addOutcome,
    addRoute,
    assignOutcomeToStep,
    deleteStep,
    deleteOutcome,
    deleteRoute,
    showToast,
  } = store;

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showOpenDialog, setShowOpenDialog] = useState(false);

  // Sync store → React Flow canvas
  useEffect(() => {
    const state = useWorkflowStore.getState();
    setNodes(deriveNodes(state));
    setEdges(deriveEdges(state));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.steps, store.outcomes, store.routes, store.nodePositions, store.selectedId]);

  // Stable ref for nodes so onConnect closure doesn't go stale
  const nodesRef = useRef(nodes);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (isPreviewMode) return;
      if (!connection.source || !connection.target) return;

      const currentNodes = nodesRef.current;
      const sourceNode = currentNodes.find((n) => n.id === connection.source);
      const targetNode = currentNodes.find((n) => n.id === connection.target);

      if (!sourceNode || !targetNode) return;

      const srcType = sourceNode.type;
      const tgtType = targetNode.type;

      if (srcType === 'outcome' && (tgtType === 'step' || tgtType === 'end')) {
        // Outcome → Step: create a Route
        const routeId = `tmp_${crypto.randomUUID()}`;
        const routeCount = Object.keys(useWorkflowStore.getState().routes).length + 1;
        addRoute({
          crmId: routeId,
          name: `Route ${routeCount}`,
          subject: '',
          sequenceNumber: routeCount,
          filter: '',
          outcomeId: connection.source,
          nextStepId: connection.target,
        });
        selectNode(routeId);
      } else if (srcType === 'step' && tgtType === 'outcome') {
        // Step → Outcome: assign outcome to step
        const outcome = useWorkflowStore.getState().outcomes[connection.target];
        if (outcome) {
          assignOutcomeToStep(connection.target, connection.source);
        }
      } else {
        showToast(`Invalid connection: ${srcType} → ${tgtType}. Allowed: step→outcome, outcome→step.`, 'error');
      }
    },
    [isPreviewMode, addRoute, assignOutcomeToStep, selectNode, showToast]
  );

  const isValidConnection = useCallback<IsValidConnection>(
    (connectionOrEdge) => {
      const source = connectionOrEdge.source;
      const target = connectionOrEdge.target;
      if (!source || !target) return false;
      if (source === target) return false;
      const currentNodes = nodesRef.current;
      const src = currentNodes.find((n) => n.id === source);
      const tgt = currentNodes.find((n) => n.id === target);
      if (!src || !tgt) return false;
      return (
        (src.type === 'step' && tgt.type === 'outcome') ||
        (src.type === 'outcome' && (tgt.type === 'step' || tgt.type === 'end'))
      );
    },
    []
  );

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      updateNodePosition(node.id, node.position);
    },
    [updateNodePosition]
  );

  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      for (const node of deleted) {
        if (node.type === 'step') deleteStep(node.id);
        else if (node.type === 'outcome') deleteOutcome(node.id);
      }
    },
    [deleteStep, deleteOutcome]
  );

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      for (const edge of deleted) {
        // Only delete route edges from the store (stepToOutcome edges are derived)
        if (edge.type === 'route') {
          deleteRoute(edge.id.replace('edge_route_', ''));
        } else if (edge.type === 'route' || edge.data?.kind === 'route') {
          const routeId = (edge.data as { crmId?: string } | undefined)?.crmId;
          if (routeId) deleteRoute(routeId);
        }
      }
    },
    [deleteRoute]
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const nodeType = event.dataTransfer.getData('application/workflow-node');
      if (!nodeType || isPreviewMode) return;

      const bounds = event.currentTarget.getBoundingClientRect();
      const position = {
        x: event.clientX - bounds.left - 80,
        y: event.clientY - bounds.top - 30,
      };
      const id = `tmp_${crypto.randomUUID()}`;
      const currentProcess = useWorkflowStore.getState().process;

      if (nodeType === 'step' || nodeType === 'task') {
        const stepCount = Object.keys(useWorkflowStore.getState().steps).length;
        addStep({
          crmId: id,
          name: 'New Step',
          schemaName: '',
          sequenceNo: stepCount + 1,
          taskSubject: '',
          taskDescription: '',
          recordEntity: currentProcess?.recordEntity ?? '',
          regardingField: currentProcess?.regardingField ?? '',
          parentEntity: currentProcess?.parentEntity ?? '',
          assignTo: 'user',
          assignedUserId: null,
          assignedUserName: null,
          teamId: null,
          teamName: null,
          roundRobinTeamId: null,
          roundRobinTeamName: null,
          processId: currentProcess?.crmId ?? '',
        });
        updateNodePosition(id, position);
        selectNode(id);
      } else if (nodeType === 'outcome') {
        const outcomeCount = Object.keys(useWorkflowStore.getState().outcomes).length;
        addOutcome({
          crmId: id,
          name: 'Outcome',
          sequenceNumber: outcomeCount + 1,
          applyFilter: false,
          stepId: '',
        });
        updateNodePosition(id, position);
        selectNode(id);
      } else if (nodeType === 'end') {
        // End nodes are visual-only markers; add as standalone node
        const endId = `end_${crypto.randomUUID()}`;
        setNodes((prev) => [
          ...prev,
          {
            id: endId,
            type: 'end',
            position,
            data: { kind: 'end', crmId: '' },
          },
        ]);
      }
    },
    [isPreviewMode, addStep, addOutcome, updateNodePosition, selectNode, setNodes]
  );

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const isEmptyCanvas = Object.keys(store.steps).length === 0 && !store.process;

  return (
    <div style={wrapperStyle}>
      <Toolbar
        onRequestNew={() => setShowNewDialog(true)}
        onRequestOpen={() => setShowOpenDialog(true)}
        externalNewDialog={showNewDialog}
        externalOpenDialog={showOpenDialog}
        onCloseNew={() => setShowNewDialog(false)}
        onCloseOpen={() => setShowOpenDialog(false)}
      />
      <div style={bodyStyle}>
        <WorkflowToolbox />
        <div style={canvasContainerStyle} onDrop={onDrop} onDragOver={onDragOver}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={{
              type: 'smoothstep',
              animated: false,
              style: { stroke: '#94a3b8', strokeWidth: 2 },
              markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
            }}
            connectionLineType={ConnectionLineType.SmoothStep}
            connectionMode={ConnectionMode.Loose}
            isValidConnection={isValidConnection}
            onNodesChange={isPreviewMode ? undefined : onNodesChange}
            onEdgesChange={isPreviewMode ? undefined : onEdgesChange}
            onNodesDelete={onNodesDelete}
            onEdgesDelete={onEdgesDelete}
            onConnect={onConnect}
            onNodeDragStop={onNodeDragStop}
            onNodeClick={(_: React.MouseEvent, node: Node) => selectNode(node.id)}
            onEdgeClick={(_: React.MouseEvent, edge: Edge) => {
              const routeId = (edge.data as { crmId?: string } | undefined)?.crmId ?? edge.id;
              selectNode(routeId);
            }}
            onPaneClick={() => selectNode(null)}
            fitView
            fitViewOptions={{ padding: 0.25, maxZoom: 1.0 }}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={!isPreviewMode}
            nodesConnectable={!isPreviewMode}
            elementsSelectable={!isPreviewMode}
            snapToGrid
            snapGrid={[20, 20]}
            minZoom={0.1}
            maxZoom={2}
            zoomOnScroll
            panOnDrag
            selectionOnDrag={false}
            deleteKeyCode="Delete"
            multiSelectionKeyCode="Shift"
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
            <Controls showInteractive={false} />
            <MiniMap nodeColor={minimapColor} maskColor="rgba(248,250,252,0.7)" />
            <CanvasActionBar />
          </ReactFlow>

          {isEmptyCanvas && (
            <div style={emptyOverlayStyle}>
              <div style={emptyCardStyle}>
                <h2 style={emptyHeadingStyle}>Workflow Designer</h2>
                <p style={emptySubtextStyle}>Create a new workflow or open an existing one to begin</p>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                  <button style={emptyPrimaryBtn} onClick={() => setShowNewDialog(true)}>
                    + New Workflow
                  </button>
                  <button style={emptySecondaryBtn} onClick={() => setShowOpenDialog(true)}>
                    Open Workflow
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        <PropertiesPanel />
      </div>
      <ValidationToast />
    </div>
  );
}

function minimapColor(node: Node): string {
  return (
    ({
      step: '#2563eb',
      outcome: '#059669',
      end: '#dc2626',
      start: '#16a34a',
    } as Record<string, string>)[node.type ?? ''] ?? '#94a3b8'
  );
}

const wrapperStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const bodyStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  overflow: 'hidden',
  minHeight: 0,
};

const canvasContainerStyle: React.CSSProperties = {
  flex: 1,
  position: 'relative',
  overflow: 'hidden',
};

const emptyOverlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(248,250,252,0.9)',
  pointerEvents: 'auto',
  zIndex: 5,
};

const emptyCardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  padding: '40px 48px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
  textAlign: 'center',
  maxWidth: 440,
};

const emptyHeadingStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  color: '#1e293b',
  margin: '0 0 8px',
};

const emptySubtextStyle: React.CSSProperties = {
  color: '#64748b',
  fontSize: 14,
  margin: '0 0 28px',
};

const emptyPrimaryBtn: React.CSSProperties = {
  padding: '10px 22px',
  background: '#2563eb',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};

const emptySecondaryBtn: React.CSSProperties = {
  padding: '10px 22px',
  background: '#f1f5f9',
  color: '#374151',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};

const canvasBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  background: '#1e293b',
  borderRadius: 8,
  padding: 4,
  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
};

const barSep: React.CSSProperties = {
  width: 1,
  height: 20,
  background: '#334155',
  margin: '0 2px',
};

function cBtnStyle(active: boolean): React.CSSProperties {
  return {
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 5,
    border: 'none',
    background: active ? '#2563eb' : 'transparent',
    color: active ? '#fff' : '#94a3b8',
    fontSize: 14,
    cursor: 'pointer',
    fontFamily: 'monospace',
    lineHeight: 1,
  };
}
