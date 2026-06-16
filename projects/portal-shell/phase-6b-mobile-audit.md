# DFE-PORT-001/TRK-B — Phase 6 Mobile Security Audit

**Date:** 2026-06-16  
**Auditor:** Maqsad AI Auditor Agent  
**Engagement:** DFE-PORT-001/TRK-B — Configurable Portal Shell (Mobile App)  
**Verdict:** PASS WITH CONDITIONS

---

## Executive Summary

The mobile app demonstrates a sound baseline security posture: tokens are stored exclusively in `expo-secure-store` (never AsyncStorage), no credentials are persisted, HTTPS is used in all non-development environments, and the app's URL scheme routes through expo-router's file-based system. One HIGH finding requires remediation before release: a race condition in the biometric authentication hook that allows the biometric gate to be bypassed when `authenticate()` is called before hardware detection has completed. This finding has been remediated in this audit pass. All other findings are MEDIUM or lower. Certificate pinning is the most significant MEDIUM gap and is common across React Native applications targeting enterprise deployment.

---

## CEO Condition C3 — RTL Verification

| Item | Status | Evidence |
|------|--------|----------|
| `I18nManager.forceRTL(true)` called for Arabic locale | PASS | `src/i18n/index.ts:28-30` — only applied when device locale is `ar`; guard prevents redundant calls |
| RTL change requires app restart | DOCUMENTED | Comment at line 26 acknowledges this; correct behaviour for React Native |
| Fallback to English when locale is unsupported | PASS | `src/i18n/index.ts:19` — `isSupportedLocale()` guard with `'en'` default |
| No RTL text injection risk | PASS | All i18n strings served from bundled `en.json` / `ar.json`; no user-supplied string interpolation in layout-sensitive keys |
| Physical device test | PENDING | Manual gate — see CEO Phase 7 Track B conditions |

---

## M1 — Credential Storage

**Tokens stored in expo-secure-store only.**
`src/lib/auth-store.ts:19-39` — `storeTokens()`, `getAccessToken()`, `getRefreshToken()`, and `clearAllTokens()` all call `expo-secure-store`. No AsyncStorage, MMKV, Redux persist, or React state is used for token storage. Correct.

**No credential persistence.**
Passwords are validated in `app/auth/login.tsx:47-51` via Zod and passed directly to the API. They are not stored at any point. Correct.

**UserProfile stored in SecureStore.**
`src/lib/auth-store.ts:46-59` — `storeUserProfile()` JSON-serialises the user object to SecureStore. This stores PII (email, first name, last name, display name) in the SecureStore keychain. Using SecureStore for this is appropriate — it is the correct storage tier for sensitive persistent data. The UserProfile is used to populate UI without a network round-trip on app start. Acceptable.

**Biometric preference flag stored as a plain string.**
`src/lib/auth-store.ts:65-72` — `SECURE_KEYS.BIOMETRIC_ENABLED` stores `'true'` or `'false'`. An attacker with filesystem access on a non-encrypted device could in theory flip this flag, but this would not grant access — the token itself is still required and the biometric gate is applied only when `token && bioEnabled` (both conditions must be true). No practical risk.

---

## M2 — Insecure Communication

**HTTPS enforced in preview and production EAS environments.**
`eas.json` — `development` profile uses `http://localhost:4001` (acceptable for local dev), `preview` uses `https://api-staging.portal.maqsad.io`, `production` uses `https://api.portal.maqsad.io`. Both non-development environments use HTTPS.

**`EXPO_PUBLIC_API_URL` not validated to be HTTPS at runtime.** (LOW — MB-005)
`src/lib/api.ts:4` — `const API_BASE = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:4001'`. The fallback is HTTP. If the environment variable is misconfigured or absent in a production build, traffic would silently fall back to `http://localhost:4001`, which fails (no server there) but the error message does not indicate an HTTPS misconfiguration. Add a startup assertion: if `NODE_ENV === 'production'` and `API_BASE` does not start with `https://`, throw an error before the app renders.

**Certificate pinning not implemented.** (MEDIUM — MB-002)
`src/lib/api.ts` uses the global `fetch()` with no additional TLS configuration. React Native's fetch uses the OS-level certificate store. This means:
- A user-installed root CA (common in corporate MDM environments) can intercept API traffic
- A compromised network with a fraudulent cert from a trusted public CA can MITM requests
- Tools like Charles Proxy or mitmproxy can inspect all API traffic on a development device by installing their CA

