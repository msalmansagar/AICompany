═══════════════════════════════════════════════════
CEO PHASE 1 — BUSINESS OBJECTIVE AND BRD DECISION
═══════════════════════════════════════════════════
Project:        Dynamics CRM Web Resource — Drag-and-Drop Form Designer
Decision By:    CEO — Maqsad AI
Date:           2026-05-18
BRD Version:    1.0 (phase-2-ba.md)
Project Code:   FDWR-001
═══════════════════════════════════════════════════


BUSINESS OBJECTIVE
──────────────────
Banking sector clients operating the Dynamic Form Engine portal currently rely on
developers to manually create and modify CRM configuration records for every form
change — a process that takes 2 to 4 weeks per request and introduces error risk.
This project delivers a drag-and-drop Form Designer embedded directly inside
Dynamics CRM as a Web Resource, allowing Business Analysts to design, configure,
preview, version, and publish portal forms without developer involvement. The
expected outcome is time-to-change reduction from weeks to hours, elimination of
the change request backlog, and a self-service capability that directly supports
the banking portal product line.


SUCCESS CRITERIA
────────────────
SC-001: A Business Analyst with no developer support can design and publish a new
        portal form entirely within the CRM interface, measured by successful
        end-to-end UAT walkthroughs without any developer action.

SC-002: Form creation time is reduced to under 2 hours for a standard 2-tab,
        10-field form, down from the current 2–4 week lead time.

SC-003: All 16 pre-provisioned qdb_* Dataverse tables receive correctly structured
        records from the designer, verified by comparison against the existing
        Dynamic Form Engine renderer's expected schema during SIT.

SC-004: Every publish event produces a new qdb_form_version record and a
        qdb_form_audit_log entry, verified by QA during testing.

SC-005: The compiled web resource bundle does not exceed 5MB, enforced by a
        CI build step that fails the pipeline above 4MB (safety margin).

SC-006: The designer operates correctly on Dynamics 365 v9.2 on-premise and
        Dynamics 365 Online, confirmed by deployment and smoke test on both
        environment types before UAT sign-off.

SC-007: The designer meets WCAG 2.1 Level AA, verified by an accessibility audit
        before the UAT phase.

SC-008: Business rule JSON written to qdb_form_business_rule conforms to the
        agreed renderer contract schema version 1.0, confirmed by the Dynamic Form
        Engine renderer team before the rule configuration panel is built.


ASSUMPTIONS
───────────
A-001: All 16 Dataverse tables (qdb_*) are already provisioned with the correct
       schema in all target environments (DEV, SIT, UAT, PROD).

A-002: The Dynamic Form Engine portal renderer is deployed and already reads from
       the same 16 tables. The renderer team will agree the business rule JSON
       schema (SC-008) before architecture is finalised.

A-003: Xrm.WebApi is available and functional in the web resource iframe context
       for all target CRM environments.

A-004: No Internet Explorer or legacy Edge support is required.

A-005: The designer is a single-tenant deployment per CRM environment. No
       multi-tenancy configuration is required.

A-006: The undo/redo history stack may be in-memory only (lost on browser close).
       Auto-save every 2 minutes is the durability mechanism, not undo persistence.


STRATEGIC RISKS
───────────────
SR-001: Business Rule Schema Misalignment (CRITICAL)
        If the renderer team does not commit to and agree the JSON schema before
        the rule panel is built, the designer and renderer will diverge at runtime.
        Mitigation: schema agreement is a build gate — no code for the rule
        configuration panel may be written without it.

SR-002: Scope Creep from Business Stakeholders
        Once self-service form design is demonstrated, stakeholders may request
        localisation, collaborative editing, or analytics during Phase 1 delivery.
        Mitigation: phase-2-ba.md Section 4.2 explicitly defers these to Phase 2.
        Any in-flight scope addition requires a CEO-approved BRD revision.

SR-003: CRM Environment Version Inconsistency
        DEV and PROD running different Dynamics 365 patch levels may surface API
        behaviour differences only after deployment. Mitigation: C-003 compatibility
        matrix in the Architecture must be verified against actual environment
        versions before SIT begins.

SR-004: 5MB Bundle Constraint Is a Hard Platform Limit
        Exceeding the CRM web resource upload limit blocks deployment entirely.
        Mitigation: SC-005 enforces a 4MB CI budget; architect must validate
        estimated sizes against actual build output.

