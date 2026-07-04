# Summary / Review Screen — Framework-Agnostic Implementation Spec

A read-only "review your answers" screen shown **before final submit** when the form's
`showSummaryStep` flag is `true`. This spec lets any frontend (React, Vue, Angular,
mobile) reimplement it against the same JSON contract. The reference implementation is
`frontend/src/components/forms/FormSummary.tsx`.

> **Key point:** the backend (Node, Spring Boot, anything) only **carries the
> `showSummaryStep` boolean** in the form JSON and accepts the normal submit. It does
> **not** render or gate the summary — the summary is 100% a frontend concern, rebuilt
> from data the frontend already holds. The flag is an `if`; this component is the body.

---

## 1. Inputs

The component takes **three inputs**, all already present on the client:

| Input | Shape | Source |
|---|---|---|
| `formDefinition` | `{ tabs: Tab[] }`, each Tab `{ id, label, displayOrder, isVisible, sections: Section[] }`, each Section `{ id, label, displayOrder, isVisible, fields: Field[] }`, each Field `{ id, schemaName, label, displayOrder, fieldType, isVisible, isHidden, isRequired, options?, decimalPlaces?, currencyCode?, gridConfig? }` | The **form JSON** served by the backend |
| `fieldValues` | `Record<schemaName, value>` — the user's entered answers | The frontend's **own form state** (NOT in the JSON) |
| `ruleState` | `{ tabVisibility, sectionVisibility, fieldVisibility, fieldRequired }` — runtime business-rule overrides, each `Record<id, boolean>` | The frontend's rule engine (if implemented; otherwise treat as empty) |

One callback:
- `onEditTab(tabIndex: number)` — navigate back to a tab for editing.

---

## 2. Gating (in the form controller, not this component)

`showSummaryStep` comes from the form JSON (boolean; default `false`). When `true`:
- After the **last tab**, show the summary screen as an extra step **before** the final submit.
- Primary button label progression: intermediate tabs → **"Next"**; last tab → **"Review"** (opens summary); summary screen → **"Submit"**.
- When `false`: submit directly from the last tab (no summary screen).

The final submit payload is **identical** whether or not the summary was shown.

---

## 3. Field selection rules (what appears)

A field is shown **only if all** hold:
1. **Tab visible:** `ruleState.tabVisibility[tab.id] ?? tab.isVisible`
2. **Section visible:** `ruleState.sectionVisibility[section.id] ?? section.isVisible`
3. **Field visible:** `ruleState.fieldVisibility[field.id] ?? field.isVisible`
4. `field.isHidden === false`
5. `field.fieldType !== 'info-card'` (display-only, never has a value)
6. **Has a displayable value** (see `isDisplayable` below)

Ordering: tabs, sections, and fields are each sorted by `displayOrder` ascending.

A **section** with zero displayable fields is omitted. A **tab** with zero displayable
fields across all its sections is omitted.

**`isDisplayable(value)`** → `false` when value is `null`, `undefined`, `''`, or an
empty array; `true` otherwise.

---

## 4. Completion counter

Show a badge: **`{requiredFilled} / {requiredTotal} required fields filled`**.
- `requiredTotal` = count of visible, non-hidden, non-info-card fields where
  `ruleState.fieldRequired[field.id] ?? field.isRequired` is `true`.
- `requiredFilled` = subset of those whose value `isDisplayable`.
- Badge style: success when `requiredFilled === requiredTotal`, otherwise warning.
- Mark `aria-live="polite"`.

---

## 5. Layout

- Group output by **tab → section**. Each tab gets a header (`tab.label`) + an **Edit**
  button → `onEditTab(tabIndex)`. Each section renders as a card with `section.label`.
- **Scalar fields:** two-column row — label (left) / value (right).
- **Full-width fields** (`file`, `richText`/`richtext`): label on its own line, value below.
- **Grid fields** (`grid`, `repeatingGrid`, `interactive-grid`): label on its own line,
  then a mini-table (§7).

---

## 6. Scalar value formatting (by `fieldType`)

