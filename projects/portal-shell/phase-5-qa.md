# DFE-PORT-001 — Phase 5 QA Strategy

**Engagement ID:** DFE-PORT-001  
**Phase:** Phase 5 — Quality Assurance  
**Status:** FINAL  
**Author:** QA Agent  
**Date:** 2026-06-16  
**References:** phase-2-ba.md (FR-IDs: PC-*, AUTH-*, NAV-*, NOT-*, ENT-*, WDG-*), phase-1-ceo.md (CEO Conditions 1–6)

---

## 1. Test Coverage Targets

| Package / App | Target | Existing Tests | Gap |
|---|---|---|---|
| packages/types | 100% Zod schema coverage (parse success + failure per schema) | 0 | All new |
| packages/dataverse-client | 95%+ branch coverage | 8 tests (DataverseClient.test.ts) | Edge cases: retry exhaustion, auth 401 |
| packages/auth-adapters | 90%+ | 6 tests (CustomCredentialAdapter.test.ts) | AzureAdB2cAdapter, EntraExternalIdAdapter, IAuthAdapter contract |
| apps/api | 85%+ (unit + integration) | health, auth, PortalConfigService, NavService tests | NotificationService, EntityService, notification routes |
| apps/web | 80%+ (component + E2E) | 0 | All new (LoginForm, RequestStatusBadge, RTL layout, Playwright E2E) |
| apps/mobile | 80%+ (Track B — strategy only, tests pending build completion) | 0 | Jest + @testing-library/react-native |

---

## 2. Test Categories

### 2.1 Unit Tests
Pure functions, service methods, Zod schema parse/safeParse, DataverseClient mapping logic.
Tool: Vitest. Location: co-located with source (`*.test.ts`).

### 2.2 Integration Tests
API routes wired into a real Fastify instance via `app.inject()`. DataverseClient mocked at the plugin boundary — no real network calls. Auth-guard exercised with real JWT signing/verifying against a test secret.
Tool: Vitest + `app.inject()`. Location: `apps/api/src/routes/*.test.ts`.

### 2.3 Component Tests
React components rendered with `@testing-library/react` in a jsdom environment. Next.js navigation, next-auth, and next-intl are mocked globally in `test-setup.ts`. FluentUI renders to DOM nodes and is not mocked — we test rendered output.
Tool: Vitest + jsdom + @testing-library/react. Location: `apps/web/src/components/**/*.test.tsx`.

### 2.4 E2E Tests
Full browser tests against the running Next.js dev server and a seeded Dataverse environment. Three Playwright projects: Desktop Chrome (LTR), iPhone 14 (mobile web), and ar-rtl (Arabic locale, Desktop Chrome).
Tool: Playwright. Location: `apps/web/e2e/`.

### 2.5 RTL Tests
A dedicated E2E Playwright project (`ar-rtl`) asserts: `html[dir=rtl]` is set when locale is `ar`, text is right-aligned, logical CSS properties are used (no hardcoded `margin-left`, `padding-left`, `left:`, `right:` in inline styles). Component-level RTL test renders the root layout with `locale='ar'` and asserts the `dir` attribute.

### 2.6 Auth Tests
- Login happy path (credentials + SSO redirect)
- Refresh token rotation on each use
- Idle timeout: 30-minute warning dialog fires, then forces logout
- Deep-link preservation: accessing `/en/my-requests` unauthenticated redirects to `/en/login?callbackUrl=%2Fen%2Fmy-requests`; post-login resumes at `/en/my-requests`
- Mobile (Track B): biometric flow using `expo-local-authentication` mocked in Jest

### 2.7 Security Tests
- JWT forgery: token signed with wrong secret returns 401
- Role escalation: portal_user accessing `/api/admin/*` returns 403
- Rate limiting: 11 requests to `/api/auth/login` in under 60 seconds from the same IP returns 429
- Input injection: SQL-like and XSS payloads in email field → Zod rejects before service is reached
- Unauthenticated access to every authenticated route returns 401

