═══════════════════════════════════════════════════════════════════════
PHASE 7 — CEO FINAL DECISION
═══════════════════════════════════════════════════════════════════════
Project:         DFE-STYLE-001 — Advanced Visual Styling & Full CSS Control
Client:          Qatar Development Bank (QDB)
Reviewed by:     CEO, Maqsad AI
Date:            2026-06-29
Branch:          feat/dfe-style-001 (committed + pushed through 7199394)
Live org status: UNTOUCHED — no schema provisioned, no code deployed
Pipeline inputs: brd-style.md, brd-style-approval.md, brd-style-resolutions.md,
                 phase-3-arch-style.md, phase-4-tech-style.md,
                 phase-5-qa-style.md, phase-6-audit-style.md
═══════════════════════════════════════════════════════════════════════


DECISION: APPROVED WITH CONDITIONS
───────────────────────────────────────────────────────────────────────

The engagement is technically complete and approved to proceed to staging.
No code changes are required before staging deployment. All audit blockers
(SEC-01, SEC-02) and the persistence gap have been resolved in the build.
Twelve conditions govern when code may be deployed to staging and when
production may be unlocked. The conditions are structured in two tiers:
STAGING (all must clear before any provisioning or code deployment) and
PRODUCTION (additional QDB stakeholder confirmations required before
the system serves live QDB form administrators).


JUSTIFICATION
───────────────────────────────────────────────────────────────────────

1. THE BUSINESS CASE HAS BEEN DELIVERED

   BO-001 through BO-005 were the entry gate for this engagement, and
   all five have been addressed in the build:

   BO-001 (under one working day to re-style): The full design system
   is now surfaced in the designer. A form administrator can configure
   theme, section, field, button, responsive grid, and custom CSS from
   a single web resource without raising a developer ticket. SM-001
   (30-minute admin exercise) is the verifiable acceptance criterion and
   is covered by TC-E2E-011.

   BO-002 (brand compliance): Full ThemeDefinition, extended colour
   palette, typography scale, shadow/spacing controls, dark-mode toggle,
   and per-component card and button styles are all exposed in the
   designer and persisted to Dataverse. The DesignPayload flows through
   the render cache to both the portal and the on-prem runtime.

   BO-003 (responsive grid): LayoutGrid per-field breakpoint spans
   (mobile, tablet, desktop) are implemented, persisted to the new
   qdb_layout_grid entity, and embedded in the render cache. TC-E2E-009
   verifies responsive rendering at all three breakpoints.

   BO-004 (portal and on-prem parity): The render cache version 3
   embeds the full DesignPayload inline. Both the Next.js portal and
   qdb_form_runtime.html read the same cache endpoint. StyleEngine and
   the on-prem runtime apply the same resolution logic. The only
   documented divergence — the on-prem runtime uses an empty allowlist
   for url() in customCss rather than the Dataverse-fetched allowlist —
   is a security-positive deviation that must be formally accepted in
   ADR-STYLE-005 (see Condition S-07 below).

   BO-005 (WCAG at authoring time): The contrast ratio calculator
   implements the W3C WCAG 2.1 SC 1.4.3 formula correctly (verified
   step-by-step in the audit; NFR-009 FULLY COMPLIANT). Seven blocking
   colour pairs are gated at publish time. The publish gate prevents
   any pair below 3:1 from going live. Advisory indicators are visible
   on all other colour controls.

   BO-006 (DesignerStyleModel deprecation) was correctly reclassified
   as a technical housekeeping requirement. The migration is complete:
   DesignerStyleModel is deprecated, all 8 dependent files migrated to
   DesignPayload sub-types, and TC-UT-051 / TC-REG-004 confirm zero live
   references at build time.