SR-005: Audit Log Volume in Banking Context
        qdb_form_audit_log is projected at up to 1,000,000 rows with 7-year
        retention. CRM environment storage costs and query performance must be
        monitored. The append-only constraint cannot be relaxed regardless of
        volume pressure.


STAKEHOLDERS
────────────
Primary Users:        Business Analysts (form designers)
Secondary Users:      CRM Administrators (deployment, security roles)
Impacted Parties:     Portal End Users (consumers of published forms)
                      Dynamic Form Engine team (renderer team — schema contract)
                      IT Manager (governance and audit obligations)
Delivery Team:        Maqsad AI (build and delivery)
Approval Authority:   CEO — Maqsad AI (phase transitions)


BRD REVIEW — PHASE 2 ASSESSMENT
─────────────────────────────────
The Business Requirements Document (phase-2-ba.md, version 1.0) has been reviewed
in full. Assessment is as follows.

Strengths confirmed:
  - All 16 CRM tables are mapped explicitly to designer actions. No ambiguity.
  - 79 functional requirements are numbered, grouped, and traceable to user stories.
  - Publish validation gates (FR-053) are specific and testable.
  - Business rules (BR-010, BR-013) correctly prohibit audit log mutation and
    external network calls — both are non-negotiable in a banking context.
  - Non-functional requirements include performance thresholds (NFR-004) and
    a hard bundle size ceiling (NFR-005) with enforcement mechanism.
  - Risk register (Section 13) correctly classifies R-001 (business rule schema)
    as HIGH and assigns it to the correct owners.
  - Scope exclusions (Section 4.2) are explicit and protect Phase 1 from expansion.

Concerns and conditions carried forward:
  - C-001 (Business Rule JSON Contract) remains CRITICAL. The BRD records it as a
    risk and defers resolution to Architecture. The Architecture document
    (phase-2-arch.md) has provided a draft schema and committed to renderer team
    review. This condition is partially satisfied at the architecture layer but
    must be formally confirmed by the renderer team before the rule panel is built.
  - C-002 through C-005 have been addressed in the Architecture document
    (phase-2-arch.md) and are accepted.

Open questions from the BRD (Q-001, Q-002, Q-003) are architecture-layer concerns
and do not require BRD revision.


DECISION: APPROVED WITH CONDITIONS
────────────────────────────────────
The BRD is approved. Architecture is confirmed. The build team may proceed.

The following conditions must be enforced before the rule configuration panel
is implemented — this is the only build gate remaining:

  CONDITION 1 (CRITICAL — BUILD GATE FOR RULE PANEL):
  The Dynamic Form Engine renderer team must formally confirm acceptance of the
  BusinessRuleDefinition schema version 1.0 defined in phase-2-arch.md (Section 4,
  C-001 response) before any code is written for the rule configuration panel
  (FR-040, FR-041, US-14). Written confirmation is required. No verbal agreement
  is sufficient. The architect owns this gate.

  CONDITION 2:
  The CI pipeline must enforce the 4MB uncompressed bundle budget before the
  first SIT deployment. The build must fail if the limit is breached.

  CONDITION 3:
  The CRM compatibility matrix (phase-2-arch.md, C-003) must be verified against
  the actual version numbers of the DEV and PROD CRM environments before SIT
  begins. Any gap must be escalated immediately to the CEO.

  CONDITION 4:
  The "Form Designer User" security role (phase-2-arch.md, C-005) must be
  included in the managed solution package as a deployment artifact. Manual
  security role creation is not an acceptable deployment step.

  CONDITION 5:
  Audit log records (qdb_form_audit_log) must never be written with an UPDATE
  or DELETE call under any code path. This is a banking compliance requirement.
  The auditor must verify this during the audit phase before CEO final decision.


PHASE TRANSITION AUTHORITY
───────────────────────────
Phase 3 (Architecture):      COMPLETE — phase-2-arch.md accepted.
Phase 4 (Technical Build):   APPROVED TO PROCEED, subject to Conditions above.
Phase 5 (QA):                Requires CEO checkpoint after build complete.
Phase 6 (Audit):             Requires CEO checkpoint after QA sign-off.
Phase 7 (CEO Final):         Final approval gate before production deployment.

The build team may not skip or abbreviate any phase. No phase may be marked
complete without a deliverable reviewed and approved at the appropriate checkpoint.

═══════════════════════════════════════════════════
CEO — Maqsad AI | 2026-05-18 | FDWR-001 v1.0
═══════════════════════════════════════════════════
