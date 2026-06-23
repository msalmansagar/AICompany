# DFE-PORT-001 — Phase 7 CEO Final Decision
**Date:** 2026-06-16
**Engagement:** DFE-PORT-001 — Configurable Portal Shell
**Verdict:** APPROVED WITH CONDITIONS
**Supersedes:** Phase 7 DEFER verdict dated 2026-06-16

---

## Executive Summary

Phase 5 (QA) and Phase 6 (Audit) are now complete. All four HIGH security blockers identified
by the auditor (A-001 through A-004) have been resolved and the remediation evidence has been
reviewed and confirmed. Five of the six CEO binding conditions from Phase 1 are VERIFIED PASS.
The sixth condition — RTL testing on physical iOS and Android devices — remains PENDING, as
it was correctly scoped as a Track B delivery gate and Track B has been built but not yet
cleared for device testing.

The engagement is approved to proceed to production for Track A (Web Portal) and Track C (CMS),
subject to the conditions below. Track B (Mobile) carries its own mandatory device-test and
security audit gate before its independent release milestone can be signed off.

The portal shell delivers the primary BRD objective: a white-label, configuration-driven web
portal and headless CMS that any client can brand and extend without modifying source code.
The widget plug-in system, auth adapter pattern, and Dataverse-backed configuration are
correctly implemented and match the architecture contract. The business case is materially
served by Tracks A and C, which are ready for production deployment with the conditions stated
below.

---

## CEO Binding Conditions — Final Verification

| # | Phase 1 Condition | Status | Evidence |
|---|-------------------|--------|----------|
| C1 | Auth adapter interface defined before implementation. All three adapters implement the same contract. | VERIFIED PASS | `packages/auth-adapters/src/IAuthAdapter.ts:9` carries "CEO Condition 1: LOCKED, immutable" comment. `AzureAdB2cAdapter`, `EntraExternalIdAdapter`, and `CustomCredentialAdapter` all implement it. Audit verified independently. TypeScript compile enforces the contract on every PR. |
| C2 | Widget plug-in API contract `{ name, title, component, configSchema, defaultConfig }` immutable post-approval. | VERIFIED PASS | `packages/widget-registry/src/types.ts:35` — `WidgetDefinition` interface carries ADR-PORT-004 lock comment. All five required fields are present. Additive extensions (`description`, `icon`, `defaultColumnSpan`) do not break the contract. TC-WDG-001 verifies graceful fallback for unrecognised widget codes. |
| C3 | RTL tested on real iOS + Android devices with Arabic locale. | PENDING — TRACK B GATE | Web RTL is fully wired: `/ar/` locale routing, `dir=rtl` on `<html>`, Tailwind v4 logical properties, Tiptap `tiptap-text-direction`. TC-RTL-001/002/003 and TC-E2E-004 verify web RTL in automated tests. Physical device validation (iOS Arabic locale, Android Arabic locale) is a mandatory gate for the Track B release milestone. No Track B approval will be issued without signed device test results. |
| C4 | CMS rich-text editor must be open-source. No custom editor. | VERIFIED PASS | `apps/web/package.json` — `@tiptap/react`, `@tiptap/starter-kit`, and five Tiptap extensions confirmed. TC-CMS-001 asserts their presence programmatically. No custom editor exists in the codebase. Audit confirmed independently. |
| C5 | Notification poll interval configurable in `qdb_portal_config`, range 10s–120s, default 30s. | VERIFIED PASS | `apps/api/src/config.ts:26` — `NOTIFICATION_POLL_INTERVAL_DEFAULT: z.coerce.number().int().min(10).max(120).default(30)`. `PortalConfigService.ts:148` reads `qdb_notification_poll_interval_seconds` from Dataverse. TC-ZOD-012 (below 10 rejects) and TC-ZOD-013 (above 120 rejects) both verified by QA. |
| C6 | Phased delivery: all three tracks must have independent release milestones. | VERIFIED PASS | Track A and Track C are complete and independently deployable. Track B is built and has an independent EAS Build pipeline (`mobile.yml`). The three tracks have separate Docker containers, deployment pipelines, and release workflows. The sequence A then C then B was enforced as evidenced by commit history and `brief.md` milestone records. |

