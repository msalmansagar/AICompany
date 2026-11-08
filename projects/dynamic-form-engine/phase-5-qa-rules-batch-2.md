═══════════════════════════════════════════════════
QA PHASE DOCUMENT
═══════════════════════════════════════════════════
Project:        DFE-RULES-002 — Business Rules Batch 2
Prepared by:    MSS Technologies — QA Engineer
Branch:         feat/dfe-rules-batch-2
Commits:        685b4b05, 9b67b3a2, 8065cf7c, 901993cf, ed10d9d7
Date:           2026-09-30
Demo form:      rules-batch-2-demo (org5869857f)
═══════════════════════════════════════════════════

ADDENDUM (orchestrator, 2026-09-30, after this document was written)
───────────────────────────────────────────────────
- RATING GATE LIFTED. The CEO gave the go-ahead; option 100000002 "Rating" was added
  to qdb_radio_render_style on org5869857f and read back. The reseeded demo publishes
  rb2_satisfaction with radioRenderStyle=rating. UAT-07 is runnable. Every "BLOCKED"
  note below about the Rating option is superseded.
- DEF-001 FIXED. The rating group is now named "<label>: N of M stars" in both the
  interactive and read-only forms. Test: RatingControl_StoredValue_AnnouncesValueOutOfMax.
- GAP-004 FIXED. The Entry Grid logs grid_column_rule_target_missing (warn) when a rule
  names a column the grid lacks. Tests: findUnknownRuleColumns in gridColumnRuleState.test.ts.
- GAP-001, GAP-002, GAP-003, GAP-005 remain open, as listed below.
- Frontend suite after the fixes: 72 files, 629 tests, all passing.

DEF-002 — Grid column "Is Editable" saved but never honoured (bug-fix, 2026-10-04)
───────────────────────────────────────────────────
Symptom:      A grid column set to Is Editable = No in the designer stayed editable at runtime.
Reproduction: feature-showcase / qdb_field_entries, column "Required": stored
              qdb_is_editable = false, published JSON carried no read-only flag, cell editable.
Expected:     The designer's Is Editable switch decides whether a column's cells can be edited.
Violates:     The designer's Is Editable property (GridColumnPanel), which promised the behaviour.
Root cause:   Neither publisher read qdb_is_editable. The runtime already honoured a published
              column isReadonly, but only rules ever set it. Pre-dates this batch.
Fix:          Both publishers emit isReadonly: true only when qdb_is_editable is explicitly
              false; true or absent emits nothing, so older grids and on-prem orgs without the
              column publish byte-identically. A rule's make-editable still overrides the lock.
              The designer now defaults a new column to editable (it defaulted to No).
Tests:        CrmMetadataService.gridColumnEditable.test.ts (3), GridColumnEditableTests.cs (3),
              gridColumnRuleState.test.ts (+2 precedence). Backend 468, frontend 659,
              designer 761, C# 124 — all passing.
Live:         Plugin + designer deployed to org5869857f. feature-showcase republished: the
              Required column publishes isReadonly: true and renders DISABLED in real Chrome
              with the runtime bundle; the other three columns stay editable.
              rules-batch-2-demo republished: no column carries the flag.
Data check:   Of 85 columns on org5869857f, the only entry-grid column set to No is the one
              above. Selection-grid columns set to No now carry the flag; selection grids never
              edit cells, so nothing changes there. ON-PREM DATA NOT CHECKED: an on-prem entry
              column saved with the old designer default (No) will lock after the new DLL.
Open:         A column both Required and Is Editable = No blocks submit while empty, because grid
              validation does not skip locked columns. Rule-locked columns already behave this
              way. Not fixed here; follow-up. -> Fixed as DEF-003 below.

DEF-003 — Required cell in a locked grid column blocks submit (bug-fix, 2026-10-05)
───────────────────────────────────────────────────
Symptom:      An entry-grid column both Required and read-only failed submit with "<column> is
              required" while its cell was empty, and the user could not type into it.
Reproduction: feature-showcase / qdb_field_entries, the locked "Required" column marked
              required in a test copy; row added, editable cells filled, Submit -> blocked.
Expected:     A cell the user cannot fill is not required of the user. Precedent: a column a
              rule hides is already made optional (gridColumnRuleState) for this reason.
Root cause:   Grid validation and the header mark read isRequired alone. Three lock sources
              were ignored: Is Editable = No (DEF-002), a column rule (make read-only), and the
              whole grid made read-only by a field rule or its own setting (found in review).
Fix:          shared isGridColumnRequired = isRequired and not locked, used by validateGridCell
              and the header asterisk. At submit, lockColumnsOfReadonlyGrids marks every column
              of a read-only grid locked (rule verdict ?? published setting, as the renderers
              decide). A rule that unlocks the column restores the requirement. Grid cells are
              validated only in the browser, so no backend or plugin change.
Tests:        gridCellValidation.test.ts (+2), EntryGridField.test.tsx (+3),
              gridColumnRuleState.test.ts (+5). Frontend 669 passing, tsc clean.