### 2.8 Performance Tests
Tool: k6. Location: `apps/api/k6/`.
Run as a separate CI job on nightly schedule, not on every PR.

---

## 3. CEO Condition Verification

| Condition | How Verified | Test Reference |
|---|---|---|
| C1: IAuthAdapter — all adapters implement identical method set | TypeScript compile-time: `IAuthAdapter` interface is the declared type; custom, Azure AD B2C, and Entra adapters must satisfy it or tsc fails. Runtime test: `createAuthAdapter()` factory is called with each config type; resulting object passes `typeof adapter.authenticateWithCredentials === 'function'` assertions. | TC-AUTH-010, TC-AUTH-011, TC-AUTH-012 |
| C2: Widget API contract immutability | TypeScript compile-time: `WidgetInstanceConfig` and `WidgetDefinition` types are used in component signatures; any breaking change causes tsc to fail. Test: `WidgetGrid` renders registered widgets without throwing; unrecognised widget code renders a fallback, not an exception. | TC-WDG-001 |
| C3: RTL | Playwright `ar-rtl` project: GET `/ar/login`, assert `document.documentElement.getAttribute('dir') === 'rtl'`. Component test: root layout with `locale='ar'` sets `dir='rtl'` on `<html>`. | TC-RTL-001, TC-RTL-002 |
| C4: CMS = Tiptap (no custom editor) | `package.json` assertion in test: `@tiptap/react` and `@tiptap/starter-kit` must be present in `apps/web/package.json`. No file in `apps/web/src/components/cms/` should import a non-Tiptap rich text library. | TC-CMS-001 |
| C5: Poll interval = `notificationPollIntervalSeconds * 1000` | Unit test on the React Query hook: `useNotifications` hook is called with `refetchInterval: config.notificationPollIntervalSeconds * 1000`. | TC-NOT-010 |
| C6: Phased delivery (Track A before C before B) | Git history verification: Track A commits (types/api/web) predate Track C commits (CmsService). Verified by auditor agent; not a runtime test. | Audit — Phase 6 |

---

## 4. Test Environment Requirements

### 4.1 Unit and Integration Tests
- Node.js 20 LTS
- No live Dataverse connection — all Dataverse calls mocked via `vi.fn()`
- JWT_SECRET environment variable set to a 32-character test string
- No network calls (global `fetch` stubbed in DataverseClient tests)

### 4.2 Component Tests
- jsdom environment (configured via `vitest.config.ts` in `apps/web`)
- `@testing-library/jest-dom` matchers extended in `test-setup.ts`
- Mocked: `next/navigation`, `next-auth/react`, `next-intl`

### 4.3 E2E Tests
- Playwright 1.49+
- Next.js dev server running on port 3000 (`npm run dev` in `apps/web`)
- Fastify API server running on port 4000
- Seeded Dataverse environment: at least 1 portal config record, 3 nav items, 3 unread notifications per test user
- Two test accounts: `portal_user@test.com` (role: portal_user) and `admin_user@test.com` (role: portal_user + Admin)
- Playwright auth state stored in `apps/web/e2e/.auth/` — excluded from git

### 4.4 Performance Tests
- k6 v0.54+
- Separate Fastify instance with a seeded Dataverse mock server (WireMock)
- Executed nightly in CI; not gating PRs

---

## 5. Detailed Test Cases

### Package: @portal/types — Zod Schema Validation

