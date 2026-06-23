# DXP-P1-003 — Architecture Document
**Engagement:** DXP-P1-003 — Theme Tokens
**Phase:** 3 — Architecture
**Architect:** Solution Architect, Maqsad AI
**Date:** 2026-06-21
**Status:** Complete — Pending CEO Phase 3 → 4 gate

---

## 1. System Overview

DXP-P1-003 extends the `QdbDxpPlatform` Dataverse solution and the existing portal-shell Fastify API to deliver a five-level hierarchical theme token system. Token definitions are stored as Dataverse records; a dual-cache layer (Redis primary, NodeCache fallback) serves resolved CSS custom property maps to the Next.js portal shell at SSR time. Write operations go through Fastify; the public resolution endpoint is unauthenticated and cache-primary. The data model is two new entities; the API adds three route groups (public, admin, service-owner); no new Docker service is introduced.

---

## 2. Gate Confirmation

All architecture-entry gates are cleared or formally assumed. Assumptions are documented with change-paths in Section 14 (Open Questions Appendix).

| Gate | Status | Evidence / Assumption |
|---|---|---|
| DXP-P1-001 — 6 release blockers | Cleared 2026-06-18 | Stated in engagement context |
| DXP-P1-002 — JWT `permissions` claim frozen | Cleared | P1-002 phase-3-arch.md Section 6: `{ sub, email, role, rbac_version, jti, iat, exp }`. Service slug resolved from `qdb_rbac_user_roles` `qdb_role_slug` field by the token issuance service. |
| OQ-001 — Publish model | Assumed: staging window (explicit publish) | Documented in ADR-003-002 and Section 14 |
| OQ-002 — Level 5 approval | Assumed: no secondary approval required | Documented in ADR-003-003 and Section 14 |
| OQ-003 — Redis availability | Assumed: available in production | Documented in ADR-003-001 and Section 14 |

---

## 3. Architecture Decision Records

### ADR-003-001: Cache Strategy — Redis Primary, NodeCache Fallback, Dual Cache
**Status:** Accepted
**Date:** 2026-06-21
**Decided by:** Architect

**Context**

The BRD requires the public resolution endpoint to respond within 50 ms p95 (NFR-001). With up to 200 token definitions each with multiple value records, making a synchronous Dataverse query per portal page render is not viable — OData queries to Dataverse take 100–500 ms under normal load. A cache layer is mandatory.

Three options were considered for the cache backend:
- Option A: In-memory (NodeCache) only — simple, zero infrastructure, but per-instance; in a multi-instance API deployment, each instance warms independently and a publish flushes only one instance's cache, leaving others stale.
- Option B: Redis only — shared across instances, consistent invalidation, but introduces infrastructure dependency.
- Option C: Redis primary with NodeCache fallback — shared across instances in production; works without Redis in dev/test; acceptable for the government portal's high-availability requirement.

**Decision:** Option C — Redis primary, NodeCache in-process fallback.

**Two-cache distinction (staging window model — see ADR-003-002):**

The system maintains two logically separate caches:

1. **Live Cache** (`token:live:<cacheKey>`) — serves `GET /api/tokens/resolve`. Rebuilt only on `POST /api/admin/tokens/publish` or on TTL expiry and auto-refresh. This is the public-facing cache. Dataverse outage does not cause portal rendering to fail if this cache is warm (NFR-005).

2. **Draft Cache** (`token:draft:<cacheKey>`) — serves admin preview. Rebuilt on every successful write to `qdb_token_values` (create or deactivate) via the Admin API. This cache reflects unpublished changes and is never served to portal users.

**Cache key structure:**

```
token:live:<renderTarget>:<locale>
token:live:<renderTarget>:<locale>:<service>
token:live:<renderTarget>:<locale>:<category>
token:live:<renderTarget>:<locale>:<category>:<componentSlug>
token:live:<renderTarget>:<locale>:<service>:<category>:<componentSlug>

token:draft:<same pattern>
```

Because the token resolution algorithm is context-sensitive but the full resolution is cheap to compute (sort + take-max on an in-memory set once fetched), the implementation stores the **full resolved token map** (all definitions) keyed by context. The cache stores the pre-resolved `{ slug: value }` map, not the raw Dataverse records. Raw records are stored separately:

```
token:raw:definitions     — all active qdb_token_definitions records
token:raw:values          — all active qdb_token_values records
```

Raw records are refreshed on publish (live) or on admin write (draft). Resolved maps are computed from raw records on first request for a given context and cached for 5 minutes. This design avoids recomputing all possible context permutations eagerly and instead lazily resolves per unique context.

**TTLs:**

| Cache entry | Redis TTL | NodeCache TTL |
|---|---|---|
| `token:raw:definitions` | 300s (5 min) | 300s |
| `token:raw:values` (live) | 300s | 300s |
| `token:raw:values` (draft) | 120s | 120s |
| Resolved context map (live) | 300s | 300s |
| Resolved context map (draft) | 120s | 120s |
| `token:meta:lastPublishedAt` | No TTL | No TTL (persists until explicit set) |

**NodeCache configuration:**
```typescript
const liveTokenCache   = new NodeCache({ stdTTL: 300, checkperiod: 60, useClones: false });
const draftTokenCache  = new NodeCache({ stdTTL: 120, checkperiod: 30, useClones: false });
```

`useClones: false` — token maps are read-only after resolution; cloning is unnecessary overhead.

**Rationale for separate raw/resolved entries:** Storing raw Dataverse records separately means a publish operation only needs to flush `token:raw:values` and `token:meta:lastPublishedAt`. The resolved context maps will naturally expire within their TTL or on next request if the raw data has changed (the resolution layer checks raw record version before serving a cached resolved map — see Section 6).

**Consequences:**
- Redis connection string (`REDIS_URL`) is a required environment variable in production; optional in dev (falls back to NodeCache).
- The `TokenCacheService` interface abstracts Redis and NodeCache behind the same contract (Section 6).
- Live cache outlives Dataverse — a Redis or NodeCache entry continues to serve the portal during Dataverse maintenance windows for up to 5 minutes.
- Multi-instance deployments share the live cache via Redis; draft cache remains per-instance (acceptable — admin preview is single-session).

---

### ADR-003-002: Staging Window vs. Instant Publish (OQ-001)
**Status:** Accepted with assumption
**Date:** 2026-06-21
**Decided by:** Architect (pending QDB IT Director formal answer)

**Assumption:** QDB has chosen the **explicit publish / staging window** model (FR-030). Token value changes do not take effect in the live portal until a `portal-admin` calls `POST /api/admin/tokens/publish`.

**Design under this assumption:**
- Admin writes (POST/DELETE on `qdb_token_values`) → rebuild draft cache only.
- Live cache is updated only on `POST /api/admin/tokens/publish`.
- The admin preview endpoint (if a preview UI is built in Phase 4) consumes the draft cache.
- `GET /api/tokens/resolve` always serves the live cache.

**If QDB chooses instant publish instead:**
- `POST /api/admin/tokens/publish` becomes a no-op or is removed.
- Every admin write to `qdb_token_values` rebuilds the live cache.
- The draft/live distinction collapses to a single cache.
- FR-014 and FR-030 are superseded; FR-015 is the only invalidation path.
- The debounce (ADR-003-007) applies to every admin write, not just publish.
- Data model is unchanged; no addendum required.

**Documented here per CEO condition C-001.** The backend agent must not proceed with FR-014/FR-030 implementation until QDB's formal answer is recorded in the BRD addendum.

---

### ADR-003-003: Level 5 Approval Flow (OQ-002)
**Status:** Accepted with assumption
**Date:** 2026-06-21
**Decided by:** Architect (pending QDB IT Director / QDB Compliance formal answer)

**Assumption:** QDB has confirmed **no secondary approval** is required for Level 5 (service-owner) token overrides. A `service-owner` may write token values scoped to their service slug; those values enter draft state immediately and go live on the next publish. No `portal-admin` review step is required.

**Design under this assumption:**
- `qdb_token_values` has no `qdb_ApprovalStatus` field.
- Service-owner writes go directly to the same `qdb_token_values` entity as admin writes; the only difference is that `qdb_ServiceSlug` is enforced from the JWT claim (Section 10 — Security Architecture).
- The publish action (`POST /api/admin/tokens/publish`) is available only to `portal-admin`; service-owners cannot publish directly.

**If QDB requires approval:**
- Add `qdb_ApprovalStatus` OptionSet field to `qdb_token_values`: `draft`(1) / `pending-approval`(2) / `approved`(3) / `rejected`(4).
- Add `qdb_SubmittedBy` String(100) and `qdb_ReviewedBy` String(100, nullable) fields.
- Resolution algorithm includes only values where `qdb_ApprovalStatus = approved`.
- Add `POST /api/admin/tokens/values/:id/approve` and `POST /api/admin/tokens/values/:id/reject` routes.
- Separate addendum ADR required. Flag as Addendum ADR-003-003A.

**Documented here per CEO condition C-002.**

---

### ADR-003-004: Level 3/4 SSR Context Contract (CEO Deliverable 7)
**Status:** Accepted
**Date:** 2026-06-21
**Decided by:** Architect

**Context**

`category` and `componentSlug` are optional query parameters on `GET /api/tokens/resolve`. The CEO BRD approval (Issue 5) requires the architect to determine whether the Next.js portal shell passes these at SSR time or reserves them for admin/diagnostic use.

**Decision:** The portal shell **passes `category` and `componentSlug` at SSR time when the page is rendering a specific known component context**, and omits them for generic layout pages.

**Rationale:**
1. The performance cost of passing `category`/`componentSlug` is zero — these are query parameters on a cached endpoint. The resolution result is cached per-context; the first request for a new context incurs one raw-record computation pass.
2. Omitting them for generic layout pages is correct behaviour: a layout page does not know which component it will render; it only knows the render target and locale. Component-specific overrides (Level 4) are meaningless in that context.
3. At SSR time for a page that mounts a specific widget (e.g. `hero-banner`), the Next.js page component knows its component slug via the widget config. Passing it to the resolution endpoint allows Level 3 and Level 4 overrides to be included in the initial SSR styles.

**SSR contract (how the portal shell calls the token API):**

```typescript
// apps/web/src/lib/tokens/resolveTokens.ts

interface TokenResolutionContext {
  renderTarget: 'portal' | 'admin' | 'mobile';
  locale: 'ar' | 'en' | null;
  service?: string;       // omit for non-service pages
  category?: string;      // omit for layout pages
  componentSlug?: string; // omit for layout pages; include when mounting a specific widget
}

async function resolveTokensForSSR(context: TokenResolutionContext): Promise<Record<string, string>> {
  const params = new URLSearchParams();
  params.set('renderTarget', context.renderTarget);
  if (context.locale) params.set('locale', context.locale);
  if (context.service) params.set('service', context.service);
  if (context.category) params.set('category', context.category);
  if (context.componentSlug) params.set('componentSlug', context.componentSlug);
  // ...
}
```

**Admin/diagnostic use:** Admin users can pass `category` and `componentSlug` to `GET /api/admin/tokens/preview` (a separate admin-only endpoint that serves the draft cache with the given context) to preview how a component would appear after a token change before publishing.

**Consequences:**
- The portal shell's layout-level `resolveTokens` call omits `category` and `componentSlug` (covers Levels 1 and 2 only); widget-level `resolveTokens` calls include them.
- Cache key must include all five context dimensions (Section 3 — ADR-003-001 key structure).
- An unknown `componentSlug` produces no error — it simply has no Level 4 tokens, and the resolver falls back to Level 3/2/1 per the algorithm (BRD AC-018 equivalent for component slug).

