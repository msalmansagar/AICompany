import { describe, it, expect } from 'vitest';
import type { FormDefinition, FormFieldValues } from '@qdb/shared';
import { computeFormCompletion } from './formCompletion';

// Minimal form: one tab, one section, three fields.
//  - name  : required, visible
//  - email : required, visible
//  - notes : optional, visible (excluded from total)
function makeForm(): FormDefinition {
  return {
    tabs: [
      {
        id: 'tab-1',
        isVisible: true,
        sections: [
          {
            id: 'sec-1',
            isVisible: true,
            fields: [
              { id: 'f-name', schemaName: 'qdb_name', isVisible: true, isRequired: true },
              { id: 'f-email', schemaName: 'qdb_email', isVisible: true, isRequired: true },
              { id: 'f-notes', schemaName: 'qdb_notes', isVisible: true, isRequired: false },
            ],
          },
        ],
      },
    ],
  } as unknown as FormDefinition;
}

const emptyRuleState = {
  tabVisibility: {},
  sectionVisibility: {},
  fieldVisibility: {},
  fieldRequired: {},
};

describe('computeFormCompletion', () => {
  it('counts_only_required_visible_fields', () => {
    const values: FormFieldValues = { qdb_name: 'Ali', qdb_notes: 'ignored' };
    const result = computeFormCompletion(makeForm(), values, emptyRuleState);
    // 1 of 2 required filled — notes is optional, so excluded from total
    expect(result).toEqual({ percent: 50, filled: 1, total: 2 });
  });

  it('returns_100_when_all_required_filled', () => {
    const values: FormFieldValues = { qdb_name: 'Ali', qdb_email: 'a@b.com' };
    expect(computeFormCompletion(makeForm(), values, emptyRuleState).percent).toBe(100);
  });

  it('returns_0_when_no_required_filled', () => {
    expect(computeFormCompletion(makeForm(), {}, emptyRuleState)).toEqual({ percent: 0, filled: 0, total: 2 });
  });

  it('treats_empty_string_and_false_and_empty_array_as_unfilled', () => {
    const values: FormFieldValues = { qdb_name: '', qdb_email: false } as unknown as FormFieldValues;
    expect(computeFormCompletion(makeForm(), values, emptyRuleState).filled).toBe(0);
  });

  it('excludes_rule_hidden_required_fields_from_the_total', () => {
    const ruleState = { ...emptyRuleState, fieldVisibility: { 'f-email': false } };
    const result = computeFormCompletion(makeForm(), { qdb_name: 'Ali' }, ruleState);
    // email hidden by a rule → only name counts → 1/1 = 100%
    expect(result).toEqual({ percent: 100, filled: 1, total: 1 });
  });

  it('returns_100_when_there_are_no_required_visible_fields', () => {
    const ruleState = { ...emptyRuleState, fieldRequired: { 'f-name': false, 'f-email': false } };
    expect(computeFormCompletion(makeForm(), {}, ruleState).percent).toBe(100);
  });
});
