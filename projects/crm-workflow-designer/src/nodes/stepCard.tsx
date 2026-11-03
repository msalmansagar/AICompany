import type { ReactNode } from 'react';
import { AssignIcon, assignTypeFromLabel } from './assignIcons';
import type { ReturnRef } from '../services/returnSpotlight';
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
      <span
        style={iconChip(colour.bg, colour.text)}
        title={assignLabel}
        aria-label={assignLabel}
        role="img"
      >
        <AssignIcon type={assignTypeFromLabel(assignLabel)} />
      </span>
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

function outcomeRowTitle(row: StepOutcomeRow): string {
  const target = row.isTerminal ? 'ends the process' : row.nextStepName ? `→ ${row.nextStepName}` : '';
  const kind = row.isBackEdge ? ' (returns to an earlier step)' : row.applyFilter ? ' (conditional)' : '';
  return `${row.name}${kind} ${target}`.trim();
}

function OutcomeRow({ row }: { row: StepOutcomeRow }) {
  if (row.isBackEdge) {
    return (
      <div style={outcomeRow} title={outcomeRowTitle(row)}>
        <span style={icon('var(--accent-branch)')}>↩</span>
        <span style={outcomeLabel('var(--accent-branch)')}>{truncate(row.name, 20)}</span>
        {row.nextStepName && (
          <span style={outcomeTarget('var(--accent-branch)')}>→ {truncate(row.nextStepName, 16)}</span>
        )}
      </div>
    );
  }

  if (row.isTerminal && row.applyFilter) {
    // A conditional decision routes through its gateway — the ◈ says so; a
    // shouting CONDITION badge on every such row said it far too loudly.
    return (
      <div style={outcomeRow} title={outcomeRowTitle(row)}>
        <span style={icon('var(--warning)')}>◈</span>
        <span style={outcomeLabel('var(--warning)')}>{truncate(row.name, 20)}</span>
        <span style={outcomeTarget('var(--warning)')}>→ routes</span>
      </div>
    );
  }

  if (row.isTerminal) {
    return (
      <div style={outcomeRow} title={outcomeRowTitle(row)}>
        <span style={icon('var(--error)')}>⊘</span>
        <span style={outcomeLabel('var(--error)')}>{truncate(row.name, 20)}</span>
        <span style={outcomeTarget('var(--error)')}>→ END</span>
      </div>
    );
  }

  return (
    <div style={outcomeRow} title={outcomeRowTitle(row)}>
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

/**
 * The collapsed face of a pure correction loop (CWFD-009 P2).
 *
 * A "Return to X by Y" step exists to send work backwards; drawn as a full
 * card it doubles the diagram. The pill keeps the step selectable and its
 * edges anchored while costing one line of canvas. Selecting it expands the
 * node back to the full card.
 */
export function CorrectionPill({
  sequenceNo,
  name,
  returnTargetName,
  hasError = false,
}: {
  sequenceNo: number;
  name: string;
  returnTargetName?: string | null;
  hasError?: boolean;
}) {
  const title = returnTargetName
    ? `${name} — correction step, resubmits to "${returnTargetName}". Click to expand.`
    : `${name} — correction step. Click to expand.`;
  return (
    <div style={pillInner} title={title}>
      <span style={pillLoopIcon} aria-hidden>↩</span>
      <span style={pillSeq}>{sequenceNo}</span>
      <span style={pillName}>{name || 'Unnamed Step'}</span>
      {hasError && <span style={pillErrorDot} title="This step has a validation issue" />}
    </div>
  );
}

export function correctionPillStyle(isSelected: boolean): React.CSSProperties {
  return {
    background: 'var(--accent-branch-bg)',
    border: isSelected ? '2px solid var(--primary)' : '1.5px dashed var(--accent-branch)',
    borderRadius: 22,
    padding: '6px 12px',
    width: 210,
    height: 44,
    display: 'flex',
    alignItems: 'center',
    boxSizing: 'border-box',
    cursor: 'pointer',
    boxShadow: isSelected ? '0 0 0 3px rgba(37,99,235,0.15)' : '0 1px 4px rgba(0,0,0,0.06)',
    position: 'relative',
  };
}

const pillInner: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  width: '100%',
  overflow: 'hidden',
};

const pillLoopIcon: React.CSSProperties = {
  color: 'var(--accent-branch)',
  fontSize: 14,
  fontWeight: 700,
  flexShrink: 0,
};

const pillSeq: React.CSSProperties = {
  background: 'var(--accent-branch)',
  color: 'var(--text-on-primary)',
  borderRadius: 4,
  fontSize: 9,
  fontWeight: 700,
  padding: '0 5px',
  lineHeight: '14px',
  flexShrink: 0,
};

const pillName: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
};

