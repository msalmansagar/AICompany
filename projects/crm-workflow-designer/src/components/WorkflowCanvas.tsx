import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useReactFlow,
  useStore,
  Panel,
  applyNodeChanges,
  getNodesBounds,
  getViewportForBounds,
  type Node,
  type Edge,
  type NodeChange,
} from '@xyflow/react';
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildGraph } from '../services/WorkflowGraphBuilder';
import { logError } from '../services/logError';
import { buildExecutiveGraph } from '../services/ExecutiveGraphBuilder';
import { buildTechNewGraph } from '../services/TechNewGraphBuilder';
import { buildSwimlaneGraph } from '../services/SwimlaneGraphBuilder';
import { nodeTypes } from '../nodes/nodeTypes';
import { ViewToolbar } from './ViewToolbar';
import { ProcessSelectorDialog } from './ProcessSelectorDialog';
import { ReadOnlyPropertyPanel } from './ReadOnlyPropertyPanel';
import type { WorkflowView } from '../hooks/useWorkflowView';
import type { ViewMode } from '../types/ViewMode';
import type { LayoutDir } from '../services/WorkflowGraphBuilder';
import type { ICrmAdapter } from '../services/ICrmAdapter';
import { useResolvedRouteLabels } from '../hooks/useResolvedRouteLabels';
import { minimapNodeColor, MINIMAP_MASK_COLOR } from './common/minimapTheme';
import { computeSmartFit, LARGE_GRAPH_THRESHOLD } from './common/SmartInitialView';
import { GoToStepPanel } from './common/GoToStepPanel';
import type { GoToStepItem } from './common/GoToStepPanel';
import type { ViewStepData } from '../services/WorkflowGraphBuilder';
import { CanvasLegend } from './common/CanvasLegend';
import { applyReturnPathFilter, nextReturnPathMode } from '../services/viewFilters';
import { parseDesignerLayout, mergeDesignerLayout } from '../services/designerLayout';
import { notify } from './ui/Notify';
import type { ReturnPathMode } from '../services/viewFilters';

interface WorkflowCanvasProps {
  view: WorkflowView;
  adapter: ICrmAdapter;
  onNewProcess: () => void;
  onEditProcess?: () => void;
  onOpenSummary?: () => void;
  onBackToList?: () => void;
}

const EXPORT_W = 2560;
const EXPORT_H = 1440;

type BuildFn = (
  steps: Parameters<typeof buildGraph>[0],
  outcomes: Parameters<typeof buildGraph>[1],
  dir?: LayoutDir,
  routes?: Parameters<typeof buildGraph>[3]
) => ReturnType<typeof buildGraph>;

const GRAPH_BUILDERS: Record<ViewMode, BuildFn> = {
  executive:      buildExecutiveGraph as BuildFn,
  business:       buildGraph as BuildFn,
  'technical-new': buildTechNewGraph as BuildFn,
  swimlane:       buildSwimlaneGraph as BuildFn,
};

/**
 * The ids of every node React Flow has measured, or null while any is still
 * unmeasured. `useNodesInitialized` cannot be used for this: during the commit
 * that swaps a new graph in it still reports the previous graph's state, so a
 * fit driven by it lands on stale sizes and leaves a swimlane off-screen.
 * Comparing ids makes that staleness visible instead of invisible.
 */
function useMeasuredNodeIds(): string | null {
  return useStore((state) => {
    const ids: string[] = [];
    for (const [id, node] of state.nodeLookup) {
      if (!node.measured?.width) return null;
      ids.push(id);
    }
    return ids.sort().join(';');
  });
}

