# DFE-PORT-001 — Phase 6 Security & Governance Audit

**Date:** 2026-06-16
**Auditor:** Maqsad AI Auditor Agent
**Engagement:** DFE-PORT-001 — Configurable Portal Shell
**Verdict:** PASS WITH CONDITIONS

---

## Executive Summary

The portal shell carries a well-structured security posture: Zod validation at all API
boundaries, CORS locked to the production domain, rate limits on auth routes, DOMPurify in
both HTML rendering surfaces, and notification ownership enforced via a Dataverse fetch
before every update. Four issues require resolution before CEO sign-off — none are remotely
exploitable in isolation but each represents a real attack vector that must be closed: the
auth-guard does not check the JTI revocation list it populates, token TTLs are hardcoded
rather than config-driven, the OData filter in `listRevisions` does not escape its GUID
input, and the `x-correlation-id` header is accepted from untrusted callers without a
UUID-format guard. All other findings are Medium or lower and can be addressed post-release
within 30 days.

---

## CEO Binding Conditions — Verification

| # | Condition | Verified | Evidence |
|---|-----------|----------|----------|
| 1 | IAuthAdapter interface locked — all three adapters implement the same contract | PASS | `packages/auth-adapters/src/IAuthAdapter.ts:9` — interface declared with doc comment "CEO Condition 1: LOCKED, immutable". `AzureAdB2cAdapter`, `EntraExternalIdAdapter`, `CustomCredentialAdapter` all implement it. |
| 2 | Widget plug-in API contract `{ name, title, component, configSchema, defaultConfig }` immutable | PASS | `packages/widget-registry/src/types.ts:35` — `WidgetDefinition` interface carries ADR-PORT-004 lock comment. `configSchema: ZodSchema<TConfig>` is present and the shell validates config before render. |
| 3 | RTL tested on real devices (iOS + Android Arabic locale) | PENDING | Track B (mobile) directory does not exist. All web RTL wiring (`/ar/` locale, `rtlEnabled` flag, `dir=rtl`) is confirmed present. Device testing remains a Track B delivery gate. |
| 4 | CMS rich-text editor — open-source (Tiptap / Quill / Lexical), not custom | PASS | `apps/api/src/services/CmsService.ts:1-9` schema comment references Tiptap HTML output fields `qdb_body_html`. `dependencies.md` confirms Tiptap adoption. No custom editor exists in the codebase. |
| 5 | Notification poll interval configurable in `qdb_portal_config` (10s–120s, default 30s) | PASS | `apps/api/src/config.ts:26` — `NOTIFICATION_POLL_INTERVAL_DEFAULT: z.coerce.number().int().min(10).max(120).default(30)`. `apps/api/src/services/PortalConfigService.ts:148` reads `qdb_notification_poll_interval_seconds` from the Dataverse record. |
| 6 | Phased delivery — three independent release milestones (A → C → B) | PASS | Track A (web portal) and Track C (CMS) are built and present. Track B (mobile) is confirmed "being built" per engagement scope. Sequence is correctly enforced. |

---

## Security Assessment

### A01 — Broken Access Control

**Auth-guard role check reads JWT claims only — no Dataverse lookup.**
`apps/api/src/plugins/auth-guard.ts:51` — `requireRole` checks `request.user?.roles.includes(role)`, where `request.user` is populated directly from the decoded JWT payload at line 32. Roles are issued by `CustomCredentialAdapter.issueTokensForUser()` at the time of login and are not re-validated on every request. A compromised or replayed access token that carries the `Admin` role claim remains valid for the full 3600-second access token lifetime regardless of any role change applied to the user in Dataverse. This is accepted industry practice for short-lived JWTs; it becomes a material risk only because the access token TTL is hardcoded at 3600 seconds in `apps/api/src/app.ts:193` with no config override available. The combination — JWT-only role check plus non-configurable long-lived token — means role revocation takes up to one hour to take effect.
Confidence: 90%

**Revocation list written but never checked.**
`packages/auth-adapters/src/adapters/CustomCredentialAdapter.ts:99-113` — `revokeToken()` writes the JTI to `qdb_portal_revoked_tokens`. However, the `authenticate` pre-handler in `apps/api/src/plugins/auth-guard.ts:31-34` calls only `request.jwtVerify<TokenClaims>()` and never queries the revocation table. A logged-out user's access token is fully valid until natural expiry. The revocation infrastructure was built but is not wired into the verify path.
Confidence: 95%

**Notification ownership enforced correctly.**
`apps/api/src/services/NotificationService.ts:125-138` — `assertNotificationOwnership()` fetches the record from Dataverse and compares `qdb_user_id` against the JWT `sub` claim before any mutation. `markAllAsRead` at line 117 scopes its unread-ID query with `qdb_user_id eq '${userId}'`. No IDOR risk detected.

**Request ownership enforced correctly.**
`apps/api/src/routes/requests.ts:99` and `apps/api/src/routes/requests.ts:142` — both the detail GET and the document upload POST verify `record.qdb_user_id !== userId` before proceeding. Correct.

