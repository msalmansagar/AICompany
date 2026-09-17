/**
 * The CRM seam.
 *
 * Collection business logic talks to the organisation through `ICrmAdapter` and nothing else. The
 * interface is deliberately small and free of OData, the Dataverse SDK and HTTP: those are cloud
 * shapes, and the same logic has to run against Dynamics CE 9.1 on-premises with no source change.
 * An on-premises adapter over the Organization Service satisfies this contract exactly as the
 * Dataverse one does.
 *
 * What is *not* here is as important as what is. No entity or column names appear in this file:
 * callers resolve those through the platform configuration, because the customer and facility
 * masters belong to QDB and differ between the Housing Loan and BFD deployments.
 */

/** A record as the Collection layer sees it: plain values, no platform types. */
export type CrmRecord = Record<string, unknown>;

/** A reference to a record in a named table. */
export interface CrmReference {
  /** Logical name of the table the record lives in. */
  entity: string;
  /** Primary key of the record. */
  id: string;
}

/** Query shape supported on both targets. Deliberately narrower than OData. */
export interface CrmQuery {
  /** Columns to return. Always supplied — no caller should pull every column. */
  select: string[];
  /** Platform-neutral filter expression, passed through by the adapter. */
  filter?: string;
  /** Column to sort by, with direction. */
  orderBy?: { field: string; descending?: boolean };
  /** Maximum rows to return. */
  top?: number;
}

/** Context carried through every call so a request can be traced end to end. */
export interface CrmCallContext {
  correlationId?: string;
}

/**
 * Every CRM operation the Collection layer is allowed to perform.
 *
 * `execute` covers the one platform difference that cannot be hidden by naming alone: the same
 * server-side operation is a Custom API on Dataverse and a Process Action on-premises. Both are
 * invoked by name with a parameter bag, so callers name the operation and the adapter knows how to
 * reach it.
 */
export interface ICrmAdapter {
  /** Reads one record by primary key, or `null` when it does not exist. */
  retrieve(reference: CrmReference, select: string[], context?: CrmCallContext): Promise<CrmRecord | null>;

  /** Reads one record by a unique business key, or `null` when it does not exist. */
  retrieveByKey(
    entity: string,
    key: { field: string; value: string },
    select: string[],
    context?: CrmCallContext,
  ): Promise<CrmRecord | null>;

  /** Reads the records matching a query. */
  retrieveMultiple(entity: string, query: CrmQuery, context?: CrmCallContext): Promise<CrmRecord[]>;

  /** Creates a record and returns its primary key. */
  create(entity: string, values: CrmRecord, context?: CrmCallContext): Promise<string>;

  /** Applies a partial update to a record. */
  update(reference: CrmReference, values: CrmRecord, context?: CrmCallContext): Promise<void>;

  /** Invokes a named server-side operation: a Custom API on cloud, a Process Action on-premises. */
  execute(operation: string, parameters: CrmRecord, context?: CrmCallContext): Promise<unknown>;
}
