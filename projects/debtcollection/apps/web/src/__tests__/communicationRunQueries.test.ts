import { describe, expect, it } from 'vitest';
import {
  MAX_POPULATION, buildRunFilter, resolvePopulation, runReadsFor, toOutcomeRows, toRunRow,
} from '../data/communicationRunQueries.js';
import { COMMUNICATION_RUN_LIST_COLUMNS, READ_REGISTRY, toAttributeName } from '../data/schema.js';
import { STATUS_CODES } from '../services/bulkCommunicationService.js';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';

/**
 * The bulk reads, held to the rule KI-89 produced.
 *
 * A query module may not name a column. It takes a registered set from `schema.ts`, and that set is
 * what `crm/scripts/verify-view-columns.mts` checks against live metadata. The history panel failed
 * completely on the deployed organisation with three columns that did not exist, and 1,149 green
 * tests said nothing, because a list typed into a query module never reaches `READ_REGISTRY`.
 */

const registered = new Map(READ_REGISTRY.map(entry => [entry.entitySet, new Set(entry.columns)]));

describe('the bulk reads use only registered columns', () => {
  const reads = runReadsFor();

  for (const [name, read] of Object.entries(reads)) {
    it(`${name}: every selected column is registered for ${read.entitySet}`, () => {
      const known = registered.get(read.entitySet);
      expect(known, `${read.entitySet} is not in READ_REGISTRY at all`).toBeDefined();

      const unregistered = read.select.filter(column => !known!.has(column));
      expect(
        unregistered,
        `${name} selects columns nothing verifies against live metadata: ${unregistered.join(', ')}`,
      ).toEqual([]);
    });

    it(`${name}: every selected column resolves to a real attribute name`, () => {
      for (const column of read.select) {
        expect(toAttributeName(column), `${column} is not a usable attribute`).toBeTruthy();
      }
    });
  }
});

describe('a run list never carries a run population', () => {
  it('omits the memo columns that hold one line per recipient', () => {
    // Selecting these for a grid would pull every population on the page into the browser at once —
    // invisible on screen, and exactly what the large-data contract forbids.
    expect(COMMUNICATION_RUN_LIST_COLUMNS).not.toContain('qdb_frozenpopulation');
    expect(COMMUNICATION_RUN_LIST_COLUMNS).not.toContain('qdb_failedrecipients');
  });

  it('resolves a population by id alone, never by reading case rows', () => {
    expect(runReadsFor()['population']!.select).toEqual(['qdb_collectioncaseid']);
  });
});

describe('narrowing is sent to the source', () => {
  it('filters runs by the status code the executor writes, not by a label', () => {
    expect(buildRunFilter({ status: 'Paused' })).toBe(`qdb_status eq ${STATUS_CODES.Paused}`);
  });

  it('asks for everything when no status is chosen', () => {
    expect(buildRunFilter({})).toBeUndefined();
  });
});

describe('a run row is shaped for an officer', () => {
  it('reads the channel and status as names, from the codes that were provisioned', () => {
    const row = toRunRow({
      qdb_communicationrunid: 'run-1',
      qdb_name: 'SMS to 40 recipients',
      qdb_channel: 100000700,
      qdb_status: STATUS_CODES.Paused,
      qdb_totalrecipients: 40,
      qdb_cursor: 12,
    });

    expect(row.channel).toBe('SMS');
    expect(row.status).toBe('Paused');
    expect(row.processed).toBe(12);
  });
});

describe('an outcome row never shows an identifier', () => {
  it('uses the case number when it is known', () => {
    const rows = toOutcomeRows(
      [{ recipientId: 'AAAA1111-1111-1111-1111-111111111111', outcome: 'refused', detail: 'On hold' }],
      new Map([['aaaa1111-1111-1111-1111-111111111111', 'COL-HL-000123']]));

    expect(rows[0]!.caseNumber).toBe('COL-HL-000123');
  });

  it('falls back to a position rather than to the id, when the label cannot be read', () => {
    const recipientId = 'aaaa1111-1111-1111-1111-111111111111';
    const rows = toOutcomeRows(
      [{ recipientId, outcome: 'failed', detail: 'incomplete communication' }], new Map());

    // A GUID in front of a Collection Officer is the defect KI-93 was about. A position is useless
    // to an attacker and legible to an officer, which is the right trade.
    expect(rows[0]!.caseNumber).toBe('Recipient 1');
    expect(rows[0]!.caseNumber).not.toContain(recipientId);
  });
});

// ── The population resolver ──────────────────────────────────────────────────

/** A source that answers pages, so the resolver's boundedness can be observed rather than assumed. */
function pagingAdapter(totalRows: number, pageSize = 200) {
  const calls: { pageSize: number; select: readonly string[] }[] = [];
  let served = 0;

  const adapter = {
    async retrievePage(_entity: string, query: { pageSize: number; select: readonly string[] }) {
      calls.push({ pageSize: query.pageSize, select: query.select });
      const remaining = totalRows - served;
      const count = Math.min(remaining, pageSize);
      const items = Array.from({ length: count }, (_, index) => ({
        qdb_collectioncaseid: `case-${served + index}`,
      }));
      served += count;
      const hasMore = served < totalRows;
      return { items, hasMore, appliedPageSize: pageSize, ...(hasMore ? { continuation: 'next' } : {}) };
    },
  } as unknown as XrmCrmAdapter;

  return { adapter, calls };
}

describe('resolving a population', () => {
  it('walks bounded pages and keeps only the ids', async () => {
    const { adapter, calls } = pagingAdapter(450);

    const outcome = await resolvePopulation(adapter, { openOnly: true });

    expect(outcome.status).toBe('resolved');
    expect(calls.every(call => call.pageSize <= 200)).toBe(true);
    expect(calls.every(call => call.select.length === 1)).toBe(true);
  });

  it('refuses a selection larger than one run may contain, rather than truncating it', async () => {
    const { adapter } = pagingAdapter(MAX_POPULATION + 10);

    const outcome = await resolvePopulation(adapter, { openOnly: true });

    // Truncation would send to a population nobody confirmed, and it would look like success.
    expect(outcome.status).toBe('tooLarge');
  });

  it('reports an empty population rather than creating a run with nobody in it', async () => {
    const { adapter } = pagingAdapter(0);

    expect((await resolvePopulation(adapter, { openOnly: true })).status).toBe('empty');
  });
});
