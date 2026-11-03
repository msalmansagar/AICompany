# DFE-ENH-001 — Phase 3 Architecture: Phase 1 Hardening & Authoring Integrity
**Engagement ID:** DFE-ENH-001
**Prepared by:** Maqsad AI — Architect
**Date:** 2026-07-10
**Phase gate:** Architecture (Phase 3) — feeds Architecture CEO checkpoint before Phase 1 build authorization
**Status:** DRAFT — Pending CEO Architecture Checkpoint Approval

---

## 1. System Context

### 1.1 Platform recap

The DFE Form Designer is a React 18 + Fluent UI v9 web resource hosted inside a Dataverse solution
(`org5869857f`). It persists all authoring state to Dataverse custom entities (`qdb_*`) via the
OData v4 Web API. The backend is a set of C# plugins (registered on Dataverse system events) that
enforce business logic and write the render cache on publish. A shared `@qdb/shared` package
contains the `ExpressionEngine` (pure recursive-descent evaluator, no `eval`), `ExpressionEngineServer`
(server-side policy wrapper with length/ops/time limits), and all shared TypeScript types.

### 1.2 Pre-conditions confirmed before this document

| Condition | Status | Evidence |
|---|---|---|
| C-001 QDB Accessibility Officer named | CLEARED | Internal QDB officer designated — sign-off authority for ENT-008 |
| C-002 Dataverse etag/If-Match confirmed live | CLEARED | Live probe on `qdb_form_definition` confirmed 412 on stale etag, 204 on correct etag |
| C-003 STYLE-001 status and FR-009/FR-012(b) ownership | CLEARED | STYLE-001 is ACTIVE; FR-009 owned by ENH-001 branched from `feat/dfe-designer-style-load`; FR-012(b) deferred to STYLE-001 |

### 1.3 Phase 1 scope

Phase 1 requirements addressed in this document:

| ID | Title | Category |
|---|---|---|
| FR-001 | Optimistic concurrency (etag/If-Match + conflict dialog) | Integrity |
| FR-002 | Concurrent-edit presence indicator (heartbeat banner) | Integrity |
| FR-003 | Design-time config linter | Authoring |
| FR-006 | Conditional-required / dynamic validation | Rules |
| FR-007 | Cross-field validation UI editor | Rules |
| FR-009 | Keyboard-accessible drag-drop + dnd-kit robustness | UX |
| ENT-005 | Field-level audit (append-only) | Governance |
| ENT-008 | WCAG 2.1 AA test harness | Accessibility |
| ENT-010 | Large-form virtualization | Scale |
| FR-012(a) | Form Code auto-derive fix | UX |
| Diff Core | microdiff adoption (FR-001 now; FR-004 Phase 2 data layer) | Shared |

Not in Phase 1: FR-004 (Phase 2), ENT-001 (Phase 2), ENT-002 (Phase 2), ENT-003 (Phase 2),
FR-012(b) (deferred to STYLE-001).

### 1.4 Technology ground truth

| Layer | Technology |
|---|---|
| Designer frontend | React 18, Fluent UI v9, dnd-kit, Zustand + immer, Vite, Zod |
| Shared engine | In-house `ExpressionEngine` / `ExpressionEngineServer` (recursive-descent, no eval) |
| Persistence | Dataverse Web API (OData v4, org5869857f) |
| Testing | Vitest + Playwright |
| New Phase 1 deps (adopted) | `microdiff` v1.5.x (diff core), `@tanstack/react-virtual` v3.x (virtualization), `@axe-core/playwright` v4.x + `vitest-axe` v0.1.x (a11y) |

---

## 2. Component Designs

### 2.1 FR-001 / FR-002 — Concurrent Edit Protection and Presence Indicator

#### 2.1.1 Etag concurrency flow (FR-001)

**DataverseApiClient — etag enforcement layer**

Every outbound PATCH and DELETE request from the designer must pass through a single
`DataverseApiClient` wrapper. This client:

1. Reads the stored etag for the target record ID from the `EtagStore` (Zustand slice)
2. Adds `If-Match: <etag>` to the request headers before dispatch
3. On a **204 No Content** response, reads the updated etag from the `OData-EntityId` response
   header (or issues a lightweight `GET $select=modifiedon` to the same record URL) and
   writes the new etag back to `EtagStore`
4. On a **412 Precondition Failed** response, does NOT retry silently; instead, dispatches a
   `CONCURRENCY_CONFLICT` action to the Zustand store, which halts autosave and surfaces the
   `ConflictResolutionDialog`
5. Any PATCH attempted without an etag in `EtagStore` throws a `MissingEtagError` at the client
   layer — no silent bypass is permitted

**EtagStore slice (Zustand)**

```
EtagStore {
  etagMap: Record<string, string>     // Dataverse record ID → '@odata.etag' value
  conflictState: ConflictState | null // null when no conflict is active
}

ConflictState {
  recordId: string
  localSnapshot: FormDefinition       // the editor's unsaved in-memory state
  conflictedAt: Date
  modifiedByDisplayName: string       // resolved from the 412 response headers / follow-up GET
}
```

`etagMap` is populated on every GET during `loadForm`. Every entity touched during the load
(form definition, tabs, sections, fields, validation rules, business rules, submission mappings,
translations) must capture its etag and store it keyed by record ID.

**ConflictResolutionDialog component**

Surfaces on `conflictState !== null`. Contains:

- Heading: "Save conflict — your changes were not saved"
- Body: "[Display Name] saved this form at [HH:MM:SS]. Your local changes were not applied."
- "Review what changed" button — opens a read-only `FormDiffPanel` (see §2.9) diffing
  `conflictState.localSnapshot` against the freshly-fetched server version
- "Reload latest version" button — prompts "You will lose your unsaved changes. Continue?"
  then dispatches `loadForm(formId)` which overwrites local state with server state and clears
  `conflictState`
- "Keep editing" button (tertiary) — dismisses the dialog but leaves `conflictState` set;
  autosave remains halted; a persistent warning banner remains visible until the conflict is
  resolved

The dialog is accessible: `role="alertdialog"`, `aria-modal="true"`, focus is trapped on open,
focus returns to the trigger element on close.

#### 2.1.2 Autosave debounce/queue design

The designer PATCHes on change. With etag concurrency, unthrottled PATCHes would exhaust
Dataverse's API limits and race each other's etag refreshes.

**Autosave queue:**

```
AutosaveQueue {
  pendingBatch: PatchOperation[]   // accumulated since last flush
  flushTimer: number | null        // setTimeout handle (1500ms debounce)
  inflightRequest: boolean         // true while a PATCH is awaiting response
}
```

Behaviour:

1. On every user change event: the change is applied to Zustand state immediately (optimistic
   local update); the change is also appended to `pendingBatch`
2. The flush timer is reset to 1500ms on every change (debounce)
3. When the timer fires: if `inflightRequest` is true, reschedule for 1000ms (backpressure);
   otherwise flush the entire `pendingBatch` as a single multi-record PATCH (or sequential
   PATCHes for different record types)
4. After a successful flush: clear `pendingBatch`, update all etags, set `inflightRequest =
   false`
5. On a 412 response: set `inflightRequest = false`, drain `pendingBatch` (discard it or hold
   it for conflict resolution), surface the `ConflictResolutionDialog`

**Why 1500ms debounce?**
Dataverse has a per-user throttle (~6 requests/second sustained on standard org). A 1500ms
debounce ensures that rapid typing (e.g., editing a label character-by-character) collapses
into a single PATCH per field, staying well within throttle limits. The BRD's NFR-002 (save
confirms within 2s) is met: the PATCH is dispatched within 1500ms of the last change, and
Dataverse confirms within the standard sub-100ms round-trip on LAN.

#### 2.1.3 Presence indicator design (FR-002)

**Decision: Dataverse heartbeat entity `qdb_dfe_edit_lock`**

See ADR-001 for the full rationale. The chosen approach uses a lightweight Dataverse record
created on form open, updated every 60 seconds, and deleted on form close.

**qdb_dfe_edit_lock entity schema** (see §3.1 for full column list)

**PresenceService (designer service layer)**

```
PresenceService {
  writeLock(formId: string, userId: string, displayName: string): Promise<void>
  refreshLock(lockId: string): Promise<void>
  releaseLock(lockId: string): Promise<void>
  queryActiveLocks(formId: string): Promise<LockRecord[]>
}
```

Lifecycle:

1. On `loadForm`: `PresenceService.queryActiveLocks(formId)` — check for existing locks
   whose `qdb_last_heartbeat` is within 90 seconds. If found, show `PresenceBanner`.
2. Immediately after: `PresenceService.writeLock(...)` — create a lock record for the
   current user (UPSERT on `qdb_form_id + qdb_editor_user_id` to prevent duplicate records
   for the same user on reconnect).
3. Every 60 seconds: `PresenceService.refreshLock(lockId)` — PATCH `qdb_last_heartbeat` to
   `now`.
4. On tab/window close (`beforeunload`): `PresenceService.releaseLock(lockId)`.
5. Heartbeat query (every 30 seconds from the banner): `PresenceService.queryActiveLocks(formId)`
   excluding own `lockId`. If no live locks remain, dismiss the banner without page reload.

**PresenceBanner component**

Non-blocking Fluent UI `MessageBar` (type `warning`) rendered above the canvas:
"This form is also open by [Display Name] since [HH:MM]. Editing simultaneously may cause
conflicts."

The banner auto-dismisses when `queryActiveLocks` returns empty. It does not prevent editing.

**API throttle calculation for NFR-003 (50 concurrent sessions):**

Each session issues:
- 1 heartbeat write every 60 seconds
- 1 banner refresh query every 30 seconds

Total per-session: 3 requests/minute = 0.05 req/s.
50 sessions: 2.5 req/s across the org — well within Dataverse's standard 6 req/s per user
limit and the org-wide limit of ~100 req/s for operations. This is safe.

#### 2.1.4 Conflict response sequence (end-to-end)

