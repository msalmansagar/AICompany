import type { WorkflowStep, WorkflowOutcome, WorkflowRoute } from '@/types/WorkflowTypes';
import { findParallelRegions, describeBranches } from '@/validators/parallelRegions';
import type { ParallelRegion, ParallelBranch } from '@/validators/parallelRegions';

export type PathEndReason = 'end' | 'no-outcomes' | 'cycle' | 'unmatched-parallel';

/** One concurrent branch of a parallel region, for the collapsed path element. */
export interface SimConcurrentBranch {
  entryStepName: string;
  stepNames: string[];
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
  /** Parallel regions by split step id. Empty for a process with no concurrency. */
  regions: Map<string, ParallelRegion>;
  branchesBySplitId: Map<string, ParallelBranch[]>;
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
    ...buildRegionIndex(steps, outcomes, routes),
  };
  depthFirstSearch({ stepId: entryStepId, pathSoFar: [], visited: new Set() }, context);
  return context.result;
}

/** Indexes the process's parallel regions once, so the traversal can look them up. */
function buildRegionIndex(
  steps: Record<string, WorkflowStep>,
  outcomes: Record<string, WorkflowOutcome>,
  routes: Record<string, WorkflowRoute> | undefined
): Pick<EnumerationContext, 'regions' | 'branchesBySplitId'> {
  const input = { steps, outcomes, routes: routes ?? {} };
  const regions = findParallelRegions(input);
  return {
    regions: new Map(regions.map((region) => [region.splitStepId, region])),
    branchesBySplitId: new Map(
      regions.map((region) => [region.splitStepId, describeBranches(input, region)])
    ),
  };
}

function depthFirstSearch(frame: TraversalFrame, context: EnumerationContext): void {
  const step = context.steps[frame.stepId];
  if (!step) return;

  if (frame.visited.has(frame.stepId)) {
    context.result.push({ id: nextPathId(context), steps: frame.pathSoFar, endReason: 'cycle', cycleStepName: step.name });
    return;
  }

  const branchVisited = new Set(frame.visited).add(frame.stepId);

  if (step.splitType === 'Parallel') {
    traverseParallelRegion({ step, pathSoFar: frame.pathSoFar, visited: branchVisited }, context);
    return;
  }

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

/**
 * Collapses a whole parallel region into one path element and continues from the
 * join. Every branch runs, so there is nothing to choose between: emitting one path
 * per branch would read as an either/or, and interleaving the branches would
 * multiply out factorially. Neither is a useful thing to show a reviewer.
 */
function traverseParallelRegion(
  args: { step: WorkflowStep; pathSoFar: SimPathStep[]; visited: Set<string> },
  context: EnumerationContext
): void {
  const region = context.regions.get(args.step.crmId);
  const branches = context.branchesBySplitId.get(args.step.crmId) ?? [];
  const pathStep: SimPathStep = {
    ...buildPathStep(args.step, null),
    concurrentBranches: branches.map((branch) => toSimBranch(branch, context)),
  };
  const steps = [...args.pathSoFar, pathStep];

  if (!region?.joinStepId) {
    context.result.push({ id: nextPathId(context), steps, endReason: 'unmatched-parallel' });
    return;
  }
  depthFirstSearch({ stepId: region.joinStepId, pathSoFar: steps, visited: args.visited }, context);
}

function toSimBranch(branch: ParallelBranch, context: EnumerationContext): SimConcurrentBranch {
  return {
    entryStepName: context.steps[branch.entryStepId]?.name ?? branch.entryStepId,
    stepNames: branch.stepIds.map((stepId) => context.steps[stepId]?.name ?? stepId),
  };
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
