# Dynamic Form Engine — Complete Feature List

> Last updated: 2026-06-21
> Platform: Microsoft Dataverse + Node.js API + React Frontend + React Designer (CRM Web Resource)

---

## Platform Overview

A no-code form platform integrated with Microsoft Dataverse. Forms are configured in a visual
designer, served by a Node.js API, and rendered in a React frontend — all without code deployments.

- **Backend**: Node.js + TypeScript + Express + Prisma-free (direct Dataverse OData v4)
- **Frontend Portal**: React + TypeScript + Fluent UI v9
- **Form Designer**: React + TypeScript + Fluent UI v9 (CRM Web Resource)
- **Database**: Microsoft Dataverse (Dynamics 365 CRM cloud)

---

## Backend API

### API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/health` | GET | Health check |
| `/api/forms` | GET | List all forms (search + status filter) |
| `/api/forms/:code/metadata` | GET | Full form definition with design payload |
| `/api/forms/:code/data/:recordId` | GET | Load existing Dataverse record into form |
| `/api/forms/:code/submit` | POST | Submit form (wrapped in Dataverse `$batch`) |
| `/api/forms/:code/draft` | POST | Save / resume draft submission |
| `/api/forms/:code/validate` | POST | Server-side field validation |
| `/api/forms/:code/versions` | GET | Form version history |
| `/api/forms/:code/clone` | POST | Deep-clone form to new draft |
| `/api/grids/:fieldId/records` | GET | Paginated grid records (FetchXML, server-side) |
| `/api/lookups/:fieldId/search` | GET | Async lookup field search against Dataverse |
| `/api/options/:fieldId` | GET | Dynamic option set values |
| `/api/files/upload` | POST | File upload to CRM Notes |
| `/api/themes` | GET | List visual themes |
| `/api/form-design/:code` | GET | Form design / layout payload |
| `/api/admin/*` | GET/POST | Cache invalidation, admin CRUD |
| `/api/designer/records/:entity` | GET/POST/PATCH/DELETE | Designer proxy to Dataverse (entity name normalised) |
| `/api/forms/:code/infocard-view-status` | GET | Info-card first-view tracking |
| `/api/forms/:code/info-card-viewed` | POST | Record that user has viewed info cards |

### Backend Services

| Service | Responsibility |
|---|---|
| `CrmAuthService` | OAuth2 client-credentials token management with auto-refresh |
| `CrmMetadataService` | Full form definition assembly with configurable LRU cache |
| `CrmSubmissionService` | Single-record form submission via Dataverse OData |
| `CrmBatchSubmissionService` | All writes in one `$batch` changeset — atomicity guarantee |
| `CrmGridDataService` | Selection Grid: FetchXML execution, paging, sort, search, filter, attribute injection, OData lookup remapping |
| `CrmInfoCardService` | Info-card screen metadata + first-view audit with duplicate suppression |
| `CrmInfoCardAdminService` | Admin CRUD for info-card content with HTTPS URL validation |
| `CrmLookupService` | Dataverse entity search with `dependsOn` cascading filter |
| `CrmDesignService` | Theme and form-design payload with LRU cache |
| `CrmFormCloneService` | Deep clone of form and all child entity records |
| `CrmDesignerProxyService` | Secure pass-through to Dataverse for the designer (entity allowlist, singular ↔ plural name normalisation) |
| `CrmFileService` | CRM Notes file attachment upload |
| `CrmAuditService` | Append-only audit log writes |
| `GridSchemaHashService` | SHA-256 hash of grid column schema for draft invalidation |
| `AccessPolicyService` | Per-form access group enforcement |

---

## Frontend Portal

### Field Types

| Type | Notes |
|---|---|
| Text | With optional prefix / suffix decorators |
| Textarea | Multi-line |
| Email | Format-validated |
| Phone | Format-validated |
| Number | Formatted numeric input |
| Currency | With currency code display |
| Decimal | Configurable decimal places |
| Date | Date picker |
| DateTime | Date + time picker |
| Dropdown | Single-select optionset |
| Multiselect | Dropdown or checkbox render style |
| Radio | List or card render style |
| Checkbox | Simple boolean |
| Boolean | Toggle or radio with configurable true/false labels |
| Lookup | Async Dataverse search with `dependsOn` cascading |
| File Upload | Multi-file, MIME type + max size enforcement |
| Rich Text | WYSIWYG editor |
| Custom | Component key dispatch to registered components |
| Info Card | Full-screen onboarding card flow before form entry |
| Interactive Grid | Selection Grid or Entry Grid (mode-dispatched) |

### Selection Grid

- Server-side paging using FetchXML cursor (paging cookie)
- Column sort — click header to cycle ascending / descending / none
- Global text search across all text-type columns
- **Per-column filters** in the `<thead>` filter row:
  - Text columns — LIKE filter
  - Optionset columns — exact EQ match via dropdown
  - Lookup columns — link-entity JOIN filter by display attribute
- **Outside-field `dependsOn` filter** — an external form field (text box, dropdown, or company-picker dropdown) drives the grid's FetchXML condition in real-time. Configured via:
  - `qdb_grid_depends_on_field_schema` — schema name of the controlling field
  - `qdb_grid_depends_on_filter_template` — FetchXML condition template with `{dependsOnValue}` placeholder
- Single-select and multi-select modes
- Table view + Card view toggle
- Non-blocking refetch overlay (existing records stay visible during filter updates)
- Row limit cap with administrator notice
- Total record count and total page count display

### Entry Grid

- Inline add / edit / delete rows without leaving the form
- Required minimum row validation (no submit until minimum met)
- All row writes wrapped in a single Dataverse `$batch` changeset

### Info Card Flow

