import { describe, expect, it } from 'vitest';
import { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import type { XrmLike } from '../platform/crmContext.js';
import { buildFollowUpFilter, loadActionPlan } from '../data/followUpQueries.js';

/**
 * The follow-up queue and the Action Plan.
 *
 * The filter tests matter more than they look: the whole point is that the comparison against "now"
 * is *sent to the platform*, so a test that checked the returned rows instead of the request would
 * pass equally well against a browser-side filter — the thing the large-dataset rule forbids.
 */

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';
const NOW = new Date('2026-09-19T12:00:00.000Z');

/**
 * Honours the one filter clause the Action Plan relies on the platform to apply.
 *
 * The plan reads attributed work and unattributed history as **two** narrowed requests. A fake that
 * returned every row to both would make the split invisible — and a regression that reattached
 * historical activities to planned actions would sail through a green suite. So the fake applies
 * the same clause the platform would.
 */
function matchesProvenanceSplit(row: Record<string, unknown>, options: string): boolean {
  const attributed = row['_qdb_strategyactionid_value'] !== undefined;
  if (options.includes('_qdb_strategyactionid_value ne null')) return attributed;
  if (options.includes('_qdb_strategyactionid_value eq null')) return !attributed;
  return true;
}

describe('the follow-up filter', () => {
  it('always excludes activities that have no follow-up date', () => {
    expect(buildFollowUpFilter({ now: NOW })).toContain('qdb_followupdate ne null');
  });

  it('sends the overdue comparison to the platform rather than filtering here', () => {
    const filter = buildFollowUpFilter({ window: 'overdue', now: NOW });
    expect(filter).toContain('qdb_followupdate lt 2026-09-19T12:00:00.000Z');
  });

  it('bounds an upcoming window only when the caller asked for one', () => {
    const open = buildFollowUpFilter({ window: 'upcoming', now: NOW });
    expect(open).toContain('qdb_followupdate ge 2026-09-19T12:00:00.000Z');
    expect(open, 'no horizon is invented').not.toContain(' le ');

    const bounded = buildFollowUpFilter({ window: 'upcoming', horizonDays: 7, now: NOW });
    expect(bounded).toContain('qdb_followupdate le 2026-09-26T12:00:00.000Z');
  });

  it('restricts to open activities by default, and lets a caller widen it', () => {
    expect(buildFollowUpFilter({ now: NOW })).toContain('statecode eq 0');
    expect(buildFollowUpFilter({ now: NOW, openOnly: false })).not.toContain('statecode eq 0');
  });

  it('carries an organisation scope through untouched', () => {
    expect(buildFollowUpFilter({ now: NOW, scopeFilter: 'qdb_organizationcode eq 100000140' }))
      .toContain('qdb_organizationcode eq 100000140');
  });
});

/**
 * Records every request so the plan's reads can be asserted, and replies from a scripted map.
 *
 * Keyed by **logical** name, because that is what the adapter passes to the client API — the entity
 * set goes only into a URL. A fake keyed the other way would return nothing, and every assertion
 * about correlation would pass vacuously.
 */
function adapterReturning(
  rowsByLogicalName: Record<string, Record<string, unknown>[]>,
  options: { honourSplit?: boolean } = {},
) {
  const { honourSplit } = options;
  const requested: string[] = [];
  const xrm = {
    WebApi: {
      retrieveMultipleRecords: async (logicalName: string, options: string) => {
        requested.push(`${logicalName}${options}`);
        const rows = rowsByLogicalName[logicalName] ?? [];
        if (honourSplit === false) return { entities: rows };
        return { entities: rows.filter(row => matchesProvenanceSplit(row, options)) };
      },
    },
  } as unknown as XrmLike;
  return { adapter: new XrmCrmAdapter(xrm), requested };
}

const CALL_TYPE = 'type-call';
const VISIT_TYPE = 'type-visit';
const CALL_ACTION = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const VISIT_ACTION = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const plannedAction = (id: string, typeId: string, name: string) => ({
  qdb_strategyactionid: id,
  qdb_name: name,
  qdb_sequence: 1,
  qdb_isactive: true,
  '_qdb_activitytypeid_value': typeId,
  [`_qdb_activitytypeid_value${FORMATTED}`]: name,
});

/** An activity of a matching TYPE that names no planned action. This is the KI-71 trap. */
const unattributedActivity = (id: string, typeId: string, statusLabel: string) => ({
  activityid: id,
  subject: `${statusLabel} activity`,
  statuscode: 1,
  [`statuscode${FORMATTED}`]: statusLabel,
  '_qdb_activitytypeid_value': typeId,
});

/** The same activity, with the provenance that actually attributes it. */
const attributedActivity = (
  id: string, typeId: string, statusLabel: string, strategyActionId: string,
) => ({
  ...unattributedActivity(id, typeId, statusLabel),
  '_qdb_strategyactionid_value': strategyActionId,
  qdb_origin: 100000801,
});

describe('the Action Plan attributes work by provenance, never by type', () => {
  it('reads no plan when the case carries no strategy, but still returns its history', async () => {
    const { adapter } = adapterReturning({
      qdb_collectionactivity: [unattributedActivity('act-1', CALL_TYPE, 'Completed')],
    });

    const plan = await loadActionPlan(adapter, { caseId: 'case-1' });

    expect(plan.rows).toEqual([]);
    expect(plan.unattributed.map(a => a.id), 'history is not hidden with the plan')
      .toEqual(['act-1']);
  });

  it('pairs a planned action with the activity that names it', async () => {
    const { adapter } = adapterReturning({
      qdb_strategyaction: [
        plannedAction(CALL_ACTION, CALL_TYPE, 'Courtesy call'),
        plannedAction(VISIT_ACTION, VISIT_TYPE, 'Field visit'),
      ],
      qdb_collectionactivity: [
        attributedActivity('act-1', CALL_TYPE, 'Completed', CALL_ACTION),
      ],
    });

    const plan = await loadActionPlan(adapter, { caseId: 'case-1', strategyId: 'strat-1' });

    expect(plan.rows).toHaveLength(2);
    expect(plan.rows[0]!.attributed.map(a => a.id)).toEqual(['act-1']);
    expect(plan.rows[0]!.hasCompletedAttributed).toBe(true);
    expect(plan.rows[1]!.attributed, 'the visit was planned but never done').toHaveLength(0);
  });

  /**
   * The regression this release exists to remove.
   *
   * Phase 6 would have attached this activity to "Courtesy call" because the types match. It was
   * raised by an officer for their own reasons, and attributing it to a plan that never asked for
   * it reports the strategy as followed when it was not.
   */
  it('does NOT attach an activity of a matching type that names no action', async () => {
    const { adapter } = adapterReturning({
      qdb_strategyaction: [plannedAction(CALL_ACTION, CALL_TYPE, 'Courtesy call')],
      qdb_collectionactivity: [unattributedActivity('act-1', CALL_TYPE, 'Completed')],
    });

    const plan = await loadActionPlan(adapter, { caseId: 'case-1', strategyId: 'strat-1' });

    expect(plan.rows[0]!.attributed, 'a matching type is not an attribution').toHaveLength(0);
    expect(plan.rows[0]!.hasCompletedAttributed).toBe(false);
    expect(plan.unattributed.map(a => a.id), 'and it is not lost either').toEqual(['act-1']);
  });

  /**
   * The same rule, proved without the platform's help.
   *
   * The two reads are narrowed by the source, so in normal operation an unattributed activity never
   * reaches the grouping at all — which means the filter, not the correlation, is what the previous
   * test actually exercised. Here the source returns everything, as it would if the clause were
   * dropped or a future caller reused these rows, and the correlation must still refuse it. Two
   * independent defences, each tested on its own.
   */
  it('refuses an unattributed activity even when the source returns it anyway', async () => {
    const { adapter } = adapterReturning({
      qdb_strategyaction: [plannedAction(CALL_ACTION, CALL_TYPE, 'Courtesy call')],
      qdb_collectionactivity: [unattributedActivity('act-1', CALL_TYPE, 'Completed')],
    }, { honourSplit: false });

    const plan = await loadActionPlan(adapter, { caseId: 'case-1', strategyId: 'strat-1' });

    expect(plan.rows[0]!.attributed, 'the correlation refuses it on its own').toHaveLength(0);
  });

  it('does NOT attach an activity that names a DIFFERENT action of the same type', async () => {
    const { adapter } = adapterReturning({
      qdb_strategyaction: [plannedAction(CALL_ACTION, CALL_TYPE, 'Courtesy call')],
      qdb_collectionactivity: [
        attributedActivity('act-1', CALL_TYPE, 'Completed', VISIT_ACTION),
      ],
    });

    const plan = await loadActionPlan(adapter, { caseId: 'case-1', strategyId: 'strat-1' });

    expect(plan.rows[0]!.attributed).toHaveLength(0);
  });

  it('attributes regardless of the case the platform returns the id in', async () => {
    const { adapter } = adapterReturning({
      qdb_strategyaction: [plannedAction(CALL_ACTION, CALL_TYPE, 'Courtesy call')],
      qdb_collectionactivity: [
        attributedActivity('act-1', CALL_TYPE, 'Open', CALL_ACTION.toUpperCase()),
      ],
    });

    const plan = await loadActionPlan(adapter, { caseId: 'case-1', strategyId: 'strat-1' });

    expect(plan.rows[0]!.attributed).toHaveLength(1);
  });

  it('carries provenance through to the row, and leaves history’s origin unset', async () => {
    const { adapter } = adapterReturning({
      qdb_strategyaction: [plannedAction(CALL_ACTION, CALL_TYPE, 'Courtesy call')],
      qdb_collectionactivity: [
        attributedActivity('act-1', CALL_TYPE, 'Open', CALL_ACTION),
        unattributedActivity('act-2', CALL_TYPE, 'Open'),
      ],
    });

    const plan = await loadActionPlan(adapter, { caseId: 'case-1', strategyId: 'strat-1' });

    expect(plan.rows[0]!.attributed[0]!.origin).toBe('StrategyGenerated');
    expect(plan.unattributed[0]!.origin, 'absent, not defaulted to Manual').toBeUndefined();
  });
});

describe('the Action Plan lets the platform do the narrowing', () => {
  it('scopes the action read to the strategy and both activity reads to the case', async () => {
    const { adapter, requested } = adapterReturning({
      qdb_strategyaction: [plannedAction(CALL_ACTION, CALL_TYPE, 'Courtesy call')],
      qdb_collectionactivity: [],
    });
    await loadActionPlan(adapter, { caseId: 'case-1', strategyId: 'strat-1' });

    // A lookup's `_value` comparison takes a bare GUID — quoting it is rejected by the platform,
    // which is why `escapeOData` handles the quote character without adding delimiters of its own.
    expect(requested.find(r => r.startsWith('qdb_strategyaction')))
      .toContain('_qdb_strategyid_value eq strat-1');

    const activityReads = requested.filter(r => r.startsWith('qdb_collectionactivity'));
    expect(activityReads, 'attributed work and history are read separately').toHaveLength(2);
    for (const read of activityReads) {
      expect(read).toContain('_qdb_collectioncaseid_value eq case-1');
    }
  });

  /**
   * The split is the platform's, not the browser's.
   *
   * Reading every activity on the case and dividing them here would work on a demo case and fail on
   * a real one, where an unbounded read truncates and silently drops whichever bucket lost the race.
   */
  it('sends the provenance split to the source as two narrowed requests', async () => {
    const { adapter, requested } = adapterReturning({
      qdb_strategyaction: [plannedAction(CALL_ACTION, CALL_TYPE, 'Courtesy call')],
      qdb_collectionactivity: [],
    });
    await loadActionPlan(adapter, { caseId: 'case-1', strategyId: 'strat-1' });

    const activityReads = requested.filter(r => r.startsWith('qdb_collectionactivity'));
    expect(activityReads.some(r => r.includes('_qdb_strategyactionid_value ne null'))).toBe(true);
    expect(activityReads.some(r => r.includes('_qdb_strategyactionid_value eq null'))).toBe(true);
  });
});
