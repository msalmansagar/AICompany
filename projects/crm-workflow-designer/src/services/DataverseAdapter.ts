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

// Entity LOGICAL names — required by this.xrm.WebApi.*(logicalName, ...)
const LOGICAL = {
  process: 'qdb_work_item_record_type',
  step: 'qdb_work_item_steps',
  outcome: 'qdb_outcome',
  route: 'qdb_outcomeworktasks',
  user: 'systemuser',
  team: 'team',
  crmEntity: 'crmi_autonumber_system_entitieses',
  crmField: 'crmi_autonumber_entities_fieldses',
} as const;

// Entity SET names — used only in @odata.bind navigation paths in request bodies
const SET = {
  process: 'qdb_work_item_record_types',
  step: 'qdb_work_item_stepss',
  outcome: 'qdb_outcomes',
  route: 'qdb_outcomeworktaskss',
  crmEntity: 'crmi_autonumber_system_entitieses',
  crmField: 'crmi_autonumber_entities_fieldses',
} as const;

interface DiscoveredEntityMeta {
  logicalName: string;
  entitySetName: string;
  primaryIdAttr: string;
  primaryNameAttr: string;
}

export class DataverseAdapter implements ICrmAdapter {
  private readonly env: CrmEnvironmentService;
  private readonly xrm: typeof Xrm;
  private cachedSystemEntityMeta: DiscoveredEntityMeta | null = null;
  private cachedFieldEntityMeta: DiscoveredEntityMeta | null = null;
  private cachedFieldRelAttr: string | null = null;

  constructor(env: CrmEnvironmentService) {
    this.env = env;
    this.xrm = env.getCrmXrm();
  }

  // --- Process ---

  async getProcessList(): Promise<WorkflowProcess[]> {
    try {
      const result = await withRetry(() =>
        this.xrm.WebApi.retrieveMultipleRecords(
          LOGICAL.process,
          '?$select=qdb_work_item_record_typeid,qdb_name,qdb_recordentity,qdb_regardingfield,qdb_parententity,qdb_version_major,qdb_version_minor,qdb_workflow_state&$top=100&$orderby=qdb_name asc'
        )
      );
      return result.entities.map(mapProcess);
    } catch (err) {
      throw asError(err, 'getProcessList');
    }
  }

  async getProcess(id: string): Promise<WorkflowProcess> {
    assertGuid(id, 'processId');
    const raw = await withRetry(() =>
      this.xrm.WebApi.retrieveRecord(
        LOGICAL.process,
        id,
        '?$select=qdb_work_item_record_typeid,qdb_name,qdb_recordentity,qdb_regardingfield,qdb_parententity,qdb_version_major,qdb_version_minor,qdb_workflow_state,qdb_workflow_snapshot'
      )
    );
    return mapProcess(raw as Record<string, unknown>);
  }

  async createProcess(data: Omit<WorkflowProcess, 'crmId'>): Promise<string> {
    const body = buildProcessBody(data);
    const result = await withRetry(() =>
      this.xrm.WebApi.createRecord(LOGICAL.process, body)
    );
    return result.id;
  }

  async updateProcess(id: string, data: Partial<Omit<WorkflowProcess, 'crmId'>>): Promise<void> {
    assertGuid(id, 'processId');
    await withRetry(() =>
      this.xrm.WebApi.updateRecord(LOGICAL.process, id, buildProcessBody(data as Omit<WorkflowProcess, 'crmId'>))
    );
  }

  async deleteProcess(id: string): Promise<void> {
    assertGuid(id, 'processId');
    await withRetry(() => this.xrm.WebApi.deleteRecord(LOGICAL.process, id));
  }

  // --- Steps ---

  async getSteps(processId: string): Promise<WorkflowStep[]> {
    assertGuid(processId, 'processId');
    const result = await withRetry(() =>
      this.xrm.WebApi.retrieveMultipleRecords(
        LOGICAL.step,
        `?$select=qdb_work_item_stepsid,qdb_name,qdb_schemaname,qdb_sequenceno,qdb_tasksubject,qdb_taskdescription,_qdb_recordentity_value,_qdb_regardingfield_value,_qdb_parententity_value,qdb_task_assign_to,_qdb_assigned_user_value,_qdb_assigned_user_name,_qdb_team_value,_qdb_team_name,_qdb_roundrobinteam_value,_qdb_roundrobinteam_name&$filter=_qdb_record_type_value eq ${processId}&$orderby=qdb_sequenceno asc`
      )
    );
    return result.entities.map(mapStep);
  }

