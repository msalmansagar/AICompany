═══════════════════════════════════════════════════════════════════
PHASE 6 — SECURITY AND COMPLIANCE AUDIT
Dynamic Form Engine Portal — QDB
═══════════════════════════════════════════════════════════════════
Project:     Dynamic Form Engine Portal — QDB
Prepared by: Maqsad AI — Auditor and Governance Specialist
Date:        2026-05-08
Version:     1.1 (Final — replaces v1.0 draft)
Status:      FINAL — NOT CLEARED FOR GO-LIVE
═══════════════════════════════════════════════════════════════════


1. EXECUTIVE SUMMARY
──────────────────────────────────────────────────────────────────

Overall Risk Rating: HIGH

The Dynamic Form Engine Portal demonstrates a security-aware
architecture in several areas. JWT validation using jose with JWKS
key fetching is correctly implemented. Structured logging with pino
carries correlation IDs through the full request lifecycle. The
Zod-validated environment schema prevents misconfigured starts.
The LRU metadata cache reduces Dataverse exposure. The append-only
audit log with dual enforcement (code and Dataverse role) is a
sound compliance control.

Despite these positives, the review of the actual TypeScript source
code against the architecture specification reveals seventeen
security findings, twelve of which are Critical or High severity.
Ten conditions block go-live entirely.

The seven most urgent issues are:

1. DATA RESIDENCY VIOLATION (CRITICAL): The Dataverse org URL
   org5869857f.crm4.dynamics.com places all submission records,
   draft data, PII, and audit logs in West Europe, not Qatar.
   C-005 mandates Qatar Azure region. This is a regulatory
   violation on day one of any production use.

2. NO VIRUS SCAN IN PRODUCTION (CRITICAL): files.routes.ts ships
   a confirmed stub — file bytes are never inspected. Banking
   documents (loan application supporting files) go into CRM
   Notes without any AV inspection.

3. CORS WILDCARD DEFAULT (CRITICAL): index.ts line 42 uses
   process.env.CORS_ORIGIN ?? '*'. CORS_ORIGIN is not in the Zod
   env schema, so the application starts in production without it
   and exposes the API to any origin.

4. FORM-LEVEL RBAC NOT WIRED (CRITICAL): The roleMiddleware
   described in the architecture is not registered in index.ts.
   Any authenticated user can access any form regardless of
   qdb_access_group_id configuration.

5. ODATA INJECTION IN METADATA QUERIES (HIGH): CrmMetadataService
   interpolates formCode and record GUIDs directly into OData
   $filter strings with no sanitisation.

6. STORED XSS PATH (HIGH): The inputSanitiser.ts middleware
   described in the architecture does not exist. Form field values
   reach Dataverse and are later rendered in CRM without any
   server-side HTML stripping.

7. IDOR ON RECORD FETCH (HIGH): GET /api/forms/:formCode/data/:recordId
   returns any Dataverse record to any authenticated user with no
   ownership check. This is a direct exposure of other users'
   submitted banking application data.

There are also four critical implementation gaps that are both
security and functional blockers: file upload is non-functional
(multer not registered), business rules are never fetched from
Dataverse (rule engine produces no output), server-side validation
only checks required rules and not the full validation rule set,
and the Power Automate trigger uses an on-premise API not applicable
to cloud flows.

Scope of review: brd.md, phase-3-arch.md, all TypeScript source
files in backend/src/ and frontend/src/, nginx.conf, Dockerfile,
docker-compose.yml, .github/workflows/deploy.yml.


2. FINDINGS TABLE
══════════════════════════════════════════════════════════════════

──────────────────────────────────────────────────────────────────
AUDIT-001
Severity:    CRITICAL
Confidence:  99%
Category:    Data Residency / Regulatory
Description: The Dataverse org URL documented and used across the
  project is org5869857f.crm4.dynamics.com. Microsoft CRM4 maps to
  West Europe (Netherlands / Ireland). All form submissions, draft
  records, audit logs, and uploaded documents are physically stored
  in West Europe. C-005 in the BRD requires data to remain in the
  Qatar Azure region. NFR-011 states PII must not leave Dataverse.
  Every form submission crossing the EU–Qatar border potentially
  violates Qatar's Personal Data Privacy Protection Law (PDPPL,
  Law No. 13 of 2016) and QDB's own internal data sovereignty policy.
Risk: QCB regulatory non-compliance; PDPPL breach; QDB IT policy
  violation; potential enforcement action.
Remediation:
  1. QDB IT must confirm whether a Qatar or UAE-North Dataverse
     environment exists or can be provisioned. Microsoft's UAE North
     region hosts Dynamics 365 / Dataverse.
  2. No production form submission data may be created until the
     correct regional org is confirmed in writing.
  3. Update DATAVERSE_URL env var and all architecture documents.
  4. Obtain written data residency confirmation from QDB IT before
     Sprint 1, per CEO Condition from ADR-007.
Status: OPEN — blocks go-live

──────────────────────────────────────────────────────────────────
AUDIT-002
Severity:    CRITICAL
Confidence:  99%
Category:    Malware / File Security
Description: backend/src/routes/files.routes.ts lines 38-47 check
  the MIME type using file.mimetype, which multer reads from the
  Content-Type header supplied by the client — it does not inspect
  actual file bytes. Renaming malware.exe to document.pdf and
  submitting Content-Type: application/pdf passes this check. No
  virus scan interface is implemented anywhere in the source tree;
  the VirusScanProvider described in phase-3-arch.md section 9.5
  does not exist in the code. Files from untrusted bank customers
  land in CRM Notes with zero content inspection.
Risk: Malware stored in QDB CRM; execution risk for Relationship
  Managers who open attachments from CRM.
Remediation:
  1. Replace header-based MIME check with the file-type npm package
     (magic bytes inspection from the first 4100 bytes of the stream).
  2. Integrate Microsoft Defender for Storage on the target storage
     destination (blob/CRM Notes quarantine pattern).
  3. Obtain written risk acceptance from QDB Security if AV scanning
     cannot be implemented before UAT.
Status: OPEN — blocks UAT go-live

──────────────────────────────────────────────────────────────────
AUDIT-003
Severity:    CRITICAL
Confidence:  99%
Category:    Security Misconfiguration
Description: backend/src/index.ts line 42:
  app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*', credentials: true }));
  CORS_ORIGIN is absent from the Zod env schema in env.ts and is
  absent from docker-compose.yml. The application starts in
  production without this value, silently falling back to wildcard.
  Any origin can issue credentialed requests to the API. While
  browsers block credentials with '*', some environments strip
  credentials from cross-origin requests and still receive data.
  The correct behaviour on absent CORS_ORIGIN is to refuse to start.
Risk: Cross-origin API access from attacker-controlled sites;
  confidential form data exposed to unauthorised origins.
Remediation:
  1. Add CORS_ORIGIN as a required Zod field in env.ts.
  2. Remove the ?? '*' fallback entirely.
  3. Add CORS_ORIGIN to the deployment runbook and GitHub Actions
     secrets for all environments.
Status: OPEN — blocks go-live

──────────────────────────────────────────────────────────────────
AUDIT-004
Severity:    CRITICAL
Confidence:  99%
Category:    Broken Access Control
Description: The architecture (phase-3-arch.md section 9.3 and
  section 2.2) specifies a roleMiddleware that checks the AD group
  claim against qdb_access_group_id on each form. This middleware
  is listed in the backend component tree but is not registered in
  backend/src/index.ts. The registered middleware chain is:
    helmet → cors → json → pinoHttp → correlationMiddleware
    → authMiddleware → route handlers
  roleMiddleware is completely absent. Any authenticated user can
  call GET /api/forms/:formCode/metadata and POST /api/forms/:formCode/submit
  for any form, bypassing form-level RBAC entirely. FR-038 and
  FR-039 are not met.
Risk: Unauthorised form access; data from restricted forms
  (e.g., internal-only forms) accessible to all authenticated users.
Remediation:
  1. Implement roleMiddleware in backend/src/middleware/auth.middleware.ts.
  2. Register it on the /api/forms router, not globally (health and
     lookup endpoints should not require group membership).
  3. Implement the overage claim flow for users in more than 200 groups.
