# DXP-P1-003 — Governance and Security Audit

**Engagement:** DXP-P1-003 — Theme Token System
**Phase:** 5 — Governance and Security Audit
**Auditor:** Auditor Agent, Maqsad AI
**Date:** 2026-06-21
**Status:** Complete — Pending CEO Phase 5 → 7 gate

---

## Executive Summary

The DXP-P1-003 Theme Token System is a well-structured implementation. The core security
controls — JWT enforcement, CSS injection defence (write-time and read-time), service-slug
scoping, input validation at all boundaries, and structured audit logging — are correctly
implemented. The technology stack is sound, code quality is high, and the two-phase
cache architecture is appropriately designed.

However, **four conditions must be met before any staging or production deployment:**

1. **B-004 (CRITICAL):** `RedisTokenCache` is not implemented. Setting `REDIS_URL` in any
   deployed environment will cause an immediate startup crash. Production requires Redis for
   multi-instance cache coherence. This is the single most significant go-live blocker.

2. **B-002 (HIGH):** Redis `maxmemory-policy allkeys-lru` is not documented in the DevOps
   runbook. Without it, an unbounded cache key set (legitimate or adversarial) can exhaust
   Redis memory and bring down all portal SSR rendering.

3. **G-001 (HIGH):** The Dataverse provisioning script is not built. No staging deployment
   is possible until the schema exists on Dataverse. This is a hard pre-requisite.

4. **OQ-001 / OQ-002 / OQ-003 (MEDIUM):** Three open questions require formal QDB stakeholder
   confirmation before the architecture assumptions can be locked. Without these answers,
   there is a material risk that the published design is misaligned with QDB's governance policy.

The verdict is **APPROVED WITH CONDITIONS**. Go-live clearance is conditional on the
four items above and the twelve ranked conditions in Section 8.

---

## 1. Security Risk Register

---

### SEC-01 — Redis Implementation Not Present (Startup Crash in Production)

- **Risk ID:** SEC-01
- **Description:** `createTokenCacheService.ts:32` throws a descriptive `Error` if `REDIS_URL`
  is set. `RedisTokenCache.ts` does not exist. Any production deployment that sets `REDIS_URL`
  will crash at startup. Without Redis in production, multi-instance deployments share no live
  cache — a publish call flushes only the receiving instance's in-process NodeCache; all other
  API instances continue serving stale tokens until their 300s TTL expires.
- **Likelihood:** High — production deployments must set `REDIS_URL` per ADR-003-001.
- **Impact:** High — loss of cache coherence in multi-instance deployment; portal may serve
  stale tokens up to 5 minutes after publish with no visibility.
- **Mitigation:** Implement `RedisTokenCache.ts` using `ioredis` with `SCAN`-based pattern
  delete (per the contract in `ITokenCacheService.ts` and the Redis key scheme in
  `phase-3-arch.md` Section 8.2) before any staging deployment. Remove the startup guard in
  `createTokenCacheService.ts:32–34` once implemented.
- **Residual risk after mitigation:** Low — distributed lock and shared cache address
  multi-instance coherence.

Confidence: 99%

---

### SEC-02 — Unbounded Redis Memory Growth (Cache Key Explosion)

- **Risk ID:** SEC-02
- **Description:** Context keys have 5 dimensions. A misconfigured or adversarial client
  calling `GET /api/tokens/resolve` with novel `service`, `category`, and `componentSlug`
  combinations will create new resolved-map cache entries in Redis indefinitely. The
  `token:live:<contextKey>` key space is unbounded. Without `maxmemory` and `allkeys-lru`
  configured on the Redis server, Redis will consume all available memory and crash (or the
  OS will OOM-kill it), bringing down portal SSR rendering for all users.
- **Likelihood:** Medium — requires adversarial enumeration or a high-traffic portal with many
  valid contexts. At 20 services × 50 components × 3 render targets × 3 locales × 5 categories
  = 45,000 possible keys × ~10 KB = 450 MB worst-case.
- **Impact:** High — Redis OOM crash causes all live cache to fail; every SSR render hits
  Dataverse directly (300–500 ms latency); Dataverse may then rate-limit the service principal.
- **Mitigation:** Add `maxmemory <N>mb` and `maxmemory-policy allkeys-lru` to the Redis
  configuration before production deployment. Document in DevOps runbook. Recommended value:
  `maxmemory 512mb` for Phase 1 scope (200 definitions). Also consider adding rate-limiting
  or allow-listing on the query parameters accepted by `GET /api/tokens/resolve` to reject
  unknown service slugs at the API boundary.
- **Residual risk after mitigation:** Low — LRU eviction prevents OOM; portal degrades
  gracefully to Dataverse on eviction.

Confidence: 95%

---

### SEC-03 — CSS Injection via Dataverse Direct Write (Bypass of Write-Time Sanitiser)

- **Risk ID:** SEC-03
- **Description:** `TokenValueService.sanitizeCssValue()` runs only through the API write
  path. A Dataverse system administrator with direct entity access (e.g. using the Dynamics
  make.powerapps.com interface, a Power Automate flow, or the Dataverse CLI) can write a token
  value containing `url(https://evil.com/malware.js)` or `expression(alert(1))` directly to
  `qdb_token_values.qdb_value`, bypassing the API entirely. These values are then read by the
  cache-warming path and served to the portal.
  The read-time sanitiser in `cssUtils.sanitiseResolvedMap()` (applied in `resolve.ts:63` and
  `service/tokens.ts:92`) does mitigate this: `url(` becomes `url-blocked(` and `expression(`
  becomes `expression-blocked(`, neutralising the attack at the point of serving.
  The remaining risk is that the neutralisation is not an explicit rejection — it silently
  transforms the value. If a future code change removes or bypasses `sanitiseResolvedMap()`,
  the defence collapses.
- **Likelihood:** Low — requires Dataverse admin-level access, which is already privileged.
- **Impact:** High — CSS injection in the portal's `:root` block could be used for UI
  redressing, data exfiltration via CSS attribute selectors, or (in some browser configurations)
  script execution via CSS expressions. On a government portal this is a reputational risk.
- **Mitigation:** Current read-time sanitisation is correctly applied. Additionally: (a) add a
  Dataverse plugin on `qdb_token_values` PreCreate/PreUpdate that enforces the same sanitisation
  rules at the database write layer, making it platform-enforced rather than API-enforced;
  (b) add an alerting rule that fires when `sanitiseResolvedMap` neutralises a value (log the
  slug and the raw value at WARN level so a SIEM can detect it); (c) restrict who holds
  Dataverse system admin access to a minimal set.
- **Residual risk after mitigation:** Low — dual-layer defence with alerting.

Confidence: 92%

---

