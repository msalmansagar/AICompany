# Form Designer — Missing Features Report

**Prepared:** 2026-06-11  
**Based on:** Full static code analysis of `designer/src/`  
**Scope:** All screens, components, services, store, CRM integration

---

## Summary

The designer has **13 screens** implemented and a solid foundation. However there are **3 categories of problems**:

| Category | Count | Impact |
|---|---|---|
| **Broken wiring** — built but disconnected | 9 items | Critical — working screens are unreachable |
| **Data not persisted** — saved in memory only | 4 items | Critical — data lost on reload |
| **Not yet built** — missing features | 18 items | High — functional gaps |

---

## Category A — Broken Wiring (Built but Disconnected)

These features are **fully coded** but **unreachable** because no button, menu, or keyboard shortcut points to them. They will never run until wired up.

### A-1 · Three Hidden Screens (No Navigation Entry Point)

| Screen | What it does | Where it should be accessible |
|---|---|---|
| `RuleTemplateEditorScreen` | Manage reusable validation rule templates in Dataverse | Command bar button "Templates" OR from ValidationRulesPanel |
| `FieldLabelEditorScreen` | Add/edit per-field locale translations per language | Properties panel → "Translations" button per field |
| `AccessPolicyEditorScreen` | Configure Azure AD role-based access per form | FormProperties → "Access Policies" button |

**Fix:** Add three buttons to the command bar (or properties panel where noted). One line each in `DesignerCommandBar.tsx`.

---

### A-2 · Keyboard Shortcuts Not Wired

Undo/Redo tooltips display `Ctrl+Z` / `Ctrl+Y` but no `keydown` event listener exists anywhere in the app.

**Fix:** Add a `useEffect` in `DesignerScreen.tsx`:
```typescript
useEffect(() => {
  function onKey(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
  }
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}, [undo, redo]);
```

---

### A-3 · Section Drag-to-Reorder Not Firing

Sections have `useSortable` applied and show visual drag feedback (opacity, cursor), but `handleDragEnd` in `DesignerScreen.tsx` never calls `reorderSections`. The action exists in the store; it just isn't called.

**Fix:** In `handleDragEnd`, after the existing field-move logic, add a branch that detects when `active.data.current.type === 'section'` and calls `reorderSections(tabId, oldIndex, newIndex)`.

---

### A-4 · Section/Field/Button Design Service Is Dead Code

`DesignService` has fully implemented `upsertSectionDesign`, `upsertFieldDesign`, and `upsertButtonDesign` methods targeting `qdb_section_design`, `qdb_field_design`, and `qdb_button_design` Dataverse entities. These methods are **never called** from any screen or save flow. The entities are modeled; the writes never happen.

**Fix:** Call these from `FormSaveService.save` after field creation, using per-section and per-field style state from the store.

---

### A-5 · `previewMode` Store Field Unused

`designerStore` has a `previewMode: 'desktop' | 'tablet' | 'mobile'` field with a `setPreviewMode` action. `PreviewScreen` uses its own local `useState` and never reads from the store. Switching breakpoints in preview does not update the store, and nothing can react to the preview mode externally.

**Fix:** Either remove the store field (if preview is purely local state) or wire `PreviewScreen` to read/write `previewMode` from the store so Command Bar can reflect the current preview breakpoint.

---

### A-6 · Rule Template Not Selectable From Validation Rules Panel

`DesignerValidationRule` has a `ruleTemplateId?: string` field. `ValidationRulesPanel` never shows a "Select from Template" option. The `RuleTemplateEditorScreen` (hidden — see A-1) manages the templates but they can never be applied to a field.

**Fix:** Add a "From Template" button in `ValidationRulesPanel` that opens a template picker dialog (list of `qdb_rule_template` records) and populates the rule from the selected template.

---

## Category B — Data Not Persisted (Lost on Reload)

These values exist in the in-memory Zustand store but are never written to Dataverse, so they disappear every time the form is reloaded.

### B-1 · `entityLogicalName` Not Saved to CRM

The form's target CRM entity is entered in the designer but **never persisted**. `PV-011` publish gate validates it, meaning a form can only be published once per session — reload the page and `entityLogicalName` is blank again.

