// ─────────────────────────────────────────────────────────────
// Rule JSON codec — the structured payload stored in qdb_form_validation_rule.qdb_rule_json
// for conditional_required (DFE-ENH-001 FR-006) and cross_field (FR-007) rule types.
//
// One codec for the designer that writes the column and the publishers that read it. The
// designer wrote this payload for months while neither publisher read it, so both rule
// kinds saved and then silently never reached a form.
//
// Schema version 2 distinguishes structured rules from legacy records; a record without a
// schemaVersion is version 1 and carries no ruleJson.
// ─────────────────────────────────────────────────────────────

import type { StructuredCondition, CrossFieldComparisonOperator } from '../types/form.types.js';

export const RULE_JSON_SCHEMA_VERSION = 2 as const;

interface ConditionalRequiredPayload {
  schemaVersion: typeof RULE_JSON_SCHEMA_VERSION;
  type: 'conditional_required';
  conditions: StructuredCondition[];
}

interface CrossFieldPayload {
  schemaVersion: typeof RULE_JSON_SCHEMA_VERSION;
  type: 'cross_field';
  operator: CrossFieldComparisonOperator;
  targetFieldRef: string;
}

type RuleJsonPayload = ConditionalRequiredPayload | CrossFieldPayload;

export function encodeConditionalRequired(conditions: StructuredCondition[]): string {
  const payload: ConditionalRequiredPayload = {
    schemaVersion: RULE_JSON_SCHEMA_VERSION,
    type: 'conditional_required',
    conditions,
  };
  return JSON.stringify(payload);
}

export function encodeCrossField(
  operator: CrossFieldComparisonOperator,
  targetFieldRef: string,
): string {
  const payload: CrossFieldPayload = {
    schemaVersion: RULE_JSON_SCHEMA_VERSION,
    type: 'cross_field',
    operator,
    targetFieldRef,
  };
  return JSON.stringify(payload);
}

export interface DecodedConditionalRequired {
  kind: 'conditional_required';
  conditions: StructuredCondition[];
}

export interface DecodedCrossField {
  kind: 'cross_field';
  operator: CrossFieldComparisonOperator;
  targetFieldRef: string;
}

export type DecodeResult = DecodedConditionalRequired | DecodedCrossField | null;

/** Returns null when ruleJson is absent, empty, or not a recognised v2 payload. */
export function decodeRuleJson(ruleJson: string | null | undefined): DecodeResult {
  if (!ruleJson) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(ruleJson);
  } catch {
    // A corrupt payload reads as absent: the rule falls back to its legacy column values.
    return null;
  }

  if (!isRuleJsonObject(parsed) || parsed.schemaVersion !== RULE_JSON_SCHEMA_VERSION) {
    return null;
  }

  if (parsed.type === 'conditional_required') return resolveConditionalRequired(parsed);
  if (parsed.type === 'cross_field')          return resolveCrossField(parsed);

  return null;
}

// The casts below are safe: decodeRuleJson dispatches here only after checking parsed.type.
function resolveConditionalRequired(parsed: RuleJsonPayload): DecodedConditionalRequired {
  const conditions = Array.isArray((parsed as ConditionalRequiredPayload).conditions)
    ? (parsed as ConditionalRequiredPayload).conditions
    : [];
  return { kind: 'conditional_required', conditions };
}

function resolveCrossField(parsed: RuleJsonPayload): DecodedCrossField {
  const payload = parsed as CrossFieldPayload;
  return {
    kind: 'cross_field',
    operator: (payload.operator ?? '==') as CrossFieldComparisonOperator,
    targetFieldRef: String(payload.targetFieldRef ?? ''),
  };
}

function isRuleJsonObject(value: unknown): value is RuleJsonPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'schemaVersion' in value &&
    'type' in value
  );
}
