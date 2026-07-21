import type { ISopAdapter } from './ISopAdapter';
import { deriveProcessFromSop } from './deriveProcessFromSop';
import { escapeODataLiteral } from './odataEscape';
import { logError } from './logError';
import type {
  CrmRole,
  SopSummary,
  Sop,
  SopStep,
  SopOutcome,
  CreateRoleRequest,
  UpdateRoleRequest,
  CreateSopRequest,
  UpdateSopRequest,
  CreateSopStepRequest,
  UpdateSopStepRequest,
  CreateSopOutcomeRequest,
  UpdateSopOutcomeRequest,
  CreateProcessFromSopRequest,
} from '@/types/SopTypes';
import { ROLE_STATUS, SOP_STATUS, SOP_STEP_TYPE_FROM_OPTION_VALUE, SOP_STEP_TYPE_OPTION_VALUE } from '@/types/SopTypes';
import type { SopStatus } from '@/types/SopTypes';
import type { CrmEnvironmentService } from './CrmEnvironmentService';
import { assertGuid } from './assertGuid';
import { withRetry } from './withRetry';
import { ASSIGN_TO_CODES } from '@/types/WorkflowTypes';
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
  roundRobinTeam: 'qdb_roundrobinteam',
  role: 'qdb_role',
  sop: 'qdb_sop',
  sopStep: 'qdb_sopstep',
  sopOutcome: 'qdb_sopoutcome',
  auditLog: 'qdb_form_audit_log',
} as const;

// Entity SET names — used only in @odata.bind navigation paths in request bodies
const SET = {
  process: 'qdb_work_item_record_types',
  step: 'qdb_work_item_stepses',
  outcome: 'qdb_outcomes',
  route: 'qdb_outcomeworktaskses',
  crmEntity: 'crmi_autonumber_system_entitieses',
  crmField: 'crmi_autonumber_entities_fieldses',
  role: 'qdb_roles',
  sop: 'qdb_sops',
  sopStep: 'qdb_sopsteps',
  sopOutcome: 'qdb_sopoutcomes',
} as const;

interface DiscoveredEntityMeta {
  logicalName: string;
  entitySetName: string;
  primaryIdAttr: string;
  primaryNameAttr: string;
}

export class DataverseAdapter implements ISopAdapter {
  private readonly env: CrmEnvironmentService;
  private readonly xrm: typeof Xrm;
  private cachedSystemEntityMeta: DiscoveredEntityMeta | null = null;
  private readonly navPropCache = new Map<string, string>();

  constructor(env: CrmEnvironmentService) {
    this.env = env;
    this.xrm = env.getCrmXrm();
  }

  private async resolveNavProp(entityLogicalName: string, attributeLogicalName: string): Promise<string> {
    const key = `${entityLogicalName}.${attributeLogicalName}`;
    if (this.navPropCache.has(key)) return this.navPropCache.get(key)!;
    try {
      const url =
        `${this.env.getClientUrl()}/api/data/${this.env.getApiVersion()}` +
        `/RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata` +
        `?$filter=ReferencingEntity eq '${entityLogicalName}' and ReferencingAttribute eq '${attributeLogicalName}'` +
        `&$select=ReferencingEntityNavigationPropertyName`;
      const response = await fetch(url, { credentials: 'include', headers: buildODataHeaders() });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as {
        value: Array<{ ReferencingEntityNavigationPropertyName: string }>;
      };
      const name = data.value[0]?.ReferencingEntityNavigationPropertyName ?? attributeLogicalName;
      this.navPropCache.set(key, name);
      return name;
    } catch {
      this.navPropCache.set(key, attributeLogicalName);
      return attributeLogicalName;
    }
  }

  // --- Process ---

