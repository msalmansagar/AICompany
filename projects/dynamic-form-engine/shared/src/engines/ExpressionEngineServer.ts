// ExpressionEngineServer — DFE-BTN-001 condition C-005.
//
// Server-only policy wrapper around the shared ExpressionEngine for evaluating
// Computed extra-params at submit time. It NEVER uses eval/Function (the
// underlying engine is a hand-written AST evaluator) and it bounds the work so a
// crafted expression cannot stall the request thread:
//   - a maximum expression length (rejects pathological inputs up front),
//   - an operation budget (the DSL has no loops, so AST-node count bounds runtime),
//   - a wall-clock assertion against the 50ms ceiling as defence-in-depth.
//
// Do NOT import this from mobile — the mobile runtime sends raw expression
// strings; only the backend evaluates them.

import { ExpressionEngine, ExpressionError } from './ExpressionEngine.js';
import type { ExpressionContext, ExpressionValue } from './ExpressionEngine.js';

export class ExpressionTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExpressionTimeoutError';
  }
}

/** Maximum characters in a single Computed expression. */
export const MAX_EXPRESSION_LENGTH = 1_000;
/** Maximum AST-node evaluations before the engine aborts. */
export const MAX_EXPRESSION_OPS = 1_000;
/** Wall-clock ceiling per expression (condition C-005). */
export const MAX_EXPRESSION_DURATION_MS = 50;

export class ExpressionEngineServer {
  /**
   * Evaluates a Computed extra-param expression against the submitted field
   * values. Throws ExpressionTimeoutError if the op budget or time ceiling is
   * exceeded, or ExpressionError for a malformed/invalid expression.
   */
  static evaluate(expression: string, context: ExpressionContext): ExpressionValue {
    if (expression.length > MAX_EXPRESSION_LENGTH) {
      throw new ExpressionError(
        `Expression exceeds the maximum length of ${MAX_EXPRESSION_LENGTH} characters`,
      );
    }

    const startedAt = Date.now();
    const result = ExpressionEngineServer.evaluateGuarded(expression, context);
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs > MAX_EXPRESSION_DURATION_MS) {
      throw new ExpressionTimeoutError(
        `Expression exceeded the ${MAX_EXPRESSION_DURATION_MS}ms ceiling (took ${elapsedMs}ms)`,
      );
    }
    return result;
  }

  private static evaluateGuarded(expression: string, context: ExpressionContext): ExpressionValue {
    try {
      return ExpressionEngine.evaluate(expression, context, { maxOps: MAX_EXPRESSION_OPS });
    } catch (error) {
      if (error instanceof ExpressionError && error.message.includes('operations')) {
        throw new ExpressionTimeoutError(
          `Expression aborted after exceeding ${MAX_EXPRESSION_OPS} operations`,
        );
      }
      throw error;
    }
  }
}
