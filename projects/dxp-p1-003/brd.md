# DXP-P1-003 — Business Requirements Document
# DXP Platform Phase 3: Theme Tokens

```
═══════════════════════════════════════════════════
BUSINESS REQUIREMENTS DOCUMENT
═══════════════════════════════════════════════════
Engagement ID:  DXP-P1-003
Title:          DXP Platform Phase 3 — Theme Tokens
Prepared by:    Maqsad AI — Business Analyst
Date:           2026-06-18
Version:        1.0
Status:         DRAFT — Pending CEO Review
═══════════════════════════════════════════════════
```

---

## 1. Executive Summary

The QDB Digital Experience Platform hosts multiple services — financing applications, document submissions, announcements, and staff dashboards — on a single portal shell. Each service may be owned by a different QDB business unit with distinct brand identity requirements. Without a governed token system, visual consistency is enforced by convention only: developers embed hex values and font sizes directly into component code, making global rebranding expensive, per-service customisation impossible, and bilingual (Arabic RTL / English LTR) layout differences error-prone.

DXP-P1-003 delivers a **Theme Token System**: a hierarchical, Dataverse-backed store of named design values (colours, typography, spacing, radius, shadow, direction) resolved at render time and consumed by the Next.js portal shell as CSS custom properties. Tokens cascade from global platform defaults down to per-service overrides, giving `portal-admin` control over the platform brand and `service-owner` scoped control over their service's appearance — without touching component code.

---

## 2. Background and Problem Statement

### 2.1 Current State

DXP-P1-001 (Component Registry) established that reusable UI components are catalogued and versioned centrally. Each component receives a `propsSchema` (JSON Schema of accepted props) but no styling contract. Visual properties — colours, font sizes, spacing — are currently either hardcoded in component implementations or passed as ad-hoc props with no platform-level governance.

### 2.2 Problems Being Solved

| Problem | Impact |
|---------|--------|
| No central design value store | Rebrand requires touching every component file |
| No per-service visual customisation | All services look identical; service owners cannot apply their brand |
| No Arabic / RTL token variant | Direction-specific values (text alignment, padding direction, icon mirroring) are hardcoded per component |
| No admin interface for visual changes | Non-technical admins cannot adjust colours or typography without a developer |
| No cache-invalidation contract | When a token changes, the portal continues serving stale values until redeployment |

### 2.3 Strategic Fit

Theme Tokens close the remaining design-system gap in the DXP platform. Combined with the Component Registry (DXP-P1-001) and RBAC (DXP-P1-002), they complete the three foundational pillars required before any service-specific portal feature can be built on DXP.

---

## 3. Stakeholders

| Role | Interest |
|------|---------|
| QDB Portal Admin | Platform-wide brand consistency; approves and publishes global tokens |
| QDB Service Owner | Per-service visual identity; manages tokens scoped to their service |
| QDB Content Editor | Read-only visibility of tokens for content alignment |
| QDB IT / DevOps | Infrastructure for token serving, caching, CDN invalidation |
| Frontend Developer | Token consumption API, CSS custom property contract |
| QDB Compliance | Data classification of design tokens (no PII; low risk) |

---

## 4. Functional Requirements

### 4.1 Token Definition and Hierarchy

**FR-001:** The system shall support a five-level token hierarchy resolved in this order (most specific wins):

```
Level 1 — Global platform default
Level 2 — Render-target override (portal / admin / mobile)
Level 3 — Component category override (widget / form / nav-component / layout / data-display)
Level 4 — Component slug override (e.g. hero-banner, request-form)
Level 5 — Service override (scoped to a service-owner's service slug)
```

**FR-002:** Each token shall have a globally unique `slug` (kebab-case, e.g. `color-primary`, `font-size-body`, `spacing-md`) used as the cross-environment reference key. GUIDs shall never be exposed as token references (BRD C-010 extension).

**FR-003:** Token resolution shall be deterministic: given the same set of active token records and the same resolution context (render target, category, component slug, service), the resolved value shall always be the same.

**FR-004:** A token record at a more specific level shall override the value from a less specific level for that token slug. Tokens not overridden at a specific level shall inherit the next parent level's value.

**FR-005:** The system shall support the following token types:

