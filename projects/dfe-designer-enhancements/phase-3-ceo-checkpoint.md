# DFE-ENH-001 — CEO Architecture Checkpoint Decision
**Engagement ID:** DFE-ENH-001
**Decision authority:** CEO (Maqsad AI)
**Date:** 2026-07-10
**Documents reviewed:**
- `phase-1-ceo.md` — BRD approval, 8 conditions, phasing
- `phase-3-arch.md` — Phase 1 architecture (v1.0, submitted 2026-07-10)
- `phase-3-arch-conditions.md` — ADR-C002 (etag confirmed) + ADR-C003 (STYLE-001 active; coordination boundary set)
- `dependencies.md` — GitHub research adopt/build/extend decisions
- `conditions-log.md` — C-001/C-002/C-003 all cleared

---

## Phase 3 Summary

The architect has produced a complete, well-structured Phase 1 architecture that covers all eight
workstreams in the approved Phase 1 scope. The documents are internally consistent and the
dependency decisions correctly honor the 1000-star threshold rule (with ADR-documented exceptions
for vitest-axe and react-diff-viewer-continued). The six ADRs are defensible and follow the
format standards.

Key design decisions worth noting at this gate:

- **Concurrency (FR-001/FR-002):** Etag/If-Match is live-confirmed on org5869857f. A Zustand
  `AutosaveQueue` with 1500ms debounce and backpressure handles the API throttle constraint
  correctly. The `ConflictResolutionDialog` is accessible (alertdialog, focus trap, focus return).
  This is the right design.

- **Linting (FR-003):** `FormLinter` as a pure-function static class with one method per rule
  is the correct architecture. Domain-specific cross-reference rules cannot be delegated to a
  generic library. The 13-rule catalogue covers Phase 1 and pre-wires Phase 2 (L013 dormant).

- **Validation extension (FR-006/FR-007):** Extending the structured-condition model avoids the
  two-rule-system anti-pattern. The `schemaVersion: 2` backward-compatibility flag is the right
  mechanism. No opinion on the structured schema itself except that both extensions look correct.

- **Keyboard drag-drop (FR-009):** The custom `IndexBasedKeyboardSensor` (~80 lines) is the
  correct call. The dnd-kit issue #985 is confirmed open; waiting for upstream or switching
  libraries are both worse options. Building the sensor is bounded work with a clean replacement
  path if upstream ships a fix.

- **Audit log (ENT-005):** Capturing patches at the save boundary (not per keystroke) via
  immer `produceWithPatches` is the correct design. Batch-writing audit entries with the form
  PATCH in the same OData `$batch` request ensures the audit is atomic with the data change.

- **WCAG harness (ENT-008):** Staged approach (toolchain + scan first, remediation after
  inventory) is the right call. The architect's own risk register (R-005) identifies this risk
  correctly.

- **Virtualization (ENT-010):** `@tanstack/react-virtual` v3.x adoption is correct. The
  DragOverlay-outside-virtual-list pattern is the standard integration and it is called out
  explicitly. The 30-field threshold and the Zustand-not-DOM authority for keyboard sensor are
  the right design choices.

**Open Risks (business perspective):**

1. Workstream D cannot merge to `main` until STYLE-001 merges first. If STYLE-001 slips, Phase 1
   close is delayed. This is the most consequential scheduling risk in the architecture.

2. The WCAG violation inventory is unknown. The F5 remediation budget (3–5 days contingency) may
   be insufficient if the runtime renderer has systemic issues.

3. The `qdb_dfe_audit_log` immutability plugin runs as synchronous Pre-Validation against all
   writes, including System Administrator writes. This is intentional for compliance reasons but
   QDB IT administrators must be briefed — they cannot bulk-delete audit entries even to recover
   from a data entry error. This is a deliberate, irreversible design choice.

---

## Decision

**APPROVED WITH CONDITIONS**

Phase 1 build is authorized. The architecture is sound, all pre-Phase-1 conditions are cleared,
and the design is consistent with the BRD success criteria. The conditions below must be met
during build; they do not delay build start.

---

## Rulings

### 1. Workstream Clearance

