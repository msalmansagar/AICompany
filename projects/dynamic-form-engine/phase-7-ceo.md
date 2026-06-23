═══════════════════════════════════════════════════════════════════
PHASE 7 — CEO FINAL DECISION
Dynamic Form Engine Portal — QDB
═══════════════════════════════════════════════════════════════════
Project:        Dynamic Form Engine Portal — QDB
Reviewed by:    CEO, Maqsad AI
Date:           2026-05-09
Document Ref:   phase-7-ceo.md v1.0
Source Reviews: brd-approval.md, phase-3-arch.md, phase-5-qa.md,
                phase-6-audit.md
═══════════════════════════════════════════════════════════════════


1. EXECUTIVE SUMMARY
──────────────────────────────────────────────────────────────────

What was built and for whom:
  Maqsad AI delivered a metadata-driven banking portal for Qatar
  Development Bank (QDB). The portal renders all banking forms —
  including the reference Loan Application — from configuration
  records stored in Microsoft Dataverse, with no frontend code
  changes required when new forms are added. The system integrates
  with QDB's existing Microsoft ecosystem: Azure AD for
  authentication, Dataverse/Dynamics 365 for record storage and
  audit logging, SharePoint for document libraries, and Power
  Automate for post-submission workflows.

What was produced across phases:
  Phases 1 through 6 delivered a complete formal BRD, architecture
  with seven ADRs, a 95-file TypeScript implementation spanning
  frontend (React + Fluent UI v9), backend (Node.js + Express), and
  a shared types package, plus a 75-test-case QA plan and a
  17-finding security and compliance audit.

Strategic value of the engagement:
  The core value proposition — reducing time-to-launch of a new
  banking form from two developer weeks to four configuration hours —
  is sound and has been architecturally demonstrated. The
  metadata-driven model is capable of delivering that result. Once
  the identified gaps are closed, the system will represent a
  high-leverage asset for QDB's operations and reduce ongoing
  dependency on Maqsad AI for form changes after handover.

Why this decision is not a simple approval:
  The Phase 6 audit identified ten independently blocking conditions
  that prevent UAT go-live in the current state. Four of those
  blockers are Critical severity: a data residency violation placing
  all PII and submission records in West Europe rather than Qatar, an
  unimplemented virus scan for banking documents, a CORS wildcard
  misconfiguration, and a missing form-level RBAC middleware. Two
  additional blockers are functional gaps that prevent the core
  product from working at all: business rules are never fetched from
  Dataverse (the rule engine produces no output for any real form),
  and file upload is a stub that writes nothing to any storage system.
  These are not polish items. They are foundational gaps that mean
  the system, as currently built, cannot enter UAT.

This decision is therefore: APPROVED WITH CONDITIONS.
  All ten audit blockers must be resolved and re-verified by the
  Auditor before any UAT environment is populated with real QDB
  data. Once those ten blockers are closed, the system is authorised
  for UAT. Nine additional production-readiness items must be
  completed before any live customer data is accepted.


2. PHASE 1 CONDITIONS — STATUS CHECK
──────────────────────────────────────────────────────────────────

The following six conditions were set in brd-approval.md on
2026-05-08. Each is assessed against the Phase 3 architecture and
Phase 6 audit findings.

CONDITION 1 — DATAVERSE THROTTLING STRATEGY
  Required: Concrete caching and retry strategy; NFR-001 500ms P95
  under 100 concurrent users demonstrated achievable.

  STATUS: MET (Architecture)
  The architect delivered ADR-006 specifying an LRU metadata cache
  (node-lru-cache, keyed by formCode:version, 300–600 second
  configurable TTL, max 500 entries). The throttling analysis shows
  95% cache hit rate under steady load reduces Dataverse calls from
  600–800 per second to 30–40 per TTL window. Retry and exponential
  back-off (200ms/400ms/800ms plus jitter) and circuit breaker (5
  failures in 60 seconds) are fully specified.

  CAVEAT: The audit (AUDIT-005) found OData $filter string
  interpolation in CrmMetadataService on cache miss — a security gap
  in the same code path that must be remediated. The caching design
  itself is sound.

CONDITION 2 — CUSTOM EXPRESSION VALIDATION SCOPE
  Required: Architect defines whether CUSTOM_EXPRESSION uses a safe
  DSL, a safe evaluator library, or is deferred. eval() prohibited.

  STATUS: MET
  ADR-005 explicitly defers CUSTOM_EXPRESSION to Phase 2. The column
  exists in the Dataverse schema (authoring is enabled) but no Phase 1
  code evaluates it. If a metadata record with CUSTOM_EXPRESSION is
  encountered, ValidationEngine logs a warning and skips it. eval()
  and new Function() are confirmed absent from the codebase. The admin
  preview mode surfaces a "Custom expression validation not active in
  Phase 1" indicator. Phase 2 will evaluate expr-eval (MIT, 1,800+
  stars) as the safe evaluator.

CONDITION 3 — QCB AUDIT LOG FORMAT CONFIRMATION
  Required: QDB Compliance confirms whether QCB mandates a specific
  log format beyond FR-044 and FR-045.

  STATUS: OPEN
  No written confirmation from QDB Compliance has been documented in
  any phase output. The architecture implemented a comprehensive audit
  log schema (qdb_form_audit_log with event type, user OID, display
  name, timestamp, affected record ID, changed data JSON). However,
  Phase 6 (GAP-AUDIT-1) found that only 2 of the 9 required event
  types are actually written in code. The QCB format question remains
  outstanding and must be resolved before production deployment.

CONDITION 4 — BACKEND FRAMEWORK ALIGNMENT
  Required: ADR filed if Express is retained instead of Fastify.

  STATUS: MET
  ADR-001 documents the client mandate (BRD constraint C-002
  explicitly specifies Node.js + Express + TypeScript). The deviation
  from the Maqsad AI technology default (Fastify) is formally
  recorded, justified by client familiarity and the I/O-bound
  nature of the metadata-serving workload, and accepted.

CONDITION 5 — DRAFT EXPIRY CLEANUP OWNERSHIP
  Required: Architect specifies whether cleanup is an Azure Function,
  Power Automate scheduled flow, or CRM background job, and confirms
  post-handover operational owner.

  STATUS: MET
  Phase 3 section 15.1 specifies a Power Automate scheduled cloud
  flow running daily at 02:00 GST. Rationale: no new Azure
  infrastructure required; QDB CRM team can modify the flow without a
  code deployment; the cleanup is low-frequency and non-time-critical.
  Operational owner post-handover: QDB CRM team. Alert configured on
  flow failure via Power Automate built-in alerting.

  CAVEAT: The skeptic review (Phase 3, Challenge 6) noted that if the
  Power Automate flow fails silently on large result sets, expired
  drafts accumulate. The architecture recommends adding a real-time
  expiry check on the draft resume route as a secondary control. This
  should be treated as a Sprint 2 item before full rollout.

CONDITION 6 — A-010 GUEST/B2C CONFIRMATION
  Required: Written confirmation from QDB project sponsor that all
  users authenticate through the same Azure AD tenant and B2C is not
  needed, before Sprint 1 begins.

  STATUS: OPEN — blocks Sprint 1
  No written confirmation from the QDB project sponsor is documented
  in any phase output. Phase 6 (AUDIT-009) flags this as a High
  severity finding. The audit asserts bank customers submitting loan
  applications are "almost certainly external individuals without
  corporate AD accounts." ADR-007 acknowledges the risk and sets a
  hard gate: Sprint 1 must not start without this written
  confirmation. If QDB confirms external users, the authentication
  layer must be rebuilt to Entra External ID (3–5 days rework). This
  condition remains open and is the single highest-risk outstanding
  item from Phase 1.


3. AUDIT FINDINGS — RESPONSE
──────────────────────────────────────────────────────────────────

The Phase 6 audit identified 10 go-live blockers and 9 production
conditions. Each is classified below.

BLOCKER-1 | AUDIT-001 | Data Residency Violation
  Severity: CRITICAL | Confidence: 99%
  The Dataverse org URL org5869857f.crm4.dynamics.com maps to West
  Europe. All form submissions, drafts, audit logs, PII, and uploaded
  documents physically reside in West Europe. BRD constraint C-005
  mandates Qatar Azure region. This is a potential PDPPL (Qatar Law
  No. 13 of 2016) violation and a QCB regulatory non-compliance on
  day one of any production use.

  Classification: RELEASE BLOCKER
  Required action: QDB IT must provision a Dataverse environment in
  Qatar North or UAE North before any production data is created.
  Written confirmation of the correct regional org URL must be
  provided, and all environment configurations updated. No UAT
  population of real QDB data may proceed until this is confirmed.

