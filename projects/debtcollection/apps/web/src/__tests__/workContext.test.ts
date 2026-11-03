import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_CHECKS_PER_STEP, checkEligibility, describePosition, findEligible, requestRestore, startWorkContext,
  takeRestoredState, workContextFor, type WorkContext,
} from '../data/workContext.js';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { followUpContext } from '../views/workListContext.js';

/**
 * The work context a list hands to the case it opens (WP5): position, steps that revalidate every
 * item against the platform, and Back restoring the list's own choices once.
 */

const NOW = new Date('2026-10-06T10:00:00Z');
type Row = Record<string, unknown> | null | 'refused';

function adapterWith(rows: Record<string, Row>) {
  const reads: string[] = [];
  const adapter = {
    async retrieve(reference: { entity: string; id: string }) {
      reads.push(reference.id);
      const row = rows[reference.id] ?? null;
      if (row === 'refused') throw { status: 403 };
      return row;
    },
  } as unknown as XrmCrmAdapter;
  return { adapter, reads };
}

const openActivity = (followUp: string, owner = 'u-1') => ({ activityid: 'x', statecode: 0, qdb_followupdate: followUp, _ownerid_value: owner });

function context(over: Partial<WorkContext> = {}): WorkContext {
  return {
    originLabel: 'Overdue follow-ups', returnHash: '#myday', originKey: 'myday-followups',
    eligibility: { kind: 'followUps', window: 'overdue' },
    items: [
      { caseId: 'c-1', activityId: 'a-1', label: 'COL-1 · Call' },
      { caseId: 'c-2', activityId: 'a-2', label: 'COL-2 · Call' },
      { caseId: 'c-3', activityId: 'a-3', label: 'COL-3 · Call' },
    ],
    index: 0, hasMore: false, listState: { window: 'overdue' },
    ...over,
  };
}

afterEach(() => window.sessionStorage.clear());

describe('describePosition', () => {
  it.each([
    [{}, '1 of 3 · Overdue follow-ups'],
    [{ hasMore: true }, '1 of 3+ · Overdue follow-ups'],
    [{ hasMore: true, totalCount: 18, index: 2 }, '3 of 18 · Overdue follow-ups'],
  ])('reads %j as "%s"', (over, expected) => {
    expect(describePosition(context(over))).toBe(expected);
  });
});

describe('checkEligibility', () => {
  const item = { caseId: 'c-2', activityId: 'a-2', label: 'COL-2' };

  it.each([
    ['still overdue', openActivity('2026-10-01'), { kind: 'followUps', window: 'overdue' }, { eligible: true }],
    ['completed elsewhere', { ...openActivity('2026-10-01'), statecode: 1 }, { kind: 'followUps', window: 'overdue' }, { eligible: false, reason: 'it was completed or cancelled' }],
    ['deleted', null, { kind: 'followUps', window: 'overdue' }, { eligible: false, reason: 'it no longer exists' }],
    ['follow-up cleared', { ...openActivity(''), qdb_followupdate: null }, { kind: 'followUps', window: 'overdue' }, { eligible: false, reason: 'its follow-up was cleared' }],
    ['rescheduled out of Overdue', openActivity('2026-10-20'), { kind: 'followUps', window: 'overdue' }, { eligible: false, reason: 'it is no longer overdue' }],
    ['now overdue, out of Upcoming', openActivity('2026-10-01'), { kind: 'followUps', window: 'upcoming' }, { eligible: false, reason: 'it is now overdue' }],
    ['reassigned out of My work', openActivity('2026-10-01', 'u-2'), { kind: 'queue', bucket: 'MyAssigned', currentUserId: 'U-1' }, { eligible: false, reason: 'it was reassigned' }],
    ['held by someone else in another bucket', openActivity('2026-10-01', 'u-2'), { kind: 'queue', bucket: 'Legal', currentUserId: 'u-1' }, { eligible: true }],
  ] as const)('%s', async (_name, row, eligibility, expected) => {
    const { adapter } = adapterWith({ 'a-2': row });

    expect(await checkEligibility({ adapter, now: NOW }, item, eligibility)).toEqual(expected);
  });

  it('checks a case from the Cases list by whether it is still open', async () => {
    const { adapter } = adapterWith({ 'c-9': { qdb_collectioncaseid: 'c-9', statecode: 1 } });

    expect(await checkEligibility({ adapter, now: NOW }, { caseId: 'c-9', label: 'COL-9' }, { kind: 'cases' })).toEqual({ eligible: false, reason: 'the case is closed' });
  });
});