**Root cause:** The `qdb_entity_logical_name` column is commented out in `FormDefinitionService` with the note "not deployed on qdb_form_definition".

**Fix:** Add column `qdb_entity_logical_name` to the Dataverse `qdb_form_definition` entity, then uncomment the mapping in `FormDefinitionService.createForm` and `updateForm`.

---

### B-2 · Theme `fieldSpacing`, `labelPosition`, `buttonStyle`, `customCss` Not Saved

`DesignService.upsertTheme` only writes 7 of the 11 theme properties. These 4 are silently dropped:

| Property | Where used |
|---|---|
| `fieldSpacing` | Preview CSS, runtime renderer spacing |
| `labelPosition` | Preview and runtime (label above vs. beside) |
| `buttonStyle` | Preview Submit button, runtime button styling |
| `customCss` | Injected at runtime after PostCSS sanitisation |

**Fix:** Add the 4 missing columns to the `qdb_theme` Dataverse entity (`qdb_field_spacing`, `qdb_label_position`, `qdb_button_style`, `qdb_custom_css`) and update `DesignService.upsertTheme` to write them.

---

### B-3 · Sprint 3/4 Screens Bypass `CrmContextService`

`RuleTemplateEditorScreen`, `FieldLabelEditorScreen`, and `AccessPolicyEditorScreen` call `window.Xrm?.WebApi` directly instead of using `CrmService` from `CrmContext`. This means:
- They **silently fail** when `VITE_USE_REST_API=true` (standalone / dev mode) — no error is thrown, no data is loaded
- They bypass the retry wrapper and error handling in `CrmContextService`

**Fix:** Replace all `window.Xrm?.WebApi` calls in these three screens with `useCrmContext()` hook calls, exactly as all other screens do.

---

### B-4 · Lookup `searchMinChars` and `maxResults` Not Configurable

`LookupConfigScreen` only exposes 4 of 6 lookup config fields. `searchMinChars` (hardcoded: 3) and `maxResults` (hardcoded: 10) are never presented to the designer. These two values are part of `qdb_form_lookup_config` in Dataverse but `LookupConfigService.upsertLookupConfig` never writes them.

**Fix:** Add two number inputs to `LookupConfigScreen`, write the values in `LookupConfigService.upsertLookupConfig`.

---

## Category C — Not Yet Built

These features are not present anywhere in the codebase.

### C-1 · No Per-Section or Per-Field Design Panel (UI Missing)

The Dataverse schema and service layer exist for `qdb_section_design` and `qdb_field_design` but there is no UI to configure them. The `SectionProperties` panel has no color pickers, padding sliders, or card-style selectors. The `FieldProperties` panel has no width, icon prefix/suffix, or input style controls.

**What's missing:**
- **Section design panel:** background color, border color, padding (S/M/L), margin, card shadow, collapse animation style
- **Field design panel:** field width (Full/Half/Custom %), input style (Outlined/Filled/Standard), icon prefix (Fluent icon name), icon suffix (Fluent icon name), tooltip style, label style (font weight, size override)

---

### C-2 · No WYSIWYG Visual Rule Builder

The current `RuleConfigScreen` is a structured form (dropdowns + text inputs). Non-technical designers must understand field codes, operator names, and action types. There is no plain-language display ("When **Nationality** equals **Non-Qatari** then **Show** field **Passport Number**").

**What's missing:**
- Plain-English condition summary cards
- Drag-to-reorder conditions and actions
- Visual flow preview (IF → THEN diagram)
- Rule test/simulate mode (enter test values, see which rules fire)
- Conflict detection (two rules set opposing actions on the same field)

---

### C-3 · No Form Templates Library

Every form starts from a blank canvas. There is no way to start from a pre-built template.

**What's missing:**
- Template gallery screen with category filter
- Template preview before applying
- "Create from template" → deep clone into new draft
- Seed templates (suggested: Contact Us, Service Request, Complaint, Employee Onboarding, Satisfaction Survey, Incident Report, Leave Request, Visitor Log, Job Application, Patient Registration)

