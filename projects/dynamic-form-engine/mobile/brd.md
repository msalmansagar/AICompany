═══════════════════════════════════════════════════════════════════
BUSINESS REQUIREMENTS DOCUMENT
═══════════════════════════════════════════════════════════════════
Project:        Dynamic Form Engine — Mobile Rendering Extension
Client:         Qatar Development Bank (QDB)
Prepared by:    Maqsad AI — Business Analyst
Date:           2026-05-20
Version:        1.0
Status:         DRAFT — Pending CEO Review
Parent BRD:     projects/dynamic-form-engine/brd.md (v1.0, APPROVED)
Output dir:     projects/dynamic-form-engine/mobile/
═══════════════════════════════════════════════════════════════════


1. EXECUTIVE SUMMARY
─────────────────────────────────────────────────────────────────────
QDB's Dynamic Form Engine Portal (Phase 1, web) is approved and in
Sprint 1 remediation. It allows the CRM Configuration Team to define
banking forms entirely in Microsoft Dataverse and have them rendered
in a React web portal with no code deployment per form. The business
now requires the same metadata-driven capability to be available on
iOS and Android mobile devices so that bank customers can complete
banking applications — including the reference Loan Application form —
on their smartphones and tablets.

This document defines the requirements for the Dynamic Form Engine
Mobile Rendering Extension: a React Native + Expo mobile application
for iOS and Android that consumes the exact same Dataverse form
metadata and the exact same Express backend API as the existing web
portal. Forms defined once in Dataverse render on both web and mobile
without any additional configuration.

The mobile extension is architecturally additive. It does not require
changes to the 12 Dataverse configuration tables, the backend API
contracts, or the submission mapping logic. It introduces a new mobile
application package (Expo managed workflow, React Native + TypeScript)
and a strengthened shared types package used by both web and mobile.

The key constraint governing timing: the mobile extension's
authentication model shares the same foundational assumption as the
web portal — that all users authenticate through QDB's corporate Azure
AD tenant (ADR-007). Until QDB provides written confirmation of this
assumption (web engagement BLOCKER-8 / GATE-A), the mobile app's auth
layer cannot be finalised. Mobile development can proceed in parallel
on all non-auth components, but mobile UAT cannot begin before the
web Sprint 1 external gates (GATE-A and GATE-B) are resolved.


2. BUSINESS OBJECTIVES
─────────────────────────────────────────────────────────────────────
MBO-001: Enable QDB bank customers to complete and submit banking
         forms (loan applications, KYC, onboarding) on iOS and Android
         devices so that the channel coverage of the form engine
         extends to mobile-first customers who do not use a desktop
         browser.

MBO-002: Enable the CRM Configuration Team to publish a form once in
         Dataverse and have it render on both web and mobile without
         any additional configuration, frontend code change, or mobile
         redeployment, preserving the existing zero-deployment-per-form
         business value.

MBO-003: Enable mobile users to experience native-feel banking
         interactions — platform-appropriate date pickers, keyboard
         types, sheet-style selectors, and haptic feedback — so that
         the form completion rate on mobile equals or exceeds the web
         completion rate for equivalent forms.

MBO-004: Enable mobile users to upload supporting documents by
         capturing a photo with the device camera or selecting a file
         from the device gallery, so that document submission does not
         require access to a desktop system.

MBO-005: Enable IT and DevOps to deploy and maintain a single mobile
         app codebase that serves all form types on both iOS and
         Android, consistent with the existing single-codebase web
         deployment model.

MBO-006: Enable the Compliance and Audit team to receive audit log
         entries from mobile form submissions using the same append-
         only audit log as the web portal, so that mobile and web
         submissions are governed by a single audit record.

Relationship to web BRD objectives:
  MBO-001 extends web BO-002 (portal users completing forms).
  MBO-002 extends web BO-001 (zero-deployment-per-form).
  MBO-003 is mobile-specific (no web equivalent for native controls).
  MBO-004 extends web FR-031 (file upload) with camera capture.
  MBO-005 extends web BO-005 (single codebase model).
  MBO-006 directly inherits web BO-004 (audit compliance).


3. STAKEHOLDERS
─────────────────────────────────────────────────────────────────────
| Stakeholder               | Role                  | Interest in this project                                          |
|---------------------------|-----------------------|-------------------------------------------------------------------|
| CRM Configuration Team    | Form Author           | Define forms in Dataverse once; appear on both web and mobile     |
| Mobile Users              | End User              | Submit banking applications on iOS/Android devices                |
| Portal Users (web)        | End User              | Not directly impacted; shared backend API must not regress        |
| Relationship Managers     | CRM Consumer          | Receive structured CRM records from mobile submissions            |
| QDB Mobile Team           | Platform Owner        | Manage mobile app releases, MDM policy, app store submissions     |
| IT / DevOps               | Platform Owner        | Deploy, maintain, and monitor the mobile app and shared backend   |
| Compliance / Audit        | Governance Overseer   | Verify mobile submissions appear in the same audit log as web     |
| QDB Product / Business    | Project Sponsor       | Approve mobile channel extension; confirm app store distribution  |
| QDB Security              | Security Gatekeeper   | Approve mobile security posture (cert pinning, jailbreak policy)  |
| Maqsad AI Dev Team        | Delivery Team         | Design, build, test, and hand over the mobile module              |


4. SCOPE
─────────────────────────────────────────────────────────────────────

