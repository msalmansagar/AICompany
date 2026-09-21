import type { AssignmentConfiguration, AssignmentMethod } from './assignment.js';

/**
 * Deciding **where** collection work should go — and never deciding **who** by inventing a rule.
 *
 * Discovery established the boundary this module lives inside. QDB's only live assignment path is
 * `QDB.RoundRobin.Plugins.RoundRobin`, registered on Create of `qdb_task` and configured per work
 * item step. It assigns **Process Engine tasks**. It is not a general service for a Collection Case
 * or a Collection Activity, the activity that might have generalised it is referenced by none of
 * the organisation's 1,523 activated workflows, and no other contract has been located (KI-09).
 *
 * So this module does exactly two things:
 *
 *   • where the configuration names a **concrete** user or team, it says so, and native Dynamics
 *     ownership does the rest — no algorithm is involved in honouring a target someone chose;
 *   • where the configuration names a **method** that needs an engine DCP does not have, it says
 *     *that*, plainly, and stops.
 *
 * What it must never become is a second Smart Assignment. There is no round-robin here, no counter,
 * no modulo, no least-loaded officer, no workload, no skills, no availability. Each of those would
 * be a routing algorithm invented in a collections module and then relied on, and the organisation
 * would end up with two assignment engines disagreeing about who owns the work.
 *
 * Failure is also deliberately not a single state. "Nobody configured this", "two configurations
 * claim it", "the capability is not available here" and "a person must choose" are four different
 * situations, and only one of them is anybody's fault.
 */

// ── Outcomes ─────────────────────────────────────────────────────────────────

/**
 * What an assignment attempt concluded.
 *
 * Richer than success/failure on purpose. `ManualAssignmentRequired` in particular is **not an
 * error** — it is the valid, configured answer when a deployment has decided a human allocates the
 * work, and reporting it as a failure would train officers to ignore a state that means "your turn".
 */
export type AssignmentStatus =
  /** A concrete target was named and native Dynamics ownership was set. */
  | 'Assigned'
  /** The work already belongs to the intended target. Nothing was written. */
  | 'AlreadyAssigned'
  /** Configuration says a person allocates this. Not an error. */
  | 'ManualAssignmentRequired'
  /** The configured method needs an engine this deployment has not made available (KI-09). */
  | 'AssignmentCapabilityUnavailable'
  /** No active assignment configuration applies to this work. */
  | 'ConfigurationMissing'
  /** More than one configuration claims it at the same priority. Refused rather than guessed. */
  | 'ConfigurationAmbiguous'
  /** The named user or team cannot receive work — disabled, deleted, or not found. */
  | 'TargetUnavailable'
  /** The platform failed in a way that may succeed later. */
  | 'RetryableFailure'
  /** The platform refused in a way retrying will not fix. */
  | 'PermanentFailure';

/** Who the work should go to, once something authoritative has named them. */
export interface AssignmentTarget {
  kind: 'user' | 'team';
  id: string;
  /** For officer-facing text. Never an id. */
  displayName?: string;
}

export interface AssignmentDecision {
  status: AssignmentStatus;
  target?: AssignmentTarget;
  configurationId?: string;
  /** What to tell an officer. No plugin names, no adapter names, no ids, no KI numbers. */
  reason: string;
}

/** True when the work still needs somebody to look at it. Used by WP7 to tell overdue from orphaned. */
export function awaitingAssignment(status: AssignmentStatus): boolean {
  return status !== 'Assigned' && status !== 'AlreadyAssigned';
}

/**
 * True when trying again could plausibly change the answer.
 *
 * `ConfigurationMissing` is retryable in the sense that configuring something fixes it, but not by
 * the executor repeating itself — so it is not listed. Retry means "the same call might work".
 */
export function worthRetrying(status: AssignmentStatus): boolean {
  return status === 'RetryableFailure';
}

// ── The decision ─────────────────────────────────────────────────────────────

/**
 * Methods that require a routing engine to choose between candidates.
 *
 * DCP has no such engine and will not grow one. Where one of these is configured and no concrete
 * target is named, the honest answer is that the capability is unavailable here.
 */
