import { describe, expect, it } from 'vitest';
import { describeOriginLabel, strategyActivityId } from '@dcp/domain';
import { toPlanItem, toUnattributedItem, type CaseContext } from '../data/actionPlanRows.js';
import type { ActionPlanRow } from '../data/followUpQueries.js';
import type { ActivityRow } from '../data/caseQueries.js';

/**
 * The Action Plan's screen rows.
 *
 * What is asserted here is mostly what the screen refuses to say: it will not invent a due date
 * QDB has not defined, will not call unattributed history manual, and will not keep a previous
 * arrears episode's work in an officer's current queue.
 */

const CASE_ID = '11111111-1111-1111-1111-111111111111';
const ACTION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const NOW = new Date('2026-09-21T12:00:00Z');

const context = (overrides: Partial<CaseContext> = {}): CaseContext => ({
  caseId: CASE_ID,
  now: NOW,
  formatDate: (iso: string) => iso.slice(0, 10),
  ...overrides,
});

const planned = (overrides: Record<string, unknown> = {}) => ({
  id: ACTION_ID,
  name: 'First reminder call',
  isActive: true,
  ...overrides,
});

const work = (overrides: Partial<ActivityRow> = {}): ActivityRow => ({
  id: strategyActivityId({ caseId: CASE_ID, episodeNumber: 1 }, ACTION_ID),
  subject: 'Reminder call',
  strategyActionId: ACTION_ID,
  origin: 'StrategyGenerated',
  stateCode: 0,
  createdOn: '2026-09-20T12:00:00Z',
  ownerName: 'Amina',
  ...overrides,
});

const row = (attributed: readonly ActivityRow[] = []): ActionPlanRow => ({
  planned: planned() as ActionPlanRow['planned'],
  attributed,
  hasCompletedAttributed: attributed.some(activity => activity.status === 'Completed'),
});

// ── No deadline is invented ──────────────────────────────────────────────────

describe('a due date appears only where QDB has defined one', () => {
  it('states that the due date is not configured rather than showing one', () => {
    // The organisation configures a duration but no start point (KI-101). Defaulting to creation
    // here would make work overdue that nobody could have started.
    const item = toPlanItem(row([work()]), context());

    expect(item.due).toBe('Due date not configured');
    expect(item.due).not.toMatch(/2026|1970/);
  });

  it('never reports Overdue when no deadline could be determined', () => {
    const item = toPlanItem(row([work({ createdOn: '2020-01-01T00:00:00Z' })]), context());

    expect(item.state).not.toBe('Overdue');
    expect(item.state).not.toBe('Escalated');
  });

  it('computes a real date once a start policy is configured', () => {
    // Proves the absence above is configuration, not a missing capability.
    const item = toPlanItem(
      row([work()]),
      context({ tatStartPolicy: 'ActivityCreated' }),
    );
    const withHours = toPlanItem(
      { ...row([work()]), planned: planned({ escalationHours: 24 }) as ActionPlanRow['planned'] },
      context({ tatStartPolicy: 'ActivityCreated' }),
    );

    expect(item.due, 'a policy without a duration still determines nothing')
      .toBe('Due date not configured');
    expect(withHours.due).toBe('2026-09-21');
  });
});

// ── Work nobody has raised yet ───────────────────────────────────────────────

describe('a planned action nothing has answered', () => {
  it('is described as newly required, held by nobody', () => {
    const item = toPlanItem(row(), context());

    expect(item.applicability).toBe('Newly required');
    expect(item.owner).toBe('Nobody yet');
    expect(item.isCurrent).toBe(true);
  });

  it('names no activity, because none exists', () => {
    expect(toPlanItem(row(), context()).work).toBeUndefined();
  });
});

// ── History is history ───────────────────────────────────────────────────────

describe('unattributed history is described as unrecorded', () => {
  it('never calls an activity with no origin manual', () => {
    const item = toUnattributedItem(
      { id: 'act-1', subject: 'Old call' }, describeOriginLabel, iso => iso.slice(0, 10));

    expect(item.origin).toBe('Not recorded — predates provenance');
    expect(item.origin).not.toMatch(/officer/i);
  });

  it('reports a recorded origin as what it is', () => {
    const item = toUnattributedItem(
      { id: 'act-1', subject: 'Call', origin: 'Manual' },
      describeOriginLabel, iso => iso.slice(0, 10));

    expect(item.origin).toBe('Created by an officer');
  });
});

// ── A cured episode stops being current ──────────────────────────────────────

describe('a previous episode’s work leaves the current queue without being deleted', () => {
  it('keeps this episode’s work current', () => {
    expect(toPlanItem(row([work()]), context({ episodeNumber: 1 })).isCurrent).toBe(true);
  });

  it('drops work derived for an earlier episode', () => {
    // Same case, same action, episode 1 — read while the case is on episode 2.
    const item = toPlanItem(row([work()]), context({ episodeNumber: 2 }));

    expect(item.isCurrent).toBe(false);
    expect(item.action, 'it is still fully described, not blanked').toBe('First reminder call');
  });

  it('leaves work current when the case records no episode to compare against', () => {
    expect(toPlanItem(row([work()]), context()).isCurrent).toBe(true);
  });
});

// ── Settled work ─────────────────────────────────────────────────────────────

describe('the platform’s own state settles the row', () => {
  it('reports completed work as completed', () => {
    expect(toPlanItem(row([work({ stateCode: 1 })]), context()).state).toBe('Completed');
  });

  it('reports cancelled work as cancelled', () => {
    expect(toPlanItem(row([work({ stateCode: 2 })]), context()).state).toBe('Cancelled');
  });

  it('never reports work as no longer required, which this screen cannot establish', () => {
    for (const stateCode of [0, 1, 2]) {
      expect(toPlanItem(row([work({ stateCode })]), context()).applicability)
        .not.toBe('No longer required by the strategy');
    }
  });
});
