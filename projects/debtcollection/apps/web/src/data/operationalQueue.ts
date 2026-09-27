import {
  dedupeWork, toWorkCount,
  type ContinuationToken, type OperationalBucket, type Page, type WorkCount, type WorkItem,
  type WorkType,
} from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { ACTIVITY_COLUMNS, ENTITY_SETS, NAVIGATION_PROPERTIES } from './schema.js';
import { escapeOData, mapPage } from './collectionQueries.js';
import { isLegalRecommendationCode } from './legalTraceRows.js';
import { isConcernTypeCode } from './caseConcerns.js';
import { isDeceasedTypeCode } from './deceasedQueries.js';
import { loadActivityTypes } from './configurationCatalog.js';
import { readFormatted, readNumber, readText, type CrmRow } from './rowReaders.js';

/**
 * The operational queue — narrowed, sorted and paged **by the platform**, every time.
 *
 * Nothing here loads work and classifies it in the browser. Each bucket becomes an OData clause,
 * the page comes back bounded with an opaque continuation, and `DataGrid` supplies virtualization
 * and stale-response suppression. A queue that filtered client-side would look identical on a demo
 * case and fall over on the book — which is the whole reason the rule exists.
 *
 * **Downstream state costs no extra requests.** A row that carries a Litigation Request or a
 * Complaint brings that record's own reference and status back in the **same** read, through
 * `$expand` on the navigation property. Fifty rows is one request, not fifty-one. That was
 * verified against the organisation, together with a filter and an order-by, because `$expand` on
 * the *attribute* name is rejected with 400 while the navigation property works.
 */

/** The single-valued navigation properties that carry downstream state. */
const DOWNSTREAM_EXPANSION = [
  `${NAVIGATION_PROPERTIES.activityToLegalRequest}($select=qdb_name,statuscode)`,
  `${NAVIGATION_PROPERTIES.activityToComplaintCase}($select=ticketnumber,statuscode)`,
] as const;

export interface WorkQueueRequest {
  bucket: OperationalBucket;
  pageSize: number;
  continuation?: ContinuationToken;
  /** The signed-in user, for the buckets that depend on ownership. */
  currentUserId?: string;
  /** Free text, applied by the source — never a browser-side scan. */
  search?: string;
  scopeFilter?: string;
}

/**
 * Builds the OData clause for one bucket.
 *
 * Exported so the clause itself can be asserted: the guard that matters is that a bucket *is* a
 * filter sent to the platform, and a test can only prove that by reading the filter.
 *
 * Two buckets are deliberately **not** expressible here and return `null`:
 *
 * **Due Soon and Overdue** need a deadline, and DCP has no stored deadline column — the TAT start
 * policy is unconfigured (KI-101), so `computeDeadline` returns *undetermined* for every activity
 * on this organisation. A filter that guessed one would fill the queue with work that is not late.
 * **Escalated** reads the platform's own flag and is expressible; lateness never implies it.
 */
export function bucketFilter(
  bucket: OperationalBucket,
  context: { currentUserId?: string; typeIds: TypeIds },
): string | null {
  const openWork = 'statecode eq 0';

  switch (bucket) {
    case 'MyAssigned':
      return context.currentUserId
        ? `${openWork} and _ownerid_value eq ${escapeOData(context.currentUserId)}`
        : null;
    case 'AwaitingAssignment':
      return `${openWork} and _ownerid_value eq null`;
    case 'AssignmentRequiresAttention':
      // Assignment exceptions are a WP6 decision, not a stored column. Nothing on the record says
      // "this could not be assigned", so this bucket has no honest server-side filter yet.
      return null;
    case 'Escalated':
      return `${openWork} and qdb_supervisorescalated eq true`;
    case 'Legal':
      return typeClause(openWork, context.typeIds.legal, '_qdb_legalrequestid_value ne null');
    case 'Disputes':
      // A dispute is a concern activity with NO complaint behind it — the authoritative
      // distinction, sent to the platform rather than decided here.
      return context.typeIds.concern.length > 0
        ? `${openWork} and _qdb_complaintcaseid_value eq null and (${orOnType(context.typeIds.concern)})`
        : null;
    case 'Complaints':
      return `${openWork} and _qdb_complaintcaseid_value ne null`;
    case 'DeceasedReview':
      // Actual review work only. The 724 QCB indications are not review tasks and are never
      // turned into any.
      return typeClause(openWork, context.typeIds.deceased, null);
    case 'RestructuringRecommendations':
      return typeClause(openWork, context.typeIds.restructuring, null);
    case 'DueSoon':
    case 'Overdue':
      return null;
    default:
      return null;
  }
}

