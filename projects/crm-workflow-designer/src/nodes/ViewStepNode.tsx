import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { getAssignToLabel } from '../types/ViewTypes';
import { branchSummaryText } from '../services/branchFields';
import type { ViewStepData, StepOutcomeRow } from '../services/WorkflowGraphBuilder';
import { NODE_NEUTRAL_CHIP } from '@/styles/surfacePairs';

const ASSIGN_COLOR: Record<string, { bg: string; text: string }> = {
  'Specific User': { bg: 'var(--primary-tint-2)', text: 'var(--primary-pressed)' },
  'Team':          { bg: 'var(--success-bg)', text: 'var(--success)' },
  'Round Robin':   { bg: 'var(--accent-branch-bg)', text: 'var(--accent-branch)' },
};

export function ViewStepNode({ data, selected }: NodeProps) {
  const { step, outcomeRows, layoutDir } = data as unknown as ViewStepData;
  const isLR = layoutDir === 'LR';
  const assignLabel = getAssignToLabel(step.assignToCode);
  const assignColor = ASSIGN_COLOR[assignLabel] ?? { bg: 'var(--surface-alt)', text: 'var(--text-secondary)' };
  const assigneeName =
    assignLabel === 'Specific User' ? step.assignedUserName
    : assignLabel === 'Team'        ? step.teamName
    :                                 step.roundRobinTeamName;
  const controlFlowLabel = branchSummaryText(step);

  // TB: target=Top, source=Bottom, back handles=Left (offset to avoid overlap)
  // LR: target=Left, source=Right, back handles=Bottom (above) and Top (below)
  const mainInPos  = isLR ? Position.Left   : Position.Top;
  const mainOutPos = isLR ? Position.Right  : Position.Bottom;
  const backOutPos = isLR ? Position.Bottom : Position.Left;
  const backInPos  = isLR ? Position.Top    : Position.Left;

  return (
    <div style={containerStyle(selected ?? false)}>
      <Handle type="target" position={mainInPos}  id="in"       style={handle('var(--text-disabled)')} />
      <Handle type="source" position={backOutPos} id="back-out" style={backHandleStyle(isLR, 'out')} />
      <Handle type="target" position={backInPos}  id="back-in"  style={backHandleStyle(isLR, 'in')} />

      <div style={headerRow}>
        <span style={seqBadge}>{step.sequenceNo}</span>
        <span style={nameText}>{step.name || 'Unnamed Step'}</span>
        {controlFlowLabel && (
          <span style={controlFlowBadge} title={step.parentStepName ? `Runs at the same time as "${step.parentStepName}"` : undefined}>
            ⧉ {controlFlowLabel}
          </span>
        )}
      </div>

      <div style={chipsRow}>
        <span style={chip(assignColor.bg, assignColor.text)}>{assignLabel}</span>
        {assigneeName && (
          <span style={chip(NODE_NEUTRAL_CHIP.background, NODE_NEUTRAL_CHIP.foreground)} title={assigneeName}>
            {truncate(assigneeName, 22)}
          </span>
        )}
      </div>

      {outcomeRows.length > 0 && (
        <>
          <div style={divider} />
          <div style={outcomesSection}>
            {outcomeRows.map((row) => (
              <OutcomeRow key={row.id} row={row} />
            ))}
          </div>
        </>
      )}

      <Handle type="source" position={mainOutPos} id="out" style={handle('var(--text-secondary)')} />
    </div>
  );
}

