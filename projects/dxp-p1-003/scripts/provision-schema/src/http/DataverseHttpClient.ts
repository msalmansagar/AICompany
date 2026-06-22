import { env } from '../config/env.js';
import { TokenProvider } from '../auth/TokenProvider.js';
import type { ODataCollectionResponse } from '../types/DataverseMetadata.js';

export class DataverseApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly errorCode: string,
    public readonly dataverseMessage: string,
    public readonly operation: string,
  ) {
    super(`Dataverse ${statusCode} on ${operation}: ${dataverseMessage}`);
    this.name = 'DataverseApiError';
  }
}

export interface QueryOptions {
  readonly filter?: string;
  readonly select?: readonly string[];
  readonly top?: number;
  readonly expand?: string;
}

const BASE_URL = `${env.DATAVERSE_ORG_URL}/api/data/v9.2/`;
const SOLUTION_UNIQUE_NAME = 'QdbDxpPlatform';

export class DataverseHttpClient {
  private readonly tokenProvider: TokenProvider;

  constructor(tokenProvider: TokenProvider) {
    this.tokenProvider = tokenProvider;
  }

  private buildReadOnlyHeaders(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      Accept: 'application/json',
    };
  }

  private buildMutationHeaders(token: string): Record<string, string> {
    return {
      ...this.buildReadOnlyHeaders(token),
      'Content-Type': 'application/json; charset=utf-8',
      'MSCRM.SolutionUniqueName': SOLUTION_UNIQUE_NAME,
    };
  }

  private buildAdminMutationHeaders(token: string): Record<string, string> {
    return {
      ...this.buildReadOnlyHeaders(token),
      'Content-Type': 'application/json; charset=utf-8',
    };
  }

  private buildUrl(path: string, options?: QueryOptions): string {
    const url = new URL(path, BASE_URL);
    if (options?.filter) url.searchParams.set('$filter', options.filter);
    if (options?.select?.length) url.searchParams.set('$select', options.select.join(','));
    if (options?.top !== undefined) url.searchParams.set('$top', String(options.top));
    if (options?.expand) url.searchParams.set('$expand', options.expand);
    return url.toString();
  }

  private async parseError(response: Response, operation: string): Promise<never> {
    let errorCode = 'unknown';
    let dataverseMessage = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { error?: { code?: string; message?: string } };
      errorCode = body.error?.code ?? errorCode;
      dataverseMessage = body.error?.message ?? dataverseMessage;
    } catch {
      // Response body was not JSON
    }
    throw new DataverseApiError(response.status, errorCode, dataverseMessage, operation);
  }

  private async executeWithRetry(
    buildRequest: (token: string) => Request,
    operation: string,
    retryCount = 0,
  ): Promise<Response> {
    const token = await this.tokenProvider.acquireToken();
    const request = buildRequest(token);
    const response = await fetch(request);

    if (response.status === 401 && retryCount === 0) {
      if (env.LOG_LEVEL === 'debug' || env.LOG_LEVEL === 'info') {
        console.log(`[WARN] 401 on ${operation} — re-acquiring token and retrying`);
      }
      return this.executeWithRetry(buildRequest, operation, 1);
    }

    if (response.status === 429 && retryCount < 8) {
      const retryAfterHeader = response.headers.get('Retry-After');
      const rawWait = parseInt(retryAfterHeader ?? '', 10);
      const waitSeconds = Number.isFinite(rawWait) ? Math.min(rawWait, 120) : 20;
      console.log(`[WARN] 429 on ${operation} — waiting ${waitSeconds}s (attempt ${retryCount + 1}/8)`);
      await sleep(waitSeconds * 1000);
      return this.executeWithRetry(buildRequest, operation, retryCount + 1);
    }

    if (response.status === 503 && retryCount < 3) {
      const backoffMs = Math.pow(2, retryCount + 1) * 1000;
      console.log(`[WARN] 503 on ${operation} — backoff ${backoffMs}ms (attempt ${retryCount + 1}/3)`);
      await sleep(backoffMs);
      return this.executeWithRetry(buildRequest, operation, retryCount + 1);
    }

    return response;
  }

  async get<T>(path: string, options?: QueryOptions): Promise<T | null> {
    const url = this.buildUrl(path, options);
    const operation = `GET ${path}`;
    if (env.LOG_LEVEL === 'debug') console.log(`[DEBUG] ${operation}`);

    const response = await this.executeWithRetry(
      (token) => new Request(url, { method: 'GET', headers: this.buildReadOnlyHeaders(token) }),
      operation,
    );

    if (response.status === 404) return null;
    if (!response.ok) await this.parseError(response, operation);
    return response.json() as Promise<T>;
  }

  async fetchAllPages<T>(path: string, options?: QueryOptions): Promise<readonly T[]> {
    const results: T[] = [];
    let url: string | undefined = this.buildUrl(path, options);

    while (url !== undefined) {
      const pageUrl = url;
      const response = await this.executeWithRetry(
        (token) => new Request(pageUrl, { method: 'GET', headers: this.buildReadOnlyHeaders(token) }),
        `GET ${pageUrl}`,
      );
      if (!response.ok) await this.parseError(response, `GET ${pageUrl}`);
      const page = (await response.json()) as ODataCollectionResponse<T>;
      results.push(...page.value);
      url = page['@odata.nextLink'];
    }

    return results;
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const url = this.buildUrl(path);
    const operation = `POST ${path}`;
    if (env.LOG_LEVEL === 'debug') console.log(`[DEBUG] ${operation}`);

    const response = await this.executeWithRetry(
      (token) => new Request(url, {
        method: 'POST',
        headers: this.buildMutationHeaders(token),
        body: JSON.stringify(body),
      }),
      operation,
    );

    if (!response.ok) await this.parseError(response, operation);

    const contentType = response.headers.get('Content-Type') ?? '';
    if (contentType.includes('application/json') && response.status !== 204) {
      return response.json() as Promise<T>;
    }

    const entityId = response.headers.get('OData-EntityId') ?? '';
    return { id: entityId } as unknown as T;
  }

  async postRaw(path: string, body: unknown): Promise<Response> {
    const url = this.buildUrl(path);
    const operation = `POST ${path}`;

    const response = await this.executeWithRetry(
      (token) => new Request(url, {
        method: 'POST',
        headers: this.buildMutationHeaders(token),
        body: JSON.stringify(body),
      }),
      operation,
    );

    if (!response.ok) await this.parseError(response, operation);
    return response;
  }

  async postAdminRaw(path: string, body: unknown): Promise<Response> {
    const url = this.buildUrl(path);
    const operation = `POST ${path}`;

    const response = await this.executeWithRetry(
      (token) => new Request(url, {
        method: 'POST',
        headers: this.buildAdminMutationHeaders(token),
        body: JSON.stringify(body),
      }),
      operation,
    );

    if (!response.ok) await this.parseError(response, operation);
    return response;
  }

  async postWithCustomHeaders(
    path: string,
    body: unknown,
    extraHeaders: Record<string, string>,
  ): Promise<Response> {
    const url = this.buildUrl(path);
    const operation = `POST ${path}`;

    const response = await this.executeWithRetry(
      (token) => new Request(url, {
        method: 'POST',
        headers: { ...this.buildMutationHeaders(token), ...extraHeaders },
        body: JSON.stringify(body),
      }),
      operation,
    );

    if (!response.ok) await this.parseError(response, operation);
    return response;
  }

  async patch(path: string, body: unknown): Promise<void> {
    const url = this.buildUrl(path);
    const operation = `PATCH ${path}`;

    const response = await this.executeWithRetry(
      (token) => new Request(url, {
        method: 'PATCH',
        headers: this.buildMutationHeaders(token),
        body: JSON.stringify(body),
      }),
      operation,
    );

    if (!response.ok) await this.parseError(response, operation);
  }

  async delete(path: string): Promise<void> {
    const url = this.buildUrl(path);
    const operation = `DELETE ${path}`;

    const response = await this.executeWithRetry(
      (token) => new Request(url, { method: 'DELETE', headers: this.buildMutationHeaders(token) }),
      operation,
    );

    if (!response.ok) await this.parseError(response, operation);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
