import type { CrmEnvironmentService, XrmPort } from './CrmEnvironmentService';
import type { CrmProcess, CrmStep, CrmOutcome, CrmRoute } from '../types/ViewTypes';
import { logError } from './logError';
import { mapControlFlowFields, CONTROL_FLOW_SELECT_COLUMNS } from './controlFlowFields';

// Logical entity names — used by Xrm.WebApi.* (it resolves OData set names internally)
const LOGICAL = {
  process: 'qdb_work_item_record_type',
  step: 'qdb_work_item_steps',
  outcome: 'qdb_outcome',
  route: 'qdb_outcomeworktasks',
} as const;

const PK = {
  process: 'qdb_work_item_record_typeid',
  step: 'qdb_work_item_stepsid',
  outcome: 'qdb_outcomeid',
  route: 'qdb_outcomeworktasksid',
} as const;

const FMT = '@OData.Community.Display.V1.FormattedValue';

const PROCESS_SELECT = [
  PK.process,
  'qdb_name',
  '_qdb_recordentity_value',
  '_qdb_regardingfield_value',
  '_qdb_parententity_value',
].join(',');

const STEP_SELECT = [
  PK.step,
  'qdb_name',
  'qdb_sequenceno',
  'qdb_schemaname',
  'qdb_tasksubject',
  'qdb_taskdescription',
  'qdb_task_assign_to',
  'qdb_enableroundrobin',
  '_qdb_assigned_user_value',
  '_qdb_team_value',
  '_qdb_roundrobinteam_value',
  '_qdb_recordentity_value',
  '_qdb_regardingfield_value',
  '_qdb_parententity_value',
  '_qdb_record_type_value',
  CONTROL_FLOW_SELECT_COLUMNS,
].join(',');

const OUTCOME_SELECT = [
  PK.outcome,
  'qdb_name',
  'qdb_sequencenumber',
  'qdb_applyfilter',
  '_qdb_workitemstep_value',
  '_qdb_nextworkitemstep_value',
].join(',');

const ROUTE_SELECT = [
  PK.route,
  'qdb_name',
  'qdb_subject',
  'qdb_sequencenumber',
  'qdb_filter',
  '_qdb_nextworkitemstep_value',
  '_qdb_outcome_value',
].join(',');

export class WorkflowDataService {
  private readonly xrm: XrmPort;

  constructor(env: CrmEnvironmentService) {
    this.xrm = env.getXrm();
  }

  async getProcesses(): Promise<CrmProcess[]> {
    try {
      const result = await this.xrm.WebApi.retrieveMultipleRecords(
        LOGICAL.process,
        `?$select=${PROCESS_SELECT}&$top=200&$orderby=qdb_name asc`
      );
      return result.entities.map((e) => mapProcess(e as Record<string, unknown>));
    } catch (err) {
      throw toError(err, 'getProcesses');
    }
  }

  async getProcessById(processId: string): Promise<CrmProcess> {
    try {
      const raw = await this.xrm.WebApi.retrieveRecord(
        LOGICAL.process,
        processId,
        `?$select=${PROCESS_SELECT}`
      );
      return mapProcess(raw as Record<string, unknown>);
    } catch (err) {
      throw toError(err, 'getProcessById');
    }
  }

  async getStepsByProcess(processId: string): Promise<CrmStep[]> {
    try {
      const result = await this.xrm.WebApi.retrieveMultipleRecords(
        LOGICAL.step,
        `?$select=${STEP_SELECT}&$filter=_qdb_record_type_value eq ${processId}&$orderby=qdb_sequenceno asc`
      );
      return result.entities.map((e) => mapStep(e as Record<string, unknown>));
    } catch (err) {
      throw toError(err, 'getStepsByProcess');
    }
  }

  async getOutcomesByStepIds(stepIds: string[]): Promise<CrmOutcome[]> {
    if (stepIds.length === 0) return [];
    try {
      const chunks = chunkArray(stepIds, 10);
      const batches = await Promise.all(
        chunks.map((chunk) => {
          const filter = chunk.map((id) => `_qdb_workitemstep_value eq ${id}`).join(' or ');
          return this.xrm.WebApi.retrieveMultipleRecords(
            LOGICAL.outcome,
            `?$select=${OUTCOME_SELECT}&$filter=${filter}&$orderby=qdb_sequencenumber asc`
          ).then((r) => r.entities.map((e) => mapOutcome(e as Record<string, unknown>)));
        })
      );
      return batches.flat();
    } catch (err) {
      throw toError(err, 'getOutcomesByStepIds');
    }
  }

  async getRoutesByOutcomeIds(outcomeIds: string[]): Promise<CrmRoute[]> {
    if (outcomeIds.length === 0) return [];
    try {
      const chunks = chunkArray(outcomeIds, 10);
      const batches = await Promise.all(
        chunks.map((chunk) => {
          const filter = chunk.map((id) => `_qdb_outcome_value eq ${id}`).join(' or ');
          return this.xrm.WebApi.retrieveMultipleRecords(
            LOGICAL.route,
            `?$select=${ROUTE_SELECT}&$filter=${filter}&$orderby=qdb_sequencenumber asc`
          ).then((r) => r.entities.map((e) => mapRoute(e as Record<string, unknown>)));
        })
      );
      return batches.flat();
    } catch (err) {
      throw toError(err, 'getRoutesByOutcomeIds');
    }
  }
}

// --- Field helpers ---

