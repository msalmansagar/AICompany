import { ToolbarButton, ToolbarOverflow } from '@/components/common/ToolbarButton';

interface EditToolbarProps {
  processName: string;
  /** Demo build is offered only on an empty, clean draft. */
  canDemo?: boolean;
  onDemo?: () => void;
  /** Opens the standalone process summary. */
  onOpenSummary?: () => void;
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
  isFocusMode: boolean;
  onToggleFocusMode: () => void;
  onAddStep: () => void;
  onReLayout: () => void;
  onToggleMiniMap: () => void;
  onToggleEdgeLabels: () => void;
  onSave: () => void;
  onPublish: () => void;
  onDiscard: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onValidate: () => void;
  onEditProperties: () => void;
  onBulkEdit: () => void;
  onReorderSteps: () => void;
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
  onOpenSummary,
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
  isFocusMode,
  onToggleFocusMode,
  onAddStep,
  onReLayout,
  onToggleMiniMap,
  onToggleEdgeLabels,
  onSave,
  onPublish,
  onDiscard,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onValidate,
  onEditProperties,
  onBulkEdit,
  onReorderSteps,
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
          {/* Editing: the two commands a maker reaches for constantly. */}
          <ToolbarButton icon="undo" label="Undo last change" iconOnly disabled={!canUndo} onClick={onUndo} />
          <ToolbarButton icon="redo" label="Redo last undone change" iconOnly disabled={!canRedo} onClick={onRedo} />
          <span className="cmd-sep" />
          <ToolbarButton icon="addStep" label="Add step" title="Add a new step to this workflow" onClick={onAddStep} />
          <ToolbarButton icon="layout" label="Auto-arrange all steps" iconOnly onClick={onReLayout} />

          {/* Canvas toggles: glyph only — three labelled toggles were what
              pushed this bar into a sideways scroll. */}
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
            icon="focus"
            label={isFocusMode ? 'Exit Focus Mode' : 'Focus Mode'}
            title="Focus Mode: fade everything except the selected step and its relationships"
            iconOnly={!isFocusMode}
            active={isFocusMode}
            onClick={onToggleFocusMode}
          />
          <span className="cmd-sep" />

          <ToolbarButton
            icon="validate"
            label="Validate"
            title="Check this workflow for problems"
            tone={validationErrorCount > 0 ? 'danger' : 'default'}
            onClick={onValidate}
          >
            {validationErrorCount > 0 && <span className="pill error">{validationErrorCount}</span>}
          </ToolbarButton>

          {/* Committing work keeps its words: these are the consequential ones. */}
          <span className="cmd-sep" />
          <ToolbarButton
            icon="save"
            label={isSaving ? 'Saving…' : 'Save draft'}
            title="Save as draft"
            disabled={isSaving}
            onClick={onSave}
          />
          <ToolbarButton
            icon="publish"
            label={isPublishing ? 'Publishing…' : 'Publish'}
            title={canPublish ? 'Publish this workflow' : 'Save first to enable publish'}
            tone="primary"
            disabled={!canPublish || isPublishing}
            onClick={onPublish}
          />

          {/* Everything occasional lives one click away instead of off-screen. */}
          <ToolbarOverflow
            items={[
              ...(onOpenSummary
                ? [{ icon: 'summary' as const, label: 'Process summary', onClick: onOpenSummary }]
                : []),
              { icon: 'settings' as const, label: 'Process properties', onClick: onEditProperties },
              { icon: 'summary' as const, label: 'Edit all steps', onClick: onBulkEdit },
              { icon: 'layout' as const, label: 'Reorder steps', onClick: onReorderSteps },
              ...(canDemo && onDemo
                ? [{ icon: 'demo' as const, label: 'Demo build', onClick: onDemo }]
                : []),
              {
                icon: 'simulate' as const,
                label: 'Simulate',
                onClick: onSimulate,
                disabled: !canSimulate,
              },
              {
                icon: 'auto' as const,
                label: 'Enumerate all paths',
                onClick: onAutoSimulate,
                disabled: !canSimulate,
              },
              { icon: 'discard' as const, label: 'Discard changes', onClick: onDiscard, tone: 'danger' as const },
            ]}
          />
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

