import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { getAssignToLabel } from '../types/ViewTypes';
import { branchSummaryText } from '../services/branchFields';
import type { ViewStepData } from '../services/WorkflowGraphBuilder';
import {
  StepCardChips,
  StepCardHeader,
  StepOutcomeList,
  stepCardStyle,
  stepHandleStyle,
} from './stepCard';

export function ViewStepNode({ data, selected }: NodeProps) {
  const { step, outcomeRows, layoutDir } = data as unknown as ViewStepData;
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

  return (
    <div style={stepCardStyle({ isSelected: selected ?? false })}>
      <Handle type="target" position={mainInPos} id="in" style={stepHandleStyle('var(--text-disabled)')} />
      <Handle type="source" position={backOutPos} id="back-out" style={backHandleStyle(isLR, 'out')} />
      <Handle type="target" position={backInPos} id="back-in" style={backHandleStyle(isLR, 'in')} />

      <StepCardHeader
        sequenceNo={step.sequenceNo}
        name={step.name}
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

// Back handles on the same edge (left in TB, top/bottom in LR) need vertical offsets
// in TB mode so they don't overlap at the center.
function backHandleStyle(isLR: boolean, which: 'out' | 'in'): React.CSSProperties {
  const base = stepHandleStyle('var(--accent-branch-bg)');
  if (isLR) return base;
  return { ...base, top: which === 'out' ? '32%' : '68%' };
}
