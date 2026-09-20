import {
  historyComplete, mergeHistory,
  type ContinuationToken, type HistoryBuffer, type HistoryEntry,
} from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import {
  EMAIL_COLUMNS, ENTITY_SETS, FAX_COLUMNS, FORMATTED_VALUE_ANNOTATION,
} from './schema.js';

/**
 * The unified communication history for one case.
 *
 * An aggregation over native records — no new entity, no shadow copy, no `qdb_communication`. The
 * timeline a Collection Officer reads is assembled from `fax`, `email` and `qdb_collectionactivity`
 * at read time, so there is exactly one system of record per communication and nothing to keep in
 * step.
 *
 * Each source is read **server-side, filtered, sorted and bounded**. The merge is
 * `mergeHistory` in `@dcp/domain`, which refuses to emit a row another source could still displace.
 * Between them they satisfy the permanent rule: the browser never holds a customer's whole history
 * to show twenty rows of it.
 *
 * **Status is the platform's own text.** DCP does not know whether an SMS was delivered — the QDB
 * dispatcher owns that, and it is not installed on the Cloud organisation (KI-83). Inventing a
 * "Sent" label here would be the one thing the phase must not do.
 */

/** One source's paging state, kept opaque exactly as the platform issued it. */
interface SourceState {
  key: 'fax' | 'email' | 'activity';
  continuation?: ContinuationToken;
  exhausted: boolean;
}

export interface HistoryCursor {
  buffers: readonly HistoryBuffer[];
  sources: readonly SourceState[];
}

/** How many rows are asked of each source per round trip. */
const SOURCE_PAGE = 25;

export function startHistory(): HistoryCursor {
  return {
    buffers: [
      { key: 'fax', items: [], hasMore: true },
      { key: 'email', items: [], hasMore: true },
      { key: 'activity', items: [], hasMore: true },
    ],
    sources: [
      { key: 'fax', exhausted: false },
      { key: 'email', exhausted: false },
      { key: 'activity', exhausted: false },
    ],
  };
}

const formatted = (row: Record<string, unknown>, column: string): string =>
  String(row[`${column}${FORMATTED_VALUE_ANNOTATION}`] ?? '');

/**
 * Direction, from the platform's own `directioncode`.
 *
 * `unknown` is a real answer rather than a default: an activity row has no direction column at all,
 * and labelling a logged call "outbound" because most of them are would be a guess presented as a
 * fact.
 */
function directionOf(row: Record<string, unknown>): HistoryEntry['direction'] {
  const code = row['directioncode'];
  if (code === true || code === 1) return 'outbound';
  if (code === false || code === 0) return 'inbound';
  return 'unknown';
}

/**
 * The channel a Fax row represents.
 *
 * SMS and WhatsApp share the entity, and the discriminator is the presence of the WhatsApp-only
 * columns — QDB's own convention, confirmed in the Phase 7 contract. A row with a WhatsApp template
 * is WhatsApp; a row without one is SMS.
 */
const faxChannel = (row: Record<string, unknown>): string =>
  String(row['qdb_whatsapptemplate'] ?? '').trim() ? 'WhatsApp' : 'SMS';

function faxEntry(row: Record<string, unknown>): HistoryEntry {
  return {
    id: String(row['activityid']),
    source: 'fax',
    channel: faxChannel(row),
    occurredAt: String(row['createdon'] ?? ''),
    subject: String(row['subject'] ?? ''),
    status: formatted(row, 'statuscode'),
    direction: directionOf(row),
  };
}

function emailEntry(row: Record<string, unknown>): HistoryEntry {
  return {
    id: String(row['activityid']),
    source: 'email',
    channel: 'Email',
    occurredAt: String(row['createdon'] ?? ''),
    subject: String(row['subject'] ?? ''),
    status: formatted(row, 'statuscode'),
    direction: directionOf(row),
  };
}

function activityEntry(row: Record<string, unknown>): HistoryEntry {
  return {
    id: String(row['qdb_collectionactivityid']),
    source: 'activity',
    // The activity's own configured type — Call, Visit, Letter. Read from the platform's formatted
    // value rather than mapped here, so a new configured type appears without a code change.
    channel: formatted(row, '_qdb_activitytypeid_value') || 'Activity',
    occurredAt: String(row['createdon'] ?? ''),
    subject: String(row['qdb_subject'] ?? row['qdb_name'] ?? ''),
    status: formatted(row, 'qdb_activitystatus') || formatted(row, 'statuscode'),
    direction: 'unknown',
  };
}

