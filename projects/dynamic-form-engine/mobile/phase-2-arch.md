═══════════════════════════════════════════════════════════════════
PHASE 2 — ARCHITECTURE DESIGN
Dynamic Form Engine — Mobile Rendering Extension (QDB)
═══════════════════════════════════════════════════════════════════
Prepared by:    Maqsad AI — Solution Architect
Date:           2026-05-20
Version:        1.0
Status:         Complete
Parent BRD:     projects/dynamic-form-engine/mobile/brd.md
Parent Arch:    projects/dynamic-form-engine/phase-3-arch.md
GitHub:         projects/dynamic-form-engine/mobile/github-research.md
CEO Conditions: projects/dynamic-form-engine/mobile/brd-approval.md
                (4 conditions — all resolved in this document)
═══════════════════════════════════════════════════════════════════


## CEO CONDITIONS — RESOLUTION
─────────────────────────────────────────────────────────────────────

CONDITION M-1 — GATE SEQUENCING
  Resolved in Section 16 (Mobile Go-Live Gate Checklist). The mobile
  gate checklist is fully independent of the web Sprint 1 remediation
  checklist. Mobile UAT can proceed as soon as the mobile-specific
  gates are cleared, regardless of web Sprint 1 item status.

CONDITION M-2 — json-rules-engine HERMES COMPATIBILITY
  Resolved in Section 7 (Rule Engine Architecture). GitHub research
  confirmed zero DOM dependencies. Section 7 defines a Hermes-specific
  Jest test configuration as a regression guard. ADOPT confirmed.

CONDITION M-3 — GET /api/forms ENDPOINT
  Resolved in Section 11 (API Contracts). The endpoint is fully
  specified: response shape, group membership resolution strategy,
  LRU cache design, and the performance target are all defined.

CONDITION M-4 — REQUIRED GRID FIELDS ON MOBILE
  Resolved in Section 9 (Field Type Architecture). Decision: Option B
  (form list shows "Desktop required" indicator for forms with required
  grid fields). Forms are not excluded from the list — they are shown
  with a capability indicator. The form list endpoint filters and
  annotates based on field type analysis of the metadata.


## 1. SYSTEM OVERVIEW
─────────────────────────────────────────────────────────────────────

The Dynamic Form Engine Mobile extension is a React Native + Expo
application (managed workflow) that renders any form defined in QDB's
12 Dataverse configuration tables natively on iOS 16+ and Android 13+.
It consumes the same Express backend API as the existing web portal
and shares the RuleEngine, ValidationEngine, and TypeScript types
through an extracted shared/ package. The mobile app is online-only
in Phase 1: no data is persisted locally beyond in-memory React state.

The architecture follows Option C from the BRD: a mobile-only Expo
application with shared engines extracted from the web codebase into
the existing shared/ package. This is additive — the web portal is
unchanged except that its imports of RuleEngine and ValidationEngine
shift from local paths to the shared/ package.

Three layers of the existing system are reused without modification:
  1. All 12 Dataverse configuration tables and their schemas
  2. All existing backend API endpoints (Express + TypeScript)
  3. json-rules-engine v6.x and Zod — moved to shared/

One minor backend addition:
  4. GET /api/forms — new endpoint for the mobile form list screen


## 2. HIGH-LEVEL ARCHITECTURE DIAGRAM
─────────────────────────────────────────────────────────────────────

```
┌─────────────────────────────────────────────────────────────────┐
│  Mobile Device (iOS 16+ / Android 13+)                          │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  QDB Forms App (Expo Managed Workflow — React Native)    │    │
│  │                                                           │    │
│  │  ┌──────────┐  ┌─────────────────┐  ┌────────────────┐  │    │
│  │  │ MSAL RN  │  │  Expo Router    │  │ Expo SecureStore│  │    │
│  │  │ Auth     │  │  (File-based)   │  │ (Token cache)  │  │    │
│  │  └────┬─────┘  └────────┬────────┘  └────────────────┘  │    │
│  │       │                 │                                  │    │
│  │  ┌────▼─────────────────▼──────────────────────────────┐ │    │
│  │  │  MobileDynamicFormRenderer                           │ │    │
│  │  │  ┌──────────────┐  ┌──────────────┐                 │ │    │
│  │  │  │ RuleEngine   │  │Validation    │  (from shared/) │ │    │
│  │  │  │ (shared/)    │  │Engine(shared/)│                 │ │    │
│  │  │  └──────────────┘  └──────────────┘                 │ │    │
│  │  │  ┌────────────────────────────────────────────────┐  │ │    │
│  │  │  │ react-hook-form (Controller per field)         │  │ │    │
│  │  │  └────────────────────────────────────────────────┘  │ │    │
│  │  │  15 Native Field Components (NativeField*)           │ │    │
│  │  └─────────────────────────────────────────────────────┘ │    │
│  │                                                           │    │
│  │  Services Layer (fetch + Bearer token)                   │    │
│  └──────────────────────────┬────────────────────────────── ┘    │
│                             │ TLS 1.2+                            │
└─────────────────────────────┼───────────────────────────────────┘
                              │
          ┌───────────────────▼──────────────────────┐
          │  Existing Express Backend API             │
          │  (no new framework — minor additions)    │
          │  + GET /api/forms (new)                  │
          │  + X-Client-Platform header handling     │
          └──────────────────┬───────────────────────┘
                             │
          ┌──────────────────▼────────────────────┐
          │  Azure Platform                        │
          │  Azure AD (MSAL PKCE)                 │
          │  Dataverse (Qatar North)              │
          │  SharePoint, Key Vault               │
          └───────────────────────────────────────┘
```


## 3. MONOREPO STRUCTURE
─────────────────────────────────────────────────────────────────────

