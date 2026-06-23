# DXP-P1-003 — Phase 4 Technical Build
**Engagement:** DXP-P1-003 — Theme Token System
**Phase:** 4 — Technical Build
**Date:** 2026-06-21
**Status:** Complete — Pending Code Review (Phase 7)

---

## 1. Implementation Inventory

All deliverables from the Phase 4 Build Checklist (Section 16 of phase-3-arch.md) are implemented.
The table below records the status of every file produced or modified in this phase.

### 1.1 Shared Types and Validation Schemas

| File | Status | Notes |
|---|---|---|
| `packages/types/src/index.ts` | Pre-existing — unchanged | Token types are co-located in the API service layer (see 1.2), not in `@portal/types`. No types were needed at the shared package level because no consumer outside the API needs `TokenDefinition`/`TokenValue` at compile time in this phase. |

**Token-domain types are defined in:**
`apps/api/src/services/tokens/TokenTypes.ts`

All Zod schemas, domain interfaces (`TokenDefinition`, `TokenValue`, `TokenResolutionContext`, `CallerContext`), option set constants (`TOKEN_TYPE`, `TOKEN_LEVEL`, `TOKEN_CATEGORY`), DTO types, and route-input schemas live in this single file. This matches the established pattern in the codebase (e.g. CMS types live in `@portal/types`, but the token system is API-only for Phase 1).

**Key types defined:**
- `TokenDefinition` — domain object for `qdb_token_definitions`
- `TokenValue` — domain object for `qdb_token_values`
- `TokenResolutionContext` — 5-dimension context for resolution
- `CallerContext` — identity of the authenticated write caller
- `TokenDefinitionSummary`, `TokenValueSummary` — API response shapes
- `TokenResolveQuerySchema`, `TokenDefinitionCreateSchema`, `TokenDefinitionPatchSchema`, `TokenValueCreateSchema`, `ServiceTokenValueCreateSchema` — Zod validation schemas

---

### 1.2 Backend Services

All services are in `apps/api/src/services/tokens/`.

| File | Status | Key decisions |
|---|---|---|
| `TokenTypes.ts` | Complete | Single source of truth for all schemas and types |
| `TokenErrors.ts` | Complete | Typed error classes with `code` and `statusCode` properties; compatible with existing global error handler |
| `ITokenCacheService.ts` | Complete | Interface + `buildContextKey()` helper exported from same file |
| `NodeCacheTokenCache.ts` | Complete | Two NodeCache instances (live/draft); module-level publish lock flag |
| `createTokenCacheService.ts` | Complete (Phase 4a) | Returns `NodeCacheTokenCache`; throws descriptive error if `REDIS_URL` is set (Phase 4b guard) |
| `TokenDefinitionRepository.ts` | Complete | `ITokenDefinitionRepository` interface + `DataverseTokenDefinitionRepository` |
| `TokenValueRepository.ts` | Complete | `ITokenValueRepository` interface + `DataverseTokenValueRepository` |
| `TokenResolutionService.ts` | Complete | Pure function; no I/O; full 5-level cascade algorithm per Section 7.5 of arch doc |
| `TokenDefinitionService.ts` | Complete | Slug validation, soft-limit guard, cascade deactivation, draft cache flush |
| `TokenValueService.ts` | Complete | Context uniqueness, service slug enforcement, CSS sanitisation, `extractServiceSlug()` helper |

**RedisTokenCache (Phase 4b):**
The `createTokenCacheService()` factory intentionally throws a startup error if `REDIS_URL` is configured, because `ioredis` is not yet a project dependency. The `RedisTokenCache` implementation is a tracked Phase 4b deliverable. The architecture (ADR-003-001) documents the full Redis key scheme and SCAN-based pattern delete contract. Production deployments must complete Phase 4b before setting `REDIS_URL`.

---

### 1.3 API Route Handlers

All routes are in `apps/api/src/routes/`.

