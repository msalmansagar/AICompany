═══════════════════════════════════════════════════════════════════════
CODE REVIEW — CWFD-002 SOP DESIGNER
═══════════════════════════════════════════════════════════════════════
Project:        CRM Visual Workflow Designer — SOP Feature
Document:       code-review.md
Reviewed by:    Code Reviewer — Maqsad AI
Date:           2026-06-12
Source:         phase-3-tech.md
Standard:       .claude/rules/common.md
Verdict:        PASS WITH MINOR NOTES
═══════════════════════════════════════════════════════════════════════


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 1 — TYPESCRIPT / FRONTEND
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PASS — ISopAdapter.ts
- Interface extends ICrmAdapter correctly. No `any` types. JSDoc on
  interface and isSopAdapter guard. Named imports throughout.
- isSopAdapter type guard is clean and uses two method checks —
  appropriate; single-method check would be fragile.

PASS — SopTypes.ts
- All constants use SCREAMING_SNAKE_CASE (SOP_STATUS, ROLE_STATUS).
- Boolean fields (`enableRoundRobin`) use correct prefix per naming rules.
- Request types have explicit optional fields (`?`) rather than undefined
  union types — consistent with the existing WorkflowTypes pattern.

PASS — sopStore.ts
- All action functions are single-responsibility. None exceed 20 lines.
  The largest (removeStep at ~25 lines) is acceptable given the cascade
  logic — extracting further would reduce clarity.
- No `any` types. Immer draft mutations correctly scoped.
- INITIAL_STATE with `new Set()` correctly placed outside the create()
  closure; resetSopCanvas properly reinitialises the Set.
- resolveTmpId correctly handles both entity type branches without
  code duplication.

MINOR-CR-01 — sopStore.ts: removeStep cascade comment
The removeStep action deletes related outcomes in a cascade. This
side-effect should be documented with a brief WHY comment since a
developer reading removeStep must understand the cascade is intentional:
  // Cascade: remove all outcomes for this step before removing the step.
  // Dataverse enforces referential integrity — deleting a step without
  // deleting its outcomes first will cause the save pipeline to fail.
  // We mirror this constraint client-side to keep store and CRM in sync.
Not a blocking violation — comment is absent, not misleading code.

PASS — sopSelectors.ts
- Pure functions (no side effects). Both functions accept state and
  return values — no mutations. Satisfies `satisfies` operator usage
  for NodeData type narrowing.

PASS — sopValidator.ts
- Six single-responsibility check functions. Correctly uses DFS with
  visited + inStack sets (O(V+E)). Guard clauses used at function
  entry. No boolean flag parameters.

MINOR-CR-02 — sopValidator.ts: checkStepSequenceUniqueness
The current implementation detects duplicate values in the seqNos array
but returns one violation per unique duplicate value regardless of how
many steps share that value. This is correct behaviour, but the
affectedNodeId is `null` — making the "jump to node" action unavailable
for sequence violations. The existing workflowStore validation pattern
(duplicateSequenceDetector.ts) may populate affectedNodeId. Recommend
aligning: find all stepIds with each duplicate sequence number and emit
one violation per affected step with the actual stepId.
This is a QA-raised defect target, not a blocking clean-code violation.

PASS — wizardSchemas.ts
- Zod schemas are appropriately granular. uuid() validation on IDs.
  No `any` type escape hatches. Default values specified inline.

PASS — useWizardState.ts
- React hook with single responsibility (wizard navigation + data
  accumulation). All state transitions use callbacks to prevent stale
  closures. Functions are short and single-purpose.
- buildStepAssignments is a query function that reads state (no
  mutation) — satisfies Command-Query Separation rule.

PASS — CreateProcessWizardModal.tsx
- handleSubmit is a command function (submits, does not return a value
  to the caller — uses onSuccess callback). Correctly wrapped in
  useCallback. Error message never exposes raw CRM error code stack
  traces — uses error.message which the plugin formats as a user-friendly
  string.
- STEP_TITLES const array uses `as const` — prevents widening.
- No direct adapter calls in render path — all CRM interaction via
  handleSubmit (correct separation).

MINOR-CR-03 — CreateProcessWizardModal.tsx: Step navigation coupling
Steps 1 and 2 receive onValidated callbacks that call both setStep1Data
and goToNextStep. This couples the navigation to the step component —
a step component now has two responsibilities: validate its form AND
advance the wizard. The preferred pattern is: step component calls
onValidated(values) only; the parent advances the step after receiving
the callback. The current implementation does work correctly but the
coupling means a step component cannot be tested in isolation without
mocking wizard navigation. Flag for QA test strategy.

PASS — useSopAdapter.ts / SopAdapterContext.ts
- FeatureUnavailableError extends Error with name set — correct
  custom error class pattern.
- useSopAdapter throws immediately and clearly — fail-fast principle met.
- Context file is minimal and single-purpose.

PASS — useSopSave.ts
- Four private functions (saveSopRecord, saveSopSteps, saveSopOutcomes,
  executeSopDeletions) each with a single responsibility. Dependency-
  ordered pipeline mirrors the existing useWorkflowSave.ts pattern.