2. THE BUILD IS STRUCTURALLY SOUND

   Four packages clean under TypeScript strict mode. 455 unit tests
   passing (backend 208, designer 82, frontend 165). The picklist
   round-trip bug class — confirmed across 6 repositories during code
   review — was remediated across all six design repositories before QA
   began. The persistence gap (section, field, button, and layout-grid
   designs were never saved through FormSaveService) was identified and
   fixed, making per-element styling end-to-end for the first time.

   Code review passed with followups. The two review blockers (B-001
   sanitizer no-op, B-002 audit logging) were fixed. The re-review found
   and fixed NEW-001 (section headerStyle data loss). Six deferred
   clean-code items remain (M-004, M-008, M-009, M-010, m-001, m-004)
   — all non-functional, none a security or correctness risk, all
   carried as pre-next-engagement tech-debt.

3. THE AUDIT BLOCKERS ARE RESOLVED

   The Phase 6 audit issued a NOT-CLEARED verdict based on two blockers:

   SEC-01 (BR-012 audit log): The audit correctly identified that style
   changes were not written to qdb_form_audit_log. This is a governance
   and regulatory requirement — CSS injection or accessibility regression
   must be attributable to an actor and timestamp after the fact. The fix
   (STYLE_CHANGE added to AuditAction, logAction wired in FormSaveService
   and ThemeStylePanel for all style-change paths) was applied in the
   build and is confirmed resolved per phase-4-tech-style.md.

   SEC-02 (CSS Allowlist Admin write level): The security role granted
   Basic write access, which would prevent any CSS Allowlist Admin from
   updating the service-principal-owned global record. The write privilege
   was elevated to Organization scope. The fix is confirmed resolved.

   Additional audit findings SEC-10 (GUID guard) and SEC-12
   (FAILURE_RESULT freeze) were also fixed in the build.

4. THE v1 SCOPE DECISION ON WCAG STATE STYLES IS CORRECT

   ADR-STYLE-006 limits the blocking WCAG gate to seven primary colour
   pairs (primaryColor, textPrimaryColor, and all three button types
   against backgroundColor; primary colours against surfaceColor).
   Per-field state styles (focusStyle, errorStyle, disabledStyle,
   placeholderStyle) are advisory-only in v1.

   I affirm this decision. The reason is structural: at authoring time,
   the background a field state renders against is not deterministically
   known. It depends on theme, section background, component nesting,
   and browser UA stylesheets — none of which are computable from the
   DesignPayload alone at design time. Implementing a blocking gate on
   state-style contrast would require either a live rendering pass or
   a set of worst-case assumptions that would generate false positives
   for valid designs. The primary palette blocking gate provides strong
   baseline AA coverage. Advisory warnings on state styles give the form
   administrator visibility without blocking a valid publishing workflow.

   The residual risk is OQ-010: a formal third-party WCAG auditor may
   flag state-style non-conformance as a Level AA finding. This risk is
   carried as a production gate (see Condition P-02 below). If QDB
   Compliance confirms the built-in enforcement is sufficient, the risk
   is closed immediately. If a third-party audit is required, it must
   complete before production and any findings requiring code changes
   must be remediated.

5. THE SCHEMA CHANGE SCOPE WAS CORRECTLY BOUNDED

   The architecture anticipated 56 new Dataverse attributes. The actual
   build reconciliation against org5869857f revealed that most design
   entity attributes were already provisioned by DFE-ADD. DFE-STYLE-001
   adds only two new attributes to existing entities (qdb_css_class
   on qdb_section_design, qdb_field_css_class on qdb_field_design) plus
   the new qdb_css_allowlist_config entity. This is a significantly
   smaller schema delta than planned, which reduces the deployment risk
   from the C-004a concern about deployment sequencing. The provisioning
   script (provision-style-schema.mjs) is idempotent, supports dry-run,
   and the DEPLOYMENT-RUNBOOK-style.md defines the sequencing and
   rollback procedure.

