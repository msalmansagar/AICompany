import { z } from 'zod';
import { uuidV5 } from './communicationIdentity.js';
import { orderedActions, type CollectionStrategy, type StrategyAction } from './strategy.js';

/**
 * Turning a strategy decision into intended collection work — and being able to say why it exists.
 *
 * Three rules hold every line of this file, and each was paid for.
 *
 * **Provenance is recorded, never inferred.** Phase 6 correlated activities to strategy actions by
 * Activity Type and said so on screen rather than pretending otherwise. That is correspondence: one
 * strategy may hold two actions of the same type, and two strategies may use the same type. Phase 8
 * records the action itself, and records separately *how* the activity came to exist — because an
 * officer who accepts a planned action produces work that legitimately carries a strategy action,
 * and collapsing the two would lose exactly the distinction that matters (KI-71).
 *
 * **Identity is derived, not minted.** Intended work takes a deterministic id from the case, the
 * episode, the action and the evaluation context, created with `If-None-Match: *` (ADR-DCP-20).
 * Re-evaluating unchanged facts therefore reaches the same id and creates nothing. No counter, no
 * "already generated" flag, nothing a crash between the create and the bookkeeping can invalidate.
 *
 * **Nothing here decides policy.** Which strategy applies is the Rule Engine's answer; which
 * actions a strategy holds is configuration. This module turns that decision into work, and imposes
 * no threshold, no day count and no escalation rule of its own.
 */

// ── Origin ───────────────────────────────────────────────────────────────────

/**
 * The provisioned option values, written down once.
 *
 * `crm/scripts/provision-activity-provenance.mjs` created these on `qdb_collectionactivity`, and
 * `ActivityProvenanceGuard` enforces the invariant server-side against the same numbers. A second
 * copy that drifted would mean the browser and the platform disagreeing about what "strategy
 * generated" means, which is the failure this constant exists to prevent.
 */
export const ACTIVITY_ORIGIN_CODES = {
  Manual: 100000800,
  StrategyGenerated: 100000801,
} as const;

export const ActivityOriginSchema = z.enum(['Manual', 'StrategyGenerated']);
export type ActivityOrigin = z.infer<typeof ActivityOriginSchema>;

/**
 * How an activity came to exist, and what requested it.
 *
 * `origin` is **optional on purpose**. An activity created before Phase 8 carries neither column,
 * and that absence means "predates provenance" — it is **not** a claim that the work was manual.
 * Reinterpreting history is how an audit trail becomes fiction.
 */
export const ActivityProvenanceSchema = z.object({
  origin: ActivityOriginSchema.optional(),
  strategyActionId: z.string().uuid().optional(),
});
export type ActivityProvenance = z.infer<typeof ActivityProvenanceSchema>;

export class ProvenanceError extends Error {
  constructor(message: string, readonly kind: 'MissingStrategyAction') {
    super(message);
    this.name = 'ProvenanceError';
  }
}

/**
 * The invariant: **strategy-generated work must name the action that requested it.**
 *
 * Enforced here and again in the plugin, because React is not an authorisation boundary. Automated
 * work that cannot say why it exists is worse than no automation — it is untraceable activity
 * appearing on a customer's file with nothing to appeal to.
 *
 * Deliberately one-directional. `Manual` **may** carry a strategy action: that is an officer
 * accepting planned work, which is a real and useful thing to record. Only the automated direction
 * is constrained.
 *
 * Absent provenance is not a violation. Historical activities have none, and this must keep
 * returning them untouched rather than demanding a value nobody recorded.
 */
export function assertProvenance(provenance: ActivityProvenance): void {
  if (provenance.origin !== 'StrategyGenerated') return;
  if (provenance.strategyActionId) return;

  throw new ProvenanceError(
    'A strategy-generated activity must name the strategy action that requested it. '
    + 'Automated work with no provenance cannot be explained to the officer it lands on, or to an '
    + 'auditor asking why it exists (KI-71).',
    'MissingStrategyAction',
  );
}

/** True when the pair is a complete, self-explaining record of automated work. */
export function isStrategyGenerated(provenance: ActivityProvenance): boolean {
  return provenance.origin === 'StrategyGenerated' && Boolean(provenance.strategyActionId);
}

/**
 * How the Action Plan describes an activity's source, in an officer's words.
 *
 * Null origin becomes "Not recorded" rather than "Manual", which is the whole point of leaving the
 * column empty: the platform does not know, and the screen says so.
 */
export function describeOrigin(provenance: ActivityProvenance): string {
  if (provenance.origin === 'StrategyGenerated') return 'Created by the collection strategy';
  if (provenance.origin === 'Manual') return 'Created by an officer';
  return 'Not recorded — this activity predates provenance being captured';
}

// ── Evaluation context ───────────────────────────────────────────────────────

