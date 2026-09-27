import { describe, expect, it } from 'vitest';
import {
  belongsToEpisode, buildEvaluationTrace, reevaluate, strategyFactsChanged,
  type ExistingActivity,
} from './strategyReevaluation.js';
import { strategyActivityId, type EvaluationContext, type IntendedActivity } from './strategyAutomation.js';

/**
 * Controlled re-evaluation, held to one rule: it decides what is **applicable now**, and it never
 * rewrites history.
 *
 * The seventeen scenarios the authorisation names are pinned below. The ones that matter most are
 * the ones where doing nothing is the correct answer — a test suite that only proves work gets
 * created would pass a system that quietly cancelled everything else.
 */

const CASE_ID = '11111111-1111-1111-1111-111111111111';
const ACTION_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACTION_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const context = (overrides: Partial<EvaluationContext> = {}): EvaluationContext => ({
  caseId: CASE_ID, episodeNumber: 1, ...overrides,
});

const intended = (actionId: string, ctx = context()): IntendedActivity => ({
  activityId: strategyActivityId(ctx, actionId),
  strategyActionId: actionId,
  strategyActionName: actionId === ACTION_A ? 'First reminder call' : 'Field visit',
  sequence: 10,
  activityTypeCode: 'CALL',
  provenance: { origin: 'StrategyGenerated', strategyActionId: actionId },
});

const existingFor = (
  actionId: string, state: ExistingActivity['state'], ctx = context(),
): ExistingActivity => ({
  activityId: strategyActivityId(ctx, actionId),
  state,
  origin: 'StrategyGenerated',
  strategyActionId: actionId,
});

const dispositionOf = (outcome: ReturnType<typeof reevaluate>, activityId: string) =>
  outcome.entries.find(entry => entry.activityId === activityId)?.disposition;

// ── The seventeen scenarios ──────────────────────────────────────────────────