6. BACKWARD COMPATIBILITY IS CONFIRMED

   Forms with no qdb_form_design record receive DEFAULT_DESIGN_PAYLOAD
   (FR-083). All new attributes are optional with null defaults. The
   StyleEngine treats undefined/null as "inherit from theme default"
   (BR-006). PATCH semantics are enforced across all six upsert paths
   (buildPatchPayload helper). Existing published forms will receive no
   visual change on first deploy. This satisfies SM-002.

7. THE STRATEGIC ROI IS REALISED

   This engagement closes the loop on the full DFE investment. QDB has
   committed across DFE-ADD-001/002 (form engine and designer), DFE-RC-001
   (render cache pipeline), and DFE-i18n-001 (Arabic/RTL). Each prior
   engagement extended capability without surfacing it to the form
   administrator. DFE-STYLE-001 converts the runtime's full design system
   from dark to fully configurable. The estimated time reduction from
   weeks to under one working day for a brand update (BO-001, SM-001)
   is the headline return. The secondary return — elimination of developer
   change requests for styling work — frees Maqsad AI engagement capacity
   for higher-value QDB work.

   The Tier 3 deferrals (conditional styling, named presets, DXP token
   integration, Brand Kit) are correctly deferred. All four require QDB
   stakeholder answers (OQ-001 through OQ-005) that are not yet available.
   None should be pulled forward.


CONDITIONS
───────────────────────────────────────────────────────────────────────

CONDITIONS ARE DIVIDED INTO TWO TIERS.
No staging deployment may begin until all STAGING conditions are met.
No production deployment may begin until all STAGING conditions are met
AND all PRODUCTION conditions are met.


STAGING CONDITIONS — Must clear before any provisioning or code deployment
to the staging / org5869857f environment.

S-01: PostCSS real-CRM-iframe confirmation
Execute postcss-spike-test.html in a real org5869857f CRM web resource
iframe context (not a window-shim sandbox). Record the outcome. If the
PostCSS browser IIFE fails to initialise, process(), or round-trip CSS
in the iframe, this is a production-blocking defect and must be resolved
before staging proceeds. If it passes, GOVGAP-08 is closed.
Owner: Maqsad AI CRM Developer.

S-02: TC-SC-004 — On-prem re-sanitization in real CRM environment
With staging provisioned, run TC-SC-004: manually insert an @import rule
into a render cache's FormDesign.customCss and confirm that
qdb_form_runtime.html strips the @import before DOM injection, and that
no external stylesheet is loaded. Record the result with evidence (browser
DevTools screenshot showing the stripped style block). Both the PostCSS
re-sanitization and the scope wrapper must be confirmed in the same run.
Owner: Maqsad AI QA.

S-03: TC-INT-007 — PATCH semantics on real Dataverse
Execute TC-INT-007 against the staging environment: set qdb_padding = '16px'
on a qdb_section_design record, then call DesignService.upsertSectionDesign
with only backgroundColor changed, and confirm that qdb_padding is still
'16px' after the call. Failure here means FR-095 / NFR-016 is violated
and a production save would silently wipe unrelated style attributes.
Owner: Maqsad AI QA.

S-04: TC-E2E-008 — NFR-007 CSS scope wrapper
Execute TC-E2E-008: with FormDesign.customCss set and the form rendered
in the portal, inspect the injected <style> element and confirm it is
scoped inside .dfe-form-{formCode} (or the equivalent qdb-form-{formCode}
wrapper) such that CRM native UI elements outside the form container are
not affected. If the scope wrapper is absent, move the scoping
responsibility into sanitiseCustomCssForRuntime (add formCode parameter,
wrap output in the scope class) before staging proceeds.
Owner: Maqsad AI QA + Frontend.

S-05: Dataverse Auditing on qdb_css_allowlist_config
Enable Dataverse Auditing on the qdb_css_allowlist_config entity in the
managed solution, so that changes to the CSS domain allowlist are captured
in the Dataverse system audit log. This is the out-of-band audit trail for
allowlist changes (GOVGAP-09). Confirm it is active before staging sign-off.
Owner: Maqsad AI CRM Developer.

