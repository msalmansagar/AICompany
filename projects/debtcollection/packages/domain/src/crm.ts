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

import type { ContinuationToken, Page, Sort } from './paging.js';

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

/**
 * A page of a large result set, requested from the source rather than narrowed in memory.
 *
 * `select`, `filter`, `sort` and `search` are applied by the platform. `pageSize` is required —
 * there is no safe default, because a source asked for no page size may return everything.
 */
export interface CrmPageQuery {
  select: string[];
  pageSize: number;
  /** Opaque continuation from a previous page. Absent means the first page. */
  continuation?: ContinuationToken;
  filter?: string;
  /** Ordering, most significant first. Ties can span a page boundary, so order deliberately. */
  sort?: readonly Sort[];
  search?: string;
  /** Ask the source for a total. Only honoured where it is cheap; never inferred. */
  includeTotalCount?: boolean;
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

  /** Reads the records matching a query. Bounded sets only — use `retrievePage` for large ones. */
  retrieveMultiple(entity: string, query: CrmQuery, context?: CrmCallContext): Promise<CrmRecord[]>;

  /**
   * Reads ONE page of a large result set, server-side.
   *
   * This exists beside `retrieveMultiple` rather than replacing it: the Phase 1-3 repositories read
   * bounded configuration and single records, where a page would be noise. Anything that can grow
   * with the book — delinquency lists, case lists, activity history, snapshots — uses this.
   */
  retrievePage(entity: string, query: CrmPageQuery, context?: CrmCallContext): Promise<Page<CrmRecord>>;

  /** Creates a record and returns its primary key. */
  create(entity: string, values: CrmRecord, context?: CrmCallContext): Promise<string>;

  /** Applies a partial update to a record. */
  update(reference: CrmReference, values: CrmRecord, context?: CrmCallContext): Promise<void>;

  /** Invokes a named server-side operation: a Custom API on cloud, a Process Action on-premises. */
  execute(operation: string, parameters: CrmRecord, context?: CrmCallContext): Promise<unknown>;
}

/**
 * Optimistic concurrency, for the adapters that can offer it.
 *
 * Deliberately **not** part of `ICrmAdapter`. The workspace needs it — two collection officers work
 * one case, and §12 requires stale-write detection — while the service-side adapter has no caller
 * that does today. Widening the base interface would have forced an implementation that throws "not
 * supported", which is the Liskov violation the coding standards name outright.
 *
 * So it is a separate, small capability an adapter may also implement, and a caller that needs it
 * asks for this type rather than for `ICrmAdapter`. When the service side needs it — Phase 8
 * automation writing alongside a human is the obvious moment — it implements this and nothing about
 * the base contract moves.
 *
 * See ADR-DCP-18.
 */
export interface IConcurrencyControlledWrites {
  /**
   * Reads a record together with the version token needed to write it back safely.
   *
   * Separate from `retrieve` because most reads do not intend to write, and a caller holding a
   * version it never uses invites the temptation to write without one.
   */
  retrieveVersioned(
    reference: CrmReference,
    select: string[],
    context?: CrmCallContext,
  ): Promise<VersionedRecord | null>;

  /**
   * Updates a record only if it still carries the version the caller read.
   *
   * Throws {@link CrmConcurrencyError} when it has moved — never silently overwrites.
   */
  updateVersioned(
    reference: CrmReference,
    values: CrmRecord,
    expectedVersion: RowVersion,
    context?: CrmCallContext,
  ): Promise<RowVersion>;
}

/**
 * A record's version, as the platform issues it.
 *
 * Branded so it cannot be confused with an ordinary string, and **opaque**: it is the platform's
 * ETag, and no caller should parse, compare or construct one. Its only use is being handed back.
 */
export type RowVersion = string & { readonly __brand: 'RowVersion' };

export interface VersionedRecord {
  record: CrmRecord;
  version: RowVersion;
}

/**
 * The record moved between the read and the write.
 *
 * A distinct type because the UI must tell this apart from a generic save failure: "this record
 * changed while you were editing it, reload and try again" is a different conversation from "the
 * save failed". Phase 6 §11 requires the distinction, and a caller that cannot make it ends up
 * showing a retry button that will fail the same way every time.
 */
export class CrmConcurrencyError extends Error {
  readonly reference: CrmReference;
  readonly expectedVersion: RowVersion;

  constructor(reference: CrmReference, expectedVersion: RowVersion, platformMessage?: string) {
    super(
      `${reference.entity} ${reference.id} changed since it was read. ` +
      'Reload the record and apply the change again.' +
      (platformMessage ? ` Platform: ${platformMessage}` : ''));
    this.name = 'CrmConcurrencyError';
    this.reference = reference;
    this.expectedVersion = expectedVersion;
  }
}

/** Narrows an unknown error to a concurrency conflict, for callers that must branch on it. */
export function isConcurrencyConflict(error: unknown): error is CrmConcurrencyError {
  return error instanceof CrmConcurrencyError;
}
