# Phase 3 — System Architecture
**Engagement:** DFE-PORT-001 — Configurable Portal Shell
**Status:** FINAL
**Author:** Architect Agent — Maqsad AI
**Date:** 2026-06-16
**Constitution version:** v2.0

---

## 1. System Overview

The DFE Configurable Portal Shell is a white-label application frame built on a Next.js 14 App Router web frontend, a Fastify/Node.js backend API, and a React Native/Expo mobile client. All three tiers share a common Dataverse OData v4 data store for configuration, navigation, content, notifications, and domain records, with the Fastify layer owning auth token exchange, file handling, notification writes, and CMS schedule enforcement. The architecture is fully configuration-driven: every branding, layout, auth provider, and feature-flag decision is stored in `qdb_portal_config` and loaded at runtime, making zero-code tenant onboarding possible. System boundaries are partitioned into three independent delivery tracks — Track A (Web), Track B (Mobile), Track C (CMS) — with Track B depending on Track A's auth and notification API contracts being stable.

**Key architectural principles:**

- Configuration over code: no branding, route, adapter selection, or business threshold is hardcoded
- Adapter-first auth: `IAuthAdapter` interface locked before any provider implementation begins
- Widget plug-in registry: dashboard shell never imports a widget directly; all widgets self-register
- Dataverse as the single system of record: no shadow PostgreSQL tables for domain data; PostgreSQL is session/cache only
- Async and observable: every long-running operation uses a queue handoff; every service emits structured pino logs with correlation IDs

---

## 2. Repository Structure

The monorepo uses **Turborepo** (already in use in DFE). Each app and shared package is an independent npm workspace.

```
portal-shell/                         # Turborepo root
├── turbo.json
├── package.json                      # root workspace
├── apps/
│   ├── web/                          # Next.js 14 App Router portal
│   │   ├── app/
│   │   ├── public/
│   │   └── package.json
│   ├── api/                          # Fastify + TypeScript backend
│   │   ├── src/
│   │   └── package.json
│   └── mobile/                       # React Native + Expo SDK 53
│       ├── app/                      # expo-router file-based routes
│       └── package.json
└── packages/
    ├── types/                        # @portal/types — shared TypeScript types and Zod schemas
    ├── auth-adapters/                # @portal/auth-adapters — IAuthAdapter + three implementations
    ├── widget-registry/              # @portal/widget-registry — WidgetDefinition, registry Map, built-in widgets
    ├── dataverse-client/             # @portal/dataverse-client — OData fetch wrapper + typed query builders
    ├── i18n/                         # @portal/i18n — en.json, ar.json translation files + locale utilities
    └── ui/                           # @portal/ui — Fluent UI v9 shell components (nav, header, footer)
```

**Package responsibilities:**

| Package | Consumers | Purpose |
|---------|-----------|---------|
| `@portal/types` | web, api, mobile | Shared domain types, Zod schemas, DTO shapes. Single source of truth for all entity field names. |
| `@portal/auth-adapters` | api | `IAuthAdapter` interface + `AzureAdB2cAdapter`, `EntraExternalIdAdapter`, `CustomCredentialAdapter`. Adapter selected at runtime from `qdb_portal_config.auth_provider`. |
| `@portal/widget-registry` | web, mobile | `WidgetDefinition` interface, `WidgetRegistry` Map, five built-in widgets, `registerWidget()` function. |
| `@portal/dataverse-client` | api | Typed OData v4 fetch wrapper. Handles `MSCRM.SolutionUniqueName` header, Bearer token injection from MSAL, `$select`/`$filter`/`$expand` builder, and retry with exponential backoff. |
| `@portal/i18n` | web, mobile | Translation JSON files (`en.json`, `ar.json`). Consumed by next-intl on web and i18next on mobile. Turborepo ensures a single translation source. |
| `@portal/ui` | web | Fluent UI v9 shell layout components: `SidebarNav`, `TopNav`, `AppHeader`, `AppFooter`, `EntitySwitcher`, `NotificationPanel`. Not used by mobile (native components). |

---

## 3. ADR-PORT-001: Refine Headless + Fluent UI v9 Shell Pattern

**Status:** Accepted
**Date:** 2026-06-16
**Decided by:** Architect

### Context

The DFE Portal requires a structured admin/user portal framework with: data provider abstraction for Dataverse OData v4, role-based access control hooks, notification provider, i18n provider wiring, and route-resource mapping. Building all of this from scratch against Next.js App Router is a 4–6 week undifferentiated effort. The GitHub Research phase evaluated existing frameworks.

The Fluent UI v9 component library is already in active use in the DFE frontend and designer. Consistency with the existing DFE investment requires the portal shell to also use Fluent UI v9 for all navigation chrome.

### Decision

Adopt **Refine v4 in headless mode** (`@refinedev/core` only, no UI adapter) as the application framework for the portal shell web frontend. Wire Refine's `dataProvider` to `@refinedev/odata` pointing at the Dataverse OData v4 endpoint. Build the portal shell chrome (sidebar nav, top nav, header, footer) using **Fluent UI v9** components maintained in the `@portal/ui` shared package. Do not use any Refine UI adapter.

### Rationale

- `@refinedev/odata` maps CRUD operations (`create`, `getOne`, `getList`, `update`, `deleteOne`) directly to OData v4 query patterns. Dataverse OData v4 is the data backend. This eliminates 3–4 weeks of custom OData client development.
- Refine's `accessControlProvider`, `notificationProvider`, `i18nProvider`, and `authProvider` hooks provide structured extension points that align with the portal's configurability requirements.
- Headless mode means Refine contributes zero rendered DOM. All visual elements are Fluent UI v9. No style clash risk.
- Alternative evaluated: build a pure Next.js App Router portal without Refine. Rejected because it would require reimplementing the data provider abstraction, access control hooks, and route-resource registration from scratch.

### Consequences

- Positive: OData data provider is production-tested across thousands of Refine deployments.
- Positive: Refine's router adapter for Next.js (`@refinedev/nextjs-router`) handles resource-to-route mapping, reducing boilerplate.
- Negative: Refine has no Fluent UI v9 adapter. The team must implement a thin Fluent UI layout bridge. Estimated effort: 3–5 days.
- Negative: Refine's core version must be pinned — Refine v5 (in development) may introduce breaking changes to data provider contracts. Pin `@refinedev/core@^4` and monitor.

### Rejected Alternatives

| Alternative | Rejection Reason |
|-------------|-----------------|
| AdminJS + Fastify plugin | Auto-generates CRUD from database schema; not suitable for white-label configurable portal; design model conflicts with DFE's form-engine-driven approach |
| shadcn/ui admin template | shadcn/ui (Radix + CVA) and Fluent UI v9 (Griffel tokens) class systems clash in the same DOM; not safe to mix |
| Pure Next.js App Router, no framework | 4–6 weeks of undifferentiated infrastructure code (data provider, RBAC hooks, route registration) |

---

## 4. ADR-PORT-002: Auth.js v5 + MSAL Dual-Library Strategy

**Status:** Accepted
**Date:** 2026-06-16
**Decided by:** Architect

### Context

The portal requires two distinct auth concerns:

1. **Portal session management:** logging users in, managing HttpOnly cookie sessions, handling SSO providers (Microsoft, Google), and protecting Next.js routes. This is Auth.js territory.
2. **Dataverse OData token acquisition:** every call to Dataverse OData v4 requires a Bearer access token scoped to the Dynamics 365 resource (`https://org.crm.dynamics.com/.default`). This token cannot be obtained via Auth.js alone because Auth.js sessions are scoped to the portal application's own OAuth client; the Dataverse resource requires a separate on-behalf-of (OBO) token exchange using MSAL.

### Decision

Use **Auth.js v5 (next-auth@beta)** for portal session management and **@azure/msal-node** on the Fastify backend for Dataverse OData Bearer token acquisition. On the web frontend, use **@azure/msal-browser** only when a client-side Dataverse call is required (rare). Auth.js is the single source of user identity and session state. MSAL handles only the resource token exchange to Dataverse — it does not own the user session.

### Token Flow Diagram

```
[Browser]                   [Next.js Server]           [Fastify API]          [Dataverse OData]
    |                              |                         |                        |
    |  1. Login (SSO or custom)    |                         |                        |
    |----------------------------->|                         |                        |
    |                              |  2. Auth.js validates   |                        |
    |                              |     provider token      |                        |
    |                              |  3. Writes HttpOnly     |                        |
    |                              |     session cookie      |                        |
    |<-----------------------------|                         |                        |
    |  4. Portal loads (cookie)    |                         |                        |
    |----------------------------->|                         |                        |
    |                              |  5. Server Action /     |                        |
    |                              |     API Route calls     |                        |
    |                              |     Fastify with        |                        |
    |                              |     Authorization:      |                        |
    |                              |     Bearer <access_tok> |                        |
    |                              |------------------------>|                        |
    |                              |                         | 6. Fastify validates   |
    |                              |                         |    JWT (Auth.js secret)|
    |                              |                         | 7. msal-node           |
    |                              |                         |    acquireTokenSilent()|
    |                              |                         |    scope: Dataverse    |
    |                              |                         |----------------------->|
    |                              |                         |                        |
    |                              |                         | 8. OData response      |
    |                              |                         |<-----------------------|
    |                              |                         | 9. Fastify returns     |
    |                              |                         |    JSON to Next.js     |
    |                              |<------------------------|                        |
    |  10. UI renders data         |                         |                        |
    |<-----------------------------|                         |                        |
```

