import {
  historyComplete, mergeHistory,
  type ContinuationToken, type HistoryBuffer, type HistoryEntry,
} from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { EMAIL_COLUMNS, ENTITY_SETS, FAX_COLUMNS, FORMATTED_VALUE_ANNOTATION, HISTORY_ACTIVITY_COLUMNS } from './schema.js';
import { escapeOData } from './collectionQueries.js';
import { formatDay, formatMoney } from '../components/primitives.js';

/**
 * A customer's collection history across every case they hold (user instruction, 2026-09-28).
 *
 * Operational events only — actions, promises, calls, SMS, WhatsApp, email, follow-ups, legal and
 * deceased-review activity — read from the native records they live in: `qdb_collectionactivity`,
 * `fax` and `email`. Not the MIS delinquency history, which is a different record type and has its
 * own card. No new entity, no copy.
 *
 * Each source is read server-side, filtered to the customer's cases, sorted newest first and
 * bounded to a page; the merge is `mergeHistory`, which never emits a row a source could still
 * displace, and breaks timestamp ties on the id. Every entry names its case, so the screen can say
 * which loan account or facility it concerns. The browser never holds the whole history.
 */

type SourceKey = 'fax' | 'email' | 'activity';

interface SourceState {
  key: SourceKey;
  continuation?: ContinuationToken;
  exhausted: boolean;
}

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
const SOURCES: readonly SourceKey[] = ['fax', 'email', 'activity'];

export function startCustomerHistory(): CustomerHistoryCursor {
  return {
    buffers: SOURCES.map(key => ({ key, items: [], hasMore: true })),
    sources: SOURCES.map(key => ({ key, exhausted: false })),
  };
}

const formatted = (row: Record<string, unknown>, column: string): string => String(row[`${column}${FORMATTED_VALUE_ANNOTATION}`] ?? '');
const text = (row: Record<string, unknown>, column: string): string | undefined => (typeof row[column] === 'string' && row[column] ? String(row[column]) : undefined);

function directionOf(row: Record<string, unknown>): HistoryEntry['direction'] {
  const code = row['directioncode'];
  if (code === true || code === 1) return 'outbound';
  if (code === false || code === 0) return 'inbound';
  return 'unknown';
}

function common(row: Record<string, unknown>, caseColumn: string): Pick<HistoryEntry, 'id' | 'occurredAt' | 'subject' | 'status' | 'caseId' | 'recordedBy'> {
  return {
    id: String(row['activityid']),
    occurredAt: String(row['createdon'] ?? ''),
    subject: String(row['subject'] ?? ''),
    status: formatted(row, 'statuscode'),
    ...(text(row, caseColumn) ? { caseId: text(row, caseColumn)! } : {}),
    ...(formatted(row, '_ownerid_value') ? { recordedBy: formatted(row, '_ownerid_value') } : {}),
  };
}

/** SMS and WhatsApp share the Fax table; a WhatsApp template names WhatsApp, its absence SMS (Phase 7 contract). */
const faxChannel = (row: Record<string, unknown>): string => (String(row['qdb_whatsapptemplate'] ?? '').trim() ? 'WhatsApp' : 'SMS');

const toFax = (row: Record<string, unknown>): HistoryEntry => ({ ...common(row, '_regardingobjectid_value'), source: 'fax', channel: faxChannel(row), direction: directionOf(row) });
const toEmail = (row: Record<string, unknown>): HistoryEntry => ({ ...common(row, '_regardingobjectid_value'), source: 'email', channel: 'Email', direction: directionOf(row) });

/** A collection activity, with a promise's own figures when it carries one — read, not derived. */
function toActivity(row: Record<string, unknown>): HistoryEntry {
  const ptpDate = text(row, 'qdb_ptpdate');
  const promised = typeof row['qdb_promisedamount'] === 'number' ? row['qdb_promisedamount'] : undefined;
  const detail = ptpDate
    ? `${formatMoney(promised)} promised for ${formatDay(ptpDate)}${formatted(row, 'qdb_ptpstatus') ? ` · ${formatted(row, 'qdb_ptpstatus')}` : ''}`
    : formatted(row, '_qdb_outcomeid_value');
  return {
    ...common(row, '_qdb_collectioncaseid_value'),
    source: 'activity',
    channel: formatted(row, '_qdb_activitytypeid_value') || 'Activity',
    direction: 'unknown',
    ...(detail ? { detail } : {}),
  };
}

interface SourceRead { entitySet: string; select: readonly string[]; filter: string; toEntry: (row: Record<string, unknown>) => HistoryEntry }

/** One filter per source, over every case the customer holds. Bounded: a customer has a handful of cases. */
export function customerHistoryReads(caseIds: readonly string[]): Record<SourceKey, SourceRead> {
  const anyOf = (column: string) => `(${caseIds.map(id => `${column} eq ${escapeOData(id)}`).join(' or ')})`;
  return {
    fax: { entitySet: ENTITY_SETS.fax, select: FAX_COLUMNS, filter: anyOf('_regardingobjectid_value'), toEntry: toFax },
    email: { entitySet: ENTITY_SETS.email, select: EMAIL_COLUMNS, filter: anyOf('_regardingobjectid_value'), toEntry: toEmail },
    activity: { entitySet: ENTITY_SETS.collectionActivity, select: HISTORY_ACTIVITY_COLUMNS, filter: anyOf('_qdb_collectioncaseid_value'), toEntry: toActivity },
  };
}

/**
 * The next page of a customer's history. Bounded by `attempts`, as the one-case history is: a
 * customer whose events all sit in one table must not keep asking the two empty tables for more.
 */
export async function nextCustomerHistoryPage(
  adapter: XrmCrmAdapter,
  caseIds: readonly string[],
  cursor: CustomerHistoryCursor,
  pageSize: number,
): Promise<CustomerHistoryPage> {
  if (caseIds.length === 0) return { entries: [], cursor, complete: true };
  const reads = customerHistoryReads(caseIds);
  let state = cursor;
  // A merge cut short by the watermark still hands over the rows it could place; they are kept,
  // and the next round asks only for what is still missing. Dropping them lost rows between pages.
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

async function fill(adapter: XrmCrmAdapter, reads: Record<SourceKey, SourceRead>, cursor: CustomerHistoryCursor, starved: readonly string[]): Promise<CustomerHistoryCursor> {
  const buffers = [...cursor.buffers];
  const sources = [...cursor.sources];
  for (const key of starved) {
    const index = sources.findIndex(source => source.key === key);
    const source = sources[index];
    if (!source || source.exhausted) continue;
    const read = reads[source.key];
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
