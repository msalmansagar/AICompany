# DFE-ENH-001 — Phase 4 Technical Build

Engagement: Dynamic Form Engine Designer Enhancements
Workstream sequencing mirrors Phase 3 architecture (§8).

---

## Workstream B — FormLinter (FR-003: Design-time Config Linter)

**Status:** COMPLETE
**Branch:** feat/dfe-enh-formlinter (off origin/main)
**ADR ref:** ADR-005 (BUILD — no library covers DFE-domain cross-reference rules)

---

### Files Added

| File | Role |
|---|---|
| `projects/dynamic-form-engine/designer/src/services/FormLinter.ts` | Linter implementation (460 lines) |
| `projects/dynamic-form-engine/designer/tests/services/FormLinter.test.ts` | Vitest unit tests (33 tests) |

---

### LintFinding Contract

```typescript
export type LintSeverity = 'error' | 'warning' | 'info';
export type LintNodeType = 'form' | 'tab' | 'section' | 'field' | 'mapping' | 'rule';

export interface LintFinding {
  severity: LintSeverity;
  code: string;       // e.g. 'L001', 'L005'
  message: string;    // human-readable, cites the offending value
  nodeType: LintNodeType;
  nodeId: string;     // Dataverse GUID of the affected record, or 'form'
}
```

**Deviation from Phase 3 arch:** The architecture document (§2.2) specified `LintResult { affectedNodeIds: string[], affectedNodeLabels: string[], ruleId? }`. The task specification overrides this with the simpler `LintFinding` contract above. The simpler contract is better suited for the click-to-navigate integration pattern (one finding = one node = one navigation target).

---

### FormLinterInput

```typescript
export interface FormLinterInput {
  fields:            Record<string, DesignerFieldModel>;
  tabs:              Record<string, DesignerTabModel>;
  sections:          Record<string, DesignerSectionModel>;
  validationRules:   Record<string, DesignerValidationRule>;
  businessRules:     Record<string, DesignerBusinessRule>;
  tabOrder:          string[];
  sectionOrder:      Record<string, string[]>;
  fieldOrder:        Record<string, string[]>;
  submissionMappings: SubmissionMapping[];
  crmAttributeCache?: CrmAttributeCache;
}
```

**Deviation from arch:** Submission mappings live outside the Zustand store (`SubmissionMappingService.listMappingsForForm()` returns them). The linter accepts them as an explicit parameter rather than reading from the store, keeping the class side-effect-free.

**Deviation from arch:** The CrmAttributeCache field is optional. When absent, L003 returns early. This handles the common designer startup case where the CRM metadata fetch is still in flight.

---

### Rule Catalogue — L001 through L013

| Code | Severity | Status | Description |
|---|---|---|---|
| L001 | error | Active | Duplicate field codes within a form. Flags every occurrence so the author can navigate to any of them. |
| L002 | warning | Active | Required field (`isRequired: true`) with no submission mapping. Fields covered by L007 are exempt. |
| L003 | warning | Active | Submission mapping targets a CRM attribute not in the attribute cache. Skipped if cache is absent. |
| L004 | error | Active | Validation rule `fieldId` (GUID) references a field that no longer exists in the form. |
| L005 | error | Active | Business rule trigger / condition / action references a `field_code` that does not exist in the form. One finding per orphaned code. |
| L006 | info | Active | Tab has no sections, or section has no fields. |
| L007 | warning | Pre-wired | Field has a `conditional_required` rule but no submission mapping. Activates when `conditional_required` is added to `ValidationRuleType`. |
| L008 | error | Pre-wired | Cross-field validation rule (`cross_field`) targets a field GUID that is absent from the form. Activates when `cross_field` is added to `ValidationRuleType`. |
| L009 | info | Active | Field count approaching ENT-010 limit (>= 160 fields). |
| L010 | error | Active | Field count exceeds ENT-010 hard limit (> 200 fields). |
| L011 | info | Active | Business rule count approaching ENT-010 limit (>= 40 rules). |
| L012 | error | Active | Business rule count exceeds ENT-010 hard limit (> 50 rules). |
| L013 | warning | Dormant | PII category set but sensitivity level is Public. Activates when Phase 2 adds `piiCategory` / `sensitivityLevel` to `DesignerFieldModel`. |

**Scale constants (ENT-010):**

```typescript
const FIELD_COUNT_LIMIT                  = 200;
const FIELD_COUNT_WARNING_THRESHOLD      = 160;
const BUSINESS_RULE_COUNT_LIMIT          = 50;
const BUSINESS_RULE_COUNT_WARNING_THRESHOLD = 40;
```

---

### Model-name notes (for future maintainers)

Phase 3 architecture docs use abstract names that differ from the actual TypeScript model:

