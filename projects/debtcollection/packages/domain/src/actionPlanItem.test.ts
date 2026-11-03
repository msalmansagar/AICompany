import { describe, expect, it } from 'vitest';
import {
  DUE_NOT_CONFIGURED, NOT_ASSIGNED, ORIGIN_NOT_RECORDED, describeDue, describeOriginLabel,
  satisfiesPlannedAction, toActionPlanItem, type ActionPlanInput,
} from './actionPlanItem.js';
import type { TatDeadline } from './tatEscalation.js';

/**
 * The Action Plan in an officer's words.
 *
 * The KI-71 regressions live here: a manual activity of a matching type must not answer a planned
 * action, and unattributed history must not be called manual. Both are asserted directly rather
 * than through a rendered screen, so the rule holds wherever the composition is used.
 */

const NOW = new Date('2026-09-21T12:00:00Z');
const ACTION_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACTION_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const undetermined: TatDeadline = { determined: false, reason: 'No turn-around time is configured.' };
const determined = (dueAt: string): TatDeadline =>
  ({ determined: true, startedAt: '2026-09-20T12:00:00Z', dueAt, basis: 'ContinuousElapsed' });

const input = (overrides: Partial<ActionPlanInput> = {}): ActionPlanInput => ({
  key: 'k1',
  actionName: 'First reminder call',
  lifecycle: 'Open',
  disposition: 'AlreadyOpen',
  assignment: 'Assigned',
  deadline: undetermined,
  escalated: false,
  episodeIsCurrent: true,
  now: NOW,
  formatDate: (iso: string) => iso.slice(0, 10),
  ...overrides,
});

// ── The KI-71 regressions ────────────────────────────────────────────────────

describe('a manual activity does not answer a planned action', () => {
  it('refuses an activity that names no strategy action', () => {
    // Phase 6 correlated by Activity Type, which made a manually raised Legal Recommendation
    // indistinguishable from one the strategy asked for. Only provenance answers this.
    expect(satisfiesPlannedAction({ origin: 'Manual' }, ACTION_A)).toBe(false);
  });

  it('refuses an activity that names a DIFFERENT strategy action', () => {
    expect(satisfiesPlannedAction({ strategyActionId: ACTION_B }, ACTION_A)).toBe(false);
  });

  it('accepts only an activity that names this action', () => {
    expect(satisfiesPlannedAction({ strategyActionId: ACTION_A }, ACTION_A)).toBe(true);
  });

  it('matches regardless of the case Dataverse returns the id in', () => {
    expect(satisfiesPlannedAction({ strategyActionId: ACTION_A.toUpperCase() }, ACTION_A)).toBe(true);
  });

  it('accepts a MANUAL activity that names the action — an officer accepting planned work', () => {
    expect(satisfiesPlannedAction({ strategyActionId: ACTION_A, origin: 'Manual' }, ACTION_A))
      .toBe(true);
  });
});

describe('unattributed history is never called manual', () => {
  it('describes an absent origin as not recorded', () => {
    expect(describeOriginLabel(undefined)).toBe(ORIGIN_NOT_RECORDED);
    expect(describeOriginLabel(undefined)).not.toMatch(/officer/i);
  });

  it('describes the two recorded origins distinctly', () => {
    expect(describeOriginLabel('Manual')).toBe('Created by an officer');
    expect(describeOriginLabel('StrategyGenerated')).toBe('Created by the collection strategy');
  });

  it('carries that through to a composed row', () => {
    expect(toActionPlanItem(input()).origin).toBe(ORIGIN_NOT_RECORDED);
  });
});

// ── Never inventing a deadline ───────────────────────────────────────────────

describe('an undetermined deadline is stated, not faked', () => {
  it('says the due date is not configured', () => {
    expect(describeDue(undetermined, iso => iso)).toBe(DUE_NOT_CONFIGURED);
  });

  it('is never blank, zero, or today', () => {
    const due = toActionPlanItem(input()).due;

    expect(due).not.toBe('');
    expect(due).not.toBe('—');
    expect(due).not.toMatch(/1970|2026-09-21/);
  });

  it('shows the real date when one could be determined', () => {
    expect(toActionPlanItem(input({ deadline: determined('2026-09-25T09:00:00Z') })).due)
      .toBe('2026-09-25');
  });

  it('keeps follow-up and due date apart', () => {
    // Phase 6's follow-up is not Phase 8's deadline, however often the dates coincide (KI-76).
    const item = toActionPlanItem(input({
      deadline: determined('2026-09-25T09:00:00Z'), followUpDate: '2026-09-30T00:00:00Z' }));

    expect(item.due).toBe('2026-09-25');
    expect(item.followUp).toBe('2026-09-30');
  });
});

