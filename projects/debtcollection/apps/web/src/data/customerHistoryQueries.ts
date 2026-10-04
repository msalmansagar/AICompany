import {
  externalProcessOf, historyComplete, mergeHistory,
  type ContinuationToken, type HistoryBuffer, type HistoryCategory, type HistoryEntry,
} from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { EMAIL_COLUMNS, ENTITY_SETS, FAX_COLUMNS, FORMATTED_VALUE_ANNOTATION, HISTORY_ACTIVITY_COLUMNS } from './schema.js';
import { escapeOData } from './collectionQueries.js';
import { countMatching } from './counts.js';
import { formatDay, formatMoney } from '../components/primitives.js';

/**
 * A customer's collection history across every case they hold, filtered and paged by the platform.
 *
 * Operational events only — actions, promises, SMS/WhatsApp (Fax), email, Complaint / Dispute,
 * Legal and Deceased / Insurance work — read from the native records they live in. Each source is
 * filtered to the customer's cases and to the chosen category, sorted newest first and bounded to a
 * page; `mergeHistory` merges them without ever emitting a row a source could still displace, and
 * breaks timestamp ties on the id. The browser never holds the whole history, and never filters it.
 *
 * Categories are mutually exclusive by precedence — Complaint / Dispute, Legal, Deceased /
 * Insurance, PTP, then Actions — and the same precedence classifies each entry here, so an entry
 * always sits in the category whose server filter returned it.
 */

export type HistoryFilter = 'all' | HistoryCategory;
type SourceKey = 'fax' | 'email' | 'activity';

/** The configured activity types each category recognises, by code (resolved once per screen). */
export interface CategoryTypes {
  legal: readonly string[];
  deceased: readonly string[];
  concern: readonly string[];
}

interface SourceState { key: SourceKey; continuation?: ContinuationToken; exhausted: boolean }

export interface CustomerHistoryCursor {
  buffers: readonly HistoryBuffer[];
  sources: readonly SourceState[];
}

export interface CustomerHistoryPage {
  entries: readonly HistoryEntry[];
  cursor: CustomerHistoryCursor;
  complete: boolean;
}

const SOURCE_PAGE = 25;
const ACTIVITY_CATEGORIES: readonly HistoryCategory[] = ['complaint', 'legal', 'deceased', 'ptp', 'actions'];

/** Which tables a filter reads. Communications are Fax and Email; every other category is an activity. */
function sourcesFor(filter: HistoryFilter): readonly SourceKey[] {
  if (filter === 'all') return ['fax', 'email', 'activity'];
  return filter === 'communications' ? ['fax', 'email'] : ['activity'];
}

export function startCustomerHistory(filter: HistoryFilter = 'all'): CustomerHistoryCursor {
  const keys = sourcesFor(filter);
  return { buffers: keys.map(key => ({ key, items: [], hasMore: true })), sources: keys.map(key => ({ key, exhausted: false })) };
}

// ── Categories ──────────────────────────────────────────────────────────────

const typeClause = (ids: readonly string[]) => ids.map(id => `_qdb_activitytypeid_value eq ${escapeOData(id)}`).join(' or ');

/** Each category's own predicate on an activity, before precedence; undefined when nothing can match. */
function ownPredicate(category: HistoryCategory, types: CategoryTypes): string | undefined {
  const withTypes = (reference: string, ids: readonly string[]) => (ids.length > 0 ? `(${reference} or ${typeClause(ids)})` : `(${reference})`);
  switch (category) {
    case 'complaint': return withTypes("qdb_relatedrecordtype eq 'incident'", types.concern);
    case 'legal': return withTypes("qdb_relatedrecordtype eq 'qdb_qdblegal'", types.legal);
    case 'deceased': return types.deceased.length > 0 ? `(${typeClause(types.deceased)})` : undefined;
    case 'ptp': return 'qdb_ptpdate ne null';
    default: return undefined;
  }
}

