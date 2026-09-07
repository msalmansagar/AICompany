// A rule whose operator the engine does not recognise used to throw out of evaluate() while
// the rules were still being registered — before any of them ran. One bad rule therefore
// disabled EVERY rule on the form, not just itself, and the form silently lost all of its
// conditional behaviour. Rules that cannot be built are now skipped and logged individually.

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { BusinessRule, ScopedButton } from '@qdb/shared';
import { RuleEngine } from './RuleEngine';
import { logger } from '../utils/logger';

const HEALTHY_TAB = 'tab-healthy';
const MALFORMED_TAB = 'tab-malformed';
const SUPPLIER = { id: '2f03db3a-2da1-f111-b8dc-000d3abcf32d', displayName: 'Mohammad Salman' };

function hideTab(id: string, targetTabId: string, operator: string): BusinessRule {
  return {
    id, name: `rule ${id}`,
    conditions: [{ fieldId: 'qdb_supplier', operator, value: 'Mohammad Salman' }],
    conditionsLogic: 'AND', action: 'hideTab', targetTabId, priority: 1, isActive: true,
  } as BusinessRule;
}

const healthyRule = hideTab('r-healthy', HEALTHY_TAB, 'equals');
// "equal" instead of "equals" — the spelling a maker reaches for first.
const malformedRule = hideTab('r-malformed', MALFORMED_TAB, 'equal');

afterEach(() => vi.restoreAllMocks());

describe('RuleEngine — a rule that cannot be built', () => {
  it('doesNotRejectTheWholeEvaluation', async () => {
    await expect(
      new RuleEngine().evaluate([malformedRule], { qdb_supplier: SUPPLIER }),
    ).resolves.toBeDefined();
  });

  it('leavesTheOtherRulesOnTheFormWorking', async () => {
    const result = await new RuleEngine().evaluate(
      [healthyRule, malformedRule], { qdb_supplier: SUPPLIER },
    );

    expect(result.tabVisibility[HEALTHY_TAB]).toBe(false);
  });

  // Order must not matter — the malformed rule is registered first here.
  it('leavesTheOtherRulesWorking_whenTheBadRuleComesFirst', async () => {
    const result = await new RuleEngine().evaluate(
      [malformedRule, healthyRule], { qdb_supplier: SUPPLIER },
    );

    expect(result.tabVisibility[HEALTHY_TAB]).toBe(false);
  });

  it('appliesNoEffectOfItsOwn', async () => {
    const result = await new RuleEngine().evaluate(
      [healthyRule, malformedRule], { qdb_supplier: SUPPLIER },
    );

    expect(result.tabVisibility[MALFORMED_TAB]).toBeUndefined();
  });

  // Skipping silently would trade one invisible failure for another.
  it('logsTheSkipWithTheRuleIdentityAndTheReason', async () => {
    const logged = vi.spyOn(logger, 'error').mockImplementation(() => {});

    await new RuleEngine().evaluate([malformedRule], { qdb_supplier: SUPPLIER });

    expect(logged).toHaveBeenCalledWith(
      'rule_skipped',
      expect.objectContaining({ ruleId: 'r-malformed', reason: expect.stringContaining('equal') }),
    );
  });
});

// Skipping rules can leave the engine with none registered. It is still run in that state,
// so it must tolerate it rather than throwing a second, less obvious failure.
describe('RuleEngine — when every rule is skipped', () => {
  it('returnsAnEmptyResultRatherThanThrowing', async () => {
    const result = await new RuleEngine().evaluate(
      [malformedRule, hideTab('r-malformed-2', 'tab-other', 'nonsense')],
      { qdb_supplier: SUPPLIER },
    );

    expect(result.tabVisibility).toEqual({});
  });
});

describe('RuleEngine — a scoped button whose condition cannot be built', () => {
  const goodButton = {
    id: 'btn-good', visibleWhen: { logic: 'AND', conditions: [{ fieldId: 'qdb_supplier', operator: 'equals', value: 'Mohammad Salman' }] },
  } as unknown as ScopedButton;
  const badButton = {
    id: 'btn-bad', visibleWhen: { logic: 'AND', conditions: [{ fieldId: 'qdb_supplier', operator: 'equal', value: 'Mohammad Salman' }] },
  } as unknown as ScopedButton;

  it('doesNotStopTheOtherButtonsBeingEvaluated', async () => {
    const result = await new RuleEngine().evaluateButtons(
      [goodButton, badButton], { qdb_supplier: SUPPLIER },
    );

    expect(result.buttonVisibility['btn-good']).toBe(true);
  });

  // A button gated by a rule that cannot be built must not silently become visible.
  it('toleratesEveryButtonRuleBeingSkipped', async () => {
    const result = await new RuleEngine().evaluateButtons([badButton], { qdb_supplier: SUPPLIER });

    expect(result.buttonVisibility['btn-bad']).toBe(false);
  });

  it('leavesTheUnbuildableButtonHidden', async () => {
    const result = await new RuleEngine().evaluateButtons(
      [goodButton, badButton], { qdb_supplier: SUPPLIER },
    );

    expect(result.buttonVisibility['btn-bad']).toBe(false);
  });
});
