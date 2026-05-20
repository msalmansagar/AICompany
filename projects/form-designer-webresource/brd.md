# Business Requirements Document
# Dynamics CRM Web Resource — Drag-and-Drop Form Designer

**Document Version:** 1.0
**Prepared By:** Business Analyst Agent — Maqsad AI
**Date:** 2026-05-18
**Status:** Awaiting CEO Approval
**Project Code:** FDWR-001

---

## 1. Executive Summary

The client requires a visual Form Designer tool that runs inside Dynamics CRM as a Web Resource. The tool empowers business users — not developers — to design dynamic portal forms using drag-and-drop interaction. Designed forms are persisted directly into existing CRM configuration tables (the Form Engine schema already provisioned). The output of the designer is consumed by a separate portal form-rendering engine (the Dynamic Form Engine) which displays the forms to end users.

This engagement covers the designer surface only — not the portal renderer. The designer produces configuration records; the renderer reads them.

---

## 2. Business Problem

### 2.1 Current Pain Points
- Form changes require developer involvement and CRM solution deployments, causing 2–4 week lead times per change.
- Business analysts cannot independently create or modify portal form layouts.
- There is no version control or rollback capability for form configurations.
- No visual preview of how a form will appear on desktop, tablet, or mobile before publishing.
- Theming and styling require developer CSS knowledge.
- No audit trail for who changed a form and what was changed.

### 2.2 Desired Outcome
Business users can open the Form Designer inside Dynamics CRM and, without writing code:
- Create new portal forms with tabs, sections, and fields via drag and drop.
- Configure field types, validations, business rules, and lookup dependencies.
- Preview the form on multiple device sizes before publishing.
- Publish a versioned form that the portal renderer immediately uses.
- Roll back to a previous version if a published form has errors.
- Theme and style a form to match branding guidelines.

---

## 3. Scope

### 3.1 In Scope
1. Dynamics CRM Web Resource (React + TypeScript + Fluent UI + dnd-kit).
2. Drag-and-drop form canvas supporting tabs, sections, and all defined field types.
3. Left component toolbox (Basic, Layout, Advanced component categories).
4. Right properties panel for configuration of selected component.
5. Top command bar (Save Draft, Publish, Preview, Version History, Clone, Undo, Redo).
6. New form wizard (5-step guided creation flow).
7. Form list screen (search, filter, status, open, delete).
8. Tab designer — add, rename, reorder, delete tabs.
9. Section designer — add section, choose column layout (1/2/3), card/accordion variants.
10. Field designer — configure all field types listed in Section 6.
11. Theme / style editor — colours, fonts, spacing, border radius.
12. Business rule configuration panel — show/hide/require rules with conditions.
13. Validation rule configuration — required, regex, min/max, custom error messages.
14. Option set editor — manage dropdown/radio/multi-select options inline.
15. Lookup configuration panel — configure lookup entity, filter, display field.
16. Submission mapping panel — map form fields to CRM entity fields.
17. Preview screen — desktop / tablet / mobile breakpoints.
18. Publish validation screen — checklist gates before publish.
19. Version history screen — view, compare, promote, rollback.
20. Audit log — every save/publish action recorded to qdb_form_audit_log.
21. CRM service layer using Xrm.WebApi for all CRUD operations.
22. Deployment artifacts: web resource bundle, CRM solution package, deployment guide.

### 3.2 Out of Scope
- The portal form renderer (already exists as the Dynamic Form Engine project).
- Authentication — relies on CRM session context.
- Multi-language / localisation of form labels (Phase 2).
- Custom connector integrations from the designer UI.
- Mobile-native application for the designer itself.
- PDF generation.

---

## 4. Stakeholders

| Role | Responsibility |
|------|---------------|
| Business Analyst | Form design, configuration, publishing |
| CRM Administrator | Solution deployment, permissions, sitemap |
| Portal Developer | Consuming published form configurations |
| IT Manager | Solution governance, version approvals |
| End User (Portal) | Filling out published forms (not a designer user) |

---

## 5. Functional Requirements

### FR-001 Form List Screen
- Display all forms with columns: Name, Code, Status (Draft/Published/Archived), Version, Modified On, Modified By.
- Filter by status, search by name or code.
- Actions: New Form, Open, Clone, Archive, Delete (Draft only).
- Paged list using Xrm.WebApi.retrieveMultipleRecords.

