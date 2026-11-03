# Business Requirements Document
**Engagement ID:** DFE-ENH-001
**Prepared by:** Maqsad AI — Business Analyst
**Date:** 2026-07-10
**Version:** 1.0
**Status:** DRAFT — Pending CEO Approval

---

## 1. Executive Summary

The Dynamic Form Engine (DFE) Form Designer is a mature Dataverse-backed authoring surface that already supports 35 field types, drag-and-drop tab/section composition, seven validation-rule types, a business-rule builder, submission mapping, theme editing, English+Arabic translations, publish validation, render cache, access policies, audit logging, undo/redo, and version history with restore. Despite this breadth, the designer has accumulated a structural debt that blocks QDB from confidently expanding the platform to regulated, high-traffic, and public-facing use cases.

This BRD formalizes 26 discrete requirements across two categories: (A) 15 product/authoring-integrity gaps, and (B) 11 enterprise-governance gaps. Requirements are prioritized using MoSCoW, assigned a rough T-shirt size, and sequenced into four delivery phases. The expected business outcomes are: (1) zero silent data loss or publish-corruption events in production; (2) a two-stage maker-checker approval gate on form publication matching the EDP-BRE-001 governance model already adopted for the business rules engine; (3) demonstrable WCAG 2.1 AA compliance for all public-sector forms; and (4) a localization pipeline that can scale beyond English and Arabic without manual intervention.

A confirmed production defect — the first validation or business rule added to a new form failed to persist because a 0-based `sortOrder` wrote `qdb_priority=0`, violating Dataverse's minimum-1 constraint — is cited as a quality signal motivating the authoring-integrity phase. It is resolved (PR #11) and is not captured as a new requirement.

Note: DFE-STYLE-001 (Advanced Visual Styling) holds an approved BRD but is currently paused. Two requirements in this document (FR-009 and FR-012) share surface area with STYLE-001. Those items are flagged; if STYLE-001 resumes before the relevant phase of this engagement, the overlapping scope must be reconciled at architecture stage to avoid duplicate work.

---

## 2. Business Objectives

1. Enable QDB form administrators to detect and resolve authoring errors (duplicate schema names, orphaned mappings, rules referencing deleted fields) before publishing, so that no structurally invalid form reaches end-users.
2. Enable QDB compliance officers to enforce a two-stage maker-checker approval workflow on all form publications, so that no form goes live without an authorized second-party review — consistent with the approval model already established in EDP-BRE-001.
3. Enable QDB IT administrators to grant per-form design and publish rights to named individuals or roles, so that field-level and form-level edit authority is controlled without granting platform-wide designer access.
4. Enable QDB legal and data-governance officers to tag fields with PII classification, sensitivity labels, and consent capture requirements at authoring time, so that regulatory obligations are enforced by design rather than by process.
5. Enable QDB portal teams to promote a single form and all its dependencies (theme, mappings, translations, rules) from dev to test to production without a full-solution export, so that change management is atomic and traceable.
6. Enable concurrent designer sessions without risk of silent last-write-wins overwrites, so that no authoring work is lost when multiple editors access the same form simultaneously.
7. Enable QDB accessibility officers to certify that all rendered forms meet WCAG 2.1 AA, so that public-sector digital service obligations are demonstrably satisfied.
8. Enable QDB localization managers to enforce translation completeness before publish and to import/export translations in bulk, so that the platform can scale to additional languages without per-language manual intervention.
9. Enable QDB platform operations teams to monitor form submission volumes, error rates, and drop-off patterns, so that data-driven decisions can be made about form design improvements.
10. Enable QDB architects to understand platform scale limits and receive warnings before approaching them, so that capacity planning is proactive rather than reactive.

---

## 3. Stakeholders

| Stakeholder                      | Role                               | Interest in this project                                                    |
|----------------------------------|------------------------------------|-----------------------------------------------------------------------------|
| QDB Form Administrators          | Primary designer users             | Authoring integrity, linting, undo coverage, search, bulk operations        |
| QDB Compliance Officers          | Approval authority                 | Maker-checker workflow, audit immutability, PII classification               |
| QDB IT Administrators            | Platform governance                | Designer RBAC, environment topology, form promotion / ALM                   |
| QDB Legal / Data Governance      | Regulatory obligation owners       | PII tagging, sensitivity labels, consent capture, data retention             |
| QDB Accessibility Officers       | Public-sector obligation owners    | WCAG 2.1 AA certification of rendered forms                                 |
| QDB Localization Managers        | Translation pipeline owners        | Multi-language completeness gate, bulk import/export, translator roles       |
| QDB Portal Operations            | Runtime monitoring                 | Observability, submit-error monitoring, drop-off analytics                   |
| QDB Business Analysts            | Rule and mapping authors           | Conditional validation, cross-field rules, calculated fields                 |
| Maqsad AI Frontend Team          | Designer implementation owners     | All FR items; surface-area coordination with DFE-STYLE-001                   |
| Maqsad AI Backend Team           | Plugin and API implementation      | Concurrency, linting API, approval workflow, audit log, export/import        |
| Maqsad AI Architect              | Technical design authority         | Sequencing, dependency management, ADR production                            |
| Maqsad AI CEO                    | Engagement sponsor and approver    | ROI, risk, phase gate decisions                                              |

---

## 4. Scope

### 4.1 In Scope

- Optimistic concurrency control and concurrent-edit presence indicators in the designer
- Design-time config linting (static analysis of form definition before publish)
- Version history diff / compare view between any two saved versions
- Undo/redo coverage verification and gap closure (translations, theme, mapping)
- Conditional-required / dynamic validation rules
- UI editor for the `cross_field` validation type (type already exists in the schema)
- Reusable field and section templates library scoped across forms
- Keyboard reordering and drag-and-drop reliability improvements in the designer canvas
- In-designer search and outline navigator panel for large forms
- Bulk field and section operations (multi-select, copy/paste across tabs and forms)
- Minor UX improvements: Form Code auto-derive behavior, Field Properties panel layout
- Multi-language translation authoring support beyond English+Arabic, translation completeness gate, bulk import/export in XLIFF/CSV format
- Single-form import/export (portability between Dataverse organizations)
- Preview with test-data injection and test-submit to exercise rules and submission mapping end-to-end
- Maker-checker two-stage approval workflow before publish
- Designer-side RBAC: per-form ownership model, field-level edit rights, publish authority
- Field-level PII tagging, sensitivity labels, retention policy, and consent-capture flag
- Dev→test→prod form promotion pipeline for a single form and its dependencies
- Field-level before/after change history in the audit log, append-only tamper-evidence verification
- Form usage telemetry, submit-error monitoring, and drop-off analytics
- Documented and enforced scale limits for form definitions (field count, rule count, section depth)
- Localization governance: enforced completeness, RTL correctness certification, translator role definitions
- Backup / DR strategy review for form definitions (scope: strategy document and any gap remediation)

### 4.2 Out of Scope