Status: OPEN — blocks go-live

──────────────────────────────────────────────────────────────────
AUDIT-005
Severity:    HIGH
Confidence:  95%
Category:    Injection (OData)
Description: CrmMetadataService.ts builds OData $filter strings
  using direct string interpolation of URL-sourced values:
  - Line 59: qdb_form_code eq '${formCode}'  (formCode from req.params)
  - Line 93: _qdb_form_definition_id_value eq '${formId}'
  - Line 122: tabIds joined with or-clauses using '${id}'
  - Line 155: sectionIds joined with or-clauses using '${id}'
  formCode arrives from forms.routes.ts line 30 with no validation
  before the service call. A crafted value such as:
    loan-app' or '1' eq '1
  alters filter semantics to return all active form definitions,
  bypassing the form-level access check.
Risk: Data disclosure across form boundaries; access control bypass.
Remediation:
  1. In forms.routes.ts, validate formCode against /^[a-z0-9\-]{1,100}$/
     and return 400 immediately if it does not match.
  2. Validate GUID values against the UUID pattern before interpolation.
  3. Implement a parameterised OData filter builder that always applies
     single-quote escaping (doubling) per OData spec.
Status: OPEN — blocks go-live

──────────────────────────────────────────────────────────────────
AUDIT-006
Severity:    HIGH
Confidence:  97%
Category:    Injection (OData)
Description: Two injection surfaces in the lookup layer:
  (a) CrmLookupService.ts line 29 appends filterExpression directly
      to the OData $filter without any validation:
        if (filterExpression) { filters.push(filterExpression); }
      This expression is read from Dataverse config, but a
      compromised CRM admin account can insert arbitrary OData.
  (b) lookups.routes.ts line 9 accepts a 'filter' query parameter
      from the frontend caller and passes it through to the service.
      Any authenticated portal user can supply arbitrary OData filter
      fragments via this parameter, querying unrestricted data.
Risk: OData injection from authenticated users; disclosure of CRM
  records beyond the form scope.
Remediation:
  1. Remove the 'filter' query parameter from the public lookup API.
  2. Validate stored filter expressions from Dataverse against a
     safe OData expression whitelist before use.
  3. For dynamic filter templates ({dependsOnValue}), OData-encode
     the substituted value (escape single quotes by doubling).
Status: OPEN — blocks go-live

──────────────────────────────────────────────────────────────────
AUDIT-007
Severity:    HIGH
Confidence:  99%
Category:    Injection / Input Validation
Description: The architecture (phase-3-arch.md section 9.4) specifies
  an inputSanitiser.ts middleware using isomorphic-dompurify for
  rich text and validator.js escape() for all strings. This middleware
  does not exist in the source tree. Only auth.middleware.ts and
  error.middleware.ts exist under backend/src/middleware/. Form
  field values submitted to POST /api/forms/:formCode/submit reach
  Dataverse without any server-side HTML stripping or script removal.
  Stored XSS payloads in text fields will be rendered in CRM views
  seen by Relationship Managers.
  
  Separately, RichTextControl.tsx line 84 uses:
    dangerouslySetInnerHTML={{ __html: rawValue }}
  in readonly mode. The rawValue is the HTML string from Dataverse
  (user-submitted content) rendered without any DOMPurify
  sanitisation on the frontend. A stored XSS payload in a rich text
  field would execute in every user's browser that views that form
  in readonly mode.
Risk: Stored XSS in CRM views (affects internal Relationship Managers);
  stored XSS in portal readonly renders (affects all portal users).
Remediation:
  1. Implement inputSanitiser.ts middleware and register it before
     all controller routes.
  2. Apply DOMPurify to rawValue in RichTextControl.tsx before
     passing to dangerouslySetInnerHTML.
  3. DOMPurify allowlist: p, br, strong, em, ul, ol, li, h3, h4
     only — no script, iframe, object, embed, or event attributes.
Status: OPEN — blocks go-live

──────────────────────────────────────────────────────────────────
AUDIT-008
Severity:    HIGH
Confidence:  95%
Category:    Broken Access Control (IDOR)
Description: forms.routes.ts lines 37-45 implement:
  GET /api/forms/:formCode/data/:recordId
  This handler fetches any Dataverse record by entity name and
  recordId, derived from the form's submission mapping. There is no
  check that the recordId being fetched belongs to the authenticated
  user. Any authenticated portal user who knows another user's
  submission record GUID can retrieve that record's full content,
  including all submitted loan application data, KYC information,
  and personal financial details.
Risk: PII disclosure; breach of banking data privacy; potential
  QCB regulatory violation.
Remediation:
  1. Add an ownership check before returning the record: verify
     that the record's submitter attribute matches req.user.oid.
     Return 403 if it does not match.
  2. Alternatively, restrict this endpoint to admin/RM roles with
     an explicit role guard and remove it from the portal user surface.
Status: OPEN — blocks go-live

──────────────────────────────────────────────────────────────────
AUDIT-009
Severity:    HIGH
Confidence:  92%
Category:    Authentication Architecture
Description: ADR-007 assumes all portal users (bank customers) are
  in QDB's corporate Azure AD tenant. msalConfig.ts uses the single-
  tenant authority endpoint. auth.middleware.ts validates against a
  single-tenant JWKS. Bank customers submitting loan applications
  are almost certainly external individuals without corporate AD
  accounts. There is no documented written confirmation from QDB
  that A-010 (all users in same tenant) is correct. If this
  assumption is wrong, the entire authentication layer requires
  rebuilding (3-5 days rework) mid-Sprint.
Risk: Portal completely unusable for external customers; authentication
  architecture rebuilt under time pressure.
Remediation:
  Written confirmation from QDB project sponsor that A-010 is correct
  must be obtained and filed before Sprint 1. If QDB confirms external
  users: migrate to Entra External ID. This is a hard gate per CEO
  Condition 6 in ADR-007.
Status: OPEN — blocks Sprint 1 start

──────────────────────────────────────────────────────────────────
AUDIT-010
Severity:    HIGH
Confidence:  95%
Category:    Broken Access Control
Description: lookups.routes.ts accepts entityName as a URL path
  parameter and passes it directly to CrmLookupService.searchLookup()
  with no validation against an allowlist. Any authenticated user can
  query any Dataverse entity:
    GET /api/lookups/systemuser?search=admin&displayAttribute=fullname
  returns CRM system user records. The endpoint is authenticated but
  there is no restriction to entities configured in lookup fields of
  forms the user can access.
Risk: Disclosure of CRM entity data beyond form scope; exposure of
  admin accounts, system users, and internal records.
Remediation:
  1. Require the lookup request to include formCode and fieldId.
  2. Resolve the entity name server-side from the stored lookup
     config for that field — never accept it from the caller.
  3. As an immediate fix: add an entity allowlist to the Zod query
     schema derived from all active lookup configs at startup.
Status: OPEN — blocks go-live

──────────────────────────────────────────────────────────────────
AUDIT-011
Severity:    HIGH
Confidence:  90%
Category:    Security (ReDoS)
Description: ValidationEngine.ts (frontend) constructs RegExp objects
  from regex patterns stored in Dataverse:
  - buildStringSchema() line 173: new RegExp(rule.regexPattern)
  - validateRegex() line 291: new RegExp(pattern).test(String(value))
  A compromised CRM admin account could store a catastrophically
  backtracking regex (e.g., (a+)+$) in qdb_regex_pattern. When a
  portal user types into a field with this rule, the browser enters
  catastrophic backtracking, consuming 100% CPU and making the tab
  unresponsive. This affects all portal users simultaneously because
  the regex is served from the metadata cache.
Risk: Client-side Denial of Service; portal unavailable for all users.
Remediation:
  1. Before constructing a RegExp from metadata, validate the pattern
     using the safe-regex or regexp-to-ast npm package.
  2. Alternatively, maintain an explicit allowlist of pre-approved
     patterns (email, phone, Qatari ID number formats).
  3. Apply a 100ms evaluation timeout via a Web Worker kill switch
     if arbitrary patterns are required.