| Type | Examples | Value format |
|------|---------|-------------|
| `color` | `color-primary`, `color-surface`, `color-text-muted` | CSS colour string (`#1a2b3c`, `rgba(...)`, CSS variable) |
| `typography-family` | `font-family-body`, `font-family-heading` | CSS font-family string |
| `typography-size` | `font-size-body`, `font-size-h1` | CSS length (`16px`, `1rem`) |
| `typography-weight` | `font-weight-bold` | CSS font-weight value |
| `spacing` | `spacing-sm`, `spacing-md`, `spacing-lg` | CSS length |
| `border-radius` | `radius-card`, `radius-button` | CSS length |
| `shadow` | `shadow-card`, `shadow-dropdown` | CSS box-shadow string |
| `direction` | `text-direction`, `icon-mirror` | `ltr` / `rtl` / `true` / `false` |

**FR-006:** Each token shall carry a `locale` field: `null` (locale-neutral), `ar` (Arabic), or `en` (English). Locale-specific tokens override locale-neutral tokens of the same slug when the portal renders in that locale.

**FR-007:** At Level 1 (global), the platform shall ship a set of seed tokens covering all token types. The seed set shall be idempotently provisionable via the `provision-schema` script pattern used in DXP-P1-001.

### 4.2 Token Storage — Dataverse Entities

**FR-008:** Two Dataverse entities shall be created in the `QdbDxpPlatform` solution:

**`qdb_token_definitions`** — The catalog of named token slots:

| SchemaName | Type | Notes |
|-----------|------|-------|
| `qdb_Name` | String(100) | Primary name / alternate key |
| `qdb_Slug` | String(100) | Kebab-case, unique, cross-env reference |
| `qdb_TokenType` | Picklist | color / typography-family / typography-size / typography-weight / spacing / border-radius / shadow / direction |
| `qdb_Description` | Memo(1000) | Human-readable purpose |
| `qdb_DefaultValue` | String(500) | Fallback value when no override exists |
| `qdb_IsActive` | Boolean | Soft delete |

**`qdb_token_values`** — The resolved overrides at each hierarchy level:

| SchemaName | Type | Notes |
|-----------|------|-------|
| `qdb_TokenDefinitionId` | Lookup | FK to `qdb_token_definitions` |
| `qdb_Level` | Picklist | global / render-target / category / component / service |
| `qdb_RenderTarget` | String(50) | portal / admin / mobile — null if level ≠ render-target |
| `qdb_Category` | Picklist | widget / form / nav-component / layout / data-display — null if level < category |
| `qdb_ComponentSlug` | String(100) | Component `qdb_name` slug — null if level < component |
| `qdb_ServiceSlug` | String(100) | Service slug — null if level ≠ service |
| `qdb_Locale` | String(5) | null / ar / en |
| `qdb_Value` | String(500) | The CSS value for this override |
| `qdb_PublishedOn` | DateTime | When this value was last published |
| `qdb_PublishedBy` | String(100) | User who published |
| `qdb_IsActive` | Boolean | Soft delete; inactive values are excluded from resolution |

**FR-009:** The alternate key on `qdb_token_definitions` shall be `qdb_Slug` (matching the C-010 slug-based reference pattern).

**FR-010:** Token values shall be soft-deleted only (set `qdb_IsActive = false`). No hard DELETE operations. The full history of value changes is preserved for audit.

### 4.3 Token API — Serving

**FR-011:** A public (unauthenticated) REST endpoint shall serve resolved tokens for a given context:

```
GET /api/tokens/resolve?renderTarget=portal&locale=ar&service=home-finance
```

Response: a flat JSON object of `{ slug: resolvedValue }` pairs for every active token definition, resolved according to the hierarchy for the given context.

**FR-012:** The token resolution endpoint shall respond within **50 ms p95** under normal load, served from an in-memory or Redis cache. It shall not make synchronous Dataverse calls per portal page render.

**FR-013:** The portal shell shall translate the resolved token map into CSS custom properties injected into the `<html>` element:

```css
--color-primary: #1a4d8f;
--font-size-body: 16px;
--text-direction: rtl;
```

**FR-014:** An admin-only endpoint shall allow cache invalidation on demand:

```
POST /api/admin/tokens/publish
```

This endpoint triggers a re-fetch of all token values from Dataverse and rebuilds the cache. It shall complete within **5 seconds** and return HTTP 204 on success.

**FR-015:** The token cache shall be automatically invalidated and rebuilt when any `qdb_token_values` record is created, updated, or deactivated via the Admin API.

### 4.4 Token Administration — Admin API