Live:         Runtime deployed to org5869857f, hash matches the local build. Real Chrome with
              the deployed bundle: locked + required + empty -> no error, header shows no "*".
              Control (an editable required column left empty) -> "Row 1: ... is required".
Not changed:  A top-level field that is required and read-only still blocks while empty. That
              is long-standing engine-wide behaviour, not grid-specific.


1. TEST STRATEGY SUMMARY
───────────────────────────────────────────────────

Scope: seven client items across four layers — frontend runtime, designer,
backend portal API, and C# FormJsonGenerator plugin.

Item 1  Grid-column rules (show/hide/required/readonly per column)
Item 2  Conditions on the record selected in a lookup
Item 3  Disable-options rule action
Item 4  Calculated-value rule action
Item 5  Relative date — lower bound (not before today / X years)
Item 6  Relative date — upper bound (not after end-of-month / X years)
Item 7  Rating render style (star control)

Applied patterns from qa.json:
- QA-P-001 (high confidence): Live-org round trip is acceptance evidence for
  CRM work. Green tests are necessary, not sufficient. Item 7 cannot be live-
  verified until the Rating picklist option is provisioned; the UAT step below
  calls this out explicitly.
- QA-P-002 (high confidence): Every documented sentinel gets its own test.
  The null/empty-lookup sentinel in relatedRecordFacts.ts is tested.
  The absent-discriminator (source defaults to 'form') sentinel is tested
  in the C# publisher.

