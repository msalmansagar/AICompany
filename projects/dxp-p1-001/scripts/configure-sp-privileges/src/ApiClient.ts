export interface ODataCollection<T> {
  value: T[];
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly operation: string,
  ) {
    super(`Dataverse ${status} on ${operation}: ${message}`);
    this.name = 'ApiError';
  }
}

export class ApiClient {
  readonly orgUrl: string;
  private readonly getToken: () => Promise<string>;

  constructor(orgUrl: string, getToken: () => Promise<string>) {
    this.orgUrl = orgUrl.replace(/\/$/, '');
    this.getToken = getToken;
  }

  private get baseUrl(): string {
    return `${this.orgUrl}/api/data/v9.2/`;
  }

  private buildHeaders(token: string, includeContentType = false): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      Accept: 'application/json',
      ...(includeContentType ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
    };
  }

  private buildUrl(path: string, filter?: string, select?: string): string {
    const url = new URL(path, this.baseUrl);
    if (filter !== undefined) url.searchParams.set('$filter', filter);
    if (select !== undefined) url.searchParams.set('$select', select);
    return url.toString();
  }

  private async parseError(response: Response, operation: string): Promise<never> {
    let code = 'unknown';
    let message = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      // Non-JSON body — fall through to generic message
    }
    throw new ApiError(response.status, code, message, operation);
  }

  async getCollection<T>(path: string, filter?: string, select?: string): Promise<T[]> {
    const token = await this.getToken();
    const url = this.buildUrl(path, filter, select);
    const response = await fetch(url, { headers: this.buildHeaders(token) });
    if (!response.ok) await this.parseError(response, `GET ${path}`);
    const result = (await response.json()) as ODataCollection<T>;
    return result.value;
  }

  async create(path: string, body: Record<string, unknown>): Promise<string> {
    const token = await this.getToken();
    const url = this.buildUrl(path);
    const response = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(token, true),
      body: JSON.stringify(body),
    });
    if (!response.ok) await this.parseError(response, `POST ${path}`);
    const entityId = response.headers.get('OData-EntityId') ?? '';
    const match = /\(([^)]+)\)$/.exec(entityId);
    if (match?.[1] === undefined) {
      throw new ApiError(response.status, 'no_entity_id', 'OData-EntityId header missing', `POST ${path}`);
    }
    return match[1];
  }

  async executeAction(path: string, body: Record<string, unknown>): Promise<void> {
    const token = await this.getToken();
    const url = this.buildUrl(path);
    const response = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(token, true),
      body: JSON.stringify(body),
    });
    if (!response.ok) await this.parseError(response, `POST ${path}`);
  }

  async addRef(refPath: string, targetUrl: string): Promise<void> {
    const token = await this.getToken();
    const url = this.buildUrl(refPath);
    const response = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(token, true),
      body: JSON.stringify({ '@odata.id': targetUrl }),
    });
    if (!response.ok) await this.parseError(response, `POST ${refPath}`);
  }
}
