# Phase 3 — Architecture Addenda
## Dynamic Form Engine Portal — QDB
## DFE-ADD-001 (Info-Card Screens) + DFE-ADD-002 (Boolean Field, Interactive Grid, Tab-Aware Buttons)

**Prepared by:** Maqsad AI — Solution Architect
**Date:** 2026-06-06
**Version:** 1.0
**Status:** Complete — Pending Phase 4 Build Authorization
**Parent document:** phase-3-arch.md v1.0 (ADR-001 through ADR-011)

---

## System Overview

This document extends the approved Phase 3 architecture (phase-3-arch.md) to cover the two CEO-approved BRD addenda. DFE-ADD-001 introduces a read-only pre-form information sequence (Info-Card Screens) rendered before the first data-entry tab. DFE-ADD-002 introduces three field-level and UX enhancements: a Boolean field type with configurable labels, an Interactive Grid field type operating in two modes (Selection and Entry), and system-managed tab-aware placement of Save & Draft and Submit buttons. All extensions are additive: they modify no previously approved component contract, introduce no new external system dependencies beyond Dataverse, and respect the existing security, authentication, and deployment architecture.

---

## 1. Integration Points with Existing Architecture

The following existing components are touched by these addenda. No component is replaced; all changes are additive extensions.

| Existing Component | ADD-001 Change | ADD-002 Change |
|---|---|---|
| `GET /api/forms/:formCode/metadata` | Response schema extended with `infoCards[]` array | Response schema extended with new `FieldType` values and `gridConfig` |
| `CrmMetadataService` | Fetches 3 new entities (`qdb_info_card_screen`, `qdb_info_card_section`, `qdb_info_card_item`) | Fetches `qdb_grid_column_config`; reads 7 new attributes on `qdb_form_field` |
| `MetadataLruCache` | Cache TTL unchanged; cache object grows ~2–8 KB per form with Info-Cards | Cache object grows ~1–4 KB per grid field with column configs |
| `FormDefinition` (shared type) | Extended with `infoCards: InfoCardScreen[]` and two new flags | Extended with new `FieldType` union members and `GridFieldConfig` |
| `FieldRenderer.tsx` | No change | Two new dispatch cases: `boolean`, `interactive-grid` |
| `DynamicFormRenderer.tsx` | Phase awareness: render InfoCardFlow before TabRenderer | Tab-aware button logic: reads `allowSaveDraft`, computes `finalTabId` |
| `useDraft` hook | Draft resume path gains info-card bypass logic | Draft payload schema extended for grid state |
| `CrmSubmissionService` | No change | `$batch` changeset logic extended to include Entry Grid child records |
| `CrmAuditService` | New event: `info_card_screen_viewed` | New events: `grid_selection_changed`, `grid_row_added`, `grid_row_deleted` |
| `qdb_form_audit_log` | Existing entity; no schema change | Existing entity; no schema change |

---

## 2. DFE-ADD-001 — Info-Card Screens Architecture

### 2.1 System Context

Info-Card Screens are purely read-only screens. No RHF state, no validation engine, no draft creation, and no Dataverse write occurs while a user is on an Info-Card Screen. The entire Info-Card sequence is driven from the single metadata API response already loaded when the user navigates to the form. Zero additional API calls are made during Info-Card navigation.

The first-view audit event (`info_card_screen_viewed`) is the only write operation associated with this feature, and it is fire-and-forget: it does not block screen navigation and its failure does not degrade the user experience.

Draft resume unconditionally bypasses the Info-Card sequence and navigates directly to the last-saved tab. This applies to all three resume paths: direct URL resume, session timeout resume, and Save & Draft resume. This is enforced in the navigation state machine, not in metadata.

### 2.2 Component Architecture

```
frontend/src/
├── components/
│   ├── info-card/
│   │   ├── InfoCardFlow.tsx              # Orchestrates screen index state; renders one InfoCardScreen at a time
│   │   ├── InfoCardScreen.tsx            # Renders one screen: icon, H1, sub-heading, sections, navigation bar
│   │   ├── InfoCardSectionRenderer.tsx   # Dispatches to correct section layout by sectionType
│   │   ├── sections/
│   │   │   ├── NumberedStepsSection.tsx  # type="numbered-steps": ordered list of numbered items
│   │   │   ├── IconListSection.tsx       # type="icon-list": items with Fluent UI icon + title + description
│   │   │   └── DownloadListSection.tsx   # type="download-list": items with download anchor + title
│   │   ├── InfoCardNavBar.tsx            # Continue / Back / Start / Skip controls
│   │   └── InfoCardProgressStep.tsx      # Read-only step indicator if qdb_infocard_counts_in_progress = true
├── hooks/
│   └── useInfoCardNavigation.ts          # State machine: screenIndex, canGoBack, isLastScreen, skipAll
```

**Component responsibilities:**

`InfoCardFlow.tsx` — owns the navigation state machine (current screen index). Receives the full `infoCards: InfoCardScreen[]` array from the `FormDefinition` passed down by `FormPage.tsx`. Emits an `onComplete()` callback when the user reaches the form (via Start or Skip). Calls `useInfoCardNavigation` for state transitions. Calls the `auditService.recordFirstView()` on mount for each screen, with the first-view guard evaluated before the write is issued.

`InfoCardScreen.tsx` — pure presentational component. Receives a single `InfoCardScreen` object and renders the icon (with alt), H1, sub-heading, and the ordered section list. Manages `<title>` element update for accessibility (FR-071). On mount, sets focus to the H1 heading element (FR-072).

`InfoCardSectionRenderer.tsx` — dispatches to `NumberedStepsSection`, `IconListSection`, or `DownloadListSection` based on `section.sectionType`. Renders the callout block at the section bottom when `section.noteText` is non-null.

`InfoCardNavBar.tsx` — rendered at the bottom of each `InfoCardScreen`. Renders "Back" (disabled or hidden on screen 0), "Continue" (on screens 0..N-2), "Start" (on screen N-1), and optionally "Skip" when `formDefinition.allowInfocardSkip` is true. All controls are native `<button>` elements.

`useInfoCardNavigation.ts` — pure state hook. Returns `{ currentIndex, goNext, goPrev, skipAll, isFirstScreen, isLastScreen }`. No side effects.

### 2.3 Navigation State Machine

```
State: { phase: 'info-cards', screenIndex: number }
        | { phase: 'form', activeTabId: string }

Transitions:
  NEXT         screenIndex < N-1  →  screenIndex + 1 (stay in info-cards)
  NEXT         screenIndex = N-1  →  phase = 'form', activeTabId = tabs[0].tabId
  BACK         screenIndex > 0    →  screenIndex - 1
  SKIP                            →  phase = 'form', activeTabId = tabs[0].tabId
  DRAFT_RESUME                    →  phase = 'form', activeTabId = draft.lastSavedTabId

Entry point:
  if (formDefinition.infoCards.length > 0 AND phase is NOT draft_resume)
    → start in 'info-cards' phase, screenIndex = 0
  else
    → start directly in 'form' phase

Draft resume detection:
  useDraft hook signals isDraftResume = true when a draft is loaded.
  FormPage.tsx passes isDraftResume to the navigation state machine.
  When isDraftResume = true, phase initialises as 'form' regardless of
  whether infoCards.length > 0.
```

The navigation state machine lives in `FormPage.tsx` as a `useReducer`. `InfoCardFlow` receives `currentScreenIndex` and the transition callbacks. `DynamicFormRenderer` receives `activeTabId`. The two rendering trees are mutually exclusive: when `phase = 'info-cards'`, `DynamicFormRenderer` is not mounted (no RHF context, no rule engine, no validation engine, no draft writes).

### 2.4 First-View Audit Strategy

**Requirement:** Audit the `info_card_screen_viewed` event once per user per form, not on every navigation visit (Q-006 resolution).

**Storage:** A new boolean attribute `qdb_info_card_viewed` is stored on the `qdb_form_draft` record and on a new lightweight entity `qdb_info_card_view_record` for users who never create a draft (they complete without saving).

**Preferred approach — dual flag strategy:**

Option A (draft-present users): When a draft exists for this user + form, the backend checks `qdb_info_card_viewed` on the draft record. If false, the audit event is written on first Info-Card screen mount and the flag is set to true via `PATCH /api/drafts/:draftId { infoCardViewed: true }`. Subsequent visits within the same draft session skip the audit write.

Option B (no-draft users): A lightweight `qdb_info_card_view_record` entity stores one record per `(user_aad_object_id, form_definition_id)` pair. The backend checks `GET /api/forms/:formCode/infocard-view-status` before the first screen renders. If no record exists, the audit event is written once and a record is created. If a record exists, the audit event is skipped.

**Data flow:**

```
InfoCardFlow.tsx mounts
  → calls GET /api/forms/:formCode/infocard-view-status
  → Backend: CrmAuditService.hasViewedInfoCard(userId, formCode)
    → checks qdb_info_card_view_record for (userId, formCode)
    → if not found:
        POST /api/data/v9.2/qdb_form_audit_logs { eventType: 'info_card_screen_viewed', ... }
        POST /api/data/v9.2/qdb_info_card_view_records { userId, formCode, viewedOn }
    → returns { hasViewed: boolean }
  → InfoCardFlow caches result in component state; no further backend calls
    during within-session navigation between Info-Card screens
```

**Failure handling:** If the view-status check or the audit write fails (Dataverse unavailable), the user is still shown the Info-Card screens. The audit failure is logged with correlation ID. This is consistent with the fire-and-forget audit pattern already established in phase-3-arch.md section 15.

**New entity: `qdb_info_card_view_record`**

| Attribute | Type | Description |
|---|---|---|
| `qdb_info_card_view_record_id` | GUID (PK) | Unique identifier |
| `qdb_user_aad_object_id` | String(36) | User's Azure AD object ID |
| `qdb_form_definition_id` | Lookup | FK to `qdb_form_definition` |
| `qdb_viewed_on` | DateTime | UTC timestamp of first view |
| `createdon` | System | Audit column |

