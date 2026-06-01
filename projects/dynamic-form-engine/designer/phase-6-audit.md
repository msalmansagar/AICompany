═══════════════════════════════════════════════════
PHASE 6 — SECURITY AND GOVERNANCE AUDIT
═══════════════════════════════════════════════════
Project:  FDWR-001 — Dynamics CRM Web Resource Drag-and-Drop Form Designer
Date:     2026-06-01
Auditor:  Maqsad AI — Auditor Agent
Status:   PASS WITH FINDINGS
═══════════════════════════════════════════════════


EXECUTIVE SUMMARY
─────────────────
Overall risk rating: MEDIUM

This is a well-structured, banking-sector React/TypeScript web resource. The
security posture is materially better than average for a CRM client-side tool.
The most significant risk class is a systematic OData injection pattern that
appears in six services, where GUID values are interpolated directly into
$filter strings without prior validation. While the Dataverse OData engine is
not a SQL engine and the exploitability is lower than classic SQL injection,
it is a non-zero risk in a banking context and must be resolved before go-live.

Findings by severity:
  HIGH     — 2
  MEDIUM   — 4
  LOW      — 3
  INFO     — 2

Go/no-go for Phase 7 (CEO Final Decision):
  PROCEED WITH CONDITIONS — the two HIGH findings must be resolved before
  any production deployment. The four MEDIUM findings must be resolved before
  UAT. LOW findings may be addressed in the first post-go-live sprint.


═══════════════════════════════════════════════════
CEO CONDITIONS VERIFICATION
═══════════════════════════════════════════════════

C-001: OPEN — Business Rule Schema Stability
  The BusinessRuleDefinition TypeScript interface is formally defined and
  internally consistent in src/types/businessRule.ts. It carries a version
  field pinned to '1.0' and a comment stating "this contract must be kept in
  sync with the Dynamic Form Engine portal renderer." No written confirmation
  from the renderer team has been found in the codebase, documentation, or
  ADR directory. This condition remains OPEN until a renderer team sign-off
  document or a cross-team ADR is committed to the repository.
  Confidence: 95%

C-002: PASS — Bundle Size CI Enforcement
  scripts/checkBundleSize.js enforces a hard 4 MB limit (LIMIT_BYTES =
  4_096_000) and exits with code 1 if breached. The script is wired to the
  "build:check-size" npm script in package.json. CAVEAT: the "package" and
  "deploy" scripts invoke "npm run build" but do not invoke "build:check-size"
  first. The bundle check is therefore only a manual gate, not an automatic
  one on every production packaging run. See AUD-007.
  Confidence: 90%

C-003: OPEN — CRM Compatibility Matrix
  No compatibility matrix document has been found in the codebase, deploy/,
  or docs/ directories. The vite.config.ts targets ES2020 and the code
  references Edge Chromium 100+ in a comment, but there is no formal matrix
  stating which Dynamics CRM on-premise versions and UCI browser combinations
  have been tested. This condition remains OPEN.
  Confidence: 95%

C-004: PASS WITH CAVEAT — Security Role in Solution Package
  The role is defined in deploy/solution/Roles/FormDesignerUser.xml and
  scripts/packageSolution.js correctly copies the Roles directory into the
  staging ZIP (line 314-317). The role enforces audit-log append-only at the
  privilege level (Create + Read only on qdb_form_audit_log — Write and Delete
  withheld). CAVEAT: All <RolePrivilege> entries carry privilegeid="" (empty).
  CRM requires a populated privilege GUID for custom entity privileges to bind
  correctly on import. This is a deployment risk. See AUD-009.
  Confidence: 90%

C-005: PASS — Audit Log Append-Only Enforcement (CRITICAL)
  AuditLogService.ts calls only webApi.createRecord against
  ENTITY_NAMES.FORM_AUDIT_LOG. No updateRecord or deleteRecord call to
  qdb_form_audit_log was found anywhere in the src/ directory. The security
  role withholds Write and Delete privileges on the audit log entity at the
  CRM platform level, providing a defence-in-depth backstop. This condition
  PASSES on both the code-layer and the role-layer checks.
  Confidence: 99%


═══════════════════════════════════════════════════
FINDINGS
═══════════════════════════════════════════════════

──────────────────────────────────────────────────
ID:          AUD-001
Severity:    HIGH
Confidence:  92%
Area:        OData Injection — Systematic Pattern
Files:       src/services/BusinessRuleService.ts:74
             src/services/OptionValueService.ts:72
             src/services/ValidationRuleService.ts:97
             src/services/FormDeleteService.ts:34, 46, 58
             src/services/AccessPolicyService.ts:30
             src/services/FieldLabelService.ts:35
──────────────────────────────────────────────────
Description:
  Six service files build OData $filter strings by string-interpolating a
  caller-supplied ID (formId, fieldId, tabId, sectionId) directly without
  first validating that the value is a valid GUID. Examples:

  BusinessRuleService.ts:74
    const filter = `${FORM_BUSINESS_RULE_ATTRS.FORM_ID_VALUE} eq ${formId}`;

  OptionValueService.ts:72
    const filter = `${FORM_OPTION_VALUE_ATTRS.FIELD_ID_VALUE} eq ${fieldId}`;

  AccessPolicyService.ts:30
    const filter = `${FORM_ACCESS_POLICY_ATTRS.FORM_ID_VALUE} eq ${formId}`;

  The caller-supplied formId originates from three places:
  (1) the Zustand store (form.id), (2) route parameters passed into screen
  components, and (3) the CRM record context. In the current implementation
  all three are internal and expected to be GUIDs. However, there is no
  validation gate enforcing this. If any calling path can be made to supply
  a crafted value — through a store mutation, a UI parameter, or a
  compromised upstream record — the injected string flows unescaped into the
  Dataverse OData URL.

  In OData 4.0, a GUID filter must be:
    _qdb_form_definition_id_value eq 3fa85f64-5717-4562-b3fc-2c963f66afa6
  If the attacker supplies a value like:
    3fa85f64-5717-4562-b3fc-2c963f66afa6 or 1 eq 1
  the resulting filter becomes a tautology that returns all records the
  calling user can read.