Note on C1 interface divergence: The built `IAuthAdapter` uses different method names than the
contract locked in ADR-PORT-005 (e.g., `authenticateWithCredentials` vs `authenticate`). The
spirit of the condition is met — the interface is defined, is locked, and all adapters implement
it consistently. However, ADR-PORT-005-revision-1 must be authored before production deployment
to formally ratify the built interface. This is listed as a pre-production checklist item.

---

## Audit Blockers — Resolution Confirmation

All four HIGH findings from Phase 6 have been remediated. The evidence below was provided by the
engineering team and accepted for this Phase 7 review.

| Blocker | Finding | Resolution Confirmed |
|---------|---------|----------------------|
| A-001 | JWT revocation list written but never checked. Logged-out tokens remained valid until natural expiry. | RESOLVED. `apps/api/src/plugins/auth-guard.ts` — dual NodeCache (60-second valid-token cache, 1-hour revoked-token cache) added. After `jwtVerify()` succeeds, the JTI is checked against the revoked-token cache and then against `qdb_portal_revoked_tokens` in Dataverse. Returns 401 if found. Fail-open on Dataverse error (logs WARN) to prevent auth outage from infrastructure degradation. |
| A-002 | Refresh token not invalidated after use. Stolen token replayable for 24 hours. | RESOLVED. `packages/auth-adapters/src/adapters/CustomCredentialAdapter.ts:98` — `await this.revokeToken(refreshToken)` is called before `issueTokensForUser()`. The presented refresh token is invalidated before the new token pair is issued, preventing replay. |
| A-003 | Auth.js Credentials provider did not store Fastify refresh token in the session. Access token expiry forced full re-login. | RESOLVED. `apps/web/src/lib/auth.ts` — response now correctly parsed from the `{data: AuthResult}` envelope. `refreshToken` and `expiresAt` are persisted in the Auth.js JWT callback. Silent refresh is implemented: when `Date.now()/1000 > expiresAt`, the jwt callback calls `POST /api/auth/refresh` with the stored refresh token before returning the session. |
| A-004 | `accessTokenTtlSeconds`, `refreshTokenTtlSeconds`, `resetTokenTtlSeconds` hardcoded as integer literals. Unreducible without a code deployment. | RESOLVED. `apps/api/src/config.ts` — `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_SECONDS`, `RESET_TOKEN_TTL_SECONDS` added with Zod coerce validators and safe defaults. `apps/api/src/app.ts` — `buildAuthAdapterConfig()` reads these values from config. Token TTLs can now be changed via environment variables without a code deployment. |

---

## Remaining Risk Register

The following findings from the Phase 6 audit survive into production. All are MEDIUM or lower
severity. None are release blockers for Track A and Track C.

| ID | Severity | Finding | Owner | Due |
|----|----------|---------|-------|-----|
| A-005 | MEDIUM | `loadUserByEmail()` OData filter interpolates email without `escapeODataString()`. Zod `z.string().email()` provides practical protection but defence-in-depth is absent. | Backend | 30 days post-release |
| A-006 | MEDIUM | CORS production origin is a regex matching any subdomain of `portal.maqsad.ai`. Should be a literal string array. | Backend | 30 days post-release |
| A-007 | MEDIUM | `CLIENT_SECRET` validated as `min(1)` rather than `min(32)`. | Backend | 30 days post-release |
| A-008 | MEDIUM | `x-correlation-id` header accepted verbatim without UUID format guard. Risk: log pollution, potential SIEM injection. | Backend | 30 days post-release |
| A-009 | MEDIUM | Portal configuration changes (auth provider, branding, nav layout) have no audit trail or revision table. Forensic visibility into admin config changes is absent. | Backend + Power Platform | 30 days post-release |
| A-010 | MEDIUM | No account lockout after repeated failed login attempts. IP-based rate limit is bypassable via IP rotation. | Backend | 30 days post-release |
| A-011 | MEDIUM | Auth.js v5 is a beta dependency. Higher risk of unpatched vulnerabilities and breaking API changes. | Frontend | Pin to latest RC immediately; upgrade to GA within 60 days of go-live |
| A-012 | LOW | Widget `configJson` returned to client without server-side schema validation. Malformed Dataverse data bypasses Zod. | Backend | Next sprint |
| A-013 | LOW | Successful and failed login events not recorded as structured audit events. | Backend | Next sprint |
| A-014 | LOW | `loadUserById()` has empty catch block swallowing non-404 Dataverse errors. | Backend | Next sprint |
| A-015 | LOW | Microsoft/Google `providerAccessToken` stored in Auth.js JWT cookie. Non-standard; increases cookie blast radius. | Frontend | Next sprint |
| A-016 | INFO | `images.unsplash.com` in `next.config.ts` remote patterns is likely a development convenience. | Frontend | Before production deploy |
| A-017 | INFO | `buildCreatePayload()` in `CmsService.ts` exceeds the 20-line function length standard. | Backend | Next sprint |
| A-018 | INFO | `findValidResetToken()` runs bcrypt comparisons in a loop up to 100 tokens. Not a DoS risk given rate limiting. | Backend | Next sprint |

