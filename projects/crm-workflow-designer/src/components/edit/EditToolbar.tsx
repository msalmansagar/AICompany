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
  onEditProperties: () => void;
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
  onEditProperties,
  onSimulate,
  onAutoSimulate,
  onExitSimulation,
  onSimStepBack,
  onSimReset,
}: EditToolbarProps) {
  const displayName = isDirty ? `${processName} *` : processName;

  return (
    <div className="cmdbar" role="toolbar" aria-label="Workflow editor">
      {isSimulating ? (
        <>
          <button type="button" className="cmd" onClick={onSimStepBack} disabled={!canSimStepBack} title="Step back to previous step">
            ← Back
          </button>
          <button type="button" className="cmd" onClick={onSimReset} title="Restart simulation from the beginning">
            ↺ Reset
          </button>
          <span className="cmd-sep" />
          <button type="button" className="cmd" onClick={onExitSimulation} title="Exit simulation mode">
            Exit simulation
          </button>
        </>
      ) : (
        <>
          <button type="button" className="cmd" onClick={onUndo} disabled={!canUndo} title="Undo last change">
            Undo
          </button>
          <button type="button" className="cmd" onClick={onRedo} disabled={!canRedo} title="Redo last undone change">
            Redo
          </button>
          <span className="cmd-sep" />
          <button type="button" className="cmd" onClick={onAddStep} title="Add a new step to this workflow">
            Add step
          </button>
          <button type="button" className="cmd" onClick={onReLayout} title="Auto-arrange all steps">
            ⊞ Layout
          </button>
          <span className="cmd-sep" />
          <button
            type="button"
            className={validationErrorCount > 0 ? 'cmd danger' : 'cmd'}
            onClick={onValidate}
            title="Check this workflow for problems"
          >
            ✓ Validate
            {validationErrorCount > 0 && <span className="pill error">{validationErrorCount}</span>}
          </button>
          <button
            type="button"
            className="cmd"
            onClick={onEditProperties}
            title="View or edit this process's own settings"
          >
            ⚙ Properties
          </button>
          <span className="cmd-sep" />
          <button type="button" className="cmd" onClick={onSave} disabled={isSaving} title="Save as draft">
            {isSaving ? 'Saving…' : 'Save draft'}
          </button>
          <button
            type="button"
            className="cmd primary"
            onClick={onPublish}
            disabled={!canPublish || isPublishing}
            title={canPublish ? 'Publish this workflow' : 'Save first to enable publish'}
          >
            {isPublishing ? 'Publishing…' : 'Publish'}
          </button>
          <span className="cmd-sep" />
          <button
            type="button"
            className="cmd"
            onClick={onSimulate}
            disabled={!canSimulate}
            title={canSimulate ? 'Run a visual step-by-step simulation' : 'Add steps to enable simulation'}
          >
            ▶ Simulate
          </button>
          <button
            type="button"
            className="cmd"
            onClick={onAutoSimulate}
            disabled={!canSimulate}
            title={canSimulate ? 'Enumerate all possible paths automatically' : 'Add steps to enable simulation'}
          >
            ⏵⏵ Auto
          </button>
          <button type="button" className="cmd danger" onClick={onDiscard} title="Discard all unsaved changes">
            Discard
          </button>
        </>
      )}

      <span className="cmd-spacer" />
      <span style={processNameStyle} title={processName}>
        {isSimulating ? `Simulating: ${processName}` : displayName}
      </span>
    </div>
  );
}

const processNameStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