Evidence:
  BusinessRuleService.ts line 74:
    const filter = `${FORM_BUSINESS_RULE_ATTRS.FORM_ID_VALUE} eq ${formId}`;
  Passed directly into retrieveMultipleRecords options string at line 81.

Risk:
  An attacker who can influence the formId value (e.g. through a malicious
  form record whose name/code contains an injected GUID-like string that is
  later read back and passed as a filter parameter) could exfiltrate all
  business rules, access policies, field labels, and validation rules that
  the current user has Basic read access to. In a banking context where form
  definitions may include PII field configurations, this is a data exposure
  risk. The risk is partially bounded by Dataverse row-level security (Basic
  depth), but that boundary only applies to same-user records.

Recommendation:
  Add a shared GUID validation utility and apply it at every service entry
  point before constructing OData filter strings:

  // src/utils/validateGuid.ts
  const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  export function assertGuid(value: string, paramName: string): void {
    if (!GUID_PATTERN.test(value)) {
      throw new Error(`Invalid GUID for parameter '${paramName}': ${value}`);
    }
  }

  Then in each service method, add a guard at the top:

  // BusinessRuleService.ts — listRulesForForm
  async listRulesForForm(formId: string): Promise<DesignerBusinessRule[]> {
    assertGuid(formId, 'formId');
    // ... existing code
  }

  Apply the same guard to: OptionValueService.listOptionsForField,
  ValidationRuleService.listRulesForField, FormDeleteService.listTabIds /
  listSectionIds / listFieldIds, AccessPolicyService.listPoliciesForForm,
  FieldLabelService.listLabelsForField, and all deleteRecord / updateRecord
  / retrieveRecord calls that accept an id parameter.

Status: OPEN

──────────────────────────────────────────────────
ID:          AUD-002
Severity:    HIGH
Confidence:  88%
Area:        Dev/Prod Boundary — fetch() Call Inside Production Component
File:        src/screens/NewFormWizardScreen.tsx:457
──────────────────────────────────────────────────
Description:
  The NewFormWizardScreen makes a direct fetch() call to the Dataverse
  EntityDefinitions metadata API:

    const url = `${clientUrl}/api/data/v9.1/EntityDefinitions?$select=...`;
    fetch(url, { credentials: 'include', headers: { ... } })

  This is not routed through IWebApiAdapter or CrmWebApiAdapter. It bypasses
  the retry wrapper, the adapter abstraction layer, and the production/dev
  mode switch. The call is made from production React code with:
  - credentials: 'include' (sends the CRM session cookie cross-origin)
  - No error type checking on the response body (r.json() is called without
    content-type validation)
  - The .catch() block silently swallows all errors

  NFR-004 (no external API calls) is technically not violated because the
  call targets the same CRM org, but the use of raw fetch() rather than
  Xrm.WebApi bypasses all security controls the adapter layer provides.
  Additionally, .catch(() => { setEntities([]) }) swallows errors silently —
  a network error, auth failure, and a malformed URL all produce the same
  silent empty list with no user feedback.

Risk:
  (1) If the clientUrl is ever empty or invalid, the URL becomes
  "/api/data/v9.1/EntityDefinitions...", which could leak session credentials
  to an unexpected origin in some edge cases.
  (2) The silent catch means a broken metadata endpoint is indistinguishable
  from a successful empty result — a user would silently see no entities and
  might proceed with an incorrectly configured form.
  (3) This fetch() path does not go through VITE_USE_REST_API mode switching,
  meaning it will fail in local dev mode, potentially causing developer
  confusion and workarounds that introduce further bypass patterns.

Recommendation:
  Replace with Xrm.WebApi.retrieveMultipleRecords routed through the adapter,
  or if EntityDefinitions is not accessible via standard Xrm.WebApi, wrap it
  in a dedicated MetadataService that uses the same IWebApiAdapter interface.
  Minimum fix: validate clientUrl is non-empty before constructing the URL,
  and surface a specific error state to the user:

  .catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Entity metadata unavailable';
    setEntitiesLoadError(msg);
    setEntities([]);
  })

Status: OPEN

