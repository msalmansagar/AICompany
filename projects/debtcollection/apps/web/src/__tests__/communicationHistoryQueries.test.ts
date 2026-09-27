import { describe, expect, it } from 'vitest';
import { readsFor } from '../data/communicationHistoryQueries.js';
import { READ_REGISTRY, toAttributeName } from '../data/schema.js';

/**
 * Every column the history reads must be a **registered** column.
 *
 * This guard exists because of a defect that reached the deployed organisation. The activity source
 * named its columns inline — `qdb_collectionactivityid`, `qdb_subject`, `qdb_activitystatus` — and
 * all three were wrong. A collection activity is a Dynamics activity, so its key is `activityid`.
 *
 * Three test suites were green and the whole history panel failed on the real platform with
 * "Could not find a property named 'qdb_collectionactivityid'". Nothing caught it because
 * `verify-view-columns.mts` checks `READ_REGISTRY` against live metadata, and a column list typed
 * into a query module never reaches `READ_REGISTRY`.
 *
 * So the rule is not "spell the columns correctly". It is **a query module may not name a column
 * at all** — it takes a registered set from `schema.ts`, and that set is what the live verifier
 * checks. This test enforces exactly that, and would have failed on the shipped code.
 */

const CASE_ID = '11111111-1111-1111-1111-111111111111';

const registered = new Map(
  READ_REGISTRY.map(entry => [entry.entitySet, new Set(entry.columns)]),
);

describe('the history reads only registered columns', () => {
  const reads = readsFor(CASE_ID);

  for (const [key, read] of Object.entries(reads)) {
    it(`${key}: every selected column is registered for ${read.entitySet}`, () => {
      const known = registered.get(read.entitySet);
      expect(known, `${read.entitySet} is not in READ_REGISTRY at all`).toBeDefined();

      const unregistered = read.select.filter(column => !known!.has(column));
      expect(
        unregistered,
        `${key} selects columns nothing verifies against live metadata: ${unregistered.join(', ')}`,
      ).toEqual([]);
    });

    it(`${key}: every selected column resolves to a real attribute name`, () => {
      for (const column of read.select) {
        expect(toAttributeName(column), `${column} is not a usable attribute`).toBeTruthy();
      }
    });
  }

  it('reads the activity by the key an activity actually has', () => {
    // The specific mistake, pinned. `qdb_collectionactivity` is an activity entity: `activityid`.
    expect(reads.activity.select).toContain('activityid');
    expect(reads.activity.select).not.toContain('qdb_collectionactivityid');
  });

  it('filters each source to the one case, using the lookup read form', () => {
    // `_x_value` is the form that works in $filter; the storage name is accepted and returns
    // nothing, which is the KI-52 family all over again.
    expect(reads.fax.filter).toContain('_regardingobjectid_value');
    expect(reads.email.filter).toContain('_regardingobjectid_value');
    expect(reads.activity.filter).toContain('_qdb_collectioncaseid_value');
    for (const read of Object.values(reads)) {
      expect(read.filter).toContain(CASE_ID);
    }
  });
});