```
TC-ZOD-001: LoginSchema_ValidEmailAndPassword_ParsesSuccessfully (FR: AUTH-002)
Given: { email: 'user@example.com', password: 'secret12' }
When: LoginSchema.safeParse(input)
Then: success === true, data.email === 'user@example.com'
Priority: Critical | Type: Unit

TC-ZOD-002: LoginSchema_InvalidEmail_ReturnsZodError (FR: AUTH-002)
Given: { email: 'not-an-email', password: 'secret12' }
When: LoginSchema.safeParse(input)
Then: success === false, error.issues[0].path contains 'email'
Priority: Critical | Type: Unit

TC-ZOD-003: LoginSchema_PasswordTooShort_ReturnsZodError (FR: AUTH-002)
Given: { email: 'user@example.com', password: '7chars' }
When: LoginSchema.safeParse(input)
Then: success === false, error.issues[0].path contains 'password'
Priority: High | Type: Unit

TC-ZOD-004: RegisterSchema_Valid_ParsesSuccessfully (FR: AUTH-005)
Given: { email, password: 'ValidP@ss12', firstName: 'A', lastName: 'B', preferredLanguage: 'en' }
When: RegisterSchema.safeParse(input)
Then: success === true
Priority: Critical | Type: Unit

TC-ZOD-005: RegisterSchema_MissingFirstName_ReturnsZodError (FR: AUTH-005)
Given: { email, password: 'ValidP@ss12', firstName: '', lastName: 'B' }
When: RegisterSchema.safeParse(input)
Then: success === false, error path includes 'firstName'
Priority: High | Type: Unit

TC-ZOD-006: RegisterSchema_WeakPassword_NoUppercase_ReturnsZodError (FR: AUTH-005)
Given: password: 'alllower1@' (no uppercase)
When: RegisterSchema.safeParse(input)
Then: success === false, error path includes 'password'
Priority: High | Type: Unit

TC-ZOD-007: ResetPasswordSchema_ValidStrongPassword_ParsesSuccessfully (FR: AUTH-004)
Given: { token: 'tok', newPassword: 'ValidP@ss12!' }
When: ResetPasswordSchema.safeParse(input)
Then: success === true
Priority: High | Type: Unit

TC-ZOD-008: ResetPasswordSchema_NoUppercase_ReturnsZodError (FR: AUTH-004)
Given: newPassword: 'nouppercase1!'
When: ResetPasswordSchema.safeParse(input)
Then: success === false
Priority: High | Type: Unit

TC-ZOD-009: ResetPasswordSchema_NoSpecialChar_ReturnsZodError (FR: AUTH-004)
Given: newPassword: 'NoSpecial1234'
When: ResetPasswordSchema.safeParse(input)
Then: success === false
Priority: High | Type: Unit

TC-ZOD-010: PortalConfigPatchSchema_ValidHexColors_ParsesSuccessfully (FR: PC-001)
Given: { primaryColor: '#0078d4', accentColor: '#00b4d8' }
When: PortalConfigPatchSchema.safeParse(input)
Then: success === true
Priority: High | Type: Unit

TC-ZOD-011: PortalConfigPatchSchema_InvalidHex_ReturnsZodError (FR: PC-001)
Given: { primaryColor: 'blue' }
When: PortalConfigPatchSchema.safeParse(input)
Then: success === false, error path includes 'primaryColor'
Priority: High | Type: Unit

TC-ZOD-012: PortalConfigPatchSchema_PollIntervalBelowMin_ReturnsZodError (FR: PC-010, CEO C5)
Given: { notificationPollIntervalSeconds: 9 }
When: PortalConfigPatchSchema.safeParse(input)
Then: success === false
Priority: Critical | Type: Unit

TC-ZOD-013: PortalConfigPatchSchema_PollIntervalAboveMax_ReturnsZodError (FR: PC-010, CEO C5)
Given: { notificationPollIntervalSeconds: 121 }
When: PortalConfigPatchSchema.safeParse(input)
Then: success === false
Priority: Critical | Type: Unit

TC-ZOD-014: NavItemCreateSchema_ValidItem_ParsesSuccessfully (FR: NAV-001)
Given: valid NavItem create body
When: NavItemCreateSchema.safeParse(input)
Then: success === true
Priority: High | Type: Unit

TC-ZOD-015: NavItemCreateSchema_EmptyLabel_ReturnsZodError (FR: NAV-001)
Given: { label: '' }
When: NavItemCreateSchema.safeParse(input)
Then: success === false, error path includes 'label'
Priority: High | Type: Unit

TC-ZOD-016: CmsListQuerySchema_ValidPagination_ParsesSuccessfully (FR: CMS)
Given: { page: '2', pageSize: '10' }
When: CmsListQuerySchema.safeParse(input)
Then: success === true, data.page === 2, data.pageSize === 10 (coerced)
Priority: Medium | Type: Unit

TC-ZOD-017: CmsListQuerySchema_PageSizeOver50_ReturnsZodError (FR: CMS)
Given: { pageSize: '51' }
When: CmsListQuerySchema.safeParse(input)
Then: success === false, error path includes 'pageSize'
Priority: High | Type: Unit

TC-ZOD-018: CmsListQuerySchema_InvalidTypeEnum_ReturnsZodError (FR: CMS)
Given: { type: 'video' }
When: CmsListQuerySchema.safeParse(input)
Then: success === false, error path includes 'type'
Priority: Medium | Type: Unit
```