  async getProcessList(): Promise<WorkflowProcess[]> {
    try {
      const result = await withRetry(() =>
        this.xrm.WebApi.retrieveMultipleRecords(
          LOGICAL.process,
          '?$select=qdb_work_item_record_typeid,qdb_name,_qdb_recordentity_value,_qdb_regardingfield_value,_qdb_parententity_value&$top=100&$orderby=qdb_name asc'
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
        '?$select=qdb_work_item_record_typeid,qdb_name,_qdb_recordentity_value,_qdb_regardingfield_value,_qdb_parententity_value'
      )
    );
    return mapProcess(raw as Record<string, unknown>);
  }

  async createProcess(data: Omit<WorkflowProcess, 'crmId'>): Promise<string> {
    const body = await this.buildProcessBodyResolved(data);
    const result = await withRetry(() => this.xrm.WebApi.createRecord(LOGICAL.process, body));
    return result.id;
  }

  async updateProcess(id: string, data: Partial<Omit<WorkflowProcess, 'crmId'>>): Promise<void> {
    assertGuid(id, 'processId');
    const body = await this.buildProcessBodyResolved(data as Omit<WorkflowProcess, 'crmId'>);
    await withRetry(() => this.xrm.WebApi.updateRecord(LOGICAL.process, id, body));
  }

  private async buildProcessBodyResolved(data: Partial<Omit<WorkflowProcess, 'crmId'>>): Promise<Record<string, unknown>> {
    const body = buildProcessBody(data);
    if (data.recordEntity || data.regardingField || data.parentEntity || data.sopId) {
      const [re, rf, pe, sop] = await Promise.all([
        data.recordEntity   ? this.resolveNavProp('qdb_work_item_record_type', 'qdb_recordentity')  : Promise.resolve(''),
        data.regardingField ? this.resolveNavProp('qdb_work_item_record_type', 'qdb_regardingfield') : Promise.resolve(''),
        data.parentEntity   ? this.resolveNavProp('qdb_work_item_record_type', 'qdb_parententity')  : Promise.resolve(''),
        data.sopId          ? this.resolveNavProp('qdb_work_item_record_type', 'qdb_sop_id')        : Promise.resolve(''),
      ]);
      if (data.recordEntity   && re)  body[`${re}@odata.bind`]  = `/${SET.crmEntity}(${data.recordEntity})`;
      if (data.regardingField && rf)  body[`${rf}@odata.bind`]  = `/${SET.crmField}(${data.regardingField})`;
      if (data.parentEntity   && pe)  body[`${pe}@odata.bind`]  = `/${SET.crmEntity}(${data.parentEntity})`;
      if (data.sopId          && sop) body[`${sop}@odata.bind`] = `/${SET.sop}(${data.sopId})`;
    }
    return body;
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
        `?$select=qdb_work_item_stepsid,qdb_name,qdb_schemaname,qdb_sequenceno,qdb_tasksubject,qdb_taskdescription,_qdb_recordentity_value,_qdb_regardingfield_value,_qdb_parententity_value,qdb_task_assign_to,_qdb_assigned_user_value,_qdb_team_value,_qdb_roundrobinteam_value&$filter=_qdb_record_type_value eq ${processId}&$orderby=qdb_sequenceno asc`
      )
    );
    return result.entities.map(mapStep);
  }

  async createStep(data: Omit<WorkflowStep, 'crmId'>): Promise<string> {
    assertGuid(data.processId, 'processId');
    const body = await this.buildStepBodyResolved(data);
    const result = await withRetry(() => this.xrm.WebApi.createRecord(LOGICAL.step, body));
    return result.id;
  }

  async updateStep(id: string, data: Partial<Omit<WorkflowStep, 'crmId'>>): Promise<void> {
    assertGuid(id, 'stepId');
    const body = await this.buildStepBodyResolved(data as Omit<WorkflowStep, 'crmId'>);
    await withRetry(() => this.xrm.WebApi.updateRecord(LOGICAL.step, id, body));
  }

  async deleteStep(id: string): Promise<void> {
    assertGuid(id, 'stepId');
    await withRetry(() => this.xrm.WebApi.deleteRecord(LOGICAL.step, id));
  }

  private async buildStepBodyResolved(data: Partial<Omit<WorkflowStep, 'crmId'>>): Promise<Record<string, unknown>> {
    const body = buildStepBody(data);
    const E = 'qdb_work_item_steps';
    const [re, rf, pe, au, tm, rr, rt] = await Promise.all([
      data.recordEntityId   ? this.resolveNavProp(E, 'qdb_recordentity')   : Promise.resolve(''),
      data.regardingFieldId ? this.resolveNavProp(E, 'qdb_regardingfield') : Promise.resolve(''),
      data.parentEntityId   ? this.resolveNavProp(E, 'qdb_parententity')   : Promise.resolve(''),
      data.assignedUserId   ? this.resolveNavProp(E, 'qdb_assigned_user')  : Promise.resolve(''),
      data.teamId           ? this.resolveNavProp(E, 'qdb_team')           : Promise.resolve(''),
      data.roundRobinTeamId ? this.resolveNavProp(E, 'qdb_roundrobinteam') : Promise.resolve(''),
      data.processId        ? this.resolveNavProp(E, 'qdb_record_type')    : Promise.resolve(''),
    ]);
    if (data.recordEntityId   && re) body[`${re}@odata.bind`] = `/${SET.crmEntity}(${data.recordEntityId})`;
    if (data.regardingFieldId && rf) body[`${rf}@odata.bind`] = `/${SET.crmField}(${data.regardingFieldId})`;
    if (data.parentEntityId   && pe) body[`${pe}@odata.bind`] = `/${SET.crmEntity}(${data.parentEntityId})`;
    if (data.assignedUserId   && au) body[`${au}@odata.bind`] = `/systemusers(${data.assignedUserId})`;
    if (data.teamId           && tm) body[`${tm}@odata.bind`] = `/teams(${data.teamId})`;
    if (data.roundRobinTeamId && rr) body[`${rr}@odata.bind`] = `/qdb_roundrobinteams(${data.roundRobinTeamId})`;
    if (data.processId        && rt) body[`${rt}@odata.bind`] = `/${SET.process}(${data.processId})`;
    return body;
  }

  // --- Outcomes ---

  async getOutcomes(stepId: string): Promise<WorkflowOutcome[]> {
    assertGuid(stepId, 'stepId');
    const result = await withRetry(() =>
      this.xrm.WebApi.retrieveMultipleRecords(
        LOGICAL.outcome,
        `?$select=qdb_outcomeid,qdb_name,qdb_sequencenumber,qdb_applyfilter,_qdb_workitemstep_value,_qdb_nextworkitemstep_value&$filter=_qdb_workitemstep_value eq ${stepId}&$orderby=qdb_sequencenumber asc`
      )
    );
    return result.entities.map(mapOutcome);
  }

  async createOutcome(data: Omit<WorkflowOutcome, 'crmId'>): Promise<string> {
    assertGuid(data.stepId, 'stepId');
    const body = await this.buildOutcomeBodyResolved(data);
    const result = await withRetry(() => this.xrm.WebApi.createRecord(LOGICAL.outcome, body));
    return result.id;
  }

  async updateOutcome(id: string, data: Partial<Omit<WorkflowOutcome, 'crmId'>>): Promise<void> {
    assertGuid(id, 'outcomeId');
    const body = await this.buildOutcomeBodyResolved(data as Omit<WorkflowOutcome, 'crmId'>);
    await withRetry(() => this.xrm.WebApi.updateRecord(LOGICAL.outcome, id, body));
  }

  async deleteOutcome(id: string): Promise<void> {
    assertGuid(id, 'outcomeId');
    await withRetry(() => this.xrm.WebApi.deleteRecord(LOGICAL.outcome, id));
  }

  private async buildOutcomeBodyResolved(data: Partial<Omit<WorkflowOutcome, 'crmId'>>): Promise<Record<string, unknown>> {
    const body = buildOutcomeBody(data);
    const [ws, nws] = await Promise.all([
      data.stepId     ? this.resolveNavProp('qdb_outcome', 'qdb_workitemstep')     : Promise.resolve(''),
      data.nextStepId ? this.resolveNavProp('qdb_outcome', 'qdb_nextworkitemstep') : Promise.resolve(''),
    ]);
    if (data.stepId     && ws)  body[`${ws}@odata.bind`]  = `/${SET.step}(${data.stepId})`;
    if (data.nextStepId && nws) body[`${nws}@odata.bind`] = `/${SET.step}(${data.nextStepId})`;
    return body;
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
    if (data.nextStepId) assertGuid(data.nextStepId, 'nextStepId');
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

  async getAttributesMeta(entityLogicalName: string): Promise<Array<{ logicalName: string; displayName: string; attributeType: string }>> {
    const url =
      `${this.env.getClientUrl()}/api/data/${this.env.getApiVersion()}` +
      `/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes` +
      `?$select=LogicalName,DisplayName,AttributeType`;
    type Row = { LogicalName: string; DisplayName: { UserLocalizedLabel?: { Label: string } } | null; AttributeType: string };
    try {
      const response = await withRetry(() =>
        fetch(url, { credentials: 'include', headers: buildODataHeaders() }).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<{ value: Row[] }>;
        })
      );
      return response.value.map((a) => ({
        logicalName: a.LogicalName,
        displayName: a.DisplayName?.UserLocalizedLabel?.Label ?? a.LogicalName,
        attributeType: a.AttributeType,
      }));
    } catch {
      return [];
    }
  }

  async getOptionSetLabels(entityLogicalName: string, attributeLogicalName: string): Promise<Map<number, string>> {
    const base = `${this.env.getClientUrl()}/api/data/${this.env.getApiVersion()}`;
    type OptionRow = { Value: number; Label: { UserLocalizedLabel?: { Label: string } } };

    const tryFetch = async (cast: string): Promise<OptionRow[]> => {
      const url =
        `${base}/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes/${cast}` +
        `?$filter=LogicalName eq '${attributeLogicalName}'&$expand=OptionSet($select=Options)`;
      const r = await fetch(url, { credentials: 'include', headers: buildODataHeaders() });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json() as { value: Array<{ OptionSet?: { Options: OptionRow[] } }> };
      return data.value[0]?.OptionSet?.Options ?? [];
    };

    const casts = [
      'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
      'Microsoft.Dynamics.CRM.StatusAttributeMetadata',
      'Microsoft.Dynamics.CRM.StateAttributeMetadata',
      'Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata',
    ];

    const results = await Promise.allSettled(casts.map(tryFetch));
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.length > 0) {
        const map = new Map<number, string>();
        for (const o of r.value) {
          map.set(o.Value, o.Label?.UserLocalizedLabel?.Label ?? String(o.Value));
        }
        return map;
      }
    }
    return new Map();
  }

  async getUsers(search?: string): Promise<UserOption[]> {
    try {
      const searchFilter = search
        ? ` and (contains(fullname,'${escapeODataLiteral(search)}') or contains(domainname,'${escapeODataLiteral(search)}'))`
        : '';
      const result = await withRetry(() =>
        this.xrm.WebApi.retrieveMultipleRecords(
          LOGICAL.user,
          `?$select=systemuserid,fullname,domainname&$filter=isdisabled eq false${searchFilter}&$top=5000&$orderby=fullname asc`
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
          '?$select=teamid,name&$filter=teamtype eq 0&$top=5000&$orderby=name asc'
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

  async getRoundRobinTeams(): Promise<TeamOption[]> {
    try {
      const result = await withRetry(() =>
        this.xrm.WebApi.retrieveMultipleRecords(
          LOGICAL.roundRobinTeam,
          '?$select=qdb_roundrobinteamid,qdb_name&$top=100&$orderby=qdb_name asc'
        )
      );
      return result.entities.map((t) => ({
        id: t['qdb_roundrobinteamid'] as string,
        name: (t['qdb_name'] as string) ?? '',
      }));
    } catch (err) {
      throw asError(err, 'getRoundRobinTeams');
    }
  }

  async getAutoNumberEntities(): Promise<AutoNumberEntityOption[]> {
    try {
      const meta = await this.resolveSystemEntityMeta();
      const url =
        `${this.env.getClientUrl()}/api/data/${this.env.getApiVersion()}` +
        `/${meta.entitySetName}?$select=${meta.primaryIdAttr},${meta.primaryNameAttr},qdb_objecttypecode,crmi_logical_name` +
        `&$orderby=${meta.primaryNameAttr} asc&$top=5000`;
      const data = await withRetry(() =>
        fetch(url, { credentials: 'include', headers: buildODataHeaders() }).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<{ value: Record<string, unknown>[] }>;
        })
      );
      return data.value.map((e) => ({
        id: normaliseGuid((e[meta.primaryIdAttr] as string) ?? ''),
        name: (e[meta.primaryNameAttr] as string) ?? '',
        logicalName: (e['crmi_logical_name'] as string) ?? (e['qdb_entityschemaname'] as string) ?? '',
        objectTypeCode: Number(e['qdb_objecttypecode'] ?? 0),
      }));
    } catch (err) {
      throw asError(err, 'getAutoNumberEntities');
    }
  }

  async getAutoNumberEntityFields(entityId?: string): Promise<AutoNumberFieldOption[]> {
    try {
      const cleanId = entityId ? normaliseGuid(entityId) : '';
      const filterClause = cleanId ? `&$filter=_crmi_entity_id_value eq ${cleanId}` : '';
      const url =
        `${this.env.getClientUrl()}/api/data/${this.env.getApiVersion()}` +
        `/${LOGICAL.crmField}?$select=crmi_autonumber_entities_fieldsid,crmi_name,_crmi_entity_id_value` +
        `${filterClause}&$orderby=crmi_name asc&$top=5000`;
      const data = await withRetry(() =>
        fetch(url, { credentials: 'include', headers: buildODataHeaders() }).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<{ value: Record<string, unknown>[] }>;
        })
      );
      return data.value.map((e) => ({
        id: normaliseGuid((e['crmi_autonumber_entities_fieldsid'] as string) ?? ''),
        name: (e['crmi_name'] as string) ?? '',
        entityId: normaliseGuid((e['_crmi_entity_id_value'] as string) ?? ''),
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

  // --- Lifecycle ---

  async publishProcess(id: string): Promise<void> {
    assertGuid(id, 'processId');
    await withRetry(() =>
      this.xrm.WebApi.updateRecord(LOGICAL.process, id, {
        statuscode: 2,
      })
    );
  }

  // --- Roles (ISopAdapter) ---

  async getRoles(search?: string): Promise<CrmRole[]> {
    try {
      const searchFilter = search
        ? ` and contains(qdb_name,'${escapeODataLiteral(search)}')`
        : '';
      const result = await withRetry(() =>
        this.xrm.WebApi.retrieveMultipleRecords(
          LOGICAL.role,
          `?$select=qdb_roleid,qdb_name,qdb_description,qdb_department,statecode,statuscode&$filter=statecode eq 0${searchFilter}&$top=200&$orderby=qdb_name asc`
        )
      );
      return result.entities.map(mapRole);
    } catch (err) {
      throw asError(err, 'getRoles');
    }
  }

  async createRole(data: CreateRoleRequest): Promise<string> {
    const body: Record<string, unknown> = {
      qdb_name: data.name,
      qdb_description: data.description,
      qdb_department: data.department,
    };
    const result = await withRetry(() => this.xrm.WebApi.createRecord(LOGICAL.role, body));
    return result.id;
  }

  async updateRole(id: string, data: UpdateRoleRequest): Promise<void> {
    assertGuid(id, 'roleId');
    const body: Record<string, unknown> = {};
    if (data.name !== undefined) body['qdb_name'] = data.name;
    if (data.description !== undefined) body['qdb_description'] = data.description;
    if (data.department !== undefined) body['qdb_department'] = data.department;
    if (data.status !== undefined) {
      // Standard Dataverse activation: statecode 0=Active/1=Inactive, statuscode 1=Active/2=Inactive
      body['statecode']  = data.status === ROLE_STATUS.ACTIVE ? 0 : 1;
      body['statuscode'] = data.status === ROLE_STATUS.ACTIVE ? 1 : 2;
    }
    await withRetry(() => this.xrm.WebApi.updateRecord(LOGICAL.role, id, body));
  }

  async deleteRole(id: string): Promise<void> {
    assertGuid(id, 'roleId');
    await withRetry(() => this.xrm.WebApi.deleteRecord(LOGICAL.role, id));
  }

  // --- SOPs (ISopAdapter) ---

  async getSopList(): Promise<SopSummary[]> {
    try {
      const result = await withRetry(() =>
        this.xrm.WebApi.retrieveMultipleRecords(
          LOGICAL.sop,
          `?$select=qdb_sopid,qdb_name,qdb_status,qdb_version,_qdb_recordtype_id_value&$orderby=qdb_name asc&$top=200`
        )
      );
      return result.entities.map(mapSopSummary);
    } catch (err) {
      throw asError(err, 'getSopList');
    }
  }

  async getSop(id: string): Promise<Sop> {
    assertGuid(id, 'sopId');
    const raw = await withRetry(() =>
      this.xrm.WebApi.retrieveRecord(
        LOGICAL.sop,
        id,
        `?$select=qdb_sopid,qdb_name,qdb_description,qdb_purpose,qdb_status,qdb_version,_qdb_recordtype_id_value`
      )
    );
    return mapSop(raw as Record<string, unknown>);
  }

  async createSop(data: CreateSopRequest): Promise<string> {
    const body: Record<string, unknown> = {
      qdb_name: data.name,
      qdb_description: data.description,
      qdb_purpose: data.purpose,
      qdb_version: data.version,
    };
    if (data.recordTypeId) {
      body[`qdb_recordtype_id@odata.bind`] = `/${SET.process}(${data.recordTypeId})`;
    }
    const result = await withRetry(() => this.xrm.WebApi.createRecord(LOGICAL.sop, body));
    return result.id;
  }

  async updateSop(id: string, data: UpdateSopRequest): Promise<void> {
    assertGuid(id, 'sopId');
    const body: Record<string, unknown> = {};
    if (data.name !== undefined) body['qdb_name'] = data.name;
    if (data.description !== undefined) body['qdb_description'] = data.description;
    if (data.purpose !== undefined) body['qdb_purpose'] = data.purpose;
    if (data.version !== undefined) body['qdb_version'] = data.version;
    if (data.status !== undefined) body['qdb_status'] = data.status;
    if (data.recordTypeId !== undefined) {
      if (data.recordTypeId) {
        body[`qdb_recordtype_id@odata.bind`] = `/${SET.process}(${data.recordTypeId})`;
      } else {
        body['qdb_recordtype_id@odata.bind'] = null;
      }
    }
    await withRetry(() => this.xrm.WebApi.updateRecord(LOGICAL.sop, id, body));
  }

  // --- SOP Steps (ISopAdapter) ---

  async getSopSteps(sopId: string): Promise<SopStep[]> {
    assertGuid(sopId, 'sopId');
    const result = await withRetry(() =>
      this.xrm.WebApi.retrieveMultipleRecords(
        LOGICAL.sopStep,
        `?$select=qdb_sopstepid,qdb_name,qdb_description,qdb_sequenceno,qdb_steptypecode,qdb_executionchannel,qdb_decisionlabel,_qdb_sop_id_value,_qdb_role_id_value&$filter=_qdb_sop_id_value eq ${sopId}&$orderby=qdb_sequenceno asc`
      )
    );
    return result.entities.map(mapSopStep);
  }

  async createSopStep(data: CreateSopStepRequest): Promise<string> {
    assertGuid(data.sopId, 'sopId');
    const body: Record<string, unknown> = {
      qdb_name:       data.name,
      qdb_description: data.description,
      qdb_sequenceno: data.sequenceNo,
      qdb_steptypecode:    SOP_STEP_TYPE_OPTION_VALUE[data.stepType ?? 'step'],
      qdb_executionchannel: data.executionChannel ?? null,
      qdb_decisionlabel:   data.decisionLabel ?? null,
      [`qdb_sop_id@odata.bind`]: `/${SET.sop}(${data.sopId})`,
    };
    if (data.roleId) {
      body[`qdb_role_id@odata.bind`] = `/${SET.role}(${data.roleId})`;
    }
    const result = await withRetry(() => this.xrm.WebApi.createRecord(LOGICAL.sopStep, body));
    return result.id;
  }

  async updateSopStep(id: string, data: UpdateSopStepRequest): Promise<void> {
    assertGuid(id, 'sopStepId');
    const body: Record<string, unknown> = {};
    if (data.name !== undefined)      body['qdb_name']        = data.name;
    if (data.description !== undefined) body['qdb_description'] = data.description;
    if (data.sequenceNo !== undefined) body['qdb_sequenceno']  = data.sequenceNo;
    if (data.stepType !== undefined)        body['qdb_steptypecode']      = SOP_STEP_TYPE_OPTION_VALUE[data.stepType];
    if (data.executionChannel !== undefined) body['qdb_executionchannel'] = data.executionChannel ?? null;
    if (data.decisionLabel !== undefined)   body['qdb_decisionlabel']    = data.decisionLabel ?? null;
    if (data.roleId !== undefined) {
      body[`qdb_role_id@odata.bind`] = data.roleId ? `/${SET.role}(${data.roleId})` : null;
    }
    await withRetry(() => this.xrm.WebApi.updateRecord(LOGICAL.sopStep, id, body));
  }

  async deleteSopStep(id: string): Promise<void> {
    assertGuid(id, 'sopStepId');
    await withRetry(() => this.xrm.WebApi.deleteRecord(LOGICAL.sopStep, id));
  }

  // --- SOP Outcomes (ISopAdapter) ---

  async getSopOutcomes(sopStepId: string): Promise<SopOutcome[]> {
    assertGuid(sopStepId, 'sopStepId');
    const result = await withRetry(() =>
      this.xrm.WebApi.retrieveMultipleRecords(
        LOGICAL.sopOutcome,
        `?$select=qdb_sopoutcomeid,qdb_name,qdb_sequenceno,_qdb_sopstep_id_value,_qdb_nextsopstep_id_value&$filter=_qdb_sopstep_id_value eq ${sopStepId}&$orderby=qdb_sequenceno asc`
      )
    );
    return result.entities.map(mapSopOutcome);
  }

  async createSopOutcome(data: CreateSopOutcomeRequest): Promise<string> {
    assertGuid(data.sopStepId, 'sopStepId');
    const body: Record<string, unknown> = {
      qdb_name: data.name,
      qdb_sequenceno: data.sequenceNo,
      [`qdb_sopstep_id@odata.bind`]: `/${SET.sopStep}(${data.sopStepId})`,
    };
    if (data.nextSopStepId) {
      body[`qdb_nextsopstep_id@odata.bind`] = `/${SET.sopStep}(${data.nextSopStepId})`;
    }
    const result = await withRetry(() => this.xrm.WebApi.createRecord(LOGICAL.sopOutcome, body));
    return result.id;
  }

  async updateSopOutcome(id: string, data: UpdateSopOutcomeRequest): Promise<void> {
    assertGuid(id, 'sopOutcomeId');
    const body: Record<string, unknown> = {};
    if (data.name !== undefined) body['qdb_name'] = data.name;
    if (data.sequenceNo !== undefined) body['qdb_sequenceno'] = data.sequenceNo;
    if (data.nextSopStepId !== undefined) {
      body[`qdb_nextsopstep_id@odata.bind`] = data.nextSopStepId
        ? `/${SET.sopStep}(${data.nextSopStepId})`
        : null;
    }
    await withRetry(() => this.xrm.WebApi.updateRecord(LOGICAL.sopOutcome, id, body));
  }

  async deleteSopOutcome(id: string): Promise<void> {
    assertGuid(id, 'sopOutcomeId');
    await withRetry(() => this.xrm.WebApi.deleteRecord(LOGICAL.sopOutcome, id));
  }

  // --- Derivation (ISopAdapter) ---

  async createProcessFromSop(request: CreateProcessFromSopRequest): Promise<string> {
    return deriveProcessFromSop(this, request);
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
            nextStepId: route.nextStepId ? (stepIdMap[route.nextStepId] ?? route.nextStepId) : null,
          });
        }
      }
    }

    return newId;
  }

  async logAuditEntry(entry: { action: string; entityId: string; detail: string | undefined; timestamp: string }): Promise<void> {
    await this.xrm.WebApi.createRecord(LOGICAL.auditLog, {
      qdb_action: entry.action,
      qdb_entityid: entry.entityId,
      qdb_detail: entry.detail,
      qdb_timestamp: entry.timestamp,
    });
  }
}

