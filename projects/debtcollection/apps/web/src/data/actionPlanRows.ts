import {
  belongsToEpisode, toActionPlanItem,
  type ActionPlanItem, type ActivityOrigin, type Disposition, type TatStartPolicy,
} from '@dcp/domain';
import { computeDeadline } from '@dcp/domain';
import type { ActionPlanRow } from './followUpQueries.js';
import type { ActivityRow } from './caseQueries.js';

/**
 * The Action Plan's screen rows, composed from what the platform actually holds.
 *
 * This is the only place the browser turns Phase 8's technical states into the sentences an officer
 * reads, and it is deliberately thin: every judgement is the domain's, and every input is read from
 * a record rather than assumed.
 *
 * Two absences are honoured rather than filled in:
 *
 * **No turn-around-time start policy is configured on this organisation (KI-101).** `startPolicy`
 * is therefore left unset, `computeDeadline` returns *not determined*, and the screen says the due
 * date is not configured. Passing `ActivityCreated` here to make dates appear would invent QDB's
 * accountability policy — and would make work overdue that nobody could have started.
 *
 * **No origin is recorded on activities created before Phase 8.** They are shown as unattributed
 * history, not as manual work, and they are attached to no planned action.
 */

/** What the composition needs to know about the case it is describing. */
export interface CaseContext {
  caseId: string;
  /** The case's current arrears episode, where the record carries one. */
  episodeNumber?: number;
  now: Date;
  formatDate: (iso: string) => string;
  /** Unset on this organisation. Supplying one is configuration, not code (KI-101). */
  tatStartPolicy?: TatStartPolicy;
}

const LIFECYCLE_BY_STATE: Readonly<Record<number, 'Open' | 'Completed' | 'Cancelled'>> = {
  0: 'Open',
  1: 'Completed',
  2: 'Cancelled',
};

/** One planned action, as a line an officer can act on. */
export function toPlanItem(row: ActionPlanRow, context: CaseContext): ActionPlanItem {
  const work = currentWorkFor(row);
  if (!work) return toPlannedOnlyItem(row, context);

  const lifecycle = lifecycleOf(work);
  return toActionPlanItem({
    key: row.planned.id,
    actionName: row.planned.name,
    lifecycle,
    disposition: dispositionFor(lifecycle),
    assignment: work.ownerName ? 'AlreadyAssigned' : 'ManualAssignmentRequired',
    deadline: deadlineFor(row, work, context),
    escalated: work.supervisorEscalated === true,
    episodeIsCurrent: isCurrentEpisode(work, context),
    now: context.now,
    formatDate: context.formatDate,
    ...spreadDefined('workSubject', work.subject),
    ...spreadDefined('origin', work.origin),
    ...spreadDefined('ownerName', work.ownerName),
    ...spreadDefined('followUpDate', work.followUpDate),
    ...spreadDefined('outcome', work.status),
  });
}

/** A planned action nothing has answered yet. It is required; nobody holds it; there is no clock. */
function toPlannedOnlyItem(row: ActionPlanRow, context: CaseContext): ActionPlanItem {
  return toActionPlanItem({
    key: row.planned.id,
    actionName: row.planned.name,
    lifecycle: 'Open',
    disposition: 'NewlyApplicable',
    assignment: 'ManualAssignmentRequired',
    deadline: { determined: false, reason: 'No work has been raised for this action yet.' },
    escalated: false,
    episodeIsCurrent: true,
    now: context.now,
    formatDate: context.formatDate,
  });
}

/**
 * The activity that answers this action.
 *
 * The identity contract derives one id per case, episode and action, so at most one piece of
 * strategy work exists per episode. Where an earlier episode's work is also attributed, the newest
 * is the current one — the read is sorted newest first.
 */
function currentWorkFor(row: ActionPlanRow): ActivityRow | undefined {
  return row.attributed[0];
}

function lifecycleOf(work: ActivityRow): 'Open' | 'Completed' | 'Cancelled' {
  // An activity whose state the platform did not send is still an activity; it is not settled.
  return work.stateCode === undefined ? 'Open' : LIFECYCLE_BY_STATE[work.stateCode] ?? 'Open';
}

/**
 * What the strategy's current view of existing work is.
 *
 * `NoLongerApplicable` is **not** produced here. Deciding that an action has stopped applying needs
 * the strategy re-evaluated against current facts, which this screen does not do — and reporting it
 * from a screen that cannot establish it would tell an officer to abandon required work.
 */
function dispositionFor(lifecycle: 'Open' | 'Completed' | 'Cancelled'): Disposition {
  if (lifecycle === 'Completed') return 'AlreadyCompleted';
  if (lifecycle === 'Cancelled') return 'AlreadyCancelled';
  return 'AlreadyOpen';
}

function deadlineFor(row: ActionPlanRow, work: ActivityRow, context: CaseContext) {
  return computeDeadline({
    ...spreadDefined('startPolicy', context.tatStartPolicy),
    ...spreadDefined('hours', row.planned.escalationHours),
    instants: { ...spreadDefined('createdOn', work.createdOn) },
  });
}

/**
 * Whether this work belongs to the case's current arrears episode.
 *
 * Proved by recomputing the derived id, not by trusting a date: a cured and re-delinquent case
 * raises new work under a new episode, and the previous episode's activity must stop being current
 * without being deleted or cancelled to achieve it.
 */
function isCurrentEpisode(work: ActivityRow, context: CaseContext): boolean {
  if (context.episodeNumber === undefined || !work.strategyActionId) return true;
  return belongsToEpisode(
    { activityId: work.id, state: 'Open', strategyActionId: work.strategyActionId },
    { caseId: context.caseId, episodeNumber: context.episodeNumber },
  );
}

/** Keeps an absent value absent, which `exactOptionalPropertyTypes` treats as different from unset. */
function spreadDefined<T>(key: string, value: T | undefined): Record<string, T> {
  return value === undefined ? {} : { [key]: value };
}

/** History's own line. It names no planned action, because nothing attributes it to one. */
export interface UnattributedItem {
  key: string;
  subject: string;
  origin: string;
  recordedOn: string;
  status: string;
}

export function toUnattributedItem(
  activity: ActivityRow,
  describeOrigin: (origin: ActivityOrigin | undefined) => string,
  formatDate: (iso: string) => string,
): UnattributedItem {
  return {
    key: activity.id,
    subject: activity.subject,
    origin: describeOrigin(activity.origin),
    recordedOn: activity.createdOn ? formatDate(activity.createdOn) : '—',
    status: activity.status ?? '—',
  };
}