Business assessment of MEDIUM findings: A-009 (no portal config audit trail) is the finding of
highest business concern in this group. Portal configuration controls the auth provider, branding,
and navigation for all users. Without a change log, there is no forensic record if the auth
provider is changed without authorisation. This must be treated as the highest-priority item in
the 30-day post-release backlog.

---

## Pre-Production Checklist

The following actions must be completed before Track A and Track C go live. These are mandatory.
No production deployment may proceed until all items are signed off by the delivery team.

1. ADR-PORT-005-revision-1 authored and approved by the architect, formally ratifying the built
   `IAuthAdapter` interface (method names as built: `authenticateWithCredentials`, `validateToken`,
   `refreshToken`, `revokeToken`, `generatePasswordResetToken`, `resetPassword`, `getUserById`,
   `getUserByEmail`). The revision ADR must document the deviation from the original contract and
   provide rationale.

2. Auth.js v5 dependency pinned to the latest release candidate tag in `apps/web/package.json`.
   The exact pinned version must be recorded in `dependencies.md`. A calendar review date of 60
   days from go-live must be registered to upgrade to GA.

3. Dataverse application user security role confirmed to hold only the minimum required privileges:
   read/write on all `qdb_*` custom entities, no System Administrator, no System Customizer. The
   role definition must be reviewed by the delivery lead and documented.

4. `images.unsplash.com` remote pattern removed from `apps/web/next.config.ts` if not required
   for production content. If genuinely required, document the business reason.

5. Staging environment smoke test sign-off:
   - Admin portal-config save and reload cycle verified by QA engineer
   - Visual regression sign-off: branding (logo, colors, font) applied via `qdb_portal_config`
     and rendered correctly in browser
   - Login, refresh, and silent token renewal cycle verified with the Credentials provider
   - JWT revocation: verify that logging out prevents subsequent API calls with the same token
   - Notification poll: verify 10-second and 120-second extremes are enforced at the API
     boundary and reflected in the browser polling behavior

6. All Playwright E2E scenarios TC-E2E-001 through TC-E2E-009 passed on the staging environment
   with results archived as a CI artifact.

7. Performance benchmarks verified on staging:
   - GET /api/portal-config (cache hit) p95 < 50ms
   - GET /api/notifications p95 < 200ms
   - POST /api/auth/login p95 < 500ms

8. Production environment variables confirmed set for all required values including
   `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_SECONDS`, `RESET_TOKEN_TTL_SECONDS`,
   `JWT_SECRET` (min 32 chars), `CLIENT_SECRET`, `AUTH_SECRET`, `API_URL`, `DATAVERSE_URL`.
   No placeholder values from `.env.example` may appear in the production environment.

9. `CmsScheduleService` cron registration confirmed in `apps/api/src/server.ts`. If the
   scheduled publish/unpublish cron is not registered, scheduled content will not publish
   automatically. This must be verified or the feature must be disabled at launch with a
   user-facing notice.

10. `CmsService` revision FIFO cap (delete oldest revision when count exceeds 10) confirmed
    implemented and tested. The `saveRevision()` function must enforce the 10-revision limit
    before production use, to prevent unbounded storage growth in `qdb_cms_revisions`.

---

## Post-Release 30-Day Backlog

The following items must be completed within 30 days of production go-live. The delivery team
must assign owners and register these as tracked work items before release.

1. A-009: Create `qdb_portal_config_revisions` Dataverse entity. Modify `PortalConfigService.ts`
   to snapshot the existing config before every `updateConfig()` call with `changed_by`,
   `changed_on`, and a JSON diff. This is the highest-priority item in this backlog.