- Multi-screen onboarding displayed before the form tabs
- Configurable: skip allowed or required
- First-view audit write to Dataverse with duplicate suppression
- Back / Continue / Skip navigation bar
- Section renderers: Numbered Steps, Icon List, Download List

### Form Engine Behaviours

- Tab-by-tab navigation with optional completion gating
- **Business Rules Engine**
  - Conditions: field value equals / not equals / contains / is empty / is not empty
  - Actions: show/hide field, show/hide section, show/hide tab, make required/optional, make readonly/editable, set value, clear value, calculate value, filter options, filter lookup
- **Validation Rules**
  - Required, min/max length, min/max value, regex pattern, email, phone, date before/after, cross-field compare, custom expression
  - Reusable rule templates
- Draft save and resume with SHA-256 schema-hash invalidation on grid column changes
- Confirmation message on submit with optional Dataverse record reference display
- Optional summary step before final submission
- Localised field labels (locale override fetched from Dataverse)
- Per-form access group enforcement

---

## Form Designer

### Screens

| Screen | Purpose |
|---|---|
| Form List | Browse all forms by status, full-text search |
| New Form Wizard | Create a new form — name, code, target entity |
| Designer Canvas | Drag-and-drop field layout with tabs / sections |
| Preview | Live render of the form inside the designer shell |
| Option Set Editor | Manage dropdown / multiselect option values |
| Lookup Config | Configure lookup target entity, display attribute, filter, `dependsOn` |
| Rule Config | Visual business rule builder |
| Rule Template Editor | Create / manage reusable validation rule templates |
| Submission Mapping | Map form fields to Dataverse entity attributes |
| Theme Editor | Visual theme customisation (colours, fonts, spacing) |
| Field Label Editor | Per-locale label / placeholder / tooltip overrides |
| Access Policy Editor | Configure per-form access group |
| Version History | Browse and compare published form versions |
| Publish Validation | Pre-publish checklist with blocking / warning rules |

### Component Toolbox

Drag to canvas to add any of:
Text · Textarea · Number · Date · DateTime · Dropdown · Multiselect · Radio · Checkbox · Boolean ·
Lookup · Currency · Decimal · Email · Phone · File Upload · Rich Text · Custom · Info Card · Interactive Grid

### Per-Field Property Panels

Each field type has a dedicated configuration panel covering:
label, placeholder, tooltip, default value, required / readonly / hidden flags, column span,
validation rules, and type-specific config:

| Field | Type-specific config |
|---|---|
| Dropdown / Radio / Multiselect | Option values editor |
| Lookup | Target entity, display attribute, filter expression, `dependsOn` field |
| Interactive Grid | Grid mode (Selection / Entry), target entity, saved view, column definitions, `dependsOn` filter |
| Boolean | True label, false label, render style (toggle / radio) |
| File Upload | Allowed MIME types, max file size, max file count |
| Info Card | Style (info / warning / success / error), title, body, icon, download link |

---

## Newly Added Features (this session)

| Feature | Detail |
|---|---|
| **Per-column grid filters** | Text (LIKE), optionset (EQ dropdown), lookup (link-entity JOIN) rendered as a filter row inside the selection grid `<thead>` |
| **Outside-field `dependsOn` filter** | An external form field — text, dropdown, or company-picker dropdown — automatically re-queries the grid below it when its value changes. Fully generic: any FetchXML condition can be templated |
| **FetchXML attribute injection** | Backend injects `<attribute>` nodes for grid columns not included in the saved view's native select list, guaranteeing all column data is returned |
| **OData lookup key remapping** | `_parentcustomerid_value` (Dataverse navigation property form) is remapped to `parentcustomerid` in the API response so the frontend receives consistent attribute names |
| **v2 column options JSON** | Extended `qdb_column_options_json` format `{"v":2,"filterType":"...","options":[...],"lookupTargetEntity":"...","lookupDisplayAttribute":"..."}` — encodes richer column metadata without Dataverse schema changes |
| **Designer proxy entity name normalisation** | The designer proxy now accepts both singular Xrm.WebApi names (`qdb_form_definition`) and plural OData set names (`qdb_form_definitions`), normalising before forwarding to Dataverse |
| **Designer CORS expansion** | Backend allows origins on ports 3001, 5173, and 5174 in addition to 3000 and 8081 |
| **Seed: `seed-grid-filter-demo`** | Seeds 3 Dataverse accounts + 8 contacts with varied gender and company assignments to test all three in-grid column filter types |
| **Seed: `seed-outside-filter-demo`** | Seeds a 3-section form demonstrating the full `dependsOn` pattern: Section 1 — text field → fullname LIKE filter; Section 2 — dropdown → gendercode EQ filter; Section 3 — company-picker dropdown (GUID values) → parentcustomerid EQ filter |

---

## Test Data (Seeded in Dataverse)

| Form Code | Purpose |
|---|---|
| `loan-application` | Core banking loan form |
| `feature-showcase` | All field types demonstration |
| `buy-house` | Multi-tab mortgage application |
| `grid-filter-demo` | In-grid column filter testing (text + optionset + lookup) |
| `outside-filter-demo` | dependsOn outside-field filter (text + dropdown + company picker) |

---

## Running Locally

| Service | Command | URL |
|---|---|---|
| Backend API | `node --import tsx/esm src/index.ts` (from `backend/`) | http://localhost:4000 |
| Frontend Portal | `npm run dev -- --port 3001` (from `frontend/`) | http://localhost:3001 |
| Form Designer | `npm run dev -- --port 5174` (from `designer/`) | http://localhost:5174 |

> **Note:** `tsx watch` has a known hang on this Windows environment. Use `node --import tsx/esm src/index.ts` for the backend instead of `npm run dev`.