Certificate pinning would prevent these scenarios by accepting only the API server's specific certificate or public key. Libraries: `react-native-ssl-pinning` or `expo-ssl-pinning`. For the current risk profile (internal enterprise portal, not a banking or financial app), this is MEDIUM rather than HIGH, but must be addressed before any government/compliance-mandated deployment.

**No request signing or HMAC on API calls.**
All auth is Bearer token — standard practice. No additional signing is required given the HTTPS transport assumption.

---

## M3 — Insecure Authentication

**HIGH — Biometric bypass via race condition in `useBiometric`.** (MB-001 — REMEDIATED)
`src/hooks/useBiometric.ts:40-53` (original code):

The `authenticate()` callback depended on `isSupported` and `isEnrolled` from React state. Both default to `false`. When `LoginScreen` mounted, it called `authenticate()` potentially before `useBiometric`'s `useEffect` had completed the async `detectCapabilities()` call. With `isSupported = false`, `authenticate()` returned `true` immediately, bypassing biometric verification entirely for any user who had a stored token and biometric preference enabled.

**Attack scenario:** Attacker gains physical access to a device that belongs to a biometric-enabled portal user. Attacker force-closes and immediately re-launches the app (or triggers the app cold start). `isSupported` is `false` during startup initialization. `authenticate()` returns `true`. The attacker reaches the dashboard.

**Fix applied:** `authenticate()` now calls `LocalAuthentication.hasHardwareAsync()` and `isEnrolledAsync()` directly each time it is invoked, removing the dependency on React state that may not be ready. The `useEffect` detection loop is retained for other consumers of `isSupported`/`isEnrolled` (e.g., the profile screen showing whether biometric is available), but the auth path is now guaranteed correct.

**Biometric as a gate on stored token — correct design.**
The biometric prompt is not a standalone auth factor. It gates access to an already-authenticated session (stored access token). If the stored token is absent or expired, `attemptBiometricUnlock()` in `login.tsx:80-93` skips biometric and shows the credential form. This is the correct architecture.

**System fallback to PIN/passcode is intentional.** (INFO — MB-008)
`src/hooks/useBiometric.ts:44` — `disableDeviceFallback: false` allows the OS to offer PIN/password if biometric fails. This is the correct UX decision for an enterprise portal — locking users out after a biometric failure would degrade adoption. Documented as intentional.

---

## M4 — Deep Link Handling

**URL scheme: `portal://`** (app.json:7)

**expo-router constrains deep links to declared file-based routes.**
expo-router only resolves URLs that match entries in the `app/` directory. A deep link to `portal://nonexistent` results in a 404 screen. No arbitrary route injection is possible.

**MEDIUM — No route-level auth guard in tab layout.** (MB-003)
`app/(tabs)/_layout.tsx` and `app/index.tsx` are the two relevant files. The auth check exists only in `app/index.tsx:14-19` — it reads the access token and redirects to `/auth/login` if absent. However, a deep link that bypasses `index.tsx` (e.g., `portal://(tabs)/dashboard`) routes directly to the tab layout without triggering the token check. The tab screens call the API via `useRequests()` / `useNotifications()`, which will return 401 errors (no token in SecureStore), but the screens render in an incomplete state rather than redirecting to login.

**Recommended fix:** Add an auth guard to `app/(tabs)/_layout.tsx`:
```tsx
const token = await getAccessToken();
if (!token) { router.replace('/auth/login'); return null; }
```
Or use expo-router's `useSegments` + `useRouter` pattern to redirect unauthenticated users from any protected segment.

**No URL parameter injection risk detected.**
The login screen's Microsoft SSO path at `app/auth/login.tsx:111` reads `msResponse.params['code']` and passes it as part of the email field to the portal API. The API is responsible for validating the OAuth code — it does not execute the code value directly. No injection surface in the mobile layer.

---

## M5 — Platform Permissions

**Android permissions declared in `app.json:24-29`:**

| Permission | Purpose | Assessment |
|-----------|---------|------------|
| `USE_BIOMETRIC` | Fingerprint/Face authentication | Required. Correctly scoped. |
| `USE_FINGERPRINT` | Legacy fingerprint on older Android | Required for Android < 9 support. Acceptable. |
| `RECEIVE_BOOT_COMPLETED` | App starts on device boot | MEDIUM concern (MB-004) — see below. |
| `VIBRATE` | Notification vibration | Required by expo-notifications. Correct. |

