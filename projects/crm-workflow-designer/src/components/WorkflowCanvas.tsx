import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
  ConnectionLineType,
  type Connection,
  type Node,
  type Edge,
} from '@xyflow/react';
import { useCallback, useEffect, useState } from 'react';
import { useWorkflowStore } from '../store/workflowStore';
import { deriveNodes, deriveEdges } from '../store/selectors';
import { nodeTypes } from '../nodes/nodeTypes';
import { edgeTypes } from '../edges/edgeTypes';
import { PropertiesPanel } from '../panels/PropertiesPanel';
import { Toolbar } from './Toolbar';
import { WorkflowToolbox } from './WorkflowToolbox';
import { ValidationToast } from './ValidationToast';

export function WorkflowCanvas() {
  const store = useWorkflowStore();
  const {
    selectNode,
    isPreviewMode,
    updateNodePosition,
    addStep,
    addOutcome,
    deleteStep,
    deleteOutcome,
    deleteRoute,
  } = store;

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showOpenDialog, setShowOpenDialog] = useState(false);

  // Sync store state to React Flow canvas whenever workflow data changes
  useEffect(() => {
    const state = useWorkflowStore.getState();
    setNodes(deriveNodes(state));
    setEdges(deriveEdges(state));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.steps, store.outcomes, store.routes, store.nodePositions, store.selectedId]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (isPreviewMode) return;
      // Allow all connections visually — validation happens on save
      setEdges((eds) => addEdge({
        ...connection,
        id: crypto.randomUUID(),
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#94a3b8', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
      }, eds));
    },
    [isPreviewMode, setEdges]
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
        else if (node.type === 'route') deleteRoute(node.id);
      }
    },
    [deleteStep, deleteOutcome, deleteRoute]
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const nodeType = event.dataTransfer.getData('application/workflow-node');
      if (!nodeType || isPreviewMode) return;

      const bounds = event.currentTarget.getBoundingClientRect();
      const position = { x: event.clientX - bounds.left - 80, y: event.clientY - bounds.top - 30 };
      const id = `tmp_${crypto.randomUUID()}`;

      if (nodeType === 'step' || nodeType === 'task') {
        addStep({
          crmId: id, name: 'New Step', schemaName: '',
          sequenceNo: Object.keys(store.steps).length + 1,
          taskSubject: '', taskDescription: '',
          recordEntity: store.process?.recordEntity ?? '',
          regardingField: store.process?.regardingField ?? '',
          parentEntity: store.process?.parentEntity ?? '',
          assignTo: 'user', assignedUserId: null, assignedUserName: null,
          teamId: null, teamName: null, enableRoundRobin: false,
          roundRobinTeamId: null, roundRobinTeamName: null,
          processId: store.process?.crmId ?? '',
        });
        updateNodePosition(id, position);
      } else if (nodeType === 'outcome') {
        addOutcome({
          crmId: id, name: 'Outcome', sequenceNumber: 1,
          applyFilter: false, stepId: '',
        });
        updateNodePosition(id, position);
      } else if (nodeType === 'end') {
        setNodes((prev) => [
          ...prev,
          {
            id: `end_${crypto.randomUUID()}`,
            type: 'end',
            position,
            data: { kind: 'end', crmId: '' },
          },
        ]);
      }
    },
    [isPreviewMode, addStep, addOutcome, updateNodePosition, store.steps, store.process, setNodes]
  );

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const isEmptyCanvas = Object.keys(store.steps).length === 0 && !store.process;

  return (
    <div style={wrapper}>
      <Toolbar
        onRequestNew={() => setShowNewDialog(true)}
        onRequestOpen={() => setShowOpenDialog(true)}
        externalNewDialog={showNewDialog}
        externalOpenDialog={showOpenDialog}
        onCloseNew={() => setShowNewDialog(false)}
        onCloseOpen={() => setShowOpenDialog(false)}
      />
      <div style={body}>
        <WorkflowToolbox />
        <div style={{ flex: 1, position: 'relative' }} onDrop={onDrop} onDragOver={onDragOver}>
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
            onNodesChange={isPreviewMode ? undefined : onNodesChange}
            onEdgesChange={isPreviewMode ? undefined : onEdgesChange}
            onNodesDelete={onNodesDelete}
            onConnect={onConnect}
            onNodeDragStop={onNodeDragStop}
            onNodeClick={(_: React.MouseEvent, node: Node) => selectNode(node.id)}
            onEdgeClick={(_: React.MouseEvent, edge: Edge) => selectNode(edge.id)}
            onPaneClick={() => selectNode(null)}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1.0 }}
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
            <Controls />
            <MiniMap nodeColor={minimapColor} maskColor="rgba(248,250,252,0.7)" />
          </ReactFlow>

          {isEmptyCanvas && (
            <div style={emptyOverlay}>
              <h2 style={emptyHeading}>Workflow Designer</h2>
              <p style={emptySubtext}>Create or open a workflow to get started</p>
              <div style={{ display: 'flex', gap: 12 }}>
                <button style={emptyBtn('#2563eb')} onClick={() => setShowNewDialog(true)}>
                  + New Workflow
                </button>
                <button style={emptyBtn('#475569')} onClick={() => setShowOpenDialog(true)}>
                  Open Workflow
                </button>
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
  return ({ start: '#16a34a', step: '#2563eb', outcome: '#059669', end: '#dc2626' } as Record<string, string>)[node.type ?? ''] ?? '#94a3b8';
}

function emptyBtn(bg: string): React.CSSProperties {
  return {
    padding: '10px 20px', background: bg, color: '#fff',
    border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600,
    cursor: 'pointer',
  };
}

const wrapper: React.CSSProperties = { width: '100%', height: '100%', display: 'flex', flexDirection: 'column' };
const body: React.CSSProperties = { flex: 1, display: 'flex', overflow: 'hidden' };
const emptyOverlay: React.CSSProperties = {
  position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', gap: 8,
  background: 'rgba(248,250,252,0.85)', pointerEvents: 'auto',
};
const emptyHeading: React.CSSProperties = { fontSize: 20, color: '#374151', margin: '0 0 8px' };
const emptySubtext: React.CSSProperties = { color: '#6b7280', marginBottom: 24, fontSize: 14 };