**Cleared to start on Day 1 (branch from `main`):**
- Workstream A — Concurrency (FR-001, FR-002)
- Workstream B — Linting (FR-003)
- Workstream C — Validation Rules (FR-006, FR-007)
- Workstream E — Audit Log (ENT-005)
- Workstream F — Accessibility (ENT-008)
- Workstream G — Form Code Fix (FR-012a)
- Workstream H — Diff Core (microdiff + FormDiffViewer)

**Gated:**
- Workstream D — Drag-Drop and Keyboard (FR-009, ENT-010) is **cleared to start but must branch
  from `feat/dfe-designer-style-load`, not from `main`**. See Condition CC-001 below. All D
  tasks may proceed in parallel on that branch from Day 1; the constraint is on the merge target,
  not on implementation start.

---

### 2. OQ-ARCH-001 — FR-012(b) Fallback Clause

**Ruling: ENH-001 is granted unconditional authority to absorb FR-012(b) if STYLE-001 has not
delivered it by the time ENH-001 Phase 1 build is 50% complete.**

50% build completion is defined as: Workstreams A, B, C, G, and H all code-complete (i.e., all
implementation tasks done and unit tests green). At that checkpoint the lead developer reviews
whether STYLE-001 has committed the overflow fix to `feat/dfe-designer-style-load`. If yes,
no action. If no, ENH-001 picks up FR-012(b) as a standalone CSS layout fix on the
`feat/dfe-enh-001-phase1` branch without further approval needed.

Arbitration: if STYLE-001 and ENH-001 disagree on whether the fix has been delivered, the
CEO is the arbiter. The acceptance criterion is the one stated in the BRD: no content in the
Field Properties panel overflows its container boundary at any viewport width above 1024px.
A passing axe-core scan alone does not satisfy this criterion; a manual visual check at 1024px
is required.

---

### 3. OQ-ARCH-002 — Phase 2 Architecture Concurrently with Phase 1 Build

**Ruling: APPROVED, with a defined scope boundary.**

Phase 2 architecture may begin concurrently with Phase 1 build for two items only:

- **FR-004 (Version History Diff viewer):** No dependency on C-004, C-005, or C-006. The
  `FormDiffViewer` component designed in Phase 1 (Workstream H) is the data layer; the Phase 2
  architecture task is the version-selector UI and the Dataverse `qdb_form_version` entity
  query. This may begin as soon as H1 is complete.

- **ENT-002 (RBAC entity design):** The entity schema for form-level permissions (who can edit
  which form group, who can approve) has no dependency on QDB stakeholder answers and can be
  designed against the existing `qdb_access_policy` entity pattern. The architect may begin the
  entity schema and security role matrix design now.

**NOT authorized to proceed concurrently:**
- ENT-001 (approval workflow) — blocked on C-006 (named Form Approvers).
- ENT-003 (PII classification) — blocked on C-004 (QDB Legal retention-period ratification).
- FR-013 (XLIFF 2.0 completeness gate) — blocked on C-005 (vendor acceptance confirmation).

The architect must not write Phase 2 architecture for these three items until their blocking
conditions are cleared. Starting the architecture without the stakeholder inputs produces a
document that will need revision, which wastes effort and creates a false record of completion.

---

### 4. OQ-ARCH-003 — FR-005 Undo/Redo as Workstream E Free-Rider

**Ruling: AUTHORIZED.**

FR-005 (undo/redo extension to translations, mappings, and theme changes) is authorized as a
+1 developer-day addition to Workstream E. The rationale is correct: the `inversePatches`
already generated by `produceWithPatches` for ENT-005 audit are identical to what FR-005 needs
for rollback. The `UndoRedoStack` can store these inverse patches; applying them is one call to
`applyPatches(currentState, inversePatches)`. The UI work (undo entry labels for
translation/mapping/theme changes) is marginal cost.

The Workstream E timeline is updated to include E4a:
- E4a: `UndoRedoStack` extension — store inverse patches; wire undo/redo stack UI entries for
  translation, mapping, and theme changes — 1.0d.

This brings Workstream E from ~4.0 developer-days to ~5.0 developer-days. Total Phase 1 effort
estimate becomes approximately 35 developer-days (baseline, excluding F5 contingency) and 38–42
with F5 at the range estimate.

