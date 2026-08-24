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

export interface DesignerState {
  v: 1;
  workflowState: WorkflowState;
  versionMajor: number;
  versionMinor: number;
  snapshot: string | null;
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
    };
  } catch {
    return null;
  }
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