### Package: @portal/dataverse-client — Edge Cases

```
TC-DVC-009: retry_ThreeConsecutive429s_ThrowsAfterExhausting (FR: Integration)
Given: fetch returns 429 on first three calls
When: DataverseClient.getList() is called
Then: throws DataverseError after 3 retries; fetch was called exactly 3 times
Priority: High | Type: Unit
Confidence: 95%

TC-DVC-010: retry_502OnFirstCall_SucceedsOnSecondCall (FR: Integration)
Given: fetch returns 502 on first call, 200 on second
When: DataverseClient.getList() is called
Then: resolves successfully; fetch was called exactly 2 times
Priority: High | Type: Unit
Confidence: 95%

TC-DVC-011: getById_401Response_ThrowsDataverseAuthError (FR: AUTH)
Given: fetch returns 401
When: DataverseClient.getById() is called
Then: throws DataverseAuthError
Priority: Critical | Type: Unit
Confidence: 95%
```

### Package: @portal/auth-adapters — IAuthAdapter Contract

```
TC-AUTH-010: createAuthAdapter_CustomConfig_ReturnsObjectImplementingIAuthAdapter (CEO C1)
Given: config.type === 'custom'
When: createAuthAdapter(config) is called
Then: returned object has methods: authenticateWithCredentials, validateToken, getUserByEmail, refreshToken, revokeToken
Priority: Critical | Type: Unit

TC-AUTH-011: createAuthAdapter_AzureAdB2cConfig_ReturnsObjectImplementingIAuthAdapter (CEO C1)
Given: config.type === 'azure-ad-b2c'
When: createAuthAdapter(config) is called
Then: returned object has all IAuthAdapter method signatures
Priority: Critical | Type: Unit

TC-AUTH-012: createAuthAdapter_EntraExternalIdConfig_ReturnsObjectImplementingIAuthAdapter (CEO C1)
Given: config.type === 'entra-external-id'
When: createAuthAdapter(config) is called
Then: returned object has all IAuthAdapter method signatures
Priority: Critical | Type: Unit
```

### apps/api — NotificationService Unit Tests