```
Editor B (late saver)                     Dataverse
       |                                       |
       |-- GET form (with etagMap) ----------->|
       |<- 200 + @odata.etag: W/"187623029" --|
       |                                       |
  [Editor A saves; Dataverse etag changes]     |
       |                                       |
       |-- PATCH If-Match: W/"187623029" ----->|
       |<- 412 Precondition Failed ------------|
       |                                       |
  [AutosaveQueue drains; conflictState set]    |
       |                                       |
  [ConflictResolutionDialog opens]             |
       |                                       |
  [User clicks "Review what changed"]          |
       |-- GET form (no If-Match) ------------>|
       |<- 200 + latest version + new etag ----|
       |                                       |
  [microdiff(localSnapshot, latestVersion)]    |
  [FormDiffPanel renders additions/removals]   |
       |                                       |
  [User clicks "Reload latest"]               |
       |  [conflictState cleared; store        |
       |   updated to latest; autosave         |
       |   resumes with new etag]              |
```

---

### 2.2 FR-003 — Design-Time Config Linter

#### 2.2.1 FormLinter class design

`FormLinter` is a pure-function class in the designer's service layer. It has no Zustand
dependency and takes a snapshot of the form definition as input. This ensures it can be called
from both the live in-designer context and the pre-publish gate without coupling.

```
FormLinter {
  // Run all lint rules on a form snapshot. Returns a flat list of results.
  static lint(form: FormDefinition, crmMeta: CrmAttributeCache): LintResult[]

  // Individual rule methods — each is independently testable
  static checkDuplicateSchemaNames(form: FormDefinition): LintResult[]
  static checkRequiredFieldsWithNoMapping(form: FormDefinition): LintResult[]
  static checkOrphanedSubmissionMappings(form: FormDefinition, crmMeta: CrmAttributeCache): LintResult[]
  static checkOrphanedRuleReferences(form: FormDefinition): LintResult[]
  static checkEmptyContainers(form: FormDefinition): LintResult[]
  static checkConditionalRequiredMapping(form: FormDefinition): LintResult[]
  static checkCrossFieldRuleReferences(form: FormDefinition): LintResult[]
  static checkScaleLimits(form: FormDefinition): LintResult[]
}
```

**LintResult type:**

```
LintResult {
  severity: 'error' | 'warning' | 'info'
  code: string                    // e.g. "L001", "L007"
  message: string                 // human-readable, field-name-interpolated
  affectedNodeIds: string[]       // Dataverse record IDs of fields/sections/tabs involved
  affectedNodeLabels: string[]    // display labels for the affected nodes (for panel display)
  ruleId?: string                 // only set when the result references a specific rule record
}
```

**CrmAttributeCache:**

```
CrmAttributeCache {
  entityName: string
  attributes: string[]            // logical names of all attributes on the CRM entity
  fetchedAt: Date
}
```

The cache is populated once per designer session on `loadForm` by fetching
`/api/data/v9.2/EntityDefinitions(LogicalName='<entity>')/Attributes?$select=LogicalName`.
It is stored in a Zustand slice (not the linter class) and passed into `FormLinter.lint()`.
TTL: session-scoped (no periodic refresh needed — attribute schema does not change during an
editing session in normal operations).

#### 2.2.2 Lint rule catalogue

| Code | Severity | Rule | Description |
|---|---|---|---|
| L001 | error | Duplicate schemaName | Two or more fields share the same `schemaName` value across all tabs/sections |
| L002 | warning | Required field without mapping | A field with `isRequired: true` has no entry in `submissionMappings` |
| L003 | warning | Orphaned submission mapping | A `submissionMapping` target attribute does not exist in `crmMeta.attributes` |
| L004 | error | Orphaned validation rule reference | A validation rule's `fieldRef` (or `targetFieldRef` for cross_field) does not match any field's `schemaName` in the form |
| L005 | error | Orphaned business rule reference | A business rule condition's `fieldRef` or action's `fieldRef` does not match any field's `schemaName` |
| L006 | info | Empty container | A tab contains no sections, or a section contains no fields |
| L007 | warning | Conditional-required field without mapping | A field with a `conditional_required` validation rule has no submission mapping (even though it is not unconditionally required) |
| L008 | error | Cross-field rule references deleted field | A `cross_field` rule's `targetFieldRef` does not match any existing field `schemaName` |
| L009 | info | Approaching field count limit | Form has ≥ 160 fields (80% of 200 limit) |
| L010 | error | Field count limit exceeded | Form has > 200 fields |
| L011 | info | Approaching rule count limit | Form has ≥ 40 business rules (80% of 50 limit) |
| L012 | error | Rule count limit exceeded | Form has > 50 business rules |
| L013 | warning | PII field with Public sensitivity | A field with any PII category ≠ None has sensitivity level = Public (Phase 2 PII metadata — pre-wire now; rule activates when ENT-003 ships) |

Rules L001–L008 are active in Phase 1. L009–L012 implement ENT-010 scale limit enforcement.
L013 is pre-wired but dormant until Phase 2 adds PII metadata fields to the form definition.

#### 2.2.3 Execution points

**Live in-designer (debounced):**
- Triggered on every Zustand state change via a `useEffect` subscription
- Debounced 500ms to prevent per-keystroke re-runs
- Results stored in a `lintResultsSlice` in Zustand: `{ results: LintResult[], lastRan: Date }`
- A `LintingStatusBar` component reads from this slice and shows an icon badge (error/warning count)

**Pre-publish gate:**
- Called synchronously when the user clicks "Publish" or "Request Publish" (Phase 2)
- Runs before any API call to the publish pipeline
- Errors (`severity === 'error'`) block publish and are displayed in `PublishValidationScreen`
- Warnings (`severity === 'warning'`) are displayed with an acknowledgement checkbox per warning
- Info results are displayed but do not require acknowledgement

**Integration with PublishValidationScreen:**
`PublishValidationScreen` currently accepts a `ValidationResult[]` from the existing publish
validation pipeline. `FormLinter.lint()` results are mapped to this existing contract:
`severity: 'error'` → `type: 'blocking'`; `severity: 'warning'` → `type: 'warning'`; `severity:
'info'` → `type: 'info'`. No changes to `PublishValidationScreen`'s interface are required —
lint results are injected as additional items in the existing list.

#### 2.2.4 Click-to-navigate

The `LintingPanel` (a collapsible panel in the designer sidebar) renders each `LintResult` as
a clickable row. On click:

1. Dispatch `selectNode(affectedNodeIds[0])` to Zustand
2. The canvas scroll-to effect is driven by an existing `useScrollToSelected` hook (pre-existing
   infrastructure); no new scroll logic is needed
3. If the affected node is a rule (not a field), the rule editor opens for that rule

---

### 2.3 FR-006 / FR-007 — ExpressionEngine Extension for Validation Rules

#### 2.3.1 Decision: EXTEND the incumbent ExpressionEngine, not adopt a second engine

The existing validation rule schema uses a structured-condition format (not the expression
string DSL). The DSL (`ExpressionEngine`) evaluates free-form string expressions for calculated
values and custom expressions. The structured-condition format is used by the condition builder
UI: `{ fieldRef: string, operator: string, value: ExpressionValue }`.

FR-006 and FR-007 operate on the structured-condition format. Extending this format is a
targeted schema addition with no impact on `ExpressionEngine.ts` itself.

See ADR-005 for the formal adopt-vs-extend decision record.

#### 2.3.2 Schema extension

**Current ValidationRule type (representative):**

```
ValidationRule {
  id: string
  fieldSchemaName: string
  type: ValidationRuleType          // enum: 'required' | 'min_length' | 'max_length' |
                                    //       'min_value' | 'max_value' | 'regex' |
                                    //       'cross_field' | 'custom_expression'
  conditions?: RuleCondition[]      // existing structure — when conditions are all true
  value?: ExpressionValue           // for range/length/regex rules
  message: string
  sortOrder: number
}

RuleCondition {
  fieldRef: string
  operator: string                  // '==' | '!=' | '<' | '<=' | '>' | '>='
  value: ExpressionValue
}
```

**Extension for FR-006 (conditional_required):**

Add `'conditional_required'` to `ValidationRuleType`.

```
// New rule type — no new fields required; reuses existing conditions[]
ValidationRule (when type === 'conditional_required') {
  type: 'conditional_required'
  conditions: RuleCondition[]       // all conditions must be true for field to become required
  message?: string                  // optional custom "this field is required" message
  // 'value' field unused; 'fieldSchemaName' = the field that becomes required
}
```

The runtime `ValidationEngine.evaluate()` is extended to:
1. For each `conditional_required` rule on a field: evaluate `conditions` using the existing
   condition evaluator (already shared with the business rule evaluator)
2. If all conditions evaluate to `true`, add `{ fieldSchemaName, isConditionallyRequired: true }`
   to the field's runtime state for this submission
3. At submission, any field in `isConditionallyRequired: true` state with an empty value
   produces a validation error using the rule's `message` (or the default "This field is
   required")
4. Publish validation must NOT apply the L002 lint rule (required-without-mapping) to
   `conditional_required` fields; instead, the L007 rule is applied (warns if no mapping
   at all exists even conditionally)

**Extension for FR-007 (cross_field):**

The `cross_field` type already exists in the enum. The missing piece is a UI editor and a
structured condition type that references two fields.

```
// New condition variant for cross-field comparison
RuleCrossFieldCondition {
  sourceFieldRef: string            // the field the rule is attached to (inferred from rule's fieldSchemaName)
  operator: string                  // '==' | '!=' | '<' | '<=' | '>' | '>='
  targetFieldRef: string            // the OTHER field to compare against
}

// The ValidationRule for cross_field:
ValidationRule (when type === 'cross_field') {
  type: 'cross_field'
  sourceFieldRef: string            // redundant with fieldSchemaName; explicit for serialization clarity
  operator: string
  targetFieldRef: string
  message: string                   // required; author-defined error message
  // conditions[] unused for cross_field (it is itself a condition)
}
```