/** The category's predicate with every earlier category excluded, so categories never overlap. */
export function activityCategoryFilter(category: HistoryCategory, types: CategoryTypes): string | undefined {
  const index = ACTIVITY_CATEGORIES.indexOf(category);
  if (index < 0) return undefined;
  const earlier = ACTIVITY_CATEGORIES.slice(0, index).map(c => ownPredicate(c, types)).filter((p): p is string => p !== undefined);
  const own = ownPredicate(category, types);
  if (category !== 'actions' && own === undefined) return undefined;
  return [own, ...earlier.map(p => `not ${p}`)].filter((p): p is string => p !== undefined).join(' and ');
}

/** The categories this organisation's configuration can serve. Deceased / Insurance needs its type. */
export function supportedCategories(types: CategoryTypes): readonly HistoryCategory[] {
  const all: HistoryCategory[] = ['actions', 'ptp', 'communications', 'complaint', 'legal', 'deceased'];
  return all.filter(category => category === 'communications' || activityCategoryFilter(category, types) !== undefined);
}

/** The same precedence, applied to one activity row. */
function categoryOfActivity(row: Record<string, unknown>, types: CategoryTypes): HistoryCategory {
  const process = externalProcessOf(text(row, 'qdb_relatedrecordtype'));
  const typeId = text(row, '_qdb_activitytypeid_value') ?? '';
  if (process === 'Complaint' || types.concern.includes(typeId)) return 'complaint';
  if (process === 'Legal' || types.legal.includes(typeId)) return 'legal';
  if (types.deceased.includes(typeId)) return 'deceased';
  return text(row, 'qdb_ptpdate') ? 'ptp' : 'actions';
}

// ── Rows ────────────────────────────────────────────────────────────────────

const formatted = (row: Record<string, unknown>, column: string): string => String(row[`${column}${FORMATTED_VALUE_ANNOTATION}`] ?? '');
const text = (row: Record<string, unknown>, column: string): string | undefined => (typeof row[column] === 'string' && row[column] ? String(row[column]) : undefined);
const optional = <K extends string, V>(key: K, value: V | undefined | '') => (value === undefined || value === '' ? {} : { [key]: value } as Record<K, V>);

function directionOf(row: Record<string, unknown>): HistoryEntry['direction'] {
  const code = row['directioncode'];
  if (code === true || code === 1) return 'outbound';
  if (code === false || code === 0) return 'inbound';
  return 'unknown';
}

function common(row: Record<string, unknown>, caseColumn: string): Pick<HistoryEntry, 'id' | 'occurredAt' | 'subject' | 'status'> & Partial<HistoryEntry> {
  return {
    id: String(row['activityid']),
    occurredAt: String(row['createdon'] ?? ''),
    subject: String(row['subject'] ?? ''),
    status: formatted(row, 'statuscode'),
    ...optional('caseId', text(row, caseColumn)),
    ...optional('recordedBy', formatted(row, '_ownerid_value')),
    ...optional('recordedById', text(row, '_ownerid_value')),
  };
}

/** SMS and WhatsApp share the Fax table; a WhatsApp template names WhatsApp, its absence SMS (Phase 7 contract). */
const faxChannel = (row: Record<string, unknown>): string => (String(row['qdb_whatsapptemplate'] ?? '').trim() ? 'WhatsApp' : 'SMS');

const toFax = (row: Record<string, unknown>): HistoryEntry => ({ ...common(row, '_regardingobjectid_value'), source: 'fax', channel: faxChannel(row), direction: directionOf(row), category: 'communications' });
const toEmail = (row: Record<string, unknown>): HistoryEntry => ({ ...common(row, '_regardingobjectid_value'), source: 'email', channel: 'Email', direction: directionOf(row), category: 'communications' });