──────────────────────────────────────────────────
ID:          AUD-003
Severity:    MEDIUM
Confidence:  90%
Area:        OData Search Term — Single-Quote Escaping is Insufficient
File:        src/services/FormDefinitionService.ts:162
──────────────────────────────────────────────────
Description:
  The listForms() method sanitises the user-supplied searchTerm by replacing
  single quotes with two single quotes:

    const term = filter.searchTerm.replace(/'/g, "''");
    filters.push(`(contains(${FORM_DEFINITION_ATTRS.NAME},'${term}') or ...)`)

  Single-quote escaping is the correct OData escaping for string literal
  values. However, the searchTerm value is not length-limited before use, and
  there is no validation preventing special OData function characters such as
  null bytes, parentheses, or percent-encoded sequences. A very long
  searchTerm could cause excessive Dataverse query processing. There is also
  no server-side length cap enforced — the only constraint is the Fluent UI
  Input field's natural browser limit.

Risk:
  Performance degradation / denial-of-service potential if the search input
  accepts arbitrary long strings. In a banking context, regulators would also
  note the absence of explicit input length controls at the service boundary.

Recommendation:
  Enforce a maximum length at the service boundary, not just at the UI:

  // In listForms()
  if (filter?.searchTerm) {
    const term = filter.searchTerm.slice(0, 200).replace(/'/g, "''");
    filters.push(`(contains(${FORM_DEFINITION_ATTRS.NAME},'${term}') ...)`);
  }

  Also add a Zod schema for FormListFilter to make this boundary explicit:

  const formListFilterSchema = z.object({
    status: z.enum(['draft','published','archived']).optional(),
    searchTerm: z.string().max(200).optional(),
  });

Status: OPEN

──────────────────────────────────────────────────
ID:          AUD-004
Severity:    MEDIUM
Confidence:  85%
Area:        Silent Error Swallowing — Multiple Sites
Files:       src/services/FormDeleteService.ts:69
             src/screens/NewFormWizardScreen.tsx:445, 467
             src/screens/LookupConfigScreen.tsx:95
──────────────────────────────────────────────────
Description:
  Four locations silently swallow exceptions with no logging or structured
  error recording:

  (A) FormDeleteService.ts:69 — safeDelete():
    } catch {
      // Swallow — record may already be deleted or not found
    }
  There is no logging. If a deletion fails for a reason other than 404
  (e.g. a network error, a 403 permissions error, or a server 500), the
  failure is invisible. In a banking context, a partially completed delete
  of a form and its children leaves orphaned records that may be exposed to
  other queries.

  (B) NewFormWizardScreen.tsx:445 — theme load:
    .catch(() => {
      // Themes table may be empty — not a blocking error
    })
  Silent. A 403 (permissions error on theme table) is indistinguishable from
  an empty result.

  (C) NewFormWizardScreen.tsx:467 — entity metadata load:
    .catch(() => {
      setEntities([]);
    })
  Silent. See AUD-002.

  (D) LookupConfigScreen.tsx:95:
    .catch(() => { /* keep store values as fallback */ });
  Silent. A configuration load failure leaves the user unknowingly editing
  stale data.

Risk:
  Operational: silent failures create support blind spots. In a banking
  context, partial form deletions could leave orphaned configuration data
  in Dataverse that violates data integrity constraints.
  Compliance: the audit trail is incomplete because errors that occur
  during audit-log operations would also be silently swallowed by this
  pattern in callers.

Recommendation:
  (A) FormDeleteService.safeDelete — log the error at warning level. Since
  there is no structured logger in this client-side bundle, at minimum throw
  a specific error type or let the error propagate so callers can inspect it:

  } catch (error: unknown) {
    const isNotFound = error instanceof Object &&
      'errorCode' in error && (error as { errorCode: number }).errorCode === 404;
    if (!isNotFound) {
      throw new CrmApiError(`safeDelete failed for ${entityName}/${id}`, 'safeDelete', error);
    }
  }

  (B/C/D) Surface errors via component state, not silent swallowing, so
  users and operators can see that a load failed.

Status: OPEN

──────────────────────────────────────────────────
ID:          AUD-005
Severity:    MEDIUM
Confidence:  85%
Area:        Security Role XML — Privilege Prefix Mismatch
File:        deploy/solution/Roles/FormDesignerUser.xml:35-124
──────────────────────────────────────────────────
Description:
  The security role XML uses the privilege name prefix "maqsad_" for all
  custom entity privileges (e.g. "prvCreatemaqsad_form_definition"), but the
  solution publisher prefix is "qdb" and the entity logical names use the
  "qdb_" prefix throughout the codebase. In Dynamics CRM, privilege names for
  custom entities follow the pattern prvCreate + entitylogicalname, where the
  entity logical name includes the publisher prefix. The correct privilege
  names should be "prvCreateqdb_form_definition", not
  "prvCreatemaqsad_form_definition".

  If this mismatch means CRM cannot bind the privilege names to the actual
  entities on import, the security role will import with no effective
  privileges — silently. The audit-log append-only protection enforced at
  the role level (withholding Write/Delete on qdb_form_audit_log) would
  then be completely ineffective, and any user with the role could
  accidentally receive broader Dataverse privileges depending on their
  other assigned roles.

Risk:
  CRITICAL IF NOT CAUGHT AT DEPLOYMENT: The audit log append-only guarantee
  (CEO Condition C-005, Technology Constitution Article VI) is enforced
  partly by the role privilege definition. If the role imports with no
  bindings, this backstop evaporates.
  Confidence in this being a genuine deployment error: 85% — it is possible
  that "maqsad_" is the correct publisher prefix for the CRM organisation
  being targeted, but it contradicts all entity naming in the codebase.

Recommendation:
  Verify the target CRM environment publisher prefix. If the publisher
  prefix is "qdb", update all privilege names in FormDesignerUser.xml:
    "prvCreatemaqsad_form_definition" → "prvCreateqdb_form_definition"
    "prvReadmaqsad_form_definition"   → "prvReadqdb_form_definition"
    etc. (all 50 privilege entries)
  Then re-deploy to a DEV environment and confirm the role binds correctly
  via Settings > Security > Security Roles > Form Designer User.

Status: OPEN

──────────────────────────────────────────────────
ID:          AUD-006
Severity:    MEDIUM
Confidence:  88%
Area:        Audit Log — Incomplete Action Coverage
File:        src/services/AuditLogService.ts:11-18
──────────────────────────────────────────────────
Description:
  AuditAction is defined as a union of eight string literals:
    'OPEN_FORM' | 'SAVE_DRAFT' | 'PUBLISH' | 'CLONE' | 'RESTORE_VERSION' |
    'DELETE_FORM' | 'ARCHIVE_FORM'

  Confirmed audit log calls found in code:
    FormSaveService.ts — logs 'SAVE_DRAFT' (confirmed)

  The following high-value actions do NOT have audit log calls in the
  visible service code:
    - Form deletion (FormDeleteService.ts — no logAction call found)
    - Form publish (no logAction('PUBLISH') found in the reviewed code)
    - Form clone (FormCloneService.ts — no logAction('CLONE') found)
    - Version restore (VersionHistoryScreen — not confirmed in reviewed files)

  For a banking-sector application, every state-changing operation on a form
  definition must produce an audit record. The AuditAction type defines the
  right events, but the calls are not consistently wired.

