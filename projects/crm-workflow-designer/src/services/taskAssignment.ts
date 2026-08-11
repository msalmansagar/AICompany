import type { AssignToType, AssignmentFields, WorkflowStep } from '@/types/WorkflowTypes';
import { ODATA_FORMATTED_VALUE_ANNOTATION as FMT } from './escalationFields';

// DP-3 — how the engine decides who owns a task.
//
// `QDB.RoundRobin.Plugins.RoundRobin` is registered sync on Create of `qdb_task`
// and resolves the owner from the step the task came from:
//
//     mode = step.qdb_enableroundrobin ? APPLY_ROUND_ROBIN : step.qdb_task_assign_to
//
// then, per mode, sets `ownerid` from `qdb_assigned_user`, `qdb_team`,
// `qdb_roundrobinteam`, or a field read off the task's parent record. The same
// five-way switch runs at process scope in `Plugins.AttachProcess`, against
// `qdb_work_item_record_type.qdb_assign_to`.
//
// Two of the org's six option values are deliberately absent from AssignToType:
//
//   - Queue (100000001) — the engine's branch traces the queue and returns
//     WITHOUT setting an owner, at both step and process scope. Offering it would
//     produce a task nobody owns.
//   - NA (100000005) — no branch at all; the switch falls through to
//     "Task Assignment is not proper defined".
//
// Neither is a designer surface until the engine assigns for them.

/** How the engine picks a task's owner. Only modes the engine actually resolves. */
export type { AssignToType };

/** The org's own `qdb_task_assign_to` values, read from its option set metadata. */
export const ASSIGN_TO_CODES: Record<AssignToType, number> = {
  user: 100000000,
  team: 100000002,
  readFromParent: 100000003,
  roundRobin: 100000004,
};

/**
 * Steps saved before DP-3 encoded round robin as the Team code plus
 * `qdb_enableroundrobin`. The engine honours that — it reads the flag before the
 * option set — so those rows still run correctly and must still read back as
 * round robin rather than silently becoming Team assignments.
 */
const LEGACY_ROUND_ROBIN_CODE = ASSIGN_TO_CODES.team;

/** Defaults for a freshly-built step: assigned to a user, none chosen yet. */
export function emptyAssignmentFields(): AssignmentFields {
  return {
    assignTo: 'user',
    assignedUserId: null,
    assignedUserName: null,
    teamId: null,
    teamName: null,
    roundRobinTeamId: null,
    roundRobinTeamName: null,
    parentAssignEntityId: null,
    parentAssignEntityName: null,
    parentAssignFieldId: null,
    parentAssignFieldName: null,
    parentAssignUserFieldId: null,
    parentAssignUserFieldName: null,
  };
}

/**
 * Resolves the stored mode, honouring the legacy encoding.
 * @param code the raw `qdb_task_assign_to` value
 * @param enableRoundRobin the raw `qdb_enableroundrobin` flag, which wins
 */
export function mapAssignTo(code: number | null, enableRoundRobin: boolean): AssignToType {
  if (enableRoundRobin) return 'roundRobin';
  if (code === ASSIGN_TO_CODES.roundRobin) return 'roundRobin';
  if (code === LEGACY_ROUND_ROBIN_CODE) return 'team';
  if (code === ASSIGN_TO_CODES.readFromParent) return 'readFromParent';
  return 'user';
}