BLOCKER-2 | AUDIT-002 | Virus Scan Non-Functional
  Severity: CRITICAL | Confidence: 99%
  The file upload route checks MIME type from the client-supplied
  Content-Type header only (trivially bypassed). The VirusScanProvider
  interface described in the architecture does not exist in the code.
  Banking documents from untrusted customers reach CRM Notes with zero
  content inspection.

  Classification: RELEASE BLOCKER
  Required action: Either (a) implement file-type npm package for
  magic bytes MIME detection and integrate Defender for Storage on
  the target storage destination before UAT, or (b) obtain written
  risk acceptance from QDB Security confirming the no-op AV scan is
  acceptable for UAT with a committed Phase 2 date documented in the
  project risk register. Option (a) is strongly preferred for a
  banking portal handling customer KYC documents.

BLOCKER-3 | AUDIT-003 | CORS Wildcard Default
  Severity: CRITICAL | Confidence: 99%
  index.ts line 42 uses process.env.CORS_ORIGIN ?? '*'. CORS_ORIGIN
  is absent from the Zod env schema. The application starts in
  production without it and falls back to wildcard, exposing the API
  to any origin.

  Classification: RELEASE BLOCKER
  Required action: Add CORS_ORIGIN as a required field in the Zod
  env schema. Remove the wildcard fallback. Add CORS_ORIGIN to all
  deployment environment configurations and GitHub Actions secrets.
  This is a two-hour code change with no design impact.

BLOCKER-4 | AUDIT-004 | Form-Level RBAC Not Wired
  Severity: CRITICAL | Confidence: 99%
  The roleMiddleware specified in the architecture and listed in the
  component tree is not registered in index.ts. Any authenticated user
  can access any form regardless of qdb_access_group_id configuration.
  FR-038 and FR-039 are not met.

  Classification: RELEASE BLOCKER
  Required action: Implement roleMiddleware and register it on the
  /api/forms router. Implement the AD group overage claim flow for
  users in more than 200 groups. QA must verify FR-038 and FR-039
  with test user testunauth@qdb against a restricted form before
  UAT clearance.

BLOCKER-5 | AUDIT-007 | Stored XSS Vectors
  Severity: HIGH | Confidence: 99%
  The inputSanitiser.ts middleware specified in the architecture does
  not exist. Form field values reach Dataverse unsanitised. Separately,
  RichTextControl.tsx line 84 uses dangerouslySetInnerHTML on
  user-submitted HTML from Dataverse without DOMPurify sanitisation,
  creating a direct stored XSS path in the portal's readonly render
  mode affecting all users who view a compromised submission.

  Classification: RELEASE BLOCKER
  Required action: Implement inputSanitiser.ts middleware and register
  it before all controller routes. Apply DOMPurify with a strict
  allowlist (p, br, strong, em, ul, ol, li, h3, h4 — no script,
  iframe, object, or event attributes) to rawValue in
  RichTextControl.tsx before dangerouslySetInnerHTML.

BLOCKER-6 | AUDIT-005 + AUDIT-006 | OData Injection
  Severity: HIGH | Confidence: 95-97%
  CrmMetadataService interpolates formCode and record GUIDs directly
  into OData $filter strings without sanitisation. The lookup API
  accepts a caller-supplied OData filter fragment from the frontend.
  Either vector allows authenticated users to manipulate data queries.

  Classification: RELEASE BLOCKER
  Required action: Validate formCode against /^[a-z0-9\-]{1,100}$/
  in forms.routes.ts before any service call. Remove the caller-
  controlled filter query parameter from the lookup API. Implement
  OData single-quote escaping (doubling) on all interpolated string
  values. The dead query builder helpers in CrmBaseService should be
  revived as a proper sanitising query builder.

BLOCKER-7 | AUDIT-008 | IDOR on Record Fetch
  Severity: HIGH | Confidence: 95%
  GET /api/forms/:formCode/data/:recordId returns any Dataverse record
  to any authenticated user with no ownership check. Any portal user
  who knows another user's submission GUID can retrieve that record's
  full loan application data, KYC information, and personal financial
  details.

  Classification: RELEASE BLOCKER
  Required action: Add an ownership check (verify the record's
  submitter attribute matches req.user.oid) before returning any
  record. Return 403 if the check fails. If this endpoint is unused
  by the frontend, remove it entirely to reduce attack surface.

BLOCKER-8 | AUDIT-009 | ADR-007 Tenant Assumption Unconfirmed
  Severity: HIGH | Confidence: 92%
  Written confirmation from QDB project sponsor that all portal users
  are in the corporate Azure AD tenant has not been obtained. This is
  the same as Phase 1 Condition 6. If the assumption is wrong, the
  entire authentication layer must be rebuilt.

  Classification: RELEASE BLOCKER (gates Sprint 1)
  Required action: Written confirmation from QDB project sponsor must
  be obtained and filed before Sprint 1 begins. If QDB confirms
  external users, the architecture must be revised to Entra External
  ID and the MSAL configuration, JWT validation, and token claims
  mapping rebuilt before any form code is written.

BLOCKER-9 | C-01 + W-01 | File Upload Non-Functional
  Severity: HIGH | Confidence: 99%
  The file upload route returns a stub response. Multer is not
  registered. No file is written to CRM Notes, SharePoint, or Azure
  Blob. FR-031 through FR-035 are entirely unmet. This is a feature
  gap, not a security gap, but it blocks UAT for any form that
  requires document uploads.

  Classification: RELEASE BLOCKER
  Required action: Register multer in files.routes.ts. Implement
  CrmFileService.uploadToCrmNotes() using the Dataverse annotation
  entity (POST /annotations with base64 file content). Apply field-
  level size limits from DocumentUploadConfig post-multer. Must be
  complete and QA-tested before UAT.

BLOCKER-10 | C-04 | Business Rules Never Fetched
  Severity: HIGH | Confidence: 99%
  CrmMetadataService.ts line 193 hardcodes businessRules: []. The
  fetchBusinessRules() function is never called. The metadata API
  returns form definitions with no conditional logic. The rule engine
  evaluates no rules. All show/hide, required/optional, and
  set/clear/calculate conditional behaviour is broken for every real
  form definition. BR-002 (hidden field value clearing) is also not
  enforced server-side on submission.

  Classification: RELEASE BLOCKER
  Required action: Implement fetchBusinessRules(fieldIds) in
  CrmMetadataService, analogous to fetchValidationRules(). Map
  results at line 193. Verify that the rule engine produces correct
  output for the Loan Application form's business rules in a
  development environment before UAT.

Production-Readiness Items (not UAT blockers — must be resolved
before any production customer data is accepted):

PROD-1 | AUDIT-010 | Lookup Entity Allowlist
  Classification: SPRINT 2
  Remove entityName as a caller-supplied path parameter. Resolve
  entity from server-side lookup config using formCode + fieldId only.

PROD-2 | GAP-AUDIT-1 | Audit Log Completeness
  Classification: SPRINT 2
  Add audit writes for 7 of the 9 required event types: formOpened,
  draftSaved, draftResumed, draftDiscarded, documentUploaded,
  adminConfigChanged. Only formSubmitted and formSubmissionFailed are
  currently implemented. QCB examination requires the full event set.

PROD-3 | GAP-AUDIT-2 | Immutable Audit Log Archive
  Classification: SPRINT 2
  Implement daily export of qdb_form_audit_log to Azure Immutable Blob
  Storage (WORM) with a 7-year time-based retention lock. This is the
  legally defensible archive for QCB regulatory examination, independent
  of Dataverse admin access.

PROD-4 | AUDIT-014 | Key Vault Integration
  Classification: SPRINT 2
  Replace ClientSecretCredential reading from environment variable with
  DefaultAzureCredential via @azure/keyvault-secrets SDK using Managed
  Identity. Remove AZURE_CLIENT_SECRET from App Service settings once
  Key Vault integration is active.

PROD-5 | AUDIT-016 | Audit Write Failure Alerting
  Classification: SPRINT 2
  Add Azure Monitor Critical alert on audit write failure. Implement
  fallback enqueue to Azure Storage Queue for retry on Dataverse
  outage. A submission without an audit trail during a Dataverse
  outage is a QCB compliance gap.

PROD-6 | AUDIT-015 | Rate Limiting
  Classification: SPRINT 2
  Implement express-rate-limit with per-user (req.user.oid) keys.
  Minimums: 60 lookup requests per minute per user, 5 submissions per
  10 minutes per user per form, 20 file uploads per hour per user.

