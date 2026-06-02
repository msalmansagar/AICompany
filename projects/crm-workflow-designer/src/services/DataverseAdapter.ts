import type { ICrmAdapter } from './ICrmAdapter';
import type { CrmEnvironmentService } from './CrmEnvironmentService';
import { assertGuid } from './assertGuid';
import { withRetry } from './withRetry';
import { WORKFLOW_STATE_CODES, ASSIGN_TO_CODES } from '@/types/WorkflowTypes';
import type {
  WorkflowProcess,
  WorkflowStep,
  WorkflowOutcome,
  WorkflowRoute,
  EntityOption,
  AttributeOption,
  UserOption,
  TeamOption,
} from '@/types/WorkflowTypes';
import type { RawEntityMetadata, RawAttributeMetadata } from '@/types/CrmTypes';

const ENTITY_SETS = {
  process: 'qdb_work_item_record_types',
  step: 'qdb_work_item_stepses',
  outcome: 'qdb_outcomes',
  route: 'qdb_outcomeworktaskses',
} as const;

export class DataverseAdapter implements ICrmAdapter {
  private readonly env: CrmEnvironmentService;

  constructor(env: CrmEnvironmentService) {
    this.env = env;
  }

  // --- Process ---

  async getProcessList(): Promise<WorkflowProcess[]> {
    try {
      const result = await withRetry(() =>
        Xrm.WebApi.retrieveMultipleRecords(
          ENTITY_SETS.process,
          '?$select=qdb_work_item_record_typeid,qdb_name&$top=50&$orderby=qdb_name asc'
        )
      );
      return result.entities.map(mapProcess);
    } catch (err) {
      console.error('[DataverseAdapter] getProcessList failed:', err);
      throw err;
    }
  }

  async getProcess(id: string): Promise<WorkflowProcess> {
    assertGuid(id, 'processId');
    const raw = await withRetry(() =>
      Xrm.WebApi.retrieveRecord(
        ENTITY_SETS.process,
        id,
        '?$select=qdb_work_item_record_typeid,qdb_name'
      )
    );
    return mapProcess(raw);
  }

  async createProcess(data: Omit<WorkflowProcess, 'crmId'>): Promise<string> {
    const body = buildProcessBody(data);
    const result = await withRetry(() =>
      Xrm.WebApi.createRecord(ENTITY_SETS.process, body)
    );
    return result.id;
  }

  async updateProcess(id: string, data: Partial<Omit<WorkflowProcess, 'crmId'>>): Promise<void> {
    assertGuid(id, 'processId');
    const body = buildProcessBody(data as Omit<WorkflowProcess, 'crmId'>);
    await withRetry(() => Xrm.WebApi.updateRecord(ENTITY_SETS.process, id, body));
  }

  async deleteProcess(id: string): Promise<void> {
    assertGuid(id, 'processId');
    await withRetry(() => Xrm.WebApi.deleteRecord(ENTITY_SETS.process, id));
  }

  // --- Steps ---

  async getSteps(processId: string): Promise<WorkflowStep[]> {
    assertGuid(processId, 'processId');
    const result = await withRetry(() =>
      Xrm.WebApi.retrieveMultipleRecords(
        ENTITY_SETS.step,
        `?$select=qdb_work_item_stepsid,qdb_name,qdb_sequenceno,qdb_tasksubject,qdb_taskdescription,qdb_task_assign_to,qdb_enableroundrobin,_qdb_assigned_user_value,_qdb_assigned_user_name,_qdb_team_value,_qdb_team_name,_qdb_roundrobinteam_value,_qdb_roundrobinteam_name&$filter=_qdb_record_type_value eq ${processId}`
      )
    );
    return result.entities.map(mapStep);
  }

  async createStep(data: Omit<WorkflowStep, 'crmId'>): Promise<string> {
    assertGuid(data.processId, 'processId');
    const body = buildStepBody(data);
    const result = await withRetry(() => Xrm.WebApi.createRecord(ENTITY_SETS.step, body));
    return result.id;
  }

  async updateStep(id: string, data: Partial<Omit<WorkflowStep, 'crmId'>>): Promise<void> {
    assertGuid(id, 'stepId');
    const body = buildStepBody(data as Omit<WorkflowStep, 'crmId'>);
    await withRetry(() => Xrm.WebApi.updateRecord(ENTITY_SETS.step, id, body));
  }

  async deleteStep(id: string): Promise<void> {
    assertGuid(id, 'stepId');
    await withRetry(() => Xrm.WebApi.deleteRecord(ENTITY_SETS.step, id));
  }

  // --- Outcomes ---