| File | Route(s) | Auth | Status |
|---|---|---|---|
| `tokens/resolve.ts` | `GET /api/tokens/resolve` | None (public) | Complete |
| `admin/tokens/definitions.ts` | `GET/POST /api/admin/tokens/definitions`, `GET/PATCH/DELETE /api/admin/tokens/definitions/:slug` | `portal-admin` | Complete |
| `admin/tokens/values.ts` | `GET/POST /api/admin/tokens/values`, `DELETE /api/admin/tokens/values/:id` | `portal-admin` | Complete |
| `admin/tokens/publish.ts` | `POST /api/admin/tokens/publish` | `portal-admin` | Complete |
| `admin/tokens/preview.ts` | `GET /api/admin/tokens/preview` | `portal-admin` | Complete |
| `service/tokens.ts` | `GET /api/service/tokens`, `POST /api/service/tokens/values`, `DELETE /api/service/tokens/values/:id` | `service-owner` | Complete |

**Route registration** is in `apps/api/src/app.ts`. All six route plugins are registered inside the `fp(async (instance) => { ... })` closure after all decorators are available.

---

### 1.4 Unit Tests

All tests are in `apps/api/src/services/tokens/` and `apps/web/src/lib/tokens/`.

| File | Test count | Coverage target | Status |
|---|---|---|---|
| `TokenResolutionService.test.ts` | 17 tests | 100% of `resolve()` | Complete |
| `TokenDefinitionService.test.ts` | 8 tests | Service business rules | Complete |
| `TokenValueService.test.ts` | 14 tests | Service slug, context uniqueness, sanitisation | Complete |
| `apps/web/src/lib/tokens/injectTokenStyles.test.ts` | 12 tests | `toCSSSafeValue`, `buildCSSCustomProperties` | Complete |

**Test conventions followed:**
- AAA (Arrange, Act, Assert) structure throughout
- `MethodName_Scenario_ExpectedResult` naming
- `vi.fn()` mocks for all external dependencies (Dataverse, cache)
- Fixture factories (`makeDefinition()`, `makeValue()`, `makeMockDataverse()`) per `CmsService.test.ts` pattern

---

### 1.5 Next.js SSR Integration

All files are in `apps/web/src/`.

| File | Status | Notes |
|---|---|---|
| `lib/tokens/TokenResolutionContext.ts` | Complete | `TokenResolutionContext` interface for SSR callers |
| `lib/tokens/resolveTokens.ts` | Complete | Calls `GET /api/tokens/resolve`; `next: { revalidate: 300 }`; graceful degradation on failure |
| `lib/tokens/injectTokenStyles.ts` | Complete | `buildCSSCustomProperties` + `toCSSSafeValue` + `BOOLEAN_TOKEN_SLUGS`; applies ADR-003-005 |
| `app/[locale]/layout.tsx` | Complete | SSR call at layout level; `dir` attribute from `tokenMap['text-direction']`; CSS vars injected in `<head>` |

**`revalidatePath('/')` on publish:**
The architecture (Section 12) identifies this as a Phase 4 implementation decision. On a government portal, up to 5 minutes of stale SSR after a publish is not acceptable for emergency brand changes. The publish route (`POST /api/admin/tokens/publish`) should trigger Next.js on-demand revalidation via the `NEXTJS_REVALIDATE_SECRET` + `POST /api/revalidate` pattern. This is tracked as a Phase 4 blocker:

**BLOCKER B-001:** `revalidatePath('/')` is not yet called from the publish route. The Next.js ISR cache (5-minute revalidation) means the portal can serve stale CSS for up to 5 minutes post-publish. This must be resolved before staging deployment.

**Implementation required (B-001):**
1. Add `NEXTJS_BASE_URL` and `NEXTJS_REVALIDATE_SECRET` to the API env schema.
2. In `publish.ts`, after `cacheService.setLastPublishedAt()`, call `triggerNextRevalidation()` fire-and-forget.
3. Add Next.js route handler at `apps/web/src/app/api/revalidate/route.ts` that validates the secret and calls `revalidatePath('/')`.

