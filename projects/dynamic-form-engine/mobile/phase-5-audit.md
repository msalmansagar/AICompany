═══════════════════════════════════════════════════════════════════
PHASE 5 — SECURITY AND COMPLIANCE AUDIT
Dynamic Form Engine — Mobile Rendering Extension (QDB)
═══════════════════════════════════════════════════════════════════
Project:       Dynamic Form Engine — Mobile Rendering Extension
Client:        Qatar Development Bank (QDB)
Prepared by:   Maqsad AI — Auditor and Governance Specialist
Date:          2026-05-25
Version:       1.0 (Final)
Status:        FINAL — NOT CLEARED FOR MOBILE UAT
Parent Audit:  projects/dynamic-form-engine/phase-6-audit.md (v1.1)
BRD:           projects/dynamic-form-engine/mobile/brd.md
Architecture:  projects/dynamic-form-engine/mobile/phase-2-arch.md
Build:         projects/dynamic-form-engine/mobile/phase-3-tech.md
QA:            projects/dynamic-form-engine/mobile/phase-4-qa.md
Code Review:   projects/dynamic-form-engine/mobile/code-review.md
═══════════════════════════════════════════════════════════════════


1. EXECUTIVE SUMMARY
══════════════════════════════════════════════════════════════════

Verdict:          PASS WITH CONDITIONS
Overall Risk:     HIGH

The mobile extension is architecturally sound in several important
areas. Authentication is correctly designed using MSAL React Native
with PKCE via the system browser (no WebView), with tokens held
exclusively in Expo SecureStore (iOS Keychain / Android Keystore).
No PII is persisted to device storage in Phase 1. The shared engine
extraction (Option C) is the correct architectural choice and avoids
rule engine duplication. The 50ms debounce on rule evaluation is a
practical performance safeguard. The audit log channel extension
(qdb_channel) is additive and non-destructive.

Despite these positives, seventeen security and governance findings
exist across the mobile layer. Eight are Critical or High severity
and must be resolved before mobile UAT begins.

The five most urgent issues are:

1. GATE-A / GATE-B NOT YET RESOLVED (CRITICAL — Inherited): The
   mobile app's entire authentication layer and data residency
   posture are blocked by the same external gates as the web portal.
   Written confirmation from QDB on tenant type (MOBILE-GATE-A) and
   Qatar North Dataverse org (MOBILE-GATE-B) have not been received.
   Mobile UAT cannot begin without both.

2. X-CLIENT-PLATFORM HEADER IS TRIVIALLY SPOOFABLE (HIGH): The
   backend assigns the audit channel (web vs. mobile) based on the
   X-Client-Platform header from the incoming request. Any caller
   (including a web browser or Postman) can send this header with
   value "mobile" or omit it to appear as "web." Channel attribution
   in the audit log is not reliable. A mobile submission could be
   logged as "web" and vice versa.

3. JAILBREAK/ROOT DETECTION DEFERRED TO PRODUCTION (HIGH): MNFR-008
   is explicitly deferred. A jailbroken iOS or rooted Android device
   can bypass Expo SecureStore's hardware-backed encryption in some
   scenarios (keychain accessible in plaintext on jailbroken iOS
   without Secure Enclave access restrictions). Banking applications
   running on compromised OS have no runtime integrity guarantee.
   This is classified as a Production Gate item but the risk during
   any extended UAT period on physical devices is real.

4. CERTIFICATE PINNING DEFERRED (MEDIUM-HIGH): MNFR-009 is deferred
   to Phase 2 with only standard TLS validation in Phase 1. On a
   compromised or jailbroken device, a user-installed CA certificate
   can enable TLS interception, exposing all API traffic including
   Bearer tokens and form field values in transit. The combination of
   no jailbreak detection and no certificate pinning creates a layered
   risk.

5. STALE FORM LIST CACHE COULD EXPOSE DEACTIVATED FORMS (HIGH):
   GET /api/forms caches per user with a 60-second TTL. A form that
   is deactivated in Dataverse (qdb_is_active set to false by an
   administrator) will remain visible in the mobile form list for up
   to 60 seconds after deactivation. A user who opens the form during
   this window will receive a 404 from the metadata endpoint, but
   the form's existence is already visible to the user. For forms
   that are deactivated due to regulatory reasons (e.g., product
   withdrawn from market), this brief disclosure window is a
   governance concern.

The audit also identifies three new mobile-specific Sprint 1 blockers
that are not present in the web engagement and must be resolved before
mobile UAT begins, independent of the web Sprint 1 remediation status.

Code review passed (10 violations fixed, 5 warnings resolved). The
fixed implementations are reviewed in this audit and one additional
security issue is identified in the code review fix outputs.


2. SECURITY FINDINGS TABLE
══════════════════════════════════════════════════════════════════

──────────────────────────────────────────────────────────────────
MSEC-001
Severity:    CRITICAL (UAT Blocker)
Confidence:  99%
Area:        Authentication — Tenant Type Unconfirmed
Description: The mobile app's MSAL configuration targets a single-
  tenant Azure AD authority:
    https://login.microsoftonline.com/{EXPO_PUBLIC_AZURE_AD_TENANT_ID}
  This is identical to the web portal's ADR-007 assumption. If QDB
  portal users are external bank customers (not corporate AD members),
  the MSAL configuration must target Entra External ID with a
  different authority URL, different token claim mappings, and
  different SecureStore key strategy. The mobile app inherits the
  full risk of web AUDIT-009 / BLOCKER-8. No written confirmation of
  MOBILE-GATE-A has been received as of this audit date.
Risk: Mobile auth layer requires complete rebuild (estimated 3-5 days)
  if the tenant assumption is wrong. If mobile UAT proceeds without
  confirmation, all auth test results are potentially invalid.
Mitigation:
  1. MOBILE-GATE-A is a hard stop. No auth code is finalised until
     written confirmation from QDB project sponsor is received.
  2. During parallel development, the MSAL mock provider in the
     development build must accurately simulate both single-tenant
     and Entra External ID flows so that when confirmation arrives,
     only the auth layer needs switching.
  3. Auth integration tests (MTC-056, MTC-071, MTC-080) must not
     be marked passed until real MSAL (not mock) is tested against
     the QDB Azure AD tenant on physical devices.
Residual Risk: LOW once MOBILE-GATE-A is resolved and real MSAL
  integration is confirmed on physical iOS and Android devices.

──────────────────────────────────────────────────────────────────
MSEC-002
Severity:    CRITICAL (UAT Blocker)
Confidence:  99%
Area:        Data Residency — Inherited from Web
Description: The mobile app writes all form submissions, draft records,
  and audit log entries to the same Dataverse organisation as the web
  portal. The parent web audit (AUDIT-001) established that the current
  Dataverse org (org5869857f.crm4.dynamics.com / CRM4 = West Europe)
  violates C-005 and MC-006 of the mobile BRD. Mobile traffic does not
  route through a different data path; the backend API writes to the
  same Dataverse org regardless of whether the request originated from
  a web browser or a mobile app. MOBILE-GATE-B requires written
  confirmation from QDB IT that a Qatar North or UAE North Dataverse
  environment is available.
Risk: All mobile submissions land in West Europe. Qatar PDPPL
  (Law No. 13 of 2016) cross-border transfer requirements apply to
  mobile-originating PII equally. QCB compliance gap is identical.
Mitigation:
  1. MOBILE-GATE-B is a hard stop, identical to web GATE-B. Mobile
     UAT must not begin until QDB IT confirms the Qatar/UAE North
     Dataverse org URL in writing.
  2. The mobile development backend configuration must use a dev-only
     mock Dataverse endpoint for Sprint 1 build activities to avoid
     creating production-adjacent data in the wrong region.
Residual Risk: LOW once MOBILE-GATE-B is resolved and the
  production/UAT Dataverse org URL is confirmed in the correct region.

──────────────────────────────────────────────────────────────────
MSEC-003
Severity:    HIGH (UAT Blocker)
Confidence:  95%
Area:        Audit Log Integrity — Channel Header Spoofable
Description: The mobile app sets the custom request header
  X-Client-Platform: mobile on all API calls (phase-3-tech.md, B-4,
  M-4). The backend requestLogger.ts reads this header and sets
  qdb_channel = 'mobile' on audit log entries. This header is not a
  security control — it is a trust signal from an untrusted client.
  Any caller with a valid Bearer token (including a web browser with
  the developer tools console or a Postman client) can set this header
  to 'mobile' and have their submissions logged as mobile-origin.
  Conversely, a mobile client that strips or modifies the header
  would be logged as 'web'. The channel attribution in the audit log
  is not reliable.

  For QCB regulatory examination purposes, the qdb_channel field
  is described in MBR-011 as a key differentiator for compliance
  reporting. If this field can be spoofed, channel-based compliance
  statistics are unreliable.
Risk: Inaccurate audit log channel attribution. A regulatory examiner
  querying "all mobile submissions in Q1" would receive an incomplete
  and potentially manipulated result set.
Mitigation:
  1. Accept that client-side channel headers cannot be cryptographically
     verified in this architecture. Document this limitation explicitly
     in the compliance register as an accepted risk with the following
     compensating control.
  2. Compensating control: the Bearer token's app registration client ID
     is present in the JWT claims (appid / azp claim). The mobile app
     registration has a different client ID than the web SPA registration.
     The backend can extract the azp claim from the validated JWT and
     set qdb_channel based on which client ID is present — not the
     header. This is a cryptographic guarantee, not a trust signal.
  3. Update requestLogger.ts and CrmAuditService.ts to derive channel
     from req.user.appId (JWT azp claim) compared to environment
     variables MOBILE_APP_CLIENT_ID and WEB_APP_CLIENT_ID.
  4. The X-Client-Platform header may still be logged as structured
     metadata for diagnostics, but it must not be the authoritative
     source for qdb_channel.
Residual Risk: LOW once JWT-claim-based channel derivation is
  implemented. The azp claim is signed by Azure AD and cannot be
  spoofed by the client.

──────────────────────────────────────────────────────────────────
MSEC-004
Severity:    HIGH (Production Gate)
Confidence:  97%
Area:        Device Integrity — Jailbreak/Root Detection Absent
Description: MNFR-008 explicitly defers jailbreak and root detection
  to production hardening. The mobile app will be distributed to real
  bank customer devices during UAT without this control. On a
  jailbroken iOS device, the Expo SecureStore Keychain entries may be
  accessible to other processes or extraction tools (e.g., Frida,
  objection) even with Secure Enclave protection, depending on the
  jailbreak method. On a rooted Android device, Android Keystore
  isolation is weakened. The app would run on a compromised OS
  without any detection or warning.

  Banking industry standards (PCI DSS 6.3, OWASP MASVS-RESILIENCE)
  recommend jailbreak/root detection for banking applications handling
  financial form submissions.
Risk: Token extraction on jailbroken devices; session hijack; form
  submission forgery.
Mitigation:
  1. Classify as a Production Gate item (MPROD-001). Mobile UAT may
     proceed on UAT devices managed by QDB Mobile Team with known
     non-jailbroken OS, but production release is blocked until
     MNFR-008 is implemented.
  2. Before UAT begins, QDB Mobile Team must confirm that UAT test
     devices are not jailbroken/rooted. This must be documented in
     the UAT entry checklist.
  3. The production hardening ADR must select the detection library
     (react-native-device-info or dedicated alternative) and define
     the exact app behaviour on detection (warn vs. terminate) per
     QDB Security decision, before MNFR-008 implementation begins.
  4. QDB Security must provide written acceptance that no jailbreak
     detection exists during UAT (time-limited risk acceptance).