```
dynamic-form-engine/           (project root — existing)
├── shared/                    (MODIFIED — engines and types extracted)
│   ├── package.json           name: @qdb/form-engine-shared
│   └── src/
│       ├── types/
│       │   ├── form.ts        FormDefinition, FieldDefinition, etc.
│       │   ├── api.ts         ApiResponse<T>, ApiError, ResponseMeta
│       │   └── index.ts       re-exports all types
│       ├── engines/
│       │   ├── RuleEngine.ts      json-rules-engine wrapper (moved from web)
│       │   └── ValidationEngine.ts Zod schema builder (moved from web)
│       └── index.ts           main barrel export
│
├── backend/                   (EXISTING — minor additions only)
│   └── src/
│       ├── controllers/
│       │   └── FormListController.ts   NEW — GET /api/forms
│       ├── services/
│       │   └── CrmFormListService.ts   NEW — list accessible forms
│       └── middleware/
│           └── requestLogger.ts        MODIFIED — log X-Client-Platform
│
├── web/                       (EXISTING — import paths updated only)
│   └── src/
│       ├── engines/           REMOVED — now imported from shared/
│       └── types/             REMOVED — now imported from shared/
│
└── mobile/                    (NEW — Expo managed workflow app)
    ├── app.json               Expo config (scheme, permissions, plugins)
    ├── eas.json               EAS Build profiles (dev, preview, prod)
    ├── package.json
    ├── tsconfig.json          extends shared tsconfig; strict: true
    ├── app/                   Expo Router file-based routes
    │   ├── _layout.tsx        Root layout — MSAL provider, navigation
    │   ├── index.tsx          Redirect to /forms (auth guard)
    │   ├── (auth)/
    │   │   └── login.tsx      MSAL sign-in screen
    │   └── (app)/
    │       ├── _layout.tsx    Authenticated layout (bottom tab shell)
    │       ├── forms/
    │       │   ├── index.tsx  Form list screen (MFR-043, MFR-044)
    │       │   └── [formCode]/
    │       │       ├── index.tsx          Form screen (loads metadata)
    │       │       └── confirmation.tsx   Post-submit confirmation
    │       └── profile/
    │           └── index.tsx  User profile + sign-out
    ├── src/
    │   ├── components/
    │   │   ├── form/
    │   │   │   ├── MobileDynamicFormRenderer.tsx
    │   │   │   ├── MobileFormTabBar.tsx
    │   │   │   ├── MobileSectionRenderer.tsx
    │   │   │   └── MobileFieldRenderer.tsx
    │   │   ├── fields/
    │   │   │   ├── NativeTextField.tsx
    │   │   │   ├── NativeTextareaField.tsx
    │   │   │   ├── NativeNumberField.tsx
    │   │   │   ├── NativeCurrencyField.tsx
    │   │   │   ├── NativeDecimalField.tsx
    │   │   │   ├── NativeDateField.tsx
    │   │   │   ├── NativeDateTimeField.tsx
    │   │   │   ├── NativeDropdownField.tsx
    │   │   │   ├── NativeMultiSelectField.tsx
    │   │   │   ├── NativeLookupField.tsx
    │   │   │   ├── NativeCheckboxField.tsx
    │   │   │   ├── NativeRadioGroupField.tsx
    │   │   │   ├── NativeEmailField.tsx
    │   │   │   ├── NativePhoneField.tsx
    │   │   │   ├── NativeFileUploadField.tsx
    │   │   │   ├── RichTextReadOnlyField.tsx    (Phase 1 read-only)
    │   │   │   └── GridUnavailableField.tsx     (Phase 1 notice card)
    │   │   ├── ui/
    │   │   │   ├── ValidationMessage.tsx
    │   │   │   ├── FormErrorBanner.tsx
    │   │   │   ├── LoadingScreen.tsx
    │   │   │   └── ErrorScreen.tsx
    │   │   └── layout/
    │   │       └── SafeAreaShell.tsx
    │   ├── hooks/
    │   │   ├── useFormMetadata.ts
    │   │   ├── useRuleEngine.ts        (same pattern as web)
    │   │   ├── useValidationEngine.ts
    │   │   ├── useDraft.ts
    │   │   └── useAuthToken.ts
    │   ├── services/
    │   │   ├── formMetadataService.ts
    │   │   ├── formListService.ts      (GET /api/forms)
    │   │   ├── draftService.ts
    │   │   ├── submissionService.ts
    │   │   ├── lookupService.ts
    │   │   └── fileService.ts
    │   ├── auth/
    │   │   ├── msalConfig.ts
    │   │   ├── MsalProvider.tsx
    │   │   └── useAuthToken.ts         (Expo SecureStore token access)
    │   └── config/
    │       └── appConfig.ts            (Zod-validated env — Expo constants)
    └── __tests__/                      Jest + RNTL unit tests
        └── e2e/                        Detox E2E tests
```


## 4. SHARED PACKAGE EXTRACTION PLAN
─────────────────────────────────────────────────────────────────────

### 4.1 Files to Move from Web to Shared

The following files are moved (not copied) from web/src/ to shared/src/:

  web/src/engines/RuleEngine.ts      → shared/src/engines/RuleEngine.ts
  web/src/engines/ValidationEngine.ts → shared/src/engines/ValidationEngine.ts
  web/src/types/ (all)               → shared/src/types/ (all)

The web package.json adds @qdb/form-engine-shared as a workspace
dependency. The web import paths update from relative imports to:
  import { RuleEngine } from '@qdb/form-engine-shared';
  import { FormDefinition } from '@qdb/form-engine-shared';

This is a non-breaking refactor. No web rendering component changes.
No web behaviour changes. This work item is tracked as a web Sprint 1
parallel task (can be done in the same sprint as web remediation).

### 4.2 Shared Package Build

The shared/ package uses tsup (zero-config TypeScript bundler) to
produce:
  - dist/index.cjs     (CommonJS — Node.js + Jest)
  - dist/index.esm.js  (ESM — Vite web build)
  - dist/index.d.ts    (TypeScript declarations)

Metro (React Native bundler) resolves the package via the workspace
symlink and consumes the TypeScript source directly (configured via
metro.config.js sourceExts). No separate RN build step required.

### 4.3 Hermes Compatibility Test (CEO Condition M-2 Resolution)

A dedicated Jest test suite runs in the shared/ package CI step with
the Hermes Jest preset:

```typescript
// shared/src/engines/__tests__/RuleEngine.hermes.test.ts
// Verifies json-rules-engine runs identically in Hermes-simulated
// environment (Jest configured with @swc/jest + Hermes-compatible
// transforms, no browser globals injected)
describe('RuleEngine — Hermes compatibility', () => {
  it('should evaluate SHOW_FIELD rule without DOM globals', async () => {
    // Arrange: rule that shows fieldB when fieldA === 'yes'
    // Act: evaluate with facts { fieldA: 'yes' }
    // Assert: result.visibilityMap.get('fieldB') === true
  });
  it('should evaluate compound AND/OR conditions', async () => { ... });
  it('should handle CALCULATE_VALUE with arithmetic expression', async () => { ... });
});
```

This test runs in CI on every commit to shared/. A failing test
blocks the pipeline before any code reaches the mobile build.


## 5. AUTHENTICATION ARCHITECTURE — MOBILE
─────────────────────────────────────────────────────────────────────

### 5.1 Library and Registration

Library: @azure/msal-react-native (Microsoft official)
Auth flow: OAuth 2.0 PKCE via system browser
  - iOS: ASWebAuthenticationSession (no WKWebView)
  - Android: Custom Tabs (Chrome-based)
