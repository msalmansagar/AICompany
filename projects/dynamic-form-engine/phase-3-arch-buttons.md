# Phase 3 — Solution Architecture
## Engagement: DFE-BTN-001 — Tab/Section Buttons, Button Navigation & Final-Submission Parameters
**Client:** Qatar Development Bank (QDB)
**Date:** 2026-06-30
**Architect:** Maqsad AI Solution Architect
**Status:** DRAFT — Pending CEO Phase 3 → 4 Gate

---

## 1. System Overview

This engagement adds two complementary capabilities to the Dynamic Form Engine without altering any existing data path. The first extends the button placement model by introducing `ScopedButton` — buttons attached to individual tabs or sections, with four action types (Navigate / FinalSubmit / SaveDraft / CallApi) — consumed from the same render-cache JSON that drives all four existing runtimes. The second adds a structured `ExtraParams` envelope to the FinalSubmit flow: the client assembles Static, HiddenField, and RuntimeContext entries client-side and sends raw expression strings for Computed entries; the backend stamps all security-sensitive context keys authoritatively, evaluates Computed expressions server-side using the existing `ExpressionEngine`, enforces a 64 KB cap, and persists the resolved object alongside the submission audit log. Security surfaces (External-URL navigation, CallApi forwarding) are closed by a single Dataverse-persisted endpoint allowlist (`qdb_api_endpoint`) that the client can only reference by key — no client-supplied URL is ever honoured by the backend.

---

## 2. Component Map

All paths below are relative to `projects/dynamic-form-engine/`.

### 2a. New Components

| Component | File Path | Layer | Responsibility |
|---|---|---|---|
| ScopedButtonsPanel | `designer/src/designer/properties/panels/ScopedButtonsPanel.tsx` | designer | Fluent UI v9 panel listing, adding, editing, and deleting ScopedButtons attached to a tab or section; mounted as an AccordionItem inside TabProperties.tsx and SectionProperties.tsx |
| ScopedButtonEditor | `designer/src/designer/properties/panels/ScopedButtonEditor.tsx` | designer | Full configuration form for one ScopedButton: label, action type, navigationTarget, extraParamsConfig, callApiConfig |
| ExtraParamsConfigPanel | `designer/src/designer/properties/panels/ExtraParamsConfigPanel.tsx` | designer | Sub-panel for configuring the four ExtraParam source types (Static, HiddenField, RuntimeContext, Computed) when action is FinalSubmit |
| ButtonDesignService | `designer/src/services/ButtonDesignService.ts` | designer | CRUD operations against `qdb_form_button` via Xrm.WebApi; all attribute names resolved from `buttonAttributeNames.ts` |
| buttonAttributeNames | `designer/src/constants/buttonAttributeNames.ts` | designer | Registry of all `qdb_form_button` and `qdb_api_endpoint` attribute logical names |
| ButtonAssembler | `backend/src/services/ButtonAssembler.ts` | backend | Queries `qdb_form_button` records for a given form and assembles them into `ScopedButton[]` indexed by tabId / sectionId for embed in the FormDefinition cache payload |
| AllowlistRepository | `backend/src/services/AllowlistRepository.ts` | backend | Server-side; reads `qdb_api_endpoint` from Dataverse via the service principal; caches per-process with 5-minute TTL; provides `resolveEndpointKey(key)` |
| ExtraParamsAssemblyService | `backend/src/services/ExtraParamsAssemblyService.ts` | backend | Receives the client-assembled `ExtraParamsConfig`, stamps authoritative RuntimeContext keys (overriding client values unconditionally), evaluates Computed expressions with the bounded `ExpressionEngine`, enforces the 64 KB cap |
| CallApiProxyService | `backend/src/services/CallApiProxyService.ts` | backend | Resolves endpoint key via `AllowlistRepository`, forwards the request with the user's Bearer JWT, enforces 5-second timeout, returns structured response or error envelope to the caller |
| ExpressionEngineServer | `shared/src/engines/ExpressionEngineServer.ts` | shared | Thin server-only wrapper that calls `ExpressionEngine.evaluate()` with a step-count guard (`maxOps: 1_000`) and a `formatDate()` function extension; throws `ExpressionTimeoutError` when the step limit is hit |
| ConsistencySyncCheck | `shared/scripts/check-shared-type-sync.mts` | ci | `ts-morph`-based script that extracts property names of `ScopedButton`, `NavigationTarget`, `ExtraParamsConfig`, `ExtraParamSource`, and `CallApiConfig` from both `form.types.ts` and `form.ts`, diffs them, and exits 1 on drift (C-006 deliverable) |
| ButtonEndpointAdminRoutes | `backend/src/routes/button-endpoints.admin.routes.ts` | backend | Admin-only Fastify routes for listing active endpoint keys (for designer dropdown population); write access is Dataverse-direct (IT role only) |

### 2b. Modified Components

| Component | File Path | Layer | Change |
|---|---|---|---|
| form.types.ts | `shared/src/types/form.types.ts` | shared | Add `ScopedButton`, `ButtonActionType`, `PlacementScope`, `NavigationTarget`, `ExtraParamSource`, `RuntimeContextKey`, `ExtraParamsConfig`, `ExtraParamsResolved`, `CallApiConfig`; extend `TabDefinition.buttons?: ScopedButton[]`; extend `SectionDefinition.buttons?: ScopedButton[]`; extend `AuditLogEntry.eventType` union; extend `AuditLogEntry.extraParams?: ExtraParamsResolved` |
| form.ts | `shared/src/types/form.ts` | shared | Identical additions to above (see Section 3 for concrete shapes) |
| TabProperties.tsx | `designer/src/designer/properties/TabProperties.tsx` | designer | Add `<AccordionItem value="buttons"><AccordionHeader>Buttons ({count})</AccordionHeader><AccordionPanel><ScopedButtonsPanel scope="tab" placementId={tabId} /></AccordionPanel></AccordionItem>` |
| SectionProperties.tsx | `designer/src/designer/properties/SectionProperties.tsx` | designer | Same pattern: `<ScopedButtonsPanel scope="section" placementId={sectionId} />` |
| forms.routes.ts | `backend/src/routes/forms.routes.ts` | backend | Extend `submitSchema` to accept `extraParams?: ExtraParamsConfigInput` (Zod schema); extend `/submit` handler to call `ExtraParamsAssemblyService`; add `POST /:formCode/call-api` route |
| CrmSubmissionService.ts | `backend/src/services/CrmSubmissionService.ts` | backend | Accept optional resolved `ExtraParamsResolved` in `submitForm()`; pass to `CrmAuditService.writeAuditEntry()` as `extraParams` field |
| CrmAuditService.ts | `backend/src/services/CrmAuditService.ts` | backend | Write `extraParams` to `qdb_extra_params_json` column on `qdb_form_audit_log` when present |
| CacheAssemblyService.ts | `backend/src/services/CacheAssemblyService.ts` | backend | Call `ButtonAssembler.assembleButtons(formDefinitionId)` and embed result into tabs and sections of the FormDefinition before cache write |
| FormJsonGenerator.cs | `crm-plugins/Qdb.FormEngine/Qdb.FormEngine.Core/Generation/FormJsonGenerator.cs` | on-prem | Extend SQL query to join `qdb_form_button`; populate `buttons` array on each tab and section in the generated JSON |
| ExpressionEngine.ts | `shared/src/engines/ExpressionEngine.ts` | shared | No change to class or public API; ExpressionEngineServer extends it non-destructively |
| designerStore.ts | `designer/src/state/designerStore.ts` | designer | Add `scopedButtons: Record<string, ScopedButton[]>` keyed by placementId; add `addButton / updateButton / removeButton` actions |
| entityNames.ts | `designer/src/constants/entityNames.ts` | designer | Add `FORM_BUTTON: 'qdb_form_button'`, `API_ENDPOINT: 'qdb_api_endpoint'` |