// --- Mappers ---

const FMT = '@OData.Community.Display.V1.FormattedValue';

function mapProcess(raw: Record<string, unknown>): WorkflowProcess {
  return {
    crmId: (raw['qdb_work_item_record_typeid'] as string) ?? '',
    name: (raw['qdb_name'] as string) ?? '',
    recordEntity: (raw['_qdb_recordentity_value'] as string) ?? '',
    recordEntityName: (raw[`_qdb_recordentity_value${FMT}`] as string | null) ?? null,
    regardingField: (raw['_qdb_regardingfield_value'] as string) ?? '',
    parentEntity: (raw['_qdb_parententity_value'] as string) ?? '',
    parentEntityName: (raw[`_qdb_parententity_value${FMT}`] as string | null) ?? null,
    versionMajor: 1,
    versionMinor: 0,
    workflowState: 'draft',
    snapshot: null,
  };
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
    assignedUserName: (raw[`_qdb_assigned_user_value${FMT}`] as string | null) ?? null,
    teamId: (raw['_qdb_team_value'] as string | null) ?? null,
    teamName: (raw[`_qdb_team_value${FMT}`] as string | null) ?? null,
    roundRobinTeamId: (raw['_qdb_roundrobinteam_value'] as string | null) ?? null,
    roundRobinTeamName: (raw[`_qdb_roundrobinteam_value${FMT}`] as string | null) ?? null,
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
    nextStepId: (raw['_qdb_nextworkitemstep_value'] as string | null) ?? null,
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
    nextStepId: (raw['_qdb_nextworkitemstep_value'] as string | null) ?? null,
  };
}