App registration: NEW registration in QDB Azure AD tenant
  - Type: Mobile and desktop applications
  - Redirect URI: msauth://com.qdb.formengine/callback
  - Scope: api://{backendAppId}/access_as_user (same as web)
Backend: authMiddleware validates tokens from both registrations
  (same tenant, same audience — no backend changes needed)

### 5.2 PKCE Flow on Mobile

```
1. User opens app → auth guard checks MSAL token cache in SecureStore
2. No valid token → navigate to /login screen
3. User taps "Sign In with QDB Account"
4. msalInstance.acquireToken() opens system browser with PKCE params
5. Azure AD renders login page in system browser
6. User authenticates (password + MFA if tenant policy requires)
7. Azure AD redirects to msauth://com.qdb.formengine/callback?code=...
8. OS routes deep link back to app
9. MSAL exchanges code + code_verifier → id_token + access_token
10. MSAL stores tokens in Expo SecureStore (iOS Keychain / Android Keystore)
11. App navigates to /forms (form list screen)
12. All API calls: acquireTokenSilent() → Authorization: Bearer {token}
13. Token expiry: MSAL auto-refreshes silently; triggers re-auth only
    if refresh token has expired (default Azure AD refresh token TTL:
    90 days rolling window)
```

### 5.3 Token Storage Design

```typescript
// src/auth/tokenStorage.ts
// Implements the MSAL ICachePlugin interface using Expo SecureStore
// Maps to MSAL's token cache serialisation/deserialisation

import * as SecureStore from 'expo-secure-store';

const TOKEN_CACHE_KEY = 'msal_token_cache';

export const msalCachePlugin = {
  async beforeCacheAccess(cacheContext: TokenCacheContext): Promise<void> {
    const serialisedCache = await SecureStore.getItemAsync(TOKEN_CACHE_KEY);
    if (serialisedCache) {
      cacheContext.tokenCache.deserialize(serialisedCache);
    }
  },

  async afterCacheAccess(cacheContext: TokenCacheContext): Promise<void> {
    if (cacheContext.cacheHasChanged) {
      await SecureStore.setItemAsync(
        TOKEN_CACHE_KEY,
        cacheContext.tokenCache.serialize()
      );
    }
  },
};
```

No token data is stored in AsyncStorage. SecureStore is the only
permitted persistent token store (MFR-003, MNFR-007).

### 5.4 msalConfig.ts

```typescript
// src/auth/msalConfig.ts
import { PublicClientApplication, Configuration } from '@azure/msal-react-native';
import { msalCachePlugin } from './tokenStorage';

const msalConfiguration: Configuration = {
  auth: {
    clientId: process.env.EXPO_PUBLIC_MSAL_CLIENT_ID!,
    authority: `https://login.microsoftonline.com/${process.env.EXPO_PUBLIC_AZURE_AD_TENANT_ID}`,
    redirectUri: 'msauth://com.qdb.formengine/callback',
  },
  cache: {
    cachePlugin: msalCachePlugin,
  },
};

export const msalInstance = new PublicClientApplication(msalConfiguration);
```

Environment variables are injected via Expo Constants (EAS Build
environment variables → app.config.ts extra → Constants.expoConfig.extra).
They are validated at startup by appConfig.ts using Zod.


## 6. FORM RENDERING ARCHITECTURE
─────────────────────────────────────────────────────────────────────

### 6.1 MobileDynamicFormRenderer

The root rendering component. Owns the react-hook-form context, the
rule engine evaluation subscription, and the validation engine
resolver. It does not render any UI directly — it delegates to
MobileFormTabBar, MobileSectionRenderer, and MobileFieldRenderer.

```typescript
// src/components/form/MobileDynamicFormRenderer.tsx
interface MobileDynamicFormRendererProps {
  formDefinition: FormDefinition;
  initialValues?: Record<string, unknown>;
  draftId?: string;
  onSubmitSuccess: (referenceNumber: string) => void;
}
```

Rendering flow:
```
MobileDynamicFormRenderer
  useForm() — react-hook-form, resolver from ValidationEngine
  useRuleEngine() — subscribes to watch(), returns visibility/required maps
  │
  ├── MobileFormTabBar
  │     React Navigation BottomTabNavigator
  │     Each tab = one TabDefinition from metadata
  │     Tab visible = visibilityMap[tabId] !== false
  │
  └── (per tab) MobileSectionRenderer
        ScrollView with KeyboardAvoidingView
        Each section = one SectionDefinition from metadata
        Collapsible: Animated.View + useState(isExpanded)
        │
        └── (per field) MobileFieldRenderer
              Switch on field.fieldType → NativeXxxField component
              Reads visibilityMap, requiredOverrideMap
              Hidden fields: not rendered, RHF value cleared via resetField
