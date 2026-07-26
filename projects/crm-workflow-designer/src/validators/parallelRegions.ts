import dagre from '@dagrejs/dagre';
import type { WorkflowStep, WorkflowOutcome, WorkflowRoute } from '@/types/WorkflowTypes';

// Structural analysis of parallel (AND) regions — DP-1, ADR-1-002.
//
// Pure: no store, no adapter, no React. Everything here is a function of the graph,
// which is what makes the deadlock analysis testable against adversarial fixtures
// (CEO condition C-2).
//
// Graph algorithms come from graphlib, re-exported by the @dagrejs/dagre dependency
// the project already uses for layout — no new package.

/** The synthetic sink every terminal edge points at, so "reaches End" is a reachability question. */
export const END_SINK = '__end__';

/** The slice of a step this analysis needs. */
export type ControlFlowStep = Pick<WorkflowStep, 'crmId' | 'name' | 'splitType' | 'joinType'>;

export interface ControlFlowGraphInput {
  steps: Record<string, ControlFlowStep>;
  outcomes: Record<string, WorkflowOutcome>;
  routes: Record<string, WorkflowRoute>;
}

/** A parallel split, its branches, and the AND-join that closes it. */
export interface ParallelRegion {
  splitStepId: string;
  /** First step of each branch. May include END_SINK when a branch terminates immediately. */
  branchEntryIds: string[];
  /** The matched AND-join, or null when the branches never converge on one. */
  joinStepId: string | null;
  /** Steps strictly between the split and the join — excludes both ends. */
  interiorStepIds: string[];
}

export type ParallelFindingCode =
  | 'PARALLEL_SPLIT_SINGLE_BRANCH'
  | 'UNMATCHED_PARALLEL_SPLIT'
  | 'ORPHAN_AND_JOIN'
  | 'PARALLEL_JOIN_DEADLOCK'
  | 'PARALLEL_LOOP_IN_REGION';

export interface ParallelFinding {
  code: ParallelFindingCode;
  /** The step the finding is anchored to. */
  stepId: string;
  /** Every step implicated, for multi-node highlighting. */
  affectedStepIds?: string[];
  /** Detail appended to the user-facing message. */
  detail?: string;
}

/**
 * Builds the step-level successor graph. An unfiltered outcome contributes one edge
 * to its next step; a filtered outcome contributes one edge per route. A null next
 * step is an edge to END_SINK, so termination and convergence are the same kind of
 * question. Mirrors the successor rules ValidationService already uses.
 */
export function buildStepGraph(input: ControlFlowGraphInput): dagre.graphlib.Graph {
  const graph = new dagre.graphlib.Graph({ directed: true });
  graph.setNode(END_SINK, {});
  for (const stepId of Object.keys(input.steps)) graph.setNode(stepId, {});

  for (const outcome of Object.values(input.outcomes)) {
    if (!graph.hasNode(outcome.stepId)) continue;
    for (const target of outcomeTargets(outcome, input.routes)) {
      const node = target ?? END_SINK;
      if (graph.hasNode(node)) graph.setEdge(outcome.stepId, node);
    }
  }
  return graph;
}

/** Every next-step id an outcome can lead to — directly, or through each of its routes. */
function outcomeTargets(
  outcome: WorkflowOutcome,
  routes: Record<string, WorkflowRoute>
): (string | null)[] {
  if (!outcome.applyFilter) return [outcome.nextStepId];
  return Object.values(routes)
    .filter((route) => route.outcomeId === outcome.crmId)
    .map((route) => route.nextStepId);
}

/** Every node reachable from `start`, excluding `start` itself unless a cycle returns to it. */
function reachableFrom(graph: dagre.graphlib.Graph, start: string, blocked?: string): Set<string> {
  const seen = new Set<string>();
  const queue = [...(graph.successors(start) ?? [])];
  while (queue.length > 0) {
    const node = queue.shift() as string;
    if (seen.has(node) || node === blocked) continue;
    seen.add(node);
    queue.push(...(graph.successors(node) ?? []));
  }
  return seen;
}

/** Hop distance from `start` to every reachable node, for picking the nearest join. */
function hopDistances(graph: dagre.graphlib.Graph, start: string): Map<string, number> {
  const distances = new Map<string, number>([[start, 0]]);
  const queue = [start];
  while (queue.length > 0) {
    const node = queue.shift() as string;
    const next = (distances.get(node) as number) + 1;
    for (const successor of graph.successors(node) ?? []) {
      if (distances.has(successor)) continue;
      distances.set(successor, next);
      queue.push(successor);
    }
  }
  return distances;
}

function intersectAll(sets: Set<string>[]): Set<string> {
  if (sets.length === 0) return new Set();
  const [first, ...rest] = sets;
  return new Set([...first].filter((value) => rest.every((set) => set.has(value))));
}

/**
 * The AND-join that closes a split: the nearest step, by hop distance, that is both
 * reachable from every branch and declared as an AND-join. Distance rather than
 * topological order because the graph may legitimately contain cycles elsewhere,
 * where a topological sort has no answer at all.
 */
function findNearestJoin(
  input: ControlFlowGraphInput,
  graph: dagre.graphlib.Graph,
  splitStepId: string,
  branchReach: Set<string>[]
): string | null {
  const common = intersectAll(branchReach);
  const distances = hopDistances(graph, splitStepId);
  const candidates = [...common]
    .filter((stepId) => input.steps[stepId]?.joinType === 'AndJoin')
    .sort((a, b) => (distances.get(a) ?? Infinity) - (distances.get(b) ?? Infinity) || a.localeCompare(b));
  return candidates[0] ?? null;
}