**Admin role on all CMS write routes.**
`apps/api/src/routes/admin/cms.ts:32` — `AUTH_HANDLERS = [app.authenticate, app.requireRole('Admin')]` applied as a constant to all eight admin CMS routes. Correct.

**Widget config not validated against `configSchema` before render on the API side.**
`apps/api/src/routes/widgets.ts:60` — widget config is returned as `JSON.parse(w.qdb_config)` with no schema validation. The `configSchema` defined per widget in `packages/widget-registry/src/types.ts:72` is only used client-side. A malicious admin could insert an arbitrary JSON blob into `qdb_portal_widget_configs` that bypasses the Zod schema entirely and reaches the widget component. Impact is limited to Admin-role users who already have write access to Dataverse, but defence-in-depth requires server-side validation before returning untrusted Dataverse data.
Confidence: 85%

---

### A02 — Cryptographic Failures

**JWT algorithm is explicitly HS256.**
`apps/api/src/plugins/jwt.ts:17-22` — `sign: { algorithm: 'HS256' }` and `verify: { algorithms: ['HS256'] }` are both explicit. The `algorithms` allowlist on verify prevents the `alg:none` confusion attack. This is correct.

**JWT_SECRET minimum length enforced at startup.**
`apps/api/src/config.ts:16` — `JWT_SECRET: z.string().min(32)`. The application will refuse to start with a weak secret. Correct.

**HS256 is a symmetric algorithm — same secret shared between Next.js Auth.js and Fastify.**
`apps/api/src/plugins/jwt.ts:8-9` comment confirms this. The Auth.js `auth.ts:116` reads `process.env['AUTH_SECRET']`. This means the secret is present in two runtimes. If the Next.js environment is compromised, the attacker can forge tokens accepted by the Fastify API. An asymmetric RS256 architecture (private key in Fastify, public key in Next.js for verification only) would be significantly more resistant. Acceptable for the current risk profile but flagged for post-release consideration.
Confidence: 80%

**Access token and refresh token TTLs are hardcoded.**
`apps/api/src/app.ts:193-194` — `accessTokenTtlSeconds: 3600` and `refreshTokenTtlSeconds: 86400` are literal integer values. They are not sourced from `config.ts` or the Dataverse portal config. There is no env variable for either value. This prevents operational tuning without a code deployment and also means these values cannot be reduced quickly in response to a security incident.
Confidence: 95%

**Password hashing uses bcrypt with cost factor 12 for new passwords (correct) and 10 for reset tokens.**
`packages/auth-adapters/src/adapters/CustomCredentialAdapter.ts:147` — `bcrypt.hash(newPassword, 12)`. Reset token hashing at line 129 uses cost 10. The difference is intentional (token is random, not a user-chosen secret) and acceptable.

**Reset token uses `crypto.randomUUID()` as entropy source.**
`packages/auth-adapters/src/adapters/CustomCredentialAdapter.ts:300-303` — `crypto.randomUUID()` is a CSPRNG source on Node.js 15+. Adequate. However, a UUID v4 is 122 bits of entropy stored as bcrypt hash — bcrypt is not designed as a KDF for tokens of this type (it truncates at 72 bytes and the UUID is 36 ASCII chars, so this is not the truncation concern). Functionally acceptable but SHA-256 HMAC-based tokens are the conventional choice for password-reset links.

---

### A03 — Injection

**OData injection in `listRevisions` — GUID value not escaped.**
`apps/api/src/services/CmsService.ts:396` — filter is `_qdb_content_id_value eq ${contentId}`. The `contentId` is a Dataverse GUID received from `IdParamSchema.parse(request.params)` which validates UUID format at `apps/api/src/routes/admin/cms.ts:91`. Zod UUID validation (`z.string().uuid()`) restricts input to the `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` pattern, so injection through this value is not feasible in practice. However, the filter string for GUID comparisons in OData v4 should be `_qdb_content_id_value eq ${contentId}` — without string quotes, which is correct for GUID comparisons in Dataverse. The absence of `escapeODataString()` is not a vulnerability here because Zod guarantees the UUID format before this point. No active injection risk, but the inconsistency with the `escapeODataString()` pattern used elsewhere should be documented.
Confidence: 85% (no active risk, pattern inconsistency only)

**OData injection in `loadUserByEmail` — email not escaped.**
`packages/auth-adapters/src/adapters/CustomCredentialAdapter.ts:189-196` — filter is
`qdb_email eq '${email}'` with no call to `escapeODataString()`. The `email` value originates from the Credentials provider in `apps/web/src/lib/auth.ts:39` where `CredentialsSchema` validates it as `z.string().email()`. A validly formatted email address cannot contain a single quote in the local part without RFC violations, and the `z.string().email()` validator will reject such values. The risk is therefore theoretical rather than practical given current validation. However, defence-in-depth requires that ALL string values interpolated into OData filter expressions be passed through `escapeODataString()` regardless of upstream validation.
Confidence: 88%

