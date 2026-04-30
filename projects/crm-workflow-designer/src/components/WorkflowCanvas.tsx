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
  labelStyle: {
    fontSize: 10,
    fontWeight: 600,
    fill: '#475569',
  },
  labelBgStyle: {
    fill: '#f8fafc',
    fillOpacity: 0.9,
  },
  labelBgPadding: [4, 6] as [number, number],
  labelBgBorderRadius: 4,
};

export function WorkflowCanvas() {
  const { storeNodes, storeEdges, setStoreNodes, setStoreEdges, setSelectedNodeId, viewMode, selectedNodeId } =
    useWorkflowStore((s) => ({
      storeNodes: s.nodes,
      storeEdges: s.edges,
      setStoreNodes: s.setNodes,
      setStoreEdges: s.setEdges,
      setSelectedNodeId: s.setSelectedNodeId,
      viewMode: s.viewMode,
      selectedNodeId: s.selectedNodeId,
    }));

  const panelOpen = !!selectedNodeId;
  const flowStyle = useMemo<React.CSSProperties>(
    () => ({ width: panelOpen ? 'calc(100% - 360px)' : '100%', height: '100%' }),
    [panelOpen]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(storeNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(storeEdges);

  useEffect(() => { setNodes(storeNodes); }, [storeNodes, setNodes]);
  useEffect(() => { setEdges(storeEdges); }, [storeEdges, setEdges]);
  useEffect(() => { setStoreNodes(nodes); }, [nodes, setStoreNodes]);
  useEffect(() => { setStoreEdges(edges); }, [edges, setStoreEdges]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (viewMode) return;
      setEdges((eds) => addEdge({ ...connection, id: crypto.randomUUID() }, eds));
    },
    [viewMode, setEdges]
  );

  function onEdgeDoubleClick(_: React.MouseEvent, edge: Edge) {
    if (viewMode) return;
    // Cycle through: no label → 'true' → 'false' → custom labels
    const labels: Array<string | undefined> = [undefined, 'true', 'false', 'Re-quote', 'Revision', 'Approved', 'Rejected'];
    const current = edge.label as string | undefined;
    const idx = labels.indexOf(current);
    const next = labels[(idx + 1) % labels.length];
    setEdges((eds) => eds.map((e) => (e.id === edge.id ? { ...e, label: next } : e)));
  }

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
    trigger:   '#16a34a',
    condition: '#d97706',
    action:    '#2563eb',
    approval:  '#b45309',
    end:       '#dc2626',
  };
  return colorMap[node.type ?? ''] ?? '#94a3b8';
}

const canvasWrapper: React.CSSProperties = {
  width: '100%',
  height: '100%',
  position: 'relative',
  background: '#f8fafc',
  paddingTop: 48,   // height of toolbar
};

const controlsStyle: React.CSSProperties = {
  bottom: 80,
  left: 16,
};

const minimapStyle: React.CSSProperties = {
  bottom: 16,
  right: 16,
  borderRadius: 8,
  border: '1px solid #e2e8f0',
};