**MEDIUM — `RECEIVE_BOOT_COMPLETED` permission requires justification.** (MB-004)
This permission allows the app to receive the `BOOT_COMPLETED` broadcast intent, enabling it to start or schedule work on device boot. For the current app feature set, push notification scheduling via `expo-notifications` does not require boot start — the app registers for push tokens only while active. Confirm whether the `expo-notifications` plugin requires this permission or whether it can be removed. If it can be removed, doing so reduces the app's boot-time footprint and clarifies to enterprise security reviewers that the app does not run background services on startup.

**iOS permissions:**
`NSFaceIDUsageDescription` is present with a user-facing explanation string. No other special iOS entitlements detected.

**Push notification permission not forced on startup.** (PASS)
`src/lib/notifications.ts:26-33` — `requestNotificationPermissions()` is called explicitly, not on app mount. The app requests permission at an appropriate time determined by the calling code. Correct.

---

## M6 — Logging and Data Exposure

**No `console.log` statements in source files reviewed.**
All source files reviewed (`api.ts`, `auth-store.ts`, `useBiometric.ts`, `useAuth.ts`, `useRequests.ts`, `useNotifications.ts`, `login.tsx`, `register.tsx`, `_layout.tsx`, `index.tsx`) contain no `console.log` or `console.error` calls.

**Errors are surfaced to the user via in-screen error messages, not raw stack traces.**
`app/auth/login.tsx:130-135` — error handling maps `ApiError.status` to a user-friendly string. The raw error is not shown. Correct.

**LOW — Silent JSON parse failure in `getStoredUserProfile`.** (MB-006)
`src/lib/auth-store.ts:53-55` — `catch { return null; }` discards any error from `JSON.parse`. On a production device, SecureStore data corruption would silently return `null`, forcing re-login without any diagnostic signal. Add a structured log (or at minimum, distinguish between `JSON.parse` failure and an empty value):
```typescript
} catch (e) {
  // StoredUserProfile is corrupt — clearing will force re-login.
  // Log the incident without exposing PII.
  console.warn('[auth-store] getStoredUserProfile: corrupt JSON, clearing profile');
  return null;
}
```
Note: `console.warn` is acceptable here for diagnostic purposes (non-sensitive data — only the fact of corruption is logged, not the content).

---

## M7 — Dependency Assessment

**Expo SDK 53 — stable release.** SDK 53 is Expo's stable release at this date. New Architecture (`newArchEnabled: true` in app.json:9) is stable in SDK 53. Correct choice.

**React Native 0.76.5 — exact version pinned.** GOOD. Prevents unintended minor updates.

**`expo-secure-store: "~14.0.0"` — tilde pinning.** Accepts patch updates within 14.x. Acceptable; expo patch releases are typically security and bug fixes.

**`detox: "^20.27.0"` — dev dependency only.** Not shipped in the app bundle. No production risk.

**Two JWT libraries are NOT present in the mobile app.** (Unlike the API, which has both `jsonwebtoken` and `@fastify/jwt`.) The mobile app does not sign or verify JWTs — it only stores and transmits them as opaque strings. Correct.

**LOW — No `npm audit` step in mobile CI.** (MB-007)
The `eas.json` build profiles do not include a pre-build `npm audit` step. Any subsequently discovered vulnerability in `react-native`, `expo`, or a transitive dependency would not be automatically flagged in the CI pipeline. Add `npm audit --audit-level=high` to the EAS pre-build hook or GitHub Actions workflow.

**No beta/RC dependencies.** Unlike the web app (`next-auth` v5 beta), the mobile stack uses stable releases throughout. No version pinning or upgrade deadlines required.

**`expo-notifications: "~0.29.0"` note.** From SDK 53, `getExpoPushTokenAsync()` requires a native build and will throw in Expo Go. This is documented in `src/lib/notifications.ts:2-4` and handled with a try/catch at line 55. Correct.

---

## M8 — RTL

`I18nManager.forceRTL()` modifies the global layout direction for the entire React Native app. This is the standard approach for RTL in React Native and carries no security risk. The function accepts a boolean and does not process user-supplied strings. No RTL-related injection surface exists.