const pillErrorDot: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: 'var(--error)',
  flexShrink: 0,
};

/** The assignment chip: a glyph, sized so it reads as a badge not a button. */
function iconChip(bg: string, color: string): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: bg,
    color,
    border: `1px solid ${NODE_NEUTRAL_CHIP.border}`,
    borderRadius: 4,
    width: 20,
    height: 18,
    flexShrink: 0,
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


// ─── Return badge + on-demand return list (CWFD-017 PR2) ───────────────────

/** A return arriving at this card, for the "↩ from …" indicator. */
export interface IncomingReturnChip {
  outcomeId: string;
  sourceStepName: string;
}

/**
 * What the canvas injects into a card's data to run the return badge and
 * spotlight. All optional: a canvas that injects nothing gets the classic
 * card, and the edit canvas still renders full ↩ rows.
 */
export interface ReturnBadgeInteraction {
  /** 'badge' compresses ↩ rows into a counter; 'rows' keeps them (default). */
  returnDisplay?: 'badge' | 'rows';
  /** This card's outgoing returns — direct and routed-through-a-correction. */
  stepReturnRefs?: ReturnRef[];
  isReturnMenuOpen?: boolean;
  pinnedReturnOutcomeIds?: ReadonlySet<string>;
  onReturnBadgeClick?: (stepId: string) => void;
  /** null = hover ended. */
  onReturnRowHover?: (outcomeId: string | null) => void;
  onReturnRowClick?: (outcomeId: string) => void;
  /** Injected by the spotlight: this card is an endpoint of an active return. */
  isSpotlightEndpoint?: boolean;
  incomingReturns?: IncomingReturnChip[];
}

/** The card's rows split into what stays visible and what the badge holds. */
export function partitionOutcomeRows(rows: StepOutcomeRow[]): {
  forwardRows: StepOutcomeRow[];
  returnRows: StepOutcomeRow[];
} {
  return {
    forwardRows: rows.filter((row) => !row.isBackEdge),
    returnRows: rows.filter((row) => row.isBackEdge),
  };
}

/** The ↩ counter chip. Sits in the chips row, so it costs no card height. */
export function ReturnCountBadge({
  count,
  isOpen,
  onClick,
}: {
  count: number;
  isOpen: boolean;
  onClick(): void;
}) {
  if (count === 0) return null;
  return (
    <button
      type="button"
      className="nodrag nopan"
      aria-expanded={isOpen}
      title={`${count} return ${count === 1 ? 'path' : 'paths'} — click to see where work can go back to`}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      style={returnBadgeStyle(isOpen)}
    >
      ↩ {count}
    </button>
  );
}

/**
 * The on-demand list behind the ↩ badge. Hovering an entry peeks that
 * return; clicking pins it and brings both ends into view. This is the
 * jump-reference: a long return is followed as a link, never drawn as
 * standing wiring.
 */
