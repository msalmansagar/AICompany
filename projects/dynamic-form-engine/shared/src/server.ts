// Server-side barrel: backend, frontend portal, and designer.
// Mobile uses src/index.ts (simplified types) — do not import this from mobile.
export * from './types/form.types';
export * from './types/design.types';
export * from './types/i18n.types';
export { RuleEngine } from './engines/RuleEngine';
export { ExpressionEngine } from './engines/ExpressionEngine';
export type { ExpressionValue, ExpressionContext, EvaluateOptions } from './engines/ExpressionEngine';
export { ExpressionError } from './engines/ExpressionEngine';
export {
  ExpressionEngineServer,
  ExpressionTimeoutError,
  MAX_EXPRESSION_LENGTH,
  MAX_EXPRESSION_OPS,
  MAX_EXPRESSION_DURATION_MS,
} from './engines/ExpressionEngineServer';
export { calculateContrastRatio } from './utils/contrastRatio';
export type { ContrastResult } from './utils/contrastRatio';
export * from './validation/design.schema';
export { createCssSanitiserPlugin } from './sanitizer/CssSanitiserPlugin';