Index: composite unique index on `(qdb_user_aad_object_id, qdb_form_definition_id)` to enforce one-record-per-user-per-form and to serve the lookup efficiently. Dataverse custom unique constraint via alternate key.

### 2.5 New API Endpoint

**GET /api/forms/:formCode/infocard-view-status**

- Auth: Bearer token (authenticated user; same role check as form metadata)
- Path param: `formCode`
- Response 200: `ApiResponse<{ hasViewed: boolean }>`
- Response 404: form not found or inactive
- Latency target: < 100 ms (single Dataverse lookup against indexed alternate key)

This endpoint is called once per form session, on first mount of `InfoCardFlow`. The result is cached in component state for the session duration.

### 2.6 Metadata API Extension (DFE-ADD-001)

The existing `GET /api/forms/:formCode/metadata` response is extended. The `FormDefinition` type gains:

```
FormDefinition (extended)
  + allowInfocardSkip: boolean          (from qdb_allow_infocard_skip)
  + infocardCountsInProgress: boolean   (from qdb_infocard_counts_in_progress)
  + infoCards: InfoCardScreen[]         (empty array when no screens defined)

InfoCardScreen
  - screenId: string
  - displayOrder: number
  - iconUrl: string | null
  - iconAltText: string | null
  - heading: string
  - subHeading: string | null
  - sections: InfoCardSection[]

InfoCardSection
  - sectionId: string
  - displayOrder: number
  - sectionTitle: string | null
  - sectionType: 'numbered-steps' | 'icon-list' | 'download-list'
  - noteText: string | null
  - items: InfoCardItem[]

InfoCardItem
  - itemId: string
  - displayOrder: number
  - itemTitle: string
  - itemDescription: string | null
  - iconReference: string | null
  - downloadUrl: string | null
```

`CrmMetadataService.assembleFormDefinition()` is extended to:
1. Fetch all active `qdb_info_card_screen` records for the form definition, ordered by `qdb_display_order` ascending
2. For each screen, fetch all active `qdb_info_card_section` records, ordered by `qdb_display_order` ascending
3. For each section, fetch all active `qdb_info_card_item` records, ordered by `qdb_display_order` ascending
4. Assemble into the `InfoCardScreen[]` nested structure

These fetches are added to the existing `$batch` OData read already used for metadata assembly. They add at most 3 additional batch entries (one per entity level). The LRU cache TTL and key scheme are unchanged — the cache object grows by the Info-Card payload size (estimated 2–8 KB per form).

### 2.7 Progress Indicator Integration

When `formDefinition.infocardCountsInProgress` is true, `FormNavigation.tsx` is extended to prepend read-only step indicators for each Info-Card screen before the data-entry tab steps. These read-only steps:
- Use a distinct visual style (no click handler, no completion indicator)
- Are counted in the total step count shown to the user
- Are not navigable by clicking (users cannot click back to an Info-Card from a form tab)

When `infocardCountsInProgress` is false (the default), `FormNavigation.tsx` renders exactly as before.

### 2.8 Admin Download URL Validation (ADD-001-C3)

The admin configuration screen enforces at save time that `qdb_download_url` on `qdb_info_card_item` records is either null or an absolute HTTPS URL. The validation is applied in the backend `POST /api/admin/info-card-items` and `PATCH /api/admin/info-card-items/:id` handlers using the following logic:

1. If `downloadUrl` is present, validate with `new URL(value)` — catches malformed URLs
2. Assert `url.protocol === 'https:'` — reject HTTP and non-URL schemes
3. Return `422` with descriptive error message if either check fails

The portal rendering layer treats `downloadUrl` as an opaque string. It renders the download link as `<a href={item.downloadUrl} target="_blank" rel="noopener noreferrer">`. No URL validation is performed in the frontend — validation is a configuration-time responsibility enforced at admin save time only.

---

## 3. DFE-ADD-002 — Boolean Field Type Architecture

### 3.1 Component Architecture

```
frontend/src/
├── components/
│   └── fields/
│       └── BooleanField.tsx   # Renders toggle or radio-pair based on renderStyle
```

`BooleanField.tsx` is a new entry in the existing `fields/` directory. `FieldRenderer.tsx` gains one new dispatch case: `case 'boolean': return <BooleanField ... />`.

**Toggle mode:** Renders a Fluent UI `Switch` component with `trueLabel` positioned on the checked side and `falseLabel` on the unchecked side. The `<Switch>` is wrapped in a `<Field>` with `label={field.displayLabel}` for accessible labelling (FR-097).

**Radio-pair mode:** Renders a Fluent UI `RadioGroup` with two `<Radio>` children — first child value `"true"` with label `trueLabel`, second child value `"false"` with label `falseLabel`. The `RadioGroup` is wrapped in a `<Field>` with `label={field.displayLabel}`.

**Value contract:** Both modes store the field value in React Hook Form as a native JavaScript boolean (`true` or `false`). The `FieldRenderer` does not transform label strings. When no interaction has occurred and no default is set, the RHF value is `undefined` (not null, not a string). This ensures the `REQUIRED` validation rule correctly fails on submission (FR-096, BR-020).

**Read-only state:** When the rule engine emits `READONLY_FIELD` for this field, `BooleanField` renders the Fluent UI control in its `disabled` prop state. The current value remains visible.

**Misconfiguration guard (BR-019):** `FieldRenderer.tsx` checks that `field.trueLabel` and `field.falseLabel` are non-empty strings before dispatching to `BooleanField`. If either is absent or empty, `FieldRenderer` renders nothing and calls `logger.error` with `{ fieldId, fieldKey, error: 'boolean_field_missing_labels' }`. This is a backend-structured log entry surfaced via the API's pino logger when the metadata is assembled — the admin screen prevents this state, but the portal is defensive at render time.

### 3.2 Validation Engine Integration

`ValidationEngine.buildZodSchema` handles `FieldType = 'boolean'` by building:

```
z.boolean().optional()                         // base: unset is valid by default
  .refine(..., message)                        // REQUIRED rule: must not be undefined
```

The `REQUIRED` validation rule for a boolean field translates to a `.refine(val => val !== undefined, { message })` refinement, not `.min(1)` (which applies to strings). The `ValidationRuleType` mapping table in phase-3-arch.md section 7.1 is extended with:

| FieldType | REQUIRED rule | Zod chain |
|---|---|---|
| `boolean` | Value must be `true` or `false` (not `undefined`) | `.refine(val => val !== undefined, message)` |

### 3.3 Rule Engine Integration

The rule engine treats boolean field values as first-class facts. The json-rules-engine `facts` object already contains the full RHF values snapshot. For a boolean field, the fact value is `true`, `false`, or `undefined`. No rule engine changes are required — the existing operators (`equal`, `notEqual`, `defined`, `undefined`) work against these values natively.

`SET_VALUE` rule action for a boolean field: `actionParams.setValue` must be the boolean primitive `true` or `false`. The `RuleEngine` class passes this value directly to RHF `setValue(fieldKey, value)`.

### 3.4 Draft Persistence

The draft payload `qdb_field_values_json` already serialises the full RHF values map. `JSON.stringify(true)` → `"true"`, `JSON.stringify(false)` → `"false"`, `JSON.stringify(undefined)` → field key is omitted from the JSON object (standard JSON serialisation behaviour). On resume, `JSON.parse` restores `true` and `false` as boolean primitives. For an unset field (key absent from JSON), RHF receives `undefined` on hydration — the correct initial state.

No draft schema changes are required for the Boolean field type.

### 3.5 Submission Mapping Guard (BR-020)

`CrmSubmissionService` validates the submission mapping for boolean fields before issuing the Dataverse write. It checks that the `qdb_target_attribute` for a boolean field maps to a Dataverse `TwoOptions` attribute type. If the mapping points to a text or other attribute type, the service returns a `400 Bad Request` with `{ error: 'boolean_submission_mapping_type_mismatch', fieldKey, targetAttribute }` before any record is created. This guard prevents silent data corruption and gives the form author an actionable error message.

The validation is performed by calling the Dataverse metadata API (`GET /EntityDefinitions(LogicalName='{entity}')/Attributes(LogicalName='{attribute}')`) for each boolean field in the submission mapping the first time a form is submitted. The result is cached in the LRU metadata cache under a separate key `metadata:attribute:{entity}:{attribute}` with a 24-hour TTL (attribute types do not change frequently). This prevents a Dataverse call on every submission while still catching configuration errors.

---

## 4. DFE-ADD-002 — Interactive Grid Field Type Architecture

### 4.1 Component Architecture

```
frontend/src/
├── components/
│   └── fields/
│       ├── InteractiveGridField.tsx          # Dispatcher: reads gridMode, renders SelectionGrid or EntryGrid
│       ├── SelectionGridField.tsx            # Mode A: loads records, renders table, manages selection state
│       └── EntryGridField.tsx                # Mode B: manages row state, renders editable table
├── hooks/
│   ├── useSelectionGridData.ts              # Lazy-loads Dataverse records on tab activation
│   └── useEntryGridRows.ts                  # Manages row array state, add/delete/edit operations
├── services/
│   └── gridDataService.ts                   # GET /api/grids/:fieldId/records — Selection Grid data fetch
```

`FieldRenderer.tsx` gains one new dispatch case: `case 'interactive-grid': return <InteractiveGridField ... />`.

`InteractiveGridField.tsx` reads `field.gridConfig.gridMode` and renders either `SelectionGridField` or `EntryGridField`. It does not own state — it is a thin dispatcher.

### 4.2 Selection Grid (Mode A) Architecture

#### 4.2.1 Data Loading — Lazy Tab Activation (ADD-002-C4 Resolution)

Selection Grid records are loaded lazily when the user navigates to the tab containing the grid field, not at initial form load. This is the CEO's preferred approach (ADD-002-C4) and is correct because it does not penalise the form's Time-to-Interactive on load.

