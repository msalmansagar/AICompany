# Form Designer — Complete Field Type Gap Report

**Prepared:** 2026-06-11  
**Scope:** Cross-reference of ALL field types across shared types, backend, designer toolbox,
designer properties panels, designer preview, web frontend, and mobile app.

---

## 1. Cross-Reference Master Table

**Legend:**  
✅ Fully implemented · ⚠️ Partial/mismatch · ❌ Missing · 🐛 Bug

| Field Type | Shared `FieldType` | Backend CRM Map | Designer Toolbox | Designer Properties Panel | Designer Canvas | Designer Preview | Web Frontend | Mobile App |
|---|---|---|---|---|---|---|---|---|
| `text` | ✅ | ✅ `100000001` | ✅ Basic | ✅ TextFieldPanel | ✅ | ✅ | ✅ | ✅ |
| `textarea` | ✅ | ✅ `100000002` | ✅ Basic | ✅ TextFieldPanel | ✅ | ✅ | ✅ | ✅ |
| `number` | ✅ | ✅ `100000003` | ✅ Basic | ✅ NumberFieldPanel | ✅ | ✅ | ✅ | ✅ |
| `currency` | ✅ | ✅ `100000011` | ✅ Basic | ⚠️ Inline only (no panel) | ✅ | ✅ | ✅ | ✅ |
| `decimal` | ✅ | ✅ `100000012` | ✅ Basic | ⚠️ Inline only (no panel) | ✅ | ✅ | ✅ | ✅ |
| `date` | ✅ | ✅ `100000004` | ✅ Basic | ✅ DateFieldPanel | ✅ | ✅ | ✅ | ✅ |
| `datetime` | ✅ | ✅ `100000005` | ✅ Basic | ✅ DateFieldPanel | ✅ | ✅ | ✅ | ✅ |
| `dropdown` | ✅ | ✅ `100000006` | ✅ Basic | ✅ DropdownFieldPanel | ✅ | ✅ | ✅ | ✅ |
| `multiselect` | ✅ | ✅ `100000007` | ✅ Basic (as `multi_select`) | ✅ DropdownFieldPanel | ✅ | ⚠️ Falls to `<input text>` | ✅ | ✅ |
| `lookup` | ✅ | ✅ `100000008` | ✅ Basic | ✅ LookupFieldPanel | ✅ | ✅ | ✅ | ✅ |
| `checkbox` | ✅ | ✅ `100000009` | ✅ Basic | ✅ CheckboxFieldPanel | ✅ | ✅ | ✅ | ✅ |
| `radio` | ✅ | ✅ `100000010` | ✅ Basic | ✅ DropdownFieldPanel | ✅ | ✅ | ✅ | ✅ |
| `email` | ✅ | ✅ `100000013` | ✅ Basic | ✅ TextFieldPanel | ✅ | ✅ | ✅ | ✅ |
| `phone` | ✅ | ✅ `100000014` | ✅ Basic | ✅ TextFieldPanel | ✅ | ✅ | ✅ | ✅ |
| `file` | ✅ | ✅ `100000015` | ✅ Basic (as `file_upload`) | ✅ FileUploadFieldPanel | ✅ | ✅ | ✅ | ✅ |
| `richtext` | ✅ | 🐛 Emits `'richText'` (camelCase) | ✅ Basic (as `rich_text`) | ✅ RichTextFieldPanel | ✅ | ✅ | 🐛 Switches on `'richText'` | ✅ Switches on `'richtext'` |
| `grid` | ✅ | 🐛 Emits `'repeatingGrid'` | ✅ Advanced (as `repeating_grid`) | ❌ No panel | ✅ Generic slot | ❌ Falls to `<input text>` | 🐛 Switches on `'repeatingGrid'` | ✅ Switches on `'grid'` |
| `boolean` | ✅ | ✅ `100000019` | ❌ Not in toolbox | ❌ No panel | ✅ Generic slot | ❌ Falls to `<input text>` | ✅ BooleanControl | ✅ FormBooleanField |
| `info-card` | ✅ | ✅ `100000020` | ❌ Not in toolbox | ❌ No panel | ✅ Generic slot | ❌ Falls to `<input text>` | ✅ InfoCardField | ✅ FormInfoCardField |
| `interactive-grid` | ✅ | ✅ `100000021` | ❌ Not in toolbox | ❌ No panel | ✅ Generic slot | ❌ Falls to `<input text>` | ✅ InteractiveGridField | ✅ FormInteractiveGridField |
| `custom` | ❌ Not in union | ✅ `100000018` | ✅ Advanced | ✅ CustomFieldPanel | ✅ | ✅ | ✅ ComponentRegistry | ✅ ComponentRegistry |

