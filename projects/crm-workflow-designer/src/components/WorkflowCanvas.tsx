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
import { NodeConfigPanel } from '../panels/NodeConfigPanel';
import { Toolbar } from './Toolbar';
import { ValidationToast } from './ValidationToast';
import { Legend } from './Legend';

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
    pendingLoad, setPendingLoad,
    nodeDataPatches, clearNodeDataPatch,
    pendingDelete, clearPendingDelete,
    setSelectedNodeId, viewMode, selectedNodeId,
  } = useWorkflowStore((s) => ({
    pendingLoad: s.pendingLoad,
    setPendingLoad: s.setPendingLoad,
    nodeDataPatches: s.nodeDataPatches,
    clearNodeDataPatch: s.clearNodeDataPatch,
    pendingDelete: s.pendingDelete,
    clearPendingDelete: s.clearPendingDelete,
    setSelectedNodeId: s.setSelectedNodeId,
    viewMode: s.viewMode,
    selectedNodeId: s.selectedNodeId,
  }));

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Consume pending load (from CRM) — one-shot, no loop
  useEffect(() => {
    if (!pendingLoad) return;
    setNodes(pendingLoad.nodes);
    setEdges(pendingLoad.edges);
    setPendingLoad(null);
  }, [pendingLoad, setNodes, setEdges, setPendingLoad]);

  // Apply node data patches (from config panel) — merge into RF node data
  useEffect(() => {
    const ids = Object.keys(nodeDataPatches);
    if (ids.length === 0) return;
    setNodes((prev) =>
      prev.map((n) =>
        nodeDataPatches[n.id]
          ? { ...n, data: { ...n.data, ...nodeDataPatches[n.id] } }
          : n
      )
    );
    ids.forEach(clearNodeDataPatch);
  }, [nodeDataPatches, setNodes, clearNodeDataPatch]);

  // Consume pending node deletion
  useEffect(() => {
    if (!pendingDelete) return;
    setNodes((prev) => prev.filter((n) => n.id !== pendingDelete));
    setEdges((prev) => prev.filter((e) => e.source !== pendingDelete && e.target !== pendingDelete));
    clearPendingDelete();
  }, [pendingDelete, setNodes, setEdges, clearPendingDelete]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (viewMode) return;
      setEdges((eds) => addEdge({ ...connection, id: crypto.randomUUID() }, eds));
    },
    [viewMode, setEdges]
  );

  function onEdgeDoubleClick(_: React.MouseEvent, edge: Edge) {
    if (viewMode) return;
    const labels: Array<string | undefined> = [undefined, 'true', 'false', 'Re-quote', 'Revision', 'Approved', 'Rejected'];
    const current = edge.label as string | undefined;
    const next = labels[(labels.indexOf(current) + 1) % labels.length];
    setEdges((eds) => eds.map((e) => (e.id === edge.id ? { ...e, label: next } : e)));
  }

  const panelOpen = !!selectedNodeId;
  const flowStyle = useMemo<React.CSSProperties>(
    () => ({ width: panelOpen ? 'calc(100% - 360px)' : '100%', height: '100%' }),
    [panelOpen]
  );

  return (
    <div style={canvasWrapper}>
      <ReactFlow
        style={flowStyle}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        onNodesChange={viewMode ? undefined : onNodesChange}
        onEdgesChange={viewMode ? undefined : onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_: React.MouseEvent, node: Node) => setSelectedNodeId(node.id)}
        onPaneClick={() => setSelectedNodeId(null)}
        onEdgeDoubleClick={onEdgeDoubleClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={!viewMode}
        nodesConnectable={!viewMode}
        elementsSelectable={!viewMode}
        minZoom={0.25}
        maxZoom={2}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
        <Controls style={controlsStyle} />
        <MiniMap
          style={minimapStyle}
          nodeColor={minimapNodeColor}
          maskColor="rgba(248,250,252,0.7)"
        />
      </ReactFlow>
      <Toolbar />
      <NodeConfigPanel />
      <ValidationToast />
      <Legend />
    </div>
  );
}

function minimapNodeColor(node: Node): string {
  const colorMap: Record<string, string> = {
    trigger: '#16a34a', condition: '#d97706',
    action: '#2563eb', approval: '#b45309', end: '#dc2626',
  };
  return colorMap[node.type ?? ''] ?? '#94a3b8';
}

const canvasWrapper: React.CSSProperties = {
  width: '100%',
  height: '100%',
  position: 'relative',
  background: '#f8fafc',
  paddingTop: 48,
};

const controlsStyle: React.CSSProperties = { bottom: 80, left: 16 };

const minimapStyle: React.CSSProperties = {
  bottom: 16, right: 16, borderRadius: 8, border: '1px solid #e2e8f0',
};