### FR-002 New Form Wizard
- Step 1: Basic Info — form name, code (auto-generated, editable), description, entity association.
- Step 2: Layout — choose tab count and initial section layout.
- Step 3: Theme — select from existing themes or create new.
- Step 4: Submission Mapping — select target CRM entity.
- Step 5: Review and Create — validation summary, Create button.
- Wizard creates qdb_form_definition, default qdb_form_tab, default qdb_form_section, and qdb_form_version (v0.1 Draft).

### FR-003 Drag-and-Drop Designer Canvas
- Canvas renders the form structure: tabs across top, sections per tab, fields inside sections.
- Component toolbox (left panel) exposes draggable items by category.
- Drop targets: Tab bar, section inside tab, field position inside section.
- Dragging a component from toolbox drops it onto a valid target; an unsaved indicator appears.
- Dragging within the canvas reorders fields/sections/tabs.
- Selected item highlights and opens its properties in the right panel.
- Undo/redo (Ctrl+Z / Ctrl+Y) with history stack (up to 50 operations).

### FR-004 Component Toolbox
Three categories, always visible in left panel:

**Basic Fields**
- Text (single line), TextArea (multi-line), Number (integer), Decimal, Currency, Date, DateTime, Email, Phone, Dropdown (option set), Multi-select, Lookup, Checkbox, Radio Group, File Upload, Rich Text Editor.

**Layout Components**
- Tab, Section — 1 column, Section — 2 columns, Section — 3 columns, Card Section, Accordion Section, Spacer, Divider, Info Text block, Header Text.

**Advanced Components**
- Repeating Grid, Child Entity Grid, Document Upload Block, Terms and Conditions Block, Declaration Block, Summary Block.

### FR-005 Properties Panel
- Context-sensitive: changes based on selected component type.
- Form properties: name, code, description, entity, submission method.
- Tab properties: label, order, visibility condition.
- Section properties: label, columns, collapsible, default expanded.
- Field properties (varies by type): label, placeholder, required, read-only, default value, help text, CSS class override, visibility condition.
- Type-specific: regex for text, min/max for numbers, date range for dates, option set source for dropdowns.
- Lookup properties: entity, filter query, display field, value field.

### FR-006 Save Draft
- Persists form state to CRM tables without changing form status to Published.
- Validates structure (no empty names) before save.
- Dirty indicator cleared on successful save.
- Timestamp and user recorded in qdb_form_audit_log (action: SAVE_DRAFT).

### FR-007 Publish Form
- Opens publish validation screen.
- Validation checklist (must all pass):
  - Form has a name and unique code.
  - At least one tab.
  - At least one section in every tab.
  - No unnamed fields.
  - No duplicate field codes within the form.
  - Every Dropdown/Radio/Multi-select has at least one option.
  - Every Lookup field has entity configured.
  - Submission mapping is complete (all required fields mapped).
- On pass: creates new qdb_form_version (incrementing minor version), sets qdb_form_definition.status = Published, records to qdb_form_audit_log (action: PUBLISH).
- Notifies user via Xrm notification banner.

### FR-008 Version Management
- Every save creates an auto-save checkpoint in qdb_form_version.
- Publish creates a named version with version number (Major.Minor).
- Version history screen: list all versions, diff summary (field count changes), Restore button.
- Restore creates a new Draft version from the restored snapshot.

### FR-009 Clone Form
- Duplicates qdb_form_definition and all child records (tabs, sections, fields, rules, options, design records).
- New form name appended with " — Copy".
- New form code generated.
- Clone status: Draft, version: 0.1.

### FR-010 Theme / Style Editor
- Select from existing qdb_theme records or create new theme.
- Editable properties: primary colour, accent colour, background colour, font family, font size (base), border radius, field spacing, label position (above/beside), button style.
- Live preview updates form canvas as user adjusts values.
- Save theme creates/updates qdb_theme and qdb_form_design for the form.

### FR-011 Rule Configuration
**Validation Rules** (qdb_form_validation_rule):
- Required, Min Length, Max Length, Regex Pattern, Min Value, Max Value, Custom error message.

**Business Rules** (qdb_form_business_rule):
- Trigger: field value change event.
- Condition: field = value / field contains / field is empty.
- Actions: Show field, Hide field, Set required, Clear required, Set value, Show message.
- Compound conditions with AND/OR operators.

### FR-012 Preview Mode
- Renders the designed form using the portal renderer in an embedded iframe or local simulation.
- Toolbar: Desktop (1200px), Tablet (768px), Mobile (375px) toggles.
- Read-only — no editing in preview mode.

