═══════════════════════════════════════════════════
PHASE 1 — CEO BRD APPROVAL
═══════════════════════════════════════════════════
Project:     DFE-CBTN-001 — Conditional Button Visibility & Enablement
Author:      CEO — Maqsad AI
Date:        2026-07-19
Version:     1.0
BRD Version: phase-2-ba.md v1.0
═══════════════════════════════════════════════════


DECISION: APPROVE WITH CONDITIONS
───────────────────────────────────────────────────


1. BUSINESS OBJECTIVE
───────────────────────────────────────────────────
The DFE currently forces makers who need state-driven button behaviour —
"show Approve only when Status = Submitted", "disable Submit once the
record is already Approved" — to either build separate forms per state or
abandon the feature entirely. Both outcomes increase total cost of ownership
and block makers from delivering approval-flow UX without developer
intervention.

DFE-CBTN-001 closes this gap by adding two independent, maker-configurable
condition sets to every ScopedButton: one controlling visibility (show/hide)
and one controlling enablement (enabled/greyed-out). Conditions are evaluated
live by the existing RuleEngine as the user changes field values. The entire
build is additive — four nullable columns on qdb_form_scoped_button —
meaning all existing deployed forms continue to behave identically without
any maker action.

This is a high-leverage, low-risk capability unlock. It converts the button
system from a static decoration into a genuine workflow-gating tool, which
is exactly what "maker-configurable, no-code forms" must deliver.


2. SUCCESS CRITERIA
───────────────────────────────────────────────────
SC-01: A maker can configure one or more visibility conditions on any
       ScopedButton in the designer Properties panel, using a field picker,
       operator picker, and value input, without writing any code or JSON.

SC-02: A maker can configure one or more enablement conditions on any
       ScopedButton in the designer Properties panel, independently of the
       visibility conditions, without writing any code or JSON.

SC-03: All existing deployed forms with static isVisible / isActive flags
       behave identically after the schema migration is applied. Zero maker
       intervention is required. Regression test (TC-005 / US-05) must pass.

SC-04: A disabled button (enabledWhen evaluates false) renders as greyed-out,
       is announced by screen readers as disabled (aria-disabled="true"),
       cannot be clicked or keyboard-activated, and remains in the DOM. WCAG
       2.1 AA contrast ratio of 3:1 or greater for disabled button text.

SC-05: Button condition evaluation for a form with 20 buttons each carrying
       10 conditions completes in under 5 ms on a mid-range device (measured
       within the existing rule-evaluation cycle, no additional network calls).

SC-06: The shared type parity check (check-shared-type-sync.mjs) passes
       after both form.types.ts and form.ts are updated in the same PR.

SC-07: ButtonAssembler achieves 100% branch coverage. All other new code
       paths (evaluation, renderer, designer service) meet the 80% minimum.
       tsc runs clean across all four packages.

SC-08: All four condition columns are null on existing qdb_form_scoped_button
       records immediately after provisioning. No data loss or corruption on
       org5869857f.


3. ASSUMPTIONS
───────────────────────────────────────────────────
A-01: DFE-BTN-001 is the hard prerequisite. The ScopedButton entity
      (qdb_form_scoped_button), ButtonAssembler, and ScopedButtonsPanel are
      all in a production-ready state on main before any DFE-CBTN-001 work
      begins. See Gate G-01 below.

A-02: The RuleCondition shape (fieldId, operator, value, logicalOperator) is
      stable and suitable for reuse without modification. If the architect
      discovers a structural incompatibility, the engagement must pause and
      the BA must reassess.

A-03: The designer can enumerate all form fields (including hidden and
      read-only fields) to populate the condition builder field picker, because
      it already holds the full form definition in memory at design time.

A-04: Per-set AND/OR logic is sufficient for all v1 approval-flow patterns
      (see OQ-001 ruling in Section 5). No row-level mixed logic is needed.

A-05: Client-side evaluation is appropriate. No server-side evaluation
      endpoint is needed because all field values are already resident in
      client memory at runtime.

A-06: JSON memo columns are sufficient for condition storage at expected
      volumes (avg <500 chars per button). Relational condition rows are not
      needed in v1.


