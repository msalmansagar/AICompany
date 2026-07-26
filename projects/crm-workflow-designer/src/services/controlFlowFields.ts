import type { WorkflowStep, ControlFlowFields, SplitType, JoinType } from '@/types/WorkflowTypes';
import {
  SPLIT_TYPE_CODES,
  SPLIT_TYPE_FROM_CODE,
  JOIN_TYPE_CODES,
  JOIN_TYPE_FROM_CODE,
} from '@/types/WorkflowTypes';

// Shared control-flow (DP-1 parallel gateway) field mapping used by BOTH adapters.
// Same single-source-of-truth shape as slaStepFields.ts, for the same reason: two
// adapters writing the same columns independently is how they drift apart.

/** Defaults for a freshly-built step: exclusive choice, no wait — today's behaviour. */
export function emptyControlFlowFields(): ControlFlowFields {
  return { splitType: 'Exclusive', joinType: 'None' };
}

/**
 * One-time copy of the control-flow semantics from a source step. Used when a
 * process is derived from a SOP template. SOP steps carry no control-flow config
 * of their own in DP-1 (that is DP-1b), so this currently copies defaults —
 * it exists so the derivation path has one obvious place to change.
 */
export function copyControlFlowFields(source: Partial<ControlFlowFields>): ControlFlowFields {
  return {
    splitType: source.splitType ?? 'Exclusive',
    joinType: source.joinType ?? 'None',
  };
}

/**
 * Maps the control-flow columns of a raw Dataverse step row to typed fields.
 * A null, absent or unrecognised code reads back as Exclusive/None, so steps
 * created before DP-1 — and any org where the columns are not yet provisioned —
 * keep exactly the behaviour they have today.
 */
export function mapControlFlowFields(raw: Record<string, unknown>): ControlFlowFields {
  return {
    splitType: fromCode(SPLIT_TYPE_FROM_CODE, raw['qdb_splittype']) ?? 'Exclusive',
    joinType: fromCode(JOIN_TYPE_FROM_CODE, raw['qdb_jointype']) ?? 'None',
  };
}

/**
 * Builds the control-flow columns for a step write body. Returns `{}` when the
 * write does not touch control flow at all, so a partial update of unrelated
 * fields never rewrites the semantics.
 */
export function buildControlFlowBody(data: Partial<WorkflowStep>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (data.splitType !== undefined) body['qdb_splittype'] = SPLIT_TYPE_CODES[data.splitType];
  if (data.joinType !== undefined) body['qdb_jointype'] = JOIN_TYPE_CODES[data.joinType];
  return body;
}

/** True when the step declares any non-default control flow. */
export function hasParallelControlFlow(step: Partial<ControlFlowFields>): boolean {
  return step.splitType === 'Parallel' || step.joinType === 'AndJoin';
}

/** True when any step in the process declares parallel control flow. */
export function processUsesParallelFlow(steps: Partial<ControlFlowFields>[]): boolean {
  return steps.some(hasParallelControlFlow);
}

const SPLIT_BADGE_LABEL = 'ALL';
const JOIN_BADGE_LABEL = 'WAIT ALL';

/**
 * Short canvas badge text for a step's control flow, or null when the step is a
 * plain exclusive step. Text — not colour — is what carries the meaning here
 * (NFR-009), so the badge stays readable in greyscale and to colour-blind users.
 */
export function controlFlowSummaryText(step: Partial<ControlFlowFields>): string | null {
  const parts: string[] = [];
  if (step.splitType === 'Parallel') parts.push(SPLIT_BADGE_LABEL);
  if (step.joinType === 'AndJoin') parts.push(JOIN_BADGE_LABEL);
  return parts.length > 0 ? parts.join(' · ') : null;
}

const SPLIT_DESCRIPTION = 'Runs all of its branches at the same time';
const JOIN_DESCRIPTION = 'Waits for all incoming branches before it starts';

/**
 * The badge spelled out, for a tooltip. "ALL" is compact enough to fit on a node
 * but not self-explanatory, so the full sentence has to be reachable on hover.
 */
export function controlFlowDescription(step: Partial<ControlFlowFields>): string | null {
  const parts: string[] = [];
  if (step.splitType === 'Parallel') parts.push(SPLIT_DESCRIPTION);
  if (step.joinType === 'AndJoin') parts.push(JOIN_DESCRIPTION);
  return parts.length > 0 ? parts.join('. ') : null;
}

/** The control-flow columns to request in a getSteps `$select`. */
export const CONTROL_FLOW_SELECT_COLUMNS = ['qdb_splittype', 'qdb_jointype'].join(',');

function fromCode<T extends string>(map: Record<number, T>, raw: unknown): T | null {
  return typeof raw === 'number' ? map[raw] ?? null : null;
}

// Re-exported so callers that only deal with control flow do not have to reach
// into WorkflowTypes for the unions.
export type { SplitType, JoinType };