### SEC-04 — Shared Revalidation Secret — Flat Credential, No HMAC Signing

- **Risk ID:** SEC-04
- **Description:** `POST /api/revalidate` (`apps/web/src/app/api/revalidate/route.ts:32–34`)
  is protected by a static shared secret in the `x-revalidate-secret` header. If this secret
  leaks (via logs, environment variable export, a compromised CI secret store, or a developer
  workstation), an attacker can trigger repeated ISR revalidation of all portal pages. This is
  a DoS vector: repeated `POST /api/revalidate` with `path: '/'` will cause Next.js to
  continuously invalidate and rerender all pages from the SSR pipeline.
  The secret is enforced with a minimum 16-character length (`config.ts:43`) but is otherwise
  a flat comparison. There is no HMAC, no nonce, and no replay prevention.
  The secret is also visible to any process reading the `NEXTJS_REVALIDATE_SECRET` environment
  variable on the Next.js server. If the Fastify API and Next.js app share a deployment
  platform (e.g. same server or same container group), the secret provides no meaningful
  separation.
- **Likelihood:** Low — requires secret exfiltration.
- **Impact:** Medium — DoS via revalidation storm; no portal data is exposed.
- **Mitigation:** (a) Minimum secret length should be increased to 32 characters (update
  `config.ts:43`). (b) Add a request rate limit on `POST /api/revalidate` (e.g. 10 requests
  per minute from any single IP). (c) Log every call to `POST /api/revalidate` with IP and
  User-Agent for SIEM monitoring. (d) In future, replace with HMAC-SHA256 signing of the
  request body with a timestamp to provide replay protection. For Phase 1, the current
  implementation is acceptable if (a) and (b) are addressed.
- **Residual risk after mitigation:** Low — rate limiting prevents revalidation storms.

Confidence: 85%

---

### SEC-05 — Service-Owner Can Read Live Tokens for Its Own Service Without Restriction

- **Risk ID:** SEC-05
- **Description:** `GET /api/service/tokens` returns the resolved live token map for the
  caller's service. This is an authenticated endpoint (JWT + `service-owner` role required),
  but the resolved map includes **all global, render-target, category, and component tokens**
  that apply in the context of that service — not just the Level 5 values the service-owner
  wrote. A service-owner for `loan-services` receives the same complete token set that the
  public `GET /api/tokens/resolve?service=loan-services` endpoint would return, without any
  additional access gate. This is by design, but it means a service-owner can enumerate all
  portal-level token values (colors, typography, spacing) that QDB may consider internal
  configuration.
- **Likelihood:** Low — service-owners are trusted internal QDB service teams.
- **Impact:** Low — CSS design tokens contain no PII or business-sensitive data; they are
  visual configuration only.
- **Mitigation:** Accept as designed. Document the information disclosure scope in the service
  agreement with QDB service teams. If QDB requires that service-owners see only Level 5 values
  they own, add a filtering flag to `GET /api/service/tokens` that returns only
  `qdb_level = 860005015` records.
- **Residual risk after mitigation:** Low.

Confidence: 80%

---

### SEC-06 — `publishedBy` Field is Free-Text String, Not a Verified User Reference

- **Risk ID:** SEC-06
- **Description:** `qdb_token_values.qdb_publishedby` is a `String(100)` field set during the
  batch-PATCH publish flow (arch doc Section 9, Step 9). The value is the `userId` from the
  JWT `sub` claim. The batch-PATCH is fire-and-forget after the 204 response is returned
  (`publish.ts:96–106`). If the batch-PATCH fails silently, `publishedBy` on some value records
  will not be updated, leaving stale `publishedBy` data in Dataverse. This weakens the publish
  audit trail.
  Additionally, the Skeptic Review (arch doc Section 18, Challenge 2) acknowledges that
  `publishedOn/By` is best-effort metadata, not a guaranteed audit field. This must be
  explicitly stated in the governance documentation so that a regulator does not rely on it
  as the authoritative publish audit record.
- **Likelihood:** Medium — fire-and-forget batch-PATCH failure is possible under Dataverse
  load or network transient errors.
- **Impact:** Medium — incomplete publish audit trail; regulatory examination could surface
  gaps between `modifiedon` (always reliable) and `qdb_publishedon/by` (best-effort).
- **Mitigation:** (a) Log the fire-and-forget batch-PATCH result (success or failure) at WARN
  level so gaps are visible in observability tooling. (b) Document explicitly in the data
  dictionary and governance runbook that `qdb_publishedon` / `qdb_publishedby` are
  supplementary metadata and that Dataverse system `modifiedon` / `modifiedby` are the
  authoritative audit fields for regulatory purposes. (c) Create a daily reconciliation
  diagnostic that flags any active `qdb_token_values` records where `qdb_isactive = true` and
  `qdb_publishedon` is null despite `qdb_publishedon` being expected after first publish.
- **Residual risk after mitigation:** Low.

Confidence: 88%

---

### SEC-07 — Admin UI Not Built — Publish Action Surface Not Audited

- **Risk ID:** SEC-07
- **Description:** Phase 4 tech doc Section 4.2 (items 30–33) defers the admin UI to the
  frontend agent. The admin UI (token definitions grid, value management panel, publish button,
  draft preview) is not built. This means the publish action and token management actions are
  currently only accessible via raw API calls. There is no UI-layer input guard, confirmation
  dialog, or double-confirmation for the publish action. A portal-admin can publish a destructive
  token change with a single API call.
  From a governance perspective, the absence of the admin UI also means there is no controlled
  operator workflow for the QDB design team — any token change requires direct API access,
  which introduces a risk of operator error.
- **Likelihood:** Medium — design team operations during rollout phase.
- **Impact:** Medium — accidental destructive publish; no UX-layer friction for high-impact
  publish action.
- **Mitigation:** The frontend agent must implement the admin UI before the system is handed
  to QDB's design team. The publish button must include a confirmation dialog. The admin UI
  is a go-live blocker for QDB operator use.
- **Residual risk after mitigation:** Low.

Confidence: 90%

---

### SEC-08 — `console.error` in Next.js RSC — Token Fetch Failures Not Structurally Logged

- **Risk ID:** SEC-08
- **Description:** `resolveTokens.ts:49,54` uses `console.error` for network errors and
  non-ok responses when fetching the token map. This violates the project coding standard
  (`.claude/rules/common.md`: "No `console.log` in committed code. Use structured logger").
  The Phase 4 tech doc (Section 7) documents this as intentional because pino is unavailable
  in the Next.js RSC runtime, but this means token fetch failures produce unstructured log
  output that is invisible to pino-based observability (Datadog, Azure Monitor). A token
  fetch failure causes the portal to render without any CSS variables — a critical visual
  regression — and the only signal is an unstructured `console.error` line in the Next.js
  stdout.