```
TC-NOT-001: markAsRead_NotificationBelongsToOtherUser_ThrowsForbiddenError (FR: NOT-*)
Given: notification qdb_user_id !== requesting userId
When: notificationService.markAsRead(notificationId, userId)
Then: throws Error containing 'does not belong to user'
Priority: Critical | Type: Unit

TC-NOT-002: markAllAsRead_NoUnreadNotifications_UpdatesZeroRecords (FR: NOT-*)
Given: loadUnreadIds returns empty array
When: notificationService.markAllAsRead(userId)
Then: dataverse.update is never called
Priority: High | Type: Unit

TC-NOT-003: listNotifications_FiltersToCurrentUser_ReturnsOnlyOwnedItems (FR: NOT-*)
Given: Dataverse returns two notifications for different users
When: getNotificationsForUser('user-A')
Then: OData filter contains qdb_user_id eq 'user-A'
Priority: Critical | Type: Unit

TC-NOT-004: listNotifications_Returns50MaxItems_OrderedByCreatedOnDesc (FR: NOT-*)
Given: standard Dataverse mock
When: getNotificationsForUser(userId)
Then: query top === 50 and orderBy === 'createdon desc'
Priority: High | Type: Unit
```

### apps/api — EntityService Unit Tests

```
TC-ENT-001: getLinkedEntities_UserHasNoLinks_ReturnsEmptyArray (FR: ENT-*)
Given: junction table returns empty value array
When: entityService.getLinkedEntities(userId)
Then: returns [] and loadAccounts is never called
Priority: Critical | Type: Unit

TC-ENT-002: getLinkedEntities_UserHasMultipleEntities_ReturnsAllMapped (FR: ENT-*)
Given: junction table returns 2 records linking user to account-1 and account-2
When: entityService.getLinkedEntities(userId)
Then: returns array of 2 LinkedEntity objects with correct id/name/subType
Priority: Critical | Type: Unit

TC-ENT-003: getLinkedEntities_DataverseError_PropagatesError (FR: ENT-*)
Given: dataverse.getList throws DataverseError
When: entityService.getLinkedEntities(userId)
Then: the same DataverseError is propagated — not swallowed
Priority: High | Type: Unit
```

### apps/api — Notification Route Integration Tests

```
TC-ROUT-001: GET /api/notifications_NoToken_Returns401 (FR: AUTH-007)
Given: no Authorization header
When: GET /api/notifications
Then: 401, body.code === 'unauthorized'
Priority: Critical | Type: Integration

TC-ROUT-002: GET /api/notifications_ValidToken_ReturnsUserNotifications (FR: NOT-*)
Given: valid JWT for user-001; notificationService returns 2 notifications
When: GET /api/notifications with Bearer token
Then: 200, body.data is array of 2 notifications, both have userId === 'user-001'
Priority: Critical | Type: Integration

TC-ROUT-003: PATCH /api/notifications/read-all_ValidToken_Returns204 (FR: NOT-*)
Given: valid JWT; notificationService.markAllAsRead resolves
When: PATCH /api/notifications/read-all
Then: 204, no body
Priority: High | Type: Integration

TC-ROUT-004: PATCH /api/notifications/:id/read_NotificationBelongsToOtherUser_Returns403 (FR: NOT-*, AUTH-*)
Given: valid JWT; notificationService.markAsRead throws Error('does not belong to user')
When: PATCH /api/notifications/some-uuid/read
Then: 403 or 500 (global error handler must map ownership error; confirm behavior)
Priority: Critical | Type: Integration

TC-ROUT-005: PATCH /api/notifications/:id/read_InvalidUuid_Returns400 (FR: NOT-*)
Given: valid JWT
When: PATCH /api/notifications/not-a-uuid/read
Then: 400, Zod validation error on id param
Priority: High | Type: Integration
```

### apps/web — LoginForm Component Tests

