import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useReactFlow,
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
import { useCallback, useEffect, useState, useRef } from 'react';
import { buildGraph } from '../services/WorkflowGraphBuilder';
import { logError } from '../services/logError';
import { buildExecutiveGraph } from '../services/ExecutiveGraphBuilder';
import { buildTechnicalGraph } from '../services/TechnicalGraphBuilder';
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

interface WorkflowCanvasProps {
  view: WorkflowView;
  adapter: ICrmAdapter;
  onNewProcess: () => void;
  onEditProcess?: () => void;
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
  technical:      buildTechnicalGraph as BuildFn,
  'technical-new': buildTechNewGraph as BuildFn,
  swimlane:       buildSwimlaneGraph as BuildFn,
};

export function WorkflowCanvas({ view, adapter, onNewProcess, onEditProcess }: WorkflowCanvasProps) {
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const { fitView, getNodes } = useReactFlow();
  const fitViewTrigger = useRef(0);

  const resolvedLabels = useResolvedRouteLabels(view.data?.routes ?? [], adapter);

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
    view.setNodes(() => rebuilt);
    view.setEdges(() => rebuiltEdges);
    setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 80);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.data, view.viewMode, view.layoutDir]);

  // Apply resolved human-readable labels to route edges once metadata is fetched.
  // Also re-runs on view mode / data change so labels survive graph rebuilds.
  useEffect(() => {
    if (resolvedLabels.size === 0) return;
    view.setEdges((prev) =>
      prev.map((edge) => {
        const routeId = extractRouteId(edge.id);
        const label = routeId ? resolvedLabels.get(routeId) : undefined;
        return label ? { ...edge, label } : edge;
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
    fitViewTrigger.current += 1;
    fitView({ padding: 0.2, duration: 300 });
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
    setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 80);
  }, [view, fitView]);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    view.selectElement(node.id);
  }, [view]);

  const handleEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    view.selectElement(edge.id);
  }, [view]);

  const handlePaneClick = useCallback(() => {
    view.selectElement(null);
  }, [view]);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    view.setNodes((prev) => applyNodeChanges(changes, prev));
  }, [view]);

  // Captures the React Flow viewport element scaled to fit all nodes.
  const captureImage = useCallback(async (): Promise<string> => {
    const nodes = getNodes();
    if (nodes.length === 0) throw new Error('No nodes to export.');
    const bounds = getNodesBounds(nodes);
    const { x, y, zoom } = getViewportForBounds(bounds, EXPORT_W, EXPORT_H, 0.05, 4, 0.08);
    const viewportEl = document.querySelector('.react-flow__viewport') as HTMLElement | null;
    if (!viewportEl) throw new Error('Viewport element not found.');
    return toPng(viewportEl, {
      backgroundColor: 'var(--surface-alt)',
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
        isLoading={view.phase === 'loading-list' || view.phase === 'loading-workflow'}
        isExporting={isExporting}
        showMiniMap={showMiniMap}
        viewMode={view.viewMode}
        layoutDir={view.layoutDir}
        onOpen={handleOpen}
        onRefresh={() => void view.refresh()}
        onFitView={handleFitView}
        onAutoLayout={handleAutoLayout}
        onToggleMiniMap={() => setShowMiniMap((v) => !v)}
        onDownloadPng={() => void handleDownloadPng()}
        onDownloadPdf={() => void handleDownloadPdf()}
        onViewModeChange={view.setViewMode}
        onLayoutDirChange={view.setLayoutDir}
        onNewProcess={onNewProcess}
        onEditProcess={onEditProcess}
      />

      <div style={bodyStyle}>
        <div style={canvasWrap}>
          <ReactFlow
            nodes={view.nodes}
            edges={view.edges}
            nodeTypes={nodeTypes}
            onNodesChange={handleNodesChange}
            onNodeClick={handleNodeClick}
            onEdgeClick={handleEdgeClick}
            onPaneClick={handlePaneClick}
            nodesDraggable={true}
            nodesConnectable={false}
            elementsSelectable={true}
            deleteKeyCode={null}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
            proOptions={{ hideAttribution: true }}
            minZoom={0.08}
            maxZoom={2.5}
            zoomOnScroll
            panOnDrag
            selectionOnDrag={false}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--text)" />
            <Controls showInteractive={false} />
            {showMiniMap && (
              <MiniMap
                nodeColor={minimapColor}
                maskColor="rgba(248,250,252,0.75)"
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

        <ReadOnlyPropertyPanel data={view.data} selectedId={view.selectedId} adapter={adapter} />
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
      <span style={spinnerStyle} />
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
      <pre style={errorPreStyle}>{message}</pre>
      <button type="button" style={retryBtn} onClick={onRetry}>Retry</button>
    </Panel>
  );
}

function EmptyState({ onOpen, hasNoSteps }: { onOpen(): void; hasNoSteps: boolean }) {
  return (
    <Panel position="top-center" style={{ marginTop: 80 }}>
      <div style={emptyCard}>
        <div style={emptyHeading}>Workflow Designer</div>
        {hasNoSteps ? (
          <p style={emptyText}>This process has no workflow steps.</p>
        ) : (
          <p style={emptyText}>Open an existing workflow to visualise it.</p>
        )}
        <button type="button" style={openBtn} onClick={onOpen}>
          Open Workflow
        </button>
      </div>
    </Panel>
  );
}

function extractRouteId(edgeId: string): string | null {
  for (const prefix of ['e_route_', 'e_exec_route_', 'e_tech_route_']) {
    if (edgeId.startsWith(prefix)) return edgeId.slice(prefix.length);
  }
  return null;
}

function minimapColor(node: Node): string {
  if (node.type === 'viewStep') return 'var(--primary)';
  if (node.type === 'viewDecision') return 'var(--accent-branch)';
  if (node.type === 'viewStart') return 'var(--success)';
  if (node.type === 'viewEnd') return 'var(--error)';
  return 'var(--text-disabled)';
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

const errorPreStyle: React.CSSProperties = {
  fontSize: 11,
  fontFamily: 'monospace',
  color: 'var(--error)',
  margin: '0 0 8px',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: 200,
  overflowY: 'auto',
};

const retryBtn: React.CSSProperties = {
  padding: '4px 12px',
  background: 'var(--error)',
  color: 'var(--text-on-primary)',
  border: 'none',
  borderRadius: 4,
  fontSize: 12,
  cursor: 'pointer',
};

const spinnerStyle: React.CSSProperties = {
  display: 'inline-block',
  width: 14,
  height: 14,
  border: '2px solid var(--border)',
  borderTopColor: 'var(--primary)',
  borderRadius: '50%',
};

const emptyCard: React.CSSProperties = {
  background: 'var(--surface)',
  borderRadius: 12,
  padding: '40px 48px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
  textAlign: 'center',
  maxWidth: 400,
};

const emptyHeading: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  color: 'var(--text)',
  marginBottom: 8,
};

const emptyText: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 13,
  margin: '0 0 24px',
};

const openBtn: React.CSSProperties = {
  padding: '10px 24px',
  background: 'var(--primary)',
  color: 'var(--text-on-primary)',
  border: 'none',
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};