- **Likelihood:** Low — token API is internal and expected to be highly available.
- **Impact:** High — silent CSS regression on portal; no structured alert fires.
- **Mitigation:** (a) Add an `OTEL_EXPORTER_OTLP_ENDPOINT` or equivalent telemetry hook to the
  Next.js app that captures `console.error` and routes it to the structured observability
  platform. (b) In the layout component, inspect whether `tokenMap` is empty and emit a visible
  error indicator in development mode. (c) Document in the runbook that `console.error` from
  `[tokens]` prefix in Next.js stdout is a critical signal requiring immediate investigation.
- **Residual risk after mitigation:** Medium — structural limitation of Next.js RSC runtime.

Confidence: 90%

---

### SEC-09 — Token Definition `defaultValue` PATCH Does Not Trigger Live Cache Rebuild

- **Risk ID:** SEC-09
- **Description:** `PATCH /api/admin/tokens/definitions/:slug` allows updating `defaultValue`.
  The arch doc (Section 9, PATCH route) states: "Changing `defaultValue` does not automatically
  trigger a cache rebuild — the caller is expected to call publish if the defaultValue change
  should take immediate live effect." However, `defaultValue` is the final fallback in the
  resolution algorithm: when no value record matches any context, `definition.qdb_defaultvalue`
  is returned. A change to `defaultValue` is therefore a live change to the resolved token map
  that has no invalidation mechanism other than TTL expiry (300s) or a manual publish.
  If a portal admin updates `defaultValue` expecting the change to be visible in the live portal,
  they will see no effect for up to 5 minutes with no explanation in the UI.
  From an audit perspective: `defaultValue` changes are not reflected in `qdb_PublishedOn` /
  `qdb_PublishedBy` because the publish flow only updates `qdb_token_values`, not
  `qdb_token_definitions`. A regulatory examiner reconstructing "what was the live token set
  at time T" cannot determine whether a `defaultValue` was changed between publishes.
- **Likelihood:** Medium — design team will use the admin UI to update token defaults.
- **Impact:** Medium — governance gap in audit reconstruction; UX confusion for operators.
- **Mitigation:** (a) Add draft cache flush to `PATCH /api/admin/tokens/definitions/:slug`
  service method when `defaultValue` changes. (b) Add a note in the admin UI indicating that
  `defaultValue` changes require a publish to take effect. (c) Add a dedicated
  `qdb_DefinitionModifiedOn` audit log entry for `defaultValue` changes to support audit
  reconstruction at time T. (d) Document in the data dictionary that `defaultValue` changes
  to `qdb_token_definitions` records are governed by `createdon`/`modifiedon` system fields.
- **Residual risk after mitigation:** Low.

Confidence: 85%

---

### SEC-10 — No Dataverse Audit Log Enabled Explicitly for Token Entities

- **Risk ID:** SEC-10
- **Description:** Dataverse provides entity-level auditing (Dataverse Audit Log) that records
  every create, update, and delete operation with user identity, timestamp, and field-level
  diff. The provisioning script structure (`provision-schema/`) does not include an audit
  configuration step to enable field-level auditing on `qdb_token_definitions` and
  `qdb_token_values`. Without explicit audit enablement, Dataverse auditing may rely on the
  org-level default setting, which may be off or configured only at entity level for pre-existing
  entities.
  For a government portal, the ability to reconstruct "who changed what token value, when" is
  a regulatory requirement under the Qatar cybersecurity framework.
- **Likelihood:** Medium — Dataverse audit is org-level and may already be enabled; but
  it is not confirmed to be enabled for these specific new entities.
- **Impact:** High — if auditing is not enabled, there is no tamper-proof record of token
  value changes beyond the API's observability logs, which are not append-only.
- **Mitigation:** (a) Add an audit configuration step to the provisioning script that enables
  field-level auditing for both `qdb_token_definitions` and `qdb_token_values` using the
  `EntityDefinitions` PATCH API (`IsAuditEnabled: true`). (b) Confirm in the DevOps runbook
  that org-level Dataverse auditing is enabled for the production environment. (c) Document
  the Dataverse audit log retention period and export procedure.
- **Residual risk after mitigation:** Low.

Confidence: 88%

---

## 2. OWASP Top 10 Assessment

| # | Category | Applicable? | Mitigation | Gaps |
|---|---|---|---|---|
| A01 — Broken Access Control | Yes | JWT authentication on all admin and service-owner routes. `app.authenticate` + `app.requireRole` preHandlers enforced per route group. Service-owner slug extracted from JWT (server-side), never from request body. `portal-admin` and `service-owner` are mutually exclusive role checks. | No privilege escalation path identified. SEC-05 documents information disclosure scope. |
| A02 — Cryptographic Failures | Yes | JWT secret enforced as 32+ chars (`config.ts:16`). `NEXTJS_REVALIDATE_SECRET` enforced as 16+ chars (SEC-04 recommends raising to 32). `CLIENT_SECRET` validated as non-empty. No token data in logs. `REDIS_URL` validated at startup. | `NEXTJS_REVALIDATE_SECRET` minimum length should be raised to 32 chars. |
| A03 — Injection | Yes | SQL injection: not applicable (Dataverse OData, parameterised queries only via HTTP). CSS injection: write-time sanitiser (`TokenValueService.sanitizeCssValue`) and read-time sanitiser (`cssUtils.sanitiseResolvedMap`) both implemented. Zod schema validation at all API boundaries. No `eval()` usage identified. | None. Both sanitisation layers are confirmed present in code. |
| A04 — Insecure Design | Yes | Staging window model (ADR-003-002) provides controlled publish. Service-owner cannot publish directly. Publish debounce (ADR-003-007) prevents flooding. Soft-delete only — no hard DELETE. | OQ-002 (Level 5 approval) is an assumed default. If QDB requires approval flow, current design has no approval gate. Must be formally confirmed. |
| A05 — Security Misconfiguration | Yes | Environment schema validated at startup via Zod. `REDIS_URL` triggers descriptive error if set before Redis implementation is complete. Hardcoded GUIDs absent — option set codes in `TokenTypes.ts` are legitimate constants, not configuration. | B-002: Redis `maxmemory-policy` not in runbook. B-004: Redis not implemented. These are misconfiguration risks. |
| A06 — Vulnerable Components | Yes | Stack: Node.js + Fastify + Next.js + NodeCache. No `ioredis` dependency yet (not a risk until B-004 is addressed). | Dependency review (npm audit) not performed in this audit. Recommend running `npm audit` and resolving any high/critical CVEs before staging. |
| A07 — Identification and Auth Failures | Yes | JWT validation via `app.authenticate` (existing P1-001/P1-002 pattern). JWT secret 32+ chars. Token TTLs configurable (`ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_SECONDS`). No unauthenticated access to write routes. | `GET /api/tokens/resolve` is intentionally unauthenticated (public SSR endpoint). This is by design and correctly documented. |
| A08 — Software Integrity Failures | Partial | No dependency pinning review performed. Provisioning script runs Dataverse OData calls — no integrity check on Dataverse response shape. | Provisioning script (G-001) not built — cannot audit. Recommend adding response shape validation in provisioning script. |
| A09 — Logging and Monitoring Failures | Yes | Structured pino logging on all API route handlers. `correlationId`, `userId`, `operation`, `contextKey` logged per request. Cache miss events logged at `info` level. Publish start/complete logged. | `console.error` in Next.js RSC (SEC-08). No SIEM alerting rule defined for CSS value neutralisation events (SEC-03 mitigation). No structured alert defined for empty token map returned to SSR layout. |
| A10 — Server-Side Request Forgery (SSRF) | Low | `triggerNextRevalidation()` in `publish.ts:147–169` constructs a URL from `NEXTJS_BASE_URL` env var and calls it with `fetch()`. If `NEXTJS_BASE_URL` is misconfigured to point to an internal network endpoint, the Fastify API would make an SSRF call. `NEXTJS_BASE_URL` is validated as a URL by Zod (`config.ts:42`) but not restricted to an allow-list of expected targets. | Add allow-list validation: `NEXTJS_BASE_URL` must match the expected Next.js app hostname pattern. Log the target URL on every revalidation call (already done in `publish.ts:163`). |

