import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_ORIGIN_CODES, ProvenanceError, assertProvenance, describeOrigin, isStrategyGenerated,
  planStrategyWork, regenerationDecision, strategyActivityId,
  type EvaluationContext,
} from './strategyAutomation.js';
import type { CollectionStrategy, StrategyAction } from './strategy.js';

/**
 * Strategy automation, held to the two rules KI-71 and ADR-DCP-20 established.
 *
 * Provenance is recorded rather than inferred, and identity is derived rather than minted. Each
 * test below names the failure it prevents, because a test whose purpose is not stated becomes a
 * test nobody dares delete and nobody trusts.
 */

const CASE_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_CASE = '22222222-2222-2222-2222-222222222222';
const ACTION_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACTION_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const context = (overrides: Partial<EvaluationContext> = {}): EvaluationContext => ({
  caseId: CASE_ID, episodeNumber: 1, ...overrides,
});

const action = (overrides: Partial<StrategyAction> = {}): StrategyAction => ({
  id: ACTION_A,
  name: 'First reminder call',
  sequence: 10,
  activityTypeCode: 'CALL',
  dayOffset: 3,
  triggerEvent: 'Day offset',
  requiresApproval: false,
  isMandatory: true,
  stopOnPayment: true,
  stopOnPtp: true,
  escalateIfNotCompleted: false,
  isActive: true,
  ...overrides,
});

const strategy = (actions: StrategyAction[]): CollectionStrategy => ({
  id: '33333333-3333-3333-3333-333333333333',
  code: 'HL-EARLY',
  name: 'Housing Loan — early arrears',
  priority: 10,
  criteria: {},
  effective: {},
  noAutomatedContact: false,
  isActive: true,
  actions,
});

// ── The invariant ────────────────────────────────────────────────────────────

describe('automated work must be able to say why it exists', () => {
  it('refuses a strategy-generated activity with no strategy action', () => {
    // Untraceable automated work on a customer's file is worse than no automation: there is
    // nothing for the officer it lands on, or an auditor, to appeal to.
    expect(() => assertProvenance({ origin: 'StrategyGenerated' }))
      .toThrow(ProvenanceError);
  });

  it('names the reason rather than failing generically', () => {
    try {
      assertProvenance({ origin: 'StrategyGenerated' });
      expect.unreachable('the invariant did not fire');
    } catch (error) {
      expect((error as ProvenanceError).kind).toBe('MissingStrategyAction');
    }
  });

  it('accepts strategy-generated work that names its action', () => {
    expect(() => assertProvenance({ origin: 'StrategyGenerated', strategyActionId: ACTION_A }))
      .not.toThrow();
  });

  it('allows a MANUAL activity to carry a strategy action, because accepting planned work is real', () => {
    // One-directional on purpose. An officer acting on the Action Plan produces manual work that
    // fulfils a planned action, and recording that is useful rather than contradictory.
    expect(() => assertProvenance({ origin: 'Manual', strategyActionId: ACTION_A })).not.toThrow();
  });

  it('leaves a historical activity with no provenance alone', () => {
    // Every Phase 6 and Phase 7 activity is this shape. Demanding a value nobody recorded would
    // make the guard unable to run against the organisation it has to protect.
    expect(() => assertProvenance({})).not.toThrow();
  });
});

describe('origin is never inferred from absence', () => {
  it('describes a missing origin as not recorded, never as manual', () => {
    expect(describeOrigin({})).toMatch(/not recorded/i);
    expect(describeOrigin({})).not.toMatch(/officer/i);
  });

  it('describes each recorded origin in an officer’s words', () => {
    expect(describeOrigin({ origin: 'Manual' })).toBe('Created by an officer');
    expect(describeOrigin({ origin: 'StrategyGenerated', strategyActionId: ACTION_A }))
      .toBe('Created by the collection strategy');
  });

  it('does not treat a lone strategy action as proof of automation', () => {
    // The distinction KI-71 exists to keep: a lookup alone cannot say who created the work.
    expect(isStrategyGenerated({ strategyActionId: ACTION_A })).toBe(false);
  });

  it('carries the option values that were provisioned, so the browser and the plugin agree', () => {
    expect(ACTIVITY_ORIGIN_CODES.Manual).toBe(100000800);
    expect(ACTIVITY_ORIGIN_CODES.StrategyGenerated).toBe(100000801);
  });
});

// ── Identity ─────────────────────────────────────────────────────────────────