One constraint: FR-005 must not introduce any new visual surface in Phase 1 beyond extending
the existing undo/redo stack UI. If the existing undo/redo UI does not cover translation and
mapping changes today, the UI extension is in scope; a new dedicated panel or history viewer is
not in scope and requires a sub-BRD.

---

### 5. R-005 — WCAG Contingency Ruling

**Ruling: The architect's staged approach is approved exactly as proposed.**

F1 through F4 (toolchain installation + initial scan) are fully authorized as part of Phase 1
build. The scan must be run as a priority task — it should complete within the first two weeks
of build, not at the end.

F5 (remediation) proceeds under the following rule:

- If the violations inventory (F4 output) shows **20 or fewer distinct violations:** remediation
  proceeds within the 3–5 day contingency budget without CEO notification. The team uses
  engineering judgment to prioritize and fix.

- If the violations inventory shows **more than 20 distinct violations:** work on F5 is
  **immediately suspended**. The lead developer notifies the CEO with: (a) the full violations
  list, (b) a severity breakdown (critical, serious, moderate, minor), (c) a revised remediation
  effort estimate, and (d) a recommended scope for Phase 1 vs. deferral. The CEO will issue a
  remediation scope ruling within two business days. No F5 spend occurs beyond the inventory
  scan itself until the CEO ruling is issued.

This rule protects the Phase 1 timeline from an open-ended remediation budget while ensuring
that a systemic accessibility problem in the runtime renderer is surfaced for a deliberate scope
decision rather than quietly absorbing the contingency and slipping the delivery date.

---

### 6. Two New Dataverse Entities and the Immutability Plugin

#### `qdb_dfe_edit_lock` (Presence Heartbeat Entity)

**APPROVED.**

The schema is appropriate. The composite index on `qdb_form_id + qdb_last_heartbeat` correctly
supports the `queryActiveLocks` pattern. The UPSERT on `qdb_form_id + qdb_editor_user_id` on
reconnect prevents orphaned duplicate lock records from the same user refreshing the page.

One governance addition: the nightly cleanup Power Automate flow (deleting stale records older
than 24 hours) must be deployed as part of the ENH-001 solution package, not as a standalone
manual step. It is a maintenance dependency of the feature. The acceptance criterion for
Workstream A must include: cleanup flow deployed and tested to confirm it successfully removes
stale lock records.

Security: CREATE/READ/WRITE/DELETE to all designer-access users is appropriate. This entity
holds no sensitive data (display name, form ID, timestamp) and should not be over-restricted.

#### `qdb_dfe_audit_log` (Field-Level Change History)

**APPROVED with mandatory governance notice to QDB IT administration.**

The schema is appropriate for its compliance purpose. The `qdb_before_value` and `qdb_after_value`
columns as Multiline text (10000 chars) are correctly bounded for JSON-serialized patch entries.
The compound index design (`qdb_form_id + qdb_changed_on DESC` for compliance queries;
`qdb_changed_by + qdb_changed_on` for user-activity queries) is correct.

#### Immutability Plugin

**APPROVED. This is a compliance control, not an engineering convenience, and it must be treated
as such.**

The Pre-Validation synchronous plugin that throws `InvalidPluginExecutionException` on Update
and Delete of `qdb_dfe_audit_log` is the correct enforcement mechanism. Running at Pre-Validation
stage means it fires before any data change occurs. Running synchronously means the rejection is
returned to the caller immediately. Running against all security roles including System
Administrator is intentional and correct: a compliance audit trail that the system administrator
can delete is not a compliance audit trail.

**Required briefing:** Before Phase 1 goes live in any environment, the QDB IT Director and any
Dataverse administrators must receive written notification that:

1. Audit log records in `qdb_dfe_audit_log` are permanently immutable. There is no override,
   no admin bypass, and no emergency deletion mechanism.
2. If an audit log record is created erroneously (e.g., due to a system bug), it cannot be
   deleted. The record remains in the entity with a note added to a separate correction log.
3. If this constraint is unacceptable to QDB IT operations, it must be raised before the plugin
   is deployed to any non-development environment. Raising it after production deployment would
   require a full entity redesign.

This briefing must be documented (an email or sign-off record) and filed with the engagement
artifacts before the Phase 1 go-live gate. The QA phase (Phase 5) will verify that this
documentation exists before approving go-live.

---

