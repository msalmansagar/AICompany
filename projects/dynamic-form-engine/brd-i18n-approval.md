═══════════════════════════════════════════════════
CEO APPROVAL DECISION
═══════════════════════════════════════════════════
Document:       BRD-i18n-001 v1.0 — DFE Multi-Language / i18n Support
Engagement ID:  DFE-i18n-001
Reviewed by:    CEO, Maqsad AI
Decision date:  2026-06-24
═══════════════════════════════════════════════════


1. DECISION
─────────────────────────────────────────────────────────────────────
APPROVED WITH CONDITIONS


2. STRATEGIC RATIONALE
─────────────────────────────────────────────────────────────────────
Arabic is not a nice-to-have feature at Qatar Development Bank — it is
a legal and competitive obligation. Qatar's bilingual service standards
are regulatory in nature, and a live banking portal that operates
exclusively in English is a material compliance gap. BO-i18n-004 alone
justifies the investment. The BRD correctly frames this as an
infrastructure addendum, not a cosmetic change, and the scope is
appropriately bounded: Arabic is the delivery target, the architecture
must be extensible, and the designer remains LTR except for the
translations panel. These are sound commercial decisions.

The 26 functional requirements are complete, specific, and verifiable.
The acceptance criteria are written in Given/When/Then format and map
cleanly to their parent requirements. The traceability matrix covers
all six business objectives. The fallback-to-English rule (FR-024) is
the right default for a live banking portal — it prevents a broken
experience if a translation record is missing and protects the English-
speaking user base from regression. The requirement is unambiguous and
the acceptance criteria (AC-021) are testable.

The two risks that concern me most are R-001 (Fluent UI v9 RTL
completeness) and R-002 (React Native RTL requiring a native rebuild).
Both are Medium likelihood / High impact. The BRD's mitigation approach
— front-load a spike before implementation — is correct and I am
enforcing it as a formal condition. Neither the frontend nor the mobile
build phase may begin until those spikes are resolved and documented.
The remainder of the conditions below are precision gates, not
fundamental objections to the work. The business case is clear; the
requirements are sound; the pipeline may proceed.


3. CONDITIONS
─────────────────────────────────────────────────────────────────────

C-001: Fluent UI v9 RTL Spike (Gate on Frontend Phase 4 start)
       Before any frontend implementation begins, the frontend team must
       run a focused spike against the specific Fluent UI v9 components
       used in the DFE (TextField, Combobox, DatePicker, Dropdown,
       Checkbox, and any navigation-bearing component). The spike must
       document: (a) which components have verified RTL support, (b)
       which require CSS logical-property overrides, and (c) any
       component that cannot be made RTL-compliant within the existing
       Fluent UI v9 version without a version upgrade. The spike report
       must be committed to phase-4-tech.md before the frontend architect
       proceeds. If a version upgrade is required, an ADR must be raised
       and approved before any component code is written.

C-002: React Native I18nManager Verification (Gate on Mobile Phase 4 start)
       Before any mobile implementation begins, the mobile team must
       verify that I18nManager.forceRTL works within the current Expo
       managed workflow without requiring a native rebuild. The test must
       be conducted against the actual Expo SDK version in production (not
       a sandbox). If a rebuild is required, the delivery timeline must be
       revised and re-approved by the CEO before mobile Phase 4 proceeds.
       The result of this verification must be documented in phase-4-tech.md.

C-003: Dataverse Arabic Language Pack Confirmation (Gate on FR-010)
       Before implementing FR-010 (CRM-sourced OptionSet values via LCID
       1025), the backend team must confirm with the QDB Dataverse
       administrator that the Arabic Language Pack is installed and that
       OptionSet Arabic labels are accessible via the native LCID label
       API on org5869857f.crm4.dynamics.com. Written confirmation from
       QDB is required. If the Language Pack is not installed, the FR-010
       implementation must use manually entered qdb_ translations as the
       temporary path, and a clear handoff note must be included in
       phase-4-tech.md with an estimated timeline for Language Pack
       installation by QDB.