| fieldType | Rendered value |
|---|---|
| `checkbox`, `boolean` | `Boolean(value) ? 'Yes' : 'No'` |
| `dropdown`, `radio` | `options.find(o => o.value === String(value))?.label ?? String(value)` (show the **label**, not the raw code) |
| `multiselect` | map each selected value → its option label; join with `', '`; if none → `'None selected'` |
| `lookup` | `value.displayName ?? String(value)` (value is an object `{ displayName }`) |
| `number` | `Intl.NumberFormat` with `decimalPlaces ?? 0` fraction digits; non-numeric → `String(value)` |
| `decimal` | same, `decimalPlaces ?? 2` |
| `currency` | `Intl.NumberFormat({ style:'currency', currency: currencyCode ?? 'USD' })` |
| `date` | locale date, long month (`{ year:'numeric', month:'long', day:'numeric' }`); invalid → raw |
| `datetime` | locale date-time (`{ year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }`); invalid → raw |
| `file` | list of files (§8) |
| `richText` | strip HTML tags (`value.replace(/<[^>]*>/g,' ').trim()`) → plain text |
| *default* | `String(value)` |

---

## 7. Grid mini-table (`grid` / `repeatingGrid` / `interactive-grid`)

Value is an array of row objects. Config from `field.gridConfig`:
- `mode === 'selection'` → call rows "records"; otherwise "rows".
- **No rows** → `"No records"` / `"No rows"`.
- **Columns:** `gridConfig.columnConfigs` sorted by `displayOrder`, capped at **5** (`MAX_GRID_COLS`). Header = `column.columnLabel`. If there are zero columns, just show a count: `"{n} record(s) selected"` / `"{n} row(s) entered"`.
- **Rows:** render at most **5** (`MAX_GRID_ROWS`); if more, append `"…and {N} more rows/records"`.
- **Row value extraction:** if `row.values` is an object use it, else use `row` directly; cell value = `rowValues[column.targetAttribute]`.
- **Cell formatting** (`formatCellValue`): empty (`null`/`undefined`/`''`) → `'—'`;
  `boolean` → Yes/No; `date` → `toLocaleDateString`; `datetime` → `toLocaleString`;
  number → `toLocaleString`; else `String(value)`.

---

## 8. File field rendering

`value` is an array of `{ fileId, fileName, url, previewUrl?, sizeBytes }`:
- Render each as: document icon + a link (`previewUrl ?? url`, open in new tab,
  `rel="noopener noreferrer"`) labelled `fileName` + a size badge.
- **`formatFileSize`:** `≥1 MB` → `"{x.x} MB"`; `≥1 KB` → `"{x} KB"`; else `"{n} B"`.
- If the value isn't a recognizable file-ref array → fall back to `"{n} file(s)"`.

---

## 9. Accessibility
- Container `aria-label="Form summary"`; heading "Review your answers".
- Completion badge container `aria-live="polite"`.
- Each section labelled by its title; Edit buttons `aria-label="Edit {tab.label}"`.

---

## 10. JSON contract dependencies (the only coupling)

This component depends on these form-JSON field names — the backend (Spring Boot, etc.)
must emit them with these exact names:
- Form: `showSummaryStep`
- Tab: `id`, `label`, `displayOrder`, `isVisible`, `sections`
- Section: `id`, `label`, `displayOrder`, `isVisible`, `fields`
- Field: `id`, `schemaName`, `label`, `displayOrder`, `fieldType`, `isVisible`,
  `isHidden`, `isRequired`; plus type-specific: `options[]` (`{value,label}`),
  `decimalPlaces`, `currencyCode`, `gridConfig` (`{ mode, columnConfigs:[{ columnId,
  columnLabel, targetAttribute, columnFieldType, displayOrder }] }`).

Values are keyed by **`schemaName`** in the frontend form state. The JSON contains
**structure only** — never the entered values.

---

## 11. Edge cases / invariants
- Empty fields are never shown (review shows only what was answered).
- Hidden / rule-hidden / info-card fields never appear.
- Option-backed fields show **labels**, never raw stored codes.
- Grids cap at 5×5 with an overflow note — the summary is a preview, not the full grid.
- The summary reads live form state, so edits made after opening it reflect on return.
- Submit from the summary is the same operation as a direct submit — backend-agnostic.
