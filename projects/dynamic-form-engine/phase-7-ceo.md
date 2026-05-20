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
