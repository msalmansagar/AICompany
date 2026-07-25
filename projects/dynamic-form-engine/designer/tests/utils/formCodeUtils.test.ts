import { describe, it, expect } from 'vitest'; // FIXED: removed stale RED TDD-phase marker — implementation is complete
import { slugifyFormCode, sanitizeFormCode } from '@/utils/formCodeUtils';

describe('slugifyFormCode — auto-derive from Form Name', () => {
  it('lowercases_the_input', () => {
    expect(slugifyFormCode('LOAN')).toBe('loan');
  });

  it('replaces_spaces_with_hyphens', () => {
    expect(slugifyFormCode('Loan Application')).toBe('loan-application');
  });

  it('collapses_sequences_of_non_alphanumeric_into_single_hyphen', () => {
    expect(slugifyFormCode('Loan  (Application)')).toBe('loan-application');
  });

  it('matches_acceptance_criteria_example', () => {
    // FR-012(a) BA acceptance criteria: "Loan Application Form" → "loan-application-form"
    expect(slugifyFormCode('Loan Application Form')).toBe('loan-application-form');
  });

  it('handles_special_characters_in_form_name', () => {
    // "Loan Application Form (2026)" → "loan-application-form-2026"
    expect(slugifyFormCode('Loan Application Form (2026)')).toBe('loan-application-form-2026');
  });

  it('strips_leading_hyphens', () => {
    expect(slugifyFormCode('  Leading spaces')).toBe('leading-spaces');
  });

  it('strips_trailing_hyphens', () => {
    expect(slugifyFormCode('Trailing spaces  ')).toBe('trailing-spaces');
  });

  it('preserves_existing_hyphens_in_name', () => {
    expect(slugifyFormCode('e-Service Form')).toBe('e-service-form');
  });

  it('truncates_to_50_characters', () => {
    const longName = 'a'.repeat(60);
    expect(slugifyFormCode(longName)).toHaveLength(50);
  });

  it('slugifyFormCode_withSeparatorAtTruncationBoundary_doesNotProduceTrailingHyphen', () => {
    // 49 a's + space + more text: the space becomes a hyphen at index 49 (the cut point).
    // Without the post-truncation strip this would produce "aaa...a-" (trailing hyphen).
    const nameWithSeparatorAtCutPoint = 'a'.repeat(49) + ' overflow';
    const result = slugifyFormCode(nameWithSeparatorAtCutPoint);
    expect(result).not.toMatch(/-$/);
    expect(result.length).toBeLessThanOrEqual(50);
  });

  it('returns_empty_string_for_empty_input', () => {
    expect(slugifyFormCode('')).toBe('');
  });

  it('returns_empty_string_for_whitespace_only_input', () => {
    expect(slugifyFormCode('   ')).toBe('');
  });
});

describe('sanitizeFormCode — per-keystroke sanitization on manual Code input', () => {
  it('lowercases_the_input', () => {
    expect(sanitizeFormCode('MY-FORM')).toBe('my-form');
  });

  it('replaces_disallowed_characters_with_hyphen', () => {
    // Spaces and special chars become hyphens
    expect(sanitizeFormCode('my form!')).toBe('my-form-');
  });

  it('allows_alphanumeric_and_hyphens', () => {
    // "my-form-01" is already valid
    expect(sanitizeFormCode('my-form-01')).toBe('my-form-01');
  });

  it('removes_underscores_by_converting_to_hyphens', () => {
    // Legacy codes used underscores; sanitize converts them to hyphens
    expect(sanitizeFormCode('my_form')).toBe('my-form');
  });

  it('returns_empty_string_for_empty_input', () => {
    expect(sanitizeFormCode('')).toBe('');
  });
});
