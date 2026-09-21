import type { ContinuationToken, Page, RecordedNonSuccess } from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { buildCaseFilter, mapPage, type CaseQuery } from './collectionQueries.js';
import { CHANNEL_CODES, STATUS_CODES, type RunStatus } from '../services/bulkCommunicationService.js';
import { COMMUNICATION_RUN_LIST_COLUMNS, CASE_LIST_COLUMNS, ENTITY_SETS } from './schema.js';
import { countMatching, type CountResult } from './counts.js';
import { optional, readNumber, readText, type CrmRow } from './rowReaders.js';

/**
 * Reads for bulk communication: the run list, the population, and the labels a result needs.
 *
 * Three rules from earlier defects hold this file together.
 *
 * **No column is named here.** Every set comes from `schema.ts`, which is what
 * `crm/scripts/verify-view-columns.mts` checks against live metadata. A list typed inline is a list
 * nothing verifies, and that is precisely how the whole communication history came to fail on the
 * deployed organisation with three columns that did not exist (KI-89).
 *
 * **The population is never a list of rows.** Resolving a filter walks bounded pages and keeps only
 * the case ids, because a bulk run over the whole book must never transfer the book to the browser.
 * Even the ids are capped, and an over-cap selection is **refused rather than truncated** — a
 * truncated population is a campaign nobody confirmed.
 *
 * **A run row never carries its population.** The grid reads `COMMUNICATION_RUN_LIST_COLUMNS`, which
 * deliberately omits the two memo columns; a run's frozen population is read once, by the executor,
 * for the one run being worked.
 */

/** The choice labels, derived from the codes the executor writes rather than copied beside them. */
const RUN_STATUS_LABELS: Readonly<Record<number, string>> = Object.fromEntries(
  Object.entries(STATUS_CODES).map(([label, code]) => [code, label]));

const RUN_CHANNEL_LABELS: Readonly<Record<number, string>> = Object.fromEntries(
  Object.entries(CHANNEL_CODES).map(([label, code]) => [code, label]));

// ── The run list ─────────────────────────────────────────────────────────────

/** A run as a list row needs it. Officer-facing; the id is for navigation and is never rendered. */
export interface RunRow {
  id: string;
  name: string;
  channel: string;
  status: RunStatus | '—';
  total: number;
  processed: number;
  startedOn?: string;
  completedOn?: string;
  createdOn?: string;
}

export interface RunQuery {
  /** One status, by its officer-facing name. Applied by the source, never by filtering rows here. */
  status?: RunStatus;
}

export function buildRunFilter(query: RunQuery): string | undefined {
  if (!query.status) return undefined;
  return `qdb_status eq ${STATUS_CODES[query.status]}`;
}

export function toRunRow(row: CrmRow): RunRow {
  const statusCode = readNumber(row, 'qdb_status');
  const channelCode = readNumber(row, 'qdb_channel');
  return {
    id: String(row['qdb_communicationrunid']),
    name: readText(row, 'qdb_name') ?? '—',
    channel: (channelCode !== undefined ? RUN_CHANNEL_LABELS[channelCode] : undefined) ?? '—',
    status: (statusCode !== undefined ? RUN_STATUS_LABELS[statusCode] : undefined) as RunStatus ?? '—',
    total: readNumber(row, 'qdb_totalrecipients') ?? 0,
    processed: readNumber(row, 'qdb_cursor') ?? 0,
    ...optional('startedOn', readText(row, 'qdb_startedon')),
    ...optional('completedOn', readText(row, 'qdb_completedon')),
    ...optional('createdOn', readText(row, 'createdon')),
  };
}

/** One bounded page of runs, newest first. */
export function createRunQuery(adapter: XrmCrmAdapter) {
  return async (
    request: RunQuery & { pageSize: number; continuation?: ContinuationToken },
  ): Promise<Page<RunRow>> => {
    const filter = buildRunFilter(request);
    const page = await adapter.retrievePage(ENTITY_SETS.communicationRun, {
      select: [...COMMUNICATION_RUN_LIST_COLUMNS],
      pageSize: request.pageSize,
      sort: [{ field: 'createdon', descending: true }],
      ...(filter !== undefined ? { filter } : {}),
      ...(request.continuation !== undefined ? { continuation: request.continuation } : {}),
      includeTotalCount: request.continuation === undefined,
    });
    return mapPage(page, toRunRow);
  };
}

// ── Resolving a population ───────────────────────────────────────────────────

/**
 * How many case ids one run may hold, whatever the column could physically take.
 *
 * A second, lower ceiling than the column's capacity, and deliberately so: the column bounds what
 * can be *stored*, and this bounds what one officer may commit to in a single confirmation. A run
 * larger than this is refused and asked to be narrowed, which is a decision an officer can act on.
 */
export const MAX_POPULATION = 2000;

/** How many pages of ids the resolver will walk. A guard against a continuation that never ends. */
const MAX_POPULATION_PAGES = 40;
const POPULATION_PAGE = 200;

