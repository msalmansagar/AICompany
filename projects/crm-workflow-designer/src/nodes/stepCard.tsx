import type { ReactNode } from 'react';
import type { StepOutcomeRow } from '../services/WorkflowGraphBuilder';
import { NODE_NEUTRAL_CHIP, TERMINATING_BADGE_REGISTRATION } from '@/styles/surfacePairs';
import type { AssignToType } from '@/types/WorkflowTypes';

/**
 * The step card as both canvases draw it.
 *
 * View and edit rendered the same step from two independent copies of this markup, and
 * they drifted: edit ended up with a near-black border, a disabled-looking sequence
 * badge, and no outcome rows at all, so the same step read as a different object
 * depending on which canvas you opened. Everything visual lives here now; each node
 * supplies only what is genuinely mode-specific.
 */

export const STEP_CARD_WIDTH = 280;

/**
 * What the canvas calls each assignment mode.
 *
 * The properties panel offers 'Apply Round Robin' as an action to choose; on a card the
 * chip is describing the step, so both canvases say what the view canvas already said.
 */
export const CANVAS_ASSIGN_LABELS: Record<AssignToType, string> = {
  user: 'Specific User',
  team: 'Team',
  readFromParent: 'Read From Parent',
  roundRobin: 'Round Robin',
};

const ASSIGN_CHIP: Record<string, { bg: string; text: string }> = {
  'Specific User': { bg: 'var(--primary-tint-2)', text: 'var(--primary-pressed)' },
  'Team': { bg: 'var(--success-bg)', text: 'var(--success)' },
  'Round Robin': { bg: 'var(--accent-branch-bg)', text: 'var(--accent-branch)' },
};

export function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export interface StepCardState {
  isSelected: boolean;
  hasError?: boolean;
  /** The step's identity colour, drawn as the card's left bar. */
  accentColor?: string;
}

export function stepCardStyle({ isSelected, hasError = false, accentColor }: StepCardState): React.CSSProperties {
  return {
    background: hasError ? 'var(--error-bg)' : 'var(--surface)',
    border: hasError
      ? '2px solid var(--error)'
      : isSelected
        ? '2px solid var(--primary)'
        : '1.5px solid var(--border)',
    borderLeft: hasError
      ? '4px solid var(--error)'
      : accentColor
        ? `4px solid ${accentColor}`
        : undefined,
    borderRadius: 10,
    padding: '10px 14px 10px',
    width: STEP_CARD_WIDTH,
    boxShadow: hasError
      ? '0 0 0 3px rgba(239,68,68,0.18), 0 2px 8px rgba(0,0,0,0.1)'
      : isSelected
        ? '0 0 0 3px rgba(37,99,235,0.15), 0 4px 12px rgba(0,0,0,0.1)'
        : '0 2px 8px rgba(0,0,0,0.07)',
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: 'border-color 0.12s, box-shadow 0.12s',
    boxSizing: 'border-box',
    position: 'relative',
  };
}

export interface ControlFlowBadge {
  label: string;
  description?: string;
}

export function StepCardHeader({
  sequenceNo,
  name,
  controlFlow,
  isTerminating = false,
}: {
  sequenceNo: number;
  name: string;
  controlFlow?: ControlFlowBadge | null;
  /** True when one of the step's outcomes ends the process. */
  isTerminating?: boolean;
}) {
  return (
    <div style={headerRow}>
      <span style={seqBadge}>{sequenceNo}</span>
      <span style={nameText}>{name || 'Unnamed Step'}</span>
      {isTerminating && (
        <span style={terminatingBadge} title="An outcome of this step ends the process">
          ● Terminating
        </span>
      )}
      {controlFlow && (
        <span style={controlFlowBadge} title={controlFlow.description}>
          ⧉ {controlFlow.label}
        </span>
      )}
    </div>
  );
}

export function StepCardChips({
  assignLabel,
  assigneeName,
  children,
}: {
  assignLabel: string;
  assigneeName?: string | null;
  children?: ReactNode;
}) {
  const colour = ASSIGN_CHIP[assignLabel] ?? { bg: 'var(--surface-alt)', text: 'var(--text-secondary)' };
  return (
    <div style={chipsRow}>
      <span style={chip(colour.bg, colour.text)}>{assignLabel}</span>
      {assigneeName && (
        <span style={chip(NODE_NEUTRAL_CHIP.background, NODE_NEUTRAL_CHIP.foreground)} title={assigneeName}>
          {truncate(assigneeName, 22)}
        </span>
      )}
      {children}
    </div>
  );
}

export function StepOutcomeList({ rows }: { rows: StepOutcomeRow[] }) {
  if (rows.length === 0) return null;
  return (
    <>
      <div style={divider} />
      <div style={outcomesSection}>
        {rows.map((row) => (
          <OutcomeRow key={row.id} row={row} />
        ))}
      </div>
    </>
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

export function stepHandleStyle(color: string): React.CSSProperties {
  return { background: color, width: 10, height: 10, border: '2px solid var(--border)', borderRadius: '50%' };
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
    fontSize: 10,
    color,
    opacity: 0.75,
    flexShrink: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 90,
  };
}

const headerRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 };

const seqBadge: React.CSSProperties = {
  background: 'var(--primary)',
  color: 'var(--text-on-primary)',
  borderRadius: 4,
  fontSize: 10,
  fontWeight: 700,
  padding: '1px 7px',
  flexShrink: 0,
  lineHeight: '16px',
};

const nameText: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
};

// DP-1: the label, not the colour, is what makes this readable in greyscale
// export and to colour-blind reviewers (NFR-009).
const controlFlowBadge: React.CSSProperties = {
  background: 'var(--accent-branch-bg)',
  color: 'var(--accent-branch)',
  border: '1px solid var(--accent-branch)',
  borderRadius: 4,
  fontSize: 9,
  fontWeight: 700,
  padding: '1px 5px',
  flexShrink: 0,
  lineHeight: '16px',
  whiteSpace: 'nowrap',
};

const terminatingBadge: React.CSSProperties = {
  background: TERMINATING_BADGE_REGISTRATION.background,
  color: TERMINATING_BADGE_REGISTRATION.foreground,
  border: `1px solid ${TERMINATING_BADGE_REGISTRATION.border}`,
  borderRadius: 4,
  fontSize: 9,
  fontWeight: 700,
  padding: '1px 5px',
  flexShrink: 0,
  lineHeight: '16px',
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