---

## 3. Shared-Type Contract

Both `shared/src/types/form.types.ts` and `shared/src/types/form.ts` receive the additions below. Field names are **identical** in both files — the CI sync check (C-006) enforces this. Existing historically-diverged field names on pre-existing types (`id` vs `tabId`, `label` vs `displayLabel`) are not touched.

### 3a. ButtonActionType

```typescript
// In both form.types.ts AND form.ts
export type ButtonActionType = 'navigate' | 'finalSubmit' | 'saveDraft' | 'callApi';

export type PlacementScope = 'tab' | 'section';
```

The existing `ButtonAction = 'submit' | 'saveDraft' | 'cancel' | 'reset'` on `FormButton` is **unchanged**.

### 3b. NavigationTarget (discriminated union)

```typescript
export type NavigationTarget =
  | { kind: 'tab';          tabId: string }
  | { kind: 'section';      sectionId: string }
  | { kind: 'nextStep' }
  | { kind: 'previousStep' }
  | { kind: 'externalUrl';  endpointKey: string }  // C-001: key only, never a URL
  | { kind: 'anotherForm';  formCode: string };
```

### 3c. ExtraParams types

```typescript
export type RuntimeContextKey =
  | 'userId'
  | 'userDisplayName'
  | 'formId'
  | 'formCode'
  | 'formVersion'
  | 'submittedAt'
  | 'locale'
  | 'sessionId';

/** C-004: these keys are always overridden by the backend, regardless of client value. */
export const AUTHORITATIVE_RUNTIME_KEYS: readonly RuntimeContextKey[] = [
  'userId', 'userDisplayName', 'formId', 'formCode', 'formVersion', 'submittedAt', 'sessionId',
] as const;
// 'locale' and 'sessionId' may be client-asserted but are validated/sanitised server-side.

export type ExtraParamSource =
  | { kind: 'static';         key: string; value: string }
  | { kind: 'hiddenField';    key: string; fieldSchemaName: string }
  | { kind: 'runtimeContext'; key: RuntimeContextKey }
  | { kind: 'computed';       key: string; expression: string };

export interface ExtraParamsConfig {
  params: ExtraParamSource[];   // max 50 enforced server-side (NFR-010)
}

/** The fully-resolved server-side object persisted to the audit log. */
export type ExtraParamsResolved = Record<string, unknown>;
```

### 3d. CallApiConfig

```typescript
export interface ResponseFieldMapping {
  jsonPath: string;              // dot-notation path into the response body
  targetFieldSchemaName: string; // form field to write the resolved value into
}

export interface CallApiConfig {
  endpointKey: string;                     // C-001: resolved by backend AllowlistRepository
  requestBodyFields: string[];             // schemaNames of form fields to include in request body
  successMessage: string;
  errorMessage: string;
  responseFieldMappings: ResponseFieldMapping[];
}
```

### 3e. ScopedButton

```typescript
export interface ScopedButton {
  id: string;
  placementScope: PlacementScope;
  placementId: string;                     // GUID of the owning tab or section
  label: string;
  displayOrder: number;
  action: ButtonActionType;
  isPrimary: boolean;
  isVisible: boolean;
  confirmationRequired: boolean;
  confirmationMessage?: string;
  requiresPreviousTabsComplete: boolean;   // OQ-006 ruling: per-button flag, default false
  // Set when action === 'navigate'
  navigationTarget?: NavigationTarget;
  // Set when action === 'finalSubmit'
  extraParamsConfig?: ExtraParamsConfig;
  // Set when action === 'callApi'
  callApiConfig?: CallApiConfig;
}
```

### 3f. Extensions to existing types

```typescript
// In TabDefinition (form.types.ts — add after existing fields):
buttons?: ScopedButton[];     // absent = empty array; backward-compatible

// In SectionDefinition (form.types.ts — add after existing fields):
buttons?: ScopedButton[];

// In AuditLogEntry.eventType union — add:
| 'tab_button_submit'
| 'section_button_navigate'   // not audited per NFR-009 but union member reserved
| 'mid_form_api_call'

// In AuditLogEntry — add optional field:
extraParams?: ExtraParamsResolved;
```

**form.ts mobile additions** are structurally identical: same field names, same type shapes on `ScopedButton`, `NavigationTarget`, `ExtraParamsConfig`, `CallApiConfig`. `TabDefinition` and `SectionDefinition` in form.ts gain `buttons?: ScopedButton[]`.

---

## 4. Dataverse Schema Design

All new attributes carry the `qdb_` publisher prefix. All new columns are optional / nullable to enable zero-downtime deployment. Ownership type and data types are permanent decisions per Constitution Article XI.

### 4a. New Entity: qdb_form_button

**Display name:** Form Button | **Logical name:** qdb_form_button | **Ownership:** User or Team | **Primary key:** `qdb_form_buttonid`

| Logical Name | Dataverse Type | Constraints | Maps To |
|---|---|---|---|
| `qdb_form_buttonid` | Unique Identifier (PK) | System-generated | `ScopedButton.id` |
| `qdb_form_definition_id` | Lookup (qdb_form_definition) | Required | owning form |
| `qdb_placement_scope` | Option Set | tab=1, section=2; Required | `ScopedButton.placementScope` |
| `qdb_placement_id` | Text 36 | GUID of tab or section; Required | `ScopedButton.placementId` |
| `qdb_label` | Text 500 | Required | `ScopedButton.label` |
| `qdb_display_order` | Whole Number | Required, default 0 | `ScopedButton.displayOrder` |
| `qdb_action_type` | Option Set | navigate=1, finalSubmit=2, saveDraft=3, callApi=4; Required | `ScopedButton.action` |
| `qdb_is_primary` | Two Options | default false | `ScopedButton.isPrimary` |
| `qdb_is_visible` | Two Options | default true | `ScopedButton.isVisible` |
| `qdb_confirmation_required` | Two Options | default false | `ScopedButton.confirmationRequired` |
| `qdb_confirmation_message` | Text 1000 | Optional | `ScopedButton.confirmationMessage` |
| `qdb_requires_previous_tabs_complete` | Two Options | default false | `ScopedButton.requiresPreviousTabsComplete` |
| `qdb_navigation_target_json` | Memo 4000 | Optional; JSON-serialised `NavigationTarget` | `ScopedButton.navigationTarget` |
| `qdb_extra_params_config_json` | Memo 4000 | Optional; JSON-serialised `ExtraParamsConfig` | `ScopedButton.extraParamsConfig` |
| `qdb_call_api_config_json` | Memo 4000 | Optional; JSON-serialised `CallApiConfig` | `ScopedButton.callApiConfig` |
| `qdb_is_active` | Two Options | default true | soft delete |
| Standard audit columns | createdon, createdby, modifiedon, modifiedby | Dataverse auto-populated | constitution Article VI |