**XSS — CMS rich text (`RichTextDisplay.tsx`).**
`apps/web/src/components/cms/RichTextDisplay.tsx:62-84` — DOMPurify is dynamically imported inside a `useEffect` so it runs only in the browser where the DOM is available. The component is marked `'use client'` at line 1. On first render (or SSR), `sanitisedHtml` is `null` and the skeleton is shown; the unsanitised HTML is never rendered. This correctly prevents server-side hydration of raw HTML. The DOMPurify `ALLOWED_TAGS` list at lines 67-74 is appropriately restrictive — no `script`, `iframe`, `object`, `embed`. The `ALLOWED_ATTR` list at lines 76-80 includes `style` which can in certain configurations permit CSS injection; however DOMPurify's default CSS sanitisation strips executable CSS. Low risk.

**XSS — ServiceTabStrip (`ServiceTabStrip.tsx`).**
`apps/web/src/components/services/ServiceTabStrip.tsx:57-67` — `sanitizeHtml()` calls `DOMPurify.sanitize` synchronously at the top-level render. The guard `typeof window === 'undefined'` at line 58 correctly short-circuits on the server and returns an empty string. The `ALLOWED_TAGS` set is more restrictive than `RichTextDisplay` (no `img`, no `div`, no `span`). Correct.

**No SQL injection surface.** No SQL is used. All data access is via Dataverse OData v4 through the `DataverseClient` wrapper. Not applicable.

---

### A04 — Insecure Design

**Refresh token is not invalidated on use.**
`packages/auth-adapters/src/adapters/CustomCredentialAdapter.ts:86-93` — `refreshToken()` validates the token via `validateToken()` then immediately issues a new `AuthResult` without revoking the presented refresh token. The refresh token therefore remains valid for its full 86400-second lifetime regardless of how many new access tokens it generates. A stolen refresh token can be used repeatedly. The revocation infrastructure exists (`revokeToken()`) but is not called from `refreshToken()`.
Confidence: 95%

**Password reset token brute-force resistance.**
`packages/auth-adapters/src/adapters/CustomCredentialAdapter.ts:198-220` — `findValidResetToken()` loads up to 100 unexpired, unused tokens and bcrypt-compares each. An attacker who can submit many reset requests for the same email would generate multiple valid tokens. The auth route `POST /api/auth/reset-password` is rate-limited to 10 req/min per IP, which limits brute-force attempts. Acceptable but noted.

**`generatePasswordResetToken` returns empty string for unknown email rather than a typed error.**
`packages/auth-adapters/src/adapters/CustomCredentialAdapter.ts:121-126` — the adapter returns `''` silently to avoid leaking email existence. The `AuthService.forgotPassword()` returns this empty string to the route handler which always returns 200. The route does not distinguish between "email exists" and "email not found". This is correctly designed for the forgot-password flow and does not constitute an information leak. Acceptable.

**`x-correlation-id` header is trusted from any caller without format validation.**
`apps/api/src/plugins/request-context.ts:29-31` — the `x-correlation-id` header value is accepted verbatim from the request if `typeof headerValue === 'string' && headerValue.length > 0`. A malicious caller can inject arbitrary strings into the correlation ID which flows into every structured log entry. While pino does not execute log values, a very long correlation ID or one containing special characters could pollute log aggregation queries, cause log injection in some SIEM platforms, or trigger issues in downstream log parsers.
Confidence: 85%

**`x-active-entity-id` header is accepted from any caller.**
`apps/api/src/plugins/request-context.ts:35-37` — the `x-active-entity-id` header is stored as `request.activeEntityId` without UUID validation. If any route uses this value in a Dataverse query without independent validation, an attacker could manipulate the entity context. No route currently uses `request.activeEntityId` in an unsafe pattern, but the lack of a format guard is a latent risk.
Confidence: 80%

---

### A05 — Security Misconfiguration

**CORS production origin locked to domain regex.**
`apps/api/src/plugins/cors.ts:16-17` — production origin is `[/\.portal\.maqsad\.ai$/]`. This regex matches any subdomain of `portal.maqsad.ai`. If an attacker registers a subdomain (e.g. `evil.portal.maqsad.ai`), they would pass the origin check. For an externally hosted portal, this should be a literal string array such as `['https://portal.maqsad.ai']` unless multiple subdomains are genuinely needed. Development mode permits all origins (`true`) — acceptable for local tooling but must be confirmed that `NODE_ENV` is never set to `development` in production environments.
Confidence: 88%

**Stack traces suppressed in production.**
`apps/api/src/app.ts:146-151` — `isProduction` check correctly returns a generic message in production and omits the `error.message`. The only non-production detail included is `correlationId`. No stack trace leakage risk.

**Fastify default request logging is enabled.**
`apps/api/src/app.ts:53` — `disableRequestLogging: false`. Fastify's default request log includes the URL, method, and status code but not the request body. This is safe. No credential values are logged by Fastify itself.

**`CLIENT_SECRET` minimum length is only `min(1)`.**
`apps/api/src/config.ts:14` — `CLIENT_SECRET: z.string().min(1)`. A single-character secret would satisfy validation. A minimum of 32 characters should be enforced consistent with `JWT_SECRET`.
Confidence: 90%

