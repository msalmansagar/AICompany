import { describe, expect, it } from 'vitest';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { loadNextPlannedActions } from '../data/customerNextActions.js';

/**
 * The Next Planned Action for every open case of a customer: two reads in total, whatever the number
 * of cases — never three per case — and the three states kept apart.
 */
const F = '@OData.Community.Display.V1.FormattedValue';

function fakeAdapter() {
  const reads: string[] = [];
  const adapter = {
    async retrieveMultiple(entitySet: string, query: { filter: string }) {
      reads.push(`${entitySet} ${query.filter}`);
      return [{ qdb_strategyactionid: 'sa-1', qdb_name: 'Follow-up call', qdb_sequence: 1, qdb_isactive: true, _qdb_strategyid_value: 'strat-1', [`_qdb_strategyid_value${F}`]: 'Early stage' }];
    },
    async retrievePage(entitySet: string, query: { filter: string }) {
      reads.push(`${entitySet} ${query.filter}`);
      return { items: [], hasMore: false, appliedPageSize: 500 };
    },
  } as unknown as XrmCrmAdapter;
  return { adapter, reads };
}

describe('loadNextPlannedActions', () => {
  it('loadNextPlannedActions_twentyCases_readsTwiceInTotal', async () => {
    const { adapter, reads } = fakeAdapter();
    const cases = Array.from({ length: 20 }, (_, i) => ({ id: `c-${i}`, strategyId: 'strat-1' }));

    await loadNextPlannedActions(adapter, cases);

    expect(reads).toHaveLength(2);
  });

  it('loadNextPlannedActions_caseWithoutStrategy_isNoActionPlan', async () => {
    const { adapter } = fakeAdapter();

    const result = await loadNextPlannedActions(adapter, [{ id: 'c-1' }]);

    expect(result.get('c-1')).toEqual({ kind: 'noPlan' });
  });

  it('loadNextPlannedActions_strategyWithNoActions_isNotConfigured', async () => {
    const { adapter } = fakeAdapter();

    const result = await loadNextPlannedActions(adapter, [{ id: 'c-1', strategyId: 'strat-without-actions' }]);

    expect(result.get('c-1')).toEqual({ kind: 'notConfigured' });
  });

  it('loadNextPlannedActions_plannedStep_isTheNextPlannedAction', async () => {
    const { adapter } = fakeAdapter();

    const result = await loadNextPlannedActions(adapter, [{ id: 'c-1', strategyId: 'strat-1' }]);

    expect(result.get('c-1')).toMatchObject({ kind: 'planned', item: { action: 'Follow-up call' } });
  });
});