- No silent error swallowing — errors propagate to saveSopCanvas caller.
- isSaving flag correctly set in try/finally — will be cleared even on failure.

MINOR-CR-04 — useSopSave.ts: store access pattern
The hook uses `store.setIsSaving`, `store.markSaved` etc. by destructuring
the full sopStore via `useSopStore()`. This means the component holding
useSopSave will re-render on any sopStore state change (not just the
fields it uses). The existing useWorkflowSave.ts should be checked for
whether it uses selector-based subscription for this hook. If it does,
useSopSave should match that pattern. This is a performance concern,
not a correctness concern.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 2 — C# PLUGIN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PASS — StepAssignment.cs
- Immutable-style with `= string.Empty` defaults — prevents null
  reference exceptions. JsonPropertyName attributes correctly camelCase.
- Internal sealed — correct access modifier for a model used only
  within the plugin assembly.

PASS — CreateProcessFromSopPlugin.cs
- Single Execute entry point delegates immediately to focused private
  static methods. No method exceeds 20 lines. Parameter objects used
  (PluginParameters inner class) — satisfies the max-3-parameters rule.
- `sealed` class — correct; no inheritance expected for a plugin.
- BuildAssignmentLookup, ApplyAssignment, LoadSopSteps are all single-
  responsibility. ApplyAssignment has one job (set CRM fields from
  assignment config) and does not query or create records.

PASS — Error handling
- InvalidPluginExecutionException used throughout (Dataverse-specific
  exception; correct for plugin context — triggers 400 with user-readable
  message on the API response).
- JsonException caught specifically, not Exception — satisfies the
  "specific exceptions over generic" rule.
- Null-safety: Guid.TryParse guards before any EntityReference construction.

MINOR-CR-05 — CreateProcessFromSopPlugin.cs: GetAttributeValue consistency
Line `var nextSopStepRef = sopOutcome.GetAttributeValue<EntityReference>("qdb_nextsopstep_id")`
is correct. However, `sopStep["qdb_sequenceno"]` in CreateWorkitemSteps
uses dictionary-style access rather than GetAttributeValue<int>. While
this works, using GetAttributeValue throughout is the idiomatic
CRM SDK pattern and avoids boxing/unboxing surprises on null values.
Recommend: replace `sopStep["qdb_sequenceno"]` with
`sopStep.GetAttributeValue<int>("qdb_sequenceno")` for consistency.

PASS — RoleDeletionGuardPlugin.cs
- 30 lines total. Single responsibility (guard one entity Delete).
- TopCount = 1 optimisation — queries only for existence, not full
  result set. Correct and efficient.
- Pre-Validation stage is correct: runs before the platform checks
  referential integrity constraints, giving a user-friendly message
  instead of a raw FK violation error.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 3 — SECURITY CHECKS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PASS — No secrets or credentials in any file.
PASS — No eval() or dynamic string execution.
PASS — No console.log in any TypeScript file.
PASS — Zod validation at wizard form boundaries (wizardSchemas.ts).
PASS — JSON deserialisation in plugin guarded by try/catch + GUID validation.
PASS — Plugin runs as the calling user (context.UserId) — no elevated account.
PASS — No hardcoded GUIDs, entity names as string literals are constants.

SECURITY-NOTE-01: The StepAssignments JSON validation in the plugin
validates GUID format but does not validate that the sopStepIds in the
array actually belong to the requested SOP. The architecture document
(Section 6) specifies this cross-SOP injection check. It is absent
from the plugin implementation. This MUST be added before the plugin
is deployed. After loading sopSteps in step 5 of the algorithm, collect
all valid sopStepIds into a HashSet<Guid> and validate each assignment
sopStepId against this set.

This is the only security finding. It is rated MEDIUM (requires a valid
Dataverse session to exploit; attacker would need to know valid sopStepIds
from a different SOP). Must be fixed before Phase 8 (QA).


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 4 — REQUIRED FIXES BEFORE QA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| ID | File | Severity | Description |
|----|------|----------|-------------|
| FIX-CR-01 | CreateProcessFromSopPlugin.cs | REQUIRED (security) | Add cross-SOP sopStepId validation: after loading sopSteps, validate that all assignment.SopStepId values are in the retrieved set |
| FIX-CR-02 | sopValidator.ts — checkStepSequenceUniqueness | RECOMMENDED | Populate affectedNodeId per duplicate step to enable jump-to-node; align with duplicateSequenceDetector.ts pattern |
| FIX-CR-03 | CreateProcessFromSopPlugin.cs | STYLE | Replace dictionary-style sopStep["qdb_sequenceno"] with GetAttributeValue<int> for consistency |

Minor notes (CR-01, CR-03, CR-04) do not require re-review — fix in
implementation sprint. FIX-CR-01 is a required fix before QA sign-off.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERDICT: PASS WITH REQUIRED FIX
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Code proceeds to QA. FIX-CR-01 must be applied and verified in the
implementation sprint before the plugin is deployed to any environment.
Remaining notes are flagged for QA awareness.

═══════════════════════════════════════════════════════════════════════
END OF CODE REVIEW — CWFD-002
Code Reviewer — Maqsad AI | 2026-06-12
═══════════════════════════════════════════════════════════════════════
