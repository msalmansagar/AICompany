# Developer Guide — Form Builder Enhancements (DFE-FBE-001 + FBE-002)

_How the six form-builder features work end to end: Dataverse schema → shared types → C#/Node generators → SecurityStripper → render cache → runtimes (web portal · in-CRM engine · mobile) → designer._

Features covered:
1. Summary mode (system-generated / manual)
2. Tab descriptions (+ summary tab flag)
3. Section icons
4. Label field (static + data-bound)
5. Tab-bar progress bar
6. Multi-select lookup

---

## 0. The pipeline (applies to every feature)

```
Dataverse attribute  ──▶  C# plugin (on publish)                 ──▶  render cache (qdb_form_render_cache)  ──▶  in-CRM engine (qdb_form_runtime.html)
     (or)                   FormJsonGenerator + PicklistMapper +        (gzip JSON)                                  mobile app
                            CrmMetadataReader + FieldBuilder
                     ──▶  Node backend (live path)                ──▶  web portal (localhost:3000 / Power Pages)
                            CrmMetadataService
                     ──▶  SecurityStripper (strips hidden fields; MUST carry every new field)
     Shared types: shared/src/types/form.types.ts (web+backend) AND form.ts (mobile) — keep BOTH in sync.
     Designer authoring: designer/src/... writes the Dataverse attributes.
```

**Golden rules when adding/editing a form-level field**
- Add it to **both** shared barrels (`form.types.ts` + `form.ts`).
- Add it to the **C# model** (`FormDefinitionModel.cs`) with `NullValueHandling.Ignore` and the **generator** (`FormJsonGenerator`/`FieldBuilder`), the **Node mapper** (`CrmMetadataService`), and **`SecurityStripper`** — the stripper *reconstructs* form/tab/section objects field-by-field, so any field it doesn't explicitly copy is silently dropped from the in-CRM cache.
- Emit the field **only when set** (omit when null/false) so existing forms stay byte-identical.

Option-set codes are 1-based from `100000001`.

---

## 1. Summary mode

Controls the review/summary step: none, an auto-generated summary, or a manual summary tab the author builds.

| Layer | Detail |
|---|---|
| Attribute | `qdb_form_definition.qdb_summary_mode` (Picklist) |
| Values | `100000001` None · `100000002` SystemGenerated · `100000003` Manual |
| Legacy | `qdb_show_summary_step` (bool) kept read-only for back-compat |
| JSON | `summaryMode` — **omitted when unset** |
| Runtime derive | `effectiveSummaryMode = summaryMode ?? (showSummaryStep ? 'SystemGenerated' : 'None')` |

**Designer:** Command bar → **Form** button → Form Properties → *Summary Mode* dropdown. Selecting a mode migrates a legacy `showSummaryStep` form (a warning MessageBar appears while `summaryMode` is null and `showSummaryStep` is true).

**Runtime (web):** `DynamicFormRenderer` computes `effectiveSummaryMode`; `showSummaryStep = effectiveSummaryMode === 'SystemGenerated'`. Manual mode renders the tab flagged `isSummaryTab` (see §2) built from Label fields (§4).