```

### 6.2 MobileFieldRenderer

Dispatches to the correct native field component based on
`field.fieldType`. Uses react-hook-form's `Controller` component
so that each native field is properly connected to the form state.

```typescript
// src/components/form/MobileFieldRenderer.tsx
export function MobileFieldRenderer({
  field,
  isVisible,
  isRequired,
  isReadonly,
}: MobileFieldRendererProps): JSX.Element | null {
  if (!isVisible) return null;

  const componentMap: Record<FieldType, React.ComponentType<NativeFieldProps>> = {
    text: NativeTextField,
    textarea: NativeTextareaField,
    number: NativeNumberField,
    currency: NativeCurrencyField,
    decimal: NativeDecimalField,
    date: NativeDateField,
    datetime: NativeDateTimeField,
    dropdown: NativeDropdownField,
    multiselect: NativeMultiSelectField,
    lookup: NativeLookupField,
    checkbox: NativeCheckboxField,
    radio: NativeRadioGroupField,
    email: NativeEmailField,
    phone: NativePhoneField,
    file: NativeFileUploadField,
    richtext: RichTextReadOnlyField,
    grid: GridUnavailableField,
  };

  const FieldComponent = componentMap[field.fieldType];
  return (
    <Controller
      name={field.fieldKey}
      render={({ field: rhfField, fieldState }) => (
        <>
          <FieldComponent
            definition={field}
            value={rhfField.value}
            onChange={rhfField.onChange}
            onBlur={rhfField.onBlur}
            isRequired={isRequired}
            isReadonly={isReadonly}
          />
          {fieldState.error && (
            <ValidationMessage message={fieldState.error.message ?? ''} />
          )}
        </>
      )}
    />
  );
}
```

### 6.3 Native Field Component Pattern

All 15 native field components follow the same interface:

```typescript
// src/components/fields/NativeFieldProps.ts
interface NativeFieldProps {
  definition: FieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  onBlur: () => void;
  isRequired: boolean;
  isReadonly: boolean;
}
```

Each component is responsible only for rendering the native control
and calling onChange/onBlur. Validation error display is handled by
MobileFieldRenderer (ValidationMessage below the Controller).

### 6.4 Platform-Specific Implementations

Date field (NativeDateField):
```typescript
// iOS: bottom sheet modal with spinner DateTimePicker
// Android: native DatePickerDialog
// Both: controlled state via useState(selectedDate)
// On confirm: calls onChange(isoDateString)
```

Dropdown field (NativeDropdownField):
```typescript
// iOS: ActionSheetIOS.showActionSheetWithOptions
// Android: custom Modal with FlatList (bottom-sheet style)
// Uses Platform.OS check to select implementation
```

File upload field (NativeFileUploadField):
```typescript
// ActionSheet: "Take Photo" | "Choose from Gallery" | "Choose File" | "Cancel"
// Take Photo → ImagePicker.launchCameraAsync()
// Choose from Gallery → ImagePicker.launchImageLibraryAsync()
// Choose File → DocumentPicker.getDocumentAsync()
// On selection → fileService.uploadFile(uri, formCode, fieldKey)
// Displays upload progress + file name on success
```

### 6.5 CEO Condition M-4 — Grid Field Resolution

Decision: Option B — form list shows "Desktop required" indicator.

Implementation:
  1. GET /api/forms response includes a new field:
     requiresDesktop: boolean
     Set to true if the form has any fieldType === 'grid' where
     isRequiredDefault === true.
  2. Form list screen renders a "Desktop required" badge on those forms.
  3. Users can still open and partially fill the form on mobile.
  4. GridUnavailableField renders a notice card with the form's web URL.
  5. Submission is not blocked if the grid field is not required.
     If required: submission is blocked with a clear error message
     pointing to the web URL.


## 7. RULE ENGINE ARCHITECTURE (MOBILE)
─────────────────────────────────────────────────────────────────────

### 7.1 Hermes Compatibility (CEO Condition M-2 — Resolved)

json-rules-engine v6.x source analysis (github-research.md Section 8):
  - Zero DOM API references (no window, document, navigator, XMLHttpRequest)
  - No Node.js-specific APIs (no fs, path, crypto, net)
  - Uses only: Promise, Array methods, Object spread, async/await
  - Hermes supports all of the above since Expo SDK 48 (Hermes 0.13+)

The RuleEngine class (shared/src/engines/RuleEngine.ts) runs on
Hermes without modification. The Hermes compatibility Jest test suite
(Section 4.3) enforces this as a CI regression guard.

### 7.2 useRuleEngine Hook (Mobile)

The mobile hook follows the same pattern as the web useRuleEngine hook:
```typescript
// src/hooks/useRuleEngine.ts
export function useRuleEngine(
  businessRules: BusinessRule[],
  watch: () => Record<string, unknown>
): RuleEvaluationResult {
  const ruleEngine = useMemo(
    () => new RuleEngine(businessRules),
    [businessRules]
  );
  const formValues = watch();
  const [result, setResult] = useState<RuleEvaluationResult>(
    RuleEvaluationResult.empty()
  );

  useEffect(() => {
    // Debounce 50ms to avoid re-evaluation on every keystroke
    const timer = setTimeout(async () => {
      const evaluated = await ruleEngine.evaluate(formValues);
      setResult(evaluated);
    }, 50);
    return () => clearTimeout(timer);
  }, [formValues, ruleEngine]);

  return result;
}
```

The 50ms debounce (tighter than the web's immediate evaluation)
is appropriate for mobile because the Hermes engine on low-end
Android devices may take 20–40ms to evaluate 200 rules. The debounce
ensures the user is not blocked mid-keystroke by rule evaluation.

MNFR-003 requires rule evaluation to complete within 100ms on a
mid-range device. This is validated by the benchmark test in shared/.

### 7.3 Hidden Field Clearing on Mobile

Before POST /api/forms/:formCode/submit, the mobile submission service:
1. Calls ruleEngine.evaluate(currentValues) to get the final hidden set
2. Removes all keys in hiddenFields from the submission payload
3. The backend re-runs the same evaluation server-side (BR-002)

This is identical to the web implementation.


## 8. VALIDATION ENGINE ARCHITECTURE (MOBILE)
─────────────────────────────────────────────────────────────────────

The ValidationEngine (shared/src/engines/ValidationEngine.ts) is
imported by the mobile app and used as the react-hook-form resolver
via @hookform/resolvers/zod — the same pattern as the web portal.

On mobile, the Zod schema is built from metadata validation rules and
passed to useForm({ resolver: zodResolver(schema) }). Field-level
errors surface in fieldState.error.message and are rendered by the
ValidationMessage component below each field.

Haptic feedback (MFR-020) is triggered from the ValidationMessage
component on first render of a non-null error message:

```typescript
// src/components/ui/ValidationMessage.tsx
export function ValidationMessage({ message }: { message: string }) {
  useEffect(() => {
    if (message) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [message]);

  return (
    <Text style={styles.errorText} accessibilityRole="alert">
      {message}
    </Text>
  );
}
```


## 9. FIELD TYPE ARCHITECTURE — PLATFORM SPECIFICS
─────────────────────────────────────────────────────────────────────

### 9.1 Date and DateTime Fields

NativeDateField uses @react-native-community/datetimepicker with a
modal wrapper for both platforms:

```
iOS:   BottomSheet modal → DateTimePicker mode="date" display="spinner"
       "Done" button confirms; "Cancel" dismisses without change

Android: DateTimePicker mode="date" display="calendar" (opens native dialog)
         onChange fires immediately on date selection — no Done button
```

NativeDateTimeField:
```
iOS:   BottomSheet modal → DateTimePicker mode="datetime" display="inline"
       (iOS 14+ inline calendar + time wheel)

Android: Two-step modal:
         Step 1: DateTimePicker mode="date" → user selects date → confirm
         Step 2: DateTimePicker mode="time" → user selects time → confirm
         Combined Date object assembled from both selections
```

Both components use the isoDateString output format (ISO 8601 UTC)
for consistency with the web portal's date handling.

### 9.2 Dropdown and MultiSelect Fields

NativeDropdownField:
```typescript
// Platform.OS === 'ios': ActionSheetIOS.showActionSheetWithOptions
// Platform.OS === 'android': Modal with FlatList (styled as bottom sheet)
// Both: cancelled by selecting the "Cancel" option (index 0)
// Single selection → onChange(selectedOption.value)
```

NativeMultiSelectField:
```typescript
// Both platforms: Modal with ScrollView of CheckBox items
// Selected items shown as Chip tags below the trigger button
// Done button confirms; Cancel dismisses without change
```

### 9.3 Lookup Field

NativeLookupField follows the same debounce pattern as the web LookupField:
```
TextInput → onChangeText → debounce 300ms → GET /api/lookup/:entity
If response has results → render in FlatList below input (max 5 results)
User selects result → onChange({ id, displayName }) → hide FlatList
Min 3 characters before API call (MBR-009 compliance)
```

The lookup FlatList renders in an absolutely positioned overlay to
avoid pushing layout. On keyboard dismiss, the overlay closes.

### 9.4 File Upload Field (CEO M-4 related + MFR-035)

NativeFileUploadField presents an action sheet:

```typescript
const uploadOptions = buildUploadOptions(field.documentUploadConfig);
// options built from allowed MIME types:
// if includes 'image/*': show "Take Photo", "Choose from Gallery"
// if includes 'application/pdf' or others: show "Choose File"
// always: show "Cancel"

ActionSheetIOS.showActionSheetWithOptions(uploadOptions, async (index) => {
  switch (index) {
    case TAKE_PHOTO: await launchCamera(); break;
    case CHOOSE_GALLERY: await launchImageLibrary(); break;
    case CHOOSE_FILE: await launchDocumentPicker(); break;
  }
});
```

File size check (MFR-038) before upload:
```typescript
const fileSizeBytes = await getFileSizeBytes(fileUri);
if (fileSizeBytes > field.documentUploadConfig.maxFileSizeMb * 1024 * 1024) {
  setError(`File exceeds ${field.documentUploadConfig.maxFileSizeMb}MB limit`);
  return;
}
```

Upload uses multipart/form-data to POST /api/files/upload with
the standard Authorization: Bearer header.

### 9.5 Grid and RichText Fields (Phase 1 Stubs)

GridUnavailableField:
```typescript
// Renders a styled card:
// "This section requires the desktop portal"
// "Open in browser" → Linking.openURL(webPortalUrl + '/form/' + formCode)
// If field is required AND grid is empty → MobileFieldRenderer
//   shows a validation error: "Please complete this section on the web portal"
```

RichTextReadOnlyField:
```typescript
// Renders the field label and a read-only Text view of the raw value
// If value contains HTML tags: strips tags with a simple regex
//   (no HTML rendering on mobile in Phase 1)
// Shows notice: "Formatting is preserved on the web portal"
```


## 10. NAVIGATION ARCHITECTURE
─────────────────────────────────────────────────────────────────────

The mobile app uses Expo Router (file-based routing, built on React
Navigation v6). Three navigation layers:

### 10.1 App-Level Stack

```
/ (root) — auth guard
  → (auth)/login    — not authenticated
  → (app)/          — authenticated
      forms/         — form list (default tab: index)
      profile/       — user profile + sign-out
```

### 10.2 Form Tab Navigation

Each form is rendered in a dedicated screen that instantiates a
React Navigation BottomTabNavigator. The tabs are dynamically created
from the form's TabDefinition[] array at runtime.

Each tab screen = one tab of the form. The bottom tab bar shows tab
labels (truncated to 12 chars if necessary) with a validation error
indicator badge (red dot) if any field in that tab has an error.

Tab navigation flow:
```
User opens form → first visible tab is active
User navigates between tabs → tab bar or swipe gesture
Tabs with all required fields valid → checkmark indicator
Tabs with validation errors → error badge
User taps Submit → validation runs across ALL tabs → first failing tab
  is activated and first failing field is scrolled into view
```

### 10.3 Keyboard Handling

All form scroll views use KeyboardAvoidingView with:
  - iOS: behavior="padding"
  - Android: behavior="height" (or "padding" depending on device)

The KeyboardAvoidingView keyboardVerticalOffset accounts for the
bottom tab bar height (retrieved from useBottomTabBarHeight() hook).


## 11. API CONTRACTS (MOBILE ADDITIONS)
─────────────────────────────────────────────────────────────────────

The mobile app reuses all existing backend API endpoints unchanged.
Two additions are required (CEO Condition M-3 resolution):

### 11.1 New Endpoint: GET /api/forms

**Purpose:** Form list for the mobile app's FormListScreen.
**Auth:** Bearer token (any authenticated user)
**Response 200:** ApiResponse<FormListItem[]>

```typescript
// shared/src/types/api.ts — new type
interface FormListItem {
  formId: string;
  formCode: string;
  displayName: string;
  description: string;
  requiresDesktop: boolean;   // true if form has required grid fields
  hasDraft: boolean;          // true if authenticated user has an active draft
  version: number;
}
```

**Group membership resolution:**
  The endpoint calls the same roleMiddleware logic used by the metadata
  endpoint to filter forms to only those accessible to the calling
  user's AD group memberships. The overage claim flow (>200 groups →
  Microsoft Graph memberOf check) applies identically.

**Caching:**
  The form list is cached in the backend LRU cache with key
  `formList:{userOid}` and TTL 60 seconds (shorter than metadata cache
  because form activation/deactivation changes are more frequent).
  Max 10,000 entries (one per user). Memory footprint: each FormListItem
  is ~200 bytes; 10,000 entries = ~2 MB maximum.

**requiresDesktop flag computation:**
  CrmFormListService queries qdb_form_field records for each form
  definition and sets requiresDesktop = true if any record has
  qdb_field_type = 'grid' AND qdb_is_required_default = true.
  This is computed on cache miss and cached with the list response.

**Performance target:** 200ms P95 under 100 concurrent users
  (form list is smaller than individual form metadata; LRU caching
  reduces Dataverse calls to near zero at steady state).

### 11.2 Modified: Audit Log (X-Client-Platform Header)

All mobile API calls include a custom header:
  X-Client-Platform: mobile

The backend requestLogger middleware reads this header and includes
it in structured log entries. The CrmAuditService reads it from the
request context and sets qdb_channel = 'mobile' on audit log entries.
This is the only change to existing backend audit logic.

### 11.3 All Other Endpoints (Unchanged)

| Endpoint                          | Mobile Usage              | Changes |
|-----------------------------------|---------------------------|---------|
| GET /api/forms/:formCode/metadata | useFormMetadata hook      | None    |
| GET /api/drafts?formCode=         | useDraft hook             | None    |
| POST /api/drafts                  | useDraft hook             | None    |
| DELETE /api/drafts/:draftId       | useDraft hook             | None    |
| GET /api/lookup/:entity           | NativeLookupField         | None    |
| POST /api/forms/:formCode/submit  | submissionService         | None    |
| POST /api/files/upload            | NativeFileUploadField     | None    |
| GET /health                       | App startup check         | None    |


## 12. SECURITY ARCHITECTURE (MOBILE)
─────────────────────────────────────────────────────────────────────

### 12.1 Transport Security

All communication uses TLS 1.2+ (enforced by iOS ATS and Android
Network Security Config). No HTTP connections are permitted in
production builds.

Certificate pinning (MNFR-009): Deferred to Phase 2 per BRD. A
production hardening ADR must be filed in Phase 2 to decide
between:
  - react-native-ssl-pinning (requires bare workflow)
  - OkHttp CertificatePinner via a native module (Android)
  - iOS NSURLSession certificate pinning via a config plugin

The operational risk of certificate pinning (app update required on
cert rotation) must be documented in the production hardening ADR.

### 12.2 Token Security

Tokens stored exclusively in Expo SecureStore (iOS Keychain /
Android Keystore). The MSAL cache plugin (Section 5.3) serialises
the entire MSAL token cache as a single encrypted entry.

Token never:
  - Logged in structured log entries (requestLogger strips Authorization
    header from log output)
  - Stored in AsyncStorage
  - Included in crash reports (Sentry/Crashlytics must be configured
    with PII scrubbing before production)

### 12.3 PII Handling

Field values (including national IDs, income figures, addresses) are
held exclusively in react-hook-form state (in-memory JS object).
They are cleared when:
  - The user signs out (msalInstance.logout() + SecureStore clear)
  - The app is terminated by the OS (memory freed)
  - The form is submitted or draft is saved (values remain in state
    for confirmation screen, then cleared on navigation away)

No field value is written to AsyncStorage, MMKV, or device storage
in Phase 1 (MNFR-010).

### 12.4 Jailbreak / Root Detection (Production Gate — MNFR-008)

Not implemented in Phase 1 UAT. Required before production traffic.
Architecture decision deferred to Phase 2 hardening ADR. The ADR must
specify:
  - Library: react-native-device-info (isJailBroken / isRooted)
  - Behaviour on detection: warn vs. terminate (QDB Security decision)
  - Audit log: detection events written to qdb_form_audit_log with
    event_type = SECURITY_WARNING

### 12.5 Deep Link Security

The MSAL redirect URI scheme (msauth://com.qdb.formengine/callback)
is registered in app.json. Only this scheme is handled by the app.
Incoming deep links are validated by the MSAL library before any
token extraction — malformed or unexpected parameters are rejected.


## 13. PERFORMANCE ARCHITECTURE
─────────────────────────────────────────────────────────────────────

### 13.1 Form Load Performance (MNFR-001 — 3 seconds to interactive on 4G)

Form load critical path:
```
1. acquireTokenSilent()         ~50ms (MSAL cached token)
2. GET /api/forms/:code/metadata ~150ms (backend LRU cache hit)
3. ValidationEngine.buildSchema  ~20ms (Zod schema construction)
4. RuleEngine.loadRules          ~10ms (json-rules-engine rule load)
5. React Native render           ~100ms (initial render, 50-field form)
                                 ─────
Total (estimated):               ~330ms (well within 3s target)
```

Cache miss path (first load after app install):
```
Metadata LRU cache miss → 6-8 Dataverse OData calls → ~450ms
Total on cache miss:     ~630ms (still within 3s target)
```

### 13.2 Rule Engine Performance (MNFR-003 — 100ms P95)

50ms debounce on form value changes (Section 7.2) means the rule
engine evaluates at most every 50ms during active input. On a
mid-range 2023 device, json-rules-engine evaluates 200 rules against
50 facts in approximately 15–30ms. The 50ms debounce provides
sufficient margin.

The benchmark test in shared/ validates this:
  P95 of 200-rule evaluation over 1,000 iterations < 50ms on the
  GitHub Actions runner (conservative estimate vs. device hardware).

### 13.3 Metro Bundler Optimisation

```javascript
// mobile/metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);

// Include shared/ package in the Metro bundler resolution
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, '../../node_modules'),
  path.resolve(__dirname, '../shared'),
];

