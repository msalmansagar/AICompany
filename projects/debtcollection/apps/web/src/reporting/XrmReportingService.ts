import type { XrmLike } from '../platform/crmContext.js';
import { describeFailure } from '../platform/errors.js';
import {
  DashboardResultSchema, EngineOutputSchema, ReportResultSchema, type DashboardResult, type EngineOutput, type ReportResult,
} from './reportEngineContracts.js';
import { scopeToParameters, type IReportingService, type ReportingOutcome, type RunReportRequest } from './ReportingService.js';
import type { ZodType } from 'zod';

/**
 * The Report Engine reached through the Dynamics client API, as the signed-in user.
 *
 * `Xrm.WebApi.execute` needs a request object carrying its own metadata; the Engine's Custom APIs
 * are unbound actions with string and boolean parameters, so that metadata is known here and
 * nowhere else. The operation names are injected because the same operations are Custom APIs on
 * Dataverse and Process Actions on-premises, and a deployment may name them.
 */
export interface ReportingOperations {
  runReport: string;
  runDashboard: string;
}

export const DEFAULT_REPORTING_OPERATIONS: ReportingOperations = {
  runReport: 'qdb_RunReport',
  runDashboard: 'qdb_RunDashboard',
};

const DEFAULT_TIMEOUT_MS = 90_000;
const ACCESS_DENIED_PATTERN = /access|denied|permission|privilege|not authori[sz]ed|forbidden/i;

type ParameterType = { typeName: 'Edm.String' | 'Edm.Boolean'; structuralProperty: 1 };

export class XrmReportingService implements IReportingService {
  constructor(
    private readonly xrm: XrmLike,
    private readonly operations: ReportingOperations = DEFAULT_REPORTING_OPERATIONS,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  async runReport(request: RunReportRequest): Promise<ReportingOutcome<ReportResult>> {
    const parameters = { ...(request.scope ? scopeToParameters(request.scope) : {}), ...(request.parameters ?? {}) };
    const body = {
      reportId: request.reportId,
      parametersJson: JSON.stringify(parameters),
      format: 'RUN',
      async: false,
      relationshipId: request.drill?.relationshipId ?? '',
      parentKey: request.drill?.parentKey ?? '',
    };
    const types: Record<string, ParameterType> = {
      reportId: STRING, parametersJson: STRING, format: STRING, async: BOOLEAN, relationshipId: STRING, parentKey: STRING,
    };
    return this.execute(this.operations.runReport, body, types, ReportResultSchema);
  }

  async runDashboard(dashboardId: string): Promise<ReportingOutcome<DashboardResult>> {
    return this.execute(this.operations.runDashboard, { dashboardId }, { dashboardId: STRING }, DashboardResultSchema);
  }

  private async execute<T>(
    operationName: string,
    body: Record<string, string | boolean>,
    types: Record<string, ParameterType>,
    schema: ZodType<T>,
  ): Promise<ReportingOutcome<T>> {
    if (!this.xrm.WebApi.execute) return { status: 'unavailable', message: 'The client API cannot execute operations here.' };
    const request = { ...body, getMetadata: () => ({ boundParameter: null, operationType: 0, operationName, parameterTypes: types }) };
    try {
      const response = await withTimeout(this.xrm.WebApi.execute(request), this.timeoutMs);
      return interpretResponse(await readOutput(response), response.ok, schema);
    } catch (failure: unknown) {
      return failure instanceof TimeoutError
        ? { status: 'timeout', message: failure.message }
        : { status: 'unavailable', message: describeFailure(failure) };
    }
  }
}

const STRING: ParameterType = { typeName: 'Edm.String', structuralProperty: 1 };
const BOOLEAN: ParameterType = { typeName: 'Edm.Boolean', structuralProperty: 1 };

class TimeoutError extends Error {
  constructor(ms: number) { super(`The reporting service did not answer within ${Math.round(ms / 1000)} seconds.`); this.name = 'TimeoutError'; }
}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new TimeoutError(ms)), ms); });
  try { return await Promise.race([work, expiry]); } finally { if (timer !== undefined) clearTimeout(timer); }
}

async function readOutput(response: Response): Promise<EngineOutput | undefined> {
  const text = await response.text();
  if (!text) return undefined;
  const parsed = EngineOutputSchema.safeParse(JSON.parse(text));
  return parsed.success ? parsed.data : undefined;
}

/** The Engine's two refusal shapes and its one answer, told apart in one place. */
export function interpretResponse<T>(output: EngineOutput | undefined, isHttpOk: boolean, schema: ZodType<T>): ReportingOutcome<T> {
  if (output?.error) {
    const message = output.error.message ?? output.error.code ?? 'The reporting service refused the request.';
    return { status: ACCESS_DENIED_PATTERN.test(message) ? 'accessDenied' : 'refused', message, ...(output.error.code ? { code: output.error.code } : {}) };
  }
  if (output?.errorCode) {
    const message = output.errorMessage ?? output.errorCode;
    const status = ACCESS_DENIED_PATTERN.test(`${output.errorCode} ${message}`) ? 'accessDenied' : 'refused';
    return { status, message, code: output.errorCode, ...(output.executionId ? { executionId: output.executionId } : {}) };
  }
  if (!isHttpOk) return { status: 'unavailable', message: 'The reporting service returned an error status.' };
  if (!output || typeof output.resultJson !== 'string' || output.resultJson === '') {
    return { status: 'malformed', message: 'The reporting service returned no result.' };
  }
  return parseResult(output.resultJson, schema, output.executionId);
}

function parseResult<T>(resultJson: string, schema: ZodType<T>, executionId: string | undefined): ReportingOutcome<T> {
  let raw: unknown;
  try { raw = JSON.parse(resultJson); } catch { return { status: 'malformed', message: 'The reporting service returned a result that is not JSON.' }; }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { status: 'malformed', message: `The reporting service returned a result DCP does not recognise: ${parsed.error.issues[0]?.message ?? 'schema mismatch'}.` };
  return { status: 'ok', result: parsed.data, ...(executionId ? { executionId } : {}) };
}
