═══════════════════════════════════════════════════
AUDIT REPORT — PHASE 6
═══════════════════════════════════════════════════
Project:        Dynamic Form Engine — Multi-Language / i18n Support
Engagement ID:  DFE-i18n-001
Prepared by:    Maqsad AI — Auditor and Governance Specialist
Date:           2026-06-23
Version:        1.0
Inputs:         brd-i18n.md, brd-i18n-approval.md, phase-3-arch-i18n.md,
                phase-4-tech-i18n.md, phase-5-qa-i18n.md,
                phase-6-review-i18n.md
                Source files inspected:
                  backend/src/services/CrmTranslationQueryService.ts
                  backend/src/services/CrmTranslationWriteService.ts
                  backend/src/services/CrmLanguageConfigService.ts
                  backend/src/routes/translations.routes.ts
                  backend/src/routes/languages.routes.ts
                  backend/src/routes/internal-cache.routes.ts
                  backend/src/index.ts
                  designer/src/services/AuditLogService.ts
                  designer/src/designer/properties/panels/
                    TranslationsPanel/TranslationsPanel.tsx
                  scripts/provision-i18n-schema.mjs
═══════════════════════════════════════════════════


OVERALL AUDIT POSTURE
─────────────────────────────────────────────────────────────────────
PROCEED WITH REMEDIATION

No Critical findings. One High finding (hardcoded service-account
credentials committed to git in the provisioning script) requires
immediate remediation before the script is executed against the live
environment. One High finding (translation create/update/delete actions
are unaudited) requires remediation before go-live to satisfy the
platform's governance standard. All three CEO code-review fixes
(BLOCKER-001 entity-name mismatch, MAJOR-002 swallowed exceptions,
MAJOR-003 type cast) are verified as resolved per the phase-5 QA
confirmation. No blocking security issue prevents continued
development, but the two High findings and four outstanding governance
gates (C-003, C-004, C-005, C-006) must be cleared before production
deployment.


NFR-008 DATA RESIDENCY VERDICT
─────────────────────────────────────────────────────────────────────
PASS — with one verification outstanding (C-003).

All translation data is stored exclusively in the QDB Dataverse
environment (org5869857f.crm4.dynamics.com, Qatar region — crm4 is
the Microsoft datacenter region serving Qatar/Middle East). No
translation string is transmitted to any external translation service,
machine-translation API, or third-party localisation platform. This is
confirmed by:

  1. Architecture: the BRD (Section 4.2) explicitly excludes machine
     translation from scope. The phase-3 architecture specifies all
     qdb_translation writes target org5869857f exclusively.

  2. Code: CrmTranslationWriteService.ts and CrmTranslationQueryService.ts
     both extend CrmBaseService which is initialised with the org5869857f
     endpoint. No HTTP call to any external domain is present in either
     service.

  3. i18next-http-backend is configured to call the DFE's own backend
     only (same-origin). It does not call Dataverse or any external
     service directly.

  4. Arabic font files (Cairo, Noto Sans Arabic) are served as static
     assets from the Vite build output via the existing CDN path, not
     from an external CDN at runtime. Font binaries are committed to the
     build artefact. No runtime call to fonts.googleapis.com or any
     third-party font CDN occurs.

  5. The localStorage key "qdb_lang" stores only the language-code
     string ("en" or "ar") — no PII, no form content, no translation
     strings leave the browser.

Outstanding item: C-003 confirmation that the Dataverse Arabic Language
Pack (LCID 1025) is hosted within the same org5869857f environment. The
LCID 1025 label resolution for CRM-sourced OptionSet fields (FR-010)
reads from Dataverse's own PicklistAttributeMetadata — this is an
intra-Dataverse read, not a cross-border call. C-003 does not affect
the residency verdict; it only affects feature completeness.


═══════════════════════════════════════════════════
SECURITY RISK REGISTER
═══════════════════════════════════════════════════


