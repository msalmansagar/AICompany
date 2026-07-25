# DXP-P1-003 — CEO Final Decision

**Engagement:** DXP-P1-003 — Theme Token System
**Phase:** 7 — CEO Final Decision
**Date:** 2026-06-21
**Decision Authority:** CEO Agent, Maqsad AI

---

## Verdict: APPROVED WITH CONDITIONS

---

## Executive Summary

The DXP-P1-003 Theme Token System is architecturally sound and represents a well-engineered solution for a government portal. The five-level hierarchical token cascade is fit for purpose: it correctly models the QDB DXP's real-world authority structure (global defaults, render-target overrides, category specificity, component-level fine-tuning, and service-owner autonomy) and the resolution algorithm is correctly implemented with deterministic specificity scoring. The security posture is strong — JWT enforcement is correctly layered, CSS injection is defended at both write and read time, and service-owner scoping is derived from the JWT, never from the request body. These are the right design choices for a Qatar government portal.

However, the system cannot be staged or operated in production as it stands. Four conditions identified by the Auditor constitute hard blockers that render the system non-deployable: the Redis implementation is absent (the API crashes at startup if REDIS_URL is set), the Dataverse provisioning script does not exist (no schema means no API routes function), the publish audit trail is unwritten (publishedOn/publishedBy are designed but never populated), and Dataverse field-level auditing is unconfirmed. These are not cosmetic gaps — they are the difference between a system that works and one that fails on day one. Additionally, the admin UI has not been built, meaning QDB's design team has no operator interface to use the system that was built for them.

The approval is given because the design is correct and the engineering quality is high. The conditions below define exactly what must be completed before any deployment occurs. No staging deployment may proceed without Staging Gate clearance. No production deployment may proceed without Production Gate clearance. The three open questions from the BRD (OQ-001, OQ-002, OQ-003) do not block staging but must be formally resolved by QDB stakeholders before production deployment.

---

## Conditions

### Staging Gate (all must be cleared before any staging deployment)

**C-STG-001: Implement RedisTokenCache**
Build `apps/api/src/services/tokens/RedisTokenCache.ts` implementing `ITokenCacheService` using `ioredis`. The implementation must use `SCAN`-based pattern delete (not `KEYS`) for cache flush operations, as specified in phase-3-arch.md Section 8.2. Remove the startup guard at `apps/api/src/services/tokens/createTokenCacheService.ts` line 32 once implemented. This is tracked as B-004 in the Phase 4 tech doc. Verifiable: the API must start without error when `REDIS_URL` is set in the staging environment.

**C-STG-002: Build and run the Dataverse provisioning script**
Build `projects/dxp-p1-003/scripts/provision-schema/` following the P1-001 ADR-DXP-001 structure, as specified in phase-3-arch.md Section 11. The script must provision: 3 GlobalOptionSets (qdb_token_type, qdb_token_level, qdb_token_category), 2 entities (qdb_token_definitions, qdb_token_values), 1 relationship (qdb_tokendefinition_values), 1 alternate key (qdb_TokenDefinitionSlugKey), 27 seed token definitions, and 4 Arabic locale seed values. The script must be idempotent (skip-if-exists on all steps). All 11 post-provisioning validation checks in `PostProvisioningValidator` must pass before staging proceeds. This is tracked as G-001. Verifiable: the 11-point post-provisioning checklist from phase-3-arch.md Section 11 must produce a clean pass report.

**C-STG-003: Configure Redis memory policy in the DevOps runbook**
Add `maxmemory 512mb` and `maxmemory-policy allkeys-lru` to the Redis server configuration before Redis is used in any deployed environment. Document this configuration in the DevOps runbook (this is tracked as B-002). The auditor's analysis in phase-5-audit.md Section 1 (SEC-02) shows a worst-case Redis key space of 450 MB at full portal scale — the 512 MB limit bounds this with LRU eviction as the safety mechanism. Without this policy, an adversarial or misconfigured client can exhaust Redis memory and bring down all portal SSR rendering. Verifiable: the Redis instance in staging must show `maxmemory 512mb` and `maxmemory-policy allkeys-lru` in its config output.

**C-STG-004: Implement the publishedOn/publishedBy batch-PATCH in publish.ts**
The `POST /api/admin/tokens/publish` route in `apps/api/src/routes/admin/tokens/publish.ts` must implement Step 9 from the publish flow specified in phase-3-arch.md Section 9: a batch-PATCH to Dataverse writing `qdb_PublishedOn` and `qdb_PublishedBy` on all active `qdb_token_values` records at publish time. This may be fire-and-forget after the 204 response is returned, but a failure in the batch-PATCH must be logged at WARN level with the full error context (not silently swallowed). Without this, the publish audit trail in Dataverse is entirely non-functional — a regulatory examiner cannot determine which token values were live at any point in time. This is identified as Finding 2.1 and Finding 3.5 in phase-5-audit.md. Verifiable: after calling POST /api/admin/tokens/publish on staging, query Dataverse `qdb_token_values` records and confirm that `qdb_publishedon` and `qdb_publishedby` are populated on active records.

