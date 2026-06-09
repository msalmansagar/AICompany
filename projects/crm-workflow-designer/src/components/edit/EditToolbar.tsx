interface EditToolbarProps {
  processName: string;
  isDirty: boolean;
  isSaving: boolean;
  isPublishing: boolean;
  canPublish: boolean;
  onAddStep: () => void;
  onSave: () => void;
  onPublish: () => void;
  onDiscard: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function EditToolbar({
  processName,
  isDirty,
  isSaving,
  isPublishing,
  canPublish,
  onAddStep,
  onSave,
  onPublish,
  onDiscard,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: EditToolbarProps) {
  const displayName = isDirty ? `${processName} *` : processName;

  return (
    <div style={wrapperStyle}>
      <div style={barStyle} role="toolbar" aria-label="Workflow Edit Toolbar">
        <div style={identityStyle}>
          <span style={logoText}>Workflow Designer</span>
          <span style={dividerStyle} />
          <span style={processNameStyle} title={processName}>
            {displayName}
          </span>
        </div>

        <div style={actionsStyle}>
          <ToolBtn label="Undo" onClick={onUndo} disabled={!canUndo} title="Undo last change" />
          <ToolBtn label="Redo" onClick={onRedo} disabled={!canRedo} title="Redo last undone change" />
          <Sep />
          <ToolBtn label="Add Step" onClick={onAddStep} title="Add a new step to this workflow" />
          <Sep />
          <ToolBtn
            label={isSaving ? 'Saving…' : 'Save Draft'}
            onClick={onSave}
            disabled={isSaving}
            title="Save as draft"
          />
          <ToolBtn
            label={isPublishing ? 'Publishing…' : 'Publish'}
            onClick={onPublish}
            disabled={!canPublish || isPublishing}
            primary
            title={canPublish ? 'Publish this workflow' : 'Save first to enable publish'}
          />
          <Sep />
          <ToolBtn label="Discard" onClick={onDiscard} title="Discard all unsaved changes" />
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
}: {
  label: string;
  onClick: () => void;
  title?: string;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
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

function Sep() {
  return <div style={sepStyle} />;
}

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
const btnDisabled: React.CSSProperties = { opacity: 0.45, cursor: 'not-allowed' };

const sepStyle: React.CSSProperties = {
  width: 1,
  height: 20,
  background: '#475569',
  margin: '0 4px',
};
