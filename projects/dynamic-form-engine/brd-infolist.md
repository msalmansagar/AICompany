═══════════════════════════════════════════════════
BUSINESS REQUIREMENTS DOCUMENT
═══════════════════════════════════════════════════
Project:        DFE-INFOLIST-001 — Configurable List Styles in the Inline Info-Card Field
Prepared by:    Maqsad AI — Business Analyst
Date:           2026-07-20
Version:        1.0
Status:         DRAFT — Pending CEO Approval
═══════════════════════════════════════════════════


1. EXECUTIVE SUMMARY
─────────────────────────────────────────────────────────────
The Dynamic Form Engine's inline info-card field currently renders a single text body paragraph alongside a title and icon. Makers have no way to present sequential instructions, numbered steps, or bulleted guidance to end-users within that field. This limitation forces workarounds — either encoding a wall of text in the body or using separate, disconnected label fields — reducing form clarity and increasing end-user error rates on multi-step guidance. This feature adds three designer-configurable properties to the existing info-card field: a list type (none / bullet / numbered-arabic / numbered-roman), a marker shape (plain / circled / none), and retains the existing single-paragraph path unchanged when no list type is configured. Item text is sourced by splitting the existing infoCardBody on newlines, avoiding the addition of a new items column. The expected business outcome is that makers can author structured instructional content — including the circled-roman-numeral style used in QDB's design reference — directly within the form designer, without custom workarounds, and with full backward compatibility for all existing info-card fields.


2. BUSINESS OBJECTIVES
─────────────────────────────────────────────────────────────
1. Enable QDB form makers to configure the inline info-card field to present body content as an ordered or unordered list so that end-users receive structured, scannable guidance on complex multi-step processes.
2. Enable QDB form makers to select a marker shape (plain or circled) for list items so that info-card styling matches QDB's established visual language, including the circled-numeral treatment shown in the design reference.
3. Enable QDB form makers to publish forms containing list-style info-cards through both the local developer API path and the live in-CRM render-cache path, so that the feature works identically in all deployment modes without requiring manual C# plugin synchronisation after the fact.
4. Preserve exact backward compatibility for all existing info-card fields so that no published form requires re-authoring, re-publishing, or data migration after the feature ships.
5. Deliver accessible list semantics (semantic ol/ul elements on web; equivalent prefixed rows on mobile) so that QDB public-sector forms comply with WCAG 2.1 AA screen-reader requirements without additional remediation effort.


3. STAKEHOLDERS
─────────────────────────────────────────────────────────────
| Stakeholder                | Role                           | Interest in this project                                              |
|----------------------------|--------------------------------|-----------------------------------------------------------------------|
| QDB Form Makers            | Primary users of the designer  | Authoring list-style info-card content without workarounds            |
| QDB Form End-Users         | Runtime consumers              | Receiving clear, structured guidance within form steps                |
| QDB Accessibility Officers | Public-sector obligation owner | WCAG 2.1 AA screen-reader compliance for new list rendering           |
| QDB IT / Platform Ops      | Deployment owners              | Idempotent Dataverse provisioning; CRM solution XML integrity         |
| Maqsad AI Frontend Team    | Implementation owner           | InfoCardField.tsx rendering; mobile FormInfoCardField.tsx parity      |
| Maqsad AI Backend Team     | Implementation owner           | CrmMetadataService mapper; C# FieldBuilder.cs + PicklistMapper.cs     |
| Maqsad AI Designer Team    | Implementation owner           | InfoCardFieldPanel.tsx designer config UI                             |
| Maqsad AI QA               | Test authority                 | Unit + E2E coverage for all list-type combinations and backward compat |
| Maqsad AI Architect        | Technical design authority     | Shared-type parity, provisioning strategy, two-generator constraint   |
| Maqsad AI CEO              | Engagement sponsor + approver  | ROI, risk, phase gate approval                                        |


4. SCOPE
─────────────────────────────────────────────────────────────