// --- Body builders ---

function buildProcessBody(data: Partial<Omit<WorkflowProcess, 'crmId'>>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (data.name !== undefined) body['qdb_name'] = data.name;
  return body;
}

function buildStepBody(data: Partial<Omit<WorkflowStep, 'crmId'>>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (data.name !== undefined) body['qdb_name'] = data.name;
  if (data.sequenceNo !== undefined) body['qdb_sequenceno'] = data.sequenceNo;
  if (data.taskSubject !== undefined) body['qdb_tasksubject'] = data.taskSubject;
  if (data.taskDescription !== undefined) body['qdb_taskdescription'] = data.taskDescription;
  if (data.assignTo !== undefined) {
    body['qdb_task_assign_to'] = ASSIGN_TO_CODES[data.assignTo];
    body['qdb_enableroundrobin'] = data.assignTo === 'roundRobin';
  }
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
  if (data.filter !== undefined) {
    const hasFilter = data.filter.length > 0;
    body['qdb_filter'] = hasFilter ? data.filter : '<filter type="and"></filter>';
    body['qdb_isdefaultcondition'] = !hasFilter;
  }
  if (data.outcomeId) {
    body['qdb_Outcome@odata.bind'] = `/${SET.outcome}(${data.outcomeId})`;
  }
  if (data.nextStepId) {
    body['qdb_NextWorkItemStep@odata.bind'] = `/${SET.step}(${data.nextStepId})`;
  }
  return body;
}