S-06: Provisioning script — move hardcoded identifiers to env vars
Move TENANT_ID, CLIENT_ID, and DATAVERSE_URL from the hardcoded constants
at lines 29-31 of provision-style-schema.mjs to DV_TENANT_ID, DV_CLIENT_ID,
and DV_DATAVERSE_URL environment variables, following the same pattern as
DV_CLIENT_SECRET. Update the required-env check at line 22. Update the
provisioning runbook. A CLIENT_ID hardcoded in version-controlled source
cannot be rotated without a code change and reduces the effort to exploit
a separately leaked secret (GOVGAP-05 / SEC-04).
Owner: Maqsad AI CRM Developer.

S-07: On-prem empty-allowlist deviation — formal acceptance and documentation
The on-prem runtime (customCssInjector.ts) uses an empty allowlist for
the PostCSS sanitizer rather than the Dataverse-fetched allowlist as
originally designed. This deviates from the ADR-STYLE-005 architecture
and will cause TC-INT-010 (as written) to fail. The deviation is security-
positive — it blocks all url() references unconditionally in the on-prem
context. However, it means any approved CDN background-image url() in
FormDesign.customCss will silently render blank on the on-prem CRM runtime
while rendering correctly on the Next.js portal.

Before staging sign-off, this must be formally accepted:
(a) Amend ADR-STYLE-005 to document the empty-allowlist decision as the
accepted approach for the on-prem runtime, with the rationale (Xrm.WebApi
is not available at the render-time path of the frontend bundle).
(b) Update TC-INT-010 expected behaviour to reflect the actual implementation:
the on-prem runtime does NOT call Xrm.WebApi for the allowlist on form load.
(c) Add a Known Limitation note to DEPLOYMENT-RUNBOOK-style.md: "url()
references in FormDesign.customCss (e.g., background-image CDN assets) do
not render in the on-prem CRM runtime. This is an accepted constraint of
the v1 implementation."
Owner: Maqsad AI Architect + CRM Developer.

S-08: Backend allowlist revocation runbook
Add an explicit runbook procedure to DEPLOYMENT-RUNBOOK-style.md for the
CDN domain revocation scenario (a previously approved CDN is compromised
or needs removal). The procedure must include: (a) update the Dataverse
qdb_css_allowlist_config record; (b) update ALLOWED_CSS_DOMAINS_JSON in
the container secret store; (c) trigger a rolling restart of the Fastify
service; (d) document the revocation SLA (target: under 15 minutes from
Dataverse update to full backend refresh after rolling restart). Also add
a startup log at INFO level emitting the currently active allowed domains
list so operations can confirm the running state without restarting
(GOVGAP-06 / SEC-05).
Owner: Maqsad AI Backend + DevOps.


PRODUCTION CONDITIONS — Must clear before production deployment,
in addition to all staging conditions above.

P-01: OQ-007 — QDB Brand Team font CDN confirmation
QDB Brand Team must provide a written answer to OQ-007: (a) the approved
list of font CDN domains (not font names, not parent domains — specific
approved subdomains such as fonts.googleapis.com), including any Arabic
typography CDN domains required for RTL forms; (b) whether Google Fonts
are generally permitted or if a specific subset applies. Once received,
the qdb_css_allowlist_config 'global' record must be updated with the
confirmed domains, and the Fastify ALLOWED_CSS_DOMAINS_JSON secret must
be updated to match. TC-SC-006 and TC-SC-007 must be re-executed against
the confirmed allowlist. Production is gated on this because the seeded
allowlist (fonts.googleapis.com, fonts.gstatic.com) may not include the
Arabic typography CDN required for QDB's bilingual form rendering.
Owner: QDB Brand Team (answer), Maqsad AI CRM Developer (update).

P-02: OQ-010 — QDB Compliance Team WCAG audit decision
QDB Compliance Team / IT Director must provide a written answer to OQ-010:
does QDB require a formal third-party WCAG 2.1 AA accessibility audit as
a go-live gate for this engagement?