Cross-field evaluation in `ValidationEngine`:
1. Resolve `sourceFieldRef` and `targetFieldRef` values from the current form submission context
2. Compare them using the `operator`
3. For date fields: parse both values as ISO dates before comparison; all six operators are
   supported
4. For number fields: use numeric comparison
5. For string fields: lexicographic comparison (operator restricted to `==` and `!=` in the
   designer UI to prevent confusing alpha-sort of strings)
6. If comparison fails: apply the `message` to the source field as a validation error

**Serialization:** Both extensions are stored as JSON in the existing `qdb_validation_rule`
entity's `qdb_rule_json` multi-line text field. No new Dataverse entity is needed. The JSON
schema is versioned; a `schemaVersion: 2` field is added to the root of the JSON to distinguish
Phase 1 extended rules from legacy rules. Backward compatibility: rules without `schemaVersion`
are treated as `schemaVersion: 1` and processed by the existing evaluator.

#### 2.3.3 Designer UI extension

**For `conditional_required`:**
- Rule type dropdown in the validation rule editor gains a new option: "Conditional Required"
- On selection: the existing condition builder renders (already exists for business rules)
- No new UI components required; the condition builder is reused exactly as-is
- An optional "Custom required message" text field is shown below the condition builder

**For `cross_field`:**
- Rule type dropdown gains: "Cross-Field Comparison" (surfaces for all field types; the
  designer filters the available operators based on field type)
- UI renders:
  - "Source field": read-only label showing the current field (the rule's host)
  - "Operator": dropdown (`==`, `!=`, `<`, `<=`, `>`, `>=` — filtered by field type)
  - "Compare against": field picker dropdown (shows all fields in the form except the source
    field, filtered by compatible types)
  - "Error message": required text field
- Both fields' labels are shown in the picker, not schema names

#### 2.3.4 Linting integration

FR-003 linting rules L004, L005, L008 are aware of the new rule types:
- L004 traverses `cross_field` rules and checks both `sourceFieldRef` and `targetFieldRef`
- L008 is a targeted lint rule for `cross_field.targetFieldRef` referencing a deleted field
- `conditional_required` rules are traversed for their `conditions[].fieldRef` values in L004/L005

---

### 2.4 FR-009 — Keyboard-Accessible Drag-Drop and dnd-kit Robustness

#### 2.4.1 Resolution of dnd-kit issue #985

See ADR-002 for the full decision record.

**Decision: BUILD a custom `IndexBasedKeyboardSensor`**

The custom sensor replaces the built-in `KeyboardSensor` for the field/section lists. It moves
draggable items by sorted index (not by pixel offset), which is correct for variable-height items.

**`IndexBasedKeyboardSensor` — interface and behaviour:**

```
IndexBasedKeyboardSensorOptions {
  keyboardCodes: {
    lift: string[]          // default: ['Space']
    drop: string[]          // default: ['Space', 'Enter']
    cancel: string[]        // default: ['Escape']
    moveUp: string[]        // default: ['ArrowUp']
    moveDown: string[]      // default: ['ArrowDown']
    altMoveUp: string[]     // default: ['Alt+ArrowUp']   — FR-009 primary binding
    altMoveDown: string[]   // default: ['Alt+ArrowDown'] — FR-009 primary binding
    altShiftMoveUp: string[]    // Alt+Shift+ArrowUp — move to previous sibling container
    altShiftMoveDown: string[]  // Alt+Shift+ArrowDown — move to next sibling container
  }
}
```

Behaviour on `altMoveUp` / `altMoveDown`:
1. Identify the current draggable's index in its sortable context (read from `data-dfe-sortable-index`
   attribute on the DOM node)
2. Calculate the target index (current ± 1)
3. Use `SortableContext`'s `items` array (accessible via dnd-kit's collision detection context)
   to map index to the target droppable ID
4. Move the item by firing a synthetic `DragOver` event to the target droppable, then
   immediately a `DragEnd` event to commit the move
5. After commit: dispatch `moveField` or `moveSection` action to Zustand; push an undo entry
   labeled "Move [field name] up" / "Move [field name] down"
6. Announce via ARIA live region (see §2.4.3)

Behaviour on `altShiftMoveUp` / `altShiftMoveDown`:
- Identifies the parent section/tab of the current item
- Moves to the previous/next sibling section/tab at the same nesting level
- Produces an undo entry labeled "Move [field name] to [section name]"

The sensor is registered in `DndContext` alongside the existing `MouseSensor` and `TouchSensor`:

```
sensors = useSensors(
  useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
  useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  useSensor(IndexBasedKeyboardSensor, { keyboardCodes: DFE_KEYBOARD_CODES }),
)
```

#### 2.4.2 Drag activation constraint tuning (text-selection fix)

**Problem:** Drag activates immediately on mousedown, causing accidental drag initiation when
clicking into text inputs on field cards (label editors, schema name inputs). This also causes
text selection to fail on labels.

**Fix:**
- `MouseSensor` activation constraint: `{ distance: 8 }` — requires 8px of pointer movement
  before drag activation; a click never travels 8px
- `TouchSensor` activation constraint: `{ delay: 200, tolerance: 5 }` — requires 200ms hold
  before drag activation on touch

**Text-selection during drag prevention:**
- Add `data-dfe-dragging` attribute to the canvas root element when `isDragging` is true
- CSS rule: `[data-dfe-dragging] * { user-select: none !important; }` — blocks browser text
  selection during drag
- Remove the attribute on `DragEnd` / `DragCancel`

#### 2.4.3 ARIA live announcements

A single `<div role="status" aria-live="polite" aria-atomic="true">` element is added to the
designer root layout. It is visually hidden (positioned off-screen via CSS) but accessible
to screen readers.

This element is updated (by writing to its `textContent`) on:

| Event | Announcement text |
|---|---|
| Keyboard lift | "Picked up [Field Name]. Current position: [N] of [Total] in [Section Name]. Use Alt+Up and Alt+Down to move." |
| Move | "Moved [Field Name] to position [N] of [Total] in [Section Name]." |
| Drop (commit) | "[Field Name] dropped at position [N] in [Section Name]." |
| Cancel | "Reordering cancelled. [Field Name] returned to its original position." |
| Conflict detected | "Save conflict — this form was modified by another user. Your changes were not saved." |
| Lint error | "[N] configuration errors found. Review the linting panel before publishing." |

#### 2.4.4 Branch coordination (C-003 ruling)

Per ADR-C003, all FR-009 implementation work must be branched from `feat/dfe-designer-style-load`
(the active STYLE-001 branch). The FR-009 workstream modifies canvas component files that
STYLE-001 is also modifying (section containers, field card wrappers). Branching from
`feat/dfe-designer-style-load` ensures FR-009 builds on the STYLE-001 component structure as its
baseline and avoids divergence. When STYLE-001 merges to `main`, the FR-009 branch rebases on
`main` before its own merge.

---

### 2.5 ENT-005 — Field-Level Audit (Append-Only)

#### 2.5.1 Capture mechanism

**immer `produceWithPatches()` at the save boundary**

The designer's Zustand store uses immer middleware for all state mutations. Phase 1 adds
`enablePatches()` at app initialization to activate immer's patch-tracking capability.

Patch capture is NOT performed on every keystroke. It is performed at the **save boundary** —
the moment the `AutosaveQueue.flush()` is about to dispatch a PATCH to Dataverse. At that point:

1. Call `produceWithPatches(previousFormSnapshot, recipe)` where `recipe` applies the queued
   mutations to the snapshot
2. Receive `[nextState, patches, inversePatches]`
3. Pass `(patches, inversePatches, metadata)` to `AuditEntryMapper.mapPatches()`
4. The resulting `AuditEntry[]` is written to the Dataverse audit entity in the same API batch
   as the form PATCH (atomic: either both succeed or the audit entries are not written without
   the corresponding form change)

**AuditEntryMapper — mapping rules:**

```
AuditEntryMapper {
  static mapPatches(
    patches: Patch[],
    inversePatches: Patch[],
    metadata: AuditMetadata
  ): AuditEntry[]
}

AuditMetadata {
  formId: string
  formVersionId: string
  changedBy: string     // current user's systemuser ID
  changedOn: string     // ISO-8601 UTC
}

AuditEntry {
  formId: string
  formVersionId: string
  fieldSchemaName: string           // extracted from path[1] when path[0] === 'fields'
  changePath: string                // JSON Pointer: "/fields/loan_amount/validationRules/0"
  before: string                    // JSON-serialized inversePatches value
  after: string                     // JSON-serialized patches value
  action: 'create' | 'update' | 'delete'  // derived from patch.op
  eventType: AuditEventType         // 'FieldChange' | 'RuleChange' | 'MappingChange' | 'TranslationChange' | ...
  changedBy: string
  changedOn: string
}
```

`eventType` is determined by inspecting `path[0]`:
- `path[0] === 'fields'` → `FieldChange`; `fieldSchemaName` = `path[1]`
- `path[0] === 'validationRules'` → `RuleChange`; `fieldSchemaName` = empty (form-level rule)
- `path[0] === 'businessRules'` → `RuleChange`
- `path[0] === 'submissionMappings'` → `MappingChange`
- `path[0] === 'translations'` → `TranslationChange`

**Batching:** A save event with 10 field changes produces up to 10 `AuditEntry` records. These
are written to Dataverse in a single `$batch` OData request alongside the form PATCH. The batch
is atomic at the OData layer; if the form PATCH fails (e.g., 412), the audit entries are not
written.

#### 2.5.2 Zustand store state shape for previous-snapshot tracking

```
FormDefinitionStore {
  currentDefinition: FormDefinition       // live, editable
  lastSavedSnapshot: FormDefinition       // set to currentDefinition on every successful flush
  // ...other slices
}
```