2. A-005: Apply `escapeODataString()` to the email value in `loadUserByEmail()`.

3. A-006: Replace CORS production origin regex with a literal string array in `cors.ts`.

4. A-007: Increase `CLIENT_SECRET` minimum validation to `min(32)` in `config.ts`.

5. A-008: Add UUID format validation for the `x-correlation-id` header in `request-context.ts`.

6. A-010: Add `qdb_failed_login_count` and `qdb_locked_until` to `qdb_portal_users`. Implement
   account lockout after five consecutive failed login attempts. Reset counter on successful login.

7. A-011: Auth.js v5 GA upgrade review. Track the Auth.js v5 GA release; upgrade as soon as
   available. No later than 60 days from go-live.

8. A-013: Add structured `auth.login.success` and `auth.login.failure` log events in
   `apps/api/src/routes/auth.ts`. This is required for any future regulatory audit trail of
   authentication events.

9. A-014: Fix `loadUserById()` empty catch block to re-throw non-404 Dataverse errors.

10. A-015: Remove `providerAccessToken` from the Auth.js JWT callback in `apps/web/src/lib/auth.ts`.

---

## Track B — Mobile Release Conditions

Track B has been built (Expo SDK 53, expo-router v4, React Query v5, expo-secure-store,
expo-local-authentication, expo-notifications). The Track B release milestone requires all of
the following before a CEO Track B sign-off is issued:

1. CEO Condition C3: Physical device testing completed — one test on a real iOS device set to
   Arabic locale confirming RTL layout, and one test on a real Android device set to Arabic locale
   confirming RTL layout. Test results must be documented with device model, OS version, locale
   setting, and tester sign-off.

2. Track B Phase 6 Security Audit: The mobile codebase must pass an independent security audit
   covering at minimum: expo-secure-store token storage (never AsyncStorage), deep link handling
   and URL validation, certificate pinning assessment, biometric authentication bypass paths, and
   expo-notifications permission handling. The audit must produce a separate findings register
   with no unmitigated HIGH findings.

3. EAS Build completed: A production EAS Build must be executed and the resulting `.ipa` and
   `.apk` artifacts must be confirmed installable on physical devices before store submission.

4. Detox E2E test stubs converted to running tests: The three Detox test files must be executed
   against a real device or simulator and all scenarios must pass.

5. Jest unit test coverage for `apps/mobile` must reach 80% as specified in the Phase 5 QA
   coverage targets.

The Track B milestone will be governed as a separate CEO checkpoint (DFE-PORT-001/TRK-B) upon
submission of the above evidence.

---

## Engagement Closure Statement

DFE-PORT-001 — Configurable Portal Shell is APPROVED WITH CONDITIONS for production deployment
of Track A (Web Portal) and Track C (CMS). The engagement is not fully closed until Track B
completes its separate release milestone (DFE-PORT-001/TRK-B).

The following is the formal closure state of each track:

| Track | Scope | Status |
|-------|-------|--------|
| Track A — Web Portal | Shell, auth (3 providers), navigation, header, dashboard, widget grid, services, requests, notifications, admin screens, RTL web | APPROVED — release to production upon pre-production checklist completion |
| Track C — CMS | Content types, CRUD, Tiptap rich-text editor, revision history, publish/unpublish workflow, admin CMS routes, public CMS routes | APPROVED — release to production upon pre-production checklist completion |
| Track B — Mobile App | Expo SDK 53 app with all screens, biometric login, push notifications, RTL | PENDING — separate CEO sign-off required upon device testing, mobile audit, and EAS Build evidence |

The engagement is acknowledged as materially successful. The six CEO binding conditions from
Phase 1 are met or conditionally met. The auth security posture is sound after the four HIGH
blockers were remediated. The widget plug-in pattern and auth adapter pattern are correctly
implemented and provide the extensibility and replaceability required by the BRD. The portal
is ready to serve as the foundation for client deployments on Track A and Track C scope.

All findings in the post-release backlog must be tracked to closure within 30 days of go-live.
The delivery team lead is accountable for each item in that backlog.

---

**Decision:** APPROVED WITH CONDITIONS

*CEO sign-off: Maqsad AI CEO Agent — DFE-PORT-001 — 2026-06-16*
