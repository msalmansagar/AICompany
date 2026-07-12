// DFE-ENH-001 Phase-4-C — serialisation round-trip tests for the rule-JSON codec.
// RED → GREEN: tests written before the codec implementation was in place.

import { describe, it, expect } from 'vitest';
import {
  encodeConditionalRequired,
  encodeCrossField,
  decodeRuleJson,
  RULE_JSON_SCHEMA_VERSION,
} from '@/services/ruleJsonCodec';
import type { StructuredCondition } from '@/state/models/DesignerRuleModel';

describe('ruleJsonCodec', () => {
  // ── encodeConditionalRequired ──────────────────────────────────

  describe('encodeConditionalRequired', () => {
    it('encodeConditionalRequired_producesValidJson_withSchemaVersion2', () => {
      const conditions: StructuredCondition[] = [
        { fieldRef: 'loan_type', operator: 'equals', value: 'secured' },
      ];

      const json = encodeConditionalRequired(conditions);
      const parsed = JSON.parse(json) as Record<string, unknown>;

      expect(parsed.schemaVersion).toBe(RULE_JSON_SCHEMA_VERSION);
      expect(parsed.type).toBe('conditional_required');
    });

    it('encodeConditionalRequired_preservesAllConditionFields', () => {
      const conditions: StructuredCondition[] = [
        { fieldRef: 'loan_type', operator: 'equals', value: 'secured' },
        { fieldRef: 'loan_amount', operator: 'greater_than', value: '10000' },
      ];

      const json = encodeConditionalRequired(conditions);
      const parsed = JSON.parse(json) as { conditions: StructuredCondition[] };

      expect(parsed.conditions).toHaveLength(2);
      expect(parsed.conditions[0].fieldRef).toBe('loan_type');
      expect(parsed.conditions[1].operator).toBe('greater_than');
    });

    it('encodeConditionalRequired_handlesIsEmptyOperator_withNullValue', () => {
      const conditions: StructuredCondition[] = [
        { fieldRef: 'remarks', operator: 'is_empty', value: null },
      ];

      const json = encodeConditionalRequired(conditions);
      const parsed = JSON.parse(json) as { conditions: StructuredCondition[] };

      expect(parsed.conditions[0].value).toBeNull();
    });
  });

  // ── encodeCrossField ───────────────────────────────────────────

  describe('encodeCrossField', () => {
    it('encodeCrossField_producesValidJson_withCorrectOperatorAndRef', () => {
      const json = encodeCrossField('>=', 'start_date');
      const parsed = JSON.parse(json) as Record<string, unknown>;

      expect(parsed.schemaVersion).toBe(RULE_JSON_SCHEMA_VERSION);
      expect(parsed.type).toBe('cross_field');
      expect(parsed.operator).toBe('>=');
      expect(parsed.targetFieldRef).toBe('start_date');
    });

    it('encodeCrossField_supportsAllSixOperators', () => {
      const operators = ['==', '!=', '<', '<=', '>', '>='] as const;

      for (const op of operators) {
        const json = encodeCrossField(op, 'some_field');
        const parsed = JSON.parse(json) as { operator: string };
        expect(parsed.operator).toBe(op);
      }
    });
  });

  // ── decodeRuleJson ─────────────────────────────────────────────

  describe('decodeRuleJson', () => {
    it('decodeRuleJson_returnsNull_forNullInput', () => {
      expect(decodeRuleJson(null)).toBeNull();
    });

    it('decodeRuleJson_returnsNull_forEmptyString', () => {
      expect(decodeRuleJson('')).toBeNull();
    });

    it('decodeRuleJson_returnsNull_forMalformedJson', () => {
      expect(decodeRuleJson('{ invalid json')).toBeNull();
    });

    it('decodeRuleJson_returnsNull_forLegacySchemaVersion', () => {
      const legacyJson = JSON.stringify({ schemaVersion: 1, type: 'cross_field', operator: '==' });
      expect(decodeRuleJson(legacyJson)).toBeNull();
    });

    it('decodeRuleJson_returnsNull_forUnknownType', () => {
      const json = JSON.stringify({ schemaVersion: 2, type: 'unknown_type' });
      expect(decodeRuleJson(json)).toBeNull();
    });

    it('decodeRuleJson_decodesConditionalRequired_roundTrip', () => {
      const conditions: StructuredCondition[] = [
        { fieldRef: 'loan_type', operator: 'equals', value: 'secured' },
        { fieldRef: 'amount', operator: 'greater_than', value: '5000' },
      ];

      const json = encodeConditionalRequired(conditions);
      const result = decodeRuleJson(json);

      expect(result).not.toBeNull();
      expect(result?.kind).toBe('conditional_required');
      if (result?.kind === 'conditional_required') {
        expect(result.conditions).toHaveLength(2);
        expect(result.conditions[0].fieldRef).toBe('loan_type');
        expect(result.conditions[0].operator).toBe('equals');
        expect(result.conditions[0].value).toBe('secured');
      }
    });

    it('decodeRuleJson_decodesCrossField_roundTrip', () => {
      const json = encodeCrossField('!=', 'primary_contact');
      const result = decodeRuleJson(json);

      expect(result).not.toBeNull();
      expect(result?.kind).toBe('cross_field');
      if (result?.kind === 'cross_field') {
        expect(result.operator).toBe('!=');
        expect(result.targetFieldRef).toBe('primary_contact');
      }
    });

    it('decodeRuleJson_returnsEmptyConditions_forMissingConditionsArray', () => {
      const malformed = JSON.stringify({
        schemaVersion: 2,
        type: 'conditional_required',
        // conditions deliberately omitted
      });

      const result = decodeRuleJson(malformed);

      expect(result?.kind).toBe('conditional_required');
      if (result?.kind === 'conditional_required') {
        expect(result.conditions).toHaveLength(0);
      }
    });
  });
});