function OutcomeRow({ row }: { row: StepOutcomeRow }) {
  if (row.isBackEdge) {
    return (
      <div style={outcomeRow}>
        <span style={icon('var(--accent-branch)')}>↩</span>
        <span style={outcomeLabel('var(--accent-branch)')}>{truncate(row.name, 20)}</span>
        {row.nextStepName && (
          <span style={outcomeTarget('var(--accent-branch)')}>→ {truncate(row.nextStepName, 16)}</span>
        )}
      </div>
    );
  }

  if (row.isTerminal && row.applyFilter) {
    return (
      <div style={outcomeRow}>
        <span style={icon('var(--warning)')}>◈</span>
        <span style={outcomeLabel('var(--warning)')}>{truncate(row.name, 20)}</span>
        <span style={conditionBadge}>CONDITION</span>
      </div>
    );
  }

  if (row.isTerminal) {
    return (
      <div style={outcomeRow}>
        <span style={icon('var(--error)')}>⊘</span>
        <span style={outcomeLabel('var(--error)')}>{truncate(row.name, 20)}</span>
        <span style={outcomeTarget('var(--error)')}>→ END</span>
      </div>
    );
  }

  return (
    <div style={outcomeRow}>
      <span style={icon('var(--success)')}>→</span>
      <span style={outcomeLabel('var(--text)')}>{truncate(row.name, 20)}</span>
      <div style={forwardRight}>
        {row.applyFilter && <span style={filterBadge}>◈</span>}
        {row.nextStepName && (
          <span style={outcomeTarget('var(--text-secondary)')}>{truncate(row.nextStepName, 14)}</span>
        )}
      </div>
    </div>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function handle(color: string): React.CSSProperties {
  return { background: color, width: 10, height: 10, border: '2px solid var(--border)', borderRadius: '50%' };
}

// Back handles on the same edge (left in TB, top/bottom in LR) need vertical offsets
// in TB mode so they don't overlap at the center.
function backHandleStyle(isLR: boolean, which: 'out' | 'in'): React.CSSProperties {
  const base = { background: 'var(--accent-branch-bg)', width: 10, height: 10, border: '2px solid var(--border)', borderRadius: '50%' };
  if (isLR) return base;
  // In TB the back handles are both on Position.Left, so offset them vertically.
  return { ...base, top: which === 'out' ? '32%' : '68%' };
}

function containerStyle(selected: boolean): React.CSSProperties {
  return {
    background: 'var(--surface)',
    border: selected ? '2px solid var(--primary)' : '1.5px solid var(--border)',
    borderRadius: 10,
    padding: '10px 14px 10px',
    width: 280,
    boxShadow: selected
      ? '0 0 0 3px rgba(37,99,235,0.15), 0 4px 12px rgba(0,0,0,0.1)'
      : '0 2px 8px rgba(0,0,0,0.07)',
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: 'border-color 0.12s, box-shadow 0.12s',
    boxSizing: 'border-box',
  };
}

function chip(bg: string, color: string): React.CSSProperties {
  return {
    display: 'inline-block',
    fontSize: 10,
    fontWeight: 500,
    background: bg,
    color,
    border: `1px solid ${NODE_NEUTRAL_CHIP.border}`,
    borderRadius: 4,
    padding: '1px 7px',
    maxWidth: 120,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };
}

function icon(color: string): React.CSSProperties {
  return { fontSize: 11, color, fontWeight: 700, flexShrink: 0, width: 14, textAlign: 'center' };
}

function outcomeLabel(color: string): React.CSSProperties {
  return { fontSize: 11, color, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
}

function outcomeTarget(color: string): React.CSSProperties {
  return {
    fontSize: 10, color, opacity: 0.75, flexShrink: 0,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 90,
  };
}

const headerRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 };

const seqBadge: React.CSSProperties = {
  background: 'var(--primary)', color: 'var(--text-on-primary)', borderRadius: 4,
  fontSize: 10, fontWeight: 700, padding: '1px 7px', flexShrink: 0, lineHeight: '16px',
};

const nameText: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: 'var(--text)',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
};

// DP-1: the label, not the colour, is what makes this readable in greyscale
// export and to colour-blind reviewers (NFR-009).
const controlFlowBadge: React.CSSProperties = {
  background: 'var(--accent-branch-bg)', color: 'var(--accent-branch)', border: '1px solid var(--accent-branch)', borderRadius: 4,
  fontSize: 9, fontWeight: 700, padding: '1px 5px', flexShrink: 0, lineHeight: '16px',
  whiteSpace: 'nowrap',
};

const chipsRow: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 4 };
const divider: React.CSSProperties = { borderTop: '1px solid var(--border)', margin: '8px 0 6px' };
const outcomesSection: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3 };
const outcomeRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 5, minHeight: 20 };
const forwardRight: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 };
const filterBadge: React.CSSProperties = { fontSize: 9, color: 'var(--warning)', fontWeight: 700 };

const conditionBadge: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  color: 'var(--warning)',
  background: 'var(--warning-bg)',
  border: '1px solid var(--warning)',
  borderRadius: 3,
  padding: '1px 5px',
  flexShrink: 0,
};