### FR-013 Keyboard Accessibility
- All toolbox items keyboard-navigable and activatable via Enter.
- Tab/Shift+Tab moves focus through interactive elements.
- Arrow keys reorder selected items.
- ARIA labels on all interactive components.
- Screen reader announcements on drag-and-drop operations.

### FR-014 Audit Log
- Every user action (open, save, publish, clone, restore, delete) recorded to qdb_form_audit_log.
- Fields: form_id, action, actor (CRM user), timestamp, payload (JSON delta).
- Append-only — no delete or update of audit records.

---

## 6. Non-Functional Requirements

### NFR-001 Performance
- Designer canvas must render up to 50 fields without visible lag (< 100ms interaction response).
- CRM API calls must complete within 3 seconds under normal CRM load.
- Toolbox drag initiation must feel instantaneous (< 16ms, 60fps target).

### NFR-002 Compatibility
- Target browsers: Microsoft Edge (Chromium) v100+, Chrome v100+.
- CRM versions: Dynamics 365 v9.2 on-premise and Online.
- Responsive within CRM web resource iframe (minimum 1024px width).

### NFR-003 Reliability
- Auto-save every 2 minutes when form is dirty.
- On CRM API failure: retry up to 3 times with exponential backoff; surface error to user.
- No data loss on browser refresh — confirm dialog if unsaved changes exist.

### NFR-004 Security
- Relies entirely on Dynamics CRM security roles for access control.
- No additional authentication layer required — CRM session is the auth context.
- Xrm.WebApi operations respect CRM record-level security.
- No secrets or credentials in the web resource bundle.
- No external API calls from the web resource — all calls go through Xrm.WebApi.

### NFR-005 Maintainability
- All CRM table logical names and attribute names declared in a central constants file.
- No hardcoded GUIDs or entity names inline.
- TypeScript strict mode throughout.
- Vitest unit tests for all service layer functions.

### NFR-006 Deployment
- Single CRM solution file (.zip) for import via CRM Solution Import UI.
- Web resource bundle served from CRM — no external CDN dependency.
- Deployment guide covering DEV / SIT / UAT / PROD promotion steps.
- Sitemap entry and ribbon button configuration included.

---

## 7. User Stories

### Epic: Form Management
- **US-001** As a BA, I can view a list of all portal forms so that I can find and open existing forms.
- **US-002** As a BA, I can create a new form using a guided 5-step wizard so that I don't need developer help to set up a form structure.
- **US-003** As a BA, I can clone an existing form so that I can quickly create a variant without starting from scratch.
- **US-004** As a BA, I can archive a form so that retired forms are hidden from the active list without being deleted.

### Epic: Canvas Design
- **US-005** As a BA, I can drag a field from the toolbox and drop it onto the form canvas so that I can add new inputs to my form.
- **US-006** As a BA, I can drag fields within the canvas to reorder them so that the form flow makes logical sense.
- **US-007** As a BA, I can add, rename, reorder, and delete tabs so that I can organise long forms into logical groups.
- **US-008** As a BA, I can add sections with 1, 2, or 3 column layouts so that I can control how fields are grouped visually.
- **US-009** As a BA, I can undo and redo my last 50 actions so that mistakes can be reversed without re-doing all my work.

### Epic: Field Configuration
- **US-010** As a BA, I can click a field and configure its label, placeholder, help text, and required status in the properties panel.
- **US-011** As a BA, I can configure dropdown/radio/multi-select options inline so that I don't need to create option sets separately.
- **US-012** As a BA, I can configure lookup fields to filter by entity and display field so that users see meaningful lookup results.
- **US-013** As a BA, I can add validation rules (required, regex, min/max) to fields so that the portal enforces data quality.
- **US-014** As a BA, I can add business rules (show/hide/require) triggered by field values so that forms are dynamic and contextual.

### Epic: Publishing
- **US-015** As a BA, I can save a draft of my form at any time without publishing it so that I can work iteratively.
- **US-016** As a BA, I can preview my form at desktop, tablet, and mobile breakpoints before publishing so that I can verify the layout.
- **US-017** As a BA, I can run publish validation and see a checklist of issues that must be fixed so that invalid forms cannot go live.
- **US-018** As a BA, I can publish a form and see it immediately available on the portal without a developer deployment.

