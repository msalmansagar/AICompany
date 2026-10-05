import { describe, expect, it } from 'vitest';
import { readsFor } from '../data/communicationHistoryQueries.js';
import { READ_REGISTRY, toAttributeName } from '../data/schema.js';
import { FAX_MESSAGING, LETTER_MESSAGING } from './messagingFixtures.js';
import type { MessagingConfiguration } from '../data/messagingConfiguration.js';

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

/** A column the organisation's own Communication mapping names — configuration, checked per organisation. */
const mappedColumns = (messaging: MessagingConfiguration): Set<string> => new Set(
  [messaging.sms, messaging.whatsApp].flatMap(route => Object.values(route?.columns ?? {})));

describe.each([['BFD (Fax)', FAX_MESSAGING], ['HL (Letter)', LETTER_MESSAGING]])('the %s history reads only known columns', (_, messaging) => {
  const reads = readsFor(CASE_ID, messaging);

  for (const [key, read] of Object.entries(reads)) {
    it(`${key}: every selected column is registered, or named by the organisation's mapping`, () => {
      const known = registered.get(read!.entitySet);
      expect(known, `${read!.entitySet} is not in READ_REGISTRY at all`).toBeDefined();

      const unknown = read!.select.filter(column => !known!.has(column) && !mappedColumns(messaging).has(column));
      expect(unknown, `${key} selects columns nothing verifies: ${unknown.join(', ')}`).toEqual([]);
    });

    it(`${key}: every selected column resolves to a real attribute name`, () => {
      for (const column of read!.select) {
        expect(toAttributeName(column), `${column} is not a usable attribute`).toBeTruthy();
      }
    });
  }

  it('reads the activity by the key an activity actually has', () => {
    // The specific mistake, pinned. `qdb_collectionactivity` is an activity entity: `activityid`.
    expect(reads.activity!.select).toContain('activityid');
    expect(reads.activity!.select).not.toContain('qdb_collectionactivityid');
  });

  it('filters each source to the one case, using the lookup read form', () => {
    // `_x_value` is the form that works in $filter; the storage name is accepted and returns
    // nothing, which is the KI-52 family all over again.
    expect(reads.email!.filter).toContain('_regardingobjectid_value');
    expect(reads.activity!.filter).toContain('_qdb_collectioncaseid_value');
    for (const read of Object.values(reads)) {
      expect(read!.filter).toContain(CASE_ID);
    }
  });
});

describe('which table holds the messages', () => {
  it('reads SMS and WhatsApp from Fax on BFD', () => {
    const reads = readsFor(CASE_ID, FAX_MESSAGING);
    expect([reads.fax?.entitySet, reads.letter]).toEqual(['faxes', undefined]);
  });

  it('reads SMS and WhatsApp from Letter on Housing Loan, and never from Fax', () => {
    // The HL defect: reading fax.qdb_message_body on an organisation whose SMS table is Letter.
    const reads = readsFor(CASE_ID, LETTER_MESSAGING);
    expect([reads.letter?.entitySet, reads.fax]).toEqual(['letters', undefined]);
  });

  it('reads no message table at all when the organisation has configured none', () => {
    const reads = readsFor(CASE_ID, { organization: 'HL', problems: ['SMS has no table configured for HL (qdb_smsentity).'] });
    expect(Object.keys(reads).sort()).toEqual(['activity', 'email']);
  });
});