**Mechanism:**

`TabRenderer.tsx` receives an `onTabActivated(tabId)` callback from `DynamicFormRenderer`. When a tab becomes active, `DynamicFormRenderer` notifies all Selection Grid fields on that tab to trigger their data fetch. This is implemented via a React context event (`GridDataLoadContext`) that `useSelectionGridData` subscribes to.

`useSelectionGridData(field: FieldDefinition)` hook:
- Initial state: `{ status: 'idle', records: [], error: null }`
- On tab activation: transitions to `{ status: 'loading' }`
- On fetch success: `{ status: 'loaded', records: GridRecord[], totalCount: number }`
- On fetch failure: `{ status: 'error', error: string }`
- Exposes `retry()` to re-trigger the fetch (FR-118)
- Data is not re-fetched on subsequent tab activations within the same session (cached in component state)

`SelectionGridField.tsx` renders a loading skeleton while `status = 'loading'`, a data table when `status = 'loaded'`, and an error message with a "Retry" button when `status = 'error'`.

**Performance budget (NFR-019):** The Selection Grid must render within 1,500 ms P95 from tab activation to interactive state. The OData query is a single `GET /api/grids/:fieldId/records?page=1&pageSize=50` call. With the existing Dataverse retry and circuit breaker in `DataverseClient`, a single page of 50 records should return in < 600 ms under normal Dataverse response times, leaving 900 ms for network transit and rendering.

#### 4.2.2 New API Endpoint — Selection Grid Records

**GET /api/grids/:fieldId/records?page=:page&pageSize=:pageSize**

- Auth: Bearer token
- Path param: `fieldId` — the `qdb_form_field_id` GUID of the interactive-grid field
- Query params: `page` (1-based integer, default 1), `pageSize` (integer, default 50, max 100)
- Backend resolves: target entity, saved View name, column attributes — all from `qdb_form_field` and `qdb_grid_column_config` records (cached in metadata LRU)
- Dataverse call: `GET /api/data/v9.2/{targetEntity}?savedQuery={viewId}&$select={columns}&$top={pageSize}&$skip={(page-1)*pageSize}&$count=true&$filter=statecode eq 0`
- Response 200: `ApiResponse<GridRecordPage>`

```
GridRecordPage {
  records: GridRecord[]     // array of row objects
  totalCount: number        // from @odata.count
  page: number
  pageSize: number
  totalPages: number
}

GridRecord {
  id: string                // Dataverse record GUID
  values: Record<string, unknown>   // keyed by column targetAttribute
}
```

- Response 400: fieldId not a valid GUID, or field is not of type `interactive-grid`
- Response 403: user not authorised for this form
- Response 404: field not found
- Response 502: Dataverse query failed (after retries)

**Entity name is never a caller-supplied URL path segment.** `fieldId` is a GUID that the backend resolves to a target entity name from the trusted metadata cache. This satisfies the security requirement from PROD-1 (original Phase 7) and prevents entity name injection.

#### 4.2.3 Saved View Resolution (Q-008 Resolution)

The Q-008 resolution replaces raw OData filter expressions with admin-selected saved Dataverse Views. The `qdb_form_field` record stores `qdb_grid_saved_view_id` (GUID of the saved Dataverse View). The `CrmGridDataService` resolves the View as follows:

1. Fetch the View record: `GET /api/data/v9.2/savedqueries({viewId})?$select=fetchxml,layoutjson`
2. Extract `fetchxml` from the view
3. Execute the fetchxml against Dataverse via `POST /api/data/v9.2/{entity}/Microsoft.Dynamics.CRM.FetchXmlToQueryExpression` to convert to OData (or use FetchXml endpoint directly)
4. Apply `$select` restriction to only the columns listed in `qdb_grid_column_config` for security — do not expose attributes not in the config
5. Apply `$top` and `$skip` for pagination

This approach fully delegates filter, sort, and column ownership to Dataverse Views, removing the OData injection surface.

#### 4.2.4 Pagination

Q-010 resolved: paginate, not truncate. The default page size is 50 records. The `SelectionGridField` component renders Previous / Next pagination controls below the table. The current page and total page count are displayed. When a user navigates to a new page, `useSelectionGridData` fetches the new page from the backend and replaces the displayed rows. Previously selected rows from other pages are preserved in the selection state (stored as a Set of GUIDs in component state, not tied to the displayed page).

`qdb_grid_max_rows` on the field caps the maximum total records returned across all pages. If the view returns more records than `qdb_grid_max_rows` (default 200, max 500 per FR-113), the backend returns only up to that cap and sets `totalCount` to `qdb_grid_max_rows` in the response metadata, with a `isCapped: true` flag. The frontend renders an informational notice to the user.

#### 4.2.5 Selection State and Submission

Selection state is stored as `Set<string>` (GUIDs) in `SelectionGridField`'s RHF field value. For single-select, the Set never grows beyond 1 entry (enforced by the radio button rendering). For multi-select, the Set grows per user interaction.

At submission time, `CrmSubmissionService` reads the grid field value:
- Single-select: the RHF value is a single GUID string
- Multi-select: the RHF value is an array of GUID strings

The submission mapping handles grid selection values as lookup references (single) or multi-lookup references (multi-select mapped to a relationship), per the `qdb_form_submission_mapping` configuration.

BR-024 enforcement: The backend `SubmissionController` validates that a single-select grid field's value contains at most one GUID before passing to `CrmSubmissionService`. If the value contains multiple GUIDs (programmatic manipulation), the last element of the array is used and the rest discarded, with a warning log.

### 4.3 Entry Grid (Mode B) Architecture

#### 4.3.1 Row State Management

`useEntryGridRows(field: FieldDefinition)` hook owns all row state:
- `rows: GridRow[]` — array of row objects, each keyed by column `targetAttribute`
- `addRow()` — appends a new row with all columns set to `undefined`
- `updateCell(rowIndex, columnKey, value)` — updates a single cell value
- `deleteRow(rowIndex)` — removes a row at the given index
- `isAtMinRows: boolean` — computed from `rows.length >= field.gridConfig.minRows`
- `isAtMaxRows: boolean` — computed from `rows.length >= field.gridConfig.maxRows`

Row state is registered in React Hook Form as a single field value: an array of objects. The RHF field key for a grid field is the `field.fieldKey`. The value is `GridRow[]`. This integrates with the existing draft persistence flow (`useDraft` serialises the full RHF values map, which includes the grid row array).

**Row add is purely client-side (NFR-020).** No server call occurs on "Add Row". The `addRow()` function appends to the in-memory rows array and re-renders. Target latency: < 100 ms (purely local state operation).

#### 4.3.2 Cell Rendering

Each cell in an editable row renders an appropriate input control based on `column.columnFieldType`. The mapping reuses the existing `FieldType` infrastructure:

| `qdb_column_field_type` | Cell renderer |
|---|---|
| `text` | `<Input>` (Fluent UI) |
| `number` | `<Input type="number">` |
| `date` | `<DatePicker>` (Fluent UI) |
| `dropdown` | `<Select>` sourced from the column's `qdb_form_option_value` records (loaded as part of grid column config) |
| `boolean` | `<Switch>` (reuses BooleanField toggle logic inline) |

Cell-level validation errors (FR-133) are displayed as tooltip text below the cell input. Validation runs on cell blur using the same `ValidationEngine.buildZodSchema` pattern, applied to the per-column validation rules from `qdb_grid_column_config`.

#### 4.3.3 Entry Grid Atomic Transaction (ADD-002-C3)

This section fulfils the CEO's mandatory requirement (ADD-002-C3). The entry grid child record creation is incorporated into the existing Dataverse `$batch` changeset strategy.

**Current submission flow (existing):** `CrmSubmissionService` creates the parent record, then creates child records sequentially. On failure, it issues compensating DELETE calls (section 5, phase-3-arch.md, submission sequence diagram).

**Extended submission flow with Entry Grid:**

The existing sequential approach is replaced with a proper Dataverse `$batch` changeset for all records created in a single submission. A `$batch` changeset is an atomic OData operation: all requests within the changeset succeed together or fail together — Dataverse rolls back on any failure. This eliminates the need for compensating DELETE calls.

```
POST https://{org}.crm4.dynamics.com/api/data/v9.2/$batch
Content-Type: multipart/mixed; boundary=batch_boundary

--batch_boundary
Content-Type: multipart/mixed; boundary=changeset_boundary

--changeset_boundary
Content-Type: application/http
Content-Transfer-Encoding: binary
Content-ID: 1

POST {parentEntity} HTTP/1.1
{parent field values}

--changeset_boundary
Content-Type: application/http
Content-Transfer-Encoding: binary
Content-ID: 2

POST {childEntity1} HTTP/1.1
{child1 fields, parent lookup = $1}  ← Content-ID reference

--changeset_boundary
Content-Type: application/http
Content-Transfer-Encoding: binary
Content-ID: N

POST {entryGridChildEntity} HTTP/1.1
{entry grid row N fields, parent lookup = $1}

--changeset_boundary--
--batch_boundary--
```

**Content-ID references** (`$1`) are used to bind the parent record's GUID (created in the same changeset) to all child record lookups, without needing a pre-created parent GUID. This is the standard Dataverse `$batch` changeset pattern for related record creation.

**Failure scenarios and response handling:**