const ENGINE_METHODS: ReadonlySet<AssignmentMethod> = new Set<AssignmentMethod>([
  'RoundRobin', 'Load', 'Territory', 'SmartAssignment',
]);

const REASONS = {
  missing:
    'No assignment rule covers this work, so nobody has been given it. A supervisor needs to '
    + 'assign it, or configuration needs to say who should.',
  ambiguous:
    'More than one assignment rule claims this work, so it is not clear who should receive it. '
    + 'Nothing was assigned — the rules need to be corrected before this can route automatically.',
  manual:
    'Configuration says this work is allocated by a person rather than automatically.',
  unavailable:
    'This work is configured to be routed automatically, but automatic routing is not available '
    + 'on this deployment. It needs to be assigned by hand until that is in place.',
  assignable: 'Configuration names who should receive this work.',
} as const;

/**
 * Decides where a piece of work should go, from configuration alone.
 *
 * Pure: it reads configuration and returns an intent. It performs no assignment, reads no platform
 * state and chooses between no candidates.
 *
 * A **concrete target wins over the method**. If a configuration names a user or a team, honouring
 * that is not routing — somebody already decided. Only when no target is named does the method
 * matter, and then only to say whether DCP can act on it.
 */
export function decideAssignment(
  configuration: AssignmentConfiguration | null,
  targets: { defaultUserId?: string; targetTeamId?: string } = {},
): AssignmentDecision {
  if (!configuration) return { status: 'ConfigurationMissing', reason: REASONS.missing };

  const target = concreteTarget(targets);
  if (target) {
    return {
      status: 'Assigned',
      target,
      configurationId: configuration.id,
      reason: REASONS.assignable,
    };
  }

  if (configuration.method === 'Manual') {
    return {
      status: 'ManualAssignmentRequired',
      configurationId: configuration.id,
      reason: REASONS.manual,
    };
  }

  if (ENGINE_METHODS.has(configuration.method)) {
    return {
      status: 'AssignmentCapabilityUnavailable',
      configurationId: configuration.id,
      reason: REASONS.unavailable,
    };
  }

  return { status: 'ConfigurationMissing', reason: REASONS.missing };
}

/** A team is preferred over a user when both are named: the narrower choice is the human's to make. */
function concreteTarget(
  targets: { defaultUserId?: string; targetTeamId?: string },
): AssignmentTarget | undefined {
  if (targets.targetTeamId) return { kind: 'team', id: targets.targetTeamId };
  if (targets.defaultUserId) return { kind: 'user', id: targets.defaultUserId };
  return undefined;
}

/** The decision for work that could not be matched to exactly one configuration. */
export function ambiguousAssignment(): AssignmentDecision {
  return { status: 'ConfigurationAmbiguous', reason: REASONS.ambiguous };
}

// ── Reassignment ─────────────────────────────────────────────────────────────

/**
 * Whether an assignment should be written at all, given who already owns the work.
 *
 * **A human ownership decision is not overwritten.** Once work has been assigned — by the first
 * assignment or by an officer moving it — a later evaluation does not seize it back merely because
 * configuration still points somewhere else. Initial assignment and subsequent reassignment are
 * different acts, and only the first is automatic.
 *
 * Without this, every re-evaluation would quietly undo every manual reassignment on the case, and
 * the officer who moved the work would have no way to tell why it kept moving back.
 */
export function shouldWriteAssignment(
  decision: AssignmentDecision,
  currentOwnerId: string | undefined,
): { write: boolean; status: AssignmentStatus; reason: string } {
  if (decision.status !== 'Assigned' || !decision.target) {
    return { write: false, status: decision.status, reason: decision.reason };
  }

  if (!currentOwnerId) {
    return { write: true, status: 'Assigned', reason: decision.reason };
  }

  if (currentOwnerId.toLowerCase() === decision.target.id.toLowerCase()) {
    return {
      write: false,
      status: 'AlreadyAssigned',
      reason: 'This work already belongs to who configuration says should have it.',
    };
  }

  return {
    write: false,
    status: 'AlreadyAssigned',
    reason: 'This work has already been assigned to someone, so it was left with them. '
      + 'Automatic routing does not take work back from a person who has it.',
  };
}