/**
 * What a strategy evaluation was *about*, and therefore what makes its work unique.
 *
 * The episode is part of the identity and not an afterthought. A cured case that re-delinquents is
 * a **new episode**, and the same strategy action must be allowed to produce work again — while a
 * re-evaluation within one episode must not. `qdb_collectioncase.qdb_episodenumber` already carries
 * this, so nothing new is stored to express it.
 *
 * `rulesetVersion` is carried so a configuration change is visible in the identity: when the
 * ruleset that selected the strategy changes, the work it justifies is legitimately different.
 */
export const EvaluationContextSchema = z.object({
  caseId: z.string().uuid(),
  episodeNumber: z.number().int().nonnegative(),
  /** The ruleset version that selected the strategy, where the engine supplies one. */
  rulesetVersion: z.string().optional(),
});
export type EvaluationContext = z.infer<typeof EvaluationContextSchema>;

/** This module's own namespace, so no derived id can collide with a communication's. */
const STRATEGY_NAMESPACE = '2f8c5b19-7e43-4a6d-9c02-5b1e8d7a4f63';

/**
 * The id a strategy action's work will take on this case, in this episode.
 *
 * Derived from exactly the four things that make the work distinct. Two actions of the same type in
 * one strategy give different ids because the **action id** differs, which is the defect Activity
 * Type correlation could never fix.
 *
 * Lower-cased before hashing: Dataverse returns ids in mixed case depending on the call, and an id
 * that depended on that would produce two records for one intent.
 */
export function strategyActivityId(
  context: EvaluationContext,
  strategyActionId: string,
): string {
  const name = [
    'strategy-work',
    context.caseId.toLowerCase(),
    String(context.episodeNumber),
    strategyActionId.toLowerCase(),
    context.rulesetVersion ?? '',
  ].join('|');
  return uuidV5(name, STRATEGY_NAMESPACE);
}

// ── Intended work ────────────────────────────────────────────────────────────

/**
 * One piece of work a strategy intends. Not yet an activity — intent, with an identity.
 *
 * `dueDate` is absent unless the action configures an offset. An intended action with no configured
 * offset gets **no invented due date**: a deadline nobody chose is a deadline an officer will be
 * measured against.
 */
export interface IntendedActivity {
  /** The deterministic id the activity will be created at. */
  activityId: string;
  strategyActionId: string;
  strategyActionName: string;
  sequence: number;
  /** The activity type this action produces, by code. Resolved to an id by the service layer. */
  activityTypeCode?: string;
  dueDate?: string;
  provenance: ActivityProvenance;
}

export class StrategyPlanError extends Error {
  constructor(message: string, readonly kind: 'NoActionableWork' | 'UnusableAction') {
    super(message);
    this.name = 'StrategyPlanError';
  }
}

/**
 * The work one strategy intends for one case, in configuration's order.
 *
 * Inactive actions are dropped, and an action with no activity type produces nothing — such an
 * action configures a communication or a downstream process rather than a piece of officer work,
 * and inventing an activity for it would put unexplainable items on the Action Plan.
 *
 * The result is **intent only**. Nothing here creates, assigns or schedules; deciding what already
 * exists is the executor's job, and it decides it from the platform rather than from this list.
 */
export function planStrategyWork(
  strategy: CollectionStrategy,
  context: EvaluationContext,
  asOf: Date,
): readonly IntendedActivity[] {
  return orderedActions(strategy)
    .filter(action => action.isActive)
    .filter(action => Boolean(action.activityTypeCode))
    .map(action => toIntendedActivity(action, context, asOf));
}

function toIntendedActivity(
  action: StrategyAction,
  context: EvaluationContext,
  asOf: Date,
): IntendedActivity {
  const dueDate = dueDateFor(action, asOf);
  return {
    activityId: strategyActivityId(context, action.id),
    strategyActionId: action.id,
    strategyActionName: action.name,
    sequence: action.sequence,
    ...(action.activityTypeCode ? { activityTypeCode: action.activityTypeCode } : {}),
    ...(dueDate ? { dueDate } : {}),
    provenance: { origin: 'StrategyGenerated', strategyActionId: action.id },
  };
}

/**
 * The due date an action configures, or none.
 *
 * `dayOffset` is configuration and is applied as given — including zero, which means today, and a
 * negative value, which a back-dated treatment plan may legitimately use. No floor, no ceiling and
 * no default: every one of those would be a QDB policy this module has no standing to set.
 */
function dueDateFor(action: StrategyAction, asOf: Date): string | undefined {
  if (!Number.isInteger(action.dayOffset)) return undefined;
  const due = new Date(asOf.getTime());
  due.setUTCDate(due.getUTCDate() + action.dayOffset);
  return due.toISOString();
}
