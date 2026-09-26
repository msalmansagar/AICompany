import {
  satisfiesPlannedAction, type ContinuationToken, type Page,
} from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { ACTIVITY_COLUMNS, ENTITY_SETS, NAVIGATION_PROPERTIES, STRATEGY_ACTION_COLUMNS } from './schema.js';
import { escapeOData, mapPage } from './collectionQueries.js';
import { toStrategyActionRow, type StrategyActionRow } from './configurationQueries.js';
import { toActivityRow, type ActivityRow } from './caseQueries.js';

/**
 * Follow-ups, and the Action Plan.
 *
 * Both are read the same way everything else in this workspace is read: the source narrows, the
 * source sorts, and the browser takes one bounded page with an opaque continuation. Neither of these
 * lists has a natural ceiling — an officer's follow-up queue grows with the book, and a strategy can
 * carry any number of actions — so neither may be fetched whole and filtered here.
 */

/** Which side of "now" a follow-up falls on. The comparison is sent to the source, not made here. */
export type FollowUpWindow = 'overdue' | 'upcoming' | 'all';

export interface FollowUpQuery {
  window?: FollowUpWindow;
  /** Organisation scope, applied by the source. */
  scopeFilter?: string;
  /** Only activities still open — a completed one's follow-up is history, not work. */
  openOnly?: boolean;
  /** How far ahead "upcoming" reaches, in days. The caller decides; there is no default policy. */
  horizonDays?: number;
  /** Injected so the boundary is testable and the caller owns the clock. */
  now?: Date;
}

/**
 * Builds the `$filter` for a follow-up queue.
 *
 * The date boundary is computed once, here, and sent to the platform as a literal — the alternative
 * is fetching every activity with a follow-up date and comparing in the browser, which is the thing
 * the large-dataset rule exists to prevent.
 *
 * **No horizon is assumed.** "Upcoming" without a `horizonDays` means everything from now onwards,
 * because how far ahead an officer looks is a preference, not a rule this code should invent.
 */
export function buildFollowUpFilter(query: FollowUpQuery): string {
  const now = (query.now ?? new Date()).toISOString();
  const clauses: string[] = ['qdb_followupdate ne null'];

  if (query.scopeFilter) clauses.push(throughCase(query.scopeFilter));
  // A completed activity's follow-up has already happened or been superseded.
  if (query.openOnly !== false) clauses.push('statecode eq 0');

  if (query.window === 'overdue') {
    clauses.push(`qdb_followupdate lt ${now}`);
  } else if (query.window === 'upcoming') {
    clauses.push(`qdb_followupdate ge ${now}`);
    if (query.horizonDays !== undefined) {
      const horizon = new Date((query.now ?? new Date()).getTime() + query.horizonDays * 86_400_000).toISOString();
      clauses.push(`qdb_followupdate le ${horizon}`);
    }
  }
  return clauses.join(' and ');
}

/**
 * An organisation scope is a clause on the **case** (`qdb_organizationcode eq …`); the activity has
 * no such column, and sending the clause as-is was answered 400 (KI-147). The activity reaches its
 * case through the lookup's navigation property, so the same clause is applied there — the platform
 * still does the narrowing, and both CRMs' work stays one list when no scope is chosen.
 */
function throughCase(caseClause: string): string {
  return `${NAVIGATION_PROPERTIES.activityToCase}/${caseClause}`;
}

/**
 * The follow-up queue, paged.
 *
 * Ordered by follow-up date ascending so the most pressing work is on the first page — which is the
 * only ordering that makes a bounded page useful to an officer.
 */
export function createFollowUpQuery(adapter: XrmCrmAdapter) {
  return async (
    request: FollowUpQuery & { pageSize: number; continuation?: ContinuationToken },
  ): Promise<Page<ActivityRow>> => {
    const filter = buildFollowUpFilter(request);
    const page = await adapter.retrievePage(ENTITY_SETS.collectionActivity, {
      select: [...ACTIVITY_COLUMNS],
      pageSize: request.pageSize,
      sort: [{ field: 'qdb_followupdate', descending: false }],
      filter,
      ...(request.continuation !== undefined ? { continuation: request.continuation } : {}),
      includeTotalCount: request.continuation === undefined,
    });
    return mapPage(page, toActivityRow);
  };
}

// ── The Action Plan ──────────────────────────────────────────────────────────

