import type { CallableActionOption, CallableWorkflowOption } from './workflowHooks';
import type {
  WorkflowProcess,
  WorkflowStep,
  WorkflowOutcome,
  WorkflowRoute,
  EntityOption,
  AttributeOption,
  UserOption,
  TeamOption,
  EscalationConfigOption,
  AutoNumberEntityOption,
  AutoNumberFieldOption,
} from '@/types/WorkflowTypes';

export interface AttributeMeta {
  logicalName: string;
  displayName: string;
  attributeType: string;
}

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
  getAttributesMeta(entityLogicalName: string): Promise<AttributeMeta[]>;
  getOptionSetLabels(entityLogicalName: string, attributeLogicalName: string): Promise<Map<number, string>>;
  getUsers(search?: string): Promise<UserOption[]>;
  getTeams(): Promise<TeamOption[]>;
  getRoundRobinTeams(): Promise<TeamOption[]>;
  /** Escalation configurations a step can follow (CWFD-005). */
  getEscalationConfigs(): Promise<EscalationConfigOption[]>;
  /** Workflows the engine can execute on demand (DP-5). */
  getCallableWorkflows(): Promise<CallableWorkflowOption[]>;
  /** Actions on the task table the engine can send as a message — the on-hold hook (DP-3). */
  getCallableTaskActions(): Promise<CallableActionOption[]>;
  getAutoNumberEntities(): Promise<AutoNumberEntityOption[]>;
  getAutoNumberEntityFields(entityId?: string): Promise<AutoNumberFieldOption[]>;

  // Workflow lifecycle
  publishProcess(id: string): Promise<void>;
  cloneProcess(id: string): Promise<string>;

  // Audit
  logAuditEntry(entry: AuditLogEntry): Promise<void>;
}

export interface AuditLogEntry {
  action: string;
  entityId: string;
  detail: string | undefined;
  timestamp: string;
}
