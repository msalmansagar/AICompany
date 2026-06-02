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
  type Edge,
  type Node,
  type DefaultEdgeOptions,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo } from 'react';
import { useWorkflowStore } from '../store/workflowStore';
import { nodeTypes } from '../nodes/nodeTypes';
import { PropertiesPanel } from '../panels/PropertiesPanel';
import { Toolbar } from './Toolbar';
import { ValidationToast } from './ValidationToast';

const defaultEdgeOptions: DefaultEdgeOptions = {
  type: 'smoothstep',
  animated: false,
  style: { stroke: '#94a3b8', strokeWidth: 1.5 },
  labelStyle: { fontSize: 10, fontWeight: 600, fill: '#475569' },
  labelBgStyle: { fill: '#f8fafc', fillOpacity: 0.9 },
  labelBgPadding: [4, 6] as [number, number],
  labelBgBorderRadius: 4,
};

export function WorkflowCanvas() {
  const {
    selectNode,
    isPreviewMode,
    selectedId,
    updateNodePosition,
    addStep,
    deleteStep,
    deleteOutcome,
    deleteRoute,
    steps,
    nodePositions,
  } = useWorkflowStore((s) => ({
    selectNode: s.selectNode,
    isPreviewMode: s.isPreviewMode,
    selectedId: s.selectedId,
    updateNodePosition: s.updateNodePosition,
    addStep: s.addStep,
    deleteStep: s.deleteStep,
    deleteOutcome: s.deleteOutcome,
    deleteRoute: s.deleteRoute,
    steps: s.steps,
    nodePositions: s.nodePositions,
  }));

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Seed a Start node on first mount if no steps exist
  useEffect(() => {
    if (Object.keys(steps).length === 0) {
      setNodes([{
        id: 'start-node',
        type: 'start',
        position: nodePositions['start-node'] ?? { x: 120, y: 200 },
        data: { label: 'Start' },
      }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const position = {
        x: event.clientX - bounds.left - 100,
        y: event.clientY - bounds.top - 40,
      };

      const id = `tmp_${crypto.randomUUID()}`;

      if (nodeType === 'step' || nodeType === 'task' || nodeType === 'approval' || nodeType === 'review') {
        addStep({
          crmId: id,
          name: `New ${nodeType.charAt(0).toUpperCase() + nodeType.slice(1)} Step`,
          schemaName: `step_${Date.now()}`,
          sequenceNo: Object.keys(steps).length + 1,
          taskSubject: '',
          taskDescription: '',
          recordEntity: '',
          regardingField: '',
          parentEntity: '',
          assignTo: 'user',
          assignedUserId: null,
          assignedUserName: null,
          teamId: null,
          teamName: null,
          enableRoundRobin: false,
          roundRobinTeamId: null,
          roundRobinTeamName: null,
          processId: '',
        });
        setNodes((prev) => [
          ...prev,
          { id, type: 'step', position, data: { crmId: id } },
        ]);
      } else if (nodeType === 'end') {
        setNodes((prev) => [
          ...prev,
          { id: `end-${crypto.randomUUID()}`, type: 'end', position, data: { label: 'End' } },
        ]);
      }
    },
    [isPreviewMode, addStep, steps, setNodes]
  );

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const panelOpen = !!selectedId;
  const flowStyle = useMemo<React.CSSProperties>(
    () => ({ width: panelOpen ? 'calc(100% - 320px)' : '100%', height: '100%' }),
    [panelOpen]
  );

  return (
    <div style={canvasWrapper} onDrop={onDrop} onDragOver={onDragOver}>
      <Toolbar />
      <div style={mainArea}>
        <ReactFlow
          style={flowStyle}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          onNodesChange={isPreviewMode ? undefined : onNodesChange}
          onEdgesChange={isPreviewMode ? undefined : onEdgesChange}
          onNodesDelete={onNodesDelete}
          onConnect={onConnect}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={(_: React.MouseEvent, node: Node) => selectNode(node.id)}
          onPaneClick={() => selectNode(null)}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={!isPreviewMode}
          nodesConnectable={!isPreviewMode}
          elementsSelectable={!isPreviewMode}
          snapToGrid
          snapGrid={[20, 20]}
          minZoom={0.25}
          maxZoom={2}
          deleteKeyCode="Delete"
          multiSelectionKeyCode="Shift"
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
          <Controls style={controlsStyle} />
          <MiniMap
            style={minimapStyle}
            nodeColor={minimapNodeColor}
            maskColor="rgba(248,250,252,0.7)"
          />
        </ReactFlow>
        {selectedId && <PropertiesPanel />}
      </div>
      <ValidationToast />
    </div>
  );
}

function minimapNodeColor(node: Node): string {
  const colorMap: Record<string, string> = {
    start: '#16a34a', step: '#2563eb', outcome: '#059669', end: '#dc2626',
  };
  return colorMap[node.type ?? ''] ?? '#94a3b8';
}

const canvasWrapper: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  background: '#f8fafc',
};

const mainArea: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  overflow: 'hidden',
};

const controlsStyle: React.CSSProperties = { bottom: 80, left: 16 };

const minimapStyle: React.CSSProperties = {
  bottom: 16, right: 16, borderRadius: 8, border: '1px solid #e2e8f0',
};
