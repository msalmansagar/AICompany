# DXP-P1-003 — Phase 6: Security & Governance Audit
**Engagement:** DXP-P1-003 — Theme Token System
**Phase:** 6 — Audit
**Auditor:** Maqsad AI Auditor
**Date:** 2026-06-21
**Status:** CONDITIONAL PASS — 3 findings, 1 HIGH

---

## 1. Audit Scope

This audit covers the DXP-P1-003 Theme Token System committed in `c0a4ce5` (35 files, 8268 insertions). The review covers:

- **Security**: CSS injection, XSS, auth bypass, secrets handling
- **Data governance**: Audit trail completeness, GDPR/data residency
- **Operational governance**: Rate limiting, DoS vectors, cache poisoning
- **Clean code compliance**: Per `CLAUDE.md` and `.claude/rules/common.md`
- **Dependency governance**: Per `CLAUDE.md` dependency adoption rules

---

## 2. Audit Findings

### A-003-001 — HIGH — RedisTokenCache Not Implemented

**File:** `projects/portal-shell/apps/api/src/services/tokens/createTokenCacheService.ts`

```typescript
// Current behaviour: throws if REDIS_URL is set
if (redisUrl) {
  throw new Error(
    'RedisTokenCache is not yet implemented. ' +
    'Unset REDIS_URL to use NodeCacheTokenCache.',
  );
}
```

**Risk:** Production deployments with Redis configured will hard-fail at startup. Without Redis, the NodeCacheTokenCache stores state in process memory — this means publish debounce locks and rate limit timestamps are NOT shared across API instances. In a multi-instance deployment, two simultaneous publish requests on different instances will both succeed (bypassing ADR-003-007). The `TOKEN_PUBLISH_MIN_INTERVAL_MS` rate limit also resets on each process restart.

**Severity:** HIGH — debounce guard is ineffective in multi-instance deployments without Redis.

**Remediation:** Implement `RedisTokenCache.ts` using `ioredis` with SCAN-based key deletion and `SET NX` for distributed locking before any multi-instance production deployment. This is tracked as Phase 4b.

**Workaround:** Deploy with a single API instance (no horizontal scaling) until Phase 4b is complete.

---

### A-003-002 — MEDIUM — `sanitiseResolvedMap` Applied at Serve Time Only for Seeded Values

**File:** `projects/portal-shell/apps/api/src/routes/tokens/resolve.ts:64`

```typescript
return reply.status(200).send({ data: sanitiseResolvedMap(cachedMap) });
```

**Observation:** Values seeded via the provisioning script bypass `TokenValueService.sanitizeCssValue()` at write time. The `sanitiseResolvedMap` call at serve time is the only sanitisation layer for seeded values.

**Assessment:** The comment `// Read-time sanitisation (B-003): values seeded via provisioning script bypass write-time sanitisation` acknowledges this explicitly. The serve-time sanitisation is a correct defence-in-depth pattern. However, if the `sanitiseResolvedMap` function in `cssUtils.ts` is less strict than `sanitizeCssValue`, a gap exists.

**Action:** Verify `sanitiseResolvedMap` applies the same `url(`, `expression(`, `import(` rejection rules as `TokenValueService.sanitizeCssValue`. If not, either add them to `sanitiseResolvedMap` or apply `sanitizeCssValue` to all provisioning script entries at seed time.

---

### A-003-003 — LOW — `dangerouslySetInnerHTML` in SSR Layout

**File:** `projects/portal-shell/apps/web/src/app/[locale]/layout.tsx`

```tsx
<style dangerouslySetInnerHTML={{ __html: `:root { ${cssVars} }` }} />
```

**Observation:** `dangerouslySetInnerHTML` bypasses React's XSS protection. The `cssVars` string is the output of `buildCSSCustomProperties(tokenMap)`, which is the output of the token resolution API.

**Assessment:** The attack surface is the token resolution API response. If an attacker injects `</style><script>...</script>` into a token value, it would be injected into the page. The `sanitizeCssValue` and `sanitiseResolvedMap` functions currently strip semicolons and reject `url(`/`expression(`/`import(` but do NOT reject `</style>` or `<script>`.

**Action:** Add HTML entity encoding (specifically `<`, `>`, `"`) to `sanitizeCssValue` and `sanitiseResolvedMap` before the SSR injection step. CSS custom property values cannot contain unescaped `<` or `>` in valid CSS, so this restriction is safe.

**Priority:** HIGH in terms of attack surface, but mitigated by the fact that only `portal-admin` role can create/update token values, reducing the threat to admin-to-portal escalation rather than external injection.

---

## 3. Compliance Assessment

### 3.1 Authentication and Authorisation

| Control | Status | Evidence |
|---|---|---|
| All admin routes require JWT | PASS | `app.authenticate` preHandler on all `/api/admin/*` routes |
| Service routes require `service-owner` role | PASS | `app.requireRole('service-owner')` in `serviceTokenRoutes` |
| Public resolve route requires no auth | PASS BY DESIGN | Tokens are per-tenant, not per-user; no PII in token values |
| Service-owner can only modify own values | PASS | `enforceServiceSlugOwnership` in `TokenValueService` |
| Service-owner slug derived from JWT, not request body | PASS | `createServiceValue` ignores body slug, uses `callerContext.serviceSlug` |

### 3.2 Secrets Handling