---

## 2. Critical Bugs (Breaking Runtime Behaviour)

These are active bugs in production — they cause fields to render incorrectly or not at all.

---

### 🐛 BUG-01 — `richText` vs `richtext` Case Mismatch

**Severity:** High — rich text fields rendered on mobile always fall through to `default` case  

| Layer | What it uses | What it should use |
|---|---|---|
| `shared/src/types/form.ts` | `'richtext'` (lowercase) | — (this is the source of truth) |
| `backend CrmMetadataService.ts` line 673 | `'richText'` (camelCase) ← **BUG** | `'richtext'` |
| `frontend FieldRenderer.tsx` | `case 'richText':` ← matches backend, not shared | `case 'richtext':` |
| `mobile FieldRenderer.tsx` | `case 'richtext':` ← matches shared, not backend | correct |
| `mobile FormService.ts` FIELD_TYPE_MAP | `richText: 'richtext'` ← has a normalizer | correct (normalizer compensates) |

**What breaks:** The mobile `FormService.ts` has a `FIELD_TYPE_MAP` normalizer (`richText → richtext`) so mobile actually works. But the **frontend web** switches on `'richText'` which is the backend's wrong emission — if the backend is ever fixed to emit `'richtext'`, the frontend will break.

**Fix locations:**
```
backend/src/services/CrmMetadataService.ts  line 673
  Change: 100000017: 'richText'
  To:     100000017: 'richtext'

frontend/src/components/forms/FieldRenderer.tsx
  Change: case 'richText':
  To:     case 'richtext':

mobile/src/services/FormService.ts  FIELD_TYPE_MAP
  Remove: richText: 'richtext'   (normalizer no longer needed)
```

---

### 🐛 BUG-02 — `repeatingGrid` vs `grid` Name Mismatch

**Severity:** High — repeating grid fields from the backend never match mobile's switch case  

| Layer | What it uses | What it should use |
|---|---|---|
| `shared/src/types/form.ts` | `'grid'` | — (source of truth) |
| `backend CrmMetadataService.ts` line 672 | `'repeatingGrid'` (camelCase) ← **BUG** | `'grid'` |
| `frontend FieldRenderer.tsx` | `case 'repeatingGrid':` ← matches backend, not shared | `case 'grid':` |
| `mobile FieldRenderer.tsx` | `case 'grid':` ← matches shared, not backend | correct |
| `mobile FormService.ts` FIELD_TYPE_MAP | `repeatingGrid: 'grid'` ← normalizer compensates | correct |

**What breaks:** Same pattern as BUG-01. Mobile normalizer saves it for now, but frontend will break if backend is ever corrected. The source of truth (`shared/form.ts`) says `'grid'`; the backend says `'repeatingGrid'`.

**Fix locations:**
```
backend/src/services/CrmMetadataService.ts  line 672
  Change: 100000016: 'repeatingGrid'
  To:     100000016: 'grid'

frontend/src/components/forms/FieldRenderer.tsx
  Change: case 'repeatingGrid':
  To:     case 'grid':

mobile/src/services/FormService.ts  FIELD_TYPE_MAP
  Remove: repeatingGrid: 'grid'   (normalizer no longer needed)
```

---

### 🐛 BUG-03 — `custom` Field Type Not in Shared `FieldType` Union

**Severity:** Medium — TypeScript does not enforce `'custom'` as a valid FieldType  

The backend maps `100000018 → 'custom'`. Both frontend and mobile handle it via `ComponentRegistry`. But `'custom'` is not in `shared/src/types/form.ts`'s `FieldType` union. This means:
- `FieldDefinition.fieldType` typed as `FieldType` can never be `'custom'` in TypeScript
- Frontend/mobile must cast to `any` or use type assertion to check `fieldType === 'custom'`
- The exhaustiveness check in both FieldRenderers (`const exhaustive: never = effectiveField.fieldType`) will never catch unhandled custom fields