**C-STG-005: Enable Dataverse field-level auditing in the provisioning script**
Add an audit-enablement step to `projects/dxp-p1-003/scripts/provision-schema/` that sets `IsAuditEnabled: true` on both `qdb_token_definitions` and `qdb_token_values` entity definitions via the Dataverse `EntityDefinitions` PATCH API. Confirm in the DevOps runbook that org-level Dataverse auditing is enabled for the production environment. Document the audit log retention period and export procedure. This is identified as SEC-10 in phase-5-audit.md. For a Qatar government portal, the ability to reconstruct who changed what token value and when is a regulatory requirement. Verifiable: Dataverse Audit Log shows field-level change records for both entities after a test create/update cycle on staging.

**C-STG-006: Raise NEXTJS_REVALIDATE_SECRET minimum length to 32 characters**
In `apps/api/src/config.ts` line 43, raise the `NEXTJS_REVALIDATE_SECRET` minimum length validation from 16 to 32 characters. The current 16-character minimum is below the standard for a shared secret on a government portal, as identified in phase-5-audit.md SEC-04. All staging and production deployments must use a secret of at least 32 characters. Verifiable: the Zod env schema rejects a secret shorter than 32 characters at API startup.

**C-STG-007: Write Supertest integration tests for all route groups**
Write the 46 integration tests specified in phase-4-qa.md Section 5 (TC-I-001 through TC-I-046) covering all 11 route handlers: resolve, definitions (list/create/get/patch/delete), values (list/create/delete), publish, preview, service resolve, service value create/delete, and the Next.js revalidate handler. Minimum coverage per route: happy path, authentication failure (401), role authorisation failure (403), and validation failure (400). The integration tests are currently absent (identified as Finding 3.3 in phase-5-audit.md). These tests are the only automated confirmation that route-level auth and validation are wired correctly. Verifiable: all 46 integration tests pass in CI with no skipped tests.

**C-STG-008: Build the Admin UI for token management**
Build the token management admin UI (items 30-35 of the phase-4-tech.md build checklist): token definitions grid at `apps/web/src/app/[locale]/(admin)/tokens/page.tsx`, token value management panel (create/deactivate overrides per definition), publish button wired to `POST /api/admin/tokens/publish`, and draft preview via `GET /api/admin/tokens/preview`. The publish button must include a confirmation dialog before executing the publish action. Without the admin UI, QDB's design team has no operator interface — all token management requires direct API calls, which is not an acceptable handoff state for a government client. This is identified as SEC-07 in phase-5-audit.md. Verifiable: QDB design team can log in to the admin portal, create a token value override, preview it in draft, and publish it without any direct API calls.

---

### Production Gate (all must be cleared before production deployment)

**C-PRD-001: OQ-001 — Formal written confirmation of publish model from QDB IT Director**
Obtain written confirmation from the QDB IT Director on whether the staging window model (explicit publish via POST /api/admin/tokens/publish) or instant publish model is the required behaviour. The current implementation assumes staging window (ADR-003-002). If instant publish is chosen, the draft/live cache distinction collapses and the publish route becomes a no-op — the backend agent must implement the instant-publish variant with an addendum ADR before production deployment. Written confirmation must be recorded in the BRD addendum. This has been required since the BRD approval and remains unresolved.

**C-PRD-002: OQ-002 — Formal written confirmation of Level 5 approval policy from QDB Compliance**
Obtain written confirmation from QDB Compliance on whether a secondary approval is required before service-owner (Level 5) token overrides go live. The current implementation assumes no approval is required (ADR-003-003). If approval is required, a new Addendum ADR-003-003A must be written, the `qdb_token_values` schema must be extended with `qdb_ApprovalStatus`, `qdb_SubmittedBy`, and `qdb_ReviewedBy` fields, the resolution algorithm must be updated to exclude unapproved values, and two new API routes must be added (`/approve` and `/reject`). Written confirmation must be recorded in the BRD addendum. This is a material governance gap if left unresolved for a QFC-regulated entity portal.

**C-PRD-003: OQ-003 — Formal written confirmation of Redis availability from QDB IT/DevOps**
Obtain written confirmation from QDB IT or DevOps that a Redis instance will be available and provisioned in the production API environment. The Redis deployment must be in Qatar Central or UAE North (Azure Cache for Redis) to satisfy QDB's data residency requirements (see C-PRD-005 below). If Redis is confirmed unavailable, QDB IT must formally accept the multi-instance cache inconsistency risk documented in phase-3-arch.md Section 14 (OQ-003), and the deployment must be constrained to a single API instance until Redis is available. Written confirmation must be recorded in the DevOps runbook.