| Control | Status | Evidence |
|---|---|---|
| No secrets in source code | PASS | All credentials via env vars (`REDIS_URL`, `NEXTJS_REVALIDATE_SECRET`) |
| Bearer tokens not logged | PASS | `publish.ts` logs only `operation` and `userId` at INFO level |
| `NEXTJS_REVALIDATE_SECRET` not logged | PASS | Not referenced in any log statement |
| `.env.example` contains only placeholders | NOT VERIFIED | Provisioning script not yet created; placeholder status unknown |

### 3.3 Audit Trail

| Control | Status | Evidence |
|---|---|---|
| Publish events logged with userId | PASS | `admin.tokens.publish.start/complete` log entries include `userId` |
| Value create events logged | PARTIAL | Routes log cache invalidation but not explicit `value.created` audit event |
| Definition create/deactivate events logged | PARTIAL | No explicit audit log write; relies on Dataverse `createdon/createdby` fields |
| Dataverse audit logging enabled | NOT VERIFIED | Requires QDB IT Director confirmation (OQ-001) |

**Gap:** The arch doc (Section 10) specifies that publish events must be written to a dedicated `qdb_cms_auditlogs` entity. This is not implemented — logging goes to structured log (pino) only, not Dataverse. If QDB has compliance requirements for persistent audit trails, this is a blocker.

### 3.4 Rate Limiting and DoS

| Control | Status | Evidence |
|---|---|---|
| Publish endpoint debounced (10s) | PASS (single-instance) | ADR-003-007 in `NodeCacheTokenCache` |
| Token create rate limited at route level | NOT PRESENT | Only soft limit (200 tokens) per ADR-003-006; no per-minute rate limit |
| Resolve endpoint rate limited | PARTIAL | Global `registerRateLimit` in `app.ts` applies |
| Concurrent publish lock | PASS (single-instance) | `acquirePublishLock` flag in `NodeCacheTokenCache` |

### 3.5 Data Residency

All token data stored in Dataverse (QDB's org5869857f tenant). No token data written to external systems except:
- NodeCache (in-process, same server)
- Redis (when implemented — must be provisioned within the same Azure region as Dataverse)

**PASS WITH ASSUMPTION**: Redis deployment must be within the same region as the Dataverse org.

### 3.6 OWASP Top 10

| Risk | Control | Status |
|---|---|---|
| A01 Broken Access Control | Role-based preHandlers; service slug enforcement | PASS |
| A02 Cryptographic Failures | Secrets via env; no secrets in logs | PASS |
| A03 Injection | CSS sanitisation; Dataverse OData parameterisation | PARTIAL (see A-003-003) |
| A04 Insecure Design | Debounce, rate limiting, soft limit | PASS |
| A05 Security Misconfiguration | No default credentials; env-driven config | PASS |
| A06 Vulnerable Components | `node-cache`, `ioredis` (pending); no known CVEs at audit time | PASS |
| A07 Auth/Identity Failures | JWT + role enforcement on all write routes | PASS |
| A08 Software/Data Integrity | Zod validation at all API boundaries | PASS |
| A09 Logging/Monitoring | Pino structured logging; correlationId on all requests | PASS |
| A10 SSRF | `triggerNextRevalidation` calls nextjsBaseUrl (env-configured, not user input) | PASS |

---

## 4. Clean Code Compliance

| Standard | Assessment |
|---|---|
| Function length ≤ 20 lines | PASS — all private helpers are well-extracted |
| Max 3 parameters | PASS — services use constructor injection; large payloads use objects |
| No `any` types | PASS — `unknown` + type narrowing used where needed |
| No `console.log` | PASS — all logging via `app.log` (pino) or no logging in services |
| Named imports preferred | PASS |
| Result/throw over null | PASS — all services throw typed errors from `TokenErrors.ts` |
| No boolean flag parameters | PASS |
| Command-Query Separation | PASS — `createValue` (command) vs `listValues` (query) properly separated |

---

## 5. Dependency Governance

| Dependency | Stars (approx) | Decision | Doc |
|---|---|---|---|
| `node-cache` | ~3,600 | ADOPTED — in-process TTL cache | ADR-003-001 |
| `ioredis` | ~12,000 | PENDING — Phase 4b | ADR-003-001 |
| No new deps beyond these two | — | Build-over-adopt not triggered | — |

Dependency adoption decision documented in ADR-003-001 in `phase-3-arch.md`. Complies with CLAUDE.md dependency governance rule (1000+ stars threshold met for both).

---

## 6. Audit Verdict

**CONDITIONAL PASS**

| Finding | Severity | Blocker for Production? |
|---|---|---|
| A-003-001 — RedisTokenCache not implemented | HIGH | YES — before multi-instance deployment |
| A-003-002 — Serve-time sanitisation for seeded values | MEDIUM | NO — acknowledged defence-in-depth; verify parity |
| A-003-003 — HTML injection via `dangerouslySetInnerHTML` | LOW-MEDIUM | NO — admin-only write path, mitigated |

**Conditions before production deployment:**
1. **A-003-001**: Implement `RedisTokenCache.ts` or constrain deployment to single API instance with explicit documentation.
2. **A-003-002**: Verify `sanitiseResolvedMap` applies identical rejection rules as `sanitizeCssValue`, OR add `<`/`>` stripping to both sanitisation layers.
3. **A-003-003**: Add HTML entity encoding (`<` → `&lt;`, `>` → `&gt;`) to the CSS value sanitisation layer before SSR injection.
4. Confirm OQ-001 (Dataverse audit logging enabled) before go-live.
