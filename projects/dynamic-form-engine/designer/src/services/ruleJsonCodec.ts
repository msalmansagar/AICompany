// The codec moved to @qdb/shared so the backend and the C# publisher's contract read the
// same payload the designer writes. This module keeps the designer's import path.
export {
  RULE_JSON_SCHEMA_VERSION,
  encodeConditionalRequired,
  encodeCrossField,
  encodeApiValidation,
  decodeRuleJson,
} from '@qdb/shared';
export type { DecodedConditionalRequired, DecodedCrossField, DecodedApiValidation, DecodeResult } from '@qdb/shared';