// ── The clocks, carried through ──────────────────────────────────────────────

describe('unassigned work is not shown as an officer running late', () => {
  it('shows an assignment problem rather than Overdue', () => {
    const item = toActionPlanItem(input({
      assignment: 'TargetUnavailable', deadline: determined('2020-01-01T00:00:00Z') }));

    expect(item.state).toBe('Assignment requires attention');
    expect(item.state).not.toBe('Overdue');
  });

  it('shows nobody as the owner rather than an empty cell', () => {
    expect(toActionPlanItem(input({ assignment: 'ManualAssignmentRequired' })).owner)
      .toBe(NOT_ASSIGNED);
  });

  it('never explains the underlying security or configuration failure', () => {
    for (const assignment of ['TargetUnavailable', 'ConfigurationMissing',
      'AssignmentCapabilityUnavailable', 'PermanentFailure'] as const) {
      expect(toActionPlanItem(input({ assignment })).assignment)
        .toBe('Assignment requires attention');
    }
  });

  it('is Overdue only when somebody actually holds it', () => {
    expect(toActionPlanItem(input({
      assignment: 'Assigned', deadline: determined('2020-01-01T00:00:00Z') })).state)
      .toBe('Overdue');
  });
});

describe('overdue is not escalated', () => {
  it('shows Overdue when a deadline passed and nothing was escalated', () => {
    expect(toActionPlanItem(input({ deadline: determined('2020-01-01T00:00:00Z') })).state)
      .toBe('Overdue');
  });

  it('shows Escalated only when the platform says an escalation exists', () => {
    expect(toActionPlanItem(input({
      deadline: determined('2020-01-01T00:00:00Z'), escalated: true })).state)
      .toBe('Escalated');
  });
});

// ── Current vs historical ────────────────────────────────────────────────────

describe('history stays readable without being current', () => {
  it('drops a cured episode’s open work from current work', () => {
    const item = toActionPlanItem(input({ episodeIsCurrent: false }));

    expect(item.isCurrent).toBe(false);
    // ...but it is still a fully described row. Nothing was deleted or blanked to achieve this.
    expect(item.action).toBe('First reminder call');
  });

  it('keeps current-episode open work current', () => {
    expect(toActionPlanItem(input({ episodeIsCurrent: true })).isCurrent).toBe(true);
  });

  it('does not present no-longer-required work as newly required', () => {
    const item = toActionPlanItem(input({ disposition: 'NoLongerApplicable' }));

    expect(item.state).toBe('No longer required');
    expect(item.applicability).toBe('No longer required by the strategy');
    expect(item.isCurrent).toBe(false);
  });
});

describe('applicability is described without technical vocabulary', () => {
  it('describes settled strategy work without promising a repeat either way', () => {
    const completed = toActionPlanItem(input({
      lifecycle: 'Completed', disposition: 'AlreadyCompleted' }));

    expect(completed.applicability).toBe('Already done for this period of arrears');
    expect(completed.applicability).not.toMatch(/will|won't|again|regenerat/i);
  });

  it('never exposes the held-regeneration vocabulary or a KI number', () => {
    for (const disposition of ['AlreadyCompleted', 'AlreadyCancelled', 'NoLongerApplicable',
      'ManualUnaffected', 'NewlyApplicable', 'AlreadyOpen'] as const) {
      const item = toActionPlanItem(input({ disposition }));
      expect(item.applicability).not.toMatch(/regenerationheld|KI-\d+|disposition/i);
    }
  });
});

describe('no technical detail reaches the officer', () => {
  it('emits no identifier, logical name, status code or protocol text', () => {
    const item = toActionPlanItem(input({
      deadline: determined('2026-09-25T09:00:00Z'),
      origin: 'StrategyGenerated', ownerName: 'Amina', outcome: 'Promise captured',
      followUpDate: '2026-09-30T00:00:00Z',
    }));

    const rendered = [item.action, item.state, item.origin, item.assignment, item.owner,
      item.due, item.followUp, item.outcome, item.applicability].join(' | ');

    expect(rendered).not.toMatch(/qdb_|statuscode|statecode|odata|http|plugin|KI-\d+/i);
    expect(rendered).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
});