**C-PRD-004: OQ-003 companion — 200-definition load test at production scale**
Before production deployment, run the k6 performance test `k6/token-resolve-warm.js` against a Dataverse-connected staging environment loaded with 200 token definitions and approximately 1,000 value records (as specified in phase-4-qa.md Section 10, OQ-003). The p95 latency for `GET /api/tokens/resolve` with a warm cache must remain below 50 ms (NFR-001). If the target is not met at 200 definitions, ADR-003-006 must be revised with a lower ceiling and the backend agent must update the `TOKEN_DEFINITION_SOFT_LIMIT` default. The architecture's performance estimates in phase-3-arch.md Section 3 (ADR-003-006) are projections, not measurements. This test converts the projection into a verified result. Verifiable: k6 test report showing p95 < 50 ms at 200 definitions must be attached to the production go-live sign-off.

**C-PRD-005: Redis and Next.js deployment in Qatar Central or UAE North**
The DevOps runbook must explicitly specify that Redis (Azure Cache for Redis) and the Next.js portal application must be deployed in Qatar Central or UAE North Azure regions. This is required to satisfy QDB's data residency obligation — the Next.js SSR server caches the resolved token map locally via `next: { revalidate: 300 }`, meaning token data is at rest on the Next.js server's file system. If the Next.js server is deployed outside Qatar, token data crosses the border even though it contains no PII. Identified in phase-5-audit.md Section 5. Verifiable: Azure resource group configuration showing both the Next.js App Service/Container App and the Azure Cache for Redis instance are in Qatar Central or UAE North.

**C-PRD-006: Redis authentication configured (access key or Managed Identity)**
When the Redis instance is provisioned, it must be configured with Azure Cache for Redis access key authentication or Azure Managed Identity. Redis must not be deployed without authentication in any environment. Identified in phase-5-audit.md Section 7 (service account review). Verifiable: the DevOps runbook documents the authentication method and the Redis connection string in the staging/production environment uses the authenticated REDIS_URL format.

**C-PRD-007: Final QDB brand seed token values replace placeholders**
The provisioning script's seed data (`TokenDefinitionSeed.ts` and `TokenValueSeed.ts`) must be updated with QDB's final brand token values (colours, typography, spacing scale) to replace the placeholder values (e.g. `#1a4d8f`, `'IBM Plex Sans'`) before the production provisioning run. This is identified as OQ-005. QDB's design team must commit to a delivery date for these values before the production provisioning run is scheduled. Running production with placeholder values means the portal launches without the approved QDB brand identity. Verifiable: the QDB design team provides written sign-off on the seed token values used in the production provisioning run.

**C-PRD-008: W-002 defect fix — definitionSlug returned as empty string in token value list**
The `mapToValue()` method in `apps/api/src/services/tokens/TokenValueRepository.ts` currently returns `definitionSlug: ''` (empty string) for all token values because the OData query in `findAllActive()` does not expand the lookup to retrieve the definition slug. This means the admin GET /api/admin/tokens/values route returns `definitionSlug: ''` for all values, making it impossible for the admin UI to display which definition a value belongs to without a secondary lookup. This was identified as W-002 in the code review and documented in TC-U-031 in phase-4-qa.md. Before production, fix `findAllActive()` to either expand the lookup (`$expand=qdb_TokenDefinitionId($select=qdb_slug)`) or perform a secondary resolution in the service layer. Verifiable: GET /api/admin/tokens/values returns non-empty `definitionSlug` values for all records in the admin UI.

---

### Open Questions (do not block staging; must be resolved before production)

**OQ-001 — Publish model:** Written confirmation from QDB IT Director on staging window vs. instant publish required before production deployment. Covered by C-PRD-001.

**OQ-002 — Level 5 approval policy:** Written confirmation from QDB Compliance on whether service-owner token overrides require secondary approval before go-live. Covered by C-PRD-002.

**OQ-003 — Redis availability and region:** Written confirmation from QDB IT/DevOps on Redis availability and deployment region in production. Covered by C-PRD-003 and C-PRD-005.

**OQ-005 — Final brand token values:** QDB design team must deliver final brand values (colours, typography, spacing) before the production provisioning run. Covered by C-PRD-007.

---

## Commendations

**Resolution algorithm correctness.** The five-level specificity scoring in `TokenResolutionService.ts` is cleanly implemented. The locale exclusion rule (a value with `qdb_locale = 'en'` is not selected when context locale is `ar`) is correct and thoroughly tested across 17 unit tests. This is the core of the system and it is right.

**CSS injection defence.** The dual-layer defence — write-time rejection in `TokenValueService.sanitizeCssValue()` (throws on `url(`, `expression(`, `import(`) combined with read-time neutralisation in `cssUtils.sanitiseResolvedMap()` (converts rather than throws, so a malicious value that bypassed the write path does not crash the portal) — is the correct design for a government portal. This is better than many production systems in this class.