### 7. Workstream D / STYLE-001 Rebase Scheduling Risk

**Ruling: Two-path mitigation is authorized. The CEO's preferred path is Path A.**

**Path A (preferred):** Within 5 business days of Phase 1 build start, the engagement lead
establishes a joint coordination target with the STYLE-001 team. The STYLE-001 team commits to
a specific calendar date for merging `feat/dfe-designer-style-load` to `main`. ENH-001 accepts
a delivery dependency on that date for Workstream D's final merge into `feat/dfe-enh-001-phase1`.

If a joint target date is established and STYLE-001 merges on time: Phase 1 closes as a single
unified delivery. This is the preferred outcome.

**Path B (contingency):** If STYLE-001 cannot commit to a merge date within 10 business days
of Phase 1 build start, Phase 1 closes with Workstreams A–C, E–H as a primary delivery. Workstream
D (FR-009 + ENT-010) is tracked as a separately merged follow-on PR, with a hard deadline of 15
business days after Phase 1's primary close. FR-009 is a Must Have requirement and cannot be
deferred beyond this window without a CEO scope ruling.

Path B must not be treated as the default. It carries the risk that the separately merged FR-009
PR introduces merge conflicts that were not caught during Phase 1 testing. Path A avoids this
entirely.

The engagement lead must document which path is in effect by Day 5 of build.

---

## Conditions on Phase 1 Build Authorization

The following conditions apply during Phase 1 build. They do not delay the start of any
workstream; they govern specific decisions and notifications during the build period.

**CC-001 (Workstream D coordination):** Within 5 business days of Phase 1 build start, the
engagement lead documents whether Path A or Path B (defined above) is in effect. If Path A:
the joint target date must be in writing. If Path B: the 15-day follow-on deadline clock starts
on Phase 1 primary close.

**CC-002 (WCAG F5 spend gate):** F5 (remediation) spend is gated on the F4 violations inventory
count. If >20 distinct violations: F5 is suspended pending CEO scope ruling. The scan (F4) must
be completed within the first two weeks of build, not saved for the end of Phase 1.

**CC-003 (FR-005 scope boundary):** FR-005 implementation is limited to extending the existing
undo/redo stack to cover translation, mapping, and theme changes. A new history panel or undo
history viewer is out of scope and requires a sub-BRD before authorization.

**CC-004 (Phase 2 concurrent architecture scope):** Phase 2 concurrent architecture is limited
to FR-004 (diff viewer) and ENT-002 (RBAC entity schema). The architect must not produce Phase 2
architecture documents for ENT-001, ENT-003, or FR-013 until C-004, C-005, and C-006 are
respectively cleared.

**CC-005 (Immutability plugin governance notice):** Before Phase 1 moves out of the development
environment into any shared or production-adjacent environment, the QDB IT Director and Dataverse
administrators must receive and acknowledge in writing the immutability constraints on
`qdb_dfe_audit_log`. The QA gate (Phase 5) will verify this acknowledgment exists.

**CC-006 (Cleanup flow deployment):** The nightly Power Automate cleanup flow for
`qdb_dfe_edit_lock` stale records must be included in the ENH-001 solution package and verified
as part of Workstream A's acceptance criteria, not deferred to post-delivery.

---

## Downstream Gates

This checkpoint approval authorizes Phase 1 build only. The downstream gates remain in full
effect and are not waived or abbreviated by this approval:

- **Code review (Phase 4 output):** Every workstream's output must pass the code-reviewer
  agent's clean code review before QA begins.
- **QA (Phase 5):** Full test coverage verification (minimum 80% on new code), E2E scenario
  execution, and the axe-core zero-violations gate.
- **Audit (Phase 6):** Security and governance audit including the immutability plugin verification,
  the audit log write-volume test, and the OData $batch atomicity verification for audit entries.
- **CEO Final Decision (Phase 7):** No production deployment without CEO final approval.

---

## Approval Record

| Role | Name | Decision | Date |
|---|---|---|---|
| CEO (Architecture Checkpoint) | Muhammad Salman Sagar | APPROVED WITH CONDITIONS | 2026-07-10 |
| Architect (Maqsad AI) | — | Submitted | 2026-07-10 |
| QDB IT Director | Pending | PENDING | — |
