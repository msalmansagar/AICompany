# Dynamic Form Engine — Developer Feature Reference

**Version:** 2.0 | **Last updated:** 2026-06-14 | **Maintained by:** Maqsad AI

This document is the authoritative reference for every feature the Dynamic Form Engine
exposes, the ones currently implemented, and the ones on the roadmap. Each roadmap item
includes enough technical specification for a developer to begin implementation without
additional research.

---

## Table of Contents

1. [How to Read This Document](#1-how-to-read-this-document)
2. [Implemented Features — Complete Inventory](#2-implemented-features--complete-inventory)
   - 2.1 Field Types
   - 2.2 Form Structure
   - 2.3 Business Rules Engine
   - 2.4 Validation Engine
   - 2.5 Designer
   - 2.6 File Upload
   - 2.7 Draft / Save
   - 2.8 Summary / Review Step
   - 2.9 CRM / Dataverse Integration
   - 2.10 Authentication & Access Control
   - 2.11 Mobile (React Native) — structure, navigation, state, auth, fields, gaps
   - 2.12 Backend API
   - 2.13 Recent Feature Enhancements (2026-07) — grid lookup fix, info-card grid, grid file upload, conditional buttons, submit gate
3. [Roadmap — Phase 1: Web Table Stakes (0–3 months)](#3-roadmap--phase-1-table-stakes)
4. [Roadmap — Phase 1b: Mobile Bug Fixes (0–3 months)](#3b-roadmap--phase-1-mobile-bug-fixes)
   - RM-002 Draft Resume
   - RM-003 Offline Sync Status UI
   - RM-004 Settings / Sign-Out Screen
   - RM-005 Mobile File Upload (Multipart)
   - RM-009 Token Expiry Check
   - RM-010 Fix hasDraft Always False
5. [Roadmap — Phase 2: Web Competitive Parity (3–6 months)](#4-roadmap--phase-2-competitive-parity)
6. [Roadmap — Phase 2b: Mobile Parity (3–6 months)](#4b-roadmap--phase-2-mobile-parity)
   - RM-001 Submission History Screen
   - RM-006 EAS Build Configuration
   - RM-007 Wire LocaleContext + RTL
   - RM-008 Wire Mock Data to Dev Bypass
7. [Roadmap — Phase 3: Differentiation (6–12 months)](#5-roadmap--phase-3-differentiation)
   - R-020 Mobile Offline Mode (full offline + sync)
8. [Technical Debt Register](#6-technical-debt-register)
9. [Shared Type Contract](#7-shared-type-contract)
8. [Adding a New Field Type — Developer Checklist](#8-adding-a-new-field-type--developer-checklist)

---

## 1. How to Read This Document

Feature entries use the following status tags:

| Tag | Meaning |
|-----|---------|
| `[DONE]` | Fully implemented and deployed |
| `[PARTIAL]` | Implemented but with known gaps noted inline |
| `[PLANNED-P1]` | Phase 1 roadmap — 0–3 months |
| `[PLANNED-P2]` | Phase 2 roadmap — 3–6 months |
| `[PLANNED-P3]` | Phase 3 roadmap — 6–12 months |

Feature IDs (e.g. `F-012`, `R-003`) are stable references. Use them in PR descriptions,
commits, and ADRs when implementing or referencing a feature.

---

## 2. Implemented Features — Complete Inventory

### 2.1 Field Types `[DONE]`

All field types live under:

- **Frontend:** `frontend/src/components/forms/controls/`
- **Mobile:** `mobile/src/components/fields/`
- **Designer panels:** `designer/src/designer/properties/panels/`
- **Shared type:** `shared/src/types/form.types.ts → FieldType`

| ID | Field Type | Control File | Designer Panel | Notes |
|----|-----------|-------------|----------------|-------|
| F-001 | `text` | `TextInputControl.tsx` | `TextFieldPanel.tsx` | Max length, placeholder, mask support |
| F-002 | `textarea` | `TextAreaControl.tsx` | `TextFieldPanel.tsx` | Row count configurable |
| F-003 | `email` | `EmailControl.tsx` | `TextFieldPanel.tsx` | RFC 5322 regex validation |
| F-004 | `phone` | `PhoneControl.tsx` | `TextFieldPanel.tsx` | E.164 format validation |
| F-005 | `number` | `NumberControl.tsx` | `NumberFieldPanel.tsx` | Integer, min/max, step |
| F-006 | `decimal` | `DecimalControl.tsx` | `NumberFieldPanel.tsx` | Decimal places configurable |
| F-007 | `currency` | `CurrencyControl.tsx` | `NumberFieldPanel.tsx` | Currency symbol, locale formatting |
| F-008 | `date` | `DateControl.tsx` | `DateFieldPanel.tsx` | Min/max date, date-before/after rules |
| F-009 | `datetime` | `DateTimeControl.tsx` | `DateFieldPanel.tsx` | Timezone-aware ISO 8601 |
| F-010 | `checkbox` | `CheckboxControl.tsx` | `CheckboxFieldPanel.tsx` | Single boolean checkbox |
| F-011 | `checkboxgroup` | `CheckboxGroupControl.tsx` | `CheckboxFieldPanel.tsx` | Multi-select via checkbox list |
| F-012 | `radio` | `RadioControl.tsx` | `DropdownFieldPanel.tsx` | Option set source |
| F-013 | `radiocard` | `RadioCardControl.tsx` | `DropdownFieldPanel.tsx` | Card-grid render style for radio |
| F-014 | `dropdown` | (via DropdownControl) | `DropdownFieldPanel.tsx` | Single-select, static or CRM option set |
| F-015 | `multiselect` | `MultiSelectControl.tsx` | `DropdownFieldPanel.tsx` | Combobox or checkbox-list render |
| F-016 | `lookup` | `LookupControl.tsx` | `LookupConfig screen` | CRM entity type-ahead, dependent filter |
| F-017 | `file` | `FileUploadControl.tsx` | `FileUploadFieldPanel.tsx` | See §2.6 for full spec |
| F-018 | `richtext` | `RichTextControl.tsx` | `RichTextFieldPanel.tsx` | Tiptap editor, HTML output |
| F-019 | `repeatinggrid` | `RepeatingGridControl.tsx` | `GridColumnBuilder panel` | User-added rows, typed columns |
| F-020 | `boolean` | `BooleanControl.tsx` | (via CheckboxFieldPanel) | Toggle or radio render mode |
| F-021 | `infocard` | `InfoCardField.tsx` | `AdvancedComponentsPanel.tsx` | Display-only informational banner |
| F-022 | `interactivegrid` | `InteractiveGridField.tsx` | `AdvancedComponentsPanel.tsx` | Selection-grid or entry-grid modes |

**Missing field types (roadmap):**

| ID | Field Type | Phase | Notes |
|----|-----------|-------|-------|
| F-023 | `signature` | P2 | See §4 R-010 |
| F-024 | `rating` | P2 | Star rating, NPS slider, Likert scale |
| F-025 | `matrix` | P2 | Row × Column Likert table |
| F-026 | `address` | P2 | Azure Maps autocomplete + structured fields |
| F-027 | `payment` | P3 | Stripe Elements embed |
| F-028 | `formula` | P2 | Read-only computed display field |
| F-029 | `section-repeater` | P2 | Full-section repeating (vs. row-only grid) |
| F-030 | `qr-scanner` | P3 | Mobile camera QR/barcode decode |

---

### 2.2 Form Structure `[DONE]`

**Hierarchy:** `FormDefinition → TabDefinition[] → SectionDefinition[] → FieldDefinition[]`

**Defined in:** `shared/src/types/form.types.ts`

#### FormDefinition

```typescript
interface FormDefinition {
  id: string;                        // Dataverse record GUID
  formCode: string;                  // URL-safe slug, e.g. "loan-application"
  title: string;
  description?: string;
  tabs: TabDefinition[];
  infoCards?: InfoCardDefinition[];  // Pre-form onboarding screens
  showSummaryStep: boolean;          // Render review screen before submit
  confirmationMessage: string;       // Shown post-submit
  draftExpiryDays: number;
  accessGroupId?: string;            // Azure AD group GUID
  design: DesignPayload;             // Theme, layout, CSS overrides
  submissionMappings: SubmissionMapping[];
}
```

#### TabDefinition

```typescript
interface TabDefinition {
  id: string;
  label: string;
  displayOrder: number;
  isVisible: boolean;
  requiresPreviousTabComplete: boolean;
  sections: SectionDefinition[];
}
```

#### SectionDefinition

```typescript
interface SectionDefinition {
  id: string;
  label?: string;
  displayOrder: number;
  isVisible: boolean;
  columnCount: 1 | 2 | 3 | 4;      // CSS grid columns
  isCollapsible: boolean;
  isCollapsedByDefault: boolean;
  fields: FieldDefinition[];
}
```

#### FieldDefinition

```typescript
interface FieldDefinition {
  id: string;
  schemaName: string;               // Key used in fieldValues map
  label: string;
  fieldType: FieldType;
  isRequired: boolean;
  isVisible: boolean;
  isHidden: boolean;                // Hidden from UI but submitted
  isReadonly: boolean;
  columnSpan: 1 | 2 | 3 | 4;
  helpText?: string;
  placeholder?: string;
  defaultValue?: unknown;
  optionSetName?: string;           // CRM option set for dropdown/radio/multiselect
  options?: OptionSetItem[];        // Inline static options
  lookupConfig?: LookupConfig;
  fileUploadConfig?: FileUploadConfig;
  gridColumns?: GridColumnDefinition[];
  businessRules: BusinessRule[];
  validationRules: ValidationRule[];
}
```

---

### 2.3 Business Rules Engine `[DONE]`

**Engine:** `json-rules-engine` wrapper at `frontend/src/engine/RuleEngine.ts`

**Trigger:** 150 ms debounced `useEffect` in `FormContext.tsx` on every `fieldValues` change.

#### Supported Condition Operators

| Operator | Types | Example |
|----------|-------|---------|
| `equals` | any | `status equals "active"` |
| `notEquals` | any | `country notEquals "UK"` |
| `isEmpty` | any | `middleName isEmpty` |
| `isNotEmpty` | any | `attachments isNotEmpty` |
| `greaterThan` | number, date | `age greaterThan 18` |
| `lessThan` | number, date | `loanAmount lessThan 100000` |
| `greaterThanOrEqual` | number, date | |
| `lessThanOrEqual` | number, date | |
| `contains` | string, array | `tags contains "urgent"` |
| `inList` | any | `category inList ["A","B"]` |
| `notInList` | any | |

**Logical combinators:** `all` (AND) and `any` (OR) at the rule level. Nesting is supported via `json-rules-engine` condition groups.

#### Supported Actions

| Action | Description |
|--------|-------------|
| `showField` / `hideField` | Toggle `ruleState.fieldVisibility[fieldId]` |
| `showSection` / `hideSection` | Toggle `ruleState.sectionVisibility[sectionId]` |
| `showTab` / `hideTab` | Toggle `ruleState.tabVisibility[tabId]` |
| `makeRequired` / `makeOptional` | Toggle `ruleState.fieldRequired[fieldId]` |
| `makeReadonly` / `makeEditable` | Toggle `ruleState.fieldReadonly[fieldId]` |
| `setValue` | Set `fieldValues[schemaName]` to a literal value |
| `clearValue` | Set `fieldValues[schemaName]` to `null` |
| `calculateValue` | Evaluate an ExpressionEngine DSL string against current fieldValues |
| `filterOptions` | Narrow option set choices via a condition expression |
| `filterLookup` | Add OData filter to a lookup fetch |
| `validateField` | Attach a runtime validation message |
| `validateForm` | Block submission with a form-level error |

#### ExpressionEngine DSL (used in `calculateValue`)

Located at `frontend/src/engine/ExpressionEngine.ts`. Supported tokens:

```
{fieldSchemaName}           — current value of a field
{fieldSchemaName} + 100     — arithmetic
IF({cond}, {a}, {b})        — ternary
CONCAT({a}, " ", {b})       — string concat
TODAY()                     — current date ISO string
DATEDIFF({a}, {b}, "days")  — integer day difference
ROUND({n}, {decimals})
```

**Missing rule capabilities (roadmap):**

- `R-009` Visual drag-and-drop rule builder (replaces JSON config screens)
- Date arithmetic operators: `within N days of TODAY()`, `after startOf(month)`
- Cross-form lookup: reference another form's submitted values as a condition fact
- Geo-location fact: `userLocation within radius of {lat},{lng}`
- Rule chaining: action of rule A becomes a fact for rule B in same evaluation cycle

---

### 2.4 Validation Engine `[DONE]`

**Engine:** Zod-based at `frontend/src/engine/ValidationEngine.ts`

Validation fires at:
1. Submit click (full form validation)
2. `POST /api/forms/:formCode/validate` (server-side re-validation before CRM write)
3. Business rules can inject runtime errors via `validateField` action

Hidden fields are excluded from all validation passes. This is enforced by
`computeVisibleFieldIds()` in `FormContext.tsx`.

#### Validation Rule Types

| Rule | Config Fields | Notes |
|------|--------------|-------|
| `required` | — | Checked after all hide rules fire |
| `minLength` | `min: number` | String fields |
| `maxLength` | `max: number` | String fields |
| `minValue` | `min: number` | Number / currency / decimal |
| `maxValue` | `max: number` | |
| `email` | — | RFC 5322 |
| `phone` | — | E.164 |
| `regex` | `pattern: string` | Custom regex string |
| `dateBefore` | `date: string \| "today"` | ISO 8601 or `"today"` token |
| `dateAfter` | `date: string \| "today"` | |
| `crossField` | `targetSchemaName`, `operator` | Compare two field values |
| `customExpression` | `expression: string` | Safe ExpressionEngine DSL; must return boolean |

---

### 2.5 Designer `[DONE]`

**Root:** `designer/src/`

#### Screens

| Screen | File | Purpose |
|--------|------|---------|
| Form list | `screens/DesignerScreen.tsx` | Browse, clone, delete forms |
| New form wizard | `screens/NewFormWizardScreen.tsx` | Multi-step form creation |
| Canvas | `designer/canvas/DesignerCanvas.tsx` | Drag-and-drop builder |
| Tab bar | `designer/canvas/TabBar.tsx` | Tab management |
| Section container | `designer/canvas/SectionContainer.tsx` | Section layout + settings |
| Field slot | `designer/canvas/FieldSlot.tsx` | Drag target + selection |
| Properties panel | `designer/properties/PropertiesPanel.tsx` | Right-side panel router |
| Form properties | `designer/properties/FormProperties.tsx` | Title, description, theme, access |
| Section properties | `designer/properties/SectionProperties.tsx` | Columns, collapsible |
| Per-field panels | `designer/properties/panels/*.tsx` | One file per field type |
| Rule config | `screens/RuleConfigScreen.tsx` | Business rule CRUD |
| Rule template editor | `screens/RuleTemplateEditorScreen.tsx` | Reusable rule templates |
| Theme editor | `screens/ThemeEditorScreen.tsx` | Colors, fonts, spacing |
| Option set editor | `screens/OptionSetEditorScreen.tsx` | Manage CRM option sets |
| Lookup config | `screens/LookupConfigScreen.tsx` | Lookup entity + filter config |
| Field label editor | `screens/FieldLabelEditorScreen.tsx` | Bulk label translation (stub) |
| Access policy | `screens/AccessPolicyEditorScreen.tsx` | Azure AD group + roles |
| Submission mapping | `screens/SubmissionMappingScreen.tsx` | Map fields to CRM entities/attributes |
| Publish validation | `screens/PublishValidationScreen.tsx` | Pre-publish checklist |
| Version history | `screens/VersionHistoryScreen.tsx` | View and restore past versions |
| Preview | via iframe | Live form preview in designer |

#### Designer State

State is managed in `designer/src/state/designerStore.ts` (Zustand). The store holds the
full `DesignerFormModel` (an in-memory mirror of `FormDefinition`) and exposes granular
mutators. State is serialized and sent to the backend on Save/Publish via `FormSaveService.ts`.

---

### 2.6 File Upload `[PARTIAL]`

**Control:** `frontend/src/components/forms/controls/FileUploadControl.tsx`
**API:** `frontend/src/api/filesApi.ts`
**Backend:** `backend/src/routes/filesRouter.ts` + `backend/src/services/FileStorageService.ts`

#### Current Behaviour

| Config Key | Default | Notes |
|-----------|---------|-------|
| `maxFiles` | 1 | Per-field maximum file count |
| `maxFileSizeBytes` | 10 MB | Field-level ceiling; backend hard cap 25 MB |
| `allowedMimeTypes` | all | MIME type allowlist |
| `allowedFileExtensions` | all | Numeric CRM option set codes |
| `destination` | `crmNotes` | `crmNotes` or `sharePoint` |
| `sharePointFolder` | — | Relative path within the configured SharePoint library |

Upload flow:
1. User drops file → `react-dropzone` → `FileUploadControl`
2. `POST /api/files/upload` with `multipart/form-data`
3. Backend streams to SharePoint or writes as CRM annotation
4. Returns `UploadedFileReference { fileId, fileName, mimeType, sizeBytes, url }`
5. Reference stored in `fieldValues[schemaName]` as `UploadedFileReference[]`
6. On tab switch remount, `FileUploadControl` re-hydrates from `fieldValues` (fixed 2026-06-14)

**Known gaps:**
- Single-chunk upload only — files > 25 MB always fail (R-022 adds chunked upload)
- No virus scan before storage
- No client-side image compression before upload
- Multer uses in-memory storage — risk of OOM under concurrent large uploads

---

### 2.7 Draft / Save `[PARTIAL]`

**Frontend:** `FormContext.tsx → saveDraft()`, `SaveDraftButton.tsx`
**Backend:** `POST /api/forms/:formCode/draft` (upsert)

#### Draft Payload

```typescript
interface DraftSubmission {
  id?: string;                    // Dataverse draft record GUID (upsert key)
  formDefinitionId: string;
  formCode: string;
  userId: string;                 // Azure AD localAccountId
  userDisplayName: string;
  formData: FormFieldValues;      // Full fieldValues snapshot
  currentTabIndex: number;
  savedAt: string;                // ISO 8601
  expiresAt: string;              // savedAt + draftExpiryDays
  gridSchemaHash?: string;        // Entry Grid invalidation guard
  infoCardViewed?: boolean;
}
```

Resume URL: `/forms/{formCode}?draftId={id}` — loads draft values into `fieldValues` on
mount and skips the info-card phase.

Draft is automatically deleted on successful submission.

**Known gaps:**
- No periodic autosave — user must manually click Save Draft (R-001)
- No session-storage fallback — browser crash loses all unsaved work
- No abandonment recovery email link

---

### 2.8 Summary / Review Step `[DONE]`

Activated when `FormDefinition.showSummaryStep = true`. Rendered by `FormSummary.tsx`.

**Behaviour:**
- Displays all visible tabs / sections / fields in read-only mode
- Shows completion badge: "X of Y required fields answered"
- Renders repeating grid data as mini-table (max 5 rows × 5 columns shown)
- File fields: show filename + size with a link
- Rich text fields: render sanitised HTML
- Edit buttons per tab jump back to that tab index
- Submit button is only on this screen when `showSummaryStep = true`

---

### 2.9 CRM / Dataverse Integration `[DONE]`

**Service layer:** `backend/src/services/CrmSubmissionService.ts`

#### Submission Flow

```
POST /api/forms/:formCode/submit
  │
  ├── ValidationEngine.validateForm()         server-side re-check
  ├── stripHiddenFieldValues()                remove hidden field data
  ├── CrmSubmissionService.submit()
  │     ├── buildParentRecord()               non-child SubmissionMappings
  │     ├── POST /api/data/v9.2/{entitySet}   create parent in Dataverse
  │     ├── buildChildRecords()               child SubmissionMappings
  │     ├── BatchChangesetBuilder             OData $batch for children
  │     ├── CrmAuditService.logSubmission()   append-only audit entry
  │     └── triggerPowerAutomate()            fire-and-forget flow (optional)
  └── return { referenceNumber }
```

#### Submission Mapping

Each `SubmissionMapping` record (stored in CRM) maps a `FieldDefinition.schemaName` to:
- `targetEntity`: CRM entity logical name
- `targetAttribute`: attribute schema name
- `isParent`: whether this mapping writes to the parent record
- `relationship`: if `isParent = false`, the relationship name linking to parent

---

### 2.10 Authentication & Access Control `[DONE]`

**Frontend:** `@azure/msal-browser` with `PublicClientApplication`, session-storage token cache.

**Backend:** `backend/src/middleware/authMiddleware.ts` — validates Bearer JWT signed by
Azure AD using `jsonwebtoken` + JWKS endpoint.

#### Access Control

| Level | Mechanism |
|-------|-----------|
| Form-level | `FormDefinition.accessGroupId` — user must be member of Azure AD group |
| Role-based | `AccessPolicyService` — per-form roles: `view`, `draft`, `submit` |
| Admin endpoints | Require `CRMAdmin` role claim in JWT |

---

### 2.11 Mobile (React Native) `[PARTIAL]`

**Root:** `mobile/`
**Framework:** React Native + Expo SDK | **Routing:** Expo Router (file-system)
**Form state:** `react-hook-form` + `MobileFormContext` | **Build:** EAS Build (config incomplete — see TD-009)

---

#### 2.11.1 Project Structure

```
mobile/
├── app/                            ← Expo Router file-system routes
│   ├── _layout.tsx                 ← Root layout: DevBypassProvider + MsalProvider + Stack
│   ├── index.tsx                   ← Login screen (route "/")
│   └── forms/
│       ├── _layout.tsx             ← Auth guard: redirects to "/" if no account & !isDevBypass
│       ├── index.tsx               ← Form list screen
│       └── [id].tsx                ← Form renderer screen (formCode = route param)
├── src/
│   ├── auth/
│   │   └── MsalProvider.tsx        ← Custom PKCE auth (expo-auth-session, NOT msal-react-native)
│   ├── components/
│   │   ├── FormRenderer.tsx        ← Top-level form orchestrator (tab navigation, phase machine)
│   │   ├── FormSummaryScreen.tsx   ← Pre-submit review screen
│   │   ├── fields/
│   │   │   ├── FieldRenderer.tsx   ← Switch-router for field type → component
│   │   │   └── Form*.tsx           ← 21 field component files (see §2.11.4)
│   │   └── info-card/
│   │       ├── InfoCardFlow.tsx
│   │       ├── InfoCardScreenView.tsx
│   │       ├── InfoCardNavBar.tsx
│   │       ├── InfoCardSectionRenderer.tsx
│   │       ├── InfoCardIcon.tsx
│   │       └── sections/           ← DownloadListSection, IconListSection, NumberedStepsSection
│   ├── context/
│   │   ├── MobileFormContext.tsx   ← Rule evaluation context (wraps react-hook-form control)
│   │   ├── DevBypassContext.tsx    ← Dev-mode login skip
│   │   └── LocaleContext.tsx       ← en/ar locale + RTL flag (built but NOT wired — see TD-010)
│   ├── services/
│   │   ├── apiClient.ts            ← fetch wrapper (GET/POST/DELETE + auth header)
│   │   ├── FormService.ts          ← Form list, definition, submit, draft, offline sync
│   │   ├── NetworkMonitor.ts       ← @react-native-community/netinfo online/offline state
│   │   ├── OfflineCache.ts         ← AsyncStorage form definition + list cache
│   │   └── PendingSubmissionQueue.ts ← AsyncStorage queue for offline submissions
│   ├── registry/
│   │   └── ComponentRegistry.ts   ← Escape hatch for custom field types
│   ├── mock/
│   │   └── forms.ts               ← Mock FormDefinition data (NOT wired to dev bypass — TD-011)
│   ├── utils/
│   │   └── buildValidationRules.ts ← Maps FieldDefinition → react-hook-form rules object
│   ├── config/
│   │   └── appConfig.ts           ← Runtime config (apiBaseUrl, clientId, tenantId, scopes)
│   └── logger.ts                  ← Structured logger (wraps console in dev, no-op in prod)
├── app.json                        ← Expo config (slug, scheme, plugins, bundle IDs)
├── app.config.js                   ← Extends app.json; loads .env.local via dotenv
└── __tests__/                     ← 8 test files
```

---

#### 2.11.2 Navigation

Expo Router file-system routing. The screen stack is:

```
/              → Login screen
/forms         → Auth-guarded layout → Form list
/forms/[id]    → Form renderer (id = formCode)
```

`app/forms/_layout.tsx` is the auth gate: if `!account && !isDevBypass`, it calls
`router.replace('/')`. The root `_layout.tsx` renders `<Stack screenOptions={{ headerShown: false }} />`
with providers: `DevBypassProvider → MsalProvider → Stack`.

**Missing screens (all gaps):**

| Screen | Route | Status |
|--------|-------|--------|
| My Submissions (submission history) | `/submissions` | Not built — RM-001 |
| Draft Resume | `/forms/[id]?draftId=` | Route exists, loading not wired — RM-002 |
| Pending Offline Queue | `/sync-status` | Not built — RM-003 |
| Settings / Sign Out | `/settings` | Not built — RM-004 |

---

#### 2.11.3 State Management

Mobile does **not** reuse the web `FormContext`. It has its own `MobileFormContext`
plus `react-hook-form`.

**`react-hook-form`** (`useForm`, `mode: 'onBlur'`) drives all field value reads and writes
in `FormRenderer.tsx`. `defaultValues` are built by iterating all tabs/sections/fields
at form load time using `field.defaultValue ?? null`.

**`MobileFormContext`** (`src/context/MobileFormContext.tsx`) wraps the rendered form and
provides rule evaluation results to child components:

```typescript
// What MobileFormContext exposes
interface MobileFormContextValue {
  form: FormDefinition;
  ruleState: RuleEvaluationResult;   // visibility, required, readonly, calculated maps
  locale: string;
}
```

Internally it calls `useWatch({ control })` to observe all field values, then runs the
shared `@qdb/shared` `RuleEngine` on a 150 ms debounce — same engine as the web frontend.
`setValue` is called for `calculateValue` actions and to clear hidden field values.

`LocaleContext` (`src/context/LocaleContext.tsx`) persists locale preference to
`AsyncStorage` and exposes `{ locale, isRtl, setLocale }`. It is **fully built but not
mounted in `_layout.tsx`** — RTL support is dead code until TD-010 is resolved.

---

#### 2.11.4 Field Components

All 21 field components live in `src/components/fields/`. Every component follows
the same interface:

```typescript
interface FieldComponentProps {
  field: FieldDefinition;
  control: Control<Record<string, unknown>>;
  // some fields extend with:
  accessToken?: string;        // LookupField, FileField (API calls)
  isTabActive?: boolean;       // InteractiveGridField (lazy load)
  keyboardType?: KeyboardType; // TextField
}
```

Every component wraps its input in `react-hook-form` `<Controller>`:

```typescript
<Controller
  name={field.fieldKey}
  control={control}
  rules={buildValidationRules(field)}  // maps FieldDefinition.validationRules → RHF rules
  render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => (
    // native input here
  )}
/>
```

**Field component map:**

| Field Type | Component File | Key Native Dependency |
|-----------|---------------|----------------------|
| `text` | `FormTextField.tsx` | `TextInput` |
| `textarea` | `FormTextAreaField.tsx` | `TextInput` (multiline) |
| `email` | `FormTextField.tsx` | `keyboardType='email-address'` |
| `phone` | `FormTextField.tsx` | `keyboardType='phone-pad'` |
| `number` | `FormNumericField.tsx` | `TextInput`, numeric parse |
| `decimal` | `FormNumericField.tsx` | decimal mode |
| `currency` | `FormNumericField.tsx` | currency prefix render |
| `date` | `FormDateField.tsx` | `@react-native-community/datetimepicker` |
| `datetime` | `FormDateField.tsx` | two-step date→time on Android |
| `checkbox` | `FormCheckboxField.tsx` | `Checkbox` (RN Paper) |
| `checkboxgroup` | `FormCheckboxGroupField.tsx` | mapped option list |
| `radio` | `FormRadioField.tsx` | option list with selection |
| `radiocard` | `FormRadioCardField.tsx` | card-grid layout |
| `dropdown` | `FormDropdownField.tsx` | `Picker` or modal sheet |
| `multiselect` | `FormDropdownField.tsx` | multi-select mode |
| `lookup` | `FormLookupField.tsx` | debounced API search + FlatList |
| `file` | `FormFileField.tsx` | `expo-document-picker`, `expo-image-picker` |
| `richtext` | `FormRichTextField.tsx` | `react-native-render-html` (read-only) |
| `repeatinggrid` | `FormRepeatingGridField.tsx` | custom row editor |
| `boolean` | `FormBooleanField.tsx` | `Switch` or radio pair |
| `infocard` | `FormInfoCardField.tsx` | display-only card |
| `interactivegrid` | `FormInteractiveGridField.tsx` / `FormSelectionGridField.tsx` / `FormEntryGridField.tsx` | mode-dispatched |

`FieldRenderer.tsx` reads `ruleState` from `MobileFormContext`, computes the effective
field (applying visibility/required/readonly overrides), and dispatches to the correct
component. It also checks `ComponentRegistry` for `fieldType: 'custom'` before falling
through to the built-in map.

---

#### 2.11.5 Auth Flow

**File:** `src/auth/MsalProvider.tsx`

Despite the file name, this is a **custom OAuth 2.0 PKCE implementation** using
`expo-auth-session` — it does NOT use the `@azure/msal-react-native` package.

```
signIn()
  ├── Generate PKCE code_verifier + code_challenge (SHA-256)
  ├── promptAsync()                        ← opens system browser via expo-web-browser
  ├── response.type === 'success'
  │     └── exchangeCodeForTokens(code, verifier)
  │           ├── POST to Azure AD token endpoint
  │           └── { access_token, refresh_token, id_token }
  ├── parseJwt(id_token)                   ← base64 decode; extracts oid, name, email
  ├── SecureStore.setItem('qdb_access_token', ...)
  ├── SecureStore.setItem('qdb_refresh_token', ...)
  └── SecureStore.setItem('qdb_account_info', JSON.stringify(account))

acquireToken()
  ├── SecureStore.getItem('qdb_access_token')
  ├── [NO exp check — see TD-012]
  ├── if token present → return it directly
  └── else → AuthSession.refreshAsync() → re-persist → return new token

restoreSession()  ← called on MsalProvider mount
  └── reads all three SecureStore keys → restores account state

signOut()
  └── SecureStore.deleteItemAsync() × 3 → clears account state
```

**Config** (from `appConfig.ts`):
- `clientId`: Azure AD app registration for the mobile app
- `tenantId`: Azure AD tenant
- `scopes`: `[api://{backendClientId}/access_as_user, openid, profile, offline_access]`
- `redirectUri`: `AuthSession.makeRedirectUri({ scheme: 'qdbforms' })`

---

#### 2.11.6 API Client

**File:** `src/services/apiClient.ts`

```typescript
// All calls include:
headers: {
  'Authorization': `Bearer ${accessToken}`,
  'X-Client-Platform': 'mobile',
  'Accept-Language': locale,             // from LocaleContext (when wired)
}

// Error model
class ApiError extends Error {
  constructor(public statusCode: number, message: string) { ... }
}
```

All responses are unwrapped from `response.json().data` by `handleResponse()`.
Non-2xx responses throw `ApiError`. Network failures throw a plain `Error`.

---

#### 2.11.7 Form Loading & Offline Cache

**File:** `src/services/FormService.ts`

```
listForms(token, locale?)
  ├── isOnline() ? apiGet('/api/forms') : OfflineCache.getFormList()
  └── maps BackendFormSummary[] → FormListItem[]
      [KNOWN GAP] hasDraft always hardcoded false — see TD-013

getFormDefinition(formCode, token, locale?)
  ├── isOnline() ? apiGet('/api/forms/{formCode}/metadata') → OfflineCache.saveFormDefinition()
  └── else → OfflineCache.getFormDefinition(formCode)
      [Cache TTL: 7 days]

submitForm(formCode, formData, token)
  ├── isOnline() ? apiPost('/api/forms/{formCode}/submit')
  └── else → PendingSubmissionQueue.enqueue({ formCode, formData, enqueuedAt })
      Returns 'submitted' | 'queued'

saveDraft(formCode, formData, tabIndex, token, infoCardViewed?)
  └── apiPost('/api/forms/{formCode}/draft', { formData, currentTabIndex, ... })

syncPendingSubmissions(token)
  └── drains PendingSubmissionQueue, submits each, removes on success
      [No UI to trigger or display sync status — see RM-003]
```

---

#### 2.11.8 File Upload on Mobile `[PARTIAL]`

**File:** `src/components/fields/FormFileField.tsx`

Files are picked via `expo-document-picker` or `expo-image-picker` (camera mode when
`field.allowCamera = true`). iOS shows an `ActionSheet`; Android shows an `Alert` for
camera vs. library choice.

The picked file is stored as a `PickedFile` object in `react-hook-form` state:

```typescript
interface PickedFile {
  uri: string;        // local file URI (e.g. file:///var/mobile/...)
  name: string;
  size?: number;
  mimeType?: string;
}
```

**Critical gap:** The file is never uploaded at pick time. On submit, `formData` is
serialized as JSON via `apiPost` — binary content cannot be transmitted this way.
The backend receives the `uri` string, not the file bytes. **File upload is effectively
broken on mobile.** Fix is tracked as TD-014 and RM-005.

---

#### 2.11.9 InfoCardFlow on Mobile `[DONE]`

`src/components/info-card/InfoCardFlow.tsx` implements the same pre-form onboarding flow
as the web. Screens are sorted by `displayOrder`. Navigation is internal index state
(not Expo Router navigation — the flow lives inside the form renderer screen).

On mount, fires `POST /api/forms/{formCode}/info-card-viewed` (fire-and-forget).
Skip is shown only when `formDefinition.allowInfocardSkip = true`.

Three section types are supported:
- `NumberedStepsSection` — ordered step list with icons
- `IconListSection` — bulleted list with inline icons
- `DownloadListSection` — list of downloadable file links

---

#### 2.11.10 Summary Screen `[DONE]`

**File:** `src/components/FormSummaryScreen.tsx`

```typescript
interface FormSummaryScreenProps {
  form: FormDefinition;
  values: Record<string, unknown>;
  isSubmitting: boolean;
  onBack: () => void;
  onEditTab: (tabIndex: number) => void;
  onSubmit: () => void;
}
```

Behaviour matches the web `FormSummary`:
- Counts `requiredFilled` / `requiredTotal` — Submit is disabled until all required fields
  are filled
- Renders per-tab blocks; skips tabs with zero non-empty values
- Each tab block has an "Edit" button
- `formatFieldValue` handles all types: grid (up to 5 rows × 4 cols table), file (name +
  size), richtext (strips HTML tags), currency (`Intl.NumberFormat`), date (locale string)

---

#### 2.11.11 Dev Bypass / Test Mode

**File:** `src/context/DevBypassContext.tsx`

`enableDevBypass()` sets `isDevBypass = true` (session memory only — not persisted).
Login screen shows "Skip login (Dev mode)" only when `__DEV__ === true`.
The auth guard in `app/forms/_layout.tsx` allows navigation when `isDevBypass` even with
no MSAL account.

**Known gap (TD-011):** `src/mock/forms.ts` defines mock form data but `FormService`
always calls the real API even when `isDevBypass = true`. Developers still need a running
backend to test the mobile app. The fix is to short-circuit `FormService.listForms()` and
`FormService.getFormDefinition()` when `isDevBypass`.

---

#### 2.11.12 Build Configuration

**`app.json`:** Expo config
- Slug: `qdb-forms` | Scheme: `qdbforms`
- Bundle ID: `com.qdb.formengine` (iOS + Android)
- Expo plugins: `expo-router`, `expo-secure-store`, `expo-image-picker`,
  `expo-document-picker`, `@react-native-community/datetimepicker`, `expo-web-browser`
- iOS: camera + photo library usage descriptions in `infoPlist`

**`app.config.js`:** Extends `app.json`. Loads `.env.local` via `dotenv` (optional file,
not committed). `apiBaseUrl` priority:
1. `API_BASE_URL` shell env var
2. `.env.local` `API_BASE_URL`
3. Hardcoded fallback: `http://192.168.1.14:4000`

**`eas.json`:** Does not exist — EAS Build profiles (development / preview / production)
have not been configured. The `extra.eas.projectId` in `app.json` is still
`REPLACE_WITH_EAS_PROJECT_ID`. Mobile builds must be run with `expo run:ios` /
`expo run:android` locally. Tracked as TD-009.

---

#### 2.11.13 Mobile-Specific Known Gaps

| ID | Gap | Risk | Roadmap Item |
|----|-----|------|-------------|
| TD-009 | `eas.json` missing; EAS project ID is placeholder | Cannot produce production builds | RM-006 |
| TD-010 | `LocaleContext` built but not mounted in `_layout.tsx` | RTL / Arabic is dead code | RM-007 |
| TD-011 | Mock data not wired to dev bypass — always calls live API | Developer experience | RM-008 |
| TD-012 | `acquireToken()` returns cached token without checking `exp` claim | Silent 401 errors after token expiry | RM-009 |
| TD-013 | `hasDraft: false` hardcoded in `mapFormSummaryToListItem` | Draft badge never shows | RM-010 |
| TD-014 | File upload sends local URI string in JSON — binary bytes never reach server | File upload broken on mobile | RM-005 |
| TD-015 | No draft resume screen — `draftId` query param not handled by `[id].tsx` | Draft save exists, resume impossible | RM-002 |
| TD-016 | `PendingSubmissionQueue.syncPendingSubmissions()` has no UI | Offline submissions silently queue; user cannot see or trigger sync | RM-003 |
| TD-017 | No sign-out or settings screen | Users cannot switch accounts | RM-004 |
| TD-018 | `FormEntryGridField` and `FormRepeatingGridField` dispatch overlap in `FieldRenderer` | Unclear which component handles `grid` mode in which case | Verify + document |

---

### 2.12 Backend API `[DONE]`

**Base URL:** `/api`
**Framework:** Fastify + Prisma
**Auth required on all routes** unless noted.

#### Forms

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/forms` | List all form definitions |
| `GET` | `/forms/:formCode/metadata` | Full `FormDefinition` + `DesignPayload` |
| `GET` | `/forms/:formCode/data/:recordId` | Prefill data for edit mode (IDOR-protected) |
| `POST` | `/forms/:formCode/validate` | Server-side validation without submit |
| `POST` | `/forms/:formCode/submit` | Full submission → CRM write |
| `POST` | `/forms/:formCode/draft` | Upsert draft |
| `GET` | `/forms/:formCode/draft/:draftId` | Load a saved draft |
| `DELETE` | `/forms/:formCode/draft/:draftId` | Delete draft |
| `POST` | `/forms/:formCode/clone` | Clone form definition |
| `GET` | `/forms/:formCode/versions` | Version history |
| `POST` | `/forms/:formCode/versions/:versionId/restore` | Restore a version |

#### Files

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/files/upload` | Upload file; returns `UploadedFileReference` |
| `DELETE` | `/files/:fileId` | Delete uploaded file |

#### Dynamic Data

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/options/:optionSetName` | CRM option set values |
| `GET` | `/lookups/:entityName` | Type-ahead lookup search (`?q=`, `?filter=`) |
| `GET` | `/grids/:gridName` | Interactive grid data source |

#### Admin

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/admin/cache/invalidate` | Flush form definition cache |
| `GET` | `/admin/info-cards` | List info card records |
| `POST` | `/admin/info-cards` | Create info card |
| `PUT` | `/admin/info-cards/:id` | Update info card |
| `DELETE` | `/admin/info-cards/:id` | Delete info card |

---

### 2.13 Recent Feature Enhancements (2026-07) `[DONE]`

Five enhancements shipped in July 2026. **New Dataverse columns at a glance:**

| # | Feature | New columns | Entity |
|---|---------|-------------|--------|
| 1 | Grid lookup binding fix | *(none — runtime fix)* | — |
| 2 | Info-card display inside grid | `qdb_grid_data_source`, `qdb_grid_json_data`, `qdb_grid_display_mode`, `qdb_grid_selectable`, `qdb_grid_card_icon`, `qdb_grid_card_layout` | `qdb_form_field` |
| 3 | File-upload column inside grid | *(none — new `file` value on the existing `qdb_column_field_type`)* | `qdb_grid_column_config` |
| 4 | Conditional buttons (show/hide + enable/disable) | `qdb_visible_conditions_json`, `qdb_enabled_conditions_json` | `qdb_form_scoped_button` |
| 5 | Submit-confirmation gate | `qdb_submit_confirmation_label`, `qdb_submit_confirmation_message` | `qdb_form_definition` |

All columns are additive and idempotently provisioned via `scripts/provision-*.mjs`. **Two form-JSON generators exist** — the Node backend (`CrmMetadataService`, local dev / middle-tier) and the **C# plugin (`FormJsonGenerator`, the in-CRM path via render cache)** — any new form config must be mapped in BOTH.

#### 2.13.1 Interactive Grid — Lookup Column Resolution Fix

Lookup columns rendered blank because the grid resolved cell values by exact schema-name key (`row[qdb_serviceref]`), but the Web API returns lookups under `_{schema}_value` (GUID) and `_{schema}_value@OData.Community.Display.V1.FormattedValue` (friendly name).
- **Fix:** `resolveRecordDisplayValue` helper (formatted name → direct value → raw lookup GUID, null-safe) in `frontend/.../fields/SelectionGridField.tsx`, applied at table-cell and card bindings. Non-lookup fields keep the direct-key path.
- **New fields:** none (pure runtime fix). Commit `9c8480fc`.

#### 2.13.2 Interactive Grid — Info-Card Display + JSON Data Source (DFE-GRIDSRC-001)

A selection grid can source rows from an **Entity or static JSON**, render as **Columns or a rich InfoCard** (grid or row layout), and be **selectable or read-only** — all designer-configurable with user-defined columns.
- **Model (`GridFieldConfig`):** `dataSource: 'entity'|'json'`, `jsonData` (static array string), `displayMode: 'columns'|'infocard'`, `cardLayout: 'grid'|'row'`, `selectable` (false = read-only), `cardIconName`.
- **Runtime:** `SelectionGridField.tsx` (`parseJsonGridRecords`, view-mode toggle, rich info-card body). **Designer:** `InteractiveGridFieldPanel.tsx`. **Backend:** `CrmMetadataService` maps the 6 columns into `gridConfig`.
- **New fields:** 6 on `qdb_form_field` (see table). Commits `53bf14c0`…`3e7441fe`.

#### 2.13.3 Interactive Grid — File-Upload Column (DFE-GRIDFILE)

An entry grid column can be a **document upload** (one file per cell), reusing `filesApi.upload`.
- **Runtime:** `EntryGridCell` `'file'` case (`GridFileCell`); summary shows the filename. **Designer:** column-type option `File`. Rows are JSON-serialised on submit — backend unchanged.
- **New fields:** none — a new `file` value on the existing `qdb_column_field_type` (grid column config). Commit `306315e7`.

#### 2.13.4 Conditional Buttons — Show/Hide + Enable/Disable (DFE-CBTN-001)

Scoped buttons (tab/section) can **show/hide** and **enable/disable** based on live field values, configured per-button in the designer. Two independent condition sets (`visibleWhen`/`enabledWhen`), each `{ conditions: RuleCondition[]; logic: 'AND'|'OR' }`, evaluated by the existing `RuleEngine`. No conditions ⇒ static `isVisible`/`isActive` (legacy).
- **Runtime:** `RuleEngine.evaluateButtons` + `FormContext` + `ScopedButtonBar` (render iff `effectiveVisible && (effectiveEnabled || hasEnabledWhen)`; disabled ⇒ `aria-disabled`). **Designer:** condition builders + pre-write validation (`ScopedButtonsPanel`, `ScopedButtonDesignService`). **C# plugin:** `FormJsonGenerator.BuildScopedButton` maps the columns into the published blob (required for in-CRM). `RuleCondition.fieldId` = field **schema name**.
- **New fields:** 2 on `qdb_form_scoped_button` (see table). Commits `233445b6`, `80a247d3`.

#### 2.13.5 Submit-Confirmation Gate (DFE-SUBMITCONFIRM-001)

A config-driven acknowledgement gate on the summary/submit step: an **acknowledgement checkbox** must be ticked before **Submit** is enabled; on submit a **confirmation dialog** is shown.
- **Model (`FormDefinition`):** `submitConfirmation?: { label, message }`. **Runtime:** `SubmitButton` gate (checkbox + dialog) in the summary step. **Designer:** Properties-panel fields. Absent config ⇒ no gate (legacy).
- **New fields:** `qdb_submit_confirmation_label` (String 200), `qdb_submit_confirmation_message` (Memo 2000) on `qdb_form_definition`. Commits `5b5477cc`, `8892dfdc`, `9b9ff296`, `1a7361ab`.

**Also shipped in the same window (not among the 5 above):** tab **header/footer field placement** (DFE-TABZONE-001 — `qdb_placement` + a field→tab lookup on `qdb_form_field`); standalone **Info Card field** rendering JSON rows with icon+label; and the **`@qdb/shared` ESM migration** (`03b21faa`, infra fix so the Node backend boots).

---

## 3. Roadmap — Phase 1: Table Stakes

Target window: **0–3 months**. These are blockers for enterprise procurement.

---

### R-001 — Periodic Auto-Save `[PLANNED-P1]`

**Problem:** Users lose all unsaved work on browser crash, session timeout, or accidental
navigation. Manual `SaveDraftButton` exists but is not enough.

**Implementation:**

Add a `useInterval` hook to `FormContext.tsx`:

```typescript
// frontend/src/contexts/FormContext.tsx
const AUTO_SAVE_INTERVAL_MS = 30_000;

useEffect(() => {
  if (!isDirty || isSubmitting || !draftId && !formDefinition) return;
  const timer = setInterval(() => {
    void saveDraft();
  }, AUTO_SAVE_INTERVAL_MS);
  return () => clearInterval(timer);
}, [isDirty, isSubmitting, saveDraft, formDefinition, draftId]);
```

Additionally, add a `sessionStorage` fallback that snapshots `fieldValues` on every change
(debounced 2 s) so a hard refresh without a saved draft still recovers partial work:

```typescript
// Write on change (debounced)
sessionStorage.setItem(`dfe_draft_${formCode}`, JSON.stringify(fieldValues));

// Read on mount (before API load completes)
const localSnapshot = sessionStorage.getItem(`dfe_draft_${formCode}`);
```

**Files to change:**
- `frontend/src/contexts/FormContext.tsx` — add interval + sessionStorage write
- `frontend/src/components/forms/SaveDraftButton.tsx` — show "Auto-saved N min ago" label
- `frontend/src/hooks/useInterval.ts` — new utility hook

**Acceptance criteria:**
- Form auto-saves every 30 s when `isDirty = true`
- `SaveDraftButton` shows "Auto-saved 1 min ago" after the background save
- A hard page refresh recovers field values from sessionStorage until the API draft loads
- Auto-save does not fire during `isSubmitting`

---

### R-002 — Notification System `[PLANNED-P1]`

**Problem:** No email, Teams, or SMS notification is sent on form submission. Approvers
have no trigger; submitters get only the in-page confirmation.

**Implementation:**

Add `NotificationService` to the backend:

```typescript
// backend/src/services/NotificationService.ts
interface NotificationConfig {
  onSubmit: NotificationTarget[];
  onApproval?: NotificationTarget[];
}

interface NotificationTarget {
  channel: 'email' | 'teams';
  recipients: string[];       // email addresses or Teams channel webhook URL
  templateId: string;         // Dataverse qdb_notification_template record ID
}
```

Templates are stored in a new Dataverse entity `qdb_notification_template` with
`qdb_subject` (text) and `qdb_body` (HTML) fields. Template variables use `{{fieldSchemaName}}`
tokens resolved at send time from `fieldValues`.

**Email delivery:** Microsoft Graph API `POST /v1.0/me/sendMail` using the app registration's
`Mail.Send` permission (application permission, not delegated).

**Teams delivery:** Adaptive Card posted to a configured incoming webhook URL.

Notification config is stored on the `qdb_form_definition` record as a JSON field
`qdb_notification_config`. The designer exposes a Notifications tab in Form Properties.

**Files to add:**
- `backend/src/services/NotificationService.ts`
- `backend/src/services/NotificationTemplateService.ts`
- `designer/src/designer/properties/panels/NotificationsPanel.tsx`
- CRM: new entity `qdb_notification_template`

**Files to change:**
- `backend/src/services/CrmSubmissionService.ts` — call `NotificationService.sendOnSubmit()` after successful CRM write
- `shared/src/types/form.types.ts` — add `notificationConfig` to `FormDefinition`

---

### R-003 — Multi-Language / i18n Support `[PLANNED-P1]`

**Problem:** All labels, error messages, hint text, and UI strings are English-only. Blocks
any non-English deployment.

**Architecture decision:** Labels are stored in a translation map on the form definition,
not in i18n files. This allows form owners to translate via the designer without a developer.

```typescript
// shared/src/types/form.types.ts
interface LocaleMap {
  [locale: string]: string;   // e.g. { "en": "Full Name", "ar": "الاسم الكامل" }
}

// FieldDefinition extension
interface FieldDefinition {
  ...
  labelLocales?: LocaleMap;
  helpTextLocales?: LocaleMap;
  placeholderLocales?: LocaleMap;
}

// FormDefinition extension
interface FormDefinition {
  ...
  titleLocales?: LocaleMap;
  descriptionLocales?: LocaleMap;
  confirmationMessageLocales?: LocaleMap;
  supportedLocales: string[];          // e.g. ["en", "ar", "fr"]
  defaultLocale: string;
}
```

**Runtime resolution:** A `useLocale()` hook reads `navigator.language` (or a URL param
`?locale=ar`) and resolves the correct string at render time. RTL is toggled by setting
`dir="rtl"` on `<html>` when locale is Arabic / Hebrew.

**System UI strings** (validation messages, button labels) are translated via a
`messages/{locale}.json` file bundle loaded at startup.

**Files to add:**
- `frontend/src/hooks/useLocale.ts`
- `frontend/src/i18n/messages/en.json`
- `frontend/src/i18n/messages/ar.json`
- `designer/src/screens/FieldLabelEditorScreen.tsx` — already stubbed, needs implementation

**Files to change:**
- `shared/src/types/form.types.ts` — add locale maps
- All control components — replace `field.label` with `resolveLabel(field, locale)`
- `frontend/src/engine/ValidationEngine.ts` — localize error message strings

---

### R-004 — CAPTCHA / Bot Protection `[PLANNED-P1]`

**Problem:** Public-facing forms have zero bot protection. Automated submissions pollute
CRM data and consume API quota.

**Choice:** Cloudflare Turnstile (privacy-friendly, no image puzzles, free tier).

**Implementation:**

Frontend: add `@marsidev/react-turnstile` package. Render the widget in `SubmitButton.tsx`.
On solve, store the token in a ref. Pass token in the submit request body as
`cfTurnstileToken`.

Backend: `POST /api/forms/:formCode/submit` validates the token via Cloudflare's siteverify
API before any business logic runs:

```typescript
// backend/src/middleware/captchaMiddleware.ts
async function verifyCaptcha(token: string): Promise<boolean> {
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: JSON.stringify({ secret: process.env.CF_TURNSTILE_SECRET, response: token }),
    headers: { 'Content-Type': 'application/json' },
  });
  const result = await response.json() as { success: boolean };
  return result.success;
}
```

CAPTCHA is **opt-in per form** (`FormDefinition.captchaEnabled: boolean`). Disable for
internal-only forms accessed behind Azure AD login (they already have auth protection).

**Files to add:**
- `backend/src/middleware/captchaMiddleware.ts`

**Files to change:**
- `frontend/src/components/forms/SubmitButton.tsx` — embed Turnstile widget
- `backend/src/routes/formsRouter.ts` — apply captchaMiddleware before submit handler
- `shared/src/types/form.types.ts` — add `captchaEnabled` to `FormDefinition`

---

### R-005 — PDF Receipt Generation `[PLANNED-P1]`

**Problem:** No PDF receipt is generated post-submission. Required for legal, compliance,
and record-keeping purposes.

**Implementation:**

Use `@react-pdf/renderer` on the **backend** (Node.js) to generate a PDF server-side.
The same `FormDefinition` model drives the PDF layout, so field order and labels always
match the form the user saw.

```typescript
// backend/src/services/PdfReceiptService.ts
async function generateReceipt(
  definition: FormDefinition,
  fieldValues: FormFieldValues,
  submissionRef: string,
): Promise<Buffer>
```

The PDF is generated immediately after a successful CRM write, then:
1. Uploaded to SharePoint as a versioned document (`/Receipts/{formCode}/{referenceNumber}.pdf`)
2. Attached to the parent CRM record as an annotation
3. URL returned in the submit response so the frontend can offer a download link

**PDF layout structure:**
- Header: form title, logo (from `DesignPayload`), submission reference, date/time
- Per-tab sections with field label + value pairs
- Footer: "Generated by {organisation}" + page numbers

**Files to add:**
- `backend/src/services/PdfReceiptService.ts`
- `backend/src/components/pdf/FormReceiptDocument.tsx` (react-pdf component)

**Files to change:**
- `backend/src/services/CrmSubmissionService.ts` — call `PdfReceiptService` after CRM write
- `frontend/src/components/forms/FormConfirmation.tsx` — show download link if PDF URL returned

---

### R-006 — PII Field Marking `[PLANNED-P1]`

**Problem:** No mechanism to identify which fields contain personally identifiable
information. Required for GDPR Article 30, data subject access requests, and right-to-erasure.

**Implementation:**

Add `isPii: boolean` and `piiCategory: PiiCategory | undefined` to `FieldDefinition`.

```typescript
type PiiCategory =
  | 'name'
  | 'email'
  | 'phone'
  | 'national-id'
  | 'financial'
  | 'health'
  | 'address'
  | 'biometric';
```

**Effects of marking a field as PII:**
1. `CrmAuditService` writes `[REDACTED]` for the value (never logs the actual data)
2. `NotificationService` excludes PII fields from email template tokens
3. `PdfReceiptService` can optionally mask PII fields (configured per form)
4. A `GET /api/admin/forms/:formCode/pii-report` endpoint lists all PII fields
   and their CRM attribute mappings for the Data Protection Officer

**Files to change:**
- `shared/src/types/form.types.ts` — add `isPii`, `piiCategory` to `FieldDefinition`
- `designer/src/designer/properties/panels/TextFieldPanel.tsx` (and all other panels) —
  add PII toggle + category selector
- `backend/src/services/CrmAuditService.ts` — mask PII fields in log writes
- `backend/src/routes/adminRouter.ts` — add PII report endpoint

---

### R-007 — Duplicate Submission Detection `[PLANNED-P1]`

**Problem:** The same user can submit the same form multiple times without any warning.

**Implementation:**

Generate an idempotency key on the backend:

```typescript
const idempotencyKey = crypto
  .createHash('sha256')
  .update(`${userId}:${formDefinitionId}:${JSON.stringify(keyFieldValues)}`)
  .digest('hex');
```

`keyFieldValues` is a subset of fields marked `isIdempotencyKey: boolean` in
`FieldDefinition`. If no fields are marked, the key is just `userId + formDefinitionId`.

The key is checked against a `qdb_submission_idempotency` CRM entity before writing.
If a matching key exists and `submission_status = 'submitted'`, the backend returns
HTTP 409 with a `duplicateSubmission: true` flag and the original reference number.

The frontend shows a user-friendly message: "You have already submitted this form
(Reference: {ref}). Contact support if you need to submit again."

---

### R-008 — Submission Export to Excel/CSV `[PLANNED-P1]`

**Problem:** Form owners cannot extract submission data without CRM access.

**Implementation:**

```
GET /api/admin/forms/:formCode/submissions/export
  ?format=xlsx|csv
  &from=2026-01-01
  &to=2026-06-30
  &status=submitted|draft
```

Backend uses `exceljs` to build the workbook:
- Row 1: header row (field labels from `FormDefinition`)
- Rows 2+: one row per submission, columns aligned to field schema names
- PII columns are included but marked with a yellow fill in the XLSX header

CRM query uses OData `$select` (only required columns) and `$filter` (date range, status)
to avoid loading full records. Pagination via `$top`/`$skip` for large result sets.

Response is streamed — not buffered in memory — using `exceljs` streaming workbook API.

**Files to add:**
- `backend/src/services/SubmissionExportService.ts`
- `backend/src/routes/adminRouter.ts` — add export route

---

## 3b. Roadmap — Phase 1: Mobile Bug Fixes (0–3 months)

These are not new features — they are existing gaps and broken behaviour in the mobile
app that must be fixed alongside the web Phase 1 work.

---

### RM-002 — Draft Resume on Mobile `[PLANNED-P1]`

**Problem:** `saveDraft` API is implemented and works. The form list shows a "Draft saved"
badge (once TD-013 is fixed). But tapping a draft-enabled form loads a blank form instead
of resuming where the user left off.

**Implementation:**

`app/forms/[id].tsx` must read `draftId` from `useLocalSearchParams()` and call a new
`FormService.getDraft()` method:

```typescript
// mobile/app/forms/[id].tsx
const { id, draftId } = useLocalSearchParams<{ id: string; draftId?: string }>();

useEffect(() => {
  async function loadForm() {
    const definition = await FormService.getFormDefinition(id, token);
    let initialValues: FormFieldValues = buildDefaultValues(definition);

    if (draftId) {
      const draft = await FormService.getDraft(id, draftId, token);
      initialValues = { ...initialValues, ...draft.formData };
      setInitialTabIndex(draft.currentTabIndex);
    }

    setForm(definition);
    setDefaultValues(initialValues);
  }
  void loadForm();
}, [id, draftId]);
```

`FormService.getDraft()`:

```typescript
async function getDraft(formCode: string, draftId: string, token: string): Promise<DraftSubmission> {
  return apiGet<DraftSubmission>(`/api/forms/${formCode}/draft/${draftId}`, token);
}
```

The form list navigates to `/forms/${formCode}?draftId=${draft.id}` when a draft exists.

**Files to change:**
- `mobile/app/forms/[id].tsx` — read `draftId` param, call `getDraft`, pass `defaultValues`
- `mobile/src/services/FormService.ts` — add `getDraft()`
- `mobile/app/forms/index.tsx` — pass `?draftId=` when navigating to a drafted form

---

### RM-003 — Offline Sync Status UI `[PLANNED-P1]`

**Problem:** `PendingSubmissionQueue` silently enqueues submissions when offline.
Users have no way to know how many are pending, whether sync is in progress, or if
any failed.

**Implementation:**

Add a persistent sync status banner in the root layout:

```typescript
// mobile/app/_layout.tsx
<NetworkMonitor onReconnect={() => FormService.syncPendingSubmissions(token)} />
<PendingSyncBanner />   // shows count of pending; "Syncing..." during sync; errors inline
<Stack ... />
```

`PendingSyncBanner` reads from a `usePendingQueue()` hook that exposes
`{ count, isSyncing, lastError }`. State is held in a `SyncStatusContext`.

`NetworkMonitor.ts` already exists and monitors connectivity. Wire its `onReconnect`
callback to trigger `syncPendingSubmissions` automatically.

**New screen** `app/sync-status.tsx`: detailed list of pending submissions with
form name, enqueue time, and a manual "Retry Now" button per item.

---

### RM-004 — Settings / Sign-Out Screen `[PLANNED-P1]`

**Problem:** There is no way for a user to sign out or switch accounts on mobile.

**New screen:** `app/settings.tsx`

Contents:
- User avatar + display name + email (from `account.displayName`, `account.email`)
- "Sign Out" button → calls `MsalProvider.signOut()` → navigates to `/`
- App version display (`expo-constants` `expoConfig.version`)
- Language selector (when RM-007 is complete) — `en` / `ar` toggle

Add a settings icon in the header of `app/forms/index.tsx` (`router.push('/settings')`).

---

### RM-005 — Mobile File Upload (Multipart) `[PLANNED-P1]`

**Problem:** `FormFileField` stores a local file URI in form state. On submit, the URI
is serialized as a JSON string — the binary file never reaches the server. File upload
is silently broken on mobile.

**Implementation:**

Upload the file immediately at pick time (same pattern as web `FileUploadControl`):

```typescript
// mobile/src/components/fields/FormFileField.tsx — after pick
async function uploadPickedFile(pickedFile: PickedFile): Promise<UploadedFileReference> {
  const formData = new FormData();
  formData.append('file', {
    uri: pickedFile.uri,
    name: pickedFile.name,
    type: pickedFile.mimeType ?? 'application/octet-stream',
  } as unknown as Blob);
  formData.append('fieldId', field.id);

  const response = await fetch(`${appConfig.apiBaseUrl}/api/files/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });

  const result = await response.json() as { data: UploadedFileReference };
  return result.data;
}
```

On success, `onChange(uploadedRef)` — the `UploadedFileReference` is stored as the field
value, identical to the web behaviour. `FormSummaryScreen.formatFieldValue` for `file`
type already handles `UploadedFileReference` objects, so the summary screen needs no change.

Show an inline `ActivityIndicator` while upload is in progress.
Show error state with a "Remove & retry" button on failure.

**Files to change:**
- `mobile/src/components/fields/FormFileField.tsx` — add upload-on-pick flow

---

### RM-009 — Token Expiry Check in `acquireToken` `[PLANNED-P1]`

**Problem:** `acquireToken()` returns the cached access token without inspecting its `exp`
claim. After the token expires (typically 60–90 min), all API calls silently return 401.
The user sees broken form list and cannot submit.

**Fix:**

```typescript
// mobile/src/auth/MsalProvider.tsx
async function acquireToken(): Promise<string> {
  const accessToken = await SecureStore.getItemAsync('qdb_access_token');

  if (accessToken && !isTokenExpiredWithBuffer(accessToken, 60)) {
    return accessToken;
  }

  // Token missing or expires within 60 seconds — refresh
  const refreshToken = await SecureStore.getItemAsync('qdb_refresh_token');
  if (!refreshToken) throw new Error('no_refresh_token');

  const result = await AuthSession.refreshAsync(
    { clientId, refreshToken, scopes },
    { tokenEndpoint: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token` },
  );

  await persistTokens(result);
  return result.accessToken;
}

function isTokenExpiredWithBuffer(token: string, bufferSeconds: number): boolean {
  const payload = parseJwt(token);
  return (payload.exp - bufferSeconds) < (Date.now() / 1000);
}
```

---

### RM-010 — Fix `hasDraft` Always False `[PLANNED-P1]`

**Problem:** `mapFormSummaryToListItem` in `FormService.ts` hardcodes `hasDraft: false`.
Draft badge never appears on the form list.

**Fix (one line):**

```typescript
// mobile/src/services/FormService.ts
hasDraft: item.hasDraft ?? false,   // was: hasDraft: false
```

Requires verifying that `BackendFormSummary` already includes `hasDraft: boolean` from the
backend `GET /api/forms` response. If not, add it to the backend list endpoint query.

---

## 4. Roadmap — Phase 2: Competitive Parity

Target window: **3–6 months**. Match what mid-market competitors offer in RFP responses.

---

### R-009 — Visual Rule Builder `[PLANNED-P2]`

**Problem:** Rules are configured via JSON-like config screens. Non-technical form owners
cannot manage them.

**UI design:** A condition builder similar to Salesforce Flow or JotForm Conditions.
Three columns: `[Field]` `[Operator]` `[Value]`. Groups with AND/OR toggle.
Action selector below: "Then [action] [target] [value]".

**Implementation approach:**

The `BusinessRule` type in `shared/src/types/form.types.ts` does not change. The visual
builder is purely a different editor surface that produces the same JSON structure.

Replace `RuleConfigScreen.tsx` with a new `VisualRuleBuilderScreen.tsx`. State is a
`BuilderRuleModel` (a UI-friendly projection of `BusinessRule`) that serializes to/from the
existing `BusinessRule` format on save/load.

Key components:
- `ConditionGroup.tsx` — AND/OR toggle + list of `ConditionRow`
- `ConditionRow.tsx` — field picker + operator picker + value input
- `ActionRow.tsx` — action picker + target picker + value input
- `RulePreviewPane.tsx` — "plain English" summary of the rule

---

### R-010 — Signature Field `[PLANNED-P2]`

**New field type:** `F-023 signature`

**Library:** `react-signature-canvas` (frontend), `signature_pad` (mobile via `react-native-signature-canvas`)

**Storage:** The signature is captured as a base64 PNG. On submit, it is uploaded via
`/api/files/upload` (reusing existing file upload flow) and stored as a CRM annotation.
The `fieldValues[schemaName]` holds the `UploadedFileReference` of the signature image.

**FieldDefinition additions:**

```typescript
interface SignatureConfig {
  penColor: string;         // default '#000000'
  backgroundColor: string;  // default '#ffffff'
  minWidth: number;          // default 0.5
  maxWidth: number;          // default 2.5
}
```

**Designer panel:** `SignatureFieldPanel.tsx` with color pickers and stroke width sliders.

**Summary/PDF render:** Renders the signature image inline.

---

### R-011 — Rating / NPS / Matrix Fields `[PLANNED-P2]`

Three new field types sharing a common `RatingConfig`:

**`F-024 rating`** — Star rating (1–N stars) or numeric slider. Stored as integer.

**`F-025 nps`** — 0–10 NPS button row with Detractor / Passive / Promoter labels.
Stored as integer.

**`F-026 matrix`** — Likert-scale table. Rows = statements (`matrixRows: string[]`),
columns = response options (`matrixColumns: OptionSetItem[]`). Stored as
`{ [rowId: string]: columnValue }`.

All three support business rule conditions (e.g. `rating greaterThan 3 → showSection`).

---

### R-012 — Submission Portal `[PLANNED-P2]`

**Problem:** End-users cannot log in and view their past submissions or track status.

**New route (frontend):** `/my-submissions`

**New API endpoints:**
```
GET  /api/portal/submissions          — paginated list for current user
GET  /api/portal/submissions/:id      — single submission detail
GET  /api/portal/submissions/:id/pdf  — download PDF receipt
```

**Data source:** CRM query on `qdb_submission` entity filtered by
`qdb_submitted_by = {userId}`. Returns `{ referenceNumber, formTitle, submittedAt, status }`.

**Status values:** `draft`, `submitted`, `under_review`, `approved`, `rejected` — mapped
from the CRM `qdb_submission_status` option set.

---

### R-013 — Approval Workflow `[PLANNED-P2]`

**Problem:** Submissions have no human-in-the-loop gate before becoming active CRM records.

**Implementation:** Two-tier approach.

**Tier 1 — Power Automate (preferred for simple linear approval):**
The existing Power Automate trigger in `CrmSubmissionService` fires after submit. A pre-built
approval flow template (distributed as a managed solution) handles:
1. Set `qdb_submission_status = 'under_review'`
2. Send approval request to configured approver(s) via Teams Adaptive Card
3. On approve: set status to `approved`, trigger downstream automation
4. On reject: set status to `rejected`, send rejection email to submitter

**Tier 2 — Native multi-step approval (for complex routing):**
A new `ApprovalWorkflow` config on `FormDefinition`:

```typescript
interface ApprovalStep {
  order: number;
  approverGroupId: string;   // Azure AD group
  timeoutDays: number;
  onTimeout: 'escalate' | 'auto-approve' | 'auto-reject';
}
```

Steps are evaluated sequentially. Backend `ApprovalService` drives transitions via a
scheduled Azure Function (or Dataverse plugin on status change).

---

### R-014 — Outbound Webhooks `[PLANNED-P2]`

**Problem:** Submissions can only write to CRM. No way to push to Slack, Jira, or custom
REST endpoints without custom backend code.

**New config on `FormDefinition`:**

```typescript
interface WebhookConfig {
  url: string;
  method: 'POST' | 'PUT';
  headers?: Record<string, string>;
  payloadTemplate?: string;   // Handlebars template; default: full fieldValues JSON
  triggerOn: ('submit' | 'approve' | 'reject')[];
  retryCount: number;          // default 3
  timeoutMs: number;           // default 5000
}
```

**Backend:** `WebhookService.ts` fires webhooks after CRM write. Failures are logged to
`qdb_webhook_log` entity (append-only). Retry logic uses exponential back-off with jitter.
Webhook secrets are supported via `X-Webhook-Secret` header (value from Key Vault).

**Designer:** Webhooks tab in Form Properties panel.

---

### R-015 — Form Analytics Dashboard `[PLANNED-P2]`

**Problem:** Form owners have zero visibility into form performance.

**Metrics to track:**

| Metric | Description | Source |
|--------|-------------|--------|
| Views | Unique sessions that loaded the form | Frontend event |
| Starts | Sessions that changed at least one field | Frontend event |
| Completions | Successful submissions | Backend event |
| Completion rate | Completions / Starts | Computed |
| Avg. fill time | Time from first keystroke to submit | Frontend event |
| Tab drop-off | % of sessions that abandoned at each tab | Frontend event |
| Field error rate | Per-field validation failure count | Backend event |

**Implementation:**

Frontend fires telemetry events via a thin `analyticsClient.ts` wrapper:

```typescript
analyticsClient.track('form_viewed', { formCode, locale });
analyticsClient.track('form_started', { formCode, tabIndex: 0 });
analyticsClient.track('tab_exited', { formCode, tabIndex, fieldsFilled, timeOnTabMs });
analyticsClient.track('form_submitted', { formCode, durationMs, tabCount });
```

Events are batched and sent to `POST /api/analytics/events` (public, no auth, rate-limited).
Backend writes to a `qdb_form_analytics_event` CRM entity (or Azure Table Storage for cost
efficiency at high volume).

Dashboard screen in the designer: `AnalyticsDashboardScreen.tsx` renders charts using
`recharts`. Date range picker + form selector. No external BI dependency.

---

### R-016 — Section Repeater `[PLANNED-P2]`

**Problem:** `RepeatingGridControl` only supports row-based grids. Many forms need a full
section to repeat (e.g. "Add Beneficiary" where each beneficiary has 8 diverse fields).

**New field type:** `F-029 section-repeater`

A `SectionRepeaterControl` renders N instances of a child `SectionDefinition`. Each
instance is a self-contained mini-form. The user can add, remove, and reorder instances.

**Data model:**

```typescript
// fieldValues[schemaName] = SectionRepeaterEntry[]
interface SectionRepeaterEntry {
  id: string;                           // client-generated UUID
  fields: FormFieldValues;              // fieldValues for this instance
}
```

Business rules inside a repeating section operate on the instance's own field values (not
the parent form). This requires scoped rule evaluation — a new `evaluateScopedRules()`
method on `RuleEngine` that accepts a local `fieldValues` subset.

---

### R-017 — Address Autocomplete Field `[PLANNED-P2]`

**New field type:** `F-026 address`

Uses **Azure Maps Search API** (aligned with the existing Microsoft stack). On keyup,
calls `GET /api/address/search?q={input}` which proxies to Azure Maps. Returns structured
suggestions. On selection, populates sub-fields:

```typescript
interface AddressValue {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  latitude?: number;
  longitude?: number;
}
```

Sub-fields are always editable (user can correct the autocomplete result). Each sub-field
maps independently to a CRM attribute via `SubmissionMapping`.

Backend proxy is required to keep the Azure Maps subscription key off the client.

---

### R-018 — Formula / Calculated Display Field `[PLANNED-P2]`

**New field type:** `F-028 formula`

A read-only field that evaluates an ExpressionEngine DSL string against `fieldValues` in
real time and displays the formatted result.

```typescript
interface FormulaConfig {
  expression: string;    // ExpressionEngine DSL, e.g. "{qty} * {unitPrice}"
  format: 'number' | 'currency' | 'date' | 'text';
  currencyCode?: string;
  decimalPlaces?: number;
}
```

The formula is evaluated in `FormContext` alongside business rules (reusing
`ExpressionEngine`). The result is stored in `fieldValues[schemaName]` as a read-only value
and can be submitted to CRM like any other field.

---

## 4b. Roadmap — Phase 2: Mobile Parity (3–6 months)

These items bring the mobile app to feature parity with the web frontend.

---

### RM-001 — Submission History Screen `[PLANNED-P2]`

**Problem:** There is no "My Applications" screen on mobile. Users cannot see past
submissions, check status, or download a PDF receipt.

**New screen:** `app/submissions/index.tsx` (list) + `app/submissions/[id].tsx` (detail)

Calls `GET /api/portal/submissions` (same endpoint as R-012 web portal). Displays:
- Form title, submission reference, submitted date, status badge
- Detail screen: full read-only field summary + PDF download button
- Pull-to-refresh

**New service method:**

```typescript
// mobile/src/services/FormService.ts
async function listMySubmissions(token: string, page = 0): Promise<SubmissionSummary[]>
async function getSubmission(id: string, token: string): Promise<SubmissionDetail>
```

Add "My Submissions" tab to `app/forms/index.tsx` using a tab bar layout, or add a
dedicated route accessible from the header.

---

### RM-006 — EAS Build Configuration `[PLANNED-P2]`

**Problem:** No production builds are possible. EAS project ID is a placeholder.

**Implementation:**

1. Run `eas init` to register the project and get a real `projectId`
2. Create `eas.json`:

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": { "API_BASE_URL": "http://192.168.1.14:4000" }
    },
    "preview": {
      "distribution": "internal",
      "env": { "API_BASE_URL": "https://api-staging.qdbforms.com" }
    },
    "production": {
      "env": { "API_BASE_URL": "https://api.qdbforms.com" },
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {
      "ios": { "appleId": "...", "ascAppId": "...", "appleTeamId": "..." },
      "android": { "serviceAccountKeyPath": "./google-service-account.json", "track": "internal" }
    }
  }
}
```

3. Add `eas-build` steps to CI (GitHub Actions `build-mobile.yml`)
4. Configure OTA updates via `expo-updates` for patch-level releases

---

### RM-007 — Wire LocaleContext + RTL `[PLANNED-P2]`

**Problem:** `LocaleContext` is fully built with `en`/`ar` support and AsyncStorage
persistence, but it is never mounted. Arabic RTL is dead code.

**Implementation:**

```typescript
// mobile/app/_layout.tsx
export default function RootLayout() {
  return (
    <DevBypassProvider>
      <MsalProvider>
        <LocaleProvider>          {/* ADD THIS */}
          <RtlController />       {/* applies I18nManager.forceRTL + reload on change */}
          <Stack screenOptions={{ headerShown: false }} />
        </LocaleProvider>
      </MsalProvider>
    </DevBypassProvider>
  );
}
```

`RtlController` reads `isRtl` from `LocaleContext` and calls
`I18nManager.forceRTL(isRtl)` followed by `Updates.reloadAsync()` on first locale change
(RTL requires a full reload in React Native).

All field labels already use `field.label` — update to use `resolveLabel(field, locale)`
once the web locale resolution function is exported from `@qdb/shared`.

---

### RM-008 — Wire Mock Data to Dev Bypass `[PLANNED-P2]`

**Problem:** Dev bypass skips the login screen but still calls the live API.
Developers without a running backend cannot use the mobile app.

**Implementation:**

```typescript
// mobile/src/services/FormService.ts
import { mockForms } from '../mock/forms';

async function listForms(token: string, locale?: string): Promise<FormListItem[]> {
  if (isDevBypass()) return mockForms.map(mapFormSummaryToListItem);
  // ... existing implementation
}

async function getFormDefinition(formCode: string, token: string): Promise<FormDefinition> {
  if (isDevBypass()) {
    const mock = mockForms.find(f => f.formCode === formCode);
    if (mock) return mock as unknown as FormDefinition;
  }
  // ... existing implementation
}
```

`isDevBypass()` reads from a module-level flag set by `DevBypassContext.enableDevBypass()`.
Use a simple module singleton rather than prop-drilling the context into `FormService`.

---

## 5. Roadmap — Phase 3: Differentiation

Target window: **6–12 months**. Win premium enterprise deals on capability that competitors
do not offer out of the box.

---

### R-020 — Mobile Offline Mode `[PLANNED-P3]`

**Problem:** Mobile app requires live network. Field workers in low-connectivity
environments cannot complete forms.

**Architecture:**

1. Use `@react-native-community/netinfo` to detect connectivity state.
2. On offline detection, switch to local-only mode: store `fieldValues` in
   `AsyncStorage` keyed by `formCode + userId`.
3. Cache `FormDefinition` from the last successful load in `AsyncStorage` (TTL 7 days).
4. On reconnect, detect pending offline submissions via a `pendingSubmissions[]` queue
   in `AsyncStorage`.
5. Sync queue uploads pending submissions sequentially, showing progress in a banner.

File uploads in offline mode are stored as local file URIs. On sync, files are uploaded
first via `filesApi.upload()`, then the submission is sent with the returned
`UploadedFileReference` objects.

Conflict resolution: last-write-wins on a per-field basis (offline form fills are treated
as the canonical source if no server-side edit happened in the interim).

---

### R-021 — Custom Field Type SDK `[PLANNED-P3]`

**Problem:** Developers cannot add domain-specific field types without modifying the core
codebase.

**Design:** A plugin contract modelled on PCF (Power Apps Component Framework).

```typescript
// packages/field-sdk/src/types.ts
interface FieldPlugin<TConfig = unknown, TValue = unknown> {
  fieldType: string;              // e.g. "iban", "vehicle-reg", "icd-code"
  displayName: string;
  icon: React.ComponentType;
  defaultConfig: TConfig;

  // Renders the control in the form
  Control: React.ComponentType<PluginControlProps<TConfig, TValue>>;

  // Renders the properties panel in the designer
  PropertiesPanel: React.ComponentType<PluginPanelProps<TConfig>>;

  // Returns Zod schema for runtime validation
  buildSchema: (config: TConfig) => z.ZodType<TValue>;

  // Returns the CRM-ready value from TValue
  serializeForCrm: (value: TValue) => string | number | boolean | null;
}
```

Plugins are registered at app startup:

```typescript
// frontend/src/plugins/index.ts
import { IbanField } from '@maqsad/dfe-plugin-iban';
fieldPluginRegistry.register(IbanField);
```

The plugin registry feeds into `FieldRenderer.tsx` and `PropertiesPanel.tsx` via a
`getPluginForType(fieldType)` lookup.

---

### R-022 — Resumable Chunked File Upload `[PLANNED-P3]`

**Problem:** Files > 25 MB fail outright. No retry on interrupted network.

**Implementation:** Azure Blob Storage block-blob upload using the official
`@azure/storage-blob` SDK.

Protocol:
1. `POST /api/files/upload/init` → returns `{ uploadId, blockUrls[] }` (SAS-signed block-blob URLs)
2. Frontend splits file into 4 MB chunks, uploads each block directly to Azure Blob
   using the SAS URL (bypasses the backend for chunk data)
3. `POST /api/files/upload/commit` → backend calls `BlockBlobClient.commitBlockList()`,
   returns the final `UploadedFileReference`

Progress is tracked per-chunk. Interrupted uploads resume from the last committed block
(stored in `sessionStorage` keyed by file hash).

---

### R-024 — AI Field Pre-Fill `[PLANNED-P3]`

**Problem:** Users repeatedly fill in the same personal/company data across multiple forms.

**Implementation:** Two modes.

**Mode 1 — Profile pre-fill:**
Backend `ProfileService` reads the current user's profile from Azure AD Graph API
(`GET /v1.0/me`) and maps standard attributes (displayName, mail, mobilePhone, officeLocation)
to form fields via a configurable `profileMapping` on `FormDefinition`.

**Mode 2 — Document scan pre-fill:**
Upload a source document (e.g. passport, invoice). Backend sends document to Azure AI
Document Intelligence (formerly Form Recognizer). Extracted key-value pairs are mapped
to form fields via a configurable `documentMapping`. Pre-filled values are marked with
a "Pre-filled from document — please verify" banner and are always editable.

---

### R-025 — Application Insights Telemetry `[PLANNED-P3]`

Wire `@azure/monitor-opentelemetry` on the backend and `@microsoft/applicationinsights-web`
on the frontend. Key signals:

| Signal | Source | Alert threshold |
|--------|--------|-----------------|
| Submission failure rate | Backend | > 1% in 5 min → PagerDuty |
| Form load P95 latency | Backend | > 3 s in 5 min → warning |
| Rule evaluation duration | Frontend | > 500 ms → log warning |
| CRM write latency P95 | Backend | > 5 s → warning |
| File upload failure rate | Backend | > 5% in 5 min → alert |

Custom dimensions on every trace: `formCode`, `tenantId`, `userId` (hashed).

---

## 6. Technical Debt Register

| ID | Debt | File | Risk | Fix |
|----|------|------|------|-----|
**Web / Backend**

| ID | Debt | File | Risk | Fix |
|----|------|------|------|-----|
| TD-001 | Multer in-memory storage for files | `backend/src/routes/filesRouter.ts` | OOM under concurrent large uploads | Stream directly to Azure Blob via `@azure/storage-blob` |
| TD-002 | `eslint-disable` on FileUploadControl hydration effect | `frontend/src/components/forms/controls/FileUploadControl.tsx:134` | Lint debt; can mask real dependency issues | Refactor hydration to a lazy `useState` initializer |
| TD-003 | `console.log` calls present in some service files | Various backend services | CLAUDE.md violation; leaks data to logs | Enforce `no-console` ESLint rule in CI; replace with `pino` logger |
| TD-004 | No rate limiting per-user on submit endpoint | `backend/src/routes/formsRouter.ts` | Submission flooding / abuse | Add `@fastify/rate-limit` with `keyGenerator: (req) => req.jwtPayload.sub` |
| TD-005 | `any` casts in CRM response parsing | `backend/src/services/CrmSubmissionService.ts` | TypeScript safety bypass | Define typed OData response interfaces |
| TD-006 | Tab switch causes FileUploadControl remount | `frontend/src/components/forms/DynamicFormRenderer.tsx:391` | Re-hydration workaround in place (2026-06-14) but root cause remains | Render all tabs simultaneously with CSS `display: none` for inactive tabs |
| TD-007 | No structured error response contract | All backend routes | Frontend parses errors inconsistently | Define `ErrorResponse { code: string; message: string; details?: unknown }` and enforce in all error handlers |
| TD-008 | `gridSchemaHash` is a full-object string comparison | `FormContext.tsx` | Minor schema change invalidates valid in-flight drafts | Replace with a semantic version key on `GridColumnDefinition[]` |

**Mobile**

| ID | Debt | File | Risk | Fix |
|----|------|------|------|-----|
| TD-009 | `eas.json` missing; EAS project ID is placeholder `REPLACE_WITH_EAS_PROJECT_ID` | `app.json` | Cannot produce production iOS/Android builds | Create `eas.json` with `development`, `preview`, `production` profiles; register on EAS |
| TD-010 | `LocaleContext` built but never mounted in `_layout.tsx` | `mobile/app/_layout.tsx` | Arabic RTL and locale switching are dead code | Wrap `Stack` in `LocaleProvider`; apply `dir` attribute based on `isRtl` |
| TD-011 | Mock data in `src/mock/forms.ts` not wired to dev bypass | `mobile/src/services/FormService.ts` | Dev/test always requires a live backend | Short-circuit `listForms`/`getFormDefinition` when `isDevBypass = true` |
| TD-012 | `acquireToken()` returns cached token without checking `exp` claim | `mobile/src/auth/MsalProvider.tsx` | Silent 401s after token expiry; form submissions fail with no user feedback | Decode JWT `exp` before returning; trigger `refreshAsync()` proactively 60 s before expiry |
| TD-013 | `hasDraft: false` hardcoded in `mapFormSummaryToListItem` | `mobile/src/services/FormService.ts` | Draft badge never appears on form list even if server has a saved draft | Map `item.hasDraft` from `BackendFormSummary.hasDraft` (backend already returns this) |
| TD-014 | File upload sends local URI as JSON string — binary never reaches server | `mobile/src/components/fields/FormFileField.tsx` | File upload is silently broken on mobile | Upload file at pick time via `multipart/form-data` using `fetch` with `FormData`; store `UploadedFileReference` as field value |
| TD-015 | Draft resume not wired — `[id].tsx` ignores `draftId` query param | `mobile/app/forms/[id].tsx` | `saveDraft` API works but users cannot resume a saved draft | Read `draftId` from `useLocalSearchParams()`; call `FormService.getDraft()` and pass values as `defaultValues` to `FormRenderer` |
| TD-016 | `syncPendingSubmissions()` has no UI trigger or status display | `mobile/src/services/FormService.ts` | Offline submissions queue silently; users never know if sync succeeded or failed | Add sync status banner in root layout + `NetworkMonitor` listener to auto-sync on reconnect |
| TD-017 | No sign-out button or settings screen | `mobile/app/` | Users cannot switch accounts or sign out | Add `app/settings.tsx` screen with account info display and sign-out button |
| TD-018 | `FormEntryGridField` and `FormRepeatingGridField` dispatch overlap in `FieldRenderer` | `mobile/src/components/fields/FieldRenderer.tsx` | Unclear which handles `grid` type — potential silent routing bug | Audit dispatch logic; add explicit `mode` check; document which component owns which mode |

---

## 7. Shared Type Contract

All types that cross the frontend ↔ backend ↔ designer ↔ mobile boundary live in:

```
shared/src/types/
  form.types.ts         — FormDefinition, FieldDefinition, all sub-types
  submission.types.ts   — DraftSubmission, SubmissionResult
  rule.types.ts         — BusinessRule, RuleCondition, RuleAction
  validation.types.ts   — ValidationRule, ValidationError
  design.types.ts       — DesignPayload, ThemeDefinition
  analytics.types.ts    — AnalyticsEvent (to be added, R-015)
  notification.types.ts — NotificationConfig, NotificationTarget (to be added, R-002)
  webhook.types.ts      — WebhookConfig (to be added, R-014)
```

**Rule:** Never define a type that crosses a package boundary in a non-shared location.
If a backend service needs `FieldDefinition`, it imports from `@qdb/shared`, not from a
local copy.

When adding fields to an existing shared type, always add them as optional (`field?: Type`)
to preserve backward compatibility with in-flight form definitions stored in CRM.

---

## 8. Adding a New Field Type — Developer Checklist

Use this checklist every time a new field type is introduced.

### Shared (`shared/src/types/form.types.ts`)
- [ ] Add the new literal to the `FieldType` union
- [ ] Add a `*Config` interface if the field needs custom config (e.g. `SignatureConfig`)
- [ ] Add the config type to `FieldDefinition` as an optional property
- [ ] Bump the schema version comment

### Frontend (`frontend/src/`)
- [ ] Create `components/forms/controls/{TypeName}Control.tsx`
- [ ] Register in `components/forms/FieldRenderer.tsx` switch
- [ ] Add to `FormSummary.tsx` read-only render case
- [ ] Add to `FormContext.ts → buildInitialValues()` with correct default value
- [ ] Add Zod validation support in `engine/ValidationEngine.ts` if applicable
- [ ] Add ExpressionEngine fact type if it can be used in rule conditions

### Designer (`designer/src/`)
- [ ] Create `designer/properties/panels/{TypeName}FieldPanel.tsx`
- [ ] Register in `designer/properties/PropertiesPanel.tsx` switch
- [ ] Add to `designer/toolbox/ComponentToolbox.tsx` drag source
- [ ] Add to `AdvancedComponentsPanel.tsx` if it is an advanced type

### Mobile (`mobile/src/`)
- [ ] Create `src/components/fields/Form{TypeName}Field.tsx`
- [ ] Register in `src/components/fields/FieldRenderer.tsx` switch block
- [ ] Register in `src/registry/ComponentRegistry.ts` if field supports custom override
- [ ] Add to `FormSummaryScreen.tsx → formatFieldValue()` render case
- [ ] Add `buildValidationRules` case in `src/utils/buildValidationRules.ts` if field has new validation types
- [ ] If field requires device capabilities (camera, location, NFC): declare in `app.json` plugins + iOS `infoPlist` / Android permissions

### Backend (`backend/src/`)
- [ ] Add CRM attribute mapping support in `CrmSubmissionService.ts` if the serialized
  value needs special handling (e.g. arrays, blobs, references)
- [ ] Add validation support in `ValidationEngine.ts` server-side clone

### Tests
- [ ] Unit test for the control: happy path + validation error + readonly mode
- [ ] Unit test for the designer panel: renders without crash
- [ ] Unit test for validation engine: all validation rules for this type
- [ ] E2E test: fill field → submit → verify CRM value

### Documentation
- [ ] Add row to §2.1 Field Types table in this document
- [ ] Add ADR if a new library is introduced
