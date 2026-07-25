import { type BusinessRuleDefinition } from '@/types/businessRule';

// ── Structured-condition types (FR-006 / FR-007, DFE-ENH-001 Phase-4-C) ───────
// These mirror the business-rule condition model (businessRule.ts) but are
// purpose-built for validation rules so the two contracts can evolve independently.

export type StructuredConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'less_than'
  | 'greater_than_or_equal'
  | 'less_than_or_equal'
  | 'is_empty'
  | 'is_not_empty';

export interface StructuredCondition {
  /** Schema name of the field whose value drives this condition */
  fieldRef: string;
  operator: StructuredConditionOperator;
  /** Comparison target; null is valid only for is_empty / is_not_empty */
  value: string | null;
}

/** Subset of comparison operators allowed on the right-hand side of a cross-field rule */
export type CrossFieldComparisonOperator = '==' | '!=' | '<' | '<=' | '>' | '>=';

// ── ValidationRuleType ─────────────────────────────────────────────────────────

export type ValidationRuleType =
  | 'required'
  | 'min_length'
  | 'max_length'
  | 'regex'
  | 'min_value'
  | 'max_value'
  // Sprint 3
  | 'custom_expression'
  // DFE-ENH-001 FR-006 — field becomes required when conditions are all true
  | 'conditional_required'
  // DFE-ENH-001 FR-007 — compare source field against another field using an operator
  | 'cross_field';

// ── DesignerValidationRule ─────────────────────────────────────────────────────

export interface DesignerValidationRule {
  id: string;
  fieldId: string;
  ruleType: ValidationRuleType;
  /** Numeric constraint value (min/max length/value, regex pattern). Null for rule types that use ruleJson. */
  ruleValue: string | null;
  errorMessage: string;
  sortOrder: number;
  // Sprint 3 — populated when ruleType = 'custom_expression'
  customExpression: string | null;
  // Sprint 3 — optional link to a reusable rule template
  ruleTemplateId: string | null;
  // DFE-ENH-001 FR-006 — all conditions must be true for the field to become required.
  // Populated when ruleType = 'conditional_required'. Persisted via qdb_rule_json.
  // Optional — absent on all pre-existing rule types; service normalises to [] on read.
  conditions?: StructuredCondition[];
  // DFE-ENH-001 FR-007 — comparison operator for cross-field rules.
  // Populated when ruleType = 'cross_field'. Persisted via qdb_rule_json.
  crossFieldOperator?: CrossFieldComparisonOperator | null;
  // DFE-ENH-001 FR-007 — schema name of the field to compare against.
  // Populated when ruleType = 'cross_field'. Persisted via qdb_rule_json.
  crossFieldTargetRef?: string | null;
}

// ── DesignerBusinessRule ───────────────────────────────────────────────────────

export interface DesignerBusinessRule {
  id: string;
  formId: string;
  name: string;
  definition: BusinessRuleDefinition;
  isActive: boolean;
  sortOrder: number;
}