4.1 In Scope — Phase 1 Mobile

  Architecture:
    - Expo managed workflow application (React Native + TypeScript)
      targeting iOS 16+ and Android 13+
    - Option C architecture: mobile-only Expo app + shared types/
      engines extracted into the existing shared/ package
      (see Section 6 for full architecture decision rationale)
    - Shared package exports: FormDefinition types, RuleEngine,
      ValidationEngine — used by both web and mobile

  Authentication:
    - Azure AD / Entra ID authentication via @azure/msal-react-native
    - PKCE authorisation code flow with custom URI scheme redirect
      (msauth://com.qdb.formengine)
    - Secure token storage via Expo SecureStore (AES-256 encrypted
      hardware-backed store on iOS Keychain / Android Keystore)
    - New Azure AD mobile app registration (separate from web SPA
      registration) with mobile redirect URI scheme

  Form rendering — 15 field types in Phase 1:
    - text           → TextInput (keyboardType: default)
    - textarea       → TextInput (multiline: true)
    - number         → TextInput (keyboardType: numeric)
    - currency       → TextInput (keyboardType: decimal-pad) +
                       currency symbol prefix/suffix
    - decimal        → TextInput (keyboardType: decimal-pad) +
                       decimal place enforcement
    - date           → @react-native-community/datetimepicker
                       (iOS: spinner/compact; Android: date mode)
    - datetime       → @react-native-community/datetimepicker
                       (iOS: datetime; Android: date then time modal)
    - dropdown       → ActionSheet (iOS) / Modal picker (Android)
    - multiselect    → Custom modal with checkbox list
    - lookup         → TextInput type-ahead + FlatList results modal
    - checkbox       → Switch (single) or custom CheckBox component
    - radio          → Custom RadioGroup with TouchableOpacity items
    - email          → TextInput (keyboardType: email-address,
                       autoCapitalize: none)
    - phone          → TextInput (keyboardType: phone-pad)
    - file           → expo-image-picker (camera + gallery) +
                       expo-document-picker (PDF, Word, Excel) +
                       multipart upload to existing /api/files/upload

  Form engine:
    - json-rules-engine v6.x runs in React Native (Hermes engine
      compatible — verified via JSI + no DOM dependencies)
    - RuleEngine class moved to shared/ package; consumed by both
      web and mobile without modification
    - Same conditional logic: show/hide fields/sections/tabs,
      required/optional/readonly, set/clear/calculate values,
      filter dropdown options and lookup results
    - ValidationEngine (Zod runtime schemas) moved to shared/ package;
      runs identically on React Native

  Draft / submission:
    - Save-as-draft (persisted to Dataverse via backend API)
    - Resume draft (pre-populate form from Dataverse draft record)
    - Final submission (POST /api/forms/:formCode/submit)
    - Confirmation screen with CRM reference number

  Native feel:
    - Platform-specific keyboard types per field type
    - iOS: UIDatePicker sheet; Android: Material DatePickerDialog
    - iOS: ActionSheet for dropdowns; Android: bottom-sheet modal
    - Haptic feedback on validation error (Haptics.notificationAsync
      NOTIFICATION_TYPE.ERROR via expo-haptics)
    - Tab navigation: bottom tab bar (React Navigation BottomTabs)
    - Section navigation: ScrollView with section headers
    - Accessibility: accessibilityLabel, accessibilityHint, and
      accessibilityRole on all interactive elements (VoiceOver +
      TalkBack compatible)

  API:
    - Reuse all existing backend API endpoints without modification
    - No new backend endpoints required for Phase 1 mobile
    - Mobile app includes the same Authorization: Bearer header on
      every request as the web portal

  Testing:
    - Jest + React Native Testing Library (unit + component tests)
    - Detox E2E tests on iOS Simulator and Android Emulator
    - Minimum 80% code coverage on mobile-specific components

  CI/CD:
    - Expo Application Services (EAS Build) for iOS and Android
      build artefacts
    - GitHub Actions pipeline: lint → type-check → unit test →
      Detox E2E → EAS Build → EAS Submit (app store / Play Store)

4.2 Out of Scope — Phase 1 Mobile

  - Rich text editor field type (fieldType: richtext)
      Reason: No native React Native rich text editor exists without
      a WebView (which violates the native-feel requirement). The
      existing @tiptap/react is a DOM-based library. Phase 2 will
      evaluate react-native-pell-rich-editor (WebView-based, accepted
      tradeoff) or Quill native alternatives. Forms containing richtext
      fields will render those fields as read-only textarea on mobile
      with a "Full editing available on web" indicator.

  - Repeating grid field type (fieldType: grid)
      Reason: The repeating grid requires dynamic row addition/deletion
      with per-row validation. On a mobile screen this is a complex,
      screen-space-constrained UX problem that requires dedicated
      mobile design research. Phase 2. Forms containing grid fields
      will render a "This section must be completed on the web portal"
      notice for those fields.

  - Offline form filling and sync
      Reason: The parent web BRD explicitly excluded offline capability.
      Extending to offline on mobile would require MMKV local storage,
      a sync queue, conflict resolution logic, and changes to the
      backend draft API to support out-of-order sync. This is a
      substantial feature with its own architecture cycle. Phase 2.
      Phase 1 mobile is online-only, identical to the web portal.

  - Push notifications (form status updates)
      Reason: Requires device token registration, a notification
      service (Azure Notification Hubs or Expo Push), and backend
      changes. Out of scope for Phase 1. Phase 2.

  - Biometric authentication (Face ID / Fingerprint)
      Reason: The current auth model is Azure AD PKCE only. Adding
      biometric as a re-authentication mechanism requires integration
      with expo-local-authentication and a secure session token pattern.
      Phase 2 enhancement after the ADR-007 tenant question is resolved.

  - Admin configuration screens on mobile
      Admin form management (CRUD on Dataverse metadata tables) remains
      web-only. Mobile is a form-filling surface for bank customers only.

  - Multi-language / localisation (same as web Phase 1)

  - MDM / MAM policy enforcement
      QDB Mobile Team manages Intune or equivalent MDM policy for
      corporate devices. The mobile app will declare the correct iOS
      NSFaceIDUsageDescription and Android permissions but will not
      enforce MDM enrolment. Phase 2 if QDB requires MAM.

  - App Store / Play Store publishing
      EAS Submit will produce the .ipa and .aab artefacts. The actual
      App Store Connect and Play Console submission, review, and listing
      management is owned by QDB Mobile Team. Maqsad AI delivers the
      build artefacts and submission scripts.

  - jailbreak / root detection
      Not in scope for Phase 1 UAT. Required before production (see
      MNFR-008). Will be evaluated via react-native-device-info or
      a dedicated jail-break detection library in Phase 2 hardening.


5. FIELD TYPE MAPPING — WEB TO MOBILE NATIVE
─────────────────────────────────────────────────────────────────────

| Web fieldType  | Phase | Mobile Control (iOS)                          | Mobile Control (Android)                        | Notes                                                          |
|----------------|-------|-----------------------------------------------|-------------------------------------------------|----------------------------------------------------------------|
| text           | 1     | TextInput, keyboardType: default              | TextInput, keyboardType: default                | autoCapitalize per metadata flag                               |
| textarea       | 1     | TextInput, multiline: true, numberOfLines: 4  | TextInput, multiline: true, numberOfLines: 4    | Grows to content; max height 200dp with scroll                 |
| number         | 1     | TextInput, keyboardType: number-pad           | TextInput, keyboardType: numeric                | Integer only; decimal-pad for decimal/currency                 |
| currency       | 1     | TextInput, keyboardType: decimal-pad          | TextInput, keyboardType: decimal-pad            | Currency symbol from metadata; decimal places enforced         |
| decimal        | 1     | TextInput, keyboardType: decimal-pad          | TextInput, keyboardType: decimal-pad            | Precision enforced client-side                                 |
| date           | 1     | DateTimePicker, mode: date, display: spinner  | DateTimePicker, mode: date, display: calendar   | iOS bottom sheet; Android Material DatePickerDialog            |
| datetime       | 1     | DateTimePicker, mode: datetime, display: inline | Two-step: date modal then time modal (Android) | iOS combined; Android requires two sequential pickers          |
| dropdown       | 1     | ActionSheet (UIActionSheet native sheet)      | Modal with FlatList (bottom-sheet style)        | Options from metadata optionValues[]                           |
| multiselect    | 1     | Modal with CheckBox list + Done button        | Modal with CheckBox list + Done button          | Selected items shown as Chip tags below input                  |
| lookup         | 1     | TextInput type-ahead + FlatList (min 3 chars) | TextInput type-ahead + FlatList (min 3 chars)   | Calls /api/lookup/:entity; 300ms debounce                      |
| checkbox       | 1     | Switch component (iOS toggle style)           | Switch component (Android Material toggle)      | Label above, switch inline right                               |
| radio          | 1     | Custom RadioGroup, TouchableOpacity per item  | Custom RadioGroup, TouchableOpacity per item    | Platform colour from theme token                               |
| email          | 1     | TextInput, keyboardType: email-address        | TextInput, keyboardType: email-address          | autoCapitalize: none; autoCorrect: false                       |
| phone          | 1     | TextInput, keyboardType: phone-pad            | TextInput, keyboardType: phone-pad              |                                                                |
| file           | 1     | expo-image-picker + expo-document-picker      | expo-image-picker + expo-document-picker        | Camera capture OR gallery OR file; multipart upload            |
| richtext       | 2     | Read-only TextInput (Phase 2 WebView editor)  | Read-only TextInput (Phase 2 WebView editor)    | Phase 1: read-only display with "Edit on web" notice           |
| grid           | 2     | "Complete on web" notice card                 | "Complete on web" notice card                   | Full Phase 2 implementation with dedicated mobile UX design    |


6. ARCHITECTURE RECOMMENDATION — OPTION C
─────────────────────────────────────────────────────────────────────

6.1 Options Evaluated

  Option A: New standalone Expo app, no shared package changes.
    Pro: Fastest to start. Mobile team has no dependency on web team.
    Con: RuleEngine and ValidationEngine are duplicated. Any fix to
    the rule engine must be applied in two codebases. Type drift between
    web FormDefinition types and mobile types creates silent bugs.
    Assessment: Rejected. Violates DRY. The rule engine is the most
    complex and risk-carrying component in the system; duplicating it
    doubles the maintenance surface.

  Option B: Shared rendering library used by both web and mobile.
    Pro: Maximum code reuse. Single source of truth for all components.
    Con: Migrating the web portal to consume a shared component library
    is a significant rework of the existing web codebase (which is in
    Sprint 1 remediation with 10 active blockers). Blocking mobile on
    a web refactor that has no approved timeline is unacceptable. Fluent
    UI v9 web components cannot be shared with React Native — completely
    different component trees.
    Assessment: Rejected for Phase 1. Correct long-term direction for
    Phase 3 when the web sprint is stable.

  Option C: Mobile-only Expo app + extract shared types/engines
    into the existing shared/ package.
    Pro: RuleEngine, ValidationEngine, and all TypeScript types
    (FormDefinition, FieldDefinition, ValidationRule, BusinessRule, etc.)
    move from web-only to shared/. Both web and mobile import from
    shared/. Mobile rendering components are entirely new React Native
    files. No change to web rendering components (Fluent UI v9 stays
    in web). The shared/ package is already defined in the web
    architecture (phase-3-arch.md section 13).
    Con: The shared/ package extraction from the web project requires
    one refactor sprint on the web side. This can be done as part of
    Sprint 1 web remediation (it is an internal restructuring, not a
    new feature, and the types are already defined in shared/).
    Assessment: RECOMMENDED. Minimal web disruption. Maximum engine
    reuse. Unblocks mobile team to build rendering independently.

6.2 Recommended Architecture Summary

  shared/                         (extract from web; reused by both)
    src/types/form.ts             FormDefinition, FieldDefinition, etc.
    src/engines/RuleEngine.ts     json-rules-engine wrapper
    src/engines/ValidationEngine.ts Zod runtime schema builder
    src/types/api.ts              ApiResponse<T>, ApiError

  web/                            (existing — consumes shared/)
    No change to Fluent UI components
    imports RuleEngine from shared/ instead of local path

  mobile/                         (new Expo managed app)
    src/
      app/                        Expo Router (file-based routing)
      components/form/            MobileDynamicFormRenderer.tsx
      components/fields/          15 native field components
      components/navigation/      BottomTabNavigator, FormTabBar
      engines/                    imports RuleEngine, ValidationEngine
                                  from shared/
      services/                   Same API service layer (axios/fetch)
      auth/                       MSAL React Native provider
      hooks/                      useFormMetadata, useRuleEngine,
                                  useValidationEngine, useDraft


7. AUTHENTICATION — MOBILE MSAL DESIGN
─────────────────────────────────────────────────────────────────────

7.1 Library

  @azure/msal-react-native (Microsoft official, Expo-compatible via
  expo-modules-core). This library wraps the MSAL iOS and Android
  native SDKs, using the system browser (ASWebAuthenticationSession
  on iOS, Custom Tabs on Android) for the authentication UI.
  It does not use a WebView for auth — it is native browser-based
  PKCE, which is the correct security posture for banking.

7.2 PKCE Flow on Mobile

  1. App calls msalInstance.signIn() with PKCE parameters.
  2. System browser opens Azure AD login page.
  3. User authenticates (MFA if tenant policy requires).
  4. Azure AD redirects to the custom URI scheme:
     msauth://com.qdb.formengine/callback with authorization_code.
  5. OS routes the redirect to the app via the registered URI scheme.
  6. MSAL exchanges code + code_verifier for id_token + access_token.
  7. Tokens stored in Expo SecureStore (iOS Keychain, Android Keystore)
     by the MSAL native cache — not in AsyncStorage or MMKV.
  8. All API calls attach Authorization: Bearer {access_token}.
  9. Token refresh: acquireTokenSilent() before each API call; triggers
     re-authentication only on refresh token expiry.

7.3 App Registration

  A new Azure AD app registration is required for the mobile app,
  separate from the web SPA registration. Reason: the web registration
  uses https:// redirect URIs (SPA type); the mobile registration
  uses the custom URI scheme msauth://com.qdb.formengine/callback
  (mobile + desktop type). The two cannot share a single registration.

  The mobile registration must request the same API scope as the web:
  api://{backendAppId}/access_as_user

  The backend API's authMiddleware validates tokens from both
  registrations — they share the same Azure AD tenant and backend
  audience, so no backend changes are required.

7.4 ADR-007 Risk Inheritance

  The mobile app inherits the same ADR-007 risk as the web portal:
  if QDB portal users are external bank customers (not corporate AD
  tenant members), both the web and mobile apps must be rebuilt to
  use Entra External ID. Written confirmation from QDB (GATE-A) is
  required before mobile UAT begins, exactly as for web. Mobile
  development on non-auth components can proceed in parallel.

7.5 Secure Token Storage

  Access tokens and refresh tokens are stored exclusively in Expo
  SecureStore, which maps to iOS Keychain (hardware-backed on devices
  with Secure Enclave) and Android Keystore (hardware-backed on
  Android 6+). No token data is ever written to AsyncStorage,
  MMKV, or any plaintext file. This satisfies MNFR-011 (no PII in
  unencrypted local storage).


8. OFFLINE CAPABILITY — PHASE 1 DECISION
─────────────────────────────────────────────────────────────────────

Decision: ONLINE-ONLY for Phase 1 mobile.

Rationale:
  1. The parent web BRD explicitly excluded offline capability
     (Section 4.2 out of scope). Introducing offline on mobile
     before the web portal is in UAT would create an asymmetry in
     the data contract: a mobile draft saved offline while the
     backend is unreachable cannot be validated server-side. The
     backend submission endpoint performs server-side Zod re-validation
     and OData injection checks before writing to Dataverse. An
     offline-then-sync model would need to queue raw field values
     locally and replay them — this requires a conflict resolution
     protocol for drafts (the user might start a new draft on web
     while offline on mobile) and backend changes to the draft API.

  2. The 10 web Sprint 1 blockers include BLOCKER-10 (business rules
     never fetched) and BLOCKER-1 (data residency). Adding an offline
     sync layer before these are resolved would obscure whether sync
     failures are caused by the mobile cache or by the backend bugs.

  3. Banking regulations (QCB) require that submitted records are
     traceable. A local MMKV queue that silently fails to sync creates
     a class of regulatory gap (the user believes they submitted; the
     bank has no record). Online-only eliminates this risk entirely.

Phase 2 offline capability (if approved by QDB):
  MMKV-based local draft store (react-native-mmkv, ~3,500 stars,
  5x faster than AsyncStorage). Sync-on-reconnect using NetInfo
  (network state monitoring). Optimistic conflict resolution:
  server draft wins if both have modifications within the same 5-
  minute window. Requires a backend draft API extension for ETag-
  based optimistic concurrency (already identified as a gap in the
  web architecture skeptic review — Challenge 9).


9. FUNCTIONAL REQUIREMENTS
─────────────────────────────────────────────────────────────────────

9.1 Mobile Authentication

MFR-001: The mobile app shall require users to authenticate via
         Azure AD / Entra ID using the MSAL React Native library
         before accessing any form or draft.

MFR-002: The mobile app shall initiate PKCE authorisation code flow
         using the system browser (ASWebAuthenticationSession on iOS,
         Custom Tabs on Android) — not a WebView.

MFR-003: The mobile app shall store access tokens and refresh tokens
         exclusively in Expo SecureStore. No token shall be written to
         AsyncStorage, MMKV, or any unencrypted storage mechanism.

MFR-004: The mobile app shall silently refresh expired access tokens
         using acquireTokenSilent() before every API call. If silent
         refresh fails, the user shall be redirected to the Azure AD
         login screen.

MFR-005: The mobile app shall pass the authenticated user's Azure AD
         Bearer token on every request to the backend API, identical
         to the web portal.

9.2 Metadata Fetch and Caching

MFR-006: The mobile app shall fetch form metadata from
         GET /api/forms/:formCode/metadata using the same endpoint and
         response contract as the web portal.

MFR-007: The mobile app shall cache the FormDefinition in memory for
         the duration of the active session. The cache shall be keyed
         by formCode:version. No form structure data shall be written
         to persistent storage.

MFR-008: The mobile app shall display a loading indicator while
         metadata is being fetched and an error screen with a retry
         button if the fetch fails.

9.3 Form Rendering

MFR-009: The mobile app shall render any form returned by the metadata
         API without requiring a new app release or code deployment,
         using only configuration data from Dataverse.

MFR-010: The mobile app shall render multi-tab forms as a bottom tab
         navigator. Each tab's title shall be the displayLabel from the
         TabDefinition metadata. Tab order shall follow displayOrder.

MFR-011: The mobile app shall render sections within each tab as named
         groupings in a ScrollView. Collapsible sections shall collapse
         and expand on header tap.

MFR-012: The mobile app shall render fields in the order specified by
         the displayOrder attribute of each FieldDefinition.

MFR-013: The mobile app shall render the following 15 field types using
         the native mobile controls specified in Section 5:
         text, textarea, number, currency, decimal, date, datetime,
         dropdown, multiselect, lookup, checkbox, radio, email, phone,
         file.

MFR-014: For richtext field types, the mobile app shall render a
         read-only text display of the field label and a notice:
         "Rich text editing is available on the web portal." The field
         shall be excluded from mobile-side validation.

MFR-015: For grid (repeating grid) field types, the mobile app shall
         render a notice card: "This section must be completed on the
         QDB web portal." The field shall not block form submission
         if it is not required per metadata.

9.4 Platform-Specific Native Controls

MFR-016: The mobile app shall use @react-native-community/datetimepicker
         for date and datetime fields. On iOS, it shall use the spinner
         or inline display mode within a modal bottom sheet. On Android,
         it shall open the native Material DatePickerDialog.

MFR-017: For datetime fields on Android, the mobile app shall present
         the date picker first and, on date confirmation, immediately
         present the native TimePickerDialog. The combined date-time
         value shall be assembled from both selections.

MFR-018: The mobile app shall use a native ActionSheet (iOS) or a
         modal bottom-sheet list (Android) for single-select dropdown
         fields. The ActionSheet/modal shall include a Cancel action.

MFR-019: The mobile app shall use the correct keyboardType for each
         field type as specified in Section 5, so that the system
         keyboard presents the appropriate layout (number pad, decimal
         pad, email keyboard, phone pad, default QWERTY).

MFR-020: The mobile app shall provide haptic feedback (Haptics.
         notificationAsync(NotificationFeedbackType.Error) via expo-
         haptics) when a field-level validation error is shown on blur
         or on submission attempt.

MFR-021: All interactive elements (buttons, field inputs, checkboxes,
         radio items, date pickers, dropdowns) shall carry
         accessibilityLabel, accessibilityHint, and accessibilityRole
         props to support VoiceOver (iOS) and TalkBack (Android).

9.5 Rule Engine on Mobile

MFR-022: The mobile app shall evaluate conditional business rules in
         real time as field values change, using the RuleEngine class
         imported from the shared/ package. The rule engine shall run
         on the Hermes JavaScript engine.

MFR-023: The mobile app shall support all 14 rule actions defined in
         the parent web BRD (FR-014): SHOW_FIELD, HIDE_FIELD,
         SHOW_SECTION, HIDE_SECTION, SHOW_TAB, HIDE_TAB, REQUIRE_FIELD,
         OPTIONAL_FIELD, READONLY_FIELD, SET_VALUE, CLEAR_VALUE,
         CALCULATE_VALUE, FILTER_OPTIONS, FILTER_LOOKUP.

MFR-024: Hidden fields shall have their values cleared before the
         mobile app sends a submission request (BR-002 equivalent).

MFR-025: The mobile app shall support all 15 trigger condition types
         (FR-015): field equals, not equals, is empty, is not empty,
         greater than, less than, in list, AND/OR compound conditions.

9.6 Validation Engine on Mobile

MFR-026: The mobile app shall build Zod validation schemas at runtime
         from metadata ValidationRule records, using the ValidationEngine
         class imported from the shared/ package.

MFR-027: The mobile app shall validate fields on blur (when the user
         moves focus away from the field) and display the configured
         error message below the field.

MFR-028: The mobile app shall perform a full validation pass across all
         tabs on submission attempt and prevent submission if any
         required field fails validation.

MFR-029: The mobile app shall scroll to and highlight the first failing
         field when submission is blocked by a validation error.

MFR-030: The mobile app shall support all 11 active validation rule
         types from Phase 1 web (REQUIRED, MIN_LENGTH, MAX_LENGTH,
         MIN_VALUE, MAX_VALUE, REGEX, EMAIL_FORMAT, PHONE_FORMAT,
         DATE_BEFORE, DATE_AFTER, CROSS_FIELD). CUSTOM_EXPRESSION
         remains deferred to Phase 2 on mobile as on web.

9.7 Draft Management on Mobile

MFR-031: The mobile app shall allow an authenticated user to save a
         partially completed form as a draft at any point by tapping
         "Save Draft." All entered values shall be persisted to
         Dataverse via POST /api/drafts.

MFR-032: The mobile app shall allow a user to resume a previously saved
         draft by loading the draft record and pre-populating all form
         fields with the saved values via GET /api/drafts?formCode=.

MFR-033: The mobile app shall enforce one active draft per user per
         form definition. If an active draft exists when the user opens
         a form, the app shall present an action sheet: "Resume saved
         draft" or "Start fresh."

MFR-034: The mobile app shall not persist draft field values to device
         storage. Drafts are server-side only (Dataverse via backend
         API). Draft data is held in React state in memory only.

9.8 File Upload on Mobile

MFR-035: The mobile app shall support file upload fields using
         expo-image-picker for camera capture and gallery selection
         and expo-document-picker for PDF, Word, Excel, and other
         document files.

MFR-036: The mobile app shall present the user with an action sheet
         offering three options: "Take Photo," "Choose from Gallery,"
         "Choose File." Options displayed shall be filtered by the
         allowed MIME types configured in DocumentUploadConfig.

MFR-037: The mobile app shall display an upload progress indicator
         while the file is being uploaded to POST /api/files/upload.

MFR-038: The mobile app shall enforce the maximum file size limit
         configured in DocumentUploadConfig before uploading. If the
         selected file exceeds the limit, an inline error shall be
         shown and the upload shall not proceed.

MFR-039: The mobile app shall request camera and photo library
         permissions at runtime using expo-permissions before
         accessing the camera or gallery. If permission is denied,
         the app shall display an explanation and a link to device
         settings.

9.9 Submission on Mobile

MFR-040: The mobile app shall POST /api/forms/:formCode/submit with
         the complete field values object and optional draftId,
         identical to the web portal.

MFR-041: On successful submission, the mobile app shall navigate to a
         confirmation screen displaying the CRM reference number and
         a "Done" button that returns the user to the form list.

MFR-042: If submission fails (network error, 422 validation, 500
         Dataverse error), the mobile app shall retain all entered
         field values, display a user-friendly error message, and
         offer a "Try Again" button.

9.10 Form List

MFR-043: The mobile app shall display a list of all form definitions
         accessible to the authenticated user, fetched from a new
         endpoint GET /api/forms (listing active, user-accessible
         forms). This endpoint does not exist in the current web
         backend; it must be added as a minor backend enhancement.

MFR-044: Each form in the list shall display the form display name
         and a "Resume" indicator if an active draft exists for that
         form.

9.11 Audit Log

MFR-045: All submission events from the mobile app (form opened, draft
         saved, draft resumed, form submitted success, form submitted
         failure, document uploaded) shall be written to the same
         qdb_form_audit_log Dataverse table as web submissions, via
         the backend API's existing audit service.

MFR-046: The audit log entry shall record the same fields as web
         entries plus a channel attribute (web or mobile) to allow
         filtering by submission channel.


10. NON-FUNCTIONAL REQUIREMENTS
─────────────────────────────────────────────────────────────────────

MNFR-001: Performance — The mobile app shall be interactive (first
          form rendered and usable) within 3 seconds of the metadata
          API response on a 4G LTE connection (minimum 10 Mbps down).

MNFR-002: Performance — The lookup type-ahead shall display results
          within 800 ms of the user stopping typing, matching the web
          portal NFR-002 target.

MNFR-003: Performance — Rule engine evaluation for a form with up to
          50 fields and 200 rules shall complete within 100 ms on a
          mid-range 2023 device (Apple A15 equivalent or Snapdragon
          778G equivalent), so that the UI does not appear sluggish
          during field interaction.

MNFR-004: Availability — The mobile app is dependent on the backend
          API and shares the 99.5% uptime target during QDB business
          hours (NFR-003 from web BRD). The mobile app shall display
          a "Service temporarily unavailable" screen on API timeout
          or 503, with retry without data loss.

MNFR-005: Platform — The mobile app shall support iOS 16.0 and above
          and Android 13 (API level 33) and above. Earlier versions
          are not supported.

MNFR-006: Security — All data in transit between the mobile app and
          the backend API shall be encrypted using TLS 1.2 or higher.
          No sensitive data shall be transmitted over unencrypted
          connections.

MNFR-007: Security — No access tokens, refresh tokens, draft field
          values, or personally identifiable information shall be
          stored in AsyncStorage, MMKV, or any unencrypted local
          storage mechanism. Expo SecureStore is the only permitted
          persistence layer for sensitive data.

MNFR-008: Security — Jailbreak and root detection shall be implemented
          before production go-live using react-native-device-info
          (or equivalent, minimum 5,000 GitHub stars). On detection,
          the app shall display a warning and log the event to the
          audit log. App termination on jailbreak/root detection is
          a QDB Security decision (configurable behaviour). This is
          a production gate item; not required for UAT.

MNFR-009: Security — Certificate pinning shall be evaluated in Phase 2.
          Phase 1 uses standard TLS certificate validation. Certificate
          pinning adds operational risk (app update required when cert
          rotates) that must be weighed against the banking security
          requirement. QDB Security must make a written decision before
          production go-live.

MNFR-010: Privacy — No personally identifiable information entered into
          form fields shall be persisted to device storage at any point.
          Field values are held in React state (in-memory) only and are
          discarded when the app is backgrounded past the OS memory
          reclaim point. Drafts are saved to Dataverse server-side.

MNFR-011: Accessibility — All form controls shall comply with WCAG 2.1
          Level AA mobile criteria. All interactive elements shall carry
          accessibilityLabel, accessibilityHint, and accessibilityRole.
          Forms shall be fully operable with VoiceOver (iOS) and
          TalkBack (Android) screen readers.

MNFR-012: Maintainability — The mobile codebase shall maintain a minimum
          of 80% unit and component test coverage (Jest + RNTL).
          All public hooks and service functions shall have unit tests.

MNFR-013: App Size — The initial app download size shall not exceed
          30 MB (uncompressed IPA / APK) to support users on limited
          data plans.

MNFR-014: Compliance — All audit log entries from mobile submissions
          shall comply with the same QCB record-keeping requirements as
          web submissions (7-year retention, append-only, no PII outside
          Dataverse).


11. BUSINESS RULES
─────────────────────────────────────────────────────────────────────

MBR-001: A mobile form may not be submitted if it has any active
         required validation failures on any field, regardless of
         whether the failing field is currently visible or hidden
         by the rule engine. (Inherits web BR-001.)

MBR-002: A field that is hidden by the rule engine on mobile shall
         have its value cleared before the submission payload is
         assembled. (Inherits web BR-002.)

MBR-003: Only one active draft may exist per user per form definition,
         across both web and mobile. A draft started on mobile and
         resumed on web (or vice versa) is the same draft record in
         Dataverse. (Extends web BR-003.)

MBR-004: A draft record older than the configured draft expiry period
         (default 90 days) shall be excluded from the mobile resume
         flow. The expiry check on mobile shall be performed at the
         API response level (the backend returns 404 for expired
         drafts) and also client-side by comparing qdb_expires_on
         to the current device time. (Inherits web BR-004.)

MBR-005: Document uploads from the mobile camera or gallery shall be
         associated with the submission record, not the user record,
         in CRM Notes or SharePoint. (Inherits web BR-005.)

MBR-006: Submission mapping on mobile is executed by the backend API
         as an atomic operation, identical to web submissions.
         (Inherits web BR-006.)

MBR-007: A deactivated Form Definition shall return a 404 from the
         metadata API. The mobile app shall display a "Form not
         available" screen. (Inherits web BR-007.)

MBR-008: The mobile app shall only upload files whose actual MIME type
         (detected by magic bytes by the backend) matches the allowed
         types in DocumentUploadConfig. Client-side file type checking
         (by extension and MIME from the picker) is a pre-filter only
         and is not a security control.

MBR-009: richtext fields encountered in metadata on mobile shall not
         block form submission. They shall be rendered as read-only
         and excluded from validation.

MBR-010: grid (repeating grid) fields encountered in metadata on mobile
         shall not block form submission unless the field is marked
         isRequiredDefault in metadata. If required, the mobile app
         shall display an error notice explaining that the field must
         be completed on the web portal.

MBR-011: The mobile channel attribute on audit log entries shall be
         set to "mobile" for all events originating from the mobile
         app. The backend derives this from a custom request header
         X-Client-Platform: mobile that the mobile app sets on all
         API calls.


12. USER STORIES
─────────────────────────────────────────────────────────────────────

MUS-01
  As a bank customer (mobile user), I want to authenticate with my
  QDB work credentials on my phone so that I can access banking forms
  securely without a separate mobile login.
  Priority: Must Have
  Acceptance Criteria:
    Given a bank customer opens the QDB Forms app on iOS or Android
    When they tap "Sign In"
    Then the system browser opens the Azure AD login page, the user
      authenticates (with MFA if required), and is returned to the app
      with a valid session and access to their form list.

MUS-02
  As a bank customer (mobile user), I want to open the QDB loan
  application form on my phone and see all its tabs, sections, and
  fields rendered natively so that the form feels like a proper
  mobile banking app, not a website.
  Priority: Must Have
  Acceptance Criteria:
    Given the Loan Application form is configured in Dataverse
    When a mobile user navigates to the form
    Then all five tabs appear as a bottom tab navigator, all sections
      are rendered with section headers, all fields use native mobile
      controls (text inputs with correct keyboard types, native date
      pickers, action sheets for dropdowns), and no WebView is used
      for any core form control.

MUS-03
  As a bank customer (mobile user), I want the form to show and hide
  fields based on my previous answers in real time so that I am only
  asked questions relevant to my situation.
  Priority: Must Have
  Acceptance Criteria:
    Given a business rule is configured to hide Field B when Field A
      equals "No"
    When a mobile user sets Field A to "No"
    Then Field B is immediately hidden without any screen reload, and
      its value is cleared before submission.

MUS-04
  As a bank customer (mobile user), I want to save my partially
  completed form as a draft on my phone so that I can return to it
  later, including from the web portal if needed.
  Priority: Must Have
  Acceptance Criteria:
    Given a mobile user has partially completed a form
    When the user taps "Save Draft"
    Then all entered values are persisted to Dataverse, a success
      toast is shown, and the draft can be resumed on either mobile
      or web with all values pre-populated.

MUS-05
  As a bank customer (mobile user), I want to upload a photo of my
  ID document directly from my phone camera as part of my application
  so that I do not need to scan and upload from a computer.
  Priority: Must Have
  Acceptance Criteria:
    Given a file upload field configured for JPEG and PDF
    When a mobile user taps the upload field and selects "Take Photo"
    Then the device camera opens, the user takes a photo, and the
      image is uploaded to the backend API with a progress indicator
      shown. On success, the uploaded file name is displayed below the
      field.

MUS-06
  As a bank customer (mobile user), I want the form to validate my
  inputs and show me clear error messages so that I know what to
  correct before submitting.
  Priority: Must Have
  Acceptance Criteria:
    Given a field with a required validation rule
    When a mobile user leaves the field empty and moves to the next
      field
    Then the configured error message appears below the field and the
      phone vibrates (haptic feedback) to draw attention to the error.

MUS-07
  As a bank customer (mobile user), I want to submit my completed
  loan application from my phone and receive a reference number so
  that I know my submission was received.
  Priority: Must Have
  Acceptance Criteria:
    Given a mobile user has completed all required fields across all
      tabs and all validation passes
    When the user taps "Submit"
    Then the submission is sent to the backend API, parent and child
      CRM records are created in Dataverse, and the app navigates to
      a confirmation screen showing the CRM reference number.

MUS-08
  As a CRM Configuration Team member, I want to configure a form
  once in Dataverse and have it render correctly on both the web
  portal and the mobile app without any additional steps so that
  mobile form coverage adds zero configuration overhead.
  Priority: Must Have
  Acceptance Criteria:
    Given a form definition is active in Dataverse and accessible
      on the web portal
    When a mobile user navigates to that form
    Then the form renders on mobile using the same metadata, with
      all 15 supported field types rendered natively, without any
      additional Dataverse configuration required.

MUS-09
  As a Compliance / Audit team member, I want mobile form submissions
  to appear in the same audit log as web submissions so that the
  channel does not create a gap in the regulatory audit trail.
  Priority: Must Have
  Acceptance Criteria:
    Given a mobile user submits a form
    When an Audit team member views the audit log viewer
    Then a complete audit entry exists with event type SUBMIT_SUCCESS,
      the user's Azure AD identity, timestamp (UTC), form definition,
      created CRM record ID, and channel = "mobile."

MUS-10
  As a mobile user using VoiceOver or TalkBack, I want all form fields
  and controls to be announced correctly by the screen reader so that
  I can complete the form without sight.
  Priority: Must Have
  Acceptance Criteria:
    Given VoiceOver (iOS) or TalkBack (Android) is enabled
    When the user navigates through the form
    Then every field label, input, error message, and action button is
      announced correctly with an appropriate role (button, text field,
      checkbox, etc.) and any validation errors are also announced.


13. IMPACT ANALYSIS — EXISTING WEB SPRINT 1 BLOCKERS
─────────────────────────────────────────────────────────────────────

This section assesses the impact of the mobile extension on each of the
10 web Sprint 1 blockers. Mobile development can proceed in parallel
with web Sprint 1 remediation on most items.

BLOCKER-1 | Data Residency (West Europe → Qatar North)
  Mobile impact: DIRECT.
  The mobile app writes submissions to the same Dataverse org as the
  web portal. If the data residency violation is not resolved before
  mobile UAT, mobile submission data will also land in West Europe.
  Mobile UAT must wait for GATE-B (Qatar North Dataverse org URL
  confirmed in writing by QDB IT). Mobile development can proceed in
  parallel on a mock backend or a dev Dataverse org. No mobile-specific
  remediation is required beyond the web resolution.

BLOCKER-2 | Virus Scan Non-Functional
  Mobile impact: HIGH.
  Mobile file uploads (camera capture, gallery, document picker) go
  through the same /api/files/upload endpoint. If the endpoint has
  no MIME detection or virus scan, mobile camera-captured photos reach
  CRM Notes unscanned. The mobile extension increases the attack
  surface because camera captures bypass desktop antivirus entirely.
  The file upload remediation (S1-06 on web: multer, file-type magic
  bytes, CrmFileService.uploadToCrmNotes) must be complete before
  mobile file upload is tested.

BLOCKER-3 | CORS Wildcard Default
  Mobile impact: NONE.
  React Native mobile apps do not use CORS (CORS is a browser
  restriction). The mobile app's HTTP requests are not subject to CORS
  headers. No mobile-specific CORS changes are needed. The web CORS
  fix must still be applied for the web portal.

BLOCKER-4 | Form-Level RBAC Not Wired
  Mobile impact: DIRECT.
  The roleMiddleware enforcement gap applies equally to mobile. An
  authenticated mobile user can access any form regardless of
  qdb_access_group_id. The web roleMiddleware fix (S1-02) will close
  the gap for mobile as well once implemented — the mobile app sends
  the same Bearer token on the same /api/forms/:formCode/metadata
  endpoint. No mobile-specific RBAC work is required.

BLOCKER-5 | Stored XSS Vectors (inputSanitiser, DOMPurify)
  Mobile impact: PARTIAL.
  inputSanitiser.ts on the backend sanitises all incoming POST/PATCH
  payloads — this applies to mobile submissions equally. The DOMPurify
  fix in RichTextControl.tsx is web-only (the mobile app does not
  render richtext via dangerouslySetInnerHTML). No mobile-specific
  XSS remediation is required beyond implementing inputSanitiser.ts
  on the backend (which the web team must do for S1-03).

BLOCKER-6 | OData Injection
  Mobile impact: INDIRECT.
  OData injection vulnerabilities are in the backend API, not the
  frontend. The mobile app sends the same formCode values as the web
  portal. Once the web team applies S1-04 (formCode validation regex,
  removal of caller-controlled filter parameter), those fixes apply to
  mobile traffic as well. No mobile-specific work required.

BLOCKER-7 | IDOR on Record Fetch
  Mobile impact: INDIRECT.
  The ownership check on GET /api/forms/:formCode/data/:recordId must
  be in place before any form data is loaded on mobile. Once S1-05 is
  applied on the backend, it protects both web and mobile.

BLOCKER-8 | ADR-007 Tenant Assumption Unconfirmed
  Mobile impact: CRITICAL AND DIRECT.
  The mobile app's entire authentication layer is built on the same
  single-tenant Azure AD assumption. If QDB portal users are external
  bank customers (not corporate AD members), the mobile MSAL
  configuration must target Entra External ID, with different authority
  URLs, different token claim mappings, and different secure storage
  strategy for MSAL external-identity tokens.
  GATE-A (written confirmation from QDB project sponsor of A-010) is
  a prerequisite for mobile auth implementation and mobile UAT, exactly
  as it is for web.
  Mobile development on non-auth components (form rendering, rule
  engine, field components, draft/submission) can proceed in parallel
  using a mock authentication provider. The auth layer is the last
  component wired before UAT.

BLOCKER-9 | File Upload Non-Functional
  Mobile impact: DIRECT.
  Mobile file upload is entirely dependent on the web fix (S1-06:
  multer registered, CrmFileService.uploadToCrmNotes implemented).
  Mobile development of the file upload UI component can proceed
  in parallel, but mobile file upload E2E tests cannot pass until
  S1-06 is complete on the backend.

BLOCKER-10 | Business Rules Never Fetched
  Mobile impact: DIRECT.
  The RuleEngine on mobile (imported from shared/) consumes the
  businessRules[] array from the FormDefinition API response. If
  businessRules: [] is hardcoded on the backend (the current state),
  the rule engine on mobile also produces no output and all conditional
  logic is broken. Mobile rule engine testing is blocked until S1-07
  is complete (fetchBusinessRules implemented in CrmMetadataService).

Summary:
  - Mobile development CAN proceed in parallel on: form rendering
    components, navigation, field controls, rule engine integration
    (against mock metadata with business rules), validation engine,
    draft UI, submission UI, file upload UI.
  - Mobile UAT CANNOT begin until: GATE-A (BLOCKER-8), GATE-B
    (BLOCKER-1), S1-06 (BLOCKER-9), S1-07 (BLOCKER-10), and the
    roleMiddleware fix (BLOCKER-4) are all resolved.
  - NEW RISK introduced by mobile: the file upload attack surface is
    expanded by camera capture (no prior MIME filtering on device),
    increasing the urgency of BLOCKER-2 (virus scan strategy).


14. INTEGRATION DEPENDENCIES
─────────────────────────────────────────────────────────────────────

| System                       | Integration Type              | Data Exchanged                                         | Direction              | New/Existing |
|------------------------------|-------------------------------|--------------------------------------------------------|------------------------|--------------|
| Dynamic Form Engine Backend  | REST API (HTTPS)              | Form metadata, drafts, submissions, file uploads       | Mobile → Backend       | Existing     |
| Azure AD / Entra ID          | OAuth 2.0 PKCE (MSAL native)  | Authentication tokens, user identity claims             | Mobile → Azure AD      | New (mobile) |
| Microsoft Dataverse          | Via backend API only          | Form submissions, drafts, audit log entries             | Backend → Dataverse    | Existing     |
| Expo Application Services    | EAS Build API                 | Build artefacts (IPA, AAB)                              | CI/CD → EAS            | New          |
| Apple App Store Connect      | EAS Submit                    | App binary submission for TestFlight / App Store        | EAS → Apple            | New          |
| Google Play Console          | EAS Submit                    | App binary submission for internal testing / Play Store | EAS → Google           | New          |
| expo-image-picker             | Local device API              | Camera frames, gallery images                           | Device → Mobile app    | New          |
| expo-document-picker          | Local device API              | Document files (PDF, DOCX, etc.)                        | Device → Mobile app    | New          |

New backend endpoint required:
  GET /api/forms
  Returns a list of active FormDefinition records accessible to the
  authenticated user. Used by the mobile Form List screen (MFR-043).
  This endpoint is a minor addition to the existing backend; it does
  not change any existing API contract.


15. ASSUMPTIONS
─────────────────────────────────────────────────────────────────────
MA-001: QDB's Azure AD / Entra ID tenant is the same tenant used by
        the web portal. The mobile app registration will be a separate
        app registration in the same tenant, with the same backend API
        scope. (Same assumption as web A-002, extended to mobile.)

MA-002: QDB IT will provide the mobile app redirect URI scheme
        (msauth://com.qdb.formengine/callback) to be registered in the
        Azure AD mobile app registration before mobile auth development.

MA-003: QDB Mobile Team will manage app store listings, app icons,
        splash screens, and marketing descriptions in App Store Connect
        and Google Play Console. Maqsad AI provides the build artefact
        and technical submission configuration only.

MA-004: QDB Mobile Team will manage any MDM / Intune enrolment policy
        for corporate devices. The app will not enforce MDM enrolment
        in Phase 1.

MA-005: The device permission model (camera, photo library, notifications)
        follows App Store and Google Play guidelines. QDB Legal has
        reviewed the privacy disclosure requirements for camera and
        gallery access. Maqsad AI will implement the correct permission
        request flow and usage description strings.

MA-006: json-rules-engine v6.x is Hermes-engine compatible. This must
        be verified by the architect in Phase 5 (architecture). If any
        JSI or DOM dependency is found, the RuleEngine class must be
        wrapped or an alternative evaluated.

MA-007: The Expo managed workflow is sufficient for Phase 1. No bare
        React Native workflow (ejection) is required. If a native module
        not available in the Expo SDK is needed in Phase 2, an ADR will
        be filed before ejection.

MA-008: The existing backend API (Express + TypeScript) will have the
        10 Sprint 1 blockers resolved before mobile UAT begins. The
        mobile app does not introduce any backend changes other than
        the minor addition of GET /api/forms and the channel header
        X-Client-Platform on audit log entries.

MA-009: QDB Security will make a written decision on jailbreak/root
        detection behaviour (warning vs. app termination) before
        MNFR-008 is implemented in the production hardening phase.


16. CONSTRAINTS
─────────────────────────────────────────────────────────────────────
MC-001: The mobile app must use React Native + TypeScript + Expo
        (managed workflow) as the mobile framework. This is the Maqsad
        AI technology default (constitution Article II). Deviation
        requires a CEO-approved ADR.

MC-002: The mobile app must reuse the existing Node.js + Express
        backend API. No new backend framework, microservice, or
        separate mobile-specific API layer may be introduced without
        an ADR.

MC-003: All CRM data access must continue to go through the Dataverse
        Web API via the existing backend. The mobile app never calls
        Dataverse directly.

MC-004: The mobile app must authenticate using Azure AD / Entra ID via
        @azure/msal-react-native. No alternative identity provider or
        username/password flow is permitted.

MC-005: No sensitive data (tokens, PII, draft field values) may be
        stored in AsyncStorage or MMKV in Phase 1. Expo SecureStore
        is the only permitted mechanism for sensitive data persistence.

MC-006: The mobile app must operate within QDB's existing Azure tenant
        and is subject to the same data residency requirements as the
        web portal (C-005 from parent BRD). All backend data remains
        in the Qatar Azure region.

MC-007: The mobile app must target iOS 16+ and Android 13+. No
        backward compatibility to earlier OS versions is required or
        in scope.

MC-008: The mobile app is a customer-facing (external) application.
        It must comply with Apple App Store Review Guidelines and
        Google Play Developer Policy, including privacy policy and
        permissions disclosure requirements.


17. RISKS AND OPEN QUESTIONS
─────────────────────────────────────────────────────────────────────

| ID    | Risk / Question                                                                             | Impact   | Likelihood | Owner              | Resolution Needed By     |
|-------|---------------------------------------------------------------------------------------------|----------|------------|--------------------|--------------------------|
| MR-01 | QDB portal users are external (non-corporate AD) — ADR-007 applies equally to mobile       | Critical | High       | QDB Project Sponsor| Before Sprint 1 auth dev |
| MR-02 | json-rules-engine v6.x compatibility with React Native Hermes engine not yet verified       | High     | Medium     | Architect          | Phase 5 (architecture)   |
| MR-03 | File upload from camera produces uncompressed high-res images — may exceed 25MB BR-011 limit| High     | Medium     | Mobile Dev         | Phase 6 (build)          |
| MR-04 | Android DatePicker two-step flow (date then time) creates a poor UX for datetime fields     | Medium   | Medium     | Mobile UX          | Phase 5 (architecture)   |
| MR-05 | App Store Review may reject the app if Azure AD system browser flow triggers security review| Medium   | Low        | QDB Mobile Team    | Before EAS Submit        |
| MR-06 | expo-image-picker media library permission on iOS 14+ requires new photo access model       | Medium   | High       | Mobile Dev         | Phase 6 (build)          |
| MR-07 | MSAL React Native library version compatibility with current Expo SDK version not confirmed  | High     | Medium     | Architect          | Phase 5 (architecture)   |
| MR-08 | Rule engine re-evaluation on every keystroke may cause UI jank on low-end Android devices   | Medium   | Medium     | Mobile Dev         | Phase 5 (architecture)   |
| MR-09 | richtext read-only rendering on mobile may confuse users who expect to edit the field       | Low      | High       | Mobile UX          | Phase 6 (build)          |
| MR-10 | grid field "complete on web" notice may block form submission if grid is required in metadata| High    | Medium     | BA + Arch          | Phase 5 (architecture)   |
| MR-11 | EAS Build requires Apple Developer Program membership and Google Play Console account        | Medium   | Low        | QDB Mobile Team    | Before Phase 6 (build)   |
| MR-12 | Mobile app download size exceeds 30MB MNFR-013 if all Expo SDK modules are included         | Low      | Medium     | Mobile Dev         | Phase 6 (build)          |
| MR-13 | Web backend GET /api/forms (form list) endpoint does not exist — new backend work required   | Medium   | Confirmed  | Backend Dev        | Before mobile list screen |
| MR-14 | X-Client-Platform header not yet part of backend audit logic — channel field must be added  | Medium   | Confirmed  | Backend Dev        | Before mobile audit tests |


18. DATA REQUIREMENTS (Mobile-Specific)
─────────────────────────────────────────────────────────────────────

No new Dataverse tables are introduced by the mobile extension.
The mobile app reads and writes through the existing 12 configuration
tables and existing submission/draft/audit tables.

Two additive changes to existing tables are required:

  1. qdb_form_audit_log: add a new text column qdb_channel (nullable,
     default "web") to record whether the event originated from the
     web portal or mobile app. This is an additive schema change with
     no impact on existing records.

  2. GET /api/forms endpoint: a new backend API route that queries
     qdb_form_definition records with qdb_is_active = true, filtered
     by the authenticated user's AD group membership. Returns a summary
     list (formId, formCode, displayName) — not the full FormDefinition.

| Entity                   | Change Type     | Detail                                              |
|--------------------------|-----------------|-----------------------------------------------------|
| qdb_form_audit_log       | Additive column | qdb_channel: text, nullable, default "web"          |
| Backend: GET /api/forms  | New endpoint    | Returns list of active, accessible form definitions |


19. REQUIREMENTS TRACEABILITY MATRIX
─────────────────────────────────────────────────────────────────────

| User Story | Mobile Functional Requirements                         | Business Objective | Status  |
|------------|--------------------------------------------------------|--------------------|---------|
| MUS-01     | MFR-001, MFR-002, MFR-003, MFR-004, MFR-005           | MBO-001, MBO-002   | Defined |
| MUS-02     | MFR-009, MFR-010, MFR-011, MFR-012, MFR-013, MFR-016, MFR-017, MFR-018, MFR-019 | MBO-001, MBO-003 | Defined |
| MUS-03     | MFR-022, MFR-023, MFR-024, MFR-025                    | MBO-002, MBO-003   | Defined |
| MUS-04     | MFR-031, MFR-032, MFR-033, MFR-034                    | MBO-001            | Defined |
| MUS-05     | MFR-035, MFR-036, MFR-037, MFR-038, MFR-039           | MBO-004            | Defined |
| MUS-06     | MFR-026, MFR-027, MFR-028, MFR-029, MFR-030, MFR-020  | MBO-003            | Defined |
| MUS-07     | MFR-040, MFR-041, MFR-042                             | MBO-001, MBO-002   | Defined |
| MUS-08     | MFR-006, MFR-007, MFR-008, MFR-009                    | MBO-002            | Defined |
| MUS-09     | MFR-045, MFR-046                                      | MBO-006            | Defined |
| MUS-10     | MFR-021, MNFR-011                                     | MBO-003            | Defined |


20. GLOSSARY ADDITIONS
─────────────────────────────────────────────────────────────────────
(Extends glossary in parent BRD, projects/dynamic-form-engine/brd.md)

Expo              Open-source platform built on React Native. Provides
                  managed workflow (no native code required), EAS Build
                  (cloud builds), and EAS Submit (app store submission).

EAS               Expo Application Services. Cloud build and submission
                  service for React Native + Expo apps.

Hermes            Meta's optimised JavaScript engine for React Native.
                  Used by default in Expo SDK 48+. Has no DOM API.

MSAL React Native Microsoft Authentication Library for React Native.
                  Wraps native iOS (MSAL.framework) and Android
                  (MSAL Android) SDKs. Uses system browser for PKCE.

Expo SecureStore  Expo module for encrypted local storage. Maps to iOS
                  Keychain and Android Keystore. Hardware-backed on
                  devices with Secure Enclave / StrongBox.

Custom URI Scheme iOS and Android app linking mechanism. The mobile
                  app registers msauth://com.qdb.formengine/ as the
                  redirect target for the Azure AD PKCE callback.

Detox             React Native E2E testing framework by Wix. Runs on
                  iOS Simulator and Android Emulator. 11,000+ stars.

RNTL              React Native Testing Library. Component-level testing
                  utility for React Native. Used for unit and component
                  tests (non-E2E).

ActionSheet       iOS native component that presents a set of choices
                  in a bottom sheet anchored to the screen. Used for
                  dropdown field type on iOS.

ASWebAuthenticationSession
                  iOS system API used by MSAL React Native to present
                  the Azure AD login page in a secure system browser
                  context (not WKWebView or Safari).

Custom Tabs       Android system component used by MSAL React Native
                  to present the Azure AD login page in a secure
                  browser context within the app flow.

VoiceOver         Apple iOS accessibility screen reader.

TalkBack          Google Android accessibility screen reader.

Haptic Feedback   Physical vibration feedback from the device actuator,
                  triggered by expo-haptics in response to validation
                  errors or submission results.

Channel           Attribute on audit log entries identifying whether a
                  submission originated from the web portal or the
                  mobile app (values: "web", "mobile").


21. APPROVAL
─────────────────────────────────────────────────────────────────────
| Role              | Name              | Decision              | Date       |
|-------------------|-------------------|-----------------------|------------|
| CEO               | Maqsad AI — CEO   | PENDING               |            |
| Requestor (QDB)   | Pending           | PENDING               |            |
| BA                | Maqsad AI — BA    | SUBMITTED             | 2026-05-20 |

═══════════════════════════════════════════════════════════════════
END OF DOCUMENT
═══════════════════════════════════════════════════════════════════
