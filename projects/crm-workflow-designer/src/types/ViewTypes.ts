export interface CrmProcess {
  id: string;
  name: string;
  recordEntityId: string | null;
  recordEntityName: string | null;
  regardingFieldId: string | null;
  regardingFieldName: string | null;
  parentEntityId: string | null;
  parentEntityName: string | null;
}

export interface CrmStep {
  id: string;
  name: string;
  sequenceNo: number;
  schemaName: string;
  taskSubject: string;
  taskDescription: string;
  assignToCode: number;
  enableRoundRobin: boolean;
  assignedUserId: string | null;
  assignedUserName: string | null;
  teamId: string | null;
  teamName: string | null;
  roundRobinTeamId: string | null;
  roundRobinTeamName: string | null;
  recordEntityId: string | null;
  recordEntityName: string | null;
  regardingFieldId: string | null;
  regardingFieldName: string | null;
  parentEntityId: string | null;
  parentEntityName: string | null;
  processId: string;
}

export interface CrmOutcome {
  id: string;
  name: string;
  sequenceNumber: number;
  applyFilter: boolean;
  stepId: string;           // parent step (_qdb_workitemstep_value)
  stepName: string | null;
  nextStepId: string | null;   // next step (_qdb_nextworkitemstep_value)
  nextStepName: string | null;
}

export interface CrmRoute {
  id: string;
  name: string;
  subject: string;
  sequenceNumber: number;
  nextStepId: string | null;
  nextStepName: string | null;
  filter: string;
  outcomeId: string;
}

export interface WorkflowData {
  process: CrmProcess;
  steps: CrmStep[];
  outcomes: CrmOutcome[];
  routes: CrmRoute[];
}

export function getAssignToLabel(code: number): string {
  if (code === 100000001) return 'Team';
  if (code === 100000002) return 'Round Robin';
  return 'Specific User';
}

export class WorkflowDataError extends Error {
  readonly statusCode?: number;
  readonly endpoint?: string;

  constructor(message: string, statusCode?: number, endpoint?: string) {
    super(message);
    this.name = 'WorkflowDataError';
    this.statusCode = statusCode;
    this.endpoint = endpoint;
  }
}