---

## 3. Code Audit — 7 Passes

### Pass 1 — Wiring

**Finding 1.1 — MISSING ROUTE: Service token values DELETE is registered but service/tokens.ts also handles POST; cross-check with app.ts registration.**

Severity: INFO
The file `routes/service/tokens.ts` implements all three service-owner routes
(`GET /api/service/tokens`, `POST /api/service/tokens/values`,
`DELETE /api/service/tokens/values/:id`) in a single route plugin. The phase-4-tech.md file
index (Section 5) lists `routes/service/tokens.ts` for `GET/POST/DELETE`. Wiring appears
complete. No orphaned routes identified.
Confidence: 90%

**Finding 1.2 — WARNING: `GET /api/service/tokens` returns the live resolved map but does NOT apply `sanitiseResolvedMap()` for the `portal-admin` preview endpoint.**

`routes/admin/tokens/preview.ts` is referenced in the file index but not read in this audit.
The Phase 4 tech doc (Section 2, B-003 RESOLVED) states sanitisation was applied to both
`resolve.ts` and `preview.ts`. `resolve.ts:63` confirms sanitisation applied.
`service/tokens.ts:92` confirms sanitisation applied.
`preview.ts` was not independently verified in this session. Recommend the next agent confirms
`sanitiseResolvedMap()` is applied in `routes/admin/tokens/preview.ts`.

Severity: WARNING
`file: apps/api/src/routes/admin/tokens/preview.ts` — verify `sanitiseResolvedMap()` is called
before return.
Confidence: 82%

**Finding 1.3 — INFO: `NEXTJS_REVALIDATE_SECRET` is optional in config.ts — if absent, revalidation is silently skipped.**

`publish.ts:96` guards `if (nextjsBaseUrl && nextjsRevalidateSecret)`. If either env var is
absent, no revalidation occurs and no warning is logged. In production, a misconfigured
deployment (secret absent) will silently skip revalidation and leave the portal serving stale
tokens indefinitely after publish. Add a startup warning log if `NEXTJS_BASE_URL` is set but
`NEXTJS_REVALIDATE_SECRET` is absent or vice versa.

Severity: WARNING
`file: apps/api/src/config.ts:42–43`
Confidence: 88%

---

### Pass 2 — Error Handling

**Finding 2.1 — WARNING: Fire-and-forget batch-PATCH for `publishedOn/By` has no logging path.**

`publish.ts` does not implement Step 9 from the architecture (batch-PATCH of `qdb_PublishedOn`
and `qdb_PublishedBy` on all active value records). The architecture states this is
fire-and-forget after 204. The code returns 204 after `setLastPublishedAt()` and the
revalidation call only — no batch-PATCH code is present in `publish.ts`.
This means `publishedOn` and `publishedBy` fields are **never written** in the current
implementation. The publish audit trail in Dataverse (`qdb_publishedon`/`qdb_publishedby`) is
non-functional. This is a governance gap (SEC-06).

Severity: WARNING
`file: apps/api/src/routes/admin/tokens/publish.ts` — no batch-PATCH implementation present.
Confidence: 95%

**Finding 2.2 — WARNING: `resolveTokens.ts` returns `{}` (empty map) on failure with no retry.**

`resolveTokens.ts:48–57`: On network error or non-ok response, an empty map is returned.
The layout then renders `buildCSSCustomProperties({})` which produces an empty `:root { }` block.
Every CSS variable in the portal resolves to its browser fallback value or is unstyled. There
is no retry, no circuit breaker, and no monitoring hook. Graceful degradation is the correct
behaviour but it must produce a visible alert.

Severity: WARNING
`file: apps/web/src/lib/tokens/resolveTokens.ts:48–57`
Mitigation: Add a server-side telemetry event (OpenTelemetry or Azure Monitor custom metric)
when the empty map is returned. This enables alerting on degraded portal rendering.
Confidence: 90%

**Finding 2.3 — INFO: `enforceRateLimitOrThrow` in `publish.ts` does not set the `Retry-After` HTTP header.**

The arch doc (ADR-003-007) specifies `429 with Retry-After header`. `TokenPublishRateLimitedError`
carries `retryAfterMs` but the route handler catches this error via the global error handler.
The global error handler must read `err.retryAfterMs` and set the `Retry-After` header.
This cannot be confirmed without reading `app.ts` global error handler. Recommend verification.

Severity: INFO
`file: apps/api/src/services/tokens/TokenErrors.ts:151–157`
Confidence: 80%

---

### Pass 3 — Completeness

**Finding 3.1 — CRITICAL: `RedisTokenCache.ts` does not exist. Production cache is not implemented.**

`createTokenCacheService.ts:32` explicitly throws if `REDIS_URL` is set. No `RedisTokenCache.ts`
file exists in `apps/api/src/services/tokens/`. Production deployments cannot use Redis.
This is tracked as B-004 and is a release blocker.

Severity: CRITICAL
`file: apps/api/src/services/tokens/createTokenCacheService.ts:32`
Confidence: 99%