export type PopulationOutcome =
  | { status: 'resolved'; recipientIds: readonly string[] }
  | { status: 'empty' }
  | { status: 'tooLarge'; limit: number };

/**
 * Walks the filter server-side, page by page, keeping only the ids.
 *
 * The filter is the same `buildCaseFilter` the Collection Cases grid sends, so the population an
 * officer confirms is the population they were looking at. Nothing is re-derived from rows already
 * on screen — the grid holds one page, and a run is not one page.
 */
export async function resolvePopulation(
  adapter: XrmCrmAdapter,
  query: CaseQuery,
  limit: number = MAX_POPULATION,
): Promise<PopulationOutcome> {
  const filter = buildCaseFilter(query);
  const recipientIds: string[] = [];
  let continuation: ContinuationToken | undefined;

  for (let page = 0; page < MAX_POPULATION_PAGES; page += 1) {
    const result = await adapter.retrievePage(ENTITY_SETS.collectionCase, {
      // The id alone. A population resolver has no use for a case's arrears, and selecting them
      // would turn a bounded id walk into a full table read wearing a filter.
      select: ['qdb_collectioncaseid'],
      pageSize: POPULATION_PAGE,
      ...(filter !== undefined ? { filter } : {}),
      ...(continuation !== undefined ? { continuation } : {}),
    });

    for (const row of result.items) {
      recipientIds.push(String(row['qdb_collectioncaseid']));
      if (recipientIds.length > limit) return { status: 'tooLarge', limit };
    }

    if (!result.hasMore || !result.continuation) {
      return recipientIds.length === 0 ? { status: 'empty' } : { status: 'resolved', recipientIds };
    }
    continuation = result.continuation;
  }

  // More pages than the guard allows means more recipients than the limit permits anyway.
  return { status: 'tooLarge', limit };
}

/** How many cases the filter matches, before anything is resolved or confirmed. */
export async function countPopulation(
  adapter: XrmCrmAdapter,
  query: CaseQuery,
): Promise<CountResult> {
  const filter = buildCaseFilter(query);
  return countMatching(adapter, ENTITY_SETS.collectionCase, filter);
}

// ── Labels for a results list ────────────────────────────────────────────────

/** One recipient's outcome, in the words a results list shows. */
export interface RecipientOutcomeRow {
  recipientId: string;
  caseNumber: string;
  outcome: 'refused' | 'failed';
  detail: string;
}

/** Chunked so an `or` chain never becomes a URL the platform refuses. */
const LABEL_CHUNK = 20;

/**
 * Resolves case numbers for the recipients a results page is about to show.
 *
 * It exists because a Collection Officer must never be shown a GUID, and a failure list keyed by
 * recipient id is a list of GUIDs. Bounded by the page being displayed, never by the population.
 */
export async function loadRecipientLabels(
  adapter: XrmCrmAdapter,
  recipientIds: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  const labels = new Map<string, string>();

  for (let index = 0; index < recipientIds.length; index += LABEL_CHUNK) {
    const chunk = recipientIds.slice(index, index + LABEL_CHUNK);
    const filter = chunk.map(id => `qdb_collectioncaseid eq ${id}`).join(' or ');
    const page = await adapter.retrievePage(ENTITY_SETS.collectionCase, {
      select: ['qdb_collectioncaseid', 'qdb_casenumber'],
      pageSize: LABEL_CHUNK,
      filter,
    });
    for (const row of page.items) {
      const id = String(row['qdb_collectioncaseid']).toLowerCase();
      labels.set(id, readText(row, 'qdb_casenumber') ?? '—');
    }
  }

  return labels;
}

/** Pairs recorded non-successes with their case numbers, falling back to a position, never an id. */
export function toOutcomeRows(
  nonSuccesses: readonly RecordedNonSuccess[],
  labels: ReadonlyMap<string, string>,
): readonly RecipientOutcomeRow[] {
  return nonSuccesses.map((entry, index) => ({
    recipientId: entry.recipientId,
    caseNumber: labels.get(entry.recipientId.toLowerCase()) ?? `Recipient ${index + 1}`,
    outcome: entry.outcome,
    detail: entry.detail,
  }));
}

// ── What this module reads, for the registry guard ───────────────────────────

/**
 * Every read this module makes, as `{ entitySet, select }`.
 *
 * Exposed so a test can assert each selected column is in `READ_REGISTRY` and therefore checked
 * against live metadata. The alternative — trusting that the names are right — is exactly what
 * produced KI-89.
 */
export function runReadsFor(): Readonly<Record<string, { entitySet: string; select: readonly string[] }>> {
  return {
    runList: { entitySet: ENTITY_SETS.communicationRun, select: [...COMMUNICATION_RUN_LIST_COLUMNS] },
    population: { entitySet: ENTITY_SETS.collectionCase, select: ['qdb_collectioncaseid'] },
    labels: {
      entitySet: ENTITY_SETS.collectionCase,
      select: ['qdb_collectioncaseid', 'qdb_casenumber'],
    },
  };
}

/** Re-exported so a caller building a population sees the same case columns the grid does. */
export { CASE_LIST_COLUMNS };
