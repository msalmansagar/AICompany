import { uuidV5 } from './communicationIdentity.js';
import { awaitingAssignment, type AssignmentStatus } from './assignmentDecision.js';
import type { Disposition } from './strategyReevaluation.js';

/**
 * Turn-around time and escalation — with the clocks kept apart.
 *
 * The mistake this module exists to avoid is a single "overdue" flag. Work that no officer ever
 * received is not an officer running late; it is an **assignment exception**, and showing it as
 * "officer overdue" blames a person for a routing gap and buries the thing that actually needs
 * fixing. On this organisation that is not hypothetical — no officer can currently be given
 * collection work at all (KI-100).
 *
 * So assignment state is evaluated **before** any deadline, and a piece of work that has no
 * assignee never reaches the overdue branch.
 *
 * Three further rules, each from an instruction rather than a preference:
 *
 * **Nothing is invented.** No day count, no escalation level, no recipient, no grace period, no
 * reminder interval and no "due soon" window has a default here. Where configuration is silent the
 * deadline is **not determined**, and a deadline that is not determined can never produce an
 * overdue claim.
 *
 * **Zero is a value.** `escalationHours: 0` means due immediately. It is configuration, and it is
 * never quietly treated as "unset" — that would turn a deliberate instant deadline into no
 * deadline at all.
 *
 * **Overdue is not escalation.** Passing a deadline is an observation. An escalation is an action
 * somebody configured and something performed, and this module will not call one the other.
 */

// ── Work state ───────────────────────────────────────────────────────────────

/**
 * What a piece of collection work is currently doing, in business terms.
 *
 * These are the states WP8 and WP12 render. They carry no status code, no GUID, no plugin name and
 * no KI number, because an officer reading a queue should see their work, not the platform.
 */
export type WorkState =
  /** No assignee yet, and the reason is ordinary — nobody has been given it. */
  | 'AwaitingAssignment'
  /** No assignee, and something is wrong: configuration is missing, ambiguous, or the target failed. */
  | 'AssignmentRequiresAttention'
  /** Someone holds it, and either there is no deadline or the deadline is still ahead. */
  | 'Assigned'
  /** Someone holds it and the configured warning window has been entered. */
  | 'DueSoon'
  /** Someone holds it and its authoritative deadline has passed. */
  | 'Overdue'
  /** A configured escalation action has actually happened. */
  | 'Escalated'
  | 'Completed'
  | 'Cancelled'
  /** The strategy no longer asks for it. The record stands; see WP5. */
  | 'NoLongerApplicable';

// ── The clock ────────────────────────────────────────────────────────────────

/**
 * When the officer's clock starts.
 *
 * **There is deliberately no default.** Discovery found no column, on any DCP or QDB entity, that
 * defines the TAT start point — and the choice is not an engineering one. If the clock starts at
 * creation, work that waits three days for an assignee arrives already overdue through nobody's
 * fault. If it starts at assignment, unassigned work has no deadline at all and can sit unnoticed.
 * Both are defensible and QDB has not said which (KI-101), so the caller must state it and the
 * deadline is otherwise **not determined**.
 */
export type TatStartPolicy = 'ActivityCreated' | 'AssignmentCompleted' | 'Acknowledged';

/** What a duration was measured against, always reported alongside the result. */
export type TatBasis = 'ContinuousElapsed' | 'BusinessCalendar';

/**
 * The calendar boundary.
 *
 * Isolated so that a working-day or working-hour calendar can replace it without touching a single
 * caller. **No weekend or public-holiday rule is implemented here.** QDB operates in Qatar, which
 * would make a Friday/Saturday weekend a tempting guess, and guessing a business calendar is how a
 * deadline quietly moves by two days for every piece of work in the book (KI-102).
 */
export interface TatCalendar {
  readonly basis: TatBasis;
  addHours(from: Date, hours: number): Date;
}

/**
 * Plain elapsed time. Honest about what it is.
 *
 * Every result computed with it is labelled `ContinuousElapsed`, so a screen or a report can say
 * that the deadline counts continuous hours rather than working hours — which is a fact QDB may
 * want to change, not a detail to bury.
 */
export const continuousElapsed: TatCalendar = {
  basis: 'ContinuousElapsed',
  addHours: (from, hours) => new Date(from.getTime() + hours * 3_600_000),
};