PROD-7 | AUDIT-017 | SharePoint Permission Scope
  Classification: SPRINT 2
  Narrow backend service principal SharePoint permission from
  Sites.ReadWrite.All to Sites.Selected with an explicit grant to
  only the document library site used by the portal.

PROD-8 | C-05 Code | Power Automate Trigger Mechanism
  Classification: SPRINT 2
  The current implementation uses the on-premise workflow execution
  API, which does not apply to cloud Power Automate flows. Confirm
  the correct trigger mechanism with QDB CRM team (Dataverse native
  trigger field or custom connector) and implement accordingly.

PROD-9 | SC-05 / SC-04 | Azure Monitor Alerting + WORM Storage
  Classification: ACCEPTED RISK (documented for Sprint 2)
  The alerting thresholds described in the architecture (section 17)
  are not confirmed implemented in the source code. Azure Monitor
  alert rules and the WORM immutable storage export must be configured
  before production. Accepted as a Sprint 2 item with the condition
  that no production data is ingested until both are active.


4. ROI ASSESSMENT
──────────────────────────────────────────────────────────────────

Development Cost Estimate:

  Phase 1 (CEO/BA/BRD):              3 days
  Phase 2 (Business Analysis):       5 days
  Phase 3 (Architecture):            5 days
  Phase 4 (Technical build):        25 days (95 files, 3 packages)
  Phase 5 (QA plan):                 5 days
  Phase 6 (Security audit):          5 days
  Subtotal: approximately            48 development days

  Sprint 2 remediation (10 blockers + 9 production items):
  Conservative estimate:            15–20 days

  Total engagement cost estimate:   63–68 days

  At a blended senior developer daily rate of USD 1,200:
  Estimated total development cost: USD 75,600 – USD 81,600

Value Delivered (once blockers are resolved):

  1. Time-to-launch for a new banking form: reduced from 2 developer
     weeks (10 days at USD 1,200 = USD 12,000 per form) to
     approximately 4 hours of Dataverse configuration (USD 100 in
     Relationship Manager time). Saving per net-new form: ~USD 11,900.

  2. QDB's product team stated 6–10 new banking forms per year as a
     planning assumption. At that rate, first-year form savings alone:
     USD 71,400 – USD 119,000.

  3. Ongoing: every compliance-driven form change (field addition,
     validation update, new conditional rule) that previously required
     a Maqsad AI sprint now requires a Dataverse configuration record
     change — zero development cost. Conservative estimate of 20 such
     changes per year at 0.5 days each saved: 10 developer days per
     year = USD 12,000 annually recurring.

  4. Audit trail completeness and append-only enforcement directly
     reduces QDB's QCB compliance exposure. A single regulatory
     finding or audit failure at a bank of QDB's profile carries
     reputational and financial risk that easily exceeds the total
     engagement cost.

Payback Period Estimate:
  At USD 75,600–81,600 total cost and USD 83,400–131,000 first-year
  savings (6 forms at USD 11,900 each = USD 71,400 plus USD 12,000
  change savings): the engagement pays back within the first calendar
  year of production operation.

  This assumes the blockers are resolved in Sprint 2 (15–20 days)
  and production go-live occurs within 6 months of the Phase 7
  decision. If Sprint 2 extends significantly or QDB delays sign-off
  on the data residency and tenant authentication questions, the
  payback period extends accordingly.


5. FINAL DECISION
──────────────────────────────────────────────────────────────────

DECISION: APPROVED WITH CONDITIONS

The engagement produced an architecture and codebase that is
structurally sound and strategically correct. The metadata-driven
form engine design is the right solution for QDB's stated problem.
The QA plan is thorough and traceable to functional requirements. The
architecture correctly addressed all six Phase 1 conditions at the
design level.

However, the Phase 6 audit found ten implementation-level blockers
that prevent the system from entering UAT in its current state. The
most serious — a data residency violation placing all PII in West
Europe, an unimplemented file upload, and business rules that are
never fetched from Dataverse — are not acceptable UAT entry conditions
for a regulated banking institution.

This approval is conditional on all ten blockers listed in Section 3
being resolved and verified by the Auditor before any UAT environment
is populated with real QDB data. Two of those blockers (BLOCKER-8,
the tenant authentication confirmation, and BLOCKER-1, the data
residency confirmation) are external dependencies on QDB actions, not
Maqsad AI code changes. Both must be resolved before Sprint 1 build
work begins on blockers 3 through 10.

The nine production-readiness items listed as SPRINT 2 must be
completed before any live customer data is accepted into the system,
regardless of UAT outcomes.


6. DEPLOYMENT AUTHORIZATION
──────────────────────────────────────────────────────────────────

The following sprint deliverables are required and authorised before
production go-live. They are sequenced by dependency.

PRE-SPRINT 1 — EXTERNAL GATES (QDB actions required)
  These are QDB obligations. Maqsad AI must not begin Sprint 1 code
  work until both are in writing and filed in the project folder.

  GATE-A: Written confirmation from QDB project sponsor that all portal
    users (bank customers and internal staff) authenticate through the
    same QDB corporate Azure AD tenant and that Azure AD B2C is not
    required. The confirmation must specify the tenant ID. If QDB
    cannot confirm this, the sprint plan must immediately pivot to
    Entra External ID and the auth architecture revised.

  GATE-B: Written confirmation from QDB IT that a Dataverse environment
    in Qatar North or UAE North Azure region is available or will be
    provisioned before any Sprint 1 form submission records are
    created. The confirmation must include the correct Dataverse org
    URL and the Azure region code.

SPRINT 1 — BLOCKER REMEDIATION (10 items)
  All ten blockers from Section 3 must be implemented, code-reviewed,
  and QA-verified before UAT entry is requested.

  S1-01: CORS_ORIGIN added to Zod env schema as a required field.
    Wildcard fallback removed from index.ts. Set in all environment
    configurations. (BLOCKER-3)

  S1-02: roleMiddleware implemented and registered on /api/forms router.
    AD group overage claim flow implemented for users in >200 groups.
    QA security tests TC-061 pass for testunauth@qdb on restricted
    forms. (BLOCKER-4)

  S1-03: inputSanitiser.ts middleware implemented and registered before
    all POST/PATCH controller routes. DOMPurify with strict allowlist
    applied to rawValue in RichTextControl.tsx line 84. (BLOCKER-5)

  S1-04: formCode validated against /^[a-z0-9\-]{1,100}$/ in
    forms.routes.ts before any service call. Caller-controlled filter
    query parameter removed from lookup API. OData single-quote
    escaping applied to all interpolated values. (BLOCKER-6)

  S1-05: Ownership check (req.user.oid vs. submitter attribute) added
    to GET /api/forms/:formCode/data/:recordId. Returns 403 on mismatch.
    If endpoint has no active frontend callers, remove it. (BLOCKER-7)

  S1-06: Multer registered in files.routes.ts. CrmFileService.
    uploadToCrmNotes() implemented using Dataverse annotation entity
    (POST /annotations with base64 content). Magic bytes MIME detection
    via file-type npm package active. Field-level size limits from
    DocumentUploadConfig applied post-multer. (BLOCKER-9)

  S1-07: fetchBusinessRules(fieldIds) implemented in CrmMetadataService.
    Results mapped at line 193 (businessRules: [] removed). Rule engine
    verified to produce correct output against the Loan Application
    form's actual business rules in dev environment. BR-002 hidden field
    clearing enforced server-side on submission. (BLOCKER-10)

  S1-08: Virus scan strategy resolved. Either (a) file-type npm package
    for magic bytes detection and Defender for Storage integration
    active, or (b) written QDB Security risk acceptance filed with
    committed Phase 2 date. (BLOCKER-2)

  S1-09: BLOCKER-1 and BLOCKER-8 resolved by QDB action (GATE-A and
    GATE-B above). Dataverse org URL updated in all environment
    configurations to the Qatar/UAE North instance. MSAL authority
    confirmed correct (single tenant or Entra External ID as applicable).

  S1-10: FormContext.tsx created (missing import in useFormEngine.ts).
    Frontend compilation verified clean. Full E2E test suite TC-047
    through TC-053 passing in CI against the development environment.
    (W-02 wiring gap)

UAT ENTRY GATE — AUDITOR SIGN-OFF
  Before QDB UAT users are given access, the Maqsad AI auditor must
  re-verify BLOCKER-1 through BLOCKER-10 against the Sprint 1
  deliverables. A signed Auditor clearance memo must be filed. UAT
  must not begin without it.

