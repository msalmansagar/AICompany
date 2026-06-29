import { describe, it, expect } from 'vitest';
import {
  ExpressionEngine,
  ExpressionError,
  ExpressionEngineServer,
  MAX_EXPRESSION_LENGTH,
} from '@qdb/shared';

describe('ExpressionEngine op budget (C-005)', () => {
  it('evaluates_normally_without_a_budget', () => {
    expect(ExpressionEngine.evaluate('1 + 2 + 3', {})).toBe(6);
  });

  it('aborts_when_the_op_budget_is_exceeded', () => {
    // '1+1+1+1' is several AST nodes; a budget of 2 must trip the guard.
    expect(() => ExpressionEngine.evaluate('1+1+1+1', {}, { maxOps: 2 })).toThrow(/operations/);
  });

  it('supports_concat_and_field_references', () => {
    expect(ExpressionEngine.evaluate("concat({a}, '-', {b})", { a: 'x', b: 'y' })).toBe('x-y');
  });

  it('formatDate_returns_iso_date_by_default', () => {
    expect(ExpressionEngine.evaluate("formatDate('2026-06-30T12:34:56.000Z')", {})).toBe('2026-06-30');
  });

  it('formatDate_returns_empty_string_for_unparseable_input', () => {
    expect(ExpressionEngine.evaluate("formatDate('not-a-date')", {})).toBe('');
  });
});

describe('ExpressionEngineServer', () => {
  it('evaluates_a_valid_expression', () => {
    expect(ExpressionEngineServer.evaluate("upper({name})", { name: 'ada' })).toBe('ADA');
  });

  it('rejects_an_over_length_expression', () => {
    const tooLong = `'${'a'.repeat(MAX_EXPRESSION_LENGTH + 5)}'`;
    expect(() => ExpressionEngineServer.evaluate(tooLong, {})).toThrow(ExpressionError);
  });

  it('propagates_a_syntax_error_as_ExpressionError', () => {
    expect(() => ExpressionEngineServer.evaluate('1 +', {})).toThrow(ExpressionError);
  });
});