### Epic: Version Management
- **US-019** As a BA, I can view the version history of a form and see when each version was published.
- **US-020** As a BA, I can restore a previous version of a form as a new draft so that I can roll back to a known-good state.

### Epic: Theming
- **US-021** As a BA, I can choose an existing theme or create a custom theme so that the form matches branding guidelines.
- **US-022** As a BA, I can see live theme changes on the canvas as I adjust colours, fonts, and spacing.

### Epic: Audit
- **US-023** As a CRM Admin, I can view the audit log for any form to see who changed it and what action was taken.

---

## 8. CRM Table Mapping

| Designer Action | CRM Table Written |
|----------------|------------------|
| Create/Edit form | qdb_form_definition |
| Add/edit tab | qdb_form_tab |
| Add/edit section | qdb_form_section |
| Add/edit field | qdb_form_field |
| Add validation rule | qdb_form_validation_rule |
| Add business rule | qdb_form_business_rule |
| Add option | qdb_form_option_value |
| Configure lookup | qdb_form_lookup_config |
| Configure submission mapping | qdb_form_submission_mapping |
| Save/Publish version | qdb_form_version |
| Apply theme | qdb_theme, qdb_form_design |
| Style section | qdb_section_design |
| Style field | qdb_field_design |
| Style button | qdb_button_design |
| Any save/publish/action | qdb_form_audit_log |

---

## 9. Assumptions

- All 16 CRM tables listed in scope are already provisioned in the target CRM environment.
- The portal Form Engine renderer (Dynamic Form Engine) is already deployed and reads from these tables.
- The CRM security role "Form Designer User" will be created by the CRM admin before deployment.
- Xrm.WebApi is available in the web resource context (Dynamics 365 v9.2+).
- No IE11 or legacy browser support required.
- The designer will be embedded via a CRM sitemap entry as a full-page web resource.
- Business rules engine in the portal renderer understands the rule schema written by this designer.

---

## 10. Constraints

- Web resource must not make calls to external services — all data through Xrm.WebApi.
- Bundle size must stay under 5MB to avoid CRM upload limits.
- No Node.js server-side code — this is a pure client-side web resource.
- Must not use deprecated Xrm.Page API.
- Must not use document.getElementById or DOM manipulation patterns deprecated in UCI.
- All CRM interaction via executionContext or parent.Xrm safely obtained at runtime.

---

## 11. Acceptance Criteria

| ID | Criterion |
|----|-----------|
| AC-001 | A business user can create a new form, add 3 tabs, 2 sections each, 5 fields each, and publish it without developer assistance. |
| AC-002 | Drag-and-drop reordering of fields and sections works correctly on Edge and Chrome. |
| AC-003 | Published form version is immediately readable from qdb_form_version and qdb_form_definition. |
| AC-004 | Publish is blocked if any validation checklist item fails; specific failures are displayed to the user. |
| AC-005 | Undo/redo correctly reverses and replays the last 10 sequential operations. |
| AC-006 | Preview mode renders form at desktop/tablet/mobile widths with correct layout. |
| AC-007 | All 16 CRM tables receive correct records when all component types are used. |
| AC-008 | Audit log records every save, publish, clone, and restore action with actor and timestamp. |
| AC-009 | Theme changes are reflected in the canvas within 500ms of adjustment. |
| AC-010 | CRM solution can be imported cleanly into a fresh CRM environment with no errors. |

---

## 12. Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|-----------|
| R-001 | Xrm.WebApi rate limiting under heavy save operations | Medium | High | Batch writes, debounce auto-save |
| R-002 | Bundle size exceeds 5MB CRM upload limit | Medium | High | Code splitting, tree-shaking, lazy loading of advanced components |
| R-003 | dnd-kit accessibility gaps | Low | Medium | Augment with keyboard event handlers and ARIA live regions |
| R-004 | CRM version differences between DEV and PROD | Medium | Medium | Target v9.2 minimum API level; test on both on-prem and online |
| R-005 | Business rule schema misalignment with portal renderer | High | High | Agree business rule JSON contract with renderer team before build |

---

## 13. Out-of-Scope Items (Deferred to Phase 2)

- Multi-language / localisation of form labels.
- Real-time collaborative editing (multiple users editing the same form).
- Custom field type plugins.
- Direct integration with Azure Blob for file upload in the designer preview.
- Analytics dashboard showing form usage statistics.

---

*Document ends. Pending CEO review and approval before architecture proceeds.*
