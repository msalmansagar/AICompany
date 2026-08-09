interface EditToolbarProps {
  processName: string;
  isDirty: boolean;
  isSaving: boolean;
  isPublishing: boolean;
  canPublish: boolean;
  isSimulating: boolean;
  canSimulate: boolean;
  canSimStepBack: boolean;
  validationErrorCount: number;
  onBack: () => void;
  onAddStep: () => void;
  onReLayout: () => void;
  onSave: () => void;
  onPublish: () => void;
  onDiscard: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onValidate: () => void;
  onSimulate: () => void;
  onAutoSimulate: () => void;
  onExitSimulation: () => void;
  onSimStepBack: () => void;
  onSimReset: () => void;
}

export function EditToolbar({
  processName,
  isDirty,
  isSaving,
  isPublishing,
  canPublish,
  isSimulating,
  canSimulate,
  canSimStepBack,
  validationErrorCount,
  onBack,
  onAddStep,
  onReLayout,
  onSave,
  onPublish,
  onDiscard,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onValidate,
  onSimulate,
  onAutoSimulate,
  onExitSimulation,
  onSimStepBack,
  onSimReset,
}: EditToolbarProps) {
  const displayName = isDirty ? `${processName} *` : processName;

  return (
    <div style={wrapperStyle}>
      <div style={barStyle} role="toolbar" aria-label="Workflow Edit Toolbar">
        <div style={identityStyle}>
          {!isSimulating && (
            <>
              <button
                type="button"
                onClick={onBack}
                style={backBtnStyle}
                title="Back to process list"
              >
                ← Processes
              </button>
              <span style={dividerStyle} />
            </>
          )}
          <span style={logoText}>Workflow Designer</span>
          <span style={dividerStyle} />
          <span style={processNameStyle} title={processName}>
            {isSimulating ? `Simulating: ${processName}` : displayName}
          </span>
        </div>

        <div style={actionsStyle}>
          {isSimulating ? (
            <>
              <ToolBtn label="← Back" onClick={onSimStepBack} disabled={!canSimStepBack} title="Step back to previous step" />
              <ToolBtn label="↺ Reset" onClick={onSimReset} title="Restart simulation from the beginning" />
              <Sep />
              <ToolBtn label="Exit Simulation" onClick={onExitSimulation} title="Exit simulation mode" />
            </>
          ) : (
            <>
              <ToolBtn label="Undo" onClick={onUndo} disabled={!canUndo} title="Undo last change" />
              <ToolBtn label="Redo" onClick={onRedo} disabled={!canRedo} title="Redo last undone change" />
              <Sep />
              <ToolBtn label="Add Step" onClick={onAddStep} title="Add a new step to this workflow" />
              <ToolBtn label="⊞ Layout" onClick={onReLayout} title="Auto-arrange all steps" />
              <Sep />
              <ValidateBtn
                errorCount={validationErrorCount}
                onClick={onValidate}
              />
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
              <ToolBtn
                label="▶ Simulate"
                onClick={onSimulate}
                disabled={!canSimulate}
                title={canSimulate ? 'Run a visual step-by-step simulation' : 'Add steps to enable simulation'}
              />
              <ToolBtn
                label="⏵⏵ Auto"
                onClick={onAutoSimulate}
                disabled={!canSimulate}
                title={canSimulate ? 'Enumerate all possible paths automatically' : 'Add steps to enable simulation'}
              />
              <ToolBtn label="Discard" onClick={onDiscard} title="Discard all unsaved changes" />
            </>
          )}
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

function ValidateBtn({ errorCount, onClick }: { errorCount: number; onClick: () => void }) {
  const hasErrors = errorCount > 0;
  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        title="Run process validation"
        onClick={onClick}
        style={{
          ...btnBase,
          ...(hasErrors ? btnError : btnSecondary),
        }}
      >
        ✓ Validate
      </button>
      {hasErrors && (
        <span style={errorCountBadge}>{errorCount}</span>
      )}
    </div>
  );
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
  background: 'var(--surface)',
  borderBottom: '1px solid var(--border)',
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
  color: 'var(--text-disabled)',
  flexShrink: 0,
};

const dividerStyle: React.CSSProperties = {
  width: 1,
  height: 14,
  background: 'var(--surface-alt)',
  flexShrink: 0,
};

const processNameStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text)',
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

const backBtnStyle: React.CSSProperties = {
  height: 26,
  padding: '0 10px',
  fontSize: 11,
  fontWeight: 500,
  borderRadius: 4,
  border: 'none',
  cursor: 'pointer',
  background: 'transparent',
  color: 'var(--text-secondary)',
  flexShrink: 0,
};

const btnSecondary: React.CSSProperties = { background: 'var(--surface-alt)', color: 'var(--text)' };
const btnPrimary: React.CSSProperties = { background: 'var(--primary)', color: 'var(--text-on-primary)' };
const btnError: React.CSSProperties = { background: 'var(--error-bg)', color: 'var(--error)' };
const btnDisabled: React.CSSProperties = { opacity: 0.45, cursor: 'not-allowed' };

const errorCountBadge: React.CSSProperties = {
  position: 'absolute',
  top: -6,
  right: -6,
  minWidth: 16,
  height: 16,
  borderRadius: 8,
  background: 'var(--error)',
  color: 'var(--text-on-primary)',
  fontSize: 9,
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 3px',
  border: '1.5px solid var(--border-strong)',
  lineHeight: 1,
};

const sepStyle: React.CSSProperties = {
  width: 1,
  height: 20,
  background: 'var(--surface-alt)',
  margin: '0 4px',
};