**Alternate key:** `qdb_form_definition_id` + `qdb_placement_scope` + `qdb_placement_id` + `qdb_display_order` (unique per position, used by the designer to detect ordering conflicts).

**Note on FR-054:** `qdb_button_design` (used by DFE-STYLE-001 for visual styling of FormButton) is a separate entity and is NOT extended or modified by this engagement.

### 4b. New Entity: qdb_api_endpoint (Combined Allowlist)

**Display name:** API Endpoint | **Logical name:** qdb_api_endpoint | **Ownership:** Organisation | **Primary key:** `qdb_api_endpointid`

This entity implements C-001. IT Director manages records under a dedicated CRM security role (`QDB DFE Endpoint Admin`). Form designers and general users have no Create/Update/Delete privilege on this entity.

| Logical Name | Dataverse Type | Constraints | Purpose |
|---|---|---|---|
| `qdb_api_endpointid` | Unique Identifier (PK) | | |
| `qdb_endpoint_key` | Text 100 | Required; unique alternate key | Opaque key sent by client runtimes |
| `qdb_endpoint_url` | Text 2048 | Optional; the resolved target for portal/mobile | Navigate:ExternalUrl destination OR CallApi URL |
| `qdb_crm_action_name` | Text 256 | Optional; CRM Custom Action unique name | On-prem CallApi via Xrm.WebApi.online.execute |
| `qdb_endpoint_type` | Option Set | externalNavigation=1, apiCall=2; Required | Determines which runtime fields apply |
| `qdb_allowed_http_methods` | Text 50 | Optional; e.g. "POST" or "GET,POST" | Validated for callApi type |
| `qdb_description` | Text 500 | Optional | IT-Director notes / purpose |
| `qdb_is_active` | Two Options | default true | Soft-disable without deleting |
| Standard audit columns | | | |

**Alternate key:** `qdb_endpoint_key` — unique constraint enforced at Dataverse level. `AllowlistRepository.resolveEndpointKey(key)` calls `GET /qdb_api_endpoints?$filter=qdb_endpoint_key eq '{key}' and qdb_is_active eq true`.

**Admin security role:** `QDB DFE Endpoint Admin` — grants Create/Read/Update/Delete on `qdb_api_endpoint`, Read on `qdb_form_definition`. Not assignable to form designers or portal users.

**Designer dropdown**: `ButtonEndpointAdminRoutes` exposes `GET /api/admin/button-endpoints?type=apiCall|externalNavigation` returning `{ key, description }[]` for use in the designer endpoint-key selector. Endpoint URLs are NOT returned to the designer — keys only.

### 4c. Extension to qdb_form_audit_log

Add one column to the existing `qdb_form_audit_log` entity:

| Logical Name | Dataverse Type | Length | Purpose |
|---|---|---|---|
| `qdb_extra_params_json` | Memo (Multiline Text) | nvarchar(max) | Resolved ExtraParams JSON after server stamping and expression evaluation |

**OQ-008 decision:** The backend enforces a 64 KB UTF-8 cap on the resolved ExtraParams before writing. Since nvarchar(max) in Dataverse on-prem 9.1 is limited to 1,048,576 characters by the platform, the 64 KB limit is well inside the ceiling. If the CRM Developer's measurement reveals a lower practical ceiling (e.g., plugin context payload limit), the backend cap in `ExtraParamsAssemblyService` is reduced via an environment variable (`MAX_EXTRA_PARAMS_BYTES`, default 65536) without schema changes.

**Append-only policy:** No UPDATE or DELETE on `qdb_form_audit_log` records (existing policy; this column inherits it).

---

## 5. Data-Flow Design

### 5a. Button Render Flow (all surfaces)

```
Publish trigger (designer save)
  → qdb_publish_job created (DFE-RC-001 pattern)
  → Plugin: FormJsonGenerator queries qdb_form_button WHERE form_definition_id = X
  → Each button serialised → placed in tab.buttons[] or section.buttons[]
  → Complete FormDefinition JSON written to qdb_form_render_cache

Runtime loads form:
  GET /api/forms/:formCode/metadata
  → PublishedFormService.getPublishedJson()
  → Returns FormDefinition with tabs[].buttons[] and sections[].buttons[]
  → Frontend / mobile / CRM runtime reads buttons and renders at configured placement
  → isVisible=false buttons: not rendered into DOM (FR-015)
```

### 5b. Navigate Action Dispatch (per surface)

**Tab / Section / NextStep / PreviousStep (in-form):**
```
User clicks ScopedButton (action=navigate)
  → Runtime evaluates requiresPreviousTabsComplete flag
  → If true: run client-side validation on all tabs preceding target; show errors if any
  → Dispatch navigation to tab switch (tab/nextStep/previousStep) or section scroll (section)
  → No backend call; purely client-side state change
```

**Navigate: ExternalUrl:**
```
User clicks ScopedButton (navigationTarget.kind = 'externalUrl')
  → Client POSTs to: GET /api/admin/button-endpoints/validate?key={endpointKey}
  → Backend: AllowlistRepository.resolveEndpointKey(key) → returns {url, type}
  → If not found or type != externalNavigation: return 403; client shows error; NO navigation
  → If found: return {url}; client opens url in new browser tab (window.open(url, '_blank'))
  → Mobile: Linking.openURL(url) from 'expo-linking'
  → CRM on-prem: window.open(url, '_blank') — same as portal
  → No client-supplied URL is ever honoured; the backend owns the destination
```

**Navigate: AnotherForm (C-003 resolved):**

| Surface | Behaviour |
|---|---|
| Next.js portal | Show confirmation dialog: "Leave current form? Unsaved data will be lost." On confirm: update `formCode` in the DFE form loader React state; the form container re-fetches `/api/forms/{formCode}/metadata` and resets formData. No full page reload. Draft is NOT auto-saved before switch (user was warned). |
| React Native mobile | `navigation.push('FormScreen', { formCode: target.formCode })`. Before push: if formData is non-empty and no draft exists, show Alert: "Leave this form?" On confirm: push. Back button returns to the origin form screen (stack retained). |
| CRM on-prem qdb_form_runtime.html | Show confirmation dialog. On confirm: reload the web resource with new URL parameter `formCode={target.formCode}` via `window.location.href = window.location.pathname + '?formCode=...'`. Unsaved state is discarded. No navigation stack. The host model-driven form page is not reloaded. |
| Designer preview | Show a non-navigating banner: "Navigate to form '{formCode}' — disabled in preview mode." No actual navigation occurs in the designer. |

### 5c. FinalSubmit with ExtraParams

