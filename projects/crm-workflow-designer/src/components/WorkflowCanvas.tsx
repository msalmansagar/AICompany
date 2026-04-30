import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Edge,
} from '@xyflow/react';
import { useCallback, useEffect } from 'react';
import { useWorkflowStore } from '../store/workflowStore';
import { nodeTypes } from '../nodes/nodeTypes';
import { NodeConfigPanel } from '../panels/NodeConfigPanel';
import { Toolbar } from './Toolbar';
import { ValidationToast } from './ValidationToast';
import type { NodeData } from '../types/WorkflowTypes';
import type { Node } from '@xyflow/react';

export function WorkflowCanvas() {
  const { storeNodes, storeEdges, setStoreNodes, setStoreEdges, setSelectedNodeId, viewMode } =
    useWorkflowStore((s) => ({
      storeNodes: s.nodes,
      storeEdges: s.edges,
      setStoreNodes: s.setNodes,
      setStoreEdges: s.setEdges,
      setSelectedNodeId: s.setSelectedNodeId,
      viewMode: s.viewMode,
    }));

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>(storeNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(storeEdges);

  // Sync React Flow local state ← Zustand (on load)
  useEffect(() => {
    setNodes(storeNodes);
  }, [storeNodes, setNodes]);

  useEffect(() => {
    setEdges(storeEdges);
  }, [storeEdges, setEdges]);

  // Sync React Flow local state → Zustand (on change)
  useEffect(() => {
    setStoreNodes(nodes);
  }, [nodes, setStoreNodes]);

  useEffect(() => {
    setStoreEdges(edges);
  }, [edges, setStoreEdges]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (viewMode) return;
      setEdges((eds) => addEdge({ ...connection, id: crypto.randomUUID() }, eds));
    },
    [viewMode, setEdges]
  );

  function onEdgeDoubleClick(_: React.MouseEvent, edge: Edge) {
    if (viewMode) return;
    const currentLabel = edge.label as string | undefined;
    const labels: Array<'true' | 'false' | undefined> = [undefined, 'true', 'false'];
    const nextIndex = (labels.indexOf(currentLabel as 'true' | 'false' | undefined) + 1) % labels.length;
    setEdges((eds) =>
      eds.map((e) => (e.id === edge.id ? { ...e, label: labels[nextIndex] } : e))
    );
  }

  return (
    <div style={canvasWrapper}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={viewMode ? undefined : onNodesChange}
        onEdgesChange={viewMode ? undefined : onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => setSelectedNodeId(node.id)}
        onPaneClick={() => setSelectedNodeId(null)}
        onEdgeDoubleClick={onEdgeDoubleClick}
        fitView
        proOptions={{ hideAttribution: true }}
        nodesDraggable={!viewMode}
        nodesConnectable={!viewMode}
        elementsSelectable={!viewMode}
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
      <Toolbar />
      <NodeConfigPanel />
      <ValidationToast />
    </div>
  );
}

const canvasWrapper: React.CSSProperties = {
  width: '100%',
  height: '100%',
  position: 'relative',
};
