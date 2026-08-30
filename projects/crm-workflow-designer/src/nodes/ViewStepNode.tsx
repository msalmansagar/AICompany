import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { getAssignToLabel } from '../types/ViewTypes';
import { branchSummaryText } from '../services/branchFields';
import type { ViewStepData } from '../services/WorkflowGraphBuilder';
import {
  CorrectionPill,
  correctionPillStyle,
  IncomingReturnChips,
  partitionOutcomeRows,
  ReturnCountBadge,
  ReturnListPopover,
  SPOTLIGHT_ENDPOINT_RING,
  StepCardChips,
  StepCardHeader,
  StepOutcomeList,
  stepCardStyle,
  stepHandleStyle,
} from './stepCard';
import type { ReturnBadgeInteraction } from './stepCard';
import { stepAccent } from '@/styles/stepAccents';
import {
  useDetailLevel,
  useQuantisedZoom,
  screenStableFontSize,
} from '@/components/common/useDetailLevel';

export function ViewStepNode({ data, selected }: NodeProps) {
  const { step, outcomeRows, layoutDir, isCorrection, returnTargetName } =
    data as unknown as ViewStepData;
  const badge = data as unknown as ReturnBadgeInteraction;
  const stepReturnRefs = badge.stepReturnRefs ?? [];
  const usesBadge = badge.returnDisplay === 'badge' && !isCorrection;
  // In badge mode the ↩ rows AND the rows that only feed a correction pill
  // fold into the counter — they are the same relationship, said twice.
  const refOutcomeIds = new Set(stepReturnRefs.map((ref) => ref.outcomeId));
  const visibleRows = usesBadge
    ? partitionOutcomeRows(outcomeRows).forwardRows.filter((row) => !refOutcomeIds.has(row.id))
    : outcomeRows;
  const emptySet: ReadonlySet<string> = new Set<string>();
  const detailLevel = useDetailLevel();
  const zoom = useQuantisedZoom();
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
      <div
        style={{
          ...correctionPillStyle(false),
          ...(badge.isSpotlightEndpoint ? { boxShadow: SPOTLIGHT_ENDPOINT_RING } : null),
        }}
      >
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

  // Semantic zoom: below reading zoom the card says less, LARGER, instead of
  // shrinking eleven-point text into confetti. Selection always restores the
  // full card.
  if (detailLevel !== 'full' && !selected && !badge.isSpotlightEndpoint) {
    const nameSize = screenStableFontSize(zoom, 12, detailLevel === 'dot' ? 40 : 26);
    return (
      <div
        style={compactCardStyle(stepAccent(step.id), detailLevel === 'dot')}
        title={`${step.sequenceNo}. ${step.name}`}
      >
        <Handle type="target" position={mainInPos} id="in" style={stepHandleStyle('var(--text-disabled)')} />
        <Handle type="source" position={backOutPos} id="back-out" style={backHandleStyle(isLR, 'out')} />
        <Handle type="target" position={backInPos} id="back-in" style={backHandleStyle(isLR, 'in')} />
        <Handle type="source" position={sideOutPos} id="side-out" style={stepHandleStyle('var(--warning)')} />
        <span style={{ ...compactNameStyle, fontSize: nameSize }}>
          {isCorrection ? '↩ ' : ''}
          {step.name || 'Unnamed Step'}
        </span>
        <Handle type="source" position={mainOutPos} id="out" style={stepHandleStyle('var(--text-secondary)')} />
      </div>
    );
  }

  return (
    <div
      style={{
        ...stepCardStyle({ isSelected: selected ?? false, accentColor: stepAccent(step.id) }),
        ...(isCorrection ? { zIndex: 10 } : null),
        ...(badge.isSpotlightEndpoint ? { boxShadow: SPOTLIGHT_ENDPOINT_RING } : null),
      }}
    >
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

      {badge.incomingReturns && <IncomingReturnChips incoming={badge.incomingReturns} />}

      <StepCardChips assignLabel={assignLabel} assigneeName={assigneeName}>
        {usesBadge && (
          <ReturnCountBadge
            count={stepReturnRefs.length}
            isOpen={badge.isReturnMenuOpen ?? false}
            onClick={() => badge.onReturnBadgeClick?.(step.id)}
          />
        )}
      </StepCardChips>

      <StepOutcomeList rows={visibleRows} />

      {usesBadge && badge.isReturnMenuOpen && (
        <ReturnListPopover
          refs={stepReturnRefs}
          pinnedOutcomeIds={badge.pinnedReturnOutcomeIds ?? emptySet}
          onHoverRow={(outcomeId) => badge.onReturnRowHover?.(outcomeId)}
          onClickRow={(outcomeId) => badge.onReturnRowClick?.(outcomeId)}
        />
      )}

      <Handle type="source" position={mainOutPos} id="out" style={stepHandleStyle('var(--text-secondary)')} />
    </div>
  );
}

// The zoomed-out face of a step: its name at a screen-stable size on the
// step's identity colour. Same footprint as the full card, so edges and the
// layout keep their geometry.
function compactCardStyle(accentColor: string, isDot: boolean): React.CSSProperties {
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

const compactNameStyle: React.CSSProperties = {
  fontWeight: 700,
  color: 'var(--text)',
  textAlign: 'center',
  lineHeight: 1.15,
  overflow: 'hidden',
  display: '-webkit-box',
  WebkitLineClamp: 3,
  WebkitBoxOrient: 'vertical',
};

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
