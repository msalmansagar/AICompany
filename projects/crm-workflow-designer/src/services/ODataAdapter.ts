import type { ISopAdapter } from './ISopAdapter';
import { DESIGNER_LAYOUT_SUBJECT } from './designerLayout';
import { DESIGNER_STATE_SUBJECT } from './designerState';
import { deriveProcessFromSop } from './deriveProcessFromSop';
import type { CrmEnvironmentService } from './CrmEnvironmentService';
import { assertGuid } from './assertGuid';
import { escapeODataLiteral } from './odataEscape';
import { buildUserLookupFilter } from './userLookupFilter';
import { EMPTY_FILTER } from './routeFilter';
import { mapEscalationConfig, mapEscalationFields, buildEscalationBody, buildEscalationConfigBindPatch, ESCALATION_SELECT_COLUMNS, ESCALATION_CONFIG_SET, ESCALATION_CONFIG_ID, ODATA_FORMATTED_VALUE_ANNOTATION as FMT } from './escalationFields';
import { mapWorkflowHooks, buildWorkflowHookBindPatches, hookSelectColumns, mapCallableWorkflow, mapCallableAction, dedupeActionsByMessage, CALLABLE_WORKFLOW_QUERY, CALLABLE_ACTION_QUERY, WORKFLOW_SET, STEP_HOOKS, OUTCOME_HOOKS, ROUTE_HOOKS, PROCESS_HOOKS } from './workflowHooks';
import type { CallableActionOption, CallableWorkflowOption } from './workflowHooks';
import { mapBranchFields, buildBranchBody, buildParentStepBindPatch, mapOutcomeConcurrency, buildOutcomeConcurrencyBody, BRANCH_SELECT_COLUMNS, OUTCOME_CONCURRENCY_SELECT_COLUMNS } from './branchFields';
import { withRetry } from './withRetry';
import {
  ASSIGNMENT_LOOKUP_COLUMNS,
  ASSIGNMENT_SELECT_COLUMNS,
  buildAssignmentBody,
  mapAssignmentFields,
} from './taskAssignment';
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
import type { RawEntityMetadata, RawAttributeMetadata } from '@/types/CrmTypes';
import { ROLE_STATUS, SOP_STATUS, SOP_STEP_TYPE_FROM_OPTION_VALUE, SOP_STEP_TYPE_OPTION_VALUE } from '@/types/SopTypes';
import type {
  CrmRole,
  Sop,
  SopSummary,
  SopStep,
  SopOutcome,
  SopStatus,
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

const ENTITY_SETS = {
  process: 'qdb_work_item_record_types',
  step: 'qdb_work_item_stepses',
  outcome: 'qdb_outcomes',
  route: 'qdb_outcomeworktaskses',
  crmEntity: 'crmi_autonumber_system_entitieses',
  crmField: 'crmi_autonumber_entities_fieldses',
  roundRobinTeam: 'qdb_roundrobinteams',
  role: 'qdb_roles',
  sop: 'qdb_sops',
  sopStep: 'qdb_sopsteps',
  sopOutcome: 'qdb_sopoutcomes',
  auditLog: 'qdb_form_audit_logs',
} as const;

export class ODataAdapter implements ISopAdapter {
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
      // createdby is expanded rather than read from a formatted-value annotation:
      // buildODataHeaders does not ask for annotations, so the name would come back empty.
      `${ENTITY_SETS.process}?$select=qdb_work_item_record_typeid,qdb_name,createdon,_qdb_recordentity_value,_qdb_regardingfield_value,_qdb_parententity_value,${hookSelectColumns(PROCESS_HOOKS)}` +
      `&$expand=createdby($select=fullname)`
    );
    return data.value.map(mapProcess);
  }

  async getProcess(id: string): Promise<WorkflowProcess> {
    assertGuid(id, 'processId');
    const raw = await this.get<Record<string, unknown>>(
      `${ENTITY_SETS.process}(${id})?$select=qdb_work_item_record_typeid,qdb_name,_qdb_recordentity_value,_qdb_regardingfield_value,_qdb_parententity_value,${hookSelectColumns(PROCESS_HOOKS)}`
    );
    return mapProcess(raw);
  }

  async createProcess(data: Omit<WorkflowProcess, 'crmId'>): Promise<string> {
    return this.post(ENTITY_SETS.process, await this.buildProcessBodyResolved(data));
  }

  async loadDesignerLayout(processId: string): Promise<string | null> {
    assertGuid(processId, 'processId');
    const data = await this.get<{ value: Array<{ annotationid: string; notetext: string | null }> }>(
      `annotations?$select=annotationid,notetext&$filter=_objectid_value eq ${processId} and subject eq '${DESIGNER_LAYOUT_SUBJECT}'&$top=1&$orderby=modifiedon desc`
    );
    return data.value[0]?.notetext ?? null;
  }

  async saveDesignerLayout(processId: string, layoutJson: string): Promise<void> {
    assertGuid(processId, 'processId');
    const existing = await this.get<{ value: Array<{ annotationid: string }> }>(
      `annotations?$select=annotationid&$filter=_objectid_value eq ${processId} and subject eq '${DESIGNER_LAYOUT_SUBJECT}'&$top=1`
    );
    const found = existing.value[0];
    if (found) {
      await this.patch(`annotations(${found.annotationid})`, { notetext: layoutJson });
      return;
    }
    await this.post('annotations', {
      subject: DESIGNER_LAYOUT_SUBJECT,
      notetext: layoutJson,
      [`objectid_qdb_work_item_record_type@odata.bind`]: `/${ENTITY_SETS.process}(${processId})`,
    });
  }

  async loadDesignerState(processId: string): Promise<string | null> {
    assertGuid(processId, 'processId');
    const data = await this.get<{ value: Array<{ notetext: string | null }> }>(
      `annotations?$select=notetext&$filter=_objectid_value eq ${processId} and subject eq '${DESIGNER_STATE_SUBJECT}'&$top=1&$orderby=modifiedon desc`
    );
    return data.value[0]?.notetext ?? null;
  }

  async saveDesignerState(processId: string, stateJson: string): Promise<void> {
    assertGuid(processId, 'processId');
    const existing = await this.get<{ value: Array<{ annotationid: string }> }>(
      `annotations?$select=annotationid&$filter=_objectid_value eq ${processId} and subject eq '${DESIGNER_STATE_SUBJECT}'&$top=1`
    );
    const found = existing.value[0];
    if (found) {
      await this.patch(`annotations(${found.annotationid})`, { notetext: stateJson });
      return;
    }
    await this.post('annotations', {
      subject: DESIGNER_STATE_SUBJECT,
      notetext: stateJson,
      [`objectid_qdb_work_item_record_type@odata.bind`]: `/${ENTITY_SETS.process}(${processId})`,
    });
  }

  async loadAllDesignerStates(): Promise<Record<string, string>> {
    const data = await this.get<{ value: Array<{ notetext: string | null; _objectid_value: string }> }>(
      `annotations?$select=notetext,_objectid_value&$filter=subject eq '${DESIGNER_STATE_SUBJECT}'&$orderby=modifiedon desc`
    );
    const byProcess: Record<string, string> = {};
    for (const note of data.value) {
      // Ordered newest first, so the first entry per process wins.
      if (note.notetext && !byProcess[note._objectid_value]) {
        byProcess[note._objectid_value] = note.notetext;
      }
    }
    return byProcess;
  }

  async updateProcess(id: string, data: Partial<Omit<WorkflowProcess, 'crmId'>>): Promise<void> {
    assertGuid(id, 'processId');
    await this.patch(`${ENTITY_SETS.process}(${id})`, await this.buildProcessBodyResolved(data as Omit<WorkflowProcess, 'crmId'>));
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
      if (data.recordEntity   && re)  body[`${re}@odata.bind`]  = `/${ENTITY_SETS.crmEntity}(${data.recordEntity})`;
      if (data.regardingField && rf)  body[`${rf}@odata.bind`]  = `/${ENTITY_SETS.crmField}(${data.regardingField})`;
      if (data.parentEntity   && pe)  body[`${pe}@odata.bind`]  = `/${ENTITY_SETS.crmEntity}(${data.parentEntity})`;
      if (data.sopId          && sop) body[`${sop}@odata.bind`] = `/${ENTITY_SETS.sop}(${data.sopId})`;
    }
    Object.assign(
      body,
      await buildWorkflowHookBindPatches(data.workflowHooks, (e, a) => this.resolveNavProp(e, a), 'qdb_work_item_record_type', WORKFLOW_SET)
    );
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
      `${ENTITY_SETS.step}?$select=qdb_work_item_stepsid,qdb_name,qdb_schemaname,qdb_sequenceno,qdb_tasksubject,qdb_taskdescription,_qdb_recordentity_value,_qdb_regardingfield_value,_qdb_parententity_value,qdb_allowbulkapproval,${ASSIGNMENT_SELECT_COLUMNS},${ESCALATION_SELECT_COLUMNS},${BRANCH_SELECT_COLUMNS},${hookSelectColumns(STEP_HOOKS)}&$filter=_qdb_record_type_value eq ${processId}`
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
    const E = 'qdb_work_item_steps';
    const [re, rf, pe, au, tm, rr, rt, pae, paf, pau] = await Promise.all([
      data.recordEntityId   ? this.resolveNavProp(E, 'qdb_recordentity')   : Promise.resolve(''),
      data.regardingFieldId ? this.resolveNavProp(E, 'qdb_regardingfield') : Promise.resolve(''),
      data.parentEntityId   ? this.resolveNavProp(E, 'qdb_parententity')   : Promise.resolve(''),
      data.assignedUserId   ? this.resolveNavProp(E, ASSIGNMENT_LOOKUP_COLUMNS.assignedUser)   : Promise.resolve(''),
      data.teamId           ? this.resolveNavProp(E, ASSIGNMENT_LOOKUP_COLUMNS.team)           : Promise.resolve(''),
      data.roundRobinTeamId ? this.resolveNavProp(E, ASSIGNMENT_LOOKUP_COLUMNS.roundRobinTeam) : Promise.resolve(''),
      data.processId        ? this.resolveNavProp(E, 'qdb_record_type')    : Promise.resolve(''),
      data.parentAssignEntityId    ? this.resolveNavProp(E, ASSIGNMENT_LOOKUP_COLUMNS.parentEntity)    : Promise.resolve(''),
      data.parentAssignFieldId     ? this.resolveNavProp(E, ASSIGNMENT_LOOKUP_COLUMNS.parentField)     : Promise.resolve(''),
      data.parentAssignUserFieldId ? this.resolveNavProp(E, ASSIGNMENT_LOOKUP_COLUMNS.parentUserField) : Promise.resolve(''),
    ]);
    if (data.recordEntityId   && re) body[`${re}@odata.bind`] = `/${ENTITY_SETS.crmEntity}(${data.recordEntityId})`;
    if (data.regardingFieldId && rf) body[`${rf}@odata.bind`] = `/${ENTITY_SETS.crmField}(${data.regardingFieldId})`;
    if (data.parentEntityId   && pe) body[`${pe}@odata.bind`] = `/${ENTITY_SETS.crmEntity}(${data.parentEntityId})`;
    if (data.assignedUserId   && au) body[`${au}@odata.bind`] = `/systemusers(${data.assignedUserId})`;
    if (data.teamId           && tm) body[`${tm}@odata.bind`] = `/teams(${data.teamId})`;
    if (data.roundRobinTeamId && rr) body[`${rr}@odata.bind`] = `/qdb_roundrobinteams(${data.roundRobinTeamId})`;
    if (data.processId        && rt) body[`${rt}@odata.bind`] = `/${ENTITY_SETS.process}(${data.processId})`;
    if (data.parentAssignEntityId    && pae) body[`${pae}@odata.bind`] = `/${ENTITY_SETS.crmEntity}(${data.parentAssignEntityId})`;
    if (data.parentAssignFieldId     && paf) body[`${paf}@odata.bind`] = `/${ENTITY_SETS.crmField}(${data.parentAssignFieldId})`;
    if (data.parentAssignUserFieldId && pau) body[`${pau}@odata.bind`] = `/${ENTITY_SETS.crmField}(${data.parentAssignUserFieldId})`;
    Object.assign(
      body,
      await buildEscalationConfigBindPatch(data, (e, a) => this.resolveNavProp(e, a), E, ESCALATION_CONFIG_SET)
    );
    Object.assign(
      body,
      await buildParentStepBindPatch(data, (e, a) => this.resolveNavProp(e, a), E, ENTITY_SETS.step)
    );
    Object.assign(
      body,
      await buildWorkflowHookBindPatches(data.workflowHooks, (e, a) => this.resolveNavProp(e, a), E, WORKFLOW_SET)
    );
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
      `${ENTITY_SETS.outcome}?$select=qdb_outcomeid,qdb_name,qdb_sequencenumber,qdb_applyfilter,_qdb_workitemstep_value,_qdb_nextworkitemstep_value,${OUTCOME_CONCURRENCY_SELECT_COLUMNS},${hookSelectColumns(OUTCOME_HOOKS)}&$filter=_qdb_workitemstep_value eq ${stepId}`
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
    Object.assign(
      body,
      await buildWorkflowHookBindPatches(data.workflowHooks, (e, a) => this.resolveNavProp(e, a), 'qdb_outcome', WORKFLOW_SET)
    );
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
      `${ENTITY_SETS.route}?$select=qdb_outcomeworktasksid,qdb_name,qdb_subject,qdb_sequencenumber,qdb_filter,qdb_isdefaultcondition,_qdb_outcome_value,_qdb_nextworkitemstep_value,${hookSelectColumns(ROUTE_HOOKS)}&$filter=_qdb_outcome_value eq ${outcomeId}`
    );
    return data.value.map(mapRoute);
  }

  private async buildRouteBodyResolved(data: Partial<Omit<WorkflowRoute, 'crmId'>>): Promise<Record<string, unknown>> {
    const body = buildRouteBody(data);
    Object.assign(
      body,
      await buildWorkflowHookBindPatches(data.workflowHooks, (e, a) => this.resolveNavProp(e, a), 'qdb_outcomeworktasks', WORKFLOW_SET)
    );
    return body;
  }

  async createRoute(data: Omit<WorkflowRoute, 'crmId'>): Promise<string> {
    assertGuid(data.outcomeId, 'outcomeId');
    if (data.nextStepId) assertGuid(data.nextStepId, 'nextStepId');
    return this.post(ENTITY_SETS.route, await this.buildRouteBodyResolved(data));
  }

  async updateRoute(id: string, data: Partial<Omit<WorkflowRoute, 'crmId'>>): Promise<void> {
    assertGuid(id, 'routeId');
    await this.patch(`${ENTITY_SETS.route}(${id})`, await this.buildRouteBodyResolved(data));
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

  async getAttributesMeta(entityLogicalName: string): Promise<Array<{ logicalName: string; displayName: string; attributeType: string }>> {
    type Row = { LogicalName: string; DisplayName: { UserLocalizedLabel?: { Label: string } } | null; AttributeType: string };
    try {
      const data = await this.get<{ value: Row[] }>(
        `EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes?$select=LogicalName,DisplayName,AttributeType`
      );
      return data.value.map((a) => ({
        logicalName: a.LogicalName,
        displayName: a.DisplayName?.UserLocalizedLabel?.Label ?? a.LogicalName,
        attributeType: a.AttributeType,
      }));
    } catch {
      return [];
    }
  }

  async getOptionSetLabels(entityLogicalName: string, attributeLogicalName: string): Promise<Map<number, string>> {
    type OptionRow = { Value: number; Label: { UserLocalizedLabel?: { Label: string } } };

    const tryFetch = async (cast: string): Promise<OptionRow[]> => {
      const data = await this.get<{ value: Array<{ OptionSet?: { Options: OptionRow[] } }> }>(
        `EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes/${cast}` +
        `?$filter=LogicalName eq '${attributeLogicalName}'&$expand=OptionSet($select=Options)`
      );
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

  async getLookupValueName(
    entityLogicalName: string,
    attributeLogicalName: string,
    recordId: string
  ): Promise<string | null> {
    try {
      const attr = await this.get<{ Targets?: string[] }>(
        `EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes(LogicalName='${attributeLogicalName}')` +
        '/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=Targets'
      );
      const id = recordId.replace(/[{}]/g, '').toLowerCase();
      // A lookup can point at several entities (owner-style); the record only
      // exists in one of them, so each target is tried until one answers.
      for (const target of attr.Targets ?? []) {
        try {
          const def = await this.get<{ EntitySetName: string; PrimaryNameAttribute: string }>(
            `EntityDefinitions(LogicalName='${target}')?$select=EntitySetName,PrimaryNameAttribute`
          );
          const row = await this.get<Record<string, unknown>>(
            `${def.EntitySetName}(${id})?$select=${def.PrimaryNameAttribute}`
          );
          const name = row[def.PrimaryNameAttribute];
          if (typeof name === 'string' && name.trim()) return name;
        } catch {
          continue;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  async getUsers(search?: string): Promise<UserOption[]> {
    const filter = `&$filter=${buildUserLookupFilter(search ? escapeODataLiteral(search) : undefined)}`;
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

  async getCallableWorkflows(): Promise<CallableWorkflowOption[]> {
    const data = await this.get<{ value: Record<string, unknown>[] }>(CALLABLE_WORKFLOW_QUERY);
    return data.value.map(mapCallableWorkflow);
  }

  async getCallableTaskActions(): Promise<CallableActionOption[]> {
    const data = await this.get<{ value: Record<string, unknown>[] }>(CALLABLE_ACTION_QUERY);
    return dedupeActionsByMessage(data.value.map(mapCallableAction));
  }

  async getEscalationConfigs(): Promise<EscalationConfigOption[]> {
    const data = await this.get<{ value: Record<string, unknown>[] }>(
      `${ESCALATION_CONFIG_SET}?$select=${ESCALATION_CONFIG_ID},qdb_name,qdb_escalationvalue,qdb_escalationvalueunit&$orderby=qdb_name asc&$top=200`
    );
    return data.value.map(mapEscalationConfig);
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
      `${ENTITY_SETS.crmEntity}?$select=crmi_autonumber_system_entitiesid,crmi_name,crmi_logical_name,qdb_objecttypecode&$orderby=crmi_name asc&$top=5000`
    );
    return data.value.map((e) => ({
      id: normaliseGuid((e['crmi_autonumber_system_entitiesid'] as string) ?? ''),
      name: (e['crmi_name'] as string) ?? '',
      logicalName: (e['crmi_logical_name'] as string) ?? (e['qdb_entityschemaname'] as string) ?? '',
      objectTypeCode: Number(e['qdb_objecttypecode'] ?? 0),
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

  // --- Roles (ISopAdapter) ---

  async getRoles(search?: string): Promise<CrmRole[]> {
    const searchFilter = search
      ? ` and contains(qdb_name,'${escapeODataLiteral(search)}')`
      : '';
    const data = await this.get<{ value: Record<string, unknown>[] }>(
      `${ENTITY_SETS.role}?$select=qdb_roleid,qdb_name,qdb_description,qdb_department,statecode,statuscode` +
      `&$filter=statecode eq 0${searchFilter}&$top=200&$orderby=qdb_name asc`
    );
    return data.value.map(mapSopRole);
  }

  async createRole(data: CreateRoleRequest): Promise<string> {
    return this.post(ENTITY_SETS.role, {
      qdb_name: data.name,
      qdb_description: data.description,
      qdb_department: data.department,
    });
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
    await this.patch(`${ENTITY_SETS.role}(${id})`, body);
  }

  async deleteRole(id: string): Promise<void> {
    assertGuid(id, 'roleId');
    await this.del(`${ENTITY_SETS.role}(${id})`);
  }

  // --- SOPs (ISopAdapter) ---

  async getSopList(): Promise<SopSummary[]> {
    const data = await this.get<{ value: Record<string, unknown>[] }>(
      `${ENTITY_SETS.sop}?$select=qdb_sopid,qdb_name,qdb_status,qdb_version,_qdb_recordtype_id_value` +
      `&$orderby=qdb_name asc&$top=200`
    );
    return data.value.map(mapSopSummary);
  }

  async getSop(id: string): Promise<Sop> {
    assertGuid(id, 'sopId');
    const raw = await this.get<Record<string, unknown>>(
      `${ENTITY_SETS.sop}(${id})?$select=qdb_sopid,qdb_name,qdb_description,qdb_purpose,qdb_status,qdb_version,_qdb_recordtype_id_value`
    );
    return mapSop(raw);
  }

  async createSop(data: CreateSopRequest): Promise<string> {
    const body: Record<string, unknown> = {
      qdb_name: data.name,
      qdb_description: data.description,
      qdb_purpose: data.purpose,
      qdb_version: data.version,
    };
    if (data.recordTypeId) {
      body[`qdb_recordtype_id@odata.bind`] = `/${ENTITY_SETS.process}(${data.recordTypeId})`;
    }
    return this.post(ENTITY_SETS.sop, body);
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
      body['qdb_recordtype_id@odata.bind'] = data.recordTypeId
        ? `/${ENTITY_SETS.process}(${data.recordTypeId})`
        : null;
    }
    await this.patch(`${ENTITY_SETS.sop}(${id})`, body);
  }

  // --- SOP Steps (ISopAdapter) ---

  async getSopSteps(sopId: string): Promise<SopStep[]> {
    assertGuid(sopId, 'sopId');
    const data = await this.get<{ value: Record<string, unknown>[] }>(
      `${ENTITY_SETS.sopStep}?$select=qdb_sopstepid,qdb_name,qdb_description,qdb_sequenceno,qdb_steptypecode,qdb_executionchannel,qdb_decisionlabel,_qdb_sop_id_value,_qdb_role_id_value` +
      `&$filter=_qdb_sop_id_value eq ${sopId}&$orderby=qdb_sequenceno asc`
    );
    return data.value.map(mapSopStep);
  }

  async createSopStep(data: CreateSopStepRequest): Promise<string> {
    assertGuid(data.sopId, 'sopId');
    const body: Record<string, unknown> = {
      qdb_name:        data.name,
      qdb_description: data.description,
      qdb_sequenceno:  data.sequenceNo,
      qdb_steptypecode:    SOP_STEP_TYPE_OPTION_VALUE[data.stepType ?? 'step'],
      qdb_executionchannel: data.executionChannel ?? null,
      qdb_decisionlabel:   data.decisionLabel ?? null,
      [`qdb_sop_id@odata.bind`]: `/${ENTITY_SETS.sop}(${data.sopId})`,
    };
    if (data.roleId) {
      body[`qdb_role_id@odata.bind`] = `/${ENTITY_SETS.role}(${data.roleId})`;
    }

    return this.post(ENTITY_SETS.sopStep, body);
  }

  async updateSopStep(id: string, data: UpdateSopStepRequest): Promise<void> {
    assertGuid(id, 'sopStepId');
    const body: Record<string, unknown> = {};
    if (data.name !== undefined)       body['qdb_name']        = data.name;
    if (data.description !== undefined) body['qdb_description'] = data.description;
    if (data.sequenceNo !== undefined)  body['qdb_sequenceno']  = data.sequenceNo;
    if (data.stepType !== undefined)         body['qdb_steptypecode']     = SOP_STEP_TYPE_OPTION_VALUE[data.stepType];
    if (data.executionChannel !== undefined) body['qdb_executionchannel'] = data.executionChannel ?? null;
    if (data.decisionLabel !== undefined)   body['qdb_decisionlabel']    = data.decisionLabel ?? null;
    if (data.roleId !== undefined) {
      body[`qdb_role_id@odata.bind`] = data.roleId
        ? `/${ENTITY_SETS.role}(${data.roleId})`
        : null;
    }

    await this.patch(`${ENTITY_SETS.sopStep}(${id})`, body);
  }

  async deleteSopStep(id: string): Promise<void> {
    assertGuid(id, 'sopStepId');
    await this.del(`${ENTITY_SETS.sopStep}(${id})`);
  }

  // --- SOP Outcomes (ISopAdapter) ---

  async getSopOutcomes(sopStepId: string): Promise<SopOutcome[]> {
    assertGuid(sopStepId, 'sopStepId');
    const data = await this.get<{ value: Record<string, unknown>[] }>(
      `${ENTITY_SETS.sopOutcome}?$select=qdb_sopoutcomeid,qdb_name,qdb_sequenceno,_qdb_sopstep_id_value,_qdb_nextsopstep_id_value` +
      `&$filter=_qdb_sopstep_id_value eq ${sopStepId}&$orderby=qdb_sequenceno asc`
    );
    return data.value.map(mapSopOutcome);
  }

  async createSopOutcome(data: CreateSopOutcomeRequest): Promise<string> {
    assertGuid(data.sopStepId, 'sopStepId');
    const body: Record<string, unknown> = {
      qdb_name: data.name,
      qdb_sequenceno: data.sequenceNo,
      [`qdb_sopstep_id@odata.bind`]: `/${ENTITY_SETS.sopStep}(${data.sopStepId})`,
    };
    if (data.nextSopStepId) {
      body[`qdb_nextsopstep_id@odata.bind`] = `/${ENTITY_SETS.sopStep}(${data.nextSopStepId})`;
    }
    return this.post(ENTITY_SETS.sopOutcome, body);
  }

  async updateSopOutcome(id: string, data: UpdateSopOutcomeRequest): Promise<void> {
    assertGuid(id, 'sopOutcomeId');
    const body: Record<string, unknown> = {};
    if (data.name !== undefined) body['qdb_name'] = data.name;
    if (data.sequenceNo !== undefined) body['qdb_sequenceno'] = data.sequenceNo;
    if (data.nextSopStepId !== undefined) {
      body[`qdb_nextsopstep_id@odata.bind`] = data.nextSopStepId
        ? `/${ENTITY_SETS.sopStep}(${data.nextSopStepId})`
        : null;
    }
    await this.patch(`${ENTITY_SETS.sopOutcome}(${id})`, body);
  }

  async deleteSopOutcome(id: string): Promise<void> {
    assertGuid(id, 'sopOutcomeId');
    await this.del(`${ENTITY_SETS.sopOutcome}(${id})`);
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
    await this.post(ENTITY_SETS.auditLog, {
      qdb_action: entry.action,
      qdb_entityid: entry.entityId,
      qdb_detail: entry.detail,
      qdb_timestamp: entry.timestamp,
    });
  }
}

// --- Mappers ---

function mapProcess(raw: Record<string, unknown>): WorkflowProcess {
  return {
    workflowHooks: mapWorkflowHooks(raw, PROCESS_HOOKS),
    crmId: (raw['qdb_work_item_record_typeid'] as string) ?? '',
    createdOn: (raw['createdon'] as string | null) ?? null,
    createdByName: readCreatedByName(raw),
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
    allowBulkApproval: (raw['qdb_allowbulkapproval'] as boolean) ?? false,
    processId: (raw['_qdb_record_type_value'] as string) ?? '',
    ...mapAssignmentFields(raw),
    ...mapEscalationFields(raw),
    ...mapBranchFields(raw),
    workflowHooks: mapWorkflowHooks(raw, STEP_HOOKS),
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
    ...mapOutcomeConcurrency(raw),
    workflowHooks: mapWorkflowHooks(raw, OUTCOME_HOOKS),
  };
}

function mapRoute(raw: Record<string, unknown>): WorkflowRoute {
  return {
    workflowHooks: mapWorkflowHooks(raw, ROUTE_HOOKS),
    crmId: raw['qdb_outcomeworktasksid'] as string,
    isDefault: (raw['qdb_isdefaultcondition'] as boolean) ?? false,
    name: (raw['qdb_name'] as string) ?? '',
    subject: (raw['qdb_subject'] as string) ?? '',
    sequenceNumber: (raw['qdb_sequencenumber'] as number) ?? 0,
    filter: (raw['qdb_filter'] as string) ?? '',
    outcomeId: (raw['_qdb_outcome_value'] as string) ?? '',
    nextStepId: (raw['_qdb_nextworkitemstep_value'] as string | null) ?? null,
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
  if (data.taskSubject !== undefined) body['qdb_tasksubject'] = data.taskSubject;
  if (data.taskDescription !== undefined) body['qdb_taskdescription'] = data.taskDescription;
  if (data.allowBulkApproval !== undefined) body['qdb_allowbulkapproval'] = data.allowBulkApproval;
  Object.assign(body, buildAssignmentBody(data));
  Object.assign(body, buildEscalationBody(data));
  Object.assign(body, buildBranchBody(data));
  return body;
}

function buildOutcomeBody(data: Partial<Omit<WorkflowOutcome, 'crmId'>>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (data.name !== undefined) body['qdb_name'] = data.name;
  if (data.sequenceNumber !== undefined) body['qdb_sequencenumber'] = data.sequenceNumber;
  if (data.applyFilter !== undefined) body['qdb_applyfilter'] = data.applyFilter;
  Object.assign(body, buildOutcomeConcurrencyBody(data));
  return body;
}

function buildRouteBody(data: Partial<Omit<WorkflowRoute, 'crmId'>>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (data.name !== undefined) body['qdb_name'] = data.name;
  if (data.subject !== undefined) body['qdb_subject'] = data.subject;
  if (data.sequenceNumber !== undefined) body['qdb_sequencenumber'] = data.sequenceNumber;
  if (data.filter !== undefined) {
    body['qdb_filter'] = data.filter.length > 0 ? data.filter : EMPTY_FILTER;
  }
  // Written from the model, never inferred from the filter. A default route stores
  // EMPTY_FILTER, which is a non-empty string, so inferring flipped the flag off on
  // every reload and the engine then rejected the save for having no condition.
  if (data.isDefault !== undefined) {
    body['qdb_isdefaultcondition'] = data.isDefault;
  }
  if (data.outcomeId) body['qdb_Outcome@odata.bind'] = `/${ENTITY_SETS.outcome}(${data.outcomeId})`;
  // "Not supplied" and "deliberately cleared" are different. Omitting the bind on a
  // patch leaves the previous next step in place, so a route could never be turned
  // back into a dead end once one had been set.
  if (data.nextStepId !== undefined) {
    body['qdb_NextWorkItemStep@odata.bind'] = data.nextStepId
      ? `/${ENTITY_SETS.step}(${data.nextStepId})`
      : null;
  }
  return body;
}

function mapSopRole(raw: Record<string, unknown>): CrmRole {
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
    recordTypeName: null,
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
    recordTypeName: null,
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
    roleName: null,
    roleStatus: null,
    stepType: SOP_STEP_TYPE_FROM_OPTION_VALUE[raw['qdb_steptypecode'] as number] ?? 'step',
    executionChannel: channelRaw === 'crm' || channelRaw === 'manual' ? channelRaw : null,
    decisionLabel: (raw['qdb_decisionlabel'] as string | null) ?? null,
    ...mapEscalationFields(raw),
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
    // Xrm.WebApi returns formatted values by default and CRM therefore showed the
    // assignee; this path did not ask for them, so every *Name read as null in dev.
    Prefer: 'odata.include-annotations="*"',
  };
}

/** The expanded createdby record, or null when the caller did not ask for it. */
function readCreatedByName(raw: Record<string, unknown>): string | null {
  const createdBy = raw['createdby'] as { fullname?: string } | null | undefined;
  return createdBy?.fullname ?? null;
}
