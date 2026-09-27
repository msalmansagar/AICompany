import type { ActivityOutcomeConfig } from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { ACTIVITY_OUTCOME_COLUMNS, ACTIVITY_TYPE_COLUMNS, ENTITY_SETS } from './schema.js';
import { escapeOData } from './collectionQueries.js';
import { readBoolean, readNumber, readText, type CrmRow } from './rowReaders.js';

/**
 * The catalogues the Phase 6 forms offer: activity types, and the outcomes each type allows.
 *
 * **Nothing here is a list in code.** What an officer may log, and what they may close it with, is
 * QDB configuration — a deployment that adds a "Field visit — customer absent" outcome gets it in the
 * dropdown without a release. A hard-coded list would be a second, silent configuration that nobody
 * could edit and that would drift from the real one.
 *
 * Both tables are configuration: tens of rows, not a growing book, so each is read as one bounded
 * page rather than paged. That is the distinction the large-data rule draws — a catalogue has a
 * ceiling set by how many kinds of work exist, a case list has a ceiling set by the portfolio.
 *
 * The catalogue itself is not yet QDB's (**KI-66**): `qdb_activityoutcome` held zero rows, and the
 * seven `P6-` outcomes seeded for Phase 6 exercise the mechanism. They are marked, reversible, and
 * must never be read as agreed policy.
 */

/** A configuration row as a dropdown needs it. */
export interface CatalogOption {
  id: string;
  name: string;
  code?: string;
  sequence?: number;
  /**
   * Whether configuration still offers this.
   *
   * Retained rather than filtered away, because a record created last year may point at a type that
   * has since been retired. Dropping it from the list would make the form show an empty type for a
   * record that plainly has one; showing it, marked and unselectable, is the honest rendering.
   */
  isActive: boolean;
}

export interface ActivityTypeOption extends CatalogOption {
  category?: string;
  /** The type's own requirement, separate from the outcome's. Surfaced so the form can mark the field. */
  notesRequired: boolean;
  amountRequired: boolean;
  requiresFollowUp: boolean;
}

/**
 * An outcome, carrying the four columns `planCompleteActivity` reads plus what a list needs.
 *
 * `code` is omitted from the catalogue half and taken from the domain's: an outcome's code is
 * **required** there because the domain identifies an outcome by it, and a type that made it
 * optional here would let an outcome reach `planCompleteActivity` without one.
 */
export interface OutcomeOption extends Omit<CatalogOption, 'code'>, ActivityOutcomeConfig {
  /** The type that owns it. An outcome is never offered against another type's activity. */
  activityTypeId?: string;
  /** Configuration's intent that choosing this outcome closes the activity. */
  closesActivity: boolean;
}

/**
 * Configuration tables are small by nature, but "small" is an expectation rather than a guarantee,
 * so the read is still bounded. A ceiling that is never reached costs nothing; its absence is how a
 * browser ends up holding a table nobody expected to grow.
 */
const CATALOG_PAGE_SIZE = 250;

/**
 * Reads the activity types an officer may choose from.
 *
 * Active types only, ordered as configuration orders them. `currentId` re-admits exactly one
 * retired type — the one a record being edited already points at — so an existing record renders
 * truthfully without its retired type becoming available to every new record.
 */
export async function loadActivityTypes(
  adapter: XrmCrmAdapter,
  options: { currentId?: string | undefined } = {},
): Promise<readonly ActivityTypeOption[]> {
  const rows = await readCatalog(
    adapter, ENTITY_SETS.collectionActivityType, [...ACTIVITY_TYPE_COLUMNS],
    'qdb_collectionactivitytypeid', options.currentId,
  );
  return rows.map(toActivityTypeOption).sort(bySequenceThenName);
}

/**
 * Reads the outcomes configured **for one activity type**.
 *
 * The filter is not a convenience. `qdb_activityoutcome.qdb_activitytypeid` names the type an
 * outcome belongs to, so offering the whole table would let a phone call be closed with a field-visit
 * outcome — a data-quality problem that no later validation would catch, because every one of those
 * outcomes is individually valid.
 */
