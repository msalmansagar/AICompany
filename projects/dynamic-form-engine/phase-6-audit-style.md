═══════════════════════════════════════════════════════════════════════
PHASE 6 — SECURITY, COMPLIANCE, AND GOVERNANCE AUDIT
═══════════════════════════════════════════════════════════════════════
Project:        DFE-STYLE-001 — Advanced Visual Styling & Full CSS Control
Client:         Qatar Development Bank (QDB)
Product:        Dynamic Form Engine (DFE)
Prepared by:    Maqsad AI — Auditor
Date:           2026-06-29
Status:         FINAL
References:     brd-style.md, brd-style-approval.md, phase-3-arch-style.md,
                phase-4-tech-style.md, phase-5-qa-style.md,
                brd-style-resolutions.md
Build status:   TypeScript clean (all 4 packages); 442 unit tests green;
                code review PASS WITH FOLLOWUPS (non-functional deferred items only)
═══════════════════════════════════════════════════════════════════════


AUDIT SCOPE
───────────────────────────────────────────────────────────────────────
This audit covers the following code paths directly reviewed:

  shared/src/sanitizer/CssSanitiserPlugin.ts       (CSS injection defense)
  backend/src/sanitizer/CssSanitiser.ts             (server-side sanitizer)
  frontend/src/theme/customCssInjector.ts            (runtime injection + on-prem re-sanitize)
  frontend/src/theme/StyleEngine.ts                  (memoization, RTL substitution)
  designer/src/services/AllowlistService.ts          (allowlist fetch + fail-safe)
  designer/src/services/DesignService.ts             (upsert orchestration)
  designer/src/services/AuditLogService.ts           (audit trail)
  designer/src/state/designerStore.ts                (DesignPayload store)
  backend/src/services/DesignAssembler.ts            (OData queries, payload assembly)
  shared/src/utils/contrastRatio.ts                  (WCAG formula)
  scripts/provision-style-schema.mjs                 (infrastructure provisioning)
  crm-solution/src/Roles/qdb_css_allowlist_admin.xml (security role)
  phase-3-arch-style.md                              (ADRs, skeptic resolutions)
  phase-4-tech-style.md, phase-5-qa-style.md         (build and test evidence)

The 90 QA integration/E2E cases are pre-release follow-ups. Where those test
cases directly verify a security NFR, this audit calls that out explicitly. Six
deferred clean-code items (M-004, M-008, M-009, M-010, m-001, m-004 from the
code review) are non-functional and carry no security weight; they are not
re-examined here.


═══════════════════════════════════════════════════════════════════════
1. SECURITY RISK REGISTER
═══════════════════════════════════════════════════════════════════════

──────────────────────────────────────────────────────────────────────
SEC-01 — AUDIT LOG MISSING STYLE_CHANGE ACTION (BR-012 NOT IMPLEMENTED)
──────────────────────────────────────────────────────────────────────
Confidence: 97%
Likelihood: High (it is not implemented, not a probability)
Impact:     High (regulatory audit trail is incomplete; style changes are
            untraceable to actor + delta without this log)

Description:
  BR-012 requires a qdb_form_audit_log entry on every style save, recording
  actor ID, actor display name, timestamp, and the delta of changed
  DesignPayload fields. The AuditLogService.AuditAction union type
  (designer/src/services/AuditLogService.ts:11-18) defines:
    OPEN_FORM | SAVE_DRAFT | PUBLISH | CLONE | RESTORE_VERSION |
    DELETE_FORM | ARCHIVE_FORM
  There is no STYLE_CHANGE action.

  The DesignService (designer/src/services/DesignService.ts) does not
  call AuditLogService.logAction from any of its six upsert methods
  (upsertTheme, upsertFormDesign, upsertSectionDesign, upsertFieldDesign,
  upsertButtonDesign, upsertLayoutGrid). The FormSaveService calls
  logAction with SAVE_DRAFT (not for style saves). PublishService creates
  a STYLE_CHANGE qdb_publish_job, but this is a cache-rebuild trigger,
  not an audit log entry.

  Additionally, BR-012 requires the audit entry to record the DELTA of
  changed fields, not simply the action. The current AuditPayload type
  (AuditLogService.ts:21-26) is generic (fieldCount, tabCount, etc.) and
  has no typed delta structure for DesignPayload fields.

Mitigation (required before go-live):
  1. Add STYLE_CHANGE to the AuditAction union in AuditLogService.ts.
  2. Define a TypedStyleDeltaPayload interface capturing entity type
     (theme/formDesign/sectionDesign/fieldDesign/buttonDesign/layoutGrid),
     changed field keys, before values, and after values.
  3. Call logAction(formId, 'STYLE_CHANGE', delta) from each DesignService
     upsert method after the Dataverse write succeeds (append-only — the
     write must succeed before the log entry is created; do not roll back
     Dataverse writes on log failure but do surface log failures via the
     injected ILogger).
  4. BR-012 explicitly prohibits logging the full customCss value — the
     delta for customCss must record only "customCss changed" (boolean flag
     or character-count delta), not the CSS string itself.

Residual risk after mitigation: Low (append-only audit records, actor context,
  typed delta all present; BR-012 compliance restored).

NOTE: This is a go-live blocker. QDB's compliance team will require the audit
  trail for regulatory examination. This audit cannot clear the engagement
  for CEO approval until this is fixed.

──────────────────────────────────────────────────────────────────────
SEC-02 — ALLOWLIST ADMIN ROLE: BASIC WRITE CANNOT UPDATE SERVICE-PRINCIPAL-OWNED RECORD
──────────────────────────────────────────────────────────────────────
Confidence: 90%
Likelihood: High (structural Dataverse ownership rule; deterministic failure)
Impact:     High (QDB IT cannot manage the domain allowlist in production —
            the core operational control for CSS injection defence is locked)

Description:
  The qdb_css_allowlist_admin.xml security role grants:
    prvWriteqdb_css_allowlist_config  level="Basic"  (line 37)
    prvCreateqdb_css_allowlist_config level="Basic"  (line 36)
    prvReadqdb_css_allowlist_config   level="Organization" (line 38)

  The provisioning script (provision-style-schema.mjs:138-148) seeds the
  global allowlist record using the service principal's client credentials.
  In Dynamics/Dataverse, records created via the Web API under a service
  principal are owned by the executing service principal account (an
  Application User), not by any human user.

  Dataverse Basic-level write privilege means a user can only update records
  they own. A form administrator assigned the CSS Allowlist Admin role will
  not own the service-principal-created global record and will receive a
  privilege error when attempting to update it.

  This makes the operational management path of the allowlist (the primary
  control for NFR-008 and ADR-STYLE-004) non-functional for the users it
  was designed for.

Mitigation:
  Option A (recommended): Change prvWriteqdb_css_allowlist_config from
    level="Basic" to level="Organization" in qdb_css_allowlist_admin.xml.
    An "Organization" write scope lets the CSS Allowlist Admin update any
    record in the entity regardless of ownership. Since the entity is
    organisation-owned and holds global configuration (not user-specific
    data), organisation-scope write is appropriate and the role name
    accurately signals elevated responsibility.

  Option B: Transfer ownership of the global record to a system admin team
    account after provisioning. This adds a manual step to the runbook and
    is fragile (ownership transfer must be repeated after any re-provisioning).
    Not recommended.

Residual risk after mitigation: Low (role is intentionally elevated;
  assignment is gated to named IT administrators per SC-05 design intent).

──────────────────────────────────────────────────────────────────────
SEC-03 — ON-PREM RUNTIME ALWAYS USES EMPTY ALLOWLIST (ARCHITECTURE DIVERGENCE)
──────────────────────────────────────────────────────────────────────
Confidence: 95%
Likelihood: Confirmed (code diverges from architecture spec)
Impact:     High (1. TC-INT-010 will fail as written; 2. any approved CDN
            background-image url() in customCss will silently render blank
            on the on-prem runtime while rendering correctly on the portal)