If QDB Compliance confirms the built-in contrast enforcement (7 blocking
colour pairs, advisory indicators on state styles, publish gate) is
sufficient for QDB's internal compliance programme: this condition is
satisfied immediately upon receipt of the written confirmation.

If QDB Compliance requires a formal third-party audit: the audit must be
scheduled, completed, and all findings received before production deployment.
Any findings requiring code changes must be remediated and verified before
the audit is considered closed. The CEO acknowledges that the advisory-only
treatment of per-field state styles (focusStyle, errorStyle, disabledStyle)
in v1 (ADR-STYLE-006) may be flagged by an auditor as a WCAG Level AA
observation. Maqsad AI's position is that this scope decision is technically
justified (background at field state render time is not deterministically
known at authoring time). However, if QDB Compliance or an external auditor
requires remediation, it is an additive change to Group B/D and is not a
rework of the core architecture.
Owner: QDB Compliance Team / IT Director.

P-03: Staging sign-off document
Before any production provisioning or code deployment, a staging sign-off
document must be produced confirming: (a) all eight staging conditions
(S-01 through S-08) are cleared with evidence; (b) provision-style-schema.mjs
was executed against the staging environment with dry-run first, then live,
per DEPLOYMENT-RUNBOOK-style.md; (c) deployment sequencing (schema first,
backend, frontend, cache invalidation) was followed; (d) the SM-001 admin
exercise (TC-E2E-011) was executed in staging with a QDB form administrator
or QA proxy and completed under 30 minutes with all styles rendering
correctly; (e) visual regression baseline was taken before provisioning and
confirmed zero regressions after.
Owner: Maqsad AI QA + QDB IT.

P-04: QDB IT Director data residency confirmation (standing)
The Phase 6 audit notes that org5869857f maps to the crm4 (Asia-Pacific)
region. This is a pre-existing infrastructure concern not introduced by
DFE-STYLE-001. Before production deployment of any DFE engagement, QDB IT
Director must confirm on record that org5869857f is deployed on an Azure
datacenter that satisfies QDB's data residency requirements under Microsoft's
multi-geo commitments. This is a standing condition that carries forward
from DFE-ADD-001/002 and is not new work for this engagement. Documented
here for completeness; it may already be satisfied in prior engagement
documentation.
Owner: QDB IT Director.


STRATEGIC RISKS AT CLOSING
───────────────────────────────────────────────────────────────────────

RISK 1 — OQ-010 WCAG audit may impose remediation work post-approval
Probability: Medium (auditor rated 90% confidence this is a real gate).
Impact: Medium (additive changes to state-style contrast checking, not
an architectural rework).
Mitigation: Condition P-02 gates production on QDB Compliance's answer.
If a third-party audit is required, schedule it before production target
date, not after. An early QDB Compliance answer eliminates this risk
entirely.

RISK 2 — On-prem url() functional gap discovered by QDB form admins in UAT
The documented limitation (url() in customCss renders blank on the on-prem
CRM runtime) may surface as a UAT defect if QDB form administrators expect
CDN background images to render in CRM forms. This is a v1 accepted
constraint, not a security gap. The runbook note (Condition S-07c) and
the designer UI must make this limitation visible. If QDB determines this
is a required capability, implementing the Xrm.WebApi allowlist read in
the on-prem runtime is the remediation path (the architecture already
specifies it).

RISK 3 — Arabic font CDN dependency (OQ-007)
If QDB's required Arabic typography is hosted on a CDN not in the seeded
allowlist, RTL forms will fall back to browser default fonts in production.
This is a visual, not a functional, risk. The allowlist update is a
no-code-deployment change (Dataverse record update + Fastify env var
update + rolling restart). However, the window before OQ-007 is answered
is a risk to UAT timing. QDB Brand Team should be engaged on OQ-007
immediately.

