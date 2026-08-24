import type { ViewMode } from '../types/ViewMode';
import type { ReturnPathMode } from '../services/viewFilters';
import { RETURN_MODE_LABELS } from '../services/viewFilters';
import { VIEW_MODES } from '../types/ViewMode';
import type { LayoutDir } from '../services/WorkflowGraphBuilder';
import { ToolbarButton, ToolbarOverflow } from './common/ToolbarButton';

interface ViewToolbarProps {
  processName: string | null;
  /** 'draft' | 'published' | 'archived' — drawn as a pill beside the name. */
  workflowState?: string | null;
  isLoading: boolean;
  isExporting: boolean;
  showMiniMap: boolean;
  showEdgeLabels: boolean;
  /** True once a node has been dragged and the arrangement is unsaved. */
  isLayoutDirty: boolean;
  isSavingLayout: boolean;
  returnPathMode: ReturnPathMode;
  viewMode: ViewMode;
  layoutDir: LayoutDir;
  onRefresh(): void;
  onFitView(): void;
  onAutoLayout(): void;
  onToggleMiniMap(): void;
  onToggleEdgeLabels(): void;
  onSaveLayout(): void;
  onCycleReturnPaths(): void;
  onDownloadPng(): void;
  onDownloadPdf(): void;
  onViewModeChange(mode: ViewMode): void;
  onLayoutDirChange(dir: LayoutDir): void;
  onNewProcess(): void;
  onEditProcess?(): void;
  onOpenSummary?(): void;
}

export function ViewToolbar({
  processName,
  workflowState,
  isLoading,
  isExporting,
  showMiniMap,
  showEdgeLabels,
  isLayoutDirty,
  isSavingLayout,
  returnPathMode,
  viewMode,
  layoutDir,
  onRefresh,
  onFitView,
  onAutoLayout,
  onToggleMiniMap,
  onToggleEdgeLabels,
  onSaveLayout,
  onCycleReturnPaths,
  onDownloadPng,
  onDownloadPdf,
  onViewModeChange,
  onLayoutDirChange,
  onNewProcess,
  onEditProcess,
  onOpenSummary,
}: ViewToolbarProps) {
  return (
    <>
      {/* Navigation lives in the sitemap, so this bar carries only what acts on
          the process being viewed. */}
      <div className="cmdbar" role="toolbar" aria-label="Workflow viewer">
        <ToolbarButton icon="new" label="New" title="Create a new workflow process" tone="primary" onClick={onNewProcess} />
        {onEditProcess && processName && (
          <ToolbarButton icon="edit" label="Edit" title="Edit this workflow" onClick={onEditProcess} />
        )}
        {onOpenSummary && processName && (
          <ToolbarButton icon="summary" label="Summary" title="Open the full process summary" onClick={onOpenSummary} />
        )}
        <span className="cmd-sep" />

        {/* Canvas controls shrink to their glyph — the label lives in the tooltip. */}
        <ToolbarButton icon="refresh" label="Reload from CRM" iconOnly disabled={isLoading} onClick={onRefresh} />
        <ToolbarButton icon="fit" label="Fit diagram to screen" iconOnly onClick={onFitView} />
        <ToolbarButton icon="layout" label="Re-apply layout and reset positions" iconOnly onClick={onAutoLayout} />
        <span className="cmd-sep" />
        <ToolbarButton
          icon="minimap"
          label={showMiniMap ? 'Hide the minimap' : 'Show the minimap'}
          iconOnly
          active={showMiniMap}
          onClick={onToggleMiniMap}
        />
        <ToolbarButton
          icon="labels"
          label={showEdgeLabels ? 'Hide the labels on edges' : 'Show the labels on edges'}
          iconOnly
          active={!showEdgeLabels}
          onClick={onToggleEdgeLabels}
        />
        <ToolbarButton
          icon="returns"
          label={RETURN_MODE_LABELS[returnPathMode]}
          title="Cycle return-path visibility: show everything → hide the return lines → hide the return nodes too"
          iconOnly={returnPathMode === 'show'}
          active={returnPathMode !== 'show'}
          onClick={onCycleReturnPaths}
        />
        {isLayoutDirty && (
          <ToolbarButton
            icon="saveLayout"
            label={isSavingLayout ? 'Saving…' : 'Save layout'}
            title="Keep this arrangement for everyone who opens this view"
            tone="primary"
            disabled={isSavingLayout}
            onClick={onSaveLayout}
          />
        )}
        <ToolbarOverflow
          label="Export"
          items={[
            { icon: 'png', label: isExporting ? 'Exporting…' : 'Download as PNG', onClick: onDownloadPng, disabled: isExporting },
            { icon: 'pdf', label: isExporting ? 'Exporting…' : 'Download as PDF', onClick: onDownloadPdf, disabled: isExporting },
          ]}
        />
        <span className="cmd-spacer" />
        {isLoading && <span className="pill info">Loading…</span>}
        {!isLoading && processName && (
          <>
            {workflowState && (
              <span className={workflowState === 'published' ? 'pill published' : 'pill draft'}>
                {workflowState === 'published' ? 'Published' : workflowState === 'archived' ? 'Archived' : 'Draft'}
              </span>
            )}
            <span style={processNameStyle}>{processName}</span>
          </>
        )}
      </div>

      {/* Row 2 — view mode selector + layout direction toggle */}
      {/* The view modes are pivot tabs, as the design system draws a tab set. */}
      <div className="pivot" role="tablist" aria-label="View mode">
        {VIEW_MODES.map((m) => (
          <button
            key={m.id}
            role="tab"
            type="button"
            title={m.description}
            aria-selected={viewMode === m.id}
            onClick={() => onViewModeChange(m.id)}
            className={viewMode === m.id ? 'pivot-tab active' : 'pivot-tab'}
          >
            {m.label}
          </button>
        ))}
        <span style={modeDescription}>
          {VIEW_MODES.find((m) => m.id === viewMode)?.description}
        </span>

        <div className="pivot-end">
          <button
            type="button"
            title="Top-to-Bottom layout"
            onClick={() => onLayoutDirChange('TB')}
            className={layoutDir === 'TB' ? 'btn sm primary' : 'btn sm'}
          >
            ↕ TB
          </button>
          <button
            type="button"
            title="Left-to-Right layout"
            onClick={() => onLayoutDirChange('LR')}
            className={layoutDir === 'LR' ? 'btn sm primary' : 'btn sm'}
          >
            ↔ LR
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const modeDescription: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-secondary)',
  marginLeft: 8,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
};

const processNameStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