Residual Risk: MEDIUM for UAT (acceptable with QDB Security sign-off
  on managed UAT devices). LOW for production once MNFR-008 is
  implemented.

──────────────────────────────────────────────────────────────────
MSEC-005
Severity:    HIGH (Production Gate)
Confidence:  90%
Area:        Transport Security — Certificate Pinning Absent
Description: MNFR-009 defers certificate pinning to Phase 2. Standard
  TLS certificate validation (system CA store) is used in Phase 1.
  On a device where a user (or a MDM policy gone wrong) has installed
  a rogue CA certificate, TLS interception (MITM) is possible. All
  API traffic — including Bearer tokens, form field values (National
  ID numbers, income figures, loan amounts), and file upload payloads
  — would be visible to the intercepting party. On a jailbroken device
  (MSEC-004), both risks compound: the OS CA store can be manipulated
  and the SecureStore may be accessible.
Risk: Bearer token interception; PII in transit disclosure; session
  replay attacks.
Mitigation:
  1. Classify as a Production Gate item (MPROD-002). UAT on managed
     QDB devices is acceptable with standard TLS.
  2. The Phase 2 production hardening ADR must document the certificate
     pinning decision explicitly: whether to implement it (and accept
     the operational risk of app-update-on-cert-rotation) or to accept
     the residual risk without pinning (and document compensating
     controls including forced HTTPS ATS/Network Security Config,
     Azure AD token short lifetime, and CAE).
  3. Before the ADR is filed, QDB Security must acknowledge the
     residual risk in writing. The ADR is a condition of production
     go-live.
Residual Risk: MEDIUM without pinning in production. LOW with pinning
  plus jailbreak detection. MEDIUM-HIGH with neither (unacceptable
  for banking production without explicit QDB Security written
  acceptance).

──────────────────────────────────────────────────────────────────
MSEC-006
Severity:    HIGH (UAT Blocker)
Confidence:  93%
Area:        Deep Link Security — Custom URI Scheme Hijacking
Description: The MSAL redirect URI msauth://com.qdb.formengine/callback
  is registered as a custom URI scheme in app.json. On Android, custom
  URI schemes are not exclusive to a single app — any app installed on
  the device can register the same URI scheme and intercept deep links.
  This is a known Android limitation. On iOS, custom URI schemes are
  similarly not guaranteed to be unique prior to iOS 14+ Universal
  Links.

  If a malicious app on the same device registers the same URI scheme
  (msauth://com.qdb.formengine), it could intercept the authorization
  code from the Azure AD PKCE redirect before MSAL receives it. This
  is mitigated by PKCE (the code_verifier binds the auth code to the
  session), but on Android the deep link interception window still
  creates a risk.

  iOS 18+: ASWebAuthenticationSession returns the redirect to the
  system browser, which routes to the registered app. iOS enforces
  the bundle ID match. Lower risk on iOS.

  Android 13+ (API 33+): The BRD targets Android 13+, where App
  Links (HTTPS scheme with Android Asset Links JSON verification)
  replace custom URI schemes for OAuth redirects. MSAL Android SDK
  supports App Links natively. The custom URI scheme pattern is the
  less secure older pattern.
Risk: Authorization code interception on Android by a malicious app
  on the same device. PKCE mitigates token issuance but the code
  is briefly exposed.
Mitigation:
  1. For Android: evaluate migrating the MSAL redirect URI to an
     HTTPS-based Android App Link (e.g., https://qdb-forms.qdb.com.qa/
     msal/callback) with a verified Asset Links JSON file served from
     the backend. MSAL Android SDK supports this since version 2.x.
     This eliminates the custom URI scheme interception risk entirely
     on Android 13+.
  2. For iOS: ASWebAuthenticationSession already enforces bundle ID
     ownership. Document this as low-risk for iOS.
  3. If App Links migration is not completed before UAT, obtain written
     risk acceptance from QDB Security acknowledging the PKCE-mitigated
     residual risk on Android.
  4. Add an ADR (MADR-006) documenting the redirect URI scheme decision
     before UAT begins.
Residual Risk: LOW on iOS. MEDIUM on Android with custom URI scheme
  (PKCE mitigates the most serious impact). LOW on Android if App
  Links are implemented.

──────────────────────────────────────────────────────────────────
MSEC-007
Severity:    HIGH (UAT Blocker)
Confidence:  90%
Area:        New Backend Endpoint — GET /api/forms Access Control
Description: The new GET /api/forms endpoint (FormListController.ts,
  B-2) applies form-level access control via resolveUserGroupIds()
  inside the controller. This is correct in principle. However, the
  endpoint is registered on the forms router (B-3) which applies
  authMiddleware globally, but the roleMiddleware described in the
  web architecture (and required by web BLOCKER-4) is not shown as
  explicitly applied to this new list route in the code.

  In the web engagement, BLOCKER-4 identified that roleMiddleware
  was completely absent from the forms router registration in index.ts.
  The mobile GET /api/forms endpoint uses a different pattern:
  it calls resolveUserGroupIds() inside the controller rather than
  relying on roleMiddleware as a registered middleware. This is an
  architectural inconsistency.

  The security risk is: if the web Sprint 1 fix for BLOCKER-4 applies
  roleMiddleware globally to the forms router, but the mobile endpoint's
  access control logic is inside the controller (not the middleware),
  future code changes could bypass the controller-level check without
  triggering any middleware-layer safety net.

  Additionally, the LRU cache key is formList:{userOid}. If a user's
  AD group membership changes (e.g., access is revoked between requests),
  the cached form list for that user remains valid for up to 60 seconds.
  A revoked user can still see (but not open — the metadata endpoint
  enforces RBAC) a form they should no longer have access to.
Risk: Access control at the list endpoint is inconsistent with the
  web middleware pattern, creating a maintenance risk. Cache-based
  stale access disclosure (form visibility, not data disclosure).
Mitigation:
  1. Consolidate access control: move the resolveUserGroupIds() call
     from the controller into the roleMiddleware so all forms routes
     use a single, consistent enforcement layer. The controller
     receives the resolved group IDs from req.user.resolvedGroupIds.
  2. Document the 60-second cache staleness as an accepted risk in
     the compliance register. For deactivated forms, the metadata
     endpoint returns 404 regardless, so no data is disclosed.
  3. Add a cache invalidation hook: when a form is deactivated
     (qdb_is_active set to false), the backend's form list cache
     should be cleared. This is a backend enhancement to the existing
     cache invalidation strategy.
  4. Reduce the form list cache TTL to 30 seconds (down from 60) as
     a lower-cost mitigation for the staleness risk.
Residual Risk: LOW for data disclosure (metadata endpoint independently
  guards access). MEDIUM for access control inconsistency until the
  middleware consolidation is done.

──────────────────────────────────────────────────────────────────
MSEC-008
Severity:    HIGH (Inherited — Backend Must Fix Before Mobile UAT)
Confidence:  99%
Area:        File Upload — MIME Detection and Virus Scan
Description: The mobile app's NativeFileUploadField uses expo-image-picker
  and expo-document-picker to obtain files and uploads them to the
  existing POST /api/files/upload endpoint. The parent web audit
  (AUDIT-002 / BLOCKER-2) identified that this endpoint uses header-
  based MIME type detection (multer reads Content-Type from the
  client) with no magic bytes inspection and no virus scanning.

  Camera-captured images from a mobile device are particularly high
  risk because:
  a) The image is sourced from the device camera, bypassing any
     desktop antivirus that might scan files before upload.
  b) The launchCameraAsync call in launchCamera() returns a file URI
     with mimeType from the picker — this is a client-reported value
     that can be spoofed on a jailbroken device.
  c) A jailbroken device could intercept the file URI returned by
     ImagePicker and substitute a different file (e.g., a script or
     executable) before the upload call.
Risk: Malware enters QDB CRM Notes via mobile file upload path.
  Same impact as web AUDIT-002 but with an expanded attack surface.
Mitigation:
  1. Web Sprint 1 fix for BLOCKER-2 (magic bytes MIME detection on
     backend, Defender for Storage) must be complete before any mobile
     file upload E2E testing is performed.
  2. The mobile app's client-side file type filter (uploadConfig.
     allowedMimeTypes in the document picker) is a UX pre-filter only
     and must not be treated as a security control (MBR-008 correctly
     states this).
  3. Add a note to the mobile UAT entry checklist: file upload tests
     may only proceed after BLOCKER-2 is confirmed resolved by the
     backend team and the auditor is notified.
Residual Risk: LOW once web BLOCKER-2 fix is in place (magic bytes
  detection + Defender for Storage). The mobile client cannot
  circumvent server-side magic bytes inspection.

──────────────────────────────────────────────────────────────────
MSEC-009
Severity:    MEDIUM
Confidence:  88%
Area:        EXIF/GPS Metadata in Uploaded Photos
Description: When a user selects "Take Photo" in NativeFileUploadField,
  the camera image includes EXIF metadata embedded in the JPEG file
  by the device OS. EXIF data typically includes GPS coordinates (if
  location services are enabled for the camera), device model, OS
  version, and camera settings. This GPS data is uploaded to the
  backend as part of the image file and stored in CRM Notes.

  Banking KYC submissions should not capture the customer's physical
  location at the time of document photo without explicit disclosure.
  The App Store privacy label (MA-005) must disclose location data
  collection if EXIF GPS data is retained.

  expo-image-picker does not strip EXIF data from returned images
  by default. The image quality: 0.8 JPEG compression in launchCameraAsync
  may or may not preserve EXIF, depending on the device OS and Expo
  SDK version.
Risk: Customer GPS location captured in banking submission without
  explicit disclosure. Privacy policy non-compliance (App Store
  guidelines Section 5.1.1, PDPPL Article 11).
Mitigation:
  1. Strip EXIF data from all camera-captured images before upload.
     Use the react-native-exif-stripper library or a Canvas-based
     re-encode operation (which drops non-pixel data) before posting
     to the file upload endpoint.
  2. If EXIF stripping is not implemented before UAT, update the
     App Store and Google Play privacy disclosures to explicitly
     list "Precise Location" as data collected with the use case
     "Document verification for banking applications."
  3. Obtain explicit permission from QDB Legal confirming this
     disclosure is acceptable under PDPPL before UAT begins.
  4. Document in the compliance register whether EXIF retention
     is intentional (for document authenticity purposes) or
     accidental.
Residual Risk: LOW once EXIF stripping is implemented. MEDIUM if
  EXIF is retained without explicit disclosure and PDPPL sign-off.

──────────────────────────────────────────────────────────────────
MSEC-010
Severity:    MEDIUM
Confidence:  85%
Area:        App Backgrounding — OS Screenshot / PII in App Switcher
Description: On both iOS and Android, when a user backgrounds the
  QDB Forms app (presses Home while mid-form), the OS captures a
  screenshot of the current screen for display in the app switcher
  (iOS App Exposé / Android Recent Apps). This screenshot may contain
  visible PII — national ID numbers, loan amounts, addresses, income
  figures — that are currently visible on the form fields.

  MNFR-010 states that field values are discarded when the app is
  backgrounded past OS memory reclaim. However, the OS screenshot
  for the app switcher is held by the OS itself (not in the app's
  memory) and persists until the app is reopened or the device is
  restarted. This is independent of React state being cleared.

  Android provides a FLAG_SECURE window flag that prevents app
  switcher screenshots and screen capture. Expo supports this via
  expo-screen-capture (preventScreenCapture()). iOS similarly
  prevents screenshots on content views when FLAG_SECURE equivalent
  is applied.

  The BRD does not mention screenshot prevention. It is not
  implemented in the build output.
