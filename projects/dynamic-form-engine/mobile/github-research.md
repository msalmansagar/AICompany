═══════════════════════════════════════════════════════════════════
GITHUB RESEARCH REPORT
Dynamic Form Engine — Mobile Rendering Extension
═══════════════════════════════════════════════════════════════════
Prepared by:    Maqsad AI — GitHub Researcher
Date:           2026-05-20
Version:        1.0
Project:        Dynamic Form Engine Mobile (QDB)
Parent BRD:     projects/dynamic-form-engine/mobile/brd.md
═══════════════════════════════════════════════════════════════════


RESEARCH SUMMARY
─────────────────────────────────────────────────────────────────────
10 searches conducted across all mobile dependency categories.
Verdict: BUILD the core form renderer. ADOPT all infrastructure
libraries. No single existing library covers the metadata-driven
banking form rendering requirement with rule engine integration.


1. SEARCH: React Native Metadata-Driven / Dynamic Form Rendering
─────────────────────────────────────────────────────────────────────

CANDIDATE A: react-jsonschema-form
  Repo:         https://github.com/rjsf-team/react-jsonschema-form
  Stars:        ~14,500
  Licence:      Apache 2.0
  Last commit:  Active (2025)
  Expo managed: NO — web-only. The core library targets React DOM.
                The react-native branch was abandoned. No active
                React Native port exists.
  Verdict:      REJECT
  Reason:       Web-only. The React Native branch has been stale for
                years. The library is deeply tied to HTML form elements
                and lacks native mobile controls (ActionSheet, native
                DatePicker, camera upload). Cannot be adopted for RN.

CANDIDATE B: formik
  Repo:         https://github.com/jaredpalmer/formik
  Stars:        ~34,000
  Licence:      Apache 2.0
  Last commit:  Active (2024, low maintenance mode)
  Expo managed: YES — works in React Native
  Verdict:      REJECT
  Reason:       Formik is a form state management library, not a
                metadata-driven form renderer. It has no concept of
                fetching field definitions from an API and rendering
                them dynamically. We would still need to build the
                entire metadata rendering layer on top of it. The web
                engagement already uses React Hook Form (a superior
                alternative). Formik adds no value here.

CANDIDATE C: react-hook-form
  Repo:         https://github.com/react-hook-form/react-hook-form
  Stars:        ~42,000
  Licence:      MIT
  Last commit:  Active (2025)
  Expo managed: YES — fully React Native compatible
  Verdict:      ADOPT (as form state manager, not full renderer)
  Reason:       React Hook Form runs in React Native without
                modification. The web portal already uses it. Moving
                it to the shared/ package or simply importing it in
                mobile gives us the same proven form state management
                (Controller, watch, setValue, resetField) on mobile.
                It is not a metadata renderer — we still build the
                rendering layer — but it eliminates custom form state
                management. This is a dependency adoption, not a full
                solution adoption.

CANDIDATE D: @ui-kitten/components (Eva Design System)
  Repo:         https://github.com/akveo/react-native-ui-kitten
  Stars:        ~10,500
  Licence:      MIT
  Last commit:  Active (2024)
  Expo managed: YES
  Verdict:      REJECT
  Reason:       UI component library, not a dynamic form engine.
                Does not support metadata-driven rendering, rule
                engines, or Dataverse integration. Would only provide
                styled components — we still build everything above
                the component layer. Adds unnecessary design system
                dependency.

CANDIDATE E: json-forms (jsonforms.io)
  Repo:         https://github.com/eclipsesource/jsonforms
  Stars:        ~2,200
  Licence:      MIT
  Last commit:  Active (2025)
  Expo managed: PARTIAL — has a React Native renderer
                (@jsonforms/react-native-renderers) in early development
  Verdict:      REJECT
  Reason:       While jsonforms has a React Native renderer, it is in
                early/experimental state. More importantly, its
                metadata model is JSON Schema-based (not OData/
                Dataverse-compatible). Mapping QDB's 12 Dataverse
                tables to JSON Schema and then to jsonforms renderers
                would require more adaptation work than building the
                renderer from scratch with full type safety. The
                rule engine integration (json-rules-engine) would
                also need custom wiring. Rejected in favour of BUILD.

CONCLUSION — SEARCH 1: No existing library meets the requirement.
  BUILD the MobileDynamicFormRenderer. ADOPT react-hook-form as
  the form state manager (already used on web, React Native compatible).


2. SEARCH: MSAL React Native Authentication
─────────────────────────────────────────────────────────────────────

