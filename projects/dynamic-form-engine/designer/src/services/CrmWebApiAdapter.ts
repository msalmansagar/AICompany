import type {
  IWebApiAdapter,
  WebApiRecord,
  WebApiCreateResult,
  WebApiRetrieveMultipleResult,
} from './IWebApiAdapter';

// Thin adapter wrapping Xrm.WebApi so it satisfies IWebApiAdapter.
// Converts Xrm.Async.PromiseLike to standard Promise and normalises return shapes.
export class CrmWebApiAdapter implements IWebApiAdapter {
  constructor(private readonly xrmWebApi: typeof Xrm.WebApi) {}

  async createRecord(entityLogicalName: string, data: WebApiRecord): Promise<WebApiCreateResult> {
    const result = await this.xrmWebApi.createRecord(entityLogicalName, data);
    return { id: result.id, entityType: result.entityType };
  }

  async updateRecord(entityLogicalName: string, id: string, data: WebApiRecord): Promise<void> {
    await this.xrmWebApi.updateRecord(entityLogicalName, id, data);
  }

  async deleteRecord(entityLogicalName: string, id: string): Promise<void> {
    await this.xrmWebApi.deleteRecord(entityLogicalName, id);
  }

  async retrieveRecord(entityLogicalName: string, id: string, options = ''): Promise<WebApiRecord> {
    const result = await this.xrmWebApi.retrieveRecord(entityLogicalName, id, options);
    return result as WebApiRecord;
  }

  async retrieveMultipleRecords(
    entityLogicalName: string,
    options = '',
  ): Promise<WebApiRetrieveMultipleResult> {
    const result = await this.xrmWebApi.retrieveMultipleRecords(entityLogicalName, options);
    return {
      entities: result.entities as WebApiRecord[],
      nextLink: result.nextLink,
    };
  }
}
