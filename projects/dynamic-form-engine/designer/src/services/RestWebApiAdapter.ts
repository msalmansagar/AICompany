import type {
  IWebApiAdapter,
  WebApiRecord,
  WebApiCreateResult,
  WebApiRetrieveMultipleResult,
  ActionParameters,
  ActionResult,
} from './IWebApiAdapter';

const PROXY_BASE = `${import.meta.env.VITE_API_BASE_URL ?? ''}/api/designer/records`;

export class RestWebApiAdapterError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly operation: string,
  ) {
    super(message);
    this.name = 'RestWebApiAdapterError';
  }
}

export class CrmActionNotAvailableError extends Error {
  constructor(actionName: string) {
    super(
      `CRM action '${actionName}' requires the designer to run inside Dynamics CRM UCI. Standalone REST mode does not support CRM actions.`
    );
    this.name = 'CrmActionNotAvailableError';
  }
}

// REST implementation of IWebApiAdapter — forwards CRUD to the backend designer proxy.
// Used when running the designer outside a CRM UCI context (local dev, standalone).
export class RestWebApiAdapter implements IWebApiAdapter {
  private readonly authToken: string | null;

  constructor(authToken: string | null = null) {
    this.authToken = authToken;
  }

  async createRecord(entityLogicalName: string, data: WebApiRecord): Promise<WebApiCreateResult> {
    const response = await this.request<{ id: string; entityType: string }>(
      `/${entityLogicalName}`,
      { method: 'POST', body: JSON.stringify(data) },
    );
    return { id: response.id, entityType: response.entityType ?? entityLogicalName };
  }

  async updateRecord(entityLogicalName: string, id: string, data: WebApiRecord): Promise<void> {
    await this.request<void>(`/${entityLogicalName}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteRecord(entityLogicalName: string, id: string): Promise<void> {
    await this.request<void>(`/${entityLogicalName}/${id}`, { method: 'DELETE' });
  }

  async retrieveRecord(
    entityLogicalName: string,
    id: string,
    options = '',
  ): Promise<WebApiRecord> {
    return this.request<WebApiRecord>(`/${entityLogicalName}/${id}${options}`);
  }

  async retrieveMultipleRecords(
    entityLogicalName: string,
    options = '',
  ): Promise<WebApiRetrieveMultipleResult> {
    return this.request<WebApiRetrieveMultipleResult>(`/${entityLogicalName}${options}`);
  }

  async executeAction(actionName: string, _parameters: ActionParameters): Promise<ActionResult> {
    throw new CrmActionNotAvailableError(actionName);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    const response = await fetch(`${PROXY_BASE}${path}`, { ...init, headers });

    if (response.status === 204) {
      return undefined as unknown as T;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new RestWebApiAdapterError(
        `Designer proxy ${init.method ?? 'GET'} ${path} failed: ${response.status} ${body}`,
        response.status,
        init.method ?? 'GET',
      );
    }

    const envelope = await response.json() as { success: boolean; data: T; error?: { message: string } };
    if (!envelope.success) {
      throw new RestWebApiAdapterError(
        envelope.error?.message ?? 'Designer proxy returned error',
        response.status,
        init.method ?? 'GET',
      );
    }

    return envelope.data;
  }
}
