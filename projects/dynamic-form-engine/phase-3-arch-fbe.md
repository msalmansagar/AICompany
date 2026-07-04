# Phase 3 — Solution Architecture

## Engagement: DFE-FBE-001 — Form Builder Enhancements (Summary Modes, Label Field, Section Icons & Tab Descriptions)

**Status:** Architecture (Phase 3). BRD approved with conditions (`brd-fbe-approval.md`).
**Date:** 2026-07-01. **Author:** Architecture (authored in-session after the architect subagent stalled during OQ-004 research).
**Inputs:** `brd-fbe.md` (70 FRs), `brd-fbe-approval.md` (CEO conditions C-001..C-009, OQ rulings OQ-001..006).

---

## 1. System Overview

Four additive form-builder features flow through the five DFE surfaces: **Dataverse schema**, **Designer** (React/Vite/Fluent UI v9/Zustand), **shared `@qdb/shared`** dual barrels (`form.types.ts` web/backend, `form.ts` mobile), the **generation tier** (Node live-metadata path + C# on-prem publish plugin → render cache), and the **runtimes** (web portal, in-CRM engine `qdb_form_runtime.html`, React Native mobile).

No new entities. All schema is additive/nullable so existing forms are byte-identical in the render cache (NFR-001) and continue to publish unchanged. Two of the four features (data-bound Label, Manual summary) depend on a read-only rendering capability whose feasibility is gated by the **C-001 spike** (§10).

The central architectural idea (per the CEO-endorsed direction): **the Label field is the single read-only display primitive**, and the **Manual summary is just a tab flagged `qdb_is_summary_tab` composed of Label fields**. This unifies Features 3 and 4 and means every field type is covered "for free" by one read-only renderer, rather than per-type summary code.

---

## 2. Component Map

### 2a. New Components
| Component | Surface | Purpose |
|---|---|---|
| `ReadOnlyFieldValue` | web (`frontend/src/components/forms/`) | Renders a field's value read-only, type-aware, from `(fieldDef, value)` — no react-hook-form `control`. The delegation target for data-bound Labels and forced-read-only summary fields. **Feasibility gated by C-001.** |
| `ReadOnlyFieldValue` | mobile (`mobile/src/components/fields/`) | Mobile equivalent, same contract. **C-001.** |
| `LabelField` | web + mobile | Renders a `label`-type field: static (`qdb_static_content`) or bound (delegates to `ReadOnlyFieldValue` for the source field). |
| `GET /api/files/:annotationId` | Node backend (`files.routes.ts`) | Streams a CRM-annotation document body inline for the "view uploaded document" link (OQ-004). Auth + access-policy checked. |
| Section-icon picker | Designer (Section properties) | Reuses the existing tab-icon picker component (C-004). |
| Source-field picker | Designer (Field properties, when type=label & bound) | Dropdown of the form's field schema names for `qdb_source_field_schema_name`. |
| `SummaryModeSelector` | Designer (Form settings) | Option-set editor for `qdb_summary_mode`; legacy-form alert (OQ-005). |

### 2b. Modified Components
| Component | Change |
|---|---|
| `@qdb/shared` `form.types.ts` + `form.ts` | +`label` FieldType; +`iconName` on Section; +`description`, +`isSummaryTab` on Tab; +`sourceFieldSchemaName`, +`staticContent` on Field; +`summaryMode` on FormDefinition. Dual files kept in sync (existing `check-shared-type-sync` CI). |
| C# `FormDefinitionModel.cs` | +`SummaryMode`; Section `+IconName`; Tab `+Description`, `+IsSummaryTab`; Field `+SourceFieldSchemaName`, `+StaticContent`. All `NullValueHandling.Ignore` (byte-identity). |
| C# `CrmMetadataReader.cs` | Select the new columns. |
| C# `FormJsonGenerator.cs` | `PicklistMapper.ToFieldType(100000022)→"label"`; `ToSummaryMode(...)`; emit new fields; back-compat: derive `summaryMode` from legacy `qdb_show_summary_step` when `qdb_summary_mode` is null. |
| Node `CrmMetadataService.ts` | Same mapping on the live path. |
| Web `FieldRenderer.tsx` / mobile `FieldRenderer` | Route `label` type → `LabelField`; in a summary tab, route all fields through the read-only path. |
| Web `SectionRenderer` / mobile `SectionContent` | Render section icon in header. |
| Web `TabRenderer` / mobile FormRenderer | Render tab description above sections; select summary path (auto vs manual) by `summaryMode`. |
| `FormSummary` (web) / `FormSummaryScreen` (mobile) | Used only for `SystemGenerated`; Manual mode renders the summary tab instead. |
| Designer stores/services | Persist the new attributes; publish-time validation for stale `sourceFieldSchemaName` (OQ-006). |

---

## 3. Shared-Type Contract

```ts
// FieldType union — add:
| 'label'

// SectionDefinition (both barrels)
iconName?: string;               // FR: section icon

// TabDefinition (both barrels)
description?: string;            // FR: tab description
isSummaryTab?: boolean;         // Manual summary designation

// FieldDefinition (both barrels)
sourceFieldSchemaName?: string; // data-bound Label → source field schema name
staticContent?: string;         // static Label content (new; NOT defaultValue — OQ-002)

// FormDefinition (both barrels)
summaryMode?: 'None' | 'SystemGenerated' | 'Manual';   // replaces showSummaryStep
// showSummaryStep retained (optional) read-only for back-compat
```

Mobile barrel (`form.ts`) uses its own field names (`sectionId`/`tabId`/`fieldKey`); the additions use the same camelCase and are added to both files, enforced by `check-shared-type-sync`.

---

## 4. Dataverse Schema Design (additive, nullable)

| Entity | New attribute | Type | Notes |
|---|---|---|---|
| `qdb_form_section` | `qdb_icon_name` | Text (100) | Same format as `qdb_form_tab.qdb_icon_name` (C-004). |
| `qdb_form_tab` | `qdb_description` | Multiline text | Mirrors `qdb_form_section.qdb_description`. |
| `qdb_form_tab` | `qdb_is_summary_tab` | Two-Options | Default No. |
| `qdb_form_field` | `qdb_source_field_schema_name` | Text (100) | Bound-Label source; nullable. |
| `qdb_form_field` | `qdb_static_content` | Multiline text | Static-Label content (OQ-002 — new attr, not `qdb_default_value`). |
| `qdb_form_definition` | `qdb_summary_mode` | Option-set | 100000001=None, 100000002=SystemGenerated, 100000003=Manual. |
| `qdb_field_type` (global option-set) | `label` | Option value | **100000022** (next after 100000021 interactive-grid). |

`qdb_show_summary_step` (boolean) is **retained, read-only** — never written by the designer again; read for back-compat when `qdb_summary_mode` is null (§ADR-FBE-003).

Provisioning via a new `scripts/provision-fbe-schema.mjs` (Web API), cloud + on-prem (solution export/import — remember scoped-button gotcha: script-created attrs must be added to the solution to travel on-prem).

---

## 5. Data-Flow Design

### 5a. Static Label
Designer sets type=`label` + `qdb_static_content`. Generator emits `{fieldType:'label', staticContent}`. Runtime `LabelField` renders the content read-only (sanitized). Never included in `formData` at submit (FR: labels are non-submitting).

### 5b. Data-bound Label (C-001-gated build)
1. Designer sets type=`label` + `sourceFieldSchemaName` (source-field picker).
2. Generator emits `{fieldType:'label', sourceFieldSchemaName}`.
3. Runtime `LabelField` resolves the **source field definition** from the loaded form (by schema name) and the **current value** from form state, then renders `<ReadOnlyFieldValue fieldDef={source} value={value} />`.
4. `ReadOnlyFieldValue` switches on `source.fieldType`: text/number/date→formatted text; dropdown/radio/checkbox/multiselect→selected option label(s); currency→formatted; lookup→display value; grid→read-only rows; file→**document view links (5d)**; richText→sanitized HTML.
5. Stale reference (source not found): render blank + publish-time warning (§ADR-FBE-007).

### 5c. Summary mode selection
- `None` → no summary step.
- `SystemGenerated` → existing auto `FormSummary`/`FormSummaryScreen`.
- `Manual` → the tab with `isSummaryTab=true` becomes the final step; all its fields render via the read-only path (NFR-008 — component-level, not HTML `disabled`).

### 5d. Document "view" flow (OQ-004)
File field value = `UploadedFileRef[] = [{fileId: annotationId, fileName}]` (files stored as CRM annotations; SharePoint destination stores an absolute URL instead).
- **Annotation-stored:** `ReadOnlyFieldValue(file)` renders each `fileName` as a link to a **stored/derived URL**:
  - Portal + mobile → **new `GET /api/files/:annotationId`** streaming `annotations({id})/documentbody/$value` inline (auth + access-policy enforced).
  - In-CRM engine → the Dataverse annotation content URL via Xrm (`{orgUrl}/api/data/v9.2/annotations({id})/documentbody/$value`), no backend.
- **SharePoint-stored:** the stored value is already an absolute URL → link directly.

---

## 6. Architecture Decision Records

### ADR-FBE-001: Extract a surface-local `ReadOnlyFieldValue(fieldDef, value)` renderer
**Decision:** Introduce one read-only, control-free display component per surface (web + mobile) that renders any field type from a field definition and a value. Data-bound Labels and forced-read-only summary fields delegate to it.
**Why:** Avoids per-type summary code; guarantees "all field types supported" by construction.
**Risk/condition (RISK-001 / C-001):** Existing `FieldRenderer` is coupled to react-hook-form `control` and edit context. The **C-001 spike (§10)** must confirm each type's display can be produced without `control`; where a renderer is coupled, extract its presentational core. **Build of ADR-FBE-001-dependent features is hard-gated on the spike passing.**

### ADR-FBE-002: Document view via annotation download endpoint (OQ-004)
**Decision:** New `GET /api/files/:annotationId` (portal/mobile) streams the annotation body inline; in-CRM uses the Xrm annotation content URL; SharePoint-destination files link to their stored URL directly.
**Why:** No download endpoint exists today; annotations have no intrinsic public URL. Keeps auth/access-policy enforcement on the backend for portal/mobile; in-CRM inherits Dataverse security.
**Consequence:** New route + access-policy check; mobile reuses it; the file `ReadOnlyFieldValue` branch is destination-aware.

### ADR-FBE-003: `qdb_summary_mode` option-set + lazy migration (OQ-005)
**Decision:** Add option-set; **no batch migration**. When `qdb_summary_mode` is null, generators derive it from `qdb_show_summary_step` (`true→SystemGenerated`, else `None`). Designer shows a one-time alert on opening a legacy form and writes `qdb_summary_mode` on next save. Back-compat path is **permanent**.
**Why:** Zero-downtime, no risky bulk update; existing forms behave identically until touched.

### ADR-FBE-004: Label as the unified static/bound primitive (Features 3 + 4)
**Decision:** One `label` field type with optional `sourceFieldSchemaName`. No separate "summary field" entity/binding.
**Why:** Minimal schema, reuses field/section/tab records and the read-only renderer; the manual summary is an ordinary tab.

### ADR-FBE-005: Byte-identical cache serialization (RISK-002 / NFR-001)
**Decision:** All new C# model properties use `NullValueHandling.Ignore`; Node mapping omits undefined keys identically. Forms not using new features emit an unchanged JSON graph. Add a golden-file cache-parity test.
**Why:** Protects the render-cache hash and the byte-identity guarantee across the C#/Node boundary.

### ADR-FBE-006: Section icons reuse the tab-icon system (C-004 / C-009)
**Decision:** Section icon uses the same identifier format and picker as the existing tab icon. For the in-CRM bundle, no new icon library is added; if the tab-icon set is already bundled, section icons are free. Any icon-set growth is measured against the on-prem web-resource size limit (C-009/RISK-003) before merge.
**Why:** Consistency, zero net new bundle weight.

### ADR-FBE-007: Stale `sourceFieldSchemaName` → publish warning + graceful blank (OQ-006)
**Decision:** Publish-time validation emits a **warning** (soft block) when a bound Label references a missing/hidden field; runtime renders blank rather than erroring. Consistent with the existing icon soft-warning posture.

---

## 7. API Contracts

### 7a. New: `GET /api/files/:annotationId`
- Auth required; enforces the form's access policy for the owning record.
- 200 → streams `documentbody` with `Content-Type` from the annotation `mimetype`, `Content-Disposition: inline; filename="…"`.
- 403 (policy), 404 (missing annotation).

### 7b. Modified: `GET /api/forms/:formCode/metadata`
- Response gains `summaryMode` (form), `iconName` (section), `description`+`isSummaryTab` (tab), `sourceFieldSchemaName`+`staticContent` (field), and `label` as a valid `fieldType`. Additive — existing clients ignore unknown keys.

---

## 8. Backward Compatibility
- Legacy `qdb_show_summary_step` honored indefinitely (ADR-FBE-003); no form is forced to migrate.
- All new attributes nullable → existing forms serialize byte-identically (ADR-FBE-005).
- `label` is a new type; existing forms have none, so no runtime path changes for them.
- Shared-type additions are optional fields — no breaking change to web/mobile consumers.

---

## 9. Deployment & Rollback Sequencing
1. Schema (`provision-fbe-schema.mjs`) — additive, cloud + on-prem (add attrs to solution for on-prem travel).
2. Shared types → Node backend → C# plugin rebuild+redeploy (net4.7.1 merged/signed DLL; republish forms).
3. Designer → runtimes (web build, in-CRM web resource upload+publish, mobile build).
4. Rollback: attributes are inert if unused; revert code by redeploying the prior DLL/web resource. No data migration to unwind (lazy migration).

---

## 10. C-001 Spike — Read-Only Renderer Reusability (HARD GATE)
**Named Phase 3 deliverable. Owners:** Frontend + Mobile developers. **Target: 2026-07-08.**
**Question:** For every field type, can its read-only *display* be produced from `(fieldDefinition, value)` alone — with no react-hook-form `control`, no edit-mode FormContext/Zustand edit slice, no editable `FieldWrapper`?
**Method:** Audit each type in web `FieldRenderer.tsx` and mobile `FieldRenderer`; classify as (a) already presentational-separable, (b) needs a small presentational extraction, (c) tightly coupled → refactor cost estimate.
**Output (written):** a per-type table + the confirmed `ReadOnlyFieldValue` contract, appended to this doc.
**Gate:** Build of the **data-bound Label** and the **Manual summary tab** (ADR-FBE-001 dependents) must NOT begin until the spike is signed off. If a type is class (c), its read-only support in the summary is scheduled as a follow-up rather than blocking the whole feature.

---

## 11. Build Order & Per-Surface Breakdown

**Wave 1 — unblocked, parallelizable (no C-001 dependency):**
- **Section icons** (schema, shared types ×2, C# + Node, designer picker, section header render ×3 surfaces).
- **Tab descriptions** (schema, types ×2, C# + Node, designer field, render above sections ×3).
- **Static Label** (`label` type, `qdb_static_content`; types ×2, C# + Node, `LabelField` static branch ×2, designer).
- **Summary mode option-set** (`qdb_summary_mode`, `qdb_is_summary_tab`; types ×2, C# + Node with legacy derivation; designer selector + legacy alert; wire `None`/`SystemGenerated` to existing summary).

**Gate: C-001 spike sign-off (≤ 2026-07-08).**

**Wave 2 — post-spike:**
- **`ReadOnlyFieldValue`** (web + mobile) per the confirmed contract.
- **Data-bound Label** (source resolution + delegation; file branch + `GET /api/files/:annotationId` + in-CRM Xrm URL — OQ-004).
- **Manual summary tab** (render `isSummaryTab` as final step; force read-only for all field types) — **sequenced after the data-bound Label** is built and tested.

**Per-surface owners:** power-platform/crm-onprem (schema + C# plugin), backend (Node path + file endpoint + shared types), frontend (designer + web runtime + in-CRM), mobile (RN runtime), code-reviewer→qa→auditor per the standard gate chain.

---

## 12. Open Items Carried to Build
- C-002 (tab-desc placement) — resolved by OQ-001 (content area, above sections).
- C-003 (static content attr) — resolved: `qdb_static_content`.
- C-004 (icon system) — ADR-FBE-006 (reuse tab-icon system); frontend confirms exact format at build start.
- C-005 (stale-ref policy) — resolved: publish warning (ADR-FBE-007).
- OQ-004 — resolved (ADR-FBE-002).
- C-001 spike — §10, gates Wave 2.