function str(raw: Record<string, unknown>, key: string): string {
  return (raw[key] as string | null | undefined) ?? '';
}

function strNull(raw: Record<string, unknown>, key: string): string | null {
  const v = raw[key];
  return typeof v === 'string' ? v : null;
}

// Normalizes Dataverse GUIDs: strips curly braces and lowercases.
// Lookup fields (_xxx_value) can return {guid} format; PK fields return bare GUIDs.
// Both must match for React Flow node-to-edge id lookups.
function guid(raw: Record<string, unknown>, key: string): string {
  const v = raw[key];
  const s = typeof v === 'string' ? v : '';
  return s.replace(/^\{|\}$/g, '').toLowerCase();
}

function guidNull(raw: Record<string, unknown>, key: string): string | null {
  const v = raw[key];
  if (typeof v !== 'string' || !v) return null;
  return v.replace(/^\{|\}$/g, '').toLowerCase();
}

function num(raw: Record<string, unknown>, key: string, fallback: number): number {
  const v = raw[key];
  return typeof v === 'number' ? v : fallback;
}

function bool(raw: Record<string, unknown>, key: string): boolean {
  return raw[key] === true;
}

function fmt(raw: Record<string, unknown>, key: string): string | null {
  return strNull(raw, `${key}${FMT}`);
}

// --- Mappers ---

function mapProcess(raw: Record<string, unknown>): CrmProcess {
  return {
    id: guid(raw, PK.process),
    name: str(raw, 'qdb_name'),
    recordEntityId: guidNull(raw, '_qdb_recordentity_value'),
    recordEntityName: fmt(raw, '_qdb_recordentity_value'),
    regardingFieldId: guidNull(raw, '_qdb_regardingfield_value'),
    regardingFieldName: fmt(raw, '_qdb_regardingfield_value'),
    parentEntityId: guidNull(raw, '_qdb_parententity_value'),
    parentEntityName: fmt(raw, '_qdb_parententity_value'),
  };
}

function mapStep(raw: Record<string, unknown>): CrmStep {
  return {
    id: guid(raw, PK.step),
    name: str(raw, 'qdb_name'),
    sequenceNo: num(raw, 'qdb_sequenceno', 0),
    schemaName: str(raw, 'qdb_schemaname'),
    taskSubject: str(raw, 'qdb_tasksubject'),
    taskDescription: str(raw, 'qdb_taskdescription'),
    assignToCode: num(raw, 'qdb_task_assign_to', 100000000),
    enableRoundRobin: bool(raw, 'qdb_enableroundrobin'),
    assignedUserId: guidNull(raw, '_qdb_assigned_user_value'),
    assignedUserName: fmt(raw, '_qdb_assigned_user_value'),
    teamId: guidNull(raw, '_qdb_team_value'),
    teamName: fmt(raw, '_qdb_team_value'),
    roundRobinTeamId: guidNull(raw, '_qdb_roundrobinteam_value'),
    roundRobinTeamName: fmt(raw, '_qdb_roundrobinteam_value'),
    recordEntityId: guidNull(raw, '_qdb_recordentity_value'),
    recordEntityName: fmt(raw, '_qdb_recordentity_value'),
    regardingFieldId: guidNull(raw, '_qdb_regardingfield_value'),
    regardingFieldName: fmt(raw, '_qdb_regardingfield_value'),
    parentEntityId: guidNull(raw, '_qdb_parententity_value'),
    parentEntityName: fmt(raw, '_qdb_parententity_value'),
    processId: guid(raw, '_qdb_record_type_value'),
    ...mapControlFlowFields(raw),
  };
}

function mapOutcome(raw: Record<string, unknown>): CrmOutcome {
  return {
    id: guid(raw, PK.outcome),
    name: str(raw, 'qdb_name'),
    sequenceNumber: num(raw, 'qdb_sequencenumber', 0),
    applyFilter: bool(raw, 'qdb_applyfilter'),
    stepId: guid(raw, '_qdb_workitemstep_value'),
    stepName: fmt(raw, '_qdb_workitemstep_value'),
    nextStepId: guidNull(raw, '_qdb_nextworkitemstep_value'),
    nextStepName: fmt(raw, '_qdb_nextworkitemstep_value'),
  };
}

function mapRoute(raw: Record<string, unknown>): CrmRoute {
  return {
    id: guid(raw, PK.route),
    name: str(raw, 'qdb_name'),
    subject: str(raw, 'qdb_subject'),
    sequenceNumber: num(raw, 'qdb_sequencenumber', 0),
    nextStepId: guidNull(raw, '_qdb_nextworkitemstep_value'),
    nextStepName: fmt(raw, '_qdb_nextworkitemstep_value'),
    filter: str(raw, 'qdb_filter'),
    outcomeId: guid(raw, '_qdb_outcome_value'),
  };
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function toError(err: unknown, context: string): Error {
  logError(`WorkflowDataService:${context}`, err);
  if (err instanceof Error) return err;
  if (typeof err === 'object' && err !== null) {
    const xrm = err as Record<string, unknown>;
    const msg = typeof xrm['message'] === 'string' ? xrm['message'] : JSON.stringify(xrm);
    const code = typeof xrm['errorCode'] === 'number' ? ` [${String(xrm['errorCode'])}]` : '';
    return new Error(`[${context}]${code} ${msg}`);
  }
  return new Error(`[${context}] ${String(err)}`);
}