  async createStep(data: Omit<WorkflowStep, 'crmId'>): Promise<string> {
    assertGuid(data.processId, 'processId');
    const body = buildStepBody(data);
    const result = await withRetry(() => this.xrm.WebApi.createRecord(LOGICAL.step, body));
    return result.id;
  }

  async updateStep(id: string, data: Partial<Omit<WorkflowStep, 'crmId'>>): Promise<void> {
    assertGuid(id, 'stepId');
    await withRetry(() =>
      this.xrm.WebApi.updateRecord(LOGICAL.step, id, buildStepBody(data as Omit<WorkflowStep, 'crmId'>))
    );
  }

  async deleteStep(id: string): Promise<void> {
    assertGuid(id, 'stepId');
    await withRetry(() => this.xrm.WebApi.deleteRecord(LOGICAL.step, id));
  }

  // --- Outcomes ---

  async getOutcomes(stepId: string): Promise<WorkflowOutcome[]> {
    assertGuid(stepId, 'stepId');
    const result = await withRetry(() =>
      this.xrm.WebApi.retrieveMultipleRecords(
        LOGICAL.outcome,
        `?$select=qdb_outcomeid,qdb_name,qdb_sequencenumber,qdb_applyfilter,_qdb_workitemstep_value&$filter=_qdb_workitemstep_value eq ${stepId}&$orderby=qdb_sequencenumber asc`
      )
    );
    return result.entities.map(mapOutcome);
  }

  async createOutcome(data: Omit<WorkflowOutcome, 'crmId'>): Promise<string> {
    assertGuid(data.stepId, 'stepId');
    const result = await withRetry(() =>
      this.xrm.WebApi.createRecord(LOGICAL.outcome, buildOutcomeBody(data))
    );
    return result.id;
  }

  async updateOutcome(id: string, data: Partial<Omit<WorkflowOutcome, 'crmId'>>): Promise<void> {
    assertGuid(id, 'outcomeId');
    await withRetry(() =>
      this.xrm.WebApi.updateRecord(LOGICAL.outcome, id, buildOutcomeBody(data as Omit<WorkflowOutcome, 'crmId'>))
    );
  }

  async deleteOutcome(id: string): Promise<void> {
    assertGuid(id, 'outcomeId');
    await withRetry(() => this.xrm.WebApi.deleteRecord(LOGICAL.outcome, id));
  }

  // --- Routes ---

  async getRoutes(outcomeId: string): Promise<WorkflowRoute[]> {
    assertGuid(outcomeId, 'outcomeId');
    const result = await withRetry(() =>
      this.xrm.WebApi.retrieveMultipleRecords(
        LOGICAL.route,
        `?$select=qdb_outcomeworktasksid,qdb_name,qdb_subject,qdb_sequencenumber,qdb_filter,_qdb_outcome_value,_qdb_nextworkitemstep_value&$filter=_qdb_outcome_value eq ${outcomeId}&$orderby=qdb_sequencenumber asc`
      )
    );
    return result.entities.map(mapRoute);
  }

  async createRoute(data: Omit<WorkflowRoute, 'crmId'>): Promise<string> {
    assertGuid(data.outcomeId, 'outcomeId');
    assertGuid(data.nextStepId, 'nextStepId');
    const result = await withRetry(() =>
      this.xrm.WebApi.createRecord(LOGICAL.route, buildRouteBody(data))
    );
    return result.id;
  }

  async updateRoute(id: string, data: Partial<Omit<WorkflowRoute, 'crmId'>>): Promise<void> {
    assertGuid(id, 'routeId');
    await withRetry(() =>
      this.xrm.WebApi.updateRecord(LOGICAL.route, id, buildRouteBody(data as Omit<WorkflowRoute, 'crmId'>))
    );
  }

  async deleteRoute(id: string): Promise<void> {
    assertGuid(id, 'routeId');
    await withRetry(() => this.xrm.WebApi.deleteRecord(LOGICAL.route, id));
  }

  // --- Metadata ---

  async getEntities(): Promise<EntityOption[]> {
    const url =
      `${this.env.getClientUrl()}/api/data/${this.env.getApiVersion()}` +
      `/EntityDefinitions?$select=LogicalName,DisplayName,ObjectTypeCode&$filter=IsValidForAdvancedFind eq true`;
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
    try {
      const searchFilter = search
        ? ` and (contains(fullname,'${search}') or contains(domainname,'${search}'))`
        : '';
      const result = await withRetry(() =>
        this.xrm.WebApi.retrieveMultipleRecords(
          LOGICAL.user,
          `?$select=systemuserid,fullname,domainname&$filter=isdisabled eq false${searchFilter}&$top=50&$orderby=fullname asc`
        )
      );
      return result.entities.map((u) => ({
        id: u['systemuserid'] as string,
        fullName: (u['fullname'] as string) ?? '',
        domainName: (u['domainname'] as string) ?? '',
      }));
    } catch (err) {
      throw asError(err, 'getUsers');
    }
  }

