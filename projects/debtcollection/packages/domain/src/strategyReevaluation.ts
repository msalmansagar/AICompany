import {
  strategyActivityId,
  type ActivityOrigin,
  type EvaluationContext,
  type IntendedActivity,
} from './strategyAutomation.js';

/**
 * Re-evaluating a strategy without rewriting history.
 *
 * Re-evaluation answers **what is applicable now**. It does not answer what should happen to work
 * that was raised earlier, and the difference between those two questions is the whole of this
 * module. A strategy action ceasing to apply is not a reason to cancel the activity it produced:
 * those are separate business decisions, and only one of them has an approved rule behind it.
 *
 * So nothing here deletes, cancels, reopens or rewrites anything. It produces a **disposition** for
 * every activity it looked at, and the executor acts only on the one disposition that means
 * "create". Everything else is surfaced for an officer to read.
 *
 * The decision is deliberately **not a boolean**. "There is already open work", "this was completed
 * and whether it may repeat is undecided", "this was cancelled by an officer" and "this planned
 * work no longer applies" are four different things to say to the person holding the case, and
 * collapsing them into `false` loses every one of them.
 */

// ── Dispositions ─────────────────────────────────────────────────────────────

/**
 * What re-evaluation concluded about one piece of work.
 *
 * Only `NewlyApplicable` causes anything to be written. The rest exist so the Action Plan can
 * explain itself.
 */
export type Disposition =
  /** The action applies and no activity exists for it in this episode. The only one that creates. */
  | 'NewlyApplicable'
  /** The action still applies and its activity is open. Nothing to do, and nothing wrong. */
  | 'AlreadyOpen'
  /** The action applies, its activity was completed, and whether it may repeat is KI-98. */
  | 'AlreadyCompleted'
  /** The action applies, its activity was cancelled by someone, and KI-98 covers the rest. */
  | 'AlreadyCancelled'
  /** Strategy work from an earlier evaluation whose action is not in the current plan. Preserved. */
  | 'NoLongerApplicable'
  /** Officer-created work, or work predating provenance. Re-evaluation never touches it. */
  | 'ManualUnaffected';

/** The state of an activity, as the lifecycle models it. */
export type ActivityState = 'Open' | 'Completed' | 'Cancelled';

/** An activity the case already holds, as re-evaluation needs to see it. */
export interface ExistingActivity {
  activityId: string;
  state: ActivityState;
  /** Provenance, where it was recorded. Absent means the activity predates KI-71. */
  origin?: ActivityOrigin;
  strategyActionId?: string;
}

/** One conclusion, with the reason an officer would be given. */
export interface DispositionEntry {
  disposition: Disposition;
  activityId: string;
  strategyActionId?: string;
  strategyActionName?: string;
  /** True only for `NewlyApplicable`. Derived from the disposition, never set independently. */
  readonly create: boolean;
  reason: string;
}

export interface ReevaluationOutcome {
  entries: readonly DispositionEntry[];
  /** The intended work to create, already filtered. Nothing else is ever written. */
  toCreate: readonly IntendedActivity[];
}

const REASONS: Readonly<Record<Disposition, string>> = {
  NewlyApplicable:
    'The strategy asks for this and the case has no activity for it in this delinquency episode.',
  AlreadyOpen:
    'The strategy still asks for this and the case already has open work for it. Nothing was created.',
  AlreadyCompleted:
    'This work was already completed in this delinquency episode. Whether a completed action may be '
    + 'raised again is a QDB policy decision that has not been made, so nothing was created (KI-98).',
  AlreadyCancelled:
    'This work was cancelled in this delinquency episode. Re-creating it would overrule that '
    + 'decision, and whether a cancelled action may be raised again is undecided, so nothing was '
    + 'created (KI-98).',
  NoLongerApplicable:
    'The strategy no longer asks for this. The activity has been left exactly as it is — no rule '
    + 'says obsolete planned work should be cancelled, and destroying it would lose the record.',
  ManualUnaffected:
    'An officer created this, so the strategy does not govern it. Re-evaluation never changes '
    + 'manually created work.',
};

