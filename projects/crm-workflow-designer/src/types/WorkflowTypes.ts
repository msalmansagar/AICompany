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
}

export interface AutoNumberEntityOption {
  id: string;
  name: string;
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
  nextStepId: string;
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