function typeClause(base: string, ids: readonly string[], orElse: string | null): string | null {
  if (ids.length === 0) return orElse ? `${base} and ${orElse}` : null;
  const types = orOnType(ids);
  return orElse ? `${base} and (${orElse} or ${types})` : `${base} and (${types})`;
}

const orOnType = (ids: readonly string[]): string =>
  ids.map(id => `_qdb_activitytypeid_value eq ${escapeOData(id)}`).join(' or ');

/** Whether a bucket can be served at all. The UI says so rather than showing an empty list. */
export function bucketIsAvailable(
  bucket: OperationalBucket,
  context: { currentUserId?: string; typeIds: TypeIds },
): boolean {
  return bucketFilter(bucket, context) !== null;
}

export interface TypeIds {
  legal: readonly string[];
  concern: readonly string[];
  deceased: readonly string[];
  restructuring: readonly string[];
}

/** The activity types each bucket needs, resolved once from configuration by **code**. */
export async function loadTypeIds(adapter: XrmCrmAdapter): Promise<TypeIds> {
  const types = await loadActivityTypes(adapter);
  const pick = (match: (code: string | undefined) => boolean): string[] =>
    types.filter(type => match(type.code)).map(type => type.id);

  return {
    legal: pick(isLegalRecommendationCode),
    concern: pick(isConcernTypeCode),
    deceased: pick(isDeceasedTypeCode),
    restructuring: pick(isRestructuringTypeCode),
  };
}

/**
 * The restructuring recommendation type, by code.
 *
 * Collection-side only. The downstream Facility Amendment integration is parked, so nothing that
 * reads this can show a submitted, approved or in-progress amendment — there is no such state.
 */
export function isRestructuringTypeCode(code: string | undefined): boolean {
  if (!code) return false;
  const upper = code.trim().toUpperCase();
  return upper === 'RESTRUCTREC' || upper.endsWith('-RESTRUCTREC');
}

/**
 * One bucket's work, as a bounded page.
 *
 * The search is sent to the source as a `contains` on the subject; it never becomes a browser-side
 * scan of a page that happens to be loaded.
 */
export function createWorkQueue(adapter: XrmCrmAdapter, typeIds: TypeIds) {
  return async (request: WorkQueueRequest): Promise<Page<WorkItem>> => {
    const base = bucketFilter(request.bucket, {
      ...(request.currentUserId !== undefined ? { currentUserId: request.currentUserId } : {}),
      typeIds,
    });
    if (base === null) return emptyPage();

    const clauses = [base];
    if (request.scopeFilter) clauses.push(request.scopeFilter);
    /*
     * The quotes are the caller's to add.
     *
     * `escapeOData` escapes an embedded apostrophe; it does not delimit the literal. Omitting the
     * quotes produced `contains(subject,Ahmed)`, which the platform rejects — a GUID comparison
     * takes a bare value and a string does not, and the two are easy to confuse.
     */
    if (request.search) clauses.push(`contains(subject,'${escapeOData(request.search)}')`);

    const page = await adapter.retrievePage(ENTITY_SETS.collectionActivity, {
      select: [...ACTIVITY_COLUMNS],
      expand: [...DOWNSTREAM_EXPANSION],
      pageSize: request.pageSize,
      sort: [{ field: 'createdon', descending: true }],
      filter: clauses.join(' and '),
      ...(request.continuation !== undefined ? { continuation: request.continuation } : {}),
      includeTotalCount: request.continuation === undefined,
    });

    const mapped = mapPage(page, row => toWorkItem(row, typeIds));
    // The same record cannot appear twice in one page, but de-duplication is applied anyway: it is
    // the property the queue is judged on, and applying it once here is cheaper than trusting that
    // no future source overlaps.
    return { ...mapped, items: dedupeWork(mapped.items) };
  };
}