Description:
  Phase-3 architecture (Section 7, On-Prem Runtime Path) describes:
    "Xrm.WebApi.retrieveMultipleRecords(...) fetches the active
    qdb_css_allowlist_config record; JSON.parse(record.qdb_allowed_domains_json)
    extracts the domains array; customCss is passed through
    postcss([createCssSanitiserPlugin(allowedDomains)]).process(customCss)"

  The actual implementation (frontend/src/theme/customCssInjector.ts:59):
    const plugin = createCssSanitiserPlugin([]);
    // comment: "with an EMPTY allowlist (block all url()) since the
    // Dataverse allowlist is not reachable from this render-time path"

  The on-prem runtime never calls Xrm.WebApi for the allowlist. It always
  sanitizes customCss with an empty allowed-domains list, unconditionally
  stripping every url() reference. This deviates from the architecture and
  produces a silent functional divergence between the portal and the on-prem
  runtime for any form using an approved CDN url() in customCss.

  QA test TC-INT-010 ("On-prem runtime reads allowlist via Xrm.WebApi on form
  load") will fail against this implementation.

  Security note: the deviation is safer than the architecture intended. The
  empty allowlist provides stronger defence in depth. However, the functional
  gap is undocumented and may surface as a CRM user complaint in UAT.

Mitigation:
  Either (a) Update the architecture to formally accept the empty-allowlist
  decision for the on-prem path (ADR-STYLE-005 amendment), update TC-INT-010
  to reflect the actual behaviour, and document the functional limitation
  (url() in customCss does not render on the on-prem runtime), OR (b) Implement
  the Xrm.WebApi allowlist read in the on-prem runtime as originally designed
  (requires wiring AllowlistService into the on-prem HTML runtime).

  Recommended: Option (a). The empty-allowlist approach is a defensible
  security stance. The gap is functional, not a vulnerability. Formalise it
  as a known limitation in the DEPLOYMENT-RUNBOOK-style.md and in the
  Phase 7 handover notes to QDB IT.

Residual risk after mitigation: Low (security is stronger; functional gap
  is documented and accepted).

──────────────────────────────────────────────────────────────────────
SEC-04 — HARDCODED SERVICE PRINCIPAL CLIENT ID AND TENANT ID IN SOURCE
──────────────────────────────────────────────────────────────────────
Confidence: 95%
Likelihood: Medium (values in source are not rotatable without a code change)
Impact:     Medium (CLIENT_ID exposure combined with a leaked DV_CLIENT_SECRET
            grants authentication as the service principal)

Description:
  provision-style-schema.mjs:29-31:
    const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
    const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
    const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';

  The service principal CLIENT_ID is hardcoded in version-controlled source.
  Although a CLIENT_ID alone is not sufficient to authenticate (the
  DV_CLIENT_SECRET is correctly loaded from env), its presence in source
  reduces the effort required to exploit a separately leaked secret and
  ties the codebase to a specific service principal that cannot be rotated
  without a code change.

  DATAVERSE_URL is environment-specific and should be configurable to enable
  running the provisioning script against a staging or DR org without code
  modification.

Mitigation:
  Move TENANT_ID, CLIENT_ID, and DATAVERSE_URL to .env file variables
  (same pattern as DV_CLIENT_SECRET). The script already reads
  DV_CLIENT_SECRET from process.env; extend the same pattern to the three
  constants. Add DV_TENANT_ID, DV_CLIENT_ID, DV_DATAVERSE_URL to the
  required env check at line 22. Update the provisioning runbook.

Residual risk after mitigation: Low (no infrastructure identifiers in source;
  all secrets and config are in .env which is gitignored).

──────────────────────────────────────────────────────────────────────
SEC-05 — BACKEND ALLOWLIST STALENESS: NO REFRESH OR ALERT ON DATAVERSE CHANGE
──────────────────────────────────────────────────────────────────────
Confidence: 92%
Likelihood: Medium (operational procedure gap; will materialise if QDB IT
            needs to revoke an allowlisted domain urgently)
Impact:     Medium (a compromised CDN domain removed from the Dataverse
            allowlist continues to be accepted by the backend until restart)

Description:
  backend/src/sanitizer/CssSanitiser.ts:6:
    const ALLOWED_DOMAINS: readonly string[] = parseAllowedDomainsFromEnv();

  The backend reads ALLOWED_CSS_DOMAINS_JSON once at startup and caches it
  in a module-level constant for the process lifetime. The architecture
  (phase-3-arch-style.md Section 7) acknowledges this: "A restart is required
  to pick up allowlist changes. This is acceptable for v1 given the infrequency
  of domain additions."

  This is acceptable for domain additions. It becomes a security gap for
  domain removals (e.g., a CDN provider is compromised and QDB IT needs to
  immediately revoke the domain). In that scenario, the Dataverse record
  update takes effect in the designer and on-prem runtime immediately (next
  page load), but the Fastify backend continues accepting the domain until a
  rolling restart completes — which may take minutes in a containerised
  deployment.

  There is currently no operational procedure, alert, or runbook step for this
  scenario.

Mitigation:
  1. Add a runbook procedure in DEPLOYMENT-RUNBOOK-style.md: "To revoke an
     allowlisted domain: (a) update the Dataverse qdb_css_allowlist_config
     record; (b) update ALLOWED_CSS_DOMAINS_JSON in the container secret store
     (Kubernetes Secret / Azure App Configuration); (c) trigger a rolling
     restart of the Fastify service."
  2. Add a health-check endpoint or startup log that emits the currently active
     allowed domains list at INFO level so operations can confirm the running
     state without restarting.
  3. Document the revocation SLA (e.g., < 15 minutes from Dataverse update to
     full backend refresh after rolling restart).

Residual risk after mitigation: Low (procedure exists; lag is bounded and
  documented; designer and on-prem path are instant).

──────────────────────────────────────────────────────────────────────
SEC-06 — MISSING ALLOWED_CSS_DOMAINS_JSON: SILENT DEGRADATION WITH WARN-ONLY LOG
──────────────────────────────────────────────────────────────────────
Confidence: 85%
Likelihood: Low (deployment automation should set the env var)
Impact:     Medium (all url() in customCss silently stripped for all portal
            users; no operator visibility unless logs are monitored)

Description:
  backend/src/sanitizer/CssSanitiser.ts:8-10: if ALLOWED_CSS_DOMAINS_JSON is
  absent, the function returns [] and logs:
    logger.warn({raw}, 'ALLOWED_CSS_DOMAINS_JSON is not a JSON array')

  The warn log correctly fires. But without active log monitoring/alerting,
  the degradation (approved CDN images absent from all form renders) may be
  invisible in production until a QDB form administrator notices the visual
  regression. The service starts normally and does not fail.

Mitigation:
  Log at ERROR level (not WARN) when ALLOWED_CSS_DOMAINS_JSON is absent or
  malformed at startup. Add a startup health check that fails with a
  non-zero exit code if the list is empty AND the environment is production
  (NODE_ENV=production). This surfaces a misconfigured deployment at pod
  startup rather than at the first form render.

Residual risk after mitigation: Low.

──────────────────────────────────────────────────────────────────────
SEC-07 — EXCEPTION SWALLOWING IN customCssInjector.sanitiseWithPostCss
──────────────────────────────────────────────────────────────────────
Confidence: 90%
Likelihood: Low (PostCSS failure is rare; requires API incompatibility or OOM)
Impact:     Medium (entire customCss silently dropped; no log; violates
            CLAUDE.md error handling standards)

Description:
  frontend/src/theme/customCssInjector.ts:52-65:
    function sanitiseWithPostCss(css: string): string {
      try {
        ...
        return result.css;
      } catch {
        return '';
      }
    }

  Any exception from PostCSS processing returns empty string silently.
  CLAUDE.md prohibits empty catch blocks: "Never swallow exceptions silently."
  The function also returns '' when typeof PostCSS === 'undefined' (line 54)
  — again silently. An operator debugging a form where customCss disappeared
  has no log evidence to diagnose the cause.

  Note: The fail-closed behaviour (return '' on failure) is correct for
  security. The violation is the absence of logging, not the empty return.

Mitigation:
  Replace the empty catch with a structured log:
    } catch (error) {
      injectorLogger.warn('PostCSS sanitization failed — customCss cleared',
        { error: error instanceof Error ? error.message : String(error) });
      return '';
    }
  The ILogger abstraction pattern from AllowlistService is appropriate here.
  Inject a logger via module parameter or a module-level configurable sink
  (same NOOP_LOGGER pattern used in AllowlistService.ts:27).

Residual risk after mitigation: Low.

──────────────────────────────────────────────────────────────────────
SEC-08 — AllowlistService SUBDOMAIN OVERMATCH: PARENT DOMAINS ALLOW ALL SUBDOMAINS
──────────────────────────────────────────────────────────────────────
Confidence: 80%
Likelihood: Low (only exploitable if QDB IT adds a parent domain rather
            than a specific subdomain to the allowlist)
Impact:     Medium (e.g., adding "googleapis.com" permits any subdomain
            including a potential future compromised or adversary-controlled
            subdomain under that parent)

