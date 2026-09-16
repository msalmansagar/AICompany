import {
  buildListUrl,
  buildSingleUrl,
  buildAlternateKeyUrl,
  buildActionUrl,
} from './buildODataUrl.js';
import {
  CrmApiError,
  CrmNotFoundError,
  CrmAuthError,
  CrmHttpStatusError,
} from './CrmApiError.js';
import { withRetry } from './retry.js';
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
 * Org-addressed Dataverse / D365 CE Web API (OData v4) client.
 *
 * Every instance is bound to one OrgTarget so every call is org-addressed
 * and the caller never passes a raw URL. Bearer tokens are acquired lazily
 * on each request via the injected `getAccessToken` factory.
 *
 * This is the ONLY place in the DCP codebase that makes HTTP calls to CRM.
 */
export class DataverseClient {
  private readonly baseUrl: string;
  private readonly apiVersion: string;
  private readonly orgKey: string;
  private readonly getAccessToken: (orgKey: string) => Promise<string>;

  constructor(config: DataverseClientConfig) {
    this.baseUrl = config.org.baseUrl.replace(/\/$/, '');
    this.apiVersion = config.org.apiVersion;
    this.orgKey = config.org.orgKey;
    this.getAccessToken = config.getAccessToken;
  }

  /** GET a list of records from a Dataverse entity set. */
  async getList<T>(
    entity: string,
    options: ODataQueryOptions = {},
    requestOptions: RequestOptions = {},
  ): Promise<ODataListResult<T>> {
    const url = buildListUrl(this.baseUrl, this.apiVersion, entity, options);
    const result = await this.executeRequest('GET', url, undefined, requestOptions);
    return result as ODataListResult<T>;
  }

  /** GET a single record by GUID. */
  async getById<T>(
    entity: string,
    id: string,
    options: Pick<ODataQueryOptions, 'select' | 'expand'> = {},
    requestOptions: RequestOptions = {},
  ): Promise<T> {
    const url = buildSingleUrl(this.baseUrl, this.apiVersion, entity, id, options);
    const result = await this.executeRequest('GET', url, undefined, requestOptions);
    return result as T;
  }

  /**
   * GET a single record by OData alternate key (e.g. msst_qid='QAT-001').
   * Used for all QID-keyed lookups — never use getList with a filter for this.
   */
  async getByAlternateKey<T>(
    entity: string,
    keyName: string,
    keyValue: string,
    options: Pick<ODataQueryOptions, 'select' | 'expand'> = {},
    requestOptions: RequestOptions = {},
  ): Promise<T> {
    const url = buildAlternateKeyUrl(
      this.baseUrl,
      this.apiVersion,
      entity,
      keyName,
      keyValue,
      options,
    );
    const result = await this.executeRequest('GET', url, undefined, requestOptions);
    return result as T;
  }

  /**
   * POST a new record to Dataverse.
   *
   * Dataverse (on-prem 9.x and cloud) responds with HTTP 204 and an empty body.
   * The new record id is carried in the `OData-EntityId` response header as a
   * fully-qualified URL ending with `entityset(<guid>)`. Returns `{ id }` after
   * parsing that header. Throws `CrmApiError` if the header is absent.
   */
  async create(
    entity: string,
    body: Record<string, unknown>,
    requestOptions: RequestOptions = {},
  ): Promise<{ id: string }> {
    const url = buildListUrl(this.baseUrl, this.apiVersion, entity);
    return this.executeCreateRequest(url, body, requestOptions);
  }

  /** PATCH an existing record (partial update). */
  async update(
    entity: string,
    id: string,
    body: Record<string, unknown>,
    requestOptions: RequestOptions = {},
  ): Promise<void> {
    const url = buildSingleUrl(this.baseUrl, this.apiVersion, entity, id);
    await this.executeRequest('PATCH', url, body, requestOptions);
  }

  /** DELETE a record by GUID. */
  async delete(
    entity: string,
    id: string,
    requestOptions: RequestOptions = {},
  ): Promise<void> {
    const url = buildSingleUrl(this.baseUrl, this.apiVersion, entity, id);
    await this.executeRequest('DELETE', url, undefined, requestOptions);
  }

  /** Execute an unbound OData action. */
  async executeAction(
    actionName: string,
    body: Record<string, unknown>,
    requestOptions: RequestOptions = {},
  ): Promise<unknown> {
    const url = buildActionUrl(this.baseUrl, this.apiVersion, actionName);
    return this.executeRequest('POST', url, body, requestOptions);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private executeCreateRequest(
    url: string,
    body: Record<string, unknown>,
    requestOptions: RequestOptions,
  ): Promise<{ id: string }> {
    return withRetry(async () => {
      const headers = await this.buildHeaders(requestOptions.correlationId);
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        await this.throwTypedError(response, url);
      }

      return parseEntityIdHeader(
        response.headers.get('OData-EntityId'),
        url,
        response.status,
      );
    });
  }