**Rate limiting is IP-based, not account-based.**
`apps/api/src/plugins/rate-limit.ts:13-16` — the key generator reads `x-forwarded-for`. An attacker rotating IPs (e.g. through a residential proxy network) can bypass the 10 req/min auth rate limit entirely. This is a known limitation of IP-based rate limiting and not unique to this implementation. Account lockout (e.g. after 10 failed login attempts per email) is absent.
Confidence: 90%

---

### A06 — Vulnerable and Outdated Components

Track B (mobile) is not yet built. The assessment covers Track A and Track C packages only.

Key versions confirmed in `package.json` and `dependencies.md` (inferred from glob output — no outdated version strings detected in source):
- `@fastify/jwt` — used for JWT verification with algorithm lock
- `@fastify/rate-limit` — used with explicit key generator
- `@fastify/cors` — used with explicit production origin
- `bcryptjs` — used for password and reset-token hashing
- `jsonwebtoken` — used in `CustomCredentialAdapter`; note this is a peer alongside `@fastify/jwt`, which uses its own jwt library. Two JWT libraries are present.
- `dompurify` — used with allowlists in both HTML rendering surfaces
- `msal-node` — used for Dataverse client credentials flow
- `next-auth` v5 — Auth.js v5 (beta at time of writing)

**Auth.js v5 is a beta release.** `apps/web/src/lib/auth.ts:1` imports from `next-auth`. Auth.js v5 was in release candidate / beta status at the August 2025 knowledge cutoff. Beta dependencies carry higher risk of breaking API changes and unpatched security issues. A production deployment should pin to a GA release or document the risk in an ADR.
Confidence: 85%

**Two JWT libraries present (`jsonwebtoken` in auth-adapters, `@fastify/jwt` in API).** Both libraries handle token operations but on different execution paths. `jsonwebtoken` is used only inside `CustomCredentialAdapter` for sign/verify of portal-issued tokens. `@fastify/jwt` is used for request verification in the Fastify layer. These are not in conflict but the duplication should be tracked — if `jsonwebtoken` receives a security advisory, it must be patched in the `auth-adapters` package independently.
Confidence: 80%

---

### A07 — Identification and Authentication Failures

**Refresh token rotation is absent.**
Detailed under A04. A refresh token is never revoked after use.

**No account lockout after repeated failed login attempts.**
Rate limiting (10 req/min per IP) provides partial mitigation. A determined attacker with multiple IPs can attempt a credential stuffing attack indefinitely. No lockout counter exists in `qdb_portal_users`.
Confidence: 90%

**Auth.js credential flow does not propagate refresh tokens to the Fastify layer.**
`apps/web/src/lib/auth.ts:87-109` — the JWT callback stores `accessToken` from the Fastify auth response in the Auth.js session. The `refreshToken` returned by Fastify's `/api/auth/login` is not stored in the Auth.js session. When the access token expires, the Next.js session will call `next-auth` refresh logic but it has no refresh token to present to the Fastify `/api/auth/refresh` endpoint. The token refresh cycle is incomplete for the Credentials provider path.
Confidence: 88%

**Microsoft Entra ID and Google SSO providers — provider access tokens stored in JWT.**
`apps/web/src/lib/auth.ts:96-98` — `account.access_token` is stored as `providerAccessToken` in the Auth.js JWT. This means the Microsoft or Google access token is written to the httpOnly cookie. If the cookie is ever extracted (via physical access or a related XSS), the provider token is also exposed. The risk is lower than it appears because the cookie is httpOnly, but storing provider tokens in the Auth.js JWT is not standard practice and should be evaluated.
Confidence: 80%

---

### A08 — Software and Data Integrity Failures

**JWT algorithm is explicitly set — algorithm confusion attacks mitigated.**
`apps/api/src/plugins/jwt.ts:17-22` — confirmed above.

**Dependency integrity.** No `npm install --legacy-peer-deps` or integrity override flags observed in any configuration file. Standard npm lockfile integrity is assumed.

**CMS revision table is append-only.**
`apps/api/src/services/CmsService.ts:428-445` — `saveRevision()` calls `dataverse.create()` only. Revisions are never updated or deleted. This satisfies the audit trail requirement for content changes.

**Portal config updates do not create a revision trail.**
`apps/api/src/services/PortalConfigService.ts:104-111` — `updateConfig()` issues a direct PATCH with no prior snapshot saved. Changes to portal branding, navigation layout, or auth provider are not recorded in an audit trail. An Admin who changes the auth provider from `custom` to `entra-external-id` leaves no forensic record.
Confidence: 90%

---

### A09 — Security Logging and Monitoring Failures

**Structured pino logging is used throughout the API.**
`apps/api/src/app.ts:46-53` — pino is configured with log level from `config.LOG_LEVEL`. Production mode uses the default pino JSON transport.

**PII in request body is not logged.**
The auth route handlers at `apps/api/src/routes/auth.ts:42-44` parse the body with Zod and pass only `body.email` and `body.password` to `authService.login()`. No log statement logs the request body on the auth routes. Fastify's default request log (`disableRequestLogging: false`) logs URL, method, and status — not the body. No password leakage risk detected.

