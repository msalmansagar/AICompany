import { satisfiesPlannedAction, type ActionPlanItem } from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { formatDate } from '../components/primitives.js';
import { ACTIVITY_COLUMNS, ENTITY_SETS, STRATEGY_ACTION_COLUMNS } from './schema.js';
import { escapeOData, mapPage } from './collectionQueries.js';
import { toStrategyActionRow, type StrategyActionRow } from './configurationQueries.js';
import { toActivityRow, type ActivityRow } from './caseQueries.js';
import { readText } from './rowReaders.js';
import { toPlanItem } from './actionPlanRows.js';
import type { ActionPlanRow } from './followUpQueries.js';

/**
 * The Next Planned Action of every open case a customer holds, in two reads instead of three per
 * case: one for the planned actions of all their strategies, one for the work attributed to them.
 *
 * The answer per case is the same one the Action Plan gives — the first current item, in the
 * strategy's own sequence — computed with the same `toPlanItem`. It is a planned action, never a
 * recommendation, and three states are kept apart:
 *   No Action Plan — the case has no resolved strategy;
 *   Not configured — it has one, and the plan has no next step;
 *   Planned        — the next step, and how many are outstanding.
 */
export type NextPlannedAction =
  | { kind: 'noPlan' }
  | { kind: 'notConfigured' }
  | { kind: 'planned'; item: ActionPlanItem; outstanding: number };

export interface PlannedCase {
  id: string;
  strategyId?: string;
  episodeNumber?: number;
}

/** Cases per read: keeps each OR filter well inside the platform's URL limit. */
const CASES_PER_READ = 25;
const ATTRIBUTED_PAGE = 500;

export async function loadNextPlannedActions(adapter: XrmCrmAdapter, cases: readonly PlannedCase[]): Promise<ReadonlyMap<string, NextPlannedAction>> {
  const planned = cases.filter(c => c.strategyId !== undefined);
  const [actionsByStrategy, attributed] = await Promise.all([
    readStrategyActions(adapter, [...new Set(planned.map(c => c.strategyId!))]),
    readAttributedWork(adapter, planned.map(c => c.id)),
  ]);
  const now = new Date();
  return new Map(cases.map(c => [c.id, nextFor(c, actionsByStrategy.get(c.strategyId ?? '') ?? [], attributed, now)]));
}

function nextFor(c: PlannedCase, actions: readonly StrategyActionRow[], attributed: readonly ActivityRow[], now: Date): NextPlannedAction {
  if (!c.strategyId) return { kind: 'noPlan' };
  const work = attributed.filter(activity => activity.caseId === c.id);
  const rows: ActionPlanRow[] = actions.map(action => {
    const claimed = work.filter(activity => satisfiesPlannedAction(activity, action.id));
    return { planned: action, attributed: claimed, hasCompletedAttributed: claimed.some(activity => activity.status === 'Completed') };
  });
  const context = { caseId: c.id, now, formatDate, ...(c.episodeNumber !== undefined ? { episodeNumber: c.episodeNumber } : {}) };
  const current = rows.map(row => toPlanItem(row, context)).filter(item => item.isCurrent);
  return current[0] ? { kind: 'planned', item: current[0], outstanding: current.length } : { kind: 'notConfigured' };
}

/** Planned actions of every strategy in one read per chunk, grouped by the strategy they belong to. */
async function readStrategyActions(adapter: XrmCrmAdapter, strategyIds: readonly string[]): Promise<ReadonlyMap<string, readonly StrategyActionRow[]>> {
  const grouped = new Map<string, StrategyActionRow[]>();
  for (const chunk of chunks(strategyIds)) {
    const rows = await adapter.retrieveMultiple(ENTITY_SETS.strategyAction, {
      select: [...STRATEGY_ACTION_COLUMNS],
      filter: `(${anyOf('_qdb_strategyid_value', chunk)}) and qdb_isactive eq true`,
    });
    for (const row of rows) {
      const strategyId = readText(row, '_qdb_strategyid_value');
      if (strategyId) grouped.set(strategyId, [...(grouped.get(strategyId) ?? []), toStrategyActionRow(row)]);
    }
  }
  for (const actions of grouped.values()) actions.sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  return grouped;
}

/** Work attributed to a planned action, on any of the cases, newest first. */
async function readAttributedWork(adapter: XrmCrmAdapter, caseIds: readonly string[]): Promise<readonly ActivityRow[]> {
  const pages = await Promise.all(chunks(caseIds).map(chunk => adapter.retrievePage(ENTITY_SETS.collectionActivity, {
    select: [...ACTIVITY_COLUMNS],
    pageSize: ATTRIBUTED_PAGE,
    sort: [{ field: 'createdon', descending: true }],
    filter: `(${anyOf('_qdb_collectioncaseid_value', chunk)}) and _qdb_strategyactionid_value ne null`,
  })));
  return pages.flatMap(page => mapPage(page, toActivityRow).items);
}

const anyOf = (column: string, ids: readonly string[]) => ids.map(id => `${column} eq ${escapeOData(id)}`).join(' or ');

function chunks<T>(items: readonly T[]): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += CASES_PER_READ) result.push(items.slice(start, start + CASES_PER_READ));
  return result;
}