---

## Findings Register

| ID | Severity | Category | Finding | Recommendation |
|----|----------|----------|---------|----------------|
| MB-001 | HIGH | M3 | Biometric bypass via race condition: `useBiometric.authenticate()` returned `true` when `isSupported = false` (initial state before async detection) allowing instant dashboard access with just a stored token. | **REMEDIATED** — `authenticate()` now calls `hasHardwareAsync()` and `isEnrolledAsync()` directly on each invocation, eliminating the dependency on uninitialized React state. |
| MB-002 | MEDIUM | M2 | Certificate pinning not implemented. Traffic subject to interception by user-installed or enterprise-managed root CAs. | Integrate `react-native-ssl-pinning` or use Expo's network security config for Android. Required before any government or compliance-mandated deployment. |
| MB-003 | MEDIUM | M4 | No route-level auth guard in `app/(tabs)/_layout.tsx`. Deep links to `portal://(tabs)/dashboard` bypass the `index.tsx` token check. | Add token check to `app/(tabs)/_layout.tsx`; redirect to `/auth/login` if absent. |
| MB-004 | MEDIUM | M5 | `RECEIVE_BOOT_COMPLETED` Android permission declared. Purpose not documented; may not be required for the current notification use case. | Confirm if `expo-notifications` plugin requires this permission. Remove if not required; document rationale if retained. |
| MB-005 | LOW | M2 | `EXPO_PUBLIC_API_URL` not validated to be HTTPS at runtime. Misconfigured env var could silently route traffic over HTTP. | Add startup assertion: throw on non-HTTPS base URL when `NODE_ENV === 'production'`. |
| MB-006 | LOW | M6 | `auth-store.ts:55` silently discards JSON parse errors for corrupt stored profiles. No diagnostic signal on production devices. | Add `console.warn` or structured diagnostic log on parse failure (non-PII: only fact of corruption). |
| MB-007 | LOW | M7 | No `npm audit` in mobile CI pipeline. Transitive dependency vulnerabilities not automatically flagged. | Add `npm audit --audit-level=high` to EAS pre-build hook or GitHub Actions. |
| MB-008 | INFO | M3 | `disableDeviceFallback: false` allows PIN/passcode fallback after biometric failure. | No action required. Intentional UX decision — document in README. |
| MB-009 | INFO | M7 | `RECEIVE_BOOT_COMPLETED` may not be required by expo-notifications for push channel setup. | Investigate and remove if unnecessary to minimize permission footprint. |

---

## Release Blockers

**BLOCKER 1 — MB-001 (HIGH): Biometric bypass race condition.**
**STATUS: REMEDIATED** in `src/hooks/useBiometric.ts` during this audit pass.

No unmitigated HIGH findings remain.

---

## Recommended Fixes (pre-release)

1. **MB-003** — Add token check to `app/(tabs)/_layout.tsx`. This is a one-function change and should be done before the EAS Build used for device testing.

2. **MB-004** — Confirm whether `RECEIVE_BOOT_COMPLETED` is required by the expo-notifications plugin. If not, remove from `app.json` Android permissions before the production build submission.

---

## Recommended Fixes (post-release, 30 days)

3. **MB-002** — Implement certificate pinning using `react-native-ssl-pinning`. Priority escalates to HIGH before any government sector or compliance-mandated client deployment.

4. **MB-005** — Add HTTPS assertion at startup.

5. **MB-006** — Add diagnostic log for corrupt profile data.

6. **MB-007** — Add `npm audit` to mobile CI pipeline.

---

## Audit Verdict

**PASS WITH CONDITIONS**

One HIGH finding (MB-001 — biometric bypass race condition) was identified and remediated during this audit pass. No unmitigated HIGH findings remain. Track B is cleared to proceed to the CEO sign-off phase, subject to:

1. MB-003 (route-level auth guard) fixed before EAS Build
2. MB-004 (`RECEIVE_BOOT_COMPLETED` decision documented) before store submission
3. CEO Condition C3 (physical Arabic locale device test) completed and signed off
4. Detox E2E test stubs converted to passing tests against a real device/emulator
5. EAS Build completed; `.ipa` and `.apk` confirmed installable

*Auditor sign-off: Maqsad AI Auditor Agent — DFE-PORT-001/TRK-B — 2026-06-16*