**Finding 3.2 — CRITICAL: Provisioning script (`projects/dxp-p1-003/scripts/provision-schema/`) does not exist.**

No schema provisioning means Dataverse entities `qdb_token_definitions` and `qdb_token_values`
do not exist in any environment. No API route can function without the schema. This is tracked
as G-001 and is a release blocker.

Severity: CRITICAL
Confidence: 99%

**Finding 3.3 — WARNING: Supertest integration tests not written.**

Phase 4 tech doc (Section 4, item 38): "Supertest integration tests — Not yet — pending
B-001/B-003 fixes." B-001 and B-003 are resolved but integration tests were not written.
Without integration tests, end-to-end route coverage is not confirmed.

Severity: WARNING
`file: apps/api/src/routes/**` — no `*.integration.test.ts` files found.
Confidence: 95%

**Finding 3.4 — WARNING: Admin UI (token management pages) not built.**

Items 30–34 in the Phase 4 build checklist are deferred. QDB design team cannot operate the
system without the admin UI. SEC-07 covers the governance aspect.

Severity: WARNING
Confidence: 99%

**Finding 3.5 — WARNING: `publishedOn`/`publishedBy` batch-PATCH not implemented.**

See Finding 2.1. The `qdb_PublishedOn` and `qdb_PublishedBy` fields exist in the schema and
are referenced in the arch doc and data model but are never written in the implementation.

Severity: WARNING
`file: apps/api/src/routes/admin/tokens/publish.ts` — entire Step 9 is absent.
Confidence: 95%

---

### Pass 4 — Dead Code

**Finding 4.1 — INFO: `TokenDefinition` domain type does not include `createdBy`/`modifiedBy` user display name.**

`TokenTypes.ts:51–61` defines `TokenDefinition` with `createdOn` and `modifiedOn` as strings
but omits `createdBy`/`modifiedBy`. These are available as `Lookup(systemuser)` system fields
in Dataverse. The admin UI will likely need these for display. Not dead code per se, but a
completeness gap in the domain type that will require a non-trivial addition when the admin
UI is built.

Severity: INFO
`file: apps/api/src/services/tokens/TokenTypes.ts:51–61`
Confidence: 80%

**Finding 4.2 — PRUNE: `ITokenCacheService.flushLiveCache()` vs `flushAllResolvedMaps('live')` — overlapping semantics.**

`NodeCacheTokenCache.flushLiveCache()` calls `this.liveCache.flushAll()` — nukes all live cache
including raw records. `flushAllResolvedMaps('live')` only deletes resolved context map keys
while preserving raw records. The arch doc publish flow uses `flushAllResolvedMaps('live')`
(correct — preserve raw records after setting them). `flushLiveCache()` is defined in the
interface but not used by the publish flow. If a future developer calls `flushLiveCache()` in
the publish route, raw records are also evicted, causing an unnecessary Dataverse round-trip
on the next request. The two methods should be clearly documented with usage guidance to
prevent misuse.

Severity: PRUNE
`file: apps/api/src/services/tokens/ITokenCacheService.ts` — add JSDoc to both methods
clarifying their distinct scopes.
Confidence: 82%

---

### Pass 5 — Bloat

**Finding 5.1 — INFO: `TokenTypes.ts` is a single 100+ line file combining types, Zod schemas, and option set constants.**

This is documented as intentional ("matches established pattern in codebase") and is within
the 400-line file limit. No action required.

Confidence: 85%

**Finding 5.2 — INFO: `TokenQueryService.ts` correctly extracts the shared cache-first resolution pattern from three routes.**

The `resolveTokenMap` extraction is a clean application of DRY. No bloat identified.

---

### Pass 6 — Hardcoding

**Finding 6.1 — INFO: Option set integer codes (e.g. `860005001`) are defined as named constants in `TOKEN_TYPE`, `TOKEN_LEVEL`, `TOKEN_CATEGORY`.**

These are Dataverse provisioned codes — they are legitimately fixed constants, not runtime
configuration values. Storing them in `TokenTypes.ts` as `const` objects is correct.
No hardcoding violation.

**Finding 6.2 — WARNING: `PUBLISH_LOCK_TTL_SECONDS = 60` is hardcoded in `publish.ts:43`.**

The arch doc (ADR-003-007) does not specify this as configurable, but it directly affects
the maximum duration a crashed publish operation can block further publishes. In an incident
scenario, a portal admin may need to reduce this to recover the publish lock faster. This value
should be moved to a `TOKEN_PUBLISH_LOCK_TTL_SECONDS` environment variable with a default of 60.

Severity: WARNING
`file: apps/api/src/routes/admin/tokens/publish.ts:43`
Confidence: 82%

**Finding 6.3 — WARNING: `BOOLEAN_TOKEN_SLUGS` in `injectTokenStyles.ts:7` is a hardcoded set.**

The arch doc (ADR-003-005) states "The `BOOLEAN_TOKEN_SLUGS` set is configuration-driven
(Article V) — future boolean tokens can be added without code changes." However, the current
implementation is a hardcoded `Set(['icon-mirror'])` in the source file. If a new `direction`
token requires the same conversion, a code deployment is needed.
This is a design gap between the ADR intent and the implementation. The set should be loaded
from an environment variable or from the Dataverse token type metadata (token type
`qdb_token_type = direction / 860005008` could be used to identify all tokens requiring
boolean-to-numeric conversion).

Severity: WARNING
`file: apps/web/src/lib/tokens/injectTokenStyles.ts:7`
Confidence: 85%

---

### Pass 7 — Security

**Finding 7.1 — WARNING: CSS sanitiser does not block `@charset`, `@font-face`, or `@namespace` injection.**

`TokenValueService.sanitizeCssValue()` (`TokenValueService.ts:297–309`) blocks `url(`,
`expression(`, and `import(`, and strips `;`. However, a CSS value containing `@charset`
or `@font-face` would not be blocked. These CSS at-rules cannot appear inside a
CSS custom property value (the browser ignores them), so this is a low practical risk.
However, the read-time sanitiser (`cssUtils.ts`) only neutralises `url(`, `expression(`,
and `import(` — if the browser ever changes parsing behaviour, at-rule injection could be
a future vector.

Severity: INFO
`file: apps/api/src/services/tokens/TokenValueService.ts:297–309`
Confidence: 80%

**Finding 7.2 — WARNING: `resolveCallerServiceSlug` in `service/tokens.ts` iterates all roles and takes the first match.**