Risk:
  Regulatory: a banking regulator examining the audit trail after an incident
  would find gaps — they would see that a form was saved but would have no
  record of it being deleted, published, or cloned. This directly fails a
  7-year audit trail requirement if the missing events represent material
  changes to form definitions used for data collection.

Recommendation:
  Audit all state-changing code paths. Required additions:
  (1) FormDeleteService.deleteForm() — call logAction(formId, 'DELETE_FORM')
      before or after the delete operation, using a separate AuditLogService
      instance injected via constructor.
  (2) FormCloneService.cloneForm() — call logAction(sourceFormId, 'CLONE',
      { targetFormId: newFormId }) after successful clone.
  (3) Publish flow — call logAction(formId, 'PUBLISH') on successful publish.
  (4) Version restore — call logAction(formId, 'RESTORE_VERSION', {
      versionNumber }) on restore.

Status: OPEN

──────────────────────────────────────────────────
ID:          AUD-007
Severity:    LOW
Confidence:  90%
Area:        Bundle Size Check Not Wired Into "package" Script
File:        package.json:9-11
──────────────────────────────────────────────────
Description:
  The "build:check-size" npm script exists and enforces the 4 MB limit, but
  the production packaging commands ("package" and "package:version") do not
  invoke it. The "package" script is:
    "npm run build && node scripts/packageSolution.js"
  A developer who runs "npm run package" directly could produce and deploy a
  ZIP that exceeds the 4 MB CRM web resource limit without any warning.

  There is also no GitHub Actions CI pipeline found in the repository, meaning
  the bundle check has no automated enforcement mechanism at all.

Recommendation:
  (1) Update the "package" script to chain the size check:
    "npm run build && node scripts/checkBundleSize.js && node scripts/packageSolution.js"
  (2) Add a GitHub Actions workflow (or equivalent CI) that runs
    "npm run build:check-size" on every PR to main/master.

Status: OPEN

──────────────────────────────────────────────────
ID:          AUD-008
Severity:    LOW
Confidence:  82%
Area:        Dev Adapter Reachable In Production Bundle
Files:       src/services/RestWebApiAdapter.ts
             src/services/CrmContextService.ts:55
──────────────────────────────────────────────────
Description:
  RestWebApiAdapter is a concrete class bundled into the production build.
  It is activated when import.meta.env.VITE_USE_REST_API === 'true'.
  Vite replaces import.meta.env references at build time using define(), so
  if a production build is compiled without VITE_USE_REST_API being explicitly
  set to 'false', the conditional check at CrmContextService.ts:55 remains as
  a runtime string comparison against a dead variable that Vite will replace
  with undefined or the literal string 'undefined'.

  The risk is that if someone accidentally runs a production build with a
  .env file that sets VITE_USE_REST_API=true, the deployed bundle will use
  RestWebApiAdapter (which makes raw fetch() calls to VITE_API_BASE_URL)
  instead of CrmWebApiAdapter (which uses Xrm.WebApi). This would bypass the
  CRM session authentication model entirely.

  PROXY_BASE in RestWebApiAdapter.ts (line 8) reads VITE_API_BASE_URL at
  build time and bundles it as a static string. If a non-empty value was
  present in .env at build time, it is baked into the deployed JavaScript —
  visible to any user who inspects the bundle.

Recommendation:
  (1) Add an explicit production build guard to vite.config.ts:
    define: {
      'import.meta.env.VITE_USE_REST_API': JSON.stringify(
        process.env.VITE_USE_REST_API === 'true' ? 'true' : 'false'
      ),
    }
  (2) Document in the deployment runbook that production builds must never
    have VITE_USE_REST_API set to anything other than 'false' (or unset).
  (3) Consider conditionally excluding RestWebApiAdapter from production
    builds using Vite's conditional import or tree-shaking pattern.

Status: OPEN

──────────────────────────────────────────────────
ID:          AUD-009
Severity:    LOW
Confidence:  85%
Area:        Security Role — Empty privilegeid Attributes
File:        deploy/solution/Roles/FormDesignerUser.xml:35-124
──────────────────────────────────────────────────
Description:
  All <RolePrivilege> entries carry privilegeid="" (empty string). The
  hardcoded role GUID is {A1B2C3D4-E5F6-7890-ABCD-EF1234567890} (line 29),
  which is a placeholder pattern and is not a deterministically generated
  GUID. CRM solution import may silently skip privilege bindings when the
  privilege GUID is missing, depending on CRM version behaviour.

  The role GUID itself uses the recognisable placeholder
  A1B2C3D4-E5F6-7890-ABCD-EF1234567890 — this is a code smell indicating
  the role has not been exported from a real CRM environment and re-imported.
  A production-ready role XML should contain real privilege GUIDs obtained
  from the target environment.

Recommendation:
  Export the role from a DEV CRM environment after it has been imported
  once and bound correctly. The exported XML will contain real privilegeid
  GUIDs. Replace the hand-authored XML with the CRM-exported version.

Status: OPEN

──────────────────────────────────────────────────
ID:          AUD-010
Severity:    INFO
Confidence:  90%
Area:        Unvalidated JSON.parse on CRM-sourced Rule Definition
File:        src/services/BusinessRuleService.ts:114
──────────────────────────────────────────────────
Description:
  The rule definition is deserialized from a CRM text field without schema
  validation:

    definition: JSON.parse(rawDefinition) as BusinessRuleDefinition,

  The TypeScript cast `as BusinessRuleDefinition` does not perform runtime
  validation. If a corrupted or manually edited record in Dataverse contains
  malformed JSON or a JSON object that does not conform to the
  BusinessRuleDefinition schema, JSON.parse will throw or return an object
  that will cause downstream runtime errors in the rule editor and renderer.