4.1 In Scope
- Two new designer-configurable properties on the inline info-card field (fieldType = 'info-card'): list type and marker shape.
- List type values: absent/none (default, plain paragraph), bullet, numbered-arabic, numbered-roman.
- Marker shape values: plain (marker glyph only), circle (marker inside a filled circle), none (no marker visible).
- Item-text source: newline-split of the existing infoCardBody string. No new structured-items column.
- Two new Dataverse Picklist columns on qdb_form_field: qdb_info_card_list_type and qdb_info_card_list_marker.
- Idempotent provisioning script (provision-infolist.mjs) for the two new columns.
- CRM solution XML (solution.xml) RootComponent declarations for both new columns.
- Node backend mapper (CrmMetadataService.ts): read both new columns and populate infoCardListType / infoCardListMarker on FieldDefinition.
- C# plugin (FieldBuilder.cs, PicklistMapper.cs, FormDefinitionModel.cs): identical mapping for the in-CRM render-cache path. This is a hard requirement; both generators must ship together.
- Shared types (both form.types.ts and form.ts): add infoCardListType and infoCardListMarker with the full union types. CI parity check (check-shared-type-sync.mjs) must pass.
- Designer properties panel (InfoCardFieldPanel.tsx): List Type selector (Dropdown: None / Bullet / Numbered Arabic / Numbered Roman) and Marker Shape selector (Dropdown: Plain / Circled / No Marker), displayed below the existing body textarea, visible at all times when fieldType = 'info-card'.
- Designer save path: FieldService.ts / FormSaveService.ts persists both new fields to Dataverse.
- Frontend runtime (InfoCardField.tsx): when infoCardListType is set and not absent, split infoCardBody on '\n', discard empty lines, and render as a semantic <ol> or <ul> with the appropriate list-style and marker-shape CSS; when absent, retain the existing parseInfoCardContent path unchanged.
- Mobile runtime (FormInfoCardField.tsx): when infoCardListType is set, split infoCardBody on '\n' and render each item as a styled row with a computed text prefix (bullet character, Arabic numeral, or Roman numeral). Mobile-specific styling to match the circled-marker visual on supported platforms.
- Backward compatibility: fields with no infoCardListType property render exactly as today with zero code-path change.
- Unit tests: newline-split parser logic, frontend rendering for all type/marker combinations, C# mapper, designer panel state transitions.
- E2E test: designer authoring → save → runtime render for at least one list type variant.
- Update existing InfoCardField.test.tsx and FormInfoCardField.test.tsx; add any new test files following the project naming convention.

4.2 Out of Scope
- The DFE-ADD-001 info-card intro screens (InfoCardSectionRenderer.tsx and InfoCardScreen / InfoCardSection model) — those are a separate component with their own type hierarchy and are not modified.
- The grid info-card display mode (GridDisplayMode = 'infocard' in DFE-GRIDSRC-001) — entirely separate concern.
- Per-item rich content (icons per item, per-item links, per-item descriptions). The new list renders plain-text items only; the existing JSON-array icon-list mode (parseInfoCardContent returning mode='items') is not deprecated but remains a separate, undocumented power-user path.
- i18n / Arabic translation of list item text. The existing translation pipeline (TranslationResolutionService) already handles infoCardBody as a translatable string; no new translation columns are in scope.
- Custom CSS theming or design-token overrides for the circled marker (DFE-STYLE-001 scope).
- Maker-checker approval gate on info-card authoring (DFE-ENH-001 scope).
- Any change to the qdb_form_field Dataverse form or view for the new columns (IT Admin concern, not a system requirement).
- Drag-and-drop reordering of list items within the designer (items are ordered by newline position; reordering requires the maker to edit the textarea).


5. FUNCTIONAL REQUIREMENTS
─────────────────────────────────────────────────────────────

Group A — Shared Types

FR-001: The system shall add optional property infoCardListType with type 'bullet' | 'numbered-arabic' | 'numbered-roman' to the FieldDefinition interface in shared/src/types/form.types.ts, with undefined meaning no list (plain paragraph mode).
FR-002: The system shall add optional property infoCardListMarker with type 'circle' | 'plain' | 'none' to the FieldDefinition interface in shared/src/types/form.types.ts.
FR-003: The system shall add the same two properties (infoCardListType, infoCardListMarker) to the FieldDefinition interface in shared/src/types/form.ts (mobile parity file) with identical type signatures so that the CI parity check (check-shared-type-sync.mjs) continues to pass.

