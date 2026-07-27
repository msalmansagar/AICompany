import { ODATA_FORMATTED_VALUE_ANNOTATION as FMT } from './escalationFields';

// DP-5 — the engine's workflow hooks, surfaced.
//
// The process engine already calls a Dataverse workflow at defined points in a
// task's life. `WorkItemStepHandler.CallWorkflow` issues an
// `ExecuteWorkflowRequest(WorkflowId, EntityId)` against the task record, and
// `OnTaskCreate` / `OnTaskCompletePostActivities` invoke it at every scope below.
//
// Nothing here is new behaviour. The columns, the invocation and the ordering all
// already exist; DP-5 gives makers a way to set them without editing Dataverse.

/** Where in a task's life a workflow runs. */
export type WorkflowHookKind =
  | 'onTaskCreation'
  | 'onTaskCompletion'
  | 'onTaskOnHold'
  | 'onApplicationCreation';

/** One configured hook: the workflow to run, or null. */
export interface WorkflowHook {
  workflowId: string | null;
  workflowName: string | null;
}

/** A record's configured hooks, keyed by when they fire. */
export type WorkflowHooks = { [K in WorkflowHookKind]?: WorkflowHook };

/** A workflow a maker can pick. */
export interface CallableWorkflowOption {
  id: string;
  name: string;
  /** The table the workflow is written against — it must match the task's table. */
  primaryEntity: string;
}

/** The Dataverse column behind each hook. Identical across all four entities. */
const HOOK_COLUMN: Record<WorkflowHookKind, string> = {
  onTaskCreation: 'qdb_callworkflowontaskcreation',
  onTaskCompletion: 'qdb_callworkflowontaskcompletion',
  onTaskOnHold: 'qdb_callworkflowontaskonhold',
  onApplicationCreation: 'qdb_callworkflowonapplicationcreation',
};

/** Which hooks each entity actually carries — asked of the org, not assumed. */
export const STEP_HOOKS: WorkflowHookKind[] = ['onTaskCreation', 'onTaskCompletion', 'onTaskOnHold'];
export const OUTCOME_HOOKS: WorkflowHookKind[] = ['onTaskCreation', 'onTaskCompletion'];
export const ROUTE_HOOKS: WorkflowHookKind[] = ['onTaskCreation', 'onTaskCompletion'];
export const PROCESS_HOOKS: WorkflowHookKind[] = [
  'onTaskCreation',
  'onTaskCompletion',
  'onApplicationCreation',
];

/** Human wording for each hook, in the maker's terms rather than the column's. */
export const HOOK_LABELS: Record<WorkflowHookKind, string> = {
  onTaskCreation: 'When the task is created',
  onTaskCompletion: 'When the task is completed',
  onTaskOnHold: 'When the task is put on hold',
  onApplicationCreation: 'When the application is created',
};

export function hookColumn(kind: WorkflowHookKind): string {
  return HOOK_COLUMN[kind];
}

/** No hooks configured. */
export function emptyWorkflowHooks(kinds: WorkflowHookKind[]): WorkflowHooks {
  return Object.fromEntries(kinds.map((kind) => [kind, { workflowId: null, workflowName: null }]));
}

/** Reads the configured hooks off a raw Dataverse row. */
export function mapWorkflowHooks(raw: Record<string, unknown>, kinds: WorkflowHookKind[]): WorkflowHooks {
  return Object.fromEntries(
    kinds.map((kind) => {
      const column = HOOK_COLUMN[kind];
      return [
        kind,
        {
          workflowId: (raw[`_${column}_value`] as string | null) ?? null,
          workflowName: (raw[`_${column}_value${FMT}`] as string | null) ?? null,
        },
      ];
    })
  );
}

/**
 * `{navProp}@odata.bind` patches for the hooks present in `hooks`. A hook set to
 * null clears through its navigation property — the only way to clear a Dataverse
 * lookup.
 */
export async function buildWorkflowHookBindPatches(
  hooks: WorkflowHooks | undefined,
  resolveNavProp: (entity: string, attribute: string) => Promise<string>,
  entity: string,
  workflowSet: string
): Promise<Record<string, string | null>> {
  if (!hooks) return {};
  const patches: Record<string, string | null> = {};
  for (const [kind, hook] of Object.entries(hooks) as [WorkflowHookKind, WorkflowHook][]) {
    if (!hook) continue;
    const nav = await resolveNavProp(entity, HOOK_COLUMN[kind]);
    if (!nav) continue;
    patches[`${nav}@odata.bind`] = hook.workflowId ? `/${workflowSet}(${hook.workflowId})` : null;
  }
  return patches;
}

/** The hook columns to request in a `$select`. */
export function hookSelectColumns(kinds: WorkflowHookKind[]): string {
  return kinds.map((kind) => `_${HOOK_COLUMN[kind]}_value`).join(',');
}

/** How many hooks are configured — drives the "3 workflows" badge. */
export function configuredHookCount(hooks: WorkflowHooks | undefined): number {
  if (!hooks) return 0;
  return Object.values(hooks).filter((hook) => hook?.workflowId).length;
}

/** Short badge text, or null when nothing is hooked up. */
export function workflowHookSummary(hooks: WorkflowHooks | undefined): string | null {
  const count = configuredHookCount(hooks);
  if (count === 0) return null;
  return count === 1 ? '1 workflow' : `${count} workflows`;
}

/** The Dataverse entity set for workflows. */
export const WORKFLOW_SET = 'workflows';

/**
 * Maps a workflow row to a picker option. Only activated, on-demand classic
 * workflows are offered: `ExecuteWorkflowRequest` is exactly what the "run
 * on demand" flag governs, so anything else would fail at runtime.
 */
export function mapCallableWorkflow(raw: Record<string, unknown>): CallableWorkflowOption {
  return {
    id: (raw['workflowid'] as string) ?? '',
    name: (raw['name'] as string) ?? '',
    primaryEntity: (raw['primaryentity'] as string) ?? '',
  };
}

/** `$filter` selecting workflows the engine can actually execute. */
export const CALLABLE_WORKFLOW_QUERY =
  'workflows?$select=workflowid,name,primaryentity' +
  '&$filter=category eq 0 and statecode eq 1 and ondemand eq true' +
  '&$orderby=name asc&$top=250';
