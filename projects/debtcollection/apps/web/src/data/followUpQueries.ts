import type { ContinuationToken, Page } from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { ACTIVITY_COLUMNS, ENTITY_SETS, STRATEGY_ACTION_COLUMNS } from './schema.js';
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

  if (query.scopeFilter) clauses.push(query.scopeFilter);
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
 * A planned action, and the activity that corresponds to it — if one does.
 *
 * **The correspondence is by activity type, not by a link, and that is a schema fact rather than a
 * choice.** `qdb_collectionactivity` carries no lookup to `qdb_strategyaction`. Its only generic
 * reference columns, `qdb_relatedrecordtype` and `qdb_relatedrecordid`, are documented as holding
 * `fax`/`email` when an activity mirrors a send, and are process-populated and read-only — so
 * repurposing them to mean "created from this planned action" would overload a documented column.
 *
 * The consequence is stated rather than hidden (**KI-71**): this screen can show what the strategy
 * plans and what has actually been done, correlated by type, but it **cannot prove** that a
 * particular activity was created *because of* a particular planned action. Manual and
 * strategy-generated work are therefore not distinguishable today, and nothing here pretends
 * otherwise.
 *
 * Materialising planned actions into activities automatically is Phase 8's, and is not done here.
 */
export interface ActionPlanRow {
  /** The planned action, from strategy configuration. */
  planned: StrategyActionRow;
  /** Activities on this case whose type matches the planned action's type. */
  matchingActivities: readonly ActivityRow[];
  /** True when at least one matching activity has been completed. */
  hasCompletedMatch: boolean;
}

export interface ActionPlanQuery {
  caseId: string;
  strategyId?: string;
}

/**
 * Reads the plan for a case: its strategy's actions, and the activities that correspond.
 *
 * Bounded by nature on both sides — a strategy carries a handful of actions, and a case a manageable
 * number of activities — so this reads two bounded pages rather than paging. The **Case Activities**
 * list, which does grow, has its own paged query.
 */
export async function loadActionPlan(
  adapter: XrmCrmAdapter,
  query: ActionPlanQuery,
): Promise<readonly ActionPlanRow[]> {
  if (!query.strategyId) return [];

  const actions = mapPage(
    await adapter.retrievePage(ENTITY_SETS.strategyAction, {
      select: [...STRATEGY_ACTION_COLUMNS],
      pageSize: 100,
      sort: [{ field: 'qdb_sequence', descending: false }],
      filter: `_qdb_strategyid_value eq ${escapeOData(query.strategyId)} and qdb_isactive eq true`,
    }),
    toStrategyActionRow,
  ).items;

  const activities = mapPage(
    await adapter.retrievePage(ENTITY_SETS.collectionActivity, {
      select: [...ACTIVITY_COLUMNS],
      pageSize: 200,
      sort: [{ field: 'createdon', descending: true }],
      filter: `_qdb_collectioncaseid_value eq ${escapeOData(query.caseId)}`,
    }),
    toActivityRow,
  ).items;

  return actions.map(planned => {
    // Correlated by the activity type's **id**, not its display name — a label is editable
    // configuration, and a renamed type would silently empty this column. It is a correspondence,
    // not a provenance claim: see KI-71.
    const matchingActivities = planned.activityTypeId
      ? activities.filter(activity => activity.activityTypeId === planned.activityTypeId)
      : [];
    return {
      planned,
      matchingActivities,
      hasCompletedMatch: matchingActivities.some(activity => activity.status === 'Completed'),
    };
  });
}