function emptyPage(): Page<WorkItem> {
  return { items: [], hasMore: false } as unknown as Page<WorkItem>;
}

/**
 * One activity as a work item.
 *
 * The downstream state comes from the expanded record and is passed through untouched — Legal's
 * status is Legal's, a Complaint's is Case Management's. Nothing here maps or re-interprets it.
 */
export function toWorkItem(row: CrmRow, typeIds: TypeIds): WorkItem {
  const typeId = readText(row, '_qdb_activitytypeid_value');
  const legal = row[NAVIGATION_PROPERTIES.activityToLegalRequest] as CrmRow | null | undefined;
  const complaint = row[NAVIGATION_PROPERTIES.activityToComplaintCase] as CrmRow | null | undefined;

  const domainState = complaint
    ? readFormatted(complaint, 'statuscode')
    : legal ? readFormatted(legal, 'statuscode') : readFormatted(row, 'statuscode');

  return {
    id: String(row['activityid']),
    type: workTypeFor(typeId, Boolean(complaint), typeIds),
    title: readText(row, 'subject') ?? '—',
    caseId: readText(row, '_qdb_collectioncaseid_value') ?? '',
    ...optional('caseNumber', readFormatted(row, '_qdb_collectioncaseid_value')),
    ...optional('ownerId', readText(row, '_ownerid_value')),
    ...optional('ownerName', readFormatted(row, '_ownerid_value')),
    ...optional('createdOn', readText(row, 'createdon')),
    ...optional('domainState', domainState),
    // Episode currency is decided on the case screen, where the episode number is known. A queue
    // row is current because the filter only ever asks for open work on live cases.
    isCurrent: readNumber(row, 'statecode') === 0,
  };
}

/** Which work type a row is, decided by the authoritative link first and the code second. */
function workTypeFor(
  typeId: string | undefined,
  hasComplaint: boolean,
  typeIds: TypeIds,
): WorkType {
  // A Complaint link is authoritative: it says a formal Complaint was raised, whatever the type.
  if (hasComplaint) return 'CustomerComplaint';
  if (typeId && typeIds.legal.includes(typeId)) return 'LegalRecommendation';
  if (typeId && typeIds.deceased.includes(typeId)) return 'DeceasedReview';
  if (typeId && typeIds.restructuring.includes(typeId)) return 'RestructuringRecommendation';
  if (typeId && typeIds.concern.includes(typeId)) return 'CollectionDispute';
  return 'CollectionActivity';
}

/**
 * A bucket's count, asked of the platform as a count.
 *
 * Never by fetching the rows and measuring the array — that is the same mistake as browser-side
 * filtering wearing a different hat. An unanswerable count becomes *unknown*, never zero (KI-96).
 */
export async function countBucket(
  adapter: XrmCrmAdapter,
  bucket: OperationalBucket,
  context: { currentUserId?: string; typeIds: TypeIds; scopeFilter?: string },
): Promise<WorkCount> {
  const base = bucketFilter(bucket, {
    ...(context.currentUserId !== undefined ? { currentUserId: context.currentUserId } : {}),
    typeIds: context.typeIds,
  });
  if (base === null) return { known: false, reason: 'NotRequested' };

  const filter = context.scopeFilter ? `${base} and ${context.scopeFilter}` : base;
  return toWorkCount(await adapter.count(ENTITY_SETS.collectionActivity, filter));
}

function optional<T>(key: string, value: T | undefined): Record<string, T> {
  return value === undefined ? {} : { [key]: value };
}