### Three Adapter Provider Mapping

| Adapter | Auth.js Provider Config | MSAL OBO Flow |
|---------|------------------------|---------------|
| Azure AD B2C | `providers: [AzureADB2C({ ... userFlowConfig })]` | `msal-node` ConfidentialClientApplication with B2C authority; `acquireTokenOnBehalfOf` with Dataverse scope |
| Entra External ID | `providers: [MicrosoftEntraId({ tenantId, clientId, clientSecret })]` | Same `msal-node` with Entra authority; OBO exchange to Dataverse |
| Custom Credential | `providers: [Credentials({ authorize: customCredentialAdapter.authenticate })]` | Service principal client-credentials flow (not OBO); portal's own app registration has Dataverse permissions |

### Rationale

- Auth.js v5 is the de-facto App Router auth standard (25k stars, 2.5–4.2M weekly downloads, MIT).
- MSAL is the only officially supported library for Azure AD B2C / Entra token flows.
- Separating session management (Auth.js) from Dataverse resource token (MSAL) follows the principle of single responsibility.
- The dual-library approach is documented by Microsoft for Next.js + Dataverse scenarios.

### Consequences

- Positive: Auth.js handles all SSO, cookie rotation, and provider abstraction in one place.
- Positive: MSAL's `acquireTokenSilent` uses an in-memory token cache on the Fastify server — Dataverse tokens are not re-acquired on every request.
- Negative: Two auth libraries in the dependency tree; the team must understand the boundary. Documented in `@portal/auth-adapters` package.
- Negative: next-auth v5 carries a "beta" npm tag. Pin the exact version. Monitor the nextauthjs/next-auth repository for stable release.

### Rejected Alternatives

| Alternative | Rejection Reason |
|-------------|-----------------|
| MSAL-only (no Auth.js) | No SSO cookie abstraction, no Credentials provider, no database session adapter. Would require building all session management from scratch. |
| better-auth | Microsoft Entra / Azure AD B2C provider ecosystem not as battle-tested as Auth.js. Revisit in 12 months. |
| Pure JWT custom implementation | Re-invents Auth.js; no justification when Auth.js provides the same. |

---

## 5. ADR-PORT-003: next-intl + Tailwind v4 Logical Properties RTL Strategy

**Status:** Accepted
**Date:** 2026-06-16
**Decided by:** Architect

### Context

The portal must support English (LTR) and Arabic (RTL) with a full layout mirror. RTL support spans three layers: routing (locale-in-path URL), layout (directional CSS), and content (rich text direction). Each layer requires a different tool.

### Decision