C-004: ADR for Translation Storage Schema (Gate on all backend schema work)
       The architect must produce and commit an ADR selecting the
       Dataverse translation storage schema before any backend or designer
       implementation that touches schema begins. The ADR must explicitly
       demonstrate how adding a third language requires only a new
       Dataverse configuration record and no structural schema change
       (per NFR-009). The ADR must be reviewed and approved by the QDB IT
       Director, as required by DEPENDENCY-001. This is not optional —
       the entire i18n architecture depends on this decision.

C-005: Portal Shell Coordination Resolved (Gate on toggle UX design)
       OQ-001 has been resolved by this document (see Section 4 below).
       Before the frontend UX design is finalized, the DFE team must
       formally notify the DXP-P1-001 (Portal Shell) team in writing of
       the toggle placement decision. If the portal shell team objects or
       identifies a technical conflict with the shell architecture, the
       conflict must be escalated to the CEO before design is locked.

C-006: Go-Live Translation Gate (Gate on QA sign-off)
       At least one complete form — with all translatable strings
       translated into Arabic — must be verified end-to-end in UAT by
       QDB before the QA phase is signed off. The QA report (phase-5-qa.md)
       must include a named form, confirmation that every translatable
       string type (FR-001 through FR-014) has at least one tested Arabic
       instance, and sign-off from the QDB CRM Configuration Team lead
       that the translations are accurate. This condition directly
       mitigates R-005.

C-007: Security — OData Injection Proof (Gate on code review)
       NFR-007 mandates that the lang query parameter is validated against
       the configured language list before use in any Dataverse query. The
       code reviewer must specifically verify, during Phase 6 review, that
       the lang parameter is: (a) allowlist-validated against the
       FR-025 language configuration endpoint result, (b) never
       interpolated raw into an OData filter string, and (c) returns
       HTTP 400 with a structured body for any unsupported value. No
       deployment approval is granted until this is confirmed clean.

C-008: Backward Compatibility — No Regression on English Path
       DEPENDENCY-003 must be enforced mechanically, not by assertion.
       The QA phase must include a full regression run of the existing
       English-language form rendering tests (all forms, all field types)
       against the i18n-augmented backend before any phase-5-qa.md
       sign-off. If any English-path regression is found, the build is
       blocked until resolved.


4. OPEN QUESTION DEFAULTS
─────────────────────────────────────────────────────────────────────
The following are my instructed defaults. The architect shall proceed
on these answers. Any QDB stakeholder who wishes to override a default
must do so in writing before the architecture ADR is finalised.

OQ-001: Language Toggle Placement
        DEFAULT: Inside the form, rendered at the top-right of the
        form header, owned entirely by the DFE team.
        Rationale: placing the toggle inside the form keeps team
        ownership clean, avoids a cross-team dependency on DXP-P1-001,
        and ensures the toggle travels with the form on any page. The
        portal shell team must be notified (per C-005) but does not
        gate this decision. If QDB UX requires a shell-level toggle in
        a future iteration, that is a DXP addendum, not a blocker now.

OQ-002: Language as Part of Form URL
        DEFAULT: Yes — the selected language must be reflected in the
        URL as a query parameter (?lang=ar / ?lang=en).
        Rationale: QDB is a banking institution. Customers share form
        links internally. An Arabic-language form link that arrives in
        English is a support problem and a compliance gap. The routing
        cost is low; the benefit is high. The architect must design the
        routing layer accordingly. URL lang parameter takes precedence
        over localStorage preference; localStorage is the fallback for
        direct navigation without a lang parameter.

OQ-003: Default Language for New Sessions
        DEFAULT: English first. If no lang query parameter is present
        and no localStorage preference exists, the form renders in
        English.
        Rationale: the browser Accept-Language header is unreliable and
        can produce unexpected results for bilingual users. A QDB-
        configured per-form default adds complexity that is not
        warranted at this stage. English-first is the safe, predictable
        default. The language toggle is always visible, so the cost to
        an Arabic speaker is one click. If QDB produces data showing
        Arabic-first is the majority use case, we can revisit this
        after launch.

