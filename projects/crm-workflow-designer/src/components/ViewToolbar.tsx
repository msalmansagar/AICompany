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
  onOpen(): void;
  onRefresh(): void;
  onFitView(): void;
  onAutoLayout(): void;
  onToggleMiniMap(): void;
  onDownloadPng(): void;
  onDownloadPdf(): void;
  onViewModeChange(mode: ViewMode): void;
  onLayoutDirChange(dir: LayoutDir): void;
}

export function ViewToolbar({
  processName,
  isLoading,
  isExporting,
  showMiniMap,
  viewMode,
  layoutDir,
  onOpen,
  onRefresh,
  onFitView,
  onAutoLayout,
  onToggleMiniMap,
  onDownloadPng,
  onDownloadPdf,
  onViewModeChange,
  onLayoutDirChange,
}: ViewToolbarProps) {
  return (
    <div style={wrapperStyle}>
      {/* Row 1 — identity + actions */}
      <div style={barStyle} role="toolbar" aria-label="Workflow Viewer Toolbar">
        <div style={identityStyle}>
          <span style={logoText}>Workflow Designer</span>
          {isLoading && <span style={loadingBadge}>Loading…</span>}
          {!isLoading && processName && (
            <>
              <span style={dividerStyle} />
              <span style={processNameStyle}>{processName}</span>
            </>
          )}
        </div>

        <div style={actionsStyle}>
          <ToolBtn label="Open" onClick={onOpen} title="Open a workflow" primary />
          <Sep />
          <ToolBtn label="Refresh" onClick={onRefresh} title="Reload from CRM" disabled={isLoading} />
          <ToolBtn label="Fit View" onClick={onFitView} title="Fit diagram to screen" />
          <ToolBtn label="Auto Layout" onClick={onAutoLayout} title="Re-apply layout and reset positions" />
          <Sep />
          <ToolBtn
            label={isExporting ? 'Exporting…' : 'PNG'}
            onClick={onDownloadPng}
            title="Download as PNG image"
            disabled={isExporting}
          />
          <ToolBtn
            label={isExporting ? 'Exporting…' : 'PDF'}
            onClick={onDownloadPdf}
            title="Download as PDF document"
            disabled={isExporting}
          />
          <Sep />
          <ToolBtn
            label={showMiniMap ? 'Hide Map' : 'Mini Map'}
            onClick={onToggleMiniMap}
            title="Toggle minimap"
            active={showMiniMap}
          />
        </div>
      </div>

      {/* Row 2 — view mode selector + layout direction toggle */}
      <div style={modeBarStyle} role="tablist" aria-label="View Mode">
        <span style={modeLabel}>View:</span>
        {VIEW_MODES.map((m) => (
          <button
            key={m.id}
            role="tab"
            type="button"
            title={m.description}
            aria-selected={viewMode === m.id}
            onClick={() => onViewModeChange(m.id)}
            style={modeTab(viewMode === m.id)}
          >
            {m.label}
          </button>
        ))}
        <span style={modeDescription}>
          {VIEW_MODES.find((m) => m.id === viewMode)?.description}
        </span>

        <div style={dirToggleGroup}>
          <button
            type="button"
            title="Top-to-Bottom layout"
            onClick={() => onLayoutDirChange('TB')}
            style={dirBtn(layoutDir === 'TB')}
          >
            ↕ TB
          </button>
          <button
            type="button"
            title="Left-to-Right layout"
            onClick={() => onLayoutDirChange('LR')}
            style={dirBtn(layoutDir === 'LR')}
          >
            ↔ LR
          </button>
        </div>
      </div>
    </div>
  );
}

function ToolBtn({
  label,
  onClick,
  title,
  disabled = false,
  primary = false,
  active = false,
}: {
  label: string;
  onClick(): void;
  title?: string;
  disabled?: boolean;
  primary?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...btnBase,
        ...(primary ? btnPrimary : active ? btnActive : btnSecondary),
        ...(disabled ? btnDisabled : {}),
      }}
    >
      {label}
    </button>
  );
}

function Sep() {
  return <div style={sepStyle} />;
}

// ─── Styles ────────────────────────────────────────────────────────────────

const wrapperStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flexShrink: 0,
  zIndex: 10,
};

const barStyle: React.CSSProperties = {
  height: 44,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 16px',
  background: '#1e293b',
  borderBottom: '1px solid #334155',
};

const modeBarStyle: React.CSSProperties = {
  height: 34,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '0 16px',
  background: '#0f172a',
  borderBottom: '1px solid #1e293b',
};

const modeLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: '#64748b',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  marginRight: 4,
  flexShrink: 0,
};

const modeDescription: React.CSSProperties = {
  fontSize: 11,
  color: '#475569',
  marginLeft: 8,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
};

const dirToggleGroup: React.CSSProperties = {
  display: 'flex',
  gap: 2,
  marginLeft: 8,
  flexShrink: 0,
};

function dirBtn(active: boolean): React.CSSProperties {
  return {
    height: 22,
    padding: '0 8px',
    fontSize: 10,
    fontWeight: active ? 600 : 400,
    borderRadius: 4,
    border: active ? '1px solid #0ea5e9' : '1px solid #334155',
    background: active ? '#0c4a6e' : 'transparent',
    color: active ? '#7dd3fc' : '#64748b',
    cursor: 'pointer',
    transition: 'background 0.1s, color 0.1s',
    flexShrink: 0,
    letterSpacing: '0.02em',
  };
}

function modeTab(active: boolean): React.CSSProperties {
  return {
    height: 24,
    padding: '0 12px',
    fontSize: 11,
    fontWeight: active ? 600 : 400,
    borderRadius: 4,
    border: active ? '1px solid #3b82f6' : '1px solid transparent',
    background: active ? '#1d4ed8' : 'transparent',
    color: active ? '#fff' : '#94a3b8',
    cursor: 'pointer',
    transition: 'background 0.1s, color 0.1s',
    flexShrink: 0,
  };
}

const identityStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
};

const logoText: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#94a3b8',
  flexShrink: 0,
};

const loadingBadge: React.CSSProperties = {
  fontSize: 11,
  color: '#60a5fa',
};

const dividerStyle: React.CSSProperties = {
  width: 1,
  height: 14,
  background: '#475569',
  flexShrink: 0,
};

const processNameStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#f1f5f9',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const actionsStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  flexShrink: 0,
};

const btnBase: React.CSSProperties = {
  height: 28,
  padding: '0 12px',
  fontSize: 12,
  fontWeight: 500,
  borderRadius: 4,
  border: 'none',
  cursor: 'pointer',
  transition: 'background 0.1s',
};

const btnSecondary: React.CSSProperties = { background: '#334155', color: '#e2e8f0' };
const btnPrimary: React.CSSProperties = { background: '#2563eb', color: '#fff' };
const btnActive: React.CSSProperties = { background: '#0f172a', color: '#60a5fa' };
const btnDisabled: React.CSSProperties = { opacity: 0.45, cursor: 'not-allowed' };
const sepStyle: React.CSSProperties = {
  width: 1, height: 20, background: '#475569', margin: '0 4px',
};