```
TC-WEB-001: LoginForm_Renders_EmailAndPasswordFields (FR: AUTH-001)
Given: LoginForm rendered with ssoProviders=[] 
When: component mounts
Then: input[type=email] and input[type=password] are in the document
Priority: Critical | Type: Component

TC-WEB-002: LoginForm_InvalidEmail_ShowsValidationError (FR: AUTH-001)
Given: LoginForm rendered
When: user types 'not-an-email' in email field and submits
Then: text matching /valid email/i is visible
Priority: Critical | Type: Component

TC-WEB-003: LoginForm_EmptyPassword_ShowsValidationError (FR: AUTH-001)
Given: LoginForm rendered
When: user leaves password empty and submits
Then: text matching /required/i is visible for password
Priority: High | Type: Component

TC-WEB-004: LoginForm_ValidCredentials_CallsSignIn (FR: AUTH-002)
Given: LoginForm rendered; signIn mock returns { error: null }
When: user submits valid email + password
Then: signIn('credentials', { email, password, redirect: false }) is called once
Priority: Critical | Type: Component

TC-WEB-005: LoginForm_SsoProvidersMicrosoft_ShowsMicrosoftButton (FR: AUTH-003, PC-007)
Given: LoginForm rendered with ssoProviders=['microsoft']
When: component mounts
Then: button with text matching /microsoft/i is visible
Priority: High | Type: Component

TC-WEB-006: LoginForm_SsoProvidersEmpty_DoesNotShowSsoButtons (FR: AUTH-003, PC-007)
Given: LoginForm rendered with ssoProviders=[]
When: component mounts
Then: no button with text matching /microsoft/i or /google/i
Priority: High | Type: Component

TC-WEB-007: LoginForm_Submitting_ShowsLoadingState (FR: AUTH-001)
Given: LoginForm rendered; signIn never resolves
When: user submits form
Then: submit button is disabled and shows spinner
Priority: Medium | Type: Component
```

### apps/web — RequestStatusBadge Component Tests

```
TC-WEB-008: RequestStatusBadge_Submitted_RendersInformativeColor (FR: REQ-*)
Given: <RequestStatusBadge status='submitted' />
When: rendered
Then: element with text 'Submitted' is in the document
Priority: High | Type: Component

TC-WEB-009: RequestStatusBadge_Approved_RendersWithSuccessColor (FR: REQ-*)
Given: <RequestStatusBadge status='approved' />
When: rendered
Then: element with text 'Approved' is in the document
Priority: High | Type: Component

TC-WEB-010: RequestStatusBadge_Rejected_RendersWithDangerColor (FR: REQ-*)
Given: <RequestStatusBadge status='rejected' />
When: rendered
Then: element with text 'Rejected' is in the document
Priority: High | Type: Component

TC-WEB-011: RequestStatusBadge_UnderReview_RendersCorrectText (FR: REQ-*)
Given: <RequestStatusBadge status='under-review' />
When: rendered
Then: element with text 'Under Review' is in the document
Priority: High | Type: Component
```

### apps/web — RTL Tests

```
TC-RTL-001: RootLayout_ArabicLocale_SetsHtmlDirRtl (FR: PC-009, CEO C3)
Given: root layout rendered with locale='ar'
When: component mounts
Then: html element (or wrapper div) has attribute dir='rtl'
Priority: Critical | Type: Component

TC-RTL-002: RootLayout_EnglishLocale_SetsHtmlDirLtr (FR: PC-009, CEO C3)
Given: root layout rendered with locale='en'
When: component mounts
Then: html element has attribute dir='ltr'
Priority: Critical | Type: Component

TC-RTL-003: ArabicLoginPage_HtmlDir_IsRtl (FR: PC-009, CEO C3) [Playwright]
Given: browser navigates to /ar/login
When: page loads
Then: document.documentElement.getAttribute('dir') === 'rtl'
Priority: Critical | Type: E2E
```

### Widget System

```
TC-WDG-001: WidgetGrid_UnknownWidgetCode_RendersFallbackNotException (CEO C2)
Given: WidgetGrid rendered with a widget config referencing code 'unknown-widget'
When: component mounts
Then: no JavaScript exception is thrown; a fallback UI is rendered
Priority: Critical | Type: Component
```

### E2E Auth Journeys