**Documented here per CEO condition C-004.**

---

### ADR-003-005: `icon-mirror` CSS Value Format (CEO Deliverable 8)
**Status:** Accepted
**Date:** 2026-06-21
**Decided by:** Architect

**Context**

BRD FR-005 specifies the `direction` token type with values including `"true"` and `"false"` for the `icon-mirror` token. The CEO advisory (Issue 9) flags that components consuming `var(--icon-mirror)` must parse a string boolean rather than treat it as a CSS boolean. A component applying `transform: scaleX(var(--icon-mirror))` requires a numeric value (`1` or `0`), not a string (`"true"` / `"false"`), since CSS `scaleX()` does not interpret string values.

**Decision:** `icon-mirror` token values are stored in Dataverse as `"true"` or `"false"` (string, human-readable for admin UI). The CSS injection layer in the portal shell converts `"true"` → `"1"` and `"false"` → `"0"` before emitting the CSS custom property.

**Conversion rule (applied in the portal shell injection layer):**
```typescript
// apps/web/src/lib/tokens/injectTokenStyles.ts

const BOOLEAN_TOKEN_SLUGS = new Set(['icon-mirror']);

function toCSSSafeValue(slug: string, value: string): string {
  if (BOOLEAN_TOKEN_SLUGS.has(slug)) {
    return value === 'true' ? '1' : '0';
  }
  return value;
}
```

**Component consumption pattern:**
```css
.icon-directional {
  transform: scaleX(var(--icon-mirror, 1));
}
```

With `--icon-mirror: 1` (RTL, Arabic locale), icons are mirrored. With `--icon-mirror: 0` (LTR, default), no transform is applied.

**Rationale:**
- Storing `"true"/"false"` in Dataverse is human-readable and survives admin UI display without requiring translation.
- Conversion at the injection layer (single conversion point, fully under our control) is safer than requiring every component to do its own conversion.
- The `BOOLEAN_TOKEN_SLUGS` set is configuration-driven (Article V) — future boolean tokens can be added without code changes to individual components.
- The conversion function is pure and trivially unit-testable.

**Seed values for `icon-mirror`:**
- Level 1, locale=null: `"false"` (default LTR)
- Level 1, locale=ar: `"true"` (Arabic = RTL, icons mirrored)

**Consequences:**
- All `direction` token type values are stored as strings in Dataverse.
- The portal shell injection layer must apply `toCSSSafeValue` on every token in the resolved map before emitting CSS.
- Admin UI must display `"true"/"false"` — no conversion in the admin display path.

**Documented here per CEO condition C-005.**

---

### ADR-003-006: 200-Token Ceiling and Soft-Limit Guard (CEO Deliverable 9)
**Status:** Accepted
**Date:** 2026-06-21
**Decided by:** Architect

**Context**

BRD NFR-006 caps Phase 1 at 200 token definitions. The CEO advisory (Issue 8) requires the architect to document the ceiling and performance implications explicitly, and to require a performance review before the limit is exceeded.

**Decision:**

1. The `POST /api/admin/tokens/definitions` route checks the active definition count before creating. If the count is ≥ 200, the route returns HTTP 422 with code `token_definition_limit_reached`.
2. The limit (200) is loaded from the environment variable `TOKEN_DEFINITION_SOFT_LIMIT` (default: `200`). This allows the ceiling to be raised by configuration without code change — per constitution Article V.
3. The error response body includes an advisory message directing the admin to request a performance review.

**Enforcement:**
```typescript
// In TokenDefinitionService.createDefinition():
const activeCount = await this.tokenDefinitionRepository.countActive();
if (activeCount >= this.softLimit) {
  throw new TokenDefinitionLimitError(
    `Active token definition count (${activeCount}) has reached the configured ceiling ` +
    `(${this.softLimit}). A performance review is required before adding more definitions.`,
  );
}
```

**Performance implications documented:**

| Token count | Estimated raw record fetch size | SSR impact |
|---|---|---|
| 200 definitions × avg 5 active values each = 1,000 value records | ~50 KB JSON from Dataverse | Cached; zero SSR latency |
| 200 definitions → resolved map payload | ~10 KB JSON (200 slug-value pairs × 50 bytes) | Well within 50 ms p95 target |
| 500 definitions | ~25 KB resolved map | Still within target; raw fetch 150 KB begins to risk 2s cache-miss SLA |
| 1,000 definitions | ~50 KB resolved map | SSR latency risk on cache miss; 50 ms p95 not guaranteed |

The 200-definition ceiling is therefore the correct Phase 1 boundary. Any increase requires: (a) load test of the resolution endpoint at the proposed new ceiling, (b) review of the OData query fetching raw values (Section 6), (c) architect sign-off before the configuration change is deployed.

**Consequences:**
- `TOKEN_DEFINITION_SOFT_LIMIT` must be in the Zod environment schema for the API.
- The 422 error must surface clearly in the admin UI (not swallowed as a generic error).

**Documented here per CEO condition C-006.**

---

### ADR-003-007: Publish Debounce and Serialisation (CEO Deliverable 10)
**Status:** Accepted
**Date:** 2026-06-21
**Decided by:** Architect

**Context**

`POST /api/admin/tokens/publish` triggers a Dataverse re-fetch of all token definitions and values (potentially 200+ definitions × many values), followed by a cache rebuild. Rapid repeated calls from the same or different admin sessions would flood Dataverse with expensive OData queries. The CEO advisory (Issue 11) requires a minimum interval or queue-based serialisation.

**Decision:** Time-gate debounce with a 10-second minimum interval. Redis stores the last publish timestamp; if a publish request arrives within 10 seconds of the last publish, the route returns HTTP 429 with `Retry-After` header. In-progress publishes are serialised via a Redis lock (or a simple boolean flag in NodeCache for dev/test).

**Implementation:**

```
POST /api/admin/tokens/publish:
1. Acquire publish lock (Redis SET NX EX 60 "publishing:lock" "1")
   → if lock not acquired: return 429 { code: "publish_in_progress", retryAfter: 30 }
2. Check token:meta:lastPublishedAt from Redis
   → if (now - lastPublishedAt) < 10000 ms:
       release lock
       return 429 { code: "publish_rate_limited", retryAfter: remainingMs / 1000 }
3. Fetch all active definitions from Dataverse
4. Fetch all active values from Dataverse
5. Store token:raw:definitions and token:raw:values (live) in Redis
6. Flush all token:live:* resolved context maps (pattern delete)
7. SET token:meta:lastPublishedAt = now (no TTL)
8. Release lock
9. Return 204
```

**Lock TTL:** 60 seconds — if the publish operation crashes mid-flight, the lock auto-releases within 60 seconds preventing permanent lock.

**Rate limit window:** 10 seconds (configurable via `TOKEN_PUBLISH_MIN_INTERVAL_MS` env var, default `10000`).

**In dev/test (NodeCache fallback):** A module-level `lastPublishedAt: number | null` variable provides the debounce. The lock is a module-level `isPublishing: boolean` flag.

**Consequences:**
- Redis `SET NX` is the only Redis-specific command. The NodeCache fallback does not provide distributed lock semantics — a multi-instance dev setup can bypass the debounce. This is acceptable; multi-instance dev environments are not a stated requirement.
- The `Retry-After` header value is in seconds (RFC 7231).
- The 10-second minimum interval means at most 6 Dataverse full-fetch operations per minute per API deployment — well within Dataverse API limits.

**Documented here per CEO condition C-007.**

---

## 4. Component Diagram