`lastSavedSnapshot` is the `previousFormSnapshot` passed to `produceWithPatches()`. It is
updated to `currentDefinition` only after a successful 204 response from Dataverse.

#### 2.5.3 Inverse patches as undo source

The `inversePatches` from `produceWithPatches()` are the "undo" operations that would reverse
the change. This is a natural fit for FR-005 (undo/redo extension to translations and mappings)
which ships in Phase 1 scope. The `UndoRedoStack` stores inverse patches; an undo operation
applies `applyPatches(currentState, inversePatches)` to roll back.

---

### 2.6 ENT-008 — WCAG 2.1 AA Test Harness

#### 2.6.1 Toolchain layers

**Layer 1 — E2E / CI gate (`@axe-core/playwright`)**

`@axe-core/playwright` is added to the existing Playwright suite. Every Playwright spec file
that exercises a designer page or rendered form page includes:

```
// Pattern — injected at the end of each test or as a shared afterEach fixture
const accessibilityScanResults = await new AxeBuilder({ page })
  .withTags(['wcag2a', 'wcag2aa'])
  .analyze();
expect(accessibilityScanResults.violations).toHaveLength(0);
```

Minimum coverage for Phase 1:
- Designer canvas page (full form load)
- ConflictResolutionDialog (opened state)
- LintingPanel (with errors visible)
- Rendered single-step form (English + Arabic/RTL)
- Rendered multi-step form

Zero AA violations is a hard CI gate — a PR introducing new violations is blocked.

**Layer 2 — Component unit tests (`vitest-axe`)**

`vitest-axe` provides `expect(container).toHaveNoViolations()` for Vitest + jsdom.

Applied to isolated component tests for:
- `ConflictResolutionDialog`
- `LintingPanel`
- `PresenceBanner`
- `IndexBasedKeyboardSensor` keyboard affordance elements (drag handles, live region)
- `FormDiffPanel` (Phase 2 component, pre-wired now)

**Requirement for jsdom:** `vitest-axe` requires the jsdom environment (not happy-dom).
Components currently using happy-dom must be migrated to jsdom. This is a one-line change per
spec file (`@vitest-environment jsdom`) and does not affect test logic. Estimated scope: audit
existing test files and migrate the relevant component tests.

**Layer 3 — Manual audit (NVDA + VoiceOver)**

A manual checklist at `projects/dfe-designer-enhancements/a11y-manual-checklist.md` is created
as part of Phase 1. The checklist covers:

- Single-step form: tab order, visible focus indicators, field label announcements, error
  announcements, required-field announcements, form landmark structure
- Multi-step form: step indicator announcements, navigation button announcements, progress
  announcement
- RTL Arabic form: label directionality, field order, error message position
- Designer canvas: drag handle announcements, lint result announcements, conflict dialog
  focus management

Sign-off: QDB internal Accessibility Officer (C-001 cleared). The officer reviews the checklist
plus the axe-core scan report and co-signs the ENT-008 acceptance criteria.

#### 2.6.2 Remediation approach

Phase 1 delivers:
1. The toolchain (Layers 1 and 2 wired into CI)
2. An initial axe-core scan run against the current designer and runtime — the violations inventory
3. Remediation of all discovered AA violations within Phase 1 scope
4. A signed-off compliance report produced at Phase 1 close

Contingency: R-005 from the CEO risk register — WCAG remediation may exceed the estimated XL
effort. A 3-5 developer-day contingency buffer is reserved in the Phase 1 build breakdown.
If the violation inventory reveals > 20 distinct violations, an immediate CEO notification is
required before remediation begins, so scope/timeline adjustments can be authorized.

---

### 2.7 ENT-010 — Large-Form Virtualization

#### 2.7.1 @tanstack/react-virtual integration

`@tanstack/react-virtual` v3.x is adopted for virtualized rendering of the field list. The
canvas renders three levels: tabs → sections → fields. Only the field list within a section
is virtualized (sections and tabs are small in count: max 20 sections, max 10 tabs, which
render without virtualization overhead).

**Virtualization threshold:**
- A section with **≤ 30 fields** renders with the existing non-virtualized list (no change)
- A section with **> 30 fields** (or a form with > 100 fields total) switches to the virtualized
  renderer
- The threshold is configurable via a Zustand config slice with a default of 30

**useVirtualizer configuration:**

```
useVirtualizer({
  count: fields.length,
  getScrollElement: () => sectionScrollRef.current,
  estimateSize: (index) => {
    const field = fields[index];
    if (field.type === 'section') return 80;
    if (field.isExpanded) return 120;
    return 56;
  },
  overscan: 5,     // render 5 extra items above and below the visible window
})
```

`overscan: 5` prevents blank flashes during rapid keyboard navigation (Alt+Up/Down while items
scroll into view).

**Variable-height measurement:**
Estimated heights (above) are used initially. After the first render, `@tanstack/react-virtual`
measures actual rendered heights and uses them for subsequent scroll calculations. This is the
default v3 behavior (auto-measurement via `ResizeObserver`).

#### 2.7.2 Composition with dnd-kit DragOverlay

The standard pattern for virtual lists + dnd-kit:

1. The virtual list renders each item at its virtual position using `style={{ transform: ...
   virtualItem.start }}`
2. When a drag begins, the source item becomes a **ghost placeholder** at its original virtual
   position (same height, visually dimmed with `opacity: 0.4`)
3. The `DragOverlay` (outside the virtual list, in the `DndContext` root) renders a **full
   clone** of the dragged field card following the cursor/keyboard position
4. Drop targets in the virtual list respond to `useSortable`'s `isOver` state to show insertion
   indicators

Because the `DragOverlay` renders outside the virtual list's scroll container, the clone is
not culled by the virtualizer when the user drags to a position outside the visible window.
The virtualizer's scroll follows the drag position via `scrollToIndex` called in the
`onDragMove` handler.

**Implementation note:** The `IndexBasedKeyboardSensor` (§2.4.1) is aware of the virtualized
context. When determining the target index for an Alt+Up/Alt+Down move, it reads from the
Zustand `fields` array (the authoritative order), not from the DOM (which may not have rendered
the target position). The DOM is updated by the Zustand state change, not by the sensor directly.

#### 2.7.3 Scale limit enforcement (ENT-010 documentation component)

Scale limits are enforced at the Zustand action layer — before the API call is made:

| Limit | Warning threshold | Block threshold | Zustand action |
|---|---|---|---|
| Fields per form | 160 | 200 | `addField` |
| Business rules per form | 40 | 50 | `addBusinessRule` |
| Sections per tab | 16 | 20 | `addSection` |
| Tabs per form | 8 | 10 | `addTab` |
| Nesting depth | 4 levels | 5 levels | `addSection` (nested) |

Warning: dispatch `showScaleLimitWarning(limit, current)` — renders a yellow Fluent UI
`MessageBar`.
Block: dispatch `showScaleLimitError(limit)` — renders a red `MessageBar`; the add operation is
aborted before any API call.

These limits are also reported by `FormLinter` as L009–L012 (info/error severity).

---

### 2.8 FR-012(a) — Form Code Auto-Derive Fix

#### 2.8.1 State design

The create-wizard Zustand slice gains one new field:

```
CreateWizardSlice {
  formName: string
  formCode: string
  isFormCodeManuallyEdited: boolean   // NEW — default: false

  setFormName(name: string): void
  // If !isFormCodeManuallyEdited, also sets formCode = slugify(name)

  setFormCode(code: string): void
  // Always sets isFormCodeManuallyEdited = true before updating formCode
}
```

**`slugify` algorithm:**
1. Lowercase the input
2. Replace sequences of non-alphanumeric characters (except existing hyphens) with a single
   hyphen
3. Strip leading and trailing hyphens
4. Truncate to 50 characters

Example: `"Loan Application Form (2026)"` → `"loan-application-form-2026"`

**`setFormName` logic:**
```
setFormName(name) {
  update state.formName = name
  if (!state.isFormCodeManuallyEdited) {
    update state.formCode = slugify(name)
  }
  // if isFormCodeManuallyEdited is true: do NOT touch formCode
}
```

**`setFormCode` logic:**
```
setFormCode(code) {
  update state.isFormCodeManuallyEdited = true
  update state.formCode = code
}
```

This is a pure Zustand state change — no API call, no debounce needed. The fix is entirely
in the create-wizard slice and the two input handlers. No other component is affected.

---

### 2.9 Diff Core — microdiff

#### 2.9.1 microdiff adoption

`microdiff` v1.5.x is adopted as the diff data layer for both FR-001 (conflict dialog) and
FR-004 (Phase 2 version diff viewer).

`microdiff(before, after)` returns `DiffEntry[]`:
```
DiffEntry {
  type: 'CREATE' | 'REMOVE' | 'CHANGE'
  path: string[]
  oldValue?: unknown      // present for CHANGE and REMOVE
  value?: unknown         // present for CHANGE and CREATE
}
```

**`FormDiffService` wrapper:**

```
FormDiffService {
  static diff(before: FormDefinition, after: FormDefinition): FormDiff
  static summarize(diff: FormDiff): DiffSummary
}

FormDiff {
  entries: DiffEntry[]
  fieldsAdded: string[]          // schemaNames of added fields
  fieldsRemoved: string[]
  fieldsChanged: FieldChangeSummary[]
  rulesAdded: string[]
  rulesRemoved: string[]
  tabsChanged: string[]
  translationsChanged: boolean
  themeChanged: boolean
}

DiffSummary {
  totalChanges: number
  humanReadable: string          // "3 fields changed, 1 rule removed, translations updated"
}
```

**FR-001 use (conflict dialog):**
When the `ConflictResolutionDialog` is open:
1. Fetch the latest server version of the form (GET without If-Match)
2. `FormDiffService.diff(localSnapshot, serverVersion)` → `FormDiff`
3. `FormDiffService.summarize(diff)` → `DiffSummary` — shown in the dialog body
4. If user clicks "Review what changed" → render `FormDiffPanel` (see Phase-2 visual renderer
   design below)

