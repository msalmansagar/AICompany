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
  AutoNumberEntityOption,
  AutoNumberFieldOption,
} from '@/types/WorkflowTypes';
import type { RawEntityMetadata, RawAttributeMetadata } from '@/types/CrmTypes';

const ENTITY_SETS = {
  process: 'qdb_work_item_record_types',
  step: 'qdb_work_item_stepses',
  outcome: 'qdb_outcomes',
  route: 'qdb_outcomeworktaskss',
  crmEntity: 'crmi_autonumber_system_entitieses',
  crmField: 'crmi_autonumber_entities_fieldses',
  roundRobinTeam: 'qdb_roundrobinteams',
} as const;

export class ODataAdapter implements ICrmAdapter {
  private readonly env: CrmEnvironmentService;
  private readonly navPropCache = new Map<string, string>();

  constructor(env: CrmEnvironmentService) {
    this.env = env;
  }

  // Queries RelationshipDefinitions to find the OData navigation property name used
  // for @odata.bind. This is the relationship schema name, NOT the field logical name.
  private async resolveNavProp(entityLogicalName: string, attributeLogicalName: string): Promise<string> {
    const key = `${entityLogicalName}.${attributeLogicalName}`;
    if (this.navPropCache.has(key)) return this.navPropCache.get(key)!;
    try {
      const data = await this.get<{
        value: Array<{ ReferencingEntityNavigationPropertyName: string }>;
      }>(
        `RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata` +
        `?$filter=ReferencingEntity eq '${entityLogicalName}' and ReferencingAttribute eq '${attributeLogicalName}'` +
        `&$select=ReferencingEntityNavigationPropertyName`
      );
      const name = data.value[0]?.ReferencingEntityNavigationPropertyName ?? attributeLogicalName;
      this.navPropCache.set(key, name);
      return name;
    } catch {
      this.navPropCache.set(key, attributeLogicalName);
      return attributeLogicalName;
    }
  }

  private get baseUrl(): string {
    if (this.env.isDevMode) return `/api/data/${this.env.getApiVersion()}`;
    return `${this.env.getClientUrl()}/api/data/${this.env.getApiVersion()}`;
  }

  // --- HTTP helpers ---

