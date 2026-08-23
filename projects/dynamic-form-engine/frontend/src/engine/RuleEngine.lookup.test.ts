// A lookup cell stores { id, displayName }. buildFacts passed that object through untouched
// and convertCondition compared it with `equal` against the maker's string, so an `equals`
// condition on a lookup could never match — no lookup could drive a rule of any kind.
//
// Both halves are now facts and a condition tries each, because a maker may reasonably have
// configured either the record id or the name they see on screen.

import { describe, it, expect } from 'vitest';
import type { BusinessRule } from '@qdb/shared';
import { RuleEngine } from './RuleEngine';

const engine = new RuleEngine();

const LOOKUP_ID = '11111111-1111-1111-1111-111111111111';
const TAB_ID = 'tab-documents';

function hideTabWhen(operator: string, value: string | null): BusinessRule {
  return {
    id: 'rule-1',
    name: 'Hide documents tab',
    conditions: [{ fieldId: 'qdb_country', operator, value }],
    conditionsLogic: 'AND',
    action: 'hideTab',
    targetTabId: TAB_ID,
    priority: 1,
    isActive: true,
  } as BusinessRule;
}

const QATAR = { id: LOOKUP_ID, displayName: 'Qatar' };

describe('RuleEngine — lookup-driven conditions', () => {
  it('matchesALookup_byItsRecordId', async () => {
    const result = await engine.evaluate([hideTabWhen('equals', LOOKUP_ID)], { qdb_country: QATAR });

    expect(result.tabVisibility[TAB_ID]).toBe(false);
  });

  // A maker configuring from the designer sees the name, not the GUID.
  it('matchesALookup_byItsDisplayName', async () => {
    const result = await engine.evaluate([hideTabWhen('equals', 'Qatar')], { qdb_country: QATAR });

    expect(result.tabVisibility[TAB_ID]).toBe(false);
  });

  it('doesNotMatchALookup_whenNeitherHalfEquals', async () => {
    const result = await engine.evaluate([hideTabWhen('equals', 'Bahrain')], { qdb_country: QATAR });

    expect(result.tabVisibility[TAB_ID]).toBeUndefined();
  });

  // The two halves are never both equal to the same string, so pairing a negative operator
  // with `any` would make every notEquals condition on any field true.
  it('notEquals_isFalse_whenEitherHalfMatches', async () => {
    const byName = await engine.evaluate([hideTabWhen('notEquals', 'Qatar')], { qdb_country: QATAR });
    const byId = await engine.evaluate([hideTabWhen('notEquals', LOOKUP_ID)], { qdb_country: QATAR });

    expect(byName.tabVisibility[TAB_ID]).toBeUndefined();
    expect(byId.tabVisibility[TAB_ID]).toBeUndefined();
  });

  it('notEquals_isTrue_whenNeitherHalfMatches', async () => {
    const result = await engine.evaluate([hideTabWhen('notEquals', 'Bahrain')], { qdb_country: QATAR });

    expect(result.tabVisibility[TAB_ID]).toBe(false);
  });

  it('isNotEmpty_isTrue_whenTheLookupIsSet', async () => {
    const result = await engine.evaluate([hideTabWhen('isNotEmpty', null)], { qdb_country: QATAR });

    expect(result.tabVisibility[TAB_ID]).toBe(false);
  });

  it('isEmpty_isTrue_whenTheLookupIsCleared', async () => {
    const result = await engine.evaluate([hideTabWhen('isEmpty', null)], { qdb_country: null });

    expect(result.tabVisibility[TAB_ID]).toBe(false);
  });

  it('isEmpty_isFalse_whenTheLookupIsSet', async () => {
    const result = await engine.evaluate([hideTabWhen('isEmpty', null)], { qdb_country: QATAR });

    expect(result.tabVisibility[TAB_ID]).toBeUndefined();
  });

  // Every non-lookup field gets the paired fact too, so the pairing must be a no-op there.
  it('leavesPlainStringFieldsBehavingAsBefore', async () => {
    const matches = await engine.evaluate(
      [hideTabWhen('equals', 'individual')], { qdb_country: 'individual' },
    );
    const doesNot = await engine.evaluate(
      [hideTabWhen('equals', 'individual')], { qdb_country: 'company' },
    );

    expect(matches.tabVisibility[TAB_ID]).toBe(false);
    expect(doesNot.tabVisibility[TAB_ID]).toBeUndefined();
  });

  it('leavesPlainNotEqualsBehavingAsBefore', async () => {
    const result = await engine.evaluate(
      [hideTabWhen('notEquals', 'individual')], { qdb_country: 'individual' },
    );

    expect(result.tabVisibility[TAB_ID]).toBeUndefined();
  });

  // A multi-select stores an array, which is an object but not a lookup.
  it('doesNotTreatAnArrayAsALookup', async () => {
    const result = await engine.evaluate(
      [hideTabWhen('equals', 'a')], { qdb_country: ['a', 'b'] },
    );

    expect(result.tabVisibility[TAB_ID]).toBeUndefined();
  });
});
