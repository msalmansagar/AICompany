import { buildListUrl, buildSingleUrl, buildActionUrl } from './buildODataUrl.js';
import { DataverseError, DataverseNotFoundError, DataverseAuthError } from './DataverseError.js';
import { withRetry, DataverseHttpError } from './retry.js';
import type {
  DataverseClientConfig,
  ODataListResult,
  ODataQueryOptions,
  ODataError,
  RequestOptions,
  BatchOperation,
} from './types.js';

const ODATA_VERSION = '4.0';
const ODATA_MAX_VERSION = '4.0';

/**
 * Typed OData v4 fetch wrapper for Dataverse.
 *
 * This is the ONLY place in the portal codebase that makes HTTP calls to
 * Dataverse. All Dataverse-touching service classes depend on this class
 * (injected, never constructed inline).
 */
export class DataverseClient {
  private readonly orgUrl: string;
  private readonly getAccessToken: () => Promise<string>;

  constructor(config: DataverseClientConfig) {
    // Strip trailing slash to keep URL building consistent
    this.orgUrl = config.orgUrl.replace(/\/$/, '');
    this.getAccessToken = config.getAccessToken;
  }

  /**
   * GET a list of records from a Dataverse entity set.
   *
   * @param entity - Plural entity set name, e.g. "qdb_portal_configs"
   * @param options - OData query options
   * @param requestOptions - Per-request context (correlationId)
   */
  async getList<T>(
    entity: string,
    options: ODataQueryOptions = {},
    requestOptions: RequestOptions = {},
  ): Promise<ODataListResult<T>> {
    const url = buildListUrl(this.orgUrl, entity, options);
    const response = await this.executeRequest('GET', url, undefined, requestOptions);
    return response as ODataListResult<T>;
  }

  /**
   * GET a single record by GUID.
   *
   * @param entity - Plural entity set name
   * @param id - GUID of the record
   * @param options - $select and $expand only
   * @param requestOptions - Per-request context
   */
  async getById<T>(
    entity: string,
    id: string,
    options: Pick<ODataQueryOptions, 'select' | 'expand'> = {},
    requestOptions: RequestOptions = {},
  ): Promise<T> {
    const url = buildSingleUrl(this.orgUrl, entity, id, options);
    const response = await this.executeRequest('GET', url, undefined, requestOptions);
    return response as T;
  }

  /**
   * POST a new record to a Dataverse entity set.
   * Returns the created record (Dataverse returns 204 with OData-EntityId header;
   * we do a follow-up GET to return the full record).
   *
   * @param entity - Plural entity set name
   * @param body - Record fields
   * @param requestOptions - Per-request context
   */
  async create<T>(
    entity: string,
    body: Record<string, unknown>,
    requestOptions: RequestOptions = {},
  ): Promise<T> {
    const url = buildListUrl(this.orgUrl, entity);
    const response = await this.executeRequest('POST', url, body, requestOptions);
    return response as T;
  }

  /**
   * PATCH an existing Dataverse record.
   *
   * @param entity - Plural entity set name
   * @param id - GUID of the record to update
   * @param body - Fields to update (partial)
   * @param requestOptions - Per-request context
   */
  async update(
    entity: string,
    id: string,
    body: Record<string, unknown>,
    requestOptions: RequestOptions = {},
  ): Promise<void> {
    const url = buildSingleUrl(this.orgUrl, entity, id);
    await this.executeRequest('PATCH', url, body, requestOptions);
  }

  /**
   * DELETE a Dataverse record by GUID.
   *
   * @param entity - Plural entity set name
   * @param id - GUID of the record to delete
   * @param requestOptions - Per-request context
   */
  async delete(
    entity: string,
    id: string,
    requestOptions: RequestOptions = {},
  ): Promise<void> {
    const url = buildSingleUrl(this.orgUrl, entity, id);
    await this.executeRequest('DELETE', url, undefined, requestOptions);
  }

  /**
   * Execute a bound or unbound Dataverse action.
   *
   * @param actionName - OData action/function name
   * @param body - Action input parameters
   * @param requestOptions - Per-request context
   */
  async executeAction(
    actionName: string,
    body: Record<string, unknown>,
    requestOptions: RequestOptions = {},
  ): Promise<unknown> {
    const url = buildActionUrl(this.orgUrl, actionName);
    return this.executeRequest('POST', url, body, requestOptions);
  }