---

### C-4 · No Form JSON Import / Export

No way to backup a form, migrate between sandbox and production, or share a form definition as a file.

**What's missing:**
- Export: serialize entire form hierarchy → downloadable `.json` file
- Import: upload `.json` file → create all entities in Dataverse with new GUIDs → open in designer
- Designer command bar: "Export" and "Import" buttons

---

### C-5 · Version History Shows No Content

`VersionHistoryScreen` shows metadata per version (number, date, publisher) but the "View" dialog only shows those same metadata fields. The snapshot content (what the form looked like) is never rendered.

**What's missing:**
- Snapshot detail dialog renders a read-only canvas view of that version's structure (tabs, sections, fields)
- Side-by-side diff: current version vs. selected historical version (fields added/removed/changed highlighted)

---

### C-6 · No Advanced Field Type Panels

When a user drops a `repeating_grid`, `child_entity_grid`, `document_upload`, `terms_block`, `declaration_block`, or `summary_block` field onto the canvas, the Properties panel shows only the generic common fields (label, code, placeholder, etc.). There are no type-specific config panels for:

| Field Type | Missing Config |
|---|---|
| `repeating_grid` | Entity name, column definitions (label/type per column), add-row label, min/max rows |
| `child_entity_grid` | Relationship name, parent field key, column definitions, filters |
| `document_upload` | Allowed MIME types, max file size, max files, destination (CRM Notes / SharePoint) |
| `terms_block` | Terms text (rich text editor), "I agree" checkbox label, require acceptance |
| `declaration_block` | Declaration text, signatory label, date/time capture toggle |
| `summary_block` | Which fields to include, grouping, show/hide empty fields |

---

### C-7 · No Spacer / Divider / Info Text / Header Text Preview

These layout types are draggable from the toolbox and create field records in the store, but:
- The canvas `FieldSlot` renders them as plain text input boxes with their label
- The `PreviewScreen` renders them as `<input type="text">` elements
- No visual distinction from regular data fields

**What's missing:**
- Canvas: render spacer as a blank box with height control, divider as an `<hr>`, info text as a styled banner, header text as a large bold label
- Preview: same visual treatment
- Properties: height (spacer), divider style (solid/dashed/dotted), info text content + style (info/warning/tip), header text level (H2/H3)

---

### C-8 · No Multi-Column Section Assignment Per Field

Fields in a 2- or 3-column section always fill in top-to-bottom order. There is no way to:
- Specify which column a field appears in
- Make a field span all columns (colspan)
- Leave a column intentionally empty (column break)

The `FieldDefinition` has `columnSpan` in the store but it is only settable as 1/2/3 (full/half/third proportion), not as a positioned column assignment.

---

### C-9 · No Conditional Tab / Section Visibility from Designer

Business rules can `showTab` and `hideTab` as actions, but the designer has no per-tab "Visibility Condition" shortcut. The user must go to the full `RuleConfigScreen`, create a rule, select the action, and identify the tab by code. There is no inline shortcut.

**What's missing:**
- Tab Properties: "Visible condition" expression or rule quick-link
- Section Properties: "Visible condition" expression or rule quick-link

---

### C-10 · No Dependent Dropdown Configuration

When configuring a `dropdown`, `multi_select`, or `radio` field, there is no option to mark it as dependent on another field's value (parent-child option filtering). The `parentOptionValue` property exists on options in the shared types but there is no UI to configure it.

**What's missing:**
- In DropdownFieldPanel: "Depends on field" selector (pick a sibling field)
- Option Set Editor: per-option "Show when parent value = X" selector

---

### C-11 · No Grid Column Configuration UI

When creating an `interactive-grid` or `repeating_grid` field, there is no way to define columns in the designer. The grid `columnConfigs` array is populated only from `qdb_grid_column_configs` in Dataverse (which must be created manually outside the designer).

**What's missing:**
- Grid column management panel (add/remove/reorder columns)
- Per-column: label, targetAttribute (CRM column name), columnFieldType (text/number/dropdown/date/boolean), display order
- "Test Data" button: load sample records from the configured entity to preview how the grid looks