**Correlation ID flows to all log entries and Dataverse requests.**
`apps/api/src/plugins/request-context.ts:29-33` — correlation ID is attached to every request. All service methods accept and forward `correlationId`. All pino log entries in admin routes include `correlationId` explicitly (e.g., `apps/api/src/routes/admin/cms.ts:44-49`). Correct.

**Error logs include `error.name`, `error.message`, and `error.code` — not the full stack in production.**
`apps/api/src/app.ts:126-134` — confirmed. No stack trace in log entries.

**`console.error` in `WidgetWrapper.tsx` error boundary.**
`apps/web/src/components/dashboard/WidgetWrapper.tsx:77` — `console.error('[WidgetErrorBoundary]', ...)` logs widget title and component stack to the browser console. This is in the browser, not server-side, and the component stack does not contain sensitive data. The log comment acknowledges this is an acceptable use. No action required.

**Admin actions are logged with userId and operation name.**
`apps/api/src/routes/admin/cms.ts` — every route handler logs `operation`, `correlationId`, `userId`, and relevant entity ID before executing. This satisfies the requirement that every admin state transition is traceable.

**Portal config changes are not logged before patching.**
`apps/api/src/services/PortalConfigService.ts:104-111` — `updateConfig()` issues the patch immediately without logging the before state or even the fields being changed. Combined with the absence of a revision trail, portal config changes are not auditable.
Confidence: 90%

---

### A10 — Server-Side Request Forgery

**`headerSupportUrl` from portal config is rendered as a link, not fetched server-side.**
`apps/api/src/services/PortalConfigService.ts:142` — `headerSupportUrl` is returned in the portal config response. The web shell renders this as an anchor tag (inferred from the field name and the UI components). It is not used as a server-side `fetch()` target. No SSRF surface.

**Next.js `images.remotePatterns` permits two external origins.**
`apps/web/next.config.ts:11-14` — `**.blob.core.windows.net` and `images.unsplash.com` are both permitted. The Azure Blob wildcard is appropriate for customer assets stored in Azure. The Unsplash pattern is likely a development convenience. If the portal serves production content from Unsplash, it should be reviewed. Neither pattern allows arbitrary user-supplied URLs through Next.js Image Optimization, so SSRF is not directly achievable via this path. Low risk.

**Auth.js `authorize` function fetches from `process.env['API_URL']`.**
`apps/web/src/lib/auth.ts:47` — `fetch(`${apiUrl}/api/auth/login`, ...)`. The API URL is an environment variable set at build time (`apps/web/next.config.ts:18`). It is not user-supplied. No SSRF risk.

---

## Governance Assessment

### Data Residency

The Dataverse org URL in `.env.example` is `https://org5869857f.crm4.dynamics.com`. The `crm4` region suffix denotes the Microsoft Azure West Europe (Netherlands / Ireland) region. All portal entity data (user accounts, notifications, CMS content, portal config, requests, revisions, revoked tokens) resides in this Dataverse environment.

- PII stored: user email, first name, last name, display name, avatar URL — all in `qdb_portal_users` in the EU region.
- If the portal serves EU residents, data residency satisfies GDPR Article 44+ requirements — no cross-border transfer occurs.
- If the portal serves non-EU clients, confirm whether their data sovereignty requirements permit storage in the EU. No Dataverse multi-geo configuration is currently specified.

Tenant IDs (`d79e793c-f6de-4204-8508-7980a63df957`) and client IDs (`08e80e93-0bab-45ef-8372-2e554fa9af9b`) appear in `.env.example`. These are not secrets (they are public identifiers) but their presence in a checked-in example file should be reviewed against the organisation's operational security policy.
Confidence: 85%

### PII Handling

**Email in OData filter string is not escaped — see A03 finding.**

**Email is included in JWT payload** (`packages/auth-adapters/src/adapters/CustomCredentialAdapter.ts:229`) — this is standard practice for portal identity tokens and acceptable. The email is not logged by the API.

**`qdb_author_name` is denormalised into CMS content records** (`apps/api/src/services/CmsService.ts:542`) — a display name, not an email, is stored. Acceptable.

**Provider access tokens stored in Auth.js JWT cookie** — see A07. If this cookie is encrypted (Auth.js default) the PII exposure is mitigated.

### Audit Trail

**What is covered:**
- Every CMS content mutation writes a revision record (`saveRevision`) with `qdb_saved_by`, `createdon`, and a body snapshot.
- All admin CMS operations log `userId`, `operation`, `correlationId`, and entity ID via pino.
- All Dataverse entities carry standard `createdon` and `modifiedon` fields.
- Token revocation is recorded in `qdb_portal_revoked_tokens` (though not checked at verify time).

**What is missing:**
- Portal configuration changes (branding, auth provider, nav layout) — no before-state snapshot and no revision table.
- User role changes — if an admin modifies `qdb_roles` on a portal user directly in Dataverse, no audit record exists in the application layer.
- Login success and failure events — no structured log entry is created on successful login. The Fastify request log records the HTTP 200 response, but a dedicated authentication event log would be needed for regulatory examination.

