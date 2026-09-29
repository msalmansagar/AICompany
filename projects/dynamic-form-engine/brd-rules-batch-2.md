═══════════════════════════════════════════════════
BUSINESS REQUIREMENTS DOCUMENT
═══════════════════════════════════════════════════
Project:        DFE-RULES-002 — Business Rules Batch 2
Prepared by:    MSS Technologies — Business Analyst
Date:           2026-09-29
Version:        1.0
Status:         DRAFT — Pending CEO Approval
═══════════════════════════════════════════════════


1. EXECUTIVE SUMMARY
───────────────────────────────────────────────────
Three DFE capability gaps have been raised by the client. Business rules today
cannot target Entry Grid columns, forcing makers to hide entire grids as a blunt
workaround (Item 1 — Grid Column Rules, sizing M). Rule conditions can only read
form field values; makers cannot write conditions such as "parent Case Priority
equals High", blocking workflow-gate patterns the client calls "BPM-style advanced
filters" (Item 2 — Parent Record Conditions, sizing L). Option-set fields have no
star-rating renderer, blocking scoring and satisfaction form patterns (Item 3 —
Rating Render Style, sizing S). This engagement adds all three capabilities across
shared types, the frontend RuleEngine, the designer, and the C# plugin publisher,
with full backward compatibility and both form-JSON generators updated together.


2. BUSINESS OBJECTIVES
───────────────────────────────────────────────────
1. Enable makers to apply show/hide/required/readonly rules to individual Entry
   Grid columns so that grids adapt dynamically to form state without blunt workarounds.
2. Enable makers to write rule conditions that read the parent CRM record's own
   direct attributes so that forms adapt to their context record without custom plugins.
3. Enable makers to render option-set fields as interactive star-rating controls
   so that scoring forms match the approved UX without bespoke development.
4. Preserve full backward compatibility — all deployed forms and rules behave
   identically after the release with zero maker intervention.
