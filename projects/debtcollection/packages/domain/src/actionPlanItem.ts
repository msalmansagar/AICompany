import type { ActivityOrigin } from './strategyAutomation.js';
import type { Disposition } from './strategyReevaluation.js';
import type { AssignmentStatus } from './assignmentDecision.js';
import { deriveWorkState, isCurrentWork, type TatDeadline, type WorkState } from './tatEscalation.js';

/**
 * The Action Plan as a Collection Officer reads it.
 *
 * Everything Phase 8 computes arrives here as a technical state — a disposition, an assignment
 * status, a work state, a deadline that may not exist — and leaves as a sentence somebody holding
 * a case can act on. Nothing below emits a GUID, a logical name, a status code, a ruleset code, a
 * plugin name, an HTTP status or a KI number.
 *
 * Three things it is careful not to say:
 *
 * **It never calls unattributed history "manual".** An activity created before Phase 8 has no
 * origin recorded. That is not the same as knowing an officer made it, and claiming otherwise
 * would put a fact into the record that nobody established.
 *
 * **It never invents a deadline.** Where the clock start or the turn-around time is unconfigured
 * (KI-101, KI-102) the officer is told the due date is not configured — not shown a blank that
 * looks broken, a zero, or today's date dressed up as a deadline.
 *
 * **It never promises what has not been decided.** Completed and cancelled strategy work is
 * described as it is; whether it may be raised again is undecided (KI-98), so the wording neither
 * promises another action nor rules one out.
 */

// ── Officer-facing vocabulary ────────────────────────────────────────────────

const STATE_LABEL: Readonly<Record<WorkState, string>> = {
  AwaitingAssignment: 'Awaiting assignment',
  AssignmentRequiresAttention: 'Assignment requires attention',
  Assigned: 'In progress',
  DueSoon: 'Due soon',
  Overdue: 'Overdue',
  Escalated: 'Escalated',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
  NoLongerApplicable: 'No longer required',
};

/**
 * What the strategy's current view of this work is.
 *
 * Deliberately free of the technical words. An officer is never shown "RegenerationHeld", and
 * never told that a policy decision is outstanding — that is a QDB matter, not theirs.
 */
const APPLICABILITY_LABEL: Readonly<Record<Disposition, string>> = {
  NewlyApplicable: 'Newly required',
  AlreadyOpen: 'Required, and already in hand',
  // Describes the state without promising another action will or will not follow (KI-98).
  AlreadyCompleted: 'Already done for this period of arrears',
  AlreadyCancelled: 'Cancelled for this period of arrears',
  NoLongerApplicable: 'No longer required by the strategy',
  ManualUnaffected: 'Not governed by the strategy',
};

const ORIGIN_LABEL: Readonly<Record<ActivityOrigin, string>> = {
  Manual: 'Created by an officer',
  StrategyGenerated: 'Created by the collection strategy',
};

/** The one an absent origin gets. It is a statement about the record, not about who made it. */
export const ORIGIN_NOT_RECORDED = 'Not recorded — predates provenance';

const ASSIGNMENT_LABEL: Readonly<Record<AssignmentStatus, string>> = {
  Assigned: 'Assigned',
  AlreadyAssigned: 'Assigned',
  ManualAssignmentRequired: 'Awaiting assignment',
  // No security or configuration detail reaches an officer; a supervisor is who can act on it.
  AssignmentCapabilityUnavailable: 'Assignment requires attention',
  ConfigurationMissing: 'Assignment requires attention',
  ConfigurationAmbiguous: 'Assignment requires attention',
  TargetUnavailable: 'Assignment requires attention',
  RetryableFailure: 'Assignment requires attention',
  PermanentFailure: 'Assignment requires attention',
};

export const DUE_NOT_CONFIGURED = 'Due date not configured';
export const NOT_ASSIGNED = 'Nobody yet';

// ── The row ──────────────────────────────────────────────────────────────────

/** One line of the Action Plan, entirely in business language. */
export interface ActionPlanItem {
  /** For React keys and navigation only. Never rendered. */
  key: string;
  /** The planned action's name, from configuration. */
  action: string;
  /** The activity that answers it, where one exists. */
  work?: string;
  state: string;
  origin: string;
  assignment: string;
  owner: string;
  /** A date, or a statement that there is not one. Never blank, never a guess. */
  due: string;
  /** Kept separate from `due`. Phase 6's follow-up is not Phase 8's deadline (KI-76). */
  followUp: string;
  outcome: string;
  applicability: string;
  /** Whether this belongs in an officer's current queue. History stays readable, not current. */
  isCurrent: boolean;
}

export interface ActionPlanInput {
  key: string;
  actionName: string;
  workSubject?: string;
  lifecycle: 'Open' | 'Completed' | 'Cancelled';
  disposition: Disposition;
  assignment: AssignmentStatus;
  deadline: TatDeadline;
  escalated: boolean;
  origin?: ActivityOrigin;
  ownerName?: string;
  followUpDate?: string;
  outcome?: string;
  episodeIsCurrent: boolean;
  dueSoonHours?: number;
  now: Date;
  formatDate: (iso: string) => string;
}

/**
 * Composes one Action Plan line.
 *
 * Takes the formatter rather than importing one, so the domain stays free of locale and the same
 * composition is testable without a rendering environment.
 */
export function toActionPlanItem(input: ActionPlanInput): ActionPlanItem {
  const { state } = deriveWorkState({
    lifecycle: input.lifecycle,
    assignment: input.assignment,
    deadline: input.deadline,
    escalated: input.escalated,
    disposition: input.disposition,
    ...(input.dueSoonHours !== undefined ? { dueSoonHours: input.dueSoonHours } : {}),
    now: input.now,
  });

  return {
    key: input.key,
    action: input.actionName,
    ...(input.workSubject ? { work: input.workSubject } : {}),
    state: STATE_LABEL[state],
    origin: describeOriginLabel(input.origin),
    assignment: ASSIGNMENT_LABEL[input.assignment],
    owner: input.ownerName ?? NOT_ASSIGNED,
    due: describeDue(input.deadline, input.formatDate),
    followUp: input.followUpDate ? input.formatDate(input.followUpDate) : '—',
    outcome: input.outcome ?? '—',
    applicability: APPLICABILITY_LABEL[input.disposition],
    isCurrent: isCurrentWork({ state, episodeIsCurrent: input.episodeIsCurrent }),
  };
}

/** Absent origin is reported as unrecorded, never as manual. */
export function describeOriginLabel(origin: ActivityOrigin | undefined): string {
  return origin ? ORIGIN_LABEL[origin] : ORIGIN_NOT_RECORDED;
}

/**
 * The due date, or a statement that there is not one.
 *
 * Never a blank cell — a blank reads as a broken screen, and an officer cannot tell it apart from
 * a date that failed to load.
 */
export function describeDue(deadline: TatDeadline, formatDate: (iso: string) => string): string {
  return deadline.determined ? formatDate(deadline.dueAt) : DUE_NOT_CONFIGURED;
}

/**
 * Whether a manually created activity answers a planned action.
 *
 * **It does not**, and this function exists to say so in one place. Phase 6 correlated by Activity
 * Type, which made a manually raised Legal Recommendation indistinguishable from one the strategy
 * asked for. Provenance is the only thing that answers this now: the activity must name the action.
 */
export function satisfiesPlannedAction(
  activity: { strategyActionId?: string; origin?: ActivityOrigin },
  strategyActionId: string,
): boolean {
  if (!activity.strategyActionId) return false;
  return activity.strategyActionId.toLowerCase() === strategyActionId.toLowerCase();
}
