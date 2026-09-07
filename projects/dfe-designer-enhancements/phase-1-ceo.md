# CEO Phase 1 — Business Framing and BRD Approval Decision
**Engagement ID:** DFE-ENH-001
**Prepared by:** Maqsad AI — CEO
**Date:** 2026-07-10
**BRD Under Review:** `projects/dfe-designer-enhancements/phase-2-ba.md` (v1.0)
**Decision Status:** APPROVED WITH CONDITIONS

---

## Business Objective

The DFE Form Designer serves as QDB's primary authoring surface for all digital loan intake and citizen-facing service forms. After multiple delivery phases it is functionally rich but structurally fragile: concurrent edits cause silent data loss, no governance gate exists before a form goes live, and the platform lacks the WCAG 2.1 AA certification and PII classification controls that Qatar's public-sector digital obligations and the PDPPL demand. This engagement closes those gaps — hardening the authoring foundation first, then layering in the enterprise governance controls that unlock the platform for high-risk regulated use cases including loan intake and public portal deployment.

---

## Success Criteria

1. Zero silent last-write-wins data loss events in the designer for any form with concurrent editors — measurable by the absence of conflict-free overwrite reports in the audit log after FR-001 ships.
2. Every published form passes a pre-publish linting gate with zero unacknowledged errors — measurable by the linting gate's block rate in production (target: 100% of publishes pass through the gate).
3. Every form publication requires a documented second-party approval with an audit trail — measurable by the ENT-001 approval log showing zero self-approvals and zero direct publishes bypassing the workflow.
4. The DFE designer RBAC model assigns per-form edit and publish rights to named roles — measurable by QDB IT Director sign-off on the role matrix before any Phase 2 go-live.
5. All DFE-rendered forms achieve zero WCAG 2.1 AA violations on axe-core automated scan and pass a manual keyboard walkthrough with a signed QDB accessibility officer sign-off.
6. Field-level PII classification metadata is stored on every field record — measurable by a compliance officer being able to generate a PII registry from form data within 30 seconds.
7. A single published form and all its dependencies can be promoted from dev to test to prod without a full-solution export — measurable by a successful end-to-end promotion smoke test on a live loan intake form.
8. No form is published with any configured language below 100% translation completeness — measurable by the completeness gate block rate in the publish pipeline.

---

## Assumptions