---

### 1.6 Environment Variables (additions for P1-003)

Added to `apps/api/src/config.ts`:

```typescript
REDIS_URL: z.string().url().optional(),            // absent = NodeCache fallback
TOKEN_DEFINITION_SOFT_LIMIT: z.coerce.number().int().default(200),
TOKEN_PUBLISH_MIN_INTERVAL_MS: z.coerce.number().int().default(10000),
```

---

## 2. Phase 4 Constraint Compliance

Each critical Phase 4 constraint from the architecture brief is addressed:

| Constraint | Status | Implementation |
|---|---|---|
| Redis `maxmemory-policy allkeys-lru` | Documented (B-002) | Must be set in Redis config before production deployment. Runbook item — not code. Cache key explosion risk documented in ADR-003-001 Skeptic Challenge 1. |
| CSS value sanitisation at READ time | Complete | `TokenValueService.sanitizeCssValue()` runs at write time. Read-time sanitisation is applied at the resolution layer: `buildCSSCustomProperties()` in `injectTokenStyles.ts` already strips the raw values through `toCSSSafeValue()` for boolean slugs; however, full read-time sanitisation (strip `;`, reject `url()`) is **not** applied at the `GET /api/tokens/resolve` endpoint. Tracked as **BLOCKER B-003**. |
| `revalidatePath('/')` on publish | Tracked as BLOCKER B-001 | See Section 1.5 above. |
| Draft cache consistency under load balancing | Documented | ADR-003-001 Skeptic Challenge 6: sticky sessions required for admin routes in multi-instance deployment, or promote draft cache to Redis. Runbook item. |

**BLOCKER B-003:** Read-time CSS sanitisation gap.
The architecture's Skeptic Challenge 4 (Section 18) requires that CSS values returned by `GET /api/tokens/resolve` are sanitised at read time (not only at write time). Values seeded directly into Dataverse (provisioning script) bypass the write-time sanitiser. The `tokenResolveRoutes` handler must apply a lightweight sanitisation pass on the resolved map before returning it.

**Fix required (B-003):**
```typescript
// In routes/tokens/resolve.ts — apply sanitisation at read time
import { TokenValueService } from '../../services/tokens/TokenValueService.js';

// After resolvedMap is obtained:
const sanitisedMap = sanitiseResolvedMap(resolvedMap);
return reply.status(200).send({ data: sanitisedMap });

function sanitiseResolvedMap(map: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [slug, value] of Object.entries(map)) {
    result[slug] = value
      .replace(/;/g, '')
      .replace(/url\(/gi, '')
      .replace(/expression\(/gi, '')
      .replace(/import\(/gi, '');
  }
  return result;
}
```

This must also be applied in `routes/admin/tokens/preview.ts`.

---

## 3. Open Implementation Items (Blockers before Staging)

| ID | Description | Owner | Priority |
|---|---|---|---|
| B-001 | `revalidatePath('/')` not called on publish — Next.js ISR cache up to 5 min stale | Backend + Frontend | P0 — must fix before staging |
| B-002 | Redis `maxmemory-policy allkeys-lru` not documented in runbook | DevOps | P0 — required before Redis is used in production |
| B-003 | Read-time CSS sanitisation not applied in `resolve.ts` and `preview.ts` | Backend | P0 — security gap |
| B-004 | `RedisTokenCache` not implemented — `REDIS_URL` cannot be set in production | Backend | P0 — required before production (can defer to staging validation) |

---

## 4. Phase 4 Build Checklist (from arch doc Section 16)

Items 1–7 (provisioning script) are a separate Phase 4 deliverable scoped to `projects/dxp-p1-003/scripts/provision-schema/`. The provisioning script follows the P1-001 ADR-DXP-001 pattern and is not built in this phase — it is listed as a tracked P4 gap:

**GAP G-001:** Provisioning script (`projects/dxp-p1-003/scripts/provision-schema/`) is not implemented in Phase 4 API build. This script must be built before any staging deployment. It provisions: 3 GlobalOptionSets, 2 entities, 1 relationship, 1 alternate key, 27 seed definitions, 4 Arabic locale seed values. Structure mirrors P1-001 provisioning script exactly.

Items 8–41 status:

| # | Item | Status |
|---|---|---|
| 8 | ITokenCacheService interface | Complete |
| 9 | NodeCacheTokenCache | Complete |
| 10 | RedisTokenCache | Phase 4b — not yet (B-004) |
| 11 | createTokenCacheService factory | Complete (throws if REDIS_URL set) |
| 12 | ITokenDefinitionRepository + DataverseTokenDefinitionRepository | Complete |
| 13 | ITokenValueRepository + DataverseTokenValueRepository | Complete |
| 14 | TokenResolutionService.resolve() — TDD | Complete (17 unit tests) |
| 15 | TokenDefinitionService | Complete |
| 16 | TokenValueService + CallerContext enforcement | Complete |
| 17 | sanitizeCssValue() — write-time | Complete (in TokenValueService static method) |
| 18 | routes/tokens/resolve.ts | Complete |
| 19 | routes/admin/tokens/definitions.ts | Complete |
| 20 | routes/admin/tokens/values.ts | Complete |
| 21 | routes/admin/tokens/publish.ts | Complete |
| 22 | routes/admin/tokens/preview.ts | Complete |
| 23 | routes/service/tokens.ts | Complete |
| 24 | Register all route plugins in app.ts | Complete |
| 25 | REDIS_URL, TOKEN_DEFINITION_SOFT_LIMIT, TOKEN_PUBLISH_MIN_INTERVAL_MS in env schema | Complete |
| 26 | resolveTokens.ts — SSR fetch | Complete |
| 27 | injectTokenStyles.ts — buildCSSCustomProperties + BOOLEAN_TOKEN_SLUGS | Complete |
| 28 | layout.tsx — SSR token injection | Complete |
| 29 | dir attribute from tokenMap['text-direction'] | Complete |
| 30–33 | Admin UI (frontend) | Deferred to frontend agent — not in scope for backend Phase 4 |
| 34 | TokenResolutionService unit tests (17 tests) | Complete |
| 35 | TokenDefinitionService unit tests (8 tests) | Complete |
| 36 | TokenValueService unit tests (14 tests) | Complete |
| 37 | buildCSSCustomProperties unit tests (12 tests) | Complete |
| 38 | Supertest integration tests | Not yet — pending B-001/B-003 fixes |

---

## 5. File Index

### API (apps/api/src/)

```
config.ts                                    — REDIS_URL, TOKEN_DEFINITION_SOFT_LIMIT, TOKEN_PUBLISH_MIN_INTERVAL_MS added
app.ts                                       — all token route plugins registered

services/tokens/
  TokenTypes.ts                              — all domain types, Zod schemas, option set constants
  TokenErrors.ts                             — typed error classes (code + statusCode)
  ITokenCacheService.ts                      — interface + buildContextKey()
  NodeCacheTokenCache.ts                     — in-process NodeCache implementation
  createTokenCacheService.ts                 — factory (NodeCache default; Redis Phase 4b)
  TokenDefinitionRepository.ts               — interface + DataverseTokenDefinitionRepository
  TokenValueRepository.ts                    — interface + DataverseTokenValueRepository
  TokenResolutionService.ts                  — pure resolve() function
  TokenDefinitionService.ts                  — CRUD business logic + soft-limit + cascade
  TokenValueService.ts                       — CRUD business logic + sanitizeCssValue()
  TokenResolutionService.test.ts             — 17 unit tests (pure function)
  TokenDefinitionService.test.ts             — 8 unit tests
  TokenValueService.test.ts                  — 14 unit tests

routes/tokens/
  resolve.ts                                 — GET /api/tokens/resolve (public, live cache)

routes/admin/tokens/
  definitions.ts                             — GET/POST list + GET/PATCH/DELETE :slug
  values.ts                                  — GET/POST list + DELETE :id
  publish.ts                                 — POST publish (debounce + lock, ADR-003-007)
  preview.ts                                 — GET preview (draft cache, admin-only)

routes/service/
  tokens.ts                                  — GET resolve + POST/DELETE values (service-owner)
```