**Fix:**
```typescript
// shared/src/types/form.ts
export type FieldType =
  | 'text' | 'textarea' | 'number' | 'currency' | 'decimal'
  | 'date' | 'datetime' | 'dropdown' | 'multiselect' | 'lookup'
  | 'checkbox' | 'radio' | 'email' | 'phone' | 'file'
  | 'richtext' | 'grid' | 'boolean' | 'info-card' | 'interactive-grid'
  | 'custom';   // ← add this
```

---

## 3. Designer — Complete Field Type Gaps

### 3.1 `boolean` — Completely Missing from Designer

**Status:** Exists in shared, backend, web, mobile — but has zero presence in the designer.

**What's missing:**

**A. Toolbox entry** — add to Basic Fields in `ComponentToolbox.tsx`:
```typescript
{ type: 'boolean', label: 'Yes / No Toggle', icon: 'ToggleLeft' }
```

**B. Designer constant** — add to `constants/fieldTypes.ts`:
```typescript
boolean = 'boolean'
```

**C. Properties panel** — new `BooleanFieldPanel.tsx`:
```
Config needed:
  boolRenderStyle:   'toggle' | 'radio'   (how it renders at runtime)
  trueLabel:         string               (label shown for "true" option)
  falseLabel:        string               (label shown for "false" option)
  defaultChecked:    boolean              (initial value)
```

**D. Preview rendering** — add case in `PreviewScreen.tsx`:
```tsx
case 'boolean':
  return field.boolRenderStyle === 'radio'
    ? <div className="preview-radio-pair">
        <label><input type="radio" /> {field.trueLabel || 'Yes'}</label>
        <label><input type="radio" /> {field.falseLabel || 'No'}</label>
      </div>
    : <input type="checkbox" role="switch" />;
```

**E. Dataverse mapping** — `qdb_form_field` needs columns for `boolRenderStyle`, `trueLabel`, `falseLabel` if not already present. Verify in `FormFieldService.ts`.

---

### 3.2 `info-card` (Inline Field) — Completely Missing from Designer

**Status:** Exists in shared, backend, web, mobile — but has zero presence in the designer.

Note: This is the **inline info-card field** placed inside a form section — NOT the pre-form `InfoCardScreen` flow (covered separately in section 3.5).

**What's missing:**

**A. Toolbox entry** — add to Basic Fields:
```typescript
{ type: 'info-card', label: 'Info Banner', icon: 'Info' }
```

**B. Properties panel** — new `InfoCardFieldPanel.tsx`:
```
Config needed:
  infoCardStyle:   'info' | 'warning' | 'success' | 'error'
  infoCardTitle:   string   (bold headline, optional)
  infoCardBody:    string   (rich text or plain text body)
  infoCardIcon:    string   (Fluent icon name, optional)
```

**C. Canvas rendering** — in `FieldSlot.tsx`, render inline banners with a coloured left border (blue=info, amber=warning, green=success, red=error) instead of the default input box. This makes the canvas match what the user sees at runtime.

**D. Preview rendering** — add case in `PreviewScreen.tsx`:
```tsx
case 'info-card':
  const colours = { info:'#0078d4', warning:'#f7630c', success:'#107c10', error:'#d92b2b' };
  return <div style={{
    borderLeft: `4px solid ${colours[field.infoCardStyle ?? 'info']}`,
    background: '#f5f5f5', padding: '8px 12px', borderRadius: '4px'
  }}>
    {field.infoCardTitle && <strong>{field.infoCardTitle}</strong>}
    {field.infoCardBody && <p>{field.infoCardBody}</p>}
  </div>;
```

