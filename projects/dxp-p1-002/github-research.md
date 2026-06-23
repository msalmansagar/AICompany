# DXP-P1-002 GitHub Research — RBAC
**Engagement:** DXP-P1-002  
**Phase:** 2 — GitHub Research  
**Date:** 2026-06-21  
**Researcher:** github-researcher agent

---

## Research Scope

Find battle-tested open-source libraries (≥1 000 GitHub stars) that could replace or
accelerate any part of the DXP-P1-002 RBAC build:

1. Role / permission evaluation engine
2. JWT permission-claim builder
3. Fastify RBAC middleware
4. Audit-log infrastructure

BRD constraints that shape fit:
- Policy store is **Dataverse** (not Postgres / Redis / filesystem)
- Hot path must resolve in **< 1 ms** with no Dataverse call
- Must stay **backward-compatible** with existing `fastify.authenticate` / `fastify.requireRole`
- 8 named roles; cross-population prohibition enforced at API layer
- Audit log is append-only, 7-year retention in Dataverse

---

## Candidates Evaluated

### 1. CASL — `@casl/ability`
| Property | Value |
|---|---|
| Repo | https://github.com/stalniy/casl |
| Stars | **7 000** ✅ |
| License | MIT ✅ |
| Language | TypeScript ✅ |
| Latest | `@casl/prisma` v2.0.1 — May 2026 |
| Weekly downloads | ~500 K (npm) |
| Core bundle | 6 KB min+gzip |

**What it does:** Isomorphic authorization library — define rules as
`(action, subject, conditions?)` tuples, then check `ability.can('read', 'CitizenRequest')`.
Supports role-based AND attribute-based access control. Storage-agnostic (no bundled
policy store). TypeScript-first, tree-shakeable.

**Fit for DXP-P1-002:**
- ✅ Storage-agnostic — we can load rules from Dataverse into an in-memory `Ability` object at login
- ✅ TypeScript-first, MIT license, actively maintained
- ✅ 6 KB — fits the < 1 ms hot-path requirement (no network call after login)
- ✅ `@casl/ability` can be used on both API (Fastify preHandler) and Next.js (page-level guard)
- ⚠️ No Dataverse adapter exists — must build the bridge that reads `qdb_rbac_user_roles` and populates an `Ability` object at login
- ⚠️ Cross-population prohibition and "last admin" guard are business rules CASL does not handle — must be built as service-layer checks

**Verdict: PARTIAL ADOPT** — `@casl/ability` replaces the planned hand-rolled permission
evaluator. Use it for `ability.can(action, subject)` checks in Fastify preHandlers and
Next.js server components. Do NOT adopt CASL's storage adapters (`@casl/prisma`, etc.) —
Dataverse is the store.

---

### 2. node-casbin
| Property | Value |
|---|---|
| Repo | https://github.com/casbin/node-casbin |
| Stars | **2 900** ✅ |
| License | Apache 2.0 ✅ |
| Language | TypeScript (99.9%) ✅ |
| Latest | v5.50.0 — April 2026 |

**What it does:** Full access-control framework — define models (RBAC, ABAC, ACL) as `.conf`
files; store policies in a persistence layer (Postgres, MongoDB, Redis adapters available).
Enforcer evaluates `enforce(user, resource, action)` against the loaded policy.

**Fit for DXP-P1-002:**
- ❌ No Dataverse adapter — would require a custom `Adapter` implementation of comparable
  complexity to building the storage layer from scratch
- ❌ Policy model defined as text `.conf` files — adds a non-TypeScript artefact with no
  compile-time safety
- ❌ `fastify-casbin` plugin has only 28 stars and last released December 2024 — insufficient
  community adoption to trust for production
- ❌ Overkill for 8 static named roles with no wildcard or hierarchical policy branching

**Verdict: REJECT** — Extra complexity with no meaningful reduction in build effort given
the Dataverse constraint.

---

### 3. fastify-rbac
| Property | Value |
|---|---|
| Repo | https://github.com/SkeLLLa/fastify-rbac |
| Stars | < 100 ❌ |
| Last release | 2019 ❌ |

**Verdict: REJECT** — Insufficient stars, abandoned, does not support Fastify v5.

---

### 4. fastify-casbin / fastify-casbin-rest
| Property | Value |
|---|---|
| Repo | https://github.com/nearform/fastify-casbin |
| Stars | 28 ❌ |
| Last release | December 2024 |

**Verdict: REJECT** — Insufficient stars.

---

### 5. All other Fastify RBAC plugins
No Fastify-specific authorization plugin with ≥1 000 stars exists on GitHub as of
June 2026. The Fastify ecosystem relies on application-level preHandler composition
for authorization rather than a shared plugin.

---

## Decision Matrix

| Component | Library | Decision | Rationale |
|---|---|---|---|
| Permission evaluation | `@casl/ability` (7k ★) | **ADOPT** | Storage-agnostic, TypeScript, 6 KB hot-path safe |
| Policy storage | — | **BUILD** | Dataverse; no compatible adapter exists |
| JWT claim builder | — | **BUILD** | Trivial (<20 lines); no library adds value |
| Fastify preHandler | — | **BUILD** | Wraps `ability.can()` around existing `requireRole` interface |
| "Last admin" guard | — | **BUILD** | Business rule; no generic library handles it |
| Cross-population check | — | **BUILD** | QDB-specific domain rule |
| Audit log writer | — | **BUILD** | Append-only Dataverse writes; no library needed |

---

## Adoption Record

### `@casl/ability`
- **Repo:** https://github.com/stalniy/casl
- **Version to adopt:** latest `@casl/ability` (check npm at build time)
- **License:** MIT — approved for commercial use, no copyleft obligations
- **Install:** `npm install @casl/ability`
- **Why adopted over building:** 7 000 stars, 500 K weekly downloads, actively maintained
  (last release May 2026), 6 KB bundle — using it avoids writing and testing our own
  bit-masking permission evaluator, and it gives us a clear upgrade path to ABAC if
  DXP-P1-003 service-owner row-level scoping requires conditions.
- **What we build on top:** a `buildAbility(userRoles: string[]) → AppAbility` factory
  that maps Dataverse role records to CASL rules, called once per login and embedded in
  the JWT `permissions` claim as the serialised rule set (or as a flat permission string
  array that CASL re-hydrates on each request).

---

## Recommendation to Architect

Adopt `@casl/ability`. Build everything else. No other library clears the 1 000-star
threshold with adequate Fastify v5 + Dataverse compatibility.

The architect should note:

1. `AppAbility` type (from `@casl/ability`) should be defined once and exported from
   `@portal/types` so both the API and the Next.js app share the same rule shape.
2. The hot path is: JWT validated → `ability = createMongoAbility(request.user.rules)` →
   `ability.can(action, subject)`. The `rules` array lives in the JWT; no Dataverse call.
3. CASL's `packRules` / `unpackRules` helpers serialise/deserialise rules to a compact
   JSON array — suitable for embedding in a JWT claim without header-size risk
   (answers QDB Cond-3 partially — architect must still verify max claim size against
   infrastructure limits).
4. `@casl/ability` supports `detectSubjectType` — architect should define a subject type
   map for the 8 entities citizens/staff interact with (Requests, Services, Notifications,
   Components, Tokens, Users, Roles, Snapshots).

---

*Research complete. Architecture phase may begin once Gate 2 (3 QDB stakeholder answers) is cleared.*