```
TC-E2E-001: Login_ValidCredentials_RedirectsToDashboard (FR: AUTH-002)
Given: user on /en/login
When: user enters valid email + password and clicks Sign In
Then: URL changes to /en/dashboard (or configured landingPage)
Priority: Critical | Type: E2E

TC-E2E-002: Login_InvalidPassword_ShowsError_StaysOnLoginPage (FR: AUTH-002)
Given: user on /en/login
When: user enters valid email + wrong password
Then: error message visible; URL remains /en/login
Priority: Critical | Type: E2E

TC-E2E-003: UnauthenticatedAccess_Dashboard_RedirectsToLogin (FR: AUTH-007)
Given: unauthenticated browser
When: navigate to /en/dashboard
Then: redirected to /en/login (deep link may be in callbackUrl param)
Priority: Critical | Type: E2E

TC-E2E-004: RTL_ArabicLogin_DirRtl (FR: PC-009, CEO C3)
Given: browser with locale=ar
When: navigate to /ar/login
Then: html[dir=rtl] is set and page text is right-aligned
Priority: Critical | Type: E2E

TC-E2E-005: Notifications_Bell_ShowsUnreadCount (FR: NOT-*)
Given: logged-in user with 3 unread notifications
When: dashboard loads
Then: notification bell badge shows '3'
Priority: High | Type: E2E

TC-E2E-006: Notifications_MarkAllRead_ClearsBadge (FR: NOT-*)
Given: logged-in user with unread notifications
When: open notification panel and click 'Mark all read'
Then: badge disappears; all notifications show as read
Priority: High | Type: E2E

TC-E2E-007: SidebarNav_LTR_RendersOnLeftSide (FR: NAV-002, PC-002)
Given: portal config navLayout === 'sidebar', locale=en
When: dashboard loads
Then: sidebar is visible on the left (logical-inline-start)
Priority: High | Type: E2E

TC-E2E-008: SidebarNav_RTL_RendersOnRightSide (FR: NAV-002, PC-002, PC-009)
Given: portal config navLayout === 'sidebar', locale=ar
When: dashboard loads in Arabic locale
Then: sidebar renders on the right side (dir=rtl causes logical-start to be right)
Priority: High | Type: E2E

TC-E2E-009: TopNavLayout_SidebarNotRendered (FR: PC-002)
Given: portal config navLayout === 'top-nav'
When: dashboard loads
Then: top navigation bar is visible; sidebar is not in the DOM
Priority: Medium | Type: E2E
```

---

## 6. Performance Benchmarks

| Scenario | Target p95 | Target Throughput | Concurrent Users | Tool |
|---|---|---|---|---|
| GET /api/portal-config (cache hit) | < 50 ms | 500 req/s | 100 | k6 |
| GET /api/portal-config (cache miss) | < 300 ms | 50 req/s | 20 | k6 |
| GET /api/notifications | < 200 ms | 200 req/s | 50 | k6 |
| POST /api/auth/login | < 500 ms | 50 req/s | 20 | k6 |
| GET /api/nav | < 150 ms | 300 req/s | 100 | k6 |
| GET /api/services | < 200 ms | 200 req/s | 50 | k6 |
| PATCH /api/notifications/read-all | < 800 ms | 20 req/s | 10 | k6 |
| Rate limit enforcement (auth routes) | 429 returned by attempt 11 | — | 1 | k6 |

Note: cache-miss benchmark for portal-config requires a `service.purgeCache()` call before each VU iteration. The 5-minute NodeCache TTL must be bypassed in the k6 test setup.

---

## 7. Automation Plan

