import {
  isConcernTypeCode, toComplaintRow, toDisputeRow,
  type CollectionDispute, type ConcernRow, type ExternalProcessReference, type Page,
} from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { ACTIVITY_COLUMNS, ENTITY_SETS } from './schema.js';
import { CASE_CARD_PAGE_SIZE, escapeOData, mapPage } from './collectionQueries.js';
import { toActivityRow, type ActivityRow } from './caseQueries.js';
import { loadActivityTypes } from './configurationCatalog.js';
import type { ExternalRecordSummary, ReferenceSummariser } from './externalReferenceService.js';

/**
 * One case's disputes and complaints, kept apart.
 *
 * The two are different business concepts and DCP must never derive one from the other. What makes
 * that possible without guessing is the **hand-off**: an activity that raised a formal Complaint
 * carries an external process reference to Case Management (record type `incident`), and one that
 * did not, did not.
 *
 * The configuration cannot answer it: Phase 6 ships a single activity type labelled
 * `Complaint / Dispute` (**KI-118**), so the type says an activity concerns one of the two and
 * cannot say which. An activity of that type with no hand-off is a **Collection Dispute**; one with
 * a hand-off raised a **formal Customer Complaint** in BFD CRM's Case Management, which owns it.
 */

export { isConcernTypeCode };

export interface CaseConcerns {
  /** Contested collection information. DCP's own, and nothing downstream. */
  disputes: readonly ConcernRow[];
  /** Formal Complaints raised from this case, as Case Management reports them. */
  complaints: readonly ConcernRow[];
  /** Whether the case holds more concern activities than one card reads. */
  hasMore: boolean;
}

/** The complaint row, plus where to open it when Case Management's link is known. */
export type ComplaintConcernRow = ConcernRow & { openUrl?: string };

/**
 * Reads both from one narrowed activity read, plus — when the Integration Service is reachable —
 * one summary call for the whole card. Without it the rows still say a Complaint exists and give
 * its number; only the owning module's current status is missing, and the row says so.
 */
export async function loadCaseConcerns(
  adapter: XrmCrmAdapter,
  caseId: string,
  summarise?: ReferenceSummariser,
): Promise<CaseConcerns> {
  const page = await readConcernActivities(adapter, caseId, await readConcernTypeIds(adapter));
  const handOffs = page.items.filter(activity => activity.handOff === 'Complaint');
  const summaries = await readSummaries(handOffs, summarise);
  const formatDate = (iso: string) => iso.slice(0, 10);
  return {
    disputes: page.items.filter(activity => activity.handOff === undefined).map(activity => toDisputeRow(toCollectionDispute(activity), formatDate)),
    complaints: handOffs.map(activity => toComplaintConcernRow(activity, summaries, formatDate)),
    hasMore: page.hasMore,
  };
}

async function readSummaries(activities: readonly ActivityRow[], summarise?: ReferenceSummariser): Promise<ReadonlyMap<string, ExternalRecordSummary>> {
  const references = activities.map(activity => activity.externalReference).filter((ref): ref is ExternalProcessReference => ref !== undefined);
  if (!summarise || references.length === 0) return new Map();
  return summarise(references);
}

/**
 * A Complaint row. Three honest states:
 *   the hand-off has no record yet — it is being raised, or Case Management refused it;
 *   the record is known and Case Management reported it — its own number and status;
 *   the record is known but its status could not be read — the number, and why not.
 */
function toComplaintConcernRow(
  activity: ActivityRow,
  summaries: ReadonlyMap<string, ExternalRecordSummary>,
  formatDate: (iso: string) => string,
): ComplaintConcernRow {
  const reference = activity.externalReference;
  if (!reference) return pendingComplaintRow(activity, formatDate);
  const summary = summaries.get(reference.recordId);
  if (summary?.availability === 'found') {
    return {
      ...toComplaintRow({
        caseNumber: summary.recordNumber ?? reference.recordNumber ?? 'Complaint',
        ...(summary.statusReason ? { status: summary.statusReason } : {}),
        ...(summary.createdOn ? { createdOn: summary.createdOn } : {}),
      }, formatDate),
      openUrl: summary.openUrl,
    };
  }
  return unreadComplaintRow(activity, reference, summary, formatDate);
}

function pendingComplaintRow(activity: ActivityRow, formatDate: (iso: string) => string): ComplaintConcernRow {
  const refused = activity.stateCode === 2;
  return {
    key: activity.id,
    concern: 'CustomerComplaint',
    heading: refused ? 'Complaint not created' : 'Complaint being raised',
    detail: refused ? 'Case Management refused it; nothing was created' : 'Case Management has not confirmed the Case yet',
    recordedOn: activity.createdOn ? formatDate(activity.createdOn) : 'Not recorded',
    status: activity.status ?? (refused ? 'Cancelled' : 'In Progress'),
  };
}

function unreadComplaintRow(
  activity: ActivityRow,
  reference: ExternalProcessReference,
  summary: ExternalRecordSummary | undefined,
  formatDate: (iso: string) => string,
): ComplaintConcernRow {
  const detail = summary?.availability === 'forbidden'
    ? 'You do not have access to its details'
    : summary?.availability === 'notFound'
      ? 'Case Management no longer holds it'
      : 'Its current status is shown in Case Management';
  return {
    key: activity.id,
    concern: 'CustomerComplaint',
    heading: `Complaint ${reference.recordNumber ?? 'raised'}`,
    detail,
    recordedOn: activity.createdOn ? formatDate(activity.createdOn) : 'Not recorded',
    status: 'Not shown',
    ...(summary?.openUrl ? { openUrl: summary.openUrl } : {}),
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

/** Concern-typed activities, or any activity that handed off to Case Management whatever its type. */
async function readConcernActivities(
  adapter: XrmCrmAdapter,
  caseId: string,
  concernTypeIds: ReadonlySet<string>,
): Promise<Page<ActivityRow>> {
  const typeClause = [...concernTypeIds].map(id => `_qdb_activitytypeid_value eq ${escapeOData(id)}`).join(' or ');
  const complaintHandOff = "qdb_relatedrecordtype eq 'incident'";
  const concernSide = typeClause ? `(${complaintHandOff} or (${typeClause}))` : complaintHandOff;
  return mapPage(
    await adapter.retrievePage(ENTITY_SETS.collectionActivity, {
      select: [...ACTIVITY_COLUMNS],
      pageSize: CASE_CARD_PAGE_SIZE,
      sort: [{ field: 'createdon', descending: true }],
      filter: `_qdb_collectioncaseid_value eq ${escapeOData(caseId)} and ${concernSide}`,
    }),
    toActivityRow,
  );
}

/**
 * The concern type, for asking whether a dispute or complaint activity can be concluded.
 *
 * Disputes and complaints share one configured type on this organisation, so one id answers for
 * both cards. What separates the two concepts is the hand-off, never the type.
 */
export async function findConcernTypeId(adapter: XrmCrmAdapter): Promise<string | undefined> {
  const ids = await readConcernTypeIds(adapter);
  return [...ids][0];
}
