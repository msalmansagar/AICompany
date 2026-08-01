import type {
  IWebApiAdapter,
  WebApiRecord,
  WebApiRetrieveMultipleResult,
} from '@/services/IWebApiAdapter';

/** Records what the services ask Dataverse for, so the requests themselves can be asserted. */
export class FakeWebApi implements IWebApiAdapter {
  readonly requests: Array<{ entity: string; options?: string }> = [];
  readonly created: Array<{ entity: string; data: WebApiRecord }> = [];
  readonly updated: Array<{ entity: string; id: string; data: WebApiRecord }> = [];

  constructor(
    private readonly byEntity: Record<string, WebApiRecord[]> = {},
    private readonly failures: Record<string, Error> = {},
  ) {}

  async retrieveMultipleRecords(
    entityLogicalName: string,
    options?: string,
  ): Promise<WebApiRetrieveMultipleResult> {
    this.requests.push({ entity: entityLogicalName, options });

    const failure = this.failures[entityLogicalName];
    if (failure) throw failure;

    return { entities: this.byEntity[entityLogicalName] ?? [] };
  }

  requestsFor(entity: string): Array<{ entity: string; options?: string }> {
    return this.requests.filter((request) => request.entity === entity);
  }

  async createRecord(entityLogicalName: string, data: WebApiRecord) {
    this.created.push({ entity: entityLogicalName, data });
    return { id: `created-${this.created.length}`, entityType: entityLogicalName };
  }

  async updateRecord(entityLogicalName: string, id: string, data: WebApiRecord): Promise<void> {
    this.updated.push({ entity: entityLogicalName, id, data });
  }

  /** Every write the services attempted, so "nothing was written" can be asserted directly. */
  get writes(): number {
    return this.created.length + this.updated.length;
  }

  deleteRecord(): Promise<never> { return Promise.reject(new Error('unused in these tests')); }
  retrieveRecord(): Promise<never> { return Promise.reject(new Error('unused in these tests')); }
  executeAction(): Promise<never> { return Promise.reject(new Error('unused in these tests')); }
  updateRecordConditional(): Promise<never> { return Promise.reject(new Error('unused in these tests')); }
}