**FR-004 use (Phase 2):**
`FormDiffService.diff(versionA.definition, versionB.definition)` feeds the `FormDiffViewer`
component (see §2.9.2).

#### 2.9.2 Phase-2 visual diff renderer

See ADR-003 for the decision record.

**Decision: BUILD a custom `FormDiffViewer` React component**

The `FormDiffViewer` receives a `FormDiff` object and renders it as a two-panel (before/after)
collapsible display:

Layout:
- One collapsible section per change category: Fields, Rules, Tabs/Sections, Translations, Theme
- Within each section: a list of individual changes
  - Added items: green left border, "+" badge
  - Removed items: red left border, "−" badge
  - Changed items: amber left border, "~" badge; shows before value (red text) → after value
    (green text)
- Each changed item has a "Jump to field" link that dispatches `selectNode` in Zustand

Fluent UI v9 components used: `Accordion`, `AccordionItem`, `Text`, `Badge`, `Button`.
No third-party diff rendering library.

Estimated size: 100–130 lines of TypeScript/TSX.

This component is designed in Phase 1 (as it is needed for the FR-001 conflict dialog's
"Review what changed" path) and also used in Phase 2 for FR-004.

---

## 3. Data Model Additions

### 3.1 New Entity: `qdb_dfe_edit_lock` (Presence Heartbeat)

**Purpose:** FR-002 presence indicator. One record per active editor per form. TTL = 90 seconds
(record is considered stale if `qdb_last_heartbeat` is older than 90 seconds from now).

**Entity prefix:** `qdb_dfe_`

| Column logical name | Display name | Type | Notes |
|---|---|---|---|
| `qdb_dfe_edit_lockid` | Edit Lock | GUID (PK) | Auto-generated |
| `qdb_form_id` | Form | Lookup → `qdb_form_definition` | Required; the form being edited |
| `qdb_editor_user_id` | Editor | Lookup → SystemUser | Required; the Dataverse user editing |
| `qdb_editor_display_name` | Editor Display Name | Single-line text (200) | Denormalized for fast banner reads without join |
| `qdb_session_id` | Session ID | Single-line text (100) | Browser session identifier (UUID generated client-side); distinguishes multiple tabs by the same user |
| `qdb_last_heartbeat` | Last Heartbeat | DateTime (UTC) | Updated every 60 seconds; stale if > 90s ago |
| `qdb_opened_at` | Opened At | DateTime (UTC) | Set on lock creation; shown in banner as "since HH:MM" |
| `createdon` | Created On | DateTime | Standard audit column |
| `createdby` | Created By | Lookup → SystemUser | Standard audit column |
| `modifiedon` | Modified On | DateTime | Standard audit column |
| `modifiedby` | Modified By | Lookup → SystemUser | Standard audit column |

**Indexes:**
- Composite index on `qdb_form_id` + `qdb_last_heartbeat` — supports the `queryActiveLocks` query
- Composite index on `qdb_form_id` + `qdb_editor_user_id` — supports UPSERT on reconnect

**Retention:** Records should be deleted when the session closes. A nightly cleanup job (Power
Automate scheduled flow) deletes records with `qdb_last_heartbeat` older than 24 hours as a
safety net against orphaned records from browser crashes.

**Security:** The `qdb_dfe_edit_lock` entity grants CREATE, READ, WRITE (for heartbeat refresh),
DELETE (for graceful release) to all users who have designer access. No special role needed.

### 3.2 Enhanced Entity: `qdb_dfe_audit_log` (Field-Level Change History)

The BRD notes an existing audit log entity. Phase 1 either extends the existing entity with
new columns or creates a purpose-built entity — the latter is chosen to avoid breaking the
existing audit log's query patterns and to enforce the append-only constraint cleanly on a
separate entity.

**Entity logical name:** `qdb_dfe_audit_log` (new, replacing or supplementing the existing one)

| Column logical name | Display name | Type | Notes |
|---|---|---|---|
| `qdb_dfe_audit_logid` | Audit Log Entry | GUID (PK) | Auto-generated |
| `qdb_form_id` | Form | Lookup → `qdb_form_definition` | Required |
| `qdb_form_version_id` | Form Version | Lookup → `qdb_form_version` | Optional — null for pre-version-history saves |
| `qdb_field_schema_name` | Field Schema Name | Single-line text (200) | The `schemaName` of the field that changed; empty for form-level changes |
| `qdb_change_path` | Change Path | Single-line text (512) | JSON Pointer path (e.g. `/fields/loan_amount/validationRules/0`) |
| `qdb_before_value` | Before Value | Multiline text (10000) | JSON-serialized prior state; null for CREATE actions |
| `qdb_after_value` | After Value | Multiline text (10000) | JSON-serialized new state; null for DELETE actions |
| `qdb_action` | Action | Choice: Create / Update / Delete | Derived from immer patch op |
| `qdb_event_type` | Event Type | Choice | FieldChange / RuleChange / MappingChange / TranslationChange / FormImport / FormPublish / FormRestore |
| `qdb_changed_by` | Changed By | Lookup → SystemUser | Required |
| `qdb_changed_on` | Changed On | DateTime (UTC) | Required; set client-side at flush time |
| `qdb_session_id` | Session ID | Single-line text (100) | Browser session ID; links audit entries to a user session |
| `createdon` | Created On | DateTime | Standard audit column (Dataverse-managed) |
| `createdby` | Created By | Lookup → SystemUser | Standard audit column |
| `modifiedon` | Modified On | DateTime | Standard audit column |
| `modifiedby` | Modified By | Lookup → SystemUser | Standard audit column |