describe('the same intent reaches the same id', () => {
  it('is stable across evaluations of unchanged facts', () => {
    expect(strategyActivityId(context(), ACTION_A)).toBe(strategyActivityId(context(), ACTION_A));
  });

  it('distinguishes two actions of the SAME activity type in one strategy', () => {
    // Precisely what Activity Type correlation could never do, and the reason KI-71 was raised.
    expect(strategyActivityId(context(), ACTION_A))
      .not.toBe(strategyActivityId(context(), ACTION_B));
  });

  it('gives a re-delinquent case new work, because a new episode is new work', () => {
    expect(strategyActivityId(context({ episodeNumber: 1 }), ACTION_A))
      .not.toBe(strategyActivityId(context({ episodeNumber: 2 }), ACTION_A));
  });

  it('separates the same action on two cases', () => {
    expect(strategyActivityId(context(), ACTION_A))
      .not.toBe(strategyActivityId(context({ caseId: OTHER_CASE }), ACTION_A));
  });

  it('is UNCHANGED when the ruleset is republished, because a version is not work', () => {
    // The defect this contract exists to prevent. Hashing the version would mean every
    // configuration publish mid-episode raised a second copy of every outstanding action, with
    // no business event behind it. See docs/Phase8_IdentityContract.md.
    expect(strategyActivityId(context({ rulesetVersion: '1.0' }), ACTION_A))
      .toBe(strategyActivityId(context({ rulesetVersion: '1.1' }), ACTION_A));
  });

  it('is unchanged when no ruleset version is supplied at all', () => {
    expect(strategyActivityId(context({ rulesetVersion: undefined }), ACTION_A))
      .toBe(strategyActivityId(context({ rulesetVersion: '2.7' }), ACTION_A));
  });

  it('is insensitive to the case of an id, because Dataverse is not consistent about it', () => {
    const upper = strategyActivityId(context({ caseId: CASE_ID.toUpperCase() }), ACTION_A.toUpperCase());
    expect(upper).toBe(strategyActivityId(context(), ACTION_A));
  });

  it('produces a well-formed uuid', () => {
    expect(strategyActivityId(context(), ACTION_A))
      .toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

// ── Planning ─────────────────────────────────────────────────────────────────

describe('planning the work a strategy intends', () => {
  it('returns one intended activity per actionable action, in configuration order', () => {
    const plan = planStrategyWork(
      strategy([action({ id: ACTION_B, sequence: 20 }), action({ id: ACTION_A, sequence: 10 })]),
      context(), new Date('2026-09-21T00:00:00Z'));

    expect(plan.map(item => item.strategyActionId)).toEqual([ACTION_A, ACTION_B]);
  });

  it('stamps every intended activity as strategy generated WITH its action', () => {
    const plan = planStrategyWork(strategy([action()]), context(), new Date('2026-09-21T00:00:00Z'));

    expect(plan[0]!.provenance).toEqual({ origin: 'StrategyGenerated', strategyActionId: ACTION_A });
    expect(() => assertProvenance(plan[0]!.provenance)).not.toThrow();
  });

  it('drops a retired action rather than generating work configuration switched off', () => {
    const plan = planStrategyWork(
      strategy([action({ isActive: false })]), context(), new Date('2026-09-21T00:00:00Z'));

    expect(plan).toHaveLength(0);
  });

  it('generates nothing for an action with no activity type', () => {
    // Such an action configures a communication or a downstream process, not officer work.
    // Inventing an activity would put an unexplainable item on the Action Plan.
    const plan = planStrategyWork(
      strategy([{ ...action(), activityTypeCode: undefined }]),
      context(), new Date('2026-09-21T00:00:00Z'));

    expect(plan).toHaveLength(0);
  });

  it('applies the configured day offset and invents no deadline of its own', () => {
    const plan = planStrategyWork(
      strategy([action({ dayOffset: 3 })]), context(), new Date('2026-09-21T00:00:00Z'));

    expect(plan[0]!.dueDate).toBe('2026-09-24T00:00:00.000Z');
  });

  it('honours a zero offset as today rather than treating it as unset', () => {
    const plan = planStrategyWork(
      strategy([action({ dayOffset: 0 })]), context(), new Date('2026-09-21T00:00:00Z'));

    expect(plan[0]!.dueDate).toBe('2026-09-21T00:00:00.000Z');
  });

  it('honours a negative offset, which a back-dated treatment plan legitimately uses', () => {
    const plan = planStrategyWork(
      strategy([action({ dayOffset: -2 })]), context(), new Date('2026-09-21T00:00:00Z'));

    expect(plan[0]!.dueDate).toBe('2026-09-19T00:00:00.000Z');
  });

  it('plans identical work twice, so a repeated evaluation creates nothing new', () => {
    const configured = strategy([action(), action({ id: ACTION_B, sequence: 20 })]);
    const first = planStrategyWork(configured, context(), new Date('2026-09-21T00:00:00Z'));
    const second = planStrategyWork(configured, context(), new Date('2026-09-22T00:00:00Z'));

    // The ids match even though the day moved: identity is about intent, not about when the
    // evaluation happened. The due dates legitimately differ.
    expect(second.map(item => item.activityId)).toEqual(first.map(item => item.activityId));
    expect(second[0]!.dueDate).not.toBe(first[0]!.dueDate);
  });
});

// ── The ten scenarios, as a contract ─────────────────────────────────────────

/**
 * `docs/Phase8_IdentityContract.md` analyses ten scenarios before freezing the identity. These pin
 * the conclusions, so a future change to `strategyActivityId` cannot quietly reopen one.
 */
describe('the Phase 8 idempotency contract', () => {
  const same = (a: string, b: string) => expect(a).toBe(b);
  const distinct = (a: string, b: string) => expect(a).not.toBe(b);

  it('1. same case, episode, action and ruleset — same intended activity', () => {
    same(strategyActivityId(context({ rulesetVersion: '1.0' }), ACTION_A),
      strategyActivityId(context({ rulesetVersion: '1.0' }), ACTION_A));
  });

  it('2. concurrent evaluation derives one id, so the platform can refuse the second create', () => {
    const workerA = strategyActivityId(context(), ACTION_A);
    const workerB = strategyActivityId(context(), ACTION_A);
    same(workerA, workerB);
  });

  it('3. a retry after an uncertain create targets the id that already exists', () => {
    same(strategyActivityId(context(), ACTION_A), strategyActivityId(context(), ACTION_A));
  });

  it('4. DPD or bucket moved but the action still applies — existing work stays authoritative', () => {
    // Neither DPD nor bucket is in the identity, so a number moving cannot raise a second copy of
    // work the officer already holds.
    same(strategyActivityId(context(), ACTION_A), strategyActivityId(context(), ACTION_A));
    expect(regenerationDecision('open').create).toBe(false);
  });

  it('5. republishing configuration does not duplicate semantically identical work', () => {
    same(strategyActivityId(context({ rulesetVersion: '3.4.1' }), ACTION_A),
      strategyActivityId(context({ rulesetVersion: '3.5.0' }), ACTION_A));
  });

  it('6. genuinely new work is represented by a NEW strategy action, which yields a new id', () => {
    // The contract: editing an action changes how it is described; it does not create a second
    // obligation on a case that already holds its work. A new obligation is a new action record.
    distinct(strategyActivityId(context(), ACTION_A), strategyActivityId(context(), ACTION_B));
  });

  it('7. a COMPLETED action is not silently regenerated in the same episode (KI-98)', () => {
    const decision = regenerationDecision('settled');
    expect(decision.create).toBe(false);
    expect(decision.reason).toMatch(/KI-98/);
  });

  it('8. a CANCELLED action is not reinstated over an officer\u2019s decision (KI-98)', () => {
    // Settled covers both. The reason says so, because "nothing happened" and "an officer
    // cancelled this and we do not overrule that" are different facts to whoever reads the plan.
    expect(regenerationDecision('settled').create).toBe(false);
  });

  it('9. strategy A to B, both holding the same activity type, stay distinct', () => {
    distinct(strategyActivityId(context(), ACTION_A), strategyActivityId(context(), ACTION_B));
  });

  it('10. A to B and back to A in one episode regenerates nothing', () => {
    const firstVisit = strategyActivityId(context(), ACTION_A);
    const afterReturning = strategyActivityId(context(), ACTION_A);
    same(firstVisit, afterReturning);
    expect(regenerationDecision('open').create).toBe(false);
  });

  it('creates when there is genuinely nothing there', () => {
    expect(regenerationDecision('none').create).toBe(true);
  });

  it('explains a refusal rather than returning a bare false', () => {
    expect(regenerationDecision('open').reason).toMatch(/already has open work/i);
  });
});