Description:
  designer/src/services/AllowlistService.ts:202-209:
    function isDomainOrParentAllowed(hostname, allowedDomains): boolean {
      return allowedDomains.some(
        (allowedDomain) =>
          hostname === allowedDomain || hostname.endsWith(`.${allowedDomain}`),
      );
    }

  This logic intentionally allows subdomains of any listed parent domain.
  The seeded allowlist uses specific subdomains (fonts.googleapis.com,
  fonts.gstatic.com), which is correct. However, if QDB IT ever adds
  "googleapis.com" (parent) to the allowlist, every subdomain of googleapis.com
  becomes permitted, including any future subdomain that Google (or an attacker
  who compromises a subdomain) controls.

  The same subdomain-matching logic applies to the CssSanitiserPlugin.ts
  url() domain check (line 154: allowedDomains.has(parsed.hostname)) — the
  plugin uses EXACT matching (not subdomain matching). This creates an
  asymmetry: AllowlistService.isUrlAllowed() is more permissive than
  CssSanitiserPlugin for the same allowlist.

Mitigation:
  1. Document in the Dataverse qdb_css_allowlist_config record's
     qdb_notes field and in the DEPLOYMENT-RUNBOOK-style.md: "Always add
     specific subdomains (e.g., fonts.googleapis.com), never parent domains.
     Adding a parent domain permits all present and future subdomains."
  2. Consider adding a validation check in AllowlistService when a domain
     is loaded: warn (via ILogger) if a loaded domain string contains fewer
     than two dot-separated segments (i.e., is a root domain like
     "googleapis.com"), as this is a probable misconfiguration.
  3. Align AllowlistService and CssSanitiserPlugin to use the same matching
     strategy. Recommend EXACT match for both (add specific subdomains to
     the list), and remove the subdomain-expansion logic from AllowlistService.

Residual risk after mitigation: Low (operator guidance is clear; a validation
  guard catches parent-domain entries at load time).

──────────────────────────────────────────────────────────────────────
SEC-09 — NFR-007 SCOPE WRAPPER: CUSTOMCSSINJECTOR DOES NOT ADD .dfe-form-{code}
──────────────────────────────────────────────────────────────────────
Confidence: 70%
Likelihood: Low-to-Medium (cannot confirm from reviewed code whether the
            caller adds the wrapper)
Impact:     Medium (if the scope wrapper is absent, custom CSS rules can
            affect CRM native UI elements that share class names with QDB
            form elements, violating NFR-007 and CEO C-005)

Description:
  NFR-007 requires customCss to be injected inside a .dfe-form-{formCode}
  scope wrapper. CssSanitiserPlugin.ts validates that selectors contain
  ".qdb-" (line 115-116), but this only confirms the CSS targets .qdb-*
  elements — it does not confirm the injected style block is wrapped in a
  form-specific scope at the DOM level.

  customCssInjector.ts exports sanitiseCustomCssForRuntime(rawCss) which
  returns a sanitized CSS string. The function does not add a scope wrapper.
  Whether the caller wraps the returned string before injecting it as a
  <style> element was not verifiable from the reviewed files.

  The QA test TC-E2E-008 explicitly verifies this scoping behaviour in E2E.
  If the caller does add the wrapper, NFR-007 is satisfied. If it does not,
  it is a security gap.

Mitigation:
  Verify (during TC-E2E-008 execution) that the <style> element injected by
  the runtime contains the form-scoped selector wrapper. If the caller does
  not add it, move the scoping responsibility into sanitiseCustomCssForRuntime
  (add formCode parameter and wrap the output in .dfe-form-{formCode} {...}).
  This makes the NFR-007 guarantee a property of the sanitizer function, not
  an implicit caller contract.

Residual risk after mitigation: Low (scope enforcement is explicit and testable).

──────────────────────────────────────────────────────────────────────
SEC-10 — ODATA $filter STRING INTERPOLATION WITHOUT GUID VALIDATION
──────────────────────────────────────────────────────────────────────
Confidence: 75%
Likelihood: Very Low (GUIDs come from the publish job queue, an internal
            Dataverse record — not direct user input)
Impact:     Low (in Dataverse OData, $filter injection exploitability is
            limited; a malformed GUID causes a 400 error, not data exposure)

Description:
  backend/src/services/DesignAssembler.ts:148-149, 163-178, 199-205, 210-216:
    `&$filter=${FORM_DESIGN_ATTRS.FORM_DEFINITION_ID_VALUE} eq '${formDefinitionId}'`
    plus multiple places where tabIds, sectionIds, fieldIds are OR-chained
    into $filter strings.

  The formDefinitionId parameter to assembleDesignPayload() is not validated
  as a UUID/GUID before use. It originates from the publish job queue
  (qdb_publish_job.qdb_form_definition_id), which is a Dataverse GUID —
  a controlled internal value. However, if in a future code path this ID is
  sourced from an external API request (e.g., a hypothetical cache invalidation
  endpoint), the interpolation becomes exploitable.

Mitigation:
  Add a UUID format validation at the top of assembleDesignPayload:
    if (!isValidGuid(formDefinitionId)) {
      throw new DomainError('invalid_form_definition_id', { formDefinitionId });
    }
  Where isValidGuid() validates the standard UUID v4 hex-and-hyphens format.
  This is a one-line defensive validation that closes the vector permanently
  regardless of future call-site changes.

Residual risk after mitigation: Negligible.

──────────────────────────────────────────────────────────────────────
SEC-11 — TODO COMMENT IN DesignService SIGNALS INCOMPLETE MIGRATION
──────────────────────────────────────────────────────────────────────
Confidence: 75%
Likelihood: Low (likely a harmless legacy-compat stub per migration design)
Impact:     Low (if ThemeEditorScreen migration is incomplete, old
            DesignerStyleModel references may remain in production code)

Description:
  designer/src/services/DesignService.ts:104-105:
    // TODO(DFE-STYLE-001): Remove once ThemeEditorScreen migration is complete.
    listThemeSummaries(): Promise<ThemeSummary[]> { return this.theme.listThemes(); }

  The architecture and phase-4 summary describe the migration as complete
  (TC-UT-051 / TC-REG-004 verify zero DesignerStyleModel references). The
  TODO comment contradicts this. Either (a) the migration is complete and
  the TODO was not cleaned up, or (b) ThemeEditorScreen migration is still
  in progress and DesignerStyleModel may still be referenced.

  The grep test (TC-UT-051) will resolve this: if it passes in CI, the
  migration is done and the comment is stale. If it fails, this is a
  compliance issue (SM-008 violated).

Mitigation:
  Run TC-UT-051 grep in CI (it is already in the CI Stage 1 plan). If it
  passes, remove the TODO comment. If it fails, complete the migration
  before go-live (SM-008 requirement).

Residual risk after mitigation: Negligible.

──────────────────────────────────────────────────────────────────────
SEC-12 — contrastRatio FAILURE_RESULT RETURNED AS SHARED MUTABLE REFERENCE
──────────────────────────────────────────────────────────────────────
Confidence: 65%
Likelihood: Very Low (no callers currently mutate the result object;
            TypeScript types do not express immutability)
Impact:     Low (if a caller mutated the returned object, all subsequent
            malformed-hex inputs would return the corrupted value)

Description:
  shared/src/utils/contrastRatio.ts:46-51:
    const FAILURE_RESULT: ContrastResult = { ratio: 0, level: 'Fail', ... };
    ...
    if (!fg || !bg) return FAILURE_RESULT;  // returns the shared reference

  FAILURE_RESULT is a module-level const object returned by reference to all
  callers that supply malformed hex input. There is no Object.freeze() or
  readonly enforcement at runtime.

Mitigation:
  Apply Object.freeze(FAILURE_RESULT) at declaration, or return a spread copy:
    if (!fg || !bg) return { ...FAILURE_RESULT };
  Either approach eliminates the shared-reference mutation risk at negligible
  performance cost (FAILURE_RESULT is returned only for malformed input, not
  the hot path).

Residual risk after mitigation: Negligible.


═══════════════════════════════════════════════════════════════════════
2. OWASP TOP 10 ASSESSMENT (2021)
═══════════════════════════════════════════════════════════════════════

A01 — Broken Access Control
  Applicable? YES (CSS Allowlist Admin role, form-administrator access controls)
  Mitigated by: qdb_css_allowlist_admin.xml security role (SC-05 design).
                Existing form-administrator access policy model (DFE-ADD-001/002).
  Gap: SEC-02 above — Basic write level prevents the designated admin from
       updating the service-principal-owned global record. Go-live blocker
       until role write level is elevated to Organisation scope.
  Status: FAIL (SEC-02 open)

