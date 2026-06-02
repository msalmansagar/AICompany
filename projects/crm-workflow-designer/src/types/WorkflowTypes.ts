export interface WorkflowProcess {
  crmId: string;
  name: string;
  recordEntity: string;
  regardingField: string;
  parentEntity: string;
  versionMajor: number;
  versionMinor: number;
  workflowState: 'draft' | 'published' | 'archived';
  snapshot: string | null;
}

export interface WorkflowStep {
  crmId: string;
  name: string;
  schemaName: string;
  sequenceNo: number;
  taskSubject: string;
  taskDescription: string;
  recordEntity: string;
  regardingField: string;
  parentEntity: string;
  assignTo: 'user' | 'team';
  assignedUserId: string | null;
  assignedUserName: string | null;
  teamId: string | null;
  teamName: string | null;
  enableRoundRobin: boolean;
  roundRobinTeamId: string | null;
  roundRobinTeamName: string | null;
  processId: string;
}

export interface WorkflowOutcome {
  crmId: string;
  name: string;
  sequenceNumber: number;
  applyFilter: boolean;
  stepId: string;
}

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

export const ASSIGN_TO_CODES = {
  user: 100000000,
  team: 100000002,
} as const;
