import type {
  CrmCallContext,
  CrmQuery,
  CrmRecord,
  CrmReference,
  ICrmAdapter,
} from '@dcp/domain';
import { CrmApiError } from './CrmApiError.js';
import type { DataverseClient } from './DataverseClient.js';

/**
 * The Dataverse implementation of the Collection CRM seam.
 *
 * Everything OData-shaped stops here: entity set names, `@odata.bind`, alternate-key syntax and the
 * 404-means-absent convention. Collection logic above this class sees plain records, so the same
 * logic runs unchanged against an on-premises adapter over the Organization Service.
 *
 * The one thing this adapter does NOT do is pluralise or rename anything. Entity set names come
 * from the caller, which gets them from the platform configuration, because the tables differ
 * between the Housing Loan and BFD deployments.
 */
export class DataverseCrmAdapter implements ICrmAdapter {
  constructor(private readonly client: DataverseClient) {}

  /** @inheritdoc */
  async retrieve(
    reference: CrmReference,
    select: string[],
    context: CrmCallContext = {},
  ): Promise<CrmRecord | null> {
    return this.readOrNull(() =>
      this.client.getById<CrmRecord>(reference.entity, reference.id, { select }, context));
  }

  /** @inheritdoc */
  async retrieveByKey(
    entity: string,
    key: { field: string; value: string },
    select: string[],
    context: CrmCallContext = {},
  ): Promise<CrmRecord | null> {
    return this.readOrNull(() =>
      this.client.getByAlternateKey<CrmRecord>(entity, key.field, key.value, { select }, context));
  }

  /** @inheritdoc */
  async retrieveMultiple(
    entity: string,
    query: CrmQuery,
    context: CrmCallContext = {},
  ): Promise<CrmRecord[]> {
    const result = await this.client.getList<CrmRecord>(entity, toODataOptions(query), context);
    return result.value;
  }

  /** @inheritdoc */
  async create(entity: string, values: CrmRecord, context: CrmCallContext = {}): Promise<string> {
    const { id } = await this.client.create(entity, values, context);
    return id;
  }

  /** @inheritdoc */
  async update(
    reference: CrmReference,
    values: CrmRecord,
    context: CrmCallContext = {},
  ): Promise<void> {
    await this.client.update(reference.entity, reference.id, values, context);
  }

  /** @inheritdoc */
  async execute(
    operation: string,
    parameters: CrmRecord,
    context: CrmCallContext = {},
  ): Promise<unknown> {
    return this.client.executeAction(operation, parameters, context);
  }

  /**
   * Turns "not found" into `null` and lets every other failure through.
   * A missing record is an ordinary answer to a read; a 500 is not, and swallowing it would make a
   * broken organisation look like an empty one.
   */
  private async readOrNull(read: () => Promise<CrmRecord>): Promise<CrmRecord | null> {
    try {
      return await read();
    } catch (error) {
      if (error instanceof CrmApiError && error.httpStatus === 404) return null;
      throw error;
    }
  }
}

/** Maps the narrow Collection query onto the OData options the client accepts. */
function toODataOptions(query: CrmQuery): {
  select: string[]; filter?: string; top?: number; orderBy?: string;
} {
  return {
    select: query.select,
    ...(query.filter ? { filter: query.filter } : {}),
    ...(query.top ? { top: query.top } : {}),
    ...(query.orderBy
      ? { orderBy: `${query.orderBy.field}${query.orderBy.descending ? ' desc' : ' asc'}` }
      : {}),
  };
}