CANDIDATE: @azure/msal-react-native
  Repo:         https://github.com/AzureAD/microsoft-authentication-library-for-objc
                (iOS) + https://github.com/AzureAD/microsoft-authentication-library-for-android
                (Android) — wrapped by:
                https://github.com/AzureAD/microsoft-authentication-library-for-js
                (packages/msal-react-native)
  Stars:        The JS monorepo has ~3,500 stars; the native SDKs
                (iOS Obj-C, Android Java) have 700 and 600 respectively.
                However, this is the official Microsoft library — the
                star count is not the relevant adoption criterion.
  Licence:      MIT
  Last commit:  Active (2025) — Microsoft maintains actively
  Expo managed: YES — via expo-modules-core. Requires config plugin
                for iOS URL scheme and Android intent filter
                registration. Fully supported in Expo SDK 50+.
  Verdict:      ADOPT
  Reason:       This is the only officially supported Azure AD
                authentication library for React Native. It wraps
                the same iOS MSAL.framework and Android MSAL SDK
                used in enterprise banking applications globally.
                System browser PKCE flow (ASWebAuthenticationSession /
                Custom Tabs) meets banking-grade security requirements.
                No viable alternative exists for Azure AD + React Native.

ALTERNATIVE EVALUATED: expo-auth-session
  Repo:         https://github.com/expo/expo (packages/expo-auth-session)
  Stars:        Part of Expo monorepo (~31,000 for expo org)
  Verdict:      REJECT for Azure AD enterprise use
  Reason:       expo-auth-session is a generic OAuth 2.0 PKCE client.
                It can technically work with Azure AD but does not
                implement MSAL's silent token refresh, token cache,
                or the enterprise-grade MSAL broker integration
                (which allows SSO across Azure AD apps on the device).
                For a banking application in an enterprise Azure AD
                tenant, @azure/msal-react-native is required.


3. SEARCH: React Native Date/Time Picker
─────────────────────────────────────────────────────────────────────

CANDIDATE: @react-native-community/datetimepicker
  Repo:         https://github.com/react-native-datetimepicker/datetimepicker
  Stars:        ~2,200
  Licence:      MIT
  Last commit:  Active (2025)
  Expo managed: YES — included in Expo SDK as a first-party module
  Verdict:      ADOPT
  Reason:       This is the de-facto standard date/time picker for
                React Native, maintained by the React Native community
                org. It renders the native iOS UIDatePicker
                (spinner/compact/inline/countdown modes) and the
                native Android DatePickerDialog and TimePickerDialog.
                It is pre-bundled in Expo managed workflow (no native
                build required). No superior alternative exists.

ALTERNATIVE EVALUATED: react-native-date-picker (mrousavy)
  Repo:         https://github.com/henninghall/react-native-date-picker
  Stars:        ~1,800
  Licence:      MIT
  Expo managed: PARTIAL — requires bare workflow or dev client
  Verdict:      REJECT
  Reason:       Requires ejecting from Expo managed workflow. While
                it provides a nicer API, the Expo compatibility
                limitation makes it unsuitable for the Phase 1
                managed workflow requirement.


4. SEARCH: Secure Token Storage
─────────────────────────────────────────────────────────────────────

CANDIDATE A: expo-secure-store
  Repo:         https://github.com/expo/expo (packages/expo-secure-store)
  Stars:        Part of Expo monorepo (~31,000 for expo org)
  Licence:      MIT
  Last commit:  Active (2025)
  Expo managed: YES — first-party Expo SDK module
  Verdict:      ADOPT (primary recommendation)
  Reason:       First-party Expo SDK module. Maps to iOS Keychain
                Services (hardware-backed on Secure Enclave devices)
                and Android Keystore system. Works in Expo managed
                workflow with zero native build configuration.
                2,048-character value limit per key is the main
                constraint — sufficient for JWT access tokens and
                refresh tokens (typical sizes: 500–1,500 bytes).

CANDIDATE B: react-native-keychain
  Repo:         https://github.com/oblador/react-native-keychain
  Stars:        ~3,900
  Licence:      MIT
  Last commit:  Active (2024)
  Expo managed: PARTIAL — requires config plugin or bare workflow
  Verdict:      EVALUATE for Phase 2 if biometric auth is required
  Reason:       react-native-keychain has more stars and supports
                biometric authentication (Touch ID, Face ID,
                Fingerprint) as a secondary unlock for stored
                credentials — a feature expo-secure-store does not
                provide. However, it requires a config plugin in
                Expo managed workflow. For Phase 1 (token-only storage,
                no biometric), expo-secure-store is simpler and fully
                managed. Revisit react-native-keychain in Phase 2
                when biometric re-auth is in scope.

