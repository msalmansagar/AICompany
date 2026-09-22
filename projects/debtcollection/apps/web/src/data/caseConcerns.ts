import {
  toComplaintRow, toDisputeRow,
  type CaseTypeResolution, type CollectionDispute, type ConcernRow,
} from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { ACTIVITY_COLUMNS, ENTITY_SETS } from './schema.js';
import { escapeOData, mapPage } from './collectionQueries.js';
import { toActivityRow, type ActivityRow } from './caseQueries.js';
import { loadActivityTypes } from './configurationCatalog.js';
import { loadComplaintCase, loadComplaintCaseType } from './complaintQueries.js';

/**
 * One case's disputes and complaints, kept apart.
 *
 * The two are different business concepts and DCP must never derive one from the other. What makes
 * that possible without guessing is the **link**: an activity that raised a formal Complaint
 * carries `qdb_complaintcaseid`, and one that did not, did not.
 *
 * That is worth stating plainly, because the configuration cannot answer it. Phase 6 ships a single
 * activity type labelled `Complaint / Dispute` (**KI-118**), so the type says an activity concerns
 * one of the two and cannot say which. The authoritative link does. An activity of that type with
 * no Complaint behind it is a **Collection Dispute**; one with a Complaint behind it raised a
 * **formal Customer Complaint**. Nothing parses the display name to decide.
 */

/**
 * The code suffix that identifies the combined dispute/complaint activity type.
 *
 * The single place `P6-DISPUTE` semantics live, exactly as `isLegalRecommendationCode` is for
 * Legal. The **code** is matched, never the display name — a rename in configuration would
 * otherwise empty this screen silently, which is the KI-52 failure shape.
 *
 * This is a contained compatibility mechanism, not a pattern to spread: KI-118 records that QDB
 * still has to split the type, and when it does, only this constant changes.
 */
const CONCERN_CODE_SUFFIX = 'DISPUTE';

/**
 * A **separator** is required before the suffix, and that is not fussiness.
 *
 * A bare "ends with DISPUTE" also matches the display name `Complaint / Dispute` — the very label
 * this function exists to avoid depending on. Requiring `-DISPUTE` (or the whole code to be
 * `DISPUTE`) keeps it matching codes like `P6-DISPUTE` and `DEMO-DISPUTE` and nothing that
 * happens to end in the word.
 */
export function isConcernTypeCode(code: string | undefined): boolean {
  if (!code) return false;
  const upper = code.trim().toUpperCase();
  return upper === CONCERN_CODE_SUFFIX || upper.endsWith(`-${CONCERN_CODE_SUFFIX}`);
}

export interface CaseConcerns {
  /** Contested collection information. DCP's own, and nothing downstream. */
  disputes: readonly ConcernRow[];
  /** Formal Complaints raised from this case, as Case Management holds them. */
  complaints: readonly ConcernRow[];
  /** Resolved once from metadata, so the UI can say whether raising one is even possible. */
  caseType: CaseTypeResolution;
}

/**
 * Reads both, from one narrowed activity read plus at most one Case read per linked complaint.
 *
 * The activity read is narrowed by the platform to the activities that could be either — a
 * concern-typed activity, **or** any activity carrying a Complaint link. The second clause matters:
 * traceability follows the link, so an activity whose type was later changed must not lose its
 * Complaint.
 */
export async function loadCaseConcerns(
  adapter: XrmCrmAdapter,
  caseId: string,
): Promise<CaseConcerns> {
  const [caseType, concernTypeIds] = await Promise.all([
    loadComplaintCaseType(adapter),
    readConcernTypeIds(adapter),
  ]);
  const activities = await readConcernActivities(adapter, caseId, concernTypeIds);

  const formatDate = (iso: string) => iso.slice(0, 10);
  const disputes: ConcernRow[] = [];
  const complaints: ConcernRow[] = [];

  for (const activity of activities) {
    if (!activity.complaintCaseId) {
      disputes.push(toDisputeRow(toCollectionDispute(activity), formatDate));
      continue;
    }
    complaints.push(await toComplaintConcernRow(adapter, activity, formatDate));
  }

  return { disputes, complaints, caseType };
}

/**
 * A linked Complaint, read through its lookup.
 *
 * Where the read is refused — the expected answer for a real Collection Officer, since no DCP role
 * holds `prvReadIncident` (KI-120) — the row still says a Complaint **exists**. Reporting it as
 * absent would tell an officer no complaint had been raised when one had.
 */
async function toComplaintConcernRow(
  adapter: XrmCrmAdapter,
  activity: ActivityRow,
  formatDate: (iso: string) => string,
): Promise<ConcernRow> {
  const fetched = await loadComplaintCase(adapter, activity.complaintCaseId!);
  if (fetched.kind === 'found') return toComplaintRow(fetched.record, formatDate);

  const detail = fetched.kind === 'forbidden'
    ? 'You do not have access to its details'
    : fetched.kind === 'notFound'
      ? 'It could not be found'
      : 'Its details could not be loaded just now';

  return {
    key: activity.id,
    concern: 'CustomerComplaint',
    heading: 'Complaint raised',
    detail,
    recordedOn: activity.createdOn ? formatDate(activity.createdOn) : 'Not recorded',
    status: 'Not shown',
  };
}

function toCollectionDispute(activity: ActivityRow): CollectionDispute {
  return {
    activityId: activity.id,
    ...(activity.status !== undefined ? { status: activity.status } : {}),
    ...(activity.createdOn !== undefined ? { recordedOn: activity.createdOn } : {}),
    ...(activity.ownerName !== undefined ? { ownerName: activity.ownerName } : {}),
    ...(activity.subject !== undefined ? { notes: activity.subject } : {}),
  };
}

async function readConcernTypeIds(adapter: XrmCrmAdapter): Promise<ReadonlySet<string>> {
  const types = await loadActivityTypes(adapter);
  return new Set(types.filter(type => isConcernTypeCode(type.code)).map(type => type.id));
}

async function readConcernActivities(
  adapter: XrmCrmAdapter,
  caseId: string,
  concernTypeIds: ReadonlySet<string>,
): Promise<readonly ActivityRow[]> {
  const typeClause = [...concernTypeIds]
    .map(id => `_qdb_activitytypeid_value eq ${escapeOData(id)}`)
    .join(' or ');
  const concernSide = typeClause
    ? `(_qdb_complaintcaseid_value ne null or (${typeClause}))`
    : '_qdb_complaintcaseid_value ne null';

  return mapPage(
    await adapter.retrievePage(ENTITY_SETS.collectionActivity, {
      select: [...ACTIVITY_COLUMNS],
      pageSize: 100,
      sort: [{ field: 'createdon', descending: true }],
      filter: `_qdb_collectioncaseid_value eq ${escapeOData(caseId)} and ${concernSide}`,
    }),
    toActivityRow,
  ).items;
}
