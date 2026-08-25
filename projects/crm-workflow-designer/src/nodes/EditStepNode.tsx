import { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { AssignToType } from '@/types/WorkflowTypes';
import { useWorkflowStore, selectCanvasIsReadOnly } from '@/store/workflowStore';
import type { StepOutcomeRow } from '@/services/WorkflowGraphBuilder';
import {
  CANVAS_ASSIGN_LABELS,
  CorrectionPill,
  correctionPillStyle,
  StepCardChips,
  StepCardHeader,
  StepOutcomeList,
  stepCardStyle,
  stepHandleStyle,
} from './stepCard';
import { stepAccent } from '@/styles/stepAccents';

export interface EditStepData extends Record<string, unknown> {
  stepId: string;
  name: string;
  sequenceNo: number;
  assignTo: AssignToType;
  assigneeName: string | null;
  isSelected: boolean;
  hasError: boolean;
  slaSummary: string | null;
  /** The step's decisions and where each one goes, as the view canvas lists them. */
  outcomeRows: StepOutcomeRow[];
  /** "ALL" / "WAIT ALL" when the step declares concurrent control flow (DP-1), else null. */
  controlFlowSummary: string | null;
  /** The same semantics spelled out, for the badge tooltip. */
  controlFlowDescription: string | null;
  /** True when the step is a pure correction loop, drawn as a compact pill. */
  isCorrection?: boolean;
  /** Where the correction resubmits to, for the pill's caption. */
  returnTargetName?: string | null;
}

export function EditStepNode({ data }: NodeProps) {
  const stepData = data as EditStepData;
  const isSelected = stepData.isSelected ?? false;
  const addStepAfter = useWorkflowStore((s) => s.addStepAfter);
  const isReadOnly = useWorkflowStore(selectCanvasIsReadOnly);
  const [isHovered, setIsHovered] = useState(false);

  // A pure correction loop collapses to a pill until selected — the full card
  // (with its editing affordances) comes back the moment it is picked.
  if (stepData.isCorrection && !isSelected) {
    return (
      <div style={correctionPillStyle(false)}>
        <Handle type="target" position={Position.Left} id="in" style={editPillHandleStyle} isConnectable />
        <CorrectionPill
          sequenceNo={stepData.sequenceNo}
          name={stepData.name}
          returnTargetName={stepData.returnTargetName}
          hasError={stepData.hasError ?? false}
        />
        <Handle type="source" position={Position.Right} id="out" style={editPillHandleStyle} isConnectable />
      </div>
    );
  }

  return (
    <div
      style={stepCardStyle({ isSelected, hasError: stepData.hasError ?? false, accentColor: stepAccent(stepData.stepId) })}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Handle type="target" position={Position.Left} id="in" style={stepHandleStyle('var(--text-disabled)')} isConnectable />

      <StepCardHeader
        sequenceNo={stepData.sequenceNo}
        name={stepData.name}
        isTerminating={(stepData.outcomeRows ?? []).some((row) => row.isTerminal)}
        controlFlow={
          stepData.controlFlowSummary
            ? {
                label: stepData.controlFlowSummary,
                description: stepData.controlFlowDescription ?? undefined,
              }
            : null
        }
      />

      <StepCardChips
        assignLabel={CANVAS_ASSIGN_LABELS[stepData.assignTo]}
        assigneeName={stepData.assigneeName}
      >
        {stepData.slaSummary && (
          <span style={slaBadgeStyle} title={stepData.slaSummary}>
            {stepData.slaSummary}
          </span>
        )}
      </StepCardChips>

      <StepOutcomeList rows={stepData.outcomeRows ?? []} />

      {!isReadOnly && (
        <button
          type="button"
          style={addNextStyle(isHovered)}
          title="Add the step that follows this one"
          aria-label={`Add a step after ${stepData.name || 'this step'}`}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            addStepAfter(stepData.stepId);
          }}
        >
          + Next step
        </button>
      )}

      <Handle type="source" position={Position.Right} id="out" style={stepHandleStyle('var(--text-secondary)')} isConnectable />
    </div>
  );
}

// Anchors for the pill's edges — present but quiet.
const editPillHandleStyle: React.CSSProperties = {
  width: 6,
  height: 6,
  border: 'none',
  background: 'var(--accent-branch)',
};

const slaBadgeStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '1px 7px',
  borderRadius: 4,
  background: 'var(--warning-bg)',
  border: '1px solid var(--warning)',
  color: 'var(--warning)',
  fontSize: 10,
  fontWeight: 500,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: 120,
};

/**
 * The add-next-step control, low-contrast until the step is hovered.
 *
 * It sits on the box beside the outgoing handle it stands for, so the two readings of
 * "what comes next" are in the same place. Kept quiet by default because a canvas of
 * eighty steps would otherwise carry eighty buttons competing with the step names.
 */
function addNextStyle(isHovered: boolean): React.CSSProperties {
  return {
    position: 'absolute',
    right: 8,
    bottom: -11,
    fontSize: 10,
    fontWeight: 600,
    lineHeight: 1,
    padding: '4px 8px',
    borderRadius: 10,
    border: `1px solid ${isHovered ? 'var(--primary)' : 'var(--border-strong)'}`,
    background: isHovered ? 'var(--primary)' : 'var(--surface)',
    color: isHovered ? 'var(--text-on-primary)' : 'var(--text-secondary)',
    cursor: 'pointer',
    opacity: isHovered ? 1 : 0.55,
    transition: 'opacity 0.12s, background 0.12s, color 0.12s',
    zIndex: 4,
  };
}