```
User clicks ScopedButton (action=finalSubmit)
  → Client: run full-form validation (all tabs/sections); show errors if any (BR-003)
  → Client: assemble ExtraParamsConfig client-side:
      Static: copy key/value pairs directly from button.extraParamsConfig
      HiddenField: read current formState[fieldSchemaName]; null if absent
      RuntimeContext: include as-is from client (backend will override)
      Computed: include raw expression string (NOT evaluated client-side)
  → Client: POST /api/forms/:formCode/submit
      Body: { formData: {...}, extraParams: { params: [...] } }

Backend (/api/forms/:formCode/submit):
  1. Zod validates body (submitSchema extended with optional extraParams)
  2. Size pre-check: if JSON.stringify(extraParams).length > MAX_EXTRA_PARAMS_BYTES → 422
  3. ExtraParamsAssemblyService.resolve(extraParams, formDefinition, user, request):
     a. Assert params.length <= 50 → 422 if exceeded (NFR-010)
     b. For each RuntimeContextKey in AUTHORITATIVE_RUNTIME_KEYS:
        override unconditionally from server state (user JWT, formDefinition, Date.now())
     c. Locale: if client-supplied, validate against form's supported locales list; keep if valid
     d. sessionId: if client-supplied, sanitise (alphanumeric+hyphen, max 64 chars), keep if valid
     e. For each Computed param: ExpressionEngineServer.evaluateWithLimit(expression, formData)
        → on ExpressionError or ExpressionTimeoutError: log with correlationId, substitute null
        → expression evaluation never rejects the submission (FR-042)
     f. Assemble ExtraParamsResolved (flat Record<string, unknown>)
  4. Size post-check after resolution (expression results may expand payload)
  5. CrmSubmissionService.submitForm(formDefinition, formData, userId, displayName)
  6. CrmAuditService.writeAuditEntry({ eventType: 'tab_button_submit' / 'formSubmitted',
       extraParams: resolvedExtraParams })
     → writes qdb_extra_params_json column
  7. Return 201 with submission result

C-004 guarantee: userId, userDisplayName, formId, formCode, formVersion, submittedAt are
overwritten in step 3b. A client that sends userId='admin' gets the server's authoritative
userId from the JWT claim; the spoofed value is never read.
```

### 5d. CallApi Flow

```
User clicks ScopedButton (action=callApi)
  → Client: disable button (BR-008 — in-flight guard)
  → Client: collect requestBodyFields values from formState
  → Client: POST /api/forms/:formCode/call-api
      Body: { endpointKey, requestBody: {fieldKey: value, ...}, formCode, correlationId }

Backend (POST /api/forms/:formCode/call-api):
  1. Zod validates body (endpointKey must match /^[a-zA-Z0-9_-]{1,100}$/)
  2. AllowlistRepository.resolveEndpointKey(endpointKey):
     → not found or type != apiCall → 400 Bad Request; no forward (NFR-004)
  3. Validate HTTP method is within endpoint's qdb_allowed_http_methods
  4. Forward request to resolved URL:
     - Headers: Authorization: Bearer {user's JWT from request.headers.authorization}
     - Body: { formCode, correlationId, data: requestBody }
     - Timeout: 5,000ms
  5. On 2xx from target: return { success: true, data: responseBody } to client
  6. On 4xx/5xx from target: return { success: false, errorCode: target.status } (no leak of backend detail)
  7. On timeout: return { success: false, errorCode: 'TIMEOUT' }
  8. Audit: writeAuditEntry({ eventType: 'mid_form_api_call',
       changedData: { endpointKey, httpStatus, correlationId } }) — NFR-009

CRM on-prem (qdb_form_runtime.html):
  → Does NOT call POST /api/forms/:formCode/call-api
  → Calls Xrm.WebApi.online.execute(actionRequest) where actionRequest is built from:
      qdb_api_endpoint.qdb_crm_action_name (resolved from endpointKey via SAME allowlist entity)
      requestBodyFields values from formState
  → CR-003: the same endpointKey maps to qdb_crm_action_name (on-prem) and qdb_endpoint_url (portal/mobile)
  → On success: parse response → apply responseFieldMappings → show successMessage
  → On failure/timeout: show errorMessage; form remains editable
```

---

## 6. Architecture Decision Records

### ADR-BTN-001: Single Combined Allowlist for External URLs and CallApi Endpoints

**Status:** Accepted
**Date:** 2026-06-30
**Decided by:** Architect (directed by CEO Condition C-001)

**Context:** Two features — Navigate:ExternalUrl and CallApi — both require an IT-admin-managed list of permitted destinations. Designing two separate entities creates governance split and synchronisation risk. The CEO explicitly requires ONE allowlist.

**Decision:** Create a single `qdb_api_endpoint` Dataverse entity with a `qdb_endpoint_type` discriminator (externalNavigation=1, apiCall=2). Both External-URL navigation and CallApi endpoint resolution read from this entity. The client always sends an endpoint KEY; the backend resolves to the actual URL or CRM action name. No client-supplied URL is ever used.

**Security consequence:** Open-redirect and SSRF are closed by the same mechanism. A form designer can only select from the dropdown of active, IT-approved keys. A runtime cannot supply a URL because the API rejects any request where `endpointKey` is not present in the allowlist (returns 400 / 403 respectively).

**Consequence of failure (safe default):** If `AllowlistRepository.resolveEndpointKey()` throws (Dataverse unreachable), the backend returns 503 and the runtime shows the configured `errorMessage`. No destination is used. This is the fail-safe direction.

---

### ADR-BTN-002: CallApi Authentication Model

**Status:** Accepted
**Date:** 2026-06-30
**Decided by:** Architect (directed by CEO Condition C-002; requires QDB IT Director sign-off before Phase 4 build)

**Context:** A mid-form CallApi button needs to authenticate the forwarded request. Options are: (a) user's own Bearer JWT; (b) a service principal credential; (c) no authentication (intranet only).

**Decision:** The backend CallApi proxy forwards the calling user's own Bearer JWT (`Authorization: Bearer {token}` from the inbound request) to the resolved endpoint. The endpoint must be in the same Azure AD tenant as the DFE backend. Cross-tenant endpoints are not supported in v1.

**Rationale:** (a) preserves user-level access control at the target endpoint, which is already the same-tenant expectation; (b) no additional secret management or credential rotation; (c) the target endpoint validates the token independently.

**Limitations recorded here as design constraints for Phase 4:**
- The forwarded token may expire if the user's session is long-running. The target endpoint will return 401. The backend proxy passes this back as `{ success: false, errorCode: 401 }` and the client shows `errorMessage`. No token refresh is attempted by the proxy.
- The JWT contains the user's identity and roles. The target endpoint must not rely on DFE-specific claims.
- Service-principal-based delegated access is deferred to v2.

**IT Director sign-off requirement:** This ADR must be acknowledged by QDB IT Director as a gate before Phase 4 build of CallApi. The IT Director must confirm that the same-tenant-only constraint and the forwarded-JWT model are acceptable for the initial set of registered endpoints.

---

### ADR-BTN-003: Navigate:AnotherForm Cross-Surface Behaviour

**Status:** Accepted
**Date:** 2026-06-30
**Decided by:** Architect (directed by CEO Condition C-003)

**Context:** "Navigate to another DFE form by formCode in the same session" has undefined behaviour on React Native (navigation stack model) and CRM model-driven container (iframe-constrained host). Unresolved at BA phase.

**Decision:** Four surface-specific behaviours (see Section 5b for full detail):
- **Portal:** In-page formCode swap — React form loader re-fetches metadata; no page reload; unsaved data cleared with confirmation.
- **Mobile:** `navigation.push()` — navigation stack preserves the origin screen; back button works.
- **CRM on-prem:** `window.location.href` reload of the web resource URL with new `formCode` parameter; unsaved state discarded; no stack.
- **Designer preview:** Non-navigating banner only; no actual form switch.

**Rationale:** Three different implementations are required because the three runtimes have fundamentally different host environments. The shared contract is: (1) always show a confirmation dialog before discarding unsaved state; (2) the target form is identified by `formCode`, never by a URL; (3) the designer preview never navigates.

