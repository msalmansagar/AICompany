import {
  interpretLegalRead, isComplaintCaseType, resolveComplaintCaseType,
  type CaseTypeResolution, type ComplaintCaseSummary,
} from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { COMPLAINT_CASE_COLUMNS, ENTITY_SETS } from './schema.js';
import { readFormatted, readText, type CrmRow } from './rowReaders.js';

/**
 * Reading a formal Customer Complaint — through the link, and only through the link.
 *
 * **A Complaint is never rediscovered.** Not by customer, not by title, not by date, not by
 * category, not by case type, and not by any fuzzy match. A customer may hold several Cases and
 * an officer would have no way to tell which one this activity raised, so the only route is
 * `qdb_complaintcaseid` — one record, by id.
 *
 * That also settles the large-data question without a page: nothing here asks a question that
 * could return a list.
 */

/**
 * The Complaint behind one link, or the reason it could not be read.
 *
 * Reuses the Legal read model's fetch outcome, because the distinction it preserves is the same
 * one and it matters here for the same reason: **403 and 404 mean opposite things.** 403 says the
 * Complaint exists and this officer may not see it; 404 says the organisation does not hold it.
 * No DCP role currently holds `prvReadIncident` (KI-120), so a refused read is the expected answer
 * for a real Collection Officer — and reporting it as "no complaint" would be a lie told to every
 * one of them.
 */
export async function loadComplaintCase(
  adapter: XrmCrmAdapter,
  complaintCaseId: string,
): Promise<
  | { kind: 'found'; record: ComplaintCaseSummary }
  | { kind: 'forbidden' | 'notFound' | 'unavailable' }
> {
  const { status, record } = await adapter.retrieveWithStatus(
    { entity: ENTITY_SETS.complaintCase, id: complaintCaseId },
    [...COMPLAINT_CASE_COLUMNS],
  );

  const kind = interpretLegalRead(status);
  if (kind !== 'found' || !record) return { kind: kind === 'found' ? 'unavailable' : kind };
  return { kind: 'found', record: toComplaintCaseSummary(record) };
}

/**
 * The Case, reduced to what Collections needs.
 *
 * `status` and `caseType` are the platform's own **formatted values**. There is no label table
 * here on purpose: Case Management owns the 13-status complaint lifecycle and its escalation
 * ladder, and a copy would drift the first time QDB adds a stage. Where the platform sends no
 * formatted value the field is absent and the screen says so rather than guessing.
 */
export function toComplaintCaseSummary(row: CrmRow): ComplaintCaseSummary {
  return {
    caseNumber: readText(row, 'ticketnumber') ?? 'Complaint',
    ...optional('status', readFormatted(row, 'statuscode')),
    ...optional('category', readFormatted(row, 'casetypecode')),
    ...optional('createdOn', readText(row, 'createdon')),
    ...optional('department', readFormatted(row, '_customerid_value')),
  };
}

/**
 * The Complaint case-type contract, resolved from live metadata.
 *
 * Read once per session by the caller and passed down, rather than resolved per render: it is
 * configuration, and configuration does not change between two rows of the same table.
 */
export async function loadComplaintCaseType(adapter: XrmCrmAdapter): Promise<CaseTypeResolution> {
  const options = await adapter.readOptionSet('incident', 'casetypecode');
  if (!options) {
    return {
      resolved: false,
      reason: 'The complaint settings could not be read, so a complaint cannot be raised.',
    };
  }
  return resolveComplaintCaseType(options);
}

/**
 * Whether a Case that was read really is a Complaint.
 *
 * Checked against the resolved contract rather than assumed from the link, because the link only
 * says DCP raised *a* Case. KI-123 makes this worth checking: the option set was redefined in
 * place, so a stored integer alone is not evidence of what kind of Case it is.
 */
export function readCaseIsComplaint(row: CrmRow, resolution: CaseTypeResolution): boolean {
  const raw = row['casetypecode'];
  return isComplaintCaseType(typeof raw === 'number' ? raw : undefined, resolution);
}

/** Keeps an absent value absent, which `exactOptionalPropertyTypes` treats as different from unset. */
function optional<T>(key: string, value: T | undefined): Record<string, T> {
  return value === undefined ? {} : { [key]: value };
}