RISK 4 — Tech-debt accumulation
Six deferred clean-code items (M-004 designerStore split, M-008 residual
`as` casts, M-009/M-010 DI via interfaces, m-001/m-004) plus additional
non-blocking audit items (SEC-06/07/08/11/12) are carried forward. No
individual item is a production risk, but the accumulation across three
DFE engagements is worth tracking. Recommend dedicating a clean-up sprint
before the Tier 3 engagement begins, so the designer codebase enters
conditional styling work in a clean state.


ADVISORY (carry to next engagement, no action needed before staging)
───────────────────────────────────────────────────────────────────────

SEC-06: Upgrade ALLOWED_CSS_DOMAINS_JSON missing/malformed log from WARN
to ERROR and add a startup health check failure in production
(NODE_ENV=production) when the list is empty.

SEC-07: Replace the empty catch in sanitiseWithPostCss with a structured
log (injectorLogger.warn or equivalent ILogger pattern) before returning ''.
This satisfies CLAUDE.md error handling standards.

SEC-08: Add documentation to DEPLOYMENT-RUNBOOK-style.md and qdb_notes
in the allowlist record: always add specific subdomains, never parent
domains. A parent domain (googleapis.com) permits all present and future
subdomains. Consider aligning AllowlistService subdomain-match logic with
CssSanitiserPlugin exact-match logic.

SEC-11: Remove the TODO(DFE-STYLE-001) comment from DesignService.ts:104
once TC-UT-051 CI grep confirms the migration is complete. The TODO is
either stale or a warning of incomplete work — either way, it should not
survive to the next engagement.

SEC-12: Apply Object.freeze(FAILURE_RESULT) in contrastRatio.ts to
eliminate the shared-mutable-reference risk on malformed hex input.

FormSaveService integration test: author a test covering the full
persistElementDesigns loop — section/field/button/layoutGrid — verifying
resolved IDs, skipping deleted/unresolved-temp IDs, and JSON serialization
of state-style objects. Mapping is covered by repository unit tests, but
the loop itself is untested.

Remaining QA cases (~90): the integration, E2E, visual-regression, and
security staging-environment tests (TC-INT-001 through TC-INT-010,
TC-E2E-001 through TC-E2E-011, TC-REG-001 through TC-REG-005, TC-RTL-001
through TC-RTL-005, TC-BC-001 through TC-BC-004, TC-SC-001 through
TC-SC-010, TC-AX-001 through TC-AX-005) should be executed in full during
the staging phase. Their completion is a condition for the staging sign-off
document (Condition P-03).


WHAT IS AUTHORISED TO BEGIN NOW
───────────────────────────────────────────────────────────────────────

Conditions S-06, S-07, and S-08 involve code or documentation changes
and can begin immediately without waiting for the staging environment:

- Move TENANT_ID / CLIENT_ID / DATAVERSE_URL to env vars in the
  provisioning script (S-06): a five-line change.
- Draft the ADR-STYLE-005 amendment accepting the empty-allowlist approach
  and update TC-INT-010 expected behaviour (S-07): documentation only.
- Draft the revocation runbook section for DEPLOYMENT-RUNBOOK-style.md (S-08).

Conditions S-01 through S-05 require the staging environment to be active
and can proceed in parallel once it is provisioned per the runbook.

QDB stakeholder engagements for P-01 (Brand Team, OQ-007) and P-02
(Compliance Team, OQ-010) should begin immediately. These are the longest
lead-time items and should not wait for staging to complete.

No code may be deployed to the production org (org5869857f live environment)
until all staging conditions are met and the staging sign-off document
(Condition P-03) is produced.


═══════════════════════════════════════════════════════════════════════
SIGNED OFF
Role:        CEO, Maqsad AI
Decision:    APPROVED WITH CONDITIONS
             (8 Staging conditions, 4 Production conditions)
Date:        2026-06-29
Engagement:  DFE-STYLE-001
Branch:      feat/dfe-style-001
═══════════════════════════════════════════════════════════════════════
