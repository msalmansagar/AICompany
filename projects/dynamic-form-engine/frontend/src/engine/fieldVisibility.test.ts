// Is Hidden is the field's STARTING state, not a permanent one. A rule that targets the
// field decides instead, which is what makes "hidden by default, revealed by a rule" work.

import { describe, it, expect } from 'vitest';
import { isFieldVisible } from './fieldVisibility';

const NO_RULES: Record<string, boolean> = {};

function field(overrides: { isVisible?: boolean; isHidden?: boolean } = {}) {
  return { id: 'field-1', isVisible: true, isHidden: false, ...overrides };
}

describe('isFieldVisible — no rule targets the field', () => {
  it('should_show_a_plain_field', () => {
    expect(isFieldVisible(field(), NO_RULES)).toBe(true);
  });

  it('should_hide_a_field_marked_hidden', () => {
    expect(isFieldVisible(field({ isHidden: true }), NO_RULES)).toBe(false);
  });

  it('should_hide_a_field_that_is_not_visible', () => {
    expect(isFieldVisible(field({ isVisible: false }), NO_RULES)).toBe(false);
  });
});

describe('isFieldVisible — a rule targets the field', () => {
  it('should_reveal_a_hidden_field_when_a_rule_shows_it', () => {
    // The defect: the rule set the field visible and the design-time flag hid it again.
    expect(isFieldVisible(field({ isHidden: true }), { 'field-1': true })).toBe(true);
  });

  it('should_hide_a_visible_field_when_a_rule_hides_it', () => {
    expect(isFieldVisible(field(), { 'field-1': false })).toBe(false);
  });

  it('should_keep_a_hidden_field_hidden_when_a_rule_hides_it', () => {
    expect(isFieldVisible(field({ isHidden: true }), { 'field-1': false })).toBe(false);
  });

  it('should_reveal_a_field_that_is_both_hidden_and_not_visible_when_a_rule_shows_it', () => {
    const target = field({ isHidden: true, isVisible: false });
    expect(isFieldVisible(target, { 'field-1': true })).toBe(true);
  });

  it('should_ignore_a_verdict_meant_for_another_field', () => {
    expect(isFieldVisible(field({ isHidden: true }), { 'other-field': true })).toBe(false);
  });
});