  async getTeams(): Promise<TeamOption[]> {
    try {
      const result = await withRetry(() =>
        this.xrm.WebApi.retrieveMultipleRecords(
          LOGICAL.team,
          '?$select=teamid,name&$filter=teamtype eq 0&$top=100&$orderby=name asc'
        )
      );
      return result.entities.map((t) => ({
        id: t['teamid'] as string,
        name: (t['name'] as string) ?? '',
      }));
    } catch (err) {
      throw asError(err, 'getTeams');
    }
  }

  async getAutoNumberEntities(): Promise<AutoNumberEntityOption[]> {
    try {
      const meta = await this.resolveSystemEntityMeta();
      const url =
        `${this.env.getClientUrl()}/api/data/${this.env.getApiVersion()}` +
        `/${meta.entitySetName}?$select=${meta.primaryIdAttr},${meta.primaryNameAttr}` +
        `&$orderby=${meta.primaryNameAttr} asc&$top=200`;
      const data = await withRetry(() =>
        fetch(url, { credentials: 'include', headers: buildODataHeaders() }).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<{ value: Record<string, unknown>[] }>;
        })
      );
      return data.value.map((e) => ({
        id: (e[meta.primaryIdAttr] as string) ?? '',
        name: (e[meta.primaryNameAttr] as string) ?? '',
      }));
    } catch (err) {
      throw asError(err, 'getAutoNumberEntities');
    }
  }

  async getAutoNumberEntityFields(entityId?: string): Promise<AutoNumberFieldOption[]> {
    try {
      const { meta, relAttr } = await this.resolveFieldEntityMeta();
      const filterClause = entityId ? `&$filter=${relAttr} eq ${entityId}` : '';
      const url =
        `${this.env.getClientUrl()}/api/data/${this.env.getApiVersion()}` +
        `/${meta.entitySetName}?$select=${meta.primaryIdAttr},${meta.primaryNameAttr},${relAttr}` +
        `${filterClause}&$orderby=${meta.primaryNameAttr} asc&$top=200`;
      const data = await withRetry(() =>
        fetch(url, { credentials: 'include', headers: buildODataHeaders() }).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<{ value: Record<string, unknown>[] }>;
        })
      );
      return data.value.map((e) => ({
        id: (e[meta.primaryIdAttr] as string) ?? '',
        name: (e[meta.primaryNameAttr] as string) ?? '',
        entityId: (e[relAttr] as string) ?? '',
      }));
    } catch (err) {
      throw asError(err, 'getAutoNumberEntityFields');
    }
  }

  private async resolveSystemEntityMeta(): Promise<DiscoveredEntityMeta> {
    if (this.cachedSystemEntityMeta) return this.cachedSystemEntityMeta;
    const all = await this.fetchAutoNumberEntityDefs();
    const found = all.find((e) =>
      e.logicalName.includes('system_ent') || e.logicalName.includes('systementit')
    );
    if (!found) {
      const names = all.map((e) => e.logicalName).join(', ') || '(none)';
      throw new Error(
        `Cannot find autonumber system-entities table. ` +
        `crmi_autonumber* tables discovered: [${names}]`
      );
    }
    this.cachedSystemEntityMeta = found;
    return found;
  }

  private async resolveFieldEntityMeta(): Promise<{ meta: DiscoveredEntityMeta; relAttr: string }> {
    if (this.cachedFieldEntityMeta && this.cachedFieldRelAttr) {
      return { meta: this.cachedFieldEntityMeta, relAttr: this.cachedFieldRelAttr };
    }
    const all = await this.fetchAutoNumberEntityDefs();
    const systemMeta = await this.resolveSystemEntityMeta();
    const found = all.find(
      (e) => e.logicalName !== systemMeta.logicalName &&
        (e.logicalName.includes('field') || e.logicalName.includes('_field'))
    );
    if (!found) {
      const names = all.map((e) => e.logicalName).join(', ') || '(none)';
      throw new Error(
        `Cannot find autonumber entity-fields table. ` +
        `crmi_autonumber* tables discovered: [${names}]`
      );
    }
    const relAttr = await this.discoverLookupAttr(found.logicalName, systemMeta.logicalName);
    this.cachedFieldEntityMeta = found;
    this.cachedFieldRelAttr = relAttr;
    return { meta: found, relAttr };
  }

  private async fetchAutoNumberEntityDefs(): Promise<DiscoveredEntityMeta[]> {
    // Direct key lookups — no $filter needed (string functions return 501 on this org).
    // Confirmed logical names from this Dataverse environment.
    const baseUrl = `${this.env.getClientUrl()}/api/data/${this.env.getApiVersion()}`;
    const select = 'LogicalName,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute';
    const knownNames = [LOGICAL.crmEntity, LOGICAL.crmField];

    const directResults = await Promise.allSettled(
      knownNames.map((name) =>
        fetch(`${baseUrl}/EntityDefinitions(LogicalName='${name}')?$select=${select}`, {
          credentials: 'include',
          headers: buildODataHeaders(),
        }).then((r) =>
          r.ok
            ? (r.json() as Promise<{ LogicalName: string; EntitySetName: string; PrimaryIdAttribute: string; PrimaryNameAttribute: string }>)
            : Promise.reject(new Error(`HTTP ${r.status} for ${name}`))
        )
      )
    );

    const found: DiscoveredEntityMeta[] = [];
    for (const r of directResults) {
      if (r.status === 'fulfilled') {
        found.push({
          logicalName: r.value.LogicalName,
          entitySetName: r.value.EntitySetName,
          primaryIdAttr: r.value.PrimaryIdAttribute,
          primaryNameAttr: r.value.PrimaryNameAttribute,
        });
      }
    }
    if (found.length > 0) return found;

    // Fallback: IsCustomEntity eq true (equality filter — supported unlike string functions)
    const url = `${baseUrl}/EntityDefinitions?$filter=IsCustomEntity%20eq%20true&$select=${select}`;
    const resp = await fetch(url, { credentials: 'include', headers: buildODataHeaders() });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`HTTP ${resp.status} fetching EntityDefinitions. ${body}`);
    }

    const all = await resp.json() as {
      value: Array<{ LogicalName: string; EntitySetName: string; PrimaryIdAttribute: string; PrimaryNameAttribute: string }>;
    };

    const matches = all.value.filter((e) => e.LogicalName.includes('autonumber'));
    if (matches.length === 0) {
      const crmiNames = all.value
        .filter((e) => e.LogicalName.startsWith('crmi_'))
        .map((e) => e.LogicalName)
        .sort()
        .join(', ');
      throw new Error(
        `No autonumber entities found. crmi_* custom entities: [${crmiNames || '(none)'}]`
      );
    }

    return matches.map((e) => ({
      logicalName: e.LogicalName,
      entitySetName: e.EntitySetName,
      primaryIdAttr: e.PrimaryIdAttribute,
      primaryNameAttr: e.PrimaryNameAttribute,
    }));
  }

  private async discoverLookupAttr(entityLogicalName: string, targetLogicalName: string): Promise<string> {
    try {
      const url =
        `${this.env.getClientUrl()}/api/data/${this.env.getApiVersion()}` +
        `/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes/Microsoft.Dynamics.CRM.LookupAttributeMetadata` +
        `?$select=SchemaName,Targets`;
      const response = await fetch(url, { credentials: 'include', headers: buildODataHeaders() });
      if (!response.ok) return '_crmi_entity_value';
      const data = await response.json() as { value: Array<{ SchemaName: string; Targets: string[] }> };
      const match = data.value.find((a) => Array.isArray(a.Targets) && a.Targets.includes(targetLogicalName));
      return match ? `_${match.SchemaName.toLowerCase()}_value` : '_crmi_entity_value';
    } catch {
      return '_crmi_entity_value';
    }
  }

  // --- Lifecycle ---

  async publishProcess(id: string): Promise<void> {
    assertGuid(id, 'processId');
    await withRetry(() =>
      this.xrm.WebApi.updateRecord(LOGICAL.process, id, {
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
    crmId: (raw['qdb_work_item_record_typeid'] as string) ?? '',
    name: (raw['qdb_name'] as string) ?? '',
    recordEntity: (raw['qdb_recordentity'] as string) ?? '',
    regardingField: (raw['qdb_regardingfield'] as string) ?? '',
    parentEntity: (raw['qdb_parententity'] as string) ?? '',
    versionMajor: (raw['qdb_version_major'] as number) ?? 1,
    versionMinor: (raw['qdb_version_minor'] as number) ?? 0,
    workflowState: mapStateCode(raw['qdb_workflow_state'] as number | undefined),
    snapshot: (raw['qdb_workflow_snapshot'] as string | null) ?? null,
  };
}

function mapStateCode(code: number | undefined): WorkflowProcess['workflowState'] {
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
    assignTo: mapAssignCode(assignCode),
    assignedUserId: (raw['_qdb_assigned_user_value'] as string | null) ?? null,
    assignedUserName: (raw['_qdb_assigned_user_name'] as string | null) ?? null,
    teamId: (raw['_qdb_team_value'] as string | null) ?? null,
    teamName: (raw['_qdb_team_name'] as string | null) ?? null,
    roundRobinTeamId: (raw['_qdb_roundrobinteam_value'] as string | null) ?? null,
    roundRobinTeamName: (raw['_qdb_roundrobinteam_name'] as string | null) ?? null,
    processId: (raw['_qdb_record_type_value'] as string) ?? '',
  };
}

function mapAssignCode(code: number): WorkflowStep['assignTo'] {
  if (code === ASSIGN_TO_CODES.team) return 'team';
  if (code === ASSIGN_TO_CODES.roundRobin) return 'roundRobin';
  return 'user';
}

function mapOutcome(raw: Record<string, unknown>): WorkflowOutcome {
  return {
    crmId: (raw['qdb_outcomeid'] as string) ?? '',
    name: (raw['qdb_name'] as string) ?? '',
    sequenceNumber: (raw['qdb_sequencenumber'] as number) ?? 0,
    applyFilter: (raw['qdb_applyfilter'] as boolean) ?? false,
    stepId: (raw['_qdb_workitemstep_value'] as string) ?? '',
  };
}

function mapRoute(raw: Record<string, unknown>): WorkflowRoute {
  return {
    crmId: (raw['qdb_outcomeworktasksid'] as string) ?? '',
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
  // Only send lookup-like fields when they have a non-empty value to avoid
  // CRM rejecting the request with "invalid value for Lookup" on empty strings.
  if (data.recordEntity) body['qdb_recordentity'] = data.recordEntity;
  if (data.regardingField) body['qdb_regardingfield'] = data.regardingField;
  if (data.parentEntity) body['qdb_parententity'] = data.parentEntity;
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
  if (data.recordEntityId) {
    body['qdb_recordentity@odata.bind'] = `/${SET.crmEntity}(${data.recordEntityId})`;
  }
  if (data.regardingFieldId) {
    body['qdb_regardingfield@odata.bind'] = `/${SET.crmField}(${data.regardingFieldId})`;
  }
  if (data.parentEntityId) {
    body['qdb_parententity@odata.bind'] = `/${SET.crmEntity}(${data.parentEntityId})`;
  }
  if (data.assignTo !== undefined) body['qdb_task_assign_to'] = ASSIGN_TO_CODES[data.assignTo];
  if (data.assignedUserId) {
    body['qdb_assigned_user@odata.bind'] = `/systemusers(${data.assignedUserId})`;
  }
  if (data.teamId) {
    body['qdb_team@odata.bind'] = `/teams(${data.teamId})`;
  }
  if (data.roundRobinTeamId) {
    body['qdb_roundrobinteam@odata.bind'] = `/teams(${data.roundRobinTeamId})`;
  }
  if (data.processId) {
    body['qdb_record_type@odata.bind'] = `/${SET.process}(${data.processId})`;
  }
  return body;
}

function buildOutcomeBody(data: Partial<Omit<WorkflowOutcome, 'crmId'>>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (data.name !== undefined) body['qdb_name'] = data.name;
  if (data.sequenceNumber !== undefined) body['qdb_sequencenumber'] = data.sequenceNumber;
  if (data.applyFilter !== undefined) body['qdb_applyfilter'] = data.applyFilter;
  if (data.stepId) {
    body['qdb_WorkItemStep@odata.bind'] = `/${SET.step}(${data.stepId})`;
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
    body['qdb_Outcome@odata.bind'] = `/${SET.outcome}(${data.outcomeId})`;
  }
  if (data.nextStepId) {
    body['qdb_NextWorkItemStep@odata.bind'] = `/${SET.step}(${data.nextStepId})`;
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

// Xrm.WebApi rejects with a plain {errorCode, message} object, not an Error instance.
// This converts it so React Query and catch blocks receive a real Error with the detail.
function asError(err: unknown, context: string): Error {
  // Always log the raw error so it's visible in browser DevTools regardless of UI state
  console.error(`[DataverseAdapter:${context}] raw error →`, err);
  if (err instanceof Error) return err;
  if (typeof err === 'object' && err !== null) {
    const xrm = err as Record<string, unknown>;
    const msg = typeof xrm['message'] === 'string' ? xrm['message'] : JSON.stringify(xrm);
    return new Error(`[${context}] ${msg}`);
  }
  return new Error(`[${context}] ${String(err)}`);
}