- Anything already implemented and in production: 35 field types, tabs/sections drag-drop (initial implementation), 7 validation-rule types, business-rule builder, submission mapping with metadata-driven dropdowns and 6 transform options, theme editor, English+Arabic translations, preview (current non-data-injected version), clone, version history with restore, publish with validation gate, render cache, access policies, audit log (current granularity), undo/redo (current structure-only coverage), lookup config, optionset editor, rule templates
- Runtime rendering engine changes (runtime is out of scope for this engagement)
- New field types beyond the existing 35
- Mobile-specific rendering or React Native designer
- Dynamics 365 F&O integration
- Copilot Studio or AI-generated form authoring (separate engagement)
- Power BI embedded reporting (separate engagement)
- Advanced visual styling (DFE-STYLE-001 is a separate approved BRD; surface area overlaps flagged per requirement)
- Calculated/derived field expression engine (listed as FR-005 Could Have; if descoped it moves to a future engagement)
- Integration connector registry (ENT-011 Won't Have this phase)

---

## 5. Functional Requirements

Requirements are grouped by authoring-integrity area and cross-referenced to Business Objectives.

### Group A — Concurrent Edit and Data Integrity

**FR-001: Optimistic Concurrency Control**
- **Title:** Prevent silent overwrite on concurrent form edits
- **Description:** The designer must implement optimistic concurrency using the Dataverse `@odata.etag` / `If-Match` header pattern. When a save is attempted and the server detects a version conflict (another editor saved after the current editor opened the form), the save must be rejected with a structured conflict error. The UI must present a conflict-resolution dialog showing whose save succeeded and offering the current editor the option to: (a) reload the latest version and lose local changes, or (b) view the conflict and merge manually.
- **Business rationale:** Twelve concurrent-write tests reproduced silent last-write-wins data loss. A form author's hours of mapping, rule, and translation work can be silently overwritten without this control.
- **MoSCoW:** Must Have
- **Effort:** M
- **Acceptance criteria:**
  - Given two editors have the same form open, when Editor A saves and Editor B subsequently attempts to save, then Editor B receives a conflict error message within 3 seconds and no data is silently overwritten.
  - Given a conflict is detected, when the conflict dialog is shown, then the dialog identifies the conflicting editor's display name and the timestamp of their save.
  - Given a user chooses to reload, when the reload completes, then the form state reflects the server's latest version and the user's local unsaved changes are discarded with a confirmation prompt.
- **Dependencies:** None
- **Overlaps:** None

**FR-002: Concurrent-Edit Presence Indicator**
- **Title:** Display "being edited by X" awareness banner
- **Description:** When a form is opened in the designer, the system must check for an active edit session (via a Dataverse heartbeat record or similar lightweight lock signal updated every 60 seconds) and display a non-blocking banner: "This form is also open by [Display Name] since [HH:MM]." The banner must refresh when the other editor closes the form or their session expires (heartbeat older than 90 seconds).
- **Business rationale:** Warns editors before they begin work, reducing the frequency of conflicts that FR-001 must resolve.
- **MoSCoW:** Must Have
- **Effort:** S
- **Acceptance criteria:**
  - Given User A has a form open and User B opens the same form, then User B sees an awareness banner within 5 seconds of opening the form.
  - Given User A closes the form or their session times out, when User B's banner refresh fires (within 90 seconds), then the banner disappears without a page reload.
- **Dependencies:** FR-001
- **Overlaps:** None

### Group B — Authoring Integrity and Linting

**FR-003: Design-Time Config Linting**
- **Title:** Pre-publish static analysis of form configuration
- **Description:** Before the publish validation gate fires, a linting pass must analyze the in-memory form definition and surface warnings and errors for: (a) duplicate `schemaName` values across fields; (b) required fields with no submission mapping; (c) submission mappings referencing CRM attributes that no longer exist in the current schema; (d) business rules or validation rules referencing field schema names that do not exist in the current form definition (orphaned references); (e) empty tabs or sections with no fields. Errors block publish. Warnings allow publish with acknowledgement.
- **Business rationale:** The PR #11 defect (sortOrder=0) is one example of how authoring state can be structurally invalid without the author knowing. Linting catches configuration problems before they reach end-users.
- **MoSCoW:** Must Have
- **Effort:** M
- **Acceptance criteria:**
  - Given a form with two fields sharing the same `schemaName`, when the designer runs linting, then an error is raised identifying both fields and the publish button is disabled until resolved.
  - Given a submission mapping referencing a CRM attribute `qdb_loanamount` and that attribute is removed from the entity, when linting runs, then a warning is raised identifying the orphaned mapping.
  - Given a business rule condition referencing `fieldRef: "annual_income"` and that field is deleted from the form, then linting raises an error for the orphaned rule reference.
  - Linting completes within 2 seconds for a form with up to 100 fields and 50 rules.
- **Dependencies:** None
- **Overlaps:** None

**FR-004: Version History Diff / Compare**
- **Title:** Visual diff between any two saved form versions
- **Description:** The version history panel must allow the user to select any two versions and display a structured diff. The diff must cover: fields added/removed/reordered; field property changes (label, validation, mapping); tab and section changes; translation changes; business rule changes; theme token changes. Diff display uses a standard two-column before/after layout with color-coded additions (green), removals (red), and changes (amber). The user must be able to restore from the diff view without navigating back to the version list.
- **Business rationale:** Version restore without diff forces editors to open both versions separately and compare mentally. Diff is the standard tool used in every comparable form-builder platform (Salesforce Flow, Jira, SharePoint modern pages).
- **MoSCoW:** Should Have
- **Effort:** M
- **Acceptance criteria:**
  - Given two versions of a form are saved, when the user selects both in the version history panel and clicks "Compare", then a diff view renders within 3 seconds.
  - Given the diff view, the user can identify: every field present in version A but absent in version B (shown as removed), and vice versa.
  - Given the diff view, the user clicks "Restore to Version A", then the form state is set to version A and a new version is created representing the restore point.
- **Dependencies:** None (version history already exists)
- **Overlaps:** None

**FR-005: Undo/Redo Coverage for Translations, Mapping, and Theme**
- **Title:** Extend undo/redo to cover all authoring contexts
- **Description:** The existing undo/redo stack covers structural operations (add/remove/reorder fields, tabs, sections). It must be extended to cover: (a) translation value edits in the translation panel; (b) submission mapping changes; (c) theme token value changes. Each of these operation types must produce a discrete undo entry with a human-readable label (e.g., "Change Arabic label of 'Full Name'", "Update mapping of 'Email' to qdb_emailaddress", "Change primary color token").
- **Business rationale:** Authors who accidentally overwrite translation content or submission mappings have no recovery path short of version restore, which reverts all changes made since the last save.
- **MoSCoW:** Should Have
- **Effort:** S
- **Acceptance criteria:**
  - Given a user edits an Arabic label and presses Ctrl+Z, then the label reverts to its previous value and the undo entry label reads "Change Arabic label of [field name]".
  - Given a user changes a submission mapping attribute and presses Ctrl+Z, then the mapping reverts to its previous target attribute.
  - Given a user changes the primary-color theme token and presses Ctrl+Z, then the token reverts and the preview re-renders with the previous color.
- **Dependencies:** None (undo/redo infrastructure already exists)
- **Overlaps:** Minor surface-area overlap with DFE-STYLE-001 for theme token editing; coordinate with STYLE-001 architect if that engagement resumes before this phase.

### Group C — Validation and Rule Authoring

**FR-006: Conditional-Required / Dynamic Validation**
- **Title:** Support field required-ness driven by another field's value
- **Description:** The validation-rule builder must support a new rule type "Conditional Required" that marks a field as required only when a specified trigger condition is true (e.g., "Field 'Guarantor Name' is required when 'Loan Type' = 'Secured'"). The rule type must use the existing condition-builder component. The runtime must enforce the conditional-required state, and the publish-validation gate must accept forms with conditional-required rules.
- **Business rationale:** Loan intake forms have numerous fields whose required-ness depends on loan type, applicant category, and collateral choice. Today these are implemented as workarounds using business rules (show/hide), which does not enforce server-side submission validation.
- **MoSCoW:** Must Have
- **Effort:** M
- **Acceptance criteria:**
  - Given a form with a conditional-required rule "Guarantor Name required when Loan Type = Secured", when a user submits the form with Loan Type = Secured and Guarantor Name empty, then a validation error is raised.
  - Given the same form, when a user submits with Loan Type = Unsecured and Guarantor Name empty, then no validation error is raised for Guarantor Name.
  - Given the designer, when a conditional-required rule is configured, then no linting error (FR-003) is produced for "required field with no mapping" when the mapping is present.
- **Dependencies:** None (condition builder already exists)
- **Overlaps:** None

**FR-007: Cross-Field Validation UI Editor**
- **Title:** Provide a condition/value editor for the `cross_field` validation type
- **Description:** The `cross_field` enum value exists in the validation-rule type schema but has no UI editor. The validation-rule builder must render a full editor for `cross_field` rules that allows: (a) selection of a reference field, (b) selection of a comparison operator (equals, not-equals, less-than, greater-than, less-than-or-equal, greater-than-or-equal), (c) specification of a value or reference to another field's value. The rule must produce a human-readable error message configurable by the author. The runtime must evaluate the rule at submission time.
- **Business rationale:** Cross-field constraints such as "End Date must be after Start Date" or "Loan Amount must not exceed Credit Limit" are common in financial forms. Authors currently work around this gap using business rules or post-submission server validation, leading to inconsistent UX.
- **MoSCoW:** Must Have
- **Effort:** S
- **Acceptance criteria:**
  - Given the designer, when a user adds a validation rule to a date field and selects "Cross-Field", then a condition editor appears allowing selection of another field and a comparison operator.
  - Given a cross-field rule "End Date must be after Start Date", when a user submits the form with End Date before Start Date, then the configured error message is displayed inline on the End Date field.
  - Given the linting pass (FR-003), when a cross-field rule references a deleted field, then a linting error is raised.
- **Dependencies:** FR-003 (linting must recognize cross-field rule references)
- **Overlaps:** None

### Group D — Reuse and Productivity

**FR-008: Reusable Field and Section Template Library**
- **Title:** Define and reuse field/section templates across forms
- **Description:** The designer must provide a "Template Library" panel alongside the existing component picker. Authors can designate any field or section (with all its child fields, validations, mappings, and translations) as a named template. Templates are stored in a dedicated Dataverse entity (`qdb_dfe_template`) scoped to the organization. When a template is added to a form, it is instantiated as a copy (not a live reference); subsequent template changes do not retroactively affect published forms. The library panel must support search by name and filter by type (field / section).
- **Business rationale:** QDB has identified a "Standard Personal Information" section (Name, Emirates ID, Date of Birth, Phone, Email, Address) that appears verbatim across 12+ forms. Today this is recreated manually on each form, creating maintenance overhead and inconsistency when a field label or validation must change across all forms.
- **MoSCoW:** Could Have
- **Effort:** L
- **Acceptance criteria:**
  - Given a section exists in a form, when a user right-clicks the section header and selects "Save as Template" and names it "Standard KYC Section", then the template appears in the Template Library panel and can be found by searching "KYC".
  - Given the template library, when a user drags "Standard KYC Section" onto a tab, then all child fields, their validations, and their Arabic/English translations are instantiated on the form.
  - Given a template is modified after being added to a form, then forms that already used the template are not retroactively changed.
- **Dependencies:** FR-003 (linting must not flag duplicate schemaNames added via template without the author noticing — template instantiation must auto-suffix schemaName to avoid collision)
- **Overlaps:** None

**FR-009: Keyboard Reordering and Drag-Drop Reliability**
- **Title:** Make field and section reordering keyboard-accessible and stable on large forms
- **Description:** (a) Field and section drag-drop must support keyboard equivalents: select an item, press Alt+Up / Alt+Down to move it within its parent, and Alt+Shift+Up / Alt+Shift+Down to move it to the previous/next sibling container. The keyboard reorder operations must produce an undo entry. (b) The drag-drop implementation must be refactored to eliminate the reported text-selection degradation and performance freeze observed on forms exceeding 50 fields. A virtualization strategy (e.g., windowed rendering for the field list) must be evaluated and adopted if benchmarking confirms it resolves the freeze.
- **Business rationale:** The designer is the primary tool for QDB form administrators, many of whom use keyboard navigation for accessibility compliance with their own corporate accessibility policy. The freeze on large forms blocks production use of the platform for complex loan intake forms.
- **MoSCoW:** Must Have
- **Effort:** L
- **Acceptance criteria:**
  - Given a field is focused in the designer, when the user presses Alt+Down, then the field moves one position down within its section and an undo entry labeled "Move [field name] down" is created.
  - Given a form with 80 fields, when a user drag-reorders any field, then no UI freeze lasting more than 200ms is observed (measured from drag-start to drop-complete).
  - Given a drag operation begins, then text selection on surrounding content does not occur.
- **Dependencies:** None
- **Overlaps:** FLAGGED — DFE-STYLE-001 may address keyboard interactions within the properties panel. Coordinate with STYLE-001 scope at architecture stage to avoid duplicate dnd-kit refactoring.

**FR-010: In-Designer Search and Outline Navigator**
- **Title:** Search fields/rules by name; navigate via form outline panel
- **Description:** A collapsible "Outline" panel must display the full hierarchical tree of the form: tabs → sections → fields (with schema name and field type icon). Clicking any node scrolls the canvas to that element and selects it. A global search bar (Ctrl+F shortcut) must filter the outline tree by field label or schema name in real time. The search must also match business rules and validation rules by the field names they reference.
- **Business rationale:** Forms with 50+ fields and multiple tabs are impossible to navigate efficiently using canvas scrolling alone. Authors spend significant time locating specific fields to configure or debug rules.
- **MoSCoW:** Should Have
- **Effort:** S
- **Acceptance criteria:**
  - Given a form with 80 fields across 4 tabs, when a user presses Ctrl+F and types "guarantor", then the outline panel filters to show only fields whose label or schema name contains "guarantor", and the matching entries are highlighted within 150ms.
  - Given the user clicks a field in the outline, then the canvas scrolls to that field and the Field Properties panel opens for it.
  - Given a user searches "loan amount" and a business rule references the loan_amount field, then the business rule appears in the search results as a related item.
- **Dependencies:** None
- **Overlaps:** None

**FR-011: Bulk Field and Section Operations**
- **Title:** Multi-select, copy, and paste fields and sections across tabs and forms
- **Description:** The designer must support: (a) multi-select of fields via Shift+Click or Ctrl+Click within the outline panel; (b) bulk delete of selected fields with a single confirmation dialog; (c) copy (Ctrl+C) and paste (Ctrl+V) of selected fields or sections into another tab or section within the same form, or into a different form opened in a second designer tab. Paste duplicates all field properties, validations, and translations; the pasted copy receives an auto-incremented schema name suffix to avoid collision. Paste into a different form also copies submission mappings if the target CRM entity contains the referenced attribute.
- **Business rationale:** Form authors building similar forms spend disproportionate time recreating field configurations. Bulk copy/paste reduces repetitive authoring by an estimated 40% on form-family scenarios (confirmed by QDB form administration team verbal estimate).
- **MoSCoW:** Could Have
- **Effort:** M
- **Acceptance criteria:**
  - Given three fields are selected in the outline, when the user presses Delete, then a single confirmation dialog appears listing all three field names before deletion.
  - Given two fields are selected and the user presses Ctrl+C then navigates to a different tab and presses Ctrl+V, then both fields appear in the target tab with auto-suffixed schema names (e.g., `phone_1`, `phone_2`).
  - Given a section is copied and pasted into a different form open in a second designer tab, then all child fields and their validation rules appear in the target form.
- **Dependencies:** FR-008 (template library shares reuse rationale; consider sequencing together)
- **Overlaps:** None

### Group E — UX and Minor Fixes

**FR-012: Form Code Auto-Derive and Properties Panel Layout**
- **Title:** Fix Form Code input behavior and Field Properties panel overflow
- **Description:** (a) The Form Code field in the create-wizard must auto-derive a value from the Form Name using a slug algorithm (lowercase, hyphens, alphanumeric only) and update live as the user types the name. Once the user manually edits the Form Code field, auto-derive must stop and the field must retain the manually entered value without appending further characters on subsequent name changes. (b) The Field Properties panel must constrain its content width to the panel width; no horizontal scrolling or content overflow outside the panel boundary should occur at any viewport width above 1024px.
- **Business rationale:** The current behavior appends characters to manually entered Form Codes, forcing authors to re-correct the field. The panel overflow makes property input fields inaccessible without horizontal scrolling, degrading authoring experience.
- **MoSCoW:** Could Have
- **Effort:** S
- **Acceptance criteria:**
  - Given the create-wizard, when the user types "Loan Application Form" in the Name field, then the Form Code field auto-populates "loan-application-form".
  - Given the user has manually typed "MY-FORM-01" in the Form Code field, when the user subsequently edits the Name field, then the Form Code field retains "MY-FORM-01" without appending characters.
  - Given the designer is open at 1024px viewport width, then no content in the Field Properties panel overflows its container boundary.
- **Dependencies:** None
- **Overlaps:** FLAGGED — DFE-STYLE-001 addresses panel layout and properties panel styling. If STYLE-001 resumes, the panel overflow fix (b) should be delivered within STYLE-001 to avoid duplicate layout work.

### Group F — Localization and Translation

**FR-013: Multi-Language Translation Authoring and Completeness Gate**
- **Title:** Support N languages in translation UI; enforce completeness before publish
- **Description:** (a) The translation panel must support adding any number of languages beyond English and Arabic. Language codes must follow BCP 47 (e.g., `ur` for Urdu, `hi` for Hindi). The panel must display a per-language completeness percentage (translated strings / total translatable strings × 100). (b) A publish-validation gate rule must enforce a configurable minimum completeness threshold per language (default 100%) for each language configured on the form. A language below threshold blocks publish as an error. (c) A translator role (see ENT-002 / designer RBAC) may be granted language-scoped edit access: a translator for Arabic can only edit Arabic strings and cannot modify field structure. (d) Bulk translation import/export must support XLIFF 2.0 and CSV formats; the export must produce one file per language; the import must validate schema-name alignment before writing and report mismatched keys as errors.
- **Business rationale:** QDB operates across an Arabic–English bilingual public and is exploring Urdu-language support for expatriate services. The current designer allows editing only two languages in the UI despite the publish pipeline supporting N languages. This creates a manual gap where additional languages must be injected directly into Dataverse records, bypassing the designer's validation and completeness checks.
- **MoSCoW:** Should Have
- **Effort:** M
- **Acceptance criteria:**
  - Given a form with a third language "ur" configured, when the user opens the translation panel, then a "Urdu (ur)" column appears alongside English and Arabic with its own completeness indicator.
  - Given a form configured with 100% completeness threshold for Urdu and Urdu completeness is at 80%, when the user attempts to publish, then the publish-validation gate displays a blocking error: "Urdu translation is 80% complete; 100% required before publish."
  - Given a user exports translations for a form, then an XLIFF 2.0 file is downloaded per language within 5 seconds for forms with up to 500 translatable strings.
  - Given an imported XLIFF file with a key `field_xyz` that does not exist in the current form definition, then the import reports a mismatched-key error for `field_xyz` and does not write any data from the file.
- **Dependencies:** ENT-002 (translator role needs RBAC foundation)
- **Overlaps:** None

### Group G — Portability and ALM

**FR-014: Single-Form Import / Export**
- **Title:** Export and import a form with all its dependencies as a portable bundle
- **Description:** A form bundle export must produce a single JSON file containing: form definition (all versions or latest version only, configurable); associated theme; all submission mappings; all translations for all languages; all access policies; and all linked business rules and validation rules. The bundle must include a manifest with a checksum and the source organization URL. Import must: (a) validate the manifest checksum; (b) detect field `schemaName` collisions with existing fields in the target org and present a rename-or-skip dialog; (c) create a new form (not overwrite an existing one) unless the user explicitly selects "Replace existing form [code]"; (d) log the import in the audit log (ENT-005).
- **Business rationale:** QDB manages at minimum three Dataverse environments (dev / test / prod). Currently moving a single form requires exporting the entire DFE solution, which carries unrelated forms, plugins, and web resources — creating change-management risk on the target environment. A form-bundle file allows targeted, auditable single-form promotion.
- **MoSCoW:** Should Have
- **Effort:** M
- **Acceptance criteria:**
  - Given a published form "Loan Application v3" in the dev org, when the user clicks "Export Form Bundle", then a JSON file is downloaded within 10 seconds containing all the elements listed above.
  - Given that bundle is imported into the test org where a form with the same code already exists, then the designer displays a conflict dialog and does not overwrite without explicit user confirmation.
  - Given a successful import, then an audit log entry records: imported by, source org URL, bundle checksum, timestamp.
- **Dependencies:** ENT-005 (audit log must record import events)
- **Overlaps:** None

**FR-015: Preview with Test-Data Injection and Test-Submit**
- **Title:** Run a form end-to-end against synthetic or real test data without publishing
- **Description:** The designer preview mode must be enhanced to allow: (a) injection of a JSON test-data payload that pre-populates field values and simulates CRM-fetched data (e.g., account name, contact details); (b) execution of all business rules and validation rules against the injected data, with a side panel showing which rules fired and why; (c) a "Test Submit" button that runs the submission mapping against the injected data and displays what would be written to Dataverse (entity, attribute, value) without writing any actual records; (d) display of any mapping errors or missing required field failures. The preview must not require the form to be published.
- **Business rationale:** Currently, authors must publish a form to test whether rules and mappings work correctly. Publishing exposes an untested form to the publish cache and potentially to users if access policies are misconfigured. Test-Submit provides a safe authoring-time verification loop.
- **MoSCoW:** Should Have
- **Effort:** L
- **Acceptance criteria:**
  - Given a form in draft state, when the user opens the enhanced preview and uploads a JSON test-data payload with 10 field values, then the form renders pre-populated with those values within 2 seconds.
  - Given a business rule "Show 'Guarantor Section' when Loan Type = Secured" and the test data contains LoanType = Secured, then the Guarantor Section is visible in the preview and the rule-trace panel shows the rule as fired with its condition met.
  - Given a Test Submit is executed, then a modal displays all attribute–value pairs that would be written to Dataverse, without creating any Dataverse records.
- **Dependencies:** FR-003 (linting should run in preview context); FR-006 (conditional-required rules should be evaluated in preview)
- **Overlaps:** None

---

## 6. Non-Functional Requirements

**NFR-001: Designer Performance at Scale**
- The designer canvas must render and remain interactive for forms with up to 200 fields and 100 rules. Drag-drop reorder operations must complete within 200ms. Initial designer load for a 200-field form must not exceed 3 seconds on a standard enterprise laptop (Chrome 120+, 8GB RAM, standard broadband).

**NFR-002: API Response Time**
- All designer save operations (single field, mapping, translation update) must receive a Dataverse confirmation within 2 seconds under normal network conditions (< 50ms round-trip to org). Linting (FR-003) must complete within 2 seconds for forms up to 100 fields and 50 rules.

**NFR-003: Concurrent User Load**
- The platform must support 50 simultaneous designer sessions without degradation, measured by the Dataverse org's standard API throttle limits. Presence-heartbeat polling (FR-002) must not cause API throttle violations under 50 concurrent sessions.

**NFR-004: Accessibility**
- The DFE designer UI must meet WCAG 2.1 AA at the keyboard interaction layer (all authoring actions reachable by keyboard). Rendered forms must meet WCAG 2.1 AA fully (contrast, focus management, screen-reader labeling, form landmark structure). Compliance must be verified by an automated scan (axe-core or equivalent) with zero AA violations, plus a manual keyboard walkthrough.

**NFR-005: Security**
- All form bundle exports (FR-014) must be signed with a SHA-256 checksum. Import must reject bundles whose checksum does not match the payload. Designer-side RBAC (ENT-002) must enforce access checks server-side; client-side enforcement alone is not acceptable. Audit log records (ENT-005) must be append-only; no UPDATE or DELETE is permitted on audit entities.

**NFR-006: Translation File Formats**
- XLIFF 2.0 export must be valid per the OASIS XLIFF 2.0 specification. CSV export must use UTF-8 encoding with BOM for Excel compatibility. Import must handle both formats. Round-trip fidelity: export then re-import of the same file must produce zero changes to the form's translation data.

---

## 7. Enterprise Requirements

Enterprise requirements are organized into six themes: Governance, Security / Compliance, ALM, Observability, Accessibility, and Scale.

### Theme 1 — Governance

**ENT-001: Maker-Checker Approval Workflow for Publish**
- **Title:** Two-stage approval before a form becomes live
- **Description:** The publish action must be gated by a two-stage maker-checker workflow, adopting the same pattern implemented in EDP-BRE-001 (`qdb_edp_RuleGovernanceAction`). Stage 1 (Maker): the form author submits a publish request including a mandatory change description. Stage 2 (Checker): a designated approver (per-form or org-wide, configurable via ENT-002 RBAC) reviews the pending publish request, views the diff against the current live version (FR-004), and either approves or rejects with a mandatory rejection comment. On approval, the publish pipeline runs automatically. On rejection, the author is notified with the rejection comment. Self-approval (same user submits and approves) must be blocked.
- **Business rationale:** Currently any user with designer access can publish directly to the live render cache. This bypasses QDB's change-management process. EDP-BRE-001 has demonstrated that two-stage approval is both feasible and accepted by QDB stakeholders for comparable governance scenarios.
- **MoSCoW:** Must Have
- **Effort:** L
- **Acceptance criteria:**
  - Given a form author clicks "Request Publish", then the form enters "Pending Approval" status and the publish pipeline does not run.
  - Given the same user who submitted the request attempts to approve it, then the system rejects the self-approval with an error message.
  - Given a designated approver approves the request, then the publish pipeline runs within 30 seconds and the form becomes live.
  - Given the approver rejects with the comment "Missing Arabic translations for new fields", then the author receives an in-designer notification containing the full rejection comment.
- **Dependencies:** ENT-002 (RBAC must define who is a designated approver); FR-004 (approver must be able to view diff)
- **Overlaps:** None

**ENT-002: Designer-Side RBAC**
- **Title:** Per-form ownership, role-based edit/publish rights, and field-level edit restrictions
- **Description:** A new Dataverse entity `qdb_dfe_form_access` must store per-form permission assignments. Roles defined: (a) Form Owner — full edit and publish-request rights on their assigned forms; (b) Form Editor — structural edits (add/remove/reorder fields, tabs, sections) on assigned forms, no publish-request right; (c) Form Translator — language-scoped translation edits only, no structural edit or publish right (see FR-013); (d) Form Approver — approve/reject publish requests for assigned forms, no structural edit right; (e) Form Viewer — read-only designer access. Platform Administrators retain all rights on all forms. Assignments can be per-form or per-form-group (forms sharing the same tag). The existing access policies entity governs who may fill a form at runtime; the new entity governs who may design and publish a form.
- **Business rationale:** Today any Dataverse user with the "DFE Designer" security role can edit any form and publish it directly. QDB's IT governance requires per-form ownership so that the HR forms team cannot accidentally modify the Loan team's forms, and vice versa.
- **MoSCoW:** Must Have
- **Effort:** L
- **Acceptance criteria:**
  - Given User A is a Form Editor on "Loan Application" and not assigned to "HR Onboarding", when User A opens the designer and selects "HR Onboarding", then the form opens in read-only (Form Viewer) mode.
  - Given User B is a Form Translator for Arabic on "Loan Application", when User B opens the translation panel, then only the Arabic column is editable; the English column and all structural controls are disabled.
  - Given User C is a Form Approver on "Loan Application", when User C views the publish-request queue, then they can approve or reject the request but cannot edit any field on the form.
- **Dependencies:** Must be implemented before ENT-001 (approval workflow requires knowing who the approvers are)
- **Overlaps:** None

### Theme 2 — Security and Compliance

**ENT-003: Field-Level PII Classification and Data Sensitivity Labeling**
- **Title:** Tag fields with PII category, sensitivity level, retention policy, and consent requirement
- **Description:** The Field Properties panel must include a "Data Governance" section with the following configurable attributes: (a) PII Category — dropdown (None / Name / Government ID / Contact / Financial / Health / Other); (b) Sensitivity Level — dropdown (Public / Internal / Confidential / Restricted); (c) Retention Period — number + unit (days / months / years); (d) Consent Required — boolean toggle; (e) Consent Text — rich-text field shown to the end-user alongside the field when consent is required. These metadata attributes must be stored on the field entity record and included in the form bundle export (FR-014). A publish-validation gate rule must warn (not block) when a field has PII Category set but Sensitivity Level is "Public".
- **Business rationale:** QDB is subject to Qatar's PDPPL (Personal Data Protection and Privacy Law) and internal data governance policies. Field-level PII classification at design time is the prerequisite for downstream data masking, access control, and audit-trail filtering. Without this metadata, each form must be manually reviewed for compliance, creating a bottleneck.
- **MoSCoW:** Should Have
- **Effort:** M
- **Acceptance criteria:**
  - Given a text field, when the user opens the Data Governance section and sets PII Category = "Government ID" and Sensitivity Level = "Restricted", then these values are saved to the field entity record and appear correctly after a page reload.
  - Given a field with PII Category = "Financial" and Sensitivity Level = "Public", when linting runs, then a publish warning is raised: "Field [name] is classified as Financial PII but has Public sensitivity — verify classification."
  - Given a form bundle export (FR-014), when the exported JSON is inspected, then every field record includes the `piiCategory`, `sensitivityLevel`, `retentionPeriod`, and `consentRequired` attributes.
- **Dependencies:** FR-014 (export must carry this metadata); FR-003 (linting gate must check PII/sensitivity inconsistency)
- **Overlaps:** None

**ENT-004: Dev-to-Test-to-Prod Form Promotion Pipeline**
- **Title:** Promote a single form and all its dependencies across environments atomically
- **Description:** Building on FR-014 (form bundle), the designer must provide a "Promote" workflow that: (a) exports the current published version of a form (plus theme, rules, mappings, translations) as a bundle; (b) authenticates to a pre-configured target environment (stored in a Dataverse configuration entity, not hardcoded); (c) imports the bundle to the target environment in the same atomic manner as FR-014 import; (d) records the promotion event in both the source and target audit logs (ENT-005); (e) enforces that a form can only be promoted from a lower environment to a higher environment (dev → test, test → prod) as defined in the environment topology configuration; (f) requires ENT-001 approval on the target environment before the promoted form goes live.
- **Business rationale:** QDB operates a three-environment topology. Without a promotion pipeline, moving a form requires solution-level export/import, which bundles unrelated components and creates change-management risk. An atomic form-promotion capability is the minimum ALM control required before QDB can commit to the platform for production loan intake.
- **MoSCoW:** Should Have
- **Effort:** L
- **Acceptance criteria:**
  - Given "Loan Application v3" is approved in the dev environment, when a Form Owner initiates promotion to test, then the system exports the form bundle, authenticates to the test org, imports the bundle, and enters the test-org approval queue without manual file download/upload.
  - Given the user attempts to promote directly from dev to prod (skipping test), then the system rejects the promotion with an error: "Direct dev-to-prod promotion is not permitted by the environment topology configuration."
  - Given the promotion import succeeds, then the test org's audit log records: promoted by, source org URL, bundle checksum, form version number.
- **Dependencies:** FR-014 (form bundle is the transport); ENT-001 (approval gate on target env); ENT-002 (Form Owner role needed)
- **Overlaps:** None

**ENT-005: Audit Log Field-Level Change History and Append-Only Verification**
- **Title:** Record field-level before/after change history; verify append-only tamper-evidence
- **Description:** (a) The audit log must record field-level changes: for each save operation, one audit record per modified field must be written containing the field schema name, the before value, and the after value. "Before value" and "after value" must be serialized as JSON for complex properties (validation rules, mapping config). (b) The audit log entity must be verified as append-only: no UPDATE or DELETE permissions must exist on the entity for any role other than System Administrator (and System Administrator must be removed from the entity's UPDATE/DELETE as a formal configuration). (c) A quarterly compliance report must be exportable from the designer showing all changes to a specified form within a date range, grouped by user, with timestamps.
- **Business rationale:** The current audit log records actions but not field-level before/after values. A compliance review cannot determine what a field looked like before an unauthorized change. Append-only verification is required by QDB's internal audit policy for any data-governance-relevant log.
- **MoSCoW:** Must Have
- **Effort:** M
- **Acceptance criteria:**
  - Given a user changes the validation rule on "Loan Amount" from "Required" to "Optional", when the audit log is queried, then one audit record exists with `field: "loan_amount"`, `before: { required: true }`, `after: { required: false }`, and the editor's user ID and timestamp.
  - Given the audit entity's Dataverse security configuration is inspected, then no custom security role has UPDATE or DELETE privilege on the audit entity.
  - Given the compliance report UI is opened and a date range of 30 days is selected for "Loan Application", then a downloadable CSV is produced within 10 seconds listing all field-level changes in chronological order.
- **Dependencies:** None
- **Overlaps:** None

### Theme 3 — ALM

*(ENT-004 above covers the primary ALM requirement. The following captures the backup/DR strategy.)*

**ENT-006: Backup and Disaster Recovery Strategy for Form Definitions**
- **Title:** Define and implement a recoverable backup strategy beyond in-platform version snapshots
- **Description:** In addition to the version-history snapshots stored in Dataverse, a scheduled export must produce daily form-bundle JSON files (FR-014 format) for all published forms and store them in Azure Blob Storage (or an equivalent configured destination). Retention must be configurable (default 90 days). A manual "restore from backup" option must be available in the designer for a Platform Administrator to import a backup bundle. The backup job must log success/failure to the audit log (ENT-005).
- **Business rationale:** Dataverse organization deletion or corruption, while rare, would destroy all version history alongside live data. QDB's DR policy requires recoverable backups stored outside the primary Dataverse environment with a documented RPO of 24 hours.
- **MoSCoW:** Won't Have (this phase — strategy document produced; implementation deferred to a dedicated DR engagement)
- **Effort:** M
- **Acceptance criteria (for strategy document this phase):**
  - A written DR strategy document is produced covering: backup schedule, storage destination, retention period, restore procedure, and RPO/RTO targets.
  - The strategy is approved by QDB IT Director before the implementation phase begins.
- **Dependencies:** FR-014 (form bundle format is the backup format)
- **Overlaps:** None

### Theme 4 — Observability

**ENT-007: Form Usage Telemetry, Submit-Error Monitoring, and Drop-Off Analytics**
- **Title:** Capture and display form runtime usage metrics in the designer
- **Description:** The runtime must emit structured telemetry events for: (a) form open, (b) step navigation (step-by-step forms), (c) field focus, (d) form submit attempt, (e) submit validation failure (including which fields failed), (f) form submit success, (g) form abandonment (session ended without submit). These events must be stored in a Dataverse entity `qdb_dfe_telemetry` (or forwarded to Azure Application Insights if configured). The designer must include an "Analytics" panel showing, per form: total submissions, submission success rate, average completion time, most-failed validation fields, and drop-off step distribution (for multi-step forms). The analytics panel must respect the ENT-002 RBAC model (Form Viewers and Editors can view analytics for their assigned forms; Form Owners can export them as CSV).
- **Business rationale:** QDB currently has no visibility into how end-users interact with forms in production. High drop-off rates on specific steps or frequent validation failures on specific fields are invisible without telemetry. Data-driven form redesign is not possible without this foundation.
- **MoSCoW:** Could Have
- **Effort:** L
- **Acceptance criteria:**
  - Given a form is submitted successfully by an end-user, then within 30 seconds a telemetry record exists in `qdb_dfe_telemetry` with event type "submit_success", form ID, session ID, and timestamp.
  - Given the designer analytics panel for "Loan Application", when viewed by a Form Owner, then the panel displays: total submissions (last 30 days), success rate percentage, average completion time in minutes, and the top 3 fields by validation failure count.
  - Given a Form Viewer opens the analytics panel, then data is readable but the CSV export button is disabled.
- **Dependencies:** ENT-002 (analytics panel access follows RBAC)
- **Overlaps:** None

### Theme 5 — Accessibility

**ENT-008: WCAG 2.1 AA Certification for Rendered Forms**
- **Title:** Certify all DFE-rendered forms against WCAG 2.1 AA
- **Description:** A formal accessibility audit must be conducted against the DFE runtime rendering of a representative form set (at minimum: a single-step form, a multi-step form, and an RTL Arabic form). The audit must cover: color contrast (minimum 4.5:1 for normal text, 3:1 for large text), keyboard focus management (logical tab order, visible focus indicators), screen-reader labeling (ARIA roles, labels, error announcements), form landmark structure, and timeout/session management. All AA-level failures must be remediated in the runtime before any new QDB form is deployed to a public-facing portal. A re-audit must confirm zero AA failures before certification is declared.
- **Business rationale:** QDB's digital services are public-sector-facing and subject to Qatar E-Government Accessibility Standards, which align to WCAG 2.1 AA. Non-compliance creates both legal exposure and reputational risk for QDB. This is classified as a blocker for public portal deployment.
- **MoSCoW:** Must Have
- **Effort:** XL
- **Acceptance criteria:**
  - Given an axe-core automated scan of a rendered DFE form, then zero WCAG 2.1 AA violations are reported.
  - Given a manual keyboard walkthrough of a multi-step form, then every interactive element is reachable and operable using keyboard alone, with visible focus indicators at all times.
  - Given a screen reader (NVDA or Jaws on Windows; VoiceOver on macOS) navigates a rendered form, then all field labels, error messages, and step indicators are announced correctly.
  - Given a formal accessibility audit report is produced, then it documents pass/fail status for each WCAG 2.1 AA criterion tested and is signed off by QDB's accessibility designee.
- **Dependencies:** NFR-004; FR-009 (keyboard reordering must not introduce new accessibility regressions)
- **Overlaps:** FLAGGED — DFE-STYLE-001 (advanced visual styling) affects color tokens and contrast ratios. WCAG contrast remediation must be coordinated with STYLE-001 theme-token work to avoid conflict. If STYLE-001 resumes before this engagement's accessibility phase, contrast-specific items should be resolved within STYLE-001.

### Theme 6 — Scale

**ENT-009: Localization Governance**
- **Title:** Enforce translation completeness, RTL correctness, and translator workflow
- **Description:** (a) Completeness: the publish-validation gate must enforce minimum completeness thresholds per language (configurable per-org, default 100% for all enabled languages) as specified in FR-013. (b) RTL correctness: a designer-side RTL preview mode must be available that renders the form in RTL layout for any RTL language (Arabic, Urdu) without requiring a portal preview. The RTL preview must highlight any elements whose layout appears broken in RTL mode (e.g., icon alignment, button placement). (c) Translator workflow: Form Translators (ENT-002 role) receive an in-designer task notification when new fields are added to a form, listing the new fields and their missing translations. (d) A per-language completeness dashboard is accessible to Localization Managers showing all forms and their completeness percentage per language.
- **Business rationale:** QDB currently has no enforcement mechanism for translation completeness before publish. Arabic forms have been published in the past with untranslated English strings appearing in RTL context, creating a poor user experience and a compliance finding in a recent accessibility audit.
- **MoSCoW:** Should Have
- **Effort:** M
- **Acceptance criteria:**
  - Given a form has Arabic completeness at 85% and the org threshold is 100%, when publish is attempted, then the gate blocks with: "Arabic translation is 85% complete (threshold: 100%)."
  - Given the RTL preview mode is activated, then the form renders right-to-left and any element whose visual alignment appears to violate RTL directionality is flagged with a yellow border.
  - Given a Form Translator for Arabic receives a task notification, then it identifies each new field schema name and the English label that requires translation.
- **Dependencies:** FR-013 (translation completeness infrastructure); ENT-002 (translator role definition)
- **Overlaps:** None

**ENT-010: Scale Limits Documentation and Large-Form Performance**
- **Title:** Define and enforce stated capacity limits; eliminate large-form editor performance degradation
- **Description:** (a) The platform must publish explicit documented limits: maximum 200 fields per form, maximum 50 business rules, maximum 20 sections per tab, maximum 10 tabs, maximum 5 nesting levels for conditional sections. These limits must be enforced by the designer (a warning at 80% of limit, an error block at 100%). (b) The designer canvas must be profiled and optimized for the 200-field upper limit. Virtualized rendering of the field list must be implemented if profiling shows a render time exceeding 200ms for 100+ field forms. The optimization must be validated by a benchmark: load time under 3 seconds (NFR-001), reorder within 200ms (NFR-001).
- **Business rationale:** Without stated limits, QDB form authors have no guidance and have attempted forms with 300+ fields (anecdotally reported), causing designer freezes. Stated limits channel authors toward form-splitting best practices while giving the engineering team a defined performance target.
- **MoSCoW:** Could Have
- **Effort:** M
- **Acceptance criteria:**
  - Given a form with 160 fields (80% of the 200-field limit), when the user attempts to add another field, then a yellow warning banner appears: "You have 40 fields remaining before the form limit is reached."
  - Given a form at exactly 200 fields, when the user attempts to add a 201st field, then the add action is blocked with an error.
  - Given a benchmark test of a 200-field form, then the designer loads the form to interactive state in under 3 seconds and a field drag-reorder completes in under 200ms.
- **Dependencies:** FR-009 (keyboard reordering and virtualization work overlaps)
- **Overlaps:** None

**ENT-011: Integration Governance Registry**
- **Title:** Governed registry of external connectors and integration endpoints referenced in form definitions
- **Description:** A `qdb_dfe_integration_registry` entity must store all external integration endpoints (Power Automate flow IDs, webhook URLs, external API connectors) referenced by any form. Each registry entry must have an owner, an environment classification (dev/test/prod), an approval status, and a last-tested timestamp. The designer must reference integration endpoints from the registry rather than accepting free-text flow IDs or URLs directly. New registry entries must go through the ENT-001 approval flow before being usable in forms.
- **Business rationale:** The current form schema supports a Power Automate `flowId` field as a free-text string, allowing any URL or flow ID to be entered without review. This creates a governance gap where untested or unapproved flows can be triggered by form submissions in production.
- **MoSCoW:** Won't Have (this phase — deferred to a dedicated integration-governance engagement)
- **Effort:** L
- **Acceptance criteria (deferred):** Defined at engagement initiation of the integration-governance engagement.
- **Dependencies:** ENT-001 (approval workflow to gate registry entries)
- **Overlaps:** None

---

## 8. User Stories

**US-01 — Concurrent Edit Warning**
- **Priority:** Must Have
- As a QDB form administrator, I want to see a banner when another editor has the same form open, so that I am aware of the risk of overwriting their work before I begin editing.
- Given I open a form that User B already has open, when the presence check completes (within 5 seconds), then I see: "This form is also open by [User B display name] since [HH:MM]. Editing simultaneously may cause conflicts."

**US-02 — Publish Conflict Error**
- **Priority:** Must Have
- As a QDB form administrator, I want to receive a clear error when my save would overwrite another editor's changes, so that I can choose how to resolve the conflict rather than silently losing data.
- Given User B saved the form after I opened it, when I attempt to save, then I see a conflict resolution dialog with User B's name, the time of their save, and options to reload or view conflict details.

**US-03 — Linting Error Before Publish**
- **Priority:** Must Have
- As a QDB form administrator, I want the designer to warn me of orphaned rules and duplicate schema names before I publish, so that end-users never encounter a broken form caused by a configuration error I could have fixed.
- Given a form with a business rule referencing a deleted field, when I click "Publish", then the linting pass runs first and the publish gate shows a blocking error before the publish pipeline starts.

**US-04 — Version Comparison**
- **Priority:** Should Have
- As a QDB form administrator, I want to compare any two saved versions of a form side-by-side, so that I can understand exactly what changed between them before deciding whether to restore an older version.
- Given versions 3 and 7 of "Loan Application" exist, when I select both and click "Compare", then a two-column diff view shows all field-level additions, removals, and changes between them.

**US-05 — Conditional Required**
- **Priority:** Must Have
- As a QDB business analyst, I want to mark a field as required only when another field has a specific value, so that the form enforces the correct completeness rules for each loan type without requiring authors to duplicate the form.
- Given a conditional-required rule for "Guarantor Name" when "Loan Type = Secured", when a borrower submits with Loan Type = Secured but no Guarantor Name, then an inline validation error appears on the Guarantor Name field.

**US-06 — Cross-Field Validation**
- **Priority:** Must Have
- As a QDB business analyst, I want to configure a validation rule that compares two date fields, so that borrowers cannot submit a form with an end date before the start date.
- Given a cross-field rule "Facility End Date must be after Facility Start Date", when a borrower enters End Date before Start Date and submits, then the configured error message appears on the End Date field.

**US-07 — Maker-Checker Approval**
- **Priority:** Must Have
- As a QDB compliance officer, I want all form publications to require a second-party approval, so that no form reaches end-users without a documented review decision.
- Given I am a Form Approver for "Trade Finance Application", when a Form Owner submits a publish request, then I receive a notification in the designer; I can view the diff, and approve or reject with a mandatory comment.

**US-08 — Designer RBAC**
- **Priority:** Must Have
- As a QDB IT administrator, I want to assign specific users as editors or translators for specific forms only, so that cross-team form modification is prevented without revoking all designer access.
- Given I am an IT administrator, when I assign User X as a Form Editor only for "SME Loan Application", then User X can edit that form's structure but opens "HR Onboarding" in read-only mode.

**US-09 — PII Tagging**
- **Priority:** Should Have
- As a QDB data governance officer, I want to classify each form field with a PII category and sensitivity label, so that downstream masking, retention, and audit controls can be applied automatically based on design-time metadata.
- Given "National ID" is tagged as PII Category = "Government ID" and Sensitivity = "Restricted", when the form bundle is exported, then the exported JSON includes those classification attributes on the field record.

**US-10 — Form Promotion**
- **Priority:** Should Have
- As a QDB IT administrator, I want to promote a single approved form from the dev environment to the test environment without exporting the entire DFE solution, so that unrelated forms are not affected by the deployment.
- Given "Trade Finance Application" is approved in dev, when I click "Promote to Test", then the system transfers the form bundle to the test org, triggers the test-org approval queue, and logs the promotion in both orgs' audit logs.

**US-11 — Audit Field-Level History**
- **Priority:** Must Have
- As a QDB internal auditor, I want to see what value a field's validation rule had before it was changed, so that I can verify that the change was authorized and understand the impact.
- Given a validation rule on "Loan Amount" was changed, when I view the audit log for that form and filter by field "loan_amount", then I see the before and after JSON of the rule change, the editor's name, and the timestamp.

**US-12 — Translation Completeness Gate**
- **Priority:** Should Have
- As a QDB localization manager, I want the designer to block publish when any configured language is below 100% translation completeness, so that bilingual users never see untranslated content on a published form.
- Given Arabic completeness is at 90% for "Visa Application Form", when the Form Owner submits a publish request, then the request is blocked at the validation gate with a list of untranslated Arabic strings.

**US-13 — Bulk XLIFF Export**
- **Priority:** Should Have
- As a QDB localization manager, I want to export all translations for a form in XLIFF 2.0 format, so that I can send the file to an external translation agency and import the completed translations without manual re-entry.
- Given a form with 200 translatable strings, when I click "Export Translations" and select XLIFF 2.0, then a valid XLIFF 2.0 file is downloaded within 5 seconds.

**US-14 — Test Submit**
- **Priority:** Should Have
- As a QDB form administrator, I want to run a simulated form submission with test data and see what would be written to Dataverse, so that I can verify that my submission mappings are correct before publishing the form to users.
- Given I am in preview mode with test data loaded, when I click "Test Submit", then a read-only modal shows all Dataverse attribute-value pairs that would be written, without creating any actual records.

**US-15 — WCAG Compliance**
- **Priority:** Must Have
- As a QDB accessibility officer, I want confirmation that all DFE-rendered forms meet WCAG 2.1 AA, so that QDB's public-sector digital services obligations are demonstrably satisfied before portal launch.
- Given the accessibility audit is complete and zero AA violations are found, then a signed-off compliance report is produced and stored in the project's governance documentation.

---

## 9. Data Requirements

| Entity                      | Estimated Volume         | Retention     | Sensitivity   | Notes                                                        |
|-----------------------------|--------------------------|---------------|---------------|--------------------------------------------------------------|
| Form Definition             | ~500 forms               | Permanent     | Internal      | Existing entity; enhanced with ENT-003 PII metadata          |
| Form Version History        | ~10 versions/form = 5K   | 2 years       | Internal      | Existing entity                                              |
| Form Audit Log              | ~200 entries/form/month  | 7 years       | Confidential  | Enhanced with field-level before/after (ENT-005)             |
| Form Access (RBAC)          | ~50 records/form         | Permanent     | Internal      | New entity `qdb_dfe_form_access` (ENT-002)                   |
| Field Template Library      | ~200 templates           | Permanent     | Internal      | New entity `qdb_dfe_template` (FR-008)                       |
| Approval Workflow Requests  | ~100 requests/month      | 2 years       | Confidential  | New entity, pattern from EDP-BRE-001 (ENT-001)               |
| Form Telemetry              | ~10K events/form/month   | 1 year        | Internal      | New entity `qdb_dfe_telemetry` (ENT-007)                     |
| Edit-Session Presence       | Transient, ~10 active    | Session only  | Internal      | Heartbeat record; TTL 90 seconds (FR-002)                    |
| Integration Registry        | ~50 entries (future)     | Permanent     | Confidential  | Deferred to ENT-011 — won't have this phase                  |
| Form Bundle (export files)  | ~2MB/bundle average      | 90 days (DR)  | Confidential  | Azure Blob or equivalent (ENT-006)                           |
| Translation Files (XLIFF)   | ~500KB/language/form     | 1 year        | Internal      | Produced by FR-013 export; stored externally by localization team |

---

## 10. Integration Dependencies

| System                    | Integration Type          | Data Exchanged                              | Direction       |
|---------------------------|---------------------------|----------------------------------------------|-----------------|
| Dataverse (org5869857f)   | Dataverse Web API (OData) | Form definitions, versions, audit log, RBAC  | Bidirectional   |
| Dataverse Metadata API    | Web API `$metadata`        | Entity/attribute schema for linting (FR-003) | Read (designer → Dataverse) |
| EDP-BRE-001 (pattern ref) | Design pattern only        | Approval workflow pattern (ENT-001)          | None (code pattern reference) |
| Azure Blob Storage        | REST / Azure SDK           | Daily form bundle backups (ENT-006)          | Write (backend → Blob) |
| Azure Application Insights| SDK telemetry              | Form usage events (ENT-007, optional)        | Write (runtime → AppInsights) |
| XLIFF / CSV files         | File import/export         | Translation strings (FR-013)                | Bidirectional   |
| Power Automate (future)   | Dataverse connector        | Integration registry entries (ENT-011)      | Deferred        |

---

## 11. Assumptions

1. The Dataverse organization `org5869857f` supports the `@odata.etag` / `If-Match` optimistic-concurrency pattern on all custom entities used by the DFE.
2. QDB has a three-environment topology (dev / test / prod). Environment URLs and service-principal credentials for each environment will be provided by QDB IT Director before the ENT-004 architecture phase.
3. The EDP-BRE-001 approval workflow implementation (C# plugin + React UI) can be adapted for the DFE publish workflow with moderate effort; a new approval entity will be required rather than reusing EDP entities directly.
4. QDB will designate a minimum of two named Form Approvers per form group before the ENT-001 go-live gate, to satisfy the self-approval prohibition.
5. The existing `qdb_dfe_audit_log` entity (or equivalent) does not currently have append-only enforcement in Dataverse security roles; this is a gap to be remediated, not an assumed-existing control.
6. XLIFF 2.0 is acceptable to QDB's external translation vendors; this assumption must be confirmed by the QDB Localization Manager before FR-013 architecture begins.
7. Azure Blob Storage is available in QDB's Azure subscription for ENT-006 backup storage; no new Azure subscription is required.
8. The DFE frontend (React 18 + dnd-kit) can be upgraded or patched to resolve the drag-drop text-selection and freeze defects (FR-009) without a full framework replacement.
9. Calculated/derived fields (FR-005, Could Have) are listed as a future capability and are NOT in scope for any delivery phase in this BRD unless the CEO explicitly approves scope expansion.
10. This BRD does not authorize any changes to the DFE runtime rendering engine. Any runtime changes identified as required by accessibility remediation (ENT-008) will be handled as sub-tasks within the ENT-008 work item, not as standalone runtime engagements.

---

## 12. Constraints

1. **Dataverse platform:** All new entities must follow the `qdb_dfe_` prefix convention. Field-level before/after values in the audit log must not exceed the Dataverse attribute size limit (the JSON serialization of a complex rule must be stored as a multi-line text field, not a note/attachment, to remain queryable).
2. **No runtime scope creep:** This BRD authorizes changes to the designer (web resource) and backend C# plugins only. The runtime rendering HTML web resource is out of scope except for WCAG 2.1 AA accessibility remediation (ENT-008) and telemetry event emission (ENT-007), which are explicitly authorized.
3. **DFE-STYLE-001 coordination:** Two items in this BRD (FR-009 keyboard interactions, FR-012 panel overflow) overlap with the paused DFE-STYLE-001 engagement. If STYLE-001 resumes before this engagement's Phase 1 build, the architect must reconcile scope at the architecture gate to avoid duplicate implementation.
4. **EDP-BRE-001 independence:** The ENT-001 approval workflow must use new Dataverse entities. It must not depend on EDP-BRE-001 entities at the data layer; it may reference the EDP implementation as a code and UX pattern only.
5. **Timeline:** No delivery timeline has been set by the CEO. Timeline is explicitly an open question (see Section 14). No architecture or build may begin until the CEO approves this BRD and a phased delivery timeline is agreed.
6. **Security roles:** Any new Dataverse security role created for designer RBAC (ENT-002) must follow QDB's principle of least privilege. No new role may include Dataverse System Administrator equivalent privileges.
7. **Calculated fields (FR-005, Could Have):** This item requires an expression engine not currently present in the DFE. If approved, it will require a dedicated sub-BRD or BRD amendment due to the scope of the expression-engine dependency.

---

## 13. Risks and Open Questions

| Risk / Question                                                                                      | Impact                                                           | Owner              | Resolution Needed By     |
|------------------------------------------------------------------------------------------------------|------------------------------------------------------------------|--------------------|--------------------------|
| R-001: DFE-STYLE-001 resumes and overlaps FR-009 / FR-012 without coordination, causing rework      | Wasted frontend effort; conflicting implementations              | Maqsad AI Architect| Before Phase 1 build     |
| R-002: Dataverse etag not supported on all DFE entities, blocking FR-001 optimistic concurrency     | Concurrency feature blocked or requires workaround               | Maqsad AI Backend  | Architecture gate        |
| R-003: QDB IT Director cannot commit to environment topology for ENT-004 before architecture        | Form promotion pipeline cannot be designed                       | QDB IT Director    | Before Phase 3 BRD gate  |
| R-004: Two named Form Approvers not designated before ENT-001 go-live, blocking self-approval check | Maker-checker feature cannot go live                             | QDB IT Director    | Before Phase 2 go-live   |
| R-005: WCAG 2.1 AA audit reveals deep runtime rendering issues requiring extensive remediation (XL+) | Phase budget and timeline materially exceed estimate              | Maqsad AI Frontend | After Phase 1 accessibility audit |
| R-006: External translation vendor does not accept XLIFF 2.0 (Assumption 6 is incorrect)            | FR-013 export format must be redesigned                          | QDB Localization Mgr | Before FR-013 architecture |
| R-007: EDP-BRE-001 approval pattern requires significant adaptation for form-context, increasing ENT-001 effort | ENT-001 effort grows from L to XL                        | Maqsad AI Architect| Architecture gate        |
| OQ-001: What is QDB's target WCAG conformance level — AA or AAA — and which assistive technology platforms must be formally tested? | ENT-008 scope and effort depend on this answer     | QDB Accessibility Officer | Before Phase 1  |
| OQ-002: Which languages beyond English and Arabic does QDB plan to support in the next 12 months, and are there RTL languages beyond Arabic in scope? | FR-013 and ENT-009 scope depend on this            | QDB Localization Mgr | Before Phase 3     |
| OQ-003: Who are the designated Form Approvers in QDB and what is the escalation path if an approver is unavailable for >5 business days? | ENT-001 workflow design depends on this            | QDB Compliance Officer | Before Phase 2  |
| OQ-004: What is the three-environment topology URL structure, and will service-principal credentials be provided for automated promotion? | ENT-004 cannot be architected without this       | QDB IT Director    | Before Phase 3          |
| OQ-005: Does QDB's internal data governance policy specify a maximum PII field retention period, or must the designer allow free-form input? | ENT-003 retention field design depends on this  | QDB Legal / Data Governance | Before Phase 2 |
| OQ-006: What is the acceptable RPO and RTO for form definitions under QDB's DR policy?               | ENT-006 strategy document cannot be finalized without this       | QDB IT Director    | Before Phase 3          |
| OQ-007: Does QDB want telemetry stored in Dataverse (on-platform) or forwarded to Azure Application Insights (external observability platform)? | ENT-007 architecture path differs significantly | QDB IT Director / Platform Ops | Before Phase 4 |
| OQ-008: Is a delivery timeline constraint imposed by QDB (e.g., public portal launch date), and does it force phase prioritization changes? | May require resequencing phases or descoping Could Have items  | QDB CEO / IT Director | Before CEO BRD approval |

---

## 14. Cross-Cutting Dependencies and Sequencing

The following sequencing constraints apply regardless of phasing:

1. **ENT-002 (Designer RBAC) must precede ENT-001 (Approval Workflow):** The approval workflow requires a definition of who is a Form Approver. RBAC provides this definition.
2. **ENT-002 (Designer RBAC) must precede FR-013 (Translator role):** The translator role is a named role within the RBAC model.
3. **FR-001 and FR-002 (Concurrency) should be the first items delivered in Phase 1:** They are pure safety controls with no dependencies. Shipping them early eliminates ongoing production risk.
4. **FR-003 (Linting) must precede ENT-001 (Approval):** The approver's diff view (FR-004) and the publish gate both depend on linting being available to block structurally invalid submissions.
5. **FR-004 (Version Diff) must precede ENT-001 (Approval):** The approver must be able to view the diff between the current live version and the pending publication version to make an informed approval decision.
6. **FR-014 (Form Bundle) must precede ENT-004 (Form Promotion):** Promotion uses the bundle format as its transport.
7. **ENT-005 (Audit log enhancement) must precede ENT-006 (DR strategy):** The DR strategy document depends on knowing what audit data exists and whether it is tamper-evident before DR scope can be finalized.
8. **ENT-008 (WCAG) is a continuous obligation:** An accessibility audit should be run at the end of every phase, not only in the final phase, to prevent accumulation of accessibility debt.

---

## 15. Recommended Phasing

### Phase 1 — Hardening and Authoring Integrity
**Items:** FR-001, FR-002, FR-003, FR-005, FR-006, FR-007, FR-009, FR-010, FR-012, ENT-005, ENT-008 (initial audit), ENT-010
**Rationale:** Fix what is fragile or broken before adding governance layers on top. The concurrent-edit defect and linting gaps are present in production today. Accessibility audit must start in Phase 1 so remediation is not blocked by late discovery. Scale limits enable safe usage guidance immediately.

### Phase 2 — Governance and RBAC
**Items:** ENT-001, ENT-002, ENT-003, ENT-009, FR-013 (completeness gate only)
**Rationale:** RBAC and maker-checker approval are the highest-value enterprise controls for QDB's compliance posture. They unlock the platform for regulated use cases (loan intake, citizen services). PII classification (ENT-003) is included here because it is required by the compliance officers who will be enrolled as approvers. Localization completeness gate (FR-013 partial) ships with the publish workflow.

### Phase 3 — Localization and ALM
**Items:** FR-004, FR-013 (full — multi-language + import/export), FR-014, ENT-004, ENT-006 (strategy document), ENT-009 (full translator workflow)
**Rationale:** Form portability and localization tooling are the next natural expansion once governance controls are in place. The form-promotion pipeline (ENT-004) depends on the form bundle (FR-014). Version diff (FR-004) is placed here because it is a prerequisite for ENT-004 (approvers on the target environment need diff to review incoming promotions).

### Phase 4 — Analytics, Scale, and Power Features
**Items:** FR-008, FR-011, FR-015, ENT-007, ENT-010 (performance optimization if not complete in Phase 1)
**Rationale:** Reuse templates, bulk operations, and test-submit are productivity enhancements that deliver incremental value but carry no compliance urgency. Observability (ENT-007) requires a period of production operation before the telemetry data is meaningful. Calculated fields (FR-005, Could Have) and integration registry (ENT-011, Won't Have) are deferred beyond Phase 4 pending a dedicated engagement approval.

---

## 16. Glossary

| Term                      | Definition                                                                                                              |
|---------------------------|-------------------------------------------------------------------------------------------------------------------------|
| DFE                       | Dynamic Form Engine — the Maqsad AI platform for configuring and rendering multi-step Dataverse-backed forms            |
| Designer                  | The React 18 / Fluent UI v9 web resource used by QDB form administrators to author forms                               |
| Runtime                   | The HTML web resource that renders published forms to end-users                                                         |
| Render Cache              | The Dataverse entity storing the pre-compiled form definition that the runtime reads, written by a C# publish plugin    |
| Maker-Checker             | A two-stage approval pattern: the maker creates/submits a change; an independent checker approves or rejects it        |
| EDP-BRE-001               | The Enterprise Decision Platform / Business Rules Engine engagement, which implemented maker-checker in DFE's sister platform |
| Optimistic Concurrency    | A data-integrity pattern where saves include the last-known version tag (etag); the server rejects saves if the record was modified since the editor loaded it |
| Linting                   | Static analysis of a form's configuration to detect structural errors before publish                                    |
| RBAC                      | Role-Based Access Control — controlling which users can perform which operations                                        |
| XLIFF 2.0                 | XML Localisation Interchange File Format version 2.0 — an OASIS standard for exchanging translatable text with translation agencies |
| WCAG 2.1 AA               | Web Content Accessibility Guidelines version 2.1, Level AA — the internationally recognized accessibility standard mandated for QDB public-sector digital services |
| BCP 47                    | IETF Best Current Practice 47 — the standard for language tags (e.g., `ar`, `en`, `ur`)                                |
| Form Bundle               | A self-contained JSON export of a form definition plus all its dependencies (theme, translations, mappings, rules, access policies) |
| PII                       | Personally Identifiable Information — data that can identify an individual, subject to PDPPL regulation in Qatar        |
| PDPPL                     | Qatar's Personal Data Protection and Privacy Law — the primary data-protection regulation applicable to QDB's digital services |
| schemaName                | The internal machine-readable identifier of a form field, used in business rules, mappings, and submission payloads     |
| DFE-STYLE-001             | A separate approved BRD for advanced visual styling of the DFE designer (currently paused)                              |
| ALM                       | Application Lifecycle Management — the process of managing software from development through testing to production       |
| Form Approver             | An ENT-002 RBAC role: the individual authorized to approve or reject publish requests for assigned forms                 |
| Form Owner                | An ENT-002 RBAC role: the primary responsible party for a form with full edit and publish-request rights                |
| Form Translator           | An ENT-002 RBAC role: limited to language-scoped translation edits, no structural authority                             |
| RTL                       | Right-to-Left — text direction used by Arabic and Urdu, requiring mirrored layout in the rendered form                  |
| PR #11                    | The pull request that fixed the sortOrder=0 / qdb_priority Dataverse constraint violation on first rule save            |

---

## 17. Requirements Traceability Matrix

| User Story | Functional / Enterprise Req                          | Business Objective(s) | Test Case (QA fills) | Status |
|------------|------------------------------------------------------|-----------------------|----------------------|--------|
| US-01      | FR-002                                               | BO-6                  | TC-pending           | Draft  |
| US-02      | FR-001                                               | BO-6                  | TC-pending           | Draft  |
| US-03      | FR-003                                               | BO-1                  | TC-pending           | Draft  |
| US-04      | FR-004                                               | BO-1                  | TC-pending           | Draft  |
| US-05      | FR-006                                               | BO-1                  | TC-pending           | Draft  |
| US-06      | FR-007                                               | BO-1                  | TC-pending           | Draft  |
| US-07      | ENT-001                                              | BO-2                  | TC-pending           | Draft  |
| US-08      | ENT-002                                              | BO-3                  | TC-pending           | Draft  |
| US-09      | ENT-003                                              | BO-4                  | TC-pending           | Draft  |
| US-10      | ENT-004, FR-014                                      | BO-5                  | TC-pending           | Draft  |
| US-11      | ENT-005                                              | BO-2                  | TC-pending           | Draft  |
| US-12      | FR-013, ENT-009                                      | BO-8                  | TC-pending           | Draft  |
| US-13      | FR-013                                               | BO-8                  | TC-pending           | Draft  |
| US-14      | FR-015                                               | BO-1                  | TC-pending           | Draft  |
| US-15      | ENT-008, NFR-004                                     | BO-7                  | TC-pending           | Draft  |
| —          | FR-005 (undo coverage)                               | BO-1                  | TC-pending           | Draft  |
| —          | FR-008 (field/section templates)                     | BO-1                  | TC-pending           | Draft  |
| —          | FR-009 (keyboard + drag-drop)                        | BO-7                  | TC-pending           | Draft  |
| —          | FR-010 (search / navigator)                          | BO-1                  | TC-pending           | Draft  |
| —          | FR-011 (bulk operations)                             | BO-1                  | TC-pending           | Draft  |
| —          | FR-012 (UX / panel overflow)                         | BO-1                  | TC-pending           | Draft  |
| —          | ENT-006 (DR strategy)                                | BO-5                  | TC-pending           | Draft  |
| —          | ENT-007 (observability)                              | BO-9                  | TC-pending           | Draft  |
| —          | ENT-009 (localization governance)                    | BO-8                  | TC-pending           | Draft  |
| —          | ENT-010 (scale limits)                               | BO-10                 | TC-pending           | Draft  |
| —          | ENT-011 (integration registry — deferred)            | —                     | —                    | Deferred |
| —          | NFR-001, NFR-002, NFR-003                            | BO-10                 | TC-pending           | Draft  |
| —          | NFR-005 (security)                                   | BO-2, BO-3            | TC-pending           | Draft  |
| —          | NFR-006 (translation formats)                        | BO-8                  | TC-pending           | Draft  |

---

## 18. Approval

| Role               | Name      | Decision  | Date |
|--------------------|-----------|-----------|------|
| CEO                | Pending   | PENDING   |      |
| QDB IT Director    | Pending   | PENDING   |      |
| Requestor          | Pending   | PENDING   |      |

---

BRD is complete. Submitting to CEO for approval before any design or code begins.
