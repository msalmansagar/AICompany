import { describe, expect, it } from 'vitest';
import {
  StrategyConfigurationError,
  isEffective,
  isUsable,
  orderedActions,
  resolveApplicableStrategy,
  type CollectionStrategy,
  type StrategyAction,
} from './strategy.js';

const asOf = '2026-07-01T00:00:00.000Z';

function action(overrides: Partial<StrategyAction> = {}): StrategyAction {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Action', sequence: 1, dayOffset: 0, triggerEvent: 'DayOffset',
    requiresApproval: false, isMandatory: false, stopOnPayment: false, stopOnPtp: false,
    escalateIfNotCompleted: false, isActive: true, ...overrides,
  };
}

function strategy(overrides: Partial<CollectionStrategy> = {}): CollectionStrategy {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    code: 'EARLY', name: 'Early Collection', priority: 10,
    criteria: {}, effective: {}, noAutomatedContact: false, isActive: true, actions: [],
    ...overrides,
  };
}

describe('effective periods', () => {
  it('treats an open-ended period as in force', () => {
    expect(isEffective({}, asOf)).toBe(true);
  });

  it('is not in force before it starts or after it ends', () => {
    expect(isEffective({ effectiveFrom: '2026-08-01' }, asOf)).toBe(false);
    expect(isEffective({ effectiveTo: '2026-06-01' }, asOf)).toBe(false);
  });

  it('is in force inside the window', () => {
    expect(isEffective({ effectiveFrom: '2026-06-01', effectiveTo: '2026-08-01' }, asOf)).toBe(true);
  });

  it('requires both active and effective to be usable', () => {
    expect(isUsable(strategy({ isActive: false }), asOf)).toBe(false);
    expect(isUsable(strategy({ effective: { effectiveTo: '2026-06-01' } }), asOf)).toBe(false);
    expect(isUsable(strategy(), asOf)).toBe(true);
  });
});

describe('resolving the applicable strategy', () => {
  it('returns the configuration the ruleset named', () => {
    const early = strategy();
    expect(resolveApplicableStrategy(['EARLY'], [early, strategy({ code: 'LATE' })], asOf)).toBe(early);
  });

  it('honours the ruleset order — the first code it offers wins', () => {
    const early = strategy();
    const late = strategy({ code: 'LATE', id: '33333333-3333-4333-8333-333333333333', priority: 1 });
    // LATE has the better priority, but the ruleset ranked EARLY first: the ruleset decides.
    expect(resolveApplicableStrategy(['EARLY', 'LATE'], [early, late], asOf).code).toBe('EARLY');
  });

  it('refuses when the ruleset applied no strategy', () => {
    expect(() => resolveApplicableStrategy([], [strategy()], asOf))
      .toThrow(expect.objectContaining({ kind: 'NoneApplicable' }) as never);
  });

  it('refuses when the named strategy is not configured', () => {
    expect(() => resolveApplicableStrategy(['GHOST'], [strategy()], asOf))
      .toThrow(expect.objectContaining({ kind: 'NotFound' }) as never);
  });

  it('refuses when the named strategy is inactive', () => {
    expect(() => resolveApplicableStrategy(['EARLY'], [strategy({ isActive: false })], asOf))
      .toThrow(expect.objectContaining({ kind: 'NotEffective' }) as never);
  });

  it('refuses when the named strategy is outside its effective period', () => {
    expect(() => resolveApplicableStrategy(['EARLY'], [strategy({ effective: { effectiveFrom: '2026-09-01' } })], asOf))
      .toThrow(expect.objectContaining({ kind: 'NotEffective' }) as never);
  });

  it('breaks a duplicate code by priority', () => {
    const winner = strategy({ priority: 1 });
    const loser = strategy({ id: '44444444-4444-4444-8444-444444444444', priority: 5 });
    expect(resolveApplicableStrategy(['EARLY'], [loser, winner], asOf)).toBe(winner);
  });

  it('refuses a tie rather than choosing — two treatments is not a decision', () => {
    const a = strategy({ priority: 1 });
    const b = strategy({ id: '55555555-5555-4555-8555-555555555555', priority: 1 });
    expect(() => resolveApplicableStrategy(['EARLY'], [a, b], asOf))
      .toThrow(expect.objectContaining({ kind: 'Conflict' }) as never);
  });

  it('names the conflict clearly enough to fix the configuration', () => {
    const a = strategy({ priority: 1 });
    const b = strategy({ id: '55555555-5555-4555-8555-555555555555', priority: 1 });
    expect(() => resolveApplicableStrategy(['EARLY'], [a, b], asOf))
      .toThrow(/'EARLY' matches 2 active configurations at priority 1/);
  });

  it('is a StrategyConfigurationError in every failing case', () => {
    expect(() => resolveApplicableStrategy([], [], asOf)).toThrow(StrategyConfigurationError);
  });
});

describe('strategy actions', () => {
  it('returns active actions in sequence order', () => {
    const s = strategy({
      actions: [
        action({ id: 'a1111111-1111-4111-8111-111111111111', name: 'Third', sequence: 30 }),
        action({ id: 'a2222222-2222-4222-8222-222222222222', name: 'First', sequence: 10 }),
        action({ id: 'a3333333-3333-4333-8333-333333333333', name: 'Second', sequence: 20 }),
      ],
    });
    expect(orderedActions(s).map(a => a.name)).toEqual(['First', 'Second', 'Third']);
  });

  it('omits deactivated actions', () => {
    const s = strategy({
      actions: [
        action({ id: 'a1111111-1111-4111-8111-111111111111', name: 'Live', sequence: 1 }),
        action({ id: 'a2222222-2222-4222-8222-222222222222', name: 'Retired', sequence: 2, isActive: false }),
      ],
    });
    expect(orderedActions(s).map(a => a.name)).toEqual(['Live']);
  });

  it('breaks an equal sequence by name, so the order is stable rather than arbitrary', () => {
    const s = strategy({
      actions: [
        action({ id: 'a1111111-1111-4111-8111-111111111111', name: 'Beta', sequence: 1 }),
        action({ id: 'a2222222-2222-4222-8222-222222222222', name: 'Alpha', sequence: 1 }),
      ],
    });
    expect(orderedActions(s).map(a => a.name)).toEqual(['Alpha', 'Beta']);
  });
});

describe('no thresholds in code', () => {
  it('carries criteria as data without interpreting them', () => {
    const s = strategy({ criteria: { dpdFrom: 1, dpdTo: 30, arrearsFrom: 0, exposureFrom: 0 } });
    // The criteria travel with the configuration for the ruleset to read; resolving a strategy never
    // consults them, which is why a case with no position at all still resolves.
    expect(resolveApplicableStrategy(['EARLY'], [s], asOf).criteria.dpdTo).toBe(30);
  });
});