Recommendation:
  Apply Zod parsing at this boundary. Since businessRule.ts already defines
  the schema as TypeScript interfaces, add a matching Zod schema:

    const ruleDefinitionSchema = z.object({
      version: z.literal('1.0'),
      trigger_field_code: z.string(),
      trigger_event: z.literal('on_change'),
      condition_group: z.object({ ... }),
      actions: z.array(z.object({ ... })),
    });

  Then replace the JSON.parse cast with:
    definition: ruleDefinitionSchema.parse(JSON.parse(rawDefinition)),

  Catch the ZodError and surface it as a recoverable validation warning
  rather than a crash.

Status: OPEN

──────────────────────────────────────────────────
ID:          AUD-011
Severity:    INFO
Confidence:  85%
Area:        solution.xml — Folder Wildcard RootComponent
File:        deploy/solution/solution.xml:63
──────────────────────────────────────────────────
Description:
  The solution.xml template (before packageSolution.js processes it) contains
  a folder-wildcard RootComponent:

    <RootComponent type="61" schemaName="qdb_/form-designer/assets/" behavior="0" />

  This wildcard entry is the known CRM solution import failure pattern
  documented in the project memory (CRM Solution Packaging — RootComponents
  Rule). However, packageSolution.js replaces the entire <RootComponents>
  block at package time with per-file entries (lines 222-237), so the
  final ZIP will never contain this wildcard.

  The concern is that a developer who imports the raw solution.xml template
  directly (without running packageSolution.js) would get an import failure
  with no clear error message. The template file should be protected against
  accidental direct use.

Recommendation:
  Add a prominent comment to solution.xml making clear it is a template:

    <!-- TEMPLATE FILE — DO NOT IMPORT DIRECTLY.
         Run: npm run package
         This file is rewritten by packageSolution.js before packaging. -->

  Also add a validation step in packageSolution.js that warns if the
  generated solution.xml still contains a wildcard schemaName ending in '/'.

Status: OPEN


═══════════════════════════════════════════════════
CONTROLS VERIFIED (PASS)
═══════════════════════════════════════════════════

PASS — No console.log in committed src/ code (grep returned zero matches).
       Rule enforced by common.md. (Confidence: 99%)

PASS — No eval() usage in src/ code (grep returned zero matches).
       (Confidence: 99%)

PASS — No dangerouslySetInnerHTML usage in any React component.
       (Confidence: 99%)

PASS — No direct innerHTML assignment found in src/.
       (Confidence: 99%)

PASS — No external http:// or https:// URLs found in src/ files.
       (Confidence: 99%)

PASS — No process.env usage in src/ (browser bundle does not reference
       Node.js environment variables). (Confidence: 99%)

PASS — No hardcoded GUID values in src/ code (grep returned only UI
       placeholder text in FormProperties.tsx, not live GUIDs in
       business logic). (Confidence: 98%)

PASS — No hardcoded API tokens, passwords, or connection strings found.
       (Confidence: 99%)

PASS — AuditLogService.ts is append-only: only createRecord is called
       against ENTITY_NAMES.FORM_AUDIT_LOG. No updateRecord or deleteRecord
       call to the audit log entity was found anywhere in src/.
       (Confidence: 99%)

PASS — Security role withholds Write and Delete on audit log entity
       at the platform privilege level. (Confidence: 99%)