describe('findEligible', () => {
  it('steps over stale items to the next one that still belongs, saying what it skipped', async () => {
    const { adapter } = adapterWith({ 'a-2': { ...openActivity('2026-10-01'), statecode: 1 }, 'a-3': openActivity('2026-10-02') });

    expect(await findEligible({ adapter, now: NOW }, context(), 1)).toEqual({ index: 2, skipped: [{ label: 'COL-2 · Call', reason: 'it was completed or cancelled' }], stoppedEarly: false });
  });

  it('never lands on an item it could not read', async () => {
    const { adapter } = adapterWith({ 'a-2': 'refused', 'a-3': openActivity('2026-10-02') });

    expect((await findEligible({ adapter, now: NOW }, context(), 1)).index).toBe(2);
  });

  it('finds nothing past the end, and checks nothing it does not need to', async () => {
    const { adapter, reads } = adapterWith({});

    expect([await findEligible({ adapter, now: NOW }, context({ index: 2 }), 1), reads]).toEqual([{ skipped: [], stoppedEarly: false }, []]);
  });

  it('stops after a bounded number of checks rather than walking a whole stale list', async () => {
    const items = Array.from({ length: 30 }, (_, n) => ({ caseId: `c-${n}`, activityId: `a-${n}`, label: `COL-${n}` }));
    const { adapter, reads } = adapterWith({});

    const result = await findEligible({ adapter, now: NOW }, context({ items }), 1);

    expect([result.index, result.stoppedEarly, reads.length]).toEqual([undefined, true, MAX_CHECKS_PER_STEP]);
  });

  it('steps backwards too', async () => {
    const { adapter } = adapterWith({ 'a-1': openActivity('2026-10-01') });

    expect((await findEligible({ adapter, now: NOW }, context({ index: 1 }), -1)).index).toBe(0);
  });
});

describe('building a context from a list', () => {
  const row = (id: string, caseId: string) => ({ id, caseId, caseNumber: `COL-${caseId}`, subject: 'Call' });

  it('places the opened row at its own position in the list', () => {
    const rows = { items: [row('a-1', 'c-1'), row('a-2', 'c-2')], hasMore: true };

    const built = followUpContext(rows, rows.items[1]!, 'overdue');

    expect([built.index, built.items.length, describePosition(built)]).toEqual([1, 2, '2 of 2+ · Overdue follow-ups']);
  });

  it('gives no position at all, rather than a wrong one, when the opened row is not among the loaded rows', () => {
    const rows = { items: [row('a-1', 'c-1')], hasMore: true };

    const built = followUpContext(rows, row('a-9', 'c-9'), 'overdue');
    startWorkContext(built);

    expect([built.items, workContextFor('c-9'), workContextFor('c-1')]).toEqual([[], undefined, undefined]);
  });
});

describe('storage', () => {
  it('belongs only to the case at its current position', () => {
    startWorkContext(context({ index: 1 }));

    expect([workContextFor('c-2')?.index, workContextFor('c-1')]).toEqual([1, undefined]);
  });

  it('gives a list its saved choices once after Back, and not to a different list', () => {
    const saved = context({ listState: { window: 'upcoming' } });
    startWorkContext(saved);
    requestRestore(saved);

    expect([takeRestoredState('queues'), takeRestoredState('myday-followups'), takeRestoredState('myday-followups')]).toEqual([undefined, { window: 'upcoming' }, undefined]);
  });
});
