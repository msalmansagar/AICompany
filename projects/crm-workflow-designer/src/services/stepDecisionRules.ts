import type { WorkflowOutcome, WorkflowStep } from '@/types/WorkflowTypes';

/**
 * A step with no decision produces a task that can never move the process on.
 *
 * `OnTaskCompletePostActivities` returns immediately when the completed task carries no
 * `qdb_decision`, so a step offering nothing to choose leaves the instance stopped there —
 * silently, with the task marked complete. Nothing in Dataverse refuses to store such a
 * step, which is why the designer has to.
 *
 * This is separate from `saveBlockers`: those mirror writes the server will reject, this
 * one mirrors a process that will stall. Both stop a save, for different reasons.
 */

/** A step that cannot advance, and why. */
export interface StepDecisionBlocker {
  readonly stepId: string;
  readonly message: string;
}

interface DecisionState {
  readonly steps: Readonly<Record<string, WorkflowStep>>;
  readonly outcomes: Readonly<Record<string, WorkflowOutcome>>;
}

/**
 * Finds every step that would leave a task with nothing to choose.
 * @param state the steps and outcomes as they stand in the store
 * @returns one blocker per stranded step, in sequence order
 */
export function findStepsWithoutDecision(state: DecisionState): StepDecisionBlocker[] {
  const outcomeCounts = countOutcomesByStep(state.outcomes);
  return Object.values(state.steps)
    .filter((step) => (outcomeCounts.get(step.crmId) ?? 0) === 0)
    .sort((a, b) => a.sequenceNo - b.sequenceNo)
    .map((step) => ({
      stepId: step.crmId,
      message: `Step ${step.sequenceNo} "${step.name || 'unnamed'}" has no decision. Its task could be completed but the process would stop there.`,
    }));
}

function countOutcomesByStep(outcomes: Readonly<Record<string, WorkflowOutcome>>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const outcome of Object.values(outcomes)) {
    counts.set(outcome.stepId, (counts.get(outcome.stepId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Turns stranded steps into a message naming what to fix.
 * @param blockers the steps found, in sequence order
 * @returns a message for the user, or null when every step can advance
 */
export function describeStepDecisionBlockers(blockers: readonly StepDecisionBlocker[]): string | null {
  if (blockers.length === 0) return null;
  if (blockers.length === 1) return `Cannot save: ${blockers[0]!.message}`;
  return `Cannot save — ${blockers.length} steps have no decision:\n${blockers.map((b) => `• ${b.message}`).join('\n')}`;
}
