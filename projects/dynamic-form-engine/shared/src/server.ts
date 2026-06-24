// Server-side barrel: backend, frontend portal, and designer.
// Mobile uses src/index.ts (simplified types) — do not import this from mobile.
export * from './types/form.types';
export * from './types/design.types';
export * from './types/i18n.types';
export { RuleEngine } from './engines/RuleEngine';
export { ExpressionEngine } from './engines/ExpressionEngine';
export type { ExpressionValue, ExpressionContext } from './engines/ExpressionEngine';
export { ExpressionError } from './engines/ExpressionEngine';