export type TatDeadline =
  | { determined: false; reason: string }
  | { determined: true; startedAt: string; dueAt: string; basis: TatBasis };

/** The instants a deadline might start from, as the platform records them. */
export interface TatInstants {
  createdOn?: string;
  assignedOn?: string;
  acknowledgedOn?: string;
}

const START_ATTRIBUTE: Readonly<Record<TatStartPolicy, keyof TatInstants>> = {
  ActivityCreated: 'createdOn',
  AssignmentCompleted: 'assignedOn',
  Acknowledged: 'acknowledgedOn',
};

const NOT_DETERMINED = {
  noPolicy:
    'No deadline has been calculated because it has not been agreed when the clock should start '
    + 'for this kind of work.',
  noDuration:
    'No deadline has been calculated because no turn-around time is configured for this work.',
  noInstant:
    'No deadline has been calculated because the moment the clock should start from has not '
    + 'happened yet.',
} as const;

/**
 * The deadline for one piece of work, or an honest statement that there isn't one.
 *
 * Returns a discriminated result rather than a nullable date so that "no deadline" cannot be
 * mistaken for "due at the epoch" — and so the reason travels with it and can be shown.
 */
export function computeDeadline(input: {
  startPolicy?: TatStartPolicy;
  hours?: number;
  instants: TatInstants;
  calendar?: TatCalendar;
}): TatDeadline {
  if (!input.startPolicy) return { determined: false, reason: NOT_DETERMINED.noPolicy };

  // `=== undefined`, not falsy: zero hours is a configured instant deadline, not an absent one.
  if (input.hours === undefined || !Number.isFinite(input.hours)) {
    return { determined: false, reason: NOT_DETERMINED.noDuration };
  }

  const startedAt = input.instants[START_ATTRIBUTE[input.startPolicy]];
  if (!startedAt) return { determined: false, reason: NOT_DETERMINED.noInstant };

  const calendar = input.calendar ?? continuousElapsed;
  return {
    determined: true,
    startedAt,
    dueAt: calendar.addHours(new Date(startedAt), input.hours).toISOString(),
    basis: calendar.basis,
  };
}

// ── Deriving the state ───────────────────────────────────────────────────────

export interface WorkStateInput {
  lifecycle: 'Open' | 'Completed' | 'Cancelled';
  assignment: AssignmentStatus;
  deadline: TatDeadline;
  /** Whether an escalation action has actually occurred — the platform's own flag, not a guess. */
  escalated: boolean;
  disposition?: Disposition;
  /** The configured warning window. Absent means no warning state exists for this work. */
  dueSoonHours?: number;
  now: Date;
}

/**
 * What to show for one piece of work.
 *
 * Order matters and is the substance of the module. Assignment is examined **before** any deadline,
 * so unassigned work can never be reported as an officer running late.
 */
export function deriveWorkState(input: WorkStateInput): { state: WorkState; reason: string } {
  if (input.lifecycle === 'Cancelled') return state('Cancelled', 'This work was cancelled.');
  if (input.lifecycle === 'Completed') return state('Completed', 'This work is done.');

  if (input.disposition === 'NoLongerApplicable') {
    return state('NoLongerApplicable',
      'The strategy no longer asks for this. It has been left as it is.');
  }

  // An escalation that happened outranks a deadline that passed: the deadline is why, the
  // escalation is what was done about it, and the latter is the more useful thing to show.
  if (input.escalated) return state('Escalated', 'This work has been escalated.');

  if (awaitingAssignment(input.assignment)) return assignmentState(input.assignment);

  if (!input.deadline.determined) {
    return state('Assigned', `Someone is working on this. ${input.deadline.reason}`);
  }

  const due = new Date(input.deadline.dueAt).getTime();
  if (input.now.getTime() > due) {
    return state('Overdue', 'This work has passed the time it was meant to be done by.');
  }

  if (input.dueSoonHours !== undefined
    && input.now.getTime() > due - input.dueSoonHours * 3_600_000) {
    return state('DueSoon', 'This work is due shortly.');
  }

  return state('Assigned', 'Someone is working on this and it is not yet due.');
}

