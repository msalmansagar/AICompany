// The four repaired rules on rule-visibility-demo, as they now stand in the published JSON.
// Publishing them is only half the story — this proves the runtime actually acts on them,
// so "the rule is in the form" and "the rule fires" are not confused for each other.

import { describe, it, expect } from 'vitest';
import type { BusinessRule } from '@qdb/shared';
import { ruleEngine } from './RuleEngine';

const TRIGGER = 'rvd_applicant_type';
const COMPANY_SECTION = '43b711c4-898a-f111-ab0f-000d3abcf32d';
const COMPANY_TAB = 'de426bc1-898a-f111-ab10-000d3abd8313';
const REASON_FIELD = '79afd41c-af8a-f111-ab10-000d3abd8313';
const FULL_NAME_FIELD = 'dc426bc1-898a-f111-ab10-000d3abd8313';

function rule(overrides: Partial<BusinessRule>): BusinessRule {
  return {
    id: overrides.id ?? 'rule',
    name: overrides.name ?? 'rule',
    conditions: overrides.conditions ?? [],
    conditionsLogic: 'AND',
    action: overrides.action!,
    priority: 100,
    isActive: true,
    ...overrides,
  } as BusinessRule;
}

function appliesWhenApplicantIs(value: string) {
  return [{ fieldId: TRIGGER, operator: 'equals' as const, value }];
}

const REPAIRED_RULES: BusinessRule[] = [
  rule({
    id: 'hide-company-details', name: 'Hide Company details when the applicant is an individual',
    conditions: appliesWhenApplicantIs('individual'),
    action: 'hideSection', targetSectionId: COMPANY_SECTION,
  }),
  rule({
    id: 'hide-company-tab', name: 'Hide Company documents tab when the applicant is an individual',
    conditions: appliesWhenApplicantIs('individual'),
    action: 'hideTab', targetTabId: COMPANY_TAB,
  }),
  rule({
    id: 'show-reason', name: 'Show the reason field when the applicant is an individual',
    conditions: appliesWhenApplicantIs('individual'),
    action: 'showField', targetFieldId: REASON_FIELD,
  }),
  rule({
    id: 'hide-full-name', name: 'Hide Full name when the applicant is a company',
    conditions: appliesWhenApplicantIs('company'),
    action: 'hideField', targetFieldId: FULL_NAME_FIELD,
  }),
];

async function evaluateFor(applicantType: string) {
  return ruleEngine.evaluate(REPAIRED_RULES, { [TRIGGER]: applicantType });
}

describe('rule-visibility-demo — the four repaired rules', () => {
  it('should_hide_the_company_details_section_for_an_individual', async () => {
    const result = await evaluateFor('individual');
    expect(result.sectionVisibility[COMPANY_SECTION]).toBe(false);
  });

  it('should_hide_the_company_documents_tab_for_an_individual', async () => {
    const result = await evaluateFor('individual');
    expect(result.tabVisibility[COMPANY_TAB]).toBe(false);
  });

  it('should_show_the_reason_field_for_an_individual', async () => {
    const result = await evaluateFor('individual');
    expect(result.fieldVisibility[REASON_FIELD]).toBe(true);
  });

  it('should_hide_the_full_name_field_for_a_company', async () => {
    const result = await evaluateFor('company');
    expect(result.fieldVisibility[FULL_NAME_FIELD]).toBe(false);
  });

  it('should_leave_the_company_section_alone_for_a_company', async () => {
    const result = await evaluateFor('company');
    expect(result.sectionVisibility[COMPANY_SECTION]).toBeUndefined();
  });

  it('should_leave_the_full_name_field_alone_for_an_individual', async () => {
    const result = await evaluateFor('individual');
    expect(result.fieldVisibility[FULL_NAME_FIELD]).toBeUndefined();
  });
});
