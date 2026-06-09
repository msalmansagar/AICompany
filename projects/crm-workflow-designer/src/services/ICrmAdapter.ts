import type {
  WorkflowProcess,
  WorkflowStep,
  WorkflowOutcome,
  WorkflowRoute,
  EntityOption,
  AttributeOption,
  UserOption,
  TeamOption,
  AutoNumberEntityOption,
  AutoNumberFieldOption,
} from '@/types/WorkflowTypes';

export interface ICrmAdapter {
  // Process (qdb_work_item_record_type)
  getProcessList(): Promise<WorkflowProcess[]>;
  getProcess(id: string): Promise<WorkflowProcess>;
  createProcess(data: Omit<WorkflowProcess, 'crmId'>): Promise<string>;
  updateProcess(id: string, data: Partial<Omit<WorkflowProcess, 'crmId'>>): Promise<void>;
  deleteProcess(id: string): Promise<void>;

  // Steps (qdb_work_item_steps)
  getSteps(processId: string): Promise<WorkflowStep[]>;
  createStep(data: Omit<WorkflowStep, 'crmId'>): Promise<string>;
  updateStep(id: string, data: Partial<Omit<WorkflowStep, 'crmId'>>): Promise<void>;
  deleteStep(id: string): Promise<void>;

  // Outcomes (qdb_outcome)
  getOutcomes(stepId: string): Promise<WorkflowOutcome[]>;
  createOutcome(data: Omit<WorkflowOutcome, 'crmId'>): Promise<string>;
  updateOutcome(id: string, data: Partial<Omit<WorkflowOutcome, 'crmId'>>): Promise<void>;
  deleteOutcome(id: string): Promise<void>;

  // Routes (qdb_outcomeworktasks)
  getRoutes(outcomeId: string): Promise<WorkflowRoute[]>;
  createRoute(data: Omit<WorkflowRoute, 'crmId'>): Promise<string>;
  updateRoute(id: string, data: Partial<Omit<WorkflowRoute, 'crmId'>>): Promise<void>;
  deleteRoute(id: string): Promise<void>;

  // Metadata lookups
  getEntities(): Promise<EntityOption[]>;
  getAttributes(entityLogicalName: string): Promise<AttributeOption[]>;
  getUsers(search?: string): Promise<UserOption[]>;
  getTeams(): Promise<TeamOption[]>;
  getRoundRobinTeams(): Promise<TeamOption[]>;
  getAutoNumberEntities(): Promise<AutoNumberEntityOption[]>;
  getAutoNumberEntityFields(entityId?: string): Promise<AutoNumberFieldOption[]>;

  // Workflow lifecycle
  publishProcess(id: string): Promise<void>;
  cloneProcess(id: string): Promise<string>;
}
