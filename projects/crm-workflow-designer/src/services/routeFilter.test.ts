import { describe, it, expect } from 'vitest';
import { EMPTY_FILTER, hasRealCondition } from './routeFilter';

/**
 * The bug this file exists to prevent, stated as a test.
 *
 * A route carrying no condition stores EMPTY_FILTER, not an empty string. Every check
 * of the form `filter.length > 0` or `!filter.trim()` therefore read it as "this route
 * has a condition" — which flipped the default flag off on save and made the engine
 * reject the whole save with "Please add any condition in filter".
 */
describe('EMPTY_FILTER', () => {
  it('should_be_a_non_empty_string_which_is_why_emptiness_checks_failed', () => {
    expect(EMPTY_FILTER.length).toBeGreaterThan(0);
    expect(EMPTY_FILTER.trim().length).toBeGreaterThan(0);
  });

  it('should_be_exactly_what_the_org_stores_for_a_route_with_no_condition', () => {
    expect(EMPTY_FILTER).toBe('<filter type="and"></filter>');
  });

  it('should_not_count_as_having_a_condition', () => {
    expect(hasRealCondition(EMPTY_FILTER)).toBe(false);
  });
});

describe('hasRealCondition', () => {
  it('should_be_false_for_nothing_at_all', () => {
    expect(hasRealCondition('')).toBe(false);
    expect(hasRealCondition(null)).toBe(false);
    expect(hasRealCondition(undefined)).toBe(false);
  });

  it('should_be_true_for_a_self_closing_condition', () => {
    expect(hasRealCondition('<filter type="and"><condition attribute="qdb_approvedamount" operator="gt" value="500000"/></filter>')).toBe(true);
  });

  it('should_be_true_for_a_condition_with_child_values', () => {
    expect(hasRealCondition('<filter type="and"><condition attribute="x" operator="in"><value>1</value></condition></filter>')).toBe(true);
  });

  it('should_be_true_inside_a_full_fetch_envelope_as_advanced_find_produces', () => {
    const fetchXml =
      '<fetch version="1.0"><entity name="qdb_task"><attribute name="activityid"/>' +
      '<filter type="and"><condition attribute="qdb_decision" operator="eq" value="{GUID}"/></filter>' +
      '</entity></fetch>';
    expect(hasRealCondition(fetchXml)).toBe(true);
  });

  it('should_not_be_fooled_by_an_attribute_whose_name_merely_starts_with_condition', () => {
    expect(hasRealCondition('<filter type="and"><conditionset foo="1"/></filter>')).toBe(false);
  });
});