/** Maps the assignment columns of a raw Dataverse step row. */
export function mapAssignmentFields(raw: Record<string, unknown>): AssignmentFields {
  return {
    assignTo: mapAssignTo(
      (raw['qdb_task_assign_to'] as number | null) ?? null,
      (raw['qdb_enableroundrobin'] as boolean) ?? false
    ),
    assignedUserId: (raw['_qdb_assigned_user_value'] as string | null) ?? null,
    assignedUserName: (raw[`_qdb_assigned_user_value${FMT}`] as string | null) ?? null,
    teamId: (raw['_qdb_team_value'] as string | null) ?? null,
    teamName: (raw[`_qdb_team_value${FMT}`] as string | null) ?? null,
    roundRobinTeamId: (raw['_qdb_roundrobinteam_value'] as string | null) ?? null,
    roundRobinTeamName: (raw[`_qdb_roundrobinteam_value${FMT}`] as string | null) ?? null,
    parentAssignEntityId: (raw['_qdb_assignto_parententity_value'] as string | null) ?? null,
    parentAssignEntityName: (raw[`_qdb_assignto_parententity_value${FMT}`] as string | null) ?? null,
    parentAssignFieldId: (raw['_qdb_assignto_parentfield_value'] as string | null) ?? null,
    parentAssignFieldName: (raw[`_qdb_assignto_parentfield_value${FMT}`] as string | null) ?? null,
    parentAssignUserFieldId: (raw['_qdb_assignto_user_mapping_value'] as string | null) ?? null,
    parentAssignUserFieldName: (raw[`_qdb_assignto_user_mapping_value${FMT}`] as string | null) ?? null,
  };
}

/**
 * Scalar assignment columns for a step write. The flag is written alongside the
 * option set because the engine reads it first; keeping the two in step means a
 * row is never ambiguous about which mode it is in.
 */
export function buildAssignmentBody(data: Partial<WorkflowStep>): Record<string, unknown> {
  if (data.assignTo === undefined) return {};
  return {
    qdb_task_assign_to: ASSIGN_TO_CODES[data.assignTo],
    qdb_enableroundrobin: data.assignTo === 'roundRobin',
  };
}

/** Every mode, for building pickers and runtime schemas from one source. */
export const ASSIGN_TO_TYPES = Object.keys(ASSIGN_TO_CODES) as [AssignToType, ...AssignToType[]];

/**
 * The chip colour each mode wears on the canvas. These have their own tokens
 * rather than borrowing the status ones: a step assigned to a team is not a
 * success, and reading the owner from a parent record is not a warning.
 */
export const ASSIGN_TO_ACCENTS: Record<AssignToType, string> = {
  user: 'var(--accent-user)',
  team: 'var(--accent-team)',
  readFromParent: 'var(--accent-parent)',
  roundRobin: 'var(--accent-roundrobin)',
};

/**
 * How each mode is named, in the org's own option-set wording, so a maker reads
 * the same words in the designer and in Dataverse.
 */
export const ASSIGN_TO_LABELS: Record<AssignToType, string> = {
  user: 'Specific User',
  team: 'Team',
  readFromParent: 'Read From Parent',
  roundRobin: 'Apply Round Robin',
};

/** The lookup column behind each mode's assignee, for binding on write. */
export const ASSIGNMENT_LOOKUP_COLUMNS = {
  assignedUser: 'qdb_assigned_user',
  team: 'qdb_team',
  roundRobinTeam: 'qdb_roundrobinteam',
  parentEntity: 'qdb_assignto_parententity',
  parentField: 'qdb_assignto_parentfield',
  parentUserField: 'qdb_assignto_user_mapping',
} as const;

/** True when the chosen mode has no assignee configured, so no owner would resolve. */
export function assigneeIsMissing(fields: AssignmentFields): boolean {
  if (fields.assignTo === 'user') return !fields.assignedUserId;
  if (fields.assignTo === 'team') return !fields.teamId;
  if (fields.assignTo === 'roundRobin') return !fields.roundRobinTeamId;
  return (
    !fields.parentAssignEntityId || !fields.parentAssignFieldId || !fields.parentAssignUserFieldId
  );
}

/** The assignment columns to request in a getSteps `$select`. */
export const ASSIGNMENT_SELECT_COLUMNS = [
  'qdb_task_assign_to',
  'qdb_enableroundrobin',
  '_qdb_assigned_user_value',
  '_qdb_team_value',
  '_qdb_roundrobinteam_value',
  '_qdb_assignto_parententity_value',
  '_qdb_assignto_parentfield_value',
  '_qdb_assignto_user_mapping_value',
].join(',');
