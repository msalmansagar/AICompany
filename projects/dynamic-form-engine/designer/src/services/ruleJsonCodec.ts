// The codec moved to @qdb/shared so the backend and the C# publisher's contract read the
// same payload the designer writes. This module keeps the designer's import path.
export {
  RULE_JSON_SCHEMA_VERSION,
  encodeConditionalRequired,
  encodeCrossField,
  decodeRuleJson,
} from '@qdb/shared';
export type { DecodedConditionalRequired, DecodedCrossField, DecodeResult } from '@qdb/shared';