Group B — Dataverse Schema

FR-004: The system shall provision a new Picklist attribute qdb_info_card_list_type on qdb_form_field with option values representing: no list (default absent), bullet, numbered-arabic, and numbered-roman, via an idempotent provisioning script that skips columns already present.
FR-005: The system shall provision a new Picklist attribute qdb_info_card_list_marker on qdb_form_field with option values representing: plain, circle, and none, via the same idempotent provisioning script.
FR-006: The system shall declare both new attributes (qdb_info_card_list_type, qdb_info_card_list_marker) as individual RootComponent entries in the CRM solution XML (solution.xml) so that solution import succeeds without missing-attribute errors.

Group C — Node Backend Mapper

FR-007: The system shall, in CrmMetadataService.ts, read qdb_info_card_list_type from the Dataverse field entity and map it to infoCardListType on the FieldDefinition output using the same mapper pattern as existing picklist fields (e.g. mapInfoCardStyle). When the column is null or absent, infoCardListType shall be omitted from the output.
FR-008: The system shall, in CrmMetadataService.ts, read qdb_info_card_list_marker from the Dataverse field entity and map it to infoCardListMarker on the FieldDefinition output. When null or absent, infoCardListMarker shall be omitted.

Group D — C# Plugin Mapper (Render-Cache Path)

FR-009: The system shall extend FieldBuilder.cs to read qdb_info_card_list_type from the CRM Entity using EntityHelper.GetOptionSetValue and assign the mapped string to a new InfoCardListType property on FieldDefinition via PicklistMapper.ToInfoCardListType.
FR-010: The system shall extend FieldBuilder.cs to read qdb_info_card_list_marker from the CRM Entity and assign the mapped string to InfoCardListMarker via PicklistMapper.ToInfoCardListMarker.
FR-011: The system shall add static methods ToInfoCardListType and ToInfoCardListMarker to PicklistMapper.cs that convert the integer option set value to the correct string constant ('bullet', 'numbered-arabic', 'numbered-roman', 'circle', 'plain', 'none') and return null when the value is null or unrecognised.
FR-012: The system shall add optional JsonProperty-decorated properties InfoCardListType and InfoCardListMarker (NullValueHandling = NullValueHandling.Ignore) to the FieldDefinition C# model (FormDefinitionModel.cs) so that absent values produce no JSON key and existing field JSON is byte-identical.

Group E — Designer Properties Panel

FR-013: The system shall display a "List Type" dropdown in InfoCardFieldPanel.tsx with options: None (default), Bullet, Numbered (1. 2. 3.), Numbered (I. II. III.), allowing the maker to select the list rendering mode for the info-card field.
FR-014: The system shall display a "Marker Shape" dropdown in InfoCardFieldPanel.tsx with options: Plain, Circled, No Marker, allowing the maker to control how each list item's marker is presented, visible whenever List Type is not "None".
FR-015: The system shall persist the maker's list type and marker shape selections to Dataverse via the existing FieldService / FormSaveService save path when the form is saved or auto-saved.
FR-016: The system shall pre-populate the "List Type" and "Marker Shape" dropdowns with the currently saved values when the designer loads an existing info-card field that has previously had list config saved.
FR-017: The system shall display a static hint in the designer panel (below the body textarea) informing the maker that each line of the body text becomes one list item when a list type is selected.

Group F — Frontend Runtime Rendering