/** A collection activity with what the record itself carries: amount, recorded outcome, hand-off. */
function toActivity(row: Record<string, unknown>, types: CategoryTypes): HistoryEntry {
  const ptpDate = text(row, 'qdb_ptpdate');
  const process = externalProcessOf(text(row, 'qdb_relatedrecordtype'));
  const amount = typeof row['qdb_promisedamount'] === 'number' ? row['qdb_promisedamount'] : typeof row['qdb_amount'] === 'number' ? row['qdb_amount'] : undefined;
  return {
    ...common(row, '_qdb_collectioncaseid_value'),
    source: 'activity',
    channel: formatted(row, '_qdb_activitytypeid_value') || 'Activity',
    direction: 'unknown',
    category: categoryOfActivity(row, types),
    ...optional('amount', amount),
    ...optional('outcome', formatted(row, 'qdb_ptpstatus') || formatted(row, '_qdb_outcomeid_value')),
    ...optional('detail', ptpDate ? `${formatMoney(typeof row['qdb_promisedamount'] === 'number' ? row['qdb_promisedamount'] : undefined)} promised for ${formatDay(ptpDate)}` : undefined),
    ...(process ? { externalReference: { process, ...optional('recordNumber', text(row, 'qdb_relatedrecordnumber')) } } : {}),
  };
}

interface SourceRead { entitySet: string; select: readonly string[]; filter: string; toEntry: (row: Record<string, unknown>) => HistoryEntry }

/** One filter per source: the customer's cases, narrowed to the category. */
export function customerHistoryReads(caseIds: readonly string[], filter: HistoryFilter, types: CategoryTypes): Partial<Record<SourceKey, SourceRead>> {
  const anyOf = (column: string) => `(${caseIds.map(id => `${column} eq ${escapeOData(id)}`).join(' or ')})`;
  const activityNarrowing = filter === 'all' || filter === 'communications' ? undefined : activityCategoryFilter(filter, types);
  const activityFilter = [anyOf('_qdb_collectioncaseid_value'), activityNarrowing].filter(Boolean).join(' and ');
  const reads: Record<SourceKey, SourceRead> = {
    fax: { entitySet: ENTITY_SETS.fax, select: FAX_COLUMNS, filter: anyOf('_regardingobjectid_value'), toEntry: toFax },
    email: { entitySet: ENTITY_SETS.email, select: EMAIL_COLUMNS, filter: anyOf('_regardingobjectid_value'), toEntry: toEmail },
    activity: { entitySet: ENTITY_SETS.collectionActivity, select: HISTORY_ACTIVITY_COLUMNS, filter: activityFilter, toEntry: row => toActivity(row, types) },
  };
  return Object.fromEntries(sourcesFor(filter).map(key => [key, reads[key]]));
}

/** The next page. Bounded by `attempts` so a category held in one table never keeps asking empty ones. */
export async function nextCustomerHistoryPage(
  adapter: XrmCrmAdapter,
  request: { caseIds: readonly string[]; filter: HistoryFilter; types: CategoryTypes },
  cursor: CustomerHistoryCursor,
  pageSize: number,
): Promise<CustomerHistoryPage> {
  if (request.caseIds.length === 0) return { entries: [], cursor, complete: true };
  const reads = customerHistoryReads(request.caseIds, request.filter, request.types);
  let state = cursor;
  // A merge cut short by the watermark still hands over the rows it could place; they are kept,
  // and the next round asks only for what is still missing.
  const collected: HistoryEntry[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const merged = mergeHistory(state.buffers, pageSize - collected.length);
    collected.push(...merged.page);
    state = { buffers: merged.remaining, sources: state.sources };
    if (merged.starved.length === 0 || collected.length >= pageSize) break;
    state = await fill(adapter, reads, state, merged.starved);
  }
  return { entries: collected, cursor: state, complete: historyComplete(state.buffers) };
}

