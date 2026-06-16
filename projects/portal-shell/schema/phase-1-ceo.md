═══════════════════════════════════════════════════
CEO PHASE 1 VERDICT
═══════════════════════════════════════════════════
Project:        DFE-PORT-001/SCHEMA — Configurable Portal Shell: Dataverse Schema Provisioning
Prepared by:    Maqsad AI — CEO
Date:           2026-06-16
Version:        1.0
Status:         APPROVED WITH CONDITIONS
Parent:         DFE-PORT-001 — Configurable Portal Shell (APPROVED WITH CONDITIONS 2026-06-16)
Engagement ID:  DFE-PORT-001/SCHEMA
═══════════════════════════════════════════════════


BUSINESS OBJECTIVE
══════════════════

The portal application for DFE-PORT-001 is fully built and QA-verified across all three
tracks (Track A Web, Track C CMS, Track B Mobile). The sole blocker to staging smoke tests
is that the 15 custom Dataverse tables the application reads and writes do not yet exist in
the target environment (org5869857f.crm4.dynamics.com). This sub-engagement creates those
tables — along with the supporting security role, picklist definitions, lookup relationships,
and minimum seed data — so that the portal API can boot, authenticate, and serve a citizen
in a staging context. The deliverable is a provisioned QdbPortalShell managed solution and
a passing health check against the live Dataverse environment.


SUCCESS CRITERIA
════════════════

1. SC-001: All 15 custom tables are visible in the org5869857f Dataverse maker portal with
   the exact column names, data types, and picklist integer codes defined in BRD Section 5.
   Zero deviations from the built API service code are acceptable.

2. SC-002: The "Portal Shell API Role" is created and assigned to application user
   CLIENT_ID 08e80e93-0bab-45ef-8372-2e554fa9af9b with the exact privilege matrix in
   BRD Section 17 (Create-only on qdb_portal_revoked_tokens, qdb_portal_request_timelines,
   and qdb_cms_revisions; no System Administrator or System Customizer role assigned).

3. SC-003: GET /api/health returns HTTP 200 against the staging environment with the
   provisioned schema in place.

4. SC-004: GET /api/portal-config returns HTTP 200 with a valid JSON body containing
   portalName, navLayout, notificationPollIntervalSeconds, and authProvider — all populated
   from the SD-001 seed record.

5. SC-005: POST /api/auth/login with credentials smoketest@portalshell.internal /
   SmokeTest@2026! returns HTTP 200 with a valid accessToken and refreshToken — confirming
   that the qdb_portal_users and bcrypt authentication path are end-to-end functional.

6. SC-006: GET /api/nav with a valid Bearer token returns HTTP 200 with at least 3
   navigation items in the correct display order — confirming the SD-002 seed records
   are readable by the API.

7. SC-007: The QdbPortalShell managed solution is exported via PAC CLI without errors and
   the solution file is committed to the project version control repository, versioned 1.0.0.0.


ASSUMPTIONS
═══════════

The following are assumed true and must be confirmed by the implementation team before the
schema provisioning script executes:

A-001: The delivery team holds System Administrator access to org5869857f for the duration
       of this sub-engagement. This is the minimum required to create a new solution,
       publish entities, and register an application user.

A-002: The service principal CLIENT_ID 08e80e93-0bab-45ef-8372-2e554fa9af9b is already
       registered as an Azure AD application in TENANT_ID d79e793c-f6de-4204-8508-7980a63df957.
       No Azure AD changes are in scope.

A-003: The qdb publisher (prefix qdb_) is present in org5869857f from the existing
       QdbDynamicFormEngine solution. If the publisher check fails, creating it must be the
       first step of the provisioning script and must use the identical publisher details.

A-004: Picklist code ranges 860000xxx and 100000xxx do not conflict with any existing global
       option sets already registered in the environment. This must be verified as the first
       validation step of the provisioning script.

A-005: The OOB account entity in org5869857f already carries the qdb_sub_type and
       qdb_logo_url columns from a prior DFE engagement. If absent, the entity switcher
       returns null values for those fields but the API does not fail — this is an acceptable
       degraded behaviour for the staging phase.

