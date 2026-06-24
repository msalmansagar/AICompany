═══════════════════════════════════════════════════
CEO FINAL DECISION — PHASE 7
═══════════════════════════════════════════════════
Project:        Dynamic Form Engine — Multi-Language / i18n Support
Engagement ID:  DFE-i18n-001
Decision by:    CEO, Maqsad AI
Date:           2026-06-24
Version:        1.0
Inputs:         brd-i18n.md, brd-i18n-approval.md (Phase 1)
                dependencies-i18n.md (GitHub research)
                phase-3-arch-i18n.md (Architecture)
                phase-4-tech-i18n.md (Technical build)
                phase-5-qa-i18n.md (QA)
                phase-6-review-i18n.md (Code review)
                phase-6-audit-i18n.md (Audit)
═══════════════════════════════════════════════════


1. DECISION
─────────────────────────────────────────────────────────────────────
APPROVED WITH CONDITIONS

Staging deployment is cleared. Production deployment is NOT cleared.


2. STRATEGIC RATIONALE
─────────────────────────────────────────────────────────────────────
This engagement was commissioned to close a material compliance gap at
Qatar Development Bank: a live banking portal operating exclusively in
English inside a jurisdiction where Arabic is a co-equal first language
and bilingual digital services are a regulatory obligation. Every
business objective from Phase 1 (BO-i18n-001 through BO-i18n-006) has
been addressed in the build. The architecture is sound, extensible, and
correctly confined to Dataverse — no third-party translation services,
no data residency risk, no structural dependency on the English path.
The delivery team has produced a complete, well-structured piece of
work across five packages (backend, frontend, designer, mobile, shared).

The Phase 1 success criteria are materially met at the code level:

  SC-1 Arabic rendering: Fully implemented. All 26 BRD acceptance
    criteria have automated coverage or a documented staging gate.
    FR-001 through FR-014 (all translatable string types) are covered
    in 13 TranslationResolutionService unit tests, all passing.

  SC-2 RTL layout: Fluent v9 RTL confirmed built-in at v9.56.3 (C-001
    cleared). React Native RTL via I18nManager confirmed and implemented
    with onboarding + restart path (C-002 cleared). DirectionProvider
    and RtlManager are cleanly isolated modules per NFR-011.

  SC-3 No English regression: C-008 is PASS. Zero new failures across
    backend (158 tests), frontend (159 tests), designer (42 tests).
    Mobile pre-existing 23 failures confirmed pre-dating i18n.

  SC-4 N-language extensibility: ADR-i18n-001 (universal qdb_translation
    table) is the correct architectural choice. The French worked example
    in phase-3-arch-i18n.md demonstrates zero schema change and zero
    code deployment for a third language. AG-001 through AG-005 are all
    satisfied.

  SC-5 Performance budget: Estimated P95 ~426ms against a 600ms budget,
    with ~174ms headroom. The single-batched translation query design
    is architecturally sound. Live validation required in staging.

  SC-6 Designer authoring: TranslationsPanel is config-driven, requires
    no code change to add a language. Save-on-blur writes to Dataverse.
    AC-017, AC-018, AC-019 are all covered.

  SC-7 OData injection (C-007): PASS confirmed by code review.
    Three-layer defence (regex, allowlist, parameterised OData) is
    exemplary. The code reviewer specifically commended this pattern.

The engagement cannot be cleared for production because four governance
gates remain open (C-003, C-004, C-005, C-006) and two High audit
findings (SEC-01 hardcoded credential, AUD-01 missing audit events)
require remediation before customer data is touched on a live banking
system. These are not architectural failures — they are the final
governance and operational steps that separate "code-complete" from
"production-ready" in a regulated financial institution.

The decision is therefore: the engineering pipeline is approved; the
production gate remains locked until the conditions below are cleared
in sequence.


3. IMMEDIATE ACTION — INDEPENDENT OF GO-LIVE
─────────────────────────────────────────────────────────────────────
SEC-01 CREDENTIAL ROTATION — DO THIS NOW, NOT AT GO-LIVE

The audit identified a service-account client secret committed to git
in scripts/provision-i18n-schema.mjs (and pre-existing in at least two
other tracked scripts). The value 'zMp8Q~~…[REDACTED — rotated per SEC-01]'
is visible to every developer with repository access and gives
Read/Write access to the live QDB banking Dataverse environment
(org5869857f.crm4.dynamics.com).