**Immutability guard — plugin:**
- Plugin type: `IPlugin` (C# Dynamics CRM plugin)
- Message: `Update` and `Delete` on `qdb_dfe_audit_log`
- Pipeline stage: Pre-Validation
- Execution mode: Synchronous
- Behavior: throws `InvalidPluginExecutionException("DFE audit log records are immutable. Update and Delete operations are not permitted.")`
- Registration: triggered for all security roles, including System Administrator (plugin runs
  in the system execution context; plugin-level enforcement is independent of table-level role
  privileges)

**Dataverse security role configuration:**
- All custom DFE security roles: CREATE and READ privileges only on `qdb_dfe_audit_log`
- No UPDATE or DELETE privileges granted to any custom role
- System Administrator: retains full table-level privileges, but the plugin blocks execution
  regardless — this provides defense-in-depth

**Indexes:**
- `qdb_form_id` + `qdb_changed_on` DESC — supports the compliance report query (filtered by
  form and date range, ordered by time)
- `qdb_changed_by` + `qdb_changed_on` — supports user-activity queries

**Compliance report export:**
A designer panel ("Audit History") provides:
- Filter: Form selector + date range
- Display: table of audit entries (changed by, field, event type, before, after, timestamp)
- Export: CSV download of the filtered results within 10 seconds for up to 1000 entries

---

## 4. ADR Set

### ADR-001 — FR-002 Presence Indicator: Dataverse Heartbeat Entity vs. Etag-Only

**Status:** Accepted
**Date:** 2026-07-10

**Context:**
FR-002 (Must Have) requires a non-blocking banner: "This form is also open by [Name] since
[HH:MM]." The BRD acceptance criterion is that User B sees the banner within 5 seconds of
opening a form that User A has open.

**Options:**

| Option | Approach | Pros | Cons |
|---|---|---|---|
| A — Dataverse heartbeat entity | Write `qdb_dfe_edit_lock` record on form open; update every 60s; query on open + every 30s | No new Azure dependencies; consistent with existing Dataverse infrastructure; supports display name and timestamp in banner | 2 extra requests/minute per session (heartbeat write + banner query); requires nightly cleanup job; lock records orphaned on browser crash until cleanup runs |
| B — Etag-only (no presence) | Show the 412 conflict error instead; no banner until a conflict actually occurs | Zero extra requests; zero new entity | Does NOT satisfy FR-002 acceptance criterion — banner must appear within 5s, before any conflict |
| C — Azure SignalR / Relay | Real-time push from Dataverse to browser via SignalR | Sub-second notification; truly real-time | New Azure service dependency; auth complexity; overly heavy for a "soft awareness" banner |

**Decision: Option A — Dataverse heartbeat entity**

FR-002 is explicitly Must Have with a 5-second banner requirement. Option B does not meet the
acceptance criterion. Option C is disproportionate in complexity for a non-blocking advisory
banner. Option A is safe under the NFR-003 API throttle analysis (see §2.1.3 — 2.5 req/s
under 50 concurrent sessions, well within limits).

**Consequences:**
- New entity `qdb_dfe_edit_lock` required (schema in §3.1)
- `PresenceService` polls every 30 seconds — acceptable latency for a soft-lock banner
- Cleanup job handles orphaned records from browser crashes; stale threshold = 90 seconds

---

### ADR-002 — dnd-kit KeyboardSensor Issue #985: Custom Sensor vs. Upstream vs. Library Switch

**Status:** Accepted
**Date:** 2026-07-10

**Context:**
dnd-kit's built-in `KeyboardSensor` uses pixel-offset math to determine drag targets. With
variable-height items (DFE field cards: 56px–120px), the offset can overshoot or undershoot
the target, causing incorrect drop positions (issue #985 on GitHub, open as of 2026-07-10).
FR-009 requires Alt+Up / Alt+Down keyboard reordering that is reliable for all field heights.

**Options:**

| Option | Approach | Pros | Cons |
|---|---|---|---|
| A — Custom `IndexBasedKeyboardSensor` | 80-line wrapper that moves by sorted index, not pixel offset | Fully correct for variable heights; uses Alt+Up/Down as required by BRD; no upstream dependency | Must be maintained in-house; diverges from upstream if dnd-kit v2 releases a fix |
| B — Wait for upstream dnd-kit v2 | dnd-kit references a new API in issue comments; wait for its release | Zero custom sensor code | No release date as of 2026-07-10; FR-009 is Phase 1 Must Have; cannot wait |
| C — Library switch to @hello-pangea/dnd | Better native keyboard support; simpler list-reorder API | Avoids custom sensor | Full refactor of all existing dnd-kit code (DndContext, SortableContext, useSortable hooks) across the entire canvas; high risk of regressions |

**Decision: Option A — Custom `IndexBasedKeyboardSensor`**

Option B is blocked by the Must Have delivery constraint. Option C carries excessive refactor
risk and would need to be branched from `feat/dfe-designer-style-load` which adds merge
complexity. Option A is bounded (~80 lines), independently tested, and can be replaced by an
upstream fix in the future without changing the consumer (the sensor is registered in one
location in `DndContext`).

**Consequences:**
- Custom sensor implementation lives in `designer/src/components/canvas/sensors/IndexBasedKeyboardSensor.ts`
- If dnd-kit v2 ships a native index-based sensor, swap it in with no consumer changes
- The custom Alt+Up/Alt+Down bindings are non-conflicting with Fluent UI v9's own keyboard
  patterns (Fluent uses Tab, Enter, Space, Arrow keys — Alt+Arrow is unoccupied in Fluent)

---

### ADR-003 — FR-004 Visual Diff Renderer: BUILD vs. jsondiffpatch vs. react-diff-viewer-continued

**Status:** Accepted
**Date:** 2026-07-10

**Context:**
FR-004 (Phase 2) requires a visual diff view. The diff data layer uses `microdiff`. The question
is how to render the diff visually. No 1,000-star React diff renderer is both React-18-compatible
and actively maintained (github-researcher finding).

**Options:**

| Option | Approach | Stars | React 18 | Last active | Decision |
|---|---|---|---|---|---|
| A — BUILD custom `FormDiffViewer` | ~120 lines over microdiff output; Fluent UI v9 components | N/A | Yes | N/A | **CHOSEN** |
| B — jsondiffpatch HTML formatter | 5,300 stars MIT; HTML string output via dangerouslySetInnerHTML | 5,300 | Partial | Dec 2023 | Rejected |
| C — react-diff-viewer-continued | 226 stars MIT; React 18 compatible; active | 226 | Yes | July 2026 | Rejected (below threshold) |

**Decision: Option A — BUILD custom `FormDiffViewer`**

Rationale:
- The form definition diff is structured data (fields, rules, sections), not free-text — a
  structured renderer that understands the DFE domain (field labels, section names) produces
  a far better UX than a generic JSON diff viewer
- jsondiffpatch's HTML formatter requires `dangerouslySetInnerHTML`, is unstyled, and has not
  released since December 2023
- react-diff-viewer-continued is below the 1,000-star threshold; adopting it creates a
  maintenance obligation for a non-critical display component
- Building ~120 lines of TypeScript/TSX is a 1-day task; the Fluent UI v9 `Accordion` and
  `Badge` components provide all needed UI primitives; the component fits naturally within the
  existing Fluent UI design system
- The component must exist anyway for the FR-001 conflict dialog's "Review what changed" path,
  which ships in Phase 1

**Consequences:**
- `FormDiffViewer` is a pure functional React component receiving `FormDiff` from `FormDiffService`
- Zero additional npm dependencies
- Phase 2 FR-004 reuses this component directly — no rework between phases

---

### ADR-004 — axe-core MPL-2.0 License Acceptance

**Status:** Accepted
**Date:** 2026-07-10

**Context:**
`axe-core` (7,300 stars) and `@axe-core/playwright` are licensed under MPL-2.0 (Mozilla Public
License 2.0), a weak-copyleft license. Maqsad AI's default policy prefers MIT / Apache / BSD.
The github-researcher agent flagged this as requiring architect confirmation.

**Analysis:**

MPL-2.0 copyleft obligations are file-scoped and triggered only when MPL-licensed source files
are modified and redistributed. The obligations are:

1. Modified MPL-licensed files must be redistributed under MPL-2.0
2. The obligation applies to the source files of axe-core itself, not to files that use it

DFE-ENH-001's use of axe-core is:
- `@axe-core/playwright` is a dev / test-only dependency — it is in `devDependencies` in
  `package.json` and is excluded from the production build by Vite's `build` command
- `vitest-axe` is also a dev dependency under MIT
- Neither package is bundled into any shipped artifact (the designer web resource, the runtime
  web resource, or any npm package distributed externally)
- Maqsad AI is not modifying axe-core's source files

Under these conditions, MPL-2.0 imposes no copyleft obligation on Maqsad AI or QDB. The
obligations would only arise if Maqsad AI modified axe-core's source and redistributed those
modified files — which is not the case here.

**Decision: axe-core and @axe-core/playwright MPL-2.0 ACCEPTED**

as dev/test-only dependencies, never bundled into any shipped product artifact.

**Guard:**
The `package.json` `devDependencies` placement is the contractual record that these packages
are not bundled. The Vite `build` config's `rollupOptions.external` array should explicitly
exclude `axe-core` and `@axe-core/playwright` as an additional defense in case the
`devDependencies` distinction is ever questioned.

**Consequences:**
- axe-core and @axe-core/playwright added to `devDependencies` only
- A comment in `package.json` near these entries: `// ENT-008 -- MPL-2.0 dev/test-only;
  never bundled -- see ADR-004`
- If Maqsad AI's legal policy changes or if future usage shifts to bundling, this ADR must
  be revisited

---

### ADR-005 — FormLinter: BUILD vs. Adopt Third-Party Linting Engine

**Status:** Accepted
**Date:** 2026-07-10 (formalizing the github-researcher BUILD decision)

**Context:**
FR-003 requires a form-definition linting engine. The github-researcher agent evaluated
`giantswarm/schemalint`, `zaach/jsonlint`, `sourcemeta/jsonschema`, and similar libraries. None
address DFE-specific cross-reference rules (field schemaName vs. rule fieldRef; mapping target
vs. CRM attribute schema).

**Decision: BUILD `FormLinter`**

No library addresses domain-specific form-integrity rules: cross-reference between field
`schemaName` values and rule `fieldRef` values; or CRM attribute existence checks that require
a Dataverse metadata call. Zod (already in the stack) validates structural shape; the lint
rules are business-logic graph walks over the form definition. Building a 5-method pure
TypeScript class is low-risk and produces a domain-specific, testable, independently extensible
component.

**Consequences:**
- `FormLinter` lives in `designer/src/services/FormLinter.ts`
- All methods are pure functions (no side effects, no API calls)
- The `CrmAttributeCache` is fetched externally and passed in — `FormLinter` does not fetch data
- Each lint rule is independently unit-testable with a typed input and typed output

---

### ADR-006 — ExpressionEngine: EXTEND vs. Adopt Second Rule Engine

**Status:** Accepted
**Date:** 2026-07-10 (formalizing the github-researcher EXTEND decision)

**Context:**
FR-006 (conditional required) and FR-007 (cross-field validation) need to express new rule
types. The github-researcher agent evaluated `CacheControl/json-rules-engine` (3,100 stars) as
a candidate.

**Decision: EXTEND incumbent structured-condition model**

The existing `ValidationRule` structured-condition model (`{ fieldRef, operator, value }`) is
extended with:
- `conditional_required` rule type: adds `isConditionallyRequired` effect
- `cross_field` rule type: adds `targetFieldRef` to the condition (replacing `value`)

Neither extension touches `ExpressionEngine.ts` (the DSL evaluator). Both extensions reuse
the existing condition builder UI. Introducing `json-rules-engine` would create a second rule
serialization format in Dataverse, a second evaluation pipeline, and incompatible rule storage
— the classic two-rule-system anti-pattern.

**Consequences:**
- Schema changes are in `shared/src/types/ValidationTypes.ts` (adding enum values and a
  discriminated union variant)
- Runtime changes are in the `ValidationEngine` (adding evaluation branches for the two new
  rule types)
- Designer changes are in the rule editor component (adding two new UI editors)
- Backward compatibility is maintained via `schemaVersion` on the rule JSON

---

## 5. Concurrency and Autosave Sequence Flow

The following captures the steady-state autosave loop and all deviation paths.

```
Steady State (no conflict):

  User types → onChange → Zustand state updated → pendingBatch.push(change)
                        → debounce timer reset (1500ms)
                            ...1500ms passes, no further changes...
                        → flush() called
                            → inflightRequest = false? YES
                            → PATCH each pending record with If-Match: <etag>
                            → awaiting 204...
                        → 204 received
                            → pendingBatch cleared
                            → etagMap updated with new etag
                            → lastSavedSnapshot = currentDefinition
                            → AuditEntryMapper.mapPatches() → write audit batch
                            → inflightRequest = false
                            → autosave indicator: "Saved"

Conflict Path (412):

  User types → [same as above up to PATCH dispatch]
                        → 412 Precondition Failed received
                            → AutosaveQueue halted (inflightRequest stays true)
                            → pendingBatch preserved (not discarded)
                            → conflictState = { localSnapshot, conflictedAt, modifiedByDisplayName }
                            → ConflictResolutionDialog dispatched
                        → User clicks "Reload":
                            → GET form (no If-Match)
                            → 200 + new etag
                            → Zustand store reset to server state
                            → etagMap updated
                            → pendingBatch cleared
                            → conflictState = null
                            → AutosaveQueue resumes
                        → User clicks "Keep editing":
                            → dialog closed
                            → persistent warning banner shown
                            → autosave remains halted until user resolves conflict

In-Flight Race (new change while PATCH is in flight):

  [PATCH in flight, inflightRequest = true]
  User makes another change → pendingBatch.push(change)
                            → debounce timer reset
                            → flush() called → inflightRequest = true → reschedule 1000ms
                            ...1000ms passes...
                        → PATCH response received (204 or 412)
                            → if 204: etag updated, inflightRequest = false
                            → reschedule flush() fires → second PATCH dispatched with
                              updated etag (prevents the second PATCH from using a stale etag)
                            → if 412 on first PATCH: conflict path above applies
```

---

## 6. FormLinter Rule Catalogue (Complete)

| Code | Severity | Rule Name | Detection Logic | Affectednode source | Phase |
|---|---|---|---|---|---|
| L001 | error | Duplicate schemaName | Collect all `field.schemaName` values; find duplicates via Set | Both fields | Phase 1 |
| L002 | warning | Required field without mapping | `isRequired === true` AND field.schemaName NOT in submissionMappings keys | Field record | Phase 1 |
| L003 | warning | Orphaned submission mapping | mapping.targetAttribute NOT in crmMeta.attributes | Mapping record | Phase 1 |
| L004 | error | Orphaned validation rule reference | validationRule.fieldRef (or sourceFieldRef / targetFieldRef for cross_field) NOT in all field schemaNames | Rule + Field | Phase 1 |
| L005 | error | Orphaned business rule reference | businessRule.conditions[].fieldRef or actions[].fieldRef NOT in all field schemaNames | Rule + Field | Phase 1 |
| L006 | info | Empty container | Tab has 0 sections OR section has 0 fields | Section or Tab | Phase 1 |
| L007 | warning | Conditional-required field without mapping | Field has `conditional_required` rule AND no submissionMapping | Field | Phase 1 |
| L008 | error | Cross-field rule — target field missing | cross_field rule's targetFieldRef NOT in all field schemaNames | Rule | Phase 1 |
| L009 | info | Approaching field count limit | totalFields >= 160 | Form | Phase 1 (ENT-010) |
| L010 | error | Field count limit exceeded | totalFields > 200 | Form | Phase 1 (ENT-010) |
| L011 | info | Approaching rule count limit | totalBusinessRules >= 40 | Form | Phase 1 (ENT-010) |
| L012 | error | Rule count limit exceeded | totalBusinessRules > 50 | Form | Phase 1 (ENT-010) |
| L013 | warning | PII/sensitivity mismatch | field.piiCategory !== 'None' AND field.sensitivityLevel === 'Public' | Field | Phase 2 (pre-wired, dormant) |

**Performance contract (FR-003 acceptance criterion):** All lint rules complete within 2 seconds
for forms with up to 100 fields and 50 rules.

L001–L006 are O(N) graph walks with no I/O. L003 requires `crmMeta` (fetched once on form load,
cached for session; no per-lint I/O). The total lint computation for 100 fields + 50 rules is
bounded well under 10ms on modern hardware; the 2-second acceptance criterion has substantial
headroom.

---

## 7. ExpressionEngine Extension Schema

The existing `ExpressionEngine.ts` is NOT modified. The extension is purely in the validation
rule type system and the `ValidationEngine` evaluator.

### 7.1 Extended type definitions (shared/src/types)

```
// Existing enum extended:
type ValidationRuleType =
  | 'required'
  | 'min_length'
  | 'max_length'
  | 'min_value'
  | 'max_value'
  | 'regex'
  | 'cross_field'           // existed as enum value; now has full implementation
  | 'conditional_required'  // NEW (Phase 1)
  | 'custom_expression'

// Existing condition type (unchanged):
interface RuleCondition {
  fieldRef: string
  operator: '==' | '!=' | '<' | '<=' | '>' | '>='
  value: ExpressionValue
}

// New discriminated union for validation rules (schemaVersion 2):
interface ConditionalRequiredRule {
  schemaVersion: 2
  type: 'conditional_required'
  fieldSchemaName: string           // the field that becomes required
  conditions: RuleCondition[]       // all must be true
  message?: string                  // custom required message; defaults to "This field is required"
  sortOrder: number
}

interface CrossFieldRule {
  schemaVersion: 2
  type: 'cross_field'
  fieldSchemaName: string           // the field the error attaches to (source)
  sourceFieldRef: string            // same as fieldSchemaName; explicit for clarity
  operator: '==' | '!=' | '<' | '<=' | '>' | '>='
  targetFieldRef: string            // the other field to compare against
  message: string                   // required; shown as inline validation error on sourceField
  sortOrder: number
}

// All other rule types carry schemaVersion: 1 (or absent — treated as 1)
```

### 7.2 ValidationEngine evaluation extension

The `ValidationEngine.evaluate(formContext, submittedValues)` function is extended with two
new evaluation branches:

**`conditional_required` evaluation:**
```
for each conditional_required rule on field F:
  evaluate all rule.conditions against submittedValues
  if ALL conditions are true:
    mark F as conditionally-required in this evaluation context
    if submittedValues[F.schemaName] is empty or null:
      add validation error: { field: F.schemaName, message: rule.message ?? 'This field is required' }
```

**`cross_field` evaluation:**
```
for each cross_field rule attached to field F:
  sourceValue = submittedValues[rule.sourceFieldRef]
  targetValue = submittedValues[rule.targetFieldRef]
  if targetValue is absent from submittedValues:
    skip this rule (target field is not in this submission context — could be hidden)
  compare sourceValue <rule.operator> targetValue:
    for date fields: parse both as ISO dates before comparison
    for numeric fields: compare as numbers
    for string fields (== and != only): compare as strings
  if comparison is FALSE (rule is violated):
    add validation error: { field: rule.fieldSchemaName, message: rule.message }
```

**Server-side (ExpressionEngineServer) impact:**
`ExpressionEngineServer` wraps the DSL evaluator. The new rule types use the structured-condition
evaluator, not the DSL. No changes to `ExpressionEngineServer.ts`.

---

## 8. Phase 1 Build Breakdown

### 8.1 Workstreams and sequencing

Phase 1 comprises eight workstreams. Six can start in parallel from day 1. Two have branching
requirements (see §8.3).

```
Workstream A — Concurrency (FR-001, FR-002)           ~6 developer-days
  A1: EtagManager service + DataverseApiClient If-Match enforcement       1.0d
  A2: EtagStore Zustand slice + conflictState shape                       0.5d
  A3: ConflictResolutionDialog component                                   1.5d
  A4: qdb_dfe_edit_lock entity in Dataverse + PresenceService             1.0d
  A5: PresenceBanner component + heartbeat polling                         1.5d
  A6: AutosaveQueue debounce/queue integration                             0.5d
  Dependencies: A2 before A3; A4 before A5; A1,A6 can parallel

Workstream B — Linting (FR-003)                       ~5 developer-days
  B1: FormLinter class (7 rule methods) + LintResult type                 2.0d
  B2: CrmAttributeCache fetch + session cache                              1.0d
  B3: LintingPanel UI + click-to-navigate dispatch                        1.5d
  B4: PublishValidationScreen integration (map LintResult to existing type) 0.5d
  Dependencies: B2 before B1 (cache needed for L003); B1 before B3,B4

Workstream C — Validation Rules (FR-006, FR-007)      ~5 developer-days
  C1: ValidationRule type extension (shared types, schemaVersion 2)       0.5d
  C2: ConditionalRequired rule editor UI (reuses condition builder)        1.5d
  C3: CrossField rule editor UI (new comparator picker)                    1.5d
  C4: ValidationEngine runtime extension for both rule types               1.0d
  C5: L007, L008 lint rules in FormLinter (depends on B1)                 0.5d
  Dependencies: C1 first; C2,C3,C4 parallel after C1; C5 after B1+C1

Workstream D — Drag-Drop & Keyboard (FR-009, ENT-010) ~6.5 developer-days
  [MUST BRANCH FROM feat/dfe-designer-style-load]
  D1: IndexBasedKeyboardSensor implementation                              1.0d
  D2: Alt+Up/Down + Alt+Shift+Up/Down bindings + undo entries              0.5d
  D3: ARIA live announcements region                                        0.5d
  D4: @tanstack/react-virtual integration with field list                   2.0d
  D5: dnd-kit DragOverlay + virtual list composition                        1.5d
  D6: Activation constraint tuning (text-selection fix)                     0.5d
  D7: Scale limit enforcement in Zustand addField/addSection/addTab actions 0.5d
  Dependencies: D1,D2,D3 parallel; D4 before D5; D6,D7 independent

Workstream E — Audit Log (ENT-005)                    ~4 developer-days
  E1: qdb_dfe_audit_log entity + Dataverse security role config            0.5d
  E2: Immutability guard C# plugin                                         0.5d
  E3: enablePatches() + AuditEntryMapper service                           1.0d
  E4: Zustand save-boundary integration (lastSavedSnapshot + patch capture) 1.0d
  E5: Compliance report export UI (filtered table + CSV download)           1.0d
  Dependencies: E1 before E2; E3 before E4; E5 last

Workstream F — Accessibility (ENT-008)                ~5-7 developer-days
  F1: @axe-core/playwright integration in E2E suite                        0.5d
  F2: vitest-axe integration in component tests (jsdom migration)           0.5d
  F3: Manual audit checklist document                                       0.5d
  F4: Initial axe-core scan run → violations inventory                      0.5d
  F5: WCAG remediation (variable — see contingency below)                  3-5d
  Dependencies: F1,F2,F3 parallel; F4 after F1; F5 after F4

Workstream G — Form Code Fix (FR-012a)                ~1 developer-day
  G1: isFormCodeManuallyEdited flag + slugify + Zustand slice update       0.5d
  G2: Unit tests for auto-derive and manual-edit paths                     0.5d
  Dependencies: none — fully independent

Workstream H — Diff Core (microdiff + FormDiffViewer) ~1.5 developer-days
  H1: microdiff dependency + FormDiffService wrapper                       1.0d
  H2: FormDiffViewer component (120-line React component)                  0.5d
  H3: ConflictResolutionDialog "Review what changed" integration            0.5d
  Dependencies: H1 before H2; H2,H3 before A3 is complete (parallel is fine;
    A3 stubs the diff section until H2 is available)
```

**Total Phase 1 effort (excluding F5 contingency):** approximately 34 developer-days.
With F5 at 5 days: 39 developer-days. With the high-end F5 estimate: 41 developer-days.

### 8.2 Independent vs. dependent items

**Fully independent (can start day 1 in parallel):**
- Workstream A (concurrency) — no upstream dependency
- Workstream B (linting) — no upstream dependency
- Workstream G (Form Code fix) — no upstream dependency
- Workstream H (diff core) — no upstream dependency (H3 has a soft dependency on A3 completing)

**Partially dependent:**
- Workstream C: C5 needs B1 complete (FormLinter must exist before adding new lint rules)
- Workstream E: E4 needs E3 (patch capture before save-boundary integration)
- Workstream F: F4 needs F1 (axe-core wired before first scan run); F5 needs F4

**Branching-dependent:**
- Workstream D: must branch from `feat/dfe-designer-style-load` before starting

### 8.3 Branch strategy

```
main
  └── feat/dfe-enh-001-phase1          (Workstreams A, B, C, E, F, G, H)
        Feature branch for all non-drag-drop Phase 1 work.
        PRs from sub-branches merged into this branch.
        Merges to main on Phase 1 completion.

feat/dfe-designer-style-load           (STYLE-001 active branch — DO NOT FORK FROM main)
  └── feat/dfe-enh-001-drag-drop       (Workstream D)
        Branched from feat/dfe-designer-style-load.
        FR-009 + ENT-010 virtualization work.
        When STYLE-001 merges to main: rebase feat/dfe-enh-001-drag-drop on main,
        then merge into feat/dfe-enh-001-phase1.
```

**Merge order:**
1. STYLE-001 (`feat/dfe-designer-style-load`) merges to `main` — triggered by STYLE-001 team
2. `feat/dfe-enh-001-drag-drop` rebases on `main`
3. `feat/dfe-enh-001-drag-drop` merges into `feat/dfe-enh-001-phase1`
4. `feat/dfe-enh-001-phase1` merges to `main` after Phase 1 CEO checkpoint passes

If STYLE-001 has not merged to `main` by the time Workstream D is code-complete, the Phase 1
merge is held pending STYLE-001's merge. This is the known scheduling risk from ADR-C003.

### 8.4 Testing requirements per workstream

Every workstream must meet 80% unit test coverage on new code (per Maqsad clean-code standards).
Specific test types:

| Workstream | Unit tests | Component tests | E2E tests |
|---|---|---|---|
| A (Concurrency) | EtagManager, AutosaveQueue, PresenceService | ConflictResolutionDialog (focus trap, buttons), PresenceBanner | Concurrent-save 412 scenario; presence banner appears within 5s |
| B (Linting) | FormLinter — one test per lint rule; edge cases per rule | LintingPanel render, click-to-navigate | Pre-publish gate blocks on L001/L004; warnings acknowledged |
| C (Rules) | ValidationEngine conditional_required; cross_field date comparison | Rule editor UI for conditional_required and cross_field | FR-006 AC: conditional required enforced on submit; FR-007 AC: cross-field error on submit |
| D (Drag-Drop) | IndexBasedKeyboardSensor (unit — jsdom) | Alt+Down moves field; ARIA announcement | Form with 80 fields: drag reorder completes under 200ms; no text selection; keyboard reorder undo |
| E (Audit) | AuditEntryMapper (patch → AuditEntry); immutability guard plugin | Compliance report filter; CSV export | Audit entry written on field change; Update attempt rejected by plugin |
| F (A11y) | vitest-axe on key components | — | axe-core scan: zero AA violations on designer + rendered form |
| G (Form Code) | slugify algorithm; setFormName/setFormCode state transitions | — | Manual edit stops auto-derive |
| H (Diff) | FormDiffService.diff; FormDiffService.summarize | FormDiffViewer renders additions/removals/changes | ConflictResolutionDialog "Review" path shows diff |

---

## 9. Risks and Open Questions for the CEO Architecture Checkpoint

### 9.1 Risks requiring CEO awareness

**R-005 (CARRY-FORWARD): WCAG remediation scope blowout**

The F4 axe-core scan (Workstream F) produces the violations inventory. If the count exceeds
20 distinct violations, an immediate CEO notification is required before remediation begins.
The contingency budget in the Phase 1 estimate (3-5 extra developer-days in F5) covers a
moderate finding. A large finding requires a scope/timeline discussion before build authorization
is consumed on remediation.

Recommendation: authorize Phase 1 build including F1-F4 (toolchain + scan). F5 budget is
confirmed or expanded after the scan results are in hand. This de-risks the unknown by making
it known early.

**R-DRAG: STYLE-001 merge timing creates Phase 1 merge dependency**

Workstream D (drag-drop, FR-009) is branched from `feat/dfe-designer-style-load`. If STYLE-001
does not merge to `main` before Phase 1 is otherwise complete, the Phase 1 merge to `main` is
blocked. Neither team can set the other's merge date. This is a coordination risk.

Mitigation options:
1. Agree a joint target date with the STYLE-001 team before Phase 1 build authorization
2. Accept that Phase 1 will deliver all workstreams except D first, with D merging as a
   follow-on PR after STYLE-001 lands. FR-009 is Must Have, so option 2 delays Phase 1 close.

The CEO checkpoint should confirm which mitigation approach QDB prefers.

**R-AUDIT-VOLUME: Audit log write volume under heavy editing**

A form author editing 50 fields rapidly over 30 minutes generates 50 × average 3 properties
changed = 150 audit entries per session. At 50 concurrent sessions: 7,500 audit entries per
30-minute window = 250 entries/minute. Dataverse handles this comfortably (standard org supports
~1,000 rows/minute on custom entities). No risk under NFR-003 concurrency load. Flagged for
completeness.

### 9.2 Open questions requiring CEO ruling

**OQ-ARCH-001: FR-012(b) fallback clause activation**

ADR-C003 commits STYLE-001 to deliver the Field Properties panel overflow fix (FR-012(b)).
The fallback clause states: if STYLE-001 has not delivered FR-012(b) before ENH-001 Phase 1
build authorization is granted, ENH-001 picks it up as a standalone CSS fix. The CEO should
confirm:

(a) Is the fallback clause acceptable — i.e., can ENH-001 pick up FR-012(b) if STYLE-001
    misses it, or should FR-012(b) remain blocked on STYLE-001 regardless?
(b) Who arbitrates if STYLE-001 and ENH-001 disagree on the delivery date for FR-012(b)?

Recommendation: the CEO grants ENH-001 unconditional authority to pick up FR-012(b) if
STYLE-001 has not delivered it by the time ENH-001's Phase 1 build is 50% complete. This
prevents FR-012(b) from becoming a permanent blocker on ENH-001's close.

**OQ-ARCH-002: Phase 2 architecture trigger**

Phase 2 (FR-004, ENT-001, ENT-002, ENT-003) cannot begin until C-004 (QDB Legal retention
defaults), C-005 (XLIFF 2.0 vendor acceptance), and C-006 (Form Approver names) are cleared.
These are QDB stakeholder deliverables, not Maqsad AI deliverables. The CEO should confirm:

(a) Should Maqsad AI begin Phase 2 architecture concurrently with Phase 1 build (once Phase 1
    architecture is approved), on the assumption that C-004/C-005/C-006 will clear in time?
(b) Or should Phase 2 architecture wait until Phase 1 build is complete?

Recommendation: begin Phase 2 architecture concurrently with Phase 1 build to compress the
overall timeline. FR-004 (diff viewer) and ENT-002 (RBAC entity design) have no dependency on
the pending conditions and can be designed independently.

**OQ-ARCH-003: UndoRedoStack FR-005 scope confirmation**

FR-005 (undo/redo extension to translations, mappings, and theme) is in Phase 1 scope per the
CEO's phase plan. However, FR-005 was not explicitly called out in the build prompt as a Phase 1
architecture item. The immer `inversePatches` mechanism designed for ENT-005 (audit) naturally
enables FR-005 (undo/redo) at no additional cost — the same `applyPatches(currentState,
inversePatches)` call rolls back a change.

The CEO should confirm: is FR-005 implementation authorized as part of the ENT-005 workstream
(Workstream E), adding approximately 1 developer-day for the `UndoRedoStack` extension and UI
undo entries for translation/mapping/theme changes?

Recommendation: yes, authorize FR-005 within Workstream E. The mechanism is the same; the
marginal cost is the UI label generation and the undo stack integration. Delivering it separately
in a future workstream would require re-opening the same code paths.

---

## 10. Dependency Adoption Summary (Phase 1)

All decisions honor or explicitly address the requirements in `dependencies.md`.

| Package | Version | Decision | License | Usage |
|---|---|---|---|---|
| `microdiff` | v1.5.x | ADOPT | MIT | Diff core (FR-001 conflict, FR-004 Phase 2 data layer) |
| `@tanstack/react-virtual` | v3.x | ADOPT | MIT | Large-form field list virtualization (ENT-010) |
| `@axe-core/playwright` | v4.x | ADOPT | MPL-2.0 (dev-only, never bundled — ADR-004) | WCAG E2E gate (ENT-008) |
| `vitest-axe` | v0.1.x | ADOPT | MIT | WCAG component test gate (ENT-008) |
| `dnd-kit` (incumbent) | existing | EXTEND | MIT | Custom IndexBasedKeyboardSensor (ADR-002) |
| `immer` (incumbent) | existing | EXTEND | MIT | produceWithPatches for ENT-005 audit |
| ExpressionEngine (in-house) | n/a | EXTEND | n/a | conditional_required + cross_field rule types (ADR-006) |
| `FormLinter` | new | BUILD | n/a | Form-definition linting (ADR-005) |
| `FormDiffViewer` | new | BUILD | n/a | Visual diff renderer (ADR-003) |

---

## 11. Approval Record

| Role | Name | Decision | Date |
|---|---|---|---|
| Architect (Maqsad AI) | Muhammad Salman Sagar | SUBMITTED | 2026-07-10 |
| CEO (Architecture Checkpoint) | Pending | PENDING | — |
| QDB IT Director | Pending | PENDING | — |