A02 — Cryptographic Failures
  Applicable? Marginal — fontUrl is HTTPS-only enforced (BR-010).
              No new cryptographic operations introduced.
  Mitigated by: HTTPS-only validation at designer save path for fontUrl.
                TLS on all Dataverse and Fastify endpoints (existing infrastructure).
  Gap: None new to this engagement.
  Status: PASS

A03 — Injection (CSS Injection)
  Applicable? YES (primary risk of this engagement — NFR-005/007/008)
  Mitigated by:
    - @import always stripped (CssSanitiserPlugin.ts:57-58)
    - url() off-allowlist stripped (CssSanitiserPlugin.ts:129-131)
    - expression() and javascript: stripped (CssSanitiserPlugin.ts:125-127)
    - behavior: stripped (CssSanitiserPlugin.ts:121-123)
    - html/body/:root/global * selectors stripped (CssSanitiserPlugin.ts:105-108)
    - Non-.qdb-prefixed selectors stripped (CssSanitiserPlugin.ts:115-116)
    - @font-face blocks with off-allowlist src removed (CssSanitiserPlugin.ts:67-78)
    - Three-layer defense: designer save + backend save endpoint + runtime injection
    - On-prem re-sanitizes before DOM injection (customCssInjector.ts)
    - CSS class names validated to CSS identifier charset only (BR-009)
    - Backend sanitizer confirmed PostCSS AST-level (not regex-only)
  Gap: SEC-07 (silent exception swallowing in sanitiseWithPostCss) — medium.
       SEC-09 (scope wrapper not confirmed in caller) — medium.
  Status: PASS WITH CONDITIONS (SEC-07 and SEC-09 must be addressed)

A04 — Insecure Design
  Applicable? YES (single allowlist governs two different use cases; on-prem
              divergence from architecture)
  Mitigated by: ADR-STYLE-004 (deliberate single allowlist design).
  Gap: SEC-03 (on-prem always uses empty allowlist vs. architecture spec) —
       architecturally divergent, secure in effect, but not documented as
       accepted. SEC-05 (allowlist staleness on revocation) — governance gap.
  Status: PASS WITH CONDITIONS (SEC-03 requires architecture acceptance or fix)

A05 — Security Misconfiguration
  Applicable? YES (env vars, security role scopes, seed data)
  Mitigated by: DV_CLIENT_SECRET loaded from env (provision-style-schema.mjs:22-24).
                Provisioning script is idempotent and has dry-run mode.
                qdb_css_allowlist_config global record seeded automatically.
  Gap: SEC-04 (TENANT_ID, CLIENT_ID hardcoded in source).
       SEC-06 (missing env var at startup logs warn only, not error/fatal).
  Status: FAIL — SEC-04 (hardcoded identifiers) and SEC-06 (degraded startup)
          must be addressed before production deployment.

A06 — Vulnerable and Outdated Components
  Applicable? YES (PostCSS 8.x, color@5 supply-chain attack noted)
  Mitigated by: npm audit --audit-level=high prescribed (SC-10 resolution).
                Current DFE lockfiles verified clean of Sept-2025 supply-chain
                versions (phase-4-tech-style.md).
                ADR-STYLE-003 documents the PostCSS adoption decision and the
                lockfile audit requirement.
  Gap: No tool has been formally designated in the CI pipeline configuration
       (phase-4 says "npm audit --audit-level=high prescribed" but CI YAML
       not reviewed). Confirm the CI step exists before go-live.
  Status: PASS WITH CONDITIONS (CI lockfile audit step must be verified
          in the actual pipeline configuration)

A07 — Identification and Authentication Failures
  Applicable? Marginal (designer runs inside CRM — existing CRM auth governs).
              On-prem Xrm.WebApi calls use CRM session auth.
  Mitigated by: Existing CRM Dynamics on-prem authentication model.
                AllowlistService uses Xrm.WebApi (session-authenticated).
  Gap: None new to this engagement.
  Status: PASS

A08 — Software and Data Integrity Failures
  Applicable? YES (render cache is consumed by on-prem runtime without re-auth;
              supply-chain of PostCSS and its transitive deps)
  Mitigated by: On-prem runtime re-sanitizes cache contents before injection
                (C-005b / ADR-STYLE-005) — cache tampering is detected.
                The PATCH semantics (NFR-016) prevent full-record overwrite.
                DesignPayload version 3 marker allows cache format validation.
  Gap: The qdb_render_cache record can be updated by any user with the
       system-level CRM plugin that writes it. Cache tamper detection relies
       on re-sanitization, not on record-level integrity checksums. This is
       acceptable for v1 but should be documented as a residual risk.
  Status: PASS WITH CONDITIONS (document the residual cache-integrity
          dependency on re-sanitization, no new action required for v1)

A09 — Security Logging and Monitoring Failures
  Applicable? YES — this is the most significant gap (SEC-01)
  Mitigated by: Existing AuditLogService.logAction for SAVE_DRAFT / PUBLISH.
                Backend uses pino structured logging.
  Gap: SEC-01 (STYLE_CHANGE not in AuditAction) is a direct A09 failure.
       Style changes — including setting the CSS allowlist domain and changing
       customCss — are not logged to the audit trail, making forensic
       reconstruction of a CSS injection incident impossible.
  Status: FAIL (SEC-01 is a go-live blocker)

A10 — Server-Side Request Forgery (SSRF)
  Applicable? Marginal — fontUrl is a URL supplied by an authenticated admin.
              The URL is validated against the allowlist before save and never
              fetched server-side; the browser fetches it. No server-side
              fetch of user-supplied URLs exists in the build.
  Mitigated by: fontUrl domain validation (BR-010) prevents arbitrary URLs.
                The backend never fetches fontUrl — it stores it for the
                browser to load.
  Gap: None.
  Status: PASS


═══════════════════════════════════════════════════════════════════════
3. CSS INJECTION DEFENCE — DETAILED VERIFICATION
═══════════════════════════════════════════════════════════════════════

This section provides the CEO-required audit test coverage evidence from
brd-style-approval.md Section "SUCCESS CRITERIA FOR PHASE 7" item 4.

TEST VECTOR A — @import in customCss
  Code path:  CssSanitiserPlugin.ts:57-60, sanitiseAtRules()
  Rule:       BLOCKED_AT_RULE_NAMES includes 'import'
  Result:     @import removed before the rule is inspected.
  QA test:    TC-UT-017 (unit), TC-SC-001 (manual staging)
  Audit verdict: PASS

TEST VECTOR B — url() with off-allowlist domain in background declaration
  Code path:  CssSanitiserPlugin.ts:129-131, sanitiseDeclarations()
  Rule:       containsBlockedUrl() -> isUrlDomainAllowed() -> Set lookup
  Result:     Entire declaration removed; partial removal not attempted.
  QA test:    TC-UT-018 (unit), TC-SC-002 (manual staging)
  Audit verdict: PASS