  async getOutcomes(stepId: string): Promise<WorkflowOutcome[]> {
    assertGuid(stepId, 'stepId');
    const result = await withRetry(() =>
      Xrm.WebApi.retrieveMultipleRecords(
        ENTITY_SETS.outcome,
        `?$select=qdb_outcomeid,qdb_name,qdb_sequencenumber,qdb_applyfilter,_qdb_workitemstep_value&$filter=_qdb_workitemstep_value eq ${stepId}`
      )
    );
    return result.entities.map(mapOutcome);
  }

  async createOutcome(data: Omit<WorkflowOutcome, 'crmId'>): Promise<string> {
    assertGuid(data.stepId, 'stepId');
    const body = buildOutcomeBody(data);
    const result = await withRetry(() => Xrm.WebApi.createRecord(ENTITY_SETS.outcome, body));
    return result.id;
  }

  async updateOutcome(id: string, data: Partial<Omit<WorkflowOutcome, 'crmId'>>): Promise<void> {
    assertGuid(id, 'outcomeId');
    const body = buildOutcomeBody(data as Omit<WorkflowOutcome, 'crmId'>);
    await withRetry(() => Xrm.WebApi.updateRecord(ENTITY_SETS.outcome, id, body));
  }

  async deleteOutcome(id: string): Promise<void> {
    assertGuid(id, 'outcomeId');
    await withRetry(() => Xrm.WebApi.deleteRecord(ENTITY_SETS.outcome, id));
  }

  // --- Routes ---

  async getRoutes(outcomeId: string): Promise<WorkflowRoute[]> {
    assertGuid(outcomeId, 'outcomeId');
    const result = await withRetry(() =>
      Xrm.WebApi.retrieveMultipleRecords(
        ENTITY_SETS.route,
        `?$select=qdb_outcomeworktasksid,qdb_name,qdb_subject,qdb_sequencenumber,qdb_filter,_qdb_outcome_value,_qdb_nextworkitemstep_value&$filter=_qdb_outcome_value eq ${outcomeId}`
      )
    );
    return result.entities.map(mapRoute);
  }

  async createRoute(data: Omit<WorkflowRoute, 'crmId'>): Promise<string> {
    assertGuid(data.outcomeId, 'outcomeId');
    assertGuid(data.nextStepId, 'nextStepId');
    const body = buildRouteBody(data);
    const result = await withRetry(() => Xrm.WebApi.createRecord(ENTITY_SETS.route, body));
    return result.id;
  }

  async updateRoute(id: string, data: Partial<Omit<WorkflowRoute, 'crmId'>>): Promise<void> {
    assertGuid(id, 'routeId');
    const body = buildRouteBody(data as Omit<WorkflowRoute, 'crmId'>);
    await withRetry(() => Xrm.WebApi.updateRecord(ENTITY_SETS.route, id, body));
  }

  async deleteRoute(id: string): Promise<void> {
    assertGuid(id, 'routeId');
    await withRetry(() => Xrm.WebApi.deleteRecord(ENTITY_SETS.route, id));
  }

  // --- Metadata ---