| Scenario | Dataverse response | Portal action |
|---|---|---|
| Parent record creation fails (validation, duplicate key, access denied) | `$batch` returns 4xx on Content-ID 1; changeset rolled back | `CrmSubmissionService` parses error body; surfaces to user: "Submission failed — please check your data and try again." Logs full error with correlationId. Returns `{ retriable: false }` for validation errors, `{ retriable: true }` for transient errors. |
| Entry Grid child record fails (row M of N) | `$batch` returns 4xx on Content-ID M; entire changeset (including parent + all prior children) rolled back by Dataverse | `CrmSubmissionService` parses batch response, identifies which row index failed (from Content-ID mapping). Surfaces to user: "Submission failed — row [M] in [GridFieldLabel] could not be saved. Please review and try again." No partial records remain in Dataverse. |
| Network failure mid-batch | Dataverse receives no complete batch request; no records created | Standard retry logic applies (3 retries, exponential back-off). If all retries fail, user sees retriable error with saved draft intact. |
| All records succeed | `$batch` returns 200 with all Content-ID results | `CrmSubmissionService` extracts parent GUID from Content-ID 1 response; marks draft as submitted. |

**Batch size limits:** Dataverse `$batch` changeset supports a maximum of 1,000 requests per changeset. A form with two Entry Grids of 50 rows each creates 100 child records + 1 parent = 101 operations, well within the limit. The backend enforces a maximum batch size of 500 operations (configurable via `MAX_BATCH_OPERATIONS` env var), returning a `400` error before issuing the batch if the limit would be exceeded. This serves as a safety cap against misconfigured grids.

**Phase 3 Architecture Note:** The adoption of `$batch` changesets for Entry Grid submissions also resolves the existing architectural risk (Risk 3, phase-3-arch.md section 18) regarding the compensating rollback approach for the original parent-child submission. The `$batch` changeset approach should be adopted for all parent+child submission operations, not only Entry Grid. This is an improvement to the base architecture delivered as part of this addendum.

#### 4.3.4 Draft Persistence — Entry Grid

Draft persistence for Entry Grid rows is straightforward: the RHF value for the grid field is `GridRow[]`. The existing `useDraft` hook serialises the full RHF values map (including the grid row array) to `qdb_field_values_json` via `JSON.stringify`. On resume, `JSON.parse` restores the array.

**Column-change invalidation (Q-014 / ADD-002-C1 — QDB confirmed Option A):**

If the form author adds or removes columns from an Entry Grid's `qdb_grid_column_config` records after a user has saved a draft, the draft row data is structurally inconsistent on resume. The resolution is tab-level draft invalidation with user notification.

**Detection mechanism:**

Each draft record stores a `qdb_grid_schema_hash` attribute — a JSON object mapping `fieldId` → `columnConfigHash`. The `columnConfigHash` is a stable hash (SHA-256 truncated to 16 hex chars) of the sorted column attribute names for that grid field, computed by `CrmMetadataService` when assembling the form definition.

At draft resume time, `useDraft` compares the `gridSchemaHash` from the resumed draft against the current `columnConfigHash` from the live metadata for each Entry Grid field. If they differ:

1. The Entry Grid row data for that tab is discarded from the draft payload
2. The user is shown a notification banner on that tab: "The [FieldLabel] section was updated since you last saved. Please re-enter your data for this section."
3. Other tabs' draft data is unaffected
4. The draft record itself is not deleted — the user can continue from where they left off on all other tabs

**Schema hash storage:** Two new attributes added to `qdb_form_draft`:

| Attribute | Type | Description |
|---|---|---|
| `qdb_grid_schema_hash` | String(4000) | JSON: `Record<fieldId, columnConfigHash>` — one entry per Entry Grid field in the form |

The `qdb_form_draft.qdb_field_values_json` column already exists. The 4,000-character limit on `qdb_grid_schema_hash` accommodates forms with up to ~50 Entry Grid fields (each hash entry ~80 chars). If a form has more fields than the column accommodates, the hash is stored truncated and validation falls back to a conservative "always invalidate" policy for the excess fields.

### 4.4 Throttling Impact Assessment (ADD-002-C4)

**New Dataverse calls introduced per form session:**

| Event | New calls | Mitigations |
|---|---|---|
| Tab activation with Selection Grid(s) | 1 call per grid per page, on first tab activation | Lazy load (not at form open); per-session cache in component state; no re-fetch on revisit |
| Form submission with Entry Grid rows | 1 `$batch` call (replaces N sequential calls) | `$batch` reduces call count; single round-trip regardless of row count |
| First-view audit check (ADD-001) | 1 GET per form session | Cached in component state; no repeat call |
| Attribute type validation (BR-020 guard) | 1 GET per boolean field per form, 24h cached | LRU cache absorbs repeat submissions |

**NFR-001 impact:** The metadata API response time (NFR-001, 500ms P95) is not affected by Selection Grid loads, because Selection Grid loading is lazy (tab activation) and not part of the metadata fetch. The metadata fetch adds only the grid column config records (already part of the form field expansion).

**Throttling risk for Selection Grids:** A form with 3 tabs each containing 2 Selection Grids, loaded by 100 concurrent users all activating those tabs simultaneously, generates 600 Dataverse calls in a burst. This is within Dataverse service protection limits (50,000 requests per 5-minute window for enterprise licences). The existing circuit breaker and retry logic protect against sustained pressure. The `qdb_grid_max_rows` cap (default 200) bounds query result size.

---

## 5. DFE-ADD-002 — Tab-Aware Save & Draft + Submit Buttons Architecture

### 5.1 Design

Tab-aware button placement is a pure frontend concern. No new API calls, no new entities, and no backend changes are required. The logic is entirely client-side in `DynamicFormRenderer.tsx` and `TabRenderer.tsx`.

**Final tab computation (BR-025):**

```typescript
// Computed once after metadata loads; memoised with useMemo
const finalTabId: string = useMemo(() => {
  const activeTabs = formDefinition.tabs.filter(tab => tab.isVisibleDefault);
  if (activeTabs.length === 0) return null;
  return activeTabs.reduce((acc, tab) =>
    tab.displayOrder > acc.displayOrder ? tab : acc
  ).tabId;
}, [formDefinition.tabs]);
```

Note: tab visibility from the rule engine can override `isVisibleDefault`. If the rule engine hides a tab that was previously the final tab, the `finalTabId` must be recomputed. `DynamicFormRenderer` maintains `finalTabId` as derived state from the current `visibilityMap` (rule engine output) and `formDefinition.tabs`, recomputed whenever the visibility map changes.

**Save & Draft button placement:** `TabRenderer.tsx` receives `showSaveDraft: boolean` (derived from `formDefinition.allowSaveDraft`). When true, it renders the `SaveDraftButton` component at the bottom of the tab's field list. The button label and style are sourced from the `qdb_button_design` record for `button_type = save_draft`, with fallback to "Save & Draft" and secondary style per FR-150.

**Submit button placement:** `TabRenderer.tsx` receives `isFinaTab: boolean` (derived from `tab.tabId === finalTabId`). When true, it renders the `SubmitButton` component at the bottom of the tab. When false, `SubmitButton` is not rendered (not just hidden — not in the DOM). The button label and style are sourced from `button_type = submit`, with fallback per FR-151.

**Button design fallback resolution:** `CrmMetadataService` attempts to fetch `qdb_button_design` records for the form. If no record exists for `save_draft` or `submit` button types, `assembleFormDefinition` sets those button configs to null. `TabRenderer` applies the hardcoded defaults when the config is null. No error is thrown.

**Constraint: Submit button is rendering-layer-enforced (BR-027).** No business rule action, rule engine event, or metadata flag can move the Submit button to a non-final tab. The `isFinaTab` computation is performed in `DynamicFormRenderer`, not configurable from Dataverse.

### 5.2 button_design Entity Changes

The `qdb_button_type` picklist on `qdb_button_design` is confirmed or extended with two values:

| Value Label | Integer | Notes |
|---|---|---|
| `save_draft` | TBD (next available) | Used for Save & Draft button design |
| `submit` | TBD (next available) | Used for Submit button design |

If these values already exist, the solution deployment is a no-op on this entity.

---

## 6. Dataverse Schema Changes

### 6.1 New Entities

#### qdb_info_card_screen (DFE-ADD-001)
As specified in BRD A8.1. No changes from BA specification.

#### qdb_info_card_section (DFE-ADD-001)
As specified in BRD A8.2. No changes from BA specification.

#### qdb_info_card_item (DFE-ADD-001)
As specified in BRD A8.3. No changes from BA specification.

#### qdb_info_card_view_record (DFE-ADD-001 — new, not in BA specification)

| Attribute | Type | Description |
|---|---|---|
| `qdb_info_card_view_record_id` | GUID (PK) | Unique identifier |
| `qdb_user_aad_object_id` | String(36) | Azure AD object ID of the user |
| `qdb_form_definition_id` | Lookup | FK to `qdb_form_definition` (no cascade delete — view records must persist even if form is deactivated, for audit purposes) |
| `qdb_viewed_on` | DateTime | UTC timestamp of first view |
| `createdon` | System | |
| `createdby` | System | |

Alternate key: `(qdb_user_aad_object_id, qdb_form_definition_id)` — enforces uniqueness and enables efficient OData lookup.

#### qdb_grid_column_config (DFE-ADD-002)
As specified in BRD B8.2. No changes from BA specification.

### 6.2 Attribute Changes to Existing Entities

#### qdb_form_definition (two addenda combined)

| New Attribute | Type | Default | Addendum |
|---|---|---|---|
| `qdb_allow_infocard_skip` | Boolean | false | ADD-001 |
| `qdb_infocard_counts_in_progress` | Boolean | false | ADD-001 |
| `qdb_allow_save_draft` | Boolean | false | ADD-002 (confirm or add) |

#### qdb_form_field (DFE-ADD-002)

| New Attribute | Type | Default | Purpose |
|---|---|---|---|
| `qdb_true_label` | String(60) | null | Boolean field true label |
| `qdb_false_label` | String(60) | null | Boolean field false label |
| `qdb_bool_render_style` | Picklist(toggle=1, radio-pair=2) | 1 | Boolean render style |
| `qdb_grid_mode` | Picklist(selection=1, entry=2) | null | Grid operating mode |
| `qdb_grid_target_entity` | String(100) | null | Dataverse target entity logical name |
| `qdb_grid_saved_view_id` | GUID | null | Saved Dataverse View ID (replaces filter expression per Q-008) |
| `qdb_grid_selection_mode` | Picklist(single=1, multi=2) | null | Mode A selection cardinality |
| `qdb_grid_relationship_attribute` | String(100) | null | Mode B parent lookup attribute name |
| `qdb_grid_min_rows` | Integer | 0 | Mode B minimum rows at submission |
| `qdb_grid_max_rows` | Integer | 200 | Mode A display cap / Mode B max rows |

