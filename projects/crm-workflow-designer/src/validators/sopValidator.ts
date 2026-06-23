// src/validators/sopValidator.ts
import type { SopDesignerState, SopValidationResult } from '@/store/sopStore';

/** Validates a SOP before publication. Returns all violations found. */
export function validateSopForPublish(state: SopDesignerState): SopValidationResult[] {
  const results: SopValidationResult[] = [];

  results.push(...checkSopHasSteps(state));
  results.push(...checkAllStepsHaveNames(state));
  results.push(...checkStepSequenceUniqueness(state));
  results.push(...checkOutcomeNextStepReferences(state));
  results.push(...checkNoDeadLoops(state));

  return results;
}

function checkSopHasSteps(state: SopDesignerState): SopValidationResult[] {
  if (state.stepOrder.length === 0) {
    return [{
      code: 'VS-02',
      severity: 'error',
      affectedNodeId: null,
      message: 'SOP must have at least one step before it can be published.',
    }];
  }
  return [];
}

function checkAllStepsHaveNames(state: SopDesignerState): SopValidationResult[] {
  return state.stepOrder
    .filter((id) => !state.steps[id]?.name?.trim())
    .map((id) => ({
      code: 'VS-03',
      severity: 'error' as const,
      affectedNodeId: id,
      message: `Step ${state.steps[id]?.sequenceNo ?? '?'} is missing a name.`,
    }));
}

function checkStepSequenceUniqueness(state: SopDesignerState): SopValidationResult[] {
  const seqNos = state.stepOrder.map((id) => state.steps[id].sequenceNo);
  const seen = new Set<number>();
  const reported = new Set<number>();
  const results: SopValidationResult[] = [];

  for (const n of seqNos) {
    if (seen.has(n) && !reported.has(n)) {
      results.push({
        code: 'VS-04',
        severity: 'error',
        affectedNodeId: null,
        message: `Duplicate sequence number ${n} — each step must have a unique sequence number.`,
      });
      reported.add(n);
    }
    seen.add(n);
  }
  return results;
}

function checkOutcomeNextStepReferences(state: SopDesignerState): SopValidationResult[] {
  return Object.values(state.outcomes)
    .filter(
      (outcome) =>
        outcome.nextSopStepId !== null &&
        !state.steps[outcome.nextSopStepId]
    )
    .map((outcome) => ({
      code: 'VS-05',
      severity: 'error' as const,
      affectedNodeId: outcome.id,
      message: `Outcome "${outcome.name}" points to a step that no longer exists. Remove or update the connection.`,
    }));
}

/**
 * Detects dead-end loops: cycles where every step inside the loop has no
 * terminal outcome (nextSopStepId === null) to exit to the End node.
 *
 * Intentional return paths (e.g. "Returned → previous step") are valid as
 * long as the cycle contains at least one step with a terminal outcome.
 * Affected step IDs are returned in affectedNodeIds so the canvas can
 * highlight every node that is part of the loop.
 */
function checkNoDeadLoops(state: SopDesignerState): SopValidationResult[] {
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const deadLoopStepIds = new Set<string>();

  function dfs(stepId: string, stackPath: string[]): void {
    visited.add(stepId);
    inStack.add(stepId);
    stackPath.push(stepId);

    for (const outcomeId of (state.outcomeOrder[stepId] ?? [])) {
      const nextStepId = state.outcomes[outcomeId]?.nextSopStepId;
      if (!nextStepId) continue;

      if (!visited.has(nextStepId)) {
        dfs(nextStepId, stackPath);
      } else if (inStack.has(nextStepId)) {
        const cycleStart = stackPath.indexOf(nextStepId);
        const cycleMembers = stackPath.slice(cycleStart);

        // A cycle is a dead loop only when it has NO exit at all.
        // An exit is any outcome whose next step is null (End) OR points
        // to a step outside the cycle (e.g. Approve → Payment Processing).
        const cycleSet = new Set(cycleMembers);
        const hasExit = cycleMembers.some((sid) =>
          (state.outcomeOrder[sid] ?? []).some((oid) => {
            const nextId = state.outcomes[oid]?.nextSopStepId;
            return nextId === null || !cycleSet.has(nextId);
          })
        );

        if (!hasExit) {
          for (const sid of cycleMembers) deadLoopStepIds.add(sid);
        }
      }
    }

    inStack.delete(stepId);
    stackPath.pop();
  }

  for (const id of state.stepOrder) {
    if (!visited.has(id)) dfs(id, []);
  }

  if (deadLoopStepIds.size === 0) return [];

  const stepNames = [...deadLoopStepIds]
    .map((id) => state.steps[id]?.name ?? id)
    .join(', ');

  return [{
    code: 'VS-06',
    severity: 'error',
    affectedNodeId: null,
    affectedNodeIds: [...deadLoopStepIds],
    message: `Dead-end loop — these steps loop forever with no terminal outcome: ${stepNames}.`,
  }];
}