**Service-owner scoping.** The decision to derive `qdb_ServiceSlug` exclusively from the JWT-resolved RBAC role, never from the request body, is the right security choice. An attacker with a valid service-owner JWT cannot write to another service's token namespace. The implementation correctly enforces this at both the create and delete paths.

**Staging window model.** The explicit publish gate (ADR-003-002) is the right default for a government portal. Design teams need to preview changes before they affect the live portal. The draft/live cache separation cleanly implements this without complicating the resolution algorithm.

**ADR coverage.** Seven ADRs covering every significant architectural decision — the cache strategy, publish model, Level 5 approval, SSR context contract, icon-mirror CSS format, 200-token ceiling, and publish debounce — provide a clear paper trail for every choice made. This is the standard expected for a government client engagement.

**Publish debounce and lock.** The 10-second minimum interval with Redis SET NX lock (ADR-003-007) correctly prevents Dataverse flooding from concurrent publish calls. The 60-second lock TTL auto-releases if a publish crashes mid-flight, which is the right safety valve.

---

## Rationale

**On the five-level cascade design:** The architecture correctly answered Skeptic Challenge 8 (phase-3-arch.md Section 18) — the static CSS-in-config alternative was implicitly rejected by delivering the Dataverse-backed dynamic system. The admin UI (C-STG-008) is the business justification for that choice. Without the admin UI, the Skeptic Challenge holds. The admin UI must therefore be treated as a staging gate, not a post-launch improvement.

**On the publish audit trail gap (Finding 3.5):** This is the highest-priority governance finding. The `qdb_PublishedOn` and `qdb_PublishedBy` fields were designed into the schema (phase-3-arch.md Section 6.3) specifically to support audit reconstruction of "what was live at time T." That the batch-PATCH in `publish.ts` was never implemented means the regulatory purpose of those fields is entirely defeated. The auditor correctly identified this as a governance gap, not a cosmetic issue. C-STG-004 is non-negotiable.

**On the three OQ items:** OQ-001 and OQ-002 were conditions of the original BRD approval and have been open through all subsequent phases. They do not block staging because the staging window and no-approval assumptions are both internally consistent designs that can be demonstrated and tested. However, they cannot remain unresolved past production deployment — a QFC-regulated entity cannot go live on assumed governance policy. The CEO is placing these explicitly in C-PRD-001 and C-PRD-002 and they must be tracked as open blockers with named QDB stakeholder owners and target response dates.

**On the Redis implementation gap (B-004):** The auditor's finding is binary — if `REDIS_URL` is set, the API crashes. This is a startup crash, not a degraded-mode issue. The NodeCache fallback works for single-instance deployments but the architectural intent (ADR-003-001) is Redis for production. The staging gate requires Redis to be implemented because staging must mirror production cache behaviour. Running staging on NodeCache while production would use Redis creates an untested production configuration.

**On the W-002 defect:** The `definitionSlug: ''` defect does not affect token resolution (resolution uses IDs, not slugs) and therefore does not block staging. However, it does make the admin UI non-functional for its primary display purpose — showing which definition a value belongs to. This is a production gate condition because the admin UI requires it to be usable.

**On the BOOLEAN_TOKEN_SLUGS hardcoding (Finding 6.3):** The auditor flags this as a gap between ADR-003-005's stated intent ("configuration-driven") and the actual implementation (hardcoded Set). This is noted but is not elevated to a staging or production condition because: (a) there is currently only one direction-type token (`icon-mirror`), (b) adding a new direction token requires a code deployment regardless under the current architecture, and (c) making this configuration-driven is a Phase 2 improvement. It is recorded in the Phase 2 backlog.

**On the console.error monitoring gap (SEC-08):** Accepted as a known limitation of the Next.js RSC runtime. `pino` is unavailable in the RSC layer. The tech debt ticket must be raised for a Phase 2 OpenTelemetry integration. This is a monitoring gap, not a functional defect. Does not block staging or production in Phase 1.

---

**Final statement:** DXP-P1-003 is approved to proceed to implementation completion and staging. The eight staging gate conditions (C-STG-001 through C-STG-008) define exactly what must be built and verified before any staging deployment. The eight production gate conditions (C-PRD-001 through C-PRD-008) define what must be resolved before the Qatar Development Bank portal goes live with this system. No shortcuts on the publish audit trail, no staging without Redis implemented, no production without OQ-001 and OQ-002 formally answered by named QDB stakeholders.

---

```
===================================================
END OF DOCUMENT
DXP-P1-003 Theme Tokens — Phase 7 CEO Final Decision
Maqsad AI — CEO Agent
2026-06-21
===================================================
```