  async getEntities(): Promise<EntityOption[]> {
    const url = `${this.env.getClientUrl()}/api/data/${this.env.getApiVersion()}/EntityDefinitions?$select=LogicalName,DisplayName,ObjectTypeCode&$filter=IsValidForAdvancedFind eq true`;
    const response = await withRetry(() =>
      fetch(url, { credentials: 'include', headers: buildODataHeaders() }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ value: RawEntityMetadata[] }>;
      })
    );
    return response.value.map((e) => ({
      logicalName: e.LogicalName,
      displayName: e.DisplayName?.UserLocalizedLabel?.Label ?? e.LogicalName,
      objectTypeCode: e.ObjectTypeCode,
    }));
  }

  async getAttributes(entityLogicalName: string): Promise<AttributeOption[]> {
    const url =
      `${this.env.getClientUrl()}/api/data/${this.env.getApiVersion()}` +
      `/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes` +
      `?$select=SchemaName,DisplayName,AttributeType&$filter=IsValidForAdvancedFind eq true`;
    const response = await withRetry(() =>
      fetch(url, { credentials: 'include', headers: buildODataHeaders() }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ value: RawAttributeMetadata[] }>;
      })
    );
    return response.value.map((a) => ({
      schemaName: a.SchemaName,
      displayName: a.DisplayName?.UserLocalizedLabel?.Label ?? a.SchemaName,
      attributeType: a.AttributeType,
    }));
  }

  async getUsers(search?: string): Promise<UserOption[]> {
    const searchFilter = search
      ? ` and (contains(fullname,'${search}') or contains(domainname,'${search}'))`
      : '';
    const result = await withRetry(() =>
      Xrm.WebApi.retrieveMultipleRecords(
        'systemusers',
        `?$select=systemuserid,fullname,domainname&$filter=isdisabled eq false${searchFilter}&$top=50&$orderby=fullname asc`
      )
    );
    return result.entities.map((u) => ({
      id: u['systemuserid'] as string,
      fullName: (u['fullname'] as string) ?? '',
      domainName: (u['domainname'] as string) ?? '',
    }));
  }

  async getTeams(): Promise<TeamOption[]> {
    const result = await withRetry(() =>
      Xrm.WebApi.retrieveMultipleRecords(
        'teams',
        '?$select=teamid,name&$top=100&$orderby=name asc'
      )
    );
    return result.entities.map((t) => ({
      id: t['teamid'] as string,
      name: (t['name'] as string) ?? '',
    }));
  }

  // --- Lifecycle ---

  async publishProcess(id: string): Promise<void> {
    assertGuid(id, 'processId');
    await withRetry(() =>
      Xrm.WebApi.updateRecord(ENTITY_SETS.process, id, {
        qdb_workflow_state: WORKFLOW_STATE_CODES.published,
      })
    );
  }

  async cloneProcess(id: string): Promise<string> {
    assertGuid(id, 'processId');
    const source = await this.getProcess(id);
    const newId = await this.createProcess({
      ...source,
      name: `${source.name} — Copy`,
      workflowState: 'draft',
      versionMajor: 1,
      versionMinor: 0,
      snapshot: null,
    });

    const steps = await this.getSteps(id);
    const stepIdMap: Record<string, string> = {};

    for (const step of steps) {
      const newStepId = await this.createStep({ ...step, processId: newId });
      stepIdMap[step.crmId] = newStepId;
    }

    for (const step of steps) {
      const outcomes = await this.getOutcomes(step.crmId);
      for (const outcome of outcomes) {
        const newOutcomeId = await this.createOutcome({
          ...outcome,
          stepId: stepIdMap[step.crmId] ?? step.crmId,
        });

        const routes = await this.getRoutes(outcome.crmId);
        for (const route of routes) {
          const mappedNextStep = stepIdMap[route.nextStepId] ?? route.nextStepId;
          await this.createRoute({
            ...route,
            outcomeId: newOutcomeId,
            nextStepId: mappedNextStep,
          });
        }
      }
    }

    return newId;
  }
}

// --- Mappers ---

function mapProcess(raw: Record<string, unknown>): WorkflowProcess {
  return {
    crmId: (raw['qdb_work_item_record_typeid'] as string) ?? '',
    name: (raw['qdb_name'] as string) ?? '',
    recordEntity: '',
    regardingField: '',
    parentEntity: '',
    versionMajor: 1,
    versionMinor: 0,
    workflowState: 'draft',
    snapshot: null,
  };
}

function mapStep(raw: Record<string, unknown>): WorkflowStep {
  const assignCode = (raw['qdb_task_assign_to'] as number) ?? 100000000;
  return {
    crmId: raw['qdb_work_item_stepsid'] as string,
    name: (raw['qdb_name'] as string) ?? '',
    schemaName: '',
    sequenceNo: (raw['qdb_sequenceno'] as number) ?? 0,
    taskSubject: (raw['qdb_tasksubject'] as string) ?? '',
    taskDescription: (raw['qdb_taskdescription'] as string) ?? '',
    recordEntity: '',
    regardingField: '',
    parentEntity: '',
    assignTo: assignCode === ASSIGN_TO_CODES.team ? 'team' : 'user',
    assignedUserId: (raw['_qdb_assigned_user_value'] as string | null) ?? null,
    assignedUserName: (raw['_qdb_assigned_user_name'] as string | null) ?? null,
    teamId: (raw['_qdb_team_value'] as string | null) ?? null,
    teamName: (raw['_qdb_team_name'] as string | null) ?? null,
    enableRoundRobin: (raw['qdb_enableroundrobin'] as boolean) ?? false,
    roundRobinTeamId: (raw['_qdb_roundrobinteam_value'] as string | null) ?? null,
    roundRobinTeamName: (raw['_qdb_roundrobinteam_name'] as string | null) ?? null,
    processId: (raw['_qdb_record_type_value'] as string) ?? '',
  };
}

function mapOutcome(raw: Record<string, unknown>): WorkflowOutcome {
  return {
    crmId: raw['qdb_outcomeid'] as string,
    name: (raw['qdb_name'] as string) ?? '',
    sequenceNumber: (raw['qdb_sequencenumber'] as number) ?? 0,
    applyFilter: (raw['qdb_applyfilter'] as boolean) ?? false,
    stepId: (raw['_qdb_workitemstep_value'] as string) ?? '',
  };
}

