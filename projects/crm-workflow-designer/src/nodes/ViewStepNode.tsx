import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { getAssignToLabel } from '../types/ViewTypes';
import type { ViewStepData, StepOutcomeRow } from '../services/WorkflowGraphBuilder';

const ASSIGN_COLOR: Record<string, { bg: string; text: string }> = {
  'Specific User': { bg: '#eff6ff', text: '#1d4ed8' },
  'Team':          { bg: '#f0fdf4', text: '#15803d' },
  'Round Robin':   { bg: '#faf5ff', text: '#7e22ce' },
};

export function ViewStepNode({ data, selected }: NodeProps) {
  const { step, outcomeRows, layoutDir } = data as unknown as ViewStepData;
  const isLR = layoutDir === 'LR';
  const assignLabel = getAssignToLabel(step.assignToCode);
  const assignColor = ASSIGN_COLOR[assignLabel] ?? { bg: '#f1f5f9', text: '#475569' };
  const assigneeName =
    assignLabel === 'Specific User' ? step.assignedUserName
    : assignLabel === 'Team'        ? step.teamName
    :                                 step.roundRobinTeamName;

  // TB: target=Top, source=Bottom, back handles=Left (offset to avoid overlap)
  // LR: target=Left, source=Right, back handles=Bottom (above) and Top (below)
  const mainInPos  = isLR ? Position.Left   : Position.Top;
  const mainOutPos = isLR ? Position.Right  : Position.Bottom;
  const backOutPos = isLR ? Position.Bottom : Position.Left;
  const backInPos  = isLR ? Position.Top    : Position.Left;

  return (
    <div style={containerStyle(selected ?? false)}>
      <Handle type="target" position={mainInPos}  id="in"       style={handle('#94a3b8')} />
      <Handle type="source" position={backOutPos} id="back-out" style={backHandleStyle(isLR, 'out')} />
      <Handle type="target" position={backInPos}  id="back-in"  style={backHandleStyle(isLR, 'in')} />

      <div style={headerRow}>
        <span style={seqBadge}>{step.sequenceNo}</span>
        <span style={nameText}>{step.name || 'Unnamed Step'}</span>
      </div>

      <div style={chipsRow}>
        <span style={chip(assignColor.bg, assignColor.text)}>{assignLabel}</span>
        {assigneeName && (
          <span style={chip('#f8fafc', '#374151')} title={assigneeName}>
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

      <Handle type="source" position={mainOutPos} id="out" style={handle('#64748b')} />
    </div>
  );
}

function OutcomeRow({ row }: { row: StepOutcomeRow }) {
  if (row.isBackEdge) {
    return (
      <div style={outcomeRow}>
        <span style={icon('#7c3aed')}>↩</span>
        <span style={outcomeLabel('#4c1d95')}>{truncate(row.name, 20)}</span>
        {row.nextStepName && (
          <span style={outcomeTarget('#7c3aed')}>→ {truncate(row.nextStepName, 16)}</span>
        )}
      </div>
    );
  }

  if (row.isTerminal && row.applyFilter) {
    return (
      <div style={outcomeRow}>
        <span style={icon('#d97706')}>◈</span>
        <span style={outcomeLabel('#92400e')}>{truncate(row.name, 20)}</span>
        <span style={conditionBadge}>CONDITION</span>
      </div>
    );
  }

  if (row.isTerminal) {
    return (
      <div style={outcomeRow}>
        <span style={icon('#dc2626')}>⊘</span>
        <span style={outcomeLabel('#7f1d1d')}>{truncate(row.name, 20)}</span>
        <span style={outcomeTarget('#dc2626')}>→ END</span>
      </div>
    );
  }

  return (
    <div style={outcomeRow}>
      <span style={icon('#16a34a')}>→</span>
      <span style={outcomeLabel('#1e293b')}>{truncate(row.name, 20)}</span>
      <div style={forwardRight}>
        {row.applyFilter && <span style={filterBadge}>◈</span>}
        {row.nextStepName && (
          <span style={outcomeTarget('#475569')}>{truncate(row.nextStepName, 14)}</span>
        )}
      </div>
    </div>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function handle(color: string): React.CSSProperties {
  return { background: color, width: 10, height: 10, border: '2px solid #fff', borderRadius: '50%' };
}

// Back handles on the same edge (left in TB, top/bottom in LR) need vertical offsets
// in TB mode so they don't overlap at the center.
function backHandleStyle(isLR: boolean, which: 'out' | 'in'): React.CSSProperties {
  const base = { background: '#a78bfa', width: 10, height: 10, border: '2px solid #fff', borderRadius: '50%' };
  if (isLR) return base;
  // In TB the back handles are both on Position.Left, so offset them vertically.
  return { ...base, top: which === 'out' ? '32%' : '68%' };
}

function containerStyle(selected: boolean): React.CSSProperties {
  return {
    background: '#fff',
    border: selected ? '2px solid #2563eb' : '1.5px solid #e2e8f0',
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
    border: `1px solid ${color}22`,
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
  background: '#2563eb', color: '#fff', borderRadius: 4,
  fontSize: 10, fontWeight: 700, padding: '1px 7px', flexShrink: 0, lineHeight: '16px',
};

const nameText: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: '#1e293b',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
};

const chipsRow: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 4 };
const divider: React.CSSProperties = { borderTop: '1px solid #f1f5f9', margin: '8px 0 6px' };
const outcomesSection: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3 };
const outcomeRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 5, minHeight: 20 };
const forwardRight: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 };
const filterBadge: React.CSSProperties = { fontSize: 9, color: '#d97706', fontWeight: 700 };

const conditionBadge: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  color: '#92400e',
  background: '#fef3c7',
  border: '1px solid #fcd34d',
  borderRadius: 3,
  padding: '1px 5px',
  flexShrink: 0,
};
