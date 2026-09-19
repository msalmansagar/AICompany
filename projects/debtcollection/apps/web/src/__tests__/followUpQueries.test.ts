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
function adapterReturning(rowsByLogicalName: Record<string, Record<string, unknown>[]>) {
  const requested: string[] = [];
  const xrm = {
    WebApi: {
      retrieveMultipleRecords: async (logicalName: string, options: string) => {
        requested.push(`${logicalName}${options}`);
        return { entities: rowsByLogicalName[logicalName] ?? [] };
      },
    },
  } as unknown as XrmLike;
  return { adapter: new XrmCrmAdapter(xrm), requested };
}

const CALL_TYPE = 'type-call';
const VISIT_TYPE = 'type-visit';

const plannedAction = (id: string, typeId: string, name: string) => ({
  qdb_strategyactionid: id,
  qdb_name: name,
  qdb_sequence: 1,
  qdb_isactive: true,
  '_qdb_activitytypeid_value': typeId,
  [`_qdb_activitytypeid_value${FORMATTED}`]: name,
});

const activity = (id: string, typeId: string, statusLabel: string) => ({
  activityid: id,
  subject: `${statusLabel} activity`,
  statuscode: 1,
  [`statuscode${FORMATTED}`]: statusLabel,
  '_qdb_activitytypeid_value': typeId,
});

describe('the Action Plan', () => {
  it('reads nothing when the case carries no strategy', async () => {
    const { adapter, requested } = adapterReturning({});
    expect(await loadActionPlan(adapter, { caseId: 'case-1' })).toEqual([]);
    expect(requested, 'no strategy means no query at all').toHaveLength(0);
  });

  it('pairs each planned action with the activities of that type', async () => {
    const { adapter } = adapterReturning({
      qdb_strategyaction: [
        plannedAction('action-1', CALL_TYPE, 'Courtesy call'),
        plannedAction('action-2', VISIT_TYPE, 'Field visit'),
      ],
      qdb_collectionactivity: [
        activity('act-1', CALL_TYPE, 'Completed'),
        activity('act-2', CALL_TYPE, 'Open'),
      ],
    });

    const plan = await loadActionPlan(adapter, { caseId: 'case-1', strategyId: 'strat-1' });

    expect(plan).toHaveLength(2);
    expect(plan[0]!.matchingActivities.map(a => a.id)).toEqual(['act-1', 'act-2']);
    expect(plan[0]!.hasCompletedMatch).toBe(true);
    expect(plan[1]!.matchingActivities, 'the visit was planned but never done').toHaveLength(0);
    expect(plan[1]!.hasCompletedMatch).toBe(false);
  });

  /**
   * The correlation is on the type **id**. Matching on the display name would look identical here and
   * break the day someone renames "Courtesy call" in configuration — silently, by showing an empty
   * column rather than an error.
   */
  it('still pairs correctly when the type label differs between the two reads', async () => {
    const { adapter } = adapterReturning({
      qdb_strategyaction: [plannedAction('action-1', CALL_TYPE, 'Courtesy call')],
      qdb_collectionactivity: [{
        ...activity('act-1', CALL_TYPE, 'Completed'),
        [`_qdb_activitytypeid_value${FORMATTED}`]: 'Outbound call',
      }],
    });

    const plan = await loadActionPlan(adapter, { caseId: 'case-1', strategyId: 'strat-1' });
    expect(plan[0]!.matchingActivities).toHaveLength(1);
  });

  it('scopes the activity read to the case and the action read to the strategy', async () => {
    const { adapter, requested } = adapterReturning({
      qdb_strategyaction: [plannedAction('action-1', CALL_TYPE, 'Courtesy call')],
      qdb_collectionactivity: [],
    });
    await loadActionPlan(adapter, { caseId: 'case-1', strategyId: 'strat-1' });

    // A lookup's `_value` comparison takes a bare GUID — quoting it is rejected by the platform,
    // which is why `escapeOData` handles the quote character without adding delimiters of its own.
    expect(requested.find(r => r.startsWith('qdb_strategyaction')))
      .toContain('_qdb_strategyid_value eq strat-1');
    expect(requested.find(r => r.startsWith('qdb_collectionactivity')))
      .toContain('_qdb_collectioncaseid_value eq case-1');
  });
});
