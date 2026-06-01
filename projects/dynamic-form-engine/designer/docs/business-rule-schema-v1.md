═══════════════════════════════════════════════════
BUSINESS RULE SCHEMA — CONTRACT DOCUMENT v1.0
═══════════════════════════════════════════════════
Project:        FDWR-001 — Form Designer Web Resource
Schema Version: 1.0
Document Date:  2026-06-01
Status:         PENDING RENDERER TEAM SIGN-OFF
CEO Condition:  C-001 (CRITICAL BUILD GATE)
═══════════════════════════════════════════════════


PURPOSE
───────
This document is the formal schema contract between the Form Designer (writer)
and the Dynamic Form Engine portal renderer (reader). Both parties must agree
this schema before the Rule Configuration panel is built or used in production.

CEO Condition C-001 requires written confirmation from the renderer team before
any rule panel code may be merged to the main branch. This document IS the
artefact to be confirmed.

To satisfy C-001, the renderer team lead must sign below and commit this file.


SCHEMA DEFINITION
─────────────────
Stored field:  qdb_form_business_rule.qdb_rule_definition (ntext, serialized JSON)
TypeScript:    src/types/businessRule.ts — BusinessRuleDefinition interface

```typescript
interface BusinessRuleDefinition {
  version: '1.0';                       // Bump on breaking changes
  trigger_field_code: string;           // qdb_form_field.qdb_code of trigger field
  trigger_event: 'on_change';           // Currently only on_change supported
  condition_group: RuleConditionGroup;
  actions: RuleAction[];
}

interface RuleConditionGroup {
  logical_operator: 'AND' | 'OR';
  conditions: RuleCondition[];
}

interface RuleCondition {
  field_code: string;                   // qdb_form_field.qdb_code
  operator: ConditionOperator;          // See full list below
  value: string | null;                 // null only for is_empty / is_not_empty
}

type ConditionOperator =
  | 'equals' | 'not_equals'
  | 'contains' | 'not_contains'
  | 'is_empty' | 'is_not_empty'
  | 'greater_than' | 'less_than';

interface RuleAction {
  action_type: RuleActionType;          // See full list below
  target_field_code: string;            // qdb_form_field.qdb_code of affected field
  value?: string;                       // Required for set_value and show_message
}

type RuleActionType =
  | 'show_field' | 'hide_field'
  | 'set_required' | 'clear_required'
  | 'set_value'
  | 'show_message';
```


EXAMPLE RECORD
──────────────
```json
{
  "version": "1.0",
  "trigger_field_code": "customer_type",
  "trigger_event": "on_change",
  "condition_group": {
    "logical_operator": "AND",
    "conditions": [
      { "field_code": "customer_type", "operator": "equals", "value": "Corporate" }
    ]
  },
  "actions": [
    { "action_type": "show_field", "target_field_code": "company_name" },
    { "action_type": "set_required", "target_field_code": "company_registration_no" }
  ]
}
```


VERSIONING RULES
────────────────
- version = '1.0' is a discriminated literal — the renderer must check this field
  before evaluating any rule.
- Any additive change that is backward-compatible increments the minor version
  (e.g., new action_type added as optional) — both parties must agree.
- Any breaking change (renamed field, removed operator) increments to v2.0.
  Both parties must agree a migration plan before v2.0 is deployed.
- The designer must never write a version string not defined in this document.


RENDERER TEAM SIGN-OFF (REQUIRED TO SATISFY C-001)
────────────────────────────────────────────────────
By signing below, the Dynamic Form Engine renderer team confirms that:
1. The schema above matches the shape expected by the portal renderer.
2. All ConditionOperator and RuleActionType values are handled by the renderer.
3. Unknown action_type or operator values will be silently ignored (not throw).
4. The renderer will check the version field and reject unknown versions gracefully.

Renderer Team Lead:  ________________________________
Date:                ________________________________
Commit / PR:         ________________________________

STATUS: PENDING — rule panel code must not be merged until this section is signed.