// Hermes-optimised bundle (enabled by default in Expo SDK 50+)
config.transformer.hermesParser = true;

module.exports = config;
```

### 13.4 Image Compression for File Uploads

expo-image-picker returns images at full device resolution by default.
For camera captures, quality compression is applied:

```typescript
const result = await ImagePicker.launchCameraAsync({
  quality: 0.8,            // 80% JPEG quality (reduces size ~60%)
  allowsEditing: false,
  base64: false,           // URI mode — do not embed in response
});
```

After compression, a 12MP photo (~5MB raw) is reduced to ~1.5MB —
well within the 25MB BR-011 limit. The backend magic bytes check
validates the actual MIME type after upload.


## 14. DEPLOYMENT ARCHITECTURE
─────────────────────────────────────────────────────────────────────

### 14.1 EAS Build Profiles

```json
// mobile/eas.json
{
  "cli": { "version": ">= 7.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": {
        "EXPO_PUBLIC_API_BASE_URL": "https://api-dev.qdb-forms.azure.com",
        "EXPO_PUBLIC_MSAL_CLIENT_ID": "...",
        "EXPO_PUBLIC_AZURE_AD_TENANT_ID": "..."
      }
    },
    "uat": {
      "distribution": "internal",
      "ios": { "simulator": false },
      "env": { ... }
    },
    "production": {
      "distribution": "store",
      "ios": { "buildConfiguration": "Release" },
      "android": { "buildType": "apk", "gradleCommand": ":app:bundleRelease" },
      "env": { ... }
    }
  },
  "submit": {
    "production": {
      "ios": { "appleId": "...", "ascAppId": "..." },
      "android": { "serviceAccountKeyPath": "./google-service-account.json" }
    }
  }
}
```

### 14.2 GitHub Actions CI/CD Pipeline

```yaml
# .github/workflows/mobile.yml