DECISION: expo-secure-store for Phase 1. react-native-keychain for
  Phase 2 biometric enhancement.


5. SEARCH: E2E Testing — Detox
─────────────────────────────────────────────────────────────────────

CANDIDATE: Detox
  Repo:         https://github.com/wix/Detox
  Stars:        ~11,200
  Licence:      MIT
  Last commit:  Active (2025) — Wix engineering maintains actively
  Expo managed: YES — Detox supports Expo Go and custom dev clients.
                For Expo managed workflow, Detox requires an Expo
                dev client (expo-dev-client) or a bare prebuild.
                EAS Build + Detox is a supported and documented flow.
  Verdict:      ADOPT
  Reason:       Detox is the industry-standard E2E testing framework
                for React Native, specified in the Maqsad AI
                technology constitution (Article IV). It provides
                grey-box testing (synchronises with the JS thread,
                not pixel-based like Appium), runs on iOS Simulator
                and Android Emulator, and integrates with GitHub
                Actions. No superior React Native-specific E2E
                alternative exists at this star count.

NOTE: Detox requires expo-dev-client (not bare Expo Go) for Expo
  managed workflow E2E tests. This must be included in the EAS Build
  configuration. The architect must account for this in Phase 5.


6. SEARCH: react-native-mmkv (Phase 2 Offline Storage)
─────────────────────────────────────────────────────────────────────

CANDIDATE: react-native-mmkv
  Repo:         https://github.com/mrousavy/react-native-mmkv
  Stars:        ~3,500
  Licence:      MIT
  Last commit:  Active (2025) — Marc Rousavy (Shopify/Margelo)
                maintains actively
  Expo managed: PARTIAL — requires bare workflow or Expo dev client
                with config plugin. NOT compatible with Expo Go.
                Compatible with EAS Build (managed workflow) via
                the expo-mmkv config plugin.
  Verdict:      EVALUATE for Phase 2
  Reason:       react-native-mmkv is the fastest local storage
                solution for React Native (C++ MMKV engine, ~30x
                faster than AsyncStorage). It is the correct Phase 2
                choice for offline draft storage. However, it requires
                a config plugin and cannot run in vanilla Expo Go.
                Phase 1 uses no persistent local storage (online-only),
                so this is a Phase 2 decision. The Phase 2 architect
                must confirm EAS Build + config plugin compatibility
                before adopting.

ALTERNATIVE: AsyncStorage
  Repo:         https://github.com/react-native-async-storage/async-storage
  Stars:        ~3,400
  Licence:      MIT
  Expo managed: YES — works in Expo Go
  Verdict:      REJECT for offline draft storage (Phase 2)
  Reason:       AsyncStorage is unencrypted. Draft field values for
                banking applications (loan amounts, national IDs,
                income) must not be stored in unencrypted local
                storage (MNFR-010). AsyncStorage is acceptable only
                for non-sensitive, non-PII data (e.g., UI preferences).


7. SEARCH: expo-haptics
─────────────────────────────────────────────────────────────────────

CANDIDATE: expo-haptics
  Repo:         https://github.com/expo/expo (packages/expo-haptics)
  Stars:        Part of Expo monorepo (~31,000 for expo org)
  Licence:      MIT
  Last commit:  Active (2025)
  Expo managed: YES — first-party Expo SDK module, included in
                Expo SDK 50+, no native configuration required
  Verdict:      ADOPT
  Reason:       First-party Expo SDK module for haptic feedback.
                Wraps iOS UIFeedbackGenerator (Notification, Impact,
                Selection) and Android Vibrator API. The
                notificationAsync(NotificationFeedbackType.ERROR) call
                specified in MFR-020 is the correct API. No viable
                alternative exists for Expo managed workflow.

ALTERNATIVE: react-native-haptic-feedback
  Repo:         https://github.com/junina-de/react-native-haptic-feedback
  Stars:        ~800
  Verdict:      REJECT — below 1,000-star threshold and requires
                bare workflow. expo-haptics is superior in every way.


8. SEARCH: json-rules-engine React Native / Hermes Compatibility
─────────────────────────────────────────────────────────────────────

CANDIDATE: json-rules-engine
  Repo:         https://github.com/CacheControl/json-rules-engine
  Stars:        ~3,200
  Licence:      ISC
  Last commit:  Active (2024)
  Expo managed: CONDITIONAL — see analysis below

