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
import {
  useDetailLevel,
  useQuantisedZoom,
  screenStableFontSize,
} from '@/components/common/useDetailLevel';
import { StepActionToolbar, useStepToolbarHover } from '@/components/edit/StepActionToolbar';

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
  const detailLevel = useDetailLevel();
  const zoom = useQuantisedZoom();
  const [isHovered, setIsHovered] = useState(false);
  // The floating action toolbar (CWFD-018): hover claims it, selection keeps
  // it. Rendered on every face so the actions survive semantic zoom.
  const toolbarHover = useStepToolbarHover(stepData.stepId);
  const actionToolbar = (
    <StepActionToolbar stepId={stepData.stepId} isSelected={isSelected} />
  );

  // A pure correction loop collapses to a pill until selected — the full card
  // (with its editing affordances) comes back the moment it is picked.
  if (stepData.isCorrection && !isSelected) {
    return (
      <div style={correctionPillStyle(false)} {...toolbarHover}>
        {actionToolbar}
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

  // A canvas where 28 of 35 cards scream error says nothing (CWFD-009 P4):
  // an issue is a quiet corner badge until the step is selected, and only
  // then does the card wear the full error treatment.
  const hasError = stepData.hasError ?? false;

  // Semantic zoom (P6): below reading zoom the card says less, larger.
  if (detailLevel !== 'full' && !isSelected) {
    const nameSize = screenStableFontSize(zoom, 12, detailLevel === 'dot' ? 40 : 26);
    return (
      <div
        style={editCompactStyle(stepAccent(stepData.stepId), detailLevel === 'dot')}
        title={`${stepData.sequenceNo}. ${stepData.name}`}
        {...toolbarHover}
      >
        {actionToolbar}
        {hasError && <span style={errorCornerBadge} title="This step has a validation issue">!</span>}
        <Handle type="target" position={Position.Left} id="in" style={stepHandleStyle('var(--text-disabled)')} isConnectable />
        <span style={{ ...editCompactName, fontSize: nameSize }}>{stepData.name || 'Unnamed Step'}</span>
        <Handle type="source" position={Position.Right} id="out" style={stepHandleStyle('var(--text-secondary)')} isConnectable />
      </div>
    );
  }

  return (
    <div
      style={stepCardStyle({ isSelected, hasError: hasError && isSelected, accentColor: stepAccent(stepData.stepId) })}
      onMouseEnter={() => {
        setIsHovered(true);
        toolbarHover.onMouseEnter();
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        toolbarHover.onMouseLeave();
      }}
    >
      {actionToolbar}
      {hasError && !isSelected && (
        <span style={errorCornerBadge} title="This step has a validation issue">!</span>
      )}
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

// The zoomed-out face of a step: name only, at a screen-stable size, on the
// step's identity colour. Same footprint as the full card.
function editCompactStyle(accentColor: string, isDot: boolean): React.CSSProperties {
  return {
    width: 280,
    minHeight: isDot ? 84 : 64,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '10px 14px',
    background: 'var(--surface)',
    border: '1.5px solid var(--border)',
    borderLeft: `6px solid ${accentColor}`,
    borderRadius: 10,
    boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
    boxSizing: 'border-box',
    cursor: 'pointer',
    position: 'relative',
  };
}

const editCompactName: React.CSSProperties = {
  fontWeight: 700,
  color: 'var(--text)',
  textAlign: 'center',
  lineHeight: 1.15,
  overflow: 'hidden',
  display: '-webkit-box',
  WebkitLineClamp: 3,
  WebkitBoxOrient: 'vertical',
};

// The quiet face of a validation issue: visible when looked for, silent in
// the aggregate. The full red card is reserved for the selected step.
const errorCornerBadge: React.CSSProperties = {
  position: 'absolute',
  top: -7,
  right: -7,
  width: 16,
  height: 16,
  borderRadius: '50%',
  background: 'var(--error)',
  color: 'var(--text-on-primary)',
  fontSize: 11,
  fontWeight: 700,
  lineHeight: '16px',
  textAlign: 'center',
  boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
  zIndex: 5,
};

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