  /**
   * Execute a list of operations as a single OData $batch changeSet.
   *
   * All operations run in one Dataverse transaction — if any fails, all are
   * rolled back. Use this when two or more writes must be atomic (e.g. the
   * set-latest swap that clears the old flag and sets the new one).
   *
   * @param operations - Ordered list of mutation operations for the changeSet
   * @param requestOptions - Per-request context
   */
  async executeBatch(
    operations: BatchOperation[],
    requestOptions: RequestOptions = {},
  ): Promise<void> {
    if (operations.length === 0) return;

    const batchBoundary = `batch_${randomId()}`;
    const changesetBoundary = `changeset_${randomId()}`;
    const batchUrl = `${this.orgUrl}/api/data/v9.2/$batch`;
    const body = buildBatchBody(this.orgUrl, batchBoundary, changesetBoundary, operations);

    const token = await this.getAccessToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/mixed;boundary=${batchBoundary}`,
      Accept: 'application/json',
      'OData-MaxVersion': ODATA_MAX_VERSION,
      'OData-Version': ODATA_VERSION,
      ...(requestOptions.correlationId ? { 'x-correlation-id': requestOptions.correlationId } : {}),
    };

    const response = await fetch(batchUrl, { method: 'POST', headers, body });

    if (!response.ok) {
      await this.throwTypedError(response, batchUrl);
    }

    const responseText = await response.text();
    throwIfBatchContainsError(responseText);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async buildHeaders(correlationId?: string): Promise<Record<string, string>> {
    const token = await this.getAccessToken();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
      Accept: 'application/json',
      'OData-MaxVersion': ODATA_MAX_VERSION,
      'OData-Version': ODATA_VERSION,
      'Prefer': 'odata.include-annotations="*"',
      ...(correlationId ? { 'x-correlation-id': correlationId } : {}),
    };
  }

  private async executeRequest(
    method: string,
    url: string,
    body: Record<string, unknown> | undefined,
    requestOptions: RequestOptions,
  ): Promise<unknown> {
    const retryOptions = requestOptions.correlationId !== undefined
      ? { correlationId: requestOptions.correlationId }
      : {};
    return withRetry(
      async () => {
        const headers = await this.buildHeaders(requestOptions.correlationId);
        const fetchOptions: RequestInit = {
          method,
          headers,
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        };

        const response = await fetch(url, fetchOptions);

        if (!response.ok) {
          await this.throwTypedError(response, url);
        }

        if (response.status === 204) {
          return undefined;
        }

        return response.json() as Promise<unknown>;
      },
      retryOptions,
    );
  }

  /** Parses the Dataverse OData error body and throws a typed DataverseError.
   * @internal
   */
  private async throwTypedError(response: Response, url: string): Promise<never> {
    if (response.status === 401) {
      throw new DataverseAuthError(`Request to ${url} returned 401`);
    }

    if (response.status === 404) {
      // Try to extract entity name and id from the URL for a better message
      const match = /\/(\w+)\(([^)]+)\)/.exec(url);
      if (match) {
        throw new DataverseNotFoundError(match[1] ?? 'unknown', match[2] ?? 'unknown');
      }
      throw new DataverseError(`Record not found at ${url}`, '0x80040217', 404);
    }

    // Signal retryable statuses before attempting to parse body
    if ([429, 502, 503, 504].includes(response.status)) {
      throw new DataverseHttpError(response.status, `Transient error ${response.status} from Dataverse`);
    }

    // Parse OData error body for all other 4xx / 5xx
    let odataError: ODataError | null = null;
    try {
      odataError = (await response.json()) as ODataError;
    } catch {
      // Response body was not valid JSON
    }

    const code = odataError?.error?.code ?? 'unknown';
    const message = odataError?.error?.message ?? `Dataverse returned HTTP ${response.status}`;
    throw new DataverseError(message, code, response.status);
  }
}

// ---------------------------------------------------------------------------
// $batch helpers (module-level to keep the class size in check)
// ---------------------------------------------------------------------------

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Builds a multipart/mixed OData $batch body with a single changeSet.
 * One changeSet = one Dataverse transaction.
 */
function buildBatchBody(
  orgUrl: string,
  batchBoundary: string,
  changesetBoundary: string,
  operations: BatchOperation[],
): string {
  const CRLF = '\r\n';
  const apiPath = '/api/data/v9.2/';
  const lines: string[] = [];

  // Outer batch part wraps a single changeSet for atomicity
  lines.push(`--${batchBoundary}`);
  lines.push(`Content-Type: multipart/mixed;boundary=${changesetBoundary}`);
  lines.push('');

  for (const op of operations) {
    const resourcePath = op.id !== undefined ? `${op.entity}(${op.id})` : op.entity;
    const absoluteUrl = `${orgUrl}${apiPath}${resourcePath}`;
    const bodyJson = op.body !== undefined ? JSON.stringify(op.body) : '';

    lines.push(`--${changesetBoundary}`);
    lines.push('Content-Type: application/http');
    lines.push('Content-Transfer-Encoding: binary');
    lines.push('');
    lines.push(`${op.method} ${absoluteUrl} HTTP/1.1`);
    lines.push('Content-Type: application/json;type=entry');
    lines.push('OData-Version: 4.0');
    lines.push('');
    lines.push(bodyJson);
  }

  lines.push(`--${changesetBoundary}--`);
  lines.push(`--${batchBoundary}--`);
  lines.push('');

  return lines.join(CRLF);
}

/**
 * Scans a Dataverse $batch response body for inner HTTP error status codes.
 * When Dataverse rolls back a changeSet it returns a single error response
 * part; the outer HTTP status is always 200.
 */
function throwIfBatchContainsError(responseText: string): void {
  const lines = responseText.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const statusMatch = /^HTTP\/1\.1 (\d{3})/.exec(line);
    if (statusMatch === null) continue;

    const status = parseInt(statusMatch[1]!, 10);
    if (status < 400) continue;

    // Advance past HTTP response headers to the body
    let bodyStart = i + 1;
    while (bodyStart < lines.length && lines[bodyStart] !== '') {
      bodyStart++;
    }
    bodyStart++;

    const bodyLines: string[] = [];
    for (let j = bodyStart; j < lines.length; j++) {
      const bodyLine = lines[j]!;
      if (bodyLine.startsWith('--')) break;
      bodyLines.push(bodyLine);
    }
    const bodyText = bodyLines.join('\n').trim();

    let code = 'batch_operation_failed';
    let message = `Dataverse batch changeSet failed with HTTP ${status}`;

    if (bodyText) {
      try {
        const parsed = JSON.parse(bodyText) as ODataError;
        code = parsed.error?.code ?? code;
        message = parsed.error?.message ?? message;
      } catch {
        // Non-JSON error body — fall through to the generic message
      }
    }

    throw new DataverseError(message, code, status);
  }
}
