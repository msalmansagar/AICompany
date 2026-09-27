import {
  legalFetchFromFailure, type LegalRecordFetch, type LitigationSummary,
} from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { ENTITY_SETS, LITIGATION_COLUMNS } from './schema.js';
import { readFormatted, readNumber, readText, type CrmRow } from './rowReaders.js';

/**
 * Reading QDB's Legal process, through the one link that is allowed to find it.
 *
 * **The lookup is the only route.** A Litigation Request is never rediscovered by customer, name,
 * date, activity type, `regardingobjectid`, or a search of the Legal entity. Those would each
 * sometimes find the *wrong* request — a customer with two matters, a name that repeats, a date
 * that coincides — and a Collection Officer would have no way to tell. `qdb_legalrequestid` is the
 * relationship WP9 established for exactly this, and it is authoritative.
 *
 * It also means the read is **one record by id**, not a query. Nothing here grows with the book,
 * so there is no page to bound: the large-data rule is satisfied by not asking a question that
 * could return a list.
 *
 * Reads happen as the signed-in officer. Where they are refused, that refusal is reported as a
 * refusal — see `loadLitigation`.
 */

/**
 * The Litigation Request behind one link, or the reason it could not be read.
 *
 * Returns a `LegalRecordFetch` rather than `LitigationSummary | null`, because null cannot express
 * the difference between *the organisation does not hold this* and *you may not see this*. On
 * `org5869857f` the second is what a real Collection Officer gets, since no DCP security role
 * holds read permission on the Legal entity — so a null-returning read would quietly tell every
 * officer that no litigation exists.
 */
export async function loadLitigation(
  adapter: XrmCrmAdapter,
  legalRequestId: string,
): Promise<LegalRecordFetch> {
  const { record, failure } = await adapter.retrieveClassified(
    { entity: ENTITY_SETS.litigationRequest, id: legalRequestId },
    [...LITIGATION_COLUMNS],
  );

  if (failure) return { kind: legalFetchFromFailure(failure.kind) };
  // A success with no record is not an absence; it is a read that told us nothing.
  if (!record) return { kind: 'unavailable' };
  return { kind: 'found', record: toLitigationSummary(record) };
}

/**
 * The Legal record, reduced to what Collections needs.
 *
 * `status` is the platform's **formatted value** for `statuscode` and nothing else. There is no
 * label table here on purpose: the 25 reasons belong to Legal's lifecycle, and a copy in this file
 * would be a second state machine that drifts the first time Legal adds a stage. If the platform
 * sends no formatted value, the status is absent and the screen says so rather than guessing.
 */
export function toLitigationSummary(row: CrmRow): LitigationSummary {
  return {
    reference: readText(row, 'qdb_name') ?? 'Legal request',
    ...optional('status', readFormatted(row, 'statuscode')),
    ...optional('createdOn', readText(row, 'createdon')),
    ...optional('customerName', readFormatted(row, '_qdb_customer_value')),
    ...optional('outstandingAmount', readNumber(row, 'qdb_outstandingamount')),
    ...optional('lawyerName', readText(row, 'qdb_lawyername')),
  };
}

/** Keeps an absent value absent, which `exactOptionalPropertyTypes` treats as different from unset. */
function optional<T>(key: string, value: T | undefined): Record<string, T> {
  return value === undefined ? {} : { [key]: value };
}