TEST VECTOR C — expression() in declaration
  Code path:  CssSanitiserPlugin.ts:125-127 via hasBlockedValuePattern()
  Rule:       BLOCKED_VALUE_PATTERNS regex /expression\s*\(/i
  Result:     Declaration removed.
  QA test:    TC-UT-020 (unit), TC-SC-003 (manual staging)
  Audit verdict: PASS

TEST VECTOR D — On-prem runtime behaviour when tampered cache entry is served
  Code path:  customCssInjector.ts:52-65, sanitiseWithPostCss()
  Rule:       Re-sanitizes with empty allowlist (all url() stripped; @import
              stripped; expression/javascript/behavior stripped; non-.qdb-
              selectors stripped)
  Result:     Tampered CSS (e.g., @import or off-allowlist url()) removed before
              DOM injection.
  QA test:    TC-SC-004 (manual, requires real CRM environment; SC-02 spike
              verified PostCSS browser IIFE loads in sandbox environment).
  Audit verdict: PASS (subject to TC-SC-004 manual confirmation in real
              CRM iframe — currently spike-verified, real-CRM-iframe
              not yet formally confirmed)

TEST VECTOR E — cssClassName with injected attribute syntax
  Code path:  Designer validation in FieldStylePanel / SectionStylePanel
              (CSS identifier regex: letters, digits, hyphens, underscores only)
  Rule:       BR-009 — cssClassName must pass /^[a-zA-Z_][a-zA-Z0-9_-]*$/
  Result:     Values with angle brackets, quotes, parentheses, semicolons
              rejected at designer validation; cannot be saved to Dataverse.
  QA test:    TC-SC-005 (manual, staging)
  Audit verdict: PASS (backend DesignAssembler does not re-validate cssClassName
              from Dataverse; relies on designer save-path validation.
              Document this trust boundary explicitly.)

Overall CSS Injection Defence verdict: PASS WITH CONDITIONS
  Conditions: (1) TC-SC-004 executed in a real CRM iframe before go-live.
              (2) SEC-09 (scope wrapper) verified by TC-E2E-008.
              (3) SEC-07 (silent exception swallowing) remediated.


═══════════════════════════════════════════════════════════════════════
4. COMPLIANCE ASSESSMENT — SECURITY NFR CHECKLIST
═══════════════════════════════════════════════════════════════════════

NFR-005 — CSS Injection Prevention
  Requirement:   @import, off-allowlist url(), expression(), behavior: stripped
                 at both designer save and runtime injection.
  Implemented:   YES — CssSanitiserPlugin (three-layer: designer + backend + runtime)
  Gap:           SEC-07 (silent exception swallowing degrades logging, not
                 security). Backend sanitizer strips on save AND cache assembly.
  Verdict:       MEETS REQUIREMENT (with SEC-07 remediation)

NFR-006 — CSS Class Name Sanitization
  Requirement:   cssClassName accepts only CSS identifier chars; rejects < > ' " ()
  Implemented:   YES — designer validation panels enforce BR-009 regex
  Gap:           Backend DesignAssembler trusts Dataverse values without
                 re-validation. If a malicious value bypasses the designer UI
                 (direct Xrm API call), it reaches the DesignPayload unfiltered.
                 Low risk because only authenticated form admins have write access,
                 but a defence-in-depth validation in DesignAssembler would close
                 this gap.
  Verdict:       SUBSTANTIALLY MET — document the trust boundary for classnames
                 from Dataverse; add back-end validation in a follow-on.

NFR-007 — CSS Scoping
  Requirement:   customCss injected inside .dfe-form-{formCode} scope wrapper
                 to prevent bleeding into CRM native UI.
  Implemented:   CssSanitiserPlugin validates that selectors contain .qdb-.
                 Runtime injection scoping — NOT VERIFIED in reviewed code.
  Gap:           SEC-09 — the scope wrapper must be added by the caller of
                 sanitiseCustomCssForRuntime. TC-E2E-008 must confirm it.
  Verdict:       PARTIALLY MET — TC-E2E-008 must be executed and pass before
                 NFR-007 is marked compliant.

NFR-008 — fontUrl Domain Allowlist Stored in Dataverse
  Requirement:   Allowlist in Dataverse, not hardcoded; QDB IT can update
                 without code deployment.
  Implemented:   YES — qdb_css_allowlist_config entity seeded by provisioning;
                 AllowlistService fetches at runtime; designer reads per session.
  Gap:           SEC-02 (write access level blocks operational management).
                 SEC-08 (subdomain overmatch if parent domain added).
                 Backend mirrors via env var (sync gap — SEC-05).
  Verdict:       SUBSTANTIALLY MET (SEC-02 must be fixed before the allowlist
                 is operationally manageable by QDB IT)

NFR-009 — WCAG Formula Compliance
  Requirement:   W3C WCAG 2.1 SC 1.4.3 relative luminance formula; sRGB gamma
                 correction; 3-digit hex; hex without #.
  Implemented:   FULLY — contrastRatio.ts implements all four requirements
                 correctly (reviewed formula step-by-step):
                   - 3-digit hex expansion: lines 15-17 (double each char)
                   - # prefix strip: line 14
                   - sRGB linearization: linearizeChannel(), line 27-31
                   - Relative luminance: computeRelativeLuminance(), line 33-37
                   - WCAG coefficient weights (0.2126, 0.7152, 0.0722): correct
                   - Ratio formula (lighter+0.05)/(darker+0.05): correct
                   - Level thresholds (3.0, 4.5, 7.0): correct
                   - passesMinimumGate at 3.0:1: correct
  Gap:           SEC-12 (FAILURE_RESULT mutable reference — low).
  Verdict:       MEETS REQUIREMENT

NFR-016 — PATCH-Only Writes
  Requirement:   All Dataverse write operations use partial PATCH; no full PUT
                 replacement; attributes not in the payload are not overwritten.
  Implemented:   Architecture describes a buildPatchPayload helper in the
                 repositories. TC-UT-052/053 (unit) and TC-INT-007 (integration)
                 test this. QA tests have not yet executed.
  Gap:           Cannot confirm from reviewed code that all six repositories
                 implement PATCH correctly without reviewing each *Repository.ts
                 file. TC-INT-007 (real Dataverse test) is the definitive check.
  Verdict:       ASSUMED MET (architecture design is correct; verification
                 requires TC-INT-007 execution against real Dataverse)

CEO CONDITION C-005a — Single Allowlist for customCss url() AND fontUrl
  Requirement:   One Dataverse record governs both url() in customCss and the
                 fontUrl domain validation.
  Implemented:   YES — ADR-STYLE-004, qdb_css_allowlist_config with single
                 qdb_allowed_domains_json array.
  Gap:           SEC-02 (role write level).
  Verdict:       MEETS DESIGN INTENT (SEC-02 operational gap)

CEO CONDITION C-005b — On-Prem Runtime Re-Sanitizes, Does Not Trust Cache
  Requirement:   qdb_form_runtime.html re-sanitizes customCss after reading
                 from cache; does not trust cache integrity.
  Implemented:   YES — customCssInjector.ts sanitiseCustomCssForRuntime() runs
                 before DOM injection (ADR-STYLE-005).
  Gap:           SEC-03 (deviates from architecture: uses empty allowlist, not
                 Dataverse-fetched allowlist). More restrictive than required —
                 security is stronger, not weaker.
  Verdict:       EXCEEDS DESIGN INTENT for security; functional gap for approved
                 url() rendering on-prem must be documented.


═══════════════════════════════════════════════════════════════════════
5. DATA RESIDENCY REVIEW
═══════════════════════════════════════════════════════════════════════

Data Store Analysis:
  All form design data (ThemeDefinition, FormDesign, SectionDesign,
  FieldDesign, ButtonDesign, LayoutGrid, CSS Allowlist Config, Render Cache,
  Audit Log) resides in the existing Dataverse org (org5869857f.crm4.dynamics.com).

  The ".crm4" suffix maps to the Microsoft Asia-Pacific (APAC) datacenter region.
  No new external services, external databases, or cross-border data transfers
  are introduced by DFE-STYLE-001.

Sovereign Data Concerns:
  QDB is a Qatari state-owned financial institution. Their data residency
  requirements typically require data to reside within Qatar or the GCC region.
  The crm4 region is APAC and may include Australia, Southeast Asia datacenters
  in addition to Middle East datacenters. This is a PRE-EXISTING infrastructure
  concern NOT introduced by this engagement, but it is noted for completeness.

  ACTION for QDB IT Director: Confirm whether org5869857f is deployed on an
  Azure datacenter within the Qatar/GCC region under Microsoft's multi-geo
  data residency commitments. This is unrelated to DFE-STYLE-001 but is a
  standing data sovereignty question for the Dataverse platform.

New External Data Surface Introduced:
  The only new external surface is CDN font/asset URLs (fontUrl and url()
  in customCss). These are BROWSER-INITIATED requests — the browser makes
  a GET request to, e.g., fonts.googleapis.com to fetch a font stylesheet.
  No QDB data is transmitted to the CDN. The CDN receives only a standard
  HTTP GET request with the user's browser headers. This is standard web
  font loading behaviour and does not constitute a data transfer under GDPR
  or QDB data classification policy.

  No PII, no form submission data, no Dataverse content flows to any CDN.

Data Classification:
  The DesignPayload (theme colours, CSS class names, custom CSS) is classified
  as Internal Configuration Data — not customer PII. BR-012 (audit log) should
  log actor identity (userId, displayName) which may be PII under GDPR if
  EU staff are involved. QDB's Dataverse org is a QDB-internal system; actor
  data in the audit log is limited to QDB form administrators.

Cross-Border Transfer Risk: LOW
  No new cross-border transfers introduced. Existing APAC region hosting is
  a standing concern for QDB IT, not a new risk from this engagement.


═══════════════════════════════════════════════════════════════════════
6. AUDIT TRAIL VALIDATION
═══════════════════════════════════════════════════════════════════════

Existing Audit Trail (pre-STYLE-001):
  The AuditLogService writes append-only records to qdb_form_audit_log for
  OPEN_FORM, SAVE_DRAFT, PUBLISH, CLONE, RESTORE_VERSION, DELETE_FORM,
  ARCHIVE_FORM. This provides a complete lifecycle audit trail for form
  structural changes.

New Audit Trail Gap (SEC-01 — CRITICAL):
  Style changes are not logged. The following state transitions have no audit
  trail entry after DFE-STYLE-001 deployment:
    - Theme colour changes (primaryColor, secondaryColor, etc.)
    - Font URL changes (fontUrl)
    - Custom CSS changes (FormDesign.customCss)
    - Per-section background, border, padding changes
    - Per-field width, height, input style changes
    - Per-button colour, size, hover effect changes
    - Responsive grid span changes
    - CSS class name assignments

  Any of these changes could introduce a CSS injection attempt or an
  accessibility regression that bypasses the WCAG gate. Without an audit log
  entry, a regulatory examiner or a post-incident forensic analyst cannot
  determine who made a specific style change, when, or what the previous state
  was. This is a direct failure of the governance standard:
    "Every decision must be explainable from the audit log alone."

  This gap is rated as a GO-LIVE BLOCKER. The CSS allowlist itself is not
  logged either — if QDB IT adds a domain to the allowlist, that action is
  not recorded in any audit trail. This is a compounding governance risk.

State Reconstruction Assessment:
  With the STYLE_CHANGE audit log gap, the following are NOT reconstructable:
    - Which form admin changed a colour that caused an accessibility failure
    - Whether customCss was changed before or after a security incident
    - What the customCss value was before an update (delta not captured)
    - Who added/removed a CDN domain from the allowlist

  These would all need to be reconstructed from Dataverse change tracking
  (if enabled) or from backup diffs — not from the application audit log.

Audit Log Immutability:
  The AuditLogService uses webApi.createRecord (append-only) with withRetry
  wrapping. No UPDATE or DELETE operations on the audit table are present in
  the codebase. The Dataverse entity's access policy prevents non-admin
  deletion. This is correct and compliant with the "append-only" requirement.

  Recommendation: Confirm that the qdb_form_audit_log entity's Dataverse
  access policy prohibits DELETE for all users including system administrators,
  and that the managed solution does not include DeleteRootComponentsBehavior
  for the audit log entity.

Tamper-Proofing:
  The audit log is stored in Dataverse with standard record-level security.
  A CRM system administrator could modify or delete records. For regulatory
  examination purposes, this is acceptable as long as QDB's CRM admin
  credentials are controlled under their IT governance policy.
  No cryptographic hash chain is implemented — this is standard practice for
  Dataverse-based audit logs and is not a gap for v1.

Audit Trail Sufficiency for Regulatory Examination:
  PRE-STYLE-001 audit events: SUFFICIENT for form lifecycle events.
  POST-STYLE-001 style events: INSUFFICIENT until SEC-01 is resolved.
  Allowlist change events:     INSUFFICIENT (no mechanism exists to log
                               Dataverse record changes to qdb_css_allowlist_config)

  Additional recommendation for go-live: Enable Dataverse Auditing on the
  qdb_css_allowlist_config entity. This provides an out-of-band audit trail
  for allowlist changes through the Dataverse Audit Log, which is separate
  from the application audit log.


═══════════════════════════════════════════════════════════════════════
7. SERVICE ACCOUNT REVIEW
═══════════════════════════════════════════════════════════════════════

Service Account: Provisioning Service Principal (CLIENT_ID: 08e80e93-0bab-45ef-8372-2e554fa9af9b)
  Scope:  Used by provision-style-schema.mjs to create schema and seed data.
          One-time execution; not used at application runtime.
  Access: Requires Dataverse System Customizer or higher to create entities
          and attributes. Inherits from the existing DFE-ADD engagement
          service principal.
  Assessment: HIGH PRIVILEGE for a one-time provisioning operation.
  Recommendation: The provisioning service principal should be deactivated
                  in Azure AD after the provisioning step is confirmed
                  complete and rollback is no longer needed (per the runbook).
                  The CLIENT_ID hardcoded in source (SEC-04) exacerbates
                  the risk if the principal is not deactivated.

Service Account: Fastify Backend API (ALLOWED_CSS_DOMAINS_JSON env var path)
  Scope:  Reads the allowed domains at startup; calls Dataverse OData endpoints
          for cache assembly (DesignAssembler queries).
  Access: Should have READ access to all qdb_* design entities and the
          qdb_css_allowlist_config entity. Must have WRITE access to
          qdb_render_cache.
  Privilege Assessment: APPROPRIATE for the task. Cache write is necessary.
                        Read on design entities is necessary. No overprivilege
                        detected in the reviewed code.

Service Account: AllowlistService / On-Prem Runtime (Xrm.WebApi, session auth)
  Scope:  Uses the logged-in user's CRM session to read qdb_css_allowlist_config.
  Access: Form user's read access to the allowlist. No write access.
  Assessment: LEAST PRIVILEGE — read-only, session-scoped. Correct.

Service Account: CSS Allowlist Admin (qdb_css_allowlist_admin.xml)
  Scope:  Manage qdb_css_allowlist_config records.
  Access: Create/Read/Write/Delete at Basic and Organisation levels.
  Assessment: SEC-02 gap — Basic write level must be elevated to Organisation.
              Read at Organisation level is appropriate (admin needs to see
              all config records). Delete at Basic level should be reviewed —
              consider restricting delete to prevent accidental removal of the
              global record, and instead using soft-delete (set qdb_is_active=false).
  Recommendation: Change Write level to Organisation. Consider restricting
                  Delete to prevent accidental removal. Only one or two named
                  IT administrators should have this role assigned.

Least-Privilege Summary:
  All service accounts follow least-privilege design EXCEPT:
    - Provisioning principal: should be deactivated post-provisioning.
    - CSS Allowlist Admin role: write level too restrictive for its purpose (SEC-02).


═══════════════════════════════════════════════════════════════════════
8. GOVERNANCE GAPS — RANKED
═══════════════════════════════════════════════════════════════════════

CRITICAL — Must be resolved before go-live:

  GOVGAP-01 — BR-012 Style Change Audit Log Not Implemented
  Risk:       CSS injection or accessibility regression cannot be forensically
              attributed after the fact. Regulatory examiner cannot reconstruct
              who changed what style and when.
  Remediation: Add STYLE_CHANGE to AuditAction; implement logAction calls in
               DesignService; add typed StyleDeltaPayload (see SEC-01 above).
  Deadline:   Before Phase 7 CEO approval submission.

  GOVGAP-02 — OQ-010 (Third-Party WCAG Audit) Unresolved
  Risk:       CEO approval for DFE-i18n-001 set an accessibility condition.
              QDB Compliance Team has not answered whether a formal third-party
              WCAG 2.1 AA audit is required as a go-live gate.
              Phase 5 QA estimates 90% probability this is a real blocker.
              Given that state-style colour pairs (focusStyle, errorStyle) are
              advisory-only in v1 (ADR-STYLE-006), a WCAG auditor may flag
              fields with non-compliant focus ring colours as Level AA failures.
  Remediation: QDB Compliance Team / IT Director must provide a written answer
               to OQ-010 before Phase 7 is submitted. If a third-party audit is
               required, it must be scheduled and completed before CEO approval.
  Deadline:   Before Phase 7 CEO approval submission.

  GOVGAP-03 — CSS Allowlist Admin Role Cannot Manage the Global Record (SEC-02)
  Risk:       The CSS domain allowlist — the primary operational control for
              CSS injection defence — cannot be updated by the designated admin
              users. If a CDN domain needs to be added or revoked, QDB IT has
              no operational path to do so without CRM system admin intervention.
  Remediation: Elevate prvWriteqdb_css_allowlist_config to Organisation scope.
  Deadline:   Before any attempt to modify the allowlist post-deployment.

HIGH — Should be resolved before production deployment:

  GOVGAP-04 — On-Prem Runtime Architecture Divergence Not Documented (SEC-03)
  Risk:       TC-INT-010 will fail against the current implementation.
              Phase 7 CEO review will receive a QA gap. The divergence is
              security-positive but functionally undocumented.
  Remediation: Amend ADR-STYLE-005 to formally accept the empty-allowlist
               approach; update TC-INT-010 test expectations; document
               the url() functional limitation in the runbook.
  Deadline:   Before Phase 7 CEO approval submission.

  GOVGAP-05 — Hardcoded Service Principal CLIENT_ID in Source (SEC-04)
  Risk:       Service principal identity cannot be rotated without a code change.
              Exposure reduces the effort required for credential abuse.
  Remediation: Move to env var. Five-line change.
  Deadline:   Before any production deployment.

  GOVGAP-06 — No Automated Sync Procedure for Backend Allowlist vs. Dataverse (SEC-05)
  Risk:       A revoked CDN domain continues to be accepted by the Fastify
              backend until a manual restart is performed.
  Remediation: Add runbook procedure + service restart step for domain revocation.
  Deadline:   Before production deployment.

MEDIUM — Should be resolved before or shortly after go-live:

  GOVGAP-07 — OQ-007 (Font Policy) Unresolved
  Risk:       QDB Brand Team has not confirmed the approved font CDN domains.
              The seeded allowlist (fonts.googleapis.com, fonts.gstatic.com) may
              not include QDB's required Arabic typography CDN.
  Remediation: QDB Brand Team provides approved domain list; QA extends TC-SC-006/007.
  Deadline:   Before production deployment (font domains needed for a functional
               font allowlist in production).

  GOVGAP-08 — SC-02 (PostCSS in Real CRM Iframe) Not Formally Confirmed
  Risk:       The on-prem re-sanitization path (C-005b) depends on PostCSS
              running in the CRM web resource iframe. Spike passed in a
              window-shim environment but has not been confirmed in a real
              CRM web resource iframe (org5869857f).
  Remediation: Run postcss-spike-test.html in org5869857f web resource context
               and record the result. Pass = GOVGAP-08 closed.
  Deadline:   Before staging E2E execution (TC-SC-004 requires this).

  GOVGAP-09 — Dataverse Auditing Not Enabled on qdb_css_allowlist_config
  Risk:       Changes to the CSS domain allowlist are not captured in any
              system-level audit log (application audit log not implemented
              for Dataverse entity changes; Dataverse Auditing not verified
              as enabled for this entity).
  Remediation: Enable Dataverse Auditing on qdb_css_allowlist_config in the
               solution. This provides change history for all field updates.
  Deadline:   Before production deployment.

LOW — Pre-release clean-up:

  GOVGAP-10 — NFR-007 Scope Wrapper Not Confirmed (SEC-09)
  Remediation: TC-E2E-008 execution confirms whether .dfe-form-{formCode}
               wrapper is applied. If not, move scoping into
               sanitiseCustomCssForRuntime.

  GOVGAP-11 — Silent Exception in sanitiseWithPostCss (SEC-07)
  Remediation: Add structured log on exception before returning ''.

  GOVGAP-12 — FAILURE_RESULT Mutable Shared Reference (SEC-12)
  Remediation: Object.freeze(FAILURE_RESULT) or spread on return.


═══════════════════════════════════════════════════════════════════════
9. CODE AUDIT — 7-PASS RESULTS
═══════════════════════════════════════════════════════════════════════

PASS 1 — WIRING

  FINDING W-01 — INFO: On-prem allowlist read wired in architecture but not in code.
  File: frontend/src/theme/customCssInjector.ts — entire file
  Severity: INFO (security is stronger; TC-INT-010 must be updated)
  Finding: Architecture (phase-3 Section 7) wires Xrm.WebApi allowlist fetch into
           the on-prem runtime. The implementation wires an empty-allowlist path
           instead. See SEC-03 and GOVGAP-04.

  FINDING W-02 — WARNING: AuditLogService.logAction is not called from any DesignService
  File: designer/src/services/DesignService.ts:40-101 (all upsert methods)
  Severity: WARNING
  Finding: All six upsert methods (upsertTheme, upsertFormDesign, upsertSectionDesign,
           upsertFieldDesign, upsertButtonDesign, upsertLayoutGrid) execute without
           calling AuditLogService.logAction. The audit trail wire is absent.
           See SEC-01 and GOVGAP-01.

  All other wiring points verified: AllowlistService is wired to IWebApiAdapter
  (DI pattern). CssSanitiserPlugin is imported in CssSanitiser.ts and
  customCssInjector.ts. DesignAssembler is called from CacheAssemblyService.
  WcagContrastIndicator is wired in ThemeStylePanel / ButtonStylePanel.
  STYLE_CHANGE publish job is created in PublishService.

PASS 2 — ERROR HANDLING

  FINDING EH-01 — WARNING: sanitiseWithPostCss swallows all exceptions silently.
  File: frontend/src/theme/customCssInjector.ts:60-63
  Severity: WARNING
  See SEC-07 above. No log is emitted. fix: add structured error log before return ''.

  FINDING EH-02 — INFO: CssSanitiser.ts warn-only on missing env var.
  File: backend/src/sanitizer/CssSanitiser.ts:14,18-19
  Severity: INFO (should be ERROR/FATAL in production)
  See SEC-06. Change log level to ERROR for missing/malformed env var in production.

  All other error handling reviewed:
  - AllowlistService.ts:116-124: SC-07 fail-safe correctly returns SAFE_DEFAULT on error.
    No raw error logged (intentional — avoids stack trace disclosure). Correct.
  - DesignAssembler.ts:117 uses Promise.allSettled with per-result extractOrDefault.
    Each failure logs at WARN with context. Correct.
  - contrastRatio.ts returns FAILURE_RESULT (not throw) for malformed hex. Correct.
  - CssSanitiserPlugin: plugin removes unsafe nodes silently (no throw). Correct per design.

PASS 3 — COMPLETENESS

  FINDING CP-01 — WARNING: SEC-01 (BR-012 audit log) is an incomplete feature.
  File: designer/src/services/AuditLogService.ts:11-18, DesignService.ts throughout
  Severity: WARNING (functional gap; BR-012 not delivered)
  STYLE_CHANGE audit log is specified in the BRD and in the architecture but is
  absent from the implementation. This is not a stub — it is an unimplemented requirement.

  FINDING CP-02 — PRUNE: TODO comment indicating potentially unfinished migration.
  File: designer/src/services/DesignService.ts:104-105
  Severity: PRUNE
  // TODO(DFE-STYLE-001): Remove once ThemeEditorScreen migration is complete.
  This comment should be removed if the migration is done (TC-UT-051 will confirm).
  If the migration is NOT done, this is a WARNING that SM-008 is violated.

  All new StyleTabContainer, WcagContrastIndicator, AllowlistService, CssSanitiserPlugin,
  contrastRatio, DesignAssembler implementations are complete (no stubs, no
  placeholder returns, no hardcoded empty arrays except where intentional).

PASS 4 — DEAD CODE

  No dead code found in the audited files. DesignerStyleModel.ts is correctly
  marked deprecated (not deleted — retained for reference per migration design).
  The listThemeSummaries() legacy method in DesignService.ts:106 is potentially
  dead code once ThemeEditorScreen migration is complete (see CP-02).

PASS 5 — BLOAT

  FINDING BL-01 — INFO: attributeNames.ts was previously over 400 lines (NFR-014 violation).
  Phase-4-tech-style.md confirms SC-09 resolution: attributeNames.ts split into
  domain-specific files. styleAttributeNames.ts estimated at ~280 lines (within limit).
  This item was resolved in the build phase; no action needed.

  All reviewed files are within the 400-line standard:
    CssSanitiserPlugin.ts:  160 lines
    CssSanitiser.ts:         33 lines
    customCssInjector.ts:    79 lines
    StyleEngine.ts:         133 lines
    AllowlistService.ts:    211 lines
    contrastRatio.ts:        80 lines
    DesignAssembler.ts:     275 lines
    DesignService.ts:       109 lines (without legacy stubs ~100)

PASS 6 — HARDCODING

  FINDING HC-01 — CRITICAL: Service principal CLIENT_ID and TENANT_ID hardcoded.
  File: scripts/provision-style-schema.mjs:29-30
  Severity: CRITICAL
  See SEC-04. Move to env vars.

  FINDING HC-02 — WARNING: DATAVERSE_URL hardcoded to production org URL.
  File: scripts/provision-style-schema.mjs:31
  Severity: WARNING
  Same remediation as SEC-04 — move to DV_DATAVERSE_URL env var.

  FINDING HC-03 — INFO: Initial seed domains hardcoded in provisioning script.
  File: scripts/provision-style-schema.mjs:142
  Severity: INFO (acceptable for seed data, but comment notes they should be extended)
  domains = ['fonts.googleapis.com', 'fonts.gstatic.com'] is an appropriate seed value.
  The qdb_notes field comment instructs expansion per OQ-007. Acceptable.

  FINDING HC-04 — INFO: DESIGN_PAYLOAD_SIZE_CAP hardcoded at 512KB.
  File: backend/src/services/DesignAssembler.ts:39
  Severity: INFO (this is a documented architecture constant from NFR-004)
  Acceptable as a named constant (not a magic number). No action needed.

  All other constants reviewed: GLOBAL_CONFIG_KEY ('global') in AllowlistService
  is correct and matches the provisioning seed key. No magic numbers found in
  contrast ratio thresholds (3.0, 4.5, 7.0 are W3C-specified values and are
  named via level classification in classifyLevel()). BLOCKED_AT_RULE_NAMES set
  contains only well-defined CSS at-rule names.

PASS 7 — SECURITY

  FINDING S-01 — CRITICAL: No audit log for style changes. (SEC-01 above)
  File: designer/src/services/AuditLogService.ts:11-18
  Confidence: 97%

  FINDING S-02 — CRITICAL: Hardcoded CLIENT_ID in provisioning script. (SEC-04 above)
  File: scripts/provision-style-schema.mjs:30
  Confidence: 95%

  FINDING S-03 — HIGH: CSS Allowlist Admin cannot write global record. (SEC-02 above)
  File: crm-solution/src/Roles/qdb_css_allowlist_admin.xml:37
  Confidence: 90%

  FINDING S-04 — MEDIUM: sanitiseWithPostCss swallows exceptions. (SEC-07 above)
  File: frontend/src/theme/customCssInjector.ts:62
  Confidence: 90%

  No console.log with sensitive data found in any reviewed file.
  No eval() or Function() with dynamic strings found.
  No SQL string concatenation (Dataverse OData, not SQL).
  No hardcoded secrets or credentials (DV_CLIENT_SECRET is correctly in env).
  AllowlistService ILogger interface explicitly uses a NOOP_LOGGER to prevent
  console.* calls in committed code (designer/src/services/AllowlistService.ts:27).


═══════════════════════════════════════════════════════════════════════
10. OPEN QUESTIONS FOR CEO PHASE 7
═══════════════════════════════════════════════════════════════════════

OQ-010 — Third-Party WCAG 2.1 AA Audit as Go-Live Gate
  Status:    UNRESOLVED
  Owner:     QDB Compliance Team / IT Director
  Audit risk assessment: The built-in contrast enforcement (FR-025..030)
             covers 7 primary colour pairs at the blocking gate level and
             7 advisory colour pairs. Per-field state styles (focus ring,
             error text colours) are advisory-only (ADR-STYLE-006 v1 scope).
             A formal WCAG auditor would likely flag state-style non-conformance
             as a Level AA finding.
  Confidence this is a Phase 7 gate: 90%
  Recommendation: Flag this to the CEO in the Phase 7 submission as a
             conditional: "If QDB Compliance requires a third-party audit,
             it must complete before production deployment and any findings
             requiring code changes must be remediated."

OQ-007 — QDB Font Policy (Approved CDN Domains)
  Status:    UNRESOLVED
  Owner:     QDB Brand Team
  Audit impact: The seeded allowlist (fonts.googleapis.com, fonts.gstatic.com)
             is functional but may not include QDB's required Arabic
             typography (e.g., a custom Arabic web font CDN). If QDB brand
             uses a font not hosted on Google Fonts, that CDN domain must
             be added to qdb_css_allowlist_config and the backend env var
             before production fonts render correctly.
  Recommendation: QDB Brand Team must answer OQ-007 and provide the approved
             domain list before production deployment. This is GOVGAP-07.


═══════════════════════════════════════════════════════════════════════
11. WCAG FORMULA VERIFICATION — PASS
═══════════════════════════════════════════════════════════════════════

The W3C WCAG 2.1 relative luminance formula (Success Criterion 1.4.3) was
verified step-by-step against the implementation in shared/src/utils/contrastRatio.ts:

  Step 1 — Hex parse (lines 13-23): Correct. Strips #, doubles 3-digit hex
            (e.g., #RGB → #RRGGBB), validates /^[0-9a-fA-F]{6}$/. Returns
            null for invalid input (not throw).

  Step 2 — Channel normalisation (linearizeChannel line 27):
            normalized = channel / 255. Correct.

  Step 3 — sRGB linearization (linearizeChannel lines 28-30):
            if normalized <= 0.04045: normalized / 12.92 (correct).
            else: ((normalized + 0.055) / 1.055) ^ 2.4 (correct W3C formula).

  Step 4 — Relative luminance (computeRelativeLuminance lines 33-36):
            L = 0.2126 * R_lin + 0.7152 * G_lin + 0.0722 * B_lin. Correct.

  Step 5 — Contrast ratio (lines 68-71):
            ratio = (max(L1,L2) + 0.05) / (min(L1,L2) + 0.05). Correct.
            toFixed(2) rounding: conservative at the 3.0 boundary
            (2.994 → 2.99 = fail; 2.999 → 3.00 = pass). Acceptable.

  Step 6 — Level classification (lines 39-44):
            >= 7 → AAA; >= 4.5 → AA; >= 3 → AA Large; else Fail. Correct.

  Known vector check (W3C): black (#000000) on white (#FFFFFF) = 21:1. The
  formula produces: L1=0 (black), L2=1 (white),
  ratio = (1.05)/(0.05) = 21. Correct.

  NFR-009 verdict: FULLY COMPLIANT with W3C WCAG 2.1 SC 1.4.3.


═══════════════════════════════════════════════════════════════════════
12. GO-LIVE CLEARANCE RECOMMENDATION
═══════════════════════════════════════════════════════════════════════

VERDICT: NOT CLEARED FOR GO-LIVE

Rationale:
  Two critical findings must be resolved before this audit can change its
  recommendation to Cleared With Conditions:

  BLOCKER 1 — SEC-01 / GOVGAP-01: BR-012 audit log for style changes is
  not implemented. Style changes including custom CSS modifications are not
  written to qdb_form_audit_log. This is a documented business rule (BR-012),
  a governance principle ("Every decision must be explainable from the audit
  log alone"), and a regulatory examination requirement. This must be
  implemented and tested (new unit test + TC-INT audit verification) before
  Phase 7 can be submitted.

  BLOCKER 2 — SEC-02 / GOVGAP-03: The CSS Allowlist Admin security role
  grants Basic write access. The service-principal-created global allowlist
  record cannot be updated by any CSS Allowlist Admin user. The operational
  management path for the primary CSS injection defence control is broken.
  A one-line XML change to elevate write scope to Organisation resolves this
  immediately.

Conditions for Cleared Status (after blockers resolved):
  C-01: GOVGAP-04 (on-prem architecture divergence) documented in ADR-STYLE-005
        amendment. TC-INT-010 updated to match actual implementation.
  C-02: GOVGAP-05 (CLIENT_ID moved to env var) completed.
  C-03: GOVGAP-06 (backend allowlist revocation runbook) added to DEPLOYMENT-RUNBOOK.
  C-04: GOVGAP-08 (SC-02 PostCSS in real CRM iframe) confirmed by executing
        postcss-spike-test.html in org5869857f and recording pass/fail.
  C-05: GOVGAP-09 (Dataverse Auditing enabled on qdb_css_allowlist_config) confirmed.
  C-06: OQ-007 answered by QDB Brand Team and allowlist updated with approved domains.
  C-07: OQ-010 answered by QDB Compliance Team (Phase 7 conditional gate).
  C-08: NFR-016 PATCH semantics verified by TC-INT-007 execution on real Dataverse.
  C-09: TC-E2E-008 execution confirms NFR-007 scope wrapper is applied (SEC-09).
  C-10: TC-SC-004 executed in real CRM on-prem environment.

Items NOT blocking go-live (pre-release clean-up):
  SEC-06 log level change (warn → error on missing env var)
  SEC-07 exception logging in sanitiseWithPostCss
  SEC-08 subdomain overmatch documentation
  SEC-10 GUID validation in DesignAssembler
  SEC-11 TODO comment cleanup
  SEC-12 FAILURE_RESULT freeze
  GOVGAP-07 once OQ-007 resolves (font policy)

Technology and build quality:
  TypeScript strict: all 4 packages clean. Test count: 442 green.
  WCAG formula: fully W3C compliant. PostCSS plugin: AST-level, not regex.
  Allowlist fail-safe: correctly implemented (SAFE_DEFAULT_CONFIG on failure).
  PATCH semantics: architecture correct; runtime verification pending.
  DesignerStyleModel deprecation: presumed complete (TC-UT-051 CI check confirms).
  These are all strong — the two blockers are discrete, addressable, and not
  architectural reworks. Resolving them adds confidence to the Phase 7 submission.

═══════════════════════════════════════════════════════════════════════
END OF DOCUMENT — DFE-STYLE-001 Phase 6 Audit v1.0
Prepared by: Maqsad AI — Auditor
Date: 2026-06-29
═══════════════════════════════════════════════════════════════════════
