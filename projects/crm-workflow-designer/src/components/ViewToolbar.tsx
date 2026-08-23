import type { ViewMode } from '../types/ViewMode';
import { VIEW_MODES } from '../types/ViewMode';
import type { LayoutDir } from '../services/WorkflowGraphBuilder';

interface ViewToolbarProps {
  processName: string | null;
  isLoading: boolean;
  isExporting: boolean;
  showMiniMap: boolean;
  viewMode: ViewMode;
  layoutDir: LayoutDir;
  onRefresh(): void;
  onFitView(): void;
  onAutoLayout(): void;
  onToggleMiniMap(): void;
  onDownloadPng(): void;
  onDownloadPdf(): void;
  onViewModeChange(mode: ViewMode): void;
  onLayoutDirChange(dir: LayoutDir): void;
  onNewProcess(): void;
  onEditProcess?(): void;
}

export function ViewToolbar({
  processName,
  isLoading,
  isExporting,
  showMiniMap,
  viewMode,
  layoutDir,
  onRefresh,
  onFitView,
  onAutoLayout,
  onToggleMiniMap,
  onDownloadPng,
  onDownloadPdf,
  onViewModeChange,
  onLayoutDirChange,
  onNewProcess,
  onEditProcess,
}: ViewToolbarProps) {
  return (
    <>
      {/* Navigation lives in the sitemap, so this bar carries only what acts on
          the process being viewed. */}
      <div className="cmdbar" role="toolbar" aria-label="Workflow viewer">
        <button type="button" className="cmd primary" onClick={onNewProcess} title="Create a new workflow process">
          New process
        </button>
        {onEditProcess && processName && (
          <>
            <span className="cmd-sep" />
            <button type="button" className="cmd" onClick={onEditProcess} title="Edit this workflow">
              Edit
            </button>
          </>
        )}
        <span className="cmd-sep" />
        <button type="button" className="cmd" onClick={onRefresh} title="Reload from CRM" disabled={isLoading}>
          Refresh
        </button>
        <button type="button" className="cmd" onClick={onFitView} title="Fit diagram to screen">
          Fit view
        </button>
        <button type="button" className="cmd" onClick={onAutoLayout} title="Re-apply layout and reset positions">
          Auto layout
        </button>
        <span className="cmd-sep" />
        <button type="button" className="cmd" onClick={onDownloadPng} title="Download as PNG image" disabled={isExporting}>
          {isExporting ? 'Exporting…' : 'PNG'}
        </button>
        <button type="button" className="cmd" onClick={onDownloadPdf} title="Download as PDF document" disabled={isExporting}>
          {isExporting ? 'Exporting…' : 'PDF'}
        </button>
        <span className="cmd-sep" />
        <button
          type="button"
          className={showMiniMap ? 'cmd primary' : 'cmd'}
          onClick={onToggleMiniMap}
          title="Toggle minimap"
        >
          {showMiniMap ? 'Hide map' : 'Mini map'}
        </button>

        <span className="cmd-spacer" />
        {isLoading && <span className="pill info">Loading…</span>}
        {!isLoading && processName && <span style={processNameStyle}>{processName}</span>}
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