OQ-004: Translation Completeness Gate for Publication
        DEFAULT: Allow publication with English fallback for untranslated
        strings. No blocking gate.
        Rationale: blocking publication would create a dependency on the
        CRM Configuration Team completing all translations before any
        form goes live — which is operationally unworkable for an
        institution managing 50+ forms. The fallback rule is already
        mandated at the API layer (FR-024). A completeness warning in
        the designer UI (non-blocking) is acceptable and recommended as
        a future UX enhancement, but must not be a hard gate in this
        release.

OQ-005: Mobile RTL — Hot-Switch vs. App Restart
        DEFAULT: Onboarding language selection at first app launch,
        with a restart prompt if the user changes language post-
        onboarding.
        Rationale: this decision depends on the outcome of C-002. If
        the Expo spike confirms hot-switch works without a restart, the
        mobile team should implement hot-switch (matching the web
        behaviour). If a restart is required, the onboarding selection
        model is cleaner UX than a mid-session restart prompt and avoids
        surprising users. The mobile team must implement whichever path
        the C-002 spike result dictates and document the choice in
        phase-4-tech.md.

OQ-006: Translation Export / Import (Spreadsheet)
        DEFAULT: Excluded from this engagement. Out of scope confirmed.
        This is a meaningful capability for a 50-form bilingual estate
        but it constitutes a separate BRD. If QDB raises this as a
        priority during delivery, a new engagement (DFE-i18n-002) must
        be initiated through the standard BA pipeline. It must not be
        absorbed into this engagement's scope under any circumstances.


5. ARCHITECTURE GATE CONDITIONS
─────────────────────────────────────────────────────────────────────
The architect must confirm the following before Phase 3 (Architecture)
is approved by the CEO:

AG-001: The ADR for translation storage schema (per C-004) must
        demonstrate N-language extensibility with a worked example
        showing a third language being added by Dataverse record alone.

AG-002: The ADR must specify the cache key structure for the LRU cache
        extension (AS-008). Cache invalidation strategy when a
        translation record is updated in Dataverse must be defined —
        this is a data consistency risk for a live banking portal.

AG-003: The architecture must define the API contract change for the
        existing form definition endpoint (?lang= parameter addition)
        and confirm it is backward-compatible: a call without ?lang=
        must return English, identical to the current behaviour.

AG-004: The architect must define the data model for language
        configuration records in Dataverse (per AS-009 and FR-025) and
        confirm the schema supports OQ-002 (URL lang parameter) and
        OQ-003 (English default) without additional frontend state
        management complexity.

AG-005: The architect must assess whether the 600 ms P95 NFR-001
        allowance is achievable given the proposed translation storage
        schema. If the selected schema requires multiple Dataverse
        round-trips per form load, the architect must either propose
        a denormalised read model or revise the NFR with a written
        justification before Phase 3 is approved.


6. SIGNATURE BLOCK
─────────────────────────────────────────────────────────────────────
Decision:       APPROVED WITH CONDITIONS
Engagement:     DFE-i18n-001
Document:       BRD-i18n-001 v1.0

Signed:         CEO, Maqsad AI
Date:           2026-06-24

Conditions to clear:
  C-001  Fluent UI v9 RTL Spike                     (before Frontend Phase 4)
  C-002  React Native I18nManager Verification      (before Mobile Phase 4)
  C-003  Dataverse Arabic Language Pack Confirmation (before FR-010 build)
  C-004  ADR Translation Storage Schema             (before all schema work)
  C-005  Portal Shell Coordination                  (before UX design lock)
  C-006  Go-Live Translation Gate                   (before QA sign-off)
  C-007  OData Injection Proof                      (before deployment approval)
  C-008  English Path Regression Run                (before Phase 5 sign-off)

Architecture gates to clear before Phase 3 approval:
  AG-001  N-language extensibility proof in ADR
  AG-002  LRU cache invalidation strategy defined
  AG-003  Backward-compatible API contract confirmed
  AG-004  Language configuration data model defined
  AG-005  600 ms P95 NFR feasibility assessment

═══════════════════════════════════════════════════
END OF DECISION — DFE-i18n-001
═══════════════════════════════════════════════════