**FR-016:** Admin API routes (all requiring `portal-admin` JWT role) shall include:

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/admin/tokens/definitions | List all token definitions |
| POST | /api/admin/tokens/definitions | Create token definition |
| GET | /api/admin/tokens/definitions/:slug | Get definition |
| PATCH | /api/admin/tokens/definitions/:slug | Update description / default value |
| GET | /api/admin/tokens/values | List all active token values (filterable by level, slug, service) |
| POST | /api/admin/tokens/values | Create or update a token value override |
| DELETE | /api/admin/tokens/values/:id | Deactivate a token value override |
| POST | /api/admin/tokens/publish | Invalidate and rebuild cache |

**FR-017:** Service-owner scoped routes (requiring `service-owner` JWT role) shall include:

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/service/tokens?service=:slug | List resolved tokens for the caller's service |
| POST | /api/service/tokens/values | Create or update a Level 5 (service) token value override — scoped to the caller's service slug only |
| DELETE | /api/service/tokens/values/:id | Deactivate a service-level override — scoped to the caller's service only |

**FR-018:** A `service-owner` shall only be able to read and write token values where `qdb_ServiceSlug` matches their own service slug (extracted from the JWT `permissions` claim). Attempts to write a different service's slug shall return HTTP 403.

**FR-019:** A `portal-admin` shall be able to create, update, and deactivate token values at any level (1–5), including service-level overrides for any service.

**FR-020:** Token slug names shall be validated as kebab-case (`/^[a-z0-9-]+$/`) at create time. Slugs are immutable after creation.

### 4.5 Bilingual / RTL Requirements

**FR-021:** The token resolution endpoint shall accept a `locale` parameter (`ar`, `en`, or omitted for locale-neutral). When `locale=ar` is specified, locale-specific token values for Arabic shall be merged over locale-neutral values (locale-specific wins for that slug; other slugs fall back to locale-neutral).

**FR-022:** The `direction` token type (`text-direction`) shall default to `ltr` globally and be overridden to `rtl` at the render-target or global level for Arabic locale. Components shall consume `var(--text-direction)` rather than hardcoding `dir` attributes.

**FR-023:** Icon mirroring for RTL shall be governed by the `icon-mirror` token (values: `true` / `false`). Components that render directional icons shall check `var(--icon-mirror)` to apply a CSS transform.

**FR-024:** Arabic typography tokens (`font-family-body` with `locale=ar`, `font-size-body` with `locale=ar`) shall allow a different font family and size scale appropriate for Arabic script. The default Arabic font shall be configurable via a Level 1 `locale=ar` token value.

### 4.6 Component Registry Integration

**FR-025:** Token slugs shall be referenceable in a component's `propsSchema` using the JSON Schema `$comment` convention to annotate which token a prop consumes. This is informational only — the token system does not enforce prop-to-token binding at runtime.

**FR-026:** The token resolution endpoint shall accept a `category` parameter and a `componentSlug` parameter to resolve Level 3 and Level 4 overrides respectively. These parameters shall be optional — omitting them returns tokens resolved only to Level 1 and Level 2 (render-target).

**FR-027:** Token slugs for component-level overrides (Level 4) shall reference the component's `qdb_name` slug exactly as stored in `qdb_component_definitions`. Slug mismatches (component not found) shall not produce an error — they simply have no Level 4 tokens applied.

### 4.7 Versioning and History

**FR-028:** Every change to a `qdb_token_values` record shall be tracked via Dataverse native audit (modifiedon, modifiedby). The token admin UI shall display the last-published timestamp and publisher for each value.

**FR-029:** A `portal-admin` shall be able to deactivate any active token value override, causing the resolved value to fall back to the next parent level. This provides a "revert to default" mechanism without deleting history.

**FR-030:** Token value changes shall not take effect in the portal until a publish action is explicitly triggered (FR-014) or the automatic cache invalidation fires (FR-015). This provides a staging window during which multiple token changes can be batched before going live.

---

## 5. Non-Functional Requirements

