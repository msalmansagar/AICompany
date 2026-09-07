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
  constructor(
    private readonly xrmWebApi: typeof Xrm.WebApi,
    /** Org base URL. Passed in because the global Xrm is undefined inside the web resource. */
    private readonly clientUrl: string,
  ) {}

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

  /**
   * Calls an unbound action with a plain POST, NOT Xrm.WebApi.online.execute.
   *
   * execute() was given an empty parameterTypes map on the assumption that Xrm would infer
   * each parameter's type at runtime. It does not: anything absent from parameterTypes is
   * dropped from the serialised request, so the action arrived with every parameter null
   * and Dataverse rejected it — "A null value was found for the property named 'FormCode',
   * which has the expected type 'Edm.String[Nullable=False]'". Publishing from the designer
   * therefore created a job row and then failed to start it, leaving the job queued forever.
   *
   * Declaring the types here would mean teaching this generic adapter every action's
   * signature. A POST carries the parameters exactly as given, which is what the scripts
   * that publish successfully already do, and matches updateRecordConditional below.
   */
  async executeAction(actionName: string, parameters: ActionParameters): Promise<ActionResult> {
    const response = await fetch(`${this.clientUrl}/api/data/v9.2/${actionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
      },
      body: JSON.stringify(parameters),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `Action '${actionName}' failed with ${response.status}: ${detail.slice(0, 300)}`,
      );
    }

    // A 204 carries no body; actions that return values answer with JSON.
    if (response.status === 204) return {} as ActionResult;
    return (await response.json()) as ActionResult;
  }

  async updateRecordConditional(
    entityLogicalName: string,
    id: string,
    data: WebApiRecord,
    options: WebApiUpdateOptions,
  ): Promise<void> {
    // A plain PATCH carrying If-Match, NOT Xrm.WebApi.online.execute.
    //
    // execute() was given a hand-rolled update contract (operationType 2 plus the entity's
    // columns spread onto the request). Xrm cannot serialise that: every call threw
    // "Cannot convert ODataContract with <entity> operation into a serialized request", so
    // the conditional update NEVER reached Dataverse. It failed silently for a long time —
    // form-level edits (title, description, confirmation text) simply did not persist while
    // the tab, section and field saves around them did, because those use plain
    // create/update. Confirmed against org5869857f: two forms saved from the designer both
    // had modifiedon still equal to createdon.
    //
    // If-Match is what makes it conditional: Dataverse answers 412 when the record moved on.
    const entitySetName = resolveEntitySetName(entityLogicalName);

    let response: Response;
    try {
      response = await fetch(`${this.clientUrl}/api/data/v9.2/${entitySetName}(${stripBraces(id)})`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'OData-MaxVersion': '4.0',
          'OData-Version': '4.0',
          'If-Match': options.ifMatch,
        },
        body: JSON.stringify(data),
      });
    } catch (error) {
      if (isPreconditionFailedError(error)) {
        throw new ConcurrencyConflictError(entityLogicalName, id, options.ifMatch);
      }
      throw error;
    }

    if (response.status === 412) {
      throw new ConcurrencyConflictError(entityLogicalName, id, options.ifMatch);
    }
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `Conditional update of '${entityLogicalName}' (id=${id}) failed with ${response.status}: `
        + detail.slice(0, 300),
      );
    }
  }
}

/**
 * The OData entity set for a logical name.
 *
 * Dataverse pluralises the logical name, and every DFE table follows the regular rule —
 * qdb_form_definition → qdb_form_definitions. The 'y' → 'ies' case is handled because it
 * costs nothing and silently hitting a 404 would look like a save that did nothing, which
 * is the failure mode this whole method exists to stop repeating.
 */
function resolveEntitySetName(entityLogicalName: string): string {
  if (entityLogicalName.endsWith('y')) return `${entityLogicalName.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/.test(entityLogicalName)) return `${entityLogicalName}es`;
  return `${entityLogicalName}s`;
}

/** Dataverse ids sometimes arrive wrapped in braces; the URL segment must not carry them. */
function stripBraces(id: string): string {
  return id.replace(/[{}]/g, '');
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
