import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { getAssignToLabel } from '../types/ViewTypes';
import { branchSummaryText } from '../services/branchFields';
import type { ViewStepData } from '../services/WorkflowGraphBuilder';
import {
  CorrectionPill,
  correctionPillStyle,
  StepCardChips,
  StepCardHeader,
  StepOutcomeList,
  stepCardStyle,
  stepHandleStyle,
} from './stepCard';
import { stepAccent } from '@/styles/stepAccents';

export function ViewStepNode({ data, selected }: NodeProps) {
  const { step, outcomeRows, layoutDir, isCorrection, returnTargetName } =
    data as unknown as ViewStepData;
  const isLR = layoutDir === 'LR';
  const assignLabel = getAssignToLabel(step.assignToCode);
  const assigneeName =
    assignLabel === 'Specific User' ? step.assignedUserName
    : assignLabel === 'Team' ? step.teamName
    : step.roundRobinTeamName;
  const controlFlowLabel = branchSummaryText(step);

  // TB: target=Top, source=Bottom, back handles=Left (offset to avoid overlap)
  // LR: target=Left, source=Right, back handles=Bottom (above) and Top (below)
  const mainInPos = isLR ? Position.Left : Position.Top;
  const mainOutPos = isLR ? Position.Right : Position.Bottom;
  const backOutPos = isLR ? Position.Bottom : Position.Left;
  const backInPos = isLR ? Position.Top : Position.Left;
  // Gateway entries leave from the side the gateway sits on, so the edge runs
  // straight across instead of looping out of the bottom and doubling back.
  const sideOutPos = isLR ? Position.Bottom : Position.Right;

  // A pure correction loop collapses to a pill until selected; the handles
  // stay so its edges keep their anchors in both faces.
  if (isCorrection && !selected) {
    return (
      <div style={correctionPillStyle(false)}>
        <Handle type="target" position={mainInPos} id="in" style={pillHandleStyle} />
        <Handle type="source" position={backOutPos} id="back-out" style={pillHandleStyle} />
        <Handle type="target" position={backInPos} id="back-in" style={pillHandleStyle} />
        <Handle type="source" position={sideOutPos} id="side-out" style={pillHandleStyle} />
        <CorrectionPill
          sequenceNo={step.sequenceNo}
          name={step.name}
          returnTargetName={returnTargetName}
        />
        <Handle type="source" position={mainOutPos} id="out" style={pillHandleStyle} />
      </div>
    );
  }

  return (
    <div style={{ ...stepCardStyle({ isSelected: selected ?? false, accentColor: stepAccent(step.id) }), ...(isCorrection ? { zIndex: 10 } : null) }}>
      <Handle type="target" position={mainInPos} id="in" style={stepHandleStyle('var(--text-disabled)')} />
      <Handle type="source" position={backOutPos} id="back-out" style={backHandleStyle(isLR, 'out')} />
      <Handle type="target" position={backInPos} id="back-in" style={backHandleStyle(isLR, 'in')} />
      <Handle type="source" position={sideOutPos} id="side-out" style={stepHandleStyle('var(--warning)')} />

      <StepCardHeader
        sequenceNo={step.sequenceNo}
        name={step.name}
        isTerminating={outcomeRows.some((row) => row.isTerminal)}
        controlFlow={
          controlFlowLabel
            ? {
                label: controlFlowLabel,
                description: step.parentStepName
                  ? `Runs at the same time as "${step.parentStepName}"`
                  : undefined,
              }
            : null
        }
      />

      <StepCardChips assignLabel={assignLabel} assigneeName={assigneeName} />

      <StepOutcomeList rows={outcomeRows} />

      <Handle type="source" position={mainOutPos} id="out" style={stepHandleStyle('var(--text-secondary)')} />
    </div>
  );
}

// The pill's handles are anchors, not affordances — invisible but present so
// React Flow keeps every edge attached across the collapse.
const pillHandleStyle: React.CSSProperties = {
  width: 6,
  height: 6,
  border: 'none',
  background: 'transparent',
};

// Back handles on the same edge (left in TB, top/bottom in LR) need vertical offsets
// in TB mode so they don't overlap at the center.
function backHandleStyle(isLR: boolean, which: 'out' | 'in'): React.CSSProperties {
  const base = stepHandleStyle('var(--accent-branch-bg)');
  if (isLR) return base;
  return { ...base, top: which === 'out' ? '32%' : '68%' };
}