A-006: The built TypeScript API service code in apps/api/src/services/ is the authoritative
       source of truth for all column names and picklist codes. Where the BRD explicitly
       overrides the original brief (qdb_portal_requests status codes 860000xxx; CMS
       content types 100000xxx), the code values are correct and the brief values are void.


STRATEGIC ALIGNMENT
═══════════════════

This sub-engagement is a direct structural dependency of DFE-PORT-001 and not an extension
or scope change. The parent engagement was approved with conditions on 2026-06-16 and lists
staging smoke tests as a binding pre-production gate. No schema means no smoke tests, which
means no production go-live. Proceeding is mandatory if the parent engagement conditions are
to be met.

The BRD is thorough. It derives every table column and picklist code from the built and
QA-verified API service code. The 15 entities are not aspirational — they are the exact
tables the built application already queries. The scope is appropriately bounded: no
Power Automate flows, no plugins, no OOB entity changes, no schema for future engagements
(DFE-PORT-002 document upload is correctly excluded).

The implementation approach (TypeScript Node.js script calling Dataverse Web API directly,
no PAC CLI for provisioning) is pragmatic for a sub-engagement of this size and avoids
manual browser steps. PAC CLI is correctly retained for the solution export step (SC-007),
which is the ALM-critical operation requiring a repeatable CLI mechanism.


TOP 3 STRATEGIC RISKS
═════════════════════

RISK-1: PICKLIST CODE COLLISION (HIGH)
  If picklist code ranges 860000xxx or 100000xxx are already in use in the org5869857f
  environment by an existing global option set, the provisioning script will fail and the
  schema cannot be deployed without changing the codes — which would require corresponding
  changes to the built API service code. This must be the first validation the provisioning
  script performs before creating any entity.
  Mitigation: The provisioning script must query GlobalOptionSetDefinitions and abort with
  a clear error message if any conflicting code is detected. Do not proceed past this check.

RISK-2: PUBLISHER ABSENCE (HIGH)
  The BRD assumes the qdb publisher already exists from QdbDynamicFormEngine. If the
  publisher was deleted, renamed, or the environment was re-provisioned from a snapshot
  that pre-dates it, all 15 entity logical names will collide with a different publisher
  prefix and the API will be unable to reach them via OData. The provisioning script must
  confirm the qdb publisher's existence and prefix before creating any solution component.

RISK-3: SMOKE TEST USER PASSWORD HASH IN PLAINTEXT (LOW-MEDIUM)
  The seed data requirement SD-003 requires a bcrypt hash of "SmokeTest@2026!" to be
  inserted into qdb_portal_users. If the provisioning developer generates this hash and
  records the plaintext password or the hash in a script file that is committed to version
  control, it creates a credential hygiene violation. The test user record must also be
  deactivated before any environment promotion to production — this is a mandatory step
  that must appear in the pre-production checklist.
  Mitigation: The bcrypt hash must be generated at runtime inside the provisioning script
  using a bcrypt library call, never hardcoded in source. The script must print a clear
  warning at the end reminding the operator to deactivate the smoke test user before
  production promotion.


SCOPE APPROPRIATENESS
═════════════════════

The 15 entities are the correct scope. The count arrives from the built API service code,
not from a requirements estimate. Three tables (qdb_portal_service_tabs, qdb_portal_user_entities,
and qdb_portal_request_timelines) were discovered during code inspection and correctly
added to the BRD scope. The exclusion of qdb_portal_pages is correctly noted as an open
question (RQ-006) — the implementation team must confirm with the backend developer before
provisioning begins whether this entity is needed.

The append-only privilege constraint on qdb_portal_revoked_tokens, qdb_portal_request_timelines,
and qdb_cms_revisions is well-reasoned and must be enforced at the security role level, not
only in application code.

The retention and sensitivity classifications in Section 9 are appropriate and consistent
with the data types stored. The 7-year retention for qdb_portal_requests and related tables
aligns with typical government citizen record retention obligations.

The volume projection for qdb_portal_revoked_tokens (up to 10 million records) is a
legitimate concern flagged in RQ-005. A scheduled purge job is recommended before
production go-live but is correctly deferred to a Phase 2 planning item.


BINDING CONDITIONS
══════════════════

The following conditions are binding on the implementation. The Power Platform developer
must satisfy all conditions before the managed solution export is delivered and before any
claim of completion is made to this office.