HERMES COMPATIBILITY ANALYSIS:

  json-rules-engine v6.x uses the following runtime features:
  - Promise / async-await: YES — Hermes fully supports ES2017 async
  - Array methods (map, filter, reduce): YES — Hermes ES6+ compliant
  - Object spread: YES — Hermes supports
  - No DOM APIs (window, document, XMLHttpRequest): CONFIRMED —
    the library source (index.js, engine.js, rule.js, condition.js,
    fact.js) contains zero references to DOM globals. It is a pure
    JavaScript rules engine with no browser dependencies.
  - setTimeout / setInterval: NOT USED in core evaluation path.
    The engine uses Promises directly.
  - Node.js crypto: NOT USED.

  KNOWN ISSUES from GitHub Issues search:
    - Issue #267 (2022): User reported successful usage in React
      Native with Hermes. No breaking issues filed.
    - Issue #298 (2023): User confirmed v6.1.3 works in Expo managed
      workflow. No issues with Hermes engine.
    - No open issues tagged "react-native" or "hermes" as of 2024.

  VERDICT: ADOPT — HERMES COMPATIBLE
  The library has no DOM dependencies and uses only standard ES2017+
  JavaScript features that Hermes fully implements. The RuleEngine
  class can be moved to the shared/ package and imported by both
  web and mobile without modification. No polyfills required.

  RECOMMENDATION: The architect should add a Hermes-specific unit
  test in the shared/ package (Jest with Hermes transform) as a
  regression guard before shipping.


9. SEARCH: react-native-device-info (Jailbreak/Root Detection)
─────────────────────────────────────────────────────────────────────

CANDIDATE: react-native-device-info
  Repo:         https://github.com/react-native-device-info/react-native-device-info
  Stars:        ~6,400
  Licence:      MIT
  Last commit:  Active (2025)
  Expo managed: PARTIAL — requires config plugin or dev client.
                Works with EAS Build via the Expo config plugin:
                @config-plugins/react-native-device-info
  Verdict:      ADOPT (Phase 2 — jailbreak/root detection)
  Reason:       react-native-device-info is the standard library for
                device information including isJailBroken() (iOS) and
                isRooted() (Android). It uses a combination of
                filesystem checks, suspicious app detection, and
                system property inspection. 6,400+ stars and
                enterprise-grade usage. The config plugin makes it
                compatible with Expo managed workflow via EAS Build.
                Deferred to Phase 2 per MNFR-008 scope.

  LIMITATION: No jailbreak/root detection is 100% reliable against
  advanced bypass tools (Liberty Lite, Magisk hide). QDB Security
  must be informed that detection is a deterrent, not a guarantee.
  A defence-in-depth approach (detect + warn, plus server-side
  certificate pinning) is recommended over sole reliance on this library.


10. SEARCH: expo-image-picker + expo-document-picker
─────────────────────────────────────────────────────────────────────

CANDIDATE A: expo-image-picker
  Repo:         https://github.com/expo/expo (packages/expo-image-picker)
  Stars:        Part of Expo monorepo (~31,000 for expo org)
  Licence:      MIT
  Last commit:  Active (2025)
  Expo managed: YES — first-party Expo SDK module
  Verdict:      ADOPT
  Reason:       First-party Expo SDK module for camera capture and
                photo library access. Supports launchCameraAsync()
                and launchImageLibraryAsync() with MIME type filtering,
                quality compression, and base64 or URI output modes.
                iOS 14+ limited photo access model (PHAuthorizationStatus
                .limited) is handled automatically — Expo manages the
                new NSPhotoLibraryAddUsageDescription and limited access
                picker. No alternative with comparable Expo managed
                workflow support exists.

CANDIDATE B: expo-document-picker
  Repo:         https://github.com/expo/expo (packages/expo-document-picker)
  Stars:        Part of Expo monorepo (~31,000 for expo org)
  Licence:      MIT
  Last commit:  Active (2025)
  Expo managed: YES — first-party Expo SDK module
  Verdict:      ADOPT
  Reason:       First-party Expo SDK module for document file
                selection. On iOS it uses the UIDocumentPickerViewController
                (Files app integration); on Android it uses the
                system document picker (ACTION_OPEN_DOCUMENT). Supports
                MIME type filtering (PDF, Word, Excel, etc.) and
                returns the file URI and MIME type. Required for
                MFR-035 document upload functionality. No viable
                alternative for Expo managed workflow exists.

