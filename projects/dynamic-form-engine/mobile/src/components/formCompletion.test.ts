import type { FormDefinition } from '@qdb/shared';
import { computeMobileCompletion } from './formCompletion';

// One tab, one section, three fields (name/email required, notes optional).
function makeForm(): FormDefinition {
  return {
    tabs: [
      {
        sections: [
          {
            fields: [
              { fieldKey: 'name', isVisibleDefault: true, isRequiredDefault: true },
              { fieldKey: 'email', isVisibleDefault: true, isRequiredDefault: true },
              { fieldKey: 'notes', isVisibleDefault: true, isRequiredDefault: false },
            ],
          },
        ],
      },
    ],
  } as unknown as FormDefinition;
}

const emptyRuleState = { visibilityMap: new Map<string, boolean>(), requiredMap: new Map<string, boolean>() };

describe('computeMobileCompletion', () => {
  it('counts_only_required_visible_fields', () => {
    const result = computeMobileCompletion(makeForm(), { name: 'Ali', notes: 'x' }, emptyRuleState);
    expect(result).toEqual({ percent: 50, filled: 1, total: 2 });
  });

  it('returns_100_when_all_required_filled', () => {
    expect(computeMobileCompletion(makeForm(), { name: 'Ali', email: 'a@b.com' }, emptyRuleState).percent).toBe(100);
  });

  it('returns_0_when_no_required_filled', () => {
    expect(computeMobileCompletion(makeForm(), {}, emptyRuleState)).toEqual({ percent: 0, filled: 0, total: 2 });
  });

  it('excludes_rule_hidden_required_fields', () => {
    const ruleState = { visibilityMap: new Map([['email', false]]), requiredMap: new Map<string, boolean>() };
    const result = computeMobileCompletion(makeForm(), { name: 'Ali' }, ruleState);
    expect(result).toEqual({ percent: 100, filled: 1, total: 1 });
  });
});
