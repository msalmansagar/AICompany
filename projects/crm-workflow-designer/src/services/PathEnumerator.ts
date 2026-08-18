import type { WorkflowStep, WorkflowOutcome, WorkflowRoute } from '@/types/WorkflowTypes';
import { branchChildrenOf } from '@/services/branchFields';

export type PathEndReason = 'end' | 'no-outcomes' | 'cycle';

/** One step that runs alongside the step carrying it, for the collapsed element. */
export interface SimConcurrentBranch {
  entryStepName: string;
  /** Whether the branch is gated by its own condition. */
  isConditional: boolean;
}

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
  /**
   * Present only on a parallel split (DP-1). The whole region collapses into this
   * one element: every branch runs, so enumerating them as separate paths would
   * misrepresent concurrency as choice, and interleaving them would explode
   * combinatorially (ADR-1-004). Absent on every ordinary step, so consumers that
   * do not know about concurrency keep working unchanged.
   */
  concurrentBranches?: SimConcurrentBranch[];
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
  const context: EnumerationContext = {
    steps,
    outcomes,
    outcomeOrder,
    routes,
    routeOrder,
    result: [],
  };
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
    context.result.push({ id: nextPathId(context), steps: [...frame.pathSoFar, buildPathStep(step, null, context)], endReason: 'no-outcomes' });
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

/**
 * The steps that run alongside this one. They are attached to the path element
 * rather than enumerated as separate paths: they all start together, so listing
 * them as alternatives would misrepresent concurrency as choice, and interleaving
 * them would multiply out factorially. Branch count never affects path count.
 */
function concurrentBranchesOf(
  stepId: string,
  context: EnumerationContext
): SimConcurrentBranch[] | undefined {
  const childIds = branchChildrenOf(stepId, context.steps);
  if (childIds.length === 0) return undefined;
  return childIds.map((childId) => ({
    entryStepName: context.steps[childId]?.name ?? childId,
    isConditional: context.steps[childId]?.applyBranchFilter ?? false,
  }));
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
    const isFallback = route.isDefault;
    const pathStep = buildPathStep(args.step, {
      outcomeId: args.outcome.crmId,
      outcomeName: args.outcome.name,
      routeId: route.crmId,
      routeName: route.name || (isFallback ? 'else' : route.crmId),
      routeCondition: isFallback ? 'else' : route.filter,
    }, context);
    advanceOrEnd({ nextStepId: route.nextStepId, pathSoFar: args.pathSoFar, pathStep, visited: args.visited }, context);
  }
}

/** Traverses a plain (unconditional) outcome. */
function traversePlainOutcome(
  args: { step: WorkflowStep; outcome: WorkflowOutcome; pathSoFar: SimPathStep[]; visited: Set<string> },
  context: EnumerationContext
): void {
  const pathStep = buildPathStep(args.step, { outcomeId: args.outcome.crmId, outcomeName: args.outcome.name }, context);
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

function buildPathStep(
  step: WorkflowStep,
  outcomeTaken: SimPathStep['outcomeTaken'],
  context?: EnumerationContext
): SimPathStep {
  return {
    stepId: step.crmId,
    stepName: step.name,
    assigneeName: resolveAssigneeName(step),
    assignType: resolveAssignType(step),
    outcomeTaken,
    concurrentBranches: context ? concurrentBranchesOf(step.crmId, context) : undefined,
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