SPRINT 2 — PRODUCTION READINESS (before live customer data)
  All nine PROD items from Section 3 must be completed before any
  production customer data is ingested.

  S2-01: Lookup API entity name resolved from server-side config
    only. entityName removed as a caller-supplied path parameter. (PROD-1)

  S2-02: Audit writes for all 9 required event types implemented:
    formOpened, draftSaved, draftResumed, draftDiscarded, documentUploaded,
    adminConfigChanged added to their respective backend routes. (PROD-2)

  S2-03: Daily export of qdb_form_audit_log to Azure Immutable Blob
    Storage (WORM) with 7-year time-based retention lock configured
    and verified. (PROD-3)

  S2-04: Key Vault integration implemented using DefaultAzureCredential.
    AZURE_CLIENT_SECRET removed from App Service settings. (PROD-4)

  S2-05: Audit write failure Critical alert to Azure Monitor implemented.
    Fallback write to Azure Storage Queue on primary write failure
    implemented. (PROD-5)

  S2-06: express-rate-limit implemented with per-user keys on submit,
    lookup, and file upload routes at the thresholds specified in
    AUDIT-015. (PROD-6)

  S2-07: Backend service principal SharePoint permission narrowed from
    Sites.ReadWrite.All to Sites.Selected with an explicit site grant
    from QDB IT. (PROD-7)

  S2-08: Power Automate trigger mechanism confirmed with QDB CRM team
    and implemented using the correct cloud flow pattern (Dataverse
    native trigger field, not on-premise workflow execution API). (PROD-8)

  S2-09: Azure Monitor alert rules configured for all thresholds in
    architecture section 17. Content Security Policy header added to
    nginx.conf. HSTS header added to nginx.conf. Dependabot or Snyk
    enabled in GitHub Actions for dependency CVE scanning. (PROD-9)

PRODUCTION GO-LIVE GATE
  QDB IT must provide a signed data residency declaration confirming
  all data (Dataverse, App Service, Key Vault, storage) remains within
  the Qatar Azure region (or agreed UAE North equivalent). This is
  required by BRD success criterion 6 and must be filed before any
  production traffic is routed to the system. QDB Compliance must
  confirm QCB audit log format requirements (Phase 1 Condition 3)
  and any additional fields required beyond FR-044 and FR-045.


7. STRATEGIC NOTES
──────────────────────────────────────────────────────────────────

NOTE 1 — THE EXTERNAL GATE PROBLEM IS THE CRITICAL PATH

  Of all the blockers, BLOCKER-8 (tenant authentication confirmation)
  and BLOCKER-1 (data residency confirmation) are not code problems.
  They are QDB governance decisions that we cannot resolve for the
  client. Both have been required since Phase 1 (Conditions 3 and 6
  in brd-approval.md). They remain open nine months into the
  engagement. This pattern — where foundational infrastructure
  decisions are deferred by the client past the point where they
  create code rework risk — is the most expensive class of delay in
  enterprise software engagements. Future engagements with regulated
  institutions must include a formal prerequisites sign-off from the
  client as a contract condition before Phase 3 begins, not as a best-
  effort condition. This should be codified in the Maqsad AI engagement
  contract template.

NOTE 2 — THE AUDIT FINDINGS INDICATE A SPECIFICATION-IMPLEMENTATION GAP

  The Phase 3 architecture is detailed, security-aware, and complete.
  The Phase 6 audit found that multiple specified components do not
  exist in the code: inputSanitiser.ts middleware, VirusScanProvider,
  roleMiddleware registration, FormContext.tsx, and
  fetchBusinessRules(). This pattern suggests the implementation
  phase executed against the component naming structure but did not
  complete the security-critical middleware chain and the business
  logic assembly steps.

  For future engagements, the Maqsad AI code review agent (Phase 5)
  should include a mandatory wiring verification pass: for every
  middleware and service listed in the architecture's component tree,
  confirm its registration in the application bootstrap file before
  the QA phase begins. An architectural component that is designed but
  not wired is indistinguishable from a component that is designed but
  not built, from a security perspective.

NOTE 3 — ODATA INJECTION REQUIRES A SYSTEMATIC FIX, NOT TARGETED PATCHES

  AUDIT-005 and AUDIT-006 (OData injection) arise from the same root
  cause: string interpolation of untrusted input into OData $filter
  expressions. The dead query builder helpers in CrmBaseService.ts are
  the right structural answer — they were designed but never adopted.
  Sprint 1 remediation should not produce targeted patches on specific
  lines. It should complete the ODataQueryBuilder as a properly
  sanitising fluent API and require all CRM services to use it. Any
  service that constructs an OData $filter string without using the
  builder should fail a lint rule. This is a systemic fix that
  prevents the same class of vulnerability appearing in future services
  added to this codebase.

NOTE 4 — THE QA PLAN IS A GENUINE ASSET

  The Phase 5 QA plan represents one of the strongest deliverables in
  this engagement. Seventy-five numbered test cases, fully traced to
  user stories and functional requirements, with complete Vitest and
  Playwright code for the critical paths, and an RTM that will remain
  valid across the Sprint 1 and Sprint 2 cycles. This document should
  be handed to QDB's own QA team as a reference baseline for ongoing
  regression testing after handover. It sets a standard for future
  Maqsad AI engagements: QA plans produced at this level of specificity
  are significantly more valuable to the client than high-level test
  strategy documents.

NOTE 5 — THE BANKING-DOCUMENT VIRUS SCAN IS NOT A PHASE 2 ITEM

  The audit correctly flags the no-op virus scan as a go-live blocker.
  I want to be explicit about the rationale: QDB portal users are
  submitting KYC documentation in support of loan applications. These
  documents are opened by Relationship Managers inside the CRM
  environment. If a malicious file reaches CRM Notes, the attack
  surface is internal QDB staff on corporate machines connected to
  internal banking systems. The risk is not theoretical; banking
  portals are actively targeted with malicious document uploads. QDB
  Security's written acceptance of a no-op scan at UAT is acceptable
  only if the commitment to Phase 2 Defender for Storage integration
  is contractually binding, not aspirational.

NOTE 6 — RULE ENGINE PERFORMANCE MUST BE BENCHMARKED BEFORE SPRINT 1 COMPLETION

  Phase 3 Challenge 4 (skeptic review) noted that the rule engine
  re-evaluates all rules on every keystroke for forms with 50+ fields
  and 200+ rules. This has not been profiled. TC-056 (Rule engine
  performance Vitest bench, 50 rules, P95 under 100ms) must pass before
  Sprint 1 is considered complete. If it fails, a debounce strategy
  or partial rule evaluation optimisation must be implemented before
  UAT — sluggish forms in a banking context create immediate user trust
  problems that are difficult to recover from.

NOTE 7 — DATA RESIDENCY IS A BRAND RISK, NOT ONLY A COMPLIANCE RISK

  If QDB's executive team or QCB examiners were to ask where QDB
  customer loan application data physically resides and the answer is
  "Netherlands," the reputational consequence is disproportionate to
  the technical effort of provisioning a Dataverse environment in the
  correct region. This item must be treated as a zero-tolerance issue.
  No demo, no UAT, and certainly no production traffic should be run
  against the West Europe org. A separate development/test Dataverse
  environment in the correct region should be provisioned as the first
  action of Sprint 1.

═══════════════════════════════════════════════════════════════════
SIGNED OFF
Role:     CEO, Maqsad AI
Decision: APPROVED WITH CONDITIONS
          All 10 blockers must be resolved and auditor-verified
          before UAT. All 9 production items must be resolved before
          any live customer data is accepted.
Date:     2026-05-09
═══════════════════════════════════════════════════════════════════


═══════════════════════════════════════════════════════════════════
ADDENDUM REVIEW — CEO DECISIONS
DFE-ADD-001 and DFE-ADD-002
═══════════════════════════════════════════════════════════════════
Reviewed by:    CEO, Maqsad AI
Date:           2026-06-05
Source:         brd.md — Addendum DFE-ADD-001 (FR-048–FR-087)
                brd.md — Addendum DFE-ADD-002 (FR-088–FR-153)
═══════════════════════════════════════════════════════════════════


DECISION 1 — DFE-ADD-001: INFO-CARD SCREENS
──────────────────────────────────────────────────────────────────

Decision: APPROVED

Justification

Info-Card Screens are architecturally clean and add clear customer
value at low delivery risk. The feature is purely read-only: no form
state, no validation engine invocation, no draft writes. It introduces
three new Dataverse entities (qdb_info_card_screen, qdb_info_card_section,
qdb_info_card_item) with modest data volumes (60 screens, 240 sections,
900 items projected in Year 1) and no new external integrations. The
metadata API extension is an additive schema change that does not
disturb any existing endpoint contract. The opt-in zero-config default
(a form with no Info-Card Screen records behaves exactly as before)
means the feature carries no regression risk against the existing
approved core.