export function ReturnListPopover({
  refs,
  pinnedOutcomeIds,
  onHoverRow,
  onClickRow,
}: {
  refs: ReturnRef[];
  pinnedOutcomeIds: ReadonlySet<string>;
  onHoverRow(outcomeId: string | null): void;
  onClickRow(outcomeId: string): void;
}) {
  return (
    <div className="nodrag nopan" style={popoverStyle} role="menu" aria-label="Return paths">
      <div style={popoverTitle}>Returns</div>
      {refs.map((ref) => {
        const isPinned = pinnedOutcomeIds.has(ref.outcomeId);
        return (
          <button
            key={ref.outcomeId}
            type="button"
            role="menuitem"
            title={
              isPinned
                ? 'Pinned — click to release'
                : `Work goes back to "${ref.targetStepName}" — hover to preview, click to pin and show both steps`
            }
            onMouseEnter={() => onHoverRow(ref.outcomeId)}
            onMouseLeave={() => onHoverRow(null)}
            onClick={(event) => {
              event.stopPropagation();
              onClickRow(ref.outcomeId);
            }}
            style={popoverRowStyle(isPinned)}
          >
            <span style={pillLoopIcon} aria-hidden>↩</span>
            <span style={popoverRowName}>{truncate(ref.name, 26)}</span>
            <span style={popoverRowTarget}>→ {truncate(ref.targetStepName, 20)}</span>
            {isPinned && <span style={popoverPinDot} title="Pinned" />}
          </button>
        );
      })}
    </div>
  );
}

/** "↩ from …" — the target end of an active return names its source. */
export function IncomingReturnChips({ incoming }: { incoming: IncomingReturnChip[] }) {
  if (incoming.length === 0) return null;
  return (
    <div style={incomingWrap}>
      {incoming.map((entry) => (
        <span key={entry.outcomeId} style={incomingChip} title={`A return arrives here from "${entry.sourceStepName}"`}>
          ↩ from {truncate(entry.sourceStepName, 22)}
        </span>
      ))}
    </div>
  );
}

/** The accent ring a spotlight endpoint wears over its normal border. */
export const SPOTLIGHT_ENDPOINT_RING =
  '0 0 0 3px color-mix(in srgb, var(--accent-branch) 35%, transparent), 0 4px 12px rgba(0,0,0,0.12)';

function returnBadgeStyle(isOpen: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    fontSize: 10,
    fontWeight: 700,
    fontFamily: 'inherit',
    color: 'var(--accent-branch)',
    background: isOpen ? 'var(--accent-branch-bg)' : 'transparent',
    border: '1px solid var(--accent-branch)',
    borderRadius: 4,
    padding: '0 6px',
    lineHeight: '16px',
    cursor: 'pointer',
    flexShrink: 0,
  };
}

const popoverStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  left: 8,
  minWidth: 230,
  maxWidth: 300,
  background: 'var(--surface)',
  border: '1px solid var(--border-strong)',
  borderRadius: 8,
  boxShadow: '0 6px 18px color-mix(in srgb, var(--text) 22%, transparent)',
  padding: 6,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  zIndex: 60,
  cursor: 'default',
};

const popoverTitle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  color: 'var(--text-secondary)',
  padding: '2px 6px 4px',
};

function popoverRowStyle(isPinned: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    width: '100%',
    textAlign: 'left',
    fontFamily: 'inherit',
    fontSize: 11,
    color: 'var(--text)',
    background: isPinned ? 'var(--accent-branch-bg)' : 'transparent',
    border: 'none',
    borderRadius: 5,
    padding: '4px 6px',
    cursor: 'pointer',
  };
}

const popoverRowName: React.CSSProperties = {
  fontWeight: 600,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flexShrink: 1,
};

const popoverRowTarget: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-secondary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
  textAlign: 'right',
};

const popoverPinDot: React.CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: '50%',
  background: 'var(--accent-branch)',
  flexShrink: 0,
};

const incomingWrap: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
  marginTop: 4,
};

const incomingChip: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  color: 'var(--accent-branch)',
  background: 'var(--accent-branch-bg)',
  border: '1px dashed var(--accent-branch)',
  borderRadius: 4,
  padding: '1px 6px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: 240,
};