Status: OPEN — should fix before UAT

──────────────────────────────────────────────────────────────────
AUDIT-012
Severity:    HIGH
Confidence:  85%
Category:    Authentication / Token Security
Description: MSAL stores tokens in sessionStorage (msalConfig.ts
  line 9). If an XSS vulnerability executes in the SPA context
  (e.g., via the rich text field XSS vector in AUDIT-007, or via
  a compromised third-party script), the injected code can read
  tokens from sessionStorage. Azure AD access tokens have a 60-90
  minute lifetime. There is no token revocation mechanism, no CAE
  signalling, and no DPoP binding. A stolen token is valid for the
  full remaining lifetime.
Risk: Full session takeover for up to 90 minutes; potential for
  fraudulent banking form submissions as the victim user.
Remediation:
  1. Primary mitigation: eliminate XSS vectors (AUDIT-007).
     sessionStorage is the correct MSAL cache choice (not localStorage).
  2. Enable Continuous Access Evaluation (CAE) in the Azure AD app
     registration to allow near-real-time token revocation.
  3. Set Azure AD access token lifetime policy to 30 minutes via
     token lifetime policy configuration.
  4. Require MFA re-evaluation for form submission via Conditional
     Access if the QDB tenant supports it.
Status: OPEN — address before production

──────────────────────────────────────────────────────────────────
AUDIT-013
Severity:    MEDIUM
Confidence:  90%
Category:    Data Security / PII in Audit Log
Description: CrmSubmissionService.ts line 100 writes the error
  string directly into the audit log entry:
    changedData: { error: String(error) }
  String(error) on a CrmApiError includes the full Dataverse API
  error response body text, which may contain submitted field values
  that caused the error (Dataverse echoes invalid attribute data in
  some error responses), potentially including customer name,
  national ID, or financial details. FR-045 states audit log entries
  must not contain PII field values.
Risk: PII in audit log; FR-045 compliance violation; data accessible
  to audit team members who should not see submission content.
Remediation:
  1. Replace String(error) with a sanitised error summary:
     { errorCode, httpStatus, correlationId }.
  2. Never include raw Dataverse response bodies in audit entries.
Status: OPEN

──────────────────────────────────────────────────────────────────
AUDIT-014
Severity:    MEDIUM
Confidence:  93%
Category:    Security Misconfiguration
Description: CrmAuthService.ts lines 13-16 initialise
  ClientSecretCredential with AZURE_CLIENT_SECRET read from
  environment variables. The architecture (phase-3-arch.md section
  9.6) specifies secrets stored in Azure Key Vault and read via
  @azure/keyvault-secrets using Managed Identity. The actual
  implementation deviates from this specification. AZURE_KEY_VAULT_URL
  is present in the architecture's Zod schema but absent from the
  actual env.ts, confirming Key Vault integration is not implemented.
  NFR-006 is not met.
Risk: Client secret exposure if App Service configuration is
  accidentally logged, exported, or visible in deployment scripts.
Remediation:
  1. Implement Key Vault secret retrieval using DefaultAzureCredential
     via @azure/keyvault-secrets SDK as specified.
  2. Add AZURE_KEY_VAULT_URL as a required env var in production mode.
  3. Remove AZURE_CLIENT_SECRET from App Service app settings once
     Key Vault integration is active.
Status: OPEN

──────────────────────────────────────────────────────────────────
AUDIT-015
Severity:    MEDIUM
Confidence:  88%
Category:    Availability / Security
Description: No rate limiting middleware is registered in index.ts.
  The architecture (ADR-001 consequences) references express-rate-limit
  as a compensating control but it is not implemented. Endpoints
  exposed to abuse:
  - POST /api/forms/:formCode/submit — submission flooding
  - GET /api/lookups/:entityName — each request = live Dataverse call
  - POST /api/files/upload — file upload flooding
Risk: Dataverse throttle limits breached; service degradation;
  potential duplicate submissions.
Remediation:
  1. Implement express-rate-limit with per-user (req.user.oid) keys.
  2. Lookup: 60 requests per minute per user.
  3. Submit: 5 per 10 minutes per user per form.
  4. File upload: 20 per hour per user.
  5. Global: 200 requests per minute per IP.
Status: OPEN

──────────────────────────────────────────────────────────────────
AUDIT-016
Severity:    MEDIUM
Confidence:  93%
Category:    Audit / Compliance
Description: CrmAuditService.ts writeAuditEntry() catches all
  exceptions and returns void (lines 29-32). If the Dataverse audit
  write fails (network issue, throttling, Dataverse unavailability),
  the form submission is considered successful with no audit record
  created. For a banking portal under QCB compliance, a submission
  without an audit entry is a regulatory gap. No alert is fired on
  audit write failure.
Risk: QCB compliance gap; submissions without audit trails during
  Dataverse outage windows.
Remediation:
  1. On audit write failure, emit a Critical alert to Azure Monitor.
  2. Implement a fallback: on primary write failure, enqueue the
     audit entry to an Azure Storage Queue. A retry worker processes
     the queue when Dataverse recovers.
  3. Document as an accepted risk in the compliance register if
     100% audit completeness is not mandated.
Status: OPEN

──────────────────────────────────────────────────────────────────
AUDIT-017
Severity:    MEDIUM
Confidence:  85%
Category:    Data Security / Service Account
Description: The backend service principal is configured with
  Sites.ReadWrite.All SharePoint permission (phase-3-arch.md section
  14.3). This grants read and write access to ALL SharePoint sites
  in the QDB tenant, not only the document library for the portal.
  A compromise of the backend service principal exposes all SharePoint
  content in the organisation.
Risk: Broad SharePoint data exposure on service principal compromise.
Remediation:
  Use the Sites.Selected permission model with an explicit grant from
  QDB IT to the specific SharePoint site used for form uploads.
  Remove Sites.ReadWrite.All from the app registration.
Status: OPEN


3. OWASP TOP 10 ASSESSMENT (2021 Edition)
══════════════════════════════════════════════════════════════════

