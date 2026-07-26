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

/**
 * SLA/escalation config fields — shared by process steps (WorkflowStep) and SOP
 * template steps (SopStep). Config-only; consumed by the future CWFD-005 runtime,
 * inert until then. All nullable; slaEnabled defaults to false.
 */
export interface SlaFields {
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

// --- Control flow: parallel (AND) gateway (DP-1) ---

/** How a step's outcomes relate to each other when the step completes. */
export type SplitType = 'Exclusive' | 'Parallel';

/** Whether a step waits for its inbound branches before it starts. */
export type JoinType = 'None' | 'AndJoin';

/**
 * Explicit control-flow semantics for a process step. Before DP-1 the model
 * carried no gateway concept at all and exclusive choice was implied by
 * convention, so `Exclusive`/`None` are both the defaults and the meaning every
 * pre-DP-1 step keeps. Design-time configuration only — concurrency is enforced
 * by the future CWFD-005 runtime, and a process using it cannot be published
 * until then.
 */
export interface ControlFlowFields {
  splitType: SplitType;
  joinType: JoinType;
}

export interface WorkflowStep extends SlaFields, ControlFlowFields {
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

// --- Control-flow option-set codes (DP-1) ---
// Global Dataverse option sets: qdb_SplitType, qdb_JoinType.
// Code 100000002 is deliberately unallocated in both sets — reserved for the
// inclusive (OR) split and the quorum join, which DP-1 does not build. See
// ADR-1-001: leaving the number free keeps that extension additive, while not
// creating the value keeps a maker from selecting a semantic nothing implements.

export const SPLIT_TYPE_CODES: Record<SplitType, number> = {
  Exclusive: 100000000,
  Parallel: 100000001,
};

export const JOIN_TYPE_CODES: Record<JoinType, number> = {
  None: 100000000,
  AndJoin: 100000001,
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

export const SPLIT_TYPE_FROM_CODE = invertCodeMap(SPLIT_TYPE_CODES);
export const JOIN_TYPE_FROM_CODE = invertCodeMap(JOIN_TYPE_CODES);