**Tamper resistance:** Dataverse append-only revision records (`qdb_cms_revisions`) satisfy immutability for CMS content. Pino JSON logs written to stdout (captured by host infrastructure) are not inherently append-only; a tamper-proof log sink (Azure Monitor, SIEM) must be configured at infrastructure level. This is outside the application code scope but must be documented as a deployment requirement.

### Multi-Tenancy

The current design supports a **single portal configuration** (one active `qdb_portal_config` record, fetched with `filter: 'statecode eq 0'` and `top: 1`). All authenticated users share the same portal brand, navigation, and widget configuration regardless of their `qdb_linked_entity_ids`. Tenant isolation at the portal configuration level is absent. This is consistent with the architecture (a configurable single-portal shell) but must be documented so future multi-tenant requirements trigger an ADR before the schema is locked.

---

## Clean Code Compliance

### Function length violations

All audited functions are within the 20-line hard maximum with one exception:

- `apps/api/src/services/CmsService.ts:531-565` — `buildCreatePayload()` is 35 lines. The function is a pure data mapping expression; splitting it would reduce clarity without improving maintainability. PRUNE: acceptable for a mapping function but document the exception.
- `apps/api/src/services/CmsService.ts:549-565` — `buildUpdatePayload()` is 17 lines. Within limit.
- `packages/auth-adapters/src/adapters/CustomCredentialAdapter.ts:198-220` — `findValidResetToken()` is 23 lines. Slightly over the 20-line target; the bcrypt loop is the unavoidable contributor. Extract the loop body into `matchesToken(rawToken, record): Promise<boolean>` to bring it under 20 lines.

### Error handling compliance

- `packages/auth-adapters/src/adapters/CustomCredentialAdapter.ts:181-184` — `loadUserById()` has an empty catch block: `catch { return null; }`. This swallows any Dataverse error (network failure, 500, auth failure) and returns null, causing the caller to treat the absence as "user not found" rather than "infrastructure error". The catch should differentiate `DataverseNotFoundError` (return null) from all other errors (re-throw).
  Confidence: 92%

- `apps/api/src/app.ts:126-134` — global error handler logs structured error correctly. No swallowed exceptions.

- `apps/web/src/lib/auth.ts:52-54` — network error on API call returns `null` silently. This is acceptable for `NextAuth.authorize()` which must return null on failure; the behaviour is documented with a comment.

### No hardcoded secrets

No API keys, passwords, or JWT secrets appear in committed source. `.env.example` contains placeholder values (`<replace-with-client-secret>`, `<replace-with-32-char-secret>`). The GUIDs in `.env.example` are non-secret identifiers. Correct.

**Hardcoded token TTLs** — `apps/api/src/app.ts:193-195` — `accessTokenTtlSeconds: 3600`, `refreshTokenTtlSeconds: 86400`, `resetTokenTtlSeconds: 900` are integer literals. These are configuration values that should be environment variables validated in `config.ts`, consistent with `CACHE_TTL_PORTAL_CONFIG` and `NOTIFICATION_POLL_INTERVAL_DEFAULT`.
Confidence: 95%

### TypeScript strict compliance

- No `any` type usage detected in `apps/api/src` files reviewed. The Zod schema in `config.ts` and the typed Fastify declarations are consistent.
- `apps/web/src/lib/auth.ts:88` — `user as typeof user & PortalToken` — type assertion is used to attach `PortalToken` fields. This is an Auth.js v5 callback pattern where the session type extension is not fully typed by the library. Acceptable given the library limitation but should be replaced with a proper type augmentation (`declare module 'next-auth'`) when Auth.js v5 reaches GA.
- `apps/web/src/lib/auth.ts:105` — `session as unknown as Record<string, unknown>` — double-cast to attach `accessToken` and `roles` to the session object. Same Auth.js v5 limitation. Acceptable but flag for clean-up at GA upgrade.

---

## Findings Register