┌─────────────────────────────────────┬────────────┬────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Category                            │ Status     │ Evidence and Gaps                                                                                                                                    │
├─────────────────────────────────────┼────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ A01 Broken Access Control           │ FAIL       │ authMiddleware validates JWT on all non-health routes — PASS. roleMiddleware is described but NOT registered in index.ts — any authenticated user    │
│                                     │            │ accesses any form (AUDIT-004). GET /api/forms/:formCode/data/:recordId has no ownership check — IDOR (AUDIT-008). GET /api/lookups/:entityName       │
│                                     │            │ accepts arbitrary entity names (AUDIT-010). Two HIGH gaps unmitigated.                                                                                │
├─────────────────────────────────────┼────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ A02 Cryptographic Failures          │ PARTIAL    │ TLS 1.2+ at Azure platform level. JWT validated with JWKS asymmetric keys. sessionStorage (not localStorage). No PII in client storage per NFR-011. │
│                                     │            │ Gap: Key Vault integration not implemented — client secret in env var (AUDIT-014). Token lifetime 60-90 min with no CAE (AUDIT-012).                │
├─────────────────────────────────────┼────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ A03 Injection                       │ FAIL       │ Dataverse OData is parameterised (no raw SQL). CrmLookupService applies single-quote escaping for searchTerm. Zod validates request bodies.          │
│                                     │            │ Gaps: OData $filter string interpolation in metadata queries (AUDIT-005). Caller-controlled OData filter in lookup API (AUDIT-006). inputSanitiser   │
│                                     │            │ not implemented (AUDIT-007). ReDoS via metadata-sourced regex (AUDIT-011). dangerouslySetInnerHTML on unsanitised rich text (AUDIT-007).             │
├─────────────────────────────────────┼────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ A04 Insecure Design                 │ PARTIAL    │ Append-only audit log with dual enforcement. Server-side re-validation on submit. BR-002 hidden field clearing enforced server-side.                 │
│                                     │            │ Gaps: No virus scan on file upload — no-op stub (AUDIT-002). CORS wildcard as default (AUDIT-003). Rate limiting absent (AUDIT-015). roleMiddleware  │
│                                     │            │ not wired (AUDIT-004). File upload feature non-functional — multer not registered.                                                                   │
├─────────────────────────────────────┼────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ A05 Security Misconfiguration       │ PARTIAL    │ helmet() registered. Zod env validation with fail-fast. Non-root Docker user in architecture. Structured pino logging.                              │
│                                     │            │ Gaps: CORS_ORIGIN absent from Zod schema — wildcard default (AUDIT-003). No Content-Security-Policy on SPA nginx config. Health endpoint exposes     │
│                                     │            │ version string without auth.                                                                                                                         │
├─────────────────────────────────────┼────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ A06 Vulnerable / Outdated Components│ PARTIAL    │ Modern dependency choices (jose, zod, pino, json-rules-engine). node:20-alpine base image.                                                          │
│                                     │            │ Gaps: No automated dependency scanning (Dependabot / Snyk) in CI pipeline. @tiptap/react — XSS issues in older versions; version pin needed.         │
│                                     │            │ json-rules-engine CVE status not confirmed for pinned version.                                                                                       │
├─────────────────────────────────────┼────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ A07 Authentication Failures         │ PARTIAL    │ PKCE flow (not implicit grant). JWT aud/iss/exp all validated. No auth details leaked in 401 responses. sessionStorage cache.                       │
│                                     │            │ Gaps: ADR-007 tenant assumption unconfirmed — may need complete auth rebuild (AUDIT-009). No CAE/token revocation (AUDIT-012).                       │
│                                     │            │ No MFA enforcement at application layer (tenant policy only).                                                                                        │
├─────────────────────────────────────┼────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ A08 Software and Data Integrity     │ PARTIAL    │ eval() and new Function() explicitly prohibited (ADR-005). CUSTOM_EXPRESSION deferred to Phase 2. Docker multi-stage build.                         │
│                                     │            │ Gaps: No SRI for CDN assets. No SBOM generated in CI pipeline. qdb_transform_expression switch default passes unknown expressions unchanged.         │
├─────────────────────────────────────┼────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ A09 Security Logging and Monitoring │ PARTIAL    │ pino structured logging with correlation IDs on every request. Auth failures logged. Audit log for submission events per FR-044.                    │
│                                     │            │ Gaps: Audit write failures silently absorbed with no alerting (AUDIT-016). Only 2 of 9 required audit events implemented. No anomaly detection.     │
│                                     │            │ Alerting thresholds described in architecture but not confirmed implemented in the source.                                                            │
├─────────────────────────────────────┼────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ A10 Server-Side Request Forgery     │ LOW RISK   │ Backend does not make requests to user-supplied URLs. DATAVERSE_URL is Zod-validated. JWKS URL is fixed from tenant config.                         │
│                                     │            │ Gap: qdb_sharepoint_library_url is stored in Dataverse and used by CrmFileService without URL allowlist validation. A compromised CRM admin          │
│                                     │            │ could redirect uploads to internal Azure endpoints. Remediation: validate SharePoint URLs against /^https:\/\/[a-zA-Z0-9\-]+\.sharepoint\.com\//.  │
└─────────────────────────────────────┴────────────┴────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘


4. COMPLIANCE CHECKLIST
══════════════════════════════════════════════════════════════════

────────────────────────────────────────────────────────────────
Requirement: QCB Banking Record-Keeping — 7-Year Retention (NFR-010)
────────────────────────────────────────────────────────────────
How the design meets it:
  qdb_form_audit_log is append-only with no DELETE privilege in any
  security role. NFR-010 explicitly states 7-year retention. Dual
  enforcement: application code + Dataverse role.

Gap:
  The 7-year retention policy is stated but not enforced at the
  platform level. A Dataverse system administrator can delete records
  via Power Platform Admin Center, bypassing application-layer
  controls. No Azure Backup policy is documented for the Dataverse
  org. Dataverse native auditing (which creates a platform-level
  audit trail) is not confirmed as enabled on the 12 custom tables.

Remediation:
  1. Configure Microsoft Purview Data Lifecycle Management to apply
     a 7-year retention lock on audit and submission log tables.
  2. Enable Dataverse native auditing on all 12 custom tables.
  3. Implement regular export of audit log data to Azure immutable
     storage (Write Once Read Many) for regulatory examination.

Compliance Status: PARTIAL — not go-live ready for QCB audit.

────────────────────────────────────────────────────────────────
Requirement: FATF Recommendation 10 — KYC Document Integrity
────────────────────────────────────────────────────────────────
How the design meets it:
  Submission records and audit logs are append-only. Each submission
  is linked to a stable Azure AD OID. Documents are uploaded to CRM
  Notes linked to submission records.

Gap:
  No document hash is stored at upload time. There is no mechanism
  to prove that a document stored in CRM Notes or SharePoint has not
  been modified after upload. The portal writes the file but does not
  compute or store an SHA-256 hash.

Remediation:
  Compute SHA-256 of file bytes at upload time. Store the hash in
  the FileUploadResult and as an annotation attribute on the CRM Note.

Compliance Status: PARTIAL — document integrity hashing absent.

────────────────────────────────────────────────────────────────
Requirement: Data Residency (C-005 / QDB IT Policy / Qatar PDPPL)
────────────────────────────────────────────────────────────────
How the design meets it:
  The architecture describes Qatar North as the target region for
  Azure App Service, Static Web Apps, Key Vault, and ACR.

Gap: CRITICAL — the Dataverse org URL org5869857f.crm4.dynamics.com
  maps to West Europe. ALL submission data, drafts, audit logs, and
  PII land in West Europe, violating C-005 and potentially PDPPL.

Compliance Status: FAIL.

────────────────────────────────────────────────────────────────
Requirement: NFR-005 — TLS 1.2 Minimum for All Data in Transit
────────────────────────────────────────────────────────────────
How the design meets it:
  Azure App Service and Azure Static Web Apps enforce TLS 1.2+ by
  default. Dataverse Web API is HTTPS-only. The nginx.conf does not
  expose HTTP (port 80 is the container internal port; HTTPS
  termination is at the Azure load balancer layer).

Gap:
  The nginx.conf (frontend/nginx.conf) serves on port 80 with no
  HTTPS redirect. If the nginx container is accidentally exposed
  directly (e.g., in a development environment that forwards port 80
  externally), traffic is unencrypted. The HTTP strict transport
  security (HSTS) header is not present in nginx.conf security
  headers block.

Remediation:
  Add HSTS header to nginx.conf:
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  Add HTTP-to-HTTPS redirect on the Azure load balancer / Front Door layer.

Compliance Status: PARTIAL — HSTS missing.

────────────────────────────────────────────────────────────────
Requirement: NFR-013 — WCAG 2.1 Level AA Accessibility
────────────────────────────────────────────────────────────────
How the design meets it:
  Fluent UI v9 components (TextInput, Dropdown, DatePicker, etc.) are
  WCAG 2.1 AA compliant out of the box for standard controls. ARIA
  attributes are present on custom components (RichTextControl,
  FileUploadControl). Keyboard navigation is supported via Fluent UI.

Gap:
  RichTextControl.tsx toolbar buttons use ToolbarButton with
  aria-pressed but there is no aria-label on the toolbar itself
  describing its relationship to the form field. The TipTap editor
  contenteditable region has no role="textbox" with an explicit
  aria-label linking it to the form field label. Screen readers may
  not associate the editing area with the field label.

Remediation:
  Add aria-label={`${field.label} rich text editor`} to the
  EditorContent wrapper. Add aria-labelledby linking the toolbar
  to the field label. Run a full WCAG audit with axe-core or
  Accessibility Insights before UAT.

Compliance Status: PARTIAL — rich text editor ARIA gap.

────────────────────────────────────────────────────────────────
Requirement: NFR-006 — No Secrets in Code or Version Control
────────────────────────────────────────────────────────────────
How the design meets it:
  .env.example uses placeholder values (your-tenant-id-here, etc.).
  No secrets are committed in the source files reviewed.
  GitHub Actions uses secrets for ACR credentials and Azure tokens.