// ── Episode membership, proved rather than assumed ───────────────────────────

/**
 * Whether an existing activity belongs to **this** evaluation's episode.
 *
 * Proved from the id rather than asked of a column: strategy work is created at
 * `uuidv5(case | episode | action)`, so recomputing that for the activity's own action and
 * comparing tells us which episode raised it. An activity from episode 1 cannot collide with
 * episode 2's id, and an activity an officer created by hand will not match either — which is
 * exactly right, because manual work is not strategy work however it is labelled.
 *
 * This is why cure and re-delinquency need no special handling: the new episode derives new ids,
 * and the previous episode's activities simply are not part of the new episode's reconciliation.
 */
export function belongsToEpisode(
  activity: ExistingActivity,
  context: EvaluationContext,
): boolean {
  if (!activity.strategyActionId) return false;
  return strategyActivityId(context, activity.strategyActionId).toLowerCase()
    === activity.activityId.toLowerCase();
}

// ── Reconciliation ───────────────────────────────────────────────────────────

/**
 * Reconciles what the strategy asks for now against what the case already holds.
 *
 * Takes both, returns a disposition for everything it saw, and writes nothing. The executor is
 * handed `toCreate` and has no other way to act, so a disposition that should not produce work
 * cannot accidentally produce it.
 */
export function reevaluate(
  intended: readonly IntendedActivity[],
  existing: readonly ExistingActivity[],
  context: EvaluationContext,
): ReevaluationOutcome {
  const byId = new Map(existing.map(activity => [activity.activityId.toLowerCase(), activity]));
  const intendedIds = new Set(intended.map(item => item.activityId.toLowerCase()));

  const entries: DispositionEntry[] = [
    ...intended.map(item => dispositionForIntended(item, byId.get(item.activityId.toLowerCase()))),
    ...existing
      .filter(activity => !intendedIds.has(activity.activityId.toLowerCase()))
      .map(activity => dispositionForOrphan(activity, context)),
  ];

  const creating = new Set(
    entries.filter(entry => entry.create).map(entry => entry.activityId.toLowerCase()));

  return {
    entries,
    toCreate: intended.filter(item => creating.has(item.activityId.toLowerCase())),
  };
}

/** What to conclude about work the strategy is asking for right now. */
function dispositionForIntended(
  item: IntendedActivity,
  existing: ExistingActivity | undefined,
): DispositionEntry {
  const disposition = intendedDisposition(existing);
  return entry(disposition, item.activityId, item.strategyActionId, item.strategyActionName);
}

function intendedDisposition(existing: ExistingActivity | undefined): Disposition {
  if (!existing) return 'NewlyApplicable';
  if (existing.origin === 'Manual') return 'ManualUnaffected';
  if (existing.state === 'Completed') return 'AlreadyCompleted';
  if (existing.state === 'Cancelled') return 'AlreadyCancelled';
  return 'AlreadyOpen';
}

/**
 * What to conclude about an activity the strategy is **not** asking for.
 *
 * Manual work, and work from another episode, are not this evaluation's business. Strategy work
 * from this episode whose action has dropped out of the plan is `NoLongerApplicable` — surfaced,
 * and left completely alone.
 */
function dispositionForOrphan(
  activity: ExistingActivity,
  context: EvaluationContext,
): DispositionEntry {
  const disposition: Disposition =
    activity.origin === 'StrategyGenerated' && belongsToEpisode(activity, context)
      ? 'NoLongerApplicable'
      : 'ManualUnaffected';

  return entry(disposition, activity.activityId, activity.strategyActionId);
}