4. STRATEGIC RISKS
───────────────────────────────────────────────────
SR-01: DFE-BTN-001 merge gate. DFE-BTN-001 is currently at Phase 4 (code
       review complete), with Phase 5 QA still pending. If that engagement
       stalls or surfaces defects that require significant rework, DFE-CBTN-001
       is blocked entirely. Mitigation: enforce G-01 below as a hard gate.

SR-02: Scope creep via tooltip request. OQ-003 (maker-configurable "why
       disabled" tooltip) has visible appeal but would expand scope by
       approximately 25-30% (new Dataverse column, designer input, frontend
       tooltip rendering). Ruled deferred — see Section 5.

SR-03: Condition JSON corruption in Dataverse. Invalid JSON written by a
       future designer bug causes the backend to silently drop the button at
       runtime, making it invisible to end users without a clear error signal.
       Mitigation: designer-side validation is mandatory before persisting
       (Architecture condition C-01).

SR-04: Production gate inheritance. DFE-CBTN-001 shares the same production
       gate as DFE-BTN-001 (GL-01..GL-07, including PDPPL data-residency hard
       gate). The PDPPL gate for the Qatar North Dataverse environment blocks
       all DFE production deployments until cleared. This is outside this
       engagement's control.

SR-05: Mobile evaluation gap. End users on mobile will see buttons in their
       static isVisible/isActive state, not the evaluated conditional state,
       until v2. This is a known, accepted limitation. If a client escalates
       mobile parity as urgent before v2 is planned, this decision must be
       revisited immediately.


5. OPEN QUESTION RULINGS
───────────────────────────────────────────────────

OQ-001 — AND/OR logic: per-set or row-level? (Architecture blocker)
  RULING: Per-set AND/OR toggle is sufficient for v1. Architecture shall
  implement one LogicalOperator per condition set (one for visibleWhen, one
  for enabledWhen). Row-level mixed logic is NOT in scope. This covers all
  realistic v1 approval-flow patterns: multi-field AND gates
  ("Status = Submitted AND Priority = High") and multi-value OR gates
  ("Status = Approved OR Status = Rejected"). Complex compound logic such as
  (A AND B) OR C is deferred. The BRD's current decision (BR-007) is confirmed.

OQ-002 — Field picker scope: all fields or visible fields only?
  RULING: Include ALL form fields (hidden and read-only) in the field picker.
  Hidden fields carry live values that are frequently the source of
  workflow-gating conditions (CRM status codes, calculated fields). Restricting
  to visible fields would silently block many valid configurations. Architecture
  shall treat the full form definition field list as the picker source.

OQ-003 — Disabled button tooltip: in scope or deferred? (Architecture blocker)
  RULING: Deferred to v2. No maker-configurable tooltip in v1. No new
  Dataverse column for tooltip text. The frontend team MAY include a single
  static system-generated label (e.g., "aria-label: This action is not
  currently available") at no schema cost if it is trivial to add as part of
  the disabled state rendering. That implementation decision is delegated to
  the architect. A maker-authored disabled message requires its own
  engagement (new column, new designer input, new renderer logic).

OQ-006 — Mobile: types-only in v1 or full runtime evaluation?
  RULING: Types-only in v1. Mobile form.ts is updated in the same PR as
  form.types.ts (parity check must remain green). Mobile runtime evaluation
  of button conditions — evaluating visibleWhen/enabledWhen in the React
  Native renderer — is formally deferred to v2. Architecture shall design the
  shared types to be structurally mobile-evaluation-ready (no structural
  change required in v2), but shall not include mobile runtime evaluation in
  the v1 design.

OQ-004 — Designer-side validation to prevent silent button drop:
  RULING: Architecture must include designer-side condition JSON validation
  before any write to Dataverse. The backend silent-drop (BR-008) is a
  defence-in-depth fallback. It must not be the first and only line of
  defence. The designer must reject invalid or incomplete conditions with a
  user-facing inline error message before the persist call is made.

ESCALATE-TO-USER items: None. All open questions are within CEO authority
to rule on. No questions require human product owner input before Architecture
can proceed.


6. STAKEHOLDERS
───────────────────────────────────────────────────
Primary users:    Makers / Form Designers (condition configuration)
End users:        Form submitters and approvers (runtime show/hide/disable)
Approvers:        CEO (this document), Requestor (BRD section 16)
Impacted teams:   DFE Backend, DFE Frontend, DFE Designer, DFE Mobile (types only)
Tenant admin:     CRM Administrator (additive provisioning on org5869857f)
Compliance gate:  PDPPL / QCB data-residency (inherited from DFE-BTN-001, not new)


7. ENGAGEMENT CONDITIONS
───────────────────────────────────────────────────

GATE G-01 — DFE-BTN-001 MERGE (hard gate, blocks Phase 3 Architecture)
  DFE-BTN-001 must complete Phase 5 (QA) and Phase 6 (Audit), receive CEO
  final approval (Phase 7), and be merged to main on feat/dfe-btn-001 before
  DFE-CBTN-001 Phase 3 (Architecture) may begin. This is not negotiable.
  The architect must verify this before starting any design work.

CONDITION C-01 — Designer-side condition validation (Phase 3 Architecture)
  The architecture document must specify a validation step in the designer
  that prevents incomplete or malformed condition sets from being persisted to
  Dataverse. The specification must cover: missing field selection, missing
  operator, and empty conditions array submitted as a "save". The backend
  silent-drop (BR-008) is a fallback only.

CONDITION C-02 — No new third-party libraries
  The architect must confirm that the existing RuleEngine (json-rules-engine)
  or an equivalent internal evaluator is used for button condition evaluation.
  No new npm dependency may be introduced for this feature. If the architect
  identifies a genuine gap in the existing evaluator, a dependency proposal
  must be submitted to the CEO before adoption.

CONDITION C-03 — ButtonAssembler 100% branch coverage
  The QA plan must include a requirement for 100% branch coverage of the
  ButtonAssembler, given its critical role in the degradation path (invalid
  JSON, null columns, partial records). This is a hard QA gate, not a target.

CONDITION C-04 — All DFE-BTN-001 go-live conditions remain in force
  The 7 DFE-BTN-001 go-live conditions (GL-01..GL-07), including the PDPPL
  data-residency hard gate for production, apply to DFE-CBTN-001 without
  modification. DFE-CBTN-001 cannot be deployed to production until all
  DFE-BTN-001 GL conditions are cleared.

CONDITION C-05 — Backward-compatibility regression test mandatory
  Phase 5 QA must include an explicit regression test (US-05 / TC-005) that
  provisions a form with legacy ScopedButton records carrying null condition
  columns, loads the form post-migration, and verifies that button behaviour
  is byte-identical to the pre-feature baseline. This test must pass before
  Phase 5 sign-off is granted.

CONDITION C-06 — Parity check in CI
  The shared type parity check (check-shared-type-sync.mjs) must pass in CI
  as a required build gate in the same PR that updates form.types.ts and
  form.ts. This check may not be bypassed.

CONDITION C-07 — Mobile v2 plan documented
  Before Phase 7 (CEO final), a brief note in the engagement output must
  record that mobile runtime evaluation is deferred to v2 and that the type
  design in v1 is structurally forward-compatible. This ensures the v2 mobile
  team is not surprised by missing evaluation wiring.


8. JUSTIFICATION
───────────────────────────────────────────────────
The BRD is thorough, well-structured, and technically sound. The scope is
tightly bounded: four nullable columns, no new entities, no new third-party
libraries, full backward compatibility, and all evaluation logic reusing
existing infrastructure. The business value is immediate and measurable —
makers who currently cannot express approval-flow button logic without
developer help will be able to do so entirely in the designer after this
feature ships.

The risk profile is low. The only meaningful business risk is the hard
dependency on DFE-BTN-001 (SR-01), which is addressed by Gate G-01. The
PDPPL production gate (SR-04) is inherited and not created by this feature.

The BA has correctly documented all assumptions, constraints, and open
questions. The OQ rulings in Section 5 are clear and unambiguous.
Architecture may proceed immediately upon DFE-BTN-001 merge to main.


═══════════════════════════════════════════════════
APPROVAL RECORD
═══════════════════════════════════════════════════
| Role      | Name          | Decision                  | Date       |
|-----------|---------------|---------------------------|------------|
| CEO       | Maqsad AI CEO | APPROVE WITH CONDITIONS   | 2026-07-19 |
| Requestor | Pending       | PENDING                   |            |
═══════════════════════════════════════════════════
END OF DOCUMENT
═══════════════════════════════════════════════════