  private async buildHeaders(correlationId?: string): Promise<Record<string, string>> {
    const token = await this.getAccessToken(this.orgKey);
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
      Accept: 'application/json',
      'OData-MaxVersion': ODATA_MAX_VERSION,
      'OData-Version': ODATA_VERSION,
      Prefer: 'odata.include-annotations="*"',
      ...(correlationId !== undefined ? { 'x-correlation-id': correlationId } : {}),
    };
  }

  private executeRequest(
    method: string,
    url: string,
    body: Record<string, unknown> | undefined,
    requestOptions: RequestOptions,
  ): Promise<unknown> {
    return withRetry(async () => {
      const headers = await this.buildHeaders(requestOptions.correlationId);
      const fetchOptions: RequestInit = {
        method,
        headers: headers,
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
    });
  }

  private async throwTypedError(response: Response, url: string): Promise<never> {
    if (response.status === 401) {
      throw new CrmAuthError(`Request to ${url} returned 401`);
    }

    if (response.status === 404) {
      const match = /\/(\w+)\(([^)]+)\)/.exec(url);
      if (match) {
        throw new CrmNotFoundError(match[1] ?? 'unknown', match[2] ?? 'unknown');
      }
      throw new CrmApiError(`Record not found at ${url}`, '0x80040217', 404);
    }

    if ([429, 502, 503, 504].includes(response.status)) {
      throw new CrmHttpStatusError(
        response.status,
        `Transient error ${response.status} from Dataverse`,
      );
    }

    let odataError: ODataError | null = null;
    try {
      odataError = (await response.json()) as ODataError;
    } catch {
      // Non-JSON body — fall through
    }

    const code = odataError?.error?.code ?? 'unknown';
    const message =
      odataError?.error?.message ?? `Dataverse returned HTTP ${response.status}`;
    throw new CrmApiError(message, code, response.status);
  }

  /** Returns the OData $batch URL for this org. */
  private get batchUrl(): string {
    return `${this.baseUrl}/api/data/v${this.apiVersion}/$batch`;
  }

  /** Execute multiple operations as a single OData $batch changeSet (atomic). */
  async executeBatch(
    operations: BatchOperation[],
    requestOptions: RequestOptions = {},
  ): Promise<void> {
    if (operations.length === 0) return;

    const batchBoundary = `batch_${randomId()}`;
    const changesetBoundary = `changeset_${randomId()}`;
    const body = buildBatchBody(
      this.baseUrl,
      this.apiVersion,
      batchBoundary,
      changesetBoundary,
      operations,
    );

    const token = await this.getAccessToken(this.orgKey);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/mixed;boundary=${batchBoundary}`,
      Accept: 'application/json',
      'OData-MaxVersion': ODATA_MAX_VERSION,
      'OData-Version': ODATA_VERSION,
      ...(requestOptions.correlationId !== undefined
        ? { 'x-correlation-id': requestOptions.correlationId }
        : {}),
    };

    const response = await fetch(this.batchUrl, {
      method: 'POST',
      headers: headers,
      body,
    });

    if (!response.ok) {
      await this.throwTypedError(response, this.batchUrl);
    }

    const responseText = await response.text();
    throwIfBatchContainsError(responseText);
  }
}

// ---------------------------------------------------------------------------
// create helper (module-level to keep class size below 400 lines)
// ---------------------------------------------------------------------------

/**
 * Parses the `OData-EntityId` header value returned by Dataverse on a
 * successful POST and extracts the new record GUID.
 *
 * The header carries a URL of the form `https://…/entityset(<guid>)`.
 * Dataverse always emits the GUID form on a successful POST; alternate-key
 * response URLs such as `entityset(msst_qid='x')` are not expected on creates
 * and are not handled by this function.
 * // FIXED: documented regex scope — alternate-key form not handled (B-1)
 * Throws `CrmApiError` if the header is absent or the GUID cannot be parsed.
 */
function parseEntityIdHeader(
  headerValue: string | null,
  requestUrl: string,
  httpStatus: number,
): { id: string } {
  if (headerValue === null) {
    throw new CrmApiError(
      `Dataverse POST to ${requestUrl} succeeded but OData-EntityId header was absent`,
      'missing_entity_id_header',
      httpStatus,
    );
  }

  const match = /\(([^)]+)\)$/.exec(headerValue);
  const id = match?.[1];
  if (id === undefined) {
    throw new CrmApiError(
      `Could not parse GUID from OData-EntityId header: ${headerValue}`,
      'malformed_entity_id_header',
      httpStatus,
    );
  }

  return { id };
}

// ---------------------------------------------------------------------------
// $batch helpers (module-level to keep class size below 400 lines)
// ---------------------------------------------------------------------------

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function buildBatchBody(
  baseUrl: string,
  apiVersion: string,
  batchBoundary: string,
  changesetBoundary: string,
  operations: BatchOperation[],
): string {
  const CRLF = '\r\n';
  const apiBase = `${baseUrl}/api/data/v${apiVersion}/`;
  const lines: string[] = [];

  lines.push(`--${batchBoundary}`);
  lines.push(`Content-Type: multipart/mixed;boundary=${changesetBoundary}`);
  lines.push('');

  for (const op of operations) {
    const resourcePath = op.id !== undefined ? `${op.entity}(${op.id})` : op.entity;
    const absoluteUrl = `${apiBase}${resourcePath}`;
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

function throwIfBatchContainsError(responseText: string): void {
  const lines = responseText.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const statusMatch = /^HTTP\/1\.1 (\d{3})/.exec(line);
    if (statusMatch === null) continue;

    const status = parseInt(statusMatch[1] ?? '0', 10);
    if (status < 400) continue;

    throw new CrmApiError(
      `Dataverse batch changeSet failed with HTTP ${status}`,
      'batch_operation_failed',
      status,
    );
  }
}