export async function loadOutcomes(
  adapter: XrmCrmAdapter,
  activityTypeId: string,
  options: { currentId?: string | undefined } = {},
): Promise<readonly OutcomeOption[]> {
  if (!activityTypeId) return [];
  const rows = await readCatalog(
    adapter, ENTITY_SETS.activityOutcome, [...ACTIVITY_OUTCOME_COLUMNS],
    'qdb_activityoutcomeid', options.currentId,
    `_qdb_activitytypeid_value eq ${escapeOData(activityTypeId)}`,
  );
  return rows.map(toOutcomeOption).sort(bySequenceThenName);
}

/**
 * Reads one bounded page of a catalogue, plus the one retired row a form may still need.
 *
 * The retired row is fetched **separately by id** rather than by widening the filter to include
 * inactive rows, because widening would pull every retired row in the table into a list the officer
 * chooses from. One extra read for one known id is the smaller cost.
 */
async function readCatalog(
  adapter: XrmCrmAdapter,
  entitySet: string,
  select: string[],
  idColumn: string,
  currentId: string | undefined,
  scopeFilter?: string,
): Promise<readonly CrmRow[]> {
  const activeFilter = ['qdb_isactive eq true', ...(scopeFilter ? [scopeFilter] : [])].join(' and ');
  const page = await adapter.retrievePage(entitySet, {
    select, pageSize: CATALOG_PAGE_SIZE, filter: activeFilter,
    sort: [{ field: 'qdb_sequence', descending: false }],
  });
  const rows = [...page.items];

  if (currentId && !rows.some(row => String(row[idColumn]) === currentId)) {
    const retired = await adapter.retrievePage(entitySet, {
      select, pageSize: 1, filter: `${idColumn} eq ${escapeOData(currentId)}`,
    });
    rows.push(...retired.items);
  }
  return rows;
}

function toActivityTypeOption(row: CrmRow): ActivityTypeOption {
  return {
    id: String(row['qdb_collectionactivitytypeid']),
    name: readText(row, 'qdb_name') ?? '—',
    isActive: readBoolean(row, 'qdb_isactive') === true,
    notesRequired: readBoolean(row, 'qdb_notesrequired') === true,
    amountRequired: readBoolean(row, 'qdb_amountrequired') === true,
    requiresFollowUp: readBoolean(row, 'qdb_requiresfollowup') === true,
    ...optionalText('code', readText(row, 'qdb_code')),
    ...optionalNumber('sequence', readNumber(row, 'qdb_sequence')),
  };
}

/**
 * Shapes an outcome into exactly what `planCompleteActivity` expects.
 *
 * The four behaviour flags are read as written, with `false` where the platform returned nothing —
 * an outcome that does not say it needs notes does not need them. Defaulting the other way would
 * make every unconfigured outcome block completion, which is a rule nobody wrote.
 */
function toOutcomeOption(row: CrmRow): OutcomeOption {
  const followUpDays = readNumber(row, 'qdb_followupdays');
  return {
    id: String(row['qdb_activityoutcomeid']),
    name: readText(row, 'qdb_name') ?? '—',
    code: readText(row, 'qdb_code') ?? '',
    isActive: readBoolean(row, 'qdb_isactive') === true,
    requiresFollowUp: readBoolean(row, 'qdb_requiresfollowup') === true,
    requiresNotes: readBoolean(row, 'qdb_requiresnotes') === true,
    escalationRequired: readBoolean(row, 'qdb_escalationrequired') === true,
    closesActivity: readBoolean(row, 'qdb_closeactivity') === true,
    ...(followUpDays !== undefined ? { followUpDays } : {}),
    ...optionalText('activityTypeId', readText(row, '_qdb_activitytypeid_value')),
    ...optionalNumber('sequence', readNumber(row, 'qdb_sequence')),
  };
}

/** Configuration's order first; a name only breaks a tie, so the list never reorders itself. */
function bySequenceThenName(left: CatalogOption, right: CatalogOption): number {
  const bySequence = (left.sequence ?? Number.MAX_SAFE_INTEGER) - (right.sequence ?? Number.MAX_SAFE_INTEGER);
  return bySequence !== 0 ? bySequence : left.name.localeCompare(right.name);
}

const optionalText = (key: string, value: string | undefined) => (value !== undefined ? { [key]: value } : {});
const optionalNumber = (key: string, value: number | undefined) => (value !== undefined ? { [key]: value } : {});