Gap:
  DATAVERSE_URL in backend/.env.example line 14 contains the actual
  Dataverse org URL: https://org5869857f.crm4.dynamics.com.
  This is a real org URL (not a placeholder), committed to the
  example environment file. While this is an org URL (not a secret),
  it reveals the target infrastructure to anyone who reads the repo.

Remediation:
  Replace with a placeholder (https://your-org.crm.dynamics.com)
  in the .env.example. Document the real URL in the deployment guide
  accessible only to authorised team members.

Compliance Status: PASS with minor note (URL not a secret, but
  should be obfuscated in public-facing files).


5. DATA RESIDENCY REVIEW
══════════════════════════════════════════════════════════════════

Current Dataverse State:
  Org URL: org5869857f.crm4.dynamics.com
  CRM4 Azure Region: West Europe (Netherlands / Ireland)

Azure Infrastructure (as planned per architecture):
  Azure App Service:       Qatar North (target — correct)
  Azure Static Web Apps:   Qatar North (target — correct)
  Azure Key Vault:         Qatar North (target — correct)
  Azure Container Registry:Qatar North (target — correct)
  Dataverse:               West Europe (WRONG — violates C-005)

Data Classification and Current Physical Residency:

  Entity                         Classification  Current Location
  ─────────────────────────────  ──────────────  ──────────────────
  Form metadata (config tables)  Internal        West Europe
  Draft submissions              Confidential    West Europe
  Submitted form records         Confidential    West Europe
  Audit logs                     Restricted      West Europe
  Uploaded documents (CRM Notes) Confidential    West Europe

Cross-Border Transfer Risk:
  Every form submission from portal users in Qatar travels to the
  backend in Qatar North (correct), which then writes to Dataverse
  in West Europe (incorrect). Under Qatar's PDPPL (Law No. 13 of
  2016), cross-border transfer of personal data requires either
  adequate protection in the destination country or explicit
  contractual safeguards. Microsoft provides EU Standard Contractual
  Clauses in its Data Processing Agreement, but this does not
  resolve QDB's internal C-005 constraint requiring data to stay
  in the Qatar Azure region.

Resolution Steps Required (in order):
  1. QDB IT confirms whether a Qatar or UAE North Dataverse
     environment exists or can be provisioned.
  2. QDB data sovereignty team confirms the acceptable region
     (Qatar North is preferred; UAE North is the nearest with
     Dataverse support as of 2025).
  3. A new Dataverse organisation is provisioned in the correct
     region before any production data is created.
  4. All environment configurations and architecture documents are
     updated with the new org URL.
  5. Qatar PDPPL compliance assessment is performed by QDB's legal
     team regardless of the chosen Dataverse region.


6. AUDIT TRAIL VALIDATION
══════════════════════════════════════════════════════════════════

Audit Log Schema Assessment:
  The qdb_form_audit_log table design is comprehensive. Each entry
  captures: event type, form definition ID, form definition name
  (snapshot), user Azure AD OID (stable — does not change if
  display name updates), user display name (snapshot at event time),
  UTC timestamp set by the server, affected record ID, and a JSON
  diff for configuration change events. Correlation IDs in application
  logs enable reconstruction of full request traces.

Positive Findings:
  - Append-only enforced at two independent layers (application code
    never issues UPDATE/DELETE on audit tables; Dataverse security
    role excludes Delete privilege from the service principal).
  - Server-side timestamp: qdb_timestamp_utc is set by the backend
    at event time, preventing client-clock manipulation.
  - User OID is stable even if the user's display name changes.
  - Form definition name is snapshotted at event time (not a foreign
    key lookup), so the audit entry remains interpretable even if
    the form definition is later renamed.
  - Correlation IDs in pino logs allow full API-level reconstruction
    of every request.

Gaps Requiring Remediation Before Regulatory Examination:

GAP-AUDIT-1: COMPLETENESS
  FR-044 requires 9 event types: userAuthenticated, formOpened,
  draftSaved, draftResumed, draftDiscarded, formSubmitted,
  formSubmissionFailed, documentUploaded, adminConfigChanged.
  The implemented code writes audit entries for only 2 events:
  formSubmitted (CrmSubmissionService.ts line 74) and
  formSubmissionFailed (CrmSubmissionService.ts line 93).
  The remaining 7 event types have no audit writes in the backend
  routes. A QCB examiner requesting all events for a user session
  would find only submission events, not form access, drafts,
  or document uploads.
  Remediation: Add audit writes to draft routes (draftSaved,
  draftResumed, draftDiscarded), form metadata routes (formOpened),
  file routes (documentUploaded), and admin config routes
  (adminConfigChanged).

GAP-AUDIT-2: TAMPER-PROOF WEAKNESS
  The append-only guarantee is enforced at the application and
  Dataverse security role layer. However, Dataverse system
  administrators (Global Admins with Power Platform admin access)
  can bypass role restrictions using the Power Platform Admin Center
  or the Dataverse Service Client with system-level credentials.
  There is no completely external, immutable audit trail.
  Remediation: Implement daily export of qdb_form_audit_log to Azure
  Immutable Blob Storage (WORM — Write Once Read Many). This export
  becomes the legally defensible archive independent of Dataverse
  admin actions. Configure the immutability policy with a 7-year
  time-based retention lock.

GAP-AUDIT-3: SEQUENTIAL RECONSTRUCTION
  The audit log records events with record IDs but does not capture
  the submission field values (those are in the CRM entity records).
  A QCB examiner asking "what data did this customer submit?" must
  cross-reference the audit log with the submission records.
  The audit log alone is insufficient for complete reconstruction.
  This is partially acceptable (submission records exist separately)
  but the operational playbook for regulatory examination must
  document the two-table join process.

GAP-AUDIT-4: AUDIT WRITE FAILURE ALERTING
  CrmAuditService silently absorbs audit write failures (AUDIT-016).
  Gaps in the audit log during a Dataverse outage cannot be
  distinguished from "no events occurred" by a regulatory examiner.

GAP-AUDIT-5: CLOCK SYNCHRONISATION
  Azure App Service uses NTP by default but this is not explicitly
  documented or verified. The backend timestamp in audit entries
  is reliable only if NTP sync is confirmed. Add NTP verification
  to the deployment checklist.

Verdict: PARTIALLY SUFFICIENT — must address GAP-AUDIT-1
  (completeness) and GAP-AUDIT-2 (immutable export) before any
  regulatory examination scenario. Both are required before go-live.


7. SERVICE ACCOUNT REVIEW
══════════════════════════════════════════════════════════════════

──────────────────────────────────────────────────────────────────
Service Account 1: Backend API Service Principal
  Identity:       Azure AD app registration (AZURE_CLIENT_ID)
  Flow:           Client credentials → Dataverse access token
  Secret storage: Environment variable (not Key Vault — see AUDIT-014)

  Dataverse Permissions (from phase-4-crm.md security model):
    Config tables (all 10):          Read only          — CORRECT
    qdb_form_version:                 Read + Create      — CORRECT
    qdb_form_submission_log:          Create + Read      — ACCEPTABLE
    qdb_form_audit_log:               Create + Read      — CORRECT
    qdb_form_draft:                   Create+Read+Write+Delete — BROAD

  Least-Privilege Assessment:
    Config tables Read-only:          CORRECT
    Draft table CRUD:                 FUNCTIONALLY CORRECT but broad.
      If the service principal is compromised, all user draft data
      can be read, modified, or deleted. Drafts expire in 90 days
      but may contain PII during their lifetime.
    SharePoint: Sites.ReadWrite.All — OVER-PRIVILEGED.
      This grants read/write to ALL SharePoint sites in the QDB
      tenant. Must be narrowed to Sites.Selected with an explicit
      grant to the specific document library site only (AUDIT-017).

  Required Actions:
    1. Migrate AZURE_CLIENT_SECRET to Key Vault (AUDIT-014).
    2. Narrow SharePoint permission to Sites.Selected (AUDIT-017).
    3. Review whether Read on qdb_form_audit_log is required for
       the service principal or if a separate read-only account
       should serve the compliance audit viewer endpoint.