| Arch term | Actual model property |
|---|---|
| `schemaName` | `DesignerFieldModel.code` |
| `fieldRef` in business rules | `field_code`, `trigger_field_code`, `target_field_code` (strings) |
| `fieldRef` in validation rules | `DesignerValidationRule.fieldId` (Dataverse GUID) |

---

### Test Summary

**Test file:** `tests/services/FormLinter.test.ts`
**Runner:** Vitest v2.1.9
**Result:** 33 / 33 passed, 0 failed
**Runtime:** 29 ms (wall 3.44 s including cold start)

Test coverage per rule:

| Rule | Tests | Scenarios |
|---|---|---|
| L001 | 3 | clean form; two fields same code; three fields same code |
| L002 | 4 | clean (mapped); required + unmapped; required + conditional_required exempt; not required + unmapped |
| L003 | 3 | no cache (returns empty); valid attribute; unknown attribute |
| L004 | 2 | valid fieldId; orphaned fieldId |
| L005 | 4 | valid trigger; orphaned trigger; orphaned condition code; orphaned action target |
| L006 | 3 | populated tab+section; empty tab; empty section |
| L007 | 3 | non-conditional rule; conditional_required + mapped exempt; conditional_required + unmapped |
| L008 | 3 | non-cross_field rule; cross_field with valid target; cross_field with deleted target |
| L009/L010 | 3 | 5 fields (clean); 160 fields (L009 warning); 201 fields (L010 error) |
| L011/L012 | 3 | 5 rules (clean); 40 rules (L011 warning); 51 rules (L012 error) |
| Composite | 2 | multi-violation form returns all expected findings; clean form returns empty array |

**Performance test:** 201-field form lints in < 1 ms. Meets FR-003 requirement of < 2 s for 100 fields + 50 rules with orders of magnitude margin.

---

### TypeScript verification

```
npx tsc --noEmit
```

Zero errors in FormLinter.ts and FormLinter.test.ts. Pre-existing type errors in unrelated components (GriffelStyle, missing `@qdb/shared` alias) are present on the base branch and are not introduced or worsened by this workstream.

---

### PublishValidationScreen Integration Plan (deferred UI wiring)

The FormLinter is wired at the pre-publish gate in `PublishValidationScreen`. The integration is deferred to Workstream C (UI) but the adapter design is documented here.

**Intended flow:**

1. `PublishValidationScreen` calls `SubmissionMappingService.listMappingsForForm(formId)` to get mappings.
2. It projects the Zustand state slice into a `FormLinterInput` object.
3. It calls `FormLinter.lint(input)` synchronously (no debounce at publish gate).
4. It merges `LintFinding[]` with the existing `ValidationIssue[]` from `validateForPublish()`.
5. Findings with `severity: 'error'` block the Publish action. `warning` and `info` show as advisory.

**Existing `ValidationIssue` adapter:**

`LintFinding` maps to `ValidationIssue` without transformation:

```typescript
const lintFindingToIssue = (f: LintFinding): ValidationIssue => ({
  code: f.code,
  message: f.message,
  severity: f.severity,
});
```

**Click-to-navigate:**
The `nodeType` + `nodeId` pair on `LintFinding` is the navigation payload. When a user clicks a finding in the panel, the designer calls `designerStore.setSelectedNode({ type: f.nodeType, id: f.nodeId })`. This re-uses the existing selection mechanism without new state shape.

**Live linting (debounced):**
The arch specifies a 500 ms debounce on store change. A `useLintFindings()` hook subscribes to the store slice and calls `FormLinter.lint()`. The hook is not built in Workstream B — it is deferred to Workstream C.

---

### Architectural deviations

| # | Deviation | Rationale |
|---|---|---|
| D-01 | `LintFinding` contract instead of `LintResult` | Task specification overrides arch contract. Simpler contract fits click-to-navigate better than `affectedNodeIds[]`. |
| D-02 | `FormLinterInput` takes `submissionMappings` as explicit param | Mappings are not in the Zustand store — they are fetched via `SubmissionMappingService`. Keeping linter store-free preserves testability and single responsibility. |
| D-03 | `crmAttributeCache` is optional on `FormLinterInput` | Arch assumed cache is always present. In practice the cache is populated asynchronously after designer mount. Optional field enables L003 to gracefully skip until cache is ready. |
| D-04 | L007 and L008 use `(rule.ruleType as string)` cast | `conditional_required` and `cross_field` are not yet in `ValidationRuleType` union. Forward-compat cast avoids both TS error and changing the existing type union (which is outside this workstream's scope). |
| D-05 | L013 is fully dormant (returns `[]`) | `piiCategory` and `sensitivityLevel` do not yet exist on `DesignerFieldModel`. Placeholder is in place for Phase 2. |
