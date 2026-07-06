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

/** The immutable graph maps plus the growing result list, threaded through the DFS. */
interface EnumerationContext {
  steps: Record<string, WorkflowStep>;
  outcomes: Record<string, WorkflowOutcome>;
  outcomeOrder: Record<string, string[]>;
  routes?: Record<string, WorkflowRoute>;
  routeOrder?: Record<string, string[]>;
  result: SimPath[];
}

/** One node in the traversal: where we are, how we got here, and the cycle guard. */
interface TraversalFrame {
  stepId: string;
  pathSoFar: SimPathStep[];
  visited: Set<string>;
}

export function enumerateAllPaths(
  entryStepId: string,
  steps: Record<string, WorkflowStep>,
  outcomes: Record<string, WorkflowOutcome>,
  outcomeOrder: Record<string, string[]>,
  routes?: Record<string, WorkflowRoute>,
  routeOrder?: Record<string, string[]>
): SimPath[] {
  const context: EnumerationContext = { steps, outcomes, outcomeOrder, routes, routeOrder, result: [] };
  depthFirstSearch({ stepId: entryStepId, pathSoFar: [], visited: new Set() }, context);
  return context.result;
}

function depthFirstSearch(frame: TraversalFrame, context: EnumerationContext): void {
  const step = context.steps[frame.stepId];
  if (!step) return;

  if (frame.visited.has(frame.stepId)) {
    context.result.push({ id: nextPathId(context), steps: frame.pathSoFar, endReason: 'cycle', cycleStepName: step.name });
    return;
  }

  const branchVisited = new Set(frame.visited).add(frame.stepId);
  const stepOutcomes = resolveStepOutcomes(frame.stepId, context);
  if (stepOutcomes.length === 0) {
    context.result.push({ id: nextPathId(context), steps: [...frame.pathSoFar, buildPathStep(step, null)], endReason: 'no-outcomes' });
    return;
  }

  for (const outcome of stepOutcomes) {
    const routes = resolveOutcomeRoutes(outcome, context);
    if (routes.length > 0) {
      enumerateRouteBranches({ step, outcome, routes, pathSoFar: frame.pathSoFar, visited: branchVisited }, context);
    } else {
      traversePlainOutcome({ step, outcome, pathSoFar: frame.pathSoFar, visited: branchVisited }, context);
    }
  }
}

function resolveStepOutcomes(stepId: string, context: EnumerationContext): WorkflowOutcome[] {
  return (context.outcomeOrder[stepId] ?? [])
    .map((id) => context.outcomes[id])
    .filter((o): o is WorkflowOutcome => o !== undefined);
}

/** Routes for a conditional outcome; empty when the outcome has no route filter. */
function resolveOutcomeRoutes(outcome: WorkflowOutcome, context: EnumerationContext): WorkflowRoute[] {
  if (!outcome.applyFilter || !context.routes || !context.routeOrder) return [];
  const routes = context.routes;
  return (context.routeOrder[outcome.crmId] ?? [])
    .map((id) => routes[id])
    .filter((r): r is WorkflowRoute => r !== undefined);
}

/** Enumerates one branch per route of a conditional outcome. */
function enumerateRouteBranches(
  args: { step: WorkflowStep; outcome: WorkflowOutcome; routes: WorkflowRoute[]; pathSoFar: SimPathStep[]; visited: Set<string> },
  context: EnumerationContext
): void {
  for (const route of args.routes) {
    const isFallback = !route.filter?.trim();
    const pathStep = buildPathStep(args.step, {
      outcomeId: args.outcome.crmId,
      outcomeName: args.outcome.name,
      routeId: route.crmId,
      routeName: route.name || (isFallback ? 'else' : route.crmId),
      routeCondition: isFallback ? 'else' : route.filter,
    });
    advanceOrEnd({ nextStepId: route.nextStepId, pathSoFar: args.pathSoFar, pathStep, visited: args.visited }, context);
  }
}

/** Traverses a plain (unconditional) outcome. */
function traversePlainOutcome(
  args: { step: WorkflowStep; outcome: WorkflowOutcome; pathSoFar: SimPathStep[]; visited: Set<string> },
  context: EnumerationContext
): void {
  const pathStep = buildPathStep(args.step, { outcomeId: args.outcome.crmId, outcomeName: args.outcome.name });
  advanceOrEnd({ nextStepId: args.outcome.nextStepId, pathSoFar: args.pathSoFar, pathStep, visited: args.visited }, context);
}

/** Recurses into the next step, or records a completed path when there is none. */
function advanceOrEnd(
  args: { nextStepId: string | null | undefined; pathSoFar: SimPathStep[]; pathStep: SimPathStep; visited: Set<string> },
  context: EnumerationContext
): void {
  const steps = [...args.pathSoFar, args.pathStep];
  if (!args.nextStepId) {
    context.result.push({ id: nextPathId(context), steps, endReason: 'end' });
    return;
  }
  depthFirstSearch({ stepId: args.nextStepId, pathSoFar: steps, visited: args.visited }, context);
}

function nextPathId(context: EnumerationContext): string {
  return `path_${context.result.length}`;
}

function buildPathStep(step: WorkflowStep, outcomeTaken: SimPathStep['outcomeTaken']): SimPathStep {
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
