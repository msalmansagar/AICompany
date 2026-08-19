import { describe, it, expect } from 'vitest';
import { findRouteDraftErrors, canSaveRouteDraft, errorFor } from './routeDraftValidation';
import type { RouteDraft } from './routeDraftValidation';
import { EMPTY_FILTER } from './routeFilter';

const REAL_CONDITION =
  '<fetch><entity name="qdb_task"><filter type="and">' +
  '<condition attribute="qdb_approvedamount" operator="gt" value="500000"/>' +
  '</filter></entity></fetch>';

function draft(overrides: Partial<RouteDraft> = {}): RouteDraft {
  return {
    name: 'CEO Approval',
    sequenceNumber: 1,
    nextStepId: 'step_5',
    isDefault: false,
    filter: REAL_CONDITION,
    ...overrides,
  };
}

const fields = (d: RouteDraft) => findRouteDraftErrors(d).map((e) => e.field);

describe('findRouteDraftErrors', () => {
  it('should_find_nothing_wrong_with_a_complete_conditional_route', () => {
    expect(findRouteDraftErrors(draft())).toEqual([]);
  });

  it('should_find_nothing_wrong_with_a_fallback_route_carrying_no_condition', () => {
    expect(findRouteDraftErrors(draft({ isDefault: true, filter: EMPTY_FILTER }))).toEqual([]);
  });

  it('should_require_a_name', () => {
    expect(fields(draft({ name: '' }))).toContain('name');
    expect(fields(draft({ name: '   ' }))).toContain('name');
  });

  // The save path cannot write a route with no target.
  it('should_require_a_next_step', () => {
    expect(fields(draft({ nextStepId: null }))).toContain('nextStepId');
  });

  // The engine: "Please add any condition in filter".
  it('should_require_a_condition_on_a_route_that_is_not_the_fallback', () => {
    expect(fields(draft({ filter: '' }))).toContain('condition');
  });

  it('should_not_accept_the_empty_fragment_as_a_condition', () => {
    expect(fields(draft({ filter: EMPTY_FILTER }))).toContain('condition');
  });

  it('should_not_ask_a_fallback_route_for_a_condition', () => {
    expect(fields(draft({ isDefault: true, filter: '' }))).not.toContain('condition');
  });

  it('should_reject_a_sequence_below_one', () => {
    expect(fields(draft({ sequenceNumber: 0 }))).toContain('sequenceNumber');
    expect(fields(draft({ sequenceNumber: -3 }))).toContain('sequenceNumber');
  });

  it('should_reject_a_fractional_sequence', () => {
    expect(fields(draft({ sequenceNumber: 1.5 }))).toContain('sequenceNumber');
  });

  it('should_report_every_problem_at_once_rather_than_one_at_a_time', () => {
    const found = fields(draft({ name: '', nextStepId: null, filter: '' }));
    expect(found).toEqual(expect.arrayContaining(['name', 'nextStepId', 'condition']));
    expect(found).toHaveLength(3);
  });
});

describe('canSaveRouteDraft', () => {
  it('should_allow_saving_a_complete_route_once_the_builder_has_loaded', () => {
    expect(canSaveRouteDraft(draft(), true)).toBe(true);
  });

  // "The user must not be allowed to save the route until the Advanced Find Web
  // Resource has loaded successfully."
  it('should_refuse_while_the_condition_builder_is_still_loading', () => {
    expect(canSaveRouteDraft(draft(), false)).toBe(false);
  });

  it('should_refuse_a_complete_looking_route_that_is_missing_a_target', () => {
    expect(canSaveRouteDraft(draft({ nextStepId: null }), true)).toBe(false);
  });
});

describe('errorFor', () => {
  it('should_return_the_message_belonging_to_a_field', () => {
    const errors = findRouteDraftErrors(draft({ name: '' }));
    expect(errorFor(errors, 'name')).toContain('name');
  });

  it('should_return_null_for_a_field_with_no_problem', () => {
    const errors = findRouteDraftErrors(draft({ name: '' }));
    expect(errorFor(errors, 'nextStepId')).toBeNull();
  });
});