FR-018: The system shall, in InfoCardField.tsx, detect when infoCardListType is set to 'bullet', 'numbered-arabic', or 'numbered-roman' and, in that case, split infoCardBody on newline characters ('\n'), filter out empty lines, and render the resulting items as a list rather than calling parseInfoCardContent.
FR-019: The system shall render bullet list items using a semantic <ul> element with <li> children when infoCardListType is 'bullet'.
FR-020: The system shall render numbered-arabic list items using a semantic <ol> element with list-style-type: decimal when infoCardListType is 'numbered-arabic'.
FR-021: The system shall render numbered-roman list items using a semantic <ol> element with list-style-type: upper-roman when infoCardListType is 'numbered-roman'.
FR-022: The system shall apply a circled-marker CSS treatment (a filled circle around the list marker, matching the design reference) to each list item when infoCardListMarker is 'circle'. This treatment shall be implemented with CSS custom counters or ::marker / ::before pseudo-elements; it must not use an external library.
FR-023: The system shall suppress the list marker entirely (no bullet, no number) when infoCardListMarker is 'none', while preserving the indented block layout.
FR-024: The system shall, when infoCardListType is absent or undefined, execute the existing parseInfoCardContent path without any change, so that legacy plain-text and JSON-icon-list bodies continue to render exactly as before.
FR-025: The system shall not render any list container when infoCardBody is absent, null, or produces zero non-empty lines after the newline split.

Group G — Mobile Runtime Rendering