export function WorkflowCanvas({ view, adapter, onNewProcess, onEditProcess, onOpenSummary }: WorkflowCanvasProps) {
  const [selectorOpen, setSelectorOpen] = useState(false);
  // No explicit choice yet -> the minimap turns itself on for large graphs,
  // where "where am I" is a real question. A toggle click wins from then on.
  const [miniMapPreference, setMiniMapPreference] = useState<boolean | null>(null);
  const showMiniMap =
    miniMapPreference ?? (view.data?.steps.length ?? 0) > LARGE_GRAPH_THRESHOLD;
  const [showEdgeLabels, setShowEdgeLabels] = useState(true);
  const [returnPathMode, setReturnPathMode] = useState<ReturnPathMode>('show');
  // The view canvases arrange themselves, but a reader who nudges a card
  // into place should be able to keep that — per mode and direction, since
  // each draws a different graph.
  const [storedViewLayouts, setStoredViewLayouts] = useState<Record<string, Record<string, { x: number; y: number }>>>({});
  const [isLayoutDirty, setIsLayoutDirty] = useState(false);
  const [isSavingLayout, setIsSavingLayout] = useState(false);
  const layoutKey = `${view.viewMode}:${view.layoutDir}`;
  const [isExporting, setIsExporting] = useState(false);
  const { fitView, getNodes } = useReactFlow();
  const measuredNodeIds = useMeasuredNodeIds();
  const [pendingFit, setPendingFit] = useState(0);

  const resolvedLabels = useResolvedRouteLabels(view.data?.routes ?? [], adapter);

  const goToItems = useMemo<GoToStepItem[]>(
    () =>
      view.nodes
        .filter((node) => node.type === 'viewStep')
        .map((node) => {
          const data = node.data as ViewStepData;
          return { nodeId: node.id, label: data.step.name, sequenceNo: data.step.sequenceNo };
        })
        .sort((a, b) => a.sequenceNo - b.sequenceNo),
    [view.nodes]
  );

  // Rebuild graph whenever the loaded data, view mode, or layout direction changes.
  useEffect(() => {
    if (!view.data) return;
    const builder = GRAPH_BUILDERS[view.viewMode];
    const { nodes: rebuilt, edges: rebuiltEdges } = builder(
      view.data.steps,
      view.data.outcomes,
      view.layoutDir,
      view.data.routes,
    );
    const saved = storedViewLayouts[`${view.viewMode}:${view.layoutDir}`];
    view.setNodes(() =>
      saved
        ? rebuilt.map((node) => (saved[node.id] ? { ...node, position: saved[node.id] } : node))
        : rebuilt
    );
    view.setEdges(() => rebuiltEdges);
    setPendingFit((token) => token + 1);
    setIsLayoutDirty(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.data, view.viewMode, view.layoutDir, storedViewLayouts]);

  const processId = view.data?.process.id ?? null;
  useEffect(() => {
    if (!processId) {
      setStoredViewLayouts({});
      return;
    }
    let cancelled = false;
    void adapter
      .loadDesignerLayout(processId)
      .then((json) => {
        if (cancelled) return;
        setStoredViewLayouts(parseDesignerLayout(json)?.viewLayouts ?? {});
        setIsLayoutDirty(false);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [processId, adapter]);

  const requestedNodeIds = useMemo(
    () => view.nodes.map((node) => node.id).sort().join(';'),
    [view.nodes]
  );

  // Fit only once the nodes React Flow has measured are the nodes we asked for.
  // A fixed delay raced measurement, and a swimlane lane is wide enough that
  // fitting too early left most of the diagram off-screen behind the panel.
  useEffect(() => {
    if (pendingFit === 0 || measuredNodeIds === null) return;
    if (measuredNodeIds !== requestedNodeIds) return;
    // Large graphs open on their first stage at reading zoom, not fit-all.
    fitView({ ...computeSmartFit(getNodes(), view.layoutDir), duration: 300 });
    setPendingFit(0);
  }, [pendingFit, measuredNodeIds, requestedNodeIds, fitView, getNodes, view.layoutDir]);

  // Apply resolved human-readable labels to route edges once metadata is fetched.
  // Also re-runs on view mode / data change so labels survive graph rebuilds.
  useEffect(() => {
    if (resolvedLabels.size === 0) return;
    view.setEdges((prev) =>
      prev.map((edge) => {
        const routeId = extractRouteId(edge.id);
        const label = routeId ? resolvedLabels.get(routeId) : undefined;
        // A full condition can run to banner width at low zoom — clamp it; the
        // route inspector panel still shows the whole thing on click.
        if (!label) return edge;
        // Keep the default-flow slash the builder stamped on fallback routes.
        const isFallback = (edge.data as { isFallback?: boolean } | undefined)?.isFallback === true;
        return { ...edge, label: isFallback ? `∕ ${truncateLabel(label)}` : truncateLabel(label) };
      })
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedLabels, view.viewMode, view.layoutDir, view.data]);

  const handleOpen = useCallback(() => {
    setSelectorOpen(true);
    void view.loadProcessList();
  }, [view]);

  const handleSelect = useCallback((processId: string) => {
    setSelectorOpen(false);
    void view.loadWorkflow(processId);
  }, [view]);

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.2, maxZoom: 1.2, duration: 300 });
  }, [fitView]);

  const handleAutoLayout = useCallback(() => {
    if (!view.data || view.nodes.length === 0) return;
    const builder = GRAPH_BUILDERS[view.viewMode];
    const { nodes: positioned, edges: rebuilt } = builder(
      view.data.steps,
      view.data.outcomes,
      view.layoutDir,
      view.data.routes,
    );
    view.setNodes(() => positioned);
    view.setEdges(() => rebuilt);
    setPendingFit((token) => token + 1);
    // Re-deriving the layout is the reset gesture: the saved arrangement
    // for this mode is what the user just discarded.
    if (storedViewLayouts[layoutKey]) setIsLayoutDirty(true);
  }, [view, storedViewLayouts, layoutKey]);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    view.selectElement(node.id);
  }, [view]);

  // Double-clicking a step is the universal 'edit this' gesture.
  const handleNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === 'viewStep' && onEditProcess) onEditProcess();
  }, [onEditProcess]);

  const handleEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    view.selectElement(edge.id);
  }, [view]);

  const handlePaneClick = useCallback(() => {
    view.selectElement(null);
  }, [view]);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    view.setNodes((prev) => applyNodeChanges(changes, prev));
    if (changes.some((c) => c.type === 'position' && c.dragging === false)) {
      setIsLayoutDirty(true);
    }
  }, [view]);

  const handleSaveLayout = useCallback(async () => {
    if (!processId) return;
    setIsSavingLayout(true);
    try {
      const positions: Record<string, { x: number; y: number }> = {};
      for (const node of view.nodes) positions[node.id] = node.position;
      const nextLayouts = { ...storedViewLayouts, [layoutKey]: positions };
      const existing = await adapter.loadDesignerLayout(processId).catch(() => null);
      // Merge: the editor owns the other half of this blob.
      await adapter.saveDesignerLayout(processId, mergeDesignerLayout(existing, { viewLayouts: nextLayouts }));
      setStoredViewLayouts(nextLayouts);
      setIsLayoutDirty(false);
      notify('Layout saved for this view.', 'success');
    } catch (err) {
      logError('view:save-layout', err);
      notify('Could not save the layout.', 'error');
    } finally {
      setIsSavingLayout(false);
    }
  }, [processId, adapter, view.nodes, storedViewLayouts, layoutKey]);

  const handleCycleReturnPaths = useCallback(() => {
    setReturnPathMode(nextReturnPathMode);
  }, []);

  // What the canvas actually draws, after the declutter filters.
  const visible = useMemo(
    () => applyReturnPathFilter(view.nodes, view.edges, returnPathMode),
    [view.nodes, view.edges, returnPathMode]
  );

  // Captures the React Flow viewport element scaled to fit all nodes.
  const captureImage = useCallback(async (): Promise<string> => {
    const nodes = getNodes();
    if (nodes.length === 0) throw new Error('No nodes to export.');
    const bounds = getNodesBounds(nodes);
    const { x, y, zoom } = getViewportForBounds(bounds, EXPORT_W, EXPORT_H, 0.05, 4, 0.08);
    const viewportEl = document.querySelector('.react-flow__viewport') as HTMLElement | null;
    if (!viewportEl) throw new Error('Viewport element not found.');
    // html-to-image serialises the clone into a standalone SVG image, where
    // CSS variables from this document do not resolve — a var() here exports
    // a transparent background. Hand it the computed colour instead.
    const canvasBackground =
      getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg').trim() || '#ffffff';
    return toPng(viewportEl, {
      backgroundColor: canvasBackground,
      width: EXPORT_W,
      height: EXPORT_H,
      style: {
        width: `${EXPORT_W}px`,
        height: `${EXPORT_H}px`,
        transform: `translate(${x}px, ${y}px) scale(${zoom})`,
      },
    });
  }, [getNodes]);

  const handleDownloadPng = useCallback(async () => {
    setIsExporting(true);
    try {
      const dataUrl = await captureImage();
      const link = document.createElement('a');
      link.download = `${view.data?.process.name ?? 'workflow'}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      logError('export:png', err);
    } finally {
      setIsExporting(false);
    }
  }, [captureImage, view.data]);

  const handleDownloadPdf = useCallback(async () => {
    setIsExporting(true);
    try {
      const dataUrl = await captureImage();
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [EXPORT_W, EXPORT_H] });
      pdf.addImage(dataUrl, 'PNG', 0, 0, EXPORT_W, EXPORT_H);
      pdf.save(`${view.data?.process.name ?? 'workflow'}.pdf`);
    } catch (err) {
      logError('export:pdf', err);
    } finally {
      setIsExporting(false);
    }
  }, [captureImage, view.data]);

  return (
    <div style={shellStyle}>
      <ViewToolbar
        processName={view.data?.process.name ?? null}
        workflowState={view.data?.process.workflowState ?? null}
        isLoading={view.phase === 'loading-list' || view.phase === 'loading-workflow'}
        isExporting={isExporting}
        showMiniMap={showMiniMap}
        showEdgeLabels={showEdgeLabels}
        isLayoutDirty={isLayoutDirty}
        isSavingLayout={isSavingLayout}
        returnPathMode={returnPathMode}
        viewMode={view.viewMode}
        layoutDir={view.layoutDir}
        onRefresh={() => void view.refresh()}
        onFitView={handleFitView}
        onAutoLayout={handleAutoLayout}
        onToggleMiniMap={() => setMiniMapPreference(!showMiniMap)}
        onToggleEdgeLabels={() => setShowEdgeLabels((v) => !v)}
        onSaveLayout={() => void handleSaveLayout()}
        onCycleReturnPaths={handleCycleReturnPaths}
        onDownloadPng={() => void handleDownloadPng()}
        onDownloadPdf={() => void handleDownloadPdf()}
        onViewModeChange={view.setViewMode}
        onLayoutDirChange={view.setLayoutDir}
        onNewProcess={onNewProcess}
        onEditProcess={onEditProcess}
        onOpenSummary={onOpenSummary}
      />

      <div style={bodyStyle}>
        <div style={canvasWrap} className={showEdgeLabels ? undefined : 'edge-labels-hidden'}>
          <ReactFlow
            nodes={visible.nodes}
            edges={visible.edges}
            nodeTypes={nodeTypes}
            onNodesChange={handleNodesChange}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={handleNodeDoubleClick}
            onEdgeClick={handleEdgeClick}
            onPaneClick={handlePaneClick}
            nodesDraggable={true}
            nodesConnectable={false}
            elementsSelectable={true}
            deleteKeyCode={null}
            proOptions={{ hideAttribution: true }}
            minZoom={0.08}
            maxZoom={2.5}
            zoomOnScroll
            panOnDrag
            selectionOnDrag={false}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--canvas-grid)" />
            <Controls showInteractive={false} />
            <CanvasLegend />
            <GoToStepPanel items={goToItems} onPick={(nodeId) => view.selectElement(nodeId)} />
            {showMiniMap && (
              <MiniMap
                nodeColor={minimapNodeColor}
                maskColor={MINIMAP_MASK_COLOR}
                style={{ bottom: 60 }}
              />
            )}

            {view.phase === 'loading-workflow' && <LoadingOverlay />}
            {view.phase === 'error' && view.error && <ErrorPanel message={view.error} onRetry={() => void view.refresh()} />}

            {(view.phase === 'idle' || (view.phase === 'ready' && view.nodes.length === 0)) && (
              <EmptyState onOpen={handleOpen} hasNoSteps={view.phase === 'ready'} />
            )}
          </ReactFlow>
        </div>

        {/* The panel appears only for a selection now; the process facts it
            used to hold permanently live on the summary screen. */}
        {view.selectedId && (
          <ReadOnlyPropertyPanel data={view.data} selectedId={view.selectedId} adapter={adapter} />
        )}
      </div>

      {selectorOpen && (
        <ProcessSelectorDialog
          processes={view.processList}
          isLoading={view.phase === 'loading-list'}
          error={view.phase === 'error' ? view.error : null}
          onSelect={handleSelect}
          onClose={() => setSelectorOpen(false)}
        />
      )}
    </div>
  );
}

function LoadingOverlay() {
  return (
    <Panel position="top-center" style={overlayPanelStyle}>
      <span className="spinner" />
      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading workflow…</span>
    </Panel>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry(): void }) {
  return (
    <Panel position="top-center" style={errorPanelStyle}>
      <strong style={{ fontSize: 12, color: 'var(--error)', display: 'block', marginBottom: 4 }}>
        Failed to load workflow
      </strong>
      <pre className="hint-inline" style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)' }}>{message}</pre>
      <button type="button" className="btn" onClick={onRetry}>Retry</button>
    </Panel>
  );
}

function EmptyState({ onOpen, hasNoSteps }: { onOpen(): void; hasNoSteps: boolean }) {
  return (
    <Panel position="top-center" style={{ marginTop: 80 }}>
      <div className="empty-state">
        <div style={emptyHeading}>Workflow Designer</div>
        {hasNoSteps ? (
          <p className="hint-inline">This process has no workflow steps.</p>
        ) : (
          <p className="hint-inline">Open an existing workflow to visualise it.</p>
        )}
        <button type="button" className="btn primary" onClick={onOpen}>
          Open Workflow
        </button>
      </div>
    </Panel>
  );
}

const MAX_EDGE_LABEL_CHARS = 34;

function truncateLabel(label: string): string {
  return label.length > MAX_EDGE_LABEL_CHARS ? `${label.slice(0, MAX_EDGE_LABEL_CHARS - 1)}…` : label;
}

function extractRouteId(edgeId: string): string | null {
  for (const prefix of ['e_route_', 'e_exec_route_', 'e_tech_route_']) {
    if (edgeId.startsWith(prefix)) return edgeId.slice(prefix.length);
  }
  return null;
}

const shellStyle: React.CSSProperties = {
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

const canvasWrap: React.CSSProperties = {
  flex: 1,
  position: 'relative',
  overflow: 'hidden',
};

const overlayPanelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '8px 16px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  marginTop: 12,
};

const errorPanelStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--error)',
  borderRadius: 8,
  padding: '12px 16px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  maxWidth: 480,
  marginTop: 12,
};

const emptyHeading: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  color: 'var(--text)',
  marginBottom: 8,
};