──────────────────────────────────────────────────────────────────
Service Account 2: QDB Form Engine — Configuration Author (CRM Role)
  Type:           Human accounts (CRM team members), not service accounts
  Permissions:    Full CRUD on all 10 configuration tables; Read on audit
  
  Assessment: CORRECT in scope. However, these accounts have Write
  access to qdb_form_business_rule.qdb_conditions_json and
  qdb_form_lookup_config.qdb_filter_expression, which are OData and
  JSON fragments executed server-side. A compromised CRM team account
  enables injection attacks (AUDIT-005, AUDIT-006, AUDIT-011).
  Recommendation: Implement a four-eyes change approval workflow for
  business rule and lookup filter expression records. Changes must
  require a second CRM team member to approve before activation.

──────────────────────────────────────────────────────────────────
Service Account 3: QDB Form Engine — Compliance Auditor (CRM Role)
  Permissions:    Read only on all tables
  Assessment:     CORRECT — least privilege. No remediation required.


8. CODE AUDIT — 7-PASS RESULTS
══════════════════════════════════════════════════════════════════

Pass 1 — Wiring
──────────────────────────────────────────────────────────────────

W-01 | WARNING | Confidence: 99%
File: backend/src/routes/files.routes.ts, line 23-27
  The upload handler comment states "Real implementation requires
  multer middleware" and "wiring in index.ts should add multer."
  Multer is NOT registered in index.ts. req.file is always undefined.
  The route always returns 400 NO_FILE. File upload is non-functional.
Remediation: Register multer({ storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES } }).single('file') in
  files.routes.ts before the upload handler, not in index.ts.

W-02 | WARNING | Confidence: 95%
File: frontend/src/hooks/useFormEngine.ts, line 1
  This hook imports from '../contexts/FormContext'. FormContext.tsx
  does not appear in the file listing (contexts/FormContext.tsx is
  absent from the source tree). This is an unresolved import — the
  frontend will not compile.
Remediation: Create frontend/src/contexts/FormContext.tsx with the
  FormContextValue interface and provider as described in the
  architecture section 2.1.

W-03 | INFO | Confidence: 80%
File: backend/src/routes/forms.routes.ts, lines 37-45
  GET /api/forms/:formCode/data/:recordId fetches and returns a
  Dataverse record. No callers of this endpoint are visible in the
  frontend API layer. Either it is unused or its caller is in an
  unimplemented frontend page. See also AUDIT-008 (no ownership check).
Remediation: Verify intended callers. If unused, remove to reduce
  attack surface.

Pass 2 — Error Handling
──────────────────────────────────────────────────────────────────

E-01 | WARNING | Confidence: 99%
File: backend/src/services/CrmAuditService.ts, lines 29-32
  Audit write failures are caught, logged, and silently discarded.
  No alert is fired. A failed audit write is indistinguishable from
  a successful one at the API response level. See AUDIT-016.
Remediation: Add Application Insights Critical alert emission and
  a fallback write to Azure Storage Queue for retry.

E-02 | WARNING | Confidence: 95%
File: backend/src/services/CrmDataService.ts, line 107 (inferred)
  JSON.parse(raw.qdb_form_data_json ?? '{}') — if the stored value
  is truncated (Dataverse memo column limit hit silently), JSON.parse
  throws synchronously. The error is caught by express-async-errors
  and returns a 500, but the corrupt payload is not logged for
  forensic investigation.
Remediation: Wrap in a labelled try-catch that logs:
  { correlationId, draftId, payloadSample: raw?.slice(0, 200) }.
  Return a specific error code (DRAFT_CORRUPT) to the frontend.

E-03 | WARNING | Confidence: 90%
File: backend/src/services/CrmSubmissionService.ts, lines 87-90
  The rollback loop calls deleteRecord() with .catch() that logs
  but continues. If multiple rollback deletes fail, all failures
  are logged but the audit entry at lines 93-103 does not include
  the orphaned record IDs that could not be deleted.
Remediation: Collect rollback failure details into an array and
  include orphaned record IDs in the audit changedData field.

E-04 | WARNING | Confidence: 88%
File: frontend/src/auth/tokenService.ts, lines 15-17
  If pca.getAllAccounts().length === 0, loginPopup is called and
  then acquireBearerToken recurses. If loginPopup fails or is
  cancelled, the recursion throws an untyped exception. There is no
  user-facing notification that authentication failed.
Remediation: Add a catch on loginPopup that throws a typed
  AuthenticationError displayable as a "session expired" message.

Pass 3 — Completeness
──────────────────────────────────────────────────────────────────

C-01 | CRITICAL | Confidence: 99%
File: backend/src/routes/files.routes.ts, lines 62-70
  "Temporary: store file reference (real implementation uploads to
  CRM Notes or SharePoint)" — the upload route returns a stub
  response. No file is written to any storage. File upload is
  completely non-functional. FR-031 through FR-035 are unmet.
Remediation: Implement CrmFileService.uploadToCrmNotes() using the
  Dataverse annotation entity (POST /annotations with base64 content).
  Must be complete before UAT.

C-02 | WARNING | Confidence: 97%
File: frontend/src/hooks/useFormEngine.ts
  The hook references FormContext which does not exist. The full
  form rendering component tree (DynamicFormRenderer, TabRenderer,
  SectionRenderer, FieldRenderer, and the 17 field controls) exists
  as files but the context layer binding them together is missing.
Remediation: Implement FormContext.tsx with FormContextValue,
  useFormContext hook, and FormProvider.

C-03 | WARNING | Confidence: 95%
File: backend/src/routes/forms.routes.ts, lines 111-131
  The /validate endpoint only checks required rules. It does not
  validate minLength, maxLength, email format, regex, date
  comparisons, or cross-field rules. The architecture states the
  backend runs the full ValidationEngine on submit. The submit
  handler (line 79) calls submissionService.submitForm() directly
  without first calling the full validation engine.
Remediation: Wire ValidationEngine.validateForm() into the submit
  handler (not just the separate /validate endpoint) against the
  full field metadata rules before calling submissionService.

C-04 | WARNING | Confidence: 99%
File: backend/src/services/CrmMetadataService.ts, line 193
  businessRules: [] — business rules are always an empty array.
  fetchBusinessRules() is never called. The metadata API returns
  form definitions with no conditional logic. The rule engine
  (client-side) and the server-side BR-002 enforcement both have
  no rules to evaluate. All conditional form behaviour is broken.
Remediation: Implement fetchBusinessRules(fieldIds) analogous to
  fetchValidationRules() and map results at line 193.

C-05 | WARNING | Confidence: 85%
File: backend/src/services/CrmSubmissionService.ts, line 68
  The Power Automate trigger calls:
    /workflows(${flowId})/Microsoft.Dynamics.CRM.ExecuteWorkflow
  This is the Dynamics CRM on-premise workflow execution API.
  For Dataverse Online / Power Automate cloud flows, the correct
  trigger is a Dataverse native trigger field (setting a field value
  that the flow listens to). This implementation will fail silently
  (fire-and-forget) in the cloud environment.
Remediation: Confirm with QDB CRM team whether flows use on-premise
  workflow GUIDs or cloud flow trigger fields. Implement correctly.

Pass 4 — Dead Code
──────────────────────────────────────────────────────────────────

D-01 | PRUNE | Confidence: 92%
File: backend/src/services/CrmBaseService.ts, lines 62-75
  buildSelect(), buildFilter(), buildOrderBy(), buildTop() helper
  methods are defined but never called by any service. All query
  construction uses direct string interpolation. These are dead code.
Remediation: Remove dead helpers. Reintroduce as a proper query
  builder when SEC-04/AUDIT-005 OData injection is remediated.

D-02 | INFO | Confidence: 80%
File: backend/src/services/CrmMetadataService.ts, lines 312-320
  mapVersion() is called only from getFormVersions(), which is only
  called from the versions route. No role guard is applied on the
  versions route in index.ts (no roleMiddleware registered).
Remediation: Add admin-only guard to the versions route. Verify
  whether form version history should be accessible to portal users.

Pass 5 — Bloat
──────────────────────────────────────────────────────────────────