FR-026: The system shall, in FormInfoCardField.tsx (React Native), detect when infoCardListType is set and split infoCardBody on '\n', filtering empty lines, rendering each item as a horizontal row with a text prefix and the item text.
FR-027: The system shall compute the prefix for each item as follows: bullet → '•'; numbered-arabic → '<n>.'; numbered-roman → the corresponding upper-case Roman numeral followed by '.'.
FR-028: The system shall visually enclose the prefix in a styled circle when infoCardListMarker is 'circle' (using a View with borderRadius and a background colour matching the card's theme colour).
FR-029: The system shall omit the prefix View entirely when infoCardListMarker is 'none'.
FR-030: The system shall fall back to rendering infoCardBody as a plain <Text> element when infoCardListType is absent, preserving today's mobile behaviour unchanged.

Group H — Backward Compatibility

FR-031: The system shall ensure that any existing info-card field record in Dataverse that has no value for qdb_info_card_list_type continues to render identically in both web and mobile runtimes, producing no visual diff from the current behaviour.
FR-032: The system shall ensure that the C# plugin's FormJsonGenerator produces a byte-identical JSON output for any existing info-card field that has no value for the two new columns (NullValueHandling.Ignore ensures omission).


6. NON-FUNCTIONAL REQUIREMENTS
─────────────────────────────────────────────────────────────
NFR-001: Performance — The newline-split and list-render path shall add no measurable render latency compared to the existing plain-text path; the split operation is O(n) on body length and must not introduce debouncing or async processing.
NFR-002: Availability — The feature must not introduce any new service dependencies; it is purely client-side rendering plus schema columns, so availability requirement matches the existing DFE frontend SLA (99.9% portal uptime).
NFR-003: Security — No new API endpoints or authentication surfaces are introduced. The two new Dataverse columns follow the existing qdb_form_field column security model (read access to the form-reader service principal; write access to the form-designer service principal). No user-supplied input is executed as code.
NFR-004: Scalability — The infoCardBody string for a list-style card is expected to hold up to 50 list items. No pagination or lazy-loading is required; the body is already a bounded text column (ntext). The system must handle up to 50 non-empty lines without degraded rendering.
NFR-005: Compliance — New Dataverse columns must be provisioned additively; the provisioning script must be idempotent and must not alter or drop any existing column. The CRM solution XML RootComponent entries must be individually declared per the established RootComponents rule. The CI parity check on shared types must pass on every commit that touches either form.types.ts or form.ts.
NFR-006: Accessibility — List items must use semantic HTML list elements (<ul>/<ol> with <li>) on web so that screen readers announce item count and position. The existing role="note" on the card wrapper must be preserved. On mobile, each item row must carry an accessibilityLabel constructed from its prefix and text so that iOS/Android screen readers can read list items individually.
NFR-007: Maintainability — Both generators (Node CrmMetadataService and C# FieldBuilder) must be updated in the same commit or release. No partial deployment where one generator maps the new columns and the other does not is permissible. The architect shall flag this as a deployment constraint in the ADR.


7. BUSINESS RULES
─────────────────────────────────────────────────────────────
BR-001: When infoCardListType is 'bullet', 'numbered-arabic', or 'numbered-roman', the rendering engine shall use the newline-split path and shall NOT call parseInfoCardContent, regardless of whether infoCardBody begins with '['.
BR-002: When infoCardListType is absent or undefined, the rendering engine shall use the existing parseInfoCardContent path and shall NOT apply any list styling, regardless of the value of infoCardListMarker.
BR-003: infoCardListMarker has no effect when infoCardListType is absent. The system shall not apply circled or suppressed marker styling unless a list type is also specified.
BR-004: Empty lines produced by the newline split (including lines consisting only of whitespace) shall be discarded and shall not produce empty list items.
BR-005: The minimum valid list body is one non-empty line. A list-type info-card field with an empty or whitespace-only body shall render no list container (no empty <ul>/<ol>).
BR-006: The infoCardListMarker default when infoCardListType is set but infoCardListMarker is absent shall be 'plain'. The system shall not assume 'circle' unless the maker explicitly selects it.
BR-007: Both new Dataverse columns are nullable. The absence of a column value is semantically equivalent to 'none' for list type and 'plain' for marker shape at runtime.
BR-008: The C# plugin and Node backend must produce structurally identical JSON for the same field record. Any discrepancy is a defect.


8. USER STORIES
─────────────────────────────────────────────────────────────

US-01 — List Type Configuration (Must Have)
As a QDB form maker, I want to configure an inline info-card field to display its body as a bulleted or numbered list so that I can present multi-step instructions in a scannable format without splitting content across multiple fields.
  Priority: Must Have
  Acceptance criteria:
    Given an info-card field is open in the designer
    When I select "Numbered (I. II. III.)" from the List Type dropdown and enter three lines of text in the body textarea
    Then the form preview renders the body as a numbered list with upper-case Roman numerals (I., II., III.) rather than a paragraph, and saving and reloading the form preserves the selection.

US-02 — Circled Marker Style (Must Have)
As a QDB form maker, I want to display list item markers inside a filled circle so that the info-card visual matches QDB's approved design reference for numbered instructions.
  Priority: Must Have
  Acceptance criteria:
    Given an info-card field with list type set to "Numbered (I. II. III.)" and marker shape set to "Circled"
    When the form is rendered by an end-user
    Then each Roman numeral appears inside a filled circle whose colour matches the info-card style colour (e.g. blue for 'info'), and a screen reader announces the list as a 3-item list with numbered items.

US-03 — Backward Compatibility (Must Have)
As a QDB form maker who has already published forms containing info-card fields, I want those forms to continue rendering exactly as they do today so that no re-authoring is required after the feature ships.
  Priority: Must Have
  Acceptance criteria:
    Given an existing published form with an info-card field that has no list type configured
    When the DFE-INFOLIST-001 release is deployed
    Then the rendered output of that field is pixel-identical to its pre-deployment output and no new Dataverse column value is written to the existing field record.

US-04 — In-CRM Render-Cache Path (Must Have)
As a QDB platform operator, I want list-style info-card fields to render correctly when the form JSON is generated by the in-CRM C# plugin (render cache path), so that the feature works in production without requiring the local Node backend to be the active generator.
  Priority: Must Have
  Acceptance criteria:
    Given a form with a list-style info-card field published and cached via the C# FormJsonGenerator
    When a portal end-user loads that form
    Then the list renders with the correct type and marker shape, identical to a form served by the Node CrmMetadataService.

US-05 — Mobile Rendering (Should Have)
As a QDB portal end-user accessing a form on the QDB mobile app, I want info-card lists to display with correct prefixes and circled markers so that the mobile experience is consistent with the web experience.
  Priority: Should Have
  Acceptance criteria:
    Given a form with a 'numbered-roman' / 'circle' info-card field
    When the form is rendered in the React Native mobile app
    Then each item shows its Roman numeral inside a styled circle View, and screen readers on iOS and Android announce the item label with its prefix.

US-06 — Designer Body Hint (Could Have)
As a QDB form maker unfamiliar with the newline-as-item convention, I want a visible hint in the designer panel so that I understand how to author list content without needing documentation.
  Priority: Could Have
  Acceptance criteria:
    Given an info-card field in the designer with List Type set to any non-None value
    When the maker views the body textarea
    Then a static hint text below the textarea reads: "Each line of text becomes one list item."


9. DATA REQUIREMENTS
─────────────────────────────────────────────────────────────
| Entity             | New Columns                                         | Volume                    | Retention         | Sensitivity |
|--------------------|-----------------------------------------------------|---------------------------|-------------------|-------------|
| qdb_form_field     | qdb_info_card_list_type (Picklist, nullable)         | 1 column per field record  | Form lifetime     | Internal    |
| qdb_form_field     | qdb_info_card_list_marker (Picklist, nullable)       | 1 column per field record  | Form lifetime     | Internal    |

Notes:
- Both columns are additive to the existing qdb_form_field entity. No existing columns are modified.
- Estimated field records with info-card type: < 200 in the current org. No volume concern.
- No new entities or tables are introduced.
- List item text is stored in the existing qdb_info_card_body column (ntext, up to ~1 MB). No new column for items.
- The render-cache JSON payload grows by at most two small string properties per info-card field (~40 bytes each). No size concern.


10. INTEGRATION DEPENDENCIES
─────────────────────────────────────────────────────────────
| System                         | Integration type         | Data exchanged                                     | Direction          |
|--------------------------------|--------------------------|----------------------------------------------------|--------------------|
| Dataverse (org5869857f)        | OData v9.2 REST          | New Picklist columns on qdb_form_field             | Read/Write         |
| CrmMetadataService (Node)      | In-process call          | qdb_info_card_list_type, qdb_info_card_list_marker | Dataverse → Node   |
| FormJsonGenerator (C# plugin)  | Dataverse plugin pipeline| Same two columns via IOrganizationService SDK      | Dataverse → Plugin |
| Render cache (C# plugin)       | JSON blob in Dataverse   | Full form JSON including new properties            | Plugin → Portal    |
| Designer (React / Vite)        | REST to backend / proxy  | FieldDefinition including new props                | Backend → Designer |
| Frontend runtime (Next.js)     | JSON form definition     | infoCardListType, infoCardListMarker               | Backend → Frontend |
| Mobile runtime (React Native)  | JSON form definition     | infoCardListType, infoCardListMarker               | Backend → Mobile   |
| CI parity check script         | Node script (CI hook)    | shared/src/types/form.types.ts vs form.ts          | Build-time only    |


11. ASSUMPTIONS
─────────────────────────────────────────────────────────────
A-001: The newline character '\n' is a safe and sufficient delimiter for list items. Existing infoCardBody values for non-list fields do not contain embedded newlines that would accidentally produce multi-item lists if a list type were later applied, because the list type is opt-in and off by default.
A-002: Makers will enter one item per line in the body textarea; no special escaping or delimiter syntax is required.
A-003: The maximum practical list length is 50 items. No pagination, lazy-rendering, or overflow handling is needed within the info-card field.
A-004: The CSS circled-marker effect (Roman numerals or bullets inside a filled circle) can be implemented with standard CSS counters and pseudo-elements without requiring a third-party library. The architect will confirm the implementation approach.
A-005: Roman numeral computation for mobile (React Native) can be implemented with a small inline utility function (values up to XLIX / 49 cover the 50-item cap assumed in A-003) without a library.
A-006: The two new Dataverse columns can be provisioned against org5869857f using the existing service principal credentials (CLIENT_ID / DV_CLIENT_SECRET) already used by all other provision scripts.
A-007: The CI parity check script (check-shared-type-sync.mjs) performs a structural comparison of exported types between form.types.ts and form.ts and will fail if the new properties are added to one file but not the other. This is the enforcement mechanism for FR-003.
A-008: NullValueHandling.Ignore on the new C# model properties is sufficient to produce byte-identical JSON for existing field records (null properties produce no JSON key).


12. CONSTRAINTS
─────────────────────────────────────────────────────────────
C-001: Both form-JSON generators (Node CrmMetadataService and C# FormJsonGenerator plugin) must be updated and deployed together. Deploying the frontend before the C# plugin is updated will cause list-type fields authored via the designer to render as plain paragraphs in the in-CRM render-cache path. The architect must flag this as a deployment ordering constraint.
C-002: The shared-type parity check (check-shared-type-sync.mjs) is a CI gate. Any PR that adds infoCardListType / infoCardListMarker to form.types.ts but not form.ts (or vice versa) will fail CI and must not be merged.
C-003: The provisioning script must be idempotent (skip-if-exists for all column operations) to allow safe re-runs. It must not call any destructive Dataverse API.
C-004: New Dataverse columns must be individually declared as RootComponent entries in solution.xml. Folder-level wildcards are not permitted (established organisational rule from CRM solution packaging feedback).
C-005: No new external npm packages or NuGet packages may be introduced for this feature. Roman numeral computation and CSS circled-marker styling must be implemented inline.
C-006: The existing infoCardContent.ts parseInfoCardContent function and the JSON-icon-list rendering mode must not be modified or broken. The new list-type path is a parallel branch, not a replacement.
C-007: The feature must not alter any existing Dataverse column, existing JSON key, or existing field record value. It is purely additive.


13. RISKS AND OPEN QUESTIONS
─────────────────────────────────────────────────────────────
| Risk / Question                                                                                                    | Impact       | Owner              | Resolution needed by         |
|--------------------------------------------------------------------------------------------------------------------|--------------|--------------------|-----------------------------|
| OQ-001: If an existing infoCardBody contains '\n' characters in a non-list field and a maker later enables list type, the body will split unexpectedly. Is this an acceptable UX trade-off, or should a different delimiter (e.g. '|||') be used? | Medium — UX confusion for makers | CEO / Product | Before architecture begins  |
| OQ-002: Should the 'circle' marker shape require a specific Fluent UI token for the circle background, or can the implementation use the card's existing border-left colour as the circle fill? The design reference image uses a matching colour. | Low — visual only | Architect | Architecture phase |
| OQ-003: Mobile (React Native) does not support CSS counters or ::marker pseudo-elements. The circled-marker on mobile requires a custom View + computed Roman numeral prefix. Should mobile support for the 'circle' marker be a Must Have at launch or a deferred Could Have? | Medium — scope vs. parity | CEO / Mobile team | Before architecture begins  |
| OQ-004: Should there be a designer-side validation rule capping the number of list items (e.g. warn if body produces more than 20 lines)? Or is this left to maker judgement? | Low — UX only | BA / CEO | Before QA phase |
| OQ-005: The 'none' marker shape with a list type effectively renders indented plain text with no visible list marker. Is this a valid, intentional use case that should be supported, or should the designer prevent this combination? | Low | CEO / Product | Before architecture begins |
| RISK-001: If the C# plugin is not deployed at the same time as the frontend/designer, existing in-CRM cached forms that contain new list-type fields will silently render as plain paragraphs. Mitigation: treat dual-generator deployment as a single release unit. | High — silent regression | Maqsad AI DevOps | Architecture phase |
| RISK-002: The CI parity check between form.types.ts and form.ts has historically been a source of forgotten updates. If the check is misconfigured or bypassed, mobile will receive undefined props. Mitigation: confirm the parity check is active in the current CI pipeline before build begins. | Medium | Maqsad AI QA | Before build begins |


14. GLOSSARY
─────────────────────────────────────────────────────────────
Inline info-card field: A display-only DFE field (fieldType = 'info-card') that renders a styled notification card (info / warning / success / error) with an icon, title, and body text within a form section. Not to be confused with the Info-Card Screens (intro/splash screens before the form tabs, controlled by the InfoCardScreen / InfoCardSection model).

infoCardListType: The new optional property controlling whether the body is rendered as a plain paragraph (absent / 'none'), unordered list ('bullet'), or ordered list ('numbered-arabic', 'numbered-roman').

infoCardListMarker: The new optional property controlling the visual treatment of each list item's marker — plain glyph ('plain'), glyph inside a filled circle ('circle'), or no marker ('none').

Newline-split: The mechanism by which list items are derived — infoCardBody is split on the '\n' character, with empty/whitespace-only lines discarded.

Two-generator constraint: The DFE architecture has two independent code paths that produce form JSON: (1) the Node.js CrmMetadataService (used by the local developer backend and the designer), and (2) the C# FormJsonGenerator plugin deployed to Dataverse (the in-CRM render-cache path used in production). Any new field property must be mapped in both generators.

Render cache: A Dataverse-stored JSON snapshot of a form's definition, produced by the C# FormJsonGenerator plugin and served directly to the portal to avoid repeated Dataverse metadata queries on each page load.

Circled marker: A visual treatment where a list item's marker (bullet character or numeral) is displayed inside a filled coloured circle, matching QDB's reference design for numbered instructional content.

Parity check: The CI script (check-shared-type-sync.mjs) that compares exported type definitions between shared/src/types/form.types.ts (used by backend and frontend) and shared/src/types/form.ts (used by mobile) to enforce that both files stay structurally in sync.

form.types.ts: The primary shared FieldDefinition type file, consumed by the Node backend and the web frontend.

form.ts: The secondary shared FieldDefinition type file, consumed by the React Native mobile app. Must mirror all relevant properties from form.types.ts.

FieldBuilder.cs: The C# class within the Qdb.FormEngine.Core plugin that maps raw Dataverse Entity attributes to FieldDefinition C# model instances during the render-cache generation run.

PicklistMapper.cs: The C# class containing static methods that convert Dataverse option set integer codes to string constants used in the JSON output (e.g. ToInfoCardStyle, ToBoolRenderStyle).

FormDefinitionModel.cs: The C# model class whose properties are serialised to form JSON by the C# plugin. New properties must be declared here with appropriate JsonProperty attributes.

qdb_form_field: The Dataverse entity table that stores all field configurations for DFE forms, including the existing info-card columns (qdb_info_card_style, qdb_info_card_title, qdb_info_card_body, qdb_info_card_icon) and the two new columns this feature adds.


15. REQUIREMENTS TRACEABILITY MATRIX
─────────────────────────────────────────────────────────────
| User Story | Functional Requirements               | Test Case (QA fills) | Status |
|------------|---------------------------------------|----------------------|--------|
| US-01      | FR-001, FR-002, FR-003, FR-013, FR-018, FR-019, FR-020, FR-021 | TC-XXX (pending) | Draft |
| US-02      | FR-001, FR-002, FR-014, FR-022, FR-028 | TC-XXX (pending) | Draft |
| US-03      | FR-024, FR-030, FR-031, FR-032         | TC-XXX (pending) | Draft |
| US-04      | FR-009, FR-010, FR-011, FR-012, FR-032 | TC-XXX (pending) | Draft |
| US-05      | FR-003, FR-026, FR-027, FR-028, FR-029, FR-030 | TC-XXX (pending) | Draft |
| US-06      | FR-017                                 | TC-XXX (pending) | Draft |
| —          | FR-004, FR-005, FR-006 (Dataverse provisioning) | TC-XXX (pending) | Draft |
| —          | FR-007, FR-008 (Node mapper)           | TC-XXX (pending) | Draft |
| —          | FR-015, FR-016 (Designer save/load)    | TC-XXX (pending) | Draft |
| —          | FR-023, FR-025 (Edge cases)            | TC-XXX (pending) | Draft |


16. APPROVAL
─────────────────────────────────────────────────────────────
| Role          | Name              | Decision  | Date |
|---------------|-------------------|-----------|------|
| CEO           | Pending           | PENDING   |      |
| Requestor     | Pending           | PENDING   |      |

═══════════════════════════════════════════════════
END OF DOCUMENT
═══════════════════════════════════════════════════