function entry(
  disposition: Disposition,
  activityId: string,
  strategyActionId?: string,
  strategyActionName?: string,
): DispositionEntry {
  return {
    disposition,
    activityId,
    ...(strategyActionId ? { strategyActionId } : {}),
    ...(strategyActionName ? { strategyActionName } : {}),
    // Derived, never passed in. A caller cannot set `create` on a disposition that must not write.
    create: disposition === 'NewlyApplicable',
    reason: REASONS[disposition],
  };
}

// ── Triggers ─────────────────────────────────────────────────────────────────

/**
 * The events that may cause a re-evaluation.
 *
 * Listed so the caller names one, and so the trace records why an evaluation happened. **Whether a
 * given event actually warrants re-evaluation is configuration's answer, not this module's** —
 * notably for promises: no rule here says a broken promise leads to legal action, restructuring, or
 * anything else. KI-72 remains open and the Rule Engine remains authoritative.
 */
export const REEVALUATION_TRIGGERS = [
  'SnapshotReceived',
  'DpdChanged',
  'BucketChanged',
  'CaseStatusChanged',
  'ActivityOutcomeRecorded',
  'PromiseOutcomeRecorded',
  'Cured',
  'ManualRequest',
] as const;

export type ReevaluationTrigger = typeof REEVALUATION_TRIGGERS[number];

/**
 * Whether the facts a strategy reads have actually moved.
 *
 * A new MIS snapshot is not by itself a reason to do anything: most snapshots restate what was
 * already true. Re-evaluating anyway is harmless — the identity makes it a no-op — but it costs
 * reads and writes a trace entry that says nothing, so the caller is given a way to tell.
 *
 * Deliberately compares only what the strategy model can segment on. Nothing here decides what
 * *should* trigger; it reports whether anything a strategy could notice has changed.
 */
export function strategyFactsChanged(
  before: { dpd?: number; arrearBucket?: string; statusCode?: string; strategyId?: string },
  after: { dpd?: number; arrearBucket?: string; statusCode?: string; strategyId?: string },
): boolean {
  return before.dpd !== after.dpd
    || before.arrearBucket !== after.arrearBucket
    || before.statusCode !== after.statusCode
    || before.strategyId !== after.strategyId;
}

// ── Evaluation evidence ──────────────────────────────────────────────────────

/**
 * The trace of one evaluation, for `qdb_crmlogs`.
 *
 * Correlates case, episode, strategy, action, ruleset version and the resulting activity — which is
 * everything the authorisation asks a trace to answer, and nothing else. No customer name, no
 * amount, no message body: an evaluation trace is diagnostics of an automated run, not a second
 * copy of the business record.
 *
 * `qdb_crmlogs` has no correlation column, so this is serialised into `description` exactly as the
 * MIS pipeline already does.
 */
export interface EvaluationTrace {
  correlationId: string;
  caseId: string;
  episodeNumber: number;
  trigger: ReevaluationTrigger;
  strategyId?: string;
  rulesetVersion?: string;
  decidedAt: string;
  outcomes: readonly {
    strategyActionId?: string;
    activityId: string;
    disposition: Disposition;
    created: boolean;
  }[];
}

/** Builds the trace. Pure: it records what happened and decides nothing. */
export function buildEvaluationTrace(input: {
  correlationId: string;
  context: EvaluationContext;
  trigger: ReevaluationTrigger;
  strategyId?: string;
  decidedAt: Date;
  outcome: ReevaluationOutcome;
}): EvaluationTrace {
  return {
    correlationId: input.correlationId,
    caseId: input.context.caseId,
    episodeNumber: input.context.episodeNumber,
    trigger: input.trigger,
    ...(input.strategyId ? { strategyId: input.strategyId } : {}),
    ...(input.context.rulesetVersion ? { rulesetVersion: input.context.rulesetVersion } : {}),
    decidedAt: input.decidedAt.toISOString(),
    outcomes: input.outcome.entries.map(item => ({
      ...(item.strategyActionId ? { strategyActionId: item.strategyActionId } : {}),
      activityId: item.activityId,
      disposition: item.disposition,
      created: item.create,
    })),
  };
}