Risk: PII visible in the OS app switcher to anyone who gains
  physical access to the device (e.g., shoulder surfing, device
  left unattended). Not a remote attack but a physical access risk.
Mitigation:
  1. Implement expo-screen-capture with preventScreenCapture() applied
     on all authenticated screens that render form content. Use
     allowScreenCapture() on the login screen (which contains no PII).
  2. Add this as a Sprint 1 item (mobile-specific — not in web
     engagement). It is a low-effort, high-impact control.
  3. If expo-screen-capture is not added before UAT, add a note to
     the UAT entry conditions requiring UAT devices to have screen
     lock enabled and the form to be closed before handing the
     device to another person.
Residual Risk: LOW once expo-screen-capture is implemented. Applies
  equally to iOS and Android.

──────────────────────────────────────────────────────────────────
MSEC-011
Severity:    MEDIUM
Confidence:  87%
Area:        Clipboard Risk — Banking Field Values
Description: All TextInput fields in the mobile app (NativeTextField,
  NativeEmailField, NativePhoneField, NativeCurrencyField, etc.)
  are standard React Native TextInput components. By default,
  React Native TextInput allows the system clipboard. A user entering
  a National ID number, account number, or income figure can long-press
  the field and "Select All" → "Copy," placing the value on the system
  clipboard.

  The system clipboard on both iOS and Android is accessible to any
  app that runs while clipboard data is present. iOS 14+ shows a
  clipboard access notification banner, but the clipboard content
  itself is not protected. On Android, clipboard data persists until
  overwritten or the device is restarted.

  For a banking form engine, clipboard exposure of account numbers
  or National IDs is a meaningful risk in a shared-device or public
  device scenario (common in banking kiosk-style usage).
Risk: PII on system clipboard accessible to other apps. Lower impact
  than server-side risks but non-trivial for banking context.
Mitigation:
  1. For high-sensitivity field types (identified by metadata — e.g.,
     fieldType: 'password' if added, or a sensitivity flag in the
     field definition), set selectTextOnFocus={false} and
     contextMenuHidden={true} on the TextInput component to disable
     the copy menu.
  2. For Phase 1 (no sensitivity flag in metadata), consider applying
     contextMenuHidden={true} globally on all TextInput fields in the
     form. This is conservative but appropriate for banking.
  3. Document this control decision in an ADR (MADR-006).
Residual Risk: LOW with contextMenuHidden enabled. MEDIUM without it.

──────────────────────────────────────────────────────────────────
MSEC-012
Severity:    MEDIUM
Confidence:  82%
Area:        EAS Build — Source Code Leaves Local Environment
Description: The architecture specifies EAS Build (cloud service by
  Expo) for producing iOS (.ipa) and Android (.aab) build artefacts.
  When EAS Build runs, the full mobile source code is uploaded to
  Expo's build servers (cloud infrastructure managed by Expo Inc.,
  based in the United States). This includes:
  - The mobile TypeScript source (which does not contain secrets due
    to EXPO_PUBLIC_ environment variable pattern — confirmed correct)
  - The eas.json with environment variable names (values are injected
    by EAS, not stored in eas.json directly)
  - The app.json with bundle identifiers and permission strings

  The risk is supply chain in nature: Expo's build infrastructure is
  a third party. If Expo's build servers are compromised, a malicious
  build artefact could be injected. The resulting .ipa / .aab would
  bear the legitimate signing certificate.
Risk: Supply chain attack via EAS Build infrastructure compromise.
  Low likelihood but high impact given the banking context.
Mitigation:
  1. Verify that no secrets, API keys, or credentials are present
     in the source tree committed to EAS (confirmed: EXPO_PUBLIC_
     variables are non-secret public config values).
  2. Implement artefact integrity verification: after each EAS Build,
     compute SHA-256 of the .ipa / .aab and store it in the project
     security log. Compare the hash against the artefact submitted
     to the App Store / Play Store to detect substitution.
  3. Enable EAS Build logs retention and review build logs for any
     unexpected network calls or dependencies not in package.json.
  4. Consider the self-hosted runner option for production builds
     (Expo EAS supports custom build servers) if QDB Security requires
     source code to not leave a controlled environment for production
     builds.
  5. Add a dependency scan (npm audit + Dependabot) to the CI pipeline
     to detect compromised transitive dependencies before they reach
     EAS Build.
Residual Risk: LOW-MEDIUM with SHA-256 artefact verification. LOW
  if self-hosted build runners are used for production.

──────────────────────────────────────────────────────────────────
MSEC-013
Severity:    MEDIUM
Confidence:  84%
Area:        Android Permissions Overage — WRITE_EXTERNAL_STORAGE
Description: The app.json in the architecture document (Section 14.4)
  declares the following Android permissions:
    - CAMERA
    - READ_EXTERNAL_STORAGE
    - WRITE_EXTERNAL_STORAGE
    - USE_BIOMETRIC
    - USE_FINGERPRINT

  On Android 13+ (API 33+, which is the stated minimum target per
  MNFR-005 / MC-007), READ_EXTERNAL_STORAGE and WRITE_EXTERNAL_STORAGE
  are deprecated and replaced by READ_MEDIA_IMAGES, READ_MEDIA_VIDEO,
  and READ_MEDIA_AUDIO. Declaring legacy permissions on API 33+ is not
  harmful but it signals that the permissions manifest has not been
  reviewed for the target API level.

  More significantly: USE_BIOMETRIC and USE_FINGERPRINT are declared
  even though biometric authentication is explicitly out of scope for
  Phase 1 (BRD Section 4.2). Declaring permissions that are not used
  triggers Google Play's "Data safety" section reporting and may
  trigger App Store review questions. Google Play requires that every
  declared permission is actively used in the app.
Risk: App Store rejection or "Data safety" misrepresentation on
  Google Play if declared permissions are not exercised.
Mitigation:
  1. Remove USE_BIOMETRIC and USE_FINGERPRINT from app.json.
     These are Phase 2 permissions. They must not be declared until
     biometric authentication is implemented.
  2. Replace READ_EXTERNAL_STORAGE and WRITE_EXTERNAL_STORAGE with
     READ_MEDIA_IMAGES (required for gallery selection on Android 13+).
     expo-image-picker handles this via its config plugin on API 33+;
     manual declaration should not override the plugin's manifest.
  3. Review the expo-image-picker and expo-document-picker config
     plugins to confirm they correctly declare the Android 13+ media
     permissions in the generated AndroidManifest.xml.
Residual Risk: LOW once permissions are aligned with actual usage.

──────────────────────────────────────────────────────────────────
MSEC-014
Severity:    MEDIUM
Confidence:  80%
Area:        MSAL Version Lock — @azure/msal-react-native at "^0.0.1"
Description: The package.json (phase-3-tech.md M-13) pins:
    "@azure/msal-react-native": "^0.0.1"
  Version 0.0.1 is an extremely early pre-release. The caret (^) will
  accept any non-breaking version 0.0.x, which under semantic
  versioning for 0.x.x means only patch-level updates. The Microsoft
  MSAL React Native library has evolved significantly through releases
  up to 0.3.x and beyond. Using 0.0.1 means the app is built against
  a library version that may have known security vulnerabilities in
  the token cache handling, silent token acquisition, or PKCE flow.
Risk: Known security vulnerabilities in MSAL React Native token
  handling if an early version is used in production.
Mitigation:
  1. Update "@azure/msal-react-native" to the latest stable release
     (verify on npmjs.com — as of audit date, verify ^0.3.x or above).
  2. Pin to an exact version (remove the caret) for the production
     build to prevent unintended updates. Use Dependabot to manage
     updates as security patches are released.
  3. Run npm audit before every EAS Build production job.
  4. Verify the MsalProvider.tsx implementation against the MSAL
     React Native API of the pinned version — the interface may have
     changed from 0.0.1.
Residual Risk: LOW once updated to the latest stable and pinned.

──────────────────────────────────────────────────────────────────
MSEC-015
Severity:    MEDIUM
Confidence:  81%
Area:        useRuleEngine — JSON.stringify as Effect Dependency
Description: In mobile/src/hooks/useRuleEngine.ts (phase-3-tech.md,
  M-8c), the useEffect dependency array uses JSON.stringify:
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(formValues), ruleEngine]);
  This pattern suppresses the exhaustive-deps ESLint rule and relies
  on JSON.stringify for deep equality comparison. There are two issues:
  a) JSON.stringify is O(n) on the size of the form values object.
     For a 50-field form with large text values, this runs on every
     render, not just on value changes.
  b) JSON.stringify does not handle undefined values, circular
     references, or Infinity/NaN reliably. A form field with value
     undefined is serialised as if the field does not exist.
  This is a correctness and performance concern, not a critical
  security issue, but on a banking form where field clearing (hidden
  field values set to undefined) must be reliably tracked, a
  serialisation that drops undefined values could cause the rule
  engine to not re-evaluate when a field is cleared.
Risk: Rule engine may fail to re-evaluate when a field value is
  cleared (set to undefined), leaving a hidden field visible when
  it should be hidden, or a required field required when it should
  not be. BR-002 enforcement could be undermined.
Mitigation:
  1. Replace JSON.stringify with a stable deep-equality hook such as
     useMemo with a custom comparator, or use use-deep-compare-effect
     from npm (high star count, well-maintained).
  2. Alternatively, convert undefined values to null before stringifying:
     JSON.stringify(formValues, (_, v) => v === undefined ? null : v)
     to make undefined vs null distinguishable.
  3. Add a unit test (MTC-040 extension): useRuleEngine re-evaluates
     when a field value is set to undefined (cleared).
Residual Risk: LOW once the dependency comparison is corrected.

──────────────────────────────────────────────────────────────────
MSEC-016
Severity:    LOW
Confidence:  82%
Area:        Crash Reporting — PII Scrubbing Not Confirmed
Description: Section 12.2 of the architecture notes:
  "Sentry/Crashlytics must be configured with PII scrubbing before
  production." No crash reporting library is implemented in Phase 1
  (the logger.ts uses a __DEV__ console.log pattern with a Phase 2
  comment for Sentry/Crashlytics integration). This is correctly
  deferred. However, if crash reporting is added in Phase 2 without
  explicit PII scrubbing configuration, crash reports may include
  React state snapshots containing form field values (national IDs,
  income figures) in the stack trace or breadcrumbs.
Risk: Customer PII in third-party crash reporting service (Sentry or
  Firebase Crashlytics) without explicit data processing agreement.
Mitigation:
  1. Before Phase 2 crash reporting is implemented, a DPA with the
     chosen crash reporting provider (Sentry or Firebase) must be
     in place covering PII data processing under PDPPL.
  2. The crash reporting configuration must use the denyUrls pattern
     and scrubFields configuration to exclude form field names from
     breadcrumbs.
  3. Add this as a condition in the Phase 2 architecture ADR for
     crash reporting.
Residual Risk: LOW if DPA and scrubbing are in place before Phase 2.