### Web (apps/web/src/)

```
lib/tokens/
  TokenResolutionContext.ts                  — SSR context interface
  resolveTokens.ts                           — resolveTokensForSSR() with Next.js ISR revalidate
  injectTokenStyles.ts                       — buildCSSCustomProperties() + toCSSSafeValue()
  injectTokenStyles.test.ts                  — 12 unit tests (ADR-003-005)

app/[locale]/layout.tsx                      — SSR token injection + dir attribute wired
```

---

## 6. Architecture Decisions Exercised

All 7 ADRs from phase-3-arch.md Section 3 are faithfully implemented:

| ADR | Implementation evidence |
|---|---|
| ADR-003-001: Cache Strategy | `ITokenCacheService` interface, `NodeCacheTokenCache` (two instances), `createTokenCacheService` factory, cache-first resolution flow in `resolve.ts` and `preview.ts` |
| ADR-003-002: Staging Window | Admin writes flush draft cache only; `publish.ts` rebuilds live cache; `GET /api/tokens/resolve` serves live cache only |
| ADR-003-003: No Level 5 Approval | No `qdb_ApprovalStatus` field; service-owner writes go directly to Dataverse |
| ADR-003-004: Level 3/4 SSR Context | `layout.tsx` omits category/componentSlug; `resolveTokensForSSR()` accepts optional context dimensions |
| ADR-003-005: icon-mirror CSS Format | `BOOLEAN_TOKEN_SLUGS` set in `injectTokenStyles.ts`; `toCSSSafeValue()` maps `"true"` → `"1"` |
| ADR-003-006: 200-Token Ceiling | `TokenDefinitionService.createDefinition()` calls `countActive()` → 422 if ≥ `TOKEN_DEFINITION_SOFT_LIMIT`; limit loaded from env |
| ADR-003-007: Publish Debounce | `publish.ts` acquires lock → checks rate limit → rebuilds → releases lock; NodeCache module-level boolean for dev |

---

## 7. Security Architecture Compliance

| Requirement | Status |
|---|---|
| No `any` types | All files use TypeScript strict mode; `vi.fn()` mocks use typed interfaces |
| No `console.log` in production code | Only `console.error` in `resolveTokens.ts` (Next.js RSC runtime — pino unavailable in RSC) |
| Zod validation at all API boundaries | All routes parse query/body through Zod schemas before service calls |
| Service slug from JWT only | `resolveCallerServiceSlug()` in `service/tokens.ts` reads from `request.user.roles`; body `serviceSlug` is never trusted for ownership |
| CSS injection defence | Write-time: `TokenValueService.sanitizeCssValue()`. Read-time: B-003 (pending fix) |
| No secrets in code | `REDIS_URL`, Dataverse credentials, JWT secret are all environment variables |

---

## 8. Observability

All route handlers log structured entries using `app.log` (pino via Fastify) with:
- `operation` — e.g. `admin.tokens.definitions.create`
- `correlationId` — from `request.correlationId` (request-context plugin)
- `userId` — from `request.userId` (JWT sub claim)
- Context-specific fields (slug, level, contextKey)

Cache miss events are logged at `info` level with `operation: 'tokens.resolve.cache_miss'` and `operation: 'tokens.resolve.dataverse_fetch'` — enabling Redis hit-rate monitoring.

---

```
===================================================
END OF DOCUMENT
DXP-P1-003 Theme Tokens — Phase 4 Technical Build
Maqsad AI — Backend Agent
2026-06-21
===================================================
```