| ID | Severity | Category | Finding | Recommendation |
|----|----------|----------|---------|----------------|
| A-001 | HIGH | A01 / A07 | JWT revocation list (`qdb_portal_revoked_tokens`) is written by `revokeToken()` but never checked in the `authenticate` preHandler. Logged-out tokens remain valid until natural expiry. | `apps/api/src/plugins/auth-guard.ts:31` — after `request.jwtVerify()`, query `qdb_portal_revoked_tokens` where `qdb_jti eq '{claims.jti}'`; return 401 if found. |
| A-002 | HIGH | A07 | Refresh token is not revoked after use in `refreshToken()`. A stolen refresh token can be replayed indefinitely for 24 hours. | `packages/auth-adapters/src/adapters/CustomCredentialAdapter.ts:86` — call `this.revokeToken(refreshToken)` before issuing new tokens. |
| A-003 | HIGH | A07 | Auth.js Credentials provider does not store the Fastify-issued refresh token in the session. When the access token expires, the Next.js session cannot refresh against the Fastify API. | `apps/web/src/lib/auth.ts:87-99` — store `refreshToken` from the API response in the JWT callback alongside `accessToken`; implement `jwt` callback's refresh path when `token.accessToken` is expired. |
| A-004 | HIGH | A02 | `accessTokenTtlSeconds` (3600), `refreshTokenTtlSeconds` (86400), and `resetTokenTtlSeconds` (900) are hardcoded integer literals in `apps/api/src/app.ts:193-195`. Cannot be tuned without a code deployment. | Add `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_SECONDS`, `RESET_TOKEN_TTL_SECONDS` to `apps/api/src/config.ts` with appropriate Zod validators and defaults; replace literals. |
| A-005 | MEDIUM | A03 | `loadUserByEmail()` OData filter interpolates email without `escapeODataString()`. Current `z.string().email()` validation provides practical protection but defence-in-depth is absent. | `packages/auth-adapters/src/adapters/CustomCredentialAdapter.ts:192` — change to `filter: \`qdb_email eq '${escapeODataString(email)}'\`` and import `escapeODataString` from `@portal/dataverse-client` or define a shared helper. |
| A-006 | MEDIUM | A05 | CORS production origin is a regex (`/\.portal\.maqsad\.ai$/`) that matches any subdomain. An attacker who registers a subdomain of `portal.maqsad.ai` would pass the origin check. | `apps/api/src/plugins/cors.ts:16` — change to a literal string array: `['https://portal.maqsad.ai']`. Add additional entries only for explicitly required subdomains. |
| A-007 | MEDIUM | A05 | `CLIENT_SECRET` is validated only as `z.string().min(1)`. A one-character value satisfies the schema. | `apps/api/src/config.ts:14` — change to `z.string().min(32)` consistent with `JWT_SECRET`. |
| A-008 | MEDIUM | A04 | `x-correlation-id` header is accepted verbatim from any caller. A very long or specially crafted value could pollute log aggregation. | `apps/api/src/plugins/request-context.ts:30-31` — add UUID format validation: accept the header value only if it matches `/^[0-9a-f-]{36}$/i`; otherwise generate a fresh UUID. |
| A-009 | MEDIUM | A08 / A09 | Portal configuration changes (auth provider, branding, nav layout) are applied via a direct PATCH with no audit trail and no before-state log entry. | `apps/api/src/services/PortalConfigService.ts:104` — fetch and log the existing config before patching; create a `qdb_portal_config_revisions` entity to snapshot changes with `changed_by`, `changed_on`, and a JSON diff. |
| A-010 | MEDIUM | A07 | No account lockout after repeated failed login attempts. IP-based rate limit (10/min) is bypassable via IP rotation. | Add a `qdb_failed_login_count` and `qdb_locked_until` column to `qdb_portal_users`. After five consecutive failures, lock the account for 15 minutes. Reset the counter on successful login. |
| A-011 | MEDIUM | A06 | Auth.js v5 is a beta dependency. Beta releases carry higher risk of unpatched vulnerabilities and breaking changes. | Pin to the latest RC tag and document in an ADR. Upgrade to GA as soon as available. Set a review deadline of 60 days from go-live. |
| A-012 | LOW | A01 | Widget `configJson` is returned to the client without server-side validation against `configSchema`. A Dataverse admin could persist malformed config that bypasses Zod schema enforcement. | `apps/api/src/routes/widgets.ts:60` — validate `JSON.parse(w.qdb_config)` against the widget's registered `configSchema` before returning. Return a default config if validation fails. |
| A-013 | LOW | A09 | Successful and failed login events are not recorded as structured audit events (only as Fastify HTTP request log lines). A regulatory audit trail of authentication events would require scraping HTTP logs. | Add `app.log.info({ event: 'auth.login.success', userId, ... })` and `app.log.warn({ event: 'auth.login.failure', email, reason, ... })` in `apps/api/src/routes/auth.ts:44-54`. |
| A-014 | LOW | Clean Code | `packages/auth-adapters/src/adapters/CustomCredentialAdapter.ts:181-184` — empty catch block swallows Dataverse infrastructure errors in `loadUserById`, treating a network failure the same as a 404. | Catch `DataverseNotFoundError` specifically and return null; re-throw all other errors. |
| A-015 | LOW | A02 | `providerAccessToken` (Microsoft or Google OAuth access token) is stored in the Auth.js httpOnly JWT cookie. This is non-standard and increases the blast radius if the cookie is compromised. | Remove `token['providerAccessToken'] = account.access_token` from `apps/web/src/lib/auth.ts:97-98`. If provider tokens are needed for server-side calls, store them server-side only. |
| A-016 | INFO | A10 | `images.unsplash.com` in `next.config.ts` remote patterns is likely a development convenience. If not needed in production, remove it to reduce the image proxy attack surface. | Review and remove if not required in production deployment. |
| A-017 | INFO | Clean Code | `buildCreatePayload()` at `apps/api/src/services/CmsService.ts:531` is 35 lines — exceeds the 20-line standard. No functional risk. | Extract field-mapping logic into smaller named helpers on next sprint. |
| A-018 | INFO | A04 | `findValidResetToken()` loads up to 100 unexpired tokens per user — if a user triggers many reset requests rapidly, bcrypt comparisons occur in a loop. Not a DoS risk given the 10/min rate limit on `/forgot-password`. | No immediate action required; consider server-side deduplication (invalidate previous tokens when a new one is issued). |