**C-003 resolution:** This ADR constitutes the written cross-surface behaviour definition that was required before architecture of the AnotherForm sub-target could begin. The hard gate is lifted.

---

### ADR-BTN-004: ExpressionEngine — Extend, Not Replace (C-005)

**Status:** Accepted
**Date:** 2026-06-30
**Decided by:** Architect (directed by CEO Condition C-005; dependency adoption policy)

**Context:** C-005 requires an assessment of whether the existing safe DSL expression engine supports ExtraParams Computed needs (concat, arithmetic, field-ref, conditional). RISK-002 identified this as high-impact if the engine is insufficient.

**Assessment finding:** The existing `ExpressionEngine` in `shared/src/engines/ExpressionEngine.ts` already implements:
- `concat(a, b, ...)` — string join
- Arithmetic: `+`, `-`, `*`, `/`, `%`
- Field references via `{fieldSchemaName}` syntax
- Ternary `?:` and `if(cond, then, else)`
- String: `upper`, `lower`, `trim`, `len`, `contains`, `startsWith`, `endsWith`, `substr`
- Math: `round`, `floor`, `ceil`, `abs`, `min`, `max`
- Type coercion: `toNumber`, `toString`
- Null checks: `isEmpty`, `isNotEmpty`
- No `eval()`, no `Function()` — pure recursive-descent parser

**Gap:** `formatDate(value, pattern)` is absent. The engine has no built-in timeout mechanism.

**Decision: EXTEND.** Add `formatDate(isoString, pattern)` to `evalCall()` in the existing engine. Create `ExpressionEngineServer` as a thin server-only wrapper that adds a step-count guard (`maxOps: 1_000`) and wraps the synchronous evaluation call. The step counter is incremented on every `evalNode` call; when it reaches `maxOps`, an `ExpressionTimeoutError` is thrown. `maxOps: 1_000` is calibrated to execute within ~50ms on a conservative server benchmark (empirically verified in Phase 4). The `ExpressionEngineServer` is used exclusively on the backend; the frontend and mobile continue to use `ExpressionEngine` directly.

**Why not a new engine:** The existing engine satisfies 95% of requirements. No new third-party library introduces licensing or .NET 4.6.2 compatibility risk. The step-count approach avoids the complexity of `worker_threads` or `vm.runInNewContext` with timeout, which have their own failure modes on constrained environments.

**Adoption decision per dependency policy:** No third-party DSL or expression library is adopted. The existing DFE-owned engine is extended. This decision is documented here as the dependency decision record.

---

### ADR-BTN-005: ExtraParams Persistence — JSON Column on Audit Log

**Status:** Accepted
**Date:** 2026-06-30
**Decided by:** Architect (directed by CEO Condition C-007)

**Context:** OQ-007 asked JSON column vs. child entity. OQ-008 (on-prem memo ceiling) is assigned to the CRM Developer but has not yet been measured.

**Decision:** Add a single `qdb_extra_params_json` Memo (nvarchar(max)) column to the existing `qdb_form_audit_log` entity. The backend enforces a 64 KB UTF-8 cap BEFORE writing. The column stores the server-resolved ExtraParamsResolved object as JSON.

**Rationale for column over child entity:**
- Volume is 1 record per submission (audit log already has one row per submission); no M:1 fan-out.
- 64 KB ceiling (enforced server-side) is well within Dataverse on-prem 9.1 nvarchar(max) ceiling.
- No queryability requirement on individual param keys (downstream consumers read the full JSON).
- A child entity would require a new relationship, a new schema migration in both Dataverse and the C# plugin, and an additional join in every audit query.

**OQ-008 contingency:** If the CRM Developer's measurement reveals that the on-prem memo column has a practical ceiling below 64 KB (e.g., CRM plugin context payload limit applies), the backend cap is reduced to that ceiling via the `MAX_EXTRA_PARAMS_BYTES` environment variable. No schema change is required — the cap reduction is a configuration change only. The C# plugin does not write ExtraParams; the backend writes it directly to Dataverse via the web API.

**Append-only guarantee:** The `qdb_form_audit_log` entity policy (no UPDATE / DELETE) applies to this column. The ExtraParams value written at submission time is permanent.

---

### ADR-BTN-006: ScopedButton Discriminated-Union Action Type Schema

**Status:** Accepted
**Date:** 2026-06-30
**Decided by:** Architect

**Context:** The four action types (navigate / finalSubmit / saveDraft / callApi) have mutually exclusive configuration payloads. The Dataverse persistence model uses memo JSON columns per configuration type. The shared type needs to be unambiguous and TypeScript-exhaustive.

**Decision:** `ScopedButton.action: ButtonActionType` is the discriminant. Three optional sub-config fields (`navigationTarget?`, `extraParamsConfig?`, `callApiConfig?`) carry the action-specific payload. At runtime, only the field corresponding to the active action type is read; the others are ignored.

**Why not a discriminated union on ScopedButton itself:** A strict discriminated union on the outer ScopedButton type (e.g., `ScopedButtonNavigate | ScopedButtonSubmit | ...`) would require four separate Dataverse entity definitions or a complex mapping. The common fields (label, displayOrder, isVisible, isPrimary, etc.) are the same across all action types. The optional-sub-config pattern achieves the same TypeScript exhaustiveness guarantee with simpler Dataverse storage.

**Dataverse:** Three JSON memo columns per record. Only the relevant column is populated per action type. Unpopulated columns are null.

---

### ADR-BTN-007: Shared-Type Dual-File Sync Mechanism (C-006)

**Status:** Accepted
**Date:** 2026-06-30
**Decided by:** Architect

**Context:** `form.types.ts` (backend/frontend) and `form.ts` (mobile) are two separate files that must remain structurally consistent for the types added by this engagement. Prior divergence on existing types (different field names: `id` vs `tabId`) is a historical artefact that is not remediated in this engagement.

**Decision:** New types introduced by DFE-BTN-001 (`ScopedButton`, `NavigationTarget`, `ExtraParamsConfig`, `ExtraParamSource`, `CallApiConfig`, `ResponseFieldMapping`) use **identical field names** in both files. A `ts-morph`-based script (`shared/scripts/check-shared-type-sync.mts`) extracts the member names of these specific types from both files and diffs them. The script exits 1 if any property name is present in one file but absent in the other. This script runs as a CI step in the `shared` package build before `tsc`.

**Scope:** The check covers ONLY the BTN-001 additions. Existing diverged types (`FormButton`, `TabDefinition`, `SectionDefinition`, etc.) are excluded from the check by name.

---

## 7. API Contracts

### 7a. Modified: POST /api/forms/:formCode/submit

**Auth:** Bearer JWT (existing)
**Change:** `extraParams` added as optional body field

```
Request body:
{
  formData: Record<string, unknown>,         // existing — unchanged
  extraParams?: {                            // new, optional
    params: Array<
      | { kind: 'static';         key: string; value: string }
      | { kind: 'hiddenField';    key: string; fieldSchemaName: string }
      | { kind: 'runtimeContext'; key: string }
      | { kind: 'computed';       key: string; expression: string }
    >
  }
}

Response (201):
{
  success: true,
  data: { parentRecordId: string; parentEntityLogicalName: string; referenceNumber: string }
}

Response (422) — ExtraParams cap exceeded:
{
  success: false,
  error: { code: 'EXTRA_PARAMS_TOO_LARGE', message: '...', correlationId: string }
}
```