5. Keep both form-JSON generators (Node CrmMetadataService and C# plugin) in
   sync so that new features work regardless of which generator is active.


3. STAKEHOLDERS
───────────────────────────────────────────────────
| Stakeholder               | Role                        | Interest                                           |
|---------------------------|-----------------------------|---------------------------------------------------|
| QDB Form Makers           | Primary configurator        | Grid rules, parent conditions, rating render style|
| QDB Form End-Users        | Runtime consumers           | Dynamic grids, context-aware forms, star ratings  |
| QDB IT / Platform Ops     | Schema and deployment owner | Cloud provisioning; on-prem manual schema steps   |
| DFE Frontend Team         | Runtime owner               | RuleEngine, grid renderer, rating renderer        |
| DFE Backend / Designer    | Mapper and designer owner   | CrmMetadataService, rule editor, field properties |
| DFE C# Plugin Team        | Render-cache owner          | FieldBuilder.cs, PicklistMapper.cs                |
| DFE Mobile Team           | Shared-types parity owner   | Type sync; no mobile runtime change in v1         |
| MSS Technologies CEO      | Engagement sponsor          | Phase gate approval                               |


4. SCOPE
───────────────────────────────────────────────────

4.1 In Scope
- Item 1 — Grid Column Rules: new action types (showColumn, hideColumn,
  makeColumnRequired, makeColumnOptional, makeColumnReadonly, makeColumnEditable);
  new targetKind 'gridColumn'; new column qdb_target_grid_id on qdb_business_rule;
  designer grid+column picker; RuleEngine grid column state map; Entry Grid reads map;
  C# publisher extended.
- Item 2 — Parent Record Conditions: new optional source discriminator
  ('form' | 'parentRecord') on RuleCondition (default 'form', fully backward-
  compatible); new memo column qdb_parent_prefetch_attrs on qdb_form; runtime fetches
  parent record at form load (cloud: Web API $select; on-prem: Organization Service
  SDK ColumnSet); designer condition picker "Parent Record" source; C# publisher
  preserves discriminator. SCOPING DECISION: parent record's own direct attributes
  only; no related-entity traversal or FetchXML builder in v1.
- Item 3 — Rating Render Style: new value 'rating' on FieldRenderStyle and
  qdb_render_style picklist; option display order = star count; stored value =
  integer option-set code; read-only mode; RTL star order for Arabic locale;
  designer Render Style dropdown; C# publisher extended.
- Shared types (form.types.ts and form.ts) updated together; CI parity check must pass.

4.2 Out of Scope
- setValue / calculateValue / filterOptions actions targeting grid cells or columns
- Row-level conditions based on cell values within the same grid row (grid-cell validation scope)
- Related-entity traversal or full FetchXML builder for parent conditions (v1)
- Half-star or fractional rating values
- Mobile runtime rendering for rating or parent-record fetch (types only; deferred v2)
- Custom star icons, colour overrides, or animation


5. FUNCTIONAL REQUIREMENTS
───────────────────────────────────────────────────

Group A — Grid Column Rules

FR-001: The system shall add action types showColumn, hideColumn, makeColumnRequired,
        makeColumnOptional, makeColumnReadonly, and makeColumnEditable to the
        BusinessRuleAction union in form.types.ts, each carrying columnId and gridFieldId.
FR-002: The system shall add 'gridColumn' to the RuleTargetKind union in form.types.ts
        and to its mirror in form.ts.
FR-003: The system shall provision optional nvarchar(200) column qdb_target_grid_id on
        qdb_business_rule to store the parent Entry Grid field schema name when
        targetKind is 'gridColumn'. Must be provisioned on cloud and added manually on-prem.
FR-004: The system shall extend the designer rule editor with a "Grid Column" target-kind
        option that exposes a grid-field picker and a column picker for that grid.
FR-005: The system shall extend the frontend RuleEngine to evaluate 'gridColumn' rules
        and add a gridColumnState map (keyed by gridFieldId:columnId → active actions)
        to RuleEvaluationResult.
FR-006: The system shall extend the Entry Grid component to read gridColumnState on
        each re-render and apply visibility, required, and readonly states per column.
FR-007: The system shall extend the C# publisher to read qdb_target_grid_id and include
        gridFieldId in the published rule JSON so the render-cache path carries grid
        column actions.
FR-008: The system shall leave a grid column in its default state and log a structured
        warning when a rule references a columnId or gridFieldId absent from the form.

Group B — Parent Record Conditions

FR-009: The system shall add optional source ('form' | 'parentRecord') to RuleCondition
        in form.types.ts and form.ts; absent means 'form' — all existing conditions
        are unchanged.
FR-010: The system shall provision optional memo column qdb_parent_prefetch_attrs on
        qdb_form to store a JSON array of parent attribute logical names to pre-fetch.
        Must be provisioned on cloud and added manually on-prem.
FR-011: The system shall, at form load, fetch the parent record using parentRecordId
        (already in form context), selecting only the attributes in qdb_parent_prefetch_attrs
        (cloud: Web API $select; on-prem: Organization Service SDK ColumnSet) and store
        the result as parentRecordValues in form state.
FR-012: The system shall skip the fetch and set parentRecordValues to empty when
        qdb_parent_prefetch_attrs is absent/empty or parentRecordId is null, without error.
FR-013: The system shall extend the designer condition field picker with a "Parent Record"
        source toggle; active state presents a parent attribute name input and sets
        source='parentRecord' in the saved condition.
FR-014: The system shall extend the frontend RuleEngine to evaluate source='parentRecord'
        conditions against parentRecordValues rather than form field values.
FR-015: The system shall evaluate a source='parentRecord' condition as false when
        parentRecordValues is absent or the referenced attribute is missing, and log a
        structured warning with rule id and attribute name.
FR-016: The system shall extend the C# publisher to preserve the source discriminator in
        condition JSON, never normalising 'parentRecord' back to 'form'.

Group C — Rating Render Style

FR-017: The system shall add 'rating' to the FieldRenderStyle union in form.types.ts
        and form.ts (CI parity check must pass).
FR-018: The system shall add 'rating' as a new option value to the existing
        qdb_render_style picklist on qdb_form_field (cloud: provisioning script;
        on-prem: manual picklist option addition).
FR-019: The system shall render an option-set field as interactive star icons when
        renderStyle is 'rating': option display order determines star count (first = 1,
        Nth = N); clicking a star stores the corresponding option-set integer code.
FR-020: The system shall render the rating as read-only (no interaction) when the
        field's isReadonly flag is true or the form is in summary/review mode.
FR-021: The system shall render stars in right-to-left order (rightmost = 1 star)
        when the active locale is Arabic or any other RTL locale.
FR-022: The system shall add "Rating" to the Render Style dropdown in the designer
        field properties panel for picklist (option-set) field types.
FR-023: The system shall extend PicklistMapper.cs to map the 'rating' option set
        integer code to the string constant 'rating' in the published form JSON.


6. NON-FUNCTIONAL REQUIREMENTS
───────────────────────────────────────────────────
NFR-001: Performance — RuleEngine grid column evaluation completes in the same
         synchronous render cycle as existing rules; parent-record fetch is a single
         async call at form load (Promise.all alongside the form definition call) and
         must not block the form's initial interactive state.
NFR-002: Availability — Parent-record fetch failure degrades gracefully: conditions
         evaluate to false, form remains fully usable, no user-visible error is raised.
NFR-003: Security — Parent-record attributes are fetched using the existing DFE
         service principal with the same scope as all other Dataverse calls; fetched
         values are transient client-side memory, not persisted or transmitted externally.
NFR-004: Accessibility — Star-rating control must carry aria-label stating current
         value and maximum (e.g. "3 out of 5 stars"), be keyboard-navigable (arrow
         keys), and meet WCAG 2.1 AA contrast for selected and unselected states.
NFR-005: Backward Compatibility — All existing rules, conditions, and render styles
         must produce byte-identical JSON output and identical runtime behaviour; the
         source discriminator default and missing-column degradation enforce this.
NFR-006: Test Coverage — All new code paths must reach the project minimum of 80%
         unit-test coverage; the RuleEngine condition and publisher branches must have
         100% branch coverage given their critical degradation paths.


7. BUSINESS RULES
───────────────────────────────────────────────────
BR-001: A grid column rule action applies to every row simultaneously; per-row rule
        application is out of scope for v1.
BR-002: showColumn/hideColumn takes precedence over the column's static hidden flag
        when the rule condition is met; conflict resolution (last rule wins) matches
        the existing field-level policy.
BR-003: Source defaults to 'form' when absent from a RuleCondition; its absence must
        never cause a parse failure in the RuleEngine or C# publisher.
BR-004: Parent-record conditions (source='parentRecord') read the parent record's OWN
        direct attributes only. Related-entity navigation (e.g. parent.account.name)
        is explicitly excluded from v1. The designer must not expose relationship
        traversal in this release.
BR-005: Star count is always equal to the number of configured options on the field's
        option set. Makers control maximum stars by managing option values; there is
        no independent max-stars property in v1.
BR-006: Option display order (not option code integer) determines the star mapping.
        If display order changes after data is collected, stored code values remap
        accordingly — makers must be aware of this trade-off.


8. USER STORIES
───────────────────────────────────────────────────

US-01 — Grid column show/hide by rule  |  Priority: P1 (Must Have)
As a maker, I want to hide a grid column based on a rule condition so that end
users only see relevant columns for the current form state.
  AC-1: Given rule "if Status='Draft' then hideColumn(Remarks) on Grid1"
        When Status='Draft' → column Remarks is hidden; other columns unchanged.
        When Status changes to another value → Remarks becomes visible again.

US-02 — Grid column required/readonly by rule  |  Priority: P1 (Must Have)
As a maker, I want to make a grid column required or read-only via a rule so that
I can enforce data quality without hiding the column entirely.
  AC-1: Given rule "if Priority='High' then makeColumnRequired(Notes) on Grid1"
        When Priority='High' → Notes column header shows required indicator;
        empty cell fails submission validation.
        When Priority!='High' → Notes is optional.

US-03 — Parent record field as rule condition  |  Priority: P1 (Must Have)
As a maker, I want to write a rule whose condition reads a parent record field
so that the form adapts to context without custom plugin code.
  AC-1: Given parent Case with Priority='High' and rule
        "if ParentRecord.Priority='High' then makeRequired(Resolution)"
        When form loads → Resolution is required, even with no Priority field on form.
        Given parent where Priority!='High' → Resolution is not required.

US-04 — Rating render style  |  Priority: P1 (Must Have)
As a maker, I want to configure an option-set field to display as a star-rating
control so that satisfaction forms match the approved scoring UX.
  AC-1: Given 5-option picklist with renderStyle='rating'
        When end user clicks star 3 → first 3 stars fill; value = code of 3rd option.
  AC-2: Given locale=Arabic → stars render right-to-left (1 star on right).
  AC-3: Given isReadonly=true → stars display current value; no interaction possible.

US-05 — Backward compatibility  |  Priority: P1 (Must Have)
As a maker, I want all existing forms and rules to behave identically after this
release so that no existing deployment needs re-authoring.
  AC-1: Given any deployed form with no new columns set
        When DFE-RULES-002 is deployed → every rule fires identically;
        C# plugin produces byte-identical JSON for existing field and rule records.


9. DATA REQUIREMENTS
───────────────────────────────────────────────────
New columns — provision via additive script on cloud; add MANUALLY on on-prem
(provisioning scripts cannot run against on-prem orgs).

| Entity             | New column / change              | Type           | Purpose                                        |
|--------------------|----------------------------------|----------------|------------------------------------------------|
| qdb_business_rule  | qdb_target_grid_id               | nvarchar(200)  | Parent grid field schema name for gridColumn rules |
| qdb_form           | qdb_parent_prefetch_attrs        | Memo (ntext)   | JSON array of parent attrs to fetch at load    |
| qdb_business_rule  | qdb_target_kind: +gridColumn     | Picklist value | New target kind (extend existing option set)   |
| qdb_form_field     | qdb_render_style: +rating        | Picklist value | New render style (extend existing option set)  |

No new entities. No PII in any new column. All columns nullable; null = no change
to existing behaviour. Sensitivity: Internal. Retention: lifetime of owning record.


10. INTEGRATION DEPENDENCIES
───────────────────────────────────────────────────
| System                        | Integration type        | Data exchanged                                      | Direction               |
|-------------------------------|-------------------------|-----------------------------------------------------|-------------------------|
| Dataverse org5869857f         | OData v9.2 REST         | New columns, new picklist option values             | Read/Write              |
| Parent CRM record (cloud)     | Web API $select         | Parent record attribute values for rule evaluation  | Dataverse → DFE Runtime |
| Parent CRM record (on-prem)   | Org Service SDK Retrieve| Same via ColumnSet                                  | Dataverse → DFE Runtime |
| C# FormJsonGenerator plugin   | In-process              | Grid column actions, source discriminator, rating   | Dataverse → JSON cache  |
| CI parity check script        | Build-time              | form.types.ts vs form.ts                            | Build gate              |


11. ASSUMPTIONS
───────────────────────────────────────────────────
A-001: parentRecordId and parent entity logical name are already available in the
       DFE form context at runtime; no new API parameter is needed.
A-002: Entry Grid column schema names are stable identifiers that do not change
       after a form is published.
A-003: The on-prem parent-record fetch runs client-side via XHR against the on-prem
       OData endpoint (same access pattern as other Web API calls in the web resource).
A-004: Option display order on a Dataverse picklist is stable after initial configuration;
       makers understand that reordering options after data collection remaps star counts.
A-005: Both form-JSON generators ship together; deploying only one is treated as a
       defect deployment, not a valid partial release.


12. CONSTRAINTS
───────────────────────────────────────────────────
C-001: All Dataverse schema changes are additive and idempotent; no existing column,
       option value, or entity may be modified or removed.
C-002: CI parity check (check-shared-type-sync.mjs) must pass; new types must be
       applied to both form.types.ts and form.ts in the same PR.
C-003: The C# publisher must JSON-passthrough unrecognised keys (never strip them);
       the source discriminator must not be silently dropped.
C-004: The parent-record fetch must not block the form's initial interactive render;
       it is a parallel async call; rules using parent conditions re-evaluate on resolution.
C-005: No new third-party libraries are permitted for star rendering or parent-record
       fetching; all implementation must be inline.


13. RISKS AND OPEN QUESTIONS
───────────────────────────────────────────────────
| Risk / Question                                                              | Impact | Owner     | Resolution needed by  |
|------------------------------------------------------------------------------|--------|-----------|-----------------------|
| OQ-001: On-prem parent-record fetch mechanism — confirm client-side XHR      | High   | Architect | Architecture phase    |
|         works against on-prem OData endpoint without a Custom API wrapper.   |        |           |                       |
|         Recommendation: XHR $select; Custom API only if OData blocked.       |        |           |                       |
| OQ-002: Designer parent attribute picker — all entity attributes (metadata   | Medium | CEO / BA  | Before architecture   |
|         driven) vs a maker-typed logical name? Recommendation: metadata      |        |           |                       |
|         picker filtered to scalar types (text/number/picklist/datetime/bool).|        |           |                       |
| OQ-003: Rating clear-selection — should clicking a selected star deselect    | Low    | CEO       | Before architecture   |
|         (0 stars / no value)? Recommendation: yes, unless field is required. |        |           |                       |
| OQ-004: Risk — hidden grid columns must be excluded from submission           | Medium | QA        | Phase 4               |
|         validation; confirm gridColumnState is applied before cell validation.|        |           |                       |
| OQ-005: Risk — on-prem manual picklist option addition may be missed during  | High   | IT Ops    | Before deployment     |
|         deployment; a missing rating or gridColumn option value causes the   |        |           |                       |
|         publisher to silently omit the feature metadata for on-prem orgs.    |        |           |                       |


14. GLOSSARY
───────────────────────────────────────────────────
gridColumnState: New map in RuleEvaluationResult, keyed by gridFieldId:columnId,
  holding active column-level actions per column.
parentRecordValues: Transient client-side dictionary populated at form load from
  the parent CRM record's fetched attributes, keyed by attribute logical name.
source discriminator: Optional property on RuleCondition ('form' | 'parentRecord').
  Absent means 'form'; governs which value store the condition evaluates against.
qdb_parent_prefetch_attrs: New memo column on qdb_form storing a JSON array of
  parent entity attribute logical names to fetch at form load.
qdb_target_grid_id: New optional nvarchar column on qdb_business_rule storing the
  parent Entry Grid field schema name when targetKind = 'gridColumn'.
Two-generator constraint: DFE has two independent form-JSON generators (Node
  CrmMetadataService and C# FormJsonGenerator plugin) that must be updated together.


15. REQUIREMENTS TRACEABILITY MATRIX
───────────────────────────────────────────────────
| User Story | Functional Requirements                              | Objective  | Test Case (QA fills) | Status |
|------------|------------------------------------------------------|------------|----------------------|--------|
| US-01      | FR-001, FR-002, FR-004, FR-005, FR-006               | BO-1       | TC-001 (pending)     | Draft  |
| US-02      | FR-001, FR-005, FR-006                               | BO-1       | TC-002 (pending)     | Draft  |
| US-03      | FR-009, FR-010, FR-011, FR-012, FR-013, FR-014, FR-015 | BO-2     | TC-003 (pending)     | Draft  |
| US-04      | FR-017, FR-018, FR-019, FR-020, FR-021, FR-022       | BO-3       | TC-004 (pending)     | Draft  |
| US-05      | FR-008, FR-015, FR-016, FR-023, NFR-005              | BO-4, BO-5 | TC-005 (pending)     | Draft  |
| —          | FR-003, FR-007 (C# publisher — grid column)          | BO-1, BO-5 | TC-006 (pending)     | Draft  |
| —          | FR-016 (C# publisher — parent condition)             | BO-2, BO-5 | TC-007 (pending)     | Draft  |
| —          | FR-023 (C# publisher — rating)                       | BO-3, BO-5 | TC-008 (pending)     | Draft  |


16. APPROVAL
───────────────────────────────────────────────────
| Role          | Name              | Decision  | Date |
|---------------|-------------------|-----------|------|
| CEO           | Pending           | PENDING   |      |
| Requestor     | Pending           | PENDING   |      |

═══════════════════════════════════════════════════
END OF DOCUMENT
═══════════════════════════════════════════════════