```
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  Browser / SSR — Next.js App (apps/web)                                  │
  │                                                                          │
  │  ┌────────────────────────────────────┐  ┌────────────────────────────┐ │
  │  │  layout.tsx (root layout, SSR)     │  │  /admin/tokens (page.tsx)  │ │
  │  │  resolveTokensForSSR(context)      │  │  TanStack Query client     │ │
  │  │  injectTokenStyles(tokenMap)       │  │  definition + value grids  │ │
  │  │  <style>:root { --color-*: ... }   │  │  publish button            │ │
  │  └────────────────────────────────────┘  └──────────────┬─────────────┘ │
  │           │ SSR server-side call                         │ HTTP          │
  └───────────┼─────────────────────────────────────────────┼───────────────┘
              │                                              │
  ┌───────────▼──────────────────────────────────────────────▼───────────────┐
  │  Fastify API (apps/api) — existing app, new plugin files                 │
  │                                                                          │
  │  routes/tokens/resolve.ts       → GET /api/tokens/resolve (public)      │
  │  routes/admin/tokens.ts         → /api/admin/tokens/definitions + values │
  │  routes/service/tokens.ts       → /api/service/tokens (service-owner)   │
  │                                                                          │
  │  ┌─────────────────────────────────────────────────────────────────────┐ │
  │  │  TokenResolutionService  → resolves context → { slug: value }       │ │
  │  │  TokenDefinitionService  → CRUD for qdb_token_definitions           │ │
  │  │  TokenValueService       → CRUD for qdb_token_values                │ │
  │  │  TokenCacheService (if.) → get/set/flush live + draft caches        │ │
  │  └─────────────────────────────────────────────────────────────────────┘ │
  │                                                                          │
  │  implementations:                                                        │
  │  RedisTokenCache ──────────────────────────── Redis (production)        │
  │  NodeCacheTokenCache ───────────────────────── NodeCache (dev/test)     │
  │                                                                          │
  └───────┬──────────────────────────────────────────────────────────────────┘
          │ OData v9.2 + Bearer token (service principal)
  ┌───────▼──────────────────────────────────────────────────────────────────┐
  │  Dataverse org5869857f.crm4.dynamics.com                                │
  │  Solution: QdbDxpPlatform                                               │
  │                                                                          │
  │  ┌──────────────────────────────┐  ┌──────────────────────────────────┐ │
  │  │  qdb_token_definitions       │  │  qdb_token_values                 │ │
  │  │  (200 max definitions)       │  │  (N values per definition)        │ │
  │  │  alt key: qdb_slug           │  │  lookup → qdb_token_definitions   │ │
  │  └──────────────────────────────┘  └──────────────────────────────────┘ │
  └──────────────────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────────────────┐
  │  Cache Layer                                                             │
  │                                                                          │
  │  Redis (production)                        NodeCache (dev / fallback)   │
  │  token:live:*   — public resolution        liveTokenCache (300s TTL)    │
  │  token:draft:*  — admin preview            draftTokenCache (120s TTL)   │
  │  token:raw:*    — raw Dataverse records    (same NodeCache instances)   │
  │  token:meta:*   — publish metadata                                      │
  └──────────────────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────────────────┐
  │  Provisioning Script                                                     │
  │  projects/dxp-p1-003/scripts/provision-schema/                          │
  │  TypeScript + OData v9.2 (idempotent, same pattern as DXP-P1-001)       │
  │  Creates: GlobalOptionSets, 2 entities, relationship, alternate key,    │
  │  ~30 seed global token records                                          │
  └──────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Technology Stack

| Layer | Technology | Reason / ADR |
|---|---|---|
| Dataverse Schema | Dataverse Web API v9.2 OData, QdbDxpPlatform solution | Constitution Article XI; extends existing P1-001 solution |
| Backend API | Node.js + TypeScript + Fastify | Constitution default; extends existing portal-shell apps/api |
| Input Validation | Zod | Constitution Article III |
| Cache (production) | Redis (`ioredis`) | ADR-003-001; multi-instance shared cache |
| Cache (dev/test) | NodeCache | ADR-003-001; already used in P1-002 |
| Auth | JWT + `app.authenticate` + `app.requireRole` / `app.requirePermission` | P1-002 established pattern; `service-owner` role via CASL `AppAbility` |
| Frontend | Next.js + TypeScript + Tailwind CSS + Fluent UI v9 | Constitution default; extends existing admin UI |
| Client State | TanStack Query | Matches existing admin hooks pattern |
| Provisioning Script | TypeScript + OData HTTP | ADR-DXP-001 (P1-001); same separate script pattern |
| Logging | pino (via Fastify) | Constitution Article XIV |
| Testing | Vitest + Supertest | Constitution Article IV |

**No deviations from constitution defaults.** Redis is a new infrastructure dependency but is not a deviation from the technology constitution (which specifies PostgreSQL as the primary database; Redis is a cache layer). If Redis were replacing PostgreSQL, an ADR would be required.

---

## 6. Dataverse Schema Design

### 6.1 GlobalOptionSets (provisioned before entity creation)

All option set integer codes continue from the P1-001 series (`860004001–860004005`). P1-002 used no GlobalOptionSets. P1-003 uses the `860005xxx` range.

#### `qdb_token_type`

| Code | Label |
|---|---|
| 860005001 | color |
| 860005002 | typography-family |
| 860005003 | typography-size |
| 860005004 | typography-weight |
| 860005005 | spacing |
| 860005006 | border-radius |
| 860005007 | shadow |
| 860005008 | direction |

#### `qdb_token_level`

| Code | Label |
|---|---|
| 860005011 | global |
| 860005012 | render-target |
| 860005013 | category |
| 860005014 | component |
| 860005015 | service |

(Gap between 008 and 011 is intentional — leaves room for future token type additions without renumbering the level codes.)

#### `qdb_token_category`

| Code | Label |
|---|---|
| 860005021 | widget |
| 860005022 | form |
| 860005023 | nav-component |
| 860005024 | layout |
| 860005025 | data-display |

---

### 6.2 Entity: `qdb_token_definitions`

**Schema Name:** `qdb_Token_Definitions`
**Logical Name:** `qdb_token_definitions`
**Plural Logical Name:** `qdb_token_definitionses`
**Ownership Type:** `OrganizationOwned`
**Primary Name Attribute:** `qdb_Name`
**Solution:** `QdbDxpPlatform`
**HasActivities:** false
**HasNotes:** false

| Field | Schema Name | Logical Name | Type | OData Type | Constraints | Notes |
|---|---|---|---|---|---|---|
| PK | `qdb_Token_DefinitionsId` | `qdb_token_definitionsid` | UniqueIdentifier | — | System | Auto-generated |
| Name | `qdb_Name` | `qdb_name` | String | StringAttributeMetadata | RequiredLevel=ApplicationRequired, MaxLength=100 | PrimaryNameAttribute; display name, NOT the slug |
| Slug | `qdb_Slug` | `qdb_slug` | String | StringAttributeMetadata | RequiredLevel=ApplicationRequired, MaxLength=100 | Alternate key; kebab-case; immutable after creation |
| Token Type | `qdb_TokenType` | `qdb_tokentype` | OptionSet | PicklistAttributeMetadata (GlobalOptionSet: qdb_token_type) | RequiredLevel=ApplicationRequired | Integer code from 860005001–860005008 |
| Description | `qdb_Description` | `qdb_description` | Memo | MemoAttributeMetadata | RequiredLevel=None, MaxLength=1000 | Human-readable purpose |
| Default Value | `qdb_DefaultValue` | `qdb_defaultvalue` | String | StringAttributeMetadata | RequiredLevel=None, MaxLength=500 | Fallback when no value override exists at any level |
| Is Active | `qdb_IsActive` | `qdb_isactive` | Boolean | BooleanAttributeMetadata | RequiredLevel=None, DefaultValue=true | Soft delete; false = deactivated definition |
| State Code | `statecode` | `statecode` | State | — | System | 0=Active, 1=Inactive |
| Status Code | `statuscode` | `statuscode` | Status | — | System | |
| Created On | `createdon` | `createdon` | DateTime | — | System | |
| Modified On | `modifiedon` | `modifiedon` | DateTime | — | System | |
| Created By | `createdby` | `createdby` | Lookup(systemuser) | — | System | |
| Modified By | `modifiedby` | `modifiedby` | Lookup(systemuser) | — | System | |

**Alternate Key:** `qdb_TokenDefinitionSlugKey` on `qdb_slug`

Enables OData alternate-key addressing: `qdb_token_definitionses(qdb_slug='color-primary')`

**Slug immutability enforcement:** The PATCH schema (`TokenDefinitionPatchSchema`) intentionally omits `qdb_slug` and `qdb_tokentype`. Zod rejects any PATCH body containing these fields (compile-time absence, not runtime strip — same pattern as ADR-DXP-004 in P1-001).

**AC-017 — Cascade soft delete:** When a definition is soft-deleted (`qdb_IsActive = false`), the `TokenDefinitionService.deactivateDefinition()` method issues a Dataverse OData `$batch` operation to simultaneously set `qdb_IsActive = false` on all active `qdb_token_values` records for that definition. This is API-layer cascade (not Dataverse plugin cascade), consistent with the established P1-001 pattern.

---

### 6.3 Entity: `qdb_token_values`

**Schema Name:** `qdb_Token_Values`
**Logical Name:** `qdb_token_values`
**Plural Logical Name:** `qdb_token_valueses`
**Ownership Type:** `OrganizationOwned`
**Primary Name Attribute:** `qdb_Value` (use the CSS value string as the display field; Dataverse requires a primary name attribute)
**Solution:** `QdbDxpPlatform`
**HasActivities:** false
**HasNotes:** false

| Field | Schema Name | Logical Name | Type | OData Type | Constraints | Notes |
|---|---|---|---|---|---|---|
| PK | `qdb_Token_ValuesId` | `qdb_token_valuesid` | UniqueIdentifier | — | System | |
| Token Definition | `qdb_TokenDefinitionId` | `qdb_tokendefinitionid` | Lookup | LookupAttributeMetadata → qdb_token_definitions | RequiredLevel=ApplicationRequired | FK; cascade = Restrict (no delete on definition if active values exist via API layer) |
| Level | `qdb_Level` | `qdb_level` | OptionSet | PicklistAttributeMetadata (GlobalOptionSet: qdb_token_level) | RequiredLevel=ApplicationRequired | 860005011–860005015 |
| Render Target | `qdb_RenderTarget` | `qdb_rendertarget` | String | StringAttributeMetadata | RequiredLevel=None, MaxLength=50 | `portal` / `admin` / `mobile`; null if level ≠ render-target (Level 2) |
| Category | `qdb_Category` | `qdb_category` | OptionSet | PicklistAttributeMetadata (GlobalOptionSet: qdb_token_category) | RequiredLevel=None | 860005021–860005025; null if level < category (Level 3+) |
| Component Slug | `qdb_ComponentSlug` | `qdb_componentslug` | String | StringAttributeMetadata | RequiredLevel=None, MaxLength=100 | Matches qdb_name in qdb_component_definitions; null if level < component (Level 4+) |
| Service Slug | `qdb_ServiceSlug` | `qdb_serviceslug` | String | StringAttributeMetadata | RequiredLevel=None, MaxLength=100 | Service slug; null if level ≠ service (Level 5) |
| Locale | `qdb_Locale` | `qdb_locale` | String | StringAttributeMetadata | RequiredLevel=None, MaxLength=5 | null / `ar` / `en` |
| Value | `qdb_Value` | `qdb_value` | String | StringAttributeMetadata | RequiredLevel=ApplicationRequired, MaxLength=500 | CSS value string; PrimaryNameAttribute |
| Published On | `qdb_PublishedOn` | `qdb_publishedon` | DateTime | DateTimeAttributeMetadata | RequiredLevel=None | Set on live cache rebuild |
| Published By | `qdb_PublishedBy` | `qdb_publishedby` | String | StringAttributeMetadata | RequiredLevel=None, MaxLength=100 | userId of user who triggered the last publish |
| Is Active | `qdb_IsActive` | `qdb_isactive` | Boolean | BooleanAttributeMetadata | RequiredLevel=None, DefaultValue=true | Soft delete; false = deactivated override |
| State Code | `statecode` | `statecode` | State | — | System | 0=Active, 1=Inactive |
| Status Code | `statuscode` | `statuscode` | Status | — | System | |
| Created On | `createdon` | `createdon` | DateTime | — | System | |
| Modified On | `modifiedon` | `modifiedon` | DateTime | — | System | |
| Created By | `createdby` | `createdby` | Lookup(systemuser) | — | System | |
| Modified By | `modifiedby` | `modifiedby` | Lookup(systemuser) | — | System | |

**No alternate key on `qdb_token_values`:** Dataverse does not support composite alternate keys involving a Lookup field. Context uniqueness (same definition + same level context + same locale) is enforced at the API layer by `TokenValueService.ensureUniqueContext()` (GET-before-POST, same TOCTOU trade-off accepted in P1-001 for version uniqueness, same risk profile).

---

### 6.4 Relationship: `qdb_tokendefinition_values`

| Property | Value |
|---|---|
| Schema Name | `qdb_tokendefinition_values` |
| Type | One-to-Many (qdb_token_definitions → qdb_token_values) |
| Referenced Entity | `qdb_token_definitions` |
| Referencing Entity | `qdb_token_values` |
| Lookup Field Schema Name | `qdb_TokenDefinitionId` |
| Lookup Field Logical Name | `qdb_tokendefinitionid` |
| Delete Behaviour | **Restrict** — API-layer cascade soft-delete used instead; schema-level Restrict prevents orphan values |
| Cascade Assign | NoCascade |
| Cascade Share | NoCascade |

OData navigation property: `_qdb_tokendefinitionid_value` (the lookup GUID returned by OData queries)

`@odata.bind` pattern for create:
```
"qdb_TokenDefinitionId@odata.bind": "/qdb_token_definitionses(<definitionGuid>)"
```

Alternate-key bind (when creating by slug):
```
"qdb_TokenDefinitionId@odata.bind": "/qdb_token_definitionses(qdb_slug='color-primary')"
```

---

## 7. Service Layer Design

All services are interface-first, dependency-injected (no `new()` inside business logic), single-responsibility. The Fastify DI model uses closures (the same pattern as existing portal-shell routes).

### 7.1 `ITokenDefinitionRepository`

```typescript
interface ITokenDefinitionRepository {
  findAll(options: { activeOnly: boolean }): Promise<TokenDefinition[]>;
  findBySlug(slug: string): Promise<TokenDefinition | null>;
  findById(id: string): Promise<TokenDefinition | null>;
  countActive(): Promise<number>;
  create(payload: CreateTokenDefinitionPayload): Promise<TokenDefinition>;
  update(id: string, payload: UpdateTokenDefinitionPayload): Promise<void>;
  deactivate(id: string): Promise<void>;
}
```

### 7.2 `ITokenValueRepository`

```typescript
interface ITokenValueRepository {
  findAllActive(): Promise<TokenValue[]>;
  findByDefinitionId(definitionId: string, activeOnly: boolean): Promise<TokenValue[]>;
  findById(id: string): Promise<TokenValue | null>;
  findMatchingContext(params: TokenValueContextQuery): Promise<TokenValue | null>;
  create(payload: CreateTokenValuePayload): Promise<TokenValue>;
  deactivate(id: string): Promise<void>;
  deactivateAllForDefinition(definitionId: string): Promise<void>;  // cascade on definition soft-delete
}
```

### 7.3 `TokenDefinitionService`

Single responsibility: CRUD for token definitions. Enforces slug immutability, kebab-case validation, soft-limit guard, and cascade soft-delete.

```
TokenDefinitionService
  ├── listDefinitions(activeOnly: boolean): Promise<TokenDefinition[]>
  ├── getDefinitionBySlug(slug: string): Promise<TokenDefinition>         // throws NotFoundError
  ├── createDefinition(payload): Promise<TokenDefinition>
  │     — validates kebab-case slug
  │     — enforces TOKEN_DEFINITION_SOFT_LIMIT (ADR-003-006)
  │     — checks slug uniqueness (409 on duplicate)
  ├── updateDefinition(slug, patch): Promise<void>
  │     — only description and defaultValue are patchable
  │     — slug and tokenType are absent from UpdateTokenDefinitionPayload
  └── deactivateDefinition(slug): Promise<void>
        — deactivates definition record
        — calls tokenValueRepository.deactivateAllForDefinition() (cascade)
        — invalidates draft cache