**Backward compatibility:** If `extraParams` is absent, the endpoint behaves identically to its current behaviour (FR-040, FR-053).

### 7b. New: POST /api/forms/:formCode/call-api

**Auth:** Bearer JWT (required)
**Purpose:** CallApi proxy — resolves endpointKey, forwards to allowlisted URL with user JWT

```
Request body:
{
  endpointKey: string;                       // must match /^[a-zA-Z0-9_-]{1,100}$/
  requestBody: Record<string, unknown>;      // form field values
  correlationId: string;
}

Response (200) — target returned 2xx:
{
  success: true,
  data: Record<string, unknown>              // proxied response body
}

Response (400) — endpointKey not in allowlist or invalid type:
{
  success: false,
  error: { code: 'ENDPOINT_NOT_ALLOWED', message: 'Endpoint key not registered', correlationId }
}

Response (504) — target timed out:
{
  success: false,
  error: { code: 'TIMEOUT', message: 'Endpoint did not respond in time', correlationId }
}

Response (502) — target returned 4xx/5xx (detail NOT leaked):
{
  success: false,
  error: { code: 'UPSTREAM_ERROR', httpStatus: number, correlationId }
}
```

### 7c. New: GET /api/admin/button-endpoints

**Auth:** Bearer JWT + admin role
**Purpose:** Returns active endpoint keys for designer dropdown (keys and descriptions only, no URLs)

```
Query params: ?type=apiCall|externalNavigation

Response (200):
{
  success: true,
  data: Array<{ key: string; description: string; type: string }>
}
```

### 7d. New: GET /api/admin/button-endpoints/validate

**Auth:** Bearer JWT
**Purpose:** Validates an endpoint key for Navigate:ExternalUrl; returns resolved URL if allowed

```
Query params: ?key={endpointKey}

Response (200):
{ success: true, data: { url: string } }

Response (403):
{ success: false, error: { code: 'NOT_ALLOWED', correlationId } }
```

---

## 8. Integration Design

| Integration | Protocol | Auth | Retry | Failure Mode |
|---|---|---|---|---|
| Designer → qdb_form_button (CRUD) | Xrm.WebApi (OData) | CRM session token | Xrm.WebApi built-in (3 retries) | Designer shows save error toast; user retries manually |
| Designer → qdb_api_endpoint (read only) | Xrm.WebApi (OData) | CRM session token | 1 retry after 500ms | Endpoint dropdown shows empty state with warning |
| Backend → qdb_form_button (read) | Dataverse Web API v9.2 | Service principal MSAL | 2 retries with exponential backoff | ButtonAssembler returns empty buttons[]; form renders without scoped buttons |
| Backend → qdb_api_endpoint (read) | Dataverse Web API v9.2 | Service principal MSAL | 2 retries; 5-min in-process cache | AllowlistRepository returns NOT_FOUND; backend returns 400 (fail-secure) |
| Backend → qdb_form_audit_log (write) | Dataverse Web API v9.2 | Service principal MSAL | 1 retry | Non-fatal log failure; submission result still returned to user |
| Backend → resolved callApi endpoint | HTTPS/REST | Forward user Bearer JWT | No retry (single attempt) | 5s timeout → 504; returned to client with generic error |
| CRM on-prem → CRM Custom Action | Xrm.WebApi.online.execute | CRM session token | Built-in CRM retry | Xrm error displayed via configuredErrorMessage |
| FormJsonGenerator.cs → qdb_form_button | CRM OrganizationService SDK | Plugin execution context | Plugin inherits retry policy | Missing button records → empty buttons[]; cache written without buttons (form still renders) |

---

## 9. Security Architecture

| Threat | Control | Where Enforced |
|---|---|---|
| Open redirect via Navigate:ExternalUrl | Client sends endpointKey; backend resolves to URL from `qdb_api_endpoint` allowlist. URL never comes from client. | `AllowlistRepository` + `GET /api/.../validate` endpoint |
| SSRF via CallApi | Same allowlist resolution. Backend never forwards to a URL derived from client input. `endpointKey` validated against `qdb_api_endpoint.qdb_endpoint_type = apiCall`. | `CallApiProxyService` + `AllowlistRepository` |
| RuntimeContext spoofing (userId, formId, formVersion, submittedAt) | Backend `ExtraParamsAssemblyService` unconditionally overwrites all AUTHORITATIVE_RUNTIME_KEYS regardless of client values. | `ExtraParamsAssemblyService.resolve()` — step 3b |
| Expression injection via Computed params | Expressions evaluated only by `ExpressionEngineServer` (no eval/Function). Context is read-only formData. No access to Node.js process, filesystem, or network. Step-count guard = 1,000 ops → ExpressionTimeoutError → null value. | `ExpressionEngineServer` |
| ExtraParams DoS (payload size) | 64 KB UTF-8 cap enforced at backend boundary before expression evaluation AND after. `MAX_EXTRA_PARAMS_BYTES` env var configures the ceiling. | `ExtraParamsAssemblyService` — steps 2 and 4 |
| ExtraParams count DoS | Max 50 param entries checked before processing. 422 on excess. | `ExtraParamsAssemblyService` — step 3a |
| Static-key namespace collision (client sends reserved key as Static) | BR-004: any Static key matching a RuntimeContextKey is silently overridden by the authoritative value. No error returned; the authoritative stamp happens unconditionally. | `ExtraParamsAssemblyService` — step 3b |
| Allowlist governance bypass (designer adds URLs) | `qdb_api_endpoint` entity grants no Create/Update/Delete to form designers or portal users. Only `QDB DFE Endpoint Admin` CRM role has write access. | Dataverse security role |
| Endpoint URL disclosure to client | `GET /api/admin/button-endpoints` returns key + description only, never the resolved URL. URL resolution happens server-side only. | `ButtonEndpointAdminRoutes` — response shape |
| CallApi token forwarding scope | Bearer JWT forwarded only to endpoints in `qdb_api_endpoint` allowlist. Same-tenant only. Backend does not refresh or amplify the token. | `CallApiProxyService` — ADR-BTN-002 |
| Audit record tampering | `qdb_form_audit_log` is append-only (constitution Article VI). No UPDATE/DELETE is issued on this entity. | Dataverse plugin registration + backend code |
| Button configuration injection (JSON memo columns) | JSON serialised by `ButtonDesignService` using `JSON.stringify`. Parsed by `FormJsonGenerator` using Newtonsoft.Json with type-safe binding. No eval on memo JSON. | `ButtonDesignService`, `FormJsonGenerator.cs` |

---

## 10. Backward Compatibility

| Surface | Guarantee |
|---|---|
| Existing published forms | `buttons?: ScopedButton[]` on TabDefinition/SectionDefinition defaults to `undefined`; all runtimes treat absent or empty as no scoped buttons. FormActionBar continues to render unchanged. |
| Existing POST /submit body | `extraParams` is optional. Existing clients that send only `formData` are unaffected (FR-053). |
| FormButton + FormActionBar | The `qdb_button_design` entity and FormButton type are unchanged. Their rendering path is not modified. |
| Render cache payload | New `buttons[]` fields are additive. Existing runtimes that do not read `tab.buttons` or `section.buttons` will ignore the new arrays. |
| AuditLogEntry | `extraParams` is optional on the type and on the Dataverse write. Existing audit reads that do not expect this field are unaffected. |

