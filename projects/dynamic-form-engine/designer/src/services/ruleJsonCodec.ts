// ── Rule JSON Codec (DFE-ENH-001 Phase-4-C) ───────────────────────────────────
// Serialises and deserialises the structured JSON payload stored in qdb_rule_json
// for conditional_required (FR-006) and cross_field (FR-007) rule types.
//
// Schema version 2 distinguishes Phase-4-C rules from legacy records.
// Records without a schemaVersion are treated as version 1 (legacy; no ruleJson).

import type {
  StructuredCondition,
  CrossFieldComparisonOperator,
} from '@/state/models/DesignerRuleModel';

export const RULE_JSON_SCHEMA_VERSION = 2 as const;

// ── Payload shapes ─────────────────────────────────────────────────────────────

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

// ── Serialisation ──────────────────────────────────────────────────────────────

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

// ── Deserialisation ────────────────────────────────────────────────────────────

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
    // JSON.parse throws on malformed input. Treat corrupt payloads as absent — the
    // rule will fall back to its legacy column values (ruleValue / customExpression).
    return null;
  }

  if (!isRuleJsonObject(parsed) || parsed.schemaVersion !== RULE_JSON_SCHEMA_VERSION) {
    return null;
  }

  if (parsed.type === 'conditional_required') return resolveConditionalRequired(parsed);
  if (parsed.type === 'cross_field')          return resolveCrossField(parsed);

  return null;
}

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