| ID | Requirement | Target |
|----|------------|--------|
| NFR-001 | Token resolution endpoint p95 latency | ≤ 50 ms (cache hit) |
| NFR-002 | Token resolution endpoint p95 latency on cache miss | ≤ 2 s (Dataverse query) |
| NFR-003 | Cache rebuild (publish) duration | ≤ 5 s |
| NFR-004 | Cache TTL (if Redis not available, in-memory) | 5 minutes (auto-refresh) |
| NFR-005 | Token resolution endpoint availability | 99.9% (served from cache; Dataverse outage does not degrade portal render if cache is warm) |
| NFR-006 | Number of token definitions (Phase 1) | ≤ 200 |
| NFR-007 | Admin API auth | JWT Bearer, `portal-admin` role on all definition/value routes |
| NFR-008 | Service API auth | JWT Bearer, `service-owner` role; service slug enforced from JWT claims |
| NFR-009 | No PII in token values | Token values are CSS design values only; no personal data |
| NFR-010 | Dataverse entity audit | `createdon`, `createdby`, `modifiedon`, `modifiedby` on both entities |
| NFR-011 | Solution compatibility | All entities in `QdbDxpPlatform` solution; provisioning script idempotent |
| NFR-012 | Slug immutability | Token definition slugs cannot be changed after creation |
| NFR-013 | Bilingual support | All resolution endpoints accept `locale=ar` and `locale=en` |

---

## 6. Data Model Summary

```
qdb_token_definitions (1)
  └── qdb_token_values (N)
        qdb_Level: global | render-target | category | component | service
        qdb_RenderTarget: portal | admin | mobile | null
        qdb_Category: widget | form | nav-component | layout | data-display | null
        qdb_ComponentSlug: <qdb_name from component registry> | null
        qdb_ServiceSlug: <service slug from RBAC service-owner> | null
        qdb_Locale: null | ar | en
        qdb_Value: <CSS value string>
```

**Resolution algorithm (pseudo):**

```
function resolveToken(slug, context):
  candidates = getActiveValues(slug)
    .filter(v => v.level matches context)
    .sortBy(specificity DESC, locale DESC)
  return candidates[0].value ?? getDefinition(slug).defaultValue
```

Specificity order: service > component > category > render-target > global.
Locale order: locale-specific > locale-neutral.

---

## 7. Integration Points

| System | Integration |
|--------|------------|
| DXP-P1-001 Component Registry | Component slugs used as Level 4 token keys; `qdb_name` is the reference |
| DXP-P1-002 RBAC | `service-owner` JWT claim provides service slug for Level 5 enforcement; `portal-admin` claim grants full token management |
| Next.js portal shell | Consumes `GET /api/tokens/resolve` at SSR time; injects result as CSS custom properties |
| Dataverse `QdbDxpPlatform` | Token entities stored in existing solution; provisioning via existing script pattern |
| Redis / in-memory cache | Token resolution cache layer; invalidated on publish |

---

## 8. Out of Scope

- Per-user theme preferences (dark mode, accessibility overrides) — future engagement
- A/B testing token variants — future engagement
- Custom CSS overrides injected directly into component implementations — forbidden by platform governance
- Token inheritance across solutions (QdbDynamicFormEngine tokens) — separate engagement
- Component-level CSS-in-JS or styled-components — not part of this platform
- CDN-level token serving (edge caching) — future DevOps enhancement
- Token linting or design system validation tools — future tooling engagement
- Mobile app theming (React Native tokens) — separate mobile engagement

---

## 9. Assumptions

| ID | Assumption |
|----|-----------|
| A-001 | The Next.js portal shell renders server-side (SSR) and can inject CSS custom properties into the document `<head>` at render time |
| A-002 | A Redis instance is available in the API environment for token caching; in-memory fallback is acceptable for dev |
| A-003 | Service slugs used in the token system match the service slugs defined in the DXP-P1-002 RBAC system exactly |
| A-004 | QDB's design team will provide the initial set of seed token values (colours, typography) for global Level 1 tokens |
| A-005 | Arabic font licensing is QDB's responsibility; the token system stores the font-family value, not the font files |
| A-006 | Token values are CSS strings — no compilation, build step, or design tool export is required |
| A-007 | The `portal-admin` role (DXP-P1-002) has authority to approve and publish global token changes without a secondary approver |

---

## 10. Open Questions