Tools: Vitest (frontend, designer, backend), Xunit (C# plugin), Playwright
planned for RTL and keyboard E2E. No Playwright tests exist in this engagement;
that is a known gap called out in the Automation Plan.

Coverage gate: gate-coverage.sh is SKIP for this project — no coverage script
is wired to any of the four sub-packages. The 80% NFR-006 requirement cannot
be mechanically verified. See Automation Plan.

Traceability gate (run 2026-09-30): 39/228 IDs linked across the full DFE
project (17%). For batch-2 specifically, FRs are tagged in source comments
(e.g. "DFE-RULES-002 item 1") but test names do not carry `[FR-XXX]` prefixes.
Constitution Article XV is warn-only at adoption; this is not a block.


2. TEST ENVIRONMENT REQUIREMENTS
───────────────────────────────────────────────────

Automated suites
- Node.js 20+, pnpm/npm installed
- .NET 4.8 SDK and .NET Framework 4.8 targeting packs for C# tests
- Run from branch feat/dfe-rules-batch-2; commits above on top of main

Live-org UAT
- org5869857f.crm4.dynamics.com — administrator credentials
- Ctrl+F5 after every deploy (QA-M-001 prevention)
- Perform each step TWICE to clear the plugin sandbox cache (QA-M-002 prevention)
- Demo form seed: scripts/seed-rules-batch-2-demo.mjs — must have been run
- RATING GATE: items 7/UAT/rating steps are BLOCKED until `provision-rating-
  render-style.mjs` has been run with CEO go-ahead (architecture §3)

Arabic/RTL
- Browser language set to Arabic or use lang="ar" attribute on the form host
- Confirm direction indicator shows RTL before starting rating RTL steps


3. SUITE COUNTS (verified 2026-09-30)
───────────────────────────────────────────────────

Package          | Files | Tests | Result | Duration
frontend/        |    72 |   626 |  PASS  |  83.21s
designer/        |    75 |   751 |  PASS  | 144.82s
backend/         |    45 |   459 |  PASS  |  29.77s
C# plugin        |     1 |   113 |  PASS  |   0.96s
─────────────────────────────────────────────────────
TOTAL            |   193 | 1,949 |  PASS  |


4. TRACEABILITY TABLE
───────────────────────────────────────────────────
Maps each FR/AC in the BRD (plus architecture corrections) to the automated
tests that cover it. Architecture superseded FR-002, FR-003, FR-010, and part
of FR-011; the table notes each correction.

Note: "Arch superseded" means the architecture phase changed the design such
that the FR was satisfied differently or the artefact it named was not built.
The behaviour the FR intended is still covered by the replacement design.

────────────────────────────────────────────────────────────────────────────
GROUP A — GRID COLUMN RULES
────────────────────────────────────────────────────────────────────────────

FR-001  Action types showColumn/hideColumn/makeColumnRequired/makeColumnOptional/
        makeColumnReadonly/makeColumnEditable added to shared types.
        Tests:
          frontend  RuleEngine.gridColumns.test.ts — all 5 tests
          backend   CrmMetadataService.rulesBatch2.test.ts
                    "should_map_%s_to_%s" (5 action mappings)
          C#        RulesBatch2Tests.cs
                    Generate_PublishesAGridColumnAction_WithGridAndColumnTargets
                    (Theory: 6 InlineData cases)
        Coverage: HIGH

FR-002  'gridColumn' added to RuleTargetKind union.
        Arch superseded: no RuleTargetKind union was created. The target kind
        is implied by which target ids a rule carries. Grid-column actions
        carry targetFieldId (grid) + targetColumnId (column). The intent of
        FR-002 is satisfied by this design. Tests that exercise grid-column
        actions prove the discriminated path works.
        Coverage: HIGH (via FR-001 tests)

FR-003  New qdb_target_grid_id column on qdb_business_rule.
        Arch superseded: the column was not provisioned. All grid-column
        targeting is encoded inside qdb_conditions_json, same as every
        other rule target. No column needed; no provisioning step.
        Coverage: N/A (requirement eliminated)

FR-004  Designer grid-field picker and column picker for gridColumn target.
        Tests:
          designer  GridColumnTargetPicker.test.tsx
                    offersOnlyTheSelectedGridsColumns
                    clearsTheColumn_whenTheGridChanges
                    storesTheColumnId
                    disablesTheColumnPicker_untilAGridIsChosen
        Coverage: HIGH

FR-005  RuleEngine evaluates 'gridColumn' rules; gridColumnState map in result.
        Tests:
          frontend  RuleEngine.gridColumns.test.ts
                    should_hide_the_column_when_the_condition_holds
                    should_combine_several_actions_on_one_column
                    should_set_optional_and_editable_as_false_flags
                    should_leave_the_column_untouched_when_the_condition_fails
                    should_ignore_a_column_action_that_names_no_column
        Coverage: HIGH

FR-006  Entry Grid reads gridColumnState; applies visibility/required/readonly.
        Tests:
          frontend  gridColumnRuleState.test.ts — 10 tests covering
                    applyGridColumnRuleState and applyGridColumnRuleStateToForm
                    including header/footer grids
        GAP: No React component-level test wires the function into the Entry
        Grid render. The pure function is tested; the component wiring is not.
        See GAP-005.
        Coverage: MEDIUM

FR-007  C# publisher reads grid column targets and includes gridFieldId in JSON.
        Arch note: no qdb_target_grid_id column was created; publisher reads
        target_column_id from inside qdb_conditions_json instead.
        Tests:
          C#  RulesBatch2Tests.cs
              Generate_PublishesAGridColumnAction_WithGridAndColumnTargets
              Generate_DropsAColumnAction_WithNoColumnId
          backend  CrmMetadataService.rulesBatch2.test.ts
                   should_publish_the_grid_and_column_targets
                   should_drop_a_column_action_without_a_column
        Coverage: HIGH

FR-008  Leave column in default state; log a structured warning for missing
        column/grid reference.
        Tests (degradation only):
          frontend  RuleEngine.gridColumns.test.ts
                    should_ignore_a_column_action_that_names_no_column
          frontend  gridColumnRuleState.test.ts
                    should_ignore_state_for_a_column_the_grid_does_not_have
        GAP: gridColumnRuleState.ts emits NO logger call when a missing
        column is encountered. The structured warning required by FR-008 is
        absent from the implementation. See GAP-004 (DEFECT).
        Coverage: PARTIAL

────────────────────────────────────────────────────────────────────────────
GROUP B — PARENT RECORD (LOOKUP-SELECTED RECORD) CONDITIONS
────────────────────────────────────────────────────────────────────────────
NOTE: Architecture §2.2 replaced the BRD's "parent record" framing with
"record selected in a lookup on the form" (CEO decision 2026-09-30, Reading C).
All FRs below are interpreted against the revised design.

FR-009  Optional source discriminator ('form' | 'parentRecord') on RuleCondition.
        Arch note: the discriminator is `relatedAttribute` — a condition with
        relatedAttribute reads from the lookup's selected record; without it,
        reads from form field values. Absent relatedAttribute = 'form' behaviour
        is preserved exactly.
        Tests:
          frontend  RuleEngine.related.test.ts — 5 tests covering match,
                    non-match, numeric comparison, empty, and label confusion
          frontend  relatedRecordFacts.test.ts — 5 tests
          C#  RulesBatch2Tests.cs
              Generate_PublishesTheRelatedColumnOfALookupCondition
              Generate_LeavesAPlainConditionWithoutARelatedColumn
        Coverage: HIGH

FR-010  New qdb_parent_prefetch_attrs memo column on qdb_form.
        Arch superseded: no prefetch column on the form. Attributes to fetch
        are derived at runtime from relatedAttribute fields across active rules.
        No provisioning step needed.
        Coverage: N/A (requirement eliminated)

FR-011  Fetch parent record at form load using parentRecordId.
        Arch superseded: no parentRecordId. Fetch is triggered per lookup
        on each rule evaluation cycle. createRelatedFactResolver handles this.
        Tests:
          frontend  relatedRecordFacts.test.ts
                    should_read_every_named_column_of_the_selected_record_in_one_call
                    should_read_a_record_once_across_evaluations (cache)
        Coverage: HIGH (revised design)

FR-012  Skip fetch when qdb_parent_prefetch_attrs absent/empty or
        parentRecordId is null.
        Arch redesigned: skip when the lookup value is null/empty.
        Tests:
          frontend  relatedRecordFacts.test.ts
                    should_give_null_facts_and_read_nothing_when_the_lookup_is_empty
                    should_read_nothing_for_a_form_without_related_conditions
        Coverage: HIGH

FR-013  Designer condition picker: "Parent Record" source toggle; sets
        relatedAttribute in the saved condition.
        Tests: NONE — the `related_attribute` input exists in
        RuleConfigScreen.tsx but no designer test exercises the lookup-field
        condition path. See GAP-001.
        Coverage: NONE (GAP)

FR-014  RuleEngine evaluates relatedAttribute conditions against the lookup
        record's values rather than form field values.
        Tests:
          frontend  RuleEngine.related.test.ts
                    should_match_a_related_option_value_whether_stored_as_number_or_string
                    should_not_match_when_the_related_value_differs
                    should_compare_related_numbers
                    should_not_confuse_the_lookup_value_with_its_related_column
        Coverage: HIGH

FR-015  Evaluate as false when related values absent; log structured warning.
        Tests (false evaluation only):
          frontend  RuleEngine.related.test.ts
                    should_treat_an_unread_related_column_as_empty
          frontend  relatedRecordFacts.test.ts
                    should_give_null_facts_when_the_read_fails
        Note: relatedRecordFacts.ts logs `logger.error('related_record_read_failed')`
        on read failure. Test verifies the null facts but not the log call.
        Coverage: MEDIUM

FR-016  C# publisher preserves relatedAttribute in condition JSON.
        Tests:
          C#  RulesBatch2Tests.cs
              Generate_PublishesTheRelatedColumnOfALookupCondition
              Generate_LeavesAPlainConditionWithoutARelatedColumn
        Coverage: HIGH

Backend portal route (SEC-RR findings, architecture §2.2):
  SEC-RR-001 scope enforcement (filter expression applied)
  SEC-RR-002 Dataverse error text masked to 404
  SEC-RR-003 rate limit (429 on second request over limit)
  SEC-RR-004 column name logical-name allowlist
  Tests:
    backend  RelatedRecordService.test.ts — 7 tests
    backend  related-records.routes.test.ts — 3 tests
  Coverage: HIGH

────────────────────────────────────────────────────────────────────────────
GROUP C — RATING RENDER STYLE
────────────────────────────────────────────────────────────────────────────

FR-017  'rating' added to FieldRenderStyle union in shared types.
        Tests:
          backend   CrmMetadataService.rulesBatch2.test.ts
                    should_map_option_100000002_to_rating
          C#  RulesBatch2Tests.cs  ToRadioRenderStyle_MapsEachOption
              (InlineData 100000002, "rating")
        Coverage: HIGH

FR-018  'rating' added as new option value to qdb_radio_render_style picklist.
        Status: BLOCKED — script provision-rating-render-style.mjs exists but
        has NOT been run. Requires explicit CEO go-ahead (architecture §3).
        No automated test possible for a provisioning step. Must be verified
        manually after provisioning. See UAT step UAT-07-01.
        Coverage: MANUAL GATE

FR-019  Option-set field renders as interactive stars; click stores option code.
        Tests:
          frontend  RatingControl.test.tsx
                    RatingControl_ClickThirdStar_StoresThirdOptionInDisplayOrder
                    RatingControl_StoredValue_ChecksTheMatchingStar
                    RatingControl_DisabledStar_IsAnnouncedAndIgnored
        Coverage: HIGH

FR-020  Rating renders as read-only when isReadonly=true or summary mode.
        Tests:
          frontend  RatingControl.test.tsx
                    RatingControl_Readonly_RendersNoInputs
        Coverage: HIGH

FR-021  RTL star order (rightmost = 1 star) for Arabic / RTL locale.
        Tests: NONE — implementation delegates to Fluent's document-direction
        handling (confirmed in source comment). No unit test verifies the star
        order under an RTL document. See GAP-003. Must be verified manually.
        Coverage: MANUAL ONLY

FR-022  Designer Render Style dropdown includes "Rating" for option-set fields.
        Tests:
          designer  DropdownFieldPanel.displayStyle.test.tsx
                    offersListCardsOrRating_forARadio
                    offersNoStyle_forAMultiSelect
                    savesRating_whenChosen
                    showsTheSavedStyle
        Coverage: HIGH

FR-023  C# PicklistMapper maps option 100000002 to 'rating' in published JSON.
        Tests:
          C#  RulesBatch2Tests.cs  ToRadioRenderStyle_MapsEachOption
              (covers all three codes including 100000002)
        Coverage: HIGH

────────────────────────────────────────────────────────────────────────────
ITEMS 3, 4, 5, 6 (commit 685b4b05 — disable options, calculated value,
                   relative date bounds)
────────────────────────────────────────────────────────────────────────────

Item 3 — Disable options
  frontend  RuleEngine.disableOptions.test.ts — 4 tests (JSON array, CSV,
            numeric values, condition-fails path)
  designer  ActionValueEditor.test.tsx — option checkboxes for disableOptions
  backend   CrmMetadataService.rulesBatch2.test.ts
            should_publish_disable_options_with_the_option_list
  C#  Generate_PublishesDisableOptions_WithTheOptionList
  Coverage: HIGH

Item 4 — Calculated value
  frontend  ruleValueTargets.test.ts — 4 tests (rekey by schema name)
  designer  ActionValueEditor.test.tsx — expression input for calculateValue
  backend   CrmMetadataService.rulesBatch2.test.ts
            should_publish_calculate_value_with_its_expression
  C#  Generate_PublishesCalculateValue_WithItsExpression
  Coverage: HIGH

Item 5 / 6 — Relative date bounds
  frontend  dateBounds.test.ts — 5 tests (min today, max monthEnd+10y,
            strict bound ±1 day, cross-field target ignored, inactive ignored)
  frontend  relativeDate.test.ts — covers the @today/@monthEnd resolver
  frontend  ValidationEngine.relativeDate.test.ts
  designer  RelativeDateRefEditor.test.tsx — expression composer UI
  C#  Generate_CarriesARelativeDateTargetVerbatim
  Coverage: HIGH


5. DEFECTS
───────────────────────────────────────────────────

DEF-001 — NFR-004 aria-label does not announce current value and maximum
Confidence: 90%
Severity: Medium
Location: frontend/src/components/forms/controls/RatingControl.tsx line 67

NFR-004 requires: "aria-label stating current value and maximum
(e.g. '3 out of 5 stars')".

The implementation passes aria-label={field.label} (the field's display
name, e.g. "Satisfaction") to the Fluent Rating group. This names the
widget but does not announce the current value or maximum. A screen-reader
user hears the field label on focus, then individual star names (e.g. "Fair,
radio, 2 of 3") via itemLabel — the composite "X of Y" sentence required by
NFR-004 is absent from the group label.

Fix (not applied here — production code freeze): compute
`aria-label={`${field.label}: ${starValue} of ${options.length} stars`}`
or equivalent, updated on each value change.


6. GAPS (no test coverage)
───────────────────────────────────────────────────

GAP-001: FR-013 — Designer related-attribute condition input untested
Confidence: 95%
Risk: High
A maker configures a related-record condition by selecting a lookup field in
the condition row and entering a related attribute logical name. This path
exists in RuleConfigScreen.tsx (lines 471–486) and businessRule.ts type
`related_attribute?: string`, but no designer test exercises it. If the
input is accidentally broken (e.g. the field is hidden for non-lookup fields
or the value is not persisted), it would be caught only by manual testing.
Action: Add a test in designer/tests/screens/RuleConditionRow.test.tsx
(or extend RuleConfigScreen tests) that renders a condition row for a lookup
field and asserts the related-attribute input appears and persists its value.
Not closed here: rendering RuleConfigScreen requires significant test
infrastructure not currently set up for it.

GAP-002: NFR-004 keyboard navigation not tested
Confidence: 90%
Risk: Medium
Fluent's Rating component handles left/right arrow-key navigation natively.
No test verifies this in the deployed bundle. Keyboard-only users could be
blocked if the Fluent version behaviour regresses.
Action: Playwright E2E test (Tab to rating, ArrowRight increases value,
ArrowLeft decreases, Enter/Space selects). See Automation Plan.

GAP-003: FR-021 RTL star order not tested
Confidence: 85%
Risk: Medium
The RatingControl.tsx source comment asserts "Fluent follows document
direction with no extra handling". No unit or integration test sets
document direction to RTL and verifies the rendered star order. The risk is
low as Fluent's RTL support is a library guarantee, but a regression in the
Fluent version could go unnoticed.
Action: Playwright E2E test: render RatingControl inside a dir="rtl"
container; assert the first star (displayOrder=1) is rendered on the right.
Alternatively, a DOM assertion in an JSDOM test that checks whether
dir="rtl" is propagated from the Fluent provider.

GAP-004: FR-008 — Structured warning log missing from implementation
Confidence: 85%
Risk: Low
FR-008 requires a structured warning when a rule references a gridFieldId
or columnId absent from the form. gridColumnRuleState.ts silently ignores
the missing column (correct), but emits no logger call. The warning is not
implemented. Tests verify the correct degradation result but cannot test a
call that is absent.
Action: Add `logger.warn('grid_column_rule_target_missing', { rule, columnId })`
inside applyColumnState when state is undefined but the rule named the column.
Then add a test using vi.spyOn on the logger. NOT applied here (production
code freeze).

GAP-005: FR-006 — No Entry Grid component integration test
Confidence: 80%
Risk: Low
applyGridColumnRuleState and applyGridColumnRuleStateToForm are unit-tested.
The wiring — that the Entry Grid component calls applyGridColumnRuleStateToForm
with the live gridColumnState before rendering — is not independently tested.
If a refactor decouples the wiring, the unit tests would still pass.
Action: An integration or component test that renders EntryGridField with a
rule state that hides a column and asserts the column header is absent.


7. MANUAL UAT SCRIPT — DEMO FORM rules-batch-2-demo, org5869857f
───────────────────────────────────────────────────

PREREQUISITE: Ctrl+F5 before opening the form (GOT-016). Run each verification
step twice (QA-M-002).

────────────────────────
ITEM 1 — GRID COLUMN RULES
────────────────────────

UAT-01-01: Hide a grid column by rule (US-01 AC-1, FR-005, FR-006)
  Given: rules-batch-2-demo form open; Request Type field visible
  When: set Request Type = Import
  Then: the HS Code column in the Line Items grid disappears;
        all other columns remain visible
  When: change Request Type to any other value
  Then: HS Code column reappears

UAT-01-02: Show a grid column by rule (FR-005, FR-006)
  Given: Request Type set to a value other than Import
  When: verify HS Code is visible (default state)
  When: set Request Type = Import (triggers hideColumn)
  Then: HS Code is hidden
  When: set Request Type = Export (triggers showColumn rule if configured,
        or verify showColumn overrides static hidden=true on a column so
        configured)
  Then: the column becomes visible even if its static configuration is hidden

UAT-01-03: Required column by rule (US-02 AC-1, FR-005, FR-006)
  Given: a rule "if Priority=High then makeColumnRequired(Notes) on Grid1"
  When: set Priority = High; attempt to submit with Notes column empty
  Then: submission fails; Notes column header shows required indicator
  When: set Priority to any other value; submit with Notes empty
  Then: submission succeeds (Notes is optional)

UAT-01-04: Hidden column skipped in validation (OQ-004 resolution, arch §2.1)
  Given: Notes is required by configuration (static)
  When: a rule hides Notes (hideColumn)
  Then: the Notes column is hidden AND submission succeeds even with no value
        in Notes (the column was made optional when it was hidden)

UAT-01-05: Missing column reference does not break the form (FR-008)
  Given: a rule whose targetColumnId does not match any column in the grid
  When: the rule condition is met
  Then: the form renders normally; no error; the missing column target is
        silently ignored

────────────────────────
ITEM 2 — CONDITIONS ON A LOOKUP-SELECTED RECORD
────────────────────────

UAT-02-01: Rule fires based on lookup selection (US-03 AC-1, FR-014)
  Given: the form has a Sponsor lookup and a Bank Letter field
  When: select a Sponsor record whose Industry Code = Finance (code 6)
  Then: the rule "if Sponsor.industrycode=6 then hide Bank Letter" fires
        and Bank Letter is hidden

UAT-02-02: Rule clears when lookup changes (FR-014)
  Given: UAT-02-01 is done; Bank Letter is hidden
  When: change the Sponsor selection to a record with Industry Code != 6
  Then: Bank Letter becomes visible again (rule no longer holds)

UAT-02-03: No related lookup selected → rule does not block the form (FR-015)
  Given: the Sponsor lookup is empty (no selection)
  Then: Bank Letter remains in its default visible state;
        the form is fully usable; no error

UAT-02-04: Portal rate limiting (SEC-RR-003)
  Given: a portal session (not in-CRM)
  When: rapidly change the Sponsor lookup 61 times within one minute
  Then: the 61st lookup change returns a 429 response; the rule gracefully
        evaluates to false for that evaluation; no user-visible crash

UAT-02-05: Invalid record ID does not reach Dataverse (SEC-RR-004)
  Given: in a portal session, the hidden lookup ID is manipulated to a
        non-GUID string (dev tools / intercept)
  Then: the backend returns 400; the form evaluates the condition as false;
        no Dataverse error text is exposed in the response

────────────────────────
ITEM 3 — DISABLE OPTIONS
────────────────────────

UAT-03-01: Options are disabled by rule condition
  Given: a Tier field with options Silver/Gold/Platinum
  When: set Applicant Type = Individual
  Then: Gold and Platinum appear grayed out and are not selectable;
        Silver is selectable

UAT-03-02: Disabled options re-enable when condition clears
  Given: UAT-03-01 done; Gold/Platinum disabled
  When: change Applicant Type to Corporate
  Then: Gold and Platinum are selectable again

────────────────────────
ITEM 4 — CALCULATED VALUE
────────────────────────

UAT-04-01: Target field is set by expression when condition holds
  Given: a rule "if Quantity is not empty then set Total = {quantity} * 1.1"
  When: enter Quantity = 100
  Then: Total is populated with 110 automatically

UAT-04-02: Expression value does not overwrite a manually set value after
           the condition clears
  Given: Quantity entered; Total = 110
  When: clear Quantity (condition no longer holds)
  Then: Total retains its calculated value; no automatic reset

────────────────────────
ITEMS 5 AND 6 — RELATIVE DATE BOUNDS
────────────────────────

UAT-05-01: Date field rejects a past date (>= @today lower bound)
  Given: a Start Date field with rule crossField operator >= @today
  When: attempt to enter yesterday's date
  Then: the date picker min is today; yesterday is not selectable

UAT-05-02: Date field rejects a date beyond the upper bound (<= @monthEnd+10y)
  Given: an End Date field with rule crossField operator <= @monthEnd+10y
  When: attempt to enter a date more than 10 years from end of current month
  Then: the date is beyond the picker max; the field shows a validation error

UAT-06-01: Strict bound steps by one day (> @today means tomorrow is minimum)
  Given: a Date field with rule crossField operator > @today
  Then: the picker minimum is tomorrow (not today)

────────────────────────
ITEM 7 — RATING STYLE
★ BLOCKED until provision-rating-render-style.mjs is run with CEO go-ahead ★
────────────────────────

UAT-07-01: Provisioning gate (FR-018)
  Step: confirm that the qdb_radio_render_style picklist on qdb_form_field
        in org5869857f includes option "Rating" (value 100000002).
  If absent: run scripts/provision-rating-render-style.mjs and republish;
  then re-open the form with Ctrl+F5.
  If the option is absent after the script, DO NOT proceed with UAT-07 steps.

UAT-07-02: Stars render for a picklist field configured as Rating (FR-019)
  Given: UAT-07-01 PASS; the Satisfaction field has renderStyle = rating
         with 5 options in display order 1–5
  When: open the form
  Then: five star icons render instead of a dropdown; no text input

UAT-07-03: Clicking star 3 stores the third option's code (FR-019, US-04 AC-1)
  When: click the third star (Fair)
  Then: the first three stars fill; the field value = option code of Fair
        (e.g. 100000002)

UAT-07-04: Clicking the same star again offers a Clear button if optional (OQ-003)
  Given: star 3 selected; field is optional
  Then: a Clear button is visible beside the stars
  When: click Clear
  Then: all stars are unfilled; the field value is null

UAT-07-05: Required rating has no Clear button (FR-020, OQ-003)
  Given: the Satisfaction field is marked required
  Then: no Clear button appears regardless of the selected star value

UAT-07-06: Read-only stars show value but accept no interaction (FR-020, US-04 AC-3)
  Given: the form is in summary/review mode or isReadonly=true
  Then: stars display the stored value; clicking a star changes nothing

UAT-07-07: RTL — stars render right-to-left for Arabic locale (FR-021, US-04 AC-2)
  Given: browser/form language = Arabic (or dir="rtl" set on the host)
  Then: the first star (1 star, worst) is on the RIGHT;
        the last star (5 stars, best) is on the LEFT
  Note: Fluent manages this via document direction. Verify that the form
        host correctly sets dir="rtl" for Arabic forms.

UAT-07-08: Accessibility — aria-label and keyboard (NFR-004)
  Given: a screen reader is active (NVDA / VoiceOver)
  When: Tab into the rating widget
  Then: screen reader announces the field label
  When: use arrow keys
  Then: each star is announced by its label (Poor, Fair, Good, etc.)
  Note: DEF-001 — the composite "X of Y stars" group announcement is absent.
        This is a known defect; verify the per-star labels work correctly.
  When: press ArrowRight from the 2nd star
  Then: the 3rd star is selected and announced

UAT-07-09: Backward compatibility — existing dropdown and radio fields are
           unchanged (NFR-005, US-05 AC-1)
  Given: any form with a dropdown field not configured as rating
  Then: the field renders as a dropdown; no stars appear

────────────────────────
KEYBOARD-ONLY PASS (WCAG 2.1 AA, NFR-004)
────────────────────────

UAT-KB-01: Tab through all form fields; confirm each reaches the rating widget
UAT-KB-02: From the rating widget, ArrowLeft/ArrowRight changes the star value
UAT-KB-03: Tab past the rating widget moves to the next focusable field
UAT-KB-04: Tab into the Clear button (if present); press Space/Enter clears value
UAT-KB-05: In read-only mode, the widget is focusable but accepts no key input


8. EDGE CASES NOT YET COVERED — RANKED BY RISK
───────────────────────────────────────────────────

EC-01 (Critical): A grid-column rule fires, hides a column, then re-shows it
      in a subsequent evaluation. The column should become visible and restore
      its configured required state. The makeColumnOptional side-effect of
      hideColumn must not persist after showColumn fires. No test covers this
      "toggle" path.

EC-02 (High): Two grid-column rules conflict: one fires hideColumn on column X,
      another fires showColumn on column X simultaneously. The architecture
      says "last rule wins" (same policy as field-level rules). No test verifies
      the ordering/precedence of conflicting column actions.

EC-03 (High): A lookup field used in a related condition is itself hidden by a
      rule. The lookup value becomes null when the field is hidden; the related
      fact resolver should yield null facts. No test covers this combined path.

EC-04 (Medium): A related condition references a lookup whose configured entity
      logical name is absent from the form definition. The resolver would fail
      to determine the entity set. No test covers this defensive path.

EC-05 (Medium): The portal rate-limiter is per-backend-instance (not global).
      Under horizontal scaling, a user hitting two instances could make 2×N
      requests per minute. The architecture notes this as accepted. No test
      verifies the per-instance accounting.

EC-06 (Medium): A rating field has only one active option. RatingControl.tsx
      line 46 returns null (`if (options.length < 2) return null`). This silently
      hides the field rather than showing a single star. A maker expecting a
      one-star rating field would see nothing. No test documents this behavior.

EC-07 (Low): The qdb_conditions_json column contains a valid rule JSON but with
      a grid-column action whose target_field_code resolves to a non-grid field.
      The C# publisher and backend service should degrade gracefully. No explicit
      test for this cross-type mismatch.

EC-08 (Low): A disabled option in a rating field (disableOptions rule active).
      The star is announced "(unavailable)" and clicking it does nothing. This is
      tested in RatingControl.test.tsx but not for the combined scenario where a
      rule enables and then disables the same option in one evaluation cycle.


9. PERFORMANCE BENCHMARKS
───────────────────────────────────────────────────

| Scenario                                    | Target p95   | Notes                              |
|---------------------------------------------|--------------|------------------------------------|
| RuleEngine.evaluate with 20 grid-col rules  | < 10ms       | Synchronous; measured in unit tests|
| Related record fetch (portal)               | < 500ms      | Single Dataverse query; p95 target |
| Related record cache hit                    | < 1ms        | In-process Map; unit-verified      |
| Rating render (initial)                     | < 100ms      | Fluent component; no network       |

NFR-001 notes: RuleEngine grid-column evaluation is synchronous (no async in
gridColumnRuleState.ts or the evaluation path). Related record fetch is async
and cached per record id per session. Both satisfy NFR-001.

No k6 / Artillery baseline exists for this engagement. A Portal load test
targeting /api/related-records at 50 concurrent users with 10 lookups/user/min
is recommended before go-live.


10. AUTOMATION PLAN
───────────────────────────────────────────────────

Automated (current)
  Unit — frontend, designer, backend Vitest; C# Xunit
  All run in CI on every push to feat/dfe-rules-batch-2 and on PR to main

Manual (required before sign-off)
  UAT-07 (rating steps): BLOCKED until provisioning. Manual after CEO go-ahead.
  UAT-KB (keyboard-only pass): requires screen reader; manual.
  UAT-02-04/05 (rate-limit, ID injection): requires portal session; manual.
  RTL verification (UAT-07-07): requires Arabic browser session; manual.

Recommended additions (not blocking current phase gate)
  Playwright E2E: arrow-key navigation on RatingControl (GAP-002)
  Playwright E2E: RTL star order under dir="rtl" (GAP-003)
  Designer test: related-attribute condition row for lookup fields (GAP-001)
  Unit test: structured warning for missing grid column (after DEF to fix,
             GAP-004)

CI stage mapping
  Stage 1 (push): frontend unit + designer unit + backend unit
  Stage 2 (push): C# dotnet test
  Stage 3 (PR): E2E Playwright (when added)


11. DEFINITION OF DONE
───────────────────────────────────────────────────

All of the following must be true before DFE-RULES-002 is considered complete:

[ ] All 1,949 automated tests pass on feat/dfe-rules-batch-2 (verified)
[ ] DEF-001 (NFR-004 aria-label) is fixed or formally accepted with conditions
[ ] GAP-001 (FR-013 designer condition test) is closed or formally deferred
[ ] UAT-01 through UAT-06 passed on org5869857f (manual)
[ ] UAT-07 BLOCKED: provision-rating-render-style.mjs run with CEO go-ahead;
    then UAT-07-01 through UAT-07-09 passed
[ ] UAT-KB-01 through UAT-KB-05 passed (keyboard-only)
[ ] Traceability gate re-run after FR IDs added to new test names (warn only)
[ ] Backward-compatibility check: an existing form with no batch-2 rules open
    and behaves identically (UAT-07-09)
[ ] Code review phase passed (code-reviewer agent)
[ ] Audit phase passed (auditor agent — PDPPL on related-record data columns
    is an open question handed to audit)


═══════════════════════════════════════════════════
VERIFICATION
  criterion:  All four test suites pass; phase-5 document written to the
              correct location
  command:    (frontend) npx vitest run → 72 files, 626 tests
              (designer) npx vitest run → 75 files, 751 tests
              (backend)  npx vitest run → 45 files, 459 tests
              (C# plugin) dotnet test  → 113 tests
  output:
    frontend  — Test Files 72 passed (72); Tests 626 passed (626)
    designer  — Test Files 75 passed (75); Tests 751 passed (751)
    backend   — Test Files 45 passed (45); Tests 459 passed (459)
    C# plugin — Passed! Failed: 0, Passed: 113, Skipped: 0, Total: 113
  result:     PASS
  unverified: UAT-07 (rating live-org — Rating picklist option not provisioned;
              CEO go-ahead required); RTL star rendering (GAP-003, manual only);
              coverage figures (gate-coverage.sh SKIP — no coverage script
              wired to any sub-package; NFR-006 cannot be mechanically verified)
═══════════════════════════════════════════════════

MEMORY-CANDIDATE
  Domain: qa
  Pattern: An architecture redesign that eliminates a BRD column
           (FR-003 qdb_target_grid_id, FR-010 qdb_parent_prefetch_attrs)
           leaves FR numbers in the traceability gate as "unlinked" even
           though the requirement is satisfied. The QA document must note each
           superseded FR explicitly so the CEO gate does not count them as open
           defects.
  Confidence: high
  Source: DFE-RULES-002, 2026-09-30
═══════════════════════════════════════════════════
END OF DOCUMENT
═══════════════════════════════════════════════════
