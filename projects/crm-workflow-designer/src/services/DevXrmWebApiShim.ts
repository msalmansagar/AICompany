/**
 * Fetch-based drop-in for Xrm.WebApi used during local development.
 * Requests go through the Vite proxy which adds the Bearer token.
 * Resolves logical entity names → OData set names via EntityDefinitions.
 */

export interface XrmWebApiPort {
  retrieveMultipleRecords(
    entityLogicalName: string,
    options?: string,
    maxPageSize?: number
  ): Promise<{ entities: Array<Record<string, unknown>> }>;
  retrieveRecord(
    entityLogicalName: string,
    id: string,
    options?: string
  ): Promise<Record<string, unknown>>;
}

export interface XrmPort {
  WebApi: XrmWebApiPort;
}

export class DevXrmWebApiShim implements XrmWebApiPort {
  private readonly setNameCache = new Map<string, string>();

  async retrieveMultipleRecords(
    entityLogicalName: string,
    options = ''
  ): Promise<{ entities: Array<Record<string, unknown>> }> {
    const setName = await this.resolveSetName(entityLogicalName);
    const json = await this.get<{ value?: Array<Record<string, unknown>> }>(
      `/api/data/v9.2/${setName}${options}`
    );
    return { entities: json.value ?? [] };
  }

  async retrieveRecord(
    entityLogicalName: string,
    id: string,
    options = ''
  ): Promise<Record<string, unknown>> {
    const setName = await this.resolveSetName(entityLogicalName);
    return this.get<Record<string, unknown>>(`/api/data/v9.2/${setName}(${id})${options}`);
  }

  private async resolveSetName(logicalName: string): Promise<string> {
    const cached = this.setNameCache.get(logicalName);
    if (cached) return cached;

    const json = await this.get<{ value: Array<{ EntitySetName: string }> }>(
      `/api/data/v9.2/EntityDefinitions?$select=EntitySetName&$filter=LogicalName eq '${logicalName}'`
    );
    const setName = json.value[0]?.EntitySetName;
    if (!setName) throw new Error(`[DevXrmWebApiShim] Entity set name not found for: ${logicalName}`);

    this.setNameCache.set(logicalName, setName);
    return setName;
  }

  private async get<T>(url: string): Promise<T> {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Prefer: 'odata.include-annotations="*"',
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`[DevXrmWebApiShim] HTTP ${res.status}: ${url}\n${body}`);
    }

    return res.json() as Promise<T>;
  }
}