B-01 | INFO | Confidence: 90%
File: backend/src/services/CrmMetadataService.ts, lines 1-441
  File is 441 lines including raw Dataverse type interface definitions
  (RawFormDefinition, RawTab, RawSection, etc.) inline with the
  service class. Exceeds the 400-line guideline.
Remediation: Extract RawXxx interfaces to
  backend/src/types/dataverseRaw.ts.

Pass 6 — Hardcoding
──────────────────────────────────────────────────────────────────

H-01 | WARNING | Confidence: 85%
File: backend/src/services/CrmBaseService.ts, lines 6-7
  MAX_RETRIES = 3 and BASE_DELAY_MS = 200 are hardcoded constants.
  The architecture specifies these should be configurable. Changing
  them under Dataverse throttle pressure requires a code deployment.
Remediation: Move to appConfig.ts as DATAVERSE_MAX_RETRIES and
  DATAVERSE_BASE_DELAY_MS with defaults of 3 and 200.

H-02 | WARNING | Confidence: 80%
File: backend/src/services/CrmAuthService.ts, line 6
  TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000 hardcoded constant.
Remediation: Move to appConfig.ts as TOKEN_EXPIRY_BUFFER_MINUTES.

H-03 | INFO | Confidence: 88%
File: backend/src/routes/files.routes.ts, line 16
  MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024 hardcoded. The per-field
  limit from DocumentUploadConfig metadata is not applied post-multer.
Remediation: After multer parses the file, look up the field's
  maxFileSizeMb from DocumentUploadConfig and apply it. The 25MB
  is the hard ceiling; field config is the soft ceiling.

Pass 7 — Security
──────────────────────────────────────────────────────────────────

S-01 | CRITICAL | Confidence: 99%
File: backend/src/index.ts, line 42
  cors({ origin: process.env.CORS_ORIGIN ?? '*' }) — wildcard
  CORS when env var is absent. See AUDIT-003.

S-02 | CRITICAL | Confidence: 95%
File: backend/src/services/CrmMetadataService.ts, lines 59, 93, 122, 155
  Direct string interpolation of formCode and GUIDs into OData
  $filter strings without sanitisation. See AUDIT-005.

S-03 | HIGH | Confidence: 97%
File: backend/src/routes/lookups.routes.ts, lines 7-13
  The 'filter' query parameter is accepted from callers and passed
  directly to CrmLookupService. See AUDIT-006.

S-04 | HIGH | Confidence: 95%
File: frontend/src/components/forms/controls/RichTextControl.tsx, line 84
  dangerouslySetInnerHTML={{ __html: rawValue }} renders user-
  submitted HTML from Dataverse without DOMPurify sanitisation.
  See AUDIT-007.

S-05 | HIGH | Confidence: 90%
File: frontend/src/engine/ValidationEngine.ts, lines 173, 291
  new RegExp(rule.regexPattern) from Dataverse metadata — ReDoS risk.
  See AUDIT-011.

S-06 | WARNING | Confidence: 99%
File: backend/src/services/CrmAuthService.ts, lines 13-16
  ClientSecretCredential with client secret from env var, not Key
  Vault. See AUDIT-014.

S-07 | WARNING | Confidence: 92%
File: backend/src/services/CrmSubmissionService.ts, line 100
  String(error) may include raw Dataverse error bodies with PII.
  Written to audit log. See AUDIT-013.

S-08 | WARNING | Confidence: 99%
File: backend/src/config/env.ts, lines 7-23
  CORS_ORIGIN absent from Zod env schema. Application starts in
  production without it, defaulting to wildcard. See AUDIT-003.

S-09 | INFO | Confidence: 82%
File: backend/src/utils/correlation.ts (inferred)
  x-correlation-id header from incoming requests is trusted without
  length validation. A very long header value is logged in every log
  entry for that request, potentially enabling log injection.
Remediation: Truncate or reject x-correlation-id values longer than
  64 characters. If invalid format, generate a new UUID.


9. RECOMMENDED SECURITY CONTROLS
══════════════════════════════════════════════════════════════════

Priority 1 — Add Before UAT

SC-01: Content Security Policy (CSP) on the SPA nginx host.
  nginx.conf is missing a CSP header. Minimum policy:
    default-src 'self';
    script-src 'self';
    connect-src 'self' https://login.microsoftonline.com;
    style-src 'self' 'unsafe-inline';
    img-src 'self' data:;
    frame-src 'none';
    object-src 'none';
  Add to nginx.conf security headers block.

SC-02: Automated dependency vulnerability scanning.
  Add Dependabot (GitHub native) to the repository to automatically
  raise PRs for dependency updates with known CVEs. Configure to
  block builds on Critical and High CVEs in the CI pipeline.

SC-03: Dataverse native auditing enabled on all 12 custom tables.
  Enable auditing in the Dataverse environment settings, then enable
  field-level auditing on qdb_form_audit_log, qdb_form_draft, and
  qdb_form_submission_mapping. This provides a platform-level change
  history that cannot be bypassed by application-layer controls.

Priority 2 — Add Before Production

SC-04: Azure Monitor alerting with defined thresholds.
  Configure alerts for:
  - Audit write failures (Critical — see AUDIT-016)
  - Submission error rate > 5% over 5 minutes
  - CORS policy violations (403 on cross-origin requests)
  - Multiple failed JWT validations from same IP (brute force signal)
  - Dataverse circuit breaker open event

SC-05: Azure Immutable Blob Storage export of audit logs.
  Daily export of qdb_form_audit_log to an Azure Storage account
  with immutability policy (WORM, 7-year time-based retention lock).
  This is the legally defensible archive for QCB examination.

SC-06: Azure AD Conditional Access policies.
  - Require MFA for form submission operations.
  - Block access from non-compliant devices (if Intune is available).
  - Enable sign-in risk policy to block high-risk sign-ins.

SC-07: Four-eyes approval workflow for CRM configuration changes.
  Any modification to qdb_form_business_rule or qdb_form_lookup_config
  must require a second CRM team member to approve before activation.
  Implement using Dataverse approval processes or Power Automate
  approval flow.

SC-08: Software Bill of Materials (SBOM) in CI pipeline.
  Generate an SBOM using npm sbom or Syft in the GitHub Actions
  pipeline and archive it with each production deployment tag for
  supply chain audit purposes.

SC-09: Subresource Integrity (SRI) for any CDN-loaded assets.
  If any assets are loaded from CDN (fonts, icons), add SRI hashes
  to the HTML. Currently no CDN assets are identified, but this must
  be verified when font assets are reviewed.

SC-10: SHA-256 document hash on file upload.
  Compute and store SHA-256 of uploaded file bytes in the submission
  record and as a CRM Note annotation attribute for FATF KYC
  document integrity proof.


10. GOVERNANCE GAPS — RANKED BY PRIORITY
══════════════════════════════════════════════════════════════════

Rank  Ref        Severity  Description
──────────────────────────────────────────────────────────────────

1     AUDIT-001  CRITICAL  Data residency violation. Dataverse in West Europe.
                           Risk: C-005 breach, QCB non-compliance, PDPPL violation.
                           Remediation: Provision Qatar/UAE-North Dataverse org.

2     AUDIT-004  CRITICAL  Form-level RBAC (roleMiddleware) not wired in index.ts.
                           Risk: Any authenticated user accesses any form.
                           Remediation: Register roleMiddleware on /api/forms routes.

3     AUDIT-003  CRITICAL  CORS wildcard default when CORS_ORIGIN absent.
                           Risk: Cross-origin API access from any domain.
                           Remediation: Add CORS_ORIGIN as required Zod field.

4     AUDIT-002  CRITICAL  No virus scan — file bytes never inspected.
                           Risk: Malware in QDB CRM environment.
                           Remediation: Integrate Defender for Storage; use file-type
                           npm package for magic bytes MIME detection.

5     AUDIT-005  HIGH      OData injection in metadata queries.
                           Risk: Data disclosure across form boundaries.
                           Remediation: Validate formCode regex; parameterised filter builder.

6     AUDIT-006  HIGH      Caller-controlled OData filter in lookup API.
                           Risk: OData injection by authenticated portal users.
                           Remediation: Remove filter query param; entity allowlist.