| Test Suite | Automated | CI Stage | Notes |
|---|---|---|---|
| packages/types schema tests | Yes | PR gate — unit | Runs in < 5s; must pass before any merge |
| packages/dataverse-client unit | Yes | PR gate — unit | |
| packages/auth-adapters unit | Yes | PR gate — unit | |
| apps/api service unit tests | Yes | PR gate — unit | |
| apps/api route integration tests | Yes | PR gate — integration | Fastify app.inject() — no external services |
| apps/web component tests | Yes | PR gate — component | jsdom; mocked next-auth and next-intl |
| Playwright E2E — chromium | Yes | Post-merge (staging) | Requires seeded Dataverse + running servers |
| Playwright E2E — ar-rtl | Yes | Post-merge (staging) | RTL assertions critical path |
| Playwright E2E — iPhone 14 | Yes | Post-merge (staging) | Mobile web responsiveness |
| apps/mobile Jest unit (Track B) | Yes (Track B) | PR gate (Track B branch) | Pending Track B build completion |
| Performance (k6) | Yes | Nightly — staging | Not a PR gate; alert on regression > 20% |
| CEO Condition C1 (IAuthAdapter) | Yes | PR gate — unit | TypeScript compile is the primary gate |
| CEO Condition C4 (Tiptap present) | Yes | PR gate — unit | package.json assertion test |
| CEO Condition C5 (poll interval math) | Yes | PR gate — unit | useNotifications hook test |

Manual tests (not automated):
- Visual regression for branding changes (logo, colors, font) — manual sign-off before production
- Biometric login on physical iOS/Android device — one-time device lab test before go-live
- Admin portal-config save and reload cycle — smoke test on staging by QA engineer before each release

---

## 8. Test Naming Convention

Format: `MethodOrScenario_Condition_ExpectedResult`

Examples:
- `getNotificationsForUser_FiltersToCurrentUser_ReturnsOnlyOwnedItems`
- `LoginSchema_InvalidEmail_ReturnsZodError`
- `LoginForm_SsoProvidersMicrosoft_ShowsMicrosoftButton`

Single assertion concept per test. Multiple `expect` calls on one result object are acceptable. Testing two unrelated behaviors in one test is a defect.

---

## 9. Track C and Track B Stubs

Test files that depend on services still being built include stub comments:

```typescript
// TODO(TRACK-C): implement after CmsService route tests land
// TODO(TRACK-B): implement after expo-local-authentication mock is wired in
```

These stubs must not contain `expect(true).toBe(true)` placeholders.
Each stub describes the test shape so the implementing agent can fill it correctly.

---

## 10. Definition of Done

A feature is not done until ALL of the following pass without exception:

- [ ] Unit tests written BEFORE implementation (Red) — commit hash proves test precedes source
- [ ] All unit tests pass (Green)
- [ ] No function exceeds 20 lines; refactor pass complete (Refactor)
- [ ] `packages/types`: 100% Zod schema parse-success and parse-failure tests present
- [ ] `packages/dataverse-client`: 95%+ coverage including retry and auth-error branches
- [ ] `packages/auth-adapters`: 90%+ coverage; all three adapters tested
- [ ] `apps/api`: 85%+ coverage; all routes have 401 + happy-path tests minimum
- [ ] `apps/web`: 80%+ coverage; LoginForm and RequestStatusBadge fully tested
- [ ] All Playwright E2E scenarios in TC-E2E-001 through TC-E2E-009 pass on staging
- [ ] RTL assertions (TC-RTL-001 through TC-RTL-003) pass in ar-rtl Playwright project
- [ ] CEO Conditions C1 (IAuthAdapter), C3 (RTL), C5 (poll interval) verified by tests
- [ ] CEO Condition C4 verified: `@tiptap/react` present in `apps/web/package.json`
- [ ] No `any` types in test files — all mock return values are fully typed
- [ ] No `console.log` in production code — only structured logger
- [ ] Performance benchmarks met on staging (p95 values as per Section 6)
- [ ] Rate limit (10 req/min on auth routes) verified by integration test
- [ ] Security: JWT forgery returns 401; role escalation to Admin returns 403
- [ ] `vitest run --coverage` passes thresholds in all packages
- [ ] Playwright HTML report archived as CI artifact
- [ ] Track C CmsService tests pass (CmsService.test.ts in apps/api)
- [ ] Track B mobile tests defined (even if pending device — stubs committed)