Note: `qdb_grid_filter_expression` (String 2000) — see ADR-ADD-001 below for the disposition of this attribute.

#### qdb_form_draft (DFE-ADD-002)

| New Attribute | Type | Default | Purpose |
|---|---|---|---|
| `qdb_grid_schema_hash` | String(4000) | null | JSON map of fieldId to column config hash for Entry Grid invalidation |
| `qdb_info_card_viewed` | Boolean | false | First-view flag for draft-present users (ADD-001 dual-flag strategy) |

### 6.3 Entity Relationship Diagram Extension

```
qdb_form_definition (existing)
  ├── qdb_form_tab (existing)
  │     └── qdb_form_section (existing)
  │           └── qdb_form_field (existing)
  │                 ├── [existing children: validation_rule, business_rule, option_value, lookup_config, doc_upload_config]
  │                 └── qdb_grid_column_config (NEW — DFE-ADD-002)
  ├── qdb_info_card_screen (NEW — DFE-ADD-001)
  │     └── qdb_info_card_section (NEW — DFE-ADD-001)
  │           └── qdb_info_card_item (NEW — DFE-ADD-001)
  └── qdb_info_card_view_record (NEW — DFE-ADD-001, no cascade delete)
```

---

## 7. API Contract Changes

All new endpoints follow the existing `ApiResponse<T>` envelope (phase-3-arch.md section 12.1). All require `Authorization: Bearer {token}`.

### 7.1 Metadata API Extension

**GET /api/forms/:formCode/metadata** — Response schema change only, no new endpoint.

The `FormDefinition` response object gains:
```
allowInfocardSkip: boolean
infocardCountsInProgress: boolean
infoCards: InfoCardScreen[]           // empty array if no screens
allowSaveDraft: boolean               // already exists; confirmed present
```

Backward compatibility: `infoCards` defaults to `[]`. All existing clients that do not consume `infoCards` are unaffected.

### 7.2 Info-Card View Status API (New)

**GET /api/forms/:formCode/infocard-view-status**

- Auth: Bearer token
- Response 200: `ApiResponse<{ hasViewed: boolean }>`
- Response 404: form not found

### 7.3 Grid Records API (New)

**GET /api/grids/:fieldId/records**

Query params: `page` (default 1), `pageSize` (default 50, max 100)

Response 200: `ApiResponse<GridRecordPage>`

```
GridRecordPage {
  records: GridRecord[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
  isCapped: boolean         // true if totalCount was capped by qdb_grid_max_rows
}

GridRecord {
  id: string                // Dataverse record GUID (always included)
  values: Record<string, unknown>
}
```

### 7.4 Draft API Extension

**POST /api/drafts** and **GET /api/drafts?formCode=** — No new endpoints.

The draft `fieldValues` payload is extended to include:
- Boolean field values: `boolean | undefined` (existing serialisation handles this)
- Entry Grid row data: `GridRow[]` keyed by `fieldKey` within `fieldValues`
- Selection Grid selected IDs: `string | string[]` keyed by `fieldKey`

The `DraftRecord` type gains:

```
DraftRecord (extended)
  + gridSchemaHash: Record<string, string> | null
  + infoCardViewed: boolean
```

### 7.5 Submission API Extension

**POST /api/forms/:formCode/submit** — No new endpoint.

The `fieldValues` payload for Entry Grid fields contains `GridRow[]`. `CrmSubmissionService` reads these arrays and includes them in the `$batch` changeset alongside the parent record.

---

## 8. Architecture Decision Records

### ADR-ADD-001: Disposition of qdb_grid_filter_expression — REMOVED from schema
**Status:** Accepted
**Date:** 2026-06-06
**Decided by:** Architect (CEO condition ADD-002-C2)

**Context:**
The original BA data model for DFE-ADD-002 FR-106 included a `qdb_grid_filter_expression` attribute (String 2000) on `qdb_form_field` to store a raw OData filter expression for Selection Grid record loading. Q-008 was resolved on 2026-06-05 with QDB's confirmation to use admin-selected saved Dataverse Views instead of raw filter expressions. This resolution eliminates the filter expression authoring surface entirely.

The original Phase 7 Note 3 identified string interpolation of untrusted input into OData `$filter` expressions as the root cause of AUDIT-005 and AUDIT-006 (OData injection blockers). The CEO explicitly required an ADR on this attribute's fate in ADD-002-C2: "An ambiguous schema state on this attribute is an OData injection risk vector and will not be accepted at Phase 3 checkpoint."

The CEO's question for the architect was: retain with ODataQueryBuilder sanitisation, or remove?

**Decision:**
REMOVE `qdb_grid_filter_expression` from the `qdb_form_field` schema entirely. The attribute is not created in the Dataverse solution.

REPLACE with `qdb_grid_saved_view_id` (GUID attribute), which stores the GUID of an admin-selected saved Dataverse View. The View owns the filter, column selection, and sort order. The backend resolves the View's `fetchxml` via a Dataverse metadata call and executes it server-side. No user-authored or admin-authored OData string is interpolated into a query.

**Rationale:**

The Q-008 resolution makes the filter expression attribute unnecessary. A saved View provides:
- Filter logic: owned by Dataverse; edited through Dataverse Advanced Find, not a free-text input field
- Column selection: owned by the View layout
- Sort order: owned by the View

Retaining `qdb_grid_filter_expression` as an alternative input path would create a split architecture — two mechanisms to achieve the same outcome, one safe (View-based) and one requiring sanitisation (expression-based). Any future configuration team member who discovers the retained attribute and uses it bypasses the View-based safety control. The only safe choice is removal.

**Migration path:**
The attribute does not exist in any production configuration data (this is a new addendum, not a modification to an existing deployed entity). There are no existing records to migrate. The attribute is simply not created in the solution package.

**Consequences:**
- Positive: Eliminates the OData injection risk surface entirely for Selection Grid queries. No sanitisation code path, no ODataQueryBuilder invocation, no regex validation of expression strings.
- Positive: View-based record loading is more capable than a filter expression alone — Views support multiple filter conditions, layout, and sort that cannot be expressed in a single `$filter` clause.
- Positive: View authoring is done in Dataverse by the CRM Configuration Team, in the familiar Advanced Find interface, not in a free-text Dataverse attribute.
- Negative: Selection Grid records are governed by the View's filter at the time of query. If a View is modified in Dataverse after a form is configured, the Selection Grid's displayed records change without any form configuration change. This is acceptable — it is the same behaviour as any other Dataverse View consumer.
- Negative: View-based queries require the backend to resolve the View's `fetchxml` at runtime (one additional Dataverse metadata call per grid field, cached in LRU). This is a minimal overhead (< 50ms on cache hit).
- Risk: If a form author points the `qdb_grid_saved_view_id` to a View that returns a very large result set, the `qdb_grid_max_rows` cap is the only protection. The cap is enforced server-side before the response is returned.

---

### ADR-ADD-002: Entry Grid Atomic Transaction via Dataverse $batch Changeset
**Status:** Accepted
**Date:** 2026-06-06
**Decided by:** Architect (CEO condition ADD-002-C3)

**Context:**
The original Phase 3 architecture used a sequential parent-then-children record creation approach with compensating DELETE calls on failure (phase-3-arch.md section 18 Risk 3 acknowledged this as non-atomic). Adding Entry Grid child record creation to this sequential approach increases the failure surface proportionally with the row count. On a form with 50 Entry Grid rows, a failure at row 40 requires 41 compensating DELETE operations issued sequentially — each a separate Dataverse API call that can itself fail, leaving orphaned records.

The CEO required an explicit architecture section (ADD-002-C3) covering failure scenarios, rollback mechanism, and user error message strategy for Entry Grid atomic submission.

**Decision:**
Adopt Dataverse `$batch` changesets for the entire submission write operation. A changeset is an atomic unit within a `$batch` request: all requests within the changeset succeed together or are rolled back by Dataverse on any failure. This is true server-side atomicity, not compensating-action-based rollback.

**Implementation contract:**

1. `CrmSubmissionService.submitForm()` builds a `BatchChangesetBuilder` object containing:
   - `POST {parentEntity}` as Content-ID 1
   - `POST {childEntity}` records as Content-ID 2..N (each with parent lookup referencing `$1`)
   - `POST {entryGridChildEntity}` records as Content-ID N+1..M (each with parent lookup referencing `$1`)

2. The changeset is submitted as a single `POST /api/data/v9.2/$batch` request.

3. Response parsing: `CrmSubmissionService` parses the multipart batch response. Each part maps to a Content-ID. Success: all parts return 2xx. Failure: any 4xx part causes Dataverse to have rolled back the entire changeset (per OData specification for changesets).

4. Error attribution: when a failure response is received, `CrmSubmissionService` maps the failing Content-ID back to the source entity (parent record, standard child record, or Entry Grid row at index N). This mapping is maintained as a local `Record<contentId, { sourceType, rowIndex, fieldKey }>` object built during changeset construction.

**Failure scenarios:**

| Scenario | Root cause identification | User message |
|---|---|---|
| Parent record fails | Content-ID 1 returns 4xx | "Your submission could not be saved. Please check your data and try again." |
| Standard child record fails | Content-ID 2..N returns 4xx | "Your submission could not be saved. An error occurred saving [MappingLabel]. Please try again." |
| Entry Grid row M fails | Content-ID N+M returns 4xx | "Row [M+1] in [GridFieldLabel] could not be saved. Please review that row and resubmit." |
| All fail (Dataverse outage) | HTTP 503 on batch endpoint | "The system is temporarily unavailable. Your data has been saved as a draft. Please try again later." |
| Partial response (network cut mid-response) | HTTP client timeout | Treated as retriable: same message as outage case. Draft preserved. |

