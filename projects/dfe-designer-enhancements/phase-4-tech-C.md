# DFE-ENH-001 — Phase 4 Technical Deliverable: Workstream C
## FR-006 Conditional-Required + FR-007 Cross-Field Validation

**Branch:** `feat/dfe-enh-validation`
**Engagement:** DFE-ENH-001
**Phase:** 4 — Technical Build
**Workstream:** C — Validation Rule Extensions

---

## Summary

Extends the DFE validation system to support two new rule types:

- **FR-006 `conditionalRequired`** — a field becomes required only when a set of structured conditions on other fields all evaluate to true (AND semantics).
- **FR-007 `crossField` (enhanced)** — the cross-field rule type already existed in the picklist but had no UI or extended-comparison evaluation. This workstream adds a six-operator comparison (`==`, `!=`, `<`, `<=`, `>`, `>=`) with type-aware routing (dates, numbers, strings) and stores the operator + target field reference in the new `qdb_rule_json` column.

Both rule types reuse the existing structured-condition model; no second rule engine was introduced.

---

## Architecture decisions

### ADR-C-001: Extend the incumbent condition model, do not introduce a second engine

The existing `ExpressionEngine` in `@qdb/shared` is a pure recursive-descent evaluator for business rules. Introducing a second engine would create two parallel rule-evaluation stacks for validation.

Decision: add `StructuredCondition` and `CrossFieldComparisonOperator` as purpose-built types for validation rules, evaluate them inside `ValidationEngine` (frontend), and keep the engine boundary clean.

### ADR-C-002: New `qdb_rule_json` column (multi-line text) on `qdb_form_validation_rule`

The existing numeric columns (`qdb_min_length`, `qdb_regex_pattern`, etc.) are typed for specific simple rule parameters. Reusing `qdb_custom_expression` would collide with the `customExpression` rule type.

Decision: add a new multi-line text column `qdb_rule_json` to hold the JSON payload for the two new rule types. The column is version-discriminated (`schemaVersion: 2`). Legacy records (no `schemaVersion`) remain unaffected.

### ADR-C-003: `schemaVersion` discriminator in the JSON payload

Codec output always carries `schemaVersion: 2`. The decoder treats any record without this version (or with `schemaVersion < 2`) as legacy / opaque and returns `null`, which keeps all pre-existing behaviour unchanged.

### ADR-C-004: String cross-field comparisons restricted to `==` and `!=`

Lexicographic `<` / `>` on arbitrary user-entered strings is ambiguous and misleading. Date and numeric values are type-routed before comparison. Strings fall through to equality-only comparison.

---

## Files changed

### Shared (`projects/dynamic-form-engine/shared`)

| File | Change |
|---|---|
| `src/types/form.types.ts` | Added `conditionalRequired` to `ValidationRuleType`; added `CrossFieldComparisonOperator`, `StructuredConditionOperator`, `StructuredCondition`; extended `ValidationRule` with `conditions?`, `crossFieldOperator?`, `crossFieldTargetRef?` |

### Designer (`projects/dynamic-form-engine/designer`)

| File | Change |
|---|---|
| `src/constants/formAttributeNames.ts` | Added `RULE_JSON: 'qdb_rule_json'` to `FORM_VALIDATION_RULE_ATTRS` |
| `src/constants/ruleAttributeNames.ts` | Added `conditional_required: 100000013` to `RULE_TYPE_TO_PICKLIST` (new picklist code; `cross_field: 100000011` pre-existed) |
| `src/state/models/DesignerRuleModel.ts` | Added `StructuredConditionOperator`, `StructuredCondition`, `CrossFieldComparisonOperator` types; added `conditional_required` and `cross_field` to `ValidationRuleType`; extended `DesignerValidationRule` with optional `conditions?`, `crossFieldOperator?`, `crossFieldTargetRef?` fields |
| `src/services/ruleJsonCodec.ts` | **New file** — pure codec: `encodeConditionalRequired`, `encodeCrossField`, `decodeRuleJson`, `RULE_JSON_SCHEMA_VERSION = 2` |
| `src/services/ValidationRuleService.ts` | Extended DTOs; added `RULE_JSON` to `$select`; added `buildRuleJsonPayload`, `buildCreateDtoFromModel`, `buildUpdateDtoFromModel` helpers; `mapRecordToModel` calls `decodeRuleJson` to populate new fields; `syncRules` picks the right encoder |
| `src/designer/properties/panels/ValidationRulesPanel.tsx` | Added `ConditionBuilder` component; added `CrossFieldEditor` component; extended `AddRuleForm` with condition + cross-field state; `ValidationRulesPanel` reads `fields` from store to derive `currentFieldCode` / `otherFieldCodes` |
| `tests/services/ruleJsonCodec.test.ts` | **New file** — 13 unit tests for codec encode/decode round-trips |

### Frontend (`projects/dynamic-form-engine/frontend`)

| File | Change |
|---|---|
| `src/engine/ValidationEngine.ts` | Added `case 'conditionalRequired'` in `evaluateRule`; added `validateConditionalRequired`; extended `validateCrossField` with `crossFieldTargetRef ?? compareToFieldId` fallback and six-operator routing; exported `applyCrossFieldOperator` and `evaluateStructuredCondition` as pure helpers for unit testing |
| `src/engine/ValidationEngine.test.ts` | Extended with 6 `conditionalRequired` tests, 7 `crossField` tests, 7 `applyCrossFieldOperator` unit tests, 6 `evaluateStructuredCondition` unit tests |

---

## Linting rules (pre-wired, no change needed)

L007 and L008 were pre-wired in Phase 3 architecture. The linter already enforces:
- L007: `conditional_required` rules must have at least one condition
- L008: `cross_field` rules must have `crossFieldTargetRef` and `crossFieldOperator`

No linter changes were required in this workstream.

---

## Picklist codes

| Rule type | Picklist code | Status |
|---|---|---|
| `cross_field` | 100000011 | Pre-existing |
| `conditional_required` | 100000013 | New (this workstream) |

---

## Test results

**TypeScript:** `tsc --noEmit` clean on both `designer` and `frontend` packages.

**Vitest:**
- `frontend/src/engine/ValidationEngine.test.ts` — 44 tests, 44 passed
- `designer/tests/services/ruleJsonCodec.test.ts` — 13 tests, 13 passed

---

## Backward compatibility

- All pre-existing validation rule types (`required`, `minLength`, `regex`, `crossField` legacy, etc.) are unchanged.
- `DesignerValidationRule.conditions`, `crossFieldOperator`, `crossFieldTargetRef` are optional fields — existing test fixtures and service call-sites do not need updating.
- Legacy `crossField` rules that use `compareToFieldId` (equality-only, no `qdb_rule_json`) continue to work via the `crossFieldTargetRef ?? compareToFieldId` fallback in `ValidationEngine`.
- `decodeRuleJson(null)` returns `null` — the codec is safe to call on any existing rule record.

---

## Dataverse schema change required before deployment

A new column must be added to `qdb_form_validation_rule` before deploying:

```
Entity:  qdb_form_validation_rule
Column:  qdb_rule_json
Type:    Multiple Lines of Text
Max length: 4000
Required: No
```

This column is not auto-created by the solution import; it must be added manually or via a schema script before the updated web resource is published.
