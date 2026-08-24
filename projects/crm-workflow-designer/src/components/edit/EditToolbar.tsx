import type { ReturnPathMode } from '@/services/viewFilters';
import { RETURN_MODE_LABELS } from '@/services/viewFilters';

interface EditToolbarProps {
  processName: string;
  /** Demo build is offered only on an empty, clean draft. */
  canDemo?: boolean;
  onDemo?: () => void;
  /** 'draft' | 'published' | 'archived' — drawn as a pill beside the name. */
  workflowState?: string;
  isDirty: boolean;
  isSaving: boolean;
  isPublishing: boolean;
  canPublish: boolean;
  isSimulating: boolean;
  canSimulate: boolean;
  canSimStepBack: boolean;
  validationErrorCount: number;
  showMiniMap: boolean;
  showEdgeLabels: boolean;
  returnPathMode: ReturnPathMode;
  onAddStep: () => void;
  onReLayout: () => void;
  onToggleMiniMap: () => void;
  onToggleEdgeLabels: () => void;
  onCycleReturnPaths: () => void;
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
  canDemo,
  onDemo,
  workflowState,
  isDirty,
  isSaving,
  isPublishing,
  canPublish,
  isSimulating,
  canSimulate,
  canSimStepBack,
  validationErrorCount,
  showMiniMap,
  showEdgeLabels,
  returnPathMode,
  onAddStep,
  onReLayout,
  onToggleMiniMap,
  onToggleEdgeLabels,
  onCycleReturnPaths,
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
          <button
            type="button"
            className={showMiniMap ? 'cmd primary' : 'cmd'}
            onClick={onToggleMiniMap}
            title="Toggle minimap"
          >
            {showMiniMap ? 'Hide map' : 'Mini map'}
          </button>
          <button
            type="button"
            className={showEdgeLabels ? 'cmd' : 'cmd primary'}
            onClick={onToggleEdgeLabels}
            title={showEdgeLabels ? 'Hide the labels on edges' : 'Show the labels on edges'}
          >
            {showEdgeLabels ? 'Hide labels' : 'Labels'}
          </button>
          <button
            type="button"
            className={returnPathMode === 'show' ? 'cmd' : 'cmd primary'}
            onClick={onCycleReturnPaths}
            title="Cycle return-path visibility: show everything → hide the return lines → hide the return nodes too"
          >
            {RETURN_MODE_LABELS[returnPathMode]}
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
          {canDemo && onDemo && (
            <button
              type="button"
              className="cmd"
              onClick={onDemo}
              title="Watch a narrated demo build a small process on this canvas"
            >
              ▶ Demo build
            </button>
          )}
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
      {!isSimulating && workflowState && (
        <span className={workflowState === 'published' ? 'pill published' : 'pill draft'}>
          {workflowState === 'published' ? 'Published' : workflowState === 'archived' ? 'Archived' : 'Draft'}
        </span>
      )}
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