---

## 11. Deployment and Rollback Sequencing

All steps are additive. Rollback at any step leaves the system in a working state for existing forms.

**Phase 1 — Dataverse schema (CRM Developer)**
1. Create `qdb_form_button` entity with all columns. Verify `QDB DFE Endpoint Admin` role.
2. Create `qdb_api_endpoint` entity with unique alternate key on `qdb_endpoint_key`.
3. Add `qdb_extra_params_json` Memo column to `qdb_form_audit_log`.
4. Seed IT-Director-approved initial records in `qdb_api_endpoint`.
5. Pack in managed solution `QdbDfeButtons_v1_0_0_0`. Deploy via PAC CLI. Publish customisations.

**Phase 2 — Backend (Backend Developer)**
1. Deploy `AllowlistRepository`, `ExtraParamsAssemblyService`, `CallApiProxyService`, `ButtonAssembler`, `ExpressionEngineServer`.
2. Extend `submitSchema` and `/submit` handler. Add `/call-api` and `/admin/button-endpoints` routes.
3. Environment variables: `MAX_EXTRA_PARAMS_BYTES=65536`, `EXPRESSION_MAX_OPS=1000`.
4. Rollback: backend deploy is backward-compatible (no existing route changed in breaking way).

**Phase 3 — Render cache + C# plugin (CRM Developer)**
1. Extend `FormJsonGenerator.cs` to query and embed `qdb_form_button` records.
2. Build + ILRepack. Register updated plugin step on `qdb_publish_job` post-create.
3. Trigger a republish for each form to regenerate the render cache with button data.
4. Rollback: old plugin build produces JSON without `buttons[]`; runtimes treat absent as empty array.

**Phase 4 — Frontend portal + mobile + designer (Frontend / Mobile)**
1. Deploy shared type additions first (`@qdb/shared` package bump to 1.x.y).
2. Frontend portal: renders `ScopedButton[]` from FormDefinition; handles navigate / submit / draft / callApi.
3. Mobile: React Native same.
4. Designer: ScopedButtonsPanel, ScopedButtonEditor, ExtraParamsConfigPanel added to TabProperties and SectionProperties; ButtonDesignService wired.
5. Cache invalidation: on any button add/edit/delete in designer, trigger `qdb_publish_job` (existing DFE-RC-001 pattern).
6. Rollback: shared type is backward-compatible; designer panels are additive accordion items.

**Render cache invalidation:** No special mechanism beyond the existing `qdb_publish_job` flow. Button changes in the designer trigger a publish job on save, exactly as field/section/tab changes do.

---

## 12. Shared-Type Extension Plan — DFE-BTN-001 and DFE-STYLE-001 Coordination (C-008)

### Contended surfaces

| Surface | DFE-BTN-001 change | DFE-STYLE-001 change | Collision risk |
|---|---|---|---|
| `form.types.ts` | Add ScopedButton + related types; extend TabDefinition/SectionDefinition | None (STYLE-001 uses `design.types.ts`) | LOW — no overlap |
| `form.ts` | Same additions | None | LOW |
| `designer/src/designer/properties/TabProperties.tsx` | Add `<AccordionItem value="buttons">` | Add `<AccordionItem value="style">` | MEDIUM — same file, different accordion items |
| `designer/src/designer/properties/SectionProperties.tsx` | Add `<AccordionItem value="buttons">` | Add `<AccordionItem value="style">` | MEDIUM — same file |
| `designer/src/state/designerStore.ts` | Add `scopedButtons` slice | Add `designPayload` slice | LOW — independent state slices |

### Sequencing decision

1. **DFE-BTN-001 builds shared types first.** Since STYLE-001 does not touch `form.types.ts` or `form.ts`, there is no merge conflict. BTN-001 adds its types and bumps the shared package version.

2. **Designer property panels:** A single developer is responsible for the final merge of both engagements' accordion items into `TabProperties.tsx` and `SectionProperties.tsx`. The build sequence is:
   - BTN-001 produces `ScopedButtonsPanel.tsx` as a standalone component file.
   - STYLE-001 produces its style panel components as standalone files.
   - One merge commit adds both `<AccordionItem value="buttons">` (BTN-001) and `<AccordionItem value="style">` (STYLE-001) to `TabProperties.tsx` and `SectionProperties.tsx`.
   - Neither engagement's developer edits the host file independently; the merge is a single controlled change.

3. **If STYLE-001 Phase 4 build starts before BTN-001 Phase 4:** STYLE-001 adds its accordion items first. BTN-001 then adds its accordion items alongside. No destructive change in either direction.

4. **designerStore.ts:** Both engagements add independent Zustand slices. No conflict. PRs can merge in any order.

---

## 13. C-006 CI Consistency Check — Specification

**File:** `shared/scripts/check-shared-type-sync.mts`
**Tool:** `ts-morph` (already a dev dependency of the shared package if used by STYLE-001; else add as devDependency)
**Trigger:** Run in `shared` package `prebuild` script and in the `validate` GitHub Actions workflow step.

**Logic:**
```
1. Create ts-morph Project
2. Add source files: 'src/types/form.types.ts' and 'src/types/form.ts'
3. For each WATCHED_TYPE in ['ScopedButton', 'NavigationTarget', 'ExtraParamSource',
                             'ExtraParamsConfig', 'CallApiConfig', 'ResponseFieldMapping',
                             'RuntimeContextKey', 'ButtonActionType', 'PlacementScope']:
   a. Extract member names from form.types.ts (interface members, union branches, or type alias members)
   b. Extract member names from form.ts
   c. Compute symmetric difference
   d. If symmetric difference is non-empty: record failure with details
4. If any failure recorded: print diff report; process.exit(1)
5. Else: print 'shared-type-sync: all BTN-001 types consistent' ; process.exit(0)
```

**CI step (GitHub Actions workflow):**
```yaml
- name: Check shared type sync (C-006)
  working-directory: projects/dynamic-form-engine/shared
  run: npx tsx scripts/check-shared-type-sync.mts
```

**Failure demonstration (Phase 7 requirement):** A test commit that removes one property from `ScopedButton` in `form.ts` only must be demonstrably rejected by this step. This demonstration is a Phase 6 / Phase 7 gate.

---

## 14. Open Items for Phase 4

| Item | Status | Owner | Gate |
|---|---|---|---|
| OQ-008: Measure on-prem CRM 9.1 practical memo column ceiling for ExtraParams JSON | OPEN — assigned to CRM Developer | CRM Developer + QDB IT | Must report before Phase 4 backend build begins; ADR-BTN-005 contingency applies |
| ADR-BTN-002 QDB IT Director sign-off on CallApi auth model (forwarded user JWT, same-tenant only) | OPEN | QDB IT Director | Hard gate before Phase 4 CallApi build |
| C-001 QDB IT Director governance confirmation (admin-only allowlist, dedicated CRM security role) | OPEN | QDB IT Director | Hard gate before Phase 4 build of ExternalUrl/CallApi features |
| Initial `qdb_api_endpoint` seed data (approved domains + CRM action names) from QDB IT Director | OPEN | QDB IT Director | Required for staging end-to-end test of ExternalUrl and CallApi |
| Mobile Developer confirmation: `navigation.push()` available for Navigate:AnotherForm; `Linking.openURL()` available for ExternalUrl | OPEN | Mobile Developer | Confirm in Phase 4 planning; architecture decision in ADR-BTN-003 does not change |
| Mobile Developer confirmation: React Native scroll-to-section available (OQ-003) | OPEN | Mobile Developer | Non-blocking; fallback = scroll to top of section's Y-offset; document in Phase 4 |
| ExpressionEngineServer step-count calibration (empirical timing of maxOps=1000) | Phase 4 task | Backend Developer | Must verify ≤50ms on test server before go-live |