async function fill(adapter: XrmCrmAdapter, reads: Partial<Record<SourceKey, SourceRead>>, cursor: CustomerHistoryCursor, starved: readonly string[]): Promise<CustomerHistoryCursor> {
  const buffers = [...cursor.buffers];
  const sources = [...cursor.sources];
  for (const key of starved) {
    const index = sources.findIndex(source => source.key === key);
    const source = sources[index];
    const read = source ? reads[source.key] : undefined;
    if (!source || source.exhausted || !read) continue;
    const page = await adapter.retrievePage(read.entitySet, {
      select: [...read.select], filter: read.filter, sort: [{ field: 'createdon', descending: true }], pageSize: SOURCE_PAGE,
      ...(source.continuation !== undefined ? { continuation: source.continuation } : {}),
    });
    const bufferIndex = buffers.findIndex(buffer => buffer.key === key);
    const hasMore = page.continuation !== undefined;
    buffers[bufferIndex] = { key, items: [...(buffers[bufferIndex]?.items ?? []), ...page.items.map(read.toEntry)], hasMore };
    sources[index] = { key: source.key, exhausted: !hasMore, ...(page.continuation !== undefined ? { continuation: page.continuation } : {}) };
  }
  return { buffers, sources };
}

// ── Counts ──────────────────────────────────────────────────────────────────

export type HistoryCounts = Readonly<Partial<Record<HistoryFilter, number>>>;

/**
 * Per-category totals, counted by the platform over the customer's whole history. Returned only
 * when every count came back exact; one refusal, or one count at the platform's cap, and there are
 * no counts at all — a figure measured from the loaded page would be a different claim.
 */
export async function loadHistoryCounts(
  adapter: XrmCrmAdapter,
  request: { caseIds: readonly string[]; types: CategoryTypes },
): Promise<HistoryCounts | undefined> {
  if (request.caseIds.length === 0) return { all: 0 };
  const categories = supportedCategories(request.types);
  const reads = customerHistoryReads(request.caseIds, 'all', request.types);
  const caseFilter = reads.activity!.filter;
  const [fax, email, ...activity] = await Promise.all([
    countMatching(adapter, ENTITY_SETS.fax, reads.fax!.filter),
    countMatching(adapter, ENTITY_SETS.email, reads.email!.filter),
    ...categories.filter(c => c !== 'communications').map(c => countMatching(adapter, ENTITY_SETS.collectionActivity, `${caseFilter} and ${activityCategoryFilter(c, request.types)}`)),
  ]);
  const results = [fax!, email!, ...activity];
  if (results.some(result => result.value === undefined || result.atLeast)) return undefined;
  const activityCounts = Object.fromEntries(categories.filter(c => c !== 'communications').map((c, i) => [c, activity[i]!.value!]));
  const communications = fax!.value! + email!.value!;
  const activityTotal = Object.values(activityCounts).reduce((total, count) => total + count, 0);
  return { ...activityCounts, communications, all: communications + activityTotal };
}

/** Open hand-off and review work on one case — shown as information, never as a contact hold. */
const OPEN_PROCESS_LIMIT = 10;

export async function loadOpenProcesses(adapter: XrmCrmAdapter, caseId: string, types: CategoryTypes): Promise<readonly HistoryEntry[]> {
  const processes = (['complaint', 'legal', 'deceased'] as const)
    .map(category => activityCategoryFilter(category, types))
    .filter((filter): filter is string => filter !== undefined);
  if (processes.length === 0) return [];
  const page = await adapter.retrievePage(ENTITY_SETS.collectionActivity, {
    select: [...HISTORY_ACTIVITY_COLUMNS],
    pageSize: OPEN_PROCESS_LIMIT,
    sort: [{ field: 'createdon', descending: true }],
    filter: `_qdb_collectioncaseid_value eq ${escapeOData(caseId)} and statecode eq 0 and (${processes.map(p => `(${p})`).join(' or ')})`,
  });
  return page.items.map(row => toActivity(row, types));
}
