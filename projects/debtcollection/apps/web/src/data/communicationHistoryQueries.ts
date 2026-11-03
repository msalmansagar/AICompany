import {
  historyComplete, mergeHistory,
  type ContinuationToken, type HistoryBuffer, type HistoryEntry,
} from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import {
  ACTIVITY_COLUMNS, EMAIL_COLUMNS, ENTITY_SETS, FORMATTED_VALUE_ANNOTATION,
} from './schema.js';
import {
  channelOfMessage, historyColumnsFor, historyRoutes, type MessageRoute, type MessagingConfiguration,
} from './messagingConfiguration.js';

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

/** A source: the organisation's message table(s) — `fax` or `letter` — plus email and activities. */
type SourceKey = 'fax' | 'letter' | 'email' | 'activity';

/** One source's paging state, kept opaque exactly as the platform issued it. */
interface SourceState {
  key: SourceKey;
  continuation?: ContinuationToken;
  exhausted: boolean;
}

export interface HistoryCursor {
  buffers: readonly HistoryBuffer[];
  sources: readonly SourceState[];
}

/** How many rows are asked of each source per round trip. */
const SOURCE_PAGE = 25;

/** Starts a history over the tables this organisation actually uses for messages. */
export function startHistory(messaging: MessagingConfiguration): HistoryCursor {
  const keys: SourceKey[] = [...historyRoutes(messaging).map(route => route.table), 'email', 'activity'];
  return {
    buffers: keys.map(key => ({ key, items: [], hasMore: true })),
    sources: keys.map(key => ({ key, exhausted: false })),
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

/** A message row, labelled SMS / WhatsApp by the organisation's own discriminator. */
function messageEntry(messaging: MessagingConfiguration, route: MessageRoute, row: Record<string, unknown>): HistoryEntry {
  return {
    id: String(row['activityid']),
    source: route.table,
    channel: channelOfMessage(messaging, route, row),
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
    // `activityid`, not `qdb_collectionactivityid`. A collection activity IS a Dynamics activity,
    // so the platform names its key the way it names every activity's key. Getting this wrong made
    // the whole history read fail with "Could not find a property named…" — found by running the
    // software, after three green test suites.
    id: String(row['activityid']),
    source: 'activity',
    // The activity's own configured type — Call, Visit, Letter. Read from the platform's formatted
    // value rather than mapped here, so a new configured type appears without a code change.
    channel: formatted(row, '_qdb_activitytypeid_value') || 'Activity',
    occurredAt: String(row['createdon'] ?? ''),
    subject: String(row['subject'] ?? ''),
    status: formatted(row, 'statuscode'),
    direction: 'unknown',
  };
}

export interface SourceRead {
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
export function readsFor(caseId: string, messaging: MessagingConfiguration): Partial<Record<SourceKey, SourceRead>> {
  const messageReads = Object.fromEntries(historyRoutes(messaging).map(route => [route.table, {
    entitySet: route.entitySet,
    select: historyColumnsFor(messaging, route),
    filter: `_regardingobjectid_value eq ${caseId}`,
    toEntry: (row: Record<string, unknown>) => messageEntry(messaging, route, row),
  }]));
  return {
    ...messageReads,
    email: {
      entitySet: ENTITY_SETS.email,
      select: EMAIL_COLUMNS,
      filter: `_regardingobjectid_value eq ${caseId}`,
      toEntry: emailEntry,
    },
    activity: {
      entitySet: ENTITY_SETS.collectionActivity,
      // The registered column set, never a list typed here. The three names this module used to
      // spell out were all wrong, and `verify-view-columns.mts` could not catch them because they
      // had never reached `READ_REGISTRY` — a column list outside schema.ts is a column list
      // nothing checks.
      select: ACTIVITY_COLUMNS,
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
  request: { caseId: string; messaging: MessagingConfiguration },
  cursor: HistoryCursor,
  pageSize: number,
): Promise<HistoryPage> {
  const reads = readsFor(request.caseId, request.messaging);
  let state = cursor;

  // A merge cut short by the watermark still hands over the rows it could place. They are kept and
  // the next round asks only for what is still missing — discarding them, as this loop once did,
  // silently lost rows whenever one source's page ended before another's (found by Customer 360).
  const collected: HistoryEntry[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const merged = mergeHistory(state.buffers, pageSize - collected.length);
    collected.push(...merged.page);
    state = { buffers: merged.remaining, sources: state.sources };
    if (merged.starved.length === 0 || collected.length >= pageSize) break;
    state = await fillSources(adapter, reads, state, merged.starved);
  }

  return { entries: collected, cursor: state, complete: historyComplete(state.buffers) };
}

/** Reads one more page from each starved source, and records when a source is finished. */
async function fillSources(
  adapter: XrmCrmAdapter,
  reads: Partial<Record<SourceKey, SourceRead>>,
  cursor: HistoryCursor,
  starved: readonly string[],
): Promise<HistoryCursor> {
  const buffers = [...cursor.buffers];
  const sources = [...cursor.sources];

  for (const key of starved) {
    const index = sources.findIndex(source => source.key === key);
    const source = sources[index];
    const read = source ? reads[source.key] : undefined;
    if (!source || source.exhausted || !read) continue;

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