The feature directly supports the approved success criteria. BO-001
(self-service form configuration) and BO-002 (improved completion
rates) are both served. The business case is straightforward: if even
one form's abandonment rate decreases because a portal user arrived
prepared — knowing what documents to bring, understanding the
eligibility criteria, seeing the process steps — the feature has paid
for itself. For a bank processing loan applications, a user who starts
a form and abandons it mid-way is a negative customer experience and
a Relationship Manager workflow problem. Reducing that scenario is
worth the implementation cost.

All seven open questions were resolved before submission. The
resolutions are sensible: per-form skip toggle (not per-screen),
first-view-only audit logging (not every view), fixed CTA labels
(Continue/Start), plain text body (not rich text), and draft resume
bypasses Info-Card screens to return the user to where they left off.
These are all correct UX decisions for a banking context. I endorse
each one.

Alignment with Phase 1 conditions: the addendum introduces no
additional regulatory dependencies beyond those already in scope
(QCB audit log, PDPPL data residency). The new audit event type
"info_card_screen_viewed" is additive to FR-044 and must be included
in the Sprint 2 audit completeness work (PROD-2).

Conditions on Approval

ADD-001-C1: The audit event type "info_card_screen_viewed" (FR-076)
  must be implemented as part of the Sprint 2 PROD-2 audit log
  completeness work, alongside the seven existing missing event types.
  It is not a separate sprint item; it is part of the same audit
  completeness deliverable. The BA must add it to the PROD-2 scope
  in the state tracker.

ADD-001-C2: The draft-resume bypass of Info-Card Screens (Q-003
  resolution) must be implemented consistently across all resume
  paths: direct URL resume, session timeout resume, and Save & Draft
  resume. If any resume path inadvertently shows Info-Card Screens
  to a returning user, the UX outcome is poor and the implementation
  is non-compliant with the stated resolution. QA must add a test
  case verifying all three resume paths.

ADD-001-C3: Download URLs on Info-Card Items (FR-083, FR-084) open
  external URLs in a new tab. The CRM Configuration Team will author
  these URLs in Dataverse. The admin screen must validate that each
  download URL is an absolute HTTPS URL and must reject HTTP or
  relative URLs at save time. This is a configuration-time defence
  against accidental exposure of non-HTTPS document links to bank
  customers. The BA must add this as a validation requirement to
  FR-087 scope.

ADD-001-C4: This addendum may not enter Sprint 1. The ten v1.0
  blockers from the original Phase 7 decision take absolute priority.
  Info-Card Screen work begins only after Sprint 1 blocker remediation
  is auditor-verified and UAT entry is cleared. Mixing addendum
  features into the remediation sprint dilutes focus and creates QA
  scope ambiguity.


DECISION 2 — DFE-ADD-002: BOOLEAN FIELD, INTERACTIVE GRID, TAB-AWARE BUTTONS
──────────────────────────────────────────────────────────────────

Decision: APPROVED WITH CONDITIONS

Justification

The three enhancements in this addendum are not equal in scope or
risk. I will address each separately, then issue the combined
decision.

Enhancement 1 — Boolean Field Type

This is a clean, low-risk extension. The Boolean field is distinct
from the existing checkbox field (BR-018 is correct to maintain both
independently). The feature adds two string attributes and one picklist
attribute to an existing entity, extends the rule engine and validation
engine with no architectural changes, and participates in the existing
draft persistence flow. The implementation complexity is comparable to
adding any new field type to the system. The business case is clear:
forms requiring explicit "Agree / Disagree" or "Yes / No" responses
with clear label semantics — standard in banking compliance and
declaration contexts — are served by this field type in a way the
checkbox field cannot cleanly accommodate.

BR-020 (submitted value is always the boolean primitive, never the
label string) and BR-019 (misconfigured field is not rendered, logs
an error) are both correct and must be enforced strictly. These rules
protect the data integrity of submission mapping to Dataverse Two
Options attributes.

No concerns. I approve the Boolean Field Type component unconditionally
within the overall conditions below.

Enhancement 2 — Interactive Grid Field Type

This is the highest-complexity item in either addendum. I reviewed it
carefully and have substantive concerns about Mode B (Entry Grid). I
will state them plainly.

Mode A (Selection Grid) is sound. It reads existing Dataverse records
via OData, renders them in a table, captures selected GUIDs, and
submits them via the existing submission mapping logic. The resolution
of Q-008 — replacing raw OData filter expressions with admin-selected
saved Dataverse Views — is a significant improvement over the original
draft requirement. Using saved Views means the filter, column
selection, and sort are owned and governed by Dataverse, not by a
free-text string field in a configuration record. This removes the
injection risk from FR-106 as originally written (the free-text OData
filter string). NFR-023 (filter expression is trusted config, not
user-modifiable) remains valid for any residual filter attributes.
The 200-row default with pagination is the correct call for a banking
portal where product catalogues and branch lists are bounded datasets.
Mode A is approved with no additional conditions.

Mode B (Entry Grid) carries material complexity and three risks that
must be managed explicitly.

Risk 1 — Atomic transaction complexity. FR-126 and FR-127 require
that Entry Grid child record creation is part of the BR-006 atomic
transaction. The existing atomic transaction covers parent record
creation. Adding N child records to that transaction, where N is
unbounded at configuration time, increases the failure surface of the
most critical operation in the system. If a form has two Entry Grid
fields with 10 rows each, a submission creates 1 parent record plus
20 child records in a single atomic batch. If record 18 of 21 fails,
all 17 prior successes must be rolled back. Dataverse $batch supports
this via changesets, but the implementation must be correct under
partial failure conditions. This is non-trivial and must receive
explicit architecture attention, not be treated as a routine extension
of BR-006.

Risk 2 — Draft persistence of Entry Grid rows. FR-128 and FR-129
require that Entry Grid row data is persisted to the draft record on
save and restored on resume. The draft record's current schema stores
form field values as a JSON blob. Entry Grid rows — which are
potentially complex nested objects with their own field types — must
be serialised into that blob in a way that survives schema changes to
the grid's column configuration between the save and the resume. If a
form author adds or removes a column from an Entry Grid between a
user's draft save and their resume, the deserialized row data may be
structurally inconsistent. The architecture phase for this addendum
must define the column-change compatibility policy explicitly: either
(a) the draft is invalidated and the user is warned, or (b) orphaned
column values are silently dropped. Neither is obviously correct for
a banking context. The BA must add this as an open architecture
decision before the architect begins Phase 3 for this addendum.

Risk 3 — OData injection resurfaces. FR-106 in the original draft
required a free-text OData filter expression stored in Dataverse.
Q-008's resolution (use saved Dataverse Views instead) removes this
risk for Selection Grid. However, if any residual free-text filter
attribute (qdb_grid_filter_expression, String 2000) remains in the
data model after the Q-008 resolution, it must either be removed from
the schema entirely or its use restricted only to admin-screen
validation scenarios where the backend applies it through the
ODataQueryBuilder (the systemic fix required by original Phase 7
Note 3). The architecture phase must resolve whether
qdb_grid_filter_expression survives in the schema or is deprecated
in favour of a Dataverse View reference attribute. This decision must
be documented in an ADR.

Despite these risks, I approve the Interactive Grid because the
business case is genuinely strong for a banking portal. Selection Grid
(Mode A) enables product and branch selection within a form — a
standard banking UX requirement. Entry Grid (Mode B) enables
multi-beneficiary and co-applicant declarations in a single submission,
which directly reduces the multi-step processes that create the most
friction for bank customers. The risks are manageable if the
architecture phase is rigorous.

Enhancement 3 — Tab-Aware Save & Draft and Submit Buttons

This is the simplest item in the addendum. The placement logic is
purely client-side, derived from existing metadata (tab display order),
with no new API calls, no new entities, and fallback defaults for
missing button design records (FR-150, FR-151). BR-025 (final tab
determined by highest display order among active tabs) and BR-027
(Submit locked to final tab in the rendering layer, not in metadata)
are correctly designed. The no-config self-management model (BO-012)
is a genuine quality-of-life improvement for form authors. Approved
with no additional conditions.

Alignment with Phase 1 Conditions

BO-003 (Relationship Managers receive structured CRM records) is
directly supported by Entry Grid Mode B, which is the primary
justification for accepting the complexity differential. If a form
author can configure a beneficiary grid that creates structured child
records on submission, the Relationship Manager receives a complete
structured record without any post-submission manual data entry. This
aligns directly with Phase 1 success criteria.

