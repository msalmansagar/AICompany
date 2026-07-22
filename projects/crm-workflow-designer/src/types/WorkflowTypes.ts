export interface WorkflowProcess {
  crmId: string;
  name: string;
  recordEntity: string;
  recordEntityName: string | null;
  regardingField: string;
  parentEntity: string;
  parentEntityName: string | null;
  versionMajor: number;
  versionMinor: number;
  workflowState: 'draft' | 'published' | 'archived';
  snapshot: string | null;
  /** ID of the qdb_sop this process was derived from. Only set on SOP-derived processes. */
  sopId?: string | null;
}

export type AssignToType = 'user' | 'team' | 'roundRobin';

// --- SLA & escalation configuration (DP-2) ---
export type SlaDurationUnit = 'Hours' | 'CalendarDays' | 'BusinessDays';
export type SlaBasis = 'TaskCreated' | 'TaskAssigned' | 'PreviousStepCompleted';
export type EscalationAction = 'Reassign' | 'Notify' | 'Flag' | 'ReassignAndNotify';
export type EscalationTargetType = 'SpecificUser' | 'SpecificTeam' | 'ManagerOfAssignee' | 'Role';

export interface WorkflowStep {
  crmId: string;
  name: string;
  schemaName: string;
  sequenceNo: number;
  taskSubject: string;
  taskDescription: string;
  recordEntityId: string | null;
  recordEntityName: string | null;
  regardingFieldId: string | null;
  regardingFieldName: string | null;
  parentEntityId: string | null;
  parentEntityName: string | null;
  assignTo: AssignToType;
  assignedUserId: string | null;
  assignedUserName: string | null;
  teamId: string | null;
  teamName: string | null;
  roundRobinTeamId: string | null;
  roundRobinTeamName: string | null;
  processId: string;

  // SLA & escalation config (DP-2). Config-only — consumed by the future CWFD-005
  // runtime; inert until then. All nullable; slaEnabled defaults to false.
  slaEnabled: boolean;
  slaDuration: number | null;
  slaDurationUnit: SlaDurationUnit | null;
  slaBasis: SlaBasis | null;
  slaWarningPct: number | null;
  escalationEnabled: boolean;
  escalationAction: EscalationAction | null;
  escalationTargetType: EscalationTargetType | null;
  escalationUserId: string | null;
  escalationUserName: string | null;
  escalationTeamId: string | null;
  escalationTeamName: string | null;
  escalationRoleId: string | null;
  escalationRoleName: string | null;
}

export interface AutoNumberEntityOption {
  id: string;
  name: string;
  logicalName: string;
  objectTypeCode: number;
}

export interface AutoNumberFieldOption {
  id: string;
  name: string;
  entityId: string;
}

export interface WorkflowOutcome {
  crmId: string;
  name: string;
  sequenceNumber: number;
  applyFilter: boolean;
  stepId: string;
  nextStepId: string | null;
}

export type RoundRobinTeamOption = TeamOption;

export interface WorkflowRoute {
  crmId: string;
  name: string;
  subject: string;
  sequenceNumber: number;
  filter: string;
  outcomeId: string;
  nextStepId: string | null;
}

export interface EntityOption {
  logicalName: string;
  displayName: string;
  objectTypeCode: number;
}

export interface AttributeOption {
  schemaName: string;
  displayName: string;
  attributeType: string;
}

export interface UserOption {
  id: string;
  fullName: string;
  domainName: string;
}

export interface TeamOption {
  id: string;
  name: string;
}

export type WorkflowStateCode = 'draft' | 'published' | 'archived';

export const WORKFLOW_STATE_CODES: Record<WorkflowStateCode, number> = {
  draft: 100000000,
  published: 100000001,
  archived: 100000002,
};

// Round Robin uses the same OptionSet value as Team (100000002) + qdb_enableroundrobin = true
export const ASSIGN_TO_CODES: Record<AssignToType, number> = {
  user: 100000000,
  roundRobin: 100000002,
  team: 100000002,
};

// --- SLA & escalation option-set codes (DP-2) ---
// Global Dataverse option sets: qdb_SLADurationUnit, qdb_SLABasis,
// qdb_EscalationAction, qdb_EscalationTargetType.

export const SLA_DURATION_UNIT_CODES: Record<SlaDurationUnit, number> = {
  Hours: 100000000,
  CalendarDays: 100000001,
  BusinessDays: 100000002,
};

export const SLA_BASIS_CODES: Record<SlaBasis, number> = {
  TaskCreated: 100000000,
  TaskAssigned: 100000001,
  PreviousStepCompleted: 100000002,
};

export const ESCALATION_ACTION_CODES: Record<EscalationAction, number> = {
  Reassign: 100000000,
  Notify: 100000001,
  Flag: 100000002,
  ReassignAndNotify: 100000003,
};

export const ESCALATION_TARGET_TYPE_CODES: Record<EscalationTargetType, number> = {
  SpecificUser: 100000000,
  SpecificTeam: 100000001,
  ManagerOfAssignee: 100000002,
  Role: 100000003,
};

/** Inverts a code map. Safe only for maps with unique integer codes. */
function invertCodeMap<T extends string>(map: Record<T, number>): Record<number, T> {
  return Object.fromEntries(
    Object.entries(map).map(([key, code]) => [code as number, key as T])
  ) as Record<number, T>;
}

export const SLA_DURATION_UNIT_FROM_CODE = invertCodeMap(SLA_DURATION_UNIT_CODES);
export const SLA_BASIS_FROM_CODE = invertCodeMap(SLA_BASIS_CODES);
export const ESCALATION_ACTION_FROM_CODE = invertCodeMap(ESCALATION_ACTION_CODES);
export const ESCALATION_TARGET_TYPE_FROM_CODE = invertCodeMap(ESCALATION_TARGET_TYPE_CODES);
