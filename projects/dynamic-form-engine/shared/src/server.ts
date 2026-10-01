// Server-side barrel: backend, frontend portal, and designer.
// Mobile uses src/index.ts (simplified types) — do not import this from mobile.
export * from './types/form.types.js';
export * from './types/design.types.js';
export * from './types/i18n.types.js';
export { RuleEngine } from './engines/RuleEngine.js';
export { ExpressionEngine } from './engines/ExpressionEngine.js';
export type { ExpressionValue, ExpressionContext, EvaluateOptions } from './engines/ExpressionEngine.js';
export { ExpressionError } from './engines/ExpressionEngine.js';
// Relative date bounds: one parser so the designer writes the token the runtime resolves.
export {
  RELATIVE_DATE_PREFIX,
  RELATIVE_DATE_ANCHORS,
  RELATIVE_DATE_UNITS,
  isRelativeDateRef,
  parseRelativeDateRef,
  formatRelativeDateRef,
  resolveRelativeDate,
} from './engines/relativeDate.js';
export type { RelativeDateRef, RelativeDateAnchor, RelativeDateUnit } from './engines/relativeDate.js';
export {
  ExpressionEngineServer,
  ExpressionTimeoutError,
  MAX_EXPRESSION_LENGTH,
  MAX_EXPRESSION_OPS,
  MAX_EXPRESSION_DURATION_MS,
} from './engines/ExpressionEngineServer.js';
// Field defaults: one codec so the designer, its preview and the runtime read a stored
// default the same way (a multi-select default is a JSON array in a single text column).
export {
  resolveFieldDefaultValue,
  parseMultiSelectDefault,
  serialiseMultiSelectDefault,
  parseBooleanDefault,
  isMultiValueFieldType,
  isBooleanFieldType,
} from './fields/defaultValue.js';
export { calculateContrastRatio } from './utils/contrastRatio.js';
export { isRenderableImageUrl, renderableImageUrl } from './utils/imageUrl.js';
export type { ContrastResult } from './utils/contrastRatio.js';
export * from './validation/design.schema.js';
export {
  validateGridCell,
  validateGridRow,
  isGridValid,
} from './validation/gridCellValidation.js';
export type { GridRowErrors } from './validation/gridCellValidation.js';
// Related-record conditions: one fact name and one allowlist for runtime and backend.
export { relatedFactName, collectRelatedAttributes, isLogicalName } from './rules/relatedFacts.js';
export type { RelatedRecordQuery } from './rules/relatedFacts.js';
// Validation rule JSON: the designer writes it, both publishers read it.
export {
  RULE_JSON_SCHEMA_VERSION,
  encodeConditionalRequired,
  encodeCrossField,
  encodeApiValidation,
  decodeRuleJson,
} from './validation/ruleJsonCodec.js';
export type {
  DecodedConditionalRequired,
  DecodedCrossField,
  DecodedApiValidation,
  DecodeResult,
} from './validation/ruleJsonCodec.js';
export { createCssSanitiserPlugin } from './sanitizer/CssSanitiserPlugin.js';
// Grid depends-on filter template: one parser, one emitter per query dialect, so the
// portal (FetchXML) and the in-CRM engine (OData) read a maker's template the same way.
export { buildFetchXmlFilter, buildFetchXmlFilterParts } from './gridFilter/fetchXmlFilter.js';
export type { FetchXmlFilterParts, LookupJoinTarget } from './gridFilter/fetchXmlFilter.js';
export { buildODataFilter } from './gridFilter/odataFilter.js';
export { collectLookupPathAttributes } from './gridFilter/filterTemplate.js';
export { buildViewFetchXml } from './gridFilter/viewFetchXml.js';
export type { ViewFetchXmlRequest } from './gridFilter/viewFetchXml.js';
// Design system: the four appearances, shared so the designer and the runtime
// cannot drift into two different-looking products.
export {
  APPEARANCE_PALETTES,
  APPEARANCE_NAMES,
  APPEARANCE_OPTIONS,
  isAppearanceName,
} from './theme/appearancePalettes.js';
export type {
  AppearancePalette,
  AppearanceName,
  AppearanceOption,
} from './theme/appearancePalettes.js';
export { buildBrandRamp, fluentTokenOverrides } from './theme/fluentAppearance.js';
export type { BrandRamp } from './theme/fluentAppearance.js';
export { appearanceThemeDefinition } from './theme/appearanceThemeDefinition.js';
