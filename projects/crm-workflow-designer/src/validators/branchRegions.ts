import type { WorkflowStep, WorkflowOutcome } from '@/types/WorkflowTypes';

// Structural checks for the engine's concurrency model — CWFD-005.
//
// The engine expresses concurrency as a one-level-per-hop step hierarchy, so the
// analysis is far smaller than DP-1's graph reachability work: a region is simply
// a parent step and the steps naming it. There is no join step to locate, because
// the join happens at the parent's own completion.

/** The slice of a step this analysis needs. */
export type BranchStep = Pick<
  WorkflowStep,
  'crmId' | 'name' | 'sequenceNo' | 'parentStepId' | 'applyBranchFilter' | 'branchFilter'
>;

export interface BranchRegionInput {
  steps: Record<string, BranchStep>;
  outcomes: Record<string, WorkflowOutcome>;
}

/** A parent step and the branches that run alongside it. */
export interface BranchRegion {
  parentStepId: string;
  childStepIds: string[];
  /** Outcomes on the parent that refuse completion while branches are open. */
  guardingOutcomeIds: string[];
}

export type BranchFindingCode =
  | 'BRANCH_SELF_PARENT'
  | 'BRANCH_PARENT_CYCLE'
  | 'BRANCH_PARENT_MISSING'
  | 'BRANCH_FILTER_MISSING'
  | 'BRANCH_NO_JOIN_GUARD'
  | 'ORPHAN_JOIN_GUARD';

export interface BranchFinding {
  code: BranchFindingCode;
  stepId: string;
  affectedStepIds?: string[];
}

/** Every step that fans out concurrent branches, with its children and guards. */
export function findBranchRegions(input: BranchRegionInput): BranchRegion[] {
  const childrenByParent = groupChildrenByParent(input.steps);
  return [...childrenByParent.entries()]
    .filter(([parentStepId]) => input.steps[parentStepId])
    .map(([parentStepId, childStepIds]) => ({
      parentStepId,
      childStepIds,
      guardingOutcomeIds: guardingOutcomesFor(parentStepId, input.outcomes),
    }));
}

function groupChildrenByParent(steps: Record<string, BranchStep>): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  const ordered = Object.values(steps).sort((a, b) => a.sequenceNo - b.sequenceNo);
  for (const step of ordered) {
    if (!step.parentStepId) continue;
    grouped.set(step.parentStepId, [...(grouped.get(step.parentStepId) ?? []), step.crmId]);
  }
  return grouped;
}

function guardingOutcomesFor(stepId: string, outcomes: Record<string, WorkflowOutcome>): string[] {
  return Object.values(outcomes)
    .filter((outcome) => outcome.stepId === stepId && outcome.checkParallelTasks)
    .map((outcome) => outcome.crmId);
}

/** Walks up the parent chain, reporting the members if it closes on itself. */
function findParentCycle(startId: string, steps: Record<string, BranchStep>): string[] | null {
  const seen: string[] = [];
  let current: string | null = startId;
  while (current) {
    if (seen.includes(current)) return seen.slice(seen.indexOf(current));
    seen.push(current);
    current = steps[current]?.parentStepId ?? null;
  }
  return null;
}

/**
 * Every structural defect in the process's concurrency configuration. Returns
 * findings, not messages — ValidationService owns the wording.
 */
export function analyseBranchRegions(input: BranchRegionInput): BranchFinding[] {
  return [
    ...checkBranchSteps(input),
    ...checkRegions(input),
    ...checkOrphanGuards(input),
  ];
}

function checkBranchSteps(input: BranchRegionInput): BranchFinding[] {
  const findings: BranchFinding[] = [];
  const reportedCycles = new Set<string>();

  for (const step of Object.values(input.steps)) {
    if (!step.parentStepId) continue;

    if (step.parentStepId === step.crmId) {
      findings.push({ code: 'BRANCH_SELF_PARENT', stepId: step.crmId });
      continue;
    }
    if (!input.steps[step.parentStepId]) {
      findings.push({ code: 'BRANCH_PARENT_MISSING', stepId: step.crmId });
      continue;
    }
    const cycle = findParentCycle(step.crmId, input.steps);
    if (cycle && !cycle.some((id) => reportedCycles.has(id))) {
      cycle.forEach((id) => reportedCycles.add(id));
      findings.push({ code: 'BRANCH_PARENT_CYCLE', stepId: step.crmId, affectedStepIds: cycle });
    }
    if (step.applyBranchFilter && !step.branchFilter.trim()) {
      findings.push({ code: 'BRANCH_FILTER_MISSING', stepId: step.crmId });
    }
  }
  return findings;
}

/** A parent that fans out but never waits will complete while its branches run. */
function checkRegions(input: BranchRegionInput): BranchFinding[] {
  return findBranchRegions(input)
    .filter((region) => region.guardingOutcomeIds.length === 0)
    .map((region) => ({
      code: 'BRANCH_NO_JOIN_GUARD' as const,
      stepId: region.parentStepId,
      affectedStepIds: region.childStepIds,
    }));
}

/** A guard on a step with no branches waits for something that never starts. */
function checkOrphanGuards(input: BranchRegionInput): BranchFinding[] {
  const parentsWithChildren = new Set(findBranchRegions(input).map((region) => region.parentStepId));
  const guarded = new Set(
    Object.values(input.outcomes)
      .filter((outcome) => outcome.checkParallelTasks)
      .map((outcome) => outcome.stepId)
  );
  return [...guarded]
    .filter((stepId) => !parentsWithChildren.has(stepId) && input.steps[stepId])
    .map((stepId) => ({ code: 'ORPHAN_JOIN_GUARD' as const, stepId }));
}