  private async get<T>(path: string): Promise<T> {
    return withRetry(async () => {
      const response = await fetch(`${this.baseUrl}/${path}`, {
        credentials: 'include',
        headers: buildODataHeaders(),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
      return response.json() as Promise<T>;
    });
  }

  private async post(path: string, body: Record<string, unknown>): Promise<string> {
    return withRetry(async () => {
      const response = await fetch(`${this.baseUrl}/${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: { ...buildODataHeaders(), 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
      const location = response.headers.get('OData-EntityId') ?? '';
      const match = /\(([^)]+)\)$/.exec(location);
      return match ? (match[1] ?? '') : '';
    });
  }

  private async patch(path: string, body: Record<string, unknown>): Promise<void> {
    await withRetry(async () => {
      const response = await fetch(`${this.baseUrl}/${path}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { ...buildODataHeaders(), 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
    });
  }

  private async del(path: string): Promise<void> {
    await withRetry(async () => {
      const response = await fetch(`${this.baseUrl}/${path}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: buildODataHeaders(),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
    });
  }

  // --- Process ---

  async getProcessList(): Promise<WorkflowProcess[]> {
    const data = await this.get<{ value: Record<string, unknown>[] }>(
      `${ENTITY_SETS.process}?$select=qdb_work_item_record_typeid,qdb_name,qdb_recordentity,qdb_regardingfield,qdb_parententity,qdb_version_major,qdb_version_minor,qdb_workflow_state,qdb_workflow_snapshot`
    );
    return data.value.map(mapProcess);
  }

  async getProcess(id: string): Promise<WorkflowProcess> {
    assertGuid(id, 'processId');
    const raw = await this.get<Record<string, unknown>>(
      `${ENTITY_SETS.process}(${id})?$select=qdb_work_item_record_typeid,qdb_name,qdb_recordentity,qdb_regardingfield,qdb_parententity,qdb_version_major,qdb_version_minor,qdb_workflow_state,qdb_workflow_snapshot`
    );
    return mapProcess(raw);
  }

  async createProcess(data: Omit<WorkflowProcess, 'crmId'>): Promise<string> {
    return this.post(ENTITY_SETS.process, await this.buildProcessBodyResolved(data));
  }

  async updateProcess(id: string, data: Partial<Omit<WorkflowProcess, 'crmId'>>): Promise<void> {
    assertGuid(id, 'processId');
    await this.patch(`${ENTITY_SETS.process}(${id})`, await this.buildProcessBodyResolved(data as Omit<WorkflowProcess, 'crmId'>));
  }

  private async buildProcessBodyResolved(data: Partial<Omit<WorkflowProcess, 'crmId'>>): Promise<Record<string, unknown>> {
    const body = buildProcessBody(data);
    if (data.recordEntity || data.regardingField || data.parentEntity) {
      const [re, rf, pe] = await Promise.all([
        data.recordEntity  ? this.resolveNavProp('qdb_work_item_record_type', 'qdb_recordentity')  : Promise.resolve(''),
        data.regardingField ? this.resolveNavProp('qdb_work_item_record_type', 'qdb_regardingfield') : Promise.resolve(''),
        data.parentEntity  ? this.resolveNavProp('qdb_work_item_record_type', 'qdb_parententity')  : Promise.resolve(''),
      ]);
      if (data.recordEntity  && re) body[`${re}@odata.bind`] = `/${ENTITY_SETS.crmEntity}(${data.recordEntity})`;
      if (data.regardingField && rf) body[`${rf}@odata.bind`] = `/${ENTITY_SETS.crmField}(${data.regardingField})`;
      if (data.parentEntity  && pe) body[`${pe}@odata.bind`] = `/${ENTITY_SETS.crmEntity}(${data.parentEntity})`;
    }
    return body;
  }

  async deleteProcess(id: string): Promise<void> {
    assertGuid(id, 'processId');
    await this.del(`${ENTITY_SETS.process}(${id})`);
  }

  // --- Steps ---

  async getSteps(processId: string): Promise<WorkflowStep[]> {
    assertGuid(processId, 'processId');
    const data = await this.get<{ value: Record<string, unknown>[] }>(
      `${ENTITY_SETS.step}?$select=qdb_work_item_stepsid,qdb_name,qdb_schemaname,qdb_sequenceno,qdb_tasksubject,qdb_taskdescription,_qdb_recordentity_value,_qdb_regardingfield_value,_qdb_parententity_value,qdb_task_assign_to,_qdb_assigned_user_value,_qdb_team_value,_qdb_roundrobinteam_value&$filter=_qdb_record_type_value eq ${processId}`
    );
    return data.value.map(mapStep);
  }

  async createStep(data: Omit<WorkflowStep, 'crmId'>): Promise<string> {
    assertGuid(data.processId, 'processId');
    return this.post(ENTITY_SETS.step, await this.buildStepBodyResolved(data));
  }

  async updateStep(id: string, data: Partial<Omit<WorkflowStep, 'crmId'>>): Promise<void> {
    assertGuid(id, 'stepId');
    await this.patch(`${ENTITY_SETS.step}(${id})`, await this.buildStepBodyResolved(data as Omit<WorkflowStep, 'crmId'>));
  }

  private async buildStepBodyResolved(data: Partial<Omit<WorkflowStep, 'crmId'>>): Promise<Record<string, unknown>> {
    const body = buildStepBody(data);
    if (data.recordEntityId || data.regardingFieldId || data.parentEntityId) {
      const [re, rf, pe] = await Promise.all([
        data.recordEntityId  ? this.resolveNavProp('qdb_work_item_steps', 'qdb_recordentity')  : Promise.resolve(''),
        data.regardingFieldId ? this.resolveNavProp('qdb_work_item_steps', 'qdb_regardingfield') : Promise.resolve(''),
        data.parentEntityId  ? this.resolveNavProp('qdb_work_item_steps', 'qdb_parententity')  : Promise.resolve(''),
      ]);
      if (data.recordEntityId  && re) body[`${re}@odata.bind`] = `/${ENTITY_SETS.crmEntity}(${data.recordEntityId})`;
      if (data.regardingFieldId && rf) body[`${rf}@odata.bind`] = `/${ENTITY_SETS.crmField}(${data.regardingFieldId})`;
      if (data.parentEntityId  && pe) body[`${pe}@odata.bind`] = `/${ENTITY_SETS.crmEntity}(${data.parentEntityId})`;
    }
    return body;
  }

  async deleteStep(id: string): Promise<void> {
    assertGuid(id, 'stepId');
    await this.del(`${ENTITY_SETS.step}(${id})`);
  }

  // --- Outcomes ---

  async getOutcomes(stepId: string): Promise<WorkflowOutcome[]> {
    assertGuid(stepId, 'stepId');
    const data = await this.get<{ value: Record<string, unknown>[] }>(
      `${ENTITY_SETS.outcome}?$select=qdb_outcomeid,qdb_name,qdb_sequencenumber,qdb_applyfilter,_qdb_workitemstep_value&$filter=_qdb_workitemstep_value eq ${stepId}`
    );
    return data.value.map(mapOutcome);
  }

  async createOutcome(data: Omit<WorkflowOutcome, 'crmId'>): Promise<string> {
    assertGuid(data.stepId, 'stepId');
    return this.post(ENTITY_SETS.outcome, await this.buildOutcomeBodyResolved(data));
  }

  async updateOutcome(id: string, data: Partial<Omit<WorkflowOutcome, 'crmId'>>): Promise<void> {
    assertGuid(id, 'outcomeId');
    await this.patch(`${ENTITY_SETS.outcome}(${id})`, await this.buildOutcomeBodyResolved(data as Omit<WorkflowOutcome, 'crmId'>));
  }

  private async buildOutcomeBodyResolved(data: Partial<Omit<WorkflowOutcome, 'crmId'>>): Promise<Record<string, unknown>> {
    const body = buildOutcomeBody(data);
    const [ws, nws] = await Promise.all([
      data.stepId     ? this.resolveNavProp('qdb_outcome', 'qdb_workitemstep')     : Promise.resolve(''),
      data.nextStepId ? this.resolveNavProp('qdb_outcome', 'qdb_nextworkitemstep') : Promise.resolve(''),
    ]);
    if (data.stepId     && ws)  body[`${ws}@odata.bind`]  = `/${ENTITY_SETS.step}(${data.stepId})`;
    if (data.nextStepId && nws) body[`${nws}@odata.bind`] = `/${ENTITY_SETS.step}(${data.nextStepId})`;
    return body;
  }

  async deleteOutcome(id: string): Promise<void> {
    assertGuid(id, 'outcomeId');
    await this.del(`${ENTITY_SETS.outcome}(${id})`);
  }

  // --- Routes ---

  async getRoutes(outcomeId: string): Promise<WorkflowRoute[]> {
    assertGuid(outcomeId, 'outcomeId');
    const data = await this.get<{ value: Record<string, unknown>[] }>(
      `${ENTITY_SETS.route}?$select=qdb_outcomeworktasksid,qdb_name,qdb_subject,qdb_sequencenumber,qdb_filter,_qdb_outcome_value,_qdb_nextworkitemstep_value&$filter=_qdb_outcome_value eq ${outcomeId}`
    );
    return data.value.map(mapRoute);
  }

  async createRoute(data: Omit<WorkflowRoute, 'crmId'>): Promise<string> {
    assertGuid(data.outcomeId, 'outcomeId');
    assertGuid(data.nextStepId, 'nextStepId');
    return this.post(ENTITY_SETS.route, buildRouteBody(data));
  }

  async updateRoute(id: string, data: Partial<Omit<WorkflowRoute, 'crmId'>>): Promise<void> {
    assertGuid(id, 'routeId');
    await this.patch(`${ENTITY_SETS.route}(${id})`, buildRouteBody(data as Omit<WorkflowRoute, 'crmId'>));
  }

  async deleteRoute(id: string): Promise<void> {
    assertGuid(id, 'routeId');
    await this.del(`${ENTITY_SETS.route}(${id})`);
  }

  // --- Metadata ---

  async getEntities(): Promise<EntityOption[]> {
    const data = await this.get<{ value: RawEntityMetadata[] }>(
      `EntityDefinitions?$select=LogicalName,DisplayName,ObjectTypeCode&$filter=IsValidForAdvancedFind eq true`
    );
    return data.value.map((e) => ({
      logicalName: e.LogicalName,
      displayName: e.DisplayName?.UserLocalizedLabel?.Label ?? e.LogicalName,
      objectTypeCode: e.ObjectTypeCode,
    }));
  }

  async getAttributes(entityLogicalName: string): Promise<AttributeOption[]> {
    const data = await this.get<{ value: RawAttributeMetadata[] }>(
      `EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes?$select=SchemaName,DisplayName,AttributeType&$filter=IsValidForAdvancedFind eq true`
    );
    return data.value.map((a) => ({
      schemaName: a.SchemaName,
      displayName: a.DisplayName?.UserLocalizedLabel?.Label ?? a.SchemaName,
      attributeType: a.AttributeType,
    }));
  }

  async getUsers(search?: string): Promise<UserOption[]> {
    const filter = search
      ? `&$filter=isdisabled eq false and contains(fullname,'${encodeURIComponent(search)}')`
      : `&$filter=isdisabled eq false`;
    const data = await this.get<{ value: Record<string, unknown>[] }>(
      `systemusers?$select=systemuserid,fullname,domainname${filter}&$top=5000&$orderby=fullname asc`
    );
    return data.value.map((u) => ({
      id: u['systemuserid'] as string,
      fullName: u['fullname'] as string,
      domainName: u['domainname'] as string,
    }));
  }

  async getTeams(): Promise<TeamOption[]> {
    const data = await this.get<{ value: Record<string, unknown>[] }>(
      `teams?$select=teamid,name&$filter=teamtype eq 0&$top=5000&$orderby=name asc`
    );
    return data.value.map((t) => ({
      id: t['teamid'] as string,
      name: t['name'] as string,
    }));
  }

  async getRoundRobinTeams(): Promise<TeamOption[]> {
    const data = await this.get<{ value: Record<string, unknown>[] }>(
      `${ENTITY_SETS.roundRobinTeam}?$select=qdb_roundrobinteamid,qdb_name&$orderby=qdb_name asc&$top=100`
    );
    return data.value.map((t) => ({
      id: t['qdb_roundrobinteamid'] as string,
      name: (t['qdb_name'] as string) ?? '',
    }));
  }

  async getAutoNumberEntities(): Promise<AutoNumberEntityOption[]> {
    const data = await this.get<{ value: Record<string, unknown>[] }>(
      `${ENTITY_SETS.crmEntity}?$select=crmi_autonumber_system_entitiesid,crmi_name&$orderby=crmi_name asc&$top=5000`
    );
    return data.value.map((e) => ({
      id: normaliseGuid((e['crmi_autonumber_system_entitiesid'] as string) ?? ''),
      name: (e['crmi_name'] as string) ?? '',
    }));
  }

  async getAutoNumberEntityFields(entityId?: string): Promise<AutoNumberFieldOption[]> {
    const cleanId = entityId ? normaliseGuid(entityId) : '';
    const filterClause = cleanId ? `&$filter=_crmi_entity_id_value eq ${cleanId}` : '';
    const data = await this.get<{ value: Record<string, unknown>[] }>(
      `${ENTITY_SETS.crmField}?$select=crmi_autonumber_entities_fieldsid,crmi_name,_crmi_entity_id_value${filterClause}&$orderby=crmi_name asc&$top=5000`
    );
    return data.value.map((e) => ({
      id: normaliseGuid((e['crmi_autonumber_entities_fieldsid'] as string) ?? ''),
      name: (e['crmi_name'] as string) ?? '',
      entityId: normaliseGuid((e['_crmi_entity_id_value'] as string) ?? ''),
    }));
  }

  // --- Lifecycle ---

  async publishProcess(id: string): Promise<void> {
    assertGuid(id, 'processId');
    await this.patch(`${ENTITY_SETS.process}(${id})`, {
      statuscode: 2,
    });
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
          await this.createRoute({
            ...route,
            outcomeId: newOutcomeId,
            nextStepId: stepIdMap[route.nextStepId] ?? route.nextStepId,
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
    crmId: raw['qdb_work_item_record_typeid'] as string,
    name: (raw['qdb_name'] as string) ?? '',
    recordEntity: (raw['qdb_recordentity'] as string) ?? '',
    regardingField: (raw['qdb_regardingfield'] as string) ?? '',
    parentEntity: (raw['qdb_parententity'] as string) ?? '',
    versionMajor: (raw['qdb_version_major'] as number) ?? 1,
    versionMinor: (raw['qdb_version_minor'] as number) ?? 0,
    workflowState: mapStateCode(raw['qdb_workflow_state'] as number),
    snapshot: (raw['qdb_workflow_snapshot'] as string | null) ?? null,
  };
}

function mapStateCode(code: number): WorkflowProcess['workflowState'] {
  if (code === WORKFLOW_STATE_CODES.published) return 'published';
  if (code === WORKFLOW_STATE_CODES.archived) return 'archived';
  return 'draft';
}

function mapStep(raw: Record<string, unknown>): WorkflowStep {
  const assignCode = (raw['qdb_task_assign_to'] as number) ?? ASSIGN_TO_CODES.user;
  return {
    crmId: (raw['qdb_work_item_stepsid'] as string) ?? '',
    name: (raw['qdb_name'] as string) ?? '',
    schemaName: (raw['qdb_schemaname'] as string) ?? '',
    sequenceNo: (raw['qdb_sequenceno'] as number) ?? 0,
    taskSubject: (raw['qdb_tasksubject'] as string) ?? '',
    taskDescription: (raw['qdb_taskdescription'] as string) ?? '',
    recordEntityId: (raw['_qdb_recordentity_value'] as string | null) ?? null,
    recordEntityName: (raw['_qdb_recordentity_value@OData.Community.Display.V1.FormattedValue'] as string | null) ?? null,
    regardingFieldId: (raw['_qdb_regardingfield_value'] as string | null) ?? null,
    regardingFieldName: (raw['_qdb_regardingfield_value@OData.Community.Display.V1.FormattedValue'] as string | null) ?? null,
    parentEntityId: (raw['_qdb_parententity_value'] as string | null) ?? null,
    parentEntityName: (raw['_qdb_parententity_value@OData.Community.Display.V1.FormattedValue'] as string | null) ?? null,
    assignTo: assignCode === ASSIGN_TO_CODES.team ? 'team'
            : assignCode === ASSIGN_TO_CODES.roundRobin ? 'roundRobin'
            : 'user',
    assignedUserId: (raw['_qdb_assigned_user_value'] as string | null) ?? null,
    assignedUserName: null,
    teamId: (raw['_qdb_team_value'] as string | null) ?? null,
    teamName: null,
    roundRobinTeamId: (raw['_qdb_roundrobinteam_value'] as string | null) ?? null,
    roundRobinTeamName: null,
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
    nextStepId: (raw['_qdb_nextworkitemstep_value'] as string | null) ?? null,
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

function buildProcessBody(data: Partial<Omit<WorkflowProcess, 'crmId'>>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (data.name !== undefined) body['qdb_name'] = data.name;
  return body;
}

function buildStepBody(data: Partial<Omit<WorkflowStep, 'crmId'>>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (data.name !== undefined) body['qdb_name'] = data.name;
  if (data.sequenceNo !== undefined) body['qdb_sequenceno'] = data.sequenceNo;
  if (data.taskDescription !== undefined) body['qdb_taskdescription'] = data.taskDescription;
  if (data.assignTo !== undefined) {
    body['qdb_task_assign_to'] = ASSIGN_TO_CODES[data.assignTo];
    body['qdb_enableroundrobin'] = data.assignTo === 'roundRobin';
  }
  if (data.assignedUserId) body['qdb_assigned_user@odata.bind'] = `/systemusers(${data.assignedUserId})`;
  if (data.teamId) body['qdb_team@odata.bind'] = `/teams(${data.teamId})`;
  if (data.roundRobinTeamId) body['qdb_roundrobinteam@odata.bind'] = `/qdb_roundrobinteams(${data.roundRobinTeamId})`;
  if (data.processId) body['qdb_record_type@odata.bind'] = `/${ENTITY_SETS.process}(${data.processId})`;
  return body;
}

function buildOutcomeBody(data: Partial<Omit<WorkflowOutcome, 'crmId'>>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (data.name !== undefined) body['qdb_name'] = data.name;
  if (data.sequenceNumber !== undefined) body['qdb_sequencenumber'] = data.sequenceNumber;
  if (data.applyFilter !== undefined) body['qdb_applyfilter'] = data.applyFilter;
  return body;
}

function buildRouteBody(data: Partial<Omit<WorkflowRoute, 'crmId'>>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (data.name !== undefined) body['qdb_name'] = data.name;
  if (data.subject !== undefined) body['qdb_subject'] = data.subject;
  if (data.sequenceNumber !== undefined) body['qdb_sequencenumber'] = data.sequenceNumber;
  if (data.filter !== undefined) body['qdb_filter'] = data.filter;
  if (data.outcomeId) body['qdb_outcome@odata.bind'] = `/${ENTITY_SETS.outcome}(${data.outcomeId})`;
  if (data.nextStepId) body['qdb_nextworkitemstep@odata.bind'] = `/${ENTITY_SETS.step}(${data.nextStepId})`;
  return body;
}

function normaliseGuid(raw: string): string {
  return raw.replace(/^\{|\}$/g, '').toLowerCase();
}

function buildODataHeaders(): HeadersInit {
  return {
    'OData-Version': '4.0',
    'OData-MaxVersion': '4.0',
    Accept: 'application/json',
  };
}