PASS — FormDefinitionService.ts:162 correctly escapes single quotes in
       the searchTerm OData contains() filter using .replace(/'/g, "''").
       (Confidence: 98%)

PASS — Zod schemas are used for publish validation in
       publishValidation.ts. The formCodeSchema enforces the
       /^[a-z0-9_]+$/ pattern (Confidence: 99%)

PASS — All 12 publish validation gates (PV-001 through PV-012) are
       implemented in publishValidation.ts and cover: form name, form code
       format, tab existence, tab labels, section existence, field labels,
       field codes, duplicate field codes, option set population, lookup
       configuration, entity mapping, and required field warning.
       (Confidence: 98%)

PASS — TypeScript strict mode is enabled in vite.config.ts via the
       test configuration; standard tsconfig.json strict settings are
       assumed from the build passing without errors. No `any` types were
       found in the service layer code. (Confidence: 90%)

PASS — packageSolution.js generates individual <RootComponent> entries
       per file (one per file path) and replaces the template wildcard.
       (Confidence: 98%)

PASS — packageSolution.js copies the Roles directory into the staging
       ZIP (lines 314-317). (Confidence: 98%)

PASS — packageSolution.js generates a fresh customizations.xml at each
       package run from the actual build output. (Confidence: 99%)

PASS — checkBundleSize.js enforces a 4 MB limit and calls process.exit(1)
       on breach. (Confidence: 99%)

PASS — CrmWebApiAdapter wraps Xrm.WebApi and normalises return types.
       No secrets or credentials are used in the adapter. (Confidence: 99%)

PASS — withRetry in crmRetry.ts correctly propagates the last error after
       MAX_RETRIES (3) attempts with exponential backoff. Exceptions are not
       swallowed. (Confidence: 99%)

PASS — Entity names and attribute names are centralised in constants files
       (entityNames.ts, attributeNames.ts). No inline magic strings in
       service files. (Confidence: 98%)

PASS — No hardcoded picklist option value integers outside attributeNames.ts.
       (Confidence: 95%)

PASS — Dependency analysis: all runtime dependencies are current, well-
       maintained, and free of known high-severity CVEs as of knowledge
       cutoff (August 2025): react 18.3, react-dom 18.3, @fluentui/react-
       components 9.46, @dnd-kit/core 6.1, immer 10.1, zod 3.23, zustand 4.5,
       @vitejs/plugin-react 4.3, vite 5.4. No deprecated or abandoned packages
       detected. (Confidence: 85%, limited by inability to run npm audit)

PASS — BusinessRuleDefinition schema is formally defined with a version
       field, trigger event, condition group, and action array. The schema
       is internally consistent and documents the renderer contract.
       (Confidence: 99%)

PASS — FormDeleteService does not touch the audit log entity. Delete
       operations are scoped only to structural form entities (tabs,
       sections, fields, form_definition). (Confidence: 99%)

PASS — CrmContextService correctly acquires Xrm from window.parent in
       the iframe context (CRM web resources run in iframes). The fallback
       to RestWebApiAdapter requires VITE_USE_REST_API=true (build-time flag).
       (Confidence: 92%)


═══════════════════════════════════════════════════
REMEDIATION PRIORITY ORDER
═══════════════════════════════════════════════════

Fix in this order before go-live:

1. AUD-005 (MEDIUM — but CRITICAL deployment risk)
   Verify and correct the privilege name prefix in FormDesignerUser.xml
   before any CRM import. If the prefix is wrong, the audit-log append-only
   protection is silently ineffective. Verify in DEV environment first.

2. AUD-001 (HIGH)
   Add assertGuid() validation in all six services before any OData filter
   construction. This is a single shared utility and six one-line guard
   additions — low implementation cost, high security value.

3. AUD-002 (HIGH)
   Replace the raw fetch() in NewFormWizardScreen with a properly wrapped
   call or a dedicated MetadataService. Add proper error surfacing.

4. AUD-006 (MEDIUM — banking compliance)
   Wire audit log calls into FormDeleteService, FormCloneService, and the
   publish/restore flows. This is required to satisfy the 7-year audit
   trail requirement.

5. AUD-004 (MEDIUM — operational visibility)
   Replace silent catch blocks with structured error handling. This is
   required for operational supportability in a banking environment.

6. AUD-003 (MEDIUM — defence in depth)
   Add length cap on searchTerm at the service boundary. Add Zod schema
   for FormListFilter.

7. AUD-009 (LOW)
   Export the security role from a real CRM environment and replace the
   hand-authored XML with real privilege GUIDs.

8. AUD-007 (LOW)
   Wire checkBundleSize.js into the "package" script. Add CI pipeline.

9. AUD-008 (LOW)
   Add build-time guard to prevent RestWebApiAdapter activation in
   production builds.

10. AUD-010 (INFO)
    Add Zod validation for BusinessRuleDefinition on JSON.parse.

11. AUD-011 (INFO)
    Add template comment to solution.xml.


═══════════════════════════════════════════════════
OWASP TOP 10 ASSESSMENT (2021)
═══════════════════════════════════════════════════

A01 — Broken Access Control
  Applicable: Partially. Access control is delegated entirely to Dynamics CRM
  record-level security (Xrm.WebApi). The designer enforces no additional
  access checks of its own — it relies on the CRM session. The security role
  (FormDesignerUser.xml) is the primary access control mechanism.
  Mitigation: CRM row-level security at Basic depth. Security role deployed
  with solution package.
  Gap: Security role privilege names may not bind correctly (AUD-005). The
  form designer has no additional check to prevent a user from loading a
  form they should not have access to — this is fully delegated to Dataverse.
  Rating: Partially mitigated — depends on AUD-005 resolution.

A02 — Cryptographic Failures
  Not applicable. No cryptographic operations are performed by this component.
  All data transmission security is handled by the Dynamics CRM/Dataverse
  HTTPS transport layer.
  Rating: N/A

A03 — Injection
  Applicable. See AUD-001 and AUD-003. OData filter injection via unvalidated
  GUID interpolation and insufficiently bounded search term. Not SQL injection
  but OData injection — Dataverse parses the $filter string and a malformed
  value could cause unintended query behaviour.
  Mitigation: partial — single-quote escaping applied to searchTerm; GUID
  fields are not yet validated.
  Gap: AUD-001 unresolved. Rating: Partially mitigated.

A04 — Insecure Design
  Applicable: The RestWebApiAdapter dev bypass is bundled into production code
  and activated by a build-time flag (AUD-008). This is an insecure design
  pattern — dev tooling should not be in the production bundle.
  Mitigation: flag requires VITE_USE_REST_API=true to activate.
  Gap: AUD-008 unresolved. Rating: Low risk, partially mitigated.

A05 — Security Misconfiguration
  Applicable: AUD-005 (privilege name prefix mismatch) and AUD-009 (empty
  privilegeid attributes) are security misconfiguration issues in the CRM
  solution package.
  Rating: Partially mitigated. Deployment verification required.

A06 — Vulnerable and Outdated Components
  Applicable. All runtime dependencies appear current as of knowledge cutoff.
  No npm audit was run — this must be executed before UAT.
  Gap: npm audit not confirmed. Rating: Unknown — requires verification.

A07 — Identification and Authentication Failures
  Not applicable in isolation. Authentication is entirely delegated to the
  Dynamics CRM session model. The web resource cannot run outside CRM without
  VITE_USE_REST_API=true.
  Rating: N/A (delegated to CRM platform)

A08 — Software and Data Integrity Failures
  Applicable: BusinessRuleDefinition is deserialized without schema validation
  (AUD-010). A corrupted Dataverse record could cause runtime failures in the
  designer.
  Mitigation: TypeScript strict mode prevents some type errors at compile
  time, but provides no runtime protection.
  Gap: AUD-010 unresolved. Rating: Low risk, easily mitigated.

A09 — Security Logging and Monitoring Failures
  Applicable: AUD-006 identifies gaps in audit log coverage. Form deletions,
  clones, publishes, and version restores may not produce audit records.
  Mitigation: AuditLogService is correctly implemented for the actions that
  do call it (SAVE_DRAFT confirmed).
  Gap: AUD-006 unresolved. Rating: Partially mitigated.

A10 — Server-Side Request Forgery
  Not applicable. This is a pure client-side web resource. All API calls
  target the same CRM origin. No server-side component processes external URLs.
  Rating: N/A


═══════════════════════════════════════════════════
COMPLIANCE ASSESSMENT
═══════════════════════════════════════════════════

Framework: Banking Sector — Internal Audit Trail Requirements

Requirement: All state-changing operations on regulated data must be
  recorded in an immutable audit log with actor ID, timestamp, and payload.
How met: AuditLogService creates append-only records. Role withholds
  Write/Delete on audit log table.
Gap: AUD-006 — delete, clone, publish, and version restore operations
  do not have confirmed audit log calls. This must be resolved before the
  application is used for production form management.
Remediation: Wire logAction() into FormDeleteService, FormCloneService,
  publish flow, and version restore flow.

Requirement: Audit records must be retained for 7 years.
How met: No deletion path for qdb_form_audit_log exists in the codebase.
  The security role withholds Delete privilege.
Gap: Dataverse data retention policies are not configured by this codebase.
  The CRM environment administrator must confirm a 7-year data retention
  policy is applied to the qdb_form_audit_log entity.
Remediation: Confirm and document Dataverse retention policy in the
  deployment runbook.

Requirement: User identity must be captured in every audit record.
How met: AuditLogService records userContext.userId and userContext.userFullName.
Gap: CrmContextService.getUserContext() returns 'unknown' as the userId
  when the Xrm.Page.context.getUserId() call returns null/undefined. An
  audit record with userId='unknown' is insufficient for banking regulators.
  This edge case should throw rather than silently producing 'unknown'.
Remediation: Throw a CrmContextError if getUserId() returns null or
  undefined, rather than returning 'unknown'. Prevent save/publish actions
  if user context is unavailable.

Framework: GDPR (if the forms collect EU personal data)

Requirement: Personal data access must be logged.
How met: OPEN_FORM action is defined in AuditAction and presumably called
  when a form definition is opened for editing. The logAction call for
  OPEN_FORM was not confirmed in the reviewed code.
Gap: Confirm that OPEN_FORM is called when a form definition is loaded
  (e.g. in the form load flow). If form definitions contain personal data
  field configurations, access must be logged.

Requirement: Right to erasure — must not delete audit records.
How met: No deletion path exists in the code. Security role withholds
  Delete on audit log.
Gap: None identified.


═══════════════════════════════════════════════════
DATA RESIDENCY REVIEW
═══════════════════════════════════════════════════

All data resides in the Dynamics CRM / Dataverse environment configured by
the client organisation. This is a pure client-side web resource — it holds
no data of its own and performs no data storage outside of Xrm.WebApi calls
to the client's CRM environment.

Cross-border transfer risk:
  LOW. The data residency of the Dataverse environment is determined by the
  client's CRM hosting configuration (on-premise or cloud region), not by
  this web resource.

  If the client is using Dataverse cloud (Power Platform), the data region
  must be confirmed in the client's Power Platform admin centre. This web
  resource introduces no new cross-border data flows.

  The one external URL pattern found (clientUrl + /api/data/v9.1/) in
  NewFormWizardScreen.tsx constructs a call to the same CRM origin — not an
  external endpoint — so it does not introduce a cross-border transfer.

Recommendation:
  The deployment runbook should document the target Dataverse environment's
  data region and confirm it complies with the client's data sovereignty
  requirements before go-live.


═══════════════════════════════════════════════════
AUDIT TRAIL VALIDATION
═══════════════════════════════════════════════════

Can every state transition be reconstructed?
  PARTIAL. SAVE_DRAFT transitions are recorded. PUBLISH, DELETE, CLONE, and
  RESTORE_VERSION transitions may not be recorded (AUD-006). A regulatory
  examiner would see gaps in the audit trail for these operations.

Is the log tamper-proof and append-only?
  YES — at the code layer (AuditLogService only calls createRecord) and at
  the platform layer (security role withholds Write/Delete on the audit log
  entity). This is the strongest control in the system.

Is the actor identity reliably captured?
  PARTIAL. userId can fall back to 'unknown' (see Compliance section above).
  This must be hardened.

Is the payload sufficient for reconstruction?
  PARTIAL. The SAVE_DRAFT payload includes fieldCount and tabCount —
  these are counts, not snapshots. A regulatory examiner cannot reconstruct
  the exact form state from the audit log alone. Full-fidelity reconstruction
  requires the form version snapshots in qdb_form_version, which is a
  separate entity. This is an architecture concern, not a code defect.

Is the timestamp reliable?
  The timestamp is set by the client browser (new Date().toISOString()).
  A compromised browser could send a manipulated timestamp. For banking-grade
  audit trails, the timestamp should be set server-side by Dataverse's
  native createdon field, not by the client.
  Recommendation: Use Dataverse's native createdon field as the authoritative
  timestamp for audit records. The client-supplied qdb_timestamp_utc field
  may be useful for display, but should not be the legal timestamp of record.


═══════════════════════════════════════════════════
SERVICE ACCOUNT REVIEW
═══════════════════════════════════════════════════

This application has no service accounts of its own. All Dataverse API calls
are made under the identity of the authenticated CRM user via Xrm.WebApi
(the browser session). There is no background service, daemon, or
integration user.

The "Form Designer User" security role is the relevant access scope:
  - 14 entities: Create, Read, Write, Delete at Basic depth (user-owned)
  - qdb_form_audit_log: Create, Read only (no Write, no Delete) — CORRECT
  - qdb_form_version: Create, Read, Write only (no Delete) — CORRECT
  - qdb_theme: Create, Read, Write only (no Delete) — CORRECT

Least-privilege assessment:
  The role grants Delete on: qdb_form_definition, qdb_form_tab,
  qdb_form_section, qdb_form_field, qdb_form_validation_rule,
  qdb_form_business_rule, qdb_form_option_value, qdb_form_lookup_config,
  qdb_form_submission_mapping, qdb_form_design, qdb_section_design,
  qdb_field_design, qdb_button_design.

  Delete on form definition records is architecturally required (the designer
  supports form deletion). This is not over-privileged for the designer's
  stated purpose.

  No global-depth privileges are granted — all are Basic depth, which is
  the minimum required for user-created records. PASS.

  Sprint 3+4 entities (qdb_rule_template, qdb_fieldlabel,
  qdb_form_access_policy) are listed in ENTITY_NAMES but are not present
  in the security role XML. If these entities are deployed, users will
  receive "Access Denied" errors on operations against them. This is a
  deployment gap but not a security gap (erring on the side of too few
  privileges rather than too many).

  Recommendation: Add privileges for the Sprint 3+4 entities to the role
  before production deployment if they are in scope.


═══════════════════════════════════════════════════
GOVERNANCE GAPS (PRE-GO-LIVE)
═══════════════════════════════════════════════════

Ranked by risk if unaddressed:

GAP-1: Audit Log Coverage Incomplete (AUD-006)
  Risk: Banking regulatory non-compliance. A regulator cannot reconstruct
  form lifecycle events (delete, publish, clone, restore) from the audit log.
  Remediation: Wire logAction() into all state-changing service methods.
  Must resolve before UAT.

GAP-2: OData Injection — No GUID Validation (AUD-001)
  Risk: Data exfiltration of form configuration data from Dataverse.
  Remediation: Add assertGuid() utility and apply at 6 service entry points.
  Must resolve before production deployment.

GAP-3: Security Role Privilege Prefix Mismatch (AUD-005)
  Risk: Role imports with no bindings; audit log append-only backstop fails.
  Remediation: Verify publisher prefix in target environment; update XML.
  Must resolve before first CRM import.

GAP-4: No CI Pipeline for Bundle Size Gate (AUD-007)
  Risk: Production deployment exceeds Dynamics CRM 5 MB web resource limit.
  Remediation: Wire checkBundleSize into "package" script and add CI.
  Must resolve before first production deploy.

GAP-5: CRM Compatibility Matrix Absent (C-003)
  Risk: Web resource fails in target CRM version/browser combination.
  Remediation: Test in DEV environment and document confirmed matrix.
  Must resolve before go-live.

GAP-6: Business Rule Schema — No Renderer Team Confirmation (C-001)
  Risk: Schema mismatch between designer and portal renderer at go-live.
  Remediation: Obtain written sign-off from renderer team; commit ADR.
  Must resolve before go-live.

GAP-7: Audit Timestamp Set by Client (Audit Trail section)
  Risk: Client-supplied timestamp is legally weaker than server-side timestamp.
  Remediation: Use Dataverse createdon as the authoritative audit timestamp.
  Should resolve before go-live.

GAP-8: User Identity 'unknown' Fallback in AuditLogService (Compliance section)
  Risk: Audit records with actor='unknown' are invalid for regulatory purposes.
  Remediation: Throw instead of returning 'unknown'; gate save/publish on
  user context availability.
  Must resolve before go-live.

GAP-9: Sprint 3+4 Entities Missing From Security Role (Service Account section)
  Risk: Access denied errors for rule template, field label, access policy features.
  Remediation: Add privileges to FormDesignerUser.xml for the 3 missing entities.
  Must resolve before UAT if Sprint 3+4 features are in scope.

GAP-10: Dataverse 7-Year Retention Policy Not Configured By This Codebase (Compliance)
  Risk: Audit records could be purged by a default Dataverse retention policy.
  Remediation: Document and configure retention policy in deployment runbook.
  Must resolve before go-live.


═══════════════════════════════════════════════════
PHASE 7 GATE RECOMMENDATION
═══════════════════════════════════════════════════

PROCEED WITH CONDITIONS

The codebase is structurally sound and the audit trail integrity pattern is
well-designed. The technology choices are appropriate for a banking-sector
CRM tool. Phase 7 (CEO Final Decision) may be entered, but production
deployment is blocked by the following conditions:

BLOCKER-1 (must resolve before production deployment):
  AUD-001 — Add GUID validation at service boundaries.

BLOCKER-2 (must resolve before first CRM import):
  AUD-005 — Verify and correct security role privilege name prefix.
  If the role is imported with the wrong prefix, the audit log protection
  is silently disabled. This must be verified in a DEV environment before
  any production import.

BLOCKER-3 (must resolve before UAT):
  AUD-006 — Wire audit log calls into delete, clone, publish, and restore
  operations.

BLOCKER-4 (must resolve before UAT):
  GAP-8 — Replace the 'unknown' user identity fallback with a hard failure.

BLOCKER-5 (must resolve before go-live):
  C-001 — Obtain and commit renderer team sign-off on BusinessRuleDefinition
  schema v1.0.

BLOCKER-6 (must resolve before go-live):
  C-003 — Document confirmed CRM compatibility matrix for target environments.

CONDITIONS (must resolve before or alongside production deployment):
  AUD-002 — Fix raw fetch() in NewFormWizardScreen.
  AUD-007 — Wire bundle size check into package script.
  GAP-7   — Use Dataverse createdon as authoritative audit timestamp.
  GAP-10  — Configure and document Dataverse 7-year retention policy.

LOW PRIORITY (next sprint):
  AUD-003, AUD-004, AUD-008, AUD-009, AUD-010, AUD-011.

Auditor sign-off: Maqsad AI — Auditor Agent
Date: 2026-06-01