/** Steps that sit on a path from the split to the join — the region's interior. */
function collectInterior(
  graph: dagre.graphlib.Graph,
  branchReach: Set<string>[],
  joinStepId: string
): string[] {
  const downstream = new Set(branchReach.flatMap((set) => [...set]));
  return [...downstream].filter(
    (stepId) =>
      stepId !== joinStepId &&
      stepId !== END_SINK &&
      reachableFrom(graph, stepId).has(joinStepId)
  );
}

/** Every parallel split in the process, with its branches and matched join resolved. */
export function findParallelRegions(input: ControlFlowGraphInput): ParallelRegion[] {
  const graph = buildStepGraph(input);
  return Object.values(input.steps)
    .filter((step) => step.splitType === 'Parallel')
    .map((step) => buildRegion(input, graph, step.crmId));
}

function buildRegion(
  input: ControlFlowGraphInput,
  graph: dagre.graphlib.Graph,
  splitStepId: string
): ParallelRegion {
  const branchEntryIds = [...(graph.successors(splitStepId) ?? [])];
  const branchReach = branchEntryIds.map(
    (entry) => new Set<string>([entry, ...reachableFrom(graph, entry)])
  );
  const joinStepId = findNearestJoin(input, graph, splitStepId, branchReach);
  const interiorStepIds = joinStepId ? collectInterior(graph, branchReach, joinStepId) : [];
  return { splitStepId, branchEntryIds, joinStepId, interiorStepIds };
}

/**
 * Every structural defect in the process's parallel regions. Returns findings, not
 * user-facing messages — ValidationService owns the wording.
 */
export function analyseParallelRegions(input: ControlFlowGraphInput): ParallelFinding[] {
  const graph = buildStepGraph(input);
  const regions = Object.values(input.steps)
    .filter((step) => step.splitType === 'Parallel')
    .map((step) => buildRegion(input, graph, step.crmId));

  return [
    ...regions.flatMap((region) => checkRegion(input, graph, region)),
    ...checkOrphanJoins(input, regions),
  ];
}

function checkRegion(
  input: ControlFlowGraphInput,
  graph: dagre.graphlib.Graph,
  region: ParallelRegion
): ParallelFinding[] {
  if (region.branchEntryIds.length < 2) {
    return [{ code: 'PARALLEL_SPLIT_SINGLE_BRANCH', stepId: region.splitStepId }];
  }
  if (!region.joinStepId) {
    return [{ code: 'UNMATCHED_PARALLEL_SPLIT', stepId: region.splitStepId }];
  }
  return [
    ...checkStarvation(graph, region),
    ...checkExternalEntry(graph, region),
    ...checkLoopInRegion(input, graph, region),
  ];
}

/**
 * A branch that can reach End without passing through the join leaves the join
 * waiting for a branch that will never arrive.
 */
function checkStarvation(graph: dagre.graphlib.Graph, region: ParallelRegion): ParallelFinding[] {
  const join = region.joinStepId as string;
  const starving = region.branchEntryIds.filter(
    (entry) => entry === END_SINK || reachableFrom(graph, entry, join).has(END_SINK)
  );
  if (starving.length === 0) return [];
  return [
    {
      code: 'PARALLEL_JOIN_DEADLOCK',
      stepId: join,
      affectedStepIds: [region.splitStepId, join],
      detail: 'a branch can reach the End node without passing through it',
    },
  ];
}

/**
 * An edge into the join from outside the region means the process can arrive at the
 * join having never taken the split, so it waits for branches that never started.
 */
function checkExternalEntry(graph: dagre.graphlib.Graph, region: ParallelRegion): ParallelFinding[] {
  const join = region.joinStepId as string;
  const inRegion = new Set([region.splitStepId, ...region.interiorStepIds]);
  const external = (graph.predecessors(join) ?? []).filter((pred) => !inRegion.has(pred));
  if (external.length === 0) return [];
  return [
    {
      code: 'PARALLEL_JOIN_DEADLOCK',
      stepId: join,
      affectedStepIds: [join, ...external],
      detail: 'it can be reached without passing through the parallel split',
    },
  ];
}

/**
 * A loop through the region would deliver a branch to the join more than once, or
 * deliver one it has already consumed. Loops outside any parallel region are
 * untouched — the existing back-edge modelling keeps working exactly as before.
 */
function checkLoopInRegion(
  input: ControlFlowGraphInput,
  graph: dagre.graphlib.Graph,
  region: ParallelRegion
): ParallelFinding[] {
  const interior = new Set(region.interiorStepIds);
  const looping = dagre.graphlib.alg
    .findCycles(graph)
    .filter((cycle) => cycle.some((stepId) => interior.has(stepId)));
  if (looping.length === 0) return [];
  const members = [...new Set(looping.flat())].filter((stepId) => input.steps[stepId]);
  return [
    {
      code: 'PARALLEL_LOOP_IN_REGION',
      stepId: region.splitStepId,
      affectedStepIds: members,
    },
  ];
}

/** An AND-join that no parallel split feeds waits for branches that do not exist. */
function checkOrphanJoins(
  input: ControlFlowGraphInput,
  regions: ParallelRegion[]
): ParallelFinding[] {
  const matched = new Set(regions.map((region) => region.joinStepId).filter(Boolean));
  return Object.values(input.steps)
    .filter((step) => step.joinType === 'AndJoin' && !matched.has(step.crmId))
    .map((step) => ({ code: 'ORPHAN_AND_JOIN' as const, stepId: step.crmId }));
}