C-SCHEMA-001: PUBLISHER VERIFICATION FIRST
  The provisioning script must verify the existence of the qdb publisher in org5869857f
  as its first operation. If the publisher is absent, the script must create it with the
  correct display name, prefix (qdb_), and unique name before proceeding. It must not
  silently proceed under a different publisher prefix.

C-SCHEMA-002: PICKLIST CODE PRE-CHECK
  Before creating any entity or option set, the provisioning script must enumerate all
  existing GlobalOptionSetDefinitions in the environment and confirm that no existing
  option set uses any of the integer codes in the 860000xxx range (for portal entities)
  or 100000xxx range (for CMS and user language entities). If a conflict is detected, the
  script must abort and surface the conflicting option set name and code value.

C-SCHEMA-003: APPEND-ONLY TABLES ENFORCED AT ROLE LEVEL
  The "Portal Shell API Role" must be verified at the Dataverse privilege level —
  not only asserted in documentation — to have no Update and no Delete privilege on:
    - qdb_portal_revoked_tokens
    - qdb_portal_request_timelines
    - qdb_cms_revisions
  The provisioning script or a post-deployment validation step must confirm these
  privilege settings are correct in the deployed role before delivery is declared complete.

C-SCHEMA-004: NO SYSTEM ADMINISTRATOR ROLE ASSIGNED TO SERVICE PRINCIPAL
  After the application user is created and the "Portal Shell API Role" is assigned,
  the provisioning script must confirm that the service principal holds no System
  Administrator, System Customizer, or any other broad platform role. A targeted
  privilege check must be included in the validation output.

C-SCHEMA-005: BCRYPT HASH GENERATED AT RUNTIME
  The SD-003 smoke test user record must have its bcrypt password hash generated by the
  provisioning script at runtime using bcrypt with cost factor 12. The plaintext password
  "SmokeTest@2026!" must not appear in any committed file. The script must emit a
  warning at completion reminding the operator that the smoke test user (statecode = 0)
  must be deactivated before production promotion.

C-SCHEMA-006: QDBDYNAMICFORMENGINE SOLUTION UNTOUCHED
  After provisioning completes, the provisioning developer must confirm via the Dataverse
  maker portal that the QdbDynamicFormEngine solution component count and version number
  are unchanged. No component from that solution may appear in QdbPortalShell.

C-SCHEMA-007: RQ-006 CONFIRMED BEFORE SCRIPT EXECUTION
  The open question RQ-006 (qdb_portal_pages entity) must be answered by the backend
  team and recorded in the project log before the provisioning script runs against the
  live environment. Running against the environment with this ambiguity unresolved risks
  either missing a required entity or provisioning an unused entity. If the backend team
  confirms qdb_portal_pages is not needed, the 15-entity scope is confirmed as final.

C-SCHEMA-008: SOLUTION EXPORTED VIA PAC CLI BEFORE DELIVERY
  SC-007 is non-negotiable. The QdbPortalShell managed solution must be exported using
  PAC CLI (not the browser UI) and the resulting .zip file must be committed to the
  project version control repository under a clearly named path before this sub-engagement
  is declared complete.


FINAL VERDICT
═════════════

APPROVED WITH CONDITIONS

This sub-engagement is approved to proceed to architecture and implementation phases.
The BRD is thorough, well-sourced from the built code, and correctly scoped. The
implementation approach is sound. The eight binding conditions above must all be satisfied
before the sub-engagement is declared complete.

The path to staging smoke tests is clear: resolve RQ-006, run the provisioning script,
validate the health check and auth endpoints (SC-003 through SC-006), export the solution
via PAC CLI (SC-007), and deactivate the smoke test user before any environment promotion.

No further CEO review is required before implementation begins. The Phase 7 final
decision will be issued after SC-001 through SC-007 are demonstrated to be satisfied.


APPROVAL RECORD
═══════════════

| Role          | Name              | Decision               | Date       |
|---------------|-------------------|------------------------|------------|
| CEO           | Maqsad AI CEO     | APPROVED WITH CONDITIONS | 2026-06-16 |
| Requestor     | Pending           | PENDING                |            |

═══════════════════════════════════════════════════
END OF DOCUMENT — DFE-PORT-001/SCHEMA CEO PHASE 1 v1.0
═══════════════════════════════════════════════════