| ID | Question | Owner | Impact |
|----|---------|-------|--------|
| OQ-001 | Should token publish be instant (on save) or require an explicit publish action? A staging window allows batching changes; instant publish simplifies the UX. | QDB IT Director | Drives FR-014/FR-015 design |
| OQ-002 | Should service-owner token overrides require portal-admin approval before taking effect? | QDB IT Director / Compliance | Drives Level 5 workflow design |
| OQ-003 | Is a Redis cache available, or must the API use in-memory only? | QDB IT / DevOps | Drives NFR-004 and NFR-005 |
| OQ-004 | What is the maximum number of services in Phase 1? This constrains the Level 5 resolution complexity. | QDB Business | Informs NFR-006 |
| OQ-005 | Are there existing QDB brand guidelines (colour palette, typography scale) that seed tokens must match? | QDB Design | Seed token content |
| OQ-006 | Should the token resolution endpoint be served over a CDN for edge caching? | QDB IT / DevOps | Drives NFR-001 target |

---

## 11. Acceptance Criteria

| ID | Criterion |
|----|----------|
| AC-001 | `GET /api/tokens/resolve?renderTarget=portal&locale=ar` returns a flat JSON object with all active token slugs and their resolved values within 50 ms p95 from a warm cache |
| AC-002 | A Level 5 (service) token value for `color-primary` on service `home-finance` overrides the Level 1 global value when resolved with `?service=home-finance` |
| AC-003 | A Level 2 (render-target=admin) `color-surface` token overrides the Level 1 global value when resolved with `?renderTarget=admin` |
| AC-004 | Arabic locale token for `font-family-body` with `locale=ar` overrides the locale-neutral `font-family-body` when resolved with `?locale=ar` |
| AC-005 | `POST /api/admin/tokens/publish` invalidates the cache and rebuilds it from Dataverse within 5 seconds, returning HTTP 204 |
| AC-006 | A `service-owner` JWT can only write token values where `qdb_ServiceSlug` matches their JWT claim; attempts to write another service's slug return HTTP 403 |
| AC-007 | A `portal-admin` JWT can write token values at any level (1–5), including Level 5 service overrides for any service |
| AC-008 | Deactivating a Level 3 (category) token value causes the resolver to fall back to the Level 1 global value for that slug |
| AC-009 | Creating a token definition with a non-kebab-case slug (e.g. `Color Primary`) returns HTTP 400 |
| AC-010 | Two token value records for the same slug, same level, same context differ only in locale (`null` vs `ar`); resolution with `locale=ar` returns the `ar` record |
| AC-011 | The provisioning script creates both `qdb_token_definitions` and `qdb_token_values` idempotently; running it twice does not create duplicate records |
| AC-012 | `GET /api/admin/tokens/definitions` requires a valid `portal-admin` JWT; requests without a token return HTTP 401 |
| AC-013 | An unauthenticated request to `GET /api/tokens/resolve` returns HTTP 200 (public endpoint) |
| AC-014 | Changing a token value via the admin API and then calling `POST /api/admin/tokens/publish` results in the new value being returned by `GET /api/tokens/resolve` |
| AC-015 | The `text-direction` token resolves to `rtl` when `locale=ar` is passed, and `ltr` when `locale=en` is passed, given the appropriate seed values |
| AC-016 | The portal shell injects all resolved tokens as CSS custom properties on the `<html>` element with the prefix `--` (e.g. `--color-primary`) |
| AC-017 | Deactivating a token definition also deactivates all associated token values (cascade soft delete) |
| AC-018 | `GET /api/tokens/resolve` with an unknown `service` slug returns the same result as omitting the `service` parameter (no Level 5 tokens found = graceful fallback) |

---

## 12. Glossary

| Term | Definition |
|------|-----------|
| Token | A named design value (slug → CSS value) managed centrally and consumed by UI components |
| Token Definition | The catalog entry for a token slot: its slug, type, description, and fallback default value |
| Token Value | A specific CSS value assigned to a token definition at a given level and context |
| Token Resolution | The process of computing the final CSS value for a token given a context (render target, category, component slug, service, locale) |
| Level | The hierarchy level of a token value: global (1) → render-target (2) → category (3) → component (4) → service (5) |
| Publish | The action of invalidating the token cache and rebuilding it from Dataverse, making pending token changes live |
| Service Slug | A kebab-case identifier for a QDB service (e.g. `home-finance`, `trade-finance`) matching the slug used in DXP-P1-002 RBAC |
| RTL | Right-to-left text direction, used for Arabic language rendering |
| CSS Custom Property | A CSS variable (`--token-slug: value`) injected into the document and consumed by component stylesheets |

---

```
═══════════════════════════════════════════════════
END OF DOCUMENT
DXP-P1-003 Theme Tokens — BRD v1.0
Maqsad AI — Business Analyst
2026-06-18
═══════════════════════════════════════════════════
```
