import type { WorkflowProcess } from '@/types/WorkflowTypes';

/**
 * The designer's own bookkeeping for a process: whether it has been published,
 * which version that was, and the snapshot the next publish compares against.
 *
 * None of it means anything to the engine — the engine reads steps, outcomes
 * and routes. It lives in an annotation on the process record for the same
 * reason the canvas layout does: `qdb_work_item_record_type` carries no column
 * for any of it, and adding one is a schema change that needs its own
 * go-ahead. Until then this keeps Publish honest instead of silent.
 *
 * (Before this, publish called updateProcess with only these fields —
 * buildProcessBody maps just qdb_name, so the PATCH body was empty and the
 * publish wrote nothing. Every process read back as a draft forever.)
 */
export const DESIGNER_STATE_SUBJECT = 'cwfd:designer-state';

export type WorkflowState = WorkflowProcess['workflowState'];

/** What a publisher accepted when they published over warnings (CWFD-016 B7). */
export interface WarningAcknowledgement {
  /** ISO timestamp of the publish that carried the acknowledgement. */
  at: string;
  /** How many warnings stood at that moment. */
  count: number;
  /** The rule codes accepted, deduplicated. */
  codes: string[];
}

export interface DesignerState {
  v: 1;
  workflowState: WorkflowState;
  versionMajor: number;
  versionMinor: number;
  snapshot: string | null;
  /** Absent on states written before B7, and on publishes with no warnings. */
  acknowledgedWarnings?: WarningAcknowledgement | null;
}

const VALID_STATES: readonly WorkflowState[] = ['draft', 'published', 'archived'];

export function serializeDesignerState(state: Omit<DesignerState, 'v'>): string {
  return JSON.stringify({ v: 1, ...state });
}

/** Tolerant parse: anything malformed degrades to null rather than throwing. */
export function parseDesignerState(json: string | null | undefined): DesignerState | null {
  if (!json) return null;
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    const workflowState = VALID_STATES.includes(raw.workflowState as WorkflowState)
      ? (raw.workflowState as WorkflowState)
      : 'draft';
    return {
      v: 1,
      workflowState,
      versionMajor: Number.isFinite(raw.versionMajor) ? (raw.versionMajor as number) : 1,
      versionMinor: Number.isFinite(raw.versionMinor) ? (raw.versionMinor as number) : 0,
      snapshot: typeof raw.snapshot === 'string' ? raw.snapshot : null,
      acknowledgedWarnings: parseAcknowledgement(raw.acknowledgedWarnings),
    };
  } catch {
    return null;
  }
}

/** Tolerant read of the acknowledgement block; anything odd reads as absent. */
function parseAcknowledgement(raw: unknown): WarningAcknowledgement | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.at !== 'string') return null;
  return {
    at: value.at,
    count: Number.isFinite(value.count) ? (value.count as number) : 0,
    codes: Array.isArray(value.codes) ? value.codes.filter((c): c is string => typeof c === 'string') : [],
  };
}

/** Applies a stored state onto a freshly-mapped process, if there is one. */
export function withDesignerState(
  process: WorkflowProcess,
  state: DesignerState | null
): WorkflowProcess {
  if (!state) return process;
  return {
    ...process,
    workflowState: state.workflowState,
    versionMajor: state.versionMajor,
    versionMinor: state.versionMinor,
    snapshot: state.snapshot,
  };
}