```

### 7.4 `TokenValueService`

Single responsibility: CRUD for token value overrides. Enforces context uniqueness, service-slug scoping for `service-owner` callers, and triggers draft cache invalidation on every write.

```
TokenValueService
  ├── listValues(filters: TokenValueFilters): Promise<TokenValue[]>
  ├── getValueById(id: string): Promise<TokenValue>
  ├── createValue(payload, callerContext: CallerContext): Promise<TokenValue>
  │     — validates level-specific context fields (e.g. renderTarget must be set if level=render-target)
  │     — for service-level (Level 5): enforces qdb_serviceslug === callerContext.serviceSlug
  │     — calls ensureUniqueContext() → 409 on duplicate context
  │     — triggers draftTokenCache.invalidate()
  ├── deactivateValue(id, callerContext: CallerContext): Promise<void>
  │     — for service-owner: confirms qdb_serviceslug matches callerContext.serviceSlug → 403 on mismatch
  │     — triggers draftTokenCache.invalidate()
  └── ensureUniqueContext(definitionId, level, ctx, locale): Promise<void>
        — GET existing active value matching the full context
        — throws ConflictError if found
```

`CallerContext`:
```typescript
interface CallerContext {
  role: string;             // 'portal-admin' | 'service-owner' | ...
  serviceSlug: string | null; // extracted from RBAC resolution for service-owner; null for admin
  userId: string;
}
```

### 7.5 `TokenResolutionService`

Single responsibility: given a resolution context and a set of raw records, compute the resolved `{ slug: value }` map. Pure function — no I/O.

```typescript
interface TokenResolutionContext {
  renderTarget: 'portal' | 'admin' | 'mobile';
  locale: 'ar' | 'en' | null;
  service: string | null;
  category: string | null;
  componentSlug: string | null;
}

class TokenResolutionService {
  resolve(
    definitions: TokenDefinition[],
    values: TokenValue[],
    context: TokenResolutionContext,
  ): Record<string, string>;
}
```

**Resolution algorithm (authoritative implementation contract):**

```
resolve(definitions, values, context):
  result = {}
  for each definition in definitions where qdb_isactive = true:
    candidates = values.filter(v =>
      v.qdb_tokendefinitionid === definition.id &&
      v.qdb_isactive === true &&
      matchesContext(v, context)
    )
    sorted = candidates.sort((a, b) =>
      specificityOf(b) - specificityOf(a) ||
      localeSpecificityOf(b) - localeSpecificityOf(a)
    )
    winner = sorted[0]
    result[definition.qdb_slug] = winner?.qdb_value ?? definition.qdb_defaultvalue ?? ''
  return result

matchesContext(value, context):
  switch value.qdb_level:
    case global (860005011):    return true  // matches all contexts
    case render-target (860005012): return value.qdb_rendertarget === context.renderTarget
    case category (860005013):  return (
      value.qdb_rendertarget === context.renderTarget || value.qdb_rendertarget === null
    ) && value.qdb_category matches context.category
    case component (860005014): return (
      value.qdb_rendertarget matches || null
    ) && (value.qdb_category matches || null) && value.qdb_componentslug === context.componentSlug
    case service (860005015):   return value.qdb_serviceslug === context.service

specificityOf(value):
  switch value.qdb_level:
    case service:       return 50
    case component:     return 40
    case category:      return 30
    case render-target: return 20
    case global:        return 10

localeSpecificityOf(value):
  if value.qdb_locale === context.locale: return 2
  if value.qdb_locale === null:           return 1
  return 0   // locale-specific for a different locale → excluded (not selected)
```

**Locale exclusion rule:** A value with `qdb_locale = 'en'` is NOT selected when `context.locale = 'ar'`, and vice versa. Only `locale = null` (neutral) or `locale = context.locale` (matching) values are candidates. The `localeSpecificityOf` returning 0 for a non-matching locale is sufficient — the sort will prefer neutral (1) over non-matching (0), and the filter implicitly excludes them because locale-mismatched values will never be the winner (locale-neutral beats locale-mismatched at the same specificity level, and locale-matching beats both).

---

## 8. Cache Layer Design

### 8.1 `ITokenCacheService` Interface

```typescript
interface ITokenCacheService {
  // Raw record store
  getRawDefinitions(): Promise<TokenDefinition[] | null>;
  setRawDefinitions(definitions: TokenDefinition[]): Promise<void>;
  getRawValues(cacheType: 'live' | 'draft'): Promise<TokenValue[] | null>;
  setRawValues(cacheType: 'live' | 'draft', values: TokenValue[]): Promise<void>;

  // Resolved context map store
  getResolvedMap(cacheType: 'live' | 'draft', contextKey: string): Promise<Record<string, string> | null>;
  setResolvedMap(cacheType: 'live' | 'draft', contextKey: string, map: Record<string, string>): Promise<void>;

  // Publish metadata
  getLastPublishedAt(): Promise<Date | null>;
  setLastPublishedAt(date: Date): Promise<void>;

  // Invalidation
  flushLiveCache(): Promise<void>;    // flushes token:live:* and token:raw:values:live
  flushDraftCache(): Promise<void>;   // flushes token:draft:* and token:raw:values:draft
  flushAllResolvedMaps(cacheType: 'live' | 'draft'): Promise<void>;  // pattern delete on resolved context maps

  // Publish lock (serialisation — ADR-003-007)
  acquirePublishLock(ttlSeconds: number): Promise<boolean>;   // Redis SET NX; NodeCache: boolean flag
  releasePublishLock(): Promise<void>;
}
```

### 8.2 `RedisTokenCache` (production)

Implements `ITokenCacheService` using `ioredis`. All keys prefixed `token:`. Pattern delete for cache flush uses Redis `SCAN` + `DEL` (not `KEYS` — KEYS blocks the Redis event loop).

Key naming:
```
token:raw:definitions                    — JSON array of TokenDefinition
token:raw:values:live                    — JSON array of TokenValue (live)
token:raw:values:draft                   — JSON array of TokenValue (draft)
token:live:<contextKey>                  — JSON map { slug: value }
token:draft:<contextKey>                 — JSON map { slug: value }
token:meta:lastPublishedAt               — ISO 8601 timestamp string
token:lock:publish                       — SET NX EX 60 (presence = lock held)
```

Context key construction:
```typescript
function buildContextKey(ctx: TokenResolutionContext): string {
  const parts = [
    ctx.renderTarget ?? '_',
    ctx.locale ?? '_',
    ctx.service ?? '_',
    ctx.category ?? '_',
    ctx.componentSlug ?? '_',
  ];
  return parts.join(':');
}
// Example: "portal:ar:home-finance:widget:hero-banner"
```

### 8.3 `NodeCacheTokenCache` (dev/test fallback)

Implements `ITokenCacheService` using two `NodeCache` instances (`liveTokenCache`, `draftTokenCache`). The publish lock is a module-level `isPublishing: boolean`. Pattern-delete is simulated by iterating `nodeCache.keys()` and filtering by prefix.

### 8.4 Resolution Flow for `GET /api/tokens/resolve` (cache-first)

```
1. Build contextKey from query params
2. resolvedMap = cacheService.getResolvedMap('live', contextKey)
3. if resolvedMap !== null:
     return resolvedMap  // cache hit — p95 target: <5 ms
4. // Cache miss
   rawDefs = cacheService.getRawDefinitions()
   rawVals = cacheService.getRawValues('live')
5. if rawDefs === null || rawVals === null:
     // Raw records cache miss — fetch from Dataverse
     rawDefs = await tokenDefinitionRepository.findAll({ activeOnly: true })
     rawVals = await tokenValueRepository.findAllActive()
     await cacheService.setRawDefinitions(rawDefs)
     await cacheService.setRawValues('live', rawVals)
6. resolvedMap = tokenResolutionService.resolve(rawDefs, rawVals, context)
7. await cacheService.setResolvedMap('live', contextKey, resolvedMap)
8. return resolvedMap
```

This two-tier cache (raw records → resolved map) means:
- Most requests hit the resolved map cache directly (Step 3).
- A cache miss on a new context key still serves from raw records if those are cached (Steps 4–7, no Dataverse call).
- Only on cold start or post-publish does the system call Dataverse (Step 5).

---

## 9. API Route Contracts

### Auth patterns

```typescript
// Fastify preHandlers (same pattern as P1-001/P1-002):
app.authenticate          // validates JWT, populates request.user
app.requireRole('portal-admin')     // role string check
app.requireRole('service-owner')    // role string check
// No preHandler on public routes
```

**Service slug extraction for `service-owner` routes:**

The JWT does not embed the service slug (it is not in the frozen P1-002 JWT structure). For `service-owner` routes, the Fastify handler calls `RbacService.getActiveRoles(request.user.sub)` to find the role record with `qdb_role_slug LIKE 'service-owner:%'` and extracts the slug suffix. This one Dataverse round-trip per `service-owner` request is acceptable; the RBAC ability cache (P1-002, NodeCache) returns roles from cache on subsequent calls within the 900s TTL.

Alternatively, the `service-owner` slug can be encoded as `service-owner:loan-services` in the `qdb_role_slug` field (P1-002 OI-001 left this open; this architecture resolves it). The API extracts the suffix after `:`. If no suffix is present, the route returns 403.

---

### Route Group 1: Public — Token Resolution

#### GET /api/tokens/resolve

**Auth:** None (public, unauthenticated)
**Cache:** Live cache (ADR-003-001)

**Zod Query Schema:**
```typescript
const TokenResolveQuerySchema = z.object({
  renderTarget: z.enum(['portal', 'admin', 'mobile']).default('portal'),
  locale:        z.enum(['ar', 'en']).optional(),
  service:       z.string().regex(/^[a-z0-9-]+$/).optional(),
  category:      z.string().regex(/^[a-z0-9-]+$/).optional(),
  componentSlug: z.string().regex(/^[a-z0-9-]+$/).optional(),
});
```

**Request:**
```
GET /api/tokens/resolve?renderTarget=portal&locale=ar&service=home-finance
```

**Response (200):**
```json
{
  "data": {
    "color-primary": "#1a4d8f",
    "color-surface": "#ffffff",
    "font-family-body": "IBM Plex Sans Arabic",
    "font-size-body": "16px",
    "text-direction": "rtl",
    "icon-mirror": "true",
    "spacing-md": "16px"
  }
}
```

Note: `icon-mirror` value `"true"` is stored in Dataverse and returned by the API as-is. The portal shell injection layer converts it to `"1"` before emitting the CSS custom property (ADR-003-005). The API does not perform this conversion — it returns the raw stored value.

**Error codes:**
| HTTP | Code | Trigger |
|---|---|---|
| 400 | `validation_error` | Zod parse failure on query params |
| 500 | `cache_unavailable` | Both Redis and NodeCache failed; Dataverse also unavailable |

**Performance contract:** The response must originate from the cache (resolved map cache hit). Cold-start or post-publish Dataverse fetch is a cache miss scenario; NFR-002 (≤2s) governs that path. The endpoint logs a `cache_miss` structured log entry when the Dataverse path is taken.

---

### Route Group 2: Admin — Token Definitions

All routes: **Auth:** `app.authenticate` + `app.requireRole('portal-admin')`

#### GET /api/admin/tokens/definitions

**Zod Query Schema:**
```typescript
const TokenDefinitionListQuerySchema = z.object({
  activeOnly: z.coerce.boolean().default(true),
  tokenType:  z.coerce.number().int().optional(),
  top:        z.coerce.number().int().min(1).max(250).default(50),
  skip:       z.coerce.number().int().min(0).default(0),
});
```

**OData query:**
```
GET /qdb_token_definitionses
  ?$select=qdb_token_definitionsid,qdb_name,qdb_slug,qdb_tokentype,qdb_description,
           qdb_defaultvalue,qdb_isactive,statecode,createdon,modifiedon
  &$filter=statecode eq 0 [and qdb_tokentype eq <N> if provided]
  &$orderby=qdb_slug asc
  &$top=<top>&$skip=<skip>&$count=true