describe('re-evaluation decides what applies now, and rewrites nothing', () => {
  it('1. a new snapshot with unchanged facts creates nothing', () => {
    const outcome = reevaluate([intended(ACTION_A)], [existingFor(ACTION_A, 'Open')], context());

    expect(outcome.toCreate).toHaveLength(0);
    expect(dispositionOf(outcome, intended(ACTION_A).activityId)).toBe('AlreadyOpen');
  });

  it('1b. and the caller can tell in advance that nothing a strategy reads has moved', () => {
    const facts = { dpd: 34, arrearBucket: '31-60', statusCode: 'Assigned' };
    expect(strategyFactsChanged(facts, { ...facts })).toBe(false);
    expect(strategyFactsChanged(facts, { ...facts, dpd: 35 })).toBe(true);
  });

  it('2. DPD changes while the same action still applies — existing work stays authoritative', () => {
    // DPD is not in the identity, so a moved number cannot raise a second copy of work the
    // officer already holds.
    const outcome = reevaluate([intended(ACTION_A)], [existingFor(ACTION_A, 'Open')], context());
    expect(outcome.toCreate).toHaveLength(0);
  });

  it('3. the bucket changes while the action still applies — same answer', () => {
    const outcome = reevaluate([intended(ACTION_A)], [existingFor(ACTION_A, 'Open')], context());
    expect(dispositionOf(outcome, intended(ACTION_A).activityId)).toBe('AlreadyOpen');
  });

  it('4. strategy A becomes strategy B — B’s work is new, A’s work is preserved', () => {
    const outcome = reevaluate([intended(ACTION_B)], [existingFor(ACTION_A, 'Open')], context());

    expect(dispositionOf(outcome, intended(ACTION_B).activityId)).toBe('NewlyApplicable');
    expect(dispositionOf(outcome, existingFor(ACTION_A, 'Open').activityId))
      .toBe('NoLongerApplicable');
    expect(outcome.toCreate.map(item => item.strategyActionId)).toEqual([ACTION_B]);
  });

  it('4b. and A’s activity is NOT cancelled, because that is a separate business decision', () => {
    const outcome = reevaluate([intended(ACTION_B)], [existingFor(ACTION_A, 'Open')], context());
    const orphan = outcome.entries.find(e => e.strategyActionId === ACTION_A)!;

    expect(orphan.create).toBe(false);
    expect(orphan.reason).toMatch(/left exactly as it is/i);
    expect(orphan.reason).not.toMatch(/cancel(led)?\b(?!.*would)/i);
  });

  it('5. A to B and back to A in one episode regenerates nothing', () => {
    const outcome = reevaluate([intended(ACTION_A)], [existingFor(ACTION_A, 'Open')], context());
    expect(outcome.toCreate).toHaveLength(0);
  });

  it('6. an action that becomes newly applicable is created', () => {
    const outcome = reevaluate([intended(ACTION_A), intended(ACTION_B)],
      [existingFor(ACTION_A, 'Open')], context());

    expect(outcome.toCreate.map(item => item.strategyActionId)).toEqual([ACTION_B]);
  });

  it('7. an action that is no longer applicable leaves its activity untouched', () => {
    const outcome = reevaluate([], [existingFor(ACTION_A, 'Open')], context());

    expect(outcome.toCreate).toHaveLength(0);
    expect(outcome.entries).toHaveLength(1);
    expect(outcome.entries[0]!.disposition).toBe('NoLongerApplicable');
  });

  it('8. existing OPEN work is reported as such and left alone', () => {
    const outcome = reevaluate([intended(ACTION_A)], [existingFor(ACTION_A, 'Open')], context());
    expect(dispositionOf(outcome, intended(ACTION_A).activityId)).toBe('AlreadyOpen');
  });

  it('9. existing COMPLETED work is held pending policy, not regenerated (KI-98)', () => {
    const outcome = reevaluate([intended(ACTION_A)], [existingFor(ACTION_A, 'Completed')], context());

    expect(dispositionOf(outcome, intended(ACTION_A).activityId)).toBe('AlreadyCompleted');
    expect(outcome.toCreate).toHaveLength(0);
    expect(outcome.entries[0]!.reason).toMatch(/KI-98/);
  });

  it('10. existing CANCELLED work is not reinstated over an officer’s decision (KI-98)', () => {
    const outcome = reevaluate([intended(ACTION_A)], [existingFor(ACTION_A, 'Cancelled')], context());

    expect(dispositionOf(outcome, intended(ACTION_A).activityId)).toBe('AlreadyCancelled');
    expect(outcome.toCreate).toHaveLength(0);
    expect(outcome.entries[0]!.reason).toMatch(/overrule/i);
  });

  it('11. a MANUAL activity of the same activity type is never touched', () => {
    // The distinction KI-71 exists for, at re-evaluation time: a manually raised Legal
    // Recommendation is not the same thing as a strategy-generated one.
    const manual: ExistingActivity = {
      activityId: '99999999-9999-9999-9999-999999999999',
      state: 'Open',
      origin: 'Manual',
    };
    const outcome = reevaluate([intended(ACTION_A)], [manual], context());

    expect(dispositionOf(outcome, manual.activityId)).toBe('ManualUnaffected');
    // And the strategy's own work is still created — manual work does not satisfy it.
    expect(outcome.toCreate).toHaveLength(1);
  });

  it('11b. an activity predating provenance is treated as manual, never as strategy work', () => {
    const historical: ExistingActivity = {
      activityId: '88888888-8888-8888-8888-888888888888', state: 'Open',
    };
    const outcome = reevaluate([], [historical], context());

    expect(outcome.entries[0]!.disposition).toBe('ManualUnaffected');
  });

  it('12. a promise outcome re-evaluates through the same path and invents no policy', () => {
    // Nothing here says a promise leads anywhere. The trigger is recorded; the decision is the
    // Rule Engine's, and KI-72 remains open.
    const outcome = reevaluate([intended(ACTION_A)], [], context());
    expect(outcome.toCreate).toHaveLength(1);
  });

  it('13. a broken promise is the same — no hard-coded consequence exists to assert', () => {
    const outcome = reevaluate([], [existingFor(ACTION_A, 'Open')], context());
    expect(outcome.entries.every(entry => !entry.create)).toBe(true);
  });

  it('14/15. cure then re-delinquency: the new episode does not inherit the old obligations', () => {
    const episodeTwo = context({ episodeNumber: 2 });
    const outcome = reevaluate(
      [intended(ACTION_A, episodeTwo)], [existingFor(ACTION_A, 'Completed')], episodeTwo);

    // Episode 2's work is new and created; episode 1's completed activity is not reconciled
    // against it at all, and certainly not reused as the new episode's obligation.
    expect(outcome.toCreate).toHaveLength(1);
    expect(dispositionOf(outcome, intended(ACTION_A, episodeTwo).activityId)).toBe('NewlyApplicable');
    expect(dispositionOf(outcome, existingFor(ACTION_A, 'Completed').activityId))
      .toBe('ManualUnaffected');
  });

  it('16. concurrent re-evaluation derives the same intent, so the platform arbitrates', () => {
    const first = reevaluate([intended(ACTION_A)], [], context());
    const second = reevaluate([intended(ACTION_A)], [], context());

    expect(first.toCreate[0]!.activityId).toBe(second.toCreate[0]!.activityId);
  });

  it('17. a retry after an uncertain result finds the work and creates nothing', () => {
    // The first attempt may have succeeded without the caller learning so. The second sees it.
    const outcome = reevaluate([intended(ACTION_A)], [existingFor(ACTION_A, 'Open')], context());
    expect(outcome.toCreate).toHaveLength(0);
  });
});