// --- SOP Mappers ---

function mapRole(raw: Record<string, unknown>): CrmRole {
  // statecode 0=Active, 1=Inactive — standard Dataverse activation field
  const statecode = (raw['statecode'] as number) ?? 0;
  return {
    id: normaliseGuid((raw['qdb_roleid'] as string) ?? ''),
    name: (raw['qdb_name'] as string) ?? '',
    description: (raw['qdb_description'] as string) ?? '',
    department: (raw['qdb_department'] as string) ?? '',
    status: statecode === 0 ? ROLE_STATUS.ACTIVE : ROLE_STATUS.INACTIVE,
  };
}

function mapSopSummary(raw: Record<string, unknown>): SopSummary {
  return {
    id: (raw['qdb_sopid'] as string) ?? '',
    name: (raw['qdb_name'] as string) ?? '',
    status: ((raw['qdb_status'] as number) ?? SOP_STATUS.DRAFT) as SopStatus,
    version: (raw['qdb_version'] as string) ?? '1.0',
    recordTypeId: (raw['_qdb_recordtype_id_value'] as string | null) ?? null,
    recordTypeName:
      (raw[`_qdb_recordtype_id_value${FMT}`] as string | null) ?? null,
    derivedProcessCount: 0,
  };
}

function mapSop(raw: Record<string, unknown>): Sop {
  return {
    id: (raw['qdb_sopid'] as string) ?? '',
    name: (raw['qdb_name'] as string) ?? '',
    description: (raw['qdb_description'] as string) ?? '',
    purpose: (raw['qdb_purpose'] as string) ?? '',
    status: ((raw['qdb_status'] as number) ?? SOP_STATUS.DRAFT) as SopStatus,
    version: (raw['qdb_version'] as string) ?? '1.0',
    recordTypeId: (raw['_qdb_recordtype_id_value'] as string | null) ?? null,
    recordTypeName:
      (raw[`_qdb_recordtype_id_value${FMT}`] as string | null) ?? null,
  };
}