The Interactive Grid introduces additional OData queries at form load
time (Selection Grid) and additional Dataverse write operations at
submission time (Entry Grid). Both increase Dataverse API call volume
and must be factored into the throttling and retry strategy from
ADR-006. The architect must address this in Phase 3 for the addendum.

Conditions on Approval

ADD-002-C1: Before the architect begins Phase 3 work on this addendum,
  the BA must add a formal open question to the addendum covering the
  Entry Grid draft column-change compatibility policy (Risk 2 above).
  The question must be resolved and documented before architecture
  begins. A suggested resolution must include either (a) draft
  invalidation with user notification when column schema changes after
  save, or (b) silent orphan-column dropping on resume with a visible
  notice. For a banking context option (a) is my preference, but the
  final decision belongs to QDB. This must not be left as an
  implementation-time decision.

ADD-002-C2: The architect must produce an explicit ADR covering the
  fate of the qdb_grid_filter_expression attribute following the
  Q-008 resolution. If the attribute is retained in the schema, the
  ADR must define the sanitisation requirement (ODataQueryBuilder
  mandatory). If the attribute is removed, the ADR must confirm the
  migration path for any existing configuration records. An ambiguous
  schema state on this attribute is an OData injection risk vector and
  will not be accepted at Phase 3 checkpoint.

ADD-002-C3: The Entry Grid atomic transaction extension (Risk 1 above)
  must be addressed in an explicit architecture section, not treated
  as a routine extension of BR-006. The architect must document the
  failure scenarios for partial child record creation (parent created,
  child N of M fails), the rollback mechanism (Dataverse $batch
  changesets), and the user-facing error message strategy. The QA
  agent must include at minimum three test cases covering partial
  submission failure for Entry Grid forms.

ADD-002-C4: The Selection Grid OData queries (FR-111) fire at form
  load time, not on user interaction. On a tab with two Selection Grid
  fields, this means two additional Dataverse API calls per form load.
  The architect must assess the impact on NFR-001 (500ms P95 form
  metadata response) and either (a) include Selection Grid queries in
  the parallel metadata fetch, (b) load them lazily on tab activation,
  or (c) cache them with a separate TTL. The choice must be documented
  in Phase 3. Lazy loading on tab activation is my preferred approach
  as it avoids penalising the initial form load time.

ADD-002-C5: This addendum, like DFE-ADD-001, may not enter Sprint 1.
  The ten v1.0 blockers from the original Phase 7 decision take
  absolute priority. Work on DFE-ADD-002 begins only after Sprint 1
  blocker remediation is auditor-verified and UAT entry is cleared.
  Within DFE-ADD-002, the Boolean Field Type and Tab-Aware Buttons
  enhancements may be implemented in parallel with Interactive Grid
  work. Entry Grid (Mode B) should be treated as a distinct deliverable
  within the sprint plan — it carries the highest complexity and should
  be the last of the three enhancements to be considered ready for QA.


SEQUENCING AND SPRINT GUIDANCE
──────────────────────────────────────────────────────────────────

The approved sequencing for this project is:

1. Sprint 1 (current priority): Resolve all ten v1.0 blockers.
   Obtain GATE-A and GATE-B confirmations from QDB. Complete auditor
   re-verification. Obtain UAT entry clearance.

2. UAT: Execute the Loan Application form UAT against the remediated
   system. No addendum features are in scope for the UAT phase.

3. Sprint 2: Complete all nine production-readiness items from the
   original Phase 7 decision. This sprint also incorporates
   ADD-001-C1 (adding "info_card_screen_viewed" to PROD-2 scope).

4. Phase 3 (Addenda): After Sprint 2 production readiness items are
   complete, the architect begins Phase 3 for DFE-ADD-001 and
   DFE-ADD-002 in parallel. ADD-002-C1 and ADD-002-C2 must be
   resolved before architecture for DFE-ADD-002 begins.

5. Build, QA, and Audit for addenda features follow the standard
   pipeline. No addendum feature enters production without completing
   all seven phases.

This sequencing protects the Q3 2026 go-live date for the core
system. The addenda features are enhancements that improve the
platform after go-live, not prerequisites for it.


OPEN ITEMS REQUIRING BA ACTION BEFORE PHASE 3 FOR ADDENDA
──────────────────────────────────────────────────────────────────

The following items must be completed by the BA before the architect
is cleared to begin Phase 3 for DFE-ADD-002:

  OI-1: Add Entry Grid draft column-change compatibility policy as a
    formal open question in brd.md Addendum DFE-ADD-002 Section B10.
    Obtain QDB's resolution. File the resolution before Phase 3 begins.
    (ADD-002-C1)

  OI-2: Add download URL HTTPS validation requirement to the admin
    screen scope for FR-087 in brd.md Addendum DFE-ADD-001.
    (ADD-001-C3)

  OI-3: Confirm with QDB whether the qdb_grid_filter_expression
    attribute is retained or removed following the Q-008 View-based
    resolution. The architect cannot make this ADR decision without
    explicit client input on whether any legacy filter expressions
    exist in pre-existing configuration data.
    (ADD-002-C2)


═══════════════════════════════════════════════════════════════════
SIGNED OFF — ADDENDUM DECISIONS
Role:       CEO, Maqsad AI
DFE-ADD-001 Decision: APPROVED (subject to ADD-001-C1 through C4)
DFE-ADD-002 Decision: APPROVED WITH CONDITIONS (ADD-002-C1 through C5)
Date:       2026-06-05
═══════════════════════════════════════════════════════════════════


═══════════════════════════════════════════════════════════════════
PHASE 3 ARCHITECTURE REVIEW — CEO BUILD AUTHORIZATION DECISION
DFE-ADD-001 (Info-Card Screens) + DFE-ADD-002 (Boolean, Interactive
Grid, Tab-Aware Buttons)
═══════════════════════════════════════════════════════════════════
Reviewed by:    CEO, Maqsad AI
Date:           2026-06-06
Source:         phase-3-arch-addenda.md v1.0
                (Architect: Maqsad AI, 2026-06-06)
═══════════════════════════════════════════════════════════════════


DECISION: BUILD APPROVED WITH CONDITIONS
─────────────────────────────────────────────────────────────────

The architecture document for DFE-ADD-001 and DFE-ADD-002 is
approved to proceed to Phase 4 technical build, subject to the
named conditions below. The architecture is substantively sound,
closes all five CEO conditions from the addendum review (ADD-002-C1
through C5) and the one open condition from the INFO-CARD review
(ADD-001-C3), and introduces no unacceptable new risk against the
approved Phase 3 base architecture.


VERIFICATION OF PRIOR CEO CONDITIONS
─────────────────────────────────────────────────────────────────

ADD-002-C1 — Column-change invalidation policy
  Status: MET
  Resolution: QDB confirmed Option A. The architecture implements
  SHA-256 (16 hex char truncation) of the sorted column attribute
  names stored as qdb_grid_schema_hash on qdb_form_draft. On
  resume, each Entry Grid field is compared hash-by-hash. A mismatch
  discards that field's row data, shows a notification banner on the
  affected tab, and leaves all other tabs' data intact.

  I accept the 16-character truncation. With 64 bits of collision
  space and at most a handful of Entry Grid fields per form, the
  collision probability is negligible in practice. The more important
  risk — and one the architect has correctly called out in the
  Skeptic review (Challenge 4) — is the null-hash case for drafts
  saved before this addendum is deployed. The architecture states
  that a null hash defaults to "always invalidate." This is the
  correct conservative choice for a banking context and must be
  enforced strictly in the useDraft hook implementation. I am
  naming this as a build condition (BC-001) below.

ADD-002-C2 — ADR on qdb_grid_filter_expression
  Status: MET
  Resolution: ADR-ADD-001 formally removes the attribute from the
  schema entirely. The rationale is clear and correct: retaining a
  second, sanitisation-dependent path alongside the View-based safe
  path creates a split architecture where any future configuration
  team member could inadvertently use the unsafe path. Removal is
  the only safe choice. The migration path is trivial (attribute
  never existed in production configuration data for this addendum).

  No OData injection surface remains for Selection Grid queries. The
  original Phase 7 Note 3 concern is resolved.