7     AUDIT-007  HIGH      inputSanitiser.ts not implemented; stored XSS vectors.
                           Risk: Stored XSS in CRM and portal readonly views.
                           Remediation: Implement middleware; DOMPurify on rich text.

8     AUDIT-008  HIGH      IDOR on record fetch endpoint — no ownership check.
                           Risk: Any user reads any other user's submission data.
                           Remediation: Ownership check before returning record.

9     AUDIT-009  HIGH      ADR-007 tenant assumption unconfirmed.
                           Risk: Auth layer rebuilt mid-Sprint on wrong assumption.
                           Remediation: Written confirmation from QDB sponsor.

10    AUDIT-010  HIGH      Arbitrary entity name in lookup API.
                           Risk: Authenticated users query any Dataverse entity.
                           Remediation: Resolve entity from server-side config only.

11    C-01 (Code) HIGH     File upload non-functional — stub only, no storage write.
                           Risk: FR-031–FR-035 cannot be tested in UAT.
                           Remediation: Implement CrmFileService with CRM Notes upload.

12    C-04 (Code) HIGH     Business rules never fetched from Dataverse (always []).
                           Risk: All conditional form logic is broken; rule engine
                           produces no output; BR-002 not enforced server-side.
                           Remediation: Implement fetchBusinessRules() in CrmMetadataService.

13    GAP-AUDIT-1 MEDIUM   Audit log completeness — 7 of 9 event types unimplemented.
                           Risk: QCB examination finds gaps in audit trail.
                           Remediation: Add audit writes to draft, file, and admin routes.

14    GAP-AUDIT-2 MEDIUM   No immutable archive export of audit logs.
                           Risk: Dataverse sysadmin can tamper with audit records.
                           Remediation: Daily export to Azure WORM storage.

15    AUDIT-014  MEDIUM    Key Vault integration not implemented — secret in env var.
                           Risk: Client secret exposure on mis-deployment.
                           Remediation: Implement DefaultAzureCredential + Key Vault.

16    AUDIT-016  MEDIUM    Audit write failures silently absorbed.
                           Risk: Submissions without audit trails during outages.
                           Remediation: Critical alert + fallback queue.

17    AUDIT-015  MEDIUM    Rate limiting not implemented.
                           Risk: Lookup flooding threatens Dataverse throttle limits.
                           Remediation: express-rate-limit with per-user keys.

18    AUDIT-017  MEDIUM    SharePoint Sites.ReadWrite.All — over-privileged.
                           Risk: All SharePoint sites exposed on principal compromise.
                           Remediation: Sites.Selected with explicit site grant.

19    AUDIT-013  MEDIUM    PII in audit log (raw Dataverse error body).
                           Risk: FR-045 violation; PII visible to audit team.
                           Remediation: Sanitised error summary only.

20    AUDIT-011  HIGH      ReDoS via metadata-sourced regex patterns.
                           Risk: Browser DoS on portal users.
                           Remediation: safe-regex validation before RegExp construction.


11. GO-LIVE CLEARANCE
══════════════════════════════════════════════════════════════════

Status: NOT CLEARED

The following ten conditions must all be met and verified by the
Auditor before a UAT go-live decision is made by the CEO. Each
is an independently blocking condition.

─────────────────────────────────────────────────────────────────
BLOCKER-1 (AUDIT-001 / GAP-01 — DATA RESIDENCY)
  Written confirmation from QDB IT that the Dataverse environment
  is in Qatar North or UAE North Azure region, or that such an
  environment will be provisioned before any production data is
  created. No submission records, drafts, audit logs, or PII may
  be written to an org in West Europe.

BLOCKER-2 (AUDIT-002 — VIRUS SCAN)
  Either: (a) virus scanning is implemented before UAT using the
  file-type npm package for MIME detection and Defender for Storage
  on the target destination, OR (b) written acceptance from QDB
  Security confirming the no-op AV scan is acceptable for UAT
  with a committed Phase 2 implementation date filed in the project
  risk register.

BLOCKER-3 (AUDIT-003 — CORS WILDCARD)
  CORS_ORIGIN added to Zod env schema as a required production
  field. The wildcard fallback removed from index.ts line 42.
  Confirmed set in all deployment environment configurations
  (App Service settings and GitHub Actions secrets).

BLOCKER-4 (AUDIT-004 — FORM-LEVEL RBAC)
  roleMiddleware implemented and registered on the /api/forms router.
  Any form with a non-null qdb_access_group_id must be inaccessible
  to users not in that group. The AD group overage claim flow must
  be implemented. FR-038 and FR-039 are functionally verified by QA.

BLOCKER-5 (AUDIT-007 — STORED XSS)
  inputSanitiser.ts middleware implemented and registered on all
  POST/PATCH routes before controllers. DOMPurify sanitisation
  applied to rawValue in RichTextControl.tsx line 84 before
  dangerouslySetInnerHTML render.

BLOCKER-6 (AUDIT-005 + AUDIT-006 — ODATA INJECTION)
  formCode validated against /^[a-z0-9\-]{1,100}$/ in forms.routes.ts
  before any service call. Caller-controlled 'filter' query parameter
  removed from the lookup API. OData single-quote escaping applied
  to all interpolated values.

BLOCKER-7 (AUDIT-008 — IDOR)
  Ownership check added to GET /api/forms/:formCode/data/:recordId
  before returning the record. Request rejected with 403 if the
  record's submitter attribute does not match req.user.oid.

BLOCKER-8 (AUDIT-009 — ADR-007 TENANT)
  Written confirmation from QDB project sponsor that all portal
  users (bank customers) are in the QDB corporate Azure AD tenant.
  Or: architecture revised to Entra External ID if they are not.
  Sprint 1 must not start without this confirmation.

BLOCKER-9 (C-01 Code / W-01 Code — FILE UPLOAD NON-FUNCTIONAL)
  File upload route functional end-to-end: multer registered in
  files.routes.ts, CrmFileService CRM Notes upload implemented,
  magic bytes MIME type detection active, field-level size limit
  applied post-multer.

BLOCKER-10 (C-04 Code — BUSINESS RULES NEVER FETCHED)
  fetchBusinessRules(fieldIds) implemented in CrmMetadataService
  and results mapped at line 193 (businessRules: [] removed).
  Rule engine produces correct output for real form definitions.
  BR-002 hidden field clearing enforced server-side on submission.
─────────────────────────────────────────────────────────────────

Conditions Required Before Production (not UAT blockers, but must
be met before any production customer data is accepted):

PROD-1 (AUDIT-010): Lookup entity name resolved from server-side
  config only. Remove entityName as a caller-supplied path parameter.

PROD-2 (GAP-AUDIT-1): All 9 audit event types implemented —
  formOpened, draftSaved, draftResumed, draftDiscarded,
  documentUploaded, adminConfigChanged added to backend routes.

PROD-3 (GAP-AUDIT-2): Daily audit log export to Azure Immutable
  Blob Storage (WORM) with 7-year retention lock configured.

PROD-4 (AUDIT-014): Key Vault integration implemented.
  AZURE_CLIENT_SECRET removed from App Service settings.

PROD-5 (AUDIT-016): Audit write failure Critical alert and fallback
  queue implemented.

PROD-6 (AUDIT-015): Rate limiting (express-rate-limit) implemented
  with per-user keys on submit, lookup, and file upload routes.

PROD-7 (AUDIT-017): SharePoint permission narrowed from
  Sites.ReadWrite.All to Sites.Selected.

PROD-8 (C-05 Code): Power Automate trigger mechanism confirmed with
  QDB CRM team and implemented using the correct cloud flow pattern.

PROD-9 (SC-05 Recommended): Azure Monitor alerting configured with
  all thresholds defined in the architecture section 17.

──────────────────────────────────────────────────────────────────
Auditor: Maqsad AI — Auditor and Governance Specialist
Date:    2026-05-08
Version: 1.1 (Final)
═══════════════════════════════════════════════════════════════════
END OF AUDIT REPORT
═══════════════════════════════════════════════════════════════════