---

## 15. CEO Conditions Status

| Condition | Status in this Architecture |
|---|---|
| C-001: Single admin-managed allowlist | SATISFIED — `qdb_api_endpoint` entity + `AllowlistRepository`. Designer cannot write. IT Director governance role defined. Both ExternalUrl and CallApi resolve from same source. Awaiting QDB IT Director sign-off (governance gate, not technical). |
| C-002: CallApi auth model | SATISFIED — ADR-BTN-002: forwarded user JWT, same-tenant. Awaiting QDB IT Director sign-off (hard gate before Phase 4 build). |
| C-003: Navigate:AnotherForm cross-surface | SATISFIED — ADR-BTN-003: all four surfaces defined. Hard gate lifted. |
| C-004: Authoritative RuntimeContext keys | SATISFIED — `AUTHORITATIVE_RUNTIME_KEYS` constant defined in shared type; `ExtraParamsAssemblyService` stamps unconditionally. |
| C-005: Computed expression sandbox | SATISFIED — ADR-BTN-004: extend existing `ExpressionEngine`; `ExpressionEngineServer` with step-count guard; `formatDate` addition; no eval/Function; server-side only. |
| C-006: Shared-type CI consistency check | SATISFIED — `check-shared-type-sync.mts` specified; CI step defined. Phase 4 delivers the implementation. |
| C-007: ExtraParams persistence + size cap | SATISFIED — ADR-BTN-005: JSON column on `qdb_form_audit_log`; 64 KB cap enforced server-side; `MAX_EXTRA_PARAMS_BYTES` env var for contingency. OQ-008 measurement pending. |
| C-008: DFE-STYLE-001 coordination | SATISFIED — sequencing plan in Section 12; no collision on shared types; designer panel merge strategy defined. |
| OQ-006: requiresPreviousTabsComplete flag | SATISFIED — per-button field on `ScopedButton`; default false; applied on all Navigate actions where next/previous tab logic runs. |

---

## 16. Skeptic Review

> CHALLENGE 1 — AllowlistRepository (C-001): The 5-minute in-process cache on `AllowlistRepository` means a rogue endpoint key cannot be revoked instantly. An IT Director who discovers an error and deletes a `qdb_api_endpoint` record must wait up to 5 minutes before the backend stops forwarding to it. For ExternalUrl navigation this may be acceptable; for a CallApi forwarding SSRF scenario it could be a live window of attack. What is the actual invalidation mechanism? Does the cache need an `invalidateAllowlist` admin endpoint?

> CHALLENGE 2 — ExpressionEngineServer step count: A step-count guard of 1,000 was proposed, but "calibrated empirically in Phase 4" is not an architecture guarantee. What if a legitimate concat of 30 fields hits the limit? The architecture does not specify what happens to the submission in that case — the expression evaluates to null and the submission proceeds. Is a null fullName in ExtraParams acceptable for the downstream CRM integration, or does it break the CRM field write? This needs to be contractually stated.

> CHALLENGE 3 — CallApi proxy timeout at 5 seconds: The existing submit endpoint SLA is 2,000ms at p95 (NFR-001). A CallApi invocation can take up to 5 seconds. If CallApi is chained inside a FinalSubmit button's flow (they are separate actions, but a user might click both in sequence), the combined latency could breach the SLA. Does the 5-second CallApi timeout need to be reduced to stay within the overall session latency budget?

> CHALLENGE 4 — Navigate:AnotherForm on CRM on-prem via window.location.href reload: The reload restores the web resource to a clean state. If the CRM model-driven form has a record context (e.g., the DFE form was opened on a specific qdb_application record), the reloaded web resource must receive that record context again via the query string. The architecture does not specify how the host entity ID and entity type are carried through the reload. If the reload loses the record context, the next form cannot write to the parent record.

> CHALLENGE 5 — qdb_form_button.qdb_placement_id as Text(36): The architecture stores the tab or section GUID as a plain text column rather than a proper lookup to `qdb_form_tab` or `qdb_form_section`. This means Dataverse cannot enforce referential integrity — a button record pointing to a deleted tab will silently persist. The FormJsonGenerator must defensively handle orphaned button records without crashing the publish.

> CHALLENGE 6 — ExtraParamsAssemblyService size check timing: The 64 KB pre-check is on the raw client payload before expression evaluation. The post-check is after evaluation. But the pre-check validates `JSON.stringify(extraParams)` — the client's body. If a Computed expression evaluates to a very large string (e.g., `substr(fieldWithHugeMemo, 0, 65000)`), the pre-check passes but the post-check fails and the submission is rejected AFTER formData has already been processed but before the audit log write. Is this transactional? What is the rollback state if the submission records have been created in Dataverse but the audit log write with ExtraParams fails the size check?

> CHALLENGE 7 — CI type sync check using ts-morph property name extraction: `NavigationTarget` is a discriminated union, not an interface. `ts-morph` extraction of "member names" from a union is different from extracting interface properties. The architecture does not specify how union branch comparison is implemented. If form.types.ts defines `{ kind: 'tab'; tabId: string }` and form.ts defines `{ kind: 'tab'; targetTabId: string }`, the branch structure differs but the top-level `kind` discriminant is present in both. Is the check deep enough to catch field-name drift within union branches?

> CHALLENGE 8 — Backward compatibility of AuditLogEntry.eventType extension: The `eventType` union in `form.types.ts` is currently consumed by `CrmAuditService` which may have exhaustive switch statements. Adding new union members (`tab_button_submit`, `mid_form_api_call`) will cause TypeScript exhaustiveness errors in any switch without a default branch. Phase 4 developers must audit all switches on `eventType` before adding union members. This risk is unmitigated in the current design.

These challenges must be addressed before Phase 4 begins.

---

## ADR Index

| ADR | Title | Status | Date | Decided by |
|---|---|---|---|---|
| ADR-BTN-001 | Single Combined Allowlist for External URLs and CallApi Endpoints | Accepted | 2026-06-30 | Architect |
| ADR-BTN-002 | CallApi Authentication Model (forwarded user JWT, same-tenant) | Accepted | 2026-06-30 | Architect (QDB IT Director sign-off required) |
| ADR-BTN-003 | Navigate:AnotherForm Cross-Surface Behaviour | Accepted | 2026-06-30 | Architect |
| ADR-BTN-004 | ExpressionEngine — Extend, Not Replace | Accepted | 2026-06-30 | Architect |
| ADR-BTN-005 | ExtraParams Persistence — JSON Column on Audit Log | Accepted | 2026-06-30 | Architect |
| ADR-BTN-006 | ScopedButton Discriminated-Union Action Type Schema | Accepted | 2026-06-30 | Architect |
| ADR-BTN-007 | Shared-Type Dual-File Sync Mechanism (CI check) | Accepted | 2026-06-30 | Architect |
