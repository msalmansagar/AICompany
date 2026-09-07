// A maker changed a live rule to `contains` / "Salman" in the designer and it did nothing.
// The rule saved and published correctly — the condition reached the runtime intact — so the
// failure was in evaluation.
//
// json-rules-engine registers its built-in `contains` with Array.isArray as the fact
// validator. Form values are overwhelmingly STRINGS — a text box, or a lookup's display name
// — so the condition could never be satisfied, and it failed silently: no error, the rule
// simply never fired. Substring matching now goes through operators registered here.

import { describe, it, expect } from 'vitest';
import type { BusinessRule } from '@qdb/shared';
import { RuleEngine } from './RuleEngine';

const engine = new RuleEngine();
const TAB_ID = 'tab-delivery';

function hideTabWhen(operator: string, value: string): BusinessRule {
  return {
    id: 'rule-1',
    name: 'Hide Delivery Details',
    conditions: [{ fieldId: 'qdb_supplier', operator, value }],
    conditionsLogic: 'AND',
    action: 'hideTab',
    targetTabId: TAB_ID,
    priority: 1,
    isActive: true,
  } as BusinessRule;
}

const LOOKUP = { id: '11111111-1111-1111-1111-111111111111', displayName: 'Mohammad Salman' };

describe('RuleEngine — contains on a string fact', () => {
  // The exact rule the maker configured.
  it('matchesASubstring_ofALookupDisplayName', async () => {
    const result = await engine.evaluate([hideTabWhen('contains', 'Salman')], { qdb_supplier: LOOKUP });

    expect(result.tabVisibility[TAB_ID]).toBe(false);
  });

  it('matchesASubstring_ofAPlainTextField', async () => {
    const result = await engine.evaluate(
      [hideTabWhen('contains', 'Bank')], { qdb_supplier: 'Qatar National Bank' },
    );

    expect(result.tabVisibility[TAB_ID]).toBe(false);
  });

  it('doesNotMatch_whenTheSubstringIsAbsent', async () => {
    const result = await engine.evaluate(
      [hideTabWhen('contains', 'Kuwait')], { qdb_supplier: 'Qatar National Bank' },
    );

    expect(result.tabVisibility[TAB_ID]).toBeUndefined();
  });

  // Consistent with equals and every other operator here.
  it('isCaseSensitive', async () => {
    const result = await engine.evaluate(
      [hideTabWhen('contains', 'salman')], { qdb_supplier: LOOKUP },
    );

    expect(result.tabVisibility[TAB_ID]).toBeUndefined();
  });

  // The array behaviour json-rules-engine provided must not be lost.
  it('stillMatchesAMemberOfAnArrayValue', async () => {
    const result = await engine.evaluate(
      [hideTabWhen('contains', 'b')], { qdb_supplier: ['a', 'b'] },
    );

    expect(result.tabVisibility[TAB_ID]).toBe(false);
  });

  it('doesNotMatchAnEmptyValue', async () => {
    const result = await engine.evaluate([hideTabWhen('contains', 'Salman')], { qdb_supplier: null });

    expect(result.tabVisibility[TAB_ID]).toBeUndefined();
  });
});

describe('RuleEngine — notContains', () => {
  it('isFalse_whenTheSubstringIsPresent', async () => {
    const result = await engine.evaluate(
      [hideTabWhen('notContains', 'Salman')], { qdb_supplier: LOOKUP },
    );

    expect(result.tabVisibility[TAB_ID]).toBeUndefined();
  });

  it('isTrue_whenTheSubstringIsAbsent', async () => {
    const result = await engine.evaluate(
      [hideTabWhen('notContains', 'Kuwait')], { qdb_supplier: 'Qatar National Bank' },
    );

    expect(result.tabVisibility[TAB_ID]).toBe(false);
  });

  // A lookup is matched on BOTH its id and its display name. For a negative operator both
  // halves must miss — pairing it with `any` would make every notContains condition true.
  it('isFalse_whenOnlyTheDisplayNameContainsIt', async () => {
    const result = await engine.evaluate(
      [hideTabWhen('notContains', 'Mohammad')], { qdb_supplier: LOOKUP },
    );

    expect(result.tabVisibility[TAB_ID]).toBeUndefined();
  });
});