This is not a go-live condition — it is an immediate operational
security action. The sequence is:

  Step 1. Rotate the Azure AD client secret today. The current value
          must be treated as compromised from the moment it was
          committed to git.

  Step 2. Replace the hardcoded value in all affected scripts with:
            const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
            if (!CLIENT_SECRET) throw new Error('DV_CLIENT_SECRET env
              var required');

  Step 3. Run: git log -S 'zMp8Q~~' --all
          Assess whether a git history rewrite is warranted. If the
          branch has not been pushed to a public or shared remote,
          a rewrite is strongly recommended.

  Step 4. Add scripts/*.mjs to .gitignore or move to a non-tracked
          scripts-local/ directory.

  Owner:  Engineering lead
  Deadline:  Within 24 hours of this decision.
  This step is not gated on anything. There is no reason to wait.


4. GO-LIVE CONDITIONS CHECKLIST — PRIORITISED
─────────────────────────────────────────────────────────────────────
The following conditions are listed in the order they must be resolved.
A condition marked [GATE] blocks all conditions that follow it in the
same dependency chain. Each condition includes an owner and the phase
gate that validates it.

--- TIER 1: GOVERNANCE (all others are blocked until these clear) ---

COND-01  [GATE — HIGHEST PRIORITY]
         C-004: QDB IT Director written approval of ADR-i18n-001
         (universal translation table schema)
         What:  ADR-i18n-001 in phase-3-arch-i18n.md is technically
                sound. This is a governance gate, not a technical one.
                Until the IT Director approves the schema in writing,
                the provision-i18n-schema.mjs script must NOT be
                executed, qdb_translation and qdb_language_config must
                NOT be deployed to org5869857f.crm4.dynamics.com, and
                live UAT cannot proceed.
         Owner: QDB IT Director (approval) + Maqsad AI delivery lead
                (submission of ADR-i18n-001 for review)
         Gate phase: Architecture sign-off (this condition was always
                     a pre-condition; it is the entry key for production)

COND-02  C-003: Written confirmation from QDB Dataverse administrator
         that the Arabic Language Pack (LCID 1025) is installed on
         org5869857f.crm4.dynamics.com
         What:  If the Language Pack is absent, FR-010 (CRM-sourced
                OptionSet values via LCID) silently falls back to
                English labels. QDB Compliance must not believe Arabic
                is fully active when option set values remain in
                English. The written confirmation forces the issue
                onto the QDB side where it belongs.
         Owner: QDB Dataverse administrator
         Gate phase: Before FR-010 is tested in staging

COND-03  C-005: Written notification to the DXP-P1-001 (Portal Shell)
         team that the language toggle is placed inside the form
         (top-right, DFE-owned) per OQ-001 decision
         What:  This is an administrative boundary formality that
                protects the DXP team from a future UX conflict they
                were not consulted on. The OQ-001 decision is correct;
                the notification is the governance artefact.
         Owner: DFE team lead (send the notification)
         Gate phase: Before frontend UX design is locked in staging

--- TIER 2: SECURITY (can proceed in parallel with Tier 1) ---

COND-04  AUD-01: Implement UPSERT_TRANSLATION and DELETE_TRANSLATION
         audit events in the designer translation write path
         What:  Translation records are form configuration data that
                alter customer-facing content of live banking forms.
                A regulatory examination of bilingual content (BO-i18n-004
                compliance obligation) must be reconstructable from the
                platform audit log. This is a High audit finding with
                no reasonable justification for deferral on a banking
                portal. Add the two audit actions to AuditAction in
                AuditLogService.ts. Call logAction() from TranslationsPanel
                handleSave and handleDelete after successful writes.
                Optionally add a server-side belt-and-suspenders call
                in CrmTranslationWriteService for resilience.
         Owner: Backend + designer developers
         Gate phase: Before live UAT (C-006)

COND-05  SEC-02: Restrict POST /api/internal/cache/invalidate to
         designer/admin roles or loopback
         What:  An authenticated portal customer can currently flush
                the form metadata LRU cache, enabling targeted cache
                invalidation as a soft denial-of-service. The fix is
                a role guard or loopback binding — one middleware line.
                The architecture doc stated "loopback restriction can
                be added later" — later is now.
         Owner: Backend developer
         Gate phase: Before production deployment

COND-06  SEC-04: Resolve null auth token in TranslationWriteService
         and add a 401 test for PUT /api/design/translations
         What:  TranslationsPanel instantiates TranslationWriteService
                with null as the auth token. If the designer session
                does not inject a token through another mechanism, all
                translation saves fail silently in production. This
                breaks the CRM Configuration Team's primary tool and
                silently violates C-006 (translations are never written
                to Dataverse). The fix: inject the active designer auth
                token. Also add the SEC-004 unauthenticated write test
                identified in QA Finding 3.
         Owner: Designer frontend developer
         Gate phase: Before live UAT (C-006)

--- TIER 3: RTL COMPLETENESS (required before go-live) ---

COND-07  ACC-02 / GAP-006: Implement ArrowLeft/ArrowRight icon mirroring
         in StepperActionBar
         What:  The C-001 spike identified that FluentUI icons do not
                auto-mirror in RTL. ArrowLeftRegular (Back) and
                ArrowRightRegular (Next) carry directional semantic
                meaning. In Arabic mode, the back arrow points right
                and the next arrow points left — the opposite of correct.
                This is an FR-017(d) requirement ("directional icons
                are mirrored"), not a cosmetic issue. The fix is
                clearly defined: StepperActionBar consumes
                useDirection() from DirectionProvider and swaps icon
                assignments based on dir value. A follow-up PR must
                be delivered, reviewed, and merged before go-live.
         Owner: Frontend developer
         Gate phase: Before live UAT verification

--- TIER 4: UAT AND STAGING VALIDATION (sequenced after Tier 1) ---

COND-08  C-006: Live UAT execution and QDB CRM Configuration Team lead
         written sign-off
         What:  This is the primary functional completeness gate.
                The build is code-complete and all FR-001 through
                FR-014 string types are tested at unit level, but no
                human has yet verified Arabic translations on a real
                form with real Dataverse data. The UAT plan is fully
                documented in phase-5-qa-i18n.md Section 4.
                Preconditions before UAT can execute:
                  (a) COND-01 cleared (C-004 IT Director approval)
                  (b) COND-04 cleared (AUD-01 audit events implemented)
                  (c) COND-06 cleared (SEC-04 auth token resolved)
                  (d) COND-07 cleared (arrow icon mirroring done)
                  (e) provision-i18n-schema.mjs executed against
                      org5869857f (entities deployed)
                  (f) seed-dfe-all-features-ar-translations.mjs created
                      and executed (min 30 Arabic translation records
                      covering all FR-001..FR-014 string types)
                Required output: QDB CRM Configuration Team lead
                written sign-off confirming Arabic translations are
                accurate and the form experience is correct end-to-end.
         Owner: QDB CRM Configuration Team lead (sign-off) +
                Maqsad AI QA (execution)
         Gate phase: QA Phase 5 sign-off

COND-09  GAP-001 / AC-024: k6 load test confirming P95 <= 600ms under
         100 concurrent users with ?lang=ar
         What:  The architecture estimates ~426ms P95 (AG-005), which
                is well within the 600ms budget. But estimates are not
                evidence. The 600ms NFR is a contractual success
                criterion from Phase 1 and cannot be asserted without
                a load test against a staging environment with real
                Dataverse response times and real qdb_translation data.
                Create scripts/k6-i18n-load.js. Run against staging.
                The test must pass before go-live sign-off.
         Owner: QA Engineer
         Gate phase: Staging validation

COND-10  GAP-002 / AC-025: Toggle re-render latency <= 300ms measured
         in staging on a mid-range device
         What:  NFR-002 states the full re-render (all strings, RTL
                flip) must complete within 300ms from click to last
                paint. This must be measured with Chrome Performance
                timeline or React DevTools Profiler on a 4-core/4GB
                device with a stable 4G connection. If the measurement
                fails, the prefetch optimisation documented in the
                architecture (alternate language payload pre-fetch on
                initial load) must be implemented.
         Owner: Frontend developer + QA Engineer
         Gate phase: Staging validation

COND-11  GAP-003 / NFR-006: NVDA + Chrome (Windows) and VoiceOver +
         Safari (iOS) manual screen reader testing
         What:  WCAG 2.1 AA compliance for Arabic-rendered forms cannot
                be formally asserted without screen reader testing.
                The implementation provides correct structural
                foundations (lang/dir attributes, Arabic ARIA labels,
                RTL tab order via FluentProvider), but evidence of
                compliance requires human verification. Claiming WCAG
                compliance without this step is a compliance
                misrepresentation. Required before go-live.
         Owner: QA Engineer (manual test) + QDB Compliance (acceptance)
         Gate phase: Staging validation

COND-12  GAP-005 / C-001 residual: DatePicker calendar popup direction
         confirmed in staging environment
         What:  The C-001 spike documented that the DatePicker popup
                direction in v9.56.3 appears correct via CSS logical
                properties, but this must be confirmed in a real
                browser render in staging (not jsdom). If the popup
                opens in the wrong direction, apply the documented CSS
                override before go-live.
         Owner: Frontend developer
         Gate phase: Staging validation

--- TIER 5: CODE QUALITY (recommended; not strictly blocking) ---

COND-13  QA Finding 1 / GAP-009: Unit test for FormContext field-value
         preservation on language switch (AC-007)
         What:  The isFirstLoadRef guard in FormContext.tsx is the
                mechanism that prevents field values being reset when
                the user switches language. This is a data-loss
                scenario in production if the guard is ever removed
                during a future FormContext refactor. The test is
                straightforward to write and provides a regression
                safety net for a High-severity scenario.
         Owner: Frontend developer
         Urgency: High — add before the first post-launch FormContext
                  change, ideally before go-live.

COND-14  QA Finding 2 / GAP-007: Automated payload-size comparison
         test (AC-023)
         What:  The 120% payload ceiling is architecturally guaranteed
                but not mechanically enforced in CI. Add a backend
                integration test that serialises both ?lang=en and
                ?lang=ar responses for the dfe-all-features form and
                asserts the byte-count ratio does not exceed 120%.
         Owner: Backend developer
         Urgency: Medium — recommended before go-live.

COND-15  SVC-01: Separate read-only service account for portal backend
         What:  The portal metadata-read path and the designer write
                path share one Azure AD app registration, giving the
                portal backend write access to qdb_translation that
                it has no business reason to exercise. This is a
                defence-in-depth improvement: create a second app
                registration with read-only Dataverse access for the
                portal, and restrict the write-capable registration
                to the designer backend only.
         Owner: QDB IT Director (Dataverse security role) +
                Maqsad AI backend developer (env var split)
         Urgency: Medium — not an immediate blocker; complete before
                  the first post-launch security review.


5. WHAT IS CLEARED NOW
─────────────────────────────────────────────────────────────────────
The following activities are explicitly approved to proceed without
further CEO gates:

  CLEARED: Staging environment deployment of all code changes.
           The build is code-complete with 391 green tests (backend:
           158, frontend: 159, designer: 42, mobile new: 32),
           0 TypeScript errors, C-007 (OData injection) PASS,
           C-008 (English regression) PASS. The three code-review
           blockers (BLOCKER-001 entity name mismatch, MAJOR-002
           swallowed exceptions, MAJOR-003 type cast) are all
           confirmed fixed and verified per the audit report.

  CLEARED: All further development work (COND-04 through COND-15)
           may proceed in parallel. Engineering does not need to
           wait for COND-01 (IT Director approval) to fix the
           audit events, resolve the auth token issue, implement
           the arrow icon mirroring, or write the missing tests.
           These are parallel tracks.

  CLEARED: sec-01 credential rotation (see Section 3 above). This
           is not gated on anything and must be executed immediately.

  NOT CLEARED: Production deployment. No form in the Arabic i18n
           feature may be deployed to the live QDB customer portal
           until COND-01 through COND-12 are all formally confirmed
           closed. The sequence-critical path is:
             COND-01 (IT Director ADR approval) →
             COND-08 (live UAT) →
             COND-09/10/11/12 (staging validation) →
             COND-02/03/04/05/06/07 cleared (parallel) →
             Production go-live.


6. ALIGNMENT WITH PHASE 1 SUCCESS CRITERIA
─────────────────────────────────────────────────────────────────────
Each Phase 1 success criterion is assessed against the engagement
output:

  SC-1: Arabic rendering across all string types (FR-001..FR-014)
        Status: PASS at unit test level. Live UAT still required (C-006).

  SC-2: RTL layout reversal, font loading, icon semantics
        Status: PASS for core layout and font. Arrow icon mirroring
        (StepperActionBar) is OUTSTANDING (COND-07).

  SC-3: English-path regression-free
        Status: PASS — C-008 confirmed clean.

  SC-4: Designer authoring without code deployment
        Status: PASS — TranslationsPanel is config-driven. AC-018
        satisfied. Auth token issue (COND-06) must be resolved to
        make saves functional in production.

  SC-5: Performance: P95 <= 600ms under 100 concurrent users
        Status: ESTIMATED PASS (~426ms). NOT YET VERIFIED against
        live Dataverse. COND-09 is the validation gate.

  SC-6: N-language extensibility without schema change
        Status: PASS — ADR-i18n-001 proven with French example.

  SC-7: No OData injection via lang parameter
        Status: PASS — C-007 confirmed by code reviewer.

  SC-8: Translation data remains in Qatar (NFR-008)
        Status: PASS — data residency confirmed by audit.


7. STRATEGIC OBSERVATIONS
─────────────────────────────────────────────────────────────────────
Three observations for QDB stakeholders:

OBSERVATION 1 — The C-004 gate is the only thing separating this
feature from production. The architecture is approved; the code is
complete; the tests are green. The QDB IT Director's written approval
of ADR-i18n-001 is the critical path. This is not a complex decision
— the ADR proposes a single universal translation table, justifies
it against two alternatives, and demonstrates N-language extensibility
with a worked example. I recommend the IT Director be given a clean
executive summary of ADR-i18n-001 (a one-pager) rather than the full
architecture document to accelerate the approval timeline.

OBSERVATION 2 — The CRM Configuration Team data-entry gate (C-006)
is a delivery risk that QDB owns, not Maqsad AI. The seed script
approach (seed-dfe-all-features-ar-translations.mjs) in the QA plan
is the right mitigation — it allows UAT to proceed without waiting
for the team to manually enter all translations through the designer.
I recommend the seed script be prepared in parallel with the C-004
approval process so it is ready to execute immediately after the
entities are deployed.

OBSERVATION 3 — The pre-existing mobile test failures (23 tests,
4 suites) are not a DFE-i18n-001 issue but they degrade CI signal
quality for the entire mobile package. The fixes are well-understood
(SafeAreaProvider mock wrapper, json-rules-engine Jest mapper). These
should be resolved as a separate maintenance task before the next
mobile feature delivery begins, regardless of the DFE-i18n-001
timeline.


8. SIGNATURE BLOCK
─────────────────────────────────────────────────────────────────────
Decision:       APPROVED WITH CONDITIONS
                Staging deployment CLEARED.
                Production deployment NOT CLEARED pending COND-01..COND-12.

Engagement:     DFE-i18n-001
Document:       Phase 7 Final CEO Decision v1.0

Signed:         CEO, Maqsad AI
Date:           2026-06-24

Immediate action (independent of go-live):
  SEC-01 credential rotation — within 24 hours

Go-live conditions critical path:
  COND-01  C-004: QDB IT Director ADR approval   (GATE — highest priority)
  COND-02  C-003: Arabic Language Pack written confirmation
  COND-03  C-005: Portal Shell team notification
  COND-04  AUD-01: Audit events for translation changes
  COND-05  SEC-02: Cache invalidation endpoint role restriction
  COND-06  SEC-04: Null auth token in TranslationWriteService resolved
  COND-07  ACC-02: StepperActionBar arrow icon mirroring
  COND-08  C-006: Live UAT + QDB CRM Config lead sign-off  (GATE — depends on COND-01)
  COND-09  GAP-001: k6 load test P95 <= 600ms
  COND-10  GAP-002: Toggle re-render <= 300ms measured
  COND-11  GAP-003: NVDA + VoiceOver screen reader testing
  COND-12  GAP-005: DatePicker RTL popup staging confirmation

Recommended (not strictly blocking):
  COND-13  FormContext field-value preservation unit test
  COND-14  Payload size assertion test
  COND-15  Separate read-only service account for portal backend

Confirmed clean (no further action on these items):
  C-001    Fluent v9 RTL spike: CLEARED
  C-002    Expo RTL verification: CLEARED
  C-007    OData injection: PASS
  C-008    English path regression: PASS
  NFR-008  Data residency: PASS
  BLOCKER-001 / MAJOR-002 / MAJOR-003: FIXED AND VERIFIED

═══════════════════════════════════════════════════
END OF DOCUMENT — DFE-i18n-001 Phase 7 CEO Final Decision v1.0
═══════════════════════════════════════════════════