```

**Response (200):**
```typescript
{
  data: TokenDefinitionSummary[];
  meta: { total: number; top: number; skip: number };
}
interface TokenDefinitionSummary {
  id: string;           // qdb_token_definitionsid
  name: string;         // qdb_name
  slug: string;         // qdb_slug
  tokenType: number;    // option set integer code
  description: string | null;
  defaultValue: string | null;
  isActive: boolean;
  createdOn: string;
  modifiedOn: string;
}
```

---

#### POST /api/admin/tokens/definitions

**Zod Body Schema:**
```typescript
const TokenDefinitionCreateSchema = z.object({
  name:         z.string().min(1).max(100),
  slug:         z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be kebab-case'),
  tokenType:    z.number().int().min(860005001).max(860005008),
  description:  z.string().max(1000).optional(),
  defaultValue: z.string().max(500).optional(),
});
```

**Service checks:**
1. `TokenDefinitionService.createDefinition()` calls `countActive()` → 422 if ≥ `TOKEN_DEFINITION_SOFT_LIMIT`.
2. GET by alternate key `qdb_slug='<slug>'` → 409 if exists.
3. POST to `qdb_token_definitionses` with `MSCRM.SolutionUniqueName: QdbDxpPlatform`.

**Response:** 201 `{ data: TokenDefinitionSummary }`

**Error codes:**
| HTTP | Code | Trigger |
|---|---|---|
| 400 | `validation_error` | Zod failure |
| 409 | `duplicate_token_slug` | Slug already exists |
| 422 | `token_definition_limit_reached` | Active count ≥ soft limit |

---

#### GET /api/admin/tokens/definitions/:slug

**Route param schema:** `z.object({ slug: z.string().regex(/^[a-z0-9-]+$/) })`

**OData:** `GET /qdb_token_definitionses(qdb_slug='<slug>')?$select=...`

**Response:** 200 `{ data: TokenDefinitionDetail }`

```typescript
interface TokenDefinitionDetail extends TokenDefinitionSummary {
  // no additional fields at this level; summary is the detail shape for definitions
}
```

**Error:** 404 `token_definition_not_found`

---

#### PATCH /api/admin/tokens/definitions/:slug

**Zod Body Schema (slug and tokenType intentionally absent — immutable):**
```typescript
const TokenDefinitionPatchSchema = z.object({
  name:         z.string().min(1).max(100).optional(),
  description:  z.string().max(1000).optional(),
  defaultValue: z.string().max(500).optional(),
});
```

**OData:** `PATCH /qdb_token_definitionses(qdb_slug='<slug>')` with supplied mutable fields only.

Changing `defaultValue` does not automatically trigger a cache rebuild — the default value is used only during resolution when no value record matches. The caller is expected to call publish if the defaultValue change should take immediate live effect.

**Response:** 204

---

### Route Group 3: Admin — Token Values

All routes: **Auth:** `app.authenticate` + `app.requireRole('portal-admin')`

#### GET /api/admin/tokens/values

**Zod Query Schema:**
```typescript
const TokenValueListQuerySchema = z.object({
  slug:    z.string().regex(/^[a-z0-9-]+$/).optional(),
  level:   z.coerce.number().int().optional(),
  service: z.string().optional(),
  activeOnly: z.coerce.boolean().default(true),
  top:     z.coerce.number().int().min(1).max(250).default(50),
  skip:    z.coerce.number().int().min(0).default(0),
});
```

**OData filter construction:**
```
$filter=statecode eq 0
  [and _qdb_tokendefinitionid_value eq <definitionGuid> if slug provided]
  [and qdb_level eq <N> if level provided]
  [and qdb_serviceslug eq '<service>' if service provided]
```

When filtering by `slug`, the service first resolves the definition GUID via `findBySlug(slug)`.

**Response (200):** `{ data: TokenValueSummary[]; meta: { total; top; skip } }`

```typescript
interface TokenValueSummary {
  id: string;              // qdb_token_valuesid
  definitionId: string;
  definitionSlug: string;  // joined from definition record
  level: number;           // option set code
  renderTarget: string | null;
  category: number | null;
  componentSlug: string | null;
  serviceSlug: string | null;
  locale: string | null;
  value: string;
  publishedOn: string | null;
  publishedBy: string | null;
  isActive: boolean;
  createdOn: string;
  modifiedOn: string;
}
```

---

#### POST /api/admin/tokens/values

**Zod Body Schema:**
```typescript
const TokenValueCreateSchema = z.object({
  definitionSlug: z.string().regex(/^[a-z0-9-]+$/),
  level:          z.number().int().min(860005011).max(860005015),
  renderTarget:   z.enum(['portal', 'admin', 'mobile']).optional(),
  category:       z.number().int().optional(),  // qdb_token_category option set code
  componentSlug:  z.string().regex(/^[a-z0-9-]+$/).optional(),
  serviceSlug:    z.string().regex(/^[a-z0-9-]+$/).optional(),
  locale:         z.enum(['ar', 'en']).optional(),
  value:          z.string().min(1).max(500),
}).superRefine((data, ctx) => {
  // Enforce context field requirements per level
  if (data.level === 860005012 && !data.renderTarget) {
    ctx.addIssue({ code: 'custom', message: 'renderTarget is required for render-target level' });
  }
  if (data.level === 860005013 && !data.category) {
    ctx.addIssue({ code: 'custom', message: 'category is required for category level' });
  }
  if (data.level === 860005014 && !data.componentSlug) {
    ctx.addIssue({ code: 'custom', message: 'componentSlug is required for component level' });
  }
  if (data.level === 860005015 && !data.serviceSlug) {
    ctx.addIssue({ code: 'custom', message: 'serviceSlug is required for service level' });
  }
});
```

**Service flow:**
1. Resolve definition GUID from `definitionSlug`.
2. `ensureUniqueContext()` — 409 if a value with the exact same context already exists.
3. POST to `qdb_token_valueses` with `qdb_TokenDefinitionId@odata.bind`.
4. Trigger `draftTokenCache.flushAllResolvedMaps('draft')`.

**Response:** 201 `{ data: TokenValueSummary }`

**Error codes:**
| HTTP | Code | Trigger |
|---|---|---|
| 400 | `validation_error` | Zod failure or missing level-specific context field |
| 404 | `token_definition_not_found` | definitionSlug not found |
| 409 | `duplicate_token_value_context` | Same definition + context already has an active value |

---

#### DELETE /api/admin/tokens/values/:id

**Route param:** `z.object({ id: z.string().uuid() })`

**Service flow:**
1. GET value by ID → 404 if not found or already inactive.
2. Set `qdb_IsActive = false` and `statecode = 1` on the record.
3. Trigger `draftTokenCache.flushAllResolvedMaps('draft')`.

**Response:** 204

**Error:** 404 `token_value_not_found`

---

#### POST /api/admin/tokens/publish

**Auth:** `app.authenticate` + `app.requireRole('portal-admin')`

**Request body:** None

**Service flow (ADR-003-007):**
1. `cacheService.acquirePublishLock(60)` → 429 `publish_in_progress` if not acquired.
2. `cacheService.getLastPublishedAt()` → 429 `publish_rate_limited` with `Retry-After` header if within 10s.
3. Fetch all active definitions from Dataverse.
4. Fetch all active values from Dataverse.
5. `cacheService.setRawDefinitions(definitions)`.
6. `cacheService.setRawValues('live', values)`.
7. `cacheService.flushAllResolvedMaps('live')`.
8. `cacheService.setLastPublishedAt(new Date())`.
9. Update `qdb_PublishedOn` and `qdb_PublishedBy` on all active value records. This is a batch PATCH to Dataverse — use OData `$batch` with up to 50 records per batch request.
10. `cacheService.releasePublishLock()`.
11. Return 204.

**Error codes:**
| HTTP | Code | Trigger |
|---|---|---|
| 429 | `publish_in_progress` | Lock not acquired |
| 429 | `publish_rate_limited` | Within 10s of last publish; `Retry-After` header set |
| 500 | `dataverse_error` | Dataverse fetch failed; lock released; cache not rebuilt |

**Duration SLA:** Must complete in ≤5s (NFR-003). With 200 definitions and ~1000 values, two OData SELECT queries (definitions + values) take ~500ms each; batch PATCH for `publishedOn/By` updates can be done fire-and-forget after returning 204 to avoid blocking the response.

---

### Route Group 4: Admin — Token Preview (draft cache)

#### GET /api/admin/tokens/preview

**Auth:** `app.authenticate` + `app.requireRole('portal-admin')`

**Purpose:** Resolves tokens from the draft cache (including unpublished changes). Used by admin UI to preview how the portal will look before publishing.

**Query schema:** Same as `GET /api/tokens/resolve` (`TokenResolveQuerySchema`)

**Response:** Same shape as `GET /api/tokens/resolve`

**Cache source:** Draft cache (not live cache)

---

### Route Group 5: Service-Owner — Token Values

All routes: **Auth:** `app.authenticate` + `app.requireRole('service-owner')`

**Service slug enforcement:** The handler extracts `serviceSlug` by calling `RbacService.getServiceSlugFromRole(request.user.sub)` which returns the suffix after `:` in the `service-owner:<slug>` role record. If no service slug is found, returns 403.

#### GET /api/service/tokens

**Query schema:**
```typescript
const ServiceTokenQuerySchema = z.object({
  renderTarget: z.enum(['portal', 'admin', 'mobile']).default('portal'),
  locale:       z.enum(['ar', 'en']).optional(),
});
```

**Behaviour:** Calls the token resolution service with `service = callerServiceSlug` and returns the resolved token map for the caller's service. This serves from the live cache (same as the public resolve endpoint, but authenticated and service-scoped).

**Response:** `{ data: Record<string, string> }`

---

#### POST /api/service/tokens/values

**Zod Body Schema:**
```typescript
const ServiceTokenValueCreateSchema = z.object({
  definitionSlug: z.string().regex(/^[a-z0-9-]+$/),
  locale:         z.enum(['ar', 'en']).optional(),
  value:          z.string().min(1).max(500),
});
// level is always 860005015 (service); serviceSlug comes from JWT — not accepted from body
```

**Service flow:**
1. Extract `serviceSlug` from JWT RBAC role → 403 if none.
2. Resolve definition GUID from `definitionSlug`.
3. `ensureUniqueContext()` for level=service, serviceSlug=caller's slug.
4. Create value record with `qdb_level = 860005015` and `qdb_serviceslug = callerServiceSlug`.
5. Trigger draft cache invalidation.

**Security enforcement:** The `qdb_ServiceSlug` in the created Dataverse record is always set from the JWT-derived `callerServiceSlug`, not from the request body. A `service-owner` cannot create a Level 5 value for a different service slug.

**Response:** 201 `{ data: TokenValueSummary }`

**Error codes:**
| HTTP | Code | Trigger |
|---|---|---|
| 400 | `validation_error` | Zod failure |
| 403 | `service_slug_mismatch` | Service slug in request does not match JWT claim |
| 403 | `no_service_slug` | Caller's role has no service slug suffix |
| 404 | `token_definition_not_found` | |
| 409 | `duplicate_token_value_context` | |

---

#### DELETE /api/service/tokens/values/:id

**Auth:** `app.authenticate` + `app.requireRole('service-owner')`

**Service flow:**
1. GET value by ID → 404 if not found.
2. Verify `qdb_serviceslug === callerServiceSlug` → 403 `service_slug_mismatch` if not.
3. Soft-delete (set `qdb_IsActive = false`).
4. Trigger draft cache invalidation.

**Response:** 204

---

## 10. Error Response Schema

Extends the ADR-DXP-005 (P1-001) `code`/`message` pattern. No change to the shape.

**Additional error codes for token routes:**

| HTTP | Code | Trigger |
|---|---|---|
| 400 | `validation_error` | Zod failure; `fields` array populated |
| 400 | `immutable_field` | PATCH body contains `slug` or `tokenType` |
| 400 | `invalid_level_context` | Missing required context field for the specified level |
| 404 | `token_definition_not_found` | |
| 404 | `token_value_not_found` | |
| 409 | `duplicate_token_slug` | Slug already exists on create |
| 409 | `duplicate_token_value_context` | Same context already has an active value |
| 422 | `token_definition_limit_reached` | Soft limit reached |
| 429 | `publish_in_progress` | Publish lock held |
| 429 | `publish_rate_limited` | Within debounce window |
| 403 | `service_slug_mismatch` | Service-owner wrote to wrong service |
| 403 | `no_service_slug` | Service-owner has no service slug in role |
| 500 | `dataverse_error` | OData call failed |
| 500 | `cache_unavailable` | Both Redis and NodeCache unavailable |

---

## 11. Provisioning Plan

**Script location:** `projects/dxp-p1-003/scripts/provision-schema/`

Follows the ADR-DXP-001 pattern — separate TypeScript project mirroring the P1-001 structure.

### Module Structure

```
src/
  index.ts
  config/
    schema.ts    — Zod env schema (adds REDIS_URL optional)
    env.ts
  auth/
    TokenProvider.ts    — mirror of P1-001
  http/
    DataverseHttpClient.ts
  preflight/
    PublisherCheck.ts
    ExistingSolutionCheck.ts
    PicklistConflictCheck.ts   — confirms qdb_token_type/level/category do not exist
  solution/
    SolutionProvisioner.ts     — uses existing QdbDxpPlatform (idempotent: skip if exists)
  optionsets/
    GlobalOptionSetProvisioner.ts  — provisions all 3 option sets
  entities/
    EntityCreationOrchestrator.ts
    EntityProvisioner.ts
    definitions/
      tokenDefinitions.ts    — qdb_token_definitions metadata payload
      tokenValues.ts         — qdb_token_values metadata payload
  relationships/
    RelationshipProvisioner.ts
  alternatekeys/
    AlternateKeyProvisioner.ts
  seed/
    SeedOrchestrator.ts
    TokenDefinitionSeed.ts   — 30 Level 1 global token definitions
    TokenValueSeed.ts        — Level 1 global + locale=ar seed values
  validation/
    PostProvisioningValidator.ts
  output/
    ProvisioningCompleteEmitter.ts