stages:
  1. lint-typecheck    # ESLint + tsc --noEmit (shared + mobile)
  2. unit-test         # Jest + RNTL (mobile components + shared engines)
  3. hermes-compat     # shared/RuleEngine.hermes.test.ts (CEO M-2 gate)
  4. eas-build-dev     # EAS Build development profile (dev client)
  5. detox-e2e         # Detox on iOS Simulator + Android Emulator
  6. eas-build-uat     # EAS Build UAT profile — triggered on PR to main
  7. eas-build-prod    # EAS Build production — triggered on version tag
  8. eas-submit        # App Store + Play Store — manual approval gate
```

### 14.3 Environment Configuration

Mobile environment variables are injected via EAS Build environment
variables → app.config.ts → Constants.expoConfig.extra. They are
validated at app startup by appConfig.ts (Zod schema):

```typescript
// src/config/appConfig.ts
const MobileAppConfigSchema = z.object({
  apiBaseUrl: z.string().url(),
  msalClientId: z.string().uuid(),
  azureAdTenantId: z.string().uuid(),
  webPortalUrl: z.string().url(),       // for deep-link to web portal
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});
```

EXPO_PUBLIC_ prefix values are safe to include in the client bundle
(they are public configuration, not secrets). The MSAL client ID for
the mobile registration is a public value — it is not a secret.

### 14.4 App Permissions (app.json)

```json
{
  "expo": {
    "ios": {
      "bundleIdentifier": "com.qdb.formengine",
      "infoPlist": {
        "NSCameraUsageDescription": "QDB Forms needs camera access to capture document photos for your application.",
        "NSPhotoLibraryUsageDescription": "QDB Forms needs photo library access to upload existing documents.",
        "NSPhotoLibraryAddUsageDescription": "QDB Forms needs permission to save photos.",
        "NSFaceIDUsageDescription": "QDB Forms uses Face ID for secure sign-in."
      }
    },
    "android": {
      "package": "com.qdb.formengine",
      "permissions": [
        "CAMERA",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE",
        "USE_BIOMETRIC",
        "USE_FINGERPRINT"
      ]
    },
    "plugins": [
      "expo-secure-store",
      "expo-image-picker",
      "expo-document-picker",
      "@azure/msal-react-native"
    ]
  }
}
```


## 15. ARCHITECTURE DECISION RECORDS (MOBILE)
─────────────────────────────────────────────────────────────────────

### MADR-001: Expo Managed Workflow over Bare React Native
Status: Accepted | Date: 2026-05-20 | Decided by: Architect

Context: The Maqsad AI constitution specifies React Native + TypeScript
+ Expo for mobile. Expo offers two workflows: managed (no native code
in the repo) and bare (full native project files). Managed workflow
simplifies CI/CD (EAS Build handles native compilation), reduces the
iOS/Android developer toolchain requirement on the team, and ensures
all native module dependencies are pre-vetted by Expo's SDK.

Decision: Use Expo managed workflow with EAS Build for Phase 1.

Consequences:
  Positive: No Xcode or Android Studio required for the JS team.
  EAS Build runs cloud-native compilation. Expo SDK pre-vets all
  native modules for managed compatibility.
  Positive: Detox E2E testing is supported via expo-dev-client.
  Negative: Any native module not in the Expo SDK requires a config
  plugin (managed-compatible) or ejection to bare workflow. For
  Phase 1, all required modules have Expo-compatible config plugins.
  Negative: App size may be slightly larger (~2–5MB) due to the Expo
  runtime. Acceptable given MNFR-013 (30MB limit).

---

### MADR-002: react-hook-form over Custom Form State
Status: Accepted | Date: 2026-05-20 | Decided by: Architect

Context: The mobile app requires form state management (field values,
dirty tracking, submission state). The web portal uses react-hook-form
(42,000+ stars, MIT). It is React Native compatible without modification.

Decision: Use react-hook-form for mobile form state management.
Move to shared/ usage pattern (both web and mobile import from
@hookform/resolvers/zod via their own node_modules — not the shared/
package, since RHF itself is not shared as a package, only used by
both independently).

Consequences:
  Positive: Same API as web — developers familiar with web form state
  can work on mobile immediately.
  Positive: Proven React Native compatibility (thousands of RN apps).
  Positive: Controller component provides the correct integration
  pattern for custom native field components.
  Negative: None identified for this use case.

---

### MADR-003: Expo Router over React Navigation directly
Status: Accepted | Date: 2026-05-20 | Decided by: Architect

Context: React Navigation v6 is the standard RN navigation library.
Expo Router is a file-based routing layer built on React Navigation,
introduced in Expo SDK 50. It provides URL-based deep linking,
typed routes (TypeScript), and automatic route discovery.

Decision: Use Expo Router. The file-based route structure maps cleanly
to the form engine's screens: (auth)/login, (app)/forms/index,
(app)/forms/[formCode]/index, (app)/forms/[formCode]/confirmation.

Consequences:
  Positive: File-based routing reduces boilerplate navigation
  configuration code.
  Positive: Typed routes prevent navigation errors at compile time.
  Positive: Deep link support (formCode in URL) is automatic.
  Negative: Expo Router is newer than React Navigation direct usage.
  Team must be familiar with the file-based convention. No significant
  risk given Expo's active maintenance and documentation.

---

### MADR-004: Online-Only for Phase 1 (No Offline Draft Storage)
Status: Accepted | Date: 2026-05-20 | Decided by: Architect
(Inherits BRD offline decision — see Section 8)

Context: Phase 1 mobile is online-only. No MMKV or AsyncStorage
draft persistence. This is a deliberate constraint to simplify Phase 1
and avoid introducing sync complexity before the web Sprint 1
blockers are resolved.

Decision: Online-only. Draft state is in React state (memory only).
Saved drafts persist to Dataverse via the backend API.

Consequences:
  Positive: No sync conflict resolution required.
  Positive: No PII in device storage risk.
  Positive: No backend draft API changes.
  Negative: If the mobile app is killed (OOM) mid-form without saving
  draft, the user's data is lost. Mitigation: the app triggers an
  autosave to Dataverse every 60 seconds if the form has been modified
  (onAppStateChange to 'background'). This autosave is a silent
  background POST /api/drafts — not a user-visible action.

---

### MADR-005: Option B for Grid Fields (Desktop Indicator, Not Exclusion)
Status: Accepted | Date: 2026-05-20 | Decided by: Architect
(Resolves CEO Condition M-4)

Context: Forms with required grid fields cannot be submitted from
mobile. Three options were evaluated (BRD Section 4.2, CEO review).

Decision: Option B — forms with required grid fields are shown in the
mobile form list with a "Desktop required" badge. Users can open
the form, fill non-grid sections on mobile, save as draft, and
complete the grid section on the web portal before final submission.

Consequences:
  Positive: Users can start a banking application on mobile and
  complete it on web — the draft bridges the channels.
  Positive: Simpler than Option A (no exclusion filter logic) or
  Option C (no universal link implementation required in Phase 1).
  Negative: A user who does not have web portal access cannot submit
  a form with required grid fields. This must be communicated in the
  app's onboarding and in the "Desktop required" badge tooltip.


## 16. MOBILE GO-LIVE GATE CHECKLIST (CEO Condition M-1 Resolution)
─────────────────────────────────────────────────────────────────────

This checklist is INDEPENDENT of the web Sprint 1 remediation
checklist. Mobile UAT may begin when all mobile gates below are
cleared, regardless of the status of web Sprint 1 items — provided
MOBILE-GATE-A and MOBILE-GATE-B are also resolved.

PRE-DEVELOPMENT GATES (External — QDB Actions)
  MOBILE-GATE-A: Written confirmation from QDB project sponsor that
    all mobile app users authenticate through the same QDB corporate
    Azure AD tenant (same as web GATE-A). Mobile auth cannot be
    finalised without this.
  MOBILE-GATE-B: Written confirmation from QDB IT that a Dataverse
    environment in Qatar North or UAE North is available (same as web
    GATE-B). Mobile submissions must not go to West Europe org.
  MOBILE-GATE-C: QDB IT registers the mobile Azure AD application
    (separate from web SPA registration) with the custom URI scheme
    msauth://com.qdb.formengine/callback. Client ID provided to
    Maqsad AI before auth development begins.
  MOBILE-GATE-D: QDB Mobile Team confirms App Store Connect and Google
    Play Console accounts are available for TestFlight / Internal
    Testing distribution of UAT builds.

SPRINT 1 — MOBILE BUILD (Parallel with Web Sprint 1)
  The following items can be developed in parallel with web Sprint 1
  remediation. They do not depend on web blockers being resolved.

  MS1-01: shared/ package extracted and published as workspace
    package. RuleEngine, ValidationEngine, FormDefinition types
    imported from @qdb/form-engine-shared by both web and mobile.
    Hermes compatibility test passing in CI.

  MS1-02: Expo app scaffold created. MSAL mock provider in place
    (real MSAL auth depends on MOBILE-GATE-A and MOBILE-GATE-C).
    All navigation routes defined. EAS Build dev profile working.

  MS1-03: All 15 native field components implemented and covered by
    Jest + RNTL unit tests (minimum 80% coverage).

  MS1-04: MobileDynamicFormRenderer, MobileFormTabBar,
    MobileSectionRenderer, MobileFieldRenderer implemented and tested.
    Rule engine integration verified with mock metadata (businessRules
    populated with test rules — not blocked by BLOCKER-10 since
    mock data is used in mobile tests).

  MS1-05: useDraft hook implemented (GET/POST /api/drafts).
    submissionService implemented (POST /api/forms/:formCode/submit).
    NativeFileUploadField implemented (requires web BLOCKER-9
    backend fix before E2E file upload tests can pass).

  MS1-06: GET /api/forms backend endpoint implemented, unit tested,
    and integrated with form list screen.

  MS1-07: X-Client-Platform header added to all mobile API calls.
    Backend audit log qdb_channel field and requestLogger update
    deployed.

  MS1-08: MSAL auth wired (requires MOBILE-GATE-A and MOBILE-GATE-C).
    MSAL token storage via Expo SecureStore confirmed working on
    physical iOS and Android devices.

  MS1-09: Detox E2E tests covering: login flow, form list, form
    render, draft save/resume, submission, file upload (requires
    web BLOCKER-9 to be resolved for upload E2E tests).

  MS1-10: EAS Build UAT profile producing distributable .ipa and
    .aab artefacts. TestFlight and Google Play Internal Testing
    distribution confirmed working.

MOBILE UAT ENTRY GATE — AUDITOR SIGN-OFF
  Before QDB UAT testers access the mobile app:
  - All MS1-01 through MS1-10 complete
  - MOBILE-GATE-A, MOBILE-GATE-B, MOBILE-GATE-C resolved
  - Web BLOCKER-9 and BLOCKER-10 resolved (file upload and business
    rules must be functional for full mobile E2E testing)
  - Web BLOCKER-4 (roleMiddleware) resolved (mobile RBAC is backend-
    enforced; required before mobile users test restricted forms)
  - Auditor clearance memo filed (separate from web UAT clearance)

PRODUCTION GATE (before live customer data on mobile)
  - All web Sprint 2 production items complete (shared backend)
  - MNFR-008 jailbreak/root detection implemented and QDB Security
    signed off on detection behaviour
  - MNFR-009 certificate pinning decision made and documented (ADR)
  - App Store and Play Store approved for public distribution
  - QDB IT provides signed data residency declaration covering mobile
    traffic (same as web production gate)


## 17. ARCHITECTURAL RISKS
─────────────────────────────────────────────────────────────────────

| Rank | Risk                                                                          | Likelihood | Impact   | Mitigation                                                                      |
|------|-------------------------------------------------------------------------------|------------|----------|---------------------------------------------------------------------------------|
| 1    | ADR-007 / MOBILE-GATE-A: external users require Entra External ID            | High       | Critical | MOBILE-GATE-A hard stop. No auth code until written confirmation received.     |
| 2    | iOS 14+ limited photo access confuses users (partial gallery access)          | High       | Medium   | presentLimitedLibraryPicker() flow implemented. UX tested on iOS 14 device.    |
| 3    | Android two-step datetime picker UX is jarring vs iOS inline                  | Medium     | Medium   | UX testing in UAT. Phase 2: evaluate a custom datetime modal for Android.      |
| 4    | Rule engine 50ms debounce causes visible lag on complex forms (200+ rules)    | Low        | Medium   | MNFR-003 benchmark enforced in CI. Debounce tunable via config.                |
| 5    | autosave (MADR-004) fires on app background while user is mid-edit            | Medium     | Low      | autosave sends current RHF snapshot. No data loss. Worst case: slightly stale  |
|      | — may overwrite a more complete draft if user switches apps quickly            |            |          | draft. Acceptable for Phase 1.                                                 |
| 6    | EAS Build production signing requires Apple Developer Program paid membership  | Low        | High     | MOBILE-GATE-D confirms QDB Mobile Team has account. Not a Maqsad AI concern.  |
| 7    | @azure/msal-react-native version lag behind MSAL JS monorepo                  | Medium     | Medium   | Pin to latest stable at build time. Monitor GitHub releases before each build. |
| 8    | App bundle size exceeds 30MB MNFR-013 after all Expo plugins are included     | Medium     | Low      | Monitor EAS Build artefact size in CI. Apply Metro tree-shaking if exceeded.   |


## 18. ADR INDEX (MOBILE)
─────────────────────────────────────────────────────────────────────

| ADR    | Title                                           | Status   | Date       | Decided by |
|--------|-------------------------------------------------|----------|------------|------------|
| MADR-001 | Expo Managed Workflow over Bare React Native  | Accepted | 2026-05-20 | Architect  |
| MADR-002 | react-hook-form for Mobile Form State        | Accepted | 2026-05-20 | Architect  |
| MADR-003 | Expo Router over React Navigation Direct     | Accepted | 2026-05-20 | Architect  |
| MADR-004 | Online-Only for Phase 1 (No Offline Storage) | Accepted | 2026-05-20 | Architect  |
| MADR-005 | Option B for Grid Fields (Desktop Indicator) | Accepted | 2026-05-20 | Architect  |


═══════════════════════════════════════════════════════════════════
END OF ARCHITECTURE DOCUMENT
Dynamic Form Engine — Mobile Rendering Extension
Maqsad AI — Solution Architect — 2026-05-20
═══════════════════════════════════════════════════════════════════