**Batch size guard:**
`CrmSubmissionService` counts total changeset operations before building the request. If the count exceeds the `MAX_BATCH_OPERATIONS` threshold (environment variable, default 500, Dataverse hard limit 1,000), it returns `400 { error: 'submission_too_large', rowCount: N, maxAllowed: 500 }` to the frontend before issuing any Dataverse call. The frontend displays: "Too many rows. Please remove some rows before submitting." This guard is the last line of defence against misconfigured Entry Grid `qdb_grid_max_rows` allowing excessive row counts.

**Consequences:**
- Positive: True atomicity for all submission writes. No compensating DELETE logic required. No orphaned partial records.
- Positive: Single Dataverse API call for all record creation, regardless of child count. Reduces Dataverse API call count for submissions with Entry Grid rows.
- Positive: Resolves phase-3-arch.md Risk 3 (compensating rollback is not database-level atomic) for all submission types, not only Entry Grid.
- Positive: Content-ID reference mechanism eliminates the need to pre-create the parent record before the batch, so the parent GUID is not known until the batch response — which is exactly how Content-ID references work in Dataverse `$batch`.
- Negative: The `$batch` changeset response body is a multipart MIME document that requires careful parsing. The `DataverseClient` class must be extended with a `parseBatchResponse(body: string): BatchPartResult[]` method. This is non-trivial but well-specified by the OData specification.
- Negative: Debugging `$batch` failures in production requires correlating Content-ID numbers with the original changeset request log. The `CrmSubmissionService` logs the full batch request (with field values redacted) and the full response body when a failure occurs, using the existing `pino` logger with the `correlationId`.
- Risk: Some versions of Dataverse Web API have undocumented behaviour differences in `$batch` error responses (e.g., whether the failing part's error code is in the part body or the overall response status). This must be validated against the target Dataverse org (org5869857f or the Qatar North replacement) before Entry Grid submission is considered QA-complete.

---

### ADR-ADD-003: Selection Grid Lazy Loading on Tab Activation
**Status:** Accepted
**Date:** 2026-06-06
**Decided by:** Architect (CEO condition ADD-002-C4)

**Context:**
ADD-002-C4 required the architect to address how and when Selection Grid records are loaded, and to assess the impact on NFR-001 (500ms P95 form metadata response). The CEO's preferred approach is lazy loading on tab activation.

**Decision:**
Selection Grid record loading is deferred until the user navigates to the tab containing the grid. Loading is triggered by tab activation (the `onTabActivated` event in `DynamicFormRenderer`). The initial form metadata load (`GET /api/forms/:formCode/metadata`) does not include Selection Grid records; only column configuration (structure) is included.

On first tab activation:
1. `useSelectionGridData` hook transitions to `loading`
2. `GET /api/grids/:fieldId/records?page=1&pageSize=50` is issued
3. The tab renders a skeleton/spinner while in flight
4. On response, the table is populated and the loading state clears

On subsequent activations of the same tab within the same session: the previously loaded data is served from component state (no re-fetch). The user's prior selection state is preserved.

**Consequences:**
- Positive: The form's initial Time-to-Interactive (NFR-001) is not penalised by Selection Grid queries. A form with 3 tabs each containing a Selection Grid opens at the same speed as a form with no grids.
- Positive: If the user never navigates to a tab with a Selection Grid (e.g., a conditional rule hides that tab), no Dataverse query is issued for that grid.
- Positive: Consistent with the NFR-001 commitment and the CEO's stated preference.
- Negative: The tab containing a Selection Grid has a visible loading state on first activation (skeleton rows for up to ~600 ms on a warm Dataverse connection). This is an accepted UX tradeoff for the performance benefit on initial load.
- Negative: If a user navigates between tabs rapidly and activates a Selection Grid tab before its prior load completes, the hook must handle the in-flight request correctly (cancel or ignore the stale response if a new tab activation arrives). The `useSelectionGridData` hook uses an `AbortController` to cancel in-flight requests on hook unmount or field deactivation.
- Risk: If the user's network drops between form load and tab activation, the Selection Grid shows an error state with a "Retry" button. The user can retry the load without losing other form data.

---

### ADR-ADD-004: Info-Card First-View Audit via Dedicated View Record Entity
**Status:** Accepted
**Date:** 2026-06-06
**Decided by:** Architect

**Context:**
Q-006 (resolved 2026-06-05) specified first-view-only audit logging per user per form. The architect must decide where to store the "has viewed" flag. Options considered:

Option A: Store on `qdb_form_draft`. Simple — but requires a draft to exist. Users who complete a form in one session (no draft save) would have no record, and a subsequent visit would re-audit incorrectly.

Option B: Store on `qdb_form_audit_log`. The audit log is append-only and cannot be queried with "does a record of type X exist for user Y and form Z" without a full table scan. Violates the audit log's purpose as a write-only ledger.

Option C: Store a dedicated `qdb_info_card_view_record` entity with a composite unique alternate key on `(user_aad_object_id, form_definition_id)`. One record per user per form. Dataverse enforces uniqueness at the database level.

**Decision:**
Adopt Option C. Create `qdb_info_card_view_record` as specified in section 2.4. Supplement with the `qdb_info_card_viewed` boolean on `qdb_form_draft` for draft-present users as a fast local check that avoids an extra API call when a draft is being resumed.

**Consequences:**
- Positive: Correct for all user paths — draft-present and no-draft users alike.
- Positive: Alternate key on Dataverse enforces uniqueness and serves the lookup efficiently (single record lookup by alternate key, O(1) via index).
- Positive: Append-only audit log is not polluted with lookup queries against it.
- Negative: New entity introduces additional schema to maintain. The data volume is bounded (one record per user per form — same growth as `qdb_form_draft`).
- Negative: The first-view check requires one additional API call (`GET /api/forms/:formCode/infocard-view-status`) per form session. This is a single Dataverse lookup by alternate key, expected latency < 50 ms. Acceptable.

---

## 9. Data Flow Diagrams

### 9.1 Info-Card Screen Flow (DFE-ADD-001)

```
User navigates to /form/:formCode
  → useFormMetadata: GET /api/forms/:formCode/metadata
  → FormPage receives FormDefinition (includes infoCards[])

  IF draft exists (isDraftResume = true):
    → Navigation state: phase = 'form', activeTabId = draft.lastSavedTabId
    → InfoCardFlow NOT mounted
    → DynamicFormRenderer renders with draft values pre-populated

  IF no draft AND infoCards.length === 0:
    → Navigation state: phase = 'form', activeTabId = tabs[0].tabId
    → DynamicFormRenderer renders normally

  IF no draft AND infoCards.length > 0:
    → Navigation state: phase = 'info-cards', screenIndex = 0
    → InfoCardFlow mounts
      → GET /api/forms/:formCode/infocard-view-status
        → if not viewed:
            POST /api/data/v9.2/qdb_form_audit_logs { eventType: 'info_card_screen_viewed' }
            POST /api/data/v9.2/qdb_info_card_view_records { userId, formCode }
        → cache hasViewed = true in component state
      → Render InfoCardScreen[0]

  User clicks "Continue" → screenIndex++
  User clicks "Back" → screenIndex--
  User clicks "Skip" (if allowInfocardSkip) → phase = 'form'
  User clicks "Start" (last screen) → phase = 'form', activeTabId = tabs[0].tabId

  phase transitions to 'form':
    → InfoCardFlow unmounts
    → DynamicFormRenderer mounts
    → RHF context initialised
    → ValidationEngine.buildZodSchema() runs
    → RuleEngine.loadRules() runs
    → Normal form flow resumes
```

### 9.2 Selection Grid Loading Flow (DFE-ADD-002, Mode A)

```
User navigates to tab containing Selection Grid field
  → DynamicFormRenderer emits onTabActivated(tabId)
  → SelectionGridField's useSelectionGridData hook receives activation signal
  → status: 'idle' → 'loading'
  → SelectionGridField renders skeleton rows

  GET /api/grids/:fieldId/records?page=1&pageSize=50
    → GridController: validate fieldId is a GUID
    → GridController: load field config from MetadataLruCache (cache hit expected)
    → CrmGridDataService: resolve saved View by qdb_grid_saved_view_id
      → GET /api/data/v9.2/savedqueries({viewId})?$select=fetchxml (cached 24h)
    → CrmGridDataService: execute View against Dataverse
      → GET /api/data/v9.2/{targetEntity}?... (with fetchxml-derived filter + $select + $top + $skip + $count=true + $filter=statecode eq 0)
    → Apply qdb_grid_max_rows cap if needed
    → Return GridRecordPage

  status: 'loading' → 'loaded'
  SelectionGridField renders data table
    → User selects row(s) → selection state stored as Set<GUID> in RHF field
    → Pagination: user clicks Next → GET next page → display, preserve selection state

  On form submission:
    → SubmissionController reads grid field value (GUID or GUID[]) from fieldValues
    → Included in $batch changeset as parent record's lookup/relationship attribute
```

### 9.3 Entry Grid Submission Flow (DFE-ADD-002, Mode B)

```
User adds rows to Entry Grid
  → addRow() appends new row object to rows[] in useEntryGridRows hook
  → Row rendered as editable table row (no Dataverse call)
  → User edits cells → updateCell() updates in-memory state
  → RHF field value = GridRow[] (serialisable)

User clicks Save & Draft
  → useDraft: POST /api/drafts { fieldValues: { ...otherFields, [gridFieldKey]: GridRow[] }, gridSchemaHash: {[fieldId]: hash} }
  → qdb_form_draft record created/updated with serialised row data and schema hash

User clicks Submit
  → ValidationEngine validates all fields including grid row cells
  → RuleEngine checks hidden fields; removes hidden grid data
  → SubmissionController receives { fieldValues: { ..., [gridFieldKey]: GridRow[] } }
  → CrmSubmissionService.buildBatchChangeset():
      Content-ID 1: POST {parentEntity} { ...parent fields }
      Content-ID 2..N: POST {standardChildEntities}
      Content-ID N+1: POST {entryGridTargetEntity} { row[0] fields, parentLookup = $1 }
      Content-ID N+2: POST {entryGridTargetEntity} { row[1] fields, parentLookup = $1 }
      ...
      Content-ID N+M: POST {entryGridTargetEntity} { row[M-1] fields, parentLookup = $1 }
  → POST /api/data/v9.2/$batch { changeset }

  Success → parse parent GUID from Content-ID 1 response
           → PATCH qdb_form_draft status = submitted
           → POST qdb_form_audit_logs { eventType: 'formSubmitted', parentId }
           → return SubmissionResult to frontend

  Failure → parse failing Content-ID
           → map to source: parent / standard child / grid row index M
           → return error with row attribution to frontend
           → frontend displays attributed error message
           → draft preserved with current row data
```

### 9.4 Entry Grid Draft Resume with Column-Change Invalidation

```
User returns to form
  → GET /api/drafts?formCode=:formCode
  → useDraft: draft found, gridSchemaHash present

  → Live metadata includes current columnConfigHash per grid field
  → useDraft compares: draft.gridSchemaHash[fieldId] vs. metadata.gridFields[fieldId].columnConfigHash

  For each Entry Grid field:
    MATCH → restore GridRow[] into RHF field value normally
    MISMATCH →
      discard GridRow[] for this field from restored RHF values
      display notification banner on that tab:
        "The [FieldLabel] section was updated since you last saved.
         Please re-enter your data for this section."
      other tabs' data unaffected

  User is shown the form at the last-saved tab
  Invalidated Entry Grid starts as empty (0 rows)
  User can re-enter rows and save draft or submit
```

---

## 10. Non-Functional Considerations

### 10.1 Performance

**Info-Card navigation (NFR-015):** Screen transitions are purely in-memory state changes (screenIndex increment/decrement). No network call occurs. Transition time < 50 ms (React re-render cost only). Well within the 500 ms NFR-015 target.

**Metadata API (NFR-001 impact):** The extended metadata response with Info-Card entities and grid column configs adds an estimated 2–20 KB per form to the cached payload. The LRU cache `max` (500 entries) and memory estimate (60 MB ceiling) from phase-3-arch.md section 8.1 are recalculated:
- Info-Card addition: +8 KB per form at most → +4 MB at 500 forms
- Grid column config addition: +4 KB per form → +2 MB at 500 forms
- Revised ceiling: ~66 MB — still well within App Service / AKS container limits

**Selection Grid (NFR-019):** 1,500 ms P95 budget from tab activation to interactive. Budget allocation:
- OData query: 600 ms (Dataverse P95 under normal load)
- Network transit (API to client): 50 ms
- Frontend render (React table): 100 ms
- Total estimated: 750 ms — 50% headroom against NFR-019

**Entry Grid row add (NFR-020):** < 100 ms, purely client-side state mutation + React re-render. No contention with Dataverse.

**Entry Grid at 50 rows (NFR-022):** 50 rows × 10 columns = 500 cells rendered. Each cell is a simple Fluent UI input. React's virtual DOM reconciliation handles this comfortably at 60 fps on modern hardware. The `useEntryGridRows` hook uses a stable reference for the rows array (via `useCallback` and `useMemo`) to avoid unnecessary re-renders of unaffected rows.

### 10.2 Security

**Info-Card download URLs (ADD-001-C3):** Admin-time HTTPS URL validation (section 2.8) prevents HTTP links. The `rel="noopener noreferrer"` anchor attribute prevents opener-based attacks (FR-084). Download URLs are not proxied, fetched, or cached by the backend. They are treated as external references.

**Selection Grid entity access:** The backend resolves the target entity from trusted metadata, not from a caller-supplied URL parameter. Dataverse access control applies: the backend service principal must have read access to the `qdb_grid_target_entity`. Access beyond the service principal's permissions produces a Dataverse 403, which is propagated as a `502 Bad Gateway` to the frontend with a user-facing error message.

**Entry Grid column type:** `qdb_column_field_type` on `qdb_grid_column_config` is a picklist (controlled vocabulary), not a free-text string. The backend validates the field type against the known `FieldType` union before rendering or processing. Unknown types are rejected at metadata assembly time.

**$batch changeset input validation:** `CrmSubmissionService` validates all field values in the batch payload against the server-side Zod schema before constructing the changeset. No unvalidated user input reaches the batch body. The existing `inputSanitiser.ts` middleware (Sprint 1 blocker S1-03) sanitises all string values before they reach any controller.

**Grid schema hash:** The `qdb_grid_schema_hash` stored in draft records is server-computed (by `CrmMetadataService`) and not modifiable by the client. The frontend sends the current metadata's hash to the draft save endpoint; the backend verifies it matches the live metadata before accepting it. A client-submitted hash that does not match the live metadata is rejected with `400 { error: 'invalid_grid_schema_hash' }`.

### 10.3 Accessibility

**Info-Card screens:**
- H1 focus on screen transition (FR-072): implemented via `ref.current.focus()` in a `useEffect` triggered by `currentScreenIndex` change
- `<title>` element update (FR-071): implemented via React's `useEffect` with `document.title = '${screen.heading} — ${formDefinition.displayName}'`
- Native `<button>` elements for all navigation controls (FR-073)
- Minimum 44×44 px touch targets (FR-070)
- Colour contrast enforced by Fluent UI v9 token system (NFR-017)

**Selection Grid (NFR-024):** Implemented as a semantic `<table>` with:
- `role="grid"` on the table element
- `role="columnheader"` on `<th>` elements
- `role="gridcell"` on `<td>` elements
- `aria-selected="true/false"` on each row for selection state
- `aria-label` on the "Select All" checkbox describing its action

**Entry Grid:** Same semantic table structure. Additionally:
- Each input cell is labelled with `aria-labelledby` referencing the corresponding column header's `id`
- "Add Row" button: `aria-label="Add new row to {gridFieldLabel}"`
- Row delete button: `aria-label="Delete row {index+1}"`
- Minimum 44×44 px touch targets on "Add Row" and delete controls (FR-135)

**Boolean field:**
- Toggle: Fluent UI `<Switch>` has built-in ARIA semantics (`role="switch"`, `aria-checked`)
- Radio-pair: Fluent UI `<RadioGroup>` has built-in ARIA semantics (`role="radiogroup"`, `role="radio"`)
- Field label associated via Fluent UI `<Field>` wrapper (FR-097)

### 10.4 Mobile Responsiveness

**Info-Card:** Stacked single-column layout below 768 px (FR-069). Icon rendered above heading. Navigation buttons full-width on mobile.

**Selection Grid (FR-134):** Horizontally scrollable container below 768 px. Visual scroll indicator via CSS. The horizontal scroll wrapper uses `overflow-x: auto` with `-webkit-overflow-scrolling: touch` for iOS smooth scrolling.

**Entry Grid (FR-134, FR-135):** Same horizontal scroll strategy. "Add Row" and row delete controls: minimum 44×44 px touch targets enforced via Fluent UI design token `--ctrl-token-height-l` (44 px minimum).

---

## 11. Observability Extensions

The existing pino structured logging and Azure Monitor integration (phase-3-arch.md section 17) are extended with the following additional log entries and metrics:

**New log events:**

| Event | Level | When | Key fields |
|---|---|---|---|
| `info_card_view_status_check` | info | GET /infocard-view-status | `{ formCode, userId, hasViewed, latencyMs }` |
| `info_card_view_recorded` | info | First view written to Dataverse | `{ formCode, userId }` |
| `selection_grid_load` | info | GET /grids/:fieldId/records | `{ fieldId, page, pageSize, recordCount, latencyMs, isCapped }` |
| `selection_grid_load_error` | error | Dataverse query failure | `{ fieldId, error, correlationId }` |
| `entry_grid_batch_submit` | info | $batch changeset issued | `{ formCode, parentEntity, childCount, batchSize }` |
| `entry_grid_batch_failure` | error | $batch changeset fails | `{ formCode, failingContentId, sourceType, rowIndex, correlationId }` |
| `boolean_field_label_missing` | error | BR-019 guard triggers | `{ fieldId, fieldKey }` |
| `submission_mapping_type_mismatch` | error | BR-020 guard triggers | `{ fieldId, targetAttribute, expectedType, actualType }` |

**New alert threshold:**

- Selection Grid P95 load time > 1,200 ms → warning alert (NFR-019 buffer)
- Selection Grid P95 load time > 1,500 ms → critical alert
- $batch changeset failure rate > 1% over 5 minutes → critical alert

---

## 12. Open Risks and Mitigations

| Rank | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | $batch changeset parsing edge cases differ between Dataverse versions | Medium | High | Validate against the target Dataverse org (Qatar North replacement) before Entry Grid QA. Write explicit unit tests for batch response parser against captured Dataverse response fixtures including partial failure responses. |
| 2 | Selection Grid saved View returns thousands of records if View filter is too permissive | Medium | Medium | `qdb_grid_max_rows` cap (default 200) enforced server-side. Admin screen displays record count at View selection time so the form author can see the result set size before saving. |
| 3 | Info-Card view record creation races on concurrent requests (same user opens form in two tabs simultaneously) | Low | Low | Dataverse alternate key uniqueness constraint prevents duplicate records. The second write returns 412 Precondition Failed; the backend treats 412 on this endpoint as a success (record already exists — user has already viewed). |
| 4 | `qdb_grid_schema_hash` column (String 4000) on `qdb_form_draft` is insufficient for forms with > 50 Entry Grid fields | Very Low | Low | No known form configuration approaches 50 Entry Grid fields. If needed, the hash column can be widened to a Memo (unlimited text) column via Dataverse attribute type upgrade (additive schema change, no record migration). |
| 5 | Entry Grid draft persistence with 50 rows × 10 columns of data approaches `qdb_field_values_json` column size limit | Low | Medium | Phase 3 Skeptic Challenge 5 (base architecture) flagged this. The `qdb_field_values_json` column must be created as a Memo column (not String 1MB) to support large draft payloads. Confirmed at schema creation time. |
| 6 | Selection Grid lazy loading creates a visible blank/skeleton state when users navigate quickly between tabs | Low | Low | Skeleton UI is preferable to blocking load. The 1,500 ms NFR-019 budget is generous. For very slow Dataverse environments, a per-field loading timeout of 3,000 ms shows an error + retry state rather than an indefinite spinner. |
| 7 | View-based Selection Grid queries include columns not listed in `qdb_grid_column_config` if the View layout has additional attributes | Low | Medium | Backend applies an explicit `$select` restriction to only the attributes in `qdb_grid_column_config`. Attributes in the View layout that are not in `qdb_grid_column_config` are never returned to the frontend, regardless of what the View's `fetchxml` selects. |

---

## 13. ADR Index Update

`/projects/dynamic-form-engine/adrs/index.md` must be updated to include:

| ADR | Title | Status | Date | Decided by |
|---|---|---|---|---|
| ADR-001 | Express over Fastify (client mandate) | Accepted | 2026-05-08 | Architect |
| ADR-002 | Fluent UI v9 over Tailwind CSS and Next.js | Accepted | 2026-05-08 | Architect |
| ADR-003 | json-rules-engine adopted for conditional rule evaluation | Accepted | 2026-05-08 | Architect + GitHub Researcher |
| ADR-004 | Native fetch + OData v4 over third-party Dataverse SDK | Accepted | 2026-05-08 | Architect |
| ADR-005 | Custom expression validation deferred to Phase 2 | Accepted | 2026-05-08 | Architect |
| ADR-006 | Backend in-process LRU cache for Dataverse metadata | Accepted | 2026-05-08 | Architect |
| ADR-007 | Same Azure AD tenant — B2C deferred (conditional on QDB confirmation) | Accepted — conditional | 2026-05-08 | Architect |
| ADR-008 | CSS custom properties + Fluent UI tokens | Accepted | 2026-05-17 | Architect |
| ADR-009 | postcss + custom allowlist for custom_css sanitisation | Accepted | 2026-05-17 | Architect |
| ADR-010 | Separate design LRU cache instance | Accepted | 2026-05-17 | Architect |
| ADR-011 | LayoutEngine as pure utility function | Accepted | 2026-05-17 | Architect |
| ADR-ADD-001 | qdb_grid_filter_expression removed — View-based Selection Grid adopted | Accepted | 2026-06-06 | Architect |
| ADR-ADD-002 | Entry Grid atomic transaction via Dataverse $batch changeset | Accepted | 2026-06-06 | Architect |
| ADR-ADD-003 | Selection Grid lazy loading on tab activation | Accepted | 2026-06-06 | Architect |
| ADR-ADD-004 | Info-Card first-view audit via dedicated qdb_info_card_view_record entity | Accepted | 2026-06-06 | Architect |

---

## Skeptic Review

> CHALLENGE 1 — $batch changeset response parsing: The architecture assumes that Dataverse `$batch` changeset responses correctly identify which Content-ID failed. Dataverse's `$batch` implementation has historically had inconsistencies in error response format — some versions return the error in the part body, others return a top-level error. The `parseBatchResponse` method must handle at least three documented response formats and must be tested against real Dataverse responses (including the specific org version in QDB's environment), not only against the OData specification text.