**Code:** `PicklistMapper.ToSummaryMode` (C#) / `mapSummaryMode` (Node) return `null`/`undefined` when unset. Verified value for your form: `100000002` (SystemGenerated).

---

## 2. Tab descriptions (+ summary tab flag)

| Layer | Detail |
|---|---|
| Attributes | `qdb_form_tab.qdb_description` (string) · `qdb_form_tab.qdb_is_summary_tab` (bool) |
| JSON | `tab.description` (omitted when empty) · `tab.isSummaryTab` (emitted only when `true`) |

**Designer:** select a tab → Tab Properties → *Description* field + *Use as manual summary tab* checkbox.

**Runtime:** `TabRenderer` shows `{tab.description && <div className={styles.tabDescription}>…}`. `isSummaryTab` marks which tab hosts the manual summary.

**C# gotcha:** `TabDefinition.IsSummaryTab` is `bool?` and set as `... ? (bool?)true : null`. **`SecurityStripper.StripTabs` must copy `Description` and `IsSummaryTab`** or they vanish from the cache.

---

## 3. Section icons

| Layer | Detail |
|---|---|
| Attribute | `qdb_form_section.qdb_icon_name` (string — a Fluent icon name, e.g. `Person`, `Phone`, `Settings`) |
| JSON | `section.iconName` (omitted when empty) |

**Designer:** select a section → Section Properties → *Icon* (icon name).

**Runtime:** web `SectionRenderer` renders `{section.iconName && <DynamicIcon iconName={section.iconName} size={20} />}`; mobile uses `InfoCardIcon`. The value is a Fluent icon name string — the runtime resolves it via a dynamic-icon lookup.

**Gotcha:** `SecurityStripper.StripSections` must copy `IconName`.

---

## 4. Label field (static + data-bound)

A read-only display field. Two modes: static text, or a **data-bound** mirror of another field's value (used to build manual summaries).

| Layer | Detail |
|---|---|
| Field type | `qdb_field_type = 100000022` → `"label"` |
| Attributes | `qdb_form_field.qdb_static_content` (Memo) — static text · `qdb_form_field.qdb_source_field_schema_name` (string) — schema name of the field to mirror |
| JSON | `field.fieldType = "label"`, `field.staticContent`, `field.sourceFieldSchemaName` |

**Designer:** add a **Label** field → `LabelFieldPanel`: *Display mode* = **Static text** or **Mirror a field value**. Bound mode shows a **Source field** dropdown of the form's other fields.

**Runtime (web):** `FieldRenderer` routes `fieldType === 'label'` to `LabelField` (rendered without the input/validation wrapper). If `sourceFieldSchemaName` is set, it looks up the source field definition (`findFieldBySchema`) + value (`fieldValues[schema]`) and formats it read-only via `formatReadOnlyValue` — which handles dropdown→option label, multiselect→joined, checkbox→true/false label, **lookup→displayName**, **multiLookup→joined names**, file→"N file(s)", grid→"N row(s)". Mobile: `FormLabelField` (bound via `useWatch`).

**Files:** `frontend/src/components/forms/fields/LabelField.tsx`, `readOnlyFieldValue.ts`; `mobile/.../FormLabelField.tsx`; designer `properties/panels/LabelFieldPanel.tsx`.

---

## 5. Tab-bar progress bar

A completion-percentage bar above the tab strip.

| Layer | Detail |
|---|---|
| Attribute | `qdb_form_definition.qdb_show_progress_bar` (Boolean, default false) |
| JSON | `showProgressBar` — emitted only when `true` |
| Metric | **% of required, currently-visible fields that have a value** |

**Designer:** Form button → Form Properties → *Show completion progress bar* checkbox (default off, so existing forms are unchanged).

**Runtime (web):** `FormProgressBar` (rendered inside `formHeader`, above every nav layout, gated on `formDefinition.showProgressBar`) calls `computeFormCompletion(formDefinition, fieldValues, ruleState)`:
- iterates visible tabs → visible sections → **required + visible** fields (respecting rule overrides `ruleState.fieldVisibility` / `fieldRequired`);
- `filled` = value is not null/undefined/''/false and (for arrays) non-empty;
- `percent = total === 0 ? 100 : round(filled/total*100)`.

Mobile mirror: `MobileProgressBar` + `computeMobileCompletion` (uses `ruleState.visibilityMap`/`requiredMap` keyed by `fieldKey`).

**Files:** `frontend/src/components/forms/FormProgressBar.tsx`, `formCompletion.ts`; `mobile/.../MobileProgressBar.tsx`, `formCompletion.ts`. Tests: `formCompletion.test.ts` (web + mobile).

---

## 6. Multi-select lookup

Select **multiple** related records (single `lookup` reuses the same config for one).

| Layer | Detail |
|---|---|
| Field type | `qdb_field_type = 100000023` → `"multiLookup"` |
| Config | reuses `qdb_form_lookup_config` (entity, display/value attribute, filter, dependent filter, min-chars, max-results) |
| Value shape | `Array<{ id, displayName }>` |
| Submit persistence | serialized to a **semicolon-delimited list of GUIDs** into the mapped attribute (`CrmSubmissionService.normalizeFieldValue`) |

**Designer:** add a **Multi-select Lookup** field (toolbox → Basic) → configure via the shared **Lookup** panel (`FieldProperties` routes both `lookup` and `multiLookup` to `LookupFieldPanel`).

**Runtime:** web `MultiLookupControl` (chips + search dropdown, toggles membership; reuses `useLookupSearch`); mobile `FormMultiLookupField` (modal search + chips, with a `searchError` state). Read-only display (in a bound Label / summary) → joined display names.

**Submission (backend):** `normalizeFieldValue`:
- file refs (`{fileId}`) → array of fileIds;
- **lookup ref array (`{id,…}`) → `ids.map(UUID_SCHEMA.parse).join(';')`** (each id is UUID-validated — fail-fast at the boundary);
- empty selection → dropped in `buildPayload` (never writes a raw `[]`).

**Lookup search gotcha (fixed):** `CrmLookupService` no longer hardcodes `statecode eq 0` — it's **entity-aware** (`systemuser` → `isdisabled eq false`, `team` → none, else `statecode eq 0`), because `systemuser` has no `statecode` (Dataverse `0x80060888`).

**Files:** `frontend/.../controls/MultiLookupControl.tsx`; `mobile/.../fields/FormMultiLookupField.tsx`; `backend/.../CrmSubmissionService.ts`, `CrmLookupService.ts`. Tests: `CrmSubmissionService.test.ts` (serialize / empty / non-UUID reject), `CrmLookupService.test.ts` (statecode/isdisabled).

---

## 7. Provisioning & deploy

**Schema (run once per env, additive + idempotent):**
```
node --env-file=scripts/.env scripts/provision-fbe-schema.mjs    # FBE-001: icon, description, is_summary_tab, label(100000022), static_content, source_field, summary_mode
node --env-file=scripts/.env scripts/provision-fbe2-schema.mjs    # FBE-002: show_progress_bar, multiLookup(100000023)
```

**Deploy (all via service principal — pac token may be expired):**
1. **C# plugin** (render-cache generator): build Release (net4.7.1 target), `merge-plugin.ps1`, PATCH `pluginassemblies.content`.
2. **In-CRM web resource** `qdb_form_runtime.html`: `vite build --config vite.webresource.config.ts` → upload.
3. **Designer**: `node --env-file=../scripts/.env scripts/deploy-cloud.js` (SP-auth fallback; runs `PublishAllXml` — the cache-bust). Dev overrides live in `.env.development.local` (never `.env.local`, which leaks into prod builds → REST mode in CRM).
4. **Republish forms**: call `qdb_PublishForm` per form. **Publish twice** after a plugin content PATCH (first run may hit the old AppDomain).

**Verify a form's cache:** `qdb_GetPublishedFormJson({FormCode, LanguageCode:'en', Version:0})` → inspect `showProgressBar`, `summaryMode`, `tabs[].description`/`isSummaryTab`, `sections[].iconName`, field `fieldType === 'multiLookup'`.

---

## 8. Quick reference — option-set values

| Concept | Attribute | Value |
|---|---|---|
| Summary mode | `qdb_summary_mode` | None 100000001 · SystemGenerated 100000002 · Manual 100000003 |
| Field type: Label | `qdb_field_type` | 100000022 |
| Field type: Multi-lookup | `qdb_field_type` | 100000023 |
| Progress bar | `qdb_show_progress_bar` | Boolean |
| Tab description | `qdb_description` (tab) | string |
| Summary tab | `qdb_is_summary_tab` (tab) | Boolean |
| Section icon | `qdb_icon_name` (section) | Fluent icon name |
| Label static | `qdb_static_content` (field) | Memo |
| Label bound source | `qdb_source_field_schema_name` (field) | schema name |

_See also `DFE-market-analysis.md` and `DFE-gap-analysis.md`._