──────────────────────────────────────────────────────────────────
MSEC-017
Severity:    LOW
Confidence:  80%
Area:        Biometric Auth Permissions Declared Without Implementation
Description: See MSEC-013 for the full permissions analysis. This
  finding specifically addresses the NSFaceIDUsageDescription in
  app.json (iOS info.plist):
    "NSFaceIDUsageDescription": "QDB Forms uses Face ID for secure sign-in."
  Biometric authentication is out of scope for Phase 1 (BRD Section
  4.2). Declaring NSFaceIDUsageDescription without any Face ID usage
  in the app will trigger an Apple App Store review question asking
  where Face ID is used. If the reviewer cannot find a Face ID prompt
  in the app, the submission may be rejected.
Risk: App Store rejection for declared but unused Face ID permission.
Mitigation:
  1. Remove NSFaceIDUsageDescription from the Phase 1 app.json.
  2. Add it back in Phase 2 when biometric authentication is
     implemented (MADR-006 should document this).
Residual Risk: LOW once removed.


3. OWASP TOP 10 ASSESSMENT (2021 — Mobile Context)
══════════════════════════════════════════════════════════════════

A01 — Broken Access Control
  Applicable: YES
  Mitigations in place:
    - authMiddleware on all backend routes. Bearer token validated
      (JWT aud/iss/exp) by the web engagement's auth layer.
    - GET /api/forms filters by AD group membership via resolveUserGroupIds().
    - roleMiddleware enforces per-form access on metadata endpoint
      (pending web BLOCKER-4 fix).
    - Draft ownership: GET /api/drafts filters by userOid server-side.
  Gaps:
    - GET /api/forms access control is implemented in the controller,
      not in middleware, creating inconsistency (MSEC-007).
    - Web BLOCKER-7 (IDOR on GET /api/forms/:formCode/data/:recordId)
      is inherited. Mobile users share the same endpoint risk.
    - Form list cache (60s TTL) can show deactivated forms briefly
      (MSEC-007).

A02 — Cryptographic Failures
  Applicable: YES
  Mitigations in place:
    - TLS 1.2+ enforced by iOS ATS and Android Network Security Config.
    - Tokens in Expo SecureStore (iOS Keychain / Android Keystore) —
      hardware-backed on devices with Secure Enclave / StrongBox.
    - No plaintext storage of tokens or PII.
    - PKCE (code verifier + code challenge) prevents authorization
      code interception.
  Gaps:
    - Certificate pinning absent (MSEC-005). TLS MITM possible on
      devices with rogue CA installed.
    - MSAL version 0.0.1 may have known cryptographic issues (MSEC-014).
    - No SHA-256 hash stored on uploaded documents (inherited from
      web FATF KYC gap in parent audit).

A03 — Injection
  Applicable: PARTIAL (backend-side)
  Mitigations in place:
    - Mobile app does not construct OData queries directly — all
      queries are assembled by the backend.
    - formCode is URL-encoded before the API call (encodeURIComponent
      in useFormMetadata.ts M-5).
    - Zod validates all API response shapes.
    - ValidationEngine uses Zod for schema construction — no eval().
  Gaps:
    - OData injection risks are inherited from the backend (web
      AUDIT-005, AUDIT-006) — both pending backend fixes.
    - Backend OData injection fixes must be in place before mobile
      forms submit real data.
    - useRuleEngine JSON.stringify pattern could suppress undefined
      field values (MSEC-015), which is a logic correctness risk
      adjacent to injection concerns.

A04 — Insecure Design
  Applicable: YES
  Mitigations in place:
    - Online-only design eliminates offline sync attack surface.
    - No PII in device storage by design (MNFR-010).
    - Draft data server-side only — no local draft cache.
    - Hidden field clearing server-side (BR-002) as defense-in-depth
      against tampered mobile submissions.
    - Autosave on backgrounding (MADR-004) uses existing secure API path.
  Gaps:
    - No screenshot prevention (MSEC-010) — PII visible in app switcher.
    - No clipboard controls (MSEC-011) — form values copyable.
    - Jailbreak detection absent (MSEC-004).
    - EXIF GPS data in camera captures (MSEC-009).
    - Channel attribution spoofable (MSEC-003).

A05 — Security Misconfiguration
  Applicable: YES
  Mitigations in place:
    - Expo SecureStore (not AsyncStorage) for all sensitive data.
    - Zod-validated app configuration (appConfig.ts) at startup.
    - MSAL configuration uses correct tenant authority URL (once
      MOBILE-GATE-A is confirmed).
    - No CORS concern (React Native is not a browser).
  Gaps:
    - Android permissions overage: USE_BIOMETRIC, USE_FINGERPRINT,
      legacy WRITE_EXTERNAL_STORAGE declared (MSEC-013).
    - NSFaceIDUsageDescription declared without implementation (MSEC-017).
    - MSAL pinned at 0.0.1 — potentially outdated (MSEC-014).

A06 — Vulnerable and Outdated Components
  Applicable: YES
  Mitigations in place:
    - Expo SDK ~51.0.0 — recent, actively maintained.
    - json-rules-engine v6.x — Hermes compatibility verified (CEO M-2).
    - react-hook-form ^7.51.0 — current, 42,000+ stars.
    - expo-secure-store, expo-image-picker, expo-document-picker —
      Expo official, version-pinned.
  Gaps:
    - @azure/msal-react-native ^0.0.1 — potentially outdated pre-release
      with security exposure (MSEC-014).
    - No automated dependency scanning (Dependabot / npm audit) in CI.
    - @react-native-community/datetimepicker is community-maintained.
      Last verified at ^7.6.2; CVE status not confirmed.
    - No SBOM generated in the CI pipeline.

A07 — Identification and Authentication Failures
  Applicable: YES
  Mitigations in place:
    - PKCE flow via system browser (not WebView) — cannot be phished.
    - ASWebAuthenticationSession (iOS) and Custom Tabs (Android) for
      secure auth UI.
    - Token stored in hardware-backed SecureStore, not AsyncStorage.
    - Silent token refresh before every API call (MFR-004).
    - Azure AD MFA enforced at tenant policy level.
  Gaps:
    - ADR-007 / MOBILE-GATE-A unconfirmed (MSEC-001).
    - Deep link URI scheme hijack risk on Android (MSEC-006).
    - Biometric re-auth deferred to Phase 2 — no step-up auth on
      submission in Phase 1.
    - No token binding or DPoP (inherited from web auth architecture).

A08 — Software and Data Integrity
  Applicable: YES
  Mitigations in place:
    - No eval() or dynamic Function() in shared/ or mobile code.
    - CUSTOM_EXPRESSION rule type deferred to Phase 2 — no dynamic
      expression execution in Phase 1.
    - EAS Build artefacts signed with Apple / Google signing keys.
  Gaps:
    - EAS Build runs source code on Expo's servers — supply chain
      risk (MSEC-012). No SHA-256 artefact verification process defined.
    - No SBOM.

A09 — Security Logging and Monitoring
  Applicable: YES
  Mitigations in place:
    - Structured logger (logger.ts) with __DEV__ guard — no console.log
      in production.
    - X-Client-Platform header logged in backend requestLogger.
    - Audit log extended with qdb_channel field (B-4, B-5).
    - Authorization header explicitly not logged (confirmed in B-4 comment).
  Gaps:
    - Channel attribution spoofable — logging is unreliable for compliance
      (MSEC-003).
    - Mobile-specific audit events (FORM_OPENED, DRAFT_SAVED) are subject
      to the same completeness gap as web (GAP-AUDIT-1 from parent audit).
    - No mobile-specific anomaly detection (e.g., rapid submission
      from a jailbroken device flagging in the audit log).

A10 — Server-Side Request Forgery
  Applicable: LOW RISK
  Mitigations in place:
    - Mobile app makes requests only to appConfig.apiBaseUrl (Zod-
      validated URL at startup).
    - No user-supplied URLs are followed directly.
    - GridUnavailableField.tsx openWebPortal() calls Linking.canOpenURL()
      before Linking.openURL() — prevents blind URL following.
  Gaps:
    - GridUnavailableField constructs the web portal URL as:
        `${appConfig.webPortalUrl}/form/${definition.fieldKey}`
      The fieldKey value comes from form metadata. A compromised CRM
      admin could craft a fieldKey containing URL path traversal
      segments. Linking.canOpenURL does not sanitise the URL structure.
      Low severity because fieldKey is validated by the backend on
      write (should be alphanumeric/dash), but a defense-in-depth
      check on the constructed URL should be added.


4. COMPLIANCE ASSESSMENT
══════════════════════════════════════════════════════════════════

────────────────────────────────────────────────────────────────
Framework: QCB Banking Record-Keeping — 7-Year Retention
Requirement: Mobile form submissions must appear in the same append-only
  audit log as web submissions. Mobile channel must be distinguishable.
How the design meets it:
  MFR-045 and MFR-046 route all mobile events through the same
  qdb_form_audit_log table. The qdb_channel column (additive, default
  'web') is set to 'mobile' via the X-Client-Platform header. The
  audit log remains append-only. No new audit tables are introduced.
Gap:
  The channel attribution mechanism (X-Client-Platform header) is
  spoofable (MSEC-003). Until JWT-claim-based channel derivation is
  implemented, the qdb_channel field is not cryptographically reliable.
  This does not invalidate the audit log entries (events are still
  recorded) but channel-based compliance reporting statistics may be
  inaccurate.
Remediation: MSEC-003 remediation (azp-claim channel derivation).
Compliance Status: PARTIAL — channel attribution gap.

────────────────────────────────────────────────────────────────
Framework: Qatar PDPPL (Law No. 13 of 2016) — Personal Data Protection
Requirement: Personal data collected from Qatari citizens via the
  mobile app must be processed and stored in compliance with PDPPL
  cross-border transfer requirements. Consent and purpose limitation
  apply.
How the design meets it:
  The mobile app is online-only. PII entered in form fields is held
  in React state (in-memory) only. Server-side draft and submission
  data goes to Dataverse via the backend. The BRD explicitly requires
  Qatar Azure region (MC-006, MOBILE-GATE-B).
Gap:
  Current Dataverse org is in West Europe (MSEC-002 / MOBILE-GATE-B
  unresolved). Every mobile submission routes PII through the backend
  (Qatar North) to Dataverse (West Europe) — a cross-border transfer
  that requires PDPPL-compliant transfer mechanisms.

  Additionally, EXIF data in camera-captured images may include GPS
  coordinates — location data that requires explicit disclosure and
  consent under PDPPL Article 11 (MSEC-009).
Remediation: MOBILE-GATE-B (Dataverse region). MSEC-009 (EXIF stripping
  or explicit privacy disclosure).
Compliance Status: FAIL — data residency violation and potential
  location data disclosure gap.

────────────────────────────────────────────────────────────────
Framework: Apple App Store Review Guidelines (Section 5.1.1)
Requirement: App must accurately declare all data collected including
  from device APIs (camera, photo library). Privacy policy must be
  present. Permissions must be used as declared.
How the design meets it:
  NSCameraUsageDescription, NSPhotoLibraryUsageDescription, and
  NSPhotoLibraryAddUsageDescription are declared with appropriate
  purpose strings. expo-image-picker permission request flow is
  implemented (MFR-039, launchCamera, launchGallery functions).
Gap:
  NSFaceIDUsageDescription is declared but Face ID is not implemented
  in Phase 1 (MSEC-017). Apple may reject the build.

  If EXIF GPS data is not stripped (MSEC-009), the App Store privacy
  nutrition label must include "Precise Location" — this is currently
  not disclosed in MA-005.
