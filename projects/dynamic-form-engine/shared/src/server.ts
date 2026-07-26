// Server-side barrel: backend, frontend portal, and designer.
// Mobile uses src/index.ts (simplified types) — do not import this from mobile.
export * from './types/form.types.js';
export * from './types/design.types.js';
export * from './types/i18n.types.js';
export { RuleEngine } from './engines/RuleEngine.js';
export { ExpressionEngine } from './engines/ExpressionEngine.js';
export type { ExpressionValue, ExpressionContext, EvaluateOptions } from './engines/ExpressionEngine.js';
export { ExpressionError } from './engines/ExpressionEngine.js';
export {
  ExpressionEngineServer,
  ExpressionTimeoutError,
  MAX_EXPRESSION_LENGTH,
  MAX_EXPRESSION_OPS,
  MAX_EXPRESSION_DURATION_MS,
} from './engines/ExpressionEngineServer.js';
export { calculateContrastRatio } from './utils/contrastRatio.js';
export type { ContrastResult } from './utils/contrastRatio.js';
export * from './validation/design.schema.js';
export { createCssSanitiserPlugin } from './sanitizer/CssSanitiserPlugin.js';
// Grid depends-on filter template: one parser, one emitter per query dialect, so the
// portal (FetchXML) and the in-CRM engine (OData) read a maker's template the same way.
export { buildFetchXmlFilter, buildFetchXmlFilterParts } from './gridFilter/fetchXmlFilter.js';
export type { FetchXmlFilterParts, LookupJoinTarget } from './gridFilter/fetchXmlFilter.js';
export { buildODataFilter } from './gridFilter/odataFilter.js';
export { collectLookupPathAttributes } from './gridFilter/filterTemplate.js';
export { buildViewFetchXml } from './gridFilter/viewFetchXml.js';
export type { ViewFetchXmlRequest } from './gridFilter/viewFetchXml.js';