---

### C-12 · No AI Form Generation

No "Generate with AI" feature. Every form is built manually.

**What's missing:**
- Command bar button: "Generate with AI"
- Modal: text prompt input ("Describe the form you need...")
- Calls Claude API → returns structured `FormDefinition` JSON
- Preview generated structure before accepting
- Regenerate specific sections

---

### C-13 · No AI Rule Suggestion

No "Suggest Rules" feature. Rules must be identified and authored manually.

**What's missing:**
- In `RuleConfigScreen` or field properties: "Suggest Rules" button
- Calls Claude API with field schema context
- Returns suggested rules in plain English with one-click "Add" per suggestion

---

### C-14 · No Form Search in Canvas

When a form has 5+ tabs and 50+ fields, there is no way to search for a specific field or jump to it. The user must manually scan each tab.

**What's missing:**
- Command bar search box: type field label or code → highlights matching field(s) on canvas, scrolls to first match
- Keyboard shortcut: `Ctrl+F` opens field search

---

### C-15 · No Bulk Field Operations

No multi-select on canvas. Cannot:
- Select multiple fields and delete them at once
- Select multiple fields and change their required/readonly state together
- Move multiple fields to a different section

---

### C-16 · No Copy / Paste / Duplicate Field

Right-click on a field or a "Duplicate" button to clone a field within the same form — useful for building similar fields (e.g., Primary Contact / Secondary Contact).

**What's missing:**
- Per-field context menu (right-click or "…" menu): Duplicate, Copy, Cut
- Paste inserts at the bottom of the currently active section
- Keyboard: `Ctrl+D` to duplicate selected field

---

### C-17 · No Info-Card Screen Designer

The form runtime supports a full multi-screen info-card flow before the form starts (`InfoCardScreen[]` with sections of type `numbered-steps`, `icon-list`, `download-list`). The designer has **no UI to create or edit these screens**.

Currently, info-card screens can only be created and managed via the `CrmInfoCardAdminService` API endpoint directly or by manually creating `qdb_info_card_screen` records in Dataverse.

**What's missing:**
- "Info Cards" tab or screen in the designer
- Add/reorder screens
- Per-screen: heading, subheading, icon URL
- Per-screen: add sections (numbered-steps / icon-list / download-list)
- Per-section: add items (title, description, icon, download URL)
- Preview of the info-card flow before publishing

---

### C-18 · No Button Configuration UI

The form runtime supports multiple buttons per form with configurable actions, labels, and confirmation dialogs (`FormButton[]` with `action: submit | saveDraft | cancel | reset`). The designer has **no UI to manage form buttons**.

Currently, buttons must be created directly in Dataverse or via `qdb_form_button` records.

**What's missing:**
- "Buttons" section in FormProperties panel
- Add/remove/reorder buttons
- Per-button: label, action type, primary/secondary, visible toggle
- Per-button: enable confirmation dialog + confirmation message text

---

## Prioritised Fix List

### Immediate (1–2 days each) — no new features, just wire existing code

| # | Fix | File(s) | Days |
|---|---|---|---|
| **FIX-01** | Wire Ctrl+Z / Ctrl+Y keyboard shortcuts | `DesignerScreen.tsx` | 0.5 |
| **FIX-02** | Fix section drag-to-reorder (call `reorderSections` in `handleDragEnd`) | `DesignerScreen.tsx` | 0.5 |
| **FIX-03** | Add command bar buttons for 3 hidden screens (Templates, Translations, Access Policies) | `DesignerCommandBar.tsx` | 0.5 |
| **FIX-04** | Fix Sprint 3/4 screens to use `CrmContextService` instead of `window.Xrm` | `RuleTemplateEditorScreen`, `FieldLabelEditorScreen`, `AccessPolicyEditorScreen` | 1 |
| **FIX-05** | Add `searchMinChars` + `maxResults` inputs to `LookupConfigScreen` | `LookupConfigScreen.tsx`, `LookupConfigService.ts` | 0.5 |

### Short-Term (1 week) — persist missing data