1. Dataverse org5869857f supports the `@odata.etag` / `If-Match` optimistic-concurrency pattern on all custom DFE entities. The architect must verify this at the architecture gate before FR-001 proceeds.
2. QDB operates a three-environment topology (dev / test / prod). The architect cannot design ENT-004 until QDB IT Director provides the environment URLs and credential delivery plan.
3. The EDP-BRE-001 two-stage approval pattern (C# plugin + React UI) is adaptable to the DFE context with moderate effort and new Dataverse entities — it must not share data-layer entities with EDP.
4. QDB will designate a minimum of two named Form Approvers per form group before ENT-001 goes live. Self-approval prohibition cannot be enforced with fewer than two approvers.
5. The existing audit log entity does not have append-only enforcement configured in Dataverse security roles. This is a gap to remediate, not an assumed-existing control.
6. Azure Blob Storage is available within QDB's Azure subscription for ENT-006 backup storage without procurement action.
7. The DFE frontend (React 18 + dnd-kit) can resolve the drag-drop freeze defects (FR-009) without a full framework replacement, based on virtualized rendering of the field list.
8. Calculated/derived fields (FR-005 Could Have) require an expression engine not currently present in the DFE and are not authorized in this engagement unless a separate sub-BRD is approved.

---

## Strategic Risks

1. **WCAG remediation scope blowout (R-005):** An accessibility audit on the runtime renderer (ENT-008) may uncover issues requiring more than the estimated XL effort. This risk is mitigated by starting the audit in Phase 1 — late discovery in Phase 4 would jeopardize the portal launch timeline. A contingency budget must be held at architecture gate.
2. **DFE-STYLE-001 surface-area conflict (R-001):** Two requirements (FR-009 keyboard/drag-drop, FR-012 panel overflow) overlap with the paused STYLE-001 engagement. Dual implementation wastes effort and creates conflicting code. Status of STYLE-001 must be confirmed before Phase 1 architecture finalizes these items.
3. **Maker-checker deadlock (R-004):** ENT-001 prohibits self-approval. If QDB does not name at least two Form Approvers per form group before Phase 2 go-live, the workflow cannot operate. This is an organizational dependency, not a technical one.
4. **PDPPL regulatory exposure:** Until ENT-003 PII classification and ENT-005 append-only audit log are live, the platform operates without the minimum data-governance controls required under Qatar's Personal Data Protection and Privacy Law. Any public-facing deployment before Phase 2 ships carries regulatory risk.
5. **ENT-004 environment credential dependency:** The form promotion pipeline cannot be architected until QDB IT Director provides service-principal credentials and confirms the environment topology. If this is delayed beyond the Phase 2 milestone, ENT-004 will slip from Phase 3.
6. **EV-001 etag coverage gap (R-002):** If the Dataverse org does not support etag on all DFE entities, FR-001 (optimistic concurrency) will require an alternative implementation (e.g., a version-counter field with plugin enforcement). This must be confirmed at architecture gate, not assumed.

---

## Stakeholders

| Stakeholder | Role | Decision Authority |
|---|---|---|
| QDB Compliance Officers | Approval workflow owners | Approve ENT-001 go-live conditions; name Form Approvers |
| QDB IT Administrators | Platform governance and environment owners | Approve ENT-002 role matrix; provide environment credentials for ENT-004 |
| QDB Legal / Data Governance | PDPPL obligation owners | Ratify PII retention period defaults for ENT-003 |
| QDB Accessibility Officers | WCAG certification authority | Sign off ENT-008 compliance report |
| QDB Localization Managers | Translation pipeline owners | Confirm XLIFF 2.0 vendor acceptance (FR-013) |
| QDB Form Administrators | Primary designer users | Primary beneficiaries of Phase 1 hardening |
| Maqsad AI Architect | Phase gate authority for technical design | Confirm etag support, reconcile STYLE-001 scope |
| Maqsad AI CEO (this document) | BRD approval authority | Approves this engagement to proceed to GitHub research and architecture |

---

## BRD Approval Decision

**Decision: APPROVED WITH CONDITIONS**

---

### Justification

The BA has produced a well-structured BRD that correctly identifies two categories of debt — authoring integrity (fragile production safety) and enterprise governance (regulatory gaps). The four-phase plan is logically sequenced and the MoSCoW priorities are defensible for a QDB public-sector context.

The decision to start with hardening (Phase 1) before governance (Phase 2) is correct. Building a maker-checker approval flow on top of a codebase that still loses data under concurrent edit would give false assurance to compliance officers. The production defect in PR #11 (sortOrder=0 / Dataverse constraint violation) is exactly the kind of signal that means Phase 1 must ship before Phase 2 is enabled in production.

The Phase 2 governance items (ENT-001, ENT-002, ENT-003) directly address QDB's PDPPL exposure and the change-management gap that currently allows any designer user to publish directly to the live cache. The EDP-BRE-001 precedent on maker-checker means QDB stakeholders have already accepted this pattern for comparable workflows — reuse here reduces adoption risk.

ENT-006 (DR) and ENT-011 (integration registry) are correctly classified as Won't Have this phase. Endorsing both descoping decisions.

One sequencing defect exists in the BA's recommended phasing and is corrected below. Eight conditions must be met at the specified phase gates.

---

### Phase Plan Rulings

**Phase 1 — Hardening and Authoring Integrity: ENDORSED with scope clarification**

The Phase 1 item list (FR-001, FR-002, FR-003, FR-005, FR-006, FR-007, FR-009, FR-010, FR-012, ENT-005, ENT-008 initial audit, ENT-010) is approved as stated with the following clarification:

- FR-009 (keyboard reordering and drag-drop): the architect must assess STYLE-001 status before finalizing scope. If STYLE-001 remains paused with no confirmed resume date within 90 days of Phase 1 build authorization, FR-009 proceeds in full within this engagement. If STYLE-001 resumes, the dnd-kit refactoring work must be consolidated in one engagement to avoid duplicate implementation. This is a gate condition at architecture stage, not at build start.
- FR-012(b) (Field Properties panel overflow): same coordination rule applies. FR-012(a) (Form Code auto-derive behavior) has no STYLE-001 overlap and may proceed in Phase 1 unconditionally.
- ENT-010 (scale limits documentation and enforcement): the documentation component (defining and publishing the limits) is Phase 1 scope. The performance optimization component (virtualized rendering) runs concurrently with FR-009 as both involve field-list rendering; the architect must treat them as a single optimization workstream.

**Phase 2 — Governance and RBAC: ENDORSED with mandatory resequencing**

FR-004 (Version History Diff / Compare) is moved from Phase 3 to Phase 2.

Rationale: The BA's own sequencing constraint (Section 14, item 5) states "FR-004 must precede ENT-001." An approver reviewing a publish request must be able to see what changed relative to the live version — this is not an enhancement to the approval workflow, it is a core precondition for an informed approval decision. Shipping ENT-001 without FR-004 gives approvers an approval button but no comparison surface, which defeats the governance purpose. The Phase 2 item list is therefore: FR-004, ENT-001, ENT-002, ENT-003, ENT-009, FR-013 (completeness gate only).

**Phase 3 — Localization and ALM: ENDORSED**

FR-013 (full multi-language + import/export), FR-014 (form bundle), ENT-004 (promotion pipeline), ENT-006 (DR strategy document only), ENT-009 (full translator workflow). No changes to the BA's recommendation.

ENT-004 (form promotion) cannot be architected until QDB IT Director delivers environment topology and credential information. The architect should design ENT-004 as a separately gated work item within Phase 3 that does not block FR-014 or FR-013 delivery.

**Phase 4 — Analytics, Scale, and Power Features: ENDORSED**

FR-008, FR-011, FR-015, ENT-007, ENT-010 (performance optimization if not completed in Phase 1). No changes to the BA's recommendation. FR-015 (test-submit preview) and FR-008 (reusable templates) are valuable but carry no compliance urgency and are correctly deferred.

---

### Open Question Rulings

**OQ-001 — WCAG conformance level and assistive technology platforms**
Business default set: WCAG 2.1 AA is the target and is non-negotiable for any public-sector form. AAA is aspirational and outside the scope of this engagement's compliance commitment. Assistive technology test platforms are set as: NVDA on Windows (primary) and VoiceOver on macOS (secondary). Arabic RTL forms must additionally be tested with a screen reader in RTL mode. QDB Accessibility Officer action required: designate the named sign-off authority for the compliance report before Phase 1 build authorization — this is a go/no-go condition (Condition 1).

**OQ-002 — Languages beyond English and Arabic**
Business default set: the FR-013 architecture must be designed for N languages (BCP 47 standard, already specified in the BRD). English and Arabic are the committed delivery languages for Phase 3. Urdu is acknowledged as a candidate for expatriate services but is not committed in this engagement's scope. The QDB Localization Manager must confirm the language roadmap for the 12 months following Phase 3 delivery before FR-013 architecture is finalized — this determines how many language-column slots the UI must render and whether any RTL languages beyond Arabic are in scope for the RTL preview mode (ENT-009). This is deferred to QDB for confirmation (Condition 2).

**OQ-003 — Designated Form Approvers and escalation path**
Cannot be set by default. QDB Compliance Officer must provide: (a) a minimum of two named Form Approvers per form group, and (b) the escalation rule when a primary approver is unavailable (acceptable approach: a deputy approver is automatically activated after 5 business days of inaction, configured per form group). This information is required before Phase 2 go-live — not before architecture, but it must be in writing before the ENT-001 approval workflow is activated in any environment (Condition 3).

**OQ-004 — Three-environment topology and service-principal credentials**
Cannot be set by default. QDB IT Director must provide the three environment URLs and a confirmed plan for service-principal credential provisioning for automated form promotion. This information is required before Phase 3 architecture begins. ENT-004 cannot be designed without knowing the target environment authentication model. The architect may begin FR-014 (form bundle format) independently before this information is available (Condition 4).

**OQ-005 — PII field retention period policy**
Business default set: the ENT-003 Field Properties "Data Governance" section will render a dropdown with preset options (30 days / 90 days / 1 year / 3 years / 7 years / Permanent / Custom) rather than a free-form text field, to reduce misconfiguration risk. The default selected value for fields with PII classification will be "1 year" unless overridden. QDB Legal / Data Governance must ratify whether this default and the preset list are compliant with QDB's internal retention policy and the PDPPL before Phase 2 build authorization for ENT-003 (Condition 5).

**OQ-006 — RPO and RTO for form definitions**
Provisional default set for the ENT-006 strategy document: RPO 24 hours (one daily backup cycle), RTO 4 hours (manual restore from Azure Blob export). The strategy document will be drafted against these provisional targets in Phase 3. QDB IT Director must formally ratify RPO/RTO before the strategy document is finalized and before any implementation phase (if any) is authorized in a future engagement (Condition 6).

**OQ-007 — Telemetry storage: Dataverse vs Azure Application Insights**
Business default set: Phase 4 ENT-007 will use Dataverse (`qdb_dfe_telemetry` entity) as the primary storage target. The architect must design the telemetry emission layer as an abstraction (an interface with a Dataverse implementation) so that a future Application Insights adapter can be plugged in without rewriting the emission code. This default keeps Phase 4 free of new Azure service dependencies. If QDB IT Director or Platform Operations prefer Application Insights before Phase 4 architecture is approved, they must raise it then — the default stands until overridden.

**OQ-008 — Delivery timeline constraint**
No hard timeline is imposed by the CEO. However, if QDB has a committed public portal launch date, the IT Director or portfolio sponsor must communicate it to Maqsad AI before Phase 3 architecture begins. If a hard date exists and it conflicts with the full four-phase plan, the following descoping priority applies: Phase 1 and Phase 2 are non-negotiable (production safety and PDPPL compliance); Phase 3 localization completeness gate and form bundle can slip but the form promotion pipeline (ENT-004) may slip to a post-launch hotfix engagement; Phase 4 is entirely deferrable.

---

### Scope Confirmations

The following items are confirmed out of scope for DFE-ENH-001 and must not be implemented within this engagement:

- ENT-006 implementation (DR backup job and Azure Blob integration): Won't Have. Strategy document only is authorized in Phase 3.
- ENT-011 (Integration Governance Registry): Won't Have. Deferred to a dedicated integration-governance engagement.
- FR-005 (Calculated/Derived Fields): Could Have on paper, but any work on this item requires a sub-BRD approved by the CEO before architecture begins. It is not authorized for any phase in this engagement without that approval.
- Runtime rendering engine changes: Out of scope except for WCAG 2.1 AA accessibility remediation (ENT-008) and telemetry event emission (ENT-007), which are explicitly authorized in Phases 1 and 4 respectively.
- DFE-STYLE-001 scope: This engagement does not supersede or absorb STYLE-001. Any STYLE-001 overlap items (FR-009, FR-012) will be coordinated at architecture stage per Condition 7.

---

### Conditions

The following conditions must be met at the stated gate. No phase may proceed past its gate without the conditions for that phase being cleared.

**Before Phase 1 build authorization (i.e., before any code is written):**

- **C-001:** QDB Accessibility Officer designates the named sign-off authority for the WCAG 2.1 AA compliance report. Without a named authority, ENT-008 has no acceptance owner and the audit has no clear completion criterion.
- **C-002:** Maqsad AI Architect confirms whether Dataverse etag / `If-Match` optimistic-concurrency is supported on all custom DFE entities in org5869857f. If not supported, the architect must propose and CEO must approve an alternative concurrency mechanism before FR-001 architecture is finalized.
- **C-003:** Maqsad AI Architect confirms STYLE-001 status (paused with no resume date in the next 90 days, or resumed with a target date). This determines whether FR-009 and FR-012(b) scope is owned by this engagement or coordinated with STYLE-001. Architect decision is required before the Phase 1 architecture document is submitted.

**Before Phase 2 build authorization:**

- **C-004:** QDB Legal / Data Governance reviews and ratifies the ENT-003 retention period dropdown defaults (30 days / 90 days / 1 year / 3 years / 7 years / Permanent / Custom, default: 1 year for PII-classified fields) against QDB's internal policy and PDPPL requirements.
- **C-005:** QDB Localization Manager confirms XLIFF 2.0 is accepted by QDB's current or planned external translation vendors. If XLIFF 2.0 is not accepted, the FR-013 export format must be revised before FR-013 architecture is submitted.

**Before Phase 2 go-live (i.e., before ENT-001 is activated in any environment):**

- **C-006:** QDB Compliance Officer provides in writing: (a) the names of at least two designated Form Approvers per form group, and (b) the escalation rule for approver unavailability. The ENT-001 workflow configuration must reflect these names before go-live.

**Before Phase 3 architecture:**

- **C-007:** QDB IT Director provides the three-environment topology URLs (dev, test, prod) and a confirmed plan for service-principal credential provisioning for automated form promotion (ENT-004). Without this, the architect must design FR-014 and FR-013 independently and leave ENT-004 as an unarchitected stub in the Phase 3 document.
- **C-008:** QDB IT Director or portfolio sponsor communicates any hard portal launch date that constrains phase delivery. If no constraint exists, silence is interpreted as no hard date.

---

### Critical Path to Phase 1 Build Authorization

The following sequence must complete before any Phase 1 code is written:

1. CEO approval issued (this document — complete).
2. C-001: QDB Accessibility Officer names the WCAG sign-off authority.
3. GitHub research phase: the github-researcher agent must verify existing open-source libraries for optimistic concurrency UX (conflict dialogs), linting engines (form-definition static analysis), and XLIFF 2.0 parsers before any implementation begins.
4. Phase 3 of the Maqsad AI process (Architecture): the architect produces the Phase 3 architecture document covering Phase 1 items, with C-002 (etag support confirmation) and C-003 (STYLE-001 status) resolved and documented in the architecture ADR set.
5. Architecture review and CEO checkpoint approval on the Phase 3 architecture output.
6. Phase 1 build authorization issued by CEO.

Conditions C-004 through C-008 do not block Phase 1 build authorization. They gate Phase 2 and Phase 3 respectively. The critical path for Phase 1 is shorter: CEO approval (done) → GitHub research → Architecture → Architecture checkpoint → Phase 1 build.

---

## Approval Record

| Role | Name | Decision | Date |
|---|---|---|---|
| CEO (Maqsad AI) | Muhammad Salman Sagar | APPROVED WITH CONDITIONS | 2026-07-10 |
| QDB IT Director | Pending | PENDING | — |
| Requestor | Pending | PENDING | — |