function mapRoute(raw: Record<string, unknown>): WorkflowRoute {
  return {
    crmId: raw['qdb_outcomeworktasksid'] as string,
    name: (raw['qdb_name'] as string) ?? '',
    subject: (raw['qdb_subject'] as string) ?? '',
    sequenceNumber: (raw['qdb_sequencenumber'] as number) ?? 0,
    filter: (raw['qdb_filter'] as string) ?? '',
    outcomeId: (raw['_qdb_outcome_value'] as string) ?? '',
    nextStepId: (raw['_qdb_nextworkitemstep_value'] as string) ?? '',
  };
}

// --- Body builders ---

function buildProcessBody(data: Partial<Omit<WorkflowProcess, 'crmId'>>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (data.name !== undefined) body['qdb_name'] = data.name;
  if (data.recordEntity !== undefined) body['qdb_recordentity'] = data.recordEntity;
  if (data.regardingField !== undefined) body['qdb_regardingfield'] = data.regardingField;
  if (data.parentEntity !== undefined) body['qdb_parententity'] = data.parentEntity;
  if (data.versionMajor !== undefined) body['qdb_version_major'] = data.versionMajor;
  if (data.versionMinor !== undefined) body['qdb_version_minor'] = data.versionMinor;
  if (data.workflowState !== undefined) body['qdb_workflow_state'] = WORKFLOW_STATE_CODES[data.workflowState];
  if (data.snapshot !== undefined) body['qdb_workflow_snapshot'] = data.snapshot;
  return body;
}

function buildStepBody(data: Partial<Omit<WorkflowStep, 'crmId'>>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (data.name !== undefined) body['qdb_name'] = data.name;
  if (data.schemaName !== undefined) body['qdb_schemaname'] = data.schemaName;
  if (data.sequenceNo !== undefined) body['qdb_sequenceno'] = data.sequenceNo;
  if (data.taskSubject !== undefined) body['qdb_tasksubject'] = data.taskSubject;
  if (data.taskDescription !== undefined) body['qdb_taskdescription'] = data.taskDescription;
  if (data.recordEntity !== undefined) body['qdb_recordentity'] = data.recordEntity;
  if (data.regardingField !== undefined) body['qdb_regardingfield'] = data.regardingField;
  if (data.parentEntity !== undefined) body['qdb_parententity'] = data.parentEntity;
  if (data.assignTo !== undefined) body['qdb_task_assign_to'] = ASSIGN_TO_CODES[data.assignTo];
  if (data.assignedUserId) {
    body['qdb_assigned_user@odata.bind'] = `/systemusers(${data.assignedUserId})`;
  }
  if (data.teamId) {
    body['qdb_team@odata.bind'] = `/teams(${data.teamId})`;
  }
  if (data.enableRoundRobin !== undefined) body['qdb_enableroundrobin'] = data.enableRoundRobin;
  if (data.roundRobinTeamId) {
    body['qdb_roundrobinteam@odata.bind'] = `/teams(${data.roundRobinTeamId})`;
  }
  if (data.processId) {
    body['qdb_record_type@odata.bind'] = `/${ENTITY_SETS.process}(${data.processId})`;
  }
  return body;
}

function buildOutcomeBody(data: Partial<Omit<WorkflowOutcome, 'crmId'>>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (data.name !== undefined) body['qdb_name'] = data.name;
  if (data.sequenceNumber !== undefined) body['qdb_sequencenumber'] = data.sequenceNumber;
  if (data.applyFilter !== undefined) body['qdb_applyfilter'] = data.applyFilter;
  if (data.stepId) {
    body['qdb_WorkItemStep@odata.bind'] = `/${ENTITY_SETS.step}(${data.stepId})`;
  }
  return body;
}

function buildRouteBody(data: Partial<Omit<WorkflowRoute, 'crmId'>>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (data.name !== undefined) body['qdb_name'] = data.name;
  if (data.subject !== undefined) body['qdb_subject'] = data.subject;
  if (data.sequenceNumber !== undefined) body['qdb_sequencenumber'] = data.sequenceNumber;
  if (data.filter !== undefined) body['qdb_filter'] = data.filter;
  if (data.outcomeId) {
    body['qdb_Outcome@odata.bind'] = `/${ENTITY_SETS.outcome}(${data.outcomeId})`;
  }
  if (data.nextStepId) {
    body['qdb_NextWorkItemStep@odata.bind'] = `/${ENTITY_SETS.step}(${data.nextStepId})`;
  }
  return body;
}

function buildODataHeaders(): HeadersInit {
  return {
    'OData-Version': '4.0',
    'OData-MaxVersion': '4.0',
    Accept: 'application/json',
  };
}