Remediation: MSEC-013 (remove unused permission strings). MSEC-009
  (EXIF stripping or updated privacy label).
Compliance Status: PARTIAL — unused permission declaration.

────────────────────────────────────────────────────────────────
Framework: Google Play Developer Policy (Data Safety Section)
Requirement: Data safety section must accurately declare all data
  collected, shared, and whether it is optional or required. All
  declared permissions must be actively used.
How the design meets it:
  Camera and photo library permissions are actively used. The data
  safety section should declare "Photos and videos" as collected,
  "Optional" (user-initiated), and "Not shared with third parties."
Gap:
  USE_BIOMETRIC and USE_FINGERPRINT are declared but not used in
  Phase 1 (MSEC-013). Google Play data safety review may flag this.
  WRITE_EXTERNAL_STORAGE on Android 13+ is a legacy permission that
  may trigger review questions.
Remediation: MSEC-013 (permission cleanup).
Compliance Status: PARTIAL.

────────────────────────────────────────────────────────────────
Framework: WCAG 2.1 Level AA — Mobile (MNFR-011)
Requirement: All interactive elements must support VoiceOver (iOS)
  and TalkBack (Android). All fields must have accessibilityLabel,
  accessibilityHint, and accessibilityRole.
How the design meets it:
  NativeTextField, NativeDateField, NativeDropdownField, NativeFileUploadField
  all carry accessibilityLabel, accessibilityRole, and accessibilityHint.
  ValidationMessage uses accessibilityRole="alert" and
  accessibilityLiveRegion="polite". FormsScreen form cards have
  accessibilityHint added (CR-09 fix). GridUnavailableField has full
  accessibilityLabel.
Gap:
  No automated WCAG mobile scan is included in the QA strategy.
  MTC-072 covers the form list screen via the accessibility inspector
  but there is no systematic test of the form renderer or field
  components under a screen reader. A manual VoiceOver / TalkBack
  test session on physical devices is not listed as a UAT prerequisite.
Remediation:
  1. Add a mandatory VoiceOver (iOS) and TalkBack (Android) manual
     test session as a UAT entry condition.
  2. Use @testing-library/react-native's built-in accessibility
     queries (getByRole, getByLabelText) in RNTL tests to verify
     accessibility props on all 15 field components.
Compliance Status: PARTIAL — systematic accessibility testing not
  confirmed in QA plan.


5. DATA RESIDENCY REVIEW
══════════════════════════════════════════════════════════════════