```

### Batch Structure

**Batch A — Entities with no lookups to provisioned entities:**
- `qdb_token_definitions` (no FK)

**Batch B — Entities with lookup to Batch A:**
- `qdb_token_values` (lookup → `qdb_token_definitions`)

**Batch C — Post-entity artefacts (sequential):**
- Relationship: `qdb_tokendefinition_values` (N:1)
- Alternate key: `qdb_TokenDefinitionSlugKey` on `qdb_token_definitions.qdb_slug`

Settlement delay: 20 seconds after each entity creation (same as P1-001 pattern).

### Option Set Code Allocation

**This engagement uses codes `860005001–860005025`. The next engagement (DXP-P1-004) should start at `860005031` or use a new `860006xxx` series.**

| Series | Used for |
|---|---|
| `860004001–860004005` | P1-001 qdb_component_category |
| `860005001–860005008` | P1-003 qdb_token_type |
| `860005011–860005015` | P1-003 qdb_token_level |
| `860005021–860005025` | P1-003 qdb_token_category |

### Seed Token List (~30 Level 1 Global Definitions)

All seed definitions have `qdb_level = null` (they are definitions only; the Level 1 values are seed via `TokenValueSeed.ts`).

**Color tokens (8):**

| Slug | Token Type | Default Value (placeholder) | Notes |
|---|---|---|---|
| `color-primary` | color | `#1a4d8f` | Main brand colour — QDB to replace |
| `color-primary-hover` | color | `#153f78` | Hover state of primary |
| `color-surface` | color | `#ffffff` | Page/card background |
| `color-surface-secondary` | color | `#f5f5f5` | Secondary surface (sidebars, panels) |
| `color-text-primary` | color | `#1a1a1a` | Primary body text |
| `color-text-muted` | color | `#6b7280` | Muted/caption text |
| `color-border` | color | `#e5e7eb` | Default border |
| `color-error` | color | `#dc2626` | Error/danger |

**Typography tokens (8):**

| Slug | Token Type | Default Value (placeholder) |
|---|---|---|
| `font-family-body` | typography-family | `'IBM Plex Sans', sans-serif` |
| `font-family-heading` | typography-family | `'IBM Plex Sans', sans-serif` |
| `font-size-body` | typography-size | `16px` |
| `font-size-sm` | typography-size | `14px` |
| `font-size-h1` | typography-size | `32px` |
| `font-size-h2` | typography-size | `24px` |
| `font-size-h3` | typography-size | `20px` |
| `font-weight-bold` | typography-weight | `600` |

**Spacing tokens (5):**

| Slug | Token Type | Default Value |
|---|---|---|
| `spacing-xs` | spacing | `4px` |
| `spacing-sm` | spacing | `8px` |
| `spacing-md` | spacing | `16px` |
| `spacing-lg` | spacing | `24px` |
| `spacing-xl` | spacing | `40px` |

**Border / Shadow tokens (4):**

| Slug | Token Type | Default Value |
|---|---|---|
| `radius-sm` | border-radius | `4px` |
| `radius-md` | border-radius | `8px` |
| `radius-card` | border-radius | `12px` |
| `shadow-card` | shadow | `0 2px 8px rgba(0,0,0,0.08)` |

**Direction tokens (2):**

| Slug | Token Type | Default Value | Notes |
|---|---|---|---|
| `text-direction` | direction | `ltr` | `locale=ar` value: `rtl` |
| `icon-mirror` | direction | `false` | `locale=ar` value: `true`; stored as string (ADR-003-005) |

**Arabic locale seed values (included in TokenValueSeed.ts):**

The following Level 1 values with `qdb_locale = 'ar'` are seeded:

| Slug | Level | Locale | Value | Notes |
|---|---|---|---|---|
| `font-family-body` | global | ar | `'IBM Plex Sans Arabic', 'IBM Plex Sans', sans-serif` | OQ-005 placeholder |
| `font-family-heading` | global | ar | `'IBM Plex Sans Arabic', 'IBM Plex Sans', sans-serif` | OQ-005 placeholder |
| `text-direction` | global | ar | `rtl` | |
| `icon-mirror` | global | ar | `true` | Converted to CSS `1` at injection |

**All seed values are marked as placeholders in `qdb_description`.** Final QDB brand values replace them before go-live (OQ-005 dependency — see Section 14).

### Idempotency Strategy

Mirrors P1-001 exactly:

| Step | Check | Action on conflict |
|---|---|---|
| Solution | GET by uniquename | Skip if exists |
| Option sets (3) | GET GlobalOptionSetDefinitions by Name | Skip if exists |
| Entities (Batch A/B) | GET EntityDefinitions by LogicalName | Skip if exists |
| Relationship (Batch C) | GET RelationshipDefinitions by SchemaName | Skip if exists |
| Alternate key (Batch C) | GET Entity Keys by SchemaName | Skip if exists |
| Seed definitions | GET by alternate key `qdb_slug='<slug>'` | PATCH (upsert) if exists |
| Seed values | GET by `_qdb_tokendefinitionid_value + qdb_level + qdb_locale` | PATCH if exists |

### Post-Provisioning Validation Checklist

1. Entity `qdb_token_definitions` exists
2. Entity `qdb_token_values` exists
3. GlobalOptionSet `qdb_token_type` exists with 8 values
4. GlobalOptionSet `qdb_token_level` exists with 5 values
5. GlobalOptionSet `qdb_token_category` exists with 5 values
6. Solution `QdbDxpPlatform` exists (pre-existing; verify component count increased)
7. Relationship `qdb_tokendefinition_values` exists
8. Alternate key `qdb_TokenDefinitionSlugKey` exists on `qdb_token_definitions`
9. All 27 seed token definitions exist (queried by `qdb_slug`)
10. 4 Arabic locale seed values exist (queried by definition + locale)
11. QdbPortalShell and QdbDynamicFormEngine component counts unchanged (snapshot guard from P1-001)

---

## 12. Next.js SSR Integration

**Location:** `apps/web/src/lib/tokens/`

### Files

```
apps/web/src/
  lib/tokens/
    resolveTokens.ts     — calls GET /api/tokens/resolve; typed return
    injectTokenStyles.ts — converts token map to CSS string; applies ADR-003-005 conversion
    tokenContext.ts      — builds TokenResolutionContext from Next.js page context
  app/[locale]/
    layout.tsx           — root layout calls resolveTokens at SSR; injects <style>
```

### Root Layout Integration

```typescript
// apps/web/src/app/[locale]/layout.tsx (Server Component)

import { resolveTokensForSSR } from '@/lib/tokens/resolveTokens';
import { buildCSSCustomProperties } from '@/lib/tokens/injectTokenStyles';

export default async function RootLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const tokenMap = await resolveTokensForSSR({
    renderTarget: 'portal',
    locale: locale === 'ar' ? 'ar' : 'en',
    // service, category, componentSlug omitted at layout level (ADR-003-004)
  });

  const cssVars = buildCSSCustomProperties(tokenMap);

  return (
    <html lang={locale} dir={tokenMap['text-direction'] ?? 'ltr'}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: `:root { ${cssVars} }` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

### `resolveTokensForSSR`

```typescript
// apps/web/src/lib/tokens/resolveTokens.ts