**E. No label wrapper** — info-card fields are display-only at runtime. The designer should hide the "Required", "Read Only", and "Placeholder" common properties for this type (they're irrelevant). Add a `displayOnlyTypes` list to `FieldProperties.tsx` that conditionally hides these controls.

---

### 3.3 `interactive-grid` — Completely Missing from Designer

**Status:** The most feature-rich field type. Exists fully in backend, web, and mobile — but zero presence in the designer toolbox, no properties panel, no canvas preview, no preview rendering.

**What's missing:**

**A. Toolbox entry** — add to Advanced:
```typescript
{ type: 'interactive-grid', label: 'Interactive Grid', icon: 'Table' }
```

**B. Properties panel** — new `InteractiveGridFieldPanel.tsx`:
```
Config needed:
  gridMode:         'selection' | 'entry'        (drives which sub-config is shown)

  --- SELECTION MODE ---
  selectionMode:    'single' | 'multi'
  entityName:       string                       (Dataverse entity logical name)
  savedViewId:      string (optional)            (Saved View GUID to drive columns/filter)
  filterExpression: string (optional)            (OData filter string)
  maxRows:          number (optional)            (row cap, default 200)
  dependsOnFieldId: string (optional)            (field code, for dynamic filtering)
  dependsOnFilterTemplate: string (optional)     (FetchXML template with {value} placeholder)

  Column Configuration (sub-panel):
  ┌─────────────────────────────────────────────────────────┐
  │  + Add Column                                           │
  │  ──────────────────────────────────────────────────────│
  │  ↕  Column Label   Target Attribute  Field Type  [Del] │
  │  ↕  Column Label   Target Attribute  Field Type  [Del] │
  └─────────────────────────────────────────────────────────┘

  --- ENTRY MODE ---
  maxRows:          number                       (max editable rows)
  minRows:          number                       (minimum rows to show)
  entityName:       string                       (target entity for row saves)

  Column Configuration (same sub-panel as above, but adds:)
  isEditable:       boolean per column
  columnOptions:    JSON (for dropdown-type columns)
```

**C. Canvas rendering** — in `FieldSlot.tsx`, render a table skeleton:
```
[ Selection Grid: Entity Name ]
┌────────────┬──────────────┬──────────────┐
│ Column 1   │ Column 2     │ Column 3     │
├────────────┼──────────────┼──────────────┤
│ (data rows │ load at      │ runtime)     │
└────────────┴──────────────┴──────────────┘
  [multi-select badge]  [search icon]  [pagination icon]
```

**D. Preview rendering** — show a minimal table with column headers from config. Add case in `PreviewScreen.tsx`:
```tsx
case 'interactive-grid': {
  const cols = field.gridConfig?.columnConfigs ?? [];
  return <div className="preview-grid-wrapper">
    <table className="preview-grid">
      <thead><tr>
        {cols.length > 0
          ? cols.map(c => <th key={c.columnId}>{c.columnLabel}</th>)
          : <th>Configure columns in properties panel</th>}
      </tr></thead>
      <tbody><tr><td colSpan={cols.length || 1} className="preview-grid-empty">
        Data loads at runtime
      </td></tr></tbody>
    </table>
  </div>;
}
```

**E. Grid Column Config Sub-Panel** — this is the most important piece. Must allow:
- Add column (label + target attribute + field type)
- Reorder columns via drag-drop
- Delete column
- Save column configs to `qdb_grid_column_configs` Dataverse entity

**F. New Dataverse service** — `GridColumnConfigService.ts`:
```typescript
listColumnsForField(fieldId: string): Promise<GridColumnConfig[]>
upsertColumn(fieldId: string, col: GridColumnConfig): Promise<string>
deleteColumn(columnId: string): Promise<void>
reorderColumns(fieldId: string, orderedIds: string[]): Promise<void>
```

**G. Load on field select** — when `interactive-grid` field is selected in canvas, the properties panel should fetch its current `qdb_grid_column_configs` from Dataverse.

---

### 3.4 `grid` (Repeating Grid) — Has Toolbox Entry, No Properties Panel

**Status:** In the toolbox as `repeating_grid` (Advanced category), but clicking it shows only the generic properties (label, code, placeholder, required, readonly, hidden). No dedicated panel.

**What's missing:**

**Properties panel** — new `RepeatingGridFieldPanel.tsx`:
```
Config needed:
  maxRows:    number   (max rows, default 200)
  minRows:    number   (min rows shown on load, default 1)
  entityName: string   (CRM entity for row submission)

  Column Configuration (same sub-panel as interactive-grid):
    column label, target attribute, field type, editable, options (for dropdown cols)
```

**Preview rendering** — same table skeleton as interactive-grid.

---

### 3.5 `InfoCardScreen` Flow — Designer Has No Screen for It

**Status:** The pre-form info-card flow (`formDefinition.infoCards[]`) is completely absent from the designer.

This is the most significant capability gap — a designer cannot create or edit the onboarding screens that appear before the form.

The backend has full support: `CrmInfoCardService`, `CrmInfoCardAdminService`, `POST /api/admin/info-card-items`, `PATCH /api/admin/info-card-items/:id`. The API is ready; the designer just has no UI for it.

**What's missing — a new designer screen: `InfoCardEditorScreen`**

```
Layout: Screen list (left) | Screen editor (right)

LEFT PANEL — Screen list:
  [+ Add Screen]
  ┌─────────────────────────────────────────────┐
  │  ≡  Screen 1: Welcome          [Edit] [Del] │
  │  ≡  Screen 2: What You Need    [Edit] [Del] │
  │  ≡  Screen 3: How It Works     [Edit] [Del] │
  └─────────────────────────────────────────────┘
  Drag to reorder screens (sets displayOrder)

RIGHT PANEL — Selected screen editor:
  ┌─────────────────────────────────────────────┐
  │  Icon URL:   [_______________________]  [?] │
  │  Icon Alt:   [_______________________]      │
  │  Heading:    [_______________________] *    │
  │  Subheading: [_______________________]      │
  │                                             │
  │  Sections:                                  │
  │  [+ Add Section]                            │
  │  ┌───────────────────────────────────────┐  │
  │  │  Section Type: [numbered-steps  ▼]    │  │
  │  │  Items:                               │  │
  │  │  [+ Add Item]                         │  │
  │  │  ┌─────────────────────────────────┐  │  │
  │  │  │ Title: [___________]            │  │  │
  │  │  │ Description: [___________]      │  │  │
  │  │  │ Icon: [___________]             │  │  │
  │  │  │ Download URL: [___________]     │  │  │
  │  │  └─────────────────────────────────┘  │  │
  │  └───────────────────────────────────────┘  │
  └─────────────────────────────────────────────┘

Bottom: [Preview Info Card Flow]  [Save Changes]
```

**Section types to support:**
- `numbered-steps` — renders as numbered list (1, 2, 3...)
- `icon-list` — renders each item with an icon + label + description
- `download-list` — renders items with download button (enforces HTTPS URL)

**Navigation:** Add "Info Cards" button to the command bar (between "Mapping" and "Theme").

**Services needed:** new `InfoCardScreenService.ts`:
```typescript
listScreens(formId: string): Promise<InfoCardScreen[]>
upsertScreen(formId: string, screen: InfoCardScreenInput): Promise<string>
deleteScreen(screenId: string): Promise<void>
reorderScreens(formId: string, orderedIds: string[]): Promise<void>
upsertSection(screenId: string, section: InfoCardSectionInput): Promise<string>
deleteSection(sectionId: string): Promise<void>
upsertItem(sectionId: string, item: InfoCardItemInput): Promise<string>
deleteItem(itemId: string): Promise<void>
```

---

### 3.6 Form Buttons — Designer Has No UI

**Status:** The form runtime renders buttons from `formDefinition.buttons[]` (submit, saveDraft, cancel, reset). The designer has no way to add, remove, or configure buttons.

Currently, forms get a default "Submit" button injected at runtime if no buttons are configured. Any form requiring a "Save Draft" button, custom label, or confirmation dialog cannot be configured from the designer.

**What's missing — a "Buttons" sub-panel in `FormProperties`:**

```
Buttons:                              [+ Add Button]
┌──────────────────────────────────────────────────────┐
│  ≡  Submit          [Primary]  [submit]    [Edit][Del]│
│  ≡  Save Draft      [Secondary][saveDraft] [Edit][Del]│
│  ≡  Cancel          [Secondary][cancel]   [Edit][Del] │
└──────────────────────────────────────────────────────┘

Edit Button modal:
  Label:                 [___________________]
  Action:                [submit ▼]           (submit | saveDraft | cancel | reset)
  Primary (filled):      [toggle]
  Visible:               [toggle]
  Require confirmation:  [toggle]
  Confirmation message:  [_________________________________]   (shown when toggle ON)
  Display order:         [number]
```

**Service:** `FormButtonService.ts` — upsert/delete `qdb_form_button` records. Should be called from `FormSaveService.save`.

---

## 4. Designer Preview Gaps

The `PreviewScreen` falls through to `<input type="text">` for 5 field types. These are "silent" gaps — the preview doesn't break, it just shows wrong widgets.

| Field type | Currently shows | Should show |
|---|---|---|
| `boolean` | `<input type="text">` | Toggle switch or Yes/No radio pair |
| `info-card` | `<input type="text">` | Coloured info banner with title and body |
| `interactive-grid` | `<input type="text">` | Table with column headers from config |
| `grid` (repeating) | `<input type="text">` | Editable table skeleton |
| `multiselect` | `<input type="text">` | `<select multiple>` or checkbox list |

---

## 5. Summary of All Gaps

### Bugs (fix immediately — active breakage)

| ID | Bug | Files to change |
|---|---|---|
| **BUG-01** | `richText` vs `richtext` case mismatch | `CrmMetadataService.ts`, `FieldRenderer.tsx` (web), `FormService.ts` (mobile normalizer cleanup) |
| **BUG-02** | `repeatingGrid` vs `grid` name mismatch | `CrmMetadataService.ts`, `FieldRenderer.tsx` (web), `FormService.ts` (mobile normalizer cleanup) |
| **BUG-03** | `'custom'` not in shared `FieldType` union | `shared/src/types/form.ts` |

### Designer Toolbox Gaps

| ID | Missing Entry | Category | Effort |
|---|---|---|---|
| **T-01** | `boolean` (Yes/No Toggle) | Basic Fields | 0.5d |
| **T-02** | `info-card` (Info Banner) | Basic Fields | 0.5d |
| **T-03** | `interactive-grid` | Advanced | 0.5d |

### Designer Properties Panel Gaps

| ID | Missing Panel | Config Required | Effort |
|---|---|---|---|
| **P-01** | `boolean` — BooleanFieldPanel | renderStyle, trueLabel, falseLabel, default | 1d |
| **P-02** | `info-card` — InfoCardFieldPanel | style, title, body, icon | 1d |
| **P-03** | `interactive-grid` — InteractiveGridFieldPanel | mode, selection/entry config, column builder | 4d |
| **P-04** | `grid` (repeating) — RepeatingGridFieldPanel | maxRows, minRows, entity, column builder | 2d |
| **P-05** | `currency` — dedicated panel | currencyCode, decimalPlaces, symbol position | 0.5d |
| **P-06** | `decimal` — dedicated panel | decimalPlaces | 0.5d |

### Designer Preview Gaps

| ID | Type | Fix | Effort |
|---|---|---|---|
| **PV-01** | `boolean` | Toggle or radio pair | 0.5d |
| **PV-02** | `info-card` | Coloured banner | 0.5d |
| **PV-03** | `interactive-grid` | Table with column headers | 1d |
| **PV-04** | `grid` (repeating) | Editable table skeleton | 0.5d |
| **PV-05** | `multiselect` | `<select multiple>` or checkbox list | 0.5d |

### Designer New Screens

| ID | Screen | Description | Effort |
|---|---|---|---|
| **S-01** | `InfoCardEditorScreen` | Full multi-screen info card builder with sections + items | 2 weeks |
| **S-02** | Buttons config in FormProperties | Add/remove/edit form buttons (label, action, confirmation) | 1 week |
| **S-03** | Grid column builder (shared sub-panel) | Used by both interactive-grid and repeating-grid panels | 1 week |

---

## 6. Recommended Build Order

### Step 1 — Fix bugs first (2 days)
Fix BUG-01, BUG-02, BUG-03. These are silent breaking bugs. They should be fixed before any new features.

### Step 2 — Add missing field types to designer (1 week)
T-01, T-02, T-03 (toolbox entries) + P-01, P-02 (boolean and info-card panels) + PV-01 through PV-05 (preview fixes). These are fast; they follow the exact same pattern as existing panels.

### Step 3 — Build grid column builder (1 week)
`GridColumnConfigService.ts` + the column management sub-panel used by both P-03 and P-04. Build it once, reuse it in both panels.

### Step 4 — Build interactive-grid properties panel (1 week)
P-03. Uses the grid column builder from Step 3. This is the most important designer panel gap because `interactive-grid` is the highest-complexity and highest-value field type.

### Step 5 — Build repeating-grid properties panel (0.5 week)
P-04. Simpler version of Step 4 (entry mode only, no selection mode config).

### Step 6 — Build InfoCard screen designer (2 weeks)
S-01. The biggest missing piece. Requires a new screen, new service, and new navigation entry.

### Step 7 — Build form buttons configuration (1 week)
S-02. High value — most forms need more than a default Submit button.

**Total estimated effort: ~7 weeks for one engineer, ~4 weeks with two engineers in parallel.**