| # | Fix | Files | Days |
|---|---|---|---|
| **FIX-06** | Add `qdb_entity_logical_name` column to Dataverse, persist in `FormDefinitionService` | `FormDefinitionService.ts`, Dataverse schema | 1 |
| **FIX-07** | Save missing theme properties (`fieldSpacing`, `labelPosition`, `buttonStyle`, `customCss`) to CRM | `DesignService.ts`, Dataverse schema (`qdb_theme`) | 1 |
| **FIX-08** | Wire section/field/button design saves from `FormSaveService` | `FormSaveService.ts`, `DesignService.ts` | 2 |
| **FIX-09** | Wire `RuleTemplate` selection in `ValidationRulesPanel` | `ValidationRulesPanel.tsx` | 1 |

### Medium-Term (2–4 weeks each) — new feature builds

| # | Feature | Effort |
|---|---|---|
| **FEAT-01** | Per-section and per-field design panels in Properties panel | 2 weeks |
| **FEAT-02** | Advanced field type panels (repeating_grid, document_upload, terms_block etc.) | 2 weeks |
| **FEAT-03** | Spacer / Divider / Info Text / Header Text visual rendering in canvas + preview | 1 week |
| **FEAT-04** | Info-card screen designer (new screen + section builder) | 2 weeks |
| **FEAT-05** | Button configuration UI in FormProperties | 1 week |
| **FEAT-06** | Grid column configuration panel | 1 week |
| **FEAT-07** | Dependent dropdown configuration in OptionSetEditor | 1 week |
| **FEAT-08** | Form JSON import / export | 1 week |
| **FEAT-09** | Version history snapshot viewer + diff | 1 week |
| **FEAT-10** | Field copy / duplicate / paste | 0.5 week |
| **FEAT-11** | Field search in canvas (Ctrl+F) | 0.5 week |
| **FEAT-12** | Form templates library | 2 weeks |
| **FEAT-13** | WYSIWYG visual rule builder | 3 weeks |
| **FEAT-14** | AI form generation | 3 weeks |
| **FEAT-15** | AI rule suggestions | 2 weeks |

---

## Summary Table

```
BROKEN WIRING (fix existing code)
  A-1  Three hidden screens (no nav entry)          → 0.5 days
  A-2  Keyboard shortcuts not wired                 → 0.5 days
  A-3  Section drag-to-reorder broken               → 0.5 days
  A-4  Section/field/button design dead code        → 2 days
  A-5  previewMode store field unused               → 0.5 days
  A-6  Rule template not selectable from panel      → 1 day

DATA NOT PERSISTED (schema + service fixes)
  B-1  entityLogicalName lost on reload             → 1 day
  B-2  4 theme properties not saved                 → 1 day
  B-3  Sprint 3/4 screens bypass CrmContextService  → 1 day
  B-4  Lookup searchMinChars/maxResults missing      → 0.5 days

NOT YET BUILT (new development)
  C-1  No per-section/field design panel            → 2 weeks
  C-2  No WYSIWYG rule builder                      → 3 weeks
  C-3  No form templates library                    → 2 weeks
  C-4  No JSON import / export                      → 1 week
  C-5  Version history shows no content             → 1 week
  C-6  No advanced field type panels                → 2 weeks
  C-7  Spacer/Divider not rendered visually         → 1 week
  C-8  No column span / position control            → 1 week
  C-9  No conditional tab/section shortcut          → 0.5 weeks
  C-10 No dependent dropdown config                 → 1 week
  C-11 No grid column configuration UI             → 1 week
  C-12 No AI form generation                        → 3 weeks
  C-13 No AI rule suggestion                        → 2 weeks
  C-14 No field search in canvas                    → 0.5 weeks
  C-15 No bulk field operations                     → 1 week
  C-16 No copy/paste/duplicate field                → 0.5 weeks
  C-17 No info-card screen designer                 → 2 weeks
  C-18 No button configuration UI                   → 1 week
```

**Total broken wiring fixes:** ~6 days  
**Total data persistence fixes:** ~3.5 days  
**Total new features:** ~30 weeks  
**Recommended start:** FIX-01 through FIX-09 first (all < 2 days each, no new features)