`service/tokens.ts:171–177`: If a malicious JWT carries multiple `service-owner:*` roles
(e.g. `service-owner:loan-services` and `service-owner:investment`), the first matching role
is used as the service slug. This means a user with two service-owner roles would have their
requests scoped to the first role in the array rather than receiving a 403 or requiring
explicit role selection.
The risk is low because JWT issuance is controlled by the platform (P1-002), but if a JWT is
ever issued with multiple `service-owner:*` roles, the API behaviour is non-deterministic and
the user could inadvertently write to the wrong service.
Mitigation: If more than one `service-owner:*` role is detected in the JWT, return 403 with
error code `ambiguous_service_slug`. This enforces a one-service-per-JWT policy.

Severity: WARNING
`file: apps/api/src/routes/service/tokens.ts:171–177`
Confidence: 85%

**Finding 7.3 — INFO: No `CLIENT_SECRET` rotation procedure documented.**

`config.ts:14`: `CLIENT_SECRET: z.string().min(1)` — the Dataverse service principal secret
is in environment variables. No secret rotation runbook exists. For a government client on Azure,
the service principal secret should be stored in Azure Key Vault and rotated annually (or on
breach). This is a governance gap, not a code gap.

Severity: INFO
Confidence: 88%

**Finding 7.4 — INFO: No rate limiting on `GET /api/tokens/resolve` (public unauthenticated endpoint).**

The public resolution endpoint has no rate limiting. An attacker could enumerate all possible
context key combinations by sending high volumes of requests, filling the Redis cache (SEC-02)
and loading Dataverse on cache misses. With `allkeys-lru` configured on Redis, the risk is
bounded to LRU eviction cycles. Without it (current state), the risk is Redis OOM.
The Zod schema restricts `service`, `category`, and `componentSlug` to `/^[a-z0-9-]+$/` which
limits enumeration to valid slug formats, but the space is still large.
Recommend adding an IP-based rate limit (e.g. 200 requests per minute per IP) on this endpoint.

Severity: INFO
`file: apps/api/src/routes/tokens/resolve.ts`
Confidence: 82%

---

## 4. Compliance Assessment

### 4.1 Qatar PDPPL (Personal Data Protection Law)

| Requirement | Assessment | Gap |
|---|---|---|
| No personal data processed without lawful basis | Token definitions and values contain only CSS strings (colors, fonts, spacing). No PII is stored, transmitted, or cached. `qdb_publishedby` stores a user ID (JWT `sub` claim — a pseudonymous identifier). | Low risk. The user ID in `qdb_publishedby` is a system identifier, not personal data under PDPPL. No gap. |
| Data subject access and deletion rights | Not applicable to CSS token data. User IDs in `qdb_publishedby` are system audit fields, not personal data subject to DSAR. | No gap. |
| Data minimisation | Only required fields are stored. No user behaviour, preferences, or personal characteristics are captured in the token system. | No gap. |
| Breach notification (72-hour) | Not applicable to CSS token data — a breach of token data is not a personal data breach. | No gap. If the API layer is breached and JWT secrets are exposed, that is a personal data breach under PDPPL — but that risk is in the P1-002 JWT system, not in this engagement. |

**PDPPL assessment: Compliant.** The theme token system contains no PII and does not trigger PDPPL obligations beyond those already addressed in the platform.

---

### 4.2 Qatar National Cybersecurity Framework (NCSA)

| Requirement | Assessment | Gap |
|---|---|---|
| Access control (AC domain) | JWT authentication on all write routes. Role-based access (`portal-admin`, `service-owner`). Least-privilege: service-owners can only write to their own service slug. | OQ-002: if QDB's compliance policy requires secondary approval for Level 5 overrides, current design lacks an approval gate. Must be formally confirmed. |
| Asset management | Dataverse entities documented. Data classification defined (CSS strings, no PII). | Provisioning script not built (G-001). Dataverse audit not confirmed enabled (SEC-10). |
| Secure development (SD domain) | Zod validation at all API boundaries. CSS sanitisation dual-layer. No SQL concatenation. No `eval()`. TypeScript strict mode. | `console.error` in RSC (SEC-08). Integration tests missing (Finding 3.3). |
| Incident response | Structured logging via pino. Correlation IDs on all operations. | No SIEM alerting rules defined. No runbook for CSS value neutralisation alert. |
| Cryptographic standards | JWT secret 32+ chars. HTTPS enforced at infrastructure level (not in scope of this audit). | `NEXTJS_REVALIDATE_SECRET` minimum should be raised to 32 chars (SEC-04). |
| Patch management | Dependency audit not performed. | Recommend `npm audit` before staging. |
| Business continuity | Graceful degradation on token API failure (empty map returned). Live cache outlives Dataverse for up to 300s. | Redis not implemented (B-004). Without Redis, multi-instance deployments have no shared cache. Single-instance NodeCache is not a production business continuity strategy. |

**NCSA assessment: Partially compliant.** Material gaps: B-004 (Redis), G-001 (provisioning), SEC-10 (Dataverse audit), OQ-002 (approval policy confirmation).

---

## 5. Data Residency Review

| Data store | Location | Compliant? | Notes |
|---|---|---|---|
| Dataverse (`qdb_token_definitions`, `qdb_token_values`) | `org5869857f.crm4.dynamics.com` — Microsoft Cloud for Government, UAE North / Qatar region | Yes — confirmed in DFE-DXP environment state | Token definitions and values are stored in the Qatar-region Dataverse org. |
| Redis (production) | **Not yet provisioned** | Unknown | B-002 and B-004 blockers. Redis must be provisioned in Qatar Central or UAE North (Azure). The DevOps runbook must explicitly specify the Azure region for Redis provisioning. |
| Next.js app (portal-shell) | Deployment region not specified in this phase | Conditional | The Next.js SSR server must be deployed in the same Qatar-region Azure environment to avoid cross-border token data transmission. The Next.js fetch cache (`next: { revalidate: 300 }`) stores token data on the Next.js server. If the Next.js server is deployed outside Qatar, token data (even CSS strings) crosses the border. |
| NodeCache (in-process, dev/test) | Memory only — ephemeral, no persistence | Yes — dev/test only | Not applicable to production. |
| Fastify API logs (pino) | Log destination not specified | Requires confirmation | Structured logs include `userId`, `correlationId`, `operation`, and `serviceSlug`. These must be shipped to a Qatar-region log aggregator (Azure Monitor in UAE North / Qatar Central). |

**Cross-border transfer risk:** Medium. Redis and Next.js deployment region must be explicitly specified as Qatar Central or UAE North in the DevOps runbook. Without this specification, a cloud DevOps engineer may provision in the nearest available region (e.g. West Europe), which would violate QDB's data residency requirements.

**Recommendation:** Add a data residency section to the DevOps runbook specifying: (a) Redis must be Azure Cache for Redis provisioned in Qatar Central or UAE North, (b) Next.js app must be deployed in an App Service / Container App in the same region, (c) Log analytics workspace must be in the same region.