Mobile Data Flow:
  Mobile device (any location — customer's phone)
    → TLS 1.2+ →
  Express backend (target: Qatar North Azure App Service)
    → TLS (Dataverse Web API) →
  Dataverse org (CURRENT: West Europe — VIOLATION)
              (REQUIRED: Qatar North or UAE North)

Mobile-Specific Data Assets and Physical Residency:

  Asset                          Classification  Device      Backend    Dataverse
  ─────────────────────────────  ──────────────  ─────────── ────────── ──────────────
  Authentication tokens           Restricted     SecureStore  Never      Never
  Form field values (in-flight)   Confidential   React state  API POST   Written (West Europe — VIOLATION)
  Draft field values              Confidential   React state  API POST   Written (West Europe — VIOLATION)
  Audit log entries               Restricted     Never        API POST   Written (West Europe — VIOLATION)
  Uploaded files (camera/gallery) Confidential   Temp URI     Multipart  CRM Notes (West Europe — VIOLATION)
  EXIF/GPS metadata               Sensitive      Embedded     Forwarded  CRM Notes (West Europe — VIOLATION)
  Form metadata (FormDefinition)  Internal       Memory only  API GET    Source (West Europe — VIOLATION)
  User OID / display name         Personal       JWT claims   Logged     Audit log (West Europe — VIOLATION)

Device Storage (Confirmed Clean — No PII at Rest on Device):
  Expo SecureStore:      MSAL token cache only. No PII.
  AsyncStorage:          Not used for any sensitive data. MTC-080/081 verify this.
  React state:           In-memory only. Cleared on app termination.
  Temporary file URIs:   expo-image-picker / expo-document-picker write to
                         the OS temporary directory. Files are not in the app's
                         persistent storage. Cleared on next app startup.

Cross-Border Transfer Assessment:
  All data transits from the customer's device (Qatar) to the backend
  (Qatar North — correct) to Dataverse (West Europe — incorrect). The
  mobile channel does not change the backend's Dataverse write target.
  All data residency violations from the web engagement apply equally
  to mobile. There is no mobile-specific data path that bypasses
  the Dataverse write.

MOBILE-GATE-B (same as web GATE-B) must be resolved before mobile
UAT. Any mobile form submission creates Dataverse records in the wrong
region under the current configuration.

Resolution:
  Same resolution path as the web engagement: QDB IT must provision
  or confirm a Dataverse environment in Qatar North or UAE North.
  The DATAVERSE_URL environment variable update resolves both web and
  mobile data residency simultaneously (both use the same backend).


6. AUDIT TRAIL VALIDATION
══════════════════════════════════════════════════════════════════

Mobile Audit Log Architecture:

The mobile extension adds one new column (qdb_channel) to the
qdb_form_audit_log table. The column is additive (nullable, default
'web'), which means:
  - Existing web audit records are unaffected.
  - Mobile audit records are identified by qdb_channel = 'mobile'.
  - A QCB examiner can filter by channel to separately examine
    web and mobile submission trails.

The B-5 schema addition is correctly specified as an Option Set
(Choice) in Dataverse, not a free-text field. This limits the
column to the two permitted values ('web' / 'mobile') and makes
it auditable by Dataverse native auditing.

Positive Findings:
  - Channel column uses an Option Set — constrained, auditable.
  - Backend derives channel from X-Client-Platform header, which
    is logged in structured backend logs alongside correlationId
    for full traceability.
  - The additive schema change does not require table-level changes
    or migration scripts that could affect existing audit records.
  - Authorization header is explicitly not logged (confirmed in B-4).
  - Correlation ID is generated server-side if absent, preventing
    log injection (inherited from web architecture).

Gaps Requiring Remediation:

MGAP-AUDIT-1: CHANNEL ATTRIBUTION NOT CRYPTOGRAPHICALLY VERIFIED
  The qdb_channel field is set based on the X-Client-Platform header,
  which any caller can set to any value. A regulatory examiner who
  asks "how many submissions came from mobile in Q1?" will receive
  a count that is manipulable. See MSEC-003 for remediation.
  Severity: MEDIUM. Does not invalidate the audit log — events are
  still recorded — but reporting metrics are unreliable.

MGAP-AUDIT-2: MOBILE-SPECIFIC EVENTS NOT SEPARATELY ENUMERATED
  The BRD defines MFR-045 requiring the following mobile event types
  to be written to the audit log: formOpened, draftSaved, draftResumed,
  formSubmitted, formSubmissionFailed, documentUploaded. These are
  the same event types required by the web engagement (GAP-AUDIT-1
  from parent audit, where only 2 of 9 events are implemented).
  If the web team resolves GAP-AUDIT-1, mobile events will also be
  covered (same backend audit service). But if the mobile audit log
  extension to include qdb_channel is deployed before the web fixes
  GAP-AUDIT-1, mobile submissions will have the channel field but
  will still be missing 7 of 9 event types.
  Remediation: Coordinate the web GAP-AUDIT-1 fix with the mobile
  channel header deployment to ensure both are released together.

MGAP-AUDIT-3: AUTOSAVE EVENTS NOT DEFINED AS AUDIT EVENTS
  MADR-004 specifies that the mobile app performs a silent autosave
  (POST /api/drafts) every 60 seconds when the form has been modified
  and the app is backgrounded. This autosave is not listed as a named
  audit event type in MFR-045. For a QCB examination, an examiner
  may ask "was this draft saved voluntarily or automatically?" and
  the audit log would not distinguish between user-initiated draft
  save and the autosave. Consider adding DRAFT_AUTOSAVED as a
  distinct audit event type for the autosave path.

Verdict: PARTIALLY SUFFICIENT — MGAP-AUDIT-1 (channel reliability)
  must be resolved before mobile channel reporting is used in
  regulatory examination. MGAP-AUDIT-2 coordination is required
  before UAT.


7. SERVICE ACCOUNT REVIEW
══════════════════════════════════════════════════════════════════

The mobile extension does not introduce new service accounts. It
adds one new Azure AD app registration (mobile app client) and one
new backend endpoint but uses the same backend service principal.

──────────────────────────────────────────────────────────────────
Service Account 1: Backend API Service Principal (Inherited)
  Assessment: Same as parent web audit — refer to parent audit Section 7
  for the detailed review. No new permissions are required for the
  mobile extension. The mobile GET /api/forms endpoint uses the same
  Dataverse permissions as the existing metadata endpoint (Read on
  qdb_form_definitions and related tables).
  
  Mobile-Specific Note: The new endpoint adds a Dataverse query
  across qdb_form_fields (for the requiresDesktop flag calculation)
  and qdb_form_drafts (for hasDraft). Both tables already have
  Read permission for the service principal per the web engagement
  security model. No additional permissions are required.
  Least-Privilege Status: UNCHANGED from web engagement.

──────────────────────────────────────────────────────────────────
Service Account 2: Mobile Azure AD App Registration (NEW)
  Identity:       Azure AD app registration (mobile + desktop type)
                  Client ID: EXPO_PUBLIC_MSAL_CLIENT_ID
  Purpose:        PKCE OAuth 2.0 flow for mobile users
  Redirect URI:   msauth://com.qdb.formengine/callback
  Scope:          api://{backendAppId}/access_as_user
  Secret:         NONE — public client (no client secret on mobile apps)

  Least-Privilege Assessment:
    The mobile app registration is a public client (no client secret).
    This is the correct configuration for mobile apps — secrets cannot
    be stored securely in a distributed binary. PKCE provides the
    security guarantee instead of a client secret.

    The mobile registration must be configured as:
    - Type: Mobile and desktop applications
    - No client secret (public client = true)
    - Redirect URI: custom URI scheme only
    - Scope: access_as_user on the backend API only

    Over-privilege risk: LOW — mobile registration has no Graph API
    permissions and no Dataverse permissions. It is a delegated auth
    flow only. The backend service principal handles all Dataverse access.

  Required Actions:
    1. MOBILE-GATE-C: QDB IT must register the mobile app registration
       with the correct redirect URI before auth development begins.
    2. The mobile client ID must be added to the backend's environment
       config (MOBILE_APP_CLIENT_ID) so the backend can derive the
       audit channel from the azp JWT claim (MSEC-003 remediation).
    3. The app registration must have ID token issuance enabled
       (for user identity claims) and access token enabled (for
       backend API access). No additional Graph API delegated permissions
       should be granted.

──────────────────────────────────────────────────────────────────
Service Account 3: EAS Build Service Account
  Identity:       Expo Application Services account (QDB-owned)
  Purpose:        Cloud builds of iOS and Android artefacts
  Access Scope:   Access to the mobile source code repository and
                  EAS Build environment variables

  Assessment:
    EAS Build requires the source code to be uploaded to Expo's
    servers and requires access to signing certificates. The EAS
    account credentials (EAS_TOKEN in GitHub Actions secrets) give
    Expo's systems access to initiate builds using QDB's signing
    credentials. This is a supply chain dependency (MSEC-012).

    Apple signing certificate (iOS): EAS Build manages the provisioning
    profile and distribution certificate. These must be stored in the
    EAS Build credentials store, not in GitHub Actions secrets.
    Android signing key (.jks): Same — EAS Build credentials store.

  Required Actions:
    1. The EAS account should be owned by QDB Mobile Team, not
       Maqsad AI, for production builds. Transfer of EAS account
       ownership must be completed before production release.
    2. Apple distribution certificate and Android signing key must
       not be committed to the repository.
    3. EAS_TOKEN stored in GitHub Actions secrets should be scoped
       to the minimum required permissions (build trigger only, not
       EAS account admin).
    Least-Privilege Status: NEEDS REVIEW — EAS token scope unknown.


8. SPRINT 1 BLOCKERS (Mobile-Specific)
══════════════════════════════════════════════════════════════════

The following items are mobile-specific Sprint 1 blockers. They
are independent of the web Sprint 1 blockers BLOCKER-1 through
BLOCKER-10, but some have dependencies on those fixes.

These items must all be resolved and verified before mobile UAT
entry is permitted.

──────────────────────────────────────────────────────────────────
MOBILE-BLOCKER-1 (MSEC-001 / MSEC-002)
  GATE-A and GATE-B Not Resolved
  Dependency: MOBILE-GATE-A (tenant confirmation) and MOBILE-GATE-B
    (Qatar North Dataverse org confirmation).
  Risk if unresolved: Mobile auth layer is built on wrong assumption
    (GATE-A). Mobile submissions land in West Europe (GATE-B).
    Both are regulatory violations.
  Action: QDB Project Sponsor delivers written confirmation of
    MOBILE-GATE-A. QDB IT delivers written confirmation of the
    Dataverse org URL for MOBILE-GATE-B.
  Owner: QDB Project Sponsor / QDB IT.

──────────────────────────────────────────────────────────────────
MOBILE-BLOCKER-2 (MSEC-003)
  Channel Attribution in Audit Log Not Cryptographically Reliable
  Dependency: Mobile client ID (MOBILE-GATE-C).
  Risk if unresolved: qdb_channel in audit log can be spoofed.
    Channel-based compliance reporting is unreliable for QCB examination.
  Action:
    1. QDB IT provides mobile app registration client ID (MOBILE-GATE-C).
    2. Backend adds MOBILE_APP_CLIENT_ID environment variable.
    3. requestLogger.ts and CrmAuditService.ts updated to derive
       qdb_channel from req.user.azpClientId compared to
       MOBILE_APP_CLIENT_ID and WEB_APP_CLIENT_ID.
    4. MTC-052 and MTC-053 tests updated to verify JWT-claim-based
       channel derivation, not header-based.
  Owner: Backend Agent.

──────────────────────────────────────────────────────────────────
MOBILE-BLOCKER-3 (MSEC-010)
  Screenshot Prevention Not Implemented
  Dependency: None.
  Risk if unresolved: PII visible in OS app switcher on physical
    UAT devices. Physical access risk on shared UAT devices.
  Action:
    1. Add expo-screen-capture to package.json.
    2. Call preventScreenCapture() in the root layout (_layout.tsx)
       for the (app)/ authenticated group.
    3. Call allowScreenCapture() on the (auth)/login screen.
    4. Add a unit test verifying preventScreenCapture is called
       on mount of the authenticated layout.
  Owner: Mobile Agent.

──────────────────────────────────────────────────────────────────
MOBILE-BLOCKER-4 (MSEC-006)
  Android Deep Link URI Scheme Risk — ADR Required Before UAT
  Dependency: MOBILE-GATE-C (mobile app client ID).
  Risk if unresolved: Authorization code interception on Android
    by a malicious app with the same custom URI scheme. While
    PKCE mitigates the most severe impact, this is a known
    vulnerability class for Android OAuth flows.
  Action:
    1. File MADR-006 documenting the redirect URI scheme decision:
       custom URI scheme vs. Android App Links (HTTPS scheme).
    2. If Android App Links are selected, implement the Asset Links
       JSON endpoint on the backend (/.well-known/assetlinks.json).
    3. If custom URI scheme is retained, obtain written risk acceptance
       from QDB Security acknowledging the PKCE-mitigated residual risk.
    4. The ADR must be filed before MSAL auth code is finalised.
  Owner: Architect + QDB Security.

──────────────────────────────────────────────────────────────────
MOBILE-BLOCKER-5 (MSEC-013 / MSEC-017)
  App Store and Google Play Permission Manifest Cleanup
  Dependency: None.
  Risk if unresolved: App Store rejection for NSFaceIDUsageDescription
    without Face ID usage. Google Play data safety section
    misrepresentation for USE_BIOMETRIC / USE_FINGERPRINT.
  Action:
    1. Remove NSFaceIDUsageDescription from app.json iOS infoPlist.
    2. Remove USE_BIOMETRIC and USE_FINGERPRINT from app.json Android
       permissions array.
    3. Replace READ_EXTERNAL_STORAGE / WRITE_EXTERNAL_STORAGE with
       READ_MEDIA_IMAGES for Android 13+ compatibility.
    4. Verify the generated AndroidManifest.xml via EAS Build dev
       profile to confirm the correct permissions are present.
  Owner: Mobile Agent.

──────────────────────────────────────────────────────────────────
MOBILE-BLOCKER-6 (MSEC-009)
  EXIF/GPS Metadata in Camera Captures — Policy Decision Required
  Dependency: QDB Legal, QDB Privacy Officer.
  Risk if unresolved: Customer GPS location captured without disclosure
    in banking submissions. PDPPL Article 11 violation.
  Action:
    1. QDB Legal must determine whether EXIF GPS data in submitted
       photos must be stripped before upload (privacy-first approach)
       or retained and disclosed (banking authenticity approach).
    2. If strip: implement EXIF stripping in fileService.ts before
       the uploadFile() call.
    3. If retain: update App Store privacy label and Google Play data
       safety section to include "Precise Location" with use case
       disclosure. Obtain QDB Legal sign-off on the PDPPL compliance
       position.
    4. This decision must be documented in the compliance register
       before UAT involves camera capture testing.
  Owner: QDB Legal / Mobile Agent.

──────────────────────────────────────────────────────────────────
Note: The following web Sprint 1 blockers (BLOCKER-1 through
BLOCKER-10) also block mobile UAT and are tracked in the parent
audit. Mobile UAT requires ALL of the following web fixes to be
in place, in addition to the six mobile-specific blockers above:
  - Web BLOCKER-4 (roleMiddleware) — mobile uses same backend RBAC
  - Web BLOCKER-9 (file upload functional) — mobile file upload depends on this
  - Web BLOCKER-10 (business rules fetched) — mobile rule engine depends on this
  - GATE-A and GATE-B (covered by MOBILE-BLOCKER-1 above)


9. PRODUCTION GATE ITEMS
══════════════════════════════════════════════════════════════════

The following items are required before mobile is released to
production customer traffic. They do not block UAT.

MPROD-001 (MSEC-004): Jailbreak and root detection implemented.
  Library selected, detection behaviour defined by QDB Security
  (warn vs. terminate), audit log event (SECURITY_WARNING) confirmed.
  QDB Security written sign-off on detection behaviour.
  Owner: Mobile Agent + QDB Security.

MPROD-002 (MSEC-005): Certificate pinning decision made and documented.
  MADR (production hardening ADR) filed with the decision:
  implement pinning (with cert rotation runbook) or explicitly
  accept residual risk with compensating controls (short token
  lifetime, CAE, forced HTTPS). QDB Security written acceptance.
  Owner: Architect + QDB Security.

MPROD-003 (MSEC-011): Clipboard controls evaluated and decided.
  Whether contextMenuHidden is applied globally on TextInput fields
  or selectively on high-sensitivity fields (if metadata sensitivity
  flag is added). Decision documented in ADR.
  Owner: Mobile Agent.

MPROD-004 (MSEC-012): EAS Build artefact integrity process established.
  SHA-256 hash of .ipa / .aab computed and stored in security log
  after each production EAS Build. QDB Mobile Team owns the EAS
  account for production builds. Artefact verification step in
  the deployment runbook.
  Owner: QDB Mobile Team + DevOps.

MPROD-005 (MSEC-014): @azure/msal-react-native updated to latest
  stable and pinned to an exact version. npm audit clean in CI.
  Owner: Mobile Agent.

MPROD-006 (MSEC-015): useRuleEngine JSON.stringify dependency fixed.
  Deep equality hook or null-coalescing serialisation in place.
  Unit test verifying undefined field value triggers rule re-evaluation.
  Owner: Mobile Agent.

MPROD-007 (MSEC-016): Crash reporting DPA and PII scrubbing config
  in place if Sentry/Crashlytics is added in Phase 2.
  Owner: QDB Legal + Mobile Agent (Phase 2 ADR condition).

MPROD-008 (MGAP-AUDIT-1): qdb_channel derived from JWT azp claim,
  not X-Client-Platform header. (This is also MOBILE-BLOCKER-2 —
  classified as both UAT blocker and production gate because it
  has UAT impact too.)

MPROD-009 (EAS Account): EAS Build account ownership transferred
  to QDB Mobile Team for production builds.

MPROD-010 (All web production items): All items from the parent
  web audit production gate section (PROD-1 through PROD-9) must
  be complete, as mobile and web share the same backend.


10. INHERITED RISK REGISTER
══════════════════════════════════════════════════════════════════

The following risks from the web engagement (phase-6-audit.md)
carry over to the mobile extension. They are tracked in the parent
audit and are not duplicated here in full detail, but their mobile
impact is assessed.

| Web Risk   | Severity | Mobile Impact                                            | Mobile-Specific Mitigation                            |
|------------|----------|----------------------------------------------------------|-------------------------------------------------------|
| AUDIT-001  | CRITICAL | DIRECT — all mobile submissions land in West Europe      | MOBILE-BLOCKER-1 / MOBILE-GATE-B                      |
| AUDIT-002  | CRITICAL | HIGH — camera uploads bypass desktop AV entirely         | Mobile file upload tests blocked until BLOCKER-2 fixed|
| AUDIT-003  | CRITICAL | NONE — CORS is a browser-only restriction; RN unaffected | No mobile action required                             |
| AUDIT-004  | CRITICAL | DIRECT — mobile users subject to same RBAC bypass        | Same backend fix (BLOCKER-4) resolves for mobile       |
| AUDIT-005  | HIGH     | INDIRECT — formCode OData injection is backend-side      | Mobile uses encodeURIComponent; backend fix resolves   |
| AUDIT-006  | HIGH     | INDIRECT — lookup filter injection is backend-side       | Mobile does not pass filter param; backend fix resolves|
| AUDIT-007  | HIGH     | PARTIAL — inputSanitiser protects POST body from mobile  | No richtext on mobile (Phase 1) — mobile XSS risk lower|
| AUDIT-008  | HIGH     | INDIRECT — IDOR on GET /api/forms/:formCode/data/:id     | Same backend fix resolves for mobile                   |
| AUDIT-009  | HIGH     | CRITICAL AND DIRECT — MOBILE-GATE-A is the same risk     | MOBILE-BLOCKER-1                                       |
| AUDIT-010  | HIGH     | INDIRECT — entity name lookup is backend-side            | Mobile does not supply entityName; backend fix resolves|
| AUDIT-011  | HIGH     | PARTIAL — Hermes/React Native: no browser DOM to hang    | ReDoS on mobile: thread block instead of tab hang;     |
|            |          |                                                          | shared/ RuleEngine uses same ValidationEngine          |
| AUDIT-012  | HIGH     | LOW — tokens in SecureStore (hardware-backed), not       | No equivalent XSS vector on native mobile; lower risk  |
|            |          | sessionStorage; XSS not applicable to React Native       |                                                        |
| AUDIT-013  | MEDIUM   | INDIRECT — audit log PII error body is backend-side      | Backend fix resolves for mobile too                    |
| AUDIT-014  | MEDIUM   | INDIRECT — Key Vault for backend service principal       | No mobile action required                              |
| AUDIT-015  | MEDIUM   | DIRECT — no rate limiting on submit/lookup/upload        | Same backend fix resolves for mobile                   |
| AUDIT-016  | MEDIUM   | DIRECT — audit write failures silently absorbed          | Mobile audit events affected equally                   |
| AUDIT-017  | MEDIUM   | INDIRECT — SharePoint Sites.ReadWrite.All                | No mobile action required; same backend fix            |


11. CODE AUDIT — 7-PASS RESULTS (Mobile-Specific)
══════════════════════════════════════════════════════════════════

Scope: phase-3-tech.md implementations (B-1 through B-5, M-1 through
M-13). All code-review violations CR-01 through CR-10 are confirmed
resolved in the technical build output. This pass identifies residual
issues in the corrected implementations.

─────────────────────────────────────────────────────────────────
Pass 1 — Wiring
─────────────────────────────────────────────────────────────────

MCODE-W-01 | INFO | Confidence: 85%
File: phase-3-tech.md, MobileDynamicFormRenderer.tsx (M-6), line:
  useEffect(() => { if (lastReferenceNumber) { onSubmitSuccess(...) } })
  The useEffect is present in the implementation but useEffect is
  imported from React in useSubmission.ts (M-5b). However, in the
  MobileDynamicFormRenderer code listing, useEffect is used at the
  module level but only useCallback is shown in the import from
  M-6. The useEffect import must be present in the renderer file.
  This is a potential compilation error that would prevent the
  submission success navigation from firing.
Severity: WARNING
Remediation: Verify useEffect is in the React import statement of
  MobileDynamicFormRenderer.tsx. The import line should be:
  import React, { useCallback, useEffect } from 'react';
Confidence: 85%

MCODE-W-02 | INFO | Confidence: 82%
File: phase-3-tech.md, B-2 FormListController.ts
  The listForms method calls resolveUserGroupIds(userClaims, req.logger).
  The req.logger injection is from pino-http middleware which the
  web backend uses. However, the mobile build document does not
  confirm that pino-http is registered in the backend for the
  /api/forms route. If pino-http is not wired, req.logger is undefined
  and the resolveUserGroupIds call will throw at runtime.
Severity: WARNING
Remediation: Confirm pino-http is registered in the backend's
  index.ts before the forms router. This is an existing middleware
  (used in the web portal) — it should be present, but the mobile
  backend additions should be verified against the actual index.ts.
Confidence: 82%

─────────────────────────────────────────────────────────────────
Pass 2 — Error Handling
─────────────────────────────────────────────────────────────────

MCODE-E-01 | WARNING | Confidence: 90%
File: phase-3-tech.md, M-3 MsalProvider.tsx, initializeMsal()
  async function initializeMsal(): Promise<void> {
    await msalInstance.initialize();
    const accounts = msalInstance.getAllAccounts();
    ...
    setIsLoading(false);
  }
  The initializeMsal function does not have a try-catch. If
  msalInstance.initialize() throws (e.g., invalid client ID, network
  error during MSAL metadata discovery), setIsLoading(false) is never
  called, the app remains in an infinite loading state, and the error
  is silently swallowed by the void return of the useEffect.
Severity: WARNING
Remediation: Wrap the body of initializeMsal in try-catch. On catch:
  set an authentication error state, call setIsLoading(false), and
  log the error via the structured logger. The auth error state should
  render an error screen with a "Retry" button.
Confidence: 90%

MCODE-E-02 | WARNING | Confidence: 88%
File: phase-3-tech.md, M-9 NativeFileUploadField.tsx, openIosActionSheet
  ActionSheetIOS.showActionSheetWithOptions(
    { options, cancelButtonIndex: 0 },
    async (index) => {
      if (index === 0) return;
      ...
      if (label === 'Take Photo') await launchCamera();
      ...
    }
  );
  The async callback in ActionSheetIOS.showActionSheetWithOptions
  returns a Promise. ActionSheetIOS does not await the callback —
  the Promise is fire-and-forget. If launchCamera() throws
  (permission denied by OS after the permission check passes, e.g.,
  due to a race condition), the error is an unhandled Promise rejection.
  CR-01 fix applied a catch inside handleFileSelected, but the outer
  async callback wrapping is itself uncaught.
Severity: WARNING
Remediation: Wrap the async callback body in try-catch:
  async (index) => {
    try {
      if (index === 0) return;
      ...
    } catch (error) {
      logger.error({ error, context: { operation: 'iosActionSheet' } });
      Alert.alert('Upload failed', '...');
    }
  }
Confidence: 88%

─────────────────────────────────────────────────────────────────
Pass 3 — Completeness
─────────────────────────────────────────────────────────────────

MCODE-C-01 | WARNING | Confidence: 92%
File: phase-3-tech.md, M-13 package.json
  "@azure/msal-react-native": "^0.0.1"
  This is an early pre-release version. The architecture document
  (Section 5.1) says "Microsoft official" but does not specify a
  version. Version 0.0.1 may lack critical features including the
  ICachePlugin interface used in M-3 (msalCachePlugin). The cache
  plugin API may have changed between 0.0.1 and the current release.
  If the interface changed, the token storage will silently not work
  (tokens fall back to in-memory, non-persistent cache), causing
  re-authentication on every app restart.
Severity: WARNING
Remediation: Update to the latest stable @azure/msal-react-native
  release. Verify the ICachePlugin / TokenCacheContext interface
  against the pinned version's TypeScript types.
Confidence: 92%

MCODE-C-02 | INFO | Confidence: 80%
File: phase-3-tech.md, M-8b fileService.ts
  const formData = new FormData();
  formData.append('file', { uri: file.uri, type: file.mimeType, name: file.fileName }
    as unknown as Blob);
  The as unknown as Blob type assertion works in React Native's
  FormData (which accepts { uri, type, name } objects), but is
  TypeScript-unsafe. If the React Native FormData implementation
  changes in a future Expo SDK update, this silent cast could break
  the upload without a compile-time error. Also, if file.mimeType
  is null (returned by the OS picker in some edge cases), the
  uploaded file will have a null Content-Type on the form data entry.
Severity: INFO
Remediation: Add a null guard: mimeType: file.mimeType ?? 'application/octet-stream'.
  Document the cast with a comment explaining why the unknown
  assertion is needed for React Native FormData compatibility.
Confidence: 80%

─────────────────────────────────────────────────────────────────
Pass 4 — Dead Code
─────────────────────────────────────────────────────────────────

MCODE-D-01 | PRUNE | Confidence: 88%
File: phase-3-tech.md, B-1 CrmFormListService.ts (line comment)
  version: 0, // populated by CrmMetadataService on full metadata fetch
  The FormListItem.version field is always set to 0 in the list
  endpoint. There is no mechanism by which CrmMetadataService
  populates this field — the list endpoint and the metadata endpoint
  are separate code paths. If version is unused in the mobile form
  list UI (the form list screen does not display a version number),
  this field should either be removed from FormListItem or populated
  from the qdb_form_version Dataverse table.
Severity: PRUNE
Remediation: Determine whether version is required in FormListItem.
  If it drives a mobile UI feature (e.g., "Update available" badge),
  implement the Dataverse query. If not, remove the field from
  FormListItem to reduce interface surface.
Confidence: 88%

─────────────────────────────────────────────────────────────────
Pass 5 — Bloat
─────────────────────────────────────────────────────────────────

MCODE-B-01 | INFO | Confidence: 85%
File: phase-3-tech.md, M-9 NativeFileUploadField.tsx
  The component handles: permission requesting (launchCamera,
  launchGallery), document picking (launchDocumentPicker), file
  validation (validateFileSize), file upload (performUpload), upload
  state management (isUploading), display (uploaded file name),
  and action sheet presentation (openActionSheet variants). The CR-08
  fix correctly extracted some functions, but the component still
  orchestrates too many concerns. At approximately 160 lines in the
  build document, it is approaching the 200-line threshold for a
  single component.
Severity: INFO
Remediation: Consider extracting the permission + picker logic into
  a useFilePicker custom hook. The component then becomes: render
  the upload button, call useFilePicker, and display the result.
Confidence: 85%

─────────────────────────────────────────────────────────────────
Pass 6 — Hardcoding
─────────────────────────────────────────────────────────────────

MCODE-H-01 | WARNING | Confidence: 90%
File: phase-3-tech.md, M-4 apiClient.ts
  const CLIENT_PLATFORM_HEADER = 'mobile';
  This is a module-level constant with a hardcoded string value.
  If the backend ever changes the accepted values for X-Client-Platform
  (e.g., 'mobile-ios' and 'mobile-android' for platform-specific
  audit granularity), this change requires a code deployment.
Severity: WARNING (acceptable for Phase 1 — note for Phase 2)
Remediation: Move to appConfig.ts as a configurable value. For Phase 1
  the hardcoded constant is acceptable given the binary web/mobile
  distinction. Add a TODO comment referencing the channel granularity
  enhancement.
Confidence: 90%

MCODE-H-02 | WARNING | Confidence: 88%
File: phase-3-tech.md, M-2 appConfig.ts
  const FORM_LIST_CACHE_TTL_SECONDS = 60; (in FormListController)
  This TTL is hardcoded in the controller. Changing it (e.g., to
  reduce cache staleness risk per MSEC-007) requires a code deployment.
Severity: WARNING
Remediation: Move to appConfig.ts as FORM_LIST_CACHE_TTL_SECONDS
  with a default of 60. This allows operational adjustment without
  a build.
Confidence: 88%

MCODE-H-03 | INFO | Confidence: 82%
File: phase-3-tech.md, M-8c useRuleEngine.ts
  const RULE_EVALUATION_DEBOUNCE_MS = 50;
  The architecture (Section 7.2) notes this is tunable for low-end
  device performance. As a module-level constant it requires a build
  to change.
Severity: INFO
Remediation: Move to appConfig.ts as RULE_EVALUATION_DEBOUNCE_MS
  with default 50. Allows UAT performance tuning without a rebuild.
Confidence: 82%

─────────────────────────────────────────────────────────────────
Pass 7 — Security
─────────────────────────────────────────────────────────────────

MCODE-S-01 | CRITICAL | Confidence: 95%
File: phase-3-tech.md, M-3 MsalProvider.tsx
  async function signIn(): Promise<void> {
    const result: AuthenticationResult = await msalInstance.acquireToken({
      scopes: [`api://${appConfig.msalClientId}/access_as_user`],
    });
  }
  The scope is constructed using appConfig.msalClientId — the mobile
  app's own client ID. This is incorrect for accessing the backend API.
  The scope must reference the BACKEND API's application ID, not the
  mobile client's ID. The correct scope is:
    api://{BACKEND_APP_CLIENT_ID}/access_as_user
  Using the mobile client's own ID as the audience means the mobile
  app is requesting a token scoped to itself, not the backend API.
  The backend's authMiddleware validates aud and will reject these
  tokens with 401.

  This is a security and functionality issue: authentication would
  appear to succeed (Azure AD issues the token) but every subsequent
  API call would be rejected by the backend because the token's aud
  claim is wrong.
Severity: CRITICAL
Remediation:
  1. Add EXPO_PUBLIC_BACKEND_APP_CLIENT_ID as a separate environment
     variable in appConfig.ts (distinct from EXPO_PUBLIC_MSAL_CLIENT_ID
     which is the mobile app's own client ID).
  2. Update the scope construction to:
     scopes: [`api://${appConfig.backendAppClientId}/access_as_user`]
  3. Update eas.json to include EXPO_PUBLIC_BACKEND_APP_CLIENT_ID
     in all build profiles.
  4. Update MTC-056 to verify that the acquired token has the correct
     aud claim matching the backend API's application ID.
Confidence: 95%

MCODE-S-02 | HIGH | Confidence: 88%
File: phase-3-tech.md, M-11 GridUnavailableField.tsx
  const webUrl = `${appConfig.webPortalUrl}/form/${definition.fieldKey}`;
  await Linking.openURL(webUrl);
  The fieldKey is sourced from form metadata (Dataverse). A CRM
  admin could craft a fieldKey that contains URL path segments or
  fragment identifiers. Example:
    fieldKey: "../../malicious-page#"
  would produce: https://portal.qdb.qa/form/../../malicious-page#
  which Linking.openURL would attempt to open (URL normalisation
  may resolve the traversal). On Android, deep link schemes could
  also be injected via fieldKey values like:
    fieldKey: "x\nhttps://evil.com"
  (newline injection in some URL parsers).
  Linking.canOpenURL checks before openURL, but it does not sanitise
  the URL structure.
Severity: HIGH
Remediation:
  Validate definition.fieldKey against a strict allowlist pattern
  (e.g., /^[a-zA-Z0-9_-]{1,100}$/) before constructing the URL.
  If fieldKey does not match, log a warning and display the web
  portal home URL instead of the field-specific URL.
Confidence: 88%

MCODE-S-03 | WARNING | Confidence: 84%
File: phase-3-tech.md, M-3 MsalProvider.tsx
  useEffect(() => { initializeMsal(); }, []);
  The useEffect calls initializeMsal() but does not store the return
  Promise or handle its rejection (the useEffect callback is synchronous;
  calling an async function inside it creates a floating Promise).
  Combined with MCODE-E-01 (no try-catch in initializeMsal), an
  initialization failure produces an unhandled Promise rejection on
  mobile. While React Native's global unhandled rejection handler
  may catch this, the user sees no actionable error screen.
Severity: WARNING
Remediation: Use the void operator to explicitly acknowledge the
  floating promise and add the try-catch per MCODE-E-01:
  useEffect(() => { void initializeMsal(); }, []);
  With the try-catch in initializeMsal handling the error state.
Confidence: 84%

MCODE-S-04 | WARNING | Confidence: 85%
File: phase-3-tech.md, M-8b fileService.ts
  formData.append('fieldKey', fieldKey);
  The fieldKey is included in the multipart form data as a plain
  text field alongside the file. The backend's file upload handler
  uses this fieldKey to associate the file with the correct form field.
  If fieldKey is not validated on the backend against the form's
  field definitions, a mobile client could supply an arbitrary fieldKey
  value and associate an uploaded file with a different field than
  intended — potentially overwriting another user's file association
  if field keys are not scoped to the submission.
Severity: WARNING
Remediation: The backend POST /api/files/upload handler must validate
  that the submitted fieldKey exists in the form definition for the
  form the user is currently filling (formCode should also be sent
  in the multipart data). Cross-reference fieldKey against the LRU-
  cached form metadata before accepting the upload.
Confidence: 85%


12. GOVERNANCE GAPS — RANKED BY PRIORITY
══════════════════════════════════════════════════════════════════

Rank  ID               Severity  Description
──────────────────────────────────────────────────────────────────

1   MOBILE-GATE-A      CRITICAL  Tenant type unconfirmed. Mobile auth layer built
                                 on unverified single-tenant assumption (MSEC-001).
                                 Risk: Complete auth rebuild if wrong.
                                 Remediation: Written confirmation from QDB sponsor.

2   MOBILE-GATE-B      CRITICAL  Dataverse in West Europe — all mobile PII violates
                                 C-005 and PDPPL (MSEC-002).
                                 Risk: Regulatory violation from day one of UAT.
                                 Remediation: Qatar/UAE North Dataverse org confirmed.

3   MCODE-S-01         CRITICAL  MSAL scope uses mobile client ID instead of backend
                                 API client ID — every API call returns 401.
                                 Risk: Mobile app completely non-functional post-auth.
                                 Remediation: Add EXPO_PUBLIC_BACKEND_APP_CLIENT_ID.

4   MSEC-003           HIGH      qdb_channel audit field derivable from spoofable
    + MOBILE-BLOCKER-2           header. Compliance reporting unreliable for QCB.
                                 Risk: Channel audit metrics manipulable.
                                 Remediation: JWT azp-claim channel derivation.

5   MSEC-006           HIGH      Android OAuth redirect scheme hijackable (PKCE
    + MOBILE-BLOCKER-4           mitigates but risk class is documented).
                                 Risk: Authorization code interception on Android.
                                 Remediation: Android App Links or written risk acceptance.

6   MSEC-007           HIGH      GET /api/forms access control in controller, not
                                 middleware. Stale form list cache (60s) shows
                                 deactivated forms briefly.
                                 Risk: Access control inconsistency; maintenance debt.
                                 Remediation: Consolidate to middleware; reduce TTL.

7   MCODE-S-02         HIGH      fieldKey in GridUnavailableField URL construction
                                 not sanitised. Path traversal or deep link injection.
                                 Risk: Malicious CRM admin redirects mobile users.
                                 Remediation: Validate fieldKey against /^[a-zA-Z0-9_-]+$/.

8   MSEC-008           HIGH      File upload backend (BLOCKER-2) not yet fixed.
                                 Camera captures bypass desktop AV. Mobile increases
                                 attack surface.
                                 Risk: Malware in QDB CRM via mobile camera upload.
                                 Remediation: Web BLOCKER-2 fix before mobile upload tests.

9   MOBILE-BLOCKER-3   MEDIUM    Screenshot prevention not implemented.
    + MSEC-010                   PII in OS app switcher on backgrounded app.
                                 Risk: Physical access PII exposure during UAT.
                                 Remediation: expo-screen-capture in authenticated layout.

10  MOBILE-BLOCKER-5   MEDIUM    Biometric permissions declared but unused.
    + MSEC-013                   Risk: App Store / Play Store rejection.
    + MSEC-017                   Remediation: Remove unused permission declarations.

11  MOBILE-BLOCKER-6   MEDIUM    EXIF GPS in camera photos — no disclosure or stripping.
    + MSEC-009                   Risk: PDPPL Article 11 compliance gap.
                                 Remediation: Strip EXIF or update privacy label.

12  MSEC-004           HIGH      Jailbreak/root detection absent (Production Gate).
    + MPROD-001                  Risk: Token extraction on compromised device OS.
                                 Remediation: react-native-device-info implementation.

13  MSEC-005           HIGH      Certificate pinning absent (Production Gate).
    + MPROD-002                  Risk: TLS MITM on devices with rogue CA.
                                 Remediation: Phase 2 ADR and QDB Security decision.

14  MSEC-014           MEDIUM    MSAL React Native at v0.0.1 — outdated pre-release.
    + MPROD-005                  Risk: Known security vulnerabilities in token handling.
                                 Remediation: Update and pin to latest stable.

15  MSEC-015           MEDIUM    JSON.stringify as effect dependency — undefined values
    + MPROD-006                  dropped; rule engine may miss cleared field values.
                                 Risk: BR-002 enforcement gap for cleared fields.
                                 Remediation: use-deep-compare-effect or null coalescing.

16  MCODE-E-01         MEDIUM    initializeMsal() has no error handling — infinite
                                 loading state on MSAL init failure.
                                 Risk: App unusable on any MSAL initialization error.
                                 Remediation: try-catch with error state and retry button.

17  MGAP-AUDIT-3       LOW       DRAFT_AUTOSAVED not defined as a distinct audit event
                                 type. User-initiated vs. autosave not distinguishable.
                                 Risk: Minor regulatory reporting gap.
                                 Remediation: Add DRAFT_AUTOSAVED as named event type.


13. SIGN-OFF BLOCK
══════════════════════════════════════════════════════════════════

MOBILE UAT ENTRY GATE — NOT CLEARED

The following conditions must ALL be met before mobile UAT begins.
Each is independently blocking.

MOBILE-BLOCKER-1: MOBILE-GATE-A (tenant confirmation) and
  MOBILE-GATE-B (Qatar North Dataverse org) resolved in writing.
  [  ] Not resolved

MOBILE-BLOCKER-2: qdb_channel derived from JWT azp claim, not
  X-Client-Platform header. MTC-052/053 updated and passing.
  [  ] Not resolved

MOBILE-BLOCKER-3: expo-screen-capture implemented on all
  authenticated screens. preventScreenCapture() called on mount.
  [  ] Not resolved

MOBILE-BLOCKER-4: MADR-006 filed for Android redirect URI decision
  (App Links vs. custom URI scheme). QDB Security sign-off obtained.
  [  ] Not resolved

MOBILE-BLOCKER-5: Unused permissions removed from app.json
  (NSFaceIDUsageDescription, USE_BIOMETRIC, USE_FINGERPRINT).
  [  ] Not resolved

MOBILE-BLOCKER-6: EXIF/GPS policy decision from QDB Legal.
  Either EXIF stripping implemented or privacy label updated.
  [  ] Not resolved

MCODE-S-01: MSAL scope fixed to use backendAppClientId, not
  msalClientId. EXPO_PUBLIC_BACKEND_APP_CLIENT_ID added to EAS config.
  [  ] Not resolved

MCODE-S-02: fieldKey sanitised in GridUnavailableField URL
  construction. Regex allowlist applied before URL assembly.
  [  ] Not resolved

MCODE-E-01: initializeMsal() wrapped in try-catch with error state
  and retry screen.
  [  ] Not resolved

WEB-BLOCKERS: Web BLOCKER-4 (roleMiddleware), BLOCKER-9 (file upload
  functional), and BLOCKER-10 (business rules fetched) all confirmed
  resolved by backend team and verified by parent audit follow-up.
  [  ] Not resolved

PRODUCTION GO-LIVE: NOT CLEARED

All mobile-specific Sprint 1 blockers above, PLUS all items in
Section 9 (Production Gate Items), PLUS all web production gates
from the parent audit (PROD-1 through PROD-9) must be resolved
before any live customer data is processed through the mobile app.

──────────────────────────────────────────────────────────────────
Auditor:   Maqsad AI — Auditor and Governance Specialist
Date:      2026-05-25
Version:   1.0 (Final)
Status:    NOT CLEARED FOR MOBILE UAT
──────────────────────────────────────────────────────────────────
═══════════════════════════════════════════════════════════════════
END OF AUDIT REPORT
Dynamic Form Engine — Mobile Rendering Extension
Maqsad AI — Auditor and Governance Specialist — 2026-05-25
═══════════════════════════════════════════════════════════════════