Use **next-intl** for locale routing middleware, server-side translation loading, and `dir` attribute injection. Use **Tailwind CSS v4 logical properties** (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`) for all spacing and positioning — never use `ml-*`, `mr-*`, `pl-*`, `pr-*` in any component. Use **Fluent UI v9**'s built-in RTL support (no configuration needed). Use **tiptap-text-direction** extension for rich-text content RTL in the CMS editor.

### Locale Routing Middleware

```
/en/dashboard      → lang=en, dir=ltr
/ar/dashboard      → lang=ar, dir=rtl
/dashboard         → middleware redirects to /en/dashboard (default)
```

The next-intl middleware runs at the Edge. It reads `Accept-Language`, falls back to `en`, and prepends the locale segment. The root `layout.tsx` receives `locale` as a prop and renders:

```
<html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
```

### Tailwind v4 Logical Properties Reference

| Physical (forbidden) | Logical (required) | CSS Mapped Property |
|---------------------|-------------------|---------------------|
| `ml-*` | `ms-*` | `margin-inline-start` |
| `mr-*` | `me-*` | `margin-inline-end` |
| `pl-*` | `ps-*` | `padding-inline-start` |
| `pr-*` | `pe-*` | `padding-inline-end` |
| `left-*` | `start-*` | `inset-inline-start` |
| `right-*` | `end-*` | `inset-inline-end` |
| `text-left` | `text-start` | `text-align: start` |
| `text-right` | `text-end` | `text-align: end` |
| `rounded-l-*` | `rounded-s-*` | `border-start-*-radius` |
| `rounded-r-*` | `rounded-e-*` | `border-end-*-radius` |

A custom ESLint rule (`no-physical-tailwind-classes`) is added to the web app to prevent physical classes from being committed.

### Tiptap RTL Configuration

```
Extensions to install:
- @tiptap/starter-kit
- tiptap-text-direction          (community: amirhhashemi/tiptap-text-direction)
- @tiptap/extension-image
- @tiptap/extension-table
- @tiptap/extension-table-row
- @tiptap/extension-table-cell
- @tiptap/extension-table-header
- @tiptap/extension-link
- @tiptap/extension-youtube

TextDirection extension config:
  types: ['heading', 'paragraph', 'listItem', 'tableCell']
  defaultDirection: driven by active locale (ar → rtl, en → ltr)
```

### Rationale

- next-intl is the only i18n library designed from the ground up for Next.js App Router + Server Components. Competitors require wrapper configuration that adds hydration overhead.
- Tailwind v4 logical properties require zero plugin installation and flip automatically when `dir="rtl"` is on the root element.
- Fluent UI v9 has built-in RTL; no additional configuration needed — it reads `dir` from the DOM.
- tiptap-text-direction is the only maintained extension that sets per-node text direction in Tiptap; the core `setTextDirection` command is available but the extension provides toolbar integration.

### Consequences

- Positive: RTL layout is CSS-driven, not JavaScript-driven. No layout shift, no direction toggling in component state.
- Positive: Locale routing is middleware-first — search engines correctly index `/ar/` routes.
- Negative: All developers must use logical properties. Physical class usage requires a lint rule to enforce.
- Negative: AR locale number/date formatting (`ar-QA`) must be verified on real devices (CEO condition 3). The `Intl.DateTimeFormat` and `Intl.NumberFormat` APIs are used; no polyfill required on iOS 15+ / Android 11+.

### Rejected Alternatives

| Alternative | Rejection Reason |
|-------------|-----------------|
| i18next + react-i18next | Not App Router-native; requires additional wrapper configuration; no advantage over next-intl for this project |
| FormatJS / react-intl | More boilerplate than next-intl; same outcome; no App Router-first SSR support |
| tailwindcss-vanilla-rtl plugin | Only needed for Tailwind v3. Tailwind v4 logical properties are native — plugin is unnecessary. |

---

## 6. ADR-PORT-004: Widget Plug-in Registry

**Status:** Accepted
**Date:** 2026-06-16
**Decided by:** Architect

### Context

CEO condition 2 requires the Widget API contract to be locked before dashboard build and immutable post-approval without an ADR. The dashboard grid (react-grid-layout) displays self-contained widget components. Adding a new widget must require zero changes to the portal shell code.

### Decision

Implement a **Widget Registry** pattern using a `Map<string, WidgetDefinition>` in the `@portal/widget-registry` package. Each widget is a self-contained module that calls `registerWidget(definition)` at import time. The dashboard shell imports the registry and renders whatever is registered — it has no direct imports of any widget component.

### Complete Widget API Contract (TypeScript Interface)

This interface is immutable. Any change requires ADR-PORT-004-revision-N.

```typescript
import type { ComponentType } from 'react';
import type { ZodSchema } from 'zod';

/**
 * The configuration payload stored in qdb_portal_widget_config.config_json.
 * Each widget defines its own shape via configSchema.
 */
export type WidgetConfig = Record<string, unknown>;

/**
 * Props injected into every widget component by the dashboard shell.
 */
export interface WidgetRenderProps<TConfig extends WidgetConfig = WidgetConfig> {
  /** The instance-specific config from qdb_portal_widget_config.config_json */
  config: TConfig;
  /** The dashboard column span allocated to this widget instance */
  columnSpan: number;
  /** Locale string for widget-level formatting (e.g. 'ar', 'en') */
  locale: string;
  /** Widget instance ID (qdb_portal_widget_config record ID) */
  instanceId: string;
}

/**
 * The complete widget definition contract.
 * Locked by ADR-PORT-004. Immutable without a new ADR.
 */
export interface WidgetDefinition<TConfig extends WidgetConfig = WidgetConfig> {
  /**
   * Unique machine-readable identifier for this widget type.
   * Used as the key in qdb_portal_widget_config.widget_type.
   * Convention: kebab-case, e.g. 'my-requests-summary', 'statistics-counter'
   */
  readonly name: string;

  /**
   * Human-readable display name shown in the admin widget picker.
   * Supports EN and AR via shape: { en: string; ar: string }
   */
  readonly title: { en: string; ar: string };

  /**
   * The React component that renders this widget.
   * Must handle its own data fetching, loading skeleton, and error boundary.
   * Receives WidgetRenderProps<TConfig>.
   */
  readonly component: ComponentType<WidgetRenderProps<TConfig>>;

  /**
   * Zod schema that validates config_json stored in Dataverse.
   * Used by the admin config panel to validate before save.
   * Used by the shell to validate before rendering.
   */
  readonly configSchema: ZodSchema<TConfig>;

  /**
   * Default configuration used when a new widget instance is created.
   * Must satisfy configSchema.
   */
  readonly defaultConfig: TConfig;
}
```

### Registry Pattern

```typescript
// packages/widget-registry/src/registry.ts
const widgetRegistry = new Map<string, WidgetDefinition>();

export function registerWidget<TConfig extends WidgetConfig>(
  definition: WidgetDefinition<TConfig>
): void {
  if (widgetRegistry.has(definition.name)) {
    throw new Error(`Widget already registered: ${definition.name}`);
  }
  widgetRegistry.set(definition.name, definition as WidgetDefinition);
}

export function resolveWidget(name: string): WidgetDefinition | undefined {
  return widgetRegistry.get(name);
}

export function listRegisteredWidgets(): WidgetDefinition[] {
  return Array.from(widgetRegistry.values());
}
```

### Dataverse to Widget Instance Mapping

```
qdb_portal_widget_config record
  widget_type: 'my-requests-summary'          → resolveWidget('my-requests-summary')
  config_json: '{"showChart":true}'            → validated by definition.configSchema
  column_span: 2                               → passed as WidgetRenderProps.columnSpan
  display_order: 1                             → used by react-grid-layout layout array
```

### Built-in Widget Registration (v1)

Registered in `packages/widget-registry/src/builtins/index.ts`:

| Widget Name | `name` key | Data Source |
|-------------|-----------|-------------|
| My Requests Summary | `my-requests-summary` | `GET /api/services/my-requests?summary=true` |
| Recent Activity | `recent-activity` | `GET /api/services/activity?limit=10` |
| Announcements Banner | `announcements` | `GET /api/cms/content?type=announcement&status=published` |
| Quick Actions | `quick-actions` | Config-driven; no data fetch |
| Statistics Counters | `statistics-counters` | `GET /api/widgets/statistics` (aggregates from Dataverse) |

### Adding a New Widget (Zero Shell Changes)

1. Create new package or file in `packages/widget-registry/src/custom/my-widget/`
2. Implement `WidgetDefinition<MyWidgetConfig>` interface
3. Call `registerWidget(myWidgetDefinition)` in the module
4. Import the module in `apps/web/app/(portal)/dashboard/page.tsx` at the top of the file
5. Add a `qdb_portal_widget_config` record with `widget_type: 'my-widget'`

The shell renders it automatically. No other files change.

### Consequences

- Positive: Dashboard shell has zero coupling to widget implementations.
- Positive: New widgets can be added per-tenant without shell deployment.
- Negative: Widget developers must understand the contract. Contract documentation is required in the `@portal/widget-registry` package README.
- Negative: If a widget calls `registerWidget()` twice (e.g., due to hot reload), the registry throws. The registry must be a module-level singleton — use Next.js `globalThis` cache pattern in development.

---

## 7. ADR-PORT-005: Auth Adapter Interface

**Status:** Accepted
**Date:** 2026-06-16
**Decided by:** Architect

### Context

CEO condition 1 requires the auth adapter interface to be defined before any auth implementation begins. All three providers (Azure AD B2C, Entra External ID, Custom) must implement the same interface so the portal shell is completely decoupled from the provider choice stored in `qdb_portal_config.auth_provider`.

### Decision

Define `IAuthAdapter` in `packages/auth-adapters/src/IAuthAdapter.ts`. The adapter is selected at Fastify startup by reading `qdb_portal_config.auth_provider` from Dataverse. All three concrete adapters implement this interface.

### Complete IAuthAdapter Interface

```typescript
import type { Session } from 'next-auth';

/**
 * The standardised credential shape passed from the login form
 * or SSO callback to the adapter.
 */
export interface AuthCredentials {
  /** Email address for custom credential flow; undefined for SSO flows */
  email?: string;
  /** Plaintext password for custom credential flow; undefined for SSO flows */
  password?: string;
  /** OTP code for MFA/verification steps */
  otpCode?: string;
  /** OAuth authorization code received from SSO provider callback */
  oauthCode?: string;
  /** OAuth code verifier (PKCE) */
  codeVerifier?: string;
  /** OAuth redirect URI used to obtain the code */
  redirectUri?: string;
}

/**
 * The normalised user identity returned by every adapter.
 * Maps to Auth.js Session.user shape.
 */
export interface AuthenticatedUser {
  /** Dataverse contact or system user ID */
  id: string;
  email: string;
  displayName: string;
  /** Role names from Dataverse security roles */
  roles: string[];
  /** Short-lived access token (15 min) for Fastify API calls */
  accessToken: string;
  /** Long-lived refresh token (7 days) */
  refreshToken: string;
  /** Access token expiry as ISO-8601 string */
  accessTokenExpiresAt: string;
}

/**
 * Registration input for new user self-registration flows.
 */
export interface RegistrationInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

/**
 * Result returned by initiatePasswordReset and verifyOtp.
 */
export interface OtpResult {
  /** Whether the OTP was dispatched or validated successfully */
  success: boolean;
  /** Opaque reset token for the confirmPasswordReset step */
  resetToken?: string;
}

/**
 * IAuthAdapter — the contract every auth provider must implement.
 * Resolved at startup from qdb_portal_config.auth_provider.
 * Immutable post-ADR-PORT-005 approval without a revision ADR.
 */
export interface IAuthAdapter {
  /**
   * Authenticates a user with the given credentials.
   * For SSO flows, credentials.oauthCode + codeVerifier are populated.
   * For custom flows, credentials.email + password are populated.
   * Throws AuthenticationError on failure — never returns null.
   */
  authenticate(credentials: AuthCredentials): Promise<AuthenticatedUser>;

  /**
   * Exchanges a valid refresh token for a new access token.
   * Throws TokenRefreshError if the refresh token is expired or revoked.
   */
  refreshAccessToken(refreshToken: string): Promise<AuthenticatedUser>;

  /**
   * Revokes all active sessions for the given user.
   * Called on logout and on password change.
   */
  revokeAllSessions(userId: string): Promise<void>;

  /**
   * Registers a new user. Only applicable to the Custom adapter.
   * B2C and Entra adapters throw NotImplementedError.
   * Returns the newly created AuthenticatedUser after email verification.
   */
  register(input: RegistrationInput): Promise<{ verificationPending: true; email: string }>;

  /**
   * Initiates a password reset flow by sending an OTP to the user's email.
   * Returns success: true when the OTP email was dispatched.
   */
  initiatePasswordReset(email: string): Promise<OtpResult>;

  /**
   * Verifies the OTP entered by the user. Returns a resetToken on success.
   */
  verifyOtp(email: string, otpCode: string): Promise<OtpResult>;

  /**
   * Completes the password reset using the resetToken from verifyOtp.
   */
  confirmPasswordReset(resetToken: string, newPassword: string): Promise<void>;

  /**
   * Returns the Auth.js Provider configuration for this adapter.
   * Used to dynamically configure the Auth.js `providers` array at startup.
   */
  toAuthJsProvider(): import('next-auth/providers').Provider;
}
```

### Adapter-to-Provider Mapping

| Adapter Class | `auth_provider` value | Auth.js Provider | MSAL Authority |
|--------------|----------------------|-----------------|----------------|
| `AzureAdB2cAdapter` | `azure-ad-b2c` | `AzureADB2C({ tenant, clientId, clientSecret, primaryUserFlow })` | `https://{tenant}.b2clogin.com/{tenant}.onmicrosoft.com/{userflow}/v2.0` |
| `EntraExternalIdAdapter` | `entra-external-id` | `MicrosoftEntraId({ tenantId, clientId, clientSecret })` | `https://login.microsoftonline.com/{tenantId}/v2.0` |
| `CustomCredentialAdapter` | `custom` | `Credentials({ authorize: this.authenticate })` | Service principal client_credentials; no user-delegated OBO |

### Consequences

- Positive: The portal shell never imports a concrete adapter. Provider swap requires only a Dataverse config record change.
- Positive: The `register()` and `initiatePasswordReset()` methods on B2C and Entra adapters throw `NotImplementedError` with a clear message — not silently swallowed.
- Negative: Three adapters must be maintained. B2C and Entra adapters delegate to Auth.js providers; the Custom adapter owns the full auth lifecycle. The Custom adapter carries the highest implementation risk and test surface.

---

## 8. Backend API Architecture

### Fastify Plugin Structure

```
apps/api/src/
├── server.ts                  # Fastify server instantiation + plugin registration
├── plugins/
│   ├── cors.ts                # CORS config (allow web origin + mobile scheme)
│   ├── rateLimit.ts           # @fastify/rate-limit; auth routes: 10 req/min
│   ├── jwt.ts                 # @fastify/jwt for portal access token verification
│   ├── multipart.ts           # @fastify/multipart for file uploads
│   ├── dataverseClient.ts     # Decorates fastify with fastify.dataverse (typed OData client)
│   ├── msalClient.ts          # Decorates fastify with fastify.msal (MSAL ConfidentialClientApp)
│   ├── tenantContext.ts       # Reads x-portal-id header; loads qdb_portal_config; decorates request
│   └── authGuard.ts           # Route preHandler: validates JWT; populates request.user
├── routes/
│   ├── portal/                # /api/portal — portal config, nav items, widget configs
│   ├── auth/                  # /api/auth — login, register, refresh, logout, OTP
│   ├── nav/                   # /api/nav — nav items with badge counts
│   ├── notifications/         # /api/notifications — list, mark-read, unread-count
│   ├── cms/                   # /api/cms — content CRUD, revisions, publish/unpublish
│   ├── services/              # /api/services — service cards, my-requests, request detail
│   ├── widgets/               # /api/widgets — statistics aggregates, activity feed
│   ├── files/                 # /api/files — SAS token generation, upload to Azure Blob
│   └── health.ts              # GET /health → { status, version, timestamp }
└── services/
    ├── NotificationWriteService.ts   # Called by services/ routes to create notification records
    ├── CmsScheduleService.ts         # Cron: publishes/unpublishes scheduled content
    ├── TokenCacheService.ts          # In-memory MSAL token cache wrapper
    └── PortalConfigCacheService.ts   # In-memory config cache (5-min TTL)
```

### Route Groups

| Route Prefix | Auth Guard | Description |
|-------------|-----------|-------------|
| `GET /api/portal/config` | None (cached public) | Portal branding, layout, feature flags |
| `GET /api/portal/nav` | Required | Nav items filtered by user role |
| `GET /api/portal/widgets` | Required | Widget configs for user's dashboard |
| `POST /api/auth/login` | None | Credential login via adapter |
| `POST /api/auth/refresh` | None | Refresh token rotation |
| `POST /api/auth/logout` | Required | Revoke all sessions |
| `POST /api/auth/register` | None | Custom adapter only |
| `POST /api/auth/forgot-password` | None | Initiate OTP |
| `POST /api/auth/verify-otp` | None | Verify OTP |
| `POST /api/auth/reset-password` | None | Confirm reset |
| `GET /api/nav/badges` | Required | Live badge counts |
| `GET /api/notifications` | Required | Paginated notifications |
| `PATCH /api/notifications/:id/read` | Required | Mark single read |
| `POST /api/notifications/mark-all-read` | Required | Mark all read |
| `GET /api/cms/content` | Optional | Public content listing |
| `GET /api/cms/content/:slug` | Optional | Content detail |
| `POST /api/cms/content` | Admin | Create content |
| `PUT /api/cms/content/:id` | Admin | Update content |
| `POST /api/cms/content/:id/publish` | Admin | Publish immediately |
| `GET /api/cms/content/:id/revisions` | Admin | List revisions |
| `POST /api/cms/content/:id/revisions/:revId/restore` | Admin | Roll back revision |
| `GET /api/services` | Required | Service card listing |
| `GET /api/services/:code` | Required | Service detail |
| `GET /api/services/my-requests` | Required | User's applications |
| `GET /api/services/my-requests/:id` | Required | Request detail |
| `POST /api/files/sas-token` | Required | Azure Blob SAS token |
| `GET /health` | None | Health check |

### Middleware Execution Order

```
Request → cors → rateLimit → tenantContext → jwt (authGuard) → route handler
```

The `tenantContext` plugin reads `x-portal-id` from the request header, loads `qdb_portal_config` from cache, and attaches the config to `request.portalConfig`. If the header is absent, it falls back to the default portal config.

### Dataverse OData Client

The `@portal/dataverse-client` package wraps fetch with:

- Bearer token injection from `fastify.msal.acquireTokenSilent()`
- `MSCRM.SolutionUniqueName: dfe_portal_shell` header on all write operations
- `Prefer: return=representation` header on POST/PATCH
- Typed query builder for `$select`, `$filter`, `$expand`, `$orderby`, `$top`
- Retry: 3 attempts, exponential backoff (500ms, 1000ms, 2000ms), retry on 429 and 5xx
- Circuit breaker: open after 5 consecutive failures; half-open after 30 seconds

### Caching Strategy

| Resource | Cache Layer | TTL | Invalidation Trigger |
|----------|------------|-----|---------------------|
| `qdb_portal_config` | In-memory (Fastify plugin) + CDN | 5 min | Admin POST /api/portal/config |
| `qdb_portal_nav_item` list | Session-scoped (TanStack Query) | Session lifetime | Nav builder save |
| CMS content list | TanStack Query staleTime 60s | 60s | Publish/unpublish event |
| Notification unread count | TanStack Query refetchInterval | Configurable (10–120s) | Mark-read mutation |
| Dataverse Bearer token | MSAL in-memory token cache | Token expiry (~3599s) | Token expiry |

---

## 9. Frontend Architecture (Next.js 14 App Router)

### Directory Structure

```
apps/web/app/
├── layout.tsx                    # Root layout — locale, dir, FluentProvider, QueryClient
├── (public)/
│   ├── [locale]/
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   ├── forgot-password/page.tsx
│   │   ├── news/page.tsx
│   │   ├── news/[slug]/page.tsx
│   │   └── [slug]/page.tsx       # Static pages
├── (portal)/
│   ├── layout.tsx                # Auth guard + PortalShell (Sidebar/TopNav + Header)
│   ├── [locale]/
│   │   ├── page.tsx              # Dashboard (react-grid-layout + widget registry)
│   │   ├── services/page.tsx
│   │   ├── services/[code]/page.tsx
│   │   ├── forms/[formCode]/page.tsx
│   │   ├── my-requests/page.tsx
│   │   ├── my-requests/[id]/page.tsx
│   │   ├── notifications/page.tsx
│   │   └── profile/page.tsx
└── (admin)/
    ├── layout.tsx                # Admin role guard
    └── [locale]/
        ├── portal/page.tsx       # Portal config editor
        ├── cms/page.tsx          # CMS content list
        ├── cms/[id]/page.tsx     # CMS content editor (Tiptap)
        ├── nav/page.tsx          # Nav item builder
        └── dashboard/page.tsx    # Widget config editor
```

### Provider Tree

The provider tree wraps the entire `(portal)` route group. Each provider is a Client Component. Server Components inside the portal routes receive data via Server Actions or `fetch()` in the component body — they do not consume these providers directly.

```
<html lang dir>
  <body>
    <NextIntlClientProvider locale messages>       {/* Translation + locale context */}
      <FluentProvider theme>                       {/* Fluent UI tokens + RTL */}
        <SessionProvider session>                  {/* Auth.js session on client */}
          <PortalConfigProvider config>            {/* qdb_portal_config loaded server-side */}
            <QueryClientProvider client>           {/* TanStack Query */}
              <HydrationBoundary>                  {/* SSR-prefetched queries */}
                {children}
              </HydrationBoundary>
            </QueryClientProvider>
          </PortalConfigProvider>
        </SessionProvider>
      </FluentProvider>
    </NextIntlClientProvider>
  </body>
</html>
```

### Server vs Client Component Boundary

| Component | Type | Reason |
|-----------|------|--------|
| `app/(portal)/layout.tsx` | Server | Auth guard via `getServerSession()`, portal config fetch |
| `PortalShell` (nav + header) | Client | Uses `usePathname`, interactive collapse/expand |
| `SidebarNav` | Client | Active item highlight, badge polling |
| `AppHeader` | Client | Entity switcher dropdown, notification panel |
| `DashboardPage` | Server | Static grid layout from Dataverse; widget configs prefetched |
| `WidgetContainer` | Client | Each widget independently fetches its own data |
| `NotificationPanel` | Client | TanStack Query polling |
| `CmsEditor` | Client | Tiptap requires browser DOM |
| `LoginPage` | Server | Renders branded login form from portal config |
| News/Blog listing | Server | SEO — fully server-rendered, no client hydration needed |

### Portal Config Loading Strategy

The `(portal)/layout.tsx` Server Component calls `getPortalConfig(portalId)` which:

1. Reads `x-portal-id` from request headers (injected by middleware from subdomain/path)
2. Fetches `qdb_portal_config` from the Fastify API (or directly from Dataverse via `@portal/dataverse-client`)
3. Caches the result in Next.js `unstable_cache` with a 5-minute TTL and a `portal-config-{portalId}` tag
4. Passes config as a prop to `<PortalConfigProvider>` and as `<FluentProvider theme={buildTheme(config)}>`

The admin `POST /api/portal/config` endpoint calls `revalidateTag('portal-config-{portalId}')` after a save.

---

## 10. Mobile Architecture (Expo)

### expo-router File Structure

```
apps/mobile/app/
├── _layout.tsx               # Root layout: expo-router Stack + auth check
├── (auth)/
│   ├── _layout.tsx
│   ├── login.tsx
│   ├── register.tsx
│   └── forgot-password.tsx
├── (tabs)/
│   ├── _layout.tsx           # Bottom tab bar definition
│   ├── index.tsx             # Dashboard tab
│   ├── my-requests.tsx       # My Requests tab
│   ├── services.tsx          # Services tab
│   └── messages.tsx          # Messages tab
├── services/
│   └── [code].tsx            # Service detail + Apply Now
├── forms/
│   └── [formCode].tsx        # DFE form screen
├── my-requests/
│   └── [id].tsx              # Request detail + status timeline
├── news/
│   ├── index.tsx
│   └── [slug].tsx
└── notifications/
    └── index.tsx
```

### Auth Flow

```
[App start]
  → Check expo-secure-store for stored tokens
  → If tokens present:
      → POST /api/auth/refresh
      → On success: navigate to (tabs)
      → On failure: navigate to (auth)/login
  → If no tokens:
      → (auth)/login

[Biometric login (subsequent opens)]
  → expo-local-authentication.authenticateAsync()
  → On success: retrieve token from expo-secure-store → navigate to (tabs)
  → On failure: show password prompt

[SSO flow (Microsoft / Google)]
  → expo-auth-session.makeRedirectUri()
  → expo-auth-session.startAsync({ authUrl: adapter.getAuthUrl() })
  → Exchange code with POST /api/auth/login (OAuth flow)
  → Store tokens in expo-secure-store
```

### Push Notification Registration Flow

```
[App first launch after login]
  1. expo-notifications.requestPermissionsAsync()
  2. On granted: expo-notifications.getExpoPushTokenAsync({ projectId })
  3. POST /api/notifications/register-device { pushToken, platform: 'ios'|'android' }
  4. Fastify stores push token in qdb_contact.qdb_push_token Dataverse column

[Notification triggered]
  → Fastify NotificationWriteService creates qdb_portal_notification record
  → Calls expo-notifications push API (via @expo/server SDK on Fastify)
  → Device receives push; tap calls expo-router.navigate('/notifications') or deep link
```

Note: Push notifications require an EAS Build (dev client) from SDK 53. Expo Go cannot receive push notifications on Android. This is a build pipeline constraint, not a code change — EAS Build profiles are defined in `eas.json`.

### Offline Draft Sync Strategy

```
[User fills DFE form, loses connectivity]
  → Form state serialized to JSON
  → expo-secure-store.setItemAsync('draft-{formCode}', JSON.stringify(draftState))

[Connectivity restored]
  → expo-updates.checkForUpdateAsync() triggers in background
  → App detects draft in store on next focus
  → Prompt: "You have an unsaved draft. Resume?"
  → On confirm: POST /api/forms/{formCode}/submit
  → On success: expo-secure-store.deleteItemAsync('draft-{formCode}')
```

### Shared Type Packages with Web

The mobile app imports from `@portal/types` and `@portal/i18n`. The `@portal/widget-registry` is web-only — mobile dashboard uses a flat card layout, not react-grid-layout. The `@portal/auth-adapters` package is backend-only — mobile calls the Fastify auth routes directly.

---

## 11. CMS Architecture

### Content Entity Schema: qdb_cms_content

See Section 13 for complete field list. The CMS state machine governs content lifecycle:

```
DRAFT ──────────────► PUBLISHED ──────────► ARCHIVED
  │                      │                     │
  │   (schedule date)    │ (unpublish date      │ (restore)
  └──► SCHEDULED ────────┘  or manual)          │
                                                 └──► DRAFT
```

### Revision Tracking Strategy

Every save to a PUBLISHED or SCHEDULED content item creates a `qdb_cms_revision` record before applying the change. Draft saves do NOT create revisions (avoids revision pollution during authoring). Maximum 10 revisions per content item. On the 11th revision, the oldest is deleted (FIFO). Revision deletion is permitted — revisions are not audit records; they are drafts. The `qdb_cms_content` record itself carries `created_by`, `created_on`, `modified_by`, `modified_on` as the authoritative audit trail.

### Tiptap Extension Configuration

```typescript
// Complete extension list for CMS editor
const cmsEditorExtensions = [
  StarterKit,                          // Heading, Bold, Italic, Lists, Blockquote, Code
  TextDirection.configure({
    types: ['heading', 'paragraph', 'listItem', 'tableCell'],
    defaultDirection: activeLocale === 'ar' ? 'rtl' : 'ltr',
  }),
  Image.configure({ inline: true, allowBase64: false }),  // src = Azure Blob URL
  Table.configure({ resizable: true }),
  TableRow,
  TableCell,
  TableHeader,
  Link.configure({ openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer' } }),
  Youtube.configure({ width: 640, height: 360, nocookie: true }),
  Placeholder.configure({ placeholder: 'Start writing...' }),
  CharacterCount,                      // Word/char count for AR and EN bodies
];
```

### Publishing State Machine — Fastify Implementation

```
Immediate publish: PATCH /api/cms/content/:id/publish
  → Sets status = 'published', published_at = now()
  → Creates qdb_cms_revision before change
  → Returns updated record

Scheduled publish: PATCH /api/cms/content/:id  { scheduled_publish_at: ISO-8601 }
  → Sets status = 'scheduled'
  → CmsScheduleService cron (every 60s) picks up records where
    scheduled_publish_at <= now() AND status = 'scheduled'
  → Sets status = 'published', published_at = scheduled_publish_at

Scheduled unpublish: same cron checks scheduled_unpublish_at
  → Sets status = 'archived'
```

The cron runs inside Fastify using `@fastify/schedule` (wraps node-cron). This is simpler than a Power Automate flow and keeps the schedule logic co-located with the content API. A Power Automate flow is acceptable as an alternative if the client requires no Node.js scheduled processes.

---

## 12. Notification Architecture

### qdb_portal_notification — Full Field Schema

See Section 13 for the complete field list.

### Backend Write Path

`NotificationWriteService.writeNotification(input: NotificationInput)` is called by:

| Trigger Route | Notification Type | Title Template |
|--------------|------------------|---------------|
| `PATCH /api/services/my-requests/:id` (status change) | `info` / `success` / `warning` | "Your request for {service} has been {status}" |
| `POST /api/services/my-requests/:id/documents` (document requested) | `warning` | "Additional documents requested for {service}" |
| `POST /api/messages` (message received) | `info` | "New message from {senderName}" |
| `PATCH /api/services/my-requests/:id/decision` (approval/rejection) | `success` / `error` | "Your {service} application has been {decision}" |

The service creates a `qdb_portal_notification` record in Dataverse, then fires a push notification to the registered device token (if one exists) via `@expo/server` SDK.

### TanStack Query Polling Configuration

```typescript
// apps/web/hooks/useNotifications.ts
const NOTIFICATION_QUERY_KEY = ['notifications', 'unread-count'];

export function useUnreadNotificationCount(portalConfig: PortalConfig) {
  return useQuery({
    queryKey: NOTIFICATION_QUERY_KEY,
    queryFn: () => fetchUnreadCount(),
    refetchInterval: portalConfig.notification_poll_interval_seconds * 1000,
    refetchIntervalInBackground: false,  // Only poll when tab is focused
    staleTime: 0,                        // Always refetch on interval
  });
}
```

The `notification_poll_interval_seconds` value is loaded from `qdb_portal_config` and is constrained to 10–120 seconds in the Fastify config validation schema (Zod). The UI renders the interval selector in the admin portal config panel with a slider (min 10, max 120, step 5).

### Mobile Push Flow

```
[Fastify NotificationWriteService]
  1. Creates qdb_portal_notification in Dataverse
  2. Reads qdb_contact.qdb_push_token for target user
  3. If push token exists:
     → @expo/server.sendPushNotificationsAsync([{
         to: pushToken,
         title: notification.title,
         body: notification.body,
         data: { type: notification.type, linkUrl: notification.link_url }
       }])
  4. Logs push result (success/failure) to structured logger

[Device tap]
  → expo-notifications addNotificationResponseReceivedListener
  → expo-router.navigate(notification.data.linkUrl)
```

### Future Real-Time Upgrade Path

The `useUnreadNotificationCount` hook interface is stable. When real-time is required in v2:

1. Add `socket.io-server` to Fastify
2. Create a `useSocketNotifications` hook implementing the same interface as `useUnreadNotificationCount`
3. Replace the hook import in `NotificationPanel.tsx` — one line change
4. The component contract (data shape, invalidation) does not change

---

## 13. Dataverse Entity Schema

All entities use `qdb_` publisher prefix. All entities are **User-owned** (not Organization-owned) unless specified. All entities carry the standard audit fields: `createdon`, `createdby`, `modifiedon`, `modifiedby` (system-managed).

### qdb_portal_config

| Logical Name | Display Name | Type | Constraints |
|-------------|-------------|------|-------------|
| `qdb_portal_configid` | Portal Config ID | Unique Identifier (PK) | System-generated GUID |
| `qdb_name` | Portal Name | Single Line of Text | Max 100; required |
| `qdb_portal_id` | Portal Identifier | Single Line of Text | Max 50; unique; slug format; required |
| `qdb_logo_url` | Logo URL | Single Line of Text | Max 500; URL format |
| `qdb_favicon_url` | Favicon URL | Single Line of Text | Max 500; URL format |
| `qdb_primary_color` | Primary Color | Single Line of Text | Max 7; hex format (#RRGGBB) |
| `qdb_accent_color` | Accent Color | Single Line of Text | Max 7; hex format |
| `qdb_background_color` | Background Color | Single Line of Text | Max 7; hex format |
| `qdb_font_family` | Font Family | Single Line of Text | Max 100; CSS font-family value |
| `qdb_nav_layout` | Navigation Layout | Option Set | 1=Left Sidebar, 2=Top Navigation |
| `qdb_sidebar_default_state` | Sidebar Default State | Option Set | 1=Expanded, 2=Collapsed |
| `qdb_sidebar_width_px` | Sidebar Width (px) | Whole Number | Min 200, Max 400; default 240 |
| `qdb_header_entity_switcher` | Show Entity Switcher | Two Options | Default: true |
| `qdb_header_support_link` | Show Support Link | Two Options | Default: true |
| `qdb_header_notifications` | Show Notifications Bell | Two Options | Default: true |
| `qdb_header_user_avatar` | Show User Avatar | Two Options | Default: true |
| `qdb_footer_left_logo_url` | Footer Left Logo URL | Single Line of Text | Max 500 |
| `qdb_footer_right_logo_url` | Footer Right Logo URL | Single Line of Text | Max 500 |
| `qdb_footer_powered_by_text` | Footer Powered-By Text | Single Line of Text | Max 200 |
| `qdb_footer_link_json` | Footer Links JSON | Multiple Lines of Text | JSON array: [{label, url}] |
| `qdb_auth_provider` | Auth Provider | Option Set | 1=Azure AD B2C, 2=Entra External ID, 3=Custom |
| `qdb_sso_microsoft` | Enable Microsoft SSO | Two Options | Default: false |
| `qdb_sso_google` | Enable Google SSO | Two Options | Default: false |
| `qdb_allow_self_registration` | Allow Self Registration | Two Options | Default: true |
| `qdb_default_landing_page` | Default Landing Page | Option Set | 1=Dashboard, 2=Services, 3=My Requests |
| `qdb_default_locale` | Default Locale | Single Line of Text | Max 10; 'en' or 'ar' |
| `qdb_rtl_enabled` | RTL Mode Enabled | Two Options | Default: false |
| `qdb_idle_timeout_minutes` | Idle Session Timeout (min) | Whole Number | Min 5, Max 480; default 30 |
| `qdb_notification_poll_interval_seconds` | Notification Poll Interval (s) | Whole Number | Min 10, Max 120; default 30 |
| `qdb_auth_config_json` | Auth Provider Config JSON | Multiple Lines of Text | Provider-specific JSON (tenant, clientId, userflow etc.). Encrypted column-level security. |
| `qdb_is_active` | Is Active | Two Options | Default: true |

**Ownership:** Organization-owned (single config record per portal instance)
**Security:** `qdb_auth_config_json` protected by Column Security Profile restricted to Admin role

---

### qdb_portal_nav_item

| Logical Name | Display Name | Type | Constraints |
|-------------|-------------|------|-------------|
| `qdb_portal_nav_itemid` | Nav Item ID | Unique Identifier (PK) | System-generated GUID |
| `qdb_name` | Display Name (EN) | Single Line of Text | Max 100; required |
| `qdb_name_ar` | Display Name (AR) | Single Line of Text | Max 100 |
| `qdb_page_code` | Page Code | Single Line of Text | Max 50; maps to portal route |
| `qdb_icon_name` | Fluent Icon Name | Single Line of Text | Max 100; e.g. 'Home24Regular' |
| `qdb_display_order` | Display Order | Whole Number | Ascending; default 0 |
| `qdb_is_visible` | Is Visible | Two Options | Default: true |
| `qdb_required_role` | Required Role | Single Line of Text | Max 50; role name; empty = visible to all |
| `qdb_parent_nav_item` | Parent Nav Item | Lookup (qdb_portal_nav_item) | Self-referential; one level only |
| `qdb_badge_type` | Badge Type | Option Set | 0=None, 1=Static Count, 2=Live OData Count |
| `qdb_badge_static_count` | Badge Static Count | Whole Number | Used when badge_type = 1 |
| `qdb_badge_odata_query` | Badge OData Query | Single Line of Text | Max 500; OData $filter expression for count |
| `qdb_portal_config` | Portal Config | Lookup (qdb_portal_config) | Required; N:1 relationship |

**Ownership:** Organization-owned

---

### qdb_portal_notification

| Logical Name | Display Name | Type | Constraints |
|-------------|-------------|------|-------------|
| `qdb_portal_notificationid` | Notification ID | Unique Identifier (PK) | System-generated GUID |
| `qdb_user_id` | User (Contact) | Lookup (contact) | Required; N:1 to contact |
| `qdb_title` | Title | Single Line of Text | Max 200; required |
| `qdb_body` | Body | Multiple Lines of Text | Max 2000 |
| `qdb_type` | Notification Type | Option Set | 1=Info, 2=Success, 3=Warning, 4=Error |
| `qdb_link_url` | Deep Link URL | Single Line of Text | Max 500; relative URL to portal screen |
| `qdb_is_read` | Is Read | Two Options | Default: false |
| `qdb_read_on` | Read On | Date and Time | Set when is_read → true |
| `qdb_source_entity` | Source Entity Logical Name | Single Line of Text | Max 100; e.g. 'qdb_application' |
| `qdb_source_record_id` | Source Record ID | Single Line of Text | Max 50; GUID of the triggering record |
| `createdon` | Created On | Date and Time | System-managed; used as notification timestamp |

**Ownership:** User-owned (owned by the target contact's owning user)
**Note:** No UPDATE permitted on records where `is_read = true`. No DELETE permitted. Append-only after creation (except the `is_read` / `read_on` transition).

---

### qdb_portal_widget_config

| Logical Name | Display Name | Type | Constraints |
|-------------|-------------|------|-------------|
| `qdb_portal_widget_configid` | Widget Config ID | Unique Identifier (PK) | System-generated GUID |
| `qdb_widget_type` | Widget Type | Single Line of Text | Max 100; matches WidgetDefinition.name |
| `qdb_title_override` | Title Override (EN) | Single Line of Text | Max 200; if blank, use widget's default title |
| `qdb_title_override_ar` | Title Override (AR) | Single Line of Text | Max 200 |
| `qdb_column_span` | Column Span | Whole Number | Min 1, Max 12; default 4 |
| `qdb_row_span` | Row Span | Whole Number | Min 1, Max 6; default 2 |
| `qdb_display_order` | Display Order | Whole Number | Ascending; used for grid layout |
| `qdb_is_visible` | Is Visible | Two Options | Default: true |
| `qdb_config_json` | Widget Config JSON | Multiple Lines of Text | Validated by WidgetDefinition.configSchema |
| `qdb_grid_layout_json` | Grid Layout JSON | Multiple Lines of Text | react-grid-layout layout item JSON for this widget |
| `qdb_portal_config` | Portal Config | Lookup (qdb_portal_config) | Required; N:1 |

**Ownership:** Organization-owned

---

### qdb_cms_content

| Logical Name | Display Name | Type | Constraints |
|-------------|-------------|------|-------------|
| `qdb_cms_contentid` | Content ID | Unique Identifier (PK) | System-generated GUID |
| `qdb_title` | Title (EN) | Single Line of Text | Max 300; required |
| `qdb_title_ar` | Title (AR) | Single Line of Text | Max 300 |
| `qdb_slug` | Slug | Single Line of Text | Max 200; URL-safe; unique per content_type |
| `qdb_content_type` | Content Type | Option Set | 1=Blog Post, 2=News Article, 3=Announcement, 4=Static Page |
| `qdb_body_html` | Body HTML (EN) | Multiple Lines of Text | Tiptap HTML output; no length limit |
| `qdb_body_html_ar` | Body HTML (AR) | Multiple Lines of Text | Tiptap HTML output (RTL) |
| `qdb_hero_image_url` | Hero Image URL | Single Line of Text | Max 500; Azure Blob URL |
| `qdb_category` | Category | Single Line of Text | Max 100 |
| `qdb_tags_json` | Tags JSON | Single Line of Text | Max 500; JSON string array |
| `qdb_status` | Publication Status | Option Set | 1=Draft, 2=Scheduled, 3=Published, 4=Archived |
| `qdb_published_at` | Published At | Date and Time | Set on publish |
| `qdb_scheduled_publish_at` | Scheduled Publish At | Date and Time | Nullable; triggers cron publish |
| `qdb_scheduled_unpublish_at` | Scheduled Unpublish At | Date and Time | Nullable; triggers cron archive |
| `qdb_author` | Author | Lookup (systemuser) | Required |
| `qdb_seo_description` | SEO Meta Description | Multiple Lines of Text | Max 300 |
| `qdb_og_image_url` | Open Graph Image URL | Single Line of Text | Max 500 |
| `qdb_revision_count` | Revision Count | Whole Number | Maintained by NotificationWriteService; max 10 |
| `qdb_portal_config` | Portal Config | Lookup (qdb_portal_config) | Required; N:1 |

**Ownership:** Organization-owned

---

### qdb_cms_revision

| Logical Name | Display Name | Type | Constraints |
|-------------|-------------|------|-------------|
| `qdb_cms_revisionid` | Revision ID | Unique Identifier (PK) | System-generated GUID |
| `qdb_content` | Content | Lookup (qdb_cms_content) | Required; N:1 |
| `qdb_revision_number` | Revision Number | Whole Number | Sequential per content item |
| `qdb_title_snapshot` | Title Snapshot (EN) | Single Line of Text | Max 300 |
| `qdb_title_ar_snapshot` | Title Snapshot (AR) | Single Line of Text | Max 300 |
| `qdb_body_html_snapshot` | Body HTML Snapshot (EN) | Multiple Lines of Text | Full HTML at point of revision |
| `qdb_body_html_ar_snapshot` | Body HTML Snapshot (AR) | Multiple Lines of Text | Full HTML at point of revision |
| `qdb_saved_by` | Saved By | Lookup (systemuser) | Required |
| `createdon` | Created On | Date and Time | System-managed; revision timestamp |

**Ownership:** Organization-owned
**Note:** Revision records are NOT append-only in the strict audit sense — the FIFO deletion of the oldest revision when the count exceeds 10 is permitted. The content entity itself carries the audit trail.

---

## 14. Security Architecture

### Auth Token Flow

```
Web:
  Access token (15 min)  → JWT, HttpOnly cookie, Secure, SameSite=Lax
  Refresh token (7 days) → JWT, HttpOnly cookie, Secure, SameSite=Lax, Path=/api/auth/refresh

Mobile:
  Access token           → expo-secure-store (iOS Keychain / Android Keystore)
  Refresh token          → expo-secure-store, separate key

Dataverse Bearer token:
  Acquired by Fastify msal-node → stored in MSAL in-memory token cache
  Never sent to browser or mobile client
  Scoped to: https://{org}.crm.dynamics.com/.default
```

### CSRF Protection

Auth.js v5 implements CSRF protection via a signed state parameter in OAuth flows and a `csrfToken` on the credentials form. For Fastify API routes called from Next.js Server Actions, the `x-portal-id` + JWT signature provides implicit CSRF protection — cross-origin POSTs cannot include the HttpOnly session cookie.

For standard form submissions in Next.js (non-Server-Action), include the `X-CSRF-Token` header using the Auth.js CSRF token endpoint.

### Rate Limiting

| Endpoint Group | Limit | Window | Action |
|---------------|-------|--------|--------|
| `POST /api/auth/login` | 10 req | 1 min | 429 after limit; 15 min block on 5 consecutive failures |
| `POST /api/auth/register` | 5 req | 1 min | 429 |
| `POST /api/auth/forgot-password` | 5 req | 1 min | 429 |
| `POST /api/auth/verify-otp` | 5 req | 1 min | 429; lock account on 5 failed attempts |
| `POST /api/auth/refresh` | 60 req | 1 min | 429 (generous; multiple tabs) |
| All other authenticated routes | 300 req | 1 min | 429 |

Rate limiting implemented via `@fastify/rate-limit` with an in-memory store. Redis store required if the Fastify API is horizontally scaled (see deployment section).

### Role Model

| Role | Dataverse Security Role | Portal Capabilities |
|------|------------------------|---------------------|
| `Admin` | Portal Admin | All admin routes; portal config editor; CMS editor; nav builder; widget config |
| `User` | Portal User | All authenticated portal routes; own requests only |
| `GuestUser` | Portal Guest | Public CMS content; service listings (read-only); no request submission |

Roles are read from the Auth.js session (populated by `IAuthAdapter.authenticate()` from Dataverse security roles). Role-based nav item visibility is enforced on `GET /api/portal/nav` (server) and re-checked client-side via `usePortalConfig().userRoles`.

### Dataverse Column-Level Security

`qdb_auth_config_json` on `qdb_portal_config` is protected by a Column Security Profile:
- Read: Portal Admin, System Customizer
- Update: System Customizer only
- Create: System Customizer only

This prevents the auth provider credentials (clientId, clientSecret, userflow) from being readable by standard admin users.

### Mobile SecureStore Encryption

`expo-secure-store` uses the platform's native encrypted storage:
- iOS: iOS Keychain with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`
- Android: Android Keystore-backed EncryptedSharedPreferences

Keys used:
- `portal.access_token`
- `portal.refresh_token`
- `portal.biometric_enabled` (boolean)
- `draft-{formCode}` (offline form drafts)

No token is ever written to AsyncStorage, memory-only state, or any non-encrypted store.

### Network Boundaries

```
[Internet] → [CDN (portal config, static assets)] → [Next.js / Vercel]
[Internet] → [Next.js] → [Fastify API] → [Dataverse OData]
[Internet] → [Mobile App] → [Fastify API] → [Dataverse OData]

Dataverse OData is NOT directly exposed to the browser or mobile client.
All OData calls are server-side (Fastify), authenticated with the service principal token.
The browser and mobile client call Fastify routes only.
```

---

## 15. Deployment Architecture

### Docker Containers

```
nextjs-portal:
  Build: Dockerfile in apps/web/
  Base: node:20-alpine
  Port: 3000
  Env: AUTH_SECRET, NEXTAUTH_URL, FASTIFY_API_URL, NEXT_PUBLIC_PORTAL_ID

fastify-api:
  Build: Dockerfile in apps/api/
  Base: node:20-alpine
  Port: 4000
  Env: DATABASE_URL (PostgreSQL session store), MSAL_CLIENT_ID, MSAL_CLIENT_SECRET,
       MSAL_TENANT_ID, DATAVERSE_URL, JWT_SECRET, REDIS_URL (optional; rate limit)

redis-cache (optional):
  Image: redis:7-alpine
  Port: 6379
  Required only if Fastify is horizontally scaled
```

### Environment Variables (Complete List)

**Next.js web app (`apps/web/.env`):**

| Variable | Purpose |
|----------|---------|
| `AUTH_SECRET` | Auth.js session signing secret (32+ bytes, random) |
| `NEXTAUTH_URL` | Portal canonical URL (e.g. https://portal.qdb.qa) |
| `FASTIFY_API_URL` | Internal URL of Fastify API (e.g. http://fastify-api:4000) |
| `NEXT_PUBLIC_PORTAL_ID` | Portal identifier for config loading |
| `NEXT_PUBLIC_APP_ENV` | `development` / `staging` / `production` |

**Fastify API (`apps/api/.env`):**

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (session store) |
| `DATAVERSE_URL` | Dataverse OData endpoint (https://org.crm.dynamics.com) |
| `MSAL_CLIENT_ID` | Azure App Registration client ID |
| `MSAL_CLIENT_SECRET` | Azure App Registration client secret |
| `MSAL_TENANT_ID` | Azure AD tenant ID |
| `MSAL_B2C_TENANT` | B2C tenant name (if using Azure AD B2C adapter) |
| `JWT_SECRET` | Fastify JWT signing secret (matches AUTH_SECRET) |
| `REDIS_URL` | Redis connection string (optional; rate limiting cache) |
| `AZURE_STORAGE_CONNECTION_STRING` | Azure Blob storage for file uploads |
| `AZURE_STORAGE_CONTAINER` | Blob container name |
| `LOG_LEVEL` | pino log level (`info` in production, `debug` in dev) |
| `PORT` | Fastify listen port (default 4000) |
| `CORS_ORIGIN` | Allowed CORS origin(s) |

**Mobile (`apps/mobile/.env`):**

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_API_URL` | Fastify API base URL |
| `EXPO_PUBLIC_PORTAL_ID` | Portal identifier |
| `EXPO_PUBLIC_APP_ENV` | Environment name |

### GitHub Actions Pipelines

**Web CI/CD (`.github/workflows/web.yml`):**

```
Trigger: push to main, PR to main

Jobs:
  lint-typecheck:
    - pnpm turbo run lint typecheck --filter=web
  test:
    - pnpm turbo run test --filter=web --filter=api
  build:
    - pnpm turbo run build --filter=web
  docker-build-push:
    - docker build -t nextjs-portal:${{ github.sha }}
    - docker push to registry
  deploy-staging:
    - SSH/kubectl apply staging manifest
  deploy-production:
    - Manual approval gate
    - kubectl apply production manifest
```

**Mobile EAS Build (`.github/workflows/mobile.yml`):**

```
Trigger: push to main (manual trigger for production)

Jobs:
  eas-build-staging:
    - eas build --profile staging --platform all --non-interactive
    - eas update --channel staging  (OTA update)
  eas-submit-production:
    - Manual approval gate
    - eas build --profile production --platform all --non-interactive
    - eas submit --platform ios
    - eas submit --platform android
```

**EAS Build Profiles (`apps/mobile/eas.json`):**

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": { "EXPO_PUBLIC_APP_ENV": "development" }
    },
    "staging": {
      "distribution": "internal",
      "env": { "EXPO_PUBLIC_APP_ENV": "staging" }
    },
    "production": {
      "distribution": "store",
      "env": { "EXPO_PUBLIC_APP_ENV": "production" }
    }
  }
}
```

### CDN Strategy

Portal config (`GET /api/portal/config`) is served via Next.js `unstable_cache` with a 5-minute TTL. The CDN (Cloudflare or Azure CDN) caches the Next.js rendered response for `/api/portal/config?portalId=qdb` with:

- `Cache-Control: public, max-age=300, stale-while-revalidate=60`
- Cache purge triggered by the admin portal config save endpoint via CDN API call

Static assets (logos, favicons, hero images) are served from Azure Blob with 1-year CDN cache (`Cache-Control: public, max-age=31536000, immutable`).

---

## 16. Phased Delivery Plan

### Track A — Web Portal (Weeks 1–8)

| Week | Deliverable | BRD Requirements |
|------|------------|-----------------|
| 1 | Monorepo setup, shared packages scaffold, Docker baseline, CI pipeline | Infrastructure |
| 1–2 | Auth.js v5 + IAuthAdapter interface + Custom Credential adapter | AUTH-001–010 |
| 2–3 | Portal config loading, branding, FluentProvider theme, RTL middleware | PC-001–010, RTL-001–004 |
| 2–3 | Navigation — sidebar + top-nav, role filtering, badge polling | NAV-001–009 |
| 3 | Header — entity switcher, notification bell shell, user avatar | HDR-001–008 |
| 3–4 | Dashboard shell + react-grid-layout + widget registry + 5 built-in widgets | DASH-001–008 |
| 4–5 | Services listing, service detail, Apply Now → DFE form bridge | SRV-001–006 |
| 5–6 | My Requests list + detail + status timeline | SRV-007–008 |
| 6 | Notification polling (TanStack Query), mark read, panel | NOTIF-001–005 |
| 6–7 | Azure AD B2C adapter + Entra External ID adapter | AUTH-002, AUTH-003 |
| 7 | File upload (react-dropzone → Azure Blob) | SRV-009 |
| 7–8 | Admin screens (portal config, nav builder, widget config) | PC-001–010, NAV-001 |
| 8 | RTL QA pass — all pages verified in ar locale | RTL-001–008 |

Track A auth API stable milestone: end of Week 3. Track B may begin at Week 4.

### Track C — CMS (Weeks 2–7, concurrent with Track A)

| Week | Deliverable | BRD Requirements |
|------|------------|-----------------|
| 2 | qdb_cms_content + qdb_cms_revision Dataverse entities, CMS Fastify routes | CMS-001, CMS-009 |
| 3–4 | Tiptap editor integration, EN/AR body fields, image upload | CMS-002–004 |
| 4–5 | Admin CMS editor — create, edit, preview, publish | CMS-003 |
| 5 | Scheduled publish/unpublish (CmsScheduleService cron) | CMS-011 |
| 6 | Revision history — list revisions, roll back | CMS-012 |
| 6–7 | News/Blog listing page + article detail (SEO, Open Graph) | CMS-005–006 |
| 7 | Announcements widget wired to built-in announcements widget | CMS-007 |
| 7 | Static pages (configurable routes, footer links) | CMS-008 |

### Track B — Mobile (Weeks 4–12, starts after Track A Week 3 auth API stable)

Track B depends on Track A for:
- `POST /api/auth/login` + `POST /api/auth/refresh` + `POST /api/auth/logout` (Week 3)
- `GET /api/notifications` + `PATCH /api/notifications/:id/read` (Week 6)
- `GET /api/services` + `GET /api/services/my-requests` (Week 5)
- `GET /api/cms/content` (Week 4)

| Week | Deliverable | BRD Requirements |
|------|------------|-----------------|
| 4–5 | Expo SDK 53 setup, EAS Build baseline, expo-router scaffold | MOB-001–002 |
| 5 | Auth flow — expo-auth-session, token store, Custom adapter | MOB-005–006 |
| 5–6 | Azure AD B2C + Entra SSO on mobile | MOB-005–006 |
| 6 | Biometric login (expo-local-authentication) | MOB-005 |
| 6–7 | Dashboard (native card layout, equivalent widgets) | MOB-013 |
| 7 | Services listing + detail + Apply Now (native DFE form) | MOB-014 |
| 7–8 | My Requests list + detail + status timeline | MOB-013 |
| 8 | Push notification registration + expo-notifications | MOB-007 |
| 8–9 | Deep links from push notification taps | MOB-011 |
| 9 | Offline draft sync (expo-secure-store) | MOB-009 |
| 9–10 | File upload — camera + gallery + document picker | MOB-010 |
| 10 | News/Blog read view | MOB-016 |
| 10 | Messages thread view | MOB-015 |
| 10–11 | Arabic RTL — I18nManager.forceRTL, ar-QA formatting | MOB-017, RTL-008 |
| 11 | RTL testing on real Arabic-locale iOS and Android devices (CEO condition 3) | RTL-008 |
| 12 | OTA update config (expo-updates), EAS Build production profiles | MOB-018–019 |

---

## Skeptic Review

> CHALLENGE 1 — Auth Dual-Library: The Auth.js v5 + MSAL pairing is architecturally clean on paper, but the OBO (on-behalf-of) token exchange requires the user's identity token from Auth.js to be passed to the MSAL `acquireTokenOnBehalfOf` call. If Auth.js rotates its signing key or the user token shape changes between next-auth versions, the MSAL OBO call will silently fail and every Dataverse query will 401. What is the token hand-off contract, and where is it tested?

> CHALLENGE 2 — Refine Version Lock: Refine v5 is in active development. `@refinedev/core@^4` with a caret allows minor version bumps. Refine's OData data provider contract (`getList`, `create`, etc.) is not covered by semver guarantees across major versions. If Refine v5 ships and has breaking OData provider changes, the portal is stuck on v4 with no upgrade path until someone rewrites the shell. Consider pinning to an exact Refine version (`4.x.x`) and tracking the Refine changelog as a sprint task.

> CHALLENGE 3 — Dataverse as Session Store: The architecture uses PostgreSQL only for session/notification cache, and Dataverse as the primary record store. But every Fastify API request needs a Dataverse Bearer token from MSAL. If Dataverse is unavailable (Azure CRM outage), the portal is completely non-functional — not degraded, completely dead. The notification cache in PostgreSQL is never populated because Fastify writes to Dataverse, not to PostgreSQL, for notifications. There is no read fallback. Is a 5-minute config cache in memory enough to serve degraded read-only mode, or do we need a proper PostgreSQL cache layer for at least portal config and nav items?

> CHALLENGE 4 — Widget Registry Singleton in Next.js: The `globalThis` cache pattern for the widget registry in Next.js development mode is fragile. Next.js App Router runs server code in multiple worker threads, and the `globalThis` is per-thread — a widget registered in one request might not be visible in another. The registry must be populated at module import time, not lazily, and the import side-effects must be stable across hot module replacement. Has this been validated against Next.js's concurrent rendering model?

> CHALLENGE 5 — expo-notifications + EAS Build Constraint: The BRD says the mobile app uses Expo managed workflow (MOB-002). SDK 53 breaks push notifications in Expo Go — a dev build is required. Every mobile developer must have an EAS account and run `eas build --profile development` before they can test push notifications. This is a day-one developer experience problem. Is the team aware, and is there a local prebuild fallback (`expo prebuild --clean`) documented in the mobile README?

> CHALLENGE 6 — CMS Schedule Cron Reliability: The `CmsScheduleService` cron runs inside the Fastify process every 60 seconds. If the Fastify container restarts at 02:00:59 and the scheduled publish was at 02:01:00, the publish is missed until the next cron tick after the container restarts. For a CMS with guaranteed publish times, a missed publish window is an editorial incident. Consider whether a Power Automate scheduled flow is more appropriate here — it has guaranteed execution independent of the Fastify container lifecycle.

> CHALLENGE 7 — RTL Physical Class Enforcement: The ESLint rule `no-physical-tailwind-classes` is described but not named as an existing package. As of mid-2026, no widely-adopted published ESLint rule for Tailwind logical property enforcement exists. This means the team must write a custom ESLint rule. That is a non-trivial engineering task. What is the fallback enforcement mechanism if the rule is not ready before frontend development begins?

> CHALLENGE 8 — qdb_portal_notification Append-Only Contradiction: The schema notes say "No UPDATE or DELETE permitted" on notifications except for the `is_read` / `read_on` transition. But the "mark all as read" requirement (NOTIF-005) requires a bulk UPDATE. Dataverse OData does not support bulk UPDATE in a single API call — it requires multiple PATCH requests or an Action. At 50 unread notifications, that is 50 sequential PATCH calls. At 3am with slow Dataverse response, this blocks the UI. A batch API ($batch) or a custom Dataverse Action should be considered.

> CHALLENGE 9 — Portal Config CDN Cache Invalidation: The design calls for CDN cache purge triggered by the admin save endpoint "via CDN API call." This is a synchronous call to an external CDN API inside the save request. If the CDN API is slow or returns a 503, does the admin save fail? Does it retry? Is there a fallback that allows the save to succeed and the CDN purge to fail gracefully (with a warning to the admin)?

> CHALLENGE 10 — Track B Dependency on Track A Week 3: The Track B start is gated on Track A's auth API being stable at Week 3. But auth is the most commonly delayed feature in any portal — provider registration, app registrations in Entra, redirect URI whitelisting, and B2C user flow configuration are all external dependencies. If the Azure AD B2C adapter is not ready until Week 5, Track B loses two weeks. The delivery plan has no buffer for external identity provider delays.

> CHALLENGE 11 — Simplicity Check: The architecture introduces Auth.js v5, MSAL, Refine (headless), @refinedev/odata, TanStack Query, react-grid-layout, Tremor, Tiptap, next-intl, Fluent UI v9, react-dropzone, and a custom widget registry — all in the same project. Each library is individually justified, but the combined dependency surface is very large. A senior developer joining this project faces a steep ramp-up. Is there a simpler architecture that achieves 80% of the functionality with 50% of the dependencies? The Custom Credential adapter alone (without B2C and Entra) would eliminate the MSAL complexity entirely for the first delivery.

These challenges must be addressed before Phase 4 begins.