function mapSopStep(raw: Record<string, unknown>): SopStep {
  const channelRaw = raw['qdb_executionchannel'] as string | null;
  return {
    id: normaliseGuid((raw['qdb_sopstepid'] as string) ?? ''),
    name: (raw['qdb_name'] as string) ?? '',
    description: (raw['qdb_description'] as string) ?? '',
    sequenceNo: (raw['qdb_sequenceno'] as number) ?? 0,
    sopId: (raw['_qdb_sop_id_value'] as string) ?? '',
    roleId: raw['_qdb_role_id_value'] ? normaliseGuid(raw['_qdb_role_id_value'] as string) : null,
    roleName: (raw[`_qdb_role_id_value${FMT}`] as string | null) ?? null,
    roleStatus: null,
    stepType: SOP_STEP_TYPE_FROM_OPTION_VALUE[raw['qdb_steptypecode'] as number] ?? 'step',
    executionChannel: channelRaw === 'crm' || channelRaw === 'manual' ? channelRaw : null,
    decisionLabel: (raw['qdb_decisionlabel'] as string | null) ?? null,
  };
}

function mapSopOutcome(raw: Record<string, unknown>): SopOutcome {
  const rawNextId = (raw['_qdb_nextsopstep_id_value'] as string | null) ?? null;
  return {
    id: (raw['qdb_sopoutcomeid'] as string) ?? '',
    name: (raw['qdb_name'] as string) ?? '',
    sequenceNo: (raw['qdb_sequenceno'] as number) ?? 0,
    sopStepId: normaliseGuid((raw['_qdb_sopstep_id_value'] as string) ?? ''),
    nextSopStepId: rawNextId ? normaliseGuid(rawNextId) : null,
  };
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

// Xrm.WebApi rejects with a plain {errorCode, message} object, not an Error instance.
// This converts it so React Query and catch blocks receive a real Error with the detail.
function asError(err: unknown, context: string): Error {
  // Always log the raw error so it's visible in browser DevTools regardless of UI state
  logError(`DataverseAdapter:${context}`, err);
  if (err instanceof Error) return err;
  if (typeof err === 'object' && err !== null) {
    const xrm = err as Record<string, unknown>;
    const msg = typeof xrm['message'] === 'string' ? xrm['message'] : JSON.stringify(xrm);
    return new Error(`[${context}] ${msg}`);
  }
  return new Error(`[${context}] ${String(err)}`);
}