> CHALLENGE 2 — Selection Grid saved View dependency: The architecture moves filter authority to Dataverse saved Views. But saved Views in Dataverse can be modified or deleted by any Dataverse admin with sufficient privileges, independently of form configuration. If a CRM admin deletes or modifies the View referenced by `qdb_grid_saved_view_id`, the Selection Grid silently returns different records (or fails with 404 on the View lookup). There is no referential integrity constraint between a View GUID stored in a custom entity attribute and the actual View record in Dataverse. The backend must handle a 404 on View lookup gracefully, returning a user-facing error ("This grid's configuration is unavailable — please contact your administrator") and logging the missing View GUID with the field ID.

> CHALLENGE 3 — qdb_form_draft JSON column size under realistic load: A form with a 50-row Entry Grid, each row containing 8 text fields of up to 100 characters, generates a `fieldValues` JSON payload of approximately 50 × 8 × 100 = 40,000 characters — plus JSON structure overhead. The `qdb_field_values_json` column must be a Dataverse Memo (nvarchar(max)) not a String. The architecture states this in Risk 5 but does not make it a hard schema requirement. This must be a schema creation requirement, not a risk to monitor.

> CHALLENGE 4 — Column-change invalidation: The hash comparison for Entry Grid draft invalidation relies on a SHA-256 truncated to 16 hex chars of the sorted column attribute names. Truncation to 16 hex chars yields 64 bits of hash space — collision probability for a form with 10 grid fields each modified independently is negligible in practice. But the invalidation logic must also handle the case where `qdb_grid_schema_hash` is null on the draft (drafts saved before the addendum deployment have no hash). The absence of a hash on resume must default to "assume invalidated" for Entry Grid fields, not "assume valid" — otherwise users who saved drafts before the addendum deployment would resume with stale row data against a potentially changed column schema.

