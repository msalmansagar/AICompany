import {
  deceasedReviewId, toDeceasedReviewRow,
  type DeceasedIndication, type DeceasedReview, type DeceasedReviewRow,
} from '@dcp/domain';
import type { ContinuationToken } from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { ACTIVITY_COLUMNS, ENTITY_SETS, SNAPSHOT_COLUMNS } from './schema.js';
import { escapeOData, mapPage } from './collectionQueries.js';
import { toActivityRow } from './caseQueries.js';
import { loadActivityTypes } from './configurationCatalog.js';

/**
 * Reading the QCB deceased indication, and the review of it.
 *
 * **The 724 indications are never loaded into the browser.** The indication lives on
 * `qdb_delinquencysnapshot.qdb_isdeceasedperqcb`, and the filter for it is sent to the platform —
 * as a clause on a bounded, sorted, paged read, or as a count. Fetching every snapshot and testing
 * the flag here would work on a demo case and fall over on the book, which is the whole point of
 * the large-data rule.
 *
 * **The review is found by its derived id, never by searching.** One facility on one case has one
 * review, so a retry or a double-click writes to the same place and the platform refuses the
 * second attempt rather than this code deciding it already knows.
 */

/** The OData clause for "this facility currently shows a QCB deceased indication". */
export const DECEASED_INDICATION_FILTER = 'qdb_isdeceasedperqcb eq true';

/**
 * How many cases currently carry an indication.
 *
 * A count, not a list: the number belongs on a tile, and asking for it as a count means the
 * browser never holds the rows. Returns `null` when the platform does not answer, so a caller can
 * say "unknown" rather than show a zero it has no evidence for (KI-96).
 */
export async function countDeceasedIndications(
  adapter: XrmCrmAdapter,
  scopeFilter?: string,
): Promise<number | null> {
  const filter = scopeFilter
    ? `${DECEASED_INDICATION_FILTER} and ${scopeFilter}`
    : DECEASED_INDICATION_FILTER;
  return adapter.count(ENTITY_SETS.delinquencySnapshot, filter);
}

/**
 * The most recent snapshot's indication for one case.
 *
 * Reads **one** row — the newest snapshot — rather than the case's history, because an indication
 * is a statement about a moment and the current one is the only one an officer acts on. The older
 * snapshots remain, and nothing here deletes or rewrites them.
 */
export async function loadDeceasedIndication(
  adapter: XrmCrmAdapter,
  caseId: string,
): Promise<DeceasedIndication> {
  const page = await adapter.retrievePage(ENTITY_SETS.delinquencySnapshot, {
    select: [...SNAPSHOT_COLUMNS],
    pageSize: 1,
    sort: [{ field: 'qdb_snapshotdate', descending: true }],
    filter: `_qdb_collectioncaseid_value eq ${escapeOData(caseId)}`,
  });

  const row = page.items[0];
  if (!row) return { present: false };

  const present = row['qdb_isdeceasedperqcb'] === true;
  const asOf = typeof row['qdb_snapshotdate'] === 'string' ? row['qdb_snapshotdate'] : undefined;
  const facilityNumber = typeof row['qdb_facilitynumber'] === 'string'
    ? row['qdb_facilitynumber'] : undefined;

  return {
    present,
    // The source is named only where the indication is actually present; claiming a source for an
    // absent indication would assert that QCB said someone was alive, which it did not.
    ...(present ? { source: 'QcbViaMis' as const } : {}),
    ...(asOf !== undefined ? { asOf } : {}),
    ...(facilityNumber !== undefined ? { facilityNumber } : {}),
  };
}

/**
 * The review activity for one facility on one case, by its derived id.
 *
 * `null` means no review has been recorded. That is a safe absence here — unlike the Legal and
 * Complaint reads, this record is DCP's own and an officer who can see the case can see it.
 */
export async function loadDeceasedReview(
  adapter: XrmCrmAdapter,
  caseId: string,
  facilityNumber: string,
): Promise<DeceasedReview | null> {
  const record = await adapter.retrieve(
    { entity: ENTITY_SETS.collectionActivity, id: deceasedReviewId(caseId, facilityNumber) },
    [...ACTIVITY_COLUMNS],
  );
  if (!record) return null;

  const activity = toActivityRow(record);
  return {
    activityId: activity.id,
    ...(activity.status !== undefined ? { status: activity.status } : {}),
    ...(activity.createdOn !== undefined ? { recordedOn: activity.createdOn } : {}),
    ...(activity.ownerName !== undefined ? { ownerName: activity.ownerName } : {}),
    ...(activity.subject !== undefined ? { notes: activity.subject } : {}),
  };
}

/** Everything the case screen needs about the deceased indication, in one composed row. */
export async function loadDeceasedReviewRow(
  adapter: XrmCrmAdapter,
  caseId: string,
): Promise<DeceasedReviewRow> {
  const indication = await loadDeceasedIndication(adapter, caseId);

  // No indication means nothing to review, and no reason to go looking for one.
  const review = indication.present && indication.facilityNumber
    ? await loadDeceasedReview(adapter, caseId, indication.facilityNumber)
    : null;

  return toDeceasedReviewRow({
    indication,
    ...(review !== null ? { review } : {}),
    formatDate: iso => iso.slice(0, 10),
  });
}

/**
 * The activity type a Deceased Review is recorded against.
 *
 * Matched on the **code**, in one place, exactly as Legal and the concern types are. The
 * configured display name is `Deceased / Insurance`, and that label is **not** evidence that an
 * insurance process exists — WP15 found none (KI-125). The code is the handle; the word
 * "Insurance" in the label is ignored entirely.
 */
const DECEASED_CODE_SUFFIX = 'DECEASED';

export function isDeceasedTypeCode(code: string | undefined): boolean {
  if (!code) return false;
  const upper = code.trim().toUpperCase();
  return upper === DECEASED_CODE_SUFFIX || upper.endsWith(`-${DECEASED_CODE_SUFFIX}`);
}

export async function findDeceasedTypeId(adapter: XrmCrmAdapter): Promise<string | null> {
  const types = await loadActivityTypes(adapter);
  return types.find(type => isDeceasedTypeCode(type.code))?.id ?? null;
}

/**
 * Cases carrying an indication, as a bounded page.
 *
 * Narrowed, sorted and paged by the platform with an opaque continuation, so a queue over 724
 * rows — or 7,240 — costs the browser one page. Nothing correlates snapshots and cases here.
 */
export function createDeceasedQueue(adapter: XrmCrmAdapter) {
  return async (request: {
    pageSize: number; continuation?: ContinuationToken; scopeFilter?: string;
  }) => {
    const filter = request.scopeFilter
      ? `${DECEASED_INDICATION_FILTER} and ${request.scopeFilter}`
      : DECEASED_INDICATION_FILTER;

    const page = await adapter.retrievePage(ENTITY_SETS.delinquencySnapshot, {
      select: [...SNAPSHOT_COLUMNS],
      pageSize: request.pageSize,
      sort: [{ field: 'qdb_snapshotdate', descending: true }],
      filter,
      ...(request.continuation !== undefined ? { continuation: request.continuation } : {}),
      includeTotalCount: request.continuation === undefined,
    });
    return mapPage(page, row => row);
  };
}