ADD-002-C3 — Entry Grid atomic transaction
  Status: MET
  Resolution: ADR-ADD-002 adopts Dataverse $batch changesets for
  the entire submission write operation. The failure scenario table
  is complete: parent failure, standard child failure, Entry Grid
  row M failure, full outage, and network cut mid-response are all
  addressed with explicit user messages and draft-preservation
  guarantees. The Content-ID attribution mechanism — which maps a
  failing Content-ID back to the source entity and row index — is
  the correct implementation pattern.

  Two concerns are carried forward as build conditions.

  First, the architecture note in section 4.3.3 correctly states
  that this $batch approach should be adopted for all parent+child
  submissions, not only Entry Grid. This improvement resolves Phase
  3 Risk 3 (compensating rollback is not database-level atomic) for
  the base architecture as well. I require this to be the universal
  submission path in Phase 4, not an Entry-Grid-only variant. Named
  as BC-002.

  Second, the architect's own ADR-ADD-002 Consequence note
  acknowledges that Dataverse $batch error response formats differ
  across versions. The architecture requires validation of the
  parseBatchResponse method against the actual target Dataverse
  org before Entry Grid QA is signed off. Named as BC-003.

ADD-002-C4 — Selection Grid query timing
  Status: MET
  Resolution: ADR-ADD-003 adopts lazy loading on tab activation,
  which is my stated preference. The mechanism is clean: a React
  context event (GridDataLoadContext) notifies useSelectionGridData
  on tab activation; the hook transitions through idle/loading/
  loaded/error states; data is cached in component state for the
  session (no re-fetch on revisit); and an AbortController cancels
  in-flight requests if the hook unmounts before completion.

  The NFR-001 (500ms P95 form metadata response) is confirmed
  unaffected because Selection Grid records are not part of the
  metadata fetch. The NFR-019 budget of 1,500ms P95 from tab
  activation to interactive is adequately supported by the
  performance budget breakdown (750ms estimated, 50% headroom).

ADD-002-C5 — Build sequencing; Entry Grid last
  Status: MET
  The architecture explicitly states that all three enhancements are
  additive. The boolean field type and tab-aware buttons may be
  implemented in parallel. Entry Grid (Mode B) is positioned as the
  last of the three to reach QA, consistent with my sequencing
  instruction.

ADD-001-C3 — HTTPS URL validation at admin save time
  Status: MET
  Section 2.8 of the architecture documents the validation logic
  at the backend POST and PATCH handlers for info-card-items.
  The approach is correct: new URL(value) for well-formedness, then
  url.protocol === 'https:' for scheme enforcement, returning 422
  with a descriptive error on failure. The frontend rendering layer
  correctly treats downloadUrl as an opaque string and applies
  rel="noopener noreferrer" without re-validating — validation is
  a configuration-time responsibility, not a render-time one.
  FR-087 in the BRD is already updated with this requirement.


ASSESSMENT OF THE TEN SKEPTIC CHALLENGES
─────────────────────────────────────────────────────────────────

The skeptic review is thorough and surfaces real build risks. My
assessment of each follows.

CHALLENGE 1 — $batch response parsing across Dataverse versions
  Risk: Acknowledged in ADR-ADD-002 Consequences and in Open Risk 1.
  Mitigation: Unit tests against captured Dataverse response fixtures
  and pre-QA validation against the target org. This is addressed but
  not yet resolved — it is a validation-in-build risk, not a design
  gap. Named as BC-003 (see above).
  Assessment: Acceptable. The architect has flagged it and the
  mitigation path is clear.

CHALLENGE 2 — Saved View dependency; View can be modified or deleted
  Risk: Real. If a View referenced by qdb_grid_saved_view_id is
  deleted by a CRM admin, the Selection Grid fails.
  Mitigation: The architecture states the backend must handle a 404
  on View lookup gracefully with a user-facing error and a log entry
  of the missing View GUID. This must be implemented in Phase 4.
  Named as BC-004.
  Assessment: Acceptable with condition.

CHALLENGE 3 — qdb_field_values_json must be a Memo column
  Risk: Stated as Risk 5 in the open risks table but not elevated to
  a hard schema requirement. A 50-row Entry Grid with 8 text fields
  of 100 characters produces ~40,000 characters before JSON overhead.
  This is not a monitoring item; it is a schema creation requirement.
  The skeptic is correct: if this column is created as a bounded
  String type, the risk is realised silently on the first large
  submission. Named as BC-005 — this must be a hard schema
  requirement, not a risk to monitor.
  Assessment: Must be enforced as a condition.

CHALLENGE 4 — Null-hash on pre-addendum drafts
  Risk: Real. If a draft was saved before addendum deployment, no
  hash exists on the draft record. Treating a null hash as "valid"
  would allow stale row data to be restored.
  Mitigation: Architecture states null hash defaults to "always
  invalidate." This must be the explicit behaviour in the useDraft
  hook implementation. Named as BC-001 (see C1 verification above).
  Assessment: Acceptable with condition already named.

CHALLENGE 5 — Alternate key race for concurrent info-card view writes
  Risk: Low likelihood per the architecture, and the mitigation is
  sound: Dataverse enforces the alternate key uniqueness constraint
  and returns error code 0x80060892 on a duplicate write. The
  DataverseClient must parse this specific error code and treat it
  as success rather than retrying it as a transient error.
  Named as BC-006.
  Assessment: The fix is a single error-code handler in
  DataverseClient — low complexity, must not be overlooked.

CHALLENGE 6 — First-view audit event may not be recorded in poor
network conditions
  Risk: Real, but the architecture correctly identifies this as a
  UX audit event, not a regulatory audit event. The QCB compliance
  audit trail is the submission event set (FR-044), not the
  info-card view. The first-view audit is a product analytics
  capture, not a regulatory record.
  However, the architecture leaves the compliance classification as
  an implicit assumption. This must be explicitly confirmed by QDB
  Compliance before Phase 4 for DFE-ADD-001 begins. Named as BC-007.
  Assessment: Needs explicit stakeholder acceptance, not a design
  change.

CHALLENGE 7 — Submit button flicker when rule engine toggles the
final tab's visibility
  Risk: Real UX problem. If a business rule alternately shows/hides
  the tab that is currently the final tab, the Submit button appears
  and disappears on every toggle.
  Mitigation: The architecture calls for finalTabId recomputation
  only on tab-level visibility changes and recommends a 300ms
  debounce before recomputation is reflected. This is the correct
  approach. Named as BC-008 — the debounce must be implemented in
  DynamicFormRenderer, not left as an advisory note.
  Assessment: Acceptable with condition.

CHALLENGE 8 — Admin screen should warn when Entry Grid max rows
approaches batch ceiling
  Risk: Operational. A form with two Entry Grid fields each with
  qdb_grid_max_rows = 200 creates 401 batch operations, approaching
  the 500-operation ceiling and producing a poor user experience
  when the limit is hit.
  Mitigation: An admin screen warning when the product of
  qdb_grid_max_rows multiplied by the number of Entry Grid fields on
  a single form approaches 500 is a reasonable operational guard.
  Named as BC-009.
  Assessment: Acceptable with condition.

CHALLENGE 9 — Lazy Selection Grid and full-form validation on submit
  Risk: If a user never navigates to a tab containing a required
  Selection Grid, the grid records are never loaded, but the
  validation engine must still flag the field as failing.
  Mitigation: The architecture confirms this is achievable via the
  Zod schema for the interactive-grid field type — a required
  Selection Grid with an empty or undefined RHF value Set fails
  validation without needing the records to have loaded. The
  architecture flags this for explicit confirmation in Phase 4.
  Named as BC-010.
  Assessment: Acceptable — the approach is sound, but must be
  explicitly verified in the Phase 4 Zod schema implementation and
  covered by a QA test case.

CHALLENGE 10 — User Views must not be permitted as qdb_grid_saved_view_id
  Risk: Real. A View GUID pointing to a User View owned by a
  deactivated CRM admin account would be inaccessible to the service
  principal.
  Mitigation: The admin screen must enforce that only System Views
  (savedquery entity) can be selected. The backend must validate at
  metadata assembly time that the referenced View is a savedquery
  record and not a userquery record, rejecting the form definition
  with a configuration error if a userquery GUID is referenced.
  Named as BC-011.
  Assessment: Must be enforced as a condition.


TECHNOLOGY STACK VERIFICATION
─────────────────────────────────────────────────────────────────

The architecture confirms the technology stack is unchanged from the
approved Phase 3 base:

  Frontend:     React + Fluent UI v9 + TypeScript strict
  Backend:      Node.js + Express + TypeScript strict
  Data:         Dataverse Web API (OData v4)
  Validation:   Zod (runtime schema generation from metadata)
  Rules:        json-rules-engine (existing ADR-003)
  Logging:      pino + Azure Monitor (existing)
  Auth:         Azure AD / Entra ID (existing)

No new external dependencies have been introduced. The Dataverse
$batch changeset pattern uses the existing DataverseClient class
with an extension to parseBatchResponse — not a new library.
The SHA-256 hash for grid schema change detection can be computed
with the Node.js built-in crypto module — no new dependency.
This is compliant with the architecture's YAGNI and dependency
adoption policy.