---

## 6. Audit Trail Validation

### 6.1 Can Every State Transition Be Reconstructed?

| Event | Audit record | Sufficient? |
|---|---|---|
| Token definition created | Dataverse `createdon` / `createdby` (system fields) | Yes — system fields are immutable. |
| Token definition updated (name, description, defaultValue) | Dataverse `modifiedon` / `modifiedby` (system fields) | Yes — system fields record last modification. Dataverse field-level audit log (if enabled — SEC-10) records the diff. |
| Token definition deactivated | Dataverse `statecode` change; `modifiedon` / `modifiedby` | Yes — soft delete is auditable. |
| Token value created | Dataverse `createdon` / `createdby` | Yes. |
| Token value deactivated | Dataverse `statecode` change; `modifiedon` / `modifiedby` | Yes. |
| Token value published (live cache updated) | `qdb_publishedon` / `qdb_publishedby` on value records | **No — not implemented** (Finding 2.1, Finding 3.5). Current implementation does not write these fields. |
| Publish action triggered | Fastify structured log entry (`operation: admin.tokens.publish.complete`, `userId`) | Partial — log entries are not append-only and not tamper-proof. |
| Draft cache invalidated | No Dataverse record; log entry only | Partial — draft cache state is ephemeral; not persisted. |

**Verdict: The audit trail is insufficient for regulatory examination.**

The critical gap is that the "publish" event — the moment at which a token set goes live — is not durably recorded in Dataverse. `qdb_publishedon` / `qdb_publishedby` are designed for this purpose but are never written (Finding 3.5). Reconstructing "what was the live token set at time T" requires knowing: (a) which value records were active at time T, and (b) which were in the live cache at time T. Without `qdb_publishedon`, there is no Dataverse record of when each value transitioned from draft to live.

**Remediation required:**

1. Implement the Step 9 batch-PATCH in `publish.ts` — write `qdb_PublishedOn` and `qdb_PublishedBy` on all active value records at publish time.
2. Enable Dataverse field-level auditing for both entities (SEC-10).
3. Create a dedicated `qdb_publish_events` entity (or use Dataverse Audit Log) to record each publish event with: `publishedBy`, `publishedAt`, `definitionCount`, `valueCount`. This provides a durable, tamper-evident publish log independent of the token value records.

### 6.2 Is the Log Tamper-Proof and Append-Only?

**Dataverse system fields** (`createdon`, `modifiedon`, `createdby`, `modifiedby`, `statecode`) are managed by Dataverse and cannot be altered through the OData API. These provide a tamper-resistant audit foundation.

**Dataverse Audit Log** (if enabled per SEC-10) is append-only and cannot be deleted without admin-level access to the Dataverse audit settings. This is the correct mechanism for a regulatory-grade audit trail.

**Fastify pino logs** are not append-only in the current implementation. They are written to stdout and shipped to a log aggregator. If the log aggregator is configured for immutable storage (Azure Monitor with retention lock, or an immutable blob store), they are tamper-resistant. This must be confirmed in the infrastructure configuration.

**Current assessment: Conditional.** Dataverse system fields provide a reliable foundation. The publish audit trail (qdb_publishedon/by) is non-functional. Dataverse audit log enablement is unconfirmed.

---

## 7. Service Account Review

| Service account | Access scope | Least privilege? | Finding |
|---|---|---|---|
| Dataverse service principal (`CLIENT_ID` + `CLIENT_SECRET`) | Read/Write/Delete on `qdb_token_definitions` and `qdb_token_values`. Also used for `qdb_component_definitions` (P1-001), `qdb_portal_configuration` (P1-001), RBAC entities (P1-002). | Partial — a single service principal is used for all DXP platform operations. | The service principal has broader access than strictly required for the token system alone. As the platform grows, the blast radius of a compromised service principal expands. Recommend splitting into per-engagement service principals or using Dataverse Managed Identity with entity-scoped security roles if the environment supports it. |
| Next.js revalidation (shared secret) | Trigger ISR revalidation via `POST /api/revalidate`. No Dataverse access. | Yes — minimal scope (revalidation only). | SEC-04 applies. |
| Redis (no auth currently) | In-process NodeCache only — no Redis service account exists yet. | Not applicable. | B-004 gap: when Redis is provisioned, it must use Azure Cache for Redis with authentication (access key or Entra Identity). Redis without authentication in a production environment is a critical misconfiguration. Document in DevOps runbook. |

**Assessment:** The single Dataverse service principal is an over-privileged accumulation from P1-001 through P1-003. This is a governance risk as the platform grows. For Phase 1 go-live this is acceptable given the controlled deployment environment, but an ADR should be written to address service principal segmentation before Phase 5 (if additional services are added).

---

## 8. Governance Gaps

Ranked by criticality (P0 = release blocker, P1 = must fix before go-live, P2 = should fix before production).

| Rank | ID | Gap | Risk if unaddressed | Remediation |
|---|---|---|---|---|
| 1 | B-004 | `RedisTokenCache` not implemented | Production deployment crashes on startup; multi-instance deployments have no cache coherence | Implement `RedisTokenCache.ts` using `ioredis`; remove startup guard in `createTokenCacheService.ts:32` |
| 2 | G-001 | Provisioning script not built | No Dataverse schema; no API route can function | Build `projects/dxp-p1-003/scripts/provision-schema/` mirroring P1-001 structure; run against dev Dataverse before staging |
| 3 | B-002 | Redis `maxmemory-policy` not in runbook | Redis OOM crash brings down all portal SSR (SEC-02) | Add `maxmemory 512mb` and `maxmemory-policy allkeys-lru` to Redis config; document in DevOps runbook |
| 4 | Finding 3.5 | `publishedOn`/`publishedBy` batch-PATCH not implemented | Publish audit trail non-functional; regulatory examination cannot reconstruct publish history | Implement Step 9 in `publish.ts`; fire-and-forget after 204 response with error logging |
| 5 | SEC-10 | Dataverse entity audit not confirmed enabled | No tamper-proof field-level audit log for token changes | Add audit enablement to provisioning script; confirm in deployment runbook |
| 6 | OQ-001 | Publish model not formally confirmed by QDB IT Director | Architecture may be misaligned with QDB's governance policy | Obtain written confirmation from QDB IT Director; record in BRD addendum |
| 7 | OQ-002 | Level 5 approval policy not confirmed by QDB Compliance | If approval is required, current design has no approval gate | Obtain written confirmation from QDB Compliance; if approval required, implement ADR-003-003A |
| 8 | OQ-003 | Redis availability in production not confirmed | If Redis unavailable, multi-instance cache inconsistency is unmitigated | Obtain written confirmation from QDB IT/DevOps; document single-instance fallback risk if Redis unavailable |
| 9 | SEC-04 | Revalidation secret minimum length should be 32 chars | Shared secret with 16-char minimum is easier to brute-force than 32 chars | Raise `NEXTJS_REVALIDATE_SECRET` minimum to 32 chars in `config.ts:43` |
| 10 | Finding 6.3 | `BOOLEAN_TOKEN_SLUGS` hardcoded — new `direction` tokens require code deploy | ADR-003-005 states this should be configuration-driven | Load boolean slugs from token type metadata or an env var; add direction token type check |
| 11 | Finding 2.1 (B-002 companion) | No SIEM alerting rules defined for CSS neutralisation or empty token map | Silent security events; no operational visibility | Define alerting rules in Azure Monitor / Datadog; log WARN when `sanitiseResolvedMap` neutralises a value |
| 12 | Finding 3.3 | Supertest integration tests not written | Route-level auth failures and validation failures not confirmed | Write integration tests for each route group covering happy path, auth failure, validation failure, publish debounce |

