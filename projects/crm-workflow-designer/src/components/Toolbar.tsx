import { useState } from 'react';
import { useWorkflowStore } from '@/store/workflowStore';
import { useWorkflowSave } from '@/hooks/useWorkflowSave';
import { usePublish } from '@/hooks/usePublish';
import { useAutoLayout } from '@/hooks/useAutoLayout';
import { useExport } from '@/hooks/useExport';

export function Toolbar() {
  const { process, isDirty, isPreviewMode, setPreviewMode } = useWorkflowStore((s) => ({
    process: s.process,
    isDirty: s.isDirty,
    isPreviewMode: s.isPreviewMode,
    setPreviewMode: s.setPreviewMode,
  }));

  const { save, isSaving, error: saveError } = useWorkflowSave();
  const { publish, isPublishing, violations: validationErrors } = usePublish();
  const { applyAutoLayout } = useAutoLayout();
  const { exportJson, exportPng } = useExport();
  const [exportOpen, setExportOpen] = useState(false);

  const processName = process?.name ?? 'Untitled Workflow';
  const versionLabel = process
    ? `v${process.versionMajor}.${process.versionMinor} — ${process.workflowState}`
    : '';

  return (
    <div style={barStyle} role="toolbar" aria-label="Workflow Designer Toolbar">
      {/* Process identity */}
      <div style={identityStyle}>
        <span style={titleStyle}>{processName}</span>
        {versionLabel && <span style={versionStyle}>{versionLabel}</span>}
        {isDirty && <span style={dirtyDot} title="Unsaved changes" aria-label="Unsaved changes">●</span>}
      </div>

      <div style={actionsStyle}>
        {/* Save */}
        <ToolbarButton
          label={isSaving ? 'Saving…' : 'Save'}
          disabled={isSaving || !isDirty}
          onClick={() => void save()}
          title="Save draft (Ctrl+S)"
        />

        {/* Publish */}
        <ToolbarButton
          label={isPublishing ? 'Publishing…' : 'Publish'}
          disabled={isPublishing || !process}
          onClick={() => void publish()}
          primary
          title="Validate and publish workflow"
        />

        <Divider />

        {/* Auto Layout */}
        <ToolbarButton
          label="Auto Layout"
          onClick={() => void applyAutoLayout()}
          title="Auto-arrange nodes (Dagre/ELK)"
        />

        {/* Preview */}
        <ToolbarButton
          label={isPreviewMode ? 'Exit Preview' : 'Preview'}
          onClick={() => setPreviewMode(!isPreviewMode)}
          title="Toggle preview mode (read-only)"
        />

        <Divider />

        {/* Export dropdown */}
        <div style={{ position: 'relative' }}>
          <ToolbarButton
            label="Export ▾"
            onClick={() => setExportOpen((o) => !o)}
            title="Export workflow"
          />
          {exportOpen && (
            <div style={dropdownStyle} onMouseLeave={() => setExportOpen(false)}>
              <DropdownItem label="Export JSON" onClick={() => { exportJson(); setExportOpen(false); }} />
              <DropdownItem label="Export PNG" onClick={() => {
                const el = document.querySelector<HTMLElement>('.react-flow');
                if (el) void exportPng(el);
                setExportOpen(false);
              }} />
            </div>
          )}
        </div>
      </div>

      {/* Error / validation feedback */}
      {(saveError ?? (validationErrors.length > 0 ? validationErrors[0].message : null)) && (
        <div style={errorBannerStyle} role="alert">
          {saveError ?? validationErrors[0]?.message}
        </div>
      )}
    </div>
  );
}

function ToolbarButton({
  label, onClick, disabled = false, primary = false, title,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        ...btnBase,
        ...(primary ? btnPrimary : btnSecondary),
        ...(disabled ? btnDisabled : {}),
      }}
    >
      {label}
    </button>
  );
}

function Divider() {
  return <div style={dividerStyle} aria-hidden="true" />;
}

function DropdownItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={dropdownItemStyle}>
      {label}
    </button>
  );
}

const barStyle: React.CSSProperties = {
  height: 44,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 16px',
  background: '#1e293b',
  borderBottom: '1px solid #334155',
  flexShrink: 0,
  position: 'relative',
  zIndex: 10,
};

const identityStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minWidth: 0,
  flex: 1,
};

const titleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#f1f5f9',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const versionStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#94a3b8',
  whiteSpace: 'nowrap',
};

const dirtyDot: React.CSSProperties = {
  fontSize: 10,
  color: '#f59e0b',
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
  transition: 'background 0.15s',
};

const btnSecondary: React.CSSProperties = {
  background: '#334155',
  color: '#e2e8f0',
};

const btnPrimary: React.CSSProperties = {
  background: '#2563eb',
  color: '#fff',
};

const btnDisabled: React.CSSProperties = {
  opacity: 0.45,
  cursor: 'not-allowed',
};

const dividerStyle: React.CSSProperties = {
  width: 1,
  height: 20,
  background: '#475569',
  margin: '0 4px',
};

const dropdownStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  right: 0,
  marginTop: 4,
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 6,
  padding: 4,
  minWidth: 140,
  zIndex: 100,
  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
};

const dropdownItemStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '6px 12px',
  fontSize: 12,
  color: '#e2e8f0',
  background: 'transparent',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
};

const errorBannerStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: -32,
  left: 0,
  right: 0,
  height: 32,
  display: 'flex',
  alignItems: 'center',
  padding: '0 16px',
  background: '#7f1d1d',
  color: '#fca5a5',
  fontSize: 12,
  zIndex: 9,
};