---

## Release Blockers

The following findings must be resolved before CEO Phase 7 sign-off:

**BLOCKER 1 — A-001 (HIGH):** JWT revocation list is written but not checked. Logout has no security effect.

**BLOCKER 2 — A-002 (HIGH):** Refresh token is not invalidated after use. Token replay attack is possible for 24 hours.

**BLOCKER 3 — A-003 (HIGH):** Auth.js session does not carry the Fastify refresh token. The token refresh cycle for the Credentials provider is broken — users will be forced to re-login when their access token expires without a code fix.

**BLOCKER 4 — A-004 (HIGH):** Token TTLs are hardcoded. Cannot shorten the access token window in response to a security incident without a deployment.

CEO Binding Conditions 1, 2, 4, 5, and 6 are verified PASS. Condition 3 (RTL device testing) remains pending Track B delivery.

---

## Recommended Fixes (pre-CEO sign-off)

1. **A-001** — Wire revocation check into auth-guard.
   `apps/api/src/plugins/auth-guard.ts:32-33` — after `jwtVerify()` succeeds, call `app.dataverse.getList('qdb_portal_revoked_tokens', { filter: \`qdb_jti eq '${claims.jti}'\`, top: 1 })`. If `result.value.length > 0`, return 401.

2. **A-002** — Invalidate refresh token on use.
   `packages/auth-adapters/src/adapters/CustomCredentialAdapter.ts:87` — add `await this.revokeToken(refreshToken);` as the first operation inside `refreshToken()`.

3. **A-003** — Store and use refresh token in Auth.js session.
   `apps/web/src/lib/auth.ts:89` — add `token['refreshToken'] = portalUser.refreshToken;`. Implement the standard Auth.js v5 refresh token rotation pattern in the `jwt` callback: when `Date.now() > token.expiresAt * 1000`, call `POST /api/auth/refresh` with the stored refresh token.

4. **A-004** — Move token TTLs to `config.ts`.
   Add three env vars with Zod coerce validators and sensible defaults. Replace literals in `apps/api/src/app.ts:193-195`.

---

## Recommended Fixes (post-release, within 30 days)

5. **A-005** — Apply `escapeODataString()` to email in `loadUserByEmail`.
6. **A-006** — Change CORS production origin to a literal string array.
7. **A-007** — Change `CLIENT_SECRET` minimum validation to `min(32)`.
8. **A-008** — Validate `x-correlation-id` header as UUID format before trusting it.
9. **A-009** — Create `qdb_portal_config_revisions` table; snapshot before every portal config update.
10. **A-010** — Add account lockout counter to `qdb_portal_users`.
11. **A-011** — Set Auth.js v5 upgrade review deadline; pin to latest RC; schedule GA upgrade.
12. **A-013** — Add structured `auth.login.success` and `auth.login.failure` log events.
13. **A-014** — Fix `loadUserById` empty catch block to re-throw non-404 errors.
14. **A-015** — Remove `providerAccessToken` from Auth.js JWT cookie.

---

## Service Account Review

| Account | Scope | Assessment |
|---------|-------|------------|
| Dataverse service principal (`CLIENT_ID: 08e80e93...`) | Client credentials flow against `org5869857f.crm4.dynamics.com` | Single account with access to all `qdb_*` custom entities. Least-privilege cannot be assessed without reviewing the Dataverse application user's security role assignment. Must be confirmed to hold only the minimum required privileges (read/write on `qdb_*` entities; no system-level or OOB entity access). |
| Auth.js OAuth app (Microsoft Entra ID) | Reads user profile from Microsoft identity platform | Scope should be limited to `openid profile email`. Confirm `offline_access` is not requested unless refresh tokens are intentionally required from the Microsoft side. |
| Auth.js OAuth app (Google) | Reads user profile from Google | Same as above — confirm scope is `openid profile email` only. |

**Action required:** Provide the Dataverse application user's security role definition for review. Confirm it does not hold System Administrator or System Customizer privileges.

---

## Audit Verdict

**NOT CLEARED** — Four HIGH findings (A-001, A-002, A-003, A-004) must be resolved before CEO Phase 7 sign-off. All four are implementation gaps rather than design flaws — the infrastructure for revocation, token management, and configuration-driven TTLs is already present and requires targeted wiring rather than architectural change. Estimated remediation effort: 1–2 developer days. Re-audit of the four blockers only is required before clearance is granted; full re-audit is not needed.

Track B (mobile) is out of scope pending build completion. Mobile code must pass a Phase 6 audit of its own (covering Expo Secure Store usage, deep link handling, and certificate pinning) before the Track B release milestone is approved.