Risk ID: SEC-01
Description: Service-account client secret hardcoded in provisioning
  script committed to git. scripts/provision-i18n-schema.mjs line 96:
    const CLIENT_SECRET = 'zMp8Q~~…[REDACTED — rotated per SEC-01]';
  The same secret appears in at least two other tracked scripts:
  scripts/add-file-download-document-fields.mjs line 17 and
  scripts/add-infocard-back-label.mjs line 3 — these pre-date the
  i18n engagement but the same credential pattern was carried forward
  into provision-i18n-schema.mjs. The secret is committed to the
  current branch (claude/setup-ai-company-files-IF72U) and visible
  in git history. Any developer with repository access has full
  Dataverse service-account access to org5869857f.
Likelihood: High (the credential is already in git — exposure has
  already occurred for anyone with repo access)
Impact: High (service account has Read/Write on qdb_translation and
  Read on all form entities in the live QDB banking Dataverse)
Mitigation:
  1. Rotate the CLIENT_SECRET in Azure AD immediately. The committed
     value should be considered compromised.
  2. Remove the hardcoded secret from all scripts. Replace with:
       const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
       if (!CLIENT_SECRET) throw new Error('DV_CLIENT_SECRET env var required');
  3. Add scripts/*.mjs to .gitignore, OR move to a separate
     non-tracked scripts-local/ directory with a .gitignore entry,
     OR use Azure Key Vault / GitHub Actions secrets for CI-only runs.
  4. Run a git history scan (git log -S 'zMp8Q~~' --all) and consider
     a git history rewrite if the branch is not yet public.
  Note: This finding covers the pattern across ALL scripts in the
  scripts/ directory that share this credential. The i18n engagement
  introduced provision-i18n-schema.mjs with the same pattern.
Residual risk after mitigation: Low (rotated secret + env var pattern
  removes the exposure; history rewrite eliminates the historical trace)
Confidence: 99%
Severity: HIGH


Risk ID: SEC-02
Description: POST /api/internal/cache/invalidate is protected only by
  the existing authMiddleware (Bearer token), but is accessible from
  any authenticated client — it is not restricted to loopback/internal
  callers. The architecture document (phase-3-arch-i18n.md) states
  this endpoint is "bound to loopback" and the code comment at
  backend/src/index.ts line 184 reads: "loopback restriction can be
  added later." An authenticated portal customer who obtains a valid
  Bearer token (or an attacker with a stolen token) can call this
  endpoint and flush the LRU cache for any form, forcing repeated cold
  fetches from Dataverse and enabling a targeted cache-invalidation
  denial-of-service.
Likelihood: Low (requires a valid Bearer token)
Impact: Medium (cache flush degrades performance; does not expose or
  modify data; does not bypass business logic)
Mitigation:
  Restrict the endpoint to designer/admin roles via a dedicated
  middleware check, or bind it to loopback (127.0.0.1) only, or move
  it behind an admin-only role guard using the existing role claims
  in the auth token. The comment "can be added later" should be
  converted to a go-live blocker.
Residual risk after mitigation: Low
Confidence: 85%
Severity: MEDIUM


Risk ID: SEC-03
Description: GET /api/languages is public (no authentication required).
  This is by design (the toggle must render before the user is
  authenticated in some portal flows). The endpoint exposes the list of
  supported language codes and display names — no sensitive data. The
  qdb_language_config records contain: code ("en","ar"), displayName
  ("English","Arabic"), displayNameNative, lcid, isRtl, displayOrder.
  None of these fields are confidential. No PII is exposed.
  Minor residual: the lcid and isRtl fields in the response were not
  required by FR-025 and add surface area. An attacker gains no
  material capability from knowing LCID values, but reducing the
  public response surface is good hygiene.
Likelihood: Low
Impact: Low
Mitigation: Current implementation is acceptable. Optionally strip
  lcid from the public response; isRtl is required by the frontend.
Residual risk after mitigation: Negligible
Confidence: 90%
Severity: LOW


Risk ID: SEC-04
Description: The TranslationsPanel.tsx (line 60) instantiates
  TranslationWriteService with a null auth token:
    const writeService = new TranslationWriteService(null);
  The service uses VITE_API_BASE_URL to construct requests to the
  backend, which is protected by authMiddleware (Bearer token). If
  the designer session sends requests without an auth header the
  backend will return 401. This may mean all translation writes silently
  fail in production if the auth token is not injected from another
  mechanism. The null token pattern was flagged as MINOR-005 in the
  code review. This is a functional risk (broken saves) with a secondary
  auth coverage risk.
Likelihood: Medium (the designer may have a separate auth context that
  handles this transparently, but it is not documented or tested)
Impact: Medium (translation saves fail silently; CRM Config Team gets
  no visible error; translations are never written to Dataverse)
Mitigation: Inject the active designer auth token from the Xrm context
  or from an environment-level token provider. Add a dedicated
  auth-failure test (SEC-004 from QA Finding 3) for PUT
  /api/design/translations returning 401.
Residual risk after mitigation: Low
Confidence: 85%
Severity: MEDIUM


Risk ID: SEC-05
Description: NIT-004 from the code review identified a Cyrillic
  character embedded in an Arabic string in i18nMobile.ts line 43:
    Arabic word contains U+043A (Cyrillic к) instead of U+0643
    (Arabic kaf). The intended word is the Arabic for "confirm."
  On a banking portal a corrupted Arabic string could undermine user
  trust and cause screen readers to mispronounce the word.
Likelihood: High (the defect is in committed code)
Impact: Low (static mobile UI chrome string only; not in form data)
Mitigation: Correct the character. Replace U+043A with U+0643 at
  mobile/src/i18n/i18nMobile.ts line 43.
Residual risk after mitigation: Negligible
Confidence: 99%
Severity: LOW (content defect; not a security risk)


═══════════════════════════════════════════════════
AUDIT TRAIL GAP ASSESSMENT — TRANSLATION CHANGES
═══════════════════════════════════════════════════

Finding: Translation create/update/delete operations are not emitted
as audit events.
Severity: HIGH
Confidence: 95%

Evidence:

The platform has an existing audit service (CrmAuditService.ts /
AuditLogService.ts) that records designer actions (OPEN_FORM,
SAVE_DRAFT, PUBLISH, CLONE, RESTORE_VERSION, DELETE_FORM,
ARCHIVE_FORM) as append-only entries to qdb_form_audit_log. The
governance standard in CLAUDE.md and the enterprise rules require
that every configuration change is explainable from the audit log
alone and that every decision can be reconstructed from state
transitions.

Translation records are form configuration data. When a CRM
Configuration Team member creates, modifies, or deletes an Arabic
translation for a banking form field, that change:
  - Alters the customer-facing content of a live banking form
  - May affect regulatory compliance (bilingual content obligation
    under BO-i18n-004)
  - Could change a legally significant string (e.g. a validation
    error message or a button confirmation label on a loan form)

None of these changes currently produce an audit event. The
TranslationsPanel.tsx handleSave and handleDelete callbacks call
writeService.upsertTranslation() / deleteTranslation() and then
triggerCacheInvalidation() — no AuditLogService.logAction() call
is made anywhere in the translation write path.

The existing AuditAction union type in AuditLogService.ts does not
include a translation-change action. The CrmAuditService.ts
writeAuditEntry() is only wired to the submission path, not the
designer write path.

Impact if unaddressed:
  - A regulatory examination cannot reconstruct which Arabic
    translations were active at any point in time.
  - A translation correction to a legally significant string (e.g.
    an Arabic interest rate disclosure label) leaves no trace of
    who changed it, when, or from what prior value.
  - The audit log does not satisfy the governance standard:
    "Every decision must be explainable from the audit log alone."

Remediation required before go-live:
  1. Add 'UPSERT_TRANSLATION' and 'DELETE_TRANSLATION' to the
     AuditAction union in AuditLogService.ts.
  2. Call logAction() from handleSave and handleDelete in
     TranslationsPanel.tsx after a successful write, passing:
       - formCode (already available as a prop)
       - action: 'UPSERT_TRANSLATION' or 'DELETE_TRANSLATION'
       - payload: { entityName, recordId, fieldName, languageCode,
                    newValue (upsert only), translationId (delete) }
  3. On the backend, CrmTranslationWriteService could optionally
     also write a server-side audit entry via CrmAuditService to
     ensure the audit record is created even if the designer call
     fails. This is belt-and-suspenders for a banking environment.

Append-only rule compliance:
  The existing qdb_form_audit_log table is append-only (CrmAuditService
  comment: "Append-only — never UPDATE or DELETE audit records").
  qdb_translation records themselves are NOT append-only — they are
  upserted (PUT/PATCH) and deleted. This is correct behaviour for
  translation data (corrections should replace old values). The audit
  log of those upsert/delete operations is what must be append-only.
  The remediation above achieves this correctly.

qdb_translation entity audit fields:
  The ADR-i18n-001 schema for qdb_translation specifies standard
  Dataverse audit fields (created_by, created_on, modified_by,
  modified_on). These provide record-level who/when tracking in
  Dataverse's own audit trail, which partially mitigates the gap.
  However, Dataverse's native record audit is not the platform's
  operational audit log and is not surfaced in the form designer or
  any compliance report. The platform-level audit log (qdb_form_audit_log)
  remains the authoritative record for regulatory examination purposes.
  Both mechanisms are needed.


═══════════════════════════════════════════════════
PII AND DATA CLASSIFICATION ASSESSMENT
═══════════════════════════════════════════════════

Classification verdict: translation records are form-configuration
data, not personal data. No PII concern identified.
Confidence: 95%

Evidence and analysis:

qdb_translation records store four key fields: entity name, record
GUID, field name, and the translated string value. The translated
string value is an Arabic-language version of a form label, placeholder,
error message, button label, or option set label. These are
configuration strings authored by the QDB CRM Configuration Team —
they are the same category of data as the English base values already
stored in qdb_form_field.qdb_label, qdb_form_button.qdb_label, etc.
The BRD Section 11 Data Requirements table explicitly classifies
translation records as "Internal" sensitivity, not personal data.

No path was identified where user-entered data could leak into
translation records:

  1. The translation write path (PUT /api/design/translations) is
     auth-gated and accessible only to designer users (CRM Config
     Team). Portal customers (form submitters) have no access to this
     endpoint.

  2. The value field has a 4000-char Zod limit enforced at the API
     boundary. There is no code path that copies submission data
     (form field answers) into translation records.

  3. The TranslationResolutionService is a pure read-and-replace
     function. It reads translations from the TranslationMap and
     replaces English base values in the FormDefinition DTO. It does
     not write to Dataverse.

  4. Log inspection: CrmTranslationQueryService.ts line 40 logs
     { error, correlationId, languageCode } on failure — no
     translated values are logged. CrmTranslationWriteService.ts
     does not log translation values. No PII-in-logs risk identified.

  5. LocalStorage / AsyncStorage: the only client-side persistence
     introduced by this engagement is the language-preference key
     "qdb_lang" (value: "en" or "ar"). No form content, no user
     identity, no translation strings are persisted client-side.

GDPR applicability: translation records contain no personal data of
EU/EEA data subjects. QDB is a Qatar institution; its customer data
is subject to Qatar's Personal Data Privacy Protection Law (PDPPL)
rather than GDPR. The language preference key ("en" or "ar") is a
technical preference with no identity linkage and does not constitute
personal data under PDPPL or GDPR.

Recommendation: no data-classification change required. Confirm
with QDB Compliance that the "Internal" classification for
qdb_translation records is formally documented in QDB's data
inventory register before go-live.


═══════════════════════════════════════════════════
SECRETS AND LOGGING ASSESSMENT
═══════════════════════════════════════════════════

1. Hardcoded secrets in source (see SEC-01 above)
   Status: CRITICAL pre-deployment action required (rotate + remove)

2. Console.log usage in backend source
   Only two console.error calls exist in the backend source:
   backend/src/config/env.ts lines 43-44, triggered at module load
   when env vars fail Zod validation. The structured logger (pino)
   is not yet initialised at that point — this is a genuine
   boot-time constraint. The code review (MINOR-001) flagged this
   and recommended a WHY comment. No sensitive data (secrets,
   tokens, PII) is passed to these console.error calls. Verdict:
   acceptable with the documenting comment.

3. Structured logger usage in new i18n services
   All three new services use the platform logger (pino via
   logger.error):
     - CrmTranslationQueryService.ts line 40: logs correlationId
       and languageCode only. No translated values, no user data.
     - CrmLanguageConfigService.ts line 64: logs the error object
       and operation name only. No sensitive data.
   No console.log calls in any i18n service or route file.
   Verdict: PASS.

4. Provisioning script console.log calls
   scripts/provision-i18n-schema.mjs uses console.log for seed
   progress output (lines 133-169). These log entity names and
   language codes only — no secrets, no PII. The script is a
   one-time manual execution tool, not a production service.
   Verdict: acceptable for a CLI script.

5. C-004 gate on provisioning script execution
   The provision-i18n-schema.mjs header contains a prominent
   warning block (lines 1-13) stating "DO NOT execute until
   C-004 is cleared." This gate is not automated — it relies on
   human discipline. The risk is that a developer runs the script
   against the live environment without C-004 approval.
   Mitigation recommendation: add a runtime guard to the script:
     if (!process.env.C004_APPROVED) {
       throw new Error('C-004 not cleared. Set C004_APPROVED=true
         only after written IT Director approval.');
     }
   This converts the documentation gate into an execution gate.
   Confidence: 90%


═══════════════════════════════════════════════════
ACCESSIBILITY COMPLIANCE (NFR-005 / NFR-006)
═══════════════════════════════════════════════════

Status: PARTIAL PASS — staging gate outstanding.

What is implemented and confirmed:

  1. HTML lang and dir attributes (FR-019):
     DirectionProvider.tsx sets document.documentElement.lang and
     .dir on every language change. Confirmed by automated tests
     (DirectionProvider.test.tsx, 4 tests pass). AC-014 and AC-015
     are COVERED.

  2. Arabic ARIA labels (FR-020):
     The server-resolved FormDefinition delivers Arabic strings as
     the field label props. When lang="ar" is set on document root,
     screen readers interpret these labels as Arabic. LanguageToggle
     has aria-label="Language" and aria-pressed on active option.

  3. RTL keyboard navigation:
     FluentUI v9 with dir="rtl" on FluentProvider provides correct
     RTL keyboard tab order and focus indicator direction (C-001 spike
     confirmed all DFE Fluent components are RTL-compliant at v9.56.3).

  4. Font loading (FR-018):
     font-display: swap is used (provided by Fontsource packages)
     preventing FOIT. FOUT is acceptable. Confirmed in code.

What remains outstanding (staging-gate only):

  NFR-006 — NVDA + Chrome (Windows) and VoiceOver + Safari (iOS)
  manual screen reader testing has not been performed. This requires
  a deployed staging environment with Arabic translation data seeded
  (blocked on C-004). This is QA GAP-003.

  AC-010 partial — Arrow icon mirroring in StepperActionBar is
  deferred (QA GAP-006). Arabic users will see Back/Forward arrows
  pointing in the wrong direction. This is cosmetic but violates
  FR-017(d) ("directional icons are mirrored") and WCAG 2.1 guidance
  on icon semantics. Must be resolved before go-live.

Audit position: WCAG 2.1 AA compliance for Arabic-rendered forms
CANNOT be formally asserted until NFR-006 screen reader testing and
GAP-006 arrow icon fix are completed in staging. Claiming WCAG
compliance before these steps is a compliance misrepresentation.
The implementation provides the correct structural foundations
(lang/dir attributes, RTL layout, Arabic ARIA labels) but the
evidence of compliance requires staging validation.


═══════════════════════════════════════════════════
GOVERNANCE GATES CARRY-FORWARD
═══════════════════════════════════════════════════

The following CEO conditions from brd-i18n-approval.md remain open
and must be closed before go-live. This audit does not and cannot
clear them — it documents their status for the CEO final decision.

C-003: Dataverse Arabic Language Pack Confirmation
  Status: OUTSTANDING
  Required before: FR-010 (CRM-sourced OptionSet values) implementation
  Responsible party: QDB Dataverse administrator
  Risk if uncleared: FR-010 falls back to English labels for all
    CRM-sourced option set fields when Arabic is selected. This is
    silent and detectable only by testing — the QDB compliance team
    may believe Arabic is fully active when option set values are
    not translated.
  Audit note: the C-003 fallback (LCID 1025 absent → LCID 1033) is
    correctly implemented and does not cause an error. But the absence
    of written confirmation means FR-010 compliance is unverified.

C-004: ADR Translation Storage Schema — QDB IT Director Approval
  Status: OUTSTANDING (most critical governance gate)
  Required before: any schema changes are applied to org5869857f
  Responsible party: QDB IT Director (written approval required)
  Risk if uncleared: the provision-i18n-schema.mjs script must not
    be executed; the two new Dataverse entities cannot be deployed;
    C-006 live UAT cannot proceed; the i18n feature cannot go live
    under any circumstances.
  Audit note: ADR-i18n-001 in phase-3-arch-i18n.md is technically
    sound and satisfies all AG-00x architecture gates. The blocker
    is governance approval, not technical readiness.

C-005: Portal Shell Coordination
  Status: OUTSTANDING
  Required before: frontend UX design is finalised
  Responsible party: DFE team (must send written notification to
    DXP-P1-001 portal shell team)
  Risk if uncleared: the language toggle placement decision (inside
    the form, top-right, DFE-owned) is made without the portal shell
    team's knowledge. If a future portal shell update repositions the
    header, the toggle placement may conflict.
  Audit note: the OQ-001 decision is correct and implemented. The
    notification is a governance formality that protects team
    boundaries, not a technical dependency.

C-006: Go-Live Translation Gate (Live UAT sign-off)
  Status: OUTSTANDING — BLOCKED on C-004
  Required before: QA phase sign-off and go-live
  Responsible party: QDB CRM Configuration Team lead
  Dependency: C-004 must be cleared first (schema deploy required)
  Risk if uncleared: the i18n feature ships without any human
    verification that Arabic translations display correctly on a
    real form with real Dataverse data. This is the primary
    functional completeness gate for a bilingual banking portal.
  Audit note: the C-006 UAT plan is fully documented in
    phase-5-qa-i18n.md Section 4. The seed script
    (seed-dfe-all-features-ar-translations.mjs) has not yet been
    created — this is a prerequisite for C-006 execution.

Additional pre-go-live items from QA (not CEO conditions but blocking
audit sign-off):

  GAP-006: StepperActionBar arrow icon mirroring must be implemented
    before go-live. This is an FR-017(d) requirement, not a
    cosmetic nice-to-have.

  SEC-01 remediation (hardcoded secret rotation and script cleanup)
    must be completed before the provisioning script is run.

  SEC-02 remediation (internal cache endpoint access restriction)
    should be completed before go-live.

  Audit trail for translation changes (HIGH finding above) must be
    implemented before go-live. Add UPSERT_TRANSLATION and
    DELETE_TRANSLATION audit events to the designer write path.

  SEC-004 / Finding 3 (QA): unauthenticated PUT test for translation
    write endpoint must be added.


═══════════════════════════════════════════════════
OWASP TOP 10 ASSESSMENT (i18n surface only)
═══════════════════════════════════════════════════

A01 Broken Access Control
  New routes: PUT /api/design/translations and DELETE
  /api/design/translations/:id are mounted under the authMiddleware
  guard (backend/src/index.ts line 182 is after line 162 authMiddleware).
  Translation read (GET) is also auth-gated. GET /api/languages is
  intentionally public. POST /api/internal/cache/invalidate is
  auth-gated but not role-restricted (see SEC-02).
  Gap: SEC-02 (cache invalidation accessible to all authenticated users).
  Verdict: PARTIAL — SEC-02 must be addressed.

A02 Cryptographic Failures
  No new cryptographic operations introduced. Translation values are
  stored as plaintext in Dataverse (configuration data, not secrets).
  Auth uses existing Bearer token / Azure AD pattern unchanged.
  Verdict: NOT APPLICABLE to this delta.

A03 Injection
  Lang parameter: three-layer defence (regex + allowlist + OData
  single-quote escape). Confirmed PASS by code review C-007.
  Translation write path: entityName, recordId, fieldName inputs are
  Zod-validated. buildAlternateKey() single-quote-escapes all four
  OData key parts. fetchTranslationsForRecord() escapes entityName
  and recordId before interpolation.
  Verdict: PASS. OData injection on all new input surfaces is
  mitigated. Standard Zod validation at API boundaries.

A04 Insecure Design
  The null auth token pattern in TranslationWriteService (SEC-04) is
  a design gap — it may result in unauthenticated writes silently
  failing rather than raising an alert.
  Verdict: GAP (SEC-04 — Medium severity).

A05 Security Misconfiguration
  The hardcoded client secret (SEC-01) is the most significant
  misconfiguration. The internal cache endpoint access (SEC-02) is
  a minor misconfiguration.
  Verdict: GAP — SEC-01 (High) must be remediated immediately.

A06 Vulnerable and Outdated Components
  New dependencies introduced:
    i18next ^26.3.2, react-i18next ^17.0.8, i18next-http-backend ^4.0.0,
    i18next-icu ^1.x, @fontsource-variable/cairo@5.2.7,
    @fontsource/noto-sans-arabic@5.2.10, expo-updates ^56.0.19,
    expo-font ^14.0.12.
  All are actively maintained open-source packages adopted per
  dependencies-i18n.md. No known CVEs identified at the time of
  this audit. Standard dependency scanning (npm audit) should be
  run before go-live.
  Verdict: LOW RISK — standard dependency hygiene applies.

A07 Identification and Authentication Failures
  No new auth mechanism introduced. Translation write endpoints use
  existing auth infrastructure. The null token in TranslationWriteService
  is a functional risk more than an auth bypass (the backend still
  enforces auth). Verdict: see SEC-04.

A08 Software and Data Integrity Failures
  No new pipeline steps, no serialisation of untrusted data.
  Translation values are stored as Memo text — they are not executed.
  React's default HTML escaping prevents stored XSS from translation
  values rendered in JSX (QA SEC-005 PASS).
  Verdict: PASS.

A09 Security Logging and Monitoring Failures
  Translation write operations are not logged to the platform audit
  log (see Audit Trail section above — HIGH finding). This is an
  A09 gap for a banking portal.
  Verdict: GAP — HIGH finding must be remediated.

A10 Server-Side Request Forgery
  No new server-side HTTP calls to user-controlled URLs. The backend
  calls org5869857f.crm4.dynamics.com (fixed, from config) only.
  The i18next-http-backend on the client calls the DFE backend
  (same-origin). No SSRF surface introduced.
  Verdict: NOT APPLICABLE to this delta.


═══════════════════════════════════════════════════
SERVICE ACCOUNT REVIEW
═══════════════════════════════════════════════════

Service account: Azure AD app registration (CLIENT_ID:
  08e80e93-0bab-45ef-8372-2e554fa9af9b)

This is the existing DFE service account used across all backend
Dataverse operations. The i18n engagement adds two new Dataverse
entities to its access scope:

  qdb_translation     — Read (portal backend reads translations)
                     — Write (designer backend upserts/deletes translations)
  qdb_language_config — Read (portal backend + designer reads language list)

Architecture section on Dataverse solution packaging specifies:
  "Portal service account — Read on qdb_translation and
   qdb_language_config (least privilege)."
  "CRM Configuration Team — Read/Write on qdb_translation;
   Read on qdb_language_config."

Assessment:
  The architecture prescribes separate permissions for the portal
  service account (read-only) vs. the designer path (read/write).
  However, the same CLIENT_ID is used for both the portal backend
  and the designer backend in the current implementation (both call
  CrmBaseService which uses the same auth credentials). This means
  the portal service account has write access to qdb_translation
  even though the portal only needs read access.

  Least-privilege gap: the portal metadata-read path and the
  designer write path share one service account. If the portal
  backend were compromised, an attacker could write arbitrary
  translation records via the write path the account has no
  business reason to exercise.

  Remediation: Create a second Azure AD app registration (or a
  restricted Dataverse connection) for the designer backend that
  holds the write permission. The portal backend connection should
  be read-only on qdb_translation. This requires a Dataverse
  security role split and two separate AZURE_CLIENT_* env var sets.
  Priority: Medium (the portal backend is already auth-gated — this
  is a defence-in-depth improvement, not an immediate blocker).
Confidence: 85%


═══════════════════════════════════════════════════
DATA RESIDENCY REVIEW (SUMMARY)
═══════════════════════════════════════════════════

See NFR-008 section at top of this document for full verdict.

  Verdict:                 PASS
  Translation storage:     org5869857f.crm4.dynamics.com (Qatar region)
  External transmission:   NONE confirmed
  Font delivery:           Static Vite build output (same CDN as app)
  Client-side persistence: Language code string only ("en" or "ar")
  Cross-border risk:       None identified
  Outstanding:             C-003 confirmation (Language Pack residency
                           — not a residency risk, a completeness gate)


═══════════════════════════════════════════════════
FINDINGS SUMMARY TABLE
═══════════════════════════════════════════════════

| ID      | Severity | Description                                       | Status                          |
|---------|----------|---------------------------------------------------|---------------------------------|
| SEC-01  | HIGH     | Hardcoded client secret in provisioning script    | OPEN — immediate action required|
| AUD-01  | HIGH     | Translation changes not emitted as audit events   | OPEN — pre-go-live required     |
| SEC-02  | MEDIUM   | Internal cache endpoint not role/loopback-gated   | OPEN — pre-go-live recommended  |
| SEC-04  | MEDIUM   | Null auth token in TranslationWriteService        | OPEN — pre-go-live required     |
| SVC-01  | MEDIUM   | Portal + designer share one service account       | OPEN — defence-in-depth         |
| ACC-01  | MEDIUM   | WCAG compliance not verified (staging gate)       | BLOCKED on C-004                |
| ACC-02  | MEDIUM   | Arrow icon mirroring in StepperActionBar missing  | OPEN — pre-go-live required     |
| SEC-03  | LOW      | lcid exposed in public /api/languages response    | ACCEPTABLE (optional cleanup)   |
| SEC-05  | LOW      | Cyrillic character in Arabic mobile string        | OPEN — trivial fix              |
| C-003   | GATE     | Arabic Language Pack confirmation outstanding     | OUTSTANDING — QDB admin action  |
| C-004   | GATE     | IT Director ADR approval outstanding              | OUTSTANDING — highest priority  |
| C-005   | GATE     | Portal shell notification outstanding             | OUTSTANDING — administrative    |
| C-006   | GATE     | Live UAT not executed                             | BLOCKED on C-004                |

Cleared by code review (BLOCKER-001, MAJOR-002, MAJOR-003):
  Grid column entity name mismatch: FIXED
  Swallowed exceptions in TranslationsPanel: FIXED
  Type assertion in LanguageProvider: FIXED

C-007 OData injection (CEO condition): PASS (per phase-6-review-i18n.md)
C-008 English path regression: PASS (confirmed in phase-5-qa-i18n.md)
NFR-008 Data residency: PASS


═══════════════════════════════════════════════════
GO-LIVE CLEARANCE
═══════════════════════════════════════════════════

NOT CLEARED

Conditions that must be met before production deployment:

  MUST (blocking):
  1. SEC-01: Rotate CLIENT_SECRET immediately. Remove from all scripts
     and replace with env var pattern. Audit git history.
  2. AUD-01: Implement UPSERT_TRANSLATION and DELETE_TRANSLATION audit
     events in the designer translation write path.
  3. SEC-04: Resolve null auth token in TranslationWriteService. Add
     401 test for translation write endpoint.
  4. ACC-02: Implement arrow icon mirroring in StepperActionBar.
  5. C-004: Obtain written QDB IT Director approval for ADR-i18n-001.
     Deploy qdb_translation and qdb_language_config to org5869857f.
  6. C-006: Execute live UAT on a complete form with Arabic seed data.
     Obtain QDB CRM Config Team lead written sign-off.
  7. SEC-02: Restrict POST /api/internal/cache/invalidate to
     designer/admin roles or loopback.

  SHOULD (strongly recommended before go-live):
  8. C-003: Obtain written confirmation of Arabic Language Pack status.
  9. C-005: Send written notification to DXP-P1-001 team.
  10. ACC-01: Execute NVDA + VoiceOver screen reader testing in staging.
  11. SVC-01: Create separate read-only service account for portal backend.
  12. Load test: P95 600ms under 100 concurrent users (QA GAP-001).
  13. Payload size assertion test (QA GAP-007).
  14. FormContext field-value preservation unit test (QA Finding 1).

═══════════════════════════════════════════════════
END OF DOCUMENT — DFE-i18n-001 Phase 6 Audit v1.0
═══════════════════════════════════════════════════