interface SourceRead {
  entitySet: string;
  select: readonly string[];
  filter: string;
  toEntry: (row: Record<string, unknown>) => HistoryEntry;
}

/**
 * What each source reads for one case.
 *
 * The filters use the lookup's **read** form (`_regardingobjectid_value`), which is the one that
 * works in `$filter` — the KI-52 family again, where the storage name is accepted and returns
 * nothing.
 */
function readsFor(caseId: string): Record<SourceState['key'], SourceRead> {
  return {
    fax: {
      entitySet: ENTITY_SETS.fax,
      select: FAX_COLUMNS,
      filter: `_regardingobjectid_value eq ${caseId}`,
      toEntry: faxEntry,
    },
    email: {
      entitySet: ENTITY_SETS.email,
      select: EMAIL_COLUMNS,
      filter: `_regardingobjectid_value eq ${caseId}`,
      toEntry: emailEntry,
    },
    activity: {
      entitySet: ENTITY_SETS.collectionActivity,
      select: [
        'qdb_collectionactivityid', 'qdb_subject', 'qdb_activitystatus',
        '_qdb_activitytypeid_value', 'createdon', 'statuscode',
      ],
      filter: `_qdb_collectioncaseid_value eq ${caseId}`,
      toEntry: activityEntry,
    },
  };
}

export interface HistoryPage {
  entries: readonly HistoryEntry[];
  cursor: HistoryCursor;
  complete: boolean;
}

/**
 * Produces the next page of unified history, reading only the sources that need reading.
 *
 * The loop is bounded by `attempts` rather than by "until the page is full": a case whose history
 * is entirely in one table would otherwise keep asking the two empty sources for more. Three
 * rounds is enough to fill a page in every realistic shape and is a hard stop in the others.
 */
export async function nextHistoryPage(
  adapter: XrmCrmAdapter,
  caseId: string,
  cursor: HistoryCursor,
  pageSize: number,
): Promise<HistoryPage> {
  const reads = readsFor(caseId);
  let state = cursor;

  for (let attempt = 0; attempt < 3; attempt++) {
    const merged = mergeHistory(state.buffers, pageSize);
    if (merged.starved.length === 0) {
      const next = { buffers: merged.remaining, sources: state.sources };
      return { entries: merged.page, cursor: next, complete: historyComplete(merged.remaining) };
    }

    state = await fillSources(adapter, reads, { buffers: merged.remaining, sources: state.sources },
      merged.starved);
  }

  const final = mergeHistory(state.buffers, pageSize);
  return {
    entries: final.page,
    cursor: { buffers: final.remaining, sources: state.sources },
    complete: historyComplete(final.remaining),
  };
}

/** Reads one more page from each starved source, and records when a source is finished. */
async function fillSources(
  adapter: XrmCrmAdapter,
  reads: Record<SourceState['key'], SourceRead>,
  cursor: HistoryCursor,
  starved: readonly string[],
): Promise<HistoryCursor> {
  const buffers = [...cursor.buffers];
  const sources = [...cursor.sources];

  for (const key of starved) {
    const index = sources.findIndex(source => source.key === key);
    const source = sources[index];
    if (!source || source.exhausted) continue;

    const read = reads[source.key];
    const page = await adapter.retrievePage(read.entitySet, {
      select: [...read.select],
      filter: read.filter,
      sort: [{ field: 'createdon', descending: true }],
      pageSize: SOURCE_PAGE,
      ...(source.continuation !== undefined ? { continuation: source.continuation } : {}),
    });

    const bufferIndex = buffers.findIndex(buffer => buffer.key === key);
    const existing = buffers[bufferIndex];
    const hasMore = page.continuation !== undefined;

    buffers[bufferIndex] = {
      key,
      items: [...(existing?.items ?? []), ...page.items.map(read.toEntry)],
      hasMore,
    };
    sources[index] = {
      key: source.key,
      exhausted: !hasMore,
      ...(page.continuation !== undefined ? { continuation: page.continuation } : {}),
    };
  }

  return { buffers, sources };
}
