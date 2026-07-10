import type {
  IWebApiAdapter,
  WebApiRecord,
  WebApiCreateResult,
  WebApiRetrieveMultipleResult,
  ActionParameters,
  ActionResult,
  WebApiUpdateOptions,
} from './IWebApiAdapter';
import { ConcurrencyConflictError } from './concurrency/ConcurrencyConflictError';

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

  async executeAction(actionName: string, parameters: ActionParameters): Promise<ActionResult> {
    const request = {
      ...parameters,
      getMetadata: () => ({
        boundParameter: null,
        operationType: 0,           // 0 = Action
        operationName: actionName,
        parameterTypes: {}          // Xrm infers types at runtime
      }),
    };
    const xrmResult = await (this.xrmWebApi as typeof Xrm.WebApi & {
      online: { execute(request: unknown): Promise<unknown> }
    }).online.execute(request);
    return (xrmResult ?? {}) as ActionResult;
  }

  async updateRecordConditional(
    entityLogicalName: string,
    id: string,
    data: WebApiRecord,
    options: WebApiUpdateOptions,
  ): Promise<void> {
    // Including @odata.etag in the entity object causes Dataverse to enforce
    // If-Match semantics — it rejects with 412 if the record has been modified
    // by another user since it was loaded.
    const request = {
      ...data,
      '@odata.etag': options.ifMatch,
      getMetadata: () => ({
        boundParameter: null,
        operationType: 2,           // 2 = Update
        operationName: entityLogicalName,
        parameterTypes: {},
      }),
    };

    const xrmOnline = (this.xrmWebApi as typeof Xrm.WebApi & {
      online: { execute(request: unknown): Promise<{ status: number } | null | undefined> }
    }).online;

    try {
      await xrmOnline.execute({ ...request, id, entityType: entityLogicalName });
    } catch (error) {
      if (isPreconditionFailedError(error)) {
        throw new ConcurrencyConflictError(entityLogicalName, id, options.ifMatch);
      }
      throw error;
    }
  }
}

function isPreconditionFailedError(error: unknown): boolean {
  if (error == null || typeof error !== 'object') return false;
  const err = error as Record<string, unknown>;
  const message = String(err['message'] ?? '');
  const errorCode = Number(err['errorCode'] ?? 0);
  // Dataverse surfaces 412 as errorCode -2147187694 or message containing "(412)"
  return message.includes('(412)') ||
    message.toLowerCase().includes('precondition failed') ||
    errorCode === -2147187694;
}