const TOKEN_API_URL = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL;

export async function resolveTokensForSSR(
  context: TokenResolutionContext,
): Promise<Record<string, string>> {
  const params = buildQueryParams(context);
  const response = await fetch(`${TOKEN_API_URL}/api/tokens/resolve?${params}`, {
    // next: { revalidate: 300 } — Next.js 14 fetch cache; 5 min revalidation
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    // Fail gracefully — return empty map; page renders without CSS vars
    console.error('[tokens] Failed to fetch token map', { status: response.status });
    return {};
  }

  const body = await response.json() as { data: Record<string, string> };
  return body.data;
}
```

**Why `next: { revalidate: 300 }`:** The Next.js fetch cache (ISR) provides an additional caching layer for SSR. On the server, multiple layout renders within 5 minutes share the same cached fetch response without hitting the token API on every request. This is complementary to the Fastify-side cache — not a replacement. After `POST /api/admin/tokens/publish`, the Next.js server-side cache is stale for up to 5 minutes. If immediate SSR reflection after publish is required, the publish route should also call `revalidatePath('/')` via the Next.js cache-invalidation API (a background HTTP call to the Next.js revalidation endpoint). This is documented as a Phase 4 implementation decision.

### `buildCSSCustomProperties`

```typescript
// apps/web/src/lib/tokens/injectTokenStyles.ts

const BOOLEAN_TOKEN_SLUGS = new Set(['icon-mirror']);

export function buildCSSCustomProperties(tokenMap: Record<string, string>): string {
  return Object.entries(tokenMap)
    .map(([slug, value]) => {
      const cssValue = BOOLEAN_TOKEN_SLUGS.has(slug)
        ? (value === 'true' ? '1' : '0')
        : value;
      return `--${slug}: ${cssValue};`;
    })
    .join(' ');
}
```

**Output example:**
```css
:root {
  --color-primary: #1a4d8f;
  --font-family-body: 'IBM Plex Sans Arabic', 'IBM Plex Sans', sans-serif;
  --font-size-body: 16px;
  --text-direction: rtl;
  --icon-mirror: 1;
  --spacing-md: 16px;
}
```

### Widget-Level Token Resolution (ADR-003-004)

When a page renders a specific widget with known component context, it can pass additional context to get Level 3/4 overrides:

```typescript
// In a specific page that renders a known widget
const tokenMap = await resolveTokensForSSR({
  renderTarget: 'portal',
  locale: 'ar',
  service: 'home-finance',
  category: 'widget',
  componentSlug: 'hero-banner',
});
```

The resulting `<style>` tag applies on the page, giving the hero-banner widget component-level token overrides.

---

## 13. Security Architecture

### Authentication and Authorisation

| Route group | Auth requirement | Enforcement |
|---|---|---|
| `GET /api/tokens/resolve` | None — public endpoint | No preHandler |
| `GET /api/admin/tokens/**` | JWT + `portal-admin` role | `app.authenticate` + `app.requireRole('portal-admin')` |
| `POST /api/admin/tokens/**` | JWT + `portal-admin` role | Same |
| `DELETE /api/admin/tokens/**` | JWT + `portal-admin` role | Same |
| `POST /api/admin/tokens/publish` | JWT + `portal-admin` role | Same |
| `GET /api/service/tokens` | JWT + `service-owner` role | `app.authenticate` + `app.requireRole('service-owner')` |
| `POST /api/service/tokens/values` | JWT + `service-owner` role | Same + service slug enforcement |
| `DELETE /api/service/tokens/values/:id` | JWT + `service-owner` role | Same + ownership check |

### Service Slug Enforcement (Level 5 Security)

The `qdb_ServiceSlug` written to Dataverse is **always derived from the JWT's RBAC role record**, never from the request body. This is the enforcement of FR-018 and CEO condition C-002 (service-owner scoping).

Implementation detail: The `service-owner` role slug is stored as `service-owner:loan-services` in `qdb_role_slug` (P1-002 OI-001 resolution). The API extracts the suffix:

```typescript
function extractServiceSlug(roleSlug: string): string | null {
  const prefix = 'service-owner:';
  return roleSlug.startsWith(prefix) ? roleSlug.slice(prefix.length) : null;
}
```

### Input Validation

All API boundaries validate with Zod before any service or repository call. CSS value strings are not compiled or executed — they are stored and served as opaque strings. No XSS risk because the CSS injection happens server-side in an RSC layout (`dangerouslySetInnerHTML` in the Next.js layout is acceptable because the source is an authenticated, internal API call, not user-supplied input). However: token values must be validated to prevent CSS injection attacks. The `TokenValueCreateSchema` does not restrict the `value` field beyond length — the backend agent must add a CSS value sanitiser that strips `;` characters and URL references to prevent CSS injection through token values.

**Security Note for Phase 4 (mandatory):** Add `sanitizeCssValue(value: string): string` to `TokenValueService`. Strip `;` and reject values containing `url(`, `expression(`, `import(`. This is a defence-in-depth measure since `portal-admin` and `service-owner` are trusted roles, but the attack surface should still be minimised.

### Secret Management

- Dataverse service principal credentials remain environment variables only.
- Redis connection string (`REDIS_URL`) is an environment variable. Must never appear in logs.
- No token values contain PII (NFR-009) — no special secret handling for token content.

### Dataverse Write Scope

The same service principal used in P1-001/P1-002 requires Read/Write/Delete permissions on:
- `qdb_token_definitions`
- `qdb_token_values`

No new security role is required if the existing `DXP Platform API Role` is already at Org Scope — verify during provisioning. If a more restricted role is desired, add entity-specific permissions to the existing role (do not create a new service principal).

---

## 14. Open Questions Appendix

### OQ-001 — Publish Model (ASSUMED: staging window)

**Assumption:** QDB has chosen explicit publish (staging window). Token changes do not go live until `POST /api/admin/tokens/publish`.

**Evidence supporting assumption:** The government portal context (QFC-regulated entity) favours controlled, batched releases over instant publish. The BRD's FR-030 explicitly names the staging window as the desired behaviour.

**If QDB chooses instant publish instead:**

| Item to change | Nature of change |
|---|---|
| Draft cache | Collapse draft and live caches into a single cache |
| Admin writes | Every successful `POST/DELETE /api/admin/tokens/values` rebuilds the live cache (with debounce — ADR-003-007 applies to writes, not publish) |
| `POST /api/admin/tokens/publish` | Route becomes a no-op (can be kept for compatibility) or removed |
| FR-030 | Superseded; FR-015 is the only invalidation path |
| No data model changes required | Schema is compatible with both models |

QDB IT Director must formally confirm this assumption before Phase 4 begins.

---

### OQ-002 — Level 5 Approval Workflow (ASSUMED: no approval required)

**Assumption:** No secondary approval. Service-owner token overrides go directly to draft state.

**Evidence supporting assumption:** The BRD A-007 states portal-admin has authority to approve and publish global token changes without a secondary approver. The CEO BRD approval (Issue 2) notes this is a policy question for QDB Compliance, not a technical default.

**If QDB requires approval:**

| Item to add | Nature of change |
|---|---|
| `qdb_ApprovalStatus` field on `qdb_token_values` | OptionSet: `draft(1) / pending-approval(2) / approved(3) / rejected(4)` |
| `qdb_SubmittedBy` String(100) | Who submitted the value for review |
| `qdb_ReviewedBy` String(100, nullable) | Who approved or rejected |
| Resolution algorithm | Only include values where `qdb_ApprovalStatus = 3 (approved)` |
| New routes | `POST /api/admin/tokens/values/:id/approve` and `/reject` |
| Addendum ADR | ADR-003-003A to be written |

QDB IT Director or QDB Compliance must confirm this assumption before Phase 4 begins.

---

### OQ-003 — Redis Availability (ASSUMED: available in production)

**Assumption:** A Redis instance is available in the production API environment.

**Evidence supporting assumption:** P1-002 already identified this as pending (OI-004). The BRD A-002 states Redis is the assumed cache backend. The architecture (ADR-003-001) designs for Redis primary with NodeCache fallback, so the system functions without Redis (dev/test).

**If Redis is not available in production:**

| Impact | Mitigation |
|---|---|
| Multi-instance live cache inconsistency | Each API instance has its own NodeCache; a publish call flushes only the instance that received the request; other instances serve stale data until their TTL expires (up to 5 minutes) |
| NFR-005 availability guarantee weakens | In-memory cache survives Dataverse outage per-instance; new instances cold-start with empty cache |
| Publish debounce reduced | NodeCache debounce is per-instance; rapid publishes from different instances could each trigger Dataverse fetches |

If Redis is confirmed unavailable, the backend agent should document the multi-instance risk and QDB IT must accept it or provide a single-instance deployment guarantee.

QDB IT / DevOps must confirm Redis availability before Phase 4 begins.

---

### OQ-005 — Seed Token Values (Placeholder Dependency)

**Assumption:** Seed token values provisioned by the script are placeholders. QDB's design team will provide final brand values (colours, typography, spacing scale) before go-live.

**Documented per CEO condition 6 of the BRD approval.** The Phase 4 build can proceed with placeholder values. The provisioning script must be re-run with final values in the production environment before go-live. This is a tracked delivery dependency between QDB Design and QDB IT.

QDB must commit to a delivery date for seed token values before the production provisioning run is scheduled.

---

## 15. Deployment Architecture

### Environments

| Environment | Provisioning Script | Cache Mode | Notes |
|---|---|---|---|
| dev | `DRY_RUN=false` first run; idempotent re-run | NodeCache (no Redis required) | `REDIS_URL` absent → NodeCache fallback auto-selected |
| staging | Re-run provisioning script | Redis or NodeCache | GUIDs differ from prod; consumers use slugs (C-010) |
| prod | Re-run provisioning script | Redis required | `REDIS_URL` must be set |

### Environment Variables (additions for P1-003)

```typescript
// Added to existing API Zod env schema
REDIS_URL: z.string().url().optional(),   // absent = NodeCache fallback
TOKEN_DEFINITION_SOFT_LIMIT: z.coerce.number().int().default(200),
TOKEN_PUBLISH_MIN_INTERVAL_MS: z.coerce.number().int().default(10000),
```

### Deployment Sequence

No new Docker service. The token routes are new Fastify plugins added to the existing `apps/api` build. The deployment sequence per environment:

1. Deploy updated API (new plugin files included in existing Docker image build).
2. Run provisioning script: `projects/dxp-p1-003/scripts/provision-schema/`.
3. Verify post-provisioning validation passes (11 checks).
4. Run seed: provisioning script handles seed in Phase 8 (same run).
5. Warm live cache: call `POST /api/admin/tokens/publish` once to populate Redis from Dataverse.
6. Verify `GET /api/tokens/resolve?renderTarget=portal&locale=en` returns expected seed tokens.

### CI/CD

The provisioning script is not run in CI/CD (same policy as P1-001). New CI/CD steps:

- Vitest unit tests for `TokenResolutionService.resolve()` (pure function — full coverage required).
- Vitest unit tests for `TokenDefinitionService` and `TokenValueService` (mock repositories).
- Supertest integration tests against a running API with a seeded test database for each route.
- No automated Redis required in CI — NodeCache fallback used in test environment.

---

## 16. Phase 4 Build Checklist

Ordered implementation tasks for the backend agent. Each task is independent unless a dependency is noted.

**Provisioning (run first — required before API build):**
1. Scaffold `projects/dxp-p1-003/scripts/provision-schema/` following P1-001 structure.
2. Implement `GlobalOptionSetProvisioner` for `qdb_token_type`, `qdb_token_level`, `qdb_token_category` with codes from Section 11.
3. Implement `EntityProvisioner` for `qdb_token_definitions` (Batch A) and `qdb_token_values` (Batch B).
4. Implement `RelationshipProvisioner` for `qdb_tokendefinition_values`.
5. Implement `AlternateKeyProvisioner` for `qdb_TokenDefinitionSlugKey` on `qdb_slug`.
6. Implement `TokenDefinitionSeed` and `TokenValueSeed` with the 27 definitions + 4 Arabic values from Section 11.
7. Implement `PostProvisioningValidator` with 11 checks.
8. Test run against dev Dataverse org.

**Cache layer (implement before service layer):**
9. Implement `ITokenCacheService` interface (Section 8.1).
10. Implement `NodeCacheTokenCache` using two NodeCache instances.
11. Implement `RedisTokenCache` using `ioredis` with `SCAN`-based pattern delete.
12. Implement cache provider factory: `createTokenCacheService(env): ITokenCacheService` — returns Redis if `REDIS_URL` set, else NodeCache.

**Service layer:**
13. Implement `ITokenDefinitionRepository` and `DataverseTokenDefinitionRepository` (OData HTTP client, follows P1-001 `DataverseHttpClient` pattern).
14. Implement `ITokenValueRepository` and `DataverseTokenValueRepository`.
15. Implement `TokenResolutionService.resolve()` (pure function; unit tests first — TDD required).
16. Implement `TokenDefinitionService` with all methods from Section 7.3.
17. Implement `TokenValueService` with all methods from Section 7.4, including `CallerContext` enforcement.
18. Implement CSS value sanitiser `sanitizeCssValue(value: string): string` (strip `;`, reject `url(`, `expression(`, `import(`).

**API routes:**
19. Implement `routes/tokens/resolve.ts` — public GET /api/tokens/resolve (cache-first flow from Section 8.4).
20. Implement `routes/admin/tokens/definitions.ts` — GET list, POST, GET :slug, PATCH :slug, DELETE :slug (soft-delete + cascade).
21. Implement `routes/admin/tokens/values.ts` — GET list, POST, DELETE :id.
22. Implement `routes/admin/tokens/publish.ts` — POST with debounce (ADR-003-007 flow from Section 9).
23. Implement `routes/admin/tokens/preview.ts` — GET (draft cache, admin-only).
24. Implement `routes/service/tokens.ts` — GET /api/service/tokens (live cache, service slug enforced).
25. Implement `routes/service/tokens/values.ts` — POST and DELETE (service slug enforcement from Section 10).
26. Register all new route plugins in the Fastify app registration file.
27. Add `REDIS_URL`, `TOKEN_DEFINITION_SOFT_LIMIT`, `TOKEN_PUBLISH_MIN_INTERVAL_MS` to the API Zod env schema.

**Next.js portal shell:**
28. Implement `apps/web/src/lib/tokens/resolveTokens.ts` (SSR fetch with `next: { revalidate: 300 }`).
29. Implement `apps/web/src/lib/tokens/injectTokenStyles.ts` with `buildCSSCustomProperties` and `BOOLEAN_TOKEN_SLUGS` conversion.
30. Wire `resolveTokensForSSR` into `apps/web/src/app/[locale]/layout.tsx` (SSR layout).
31. Set `dir` attribute on `<html>` from `tokenMap['text-direction']`.

**Admin UI (frontend agent scope — listed here for sequencing):**
32. Implement token definitions grid page at `apps/web/src/app/[locale]/(admin)/tokens/page.tsx`.
33. Implement token value management panel (create/delete overrides per definition).
34. Implement publish button wired to `POST /api/admin/tokens/publish`.
35. Implement draft preview via `GET /api/admin/tokens/preview`.

**Tests:**
36. Unit tests: `TokenResolutionService.resolve()` — cover all 5 levels, locale override, service fallback, defaultValue fallback, AC-002 through AC-010.
37. Unit tests: `TokenDefinitionService` — soft limit, slug validation, cascade deactivation.
38. Unit tests: `TokenValueService` — context uniqueness, service slug enforcement.
39. Unit tests: `buildCSSCustomProperties` — ADR-003-005 conversion for `icon-mirror`.
40. Supertest integration tests: each route group's happy path, auth failure, validation failure.
41. Supertest: `POST /api/admin/tokens/publish` debounce — two rapid calls; second returns 429.

---

## 17. ADR Index

| ADR | Title | Status | Date | Decided by |
|---|---|---|---|---|
| ADR-003-001 | Cache Strategy — Redis Primary, NodeCache Fallback, Dual Live/Draft Caches | Accepted | 2026-06-21 | architect |
| ADR-003-002 | Staging Window vs. Instant Publish (OQ-001 assumption) | Accepted with assumption | 2026-06-21 | architect |
| ADR-003-003 | Level 5 Approval Flow (OQ-002 assumption) | Accepted with assumption | 2026-06-21 | architect |
| ADR-003-004 | Level 3/4 SSR Context Contract | Accepted | 2026-06-21 | architect |
| ADR-003-005 | `icon-mirror` CSS Value Format | Accepted | 2026-06-21 | architect |
| ADR-003-006 | 200-Token Ceiling and Soft-Limit Guard | Accepted | 2026-06-21 | architect |
| ADR-003-007 | Publish Debounce and Serialisation | Accepted | 2026-06-21 | architect |

---

## 18. Skeptic Review

> CHALLENGE 1 — Cache key explosion (ADR-003-001): The context key has 5 dimensions (renderTarget, locale, service, category, componentSlug). With 3 render targets × 3 locales × N services × 5 categories × M component slugs, the number of distinct resolved-map cache entries grows with N×M. If QDB has 20 services and 50 components per service, that is potentially 3 × 3 × 20 × 5 × 50 = 45,000 distinct cache keys. Each resolved map is ~10 KB. At 45,000 keys that is 450 MB of Redis memory just for token maps. The design assumes most key combinations are never actually requested (lazy resolution), but a malicious or misconfigured client could enumerate all combinations and fill the Redis cache. The Phase 4 builder must add a Redis memory limit (`maxmemory`) and eviction policy (`allkeys-lru`) to prevent unbounded cache growth. This architectural risk must be documented in the runbook.

> CHALLENGE 2 — Publish `publishedOn/By` batch PATCH (Section 9, Step 9): The architecture specifies batch-patching `qdb_PublishedOn` and `qdb_PublishedBy` on all active value records as part of the publish flow. With 1,000+ active value records (200 definitions × 5+ values each), this is a significant Dataverse write load. The batch is done fire-and-forget after returning 204, which is correct for the response time SLA, but if the batch fails (Dataverse 429 or network error), the `publishedOn`/`publishedBy` fields are stale without the API knowing. The architecture needs a reconciliation strategy — either a separate async job that retries failed batch PATCHes, or an acceptance that `publishedOn/By` is best-effort metadata, not a guaranteed audit field. Given that Dataverse's `modifiedon` is a system field that always reflects the last write, `publishedOn/By` is supplementary metadata, and best-effort is acceptable. This must be documented explicitly.

> CHALLENGE 3 — Service slug extraction at runtime (Section 10): For every `service-owner` request, the API calls `RbacService.getServiceSlugFromRole(userId)`. This calls the RBAC NodeCache, which may be warm (900s TTL from P1-002). On a cache miss it calls Dataverse. If the RBAC cache is cold (new instance, TTL expired) every service-owner token write incurs two Dataverse round-trips: one for roles, one for the token value creation. The assumption that the RBAC cache is warm is reasonable under steady-state load but not on cold start. The builder should pre-warm the RBAC cache for the request's user immediately after JWT validation in the service-owner route preHandler, not lazily during the handler. This is a latency concern, not a correctness concern.

> CHALLENGE 4 — CSS value sanitisation gap (Section 13): The security note says to add `sanitizeCssValue()` to prevent CSS injection. However, the architecture places this in `TokenValueService`, which means the check runs at write time. Values already in Dataverse from the provisioning seed (before the sanitiser was added) are not validated. If a seed value or a previously-written value contains a malicious CSS expression, it bypasses the sanitiser and is served by the resolution endpoint. The Phase 4 builder must also sanitise values at the point of serving (`GET /api/tokens/resolve`) — a read-time sanitisation pass on the resolved map before returning it. This is defence-in-depth; write-time alone is insufficient for a changing codebase.

> CHALLENGE 5 — Next.js fetch cache and publish synchronisation (Section 12): The portal shell uses `next: { revalidate: 300 }` on the `resolveTokensForSSR` fetch. After a publish, the live cache in Fastify is immediately updated, but the Next.js server-side fetch cache continues to serve the old resolved map for up to 5 minutes. A portal-admin who publishes a critical brand change (emergency colour update) will be confused when the portal still shows the old colour for up to 5 minutes. The architecture mentions calling `revalidatePath('/')` from the publish route as a Phase 4 decision — this is not optional for a government portal. The Phase 4 builder must implement Next.js cache revalidation as part of the publish flow. Failing to do so means the staging model's promise ("publish = live") is broken.

> CHALLENGE 6 — Single NodeCache instance for draft cache in multi-instance (ADR-003-001): The draft cache is per-instance (NodeCache, not Redis). An admin working in a session that hits instance A will see draft changes; if the next request hits instance B (load balancer round-robin), they see stale draft. Admin preview will appear inconsistent. The architecture accepts this on the basis that admin preview is single-session — but HTTP sessions are not instance-sticky in a load-balanced deployment unless session affinity (sticky sessions) is configured. If QDB's API is load-balanced with multiple instances and no sticky sessions, the draft cache design is incorrect for the admin preview use case. The runbook must document: either enable sticky sessions for admin routes, or promote draft cache to Redis as well.

> CHALLENGE 7 — Alternate key on `qdb_slug` settle time (Section 11): The `AlternateKeyProvisioner` creates the alternate key on `qdb_token_definitions.qdb_slug` in Batch C. The P1-001 Skeptic Challenge 5 already noted that alternate key creation triggers an async Dataverse job. The provisioning script must wait a settle period (20–30s) after posting the alternate key before running post-provisioning validation, or the validator's alternate-key check will fail on first run. The P1-001 resolution (Challenge 5 note) deferred this to P1-001 builder; confirm whether a settle delay was actually implemented before mirroring the pattern in P1-003.

> CHALLENGE 8 — Simpler alternative for Phase 1 scope: The entire Dataverse + Redis + five-level hierarchy is justified by the need for admin-editable tokens and service-owner scoping. However, Phase 1 seeds 27 definitions with placeholder values that QDB design will replace. Could Phase 1 ship as a static CSS-in-config file (themes.ts exporting a typed token map) and defer the Dataverse-backed dynamic system to Phase 2 when QDB's design team is ready to use the admin UI? The Dataverse model is correct for the long term, but its value is zero until QDB's design team actually uses the admin UI to change tokens. If QDB's design team is not planning to use the admin UI until Phase 2, the Phase 1 scope can be a static provisioning pass only (no admin UI, no cache layer, just token resolution from Dataverse with a simple 5-minute in-memory cache). Confirm with the CEO/BA whether the admin UI and service-owner write path are Phase 1 deliverables or Phase 2.

These challenges must be addressed before Phase 4 begins.

---

```
===================================================
END OF DOCUMENT
DXP-P1-003 Theme Tokens — Phase 3 Architecture v1.0
Maqsad AI — Solution Architect
2026-06-21
===================================================
```