> CHALLENGE 5 — First-view audit race between two concurrent form opens: The architecture acknowledges this in Risk 3 and states the 412 response on the second write is treated as success. But the first write and the second write both happen within the same ~50 ms window, and both reads of the alternate key check return "no record exists" before either write completes. The 412 handling relies on Dataverse enforcing the alternate key constraint — which it does, but the error type returned by Dataverse for an alternate key violation is `0x80060892` (a specific error code), not a generic 412. The `DataverseClient` must be extended to parse this specific error code and treat it as a non-fatal success condition, rather than retrying it as a transient error.

> CHALLENGE 6 — Info-Card screen viewed audit during offline/poor-network sessions: The first-view audit check (`GET /api/forms/:formCode/infocard-view-status`) is issued on `InfoCardFlow` mount. If this call fails (network timeout, Dataverse unavailable), the architecture says "the user is still shown Info-Card screens" and "the failure is logged." But the first-view flag is never set. The next time the user opens the form (even 1 second later), the check is re-issued. If that also fails, the audit event is never recorded. In a poor-network environment (which is common in a banking portal used on mobile devices), the first-view audit event may never be recorded for a significant fraction of users. Is this acceptable for a compliance-motivated audit trail? The answer may be yes (it is a UX audit event, not a regulatory audit event), but it must be explicitly accepted by QDB Compliance before Phase 4, not left as an implicit assumption.

> CHALLENGE 7 — Submit button rendering from rule engine tab visibility: The final tab computation re-evaluates whenever the rule engine changes tab visibility. If a business rule hides the tab that was computed as the final tab, `finalTabId` changes to the next-highest visible tab. But the rule engine evaluates based on current field values, which change on every keystroke. A toggle field that alternately shows/hides the last tab would cause the Submit button to appear and disappear on every toggle. If the form author has configured such a rule (intentionally or by error), the UX is disorienting. The architecture should specify that `finalTabId` is only recomputed when the visibility map changes for tab-level visibility specifically, and that a debounce of at least 300 ms is applied before the recomputation is reflected in the rendering.

> CHALLENGE 8 — $batch size guard at 500 operations: The ceiling of 500 batch operations prevents a pathological case but does not prevent a realistic case. A form with an Entry Grid field with `qdb_grid_max_rows = 50` and 10 standard child records creates 50 + 10 + 1 = 61 operations — well within limits. But two Entry Grid fields with `qdb_grid_max_rows = 200` each creates 400 + 1 = 401 operations per submission. The user experience of filling 400 rows across two Entry Grids on a banking form raises a question: is this a realistic configuration, or is it a sign of a misconfigured form? The admin screen should surface a warning when `qdb_grid_max_rows * (number of Entry Grid fields)` on a single form approaches the 500-operation ceiling.

> CHALLENGE 9 — Lazy Selection Grid + form validation on final submit: The architecture specifies that Selection Grid records load lazily on tab activation. But form submission requires full validation across all tabs (FR-026). If the user completes tabs 1 and 3 but never navigates to tab 2 (which contains a required Selection Grid), the Selection Grid's records have never been loaded and no selection has been made. The validation engine must flag this as a validation failure. But the `ValidationEngine.buildZodSchema` for a Selection Grid field must produce a schema that marks the field as failing if `field.isRequired` is true and the RHF value (the selection Set) is empty or undefined — without needing the records to have ever loaded. This is correct and achievable, but must be explicitly confirmed in the Zod schema for the `interactive-grid` field type during Phase 4.

> CHALLENGE 10 — Dataverse View permissions for Selection Grid: The backend service principal fetches saved View `fetchxml` from Dataverse. Saved Views in Dataverse can be either System Views (owned by the application/admin) or User Views (owned by individual users). A View GUID pointing to a User View owned by a specific CRM admin will be inaccessible if that admin's account is deactivated or their user context is unavailable to the service principal. The admin screen must enforce that only System Views can be selected as `qdb_grid_saved_view_id`. The backend must validate at metadata assembly time that the referenced View is a system view (`savedquery` entity) and not a user view (`userquery` entity), and must reject the form definition with a configuration error if a user view GUID is referenced.

These challenges must be addressed before Phase 4 begins.

---

*Phase 3 Architecture Addenda — Dynamic Form Engine Portal — QDB*
*Maqsad AI — Solution Architect — 2026-06-06*
*DFE-ADD-001 (Info-Card Screens) + DFE-ADD-002 (Boolean Field, Interactive Grid, Tab-Aware Buttons)*