NAMED BUILD CONDITIONS
─────────────────────────────────────────────────────────────────

All eleven conditions below must be met during Phase 4 technical
build. The Code Reviewer must verify each one before the QA phase
begins. Conditions marked (PRE-QA) block QA sign-off if unmet.
Conditions marked (PRE-ENTRY-GRID-QA) block QA sign-off on Entry
Grid specifically.

BC-001 (PRE-QA): In useDraft hook, a null qdb_grid_schema_hash on
  a resumed draft must unconditionally invalidate all Entry Grid
  fields and display the column-change notification banner for each.
  "Null hash = valid" is not an acceptable implementation.

BC-002 (PRE-QA): The Dataverse $batch changeset submission path
  must be adopted universally for all parent + child record creation
  in CrmSubmissionService, not only for Entry Grid submissions. The
  original compensating-DELETE sequential approach must be removed.
  This resolves Phase 3 Risk 3 across all submission types.

BC-003 (PRE-ENTRY-GRID-QA): The parseBatchResponse method must be
  unit-tested against a minimum of three captured Dataverse batch
  response formats: (a) all-success response, (b) partial failure
  with error in part body, and (c) partial failure with top-level
  error. Tests must use fixtures captured from the actual target
  Dataverse org (org5869857f or its Qatar North replacement), not
  constructed from the OData specification text alone.

BC-004 (PRE-QA): The Selection Grid backend handler must return a
  user-facing error message ("This grid's configuration is
  unavailable — please contact your administrator") and log the
  missing View GUID with the field ID when the saved View referenced
  by qdb_grid_saved_view_id returns a 404 from Dataverse. This
  must not surface as an unhandled 502 to the portal user.

BC-005 (SCHEMA-CREATION-GATE): The qdb_field_values_json attribute
  on qdb_form_draft must be created as a Dataverse Memo column
  (nvarchar(max)), not a bounded String column. This is a hard
  schema creation requirement. The solution package manifest must
  be verified to reflect this type before deployment to any
  environment. A bounded String column for this attribute is a
  schema defect that cannot be corrected without data migration.

BC-006 (PRE-QA): DataverseClient must explicitly handle Dataverse
  error code 0x80060892 (alternate key uniqueness violation) on the
  POST to qdb_info_card_view_records and treat it as a non-fatal
  success (the record already exists — the user has already viewed).
  This error code must not be retried as a transient error.

BC-007 (PRE-ADD-001-QA): Written confirmation must be obtained from
  QDB Compliance that the "info_card_screen_viewed" audit event is
  classified as a UX/product analytics event and not as a regulatory
  record-keeping event subject to QCB audit requirements. If QDB
  Compliance classifies it as a regulatory event, the fire-and-forget
  audit pattern is insufficient and the architecture for ADD-001
  must be revised before Phase 4 begins for that feature.

BC-008 (PRE-QA): The finalTabId recomputation in DynamicFormRenderer
  must be debounced by a minimum of 300ms from the moment the rule
  engine emits a tab-visibility change. Recomputation must only be
  triggered by tab-level visibility changes in the visibility map,
  not by field-level visibility changes. This prevents Submit button
  flicker on forms with rules that rapidly toggle tab visibility.

BC-009 (PRE-QA): The admin configuration screen for Entry Grid
  fields must display a warning when qdb_grid_max_rows multiplied
  by the count of Entry Grid fields on the same form definition
  exceeds 400 operations (80% of the 500-operation backend ceiling).
  The warning must be visible at the point the admin saves the field
  configuration, not only at runtime when a submission is attempted.

BC-010 (PRE-ENTRY-GRID-QA): The Zod schema generated by
  ValidationEngine.buildZodSchema for the interactive-grid field
  type must produce a validation failure when field.isRequired is
  true and the RHF value (the selection Set or row array) is empty
  or undefined, without requiring the Selection Grid records to have
  been loaded. The QA plan must include at minimum one test case
  verifying that submitting a form with an unvisited required
  Selection Grid tab produces a validation error.

BC-011 (PRE-QA): The admin screen for configuring qdb_grid_saved_view_id
  must enforce that only System Views (Dataverse savedquery entity)
  are selectable. The backend CrmMetadataService must validate at
  metadata assembly time that the referenced View GUID belongs to
  a savedquery record and not a userquery record. A form definition
  referencing a userquery GUID must be rejected with a configuration
  error before it is served to the portal.


OPEN RISK ACCEPTED UNDER CONDITIONS
─────────────────────────────────────────────────────────────────

The seven risks listed in section 12 of the architecture are
reviewed and accepted as follows:

Risk 1 ($batch parsing edge cases): Accepted — mitigated by BC-003.
Risk 2 (View filter too permissive): Accepted — qdb_grid_max_rows
  cap and admin record-count preview are adequate controls.
Risk 3 (Info-card view record race on concurrent opens): Accepted —
  mitigated by BC-006.
Risk 4 (qdb_grid_schema_hash column width): Accepted — the fallback
  to "always invalidate" for excess fields is conservative and safe.
  If any form approaches 50 Entry Grid fields, the schema change to
  Memo is straightforward.
Risk 5 (qdb_field_values_json column size): Resolved by BC-005.
  Not accepted as a monitored risk — elevated to a schema creation
  requirement.
Risk 6 (Visible skeleton state on first Selection Grid tab
  activation): Accepted — skeleton UI is preferable to blocking
  load. The 1,500ms NFR-019 budget has 50% headroom.
Risk 7 (View columns leaking beyond qdb_grid_column_config): Accepted —
  the $select restriction applied server-side before the response
  is returned is the correct control. This must be implemented as
  a hard enforcement, not a best-effort filter.


ALIGNMENT WITH PHASE 1 SUCCESS CRITERIA
─────────────────────────────────────────────────────────────────

BO-001 (self-service form configuration): All three enhancements
  remain fully metadata-driven. No frontend code change is required
  for a form author to add Info-Card Screens, enable a Boolean field,
  configure an Interactive Grid, or change button labels.

BO-002 (improved completion rates): Info-Card Screens directly
  address pre-form abandonment. Boolean fields improve declaration
  UX. Tab-aware button placement removes the current ambiguity about
  where Save & Draft and Submit appear.

BO-003 (structured CRM records): Entry Grid Mode B directly delivers
  this objective for multi-beneficiary and co-applicant scenarios —
  one submission creates structured parent and child records with no
  Relationship Manager data re-entry.

BO-004 (tamper-proof audit log): The new audit events
  (info_card_screen_viewed, grid_selection_changed, grid_row_added,
  grid_row_deleted) are additive to FR-044 and must be included in
  the Sprint 2 PROD-2 audit completeness deliverable.

No new regulatory dependencies are introduced beyond those already
in scope (QCB audit log, PDPPL data residency, PDPPL applies to
any PII in grid row data if Entry Grid columns map to personal data
attributes).


SEQUENCING GUIDANCE FOR PHASE 4
─────────────────────────────────────────────────────────────────

The following build order is required, not advisory.

Step 1: Boolean Field Type and Tab-Aware Buttons. These are the
  simplest enhancements and have no dependencies on each other or
  on the grid work. They can be built and code-reviewed in parallel.

Step 2: Selection Grid (Mode A). Depends on Step 1 only in that
  the Zod schema extension for interactive-grid is being built
  alongside it. BC-004, BC-010, BC-011 apply to this step.

Step 3: Info-Card Screens (ADD-001). BC-006, BC-007 apply to this
  step. BC-007 (QDB Compliance classification) must be resolved
  before this step begins.

Step 4: Entry Grid (Mode B). Must be the last sub-feature to enter
  QA. BC-001, BC-002, BC-003, BC-005, BC-008, BC-009 apply to this
  step. The $batch changeset implementation (BC-002) must be complete
  and tested before Entry Grid QA begins, because it affects the
  universal submission path.


═══════════════════════════════════════════════════════════════════
SIGNED OFF — ARCHITECTURE REVIEW (ADDENDA)
Role:     CEO, Maqsad AI
Decision: BUILD APPROVED WITH CONDITIONS
          11 named build conditions (BC-001 through BC-011) must be
          met during Phase 4. Code Reviewer must verify each before
          QA phase sign-off. Entry Grid (Mode B) is blocked from QA
          sign-off until BC-001, BC-002, BC-003, BC-005, BC-008,
          BC-009 are verified. BC-007 (QDB Compliance classification
          of info_card_screen_viewed) must be obtained before
          Info-Card Screen Phase 4 build begins.
Date:     2026-06-06
═══════════════════════════════════════════════════════════════════