/**
 * A planned action, and the work that answers it.
 *
 * **Answering is proven, not inferred.** An activity answers a planned action when it carries that
 * action's id in `qdb_strategyactionid` — the provenance column WP2 provisioned and
 * `ActivityProvenanceGuard` enforces server-side. Nothing else attributes work to a plan.
 *
 * Phase 6 correlated by Activity Type, because no link existed. That correlation was recorded as
 * **KI-71** at the time: it made an officer's own Legal Recommendation indistinguishable from one
 * the strategy asked for, and it would silently attribute a manually raised activity to a plan that
 * never requested it. The link exists now, so the inference is gone rather than kept as a fallback —
 * a fallback would restore exactly the behaviour the column was provisioned to end.
 *
 * Activities that name no action are not thereby manual. They are **unattributed**: every activity
 * created before Phase 8 carries no provenance, and that absence is a fact about the record, not
 * about who created it. They are carried in `unattributed` so nothing is hidden, and they are
 * attached to no planned action.
 */
export interface ActionPlanRow {
  /** The planned action, from strategy configuration. */
  planned: StrategyActionRow;
  /** Activities that name this action. Attribution, not resemblance. */
  attributed: readonly ActivityRow[];
  /** True when at least one attributed activity has been completed. */
  hasCompletedAttributed: boolean;
}

export interface ActionPlan {
  rows: readonly ActionPlanRow[];
  /**
   * Case activities no planned action claims — history, and work an officer raised independently.
   *
   * Kept and shown. Dropping it would make an audited record disappear from the screen that is
   * supposed to explain the case.
   */
  unattributed: readonly ActivityRow[];
}

export interface ActionPlanQuery {
  caseId: string;
  strategyId?: string;
}

/** How many activities either bucket will read. Both reads are narrowed by the platform. */
const ACTIVITY_PAGE_SIZE = 200;

/**
 * Reads the plan for a case: its strategy's actions, and the work attributed to them.
 *
 * Three bounded reads, each narrowed by the source. The two activity reads are split **by the
 * platform** on `_qdb_strategyactionid_value` rather than fetched together and divided here, so the
 * distinction between attributed work and unattributed history is one the organisation makes, and
 * neither bucket can grow without limit because the other did.
 */
export async function loadActionPlan(
  adapter: XrmCrmAdapter,
  query: ActionPlanQuery,
): Promise<ActionPlan> {
  const caseFilter = `_qdb_collectioncaseid_value eq ${escapeOData(query.caseId)}`;
  const [attributed, unattributed] = await Promise.all([
    readCaseActivities(adapter, `${caseFilter} and _qdb_strategyactionid_value ne null`),
    readCaseActivities(adapter, `${caseFilter} and _qdb_strategyactionid_value eq null`),
  ]);

  if (!query.strategyId) return { rows: [], unattributed };

  const actions = await readStrategyActions(adapter, query.strategyId);
  const rows = actions.map(planned => groupAttributedWork(planned, attributed));
  return { rows, unattributed };
}

/** Groups by the id the activity itself names. No type, name or sequence takes part. */
function groupAttributedWork(
  planned: StrategyActionRow,
  activities: readonly ActivityRow[],
): ActionPlanRow {
  const attributed = activities.filter(
    activity => satisfiesPlannedAction(activity, planned.id));
  return {
    planned,
    attributed,
    hasCompletedAttributed: attributed.some(activity => activity.status === 'Completed'),
  };
}

async function readStrategyActions(
  adapter: XrmCrmAdapter,
  strategyId: string,
): Promise<readonly StrategyActionRow[]> {
  return mapPage(
    await adapter.retrievePage(ENTITY_SETS.strategyAction, {
      select: [...STRATEGY_ACTION_COLUMNS],
      pageSize: 100,
      sort: [{ field: 'qdb_sequence', descending: false }],
      filter: `_qdb_strategyid_value eq ${escapeOData(strategyId)} and qdb_isactive eq true`,
    }),
    toStrategyActionRow,
  ).items;
}

async function readCaseActivities(
  adapter: XrmCrmAdapter,
  filter: string,
): Promise<readonly ActivityRow[]> {
  return mapPage(
    await adapter.retrievePage(ENTITY_SETS.collectionActivity, {
      select: [...ACTIVITY_COLUMNS],
      pageSize: ACTIVITY_PAGE_SIZE,
      sort: [{ field: 'createdon', descending: true }],
      filter,
    }),
    toActivityRow,
  ).items;
}
