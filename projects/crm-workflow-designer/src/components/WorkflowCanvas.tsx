import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Node,
  type DefaultEdgeOptions,
} from '@xyflow/react';
import { useCallback, useEffect } from 'react';
import { useWorkflowStore } from '../store/workflowStore';
import { deriveNodes, deriveEdges } from '../store/selectors';
import { nodeTypes } from '../nodes/nodeTypes';
import { edgeTypes } from '../edges/edgeTypes';
import { PropertiesPanel } from '../panels/PropertiesPanel';
import { Toolbar } from './Toolbar';
import { WorkflowToolbox } from './WorkflowToolbox';
import { ValidationToast } from './ValidationToast';

const defaultEdgeOptions: DefaultEdgeOptions = {
  type: 'smoothstep',
  animated: false,
  style: { stroke: '#94a3b8', strokeWidth: 1.5 },
};

export function WorkflowCanvas() {
  const store = useWorkflowStore();
  const {
    selectNode,
    isPreviewMode,
    selectedId,
    updateNodePosition,
    addStep,
    deleteStep,
    deleteOutcome,
    deleteRoute,
  } = store;

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<ReturnType<typeof deriveEdges>[number]>([]);

  // Sync store state → React Flow canvas whenever workflow data changes
  useEffect(() => {
    const state = useWorkflowStore.getState();
    setNodes(deriveNodes(state));
    setEdges(deriveEdges(state));
  // Re-derive when these store slices change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.steps, store.outcomes, store.routes, store.nodePositions, store.selectedId]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (isPreviewMode) return;
      setEdges((eds) => addEdge({ ...connection, id: crypto.randomUUID() }, eds));
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
          crmId: id, name: 'New Step', schemaName: `step_${Date.now()}`,
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
      }
    },
    [isPreviewMode, addStep, updateNodePosition, store.steps, store.process]
  );

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const hasSelection = !!selectedId;

  return (
    <div style={wrapper}>
      <Toolbar />
      <div style={body}>
        <WorkflowToolbox />
        <div style={{ flex: 1, position: 'relative' }} onDrop={onDrop} onDragOver={onDragOver}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            onNodesChange={isPreviewMode ? undefined : onNodesChange}
            onEdgesChange={isPreviewMode ? undefined : onEdgesChange}
            onNodesDelete={onNodesDelete}
            onConnect={onConnect}
            onNodeDragStop={onNodeDragStop}
            onNodeClick={(_: React.MouseEvent, node: Node) => selectNode(node.id)}
            onPaneClick={() => selectNode(null)}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={!isPreviewMode}
            nodesConnectable={!isPreviewMode}
            elementsSelectable={!isPreviewMode}
            snapToGrid
            snapGrid={[20, 20]}
            minZoom={0.2}
            maxZoom={2}
            deleteKeyCode="Delete"
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
            <Controls />
            <MiniMap nodeColor={minimapColor} maskColor="rgba(248,250,252,0.7)" />
          </ReactFlow>

          {/* Empty state when no process loaded */}
          {Object.keys(store.steps).length === 0 && !store.process && (
            <div style={emptyState}>
              <div style={emptyIcon}>⬡</div>
              <p style={emptyTitle}>No workflow loaded</p>
              <p style={emptyHint}>Click <strong>Open</strong> to load an existing workflow, or <strong>New</strong> to create one.</p>
            </div>
          )}
        </div>
        {hasSelection && <PropertiesPanel />}
      </div>
      <ValidationToast />
    </div>
  );
}

function minimapColor(node: Node): string {
  return ({ start: '#16a34a', step: '#2563eb', outcome: '#059669', end: '#dc2626' } as Record<string, string>)[node.type ?? ''] ?? '#94a3b8';
}

const wrapper: React.CSSProperties = { width: '100%', height: '100%', display: 'flex', flexDirection: 'column' };
const body: React.CSSProperties = { flex: 1, display: 'flex', overflow: 'hidden' };
const emptyState: React.CSSProperties = {
  position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', gap: 8,
};
const emptyIcon: React.CSSProperties = { fontSize: 48, opacity: 0.15, lineHeight: 1 };
const emptyTitle: React.CSSProperties = { fontSize: 16, fontWeight: 600, color: '#6b7280', margin: 0 };
const emptyHint: React.CSSProperties = { fontSize: 13, color: '#9ca3af', margin: 0, textAlign: 'center', maxWidth: 300 };