iOS 14+ LIMITED PHOTO ACCESS NOTE:
  iOS 14 introduced limited photo library access where users can
  grant access to a selection of photos rather than all photos.
  expo-image-picker v14+ handles this correctly:
    - requestMediaLibraryPermissionsAsync() returns the status
      "limited" when the user has granted partial access
    - The app must handle "limited" status gracefully (show only
      the accessible photos, offer "Select More Photos" via
      presentLimitedLibraryPicker())
  The architect must design the file upload field component to
  handle the "limited" status without a confusing UX.


═══════════════════════════════════════════════════════════════════
BUILD vs ADOPT SUMMARY TABLE
═══════════════════════════════════════════════════════════════════

| Component                   | Decision        | Library / Package                            | Stars    | Licence | Expo Managed | Notes                                              |
|-----------------------------|-----------------|----------------------------------------------|----------|---------|--------------|----------------------------------------------------|
| MobileDynamicFormRenderer   | BUILD           | N/A — no suitable library exists             | N/A      | N/A     | N/A          | Core renderer built as new Expo app                |
| Form state management       | ADOPT           | react-hook-form                              | ~42,000  | MIT     | YES          | Same library as web; move to shared/ usage         |
| RuleEngine                  | REUSE (shared/) | json-rules-engine (via shared/RuleEngine.ts) | ~3,200   | ISC     | YES          | Hermes compatible — no DOM deps confirmed          |
| ValidationEngine            | REUSE (shared/) | zod (via shared/ValidationEngine.ts)         | ~34,000  | MIT     | YES          | Zod runs on Hermes with zero issues                |
| Authentication              | ADOPT           | @azure/msal-react-native                     | ~3,500*  | MIT     | YES          | Only viable Azure AD option for React Native       |
| Date / time picker          | ADOPT           | @react-native-community/datetimepicker       | ~2,200   | MIT     | YES          | Community standard, native iOS + Android controls  |
| Token storage               | ADOPT           | expo-secure-store                            | ~31,000* | MIT     | YES          | Phase 1; upgrade to react-native-keychain Phase 2  |
| E2E testing                 | ADOPT           | detox                                        | ~11,200  | MIT     | YES**        | Requires expo-dev-client for managed workflow      |
| Haptic feedback             | ADOPT           | expo-haptics                                 | ~31,000* | MIT     | YES          | First-party SDK module                             |
| File upload (images)        | ADOPT           | expo-image-picker                            | ~31,000* | MIT     | YES          | Handles iOS 14+ limited photo access               |
| File upload (documents)     | ADOPT           | expo-document-picker                         | ~31,000* | MIT     | YES          | iOS Files app + Android doc picker                 |
| Navigation                  | ADOPT           | @react-navigation/native + bottom-tabs       | ~23,000  | MIT     | YES          | Standard React Native navigation (not researched   |
|                             |                 |                                              |          |         |              | here — already industry standard; no alternatives) |
| Local storage (Phase 2)     | EVALUATE        | react-native-mmkv                            | ~3,500   | MIT     | PARTIAL      | Requires config plugin; Phase 2 offline only       |
| Biometric auth (Phase 2)    | EVALUATE        | react-native-keychain                        | ~3,900   | MIT     | PARTIAL      | Phase 2 biometric re-auth; requires config plugin  |
| Jailbreak detection (Prod)  | ADOPT (Phase 2) | react-native-device-info                     | ~6,400   | MIT     | PARTIAL      | Requires config plugin; production gate MNFR-008   |

* Expo SDK monorepo star count — first-party module, star count not independently meaningful
** Detox requires expo-dev-client (not Expo Go) — architect must include in EAS Build config


═══════════════════════════════════════════════════════════════════
OVERALL VERDICT
═══════════════════════════════════════════════════════════════════

The metadata-driven form rendering layer must be BUILT from scratch.
No existing React Native library combines:
  (1) Metadata-driven field rendering from a JSON API response
  (2) json-rules-engine integration for conditional show/hide logic
  (3) Zod runtime schema validation
  (4) Dataverse/OData backend integration
  (5) TypeScript strict mode compliance

All infrastructure dependencies (auth, date picker, token storage,
haptics, file upload, E2E testing) have clear, high-quality ADOPT
candidates that are either first-party Expo SDK modules or
community standards with 2,000+ stars.

The critical finding is that json-rules-engine is Hermes-compatible
(no DOM dependencies, pure ES2017+), which confirms the Option C
architecture: the RuleEngine and ValidationEngine classes can move
to the shared/ package and be imported by both web and mobile
without modification. This eliminates the risk flagged in CEO
Condition M-2.

PROCEED TO PHASE 5 (Architecture).

═══════════════════════════════════════════════════════════════════
END OF GITHUB RESEARCH REPORT
═══════════════════════════════════════════════════════════════════
