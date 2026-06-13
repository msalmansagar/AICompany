import type { WorkflowStep, WorkflowOutcome } from '@/types/WorkflowTypes';

export type PathEndReason = 'end' | 'no-outcomes' | 'cycle';

export interface SimPathStep {
  stepId: string;
  stepName: string;
  assigneeName: string | null;
  assignType: string;
  outcomeTaken: { outcomeId: string; outcomeName: string } | null;
}

export interface SimPath {
  id: string;
  steps: SimPathStep[];
  endReason: PathEndReason;
  cycleStepName?: string;
}

export function enumerateAllPaths(
  entryStepId: string,
  steps: Record<string, WorkflowStep>,
  outcomes: Record<string, WorkflowOutcome>,
  outcomeOrder: Record<string, string[]>
): SimPath[] {
  const result: SimPath[] = [];
  depthFirstSearch(entryStepId, [], new Set(), steps, outcomes, outcomeOrder, result);
  return result;
}

function depthFirstSearch(
  stepId: string,
  pathSoFar: SimPathStep[],
  visited: Set<string>,
  steps: Record<string, WorkflowStep>,
  outcomes: Record<string, WorkflowOutcome>,
  outcomeOrder: Record<string, string[]>,
  result: SimPath[]
): void {
  const step = steps[stepId];
  if (!step) return;

  if (visited.has(stepId)) {
    result.push({
      id: `path_${result.length}`,
      steps: pathSoFar,
      endReason: 'cycle',
      cycleStepName: step.name,
    });
    return;
  }

  const branchVisited = new Set(visited);
  branchVisited.add(stepId);

  const stepOutcomes = (outcomeOrder[stepId] ?? [])
    .map((id) => outcomes[id])
    .filter((o): o is WorkflowOutcome => o !== undefined);

  if (stepOutcomes.length === 0) {
    result.push({
      id: `path_${result.length}`,
      steps: [
        ...pathSoFar,
        buildPathStep(step, null),
      ],
      endReason: 'no-outcomes',
    });
    return;
  }

  for (const outcome of stepOutcomes) {
    const currentStep = buildPathStep(step, { outcomeId: outcome.crmId, outcomeName: outcome.name });

    if (outcome.nextStepId === null) {
      result.push({
        id: `path_${result.length}`,
        steps: [...pathSoFar, currentStep],
        endReason: 'end',
      });
    } else {
      depthFirstSearch(
        outcome.nextStepId,
        [...pathSoFar, currentStep],
        branchVisited,
        steps,
        outcomes,
        outcomeOrder,
        result
      );
    }
  }
}

function buildPathStep(
  step: WorkflowStep,
  outcomeTaken: { outcomeId: string; outcomeName: string } | null
): SimPathStep {
  return {
    stepId: step.crmId,
    stepName: step.name,
    assigneeName: resolveAssigneeName(step),
    assignType: resolveAssignType(step),
    outcomeTaken,
  };
}

function resolveAssigneeName(step: WorkflowStep): string | null {
  if (step.assignTo === 'user') return step.assignedUserName;
  if (step.assignTo === 'team') return step.teamName;
  if (step.assignTo === 'roundRobin') return step.roundRobinTeamName;
  return null;
}

function resolveAssignType(step: WorkflowStep): string {
  if (step.assignTo === 'roundRobin') return 'Round Robin';
  if (step.assignTo === 'team') return 'Team';
  return 'User';
}