/**
 * Why there is no assignee — ordinary, or something that needs a person.
 *
 * `ManualAssignmentRequired` is ordinary: configuration says a human allocates this, so waiting is
 * the system working. The rest mean a supervisor has something to fix.
 */
function assignmentState(assignment: AssignmentStatus): { state: WorkState; reason: string } {
  if (assignment === 'ManualAssignmentRequired') {
    return state('AwaitingAssignment', 'This is waiting to be given to someone.');
  }
  return state('AssignmentRequiresAttention',
    'This could not be given to anyone automatically and needs a supervisor to look at it.');
}

const state = (value: WorkState, reason: string): { state: WorkState; reason: string } =>
  ({ state: value, reason });

// ── Current work vs history ──────────────────────────────────────────────────

/**
 * Whether a piece of work belongs in an officer's **current** queue.
 *
 * Two separate questions, deliberately not merged: whether the record stands (always yes — WP5
 * preserves everything) and whether it is current work (no, once its episode has closed or the
 * strategy has stopped asking for it).
 *
 * This is what stops a cured case's open activities following an officer around forever. The
 * episode is cured, so the obligation is historical; the record is untouched, so the history is
 * intact. Deleting or cancelling them to clear the queue would destroy the second to achieve the
 * first, and no rule permits that.
 */
export function isCurrentWork(input: {
  state: WorkState;
  /** False once the case has cured or moved to a later delinquency episode. */
  episodeIsCurrent: boolean;
}): boolean {
  if (!input.episodeIsCurrent) return false;
  return input.state !== 'Completed'
    && input.state !== 'Cancelled'
    && input.state !== 'NoLongerApplicable';
}

// ── Escalation events ────────────────────────────────────────────────────────

/**
 * The kinds of thing that can happen around a deadline, kept apart.
 *
 * `TatOverdue` is an **observation** — a deadline passed. `Escalation` is an **action** that a
 * configured policy performed. Calling every overdue record an escalation would make the word
 * meaningless exactly where it needs to mean something.
 */
export type EscalationEventKind =
  | 'AssignmentException'
  | 'TatWarning'
  | 'TatOverdue'
  | 'Escalation'
  | 'Notification';

/**
 * The id an escalation event takes, derived rather than minted.
 *
 * The same rule as every other write in Phase 8 (ADR-DCP-20): a worker that processes the same
 * deadline twice, or retries after an uncertain response, reaches the same id and the platform
 * refuses the second create. Check-then-create is not used — every worker checks before any worker
 * writes, so it cannot be the uniqueness mechanism.
 *
 * The level is part of the identity because a level-2 escalation on the same activity is a
 * different event, not a repeat of level 1.
 */
export function escalationEventId(
  activityId: string, kind: EscalationEventKind, level: number,
): string {
  return uuidV5(
    ['escalation', activityId.toLowerCase(), kind, String(level)].join('|'),
    ESCALATION_NAMESPACE);
}

const ESCALATION_NAMESPACE = '7c41b6e2-9d38-4f5a-8b27-1e6a4c90d3f5';

/**
 * Whether an escalation is due, given configuration — and nothing when configuration is silent.
 *
 * Returns the event to raise, or `null`. It decides no recipient, no level chain and no frequency:
 * those live on `qdb_escalationconiguration`, which exists on the organisation with **zero rows**
 * and is referenced by nothing (KI-104). Until QDB configures it, DCP observes and reports, and
 * performs no escalation action.
 */
export function escalationDue(input: {
  state: WorkState;
  escalationConfigured: boolean;
  activityId: string;
}): { kind: EscalationEventKind; eventId: string; level: number } | null {
  if (input.state === 'AssignmentRequiresAttention') {
    return event('AssignmentException', input.activityId);
  }
  if (input.state === 'Overdue') return event('TatOverdue', input.activityId);
  if (input.state === 'DueSoon') return event('TatWarning', input.activityId);
  return null;
}

function event(
  kind: EscalationEventKind, activityId: string,
): { kind: EscalationEventKind; eventId: string; level: number } {
  // Level 1 until a configured level chain exists. It is not a guess at QDB's model — it is the
  // first observation, and `qdb_escalationconiguration.qdb_level` will supply the rest (KI-104).
  return { kind, eventId: escalationEventId(activityId, kind, 1), level: 1 };
}