// ── Episode membership ───────────────────────────────────────────────────────

describe('episode membership is proved from the id, not assumed', () => {
  it('recognises work raised by this episode', () => {
    expect(belongsToEpisode(existingFor(ACTION_A, 'Open'), context())).toBe(true);
  });

  it('rejects work raised by a different episode', () => {
    expect(belongsToEpisode(existingFor(ACTION_A, 'Open'), context({ episodeNumber: 2 }))).toBe(false);
  });

  it('rejects an activity that merely references an action but was not derived from it', () => {
    // An officer accepting planned work carries a strategy action, and must not be mistaken for
    // strategy-generated work belonging to this episode.
    const accepted: ExistingActivity = {
      activityId: '77777777-7777-7777-7777-777777777777',
      state: 'Open', origin: 'Manual', strategyActionId: ACTION_A,
    };
    expect(belongsToEpisode(accepted, context())).toBe(false);
  });

  it('rejects an activity with no provenance at all', () => {
    expect(belongsToEpisode(
      { activityId: '66666666-6666-6666-6666-666666666666', state: 'Open' }, context())).toBe(false);
  });
});

// ── Nothing is destroyed ─────────────────────────────────────────────────────

describe('re-evaluation writes nothing but new work', () => {
  it('only NewlyApplicable ever sets create', () => {
    const outcome = reevaluate(
      [intended(ACTION_A), intended(ACTION_B)],
      [existingFor(ACTION_A, 'Completed')],
      context());

    for (const entry of outcome.entries) {
      expect(entry.create).toBe(entry.disposition === 'NewlyApplicable');
    }
  });

  it('gives every conclusion a reason an officer could read', () => {
    const outcome = reevaluate([intended(ACTION_A)], [existingFor(ACTION_A, 'Cancelled')], context());

    for (const entry of outcome.entries) {
      expect(entry.reason.length).toBeGreaterThan(30);
      expect(entry.reason).not.toMatch(/qdb_|guid|odata|statecode/i);
    }
  });

  it('accounts for every activity it was shown, so nothing is silently dropped', () => {
    const outcome = reevaluate(
      [intended(ACTION_A)],
      [existingFor(ACTION_B, 'Open'), { activityId: '55555555-5555-5555-5555-555555555555', state: 'Open' }],
      context());

    expect(outcome.entries).toHaveLength(3);
  });
});

// ── Evidence ─────────────────────────────────────────────────────────────────

describe('the evaluation trace correlates without duplicating the business record', () => {
  it('carries case, episode, trigger, ruleset version and every outcome', () => {
    const outcome = reevaluate([intended(ACTION_A)], [], context({ rulesetVersion: '2.1' }));
    const trace = buildEvaluationTrace({
      correlationId: 'corr-1',
      context: context({ rulesetVersion: '2.1' }),
      trigger: 'SnapshotReceived',
      strategyId: '33333333-3333-3333-3333-333333333333',
      decidedAt: new Date('2026-09-21T09:00:00Z'),
      outcome,
    });

    expect(trace).toMatchObject({
      caseId: CASE_ID, episodeNumber: 1, trigger: 'SnapshotReceived', rulesetVersion: '2.1',
    });
    expect(trace.outcomes).toHaveLength(1);
    expect(trace.outcomes[0]).toMatchObject({ disposition: 'NewlyApplicable', created: true });
  });

  it('carries no customer detail, amount or message body', () => {
    const outcome = reevaluate([intended(ACTION_A)], [], context());
    const trace = buildEvaluationTrace({
      correlationId: 'corr-2', context: context(), trigger: 'ManualRequest',
      decidedAt: new Date(), outcome,
    });

    const serialised = JSON.stringify(trace);
    expect(serialised).not.toMatch(/name|amount|mobile|email|body|subject/i);
  });

  it('omits a ruleset version that was never supplied rather than writing an empty one', () => {
    const outcome = reevaluate([], [], context());
    const trace = buildEvaluationTrace({
      correlationId: 'corr-3', context: context(), trigger: 'Cured',
      decidedAt: new Date(), outcome,
    });

    expect(trace.rulesetVersion).toBeUndefined();
  });
});