---

## 9. Pre-Production Checklist

### P0 — Release Blockers (must be complete before any deployment)

- [ ] **B-004** — Implement `RedisTokenCache.ts` before setting `REDIS_URL` in any deployed environment
- [ ] **G-001** — Build and run provisioning script against dev Dataverse; verify 11 post-provisioning checks pass
- [ ] **B-002** — Configure Redis `maxmemory 512mb` and `maxmemory-policy allkeys-lru`; document in DevOps runbook
- [ ] **Publishing audit** — Implement Step 9 batch-PATCH in `publish.ts` for `qdb_publishedon`/`qdb_publishedby`
- [ ] **SEC-10** — Enable field-level Dataverse auditing for `qdb_token_definitions` and `qdb_token_values` in provisioning script

### P1 — Must Fix Before Production Go-Live

- [ ] **OQ-001** — Formal written confirmation from QDB IT Director on publish model (staging window vs. instant)
- [ ] **OQ-002** — Formal written confirmation from QDB Compliance on Level 5 approval policy
- [ ] **OQ-003** — Formal written confirmation from QDB IT/DevOps on Redis availability in production environment
- [ ] **Admin UI** — Build token management UI (items 30–34 in build checklist) before handing system to QDB design team
- [ ] **Data residency** — Confirm and document Redis and Next.js deployment regions as Qatar Central or UAE North
- [ ] **SEC-04** — Raise `NEXTJS_REVALIDATE_SECRET` minimum length to 32 chars in `config.ts:43`
- [ ] **Integration tests** — Write Supertest integration tests for all route groups
- [ ] **`preview.ts` sanitisation** — Confirm `sanitiseResolvedMap()` applied in `routes/admin/tokens/preview.ts`
- [ ] **Startup validation** — Add startup WARN log if `NEXTJS_BASE_URL` is set without `NEXTJS_REVALIDATE_SECRET`

### P2 — Should Fix Before Production (Not Blocking)

- [ ] **Finding 7.2** — Return 403 `ambiguous_service_slug` when JWT carries multiple `service-owner:*` roles
- [ ] **Finding 6.3** — Make `BOOLEAN_TOKEN_SLUGS` configuration-driven (loaded from token type metadata)
- [ ] **Finding 6.2** — Move `PUBLISH_LOCK_TTL_SECONDS` to an environment variable
- [ ] **SEC-08** — Add OpenTelemetry/Azure Monitor instrumentation in Next.js app to capture `console.error` structured
- [ ] **SEC-03 (companion)** — Add WARN-level log in `cssUtils.ts` when a value is neutralised
- [ ] **Service principal segmentation ADR** — Document intent to split service principals per engagement
- [ ] **OQ-005** — Confirm QDB design team delivery date for final seed token values (brand colours, typography)
- [ ] **`npm audit`** — Run and resolve any high/critical CVEs before staging
- [ ] **Redis auth** — Confirm Azure Cache for Redis will use access key or Managed Identity authentication

---

## 10. Open Questions

| ID | Question | Status | Required before |
|---|---|---|---|
| OQ-001 | Publish model: staging window (explicit publish) vs. instant publish. Currently assumed staging window (ADR-003-002). | Open — QDB IT Director formal answer required | Architecture lock; Phase 4b |
| OQ-002 | Level 5 approval policy: does QDB Compliance require secondary approval before service-owner token overrides go live? Currently assumed no approval required (ADR-003-003). | Open — QDB Compliance formal answer required | Production go-live; if approval required, ADR-003-003A must be written and implemented |
| OQ-003 | Redis availability in production. Currently assumed available (ADR-003-001). | Open — QDB IT/DevOps confirmation required | B-004 implementation; staging deployment |
| OQ-005 | Final QDB brand token values (colors, typography, spacing scale) to replace seed placeholders. | Open — QDB Design team delivery date required | Production provisioning run |

---

## Verdict

**APPROVED WITH CONDITIONS**

The DXP-P1-003 Theme Token System architecture is sound, the Phase 4 implementation is of high
quality, and the security controls are correctly designed. The CSS injection defence
(dual-layer: write-time throw + read-time neutralise) is appropriately implemented for a
government portal. JWT enforcement is correctly applied to all protected routes. Service-owner
scoping is correctly enforced from the JWT claims, never from the request body.

**Conditions that must be met before staging:**

C-1. Implement `RedisTokenCache.ts` (B-004) and remove the startup guard in `createTokenCacheService.ts:32`.
C-2. Build and run the Dataverse provisioning script (G-001) against dev Dataverse.
C-3. Configure Redis `maxmemory-policy allkeys-lru` in the DevOps runbook (B-002).
C-4. Implement `publishedOn`/`publishedBy` batch-PATCH in `publish.ts` (Step 9 of arch flow).
C-5. Enable Dataverse field-level auditing for both token entities in the provisioning script.

**Conditions that must be met before production go-live:**

C-6. Obtain formal written confirmation from QDB IT Director on publish model (OQ-001).
C-7. Obtain formal written confirmation from QDB Compliance on Level 5 approval policy (OQ-002).
C-8. Confirm Redis deployment region as Qatar Central or UAE North (data residency).
C-9. Build admin UI (items 30–34) before handing system to QDB design team.
C-10. Raise `NEXTJS_REVALIDATE_SECRET` minimum to 32 chars.
C-11. Write Supertest integration tests for all route groups.
C-12. Confirm `sanitiseResolvedMap()` is applied in `routes/admin/tokens/preview.ts`.

```
===================================================
END OF DOCUMENT
DXP-P1-003 Theme Tokens — Phase 5 Governance and Security Audit
Maqsad AI — Auditor Agent
2026-06-21
===================================================
```
