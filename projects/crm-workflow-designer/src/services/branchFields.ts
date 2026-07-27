import type { WorkflowStep, WorkflowOutcome, BranchFields } from '@/types/WorkflowTypes';
import { ODATA_FORMATTED_VALUE_ANNOTATION as FMT } from './escalationFields';

// Concurrency mapping for BOTH adapters — CWFD-005 reconciliation.
//
// These are the columns the QDB process engine reads. `OnTaskCreate` fans out one
// task per child step (`qdb_parentworkitemstep`), each gated by that child's own
// `qdb_applyfilter`/`qdb_filter`; `OnTaskComplete` refuses to close a parent whose
// branches are still open when the chosen outcome sets `qdb_checkparalleltasks`.
//
// This module replaces controlFlowFields.ts, whose qdb_splittype/qdb_jointype
// columns nothing ever read. See cwfd-005-runtime/engine-contract.md.

/** Defaults for a freshly-built step: an ordinary sequential step, no branching. */
export function emptyBranchFields(): BranchFields {
  return {
    parentStepId: null,
    parentStepName: null,
    applyBranchFilter: false,
    branchFilter: '',
  };
}

/** Concurrency defaults for a freshly-built outcome. */
export function emptyOutcomeConcurrency(): Pick<WorkflowOutcome, 'checkParallelTasks' | 'updateParallelTaskRef'> {
  return { checkParallelTasks: false, updateParallelTaskRef: false };
}

/** Maps the branch columns of a raw Dataverse step row. */
export function mapBranchFields(raw: Record<string, unknown>): BranchFields {
  return {
    parentStepId: (raw['_qdb_parentworkitemstep_value'] as string | null) ?? null,
    parentStepName: (raw[`_qdb_parentworkitemstep_value${FMT}`] as string | null) ?? null,
    applyBranchFilter: (raw['qdb_applyfilter'] as boolean) ?? false,
    branchFilter: (raw['qdb_filter'] as string | null) ?? '',
  };
}

/** Maps the concurrency columns of a raw Dataverse outcome row. */
export function mapOutcomeConcurrency(
  raw: Record<string, unknown>
): Pick<WorkflowOutcome, 'checkParallelTasks' | 'updateParallelTaskRef'> {
  return {
    checkParallelTasks: (raw['qdb_checkparalleltasks'] as boolean) ?? false,
    updateParallelTaskRef: (raw['qdb_updateparalleltaskref'] as boolean) ?? false,
  };
}

/**
 * Scalar branch columns for a step write. The parent lookup is bound separately
 * by each adapter, because clearing a Dataverse lookup only works through its
 * navigation property — never through `_x_value` (the R-2 lesson from DP-2).
 */
export function buildBranchBody(data: Partial<WorkflowStep>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (data.applyBranchFilter !== undefined) body['qdb_applyfilter'] = data.applyBranchFilter;
  if (data.branchFilter !== undefined) body['qdb_filter'] = data.branchFilter || null;
  return body;
}

/** Concurrency columns for an outcome write. */
export function buildOutcomeConcurrencyBody(data: Partial<WorkflowOutcome>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (data.checkParallelTasks !== undefined) body['qdb_checkparalleltasks'] = data.checkParallelTasks;
  if (data.updateParallelTaskRef !== undefined) body['qdb_updateparalleltaskref'] = data.updateParallelTaskRef;
  return body;
}

/**
 * The `{navProp}@odata.bind` patch for the parent-step lookup: binds the parent,
 * or clears it with an explicit null when the step is no longer a branch.
 */
export async function buildParentStepBindPatch(
  data: Partial<WorkflowStep>,
  resolveNavProp: (entity: string, attribute: string) => Promise<string>,
  entity: string,
  stepSet: string
): Promise<Record<string, string | null>> {
  if (data.parentStepId === undefined) return {};
  const nav = await resolveNavProp(entity, 'qdb_parentworkitemstep');
  if (!nav) return {};
  return {
    [`${nav}@odata.bind`]: data.parentStepId ? `/${stepSet}(${data.parentStepId})` : null,
  };
}

/** True when this step runs as a concurrent branch of another. */
export function isBranchStep(step: Pick<BranchFields, 'parentStepId'>): boolean {
  return Boolean(step.parentStepId);
}

/** The branch children of a given step, in sequence order. */
export function branchChildrenOf(
  parentStepId: string,
  steps: Record<string, Pick<WorkflowStep, 'crmId' | 'parentStepId' | 'sequenceNo'>>
): string[] {
  return Object.values(steps)
    .filter((step) => step.parentStepId === parentStepId)
    .sort((a, b) => a.sequenceNo - b.sequenceNo)
    .map((step) => step.crmId);
}

const BRANCH_BADGE = 'BRANCH';
const CONDITIONAL_BRANCH_BADGE = 'BRANCH · IF';

/**
 * Short canvas badge for a step's concurrency role, or null for an ordinary step.
 * Text carries the meaning, not colour, so the notation survives greyscale export.
 */
export function branchSummaryText(step: Pick<WorkflowStep, 'parentStepId' | 'applyBranchFilter'>): string | null {
  if (!step.parentStepId) return null;
  return step.applyBranchFilter ? CONDITIONAL_BRANCH_BADGE : BRANCH_BADGE;
}

/** Badge for a step that fans out concurrent branches. */
export function fanOutSummaryText(childCount: number): string | null {
  return childCount > 0 ? `⧉ ${childCount} CONCURRENT` : null;
}

/** The branch columns to request in a getSteps `$select`. */
export const BRANCH_SELECT_COLUMNS = [
  '_qdb_parentworkitemstep_value',
  'qdb_applyfilter',
  'qdb_filter',
].join(',');

/** The concurrency columns to request in a getOutcomes `$select`. */
export const OUTCOME_CONCURRENCY_SELECT_COLUMNS = [
  'qdb_checkparalleltasks',
  'qdb_updateparalleltaskref',
].join(',');
