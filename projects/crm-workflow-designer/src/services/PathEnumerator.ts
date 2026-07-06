import type { WorkflowStep, WorkflowOutcome, WorkflowRoute } from '@/types/WorkflowTypes';

export type PathEndReason = 'end' | 'no-outcomes' | 'cycle';

export interface SimPathStep {
  stepId: string;
  stepName: string;
  assigneeName: string | null;
  assignType: string;
  outcomeTaken: {
    outcomeId: string;
    outcomeName: string;
    routeId?: string;
    routeName?: string;
    routeCondition?: string;
  } | null;
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
  outcomeOrder: Record<string, string[]>,
  routes?: Record<string, WorkflowRoute>,
  routeOrder?: Record<string, string[]>
): SimPath[] {
  const result: SimPath[] = [];
  depthFirstSearch(entryStepId, [], new Set(), steps, outcomes, outcomeOrder, result, routes, routeOrder);
  return result;
}

function depthFirstSearch(
  stepId: string,
  pathSoFar: SimPathStep[],
  visited: Set<string>,
  steps: Record<string, WorkflowStep>,
  outcomes: Record<string, WorkflowOutcome>,
  outcomeOrder: Record<string, string[]>,
  result: SimPath[],
  routes?: Record<string, WorkflowRoute>,
  routeOrder?: Record<string, string[]>
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
      steps: [...pathSoFar, buildPathStep(step, null)],
      endReason: 'no-outcomes',
    });
    return;
  }

  for (const outcome of stepOutcomes) {
    // Conditional outcome with routes: enumerate one branch per route
    if (outcome.applyFilter && routes && routeOrder) {
      const outcomeRoutes = (routeOrder[outcome.crmId] ?? [])
        .map((id) => routes[id])
        .filter((r): r is WorkflowRoute => r !== undefined);

      if (outcomeRoutes.length > 0) {
        for (const route of outcomeRoutes) {
          const isFallback = !route.filter?.trim();
          const currentStep = buildPathStep(step, {
            outcomeId: outcome.crmId,
            outcomeName: outcome.name,
            routeId: route.crmId,
            routeName: route.name || (isFallback ? 'else' : route.crmId),
            routeCondition: isFallback ? 'else' : route.filter,
          });

          if (!route.nextStepId) {
            result.push({
              id: `path_${result.length}`,
              steps: [...pathSoFar, currentStep],
              endReason: 'end',
            });
          } else {
            depthFirstSearch(
              route.nextStepId,
              [...pathSoFar, currentStep],
              branchVisited,
              steps, outcomes, outcomeOrder, result,
              routes, routeOrder
            );
          }
        }
        continue;
      }
    }

    // Plain outcome (no routes or no applyFilter)
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
        steps, outcomes, outcomeOrder, result,
        routes, routeOrder
      );
    }
  }
}

function buildPathStep(
  step: WorkflowStep,
  outcomeTaken: SimPathStep['outcomeTaken']
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
