═══════════════════════════════════════════════════
PHASE 5 — QA TEST STRATEGY
═══════════════════════════════════════════════════
Project:        DFE-STYLE-001 — Advanced Visual Styling & Full CSS Control
Client:         Qatar Development Bank (QDB)
Product:        Dynamic Form Engine (DFE)
Prepared by:    Maqsad AI — QA Engineer
Date:           2026-06-29
Version:        1.0
References:     brd-style.md (FR-001..FR-101, BR-001..BR-015, SM-001..SM-008)
                brd-style-resolutions.md (OQ-006/008 resolved; OQ-007/010 open)
                phase-3-arch-style.md
                phase-4-tech-style.md
                DEPLOYMENT-RUNBOOK-style.md
Engagement status: Build complete; code review in progress (Step 7).
                   QA (this document) is Step 8.
═══════════════════════════════════════════════════


1. TEST STRATEGY SUMMARY
═══════════════════════════════════════════════════

This engagement extends the DFE design system from a 12-property legacy
model to the full DesignPayload contract and introduces CSS sanitization,
WCAG contrast gating, picklist-mapped Dataverse attributes, and render
cache embedding. The risks that govern the test priority order are:

  HIGHEST:  Picklist round-trip data loss (confirmed bug class across 6
            repos in this codebase; every enum field must be verified)
  HIGH:     CSS injection via customCss / fontUrl (NFR-005; R-002)
  HIGH:     PATCH semantics — partial save must not wipe unrelated attrs
            (R-010; FR-095; NFR-016)
  HIGH:     RTL regression that would violate DFE-i18n-001 go-live
            conditions (R-007; FR-090..FR-092)
  MEDIUM:   StyleEngine memoization correctness vs performance contract
            (SM-006; NFR-003)
  MEDIUM:   Backward compatibility — existing forms must not change
            visually after deployment (SM-002)
  MEDIUM:   AllowlistService fail-safe when config record is absent (SC-07)

1.1 Approach
────────────────────────────────────────────────────
Test layer:   Tool:                            Execution:
Unit          Vitest                           Local + CI (every push)
Integration   Vitest + real Dataverse          CI (on main branch only)
E2E           Playwright                       CI staging (pre-release)
Visual reg.   Playwright + @playwright/test    Staging, before vs after deploy
Performance   Vitest benchmark (NFR-003)       CI (every push)
              Manual timing (NFR-001/002)      Staging (one-time UAT)
Security      Manual + automated input tests   Staging (once before CEO gate)

1.2 Coverage targets
────────────────────────────────────────────────────
Unit:          >= 80% line coverage on all new/modified files
Integration:   Every picklist entity × every enum field (no exceptions)
E2E:           All 8 FR groups covered by at least one Playwright flow
Visual reg.:   100% of forms existing before this engagement
Security:      All NFR-005/006/007/008 attack vectors exercised

1.3 CI integration
────────────────────────────────────────────────────
Stage 1 — PR gate (every push):
  - TypeScript strict compile: all 4 packages must pass
  - Unit tests: backend 208+ / designer 69+ / frontend 165+ (442 total)
  - StyleEngine benchmark (TC-PF-001) as a unit test
  - DesignerStyleModel reference check (SM-008 compile-time guard)

Stage 2 — Main branch (merge):
  - Integration tests against org5869857f test namespace
  - Picklist round-trip integration suite (all enum fields)

Stage 3 — Staging pre-release:
  - E2E suite (Playwright, headed chromium)
  - Visual regression suite (pixel diff from pre-deployment baseline)
  - Security injection suite
  - RTL regression suite


2. TEST ENVIRONMENT REQUIREMENTS
═══════════════════════════════════════════════════

2.1 Required accounts and roles
────────────────────────────────────────────────────
  - QA user: form-administrator role in org5869857f (can author and publish)
  - QA user: CSS Allowlist Admin role (for allowlist write tests)
  - Restricted user: form-administrator role ONLY, NO CSS Allowlist Admin
    (for role-enforcement negative tests)

2.2 Data prerequisites
────────────────────────────────────────────────────
  - Baseline screenshot set: screenshots of all existing published forms
    taken BEFORE deploying the STYLE-001 build (SM-002 visual regression
    baseline). Must be captured before any schema provisioning.
  - Test forms:
      dfe-all-features (existing, 10,392 char cache — use for size tests)
      loan-application (existing, clean form for RTL regression)
      style-test-form (new, created during QA — never used for baselines)
  - qdb_css_allowlist_config 'global' record with:
      qdb_allowed_domains_json = ["fonts.googleapis.com","fonts.gstatic.com"]
  - A second test config record with qdb_is_active = false (for fail-safe tests)

2.3 Service dependencies
────────────────────────────────────────────────────
  - Backend Fastify service running with ALLOWED_CSS_DOMAINS_JSON env var
    matching the 'global' Dataverse record
  - Designer web resource: latest build deployed to org5869857f
  - On-prem runtime: latest qdb_form_runtime.html (with PostCSS sanitizer)
  - Frontend portal: Next.js running against org5869857f render cache
  - postcss-spike-test.html: available for on-prem PostCSS sandbox confirm
    (SC-02 manual check recommended per phase-4-tech-style.md)

2.4 Known open questions affecting test scope
────────────────────────────────────────────────────
  OQ-007 (font policy): Specific approved font CDN domains not yet
    confirmed by QDB Brand Team. Font-URL positive test cases use
    fonts.googleapis.com as a stand-in. Full font acceptance tests are
    BLOCKED until QDB Brand Team provides the approved list.
    Impact: TC-SC-006 and TC-BR-003 are partially executable now;
    extend after OQ-007 resolution.

  OQ-010 (third-party WCAG audit as go-live gate): If QDB Compliance
    requires a formal external audit before CEO Phase 7 approval, QA
    must coordinate audit scheduling. This is an open go-live gating
    question — flag to CEO before Phase 7. See Section 7.


3. TEST CASES
═══════════════════════════════════════════════════

────────────────────────────────────────────────────
3A. UNIT TESTS — PICKLIST ROUND-TRIP
    (references FR-013, FR-014, FR-016..FR-019, FR-036..FR-039,
     FR-043, FR-046, FR-055..FR-056, FR-058..FR-059;
     SM-008; build note: confirmed bug class across 6 repos)
────────────────────────────────────────────────────

TC-UT-001: shadowStyle picklist write and read — None value
References: FR-013 / BR-001
Given:  A ThemeDefinition with shadowStyle = 'None'
When:   toPicklist(shadowStyle) is called, then fromPicklist() on the result
Then:   toPicklist returns 100000000; fromPicklist(100000000) returns 'None'
        (None maps to 100000000, not 100000001 — verify org mapping)
Priority: Critical
Type: Unit

TC-UT-002: shadowStyle picklist — all three values
References: FR-013
Given:  Each value: None, Subtle, Strong
When:   toPicklist is called for each, then fromPicklist on the result
Then:   None→100000000→None, Subtle→100000001→Subtle, Strong→100000002→Strong
Priority: Critical
Type: Unit

TC-UT-003: spacingScale picklist — all three values
References: FR-014
Given:  Each value: Compact, Normal, Comfortable
When:   toPicklist/fromPicklist
Then:   Compact→100000000→Compact, Normal→100000001→Normal,
        Comfortable→100000002→Comfortable
Priority: Critical
Type: Unit

TC-UT-004: layoutType picklist — all eight values
References: FR-016
Given:  SingleColumn, TwoColumn, Grid, Stepper, Wizard, Accordion,
        TabBased, InlineCompact
When:   toPicklist/fromPicklist for each
Then:   Each value round-trips to the correct integer code and back
        (codes: 100000001..100000008 respectively)
Priority: Critical
Type: Unit

TC-UT-005: sectionStyle picklist — all three values
References: FR-019
Given:  Card, Flat, Outlined
When:   toPicklist/fromPicklist
Then:   Card→100000001, Flat→100000002, Outlined→100000003; reverse maps correct
Priority: Critical
Type: Unit

TC-UT-006: columnLayout picklist — all four values (1/2/3/4)
References: FR-036
Given:  Each numeric column count: 1, 2, 3, 4
When:   toPicklist/fromPicklist
Then:   1→100000001, 2→100000002, 3→100000003, 4→100000004; reverse correct
Priority: Critical
Type: Unit

TC-UT-007: cardStyle picklist — all three values
References: FR-037
Given:  Flat, Elevated, Outlined
When:   toPicklist/fromPicklist
Then:   Flat→100000001, Elevated→100000002, Outlined→100000003
Priority: Critical
Type: Unit

TC-UT-008: collapsibleStyle picklist — None value maps to 100000000
References: FR-038
Given:  collapsibleStyle = 'None'
When:   toPicklist
Then:   Returns 100000000, not 100000001
        (None is the base/zero-offset value, not the first option in a 1-based set)
Priority: Critical
Type: Unit
Note: This is a specific regression vector — None=100000000 (zero-based) not 100000001.

TC-UT-009: visibilityAnimation picklist — None value maps to 100000000
References: FR-039
Given:  None, Fade, Slide
When:   toPicklist/fromPicklist
Then:   None→100000000, Fade→100000001, Slide→100000002
Priority: Critical
Type: Unit

TC-UT-010: fieldWidth picklist — all three values
References: FR-043
Given:  Full, Half, Custom
When:   toPicklist/fromPicklist
Then:   Full→100000001, Half→100000002, Custom→100000003
Priority: Critical
Type: Unit

TC-UT-011: buttonSize picklist — all three values
References: FR-055
Given:  Small, Medium, Large
When:   toPicklist/fromPicklist
Then:   Small→100000001, Medium→100000002, Large→100000003
Priority: Critical
Type: Unit

TC-UT-012: hoverEffect picklist — None value maps to 100000000
References: FR-058
Given:  None, Elevate, ColorShift
When:   toPicklist/fromPicklist
Then:   None→100000000, Elevate→100000001, ColorShift→100000002
Priority: Critical
Type: Unit

TC-UT-013: loadingStyle picklist — all three values
References: FR-059
Given:  Spinner, Dots, Pulse
When:   toPicklist/fromPicklist
Then:   Spinner→100000001, Dots→100000002, Pulse→100000003
Priority: Critical
Type: Unit

TC-UT-014: fromPicklist with unknown integer code returns undefined
References: NFR-012 / BR-006
Given:  An integer code that does not exist in any picklist map (e.g., 999999)
When:   fromPicklist(999999) is called for any entity
Then:   Returns undefined (not a thrown exception, not a default value)
        StyleEngine treats undefined as "use theme default" (BR-006)
Priority: High
Type: Unit

TC-UT-015: fromPicklist with null or undefined input returns undefined
References: BR-006
Given:  A null or undefined value from a Dataverse API response
When:   fromPicklist(null) or fromPicklist(undefined) is called
Then:   Returns undefined without throwing
Priority: High
Type: Unit

TC-UT-016: buttonAlignment picklist — all three values
References: FR-056
Given:  Left, Center, Right
When:   toPicklist/fromPicklist
Then:   Left→100000001, Center→100000002, Right→100000003
Priority: Critical
Type: Unit

────────────────────────────────────────────────────
3B. UNIT TESTS — CSSSANITISER
    (references NFR-005, NFR-007, R-002, BR-013)
────────────────────────────────────────────────────

TC-UT-017: @import always stripped regardless of URL
References: NFR-005
Given:  customCss = "@import url('https://fonts.googleapis.com/css');"
        allowedDomains = ["fonts.googleapis.com"]
When:   CssSanitiserPlugin processes the CSS
Then:   Output contains no @import rule
Priority: Critical
Type: Unit

TC-UT-018: url() with off-allowlist domain stripped from declaration
References: NFR-005
Given:  customCss = ".qdb-form { background: url('https://attacker.com/x.gif'); }"
        allowedDomains = ["fonts.googleapis.com"]
When:   CssSanitiserPlugin processes
Then:   The background declaration containing the off-allowlist URL is removed
Priority: Critical
Type: Unit

TC-UT-019: url() with allowlisted domain retained
References: NFR-005
Given:  customCss = ".qdb-form { background-image: url('https://fonts.gstatic.com/s/file.woff2'); }"
        allowedDomains = ["fonts.gstatic.com"]
When:   CssSanitiserPlugin processes
Then:   The declaration is retained in the output
Priority: Critical
Type: Unit

TC-UT-020: expression() value stripped
References: NFR-005
Given:  customCss = ".qdb-form { width: expression(document.body.clientWidth); }"
When:   CssSanitiserPlugin processes
Then:   The declaration containing expression() is removed
Priority: Critical
Type: Unit

TC-UT-021: behavior: declaration stripped
References: NFR-005
Given:  customCss = ".qdb-form { behavior: url(script.htc); }"
When:   CssSanitiserPlugin processes
Then:   The behavior: declaration is removed
Priority: Critical
Type: Unit

TC-UT-022: html body and :root selectors stripped
References: NFR-007
Given:  customCss = "html { color: red; } body { font-size: 14px; } :root { --var: red; }"
When:   CssSanitiserPlugin processes
Then:   All three rules are removed; output is empty
Priority: Critical
Type: Unit

TC-UT-023: Non-qdb-prefixed selectors stripped
References: NFR-007
Given:  customCss = ".some-other-class { color: blue; }"
When:   CssSanitiserPlugin processes
Then:   The rule is removed (not scoped to .qdb- prefix)
Priority: High
Type: Unit

TC-UT-024: .qdb- prefixed selectors retained
References: NFR-007
Given:  customCss = ".qdb-form-testcode .my-class { color: blue; }"
        Selector includes the form scope prefix
When:   CssSanitiserPlugin processes
Then:   The rule is retained
Priority: High
Type: Unit

TC-UT-025: @keyframes retained
References: NFR-005 (safe animation)
Given:  customCss = "@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }"
When:   CssSanitiserPlugin processes
Then:   The @keyframes block is retained
Priority: Medium
Type: Unit

TC-UT-026: @charset and @namespace stripped
References: NFR-005
Given:  customCss = "@charset 'UTF-8'; @namespace url(http://www.w3.org/1999/xhtml);"
When:   CssSanitiserPlugin processes
Then:   Both are removed
Priority: Medium
Type: Unit

TC-UT-027: Empty allowlist strips all url() — fail-safe behavior
References: NFR-005 / SC-07
Given:  allowedDomains = [] (empty array — fail-safe state)
        customCss = ".qdb-form { background: url('https://fonts.googleapis.com/x.css'); }"
When:   CssSanitiserPlugin processes
Then:   url() declaration is removed (empty allowlist = block all)
Priority: Critical
Type: Unit

────────────────────────────────────────────────────
3C. UNIT TESTS — CONTRASTRATIO
    (references FR-025..FR-030, NFR-001, NFR-009, C-003)
────────────────────────────────────────────────────

TC-UT-028: Black on white = 21:1 (W3C canonical vector)
References: FR-030 / NFR-009
Given:  foreground=#000000, background=#FFFFFF
When:   calculateContrastRatio is called
Then:   ratio is 21, level is 'AAA', passesMinimumGate is true,
        isAdvisoryWarning is false
Priority: Critical
Type: Unit

TC-UT-029: White on white = 1:1
References: FR-030
Given:  foreground=#FFFFFF, background=#FFFFFF
When:   calculateContrastRatio is called
Then:   ratio is 1, level is 'Fail', passesMinimumGate is false
Priority: Critical
Type: Unit

TC-UT-030: Ratio exactly at 4.5:1 boundary — AA level
References: FR-026
Given:  A color pair whose contrast ratio is exactly 4.5 (to 2 decimal places)
When:   calculateContrastRatio is called
Then:   level is 'AA', passesMinimumGate is true, isAdvisoryWarning is false
Priority: Critical
Type: Unit

TC-UT-031: Ratio in advisory range 3.0:1 to 4.5:1
References: FR-026 / FR-029 / BR-013
Given:  #767676 on #FFFFFF (ratio approximately 4.54:1 — just above AA)
        Use a pair known to produce ratio between 3.0 and 4.5
When:   calculateContrastRatio is called
Then:   passesMinimumGate is true, isAdvisoryWarning is true, level is 'AA Large'
Priority: Critical
Type: Unit

TC-UT-032: Ratio below 3.0:1 — blocking fail
References: FR-027 / FR-028 / BR-013
Given:  A color pair with ratio below 3.0 (e.g., light grey on white)
When:   calculateContrastRatio is called
Then:   passesMinimumGate is false, isAdvisoryWarning is false, level is 'Fail'
Priority: Critical
Type: Unit

TC-UT-033: 3-digit hex shorthand handled correctly
References: FR-030
Given:  foreground='#000', background='#fff'
When:   calculateContrastRatio is called
Then:   Same result as #000000 / #FFFFFF (21:1)
Priority: High
Type: Unit

TC-UT-034: Hex without # prefix handled
References: FR-030
Given:  foreground='000000', background='FFFFFF'
When:   calculateContrastRatio is called
Then:   ratio is 21 (same result as with # prefix)
Priority: High
Type: Unit

TC-UT-035: Malformed hex returns Fail with ratio 0
References: FR-030
Given:  foreground='#ZZZZZZ' (invalid hex)
When:   calculateContrastRatio is called
Then:   { ratio: 0, level: 'Fail', passesMinimumGate: false, isAdvisoryWarning: false }
        No exception thrown
Priority: High
Type: Unit

TC-UT-036: sRGB gamma linearization applied correctly
References: NFR-009 / C-003
Given:  A mid-range channel value (e.g., #808080)
When:   Internal linearize step is applied
Then:   Value satisfies W3C formula: c <= 0.04045 branch for dark,
        ((c+0.055)/1.055)^2.4 branch for light — unit test the linearize
        helper directly if exported, or verify via canonical W3C test vectors
Priority: High
Type: Unit

────────────────────────────────────────────────────
3D. UNIT TESTS — cssClassName READ/WRITE AND HEADERTSTYLE ROUNDTRIP
    (references FR-040, FR-050, FR-070, FR-071, FR-074, FR-075;
     build note: headerStyle was a load→save data-loss bug)
────────────────────────────────────────────────────

TC-UT-037: Section cssClassName read from qdb_css_class
References: FR-040 / FR-074
Given:  A qdb_section_design record with qdb_css_class = 'highlight-section'
When:   SectionDesignRepository.findBySectionId is called
Then:   Returned SectionDesign.cssClassName === 'highlight-section'
Priority: Critical
Type: Unit

TC-UT-038: Section cssClassName written to qdb_css_class
References: FR-040 / FR-041
Given:  A UpsertSectionDesignDto with cssClassName = 'highlight-section'
When:   SectionDesignRepository.upsert is called
Then:   The Dataverse PATCH payload includes qdb_css_class = 'highlight-section'
Priority: Critical
Type: Unit

TC-UT-039: Field cssClassName read from qdb_field_css_class
References: FR-050 / FR-075
Given:  A qdb_field_design record with qdb_field_css_class = 'wide-input'
When:   FieldDesignRepository.findByFieldId is called
Then:   Returned FieldDesign.cssClassName === 'wide-input'
Priority: Critical
Type: Unit

TC-UT-040: Field cssClassName written to qdb_field_css_class
References: FR-050 / FR-051
Given:  A UpsertFieldDesignDto with cssClassName = 'wide-input'
When:   FieldDesignRepository.upsert is called
Then:   The Dataverse PATCH payload includes qdb_field_css_class = 'wide-input'
Priority: Critical
Type: Unit

TC-UT-041: headerStyle JSON serializes to and deserializes from qdb_header_style_json
References: FR-074 / build note (headerStyle data-loss fix)
Given:  A SectionDesign with headerStyle = { fontWeight: 'bold', color: '#333' }
When:   SectionDesignRepository.upsert serializes to Dataverse, then
        SectionDesignRepository.findBySectionId reads back
Then:   The deserialized headerStyle equals the original object
        (JSON round-trip: { fontWeight: 'bold', color: '#333' })
Priority: Critical
Type: Unit
Note: This was a confirmed data-loss bug (headerStyle was not mapped on load).
      Must explicitly verify the load path, not just the save path.

TC-UT-042: headerStyle null when qdb_header_style_json is null or empty
References: FR-074
Given:  A qdb_section_design record where qdb_header_style_json is null
When:   SectionDesignRepository.findBySectionId reads it
Then:   SectionDesign.headerStyle is undefined (not null, not {}, not thrown)
Priority: High
Type: Unit

────────────────────────────────────────────────────
3E. UNIT TESTS — ALLOWLISTSERVICE FAIL-SAFE
    (references NFR-008, SC-07, C-006; phase-3-arch-style.md Section 3c)
────────────────────────────────────────────────────

TC-UT-043: AllowlistService returns empty array when no active config record
References: NFR-008 / SC-07
Given:  Xrm.WebApi returns 0 records for the allowlist query
        (simulated via stub/spy — no active qdb_css_allowlist_config)
When:   AllowlistService.getAllowedDomains() is called
Then:   Returns [] (empty array), no exception thrown
        CssSanitiserPlugin called with empty array strips all url() and fontUrl
Priority: Critical
Type: Unit

TC-UT-044: AllowlistService returns domain array when config record present
References: NFR-008
Given:  Xrm.WebApi returns a record with
        qdb_allowed_domains_json = '["fonts.googleapis.com","fonts.gstatic.com"]'
When:   AllowlistService.getAllowedDomains() is called
Then:   Returns ['fonts.googleapis.com', 'fonts.gstatic.com']
Priority: High
Type: Unit

TC-UT-045: AllowlistService caches result for session duration
References: NFR-008 (reads once on load)
Given:  AllowlistService.getAllowedDomains() has been called once
When:   getAllowedDomains() is called a second time
Then:   Xrm.WebApi is NOT called again (Dataverse round-trip avoided)
Priority: Medium
Type: Unit

────────────────────────────────────────────────────
3F. UNIT TESTS — STYLEENGINE MEMOIZATION
    (references FR-096, FR-097, NFR-003, SM-006)
────────────────────────────────────────────────────

TC-UT-046: resolveField returns cached result on same DesignPayload reference
References: FR-096 / NFR-003
Given:  A DesignPayload object P and fieldId 'field-1'
        resolveField(P, 'field-1') is called once, caches the result
When:   resolveField(P, 'field-1') is called again
Then:   The internal compute function is NOT called (verify with spy)
        The returned object reference is identical (===) to the first call's result
Priority: High
Type: Unit

TC-UT-047: resolveField recomputes on different fieldId
References: FR-096
Given:  DesignPayload P, first call: resolveField(P, 'field-1')
When:   resolveField(P, 'field-2') is called
Then:   Compute function is called (cache miss for 'field-2')
Priority: High
Type: Unit

TC-UT-048: resolveField recomputes on new DesignPayload reference
References: FR-096
Given:  resolveField(P1, 'field-1') called and cached
        P2 is a new DesignPayload object (different reference, same content)
When:   resolveField(P2, 'field-1') is called
Then:   Compute function is called (WeakMap key differs)
Priority: High
Type: Unit

TC-UT-049: resolveSection memoization matches resolveField pattern
References: FR-097
Given:  DesignPayload P and sectionId 'section-1'
When:   resolveSection called twice with same args
Then:   Compute function called only once; result reference stable
Priority: High
Type: Unit

TC-UT-050: resolveField completes under 1ms on warm cache (SM-006)
References: NFR-003 / SM-006
Given:  A form with 100 fields, each with a FieldDesign populated
        resolveField called once for all 100 fields (warms the cache)
When:   resolveField called again for all 100 fields (warm path) and timed
Then:   Total time < 100ms (i.e., average < 1ms per call)
        This test must run as a Vitest benchmark and be included in CI
Priority: Critical
Type: Unit (Performance)

────────────────────────────────────────────────────
3G. UNIT TESTS — DESIGNERSTYLEMMODEL DEPRECATION
    (references FR-099..FR-101, SM-008)
────────────────────────────────────────────────────

TC-UT-051: TypeScript compilation fails if DesignerStyleModel is imported
References: FR-099 / SM-008
Given:  The DesignerStyleModel type is stripped of all exports
        (per migration completion)
When:   TypeScript strict compile runs across the designer package
Then:   Zero references to DesignerStyleModel in non-deprecated files
        (Verify with: grep -r "DesignerStyleModel" designer/src --include="*.ts"
         --include="*.tsx" excluding the deprecated definition file itself)
Priority: Critical
Type: Unit (Compile-time check; automated as CI step)

────────────────────────────────────────────────────
3H. UNIT TESTS — PATCH SEMANTICS
    (references FR-095, NFR-016, BR-015, R-010)
────────────────────────────────────────────────────

TC-UT-052: buildPatchPayload omits undefined fields
References: FR-095 / NFR-016
Given:  A UpsertThemeDto where only primaryColor and secondaryColor are set;
        all other fields are undefined
When:   buildPatchPayload is called
Then:   The result object contains only 2 keys (qdb_primary_color, qdb_secondary_color)
        No null or undefined values are present in the result
Priority: Critical
Type: Unit

TC-UT-053: Saving theme colors does not overwrite typography attributes
References: BR-015 / R-010
Given:  A qdb_theme record has qdb_heading_font_size = '24px'
        A DesignService.upsertTheme call includes ONLY color changes
When:   The Dataverse PATCH request is constructed
Then:   qdb_heading_font_size is NOT present in the PATCH body
        (Typography was not in the save payload; must not be overwritten)
Priority: Critical
Type: Unit


────────────────────────────────────────────────────
3I. INTEGRATION TESTS
    (references FR-024, FR-041, FR-051, FR-060, FR-067,
     FR-080..FR-083, FR-081, BR-002..BR-005)
────────────────────────────────────────────────────

TC-INT-001: Full ThemeDefinition save and reassemble round-trip
References: FR-024 / FR-072 / FR-082
Given:  A qdb_theme record exists in org5869857f
        All extended ThemeDefinition fields populated with known values
When:   DesignAssembler.assembleDesignPayload() runs for a form using that theme
Then:   The returned DesignPayload.theme contains all extended fields with
        the correct values (all 24 qdb_theme attributes mapped)
Priority: Critical
Type: Integration

TC-INT-002: SectionDesign headerStyle survives Dataverse round-trip
References: FR-041 / FR-074 / TC-UT-041 (regression)
Given:  A qdb_section_design record with qdb_header_style_json = '{"fontWeight":"bold"}'
        stored in org5869857f
When:   SectionDesignRepository.findBySectionId reads from the real Dataverse
Then:   Returned SectionDesign.headerStyle = { fontWeight: 'bold' }
Priority: Critical
Type: Integration

TC-INT-003: Section and field cssClassName flows into DesignPayload
References: FR-040 / FR-050 / FR-080 / build note (open item 3)
Given:  A section with qdb_css_class = 'test-section' in Dataverse
        A field with qdb_field_css_class = 'test-field' in Dataverse
When:   DesignAssembler.assembleDesignPayload() runs for the form
Then:   DesignPayload.sectionDesigns[sectionId].cssClassName === 'test-section'
        DesignPayload.fieldDesigns[fieldId].cssClassName === 'test-field'
Priority: Critical
Type: Integration
Note: This was flagged as an open item in phase-4-tech-style.md. Must be
      confirmed after schema provisioning that backend reads these two new attrs.

TC-INT-004: STYLE_CHANGE publish job created after style save
References: FR-081 / FR-082
Given:  A form is open in the designer; user saves a theme color change
When:   The designer completes the upsertTheme call
Then:   A qdb_publish_job record exists in Dataverse with:
          qdb_trigger_reason = 2 (STYLE_CHANGE)
          qdb_status = 1 (QUEUED)
          qdb_form_definition_id = current form ID
Priority: Critical
Type: Integration

TC-INT-005: Cache assembly embeds complete DesignPayload at version 3
References: FR-080 / FR-082
Given:  A STYLE_CHANGE publish job is processed by the backend
When:   The qdb_render_cache record is updated
Then:   The decoded cache JSON has "version": 3 and contains a top-level
        "designPayload" key with non-null theme, formDesign, sectionDesigns,
        fieldDesigns, buttonDesigns, and layoutGrid
Priority: Critical
Type: Integration

TC-INT-006: Form with no qdb_form_design receives DEFAULT_DESIGN_PAYLOAD
References: FR-083 / BR-006
Given:  A form exists in Dataverse with NO qdb_form_design record
When:   DesignAssembler.assembleDesignPayload() runs for that form
Then:   Returns the DEFAULT_DESIGN_PAYLOAD constant (not null, not an error)
        The resulting cache JSON contains a valid designPayload block
Priority: Critical
Type: Integration

TC-INT-007: PATCH save of section backgroundColor does not overwrite other section attrs
References: FR-095 / NFR-016 / BR-015
Given:  A qdb_section_design record has qdb_padding = '16px' already set
        DesignService.upsertSectionDesign is called with only backgroundColor changed
When:   The Dataverse PATCH request is sent (real Dataverse)
Then:   After the call, qdb_padding on the record is STILL '16px'
        (Not overwritten by a full-replacement PUT)
Priority: Critical
Type: Integration

TC-INT-008: LayoutGrid upsert finds existing record before creating new one
References: FR-067 / BR-005
Given:  A qdb_layout_grid record already exists for (formDesignId, fieldId)
When:   DesignService.upsertLayoutGrid is called with new span values for same IDs
Then:   No duplicate record is created; the existing record is updated
        Only one qdb_layout_grid record exists for (formDesignId, fieldId)
Priority: High
Type: Integration

TC-INT-009: AllowlistService reads config with key='global' from Dataverse
References: NFR-008 / architecture note (key was 'default' in early build, fixed to 'global')
Given:  org5869857f has a qdb_css_allowlist_config record with
        qdb_config_key = 'global', qdb_is_active = true
When:   AllowlistService.getAllowedDomains() executes in the designer context
Then:   The domains array from that record is returned (not empty array)
Priority: Critical
Type: Integration
Note: Phase-4-tech-style.md notes the seed key was corrected to 'global'.
      This must be verified against the real org after provisioning.

TC-INT-010: On-prem runtime reads allowlist via Xrm.WebApi on form load
References: NFR-008 / architecture Section 3c
Given:  qdb_form_runtime.html loads in a CRM context
When:   The form page initializes
Then:   Xrm.WebApi.retrieveMultipleRecords is called for qdb_css_allowlist_config
        The returned domains array is used for PostCSS sanitization
Priority: High
Type: Integration


────────────────────────────────────────────────────
3J. E2E TESTS (Playwright)
    (references SM-001..SM-008, BO-001..BO-005)
────────────────────────────────────────────────────

TC-E2E-001: Author complete theme styling and verify portal render (SM-001)
References: FR-001..FR-015, FR-023, FR-024 / SM-001 / BO-001 / BO-002
Given:  A new test form exists; QA admin is logged into the designer
When:   Admin opens ThemeStylePanel
        Sets primaryColor to #0078d4, secondaryColor to #005a9e
        Sets shadowStyle to Subtle, spacingScale to Comfortable
        Saves the form
        Publishes the form
        Opens the form in the Next.js portal
Then:   The portal page has CSS custom property --qdb-primary = #0078d4 on documentElement
        CSS custom property --qdb-shadow reflects Subtle
        The form renders without JavaScript errors
Priority: Critical
Type: E2E

TC-E2E-002: WCAG contrast indicator updates in real time on color change
References: FR-025 / FR-026 / FR-027 / SM-003 / NFR-001
Given:  Designer ThemeStylePanel is open
When:   Admin changes primaryColor to a color with ratio < 3:1 vs backgroundColor
Then:   The WcagContrastIndicator for 'Primary on Background' shows red/error state
        and displays the calculated ratio (e.g., "2.54:1")
        within the same user interaction (no save required)
Priority: Critical
Type: E2E

TC-E2E-003: Publish gate blocks form when any blocking pair is < 3:1 (SM-007)
References: FR-028 / BR-013 / SM-007
Given:  primaryColor is set to a value producing < 3:1 ratio vs backgroundColor
When:   Admin clicks the Publish button
Then:   The publish validation screen appears
        The offending pair is listed by name and calculated ratio
        The Publish action button is disabled
        The form cannot be published without fixing the colour
Priority: Critical
Type: E2E

TC-E2E-004: Publish with advisory warning (3:1 to 4.5:1) requires acknowledgement
References: FR-029 / BR-013
Given:  primaryColor produces a ratio of 3.5:1 (above 3:1, below 4.5:1)
When:   Admin clicks Publish
Then:   A confirmation dialog appears describing the advisory warning
        Admin can choose to cancel or acknowledge and proceed
        After acknowledgement, the form is published successfully
Priority: Critical
Type: E2E

TC-E2E-005: Per-field styling flows from designer to portal render
References: FR-042..FR-051, FR-070, FR-080 / SM-004 / BO-001
Given:  A form with a text field; QA admin opens FieldStylePanel for that field
When:   Admin sets width to Half, height to 120px, cssClassName to 'wide-input'
        Saves and publishes the form
        Opens the form in the portal
Then:   The field container element has class 'wide-input'
        The field container has width: 50% (or equivalent grid column)
        No console errors on the portal page
Priority: Critical
Type: E2E

TC-E2E-006: Per-section styling flows from designer to portal render
References: FR-031..FR-041, FR-070 / SM-004 / BO-001
Given:  A form with a section; QA admin opens SectionStylePanel for that section
When:   Admin sets backgroundColor to #f5f5f5, cssClassName to 'branded-section'
        Saves and publishes the form
        Opens the form in the portal
Then:   The section container element has class 'branded-section'
        The section has background-color: #f5f5f5 (or the CSS variable resolves to it)
Priority: Critical
Type: E2E

TC-E2E-007: Per-button styling flows from designer to portal render
References: FR-052..FR-060, FR-080 / SM-004 / BO-002
Given:  ButtonStylePanel open for Submit button
When:   Admin sets color to #005a9e, size to Large, hoverEffect to Elevate
        Saves and publishes
        Opens the form in the portal
Then:   Submit button has the correct color applied
        Size class reflects Large
        No visual errors on the portal page
Priority: High
Type: E2E

TC-E2E-008: cssClassName on form container scopes customCss correctly (NFR-007)
References: FR-088 / NFR-007
Given:  FormDesign.customCss = ".qdb-form-testcode .branded { color: #0078d4; }"
        formCode = 'testcode'
When:   Form is rendered in the portal
Then:   The customCss <style> block is scoped inside .dfe-form-testcode (or .qdb-form-testcode)
        CRM native UI elements outside the form wrapper are NOT affected by the custom CSS
Priority: Critical
Type: E2E

TC-E2E-009: Responsive grid controls affect field layout at breakpoints
References: FR-061..FR-067, FR-080 / BO-003
Given:  A field with LayoutGrid: columnsTotal=12, spanMobile=12, spanTablet=6, spanDesktop=4
        Form published
When:   Portal page loaded at mobile viewport (< 768px)
        Then at tablet viewport (768px-1024px)
        Then at desktop viewport (> 1024px)
Then:   Field occupies full width at mobile, half width at tablet, one-third at desktop
        (Exact CSS grid column values match the span ratios)
Priority: High
Type: E2E

TC-E2E-010: On-prem runtime renders same styling as portal (SM-005)
References: FR-084..FR-089 / SM-005 / BO-004
Given:  A form with custom theme color, section backgroundColor, and field cssClassName
        Form is published and render cache is current
When:   Form opened in the Next.js portal (screenshot A)
        Same form opened in qdb_form_runtime.html CRM web resource (screenshot B)
Then:   Screenshot A and screenshot B show no visible differences in layout, color,
        or typography (QA manual visual comparison or pixel diff at 99% threshold)
Priority: Critical
Type: E2E

TC-E2E-011: Full admin styling exercise completes in under 30 minutes (SM-001)
References: SM-001 / BO-001
Given:  A QA participant with QDB form admin role and a blank test form
When:   Admin performs: set theme colors + typography, configure a section, configure
        two fields (different widths), configure Submit button, assign two cssClassNames,
        add one custom CSS rule, and publish — timed from start to published
Then:   Full exercise completes in under 30 minutes
        All configured styles appear correctly in the portal after publish
Priority: Critical
Type: E2E (UAT timing)
Note: This is the SM-001 acceptance criterion. Must be conducted with a real
      QDB form administrator or QA proxy in the staging environment.

────────────────────────────────────────────────────
3K. REGRESSION TESTS
    (references SM-002, SM-008; FR-093, FR-094, FR-083)
────────────────────────────────────────────────────

TC-REG-001: Existing 442 unit tests remain green after STYLE-001 build
References: SM-002
Given:  STYLE-001 build deployed to the CI environment
When:   Full unit test suite runs (backend 208 + designer 69 + frontend 165)
Then:   All 442 tests pass; zero regressions
Priority: Critical
Type: Regression (automated, CI Stage 1)

TC-REG-002: Existing published forms show zero visual change after deployment (SM-002)
References: FR-093 / FR-094 / SM-002
Given:  Pre-deployment screenshots of all 5 existing forms (dfe-all-features,
        loan-application, loan-application-legacy, feature-showcase, buy-house)
        captured BEFORE provisioning schema and deploying new code
When:   STYLE-001 build is deployed and caches are regenerated
        Post-deployment screenshots of same forms taken
Then:   Zero pixel differences between before and after screenshots
        (Playwright visual comparison at 100% match threshold for these existing forms)
Priority: Critical
Type: Regression (visual, E2E)

TC-REG-003: DFE-i18n-001 Arabic form renders without layout regression
References: DEP-003 / FR-090..FR-092 / R-007
Given:  The loan-application form in its Arabic (ar) language variant
        RTL direction active (qdb_rtl_direction = true)
When:   Form is published and render cache regenerated
        Form opened in portal with ar locale
Then:   Arabic form renders with correct RTL layout
        Field labels appear on the right; text flows right-to-left
        No RTL regression compared to pre-STYLE-001 screenshot baseline
Priority: Critical
Type: Regression

TC-REG-004: DesignerStyleModel has zero live references at end of engagement (SM-008)
References: FR-099..FR-101 / SM-008
Given:  STYLE-001 build complete (migration done)
When:   grep -r "DesignerStyleModel" designer/src --include="*.ts" --include="*.tsx"
        is executed (excluding the deprecated definition file)
Then:   Zero matches found
        TypeScript strict compile also passes with DesignerStyleModel exports removed
Priority: Critical
Type: Regression (automated, CI Stage 1)

TC-REG-005: Opening an existing form in the designer does not modify its style data
References: FR-094
Given:  A form exists with NO designer-authored style data
When:   QA admin opens the form in the designer (without touching any Style panel)
        and then closes without saving
Then:   No new qdb_section_design, qdb_field_design, qdb_button_design, or
        qdb_form_design records are created for that form
Priority: High
Type: Regression

────────────────────────────────────────────────────
3L. CROSS-CUTTING: RTL / ARABIC
    (references FR-090..FR-092, BR-014, DEP-003)
────────────────────────────────────────────────────

TC-RTL-001: StyleEngine emits padding-inline-start in RTL locale
References: FR-090 / BR-014
Given:  DesignPayload with SectionDesign.padding = '16px 8px'
        RTL direction is active
When:   StyleEngine.resolveSection is called
Then:   Output CSS uses padding-inline-start / padding-inline-end
        NOT padding-left / padding-right
Priority: Critical
Type: Unit

TC-RTL-002: StyleEngine emits margin-inline-start/end in RTL locale
References: FR-090 / BR-014
Given:  SectionDesign.margin = '0 8px'
        RTL active
When:   resolveSection
Then:   margin-inline-start and margin-inline-end used
Priority: Critical
Type: Unit

TC-RTL-003: StyleEngine emits border-inline-start/end in RTL locale
References: FR-090 / BR-014
Given:  SectionDesign.borderStyle = '1px solid #ccc'
        RTL active
When:   resolveSection
Then:   border-inline-start (not border-left) in output
Priority: High
Type: Unit

TC-RTL-004: StyleEngine emits text-align:start in RTL locale
References: FR-090 / BR-014
Given:  A style that would emit text-align: left in LTR
        RTL active
When:   StyleEngine resolves
Then:   text-align: start in output
Priority: High
Type: Unit

TC-RTL-005: On-prem runtime applies RTL logical properties (parity with portal)
References: FR-092
Given:  qdb_form_runtime.html with an Arabic form (RTL active)
        SectionDesign with padding and margin values
When:   Form renders in CRM web resource
Then:   Section container inline styles use logical properties, not physical ones
Priority: High
Type: E2E (manual verification in CRM web resource iframe)

────────────────────────────────────────────────────
3M. CROSS-CUTTING: BACKWARD COMPATIBILITY
    (references FR-083, FR-093, FR-094, FR-095, SM-002)
────────────────────────────────────────────────────

TC-BC-001: DesignPayload fields typed as optional do not cause runtime errors when absent
References: FR-093 / BR-006
Given:  A DesignPayload where SectionDesign.backgroundColor is undefined (optional)
When:   StyleEngine.resolveSection processes that section
Then:   No inline background-color style is emitted
        No runtime error or null pointer exception
Priority: High
Type: Unit

TC-BC-002: Form version snapshot includes complete DesignPayload (BR-011)
References: BR-011
Given:  A form is published with a custom theme color
When:   The form version snapshot (qdb_form_version.qdb_metadata_snapshot_json) is read
Then:   The snapshot contains the complete DesignPayload that was active at publish time
        Rolling back to that version restores both structure and styling
Priority: High
Type: Integration

TC-BC-003: DesignPayload size guard triggers warning at 400KB
References: NFR-004
Given:  A test form is constructed with a DesignPayload whose JSON length approaches 400KB
When:   Admin views the Style panels in the designer
Then:   Designer displays a warning: payload is approaching the size limit
Priority: Medium
Type: E2E (requires synthetic large payload)

TC-BC-004: DesignPayload exceeding 512KB causes publish job failure with specific error
References: NFR-004
Given:  DesignAssembler encounters a DesignPayload whose JSON.stringify length > 512,000
When:   Cache assembly runs
Then:   A PublishError('design_payload_exceeds_size_cap') is thrown
        qdb_publish_job.qdb_error_details contains the specific error message
        No silent failure; the form admin can see why the job failed
Priority: High
Type: Unit + Integration


────────────────────────────────────────────────────
3N. SECURITY TESTS
    (references NFR-005, NFR-006, NFR-007, NFR-008, R-002)
────────────────────────────────────────────────────

TC-SC-001: @import injection attempt is blocked at designer save path
References: NFR-005 / R-002
Given:  QA admin enters in the Custom CSS textarea:
        @import url('https://attacker.com/evil.css');
When:   The textarea value is processed by the designer's debounced sanitizer
Then:   The @import rule is stripped before the value reaches Dataverse
        Designer shows the warning: "Some rules were removed as they do not
        meet the security policy"
Priority: Critical
Type: Security (manual, staging)

TC-SC-002: url() with external tracking domain blocked in background declaration
References: NFR-005
Given:  customCss = ".qdb-form { background: url('https://evil.com/track.gif'); }"
When:   Processed by CssSanitiserPlugin at designer save path
Then:   Declaration stripped; url() with evil.com not present in saved customCss
Priority: Critical
Type: Security

TC-SC-003: expression() declaration blocked
References: NFR-005
Given:  customCss = ".qdb-form .field { width: expression(document.body.clientWidth); }"
When:   Processed by CssSanitiserPlugin
Then:   Declaration stripped; expression() not present in saved value
Priority: Critical
Type: Security

TC-SC-004: On-prem runtime re-sanitizes CSS from cache (defense in depth)
References: NFR-005 / architecture Section 7 / SC-07
Given:  The render cache JSON is manually modified to contain an @import rule
        in FormDesign.customCss (simulating a cache tampering scenario)
When:   qdb_form_runtime.html loads the form
Then:   CssSanitiserPlugin re-sanitizes before injection
        The @import rule is NOT injected into the DOM
        No external stylesheet is loaded
Priority: Critical
Type: Security (manual, on-prem environment)

TC-SC-005: cssClassName with invalid characters rejected by designer
References: NFR-006 / BR-009
Given:  QA admin enters the following cssClassName values in the Section Style tab:
        (a) "foo; color:red" — contains semicolon
        (b) "<script>alert</script>" — contains angle brackets
        (c) "123name" — begins with digit
When:   Designer validates each value on input
Then:   (a), (b), (c) each show an inline validation error
        None of these values can be saved (Save is blocked for the affected field)
Priority: Critical
Type: Security

TC-SC-006: fontUrl with HTTP scheme rejected
References: BR-010 / NFR-008
Given:  Admin enters fontUrl = "http://fonts.googleapis.com/css2?family=Arial"
When:   ThemeStylePanel validates on blur
Then:   Inline error: "Font URL must use HTTPS"
        Value is not saved to Dataverse
Priority: Critical
Type: Security

TC-SC-007: fontUrl with non-allowlisted HTTPS domain rejected
References: BR-010 / NFR-008
Given:  allowedDomains = ["fonts.googleapis.com", "fonts.gstatic.com"]
        Admin enters fontUrl = "https://fonts.attacker.com/css2?family=Arial"
When:   ThemeStylePanel validates on blur
Then:   Inline error identifies the offending domain
        Value is not saved to Dataverse
Priority: Critical
Type: Security

TC-SC-008: CSS allowlist admin role gates write access to qdb_css_allowlist_config
References: NFR-008 / C-006 / deployment runbook Step 3
Given:  A user with form-administrator role ONLY (no CSS Allowlist Admin role)
When:   That user attempts to create or update a qdb_css_allowlist_config record
Then:   Dataverse rejects the write with a privilege error
        No change is made to the allowlist
Priority: Critical
Type: Security

TC-SC-009: Custom CSS scoping prevents bleeding into adjacent CRM UI
References: NFR-007 / C-005
Given:  customCss contains a rule targeting a generic element class
        that happens to match a class name in CRM native UI
        The form is rendered in the CRM on-prem runtime
When:   The customCss style block is injected into the web resource document
Then:   The style rule is scoped inside .dfe-form-{formCode} and does NOT
        affect CRM native UI elements outside the form container
Priority: High
Type: Security (manual, on-prem environment)

TC-SC-010: Backend re-sanitizes on save endpoint as defense in depth
References: NFR-005 / architecture Section 7 (backend path)
Given:  A direct API call to POST /api/forms/:id/design with a payload that
        contains @import in customCss (bypassing the designer UI)
When:   CssSanitiser.sanitiseCustomCss runs on the backend
Then:   @import is stripped before Dataverse write
        The stored customCss value does not contain @import
Priority: High
Type: Security


────────────────────────────────────────────────────
3O. ACCESSIBILITY TESTS
    (references FR-025..FR-030, NFR-001, NFR-009, C-003, OQ-010)
────────────────────────────────────────────────────

TC-AX-001: All FR-025 blocking color pairs show WCAG indicator in designer (SM-003)
References: FR-025 / SM-003
Given:  ThemeStylePanel and ButtonStylePanel are open with default values
When:   QA audits all color picker controls:
        primaryColor vs backgroundColor, primaryColor vs surfaceColor,
        textPrimaryColor vs backgroundColor, textPrimaryColor vs surfaceColor,
        Submit/SaveDraft/Cancel button color vs backgroundColor
Then:   Each of these 7 pairs has a WcagContrastIndicator visible alongside
        the color picker showing a ratio (e.g., "4.52:1") and a level badge
        (SM-003: 100% of color pickers have a visible contrast indicator)
Priority: Critical
Type: E2E

TC-AX-002: Advisory pairs (textSecondaryColor, borderColor) show informational MessageBar
References: FR-026 / brd-style-resolutions.md (OQ-009 resolved: advisory-only)
Given:  textSecondaryColor is set to a value producing ratio 3.8:1 vs backgroundColor
When:   ThemeStylePanel renders the advisory section
Then:   An informational MessageBar appears warning about the contrast level
        This MessageBar does NOT appear in the publish gate
        The form CAN be published without acknowledging this advisory
Priority: High
Type: E2E

TC-AX-003: State-style contrast (focusStyle, errorStyle) advisory-only, not blocking
References: brd-style-resolutions.md (OQ-009 resolved: state styles = advisory-only v1)
Given:  FieldDesign.focusStyle contains a color with ratio < 3:1
When:   Admin attempts to publish the form
Then:   Publish is NOT blocked by the state-style contrast (advisory only in v1)
        An advisory notice may appear but not a blocking error
Priority: High
Type: E2E

TC-AX-004: WcagContrastIndicator aria-label is screen-reader accessible
References: NFR-009 / WCAG 2.1 (secondary — designer itself is an internal tool)
Given:  A WcagContrastIndicator renders for the primaryColor pair
When:   The aria-label attribute is inspected
Then:   aria-label reads the full result: e.g.,
        "Primary on Background: 4.52:1 — AA Large"
Priority: Medium
Type: Accessibility (manual)

TC-AX-005: Contrast calculation passes W3C conformance test suite vectors
References: NFR-009 / C-003
Given:  The W3C WCAG 2.1 published test vectors for relative luminance
When:   calculateContrastRatio is called for each vector pair
Then:   Results match the W3C reference values to 2 decimal places
Priority: Critical
Type: Unit (covered by TC-UT-028..TC-UT-036; this TC flags the systematic
      coverage requirement against the W3C conformance set)

────────────────────────────────────────────────────
3P. PERFORMANCE TESTS
    (references NFR-001, NFR-002, NFR-003, SM-006)
────────────────────────────────────────────────────

TC-PF-001: StyleEngine.resolveField warm cache under 1ms per call (SM-006)
References: NFR-003 / SM-006
Given:  A DesignPayload with 100 fields (each with FieldDesign populated)
        All 100 fields resolved once to warm the WeakMap cache
When:   All 100 fields resolved again via resolveField (warm path) and timed
Then:   Total elapsed time < 100ms (average < 1ms per call)
        This test is included in the CI unit suite as a Vitest benchmark
        and MUST run on every build (SM-006 enforcement)
Priority: Critical
Type: Performance (Unit benchmark)
Tool: Vitest benchmark

TC-PF-002: StyleEngine.resolveSection warm cache under 1ms per call
References: NFR-003
Given:  A DesignPayload with 20 sections (each with SectionDesign populated)
        All 20 sections resolved once to warm cache
When:   All 20 sections resolved again (warm path) and timed
Then:   Total elapsed time < 20ms (average < 1ms per call)
Priority: High
Type: Performance (Unit benchmark)
Tool: Vitest benchmark

TC-PF-003: WCAG contrast calculation under 10ms per invocation (NFR-001)
References: NFR-001
Given:  A color pair (hexForeground, hexBackground)
When:   calculateContrastRatio is called and timed 1000 times in sequence
Then:   Average time per call < 0.1ms (well under the 10ms NFR-001 threshold)
        (The 10ms threshold is measured from color input change event to
         WcagContrastIndicator re-render — the pure calculation must be < 1ms
         to leave headroom for React re-render overhead)
Priority: High
Type: Performance (Unit benchmark)
Tool: Vitest

TC-PF-004: Style tab initial render under 200ms on first activation (NFR-002)
References: NFR-002
Given:  Designer is open on a form with 20 fields and 5 sections
        Style tab has NOT been opened yet (deferred mount)
When:   Admin clicks the Style tab (first activation)
        Playwright measures time from click to tab content visible
Then:   Time from click to tab rendered < 200ms (tab-deferred strategy)
        Sub-tab panels for Sections, Fields not yet mounted (defer until sub-tab click)
Priority: High
Type: Performance (E2E, staging timing test)
Tool: Playwright with performance.now() measurement


4. PERFORMANCE BENCHMARKS
═══════════════════════════════════════════════════

| Scenario                              | NFR       | Target         | Threshold    | Tool              |
|---------------------------------------|-----------|----------------|--------------|-------------------|
| StyleEngine.resolveField (warm)       | NFR-003   | < 0.5ms avg    | < 1ms avg    | Vitest benchmark  |
| StyleEngine.resolveSection (warm)     | NFR-003   | < 0.5ms avg    | < 1ms avg    | Vitest benchmark  |
| WCAG calculateContrastRatio           | NFR-001   | < 0.1ms        | < 1ms        | Vitest            |
| Style tab first render                | NFR-002   | < 150ms        | < 200ms      | Playwright timing |
| DesignPayload JSON size               | NFR-004   | < 100KB        | < 512KB hard | Manual / CI check |
| Cache assembly (5 parallel queries)   | None      | < 2000ms       | < 5000ms     | Supertest         |
| STYLE_CHANGE job creation (fire/fgt)  | C-004     | < 500ms        | < 30s        | E2E timing        |

Notes:
- NFR-003 and NFR-001 targets must be included as Vitest benchmarks in CI
  (SM-006 mandates the resolveField benchmark runs on every build).
- Style tab render (NFR-002) is measured manually in staging during UAT.
  A Playwright timing test is recommended but not required for CI.
- The 2-minute CRM plugin limit (NFR-015 / C-004) applies to the
  synchronous STYLE_CHANGE publish job creation plugin, not to cache
  regeneration (which is async). No explicit perf test needed for the async path,
  but smoke verification in E2E confirms the fire-and-forget returns quickly.


5. AUTOMATION PLAN
═══════════════════════════════════════════════════

5.1 Automated (included in CI)
────────────────────────────────────────────────────
Suite                     Tests               CI Stage    Tool
Unit — picklist maps      TC-UT-001..016      Stage 1     Vitest
Unit — CssSanitiser       TC-UT-017..027      Stage 1     Vitest
Unit — contrastRatio      TC-UT-028..036      Stage 1     Vitest
Unit — cssClassName/hdrstl TC-UT-037..042     Stage 1     Vitest
Unit — AllowlistService   TC-UT-043..045      Stage 1     Vitest
Unit — StyleEngine memo   TC-UT-046..050      Stage 1     Vitest (incl. benchmark)
Unit — DSM deprecation    TC-UT-051           Stage 1     grep + tsc
Unit — PATCH semantics    TC-UT-052..053      Stage 1     Vitest
Integration — all above   TC-INT-001..010     Stage 2     Vitest (real Dataverse)
E2E — WCAG gate           TC-E2E-002..004     Stage 3     Playwright
E2E — style flows         TC-E2E-005..009     Stage 3     Playwright
E2E — on-prem parity      TC-E2E-010          Stage 3     Playwright + manual diff
Visual regression         TC-REG-001..002     Stage 3     Playwright visual compare
RTL unit tests            TC-RTL-001..004     Stage 1     Vitest
Backward compat units     TC-BC-001           Stage 1     Vitest
Security injection units  TC-SC-001..003      Stage 1     Vitest (input assertions)
WCAG calculation AX       TC-AX-001 (partial) Stage 1     Vitest

5.2 Manual (staging / UAT)
────────────────────────────────────────────────────
Test                      Reason not automated
TC-E2E-011 (SM-001 UAT)  Requires real user timing exercise with admin participant
TC-AX-001 (SM-003 audit) Final visual confirmation that all pickers show indicators
TC-AX-004 (aria-label)   Screen reader tooling not in CI
TC-PF-004 (tab render)   Requires human judgement on "visible" threshold in real browser
TC-SC-004 (on-prem resanitize) Requires manual cache JSON tampering in CRM context
TC-SC-008 (role gating)  Requires two Dataverse user accounts; manual role switching
TC-SC-009 (CSS scoping in CRM) Requires CRM on-prem environment; not in CI
TC-E2E-010 (parity)      On-prem CRM runtime not available in CI
TC-RTL-005 (on-prem RTL) Same reason

5.3 Deferred (pending OQ resolution)
────────────────────────────────────────────────────
TC-SC-006/007 full extension: OQ-007 (font policy) must resolve before the positive
  fontUrl acceptance test can be parameterized with the correct approved domains.
  Currently executable as negative tests only (HTTP rejection, off-allowlist rejection).

TC per OQ-010: If QDB requires a third-party WCAG audit as a go-live gate,
  QA must coordinate the audit before Phase 7 CEO approval. Test cases for
  third-party audit findings are outside this document's scope but must be
  tracked as a Phase 7 blocker. See Section 7.


6. DEFINITION OF DONE
═══════════════════════════════════════════════════

The following checklist must pass before DFE-STYLE-001 is presented to the
CEO for Phase 7 final approval. Each item maps to a test in this strategy.

  [ ] TC-UT-001..016: All 16 picklist round-trip unit tests pass for every
      enum field across all 5 style entities (ShadowStyle, SpacingScale,
      LayoutType, SectionStyle, ColumnLayout, CardStyle, CollapsibleStyle,
      VisibilityAnimation, FieldWidth, ButtonSize, ButtonAlignment, HoverEffect,
      LoadingStyle — including None=100000000 variants)

  [ ] TC-UT-041: headerStyle JSON round-trip test passes (was a data-loss bug)

  [ ] TC-UT-043: AllowlistService returns empty array (no exception) when no
      config record exists — fail-safe confirmed

  [ ] TC-UT-050: StyleEngine.resolveField benchmark passes at < 1ms/call (SM-006)

  [ ] TC-UT-051: grep of designer/src finds zero DesignerStyleModel references
      outside the deprecated definition file (SM-008 enforcement)

  [ ] TC-UT-052..053: PATCH semantics unit tests pass; partial save does not
      overwrite unrelated attributes

  [ ] TC-INT-003: cssClassName end-to-end integration test passes; qdb_css_class
      and qdb_field_css_class flow through DesignAssembler into DesignPayload
      and are carried into the render cache (resolves open item 3 from phase-4)

  [ ] TC-INT-007: PATCH save integration test passes on real Dataverse
      (existing section attrs not overwritten by partial save)

  [ ] TC-INT-009: AllowlistService reads 'global' key from Dataverse (not 'default')
      confirmed on real org5869857f post-provisioning

  [ ] TC-E2E-001..010: All 10 Playwright E2E tests pass in staging

  [ ] TC-E2E-003/004: WCAG publish gate blocks <3:1 pairs and requires
      acknowledgement for 3:1–4.5:1 pairs (SM-007)

  [ ] TC-REG-001: 442+ unit tests green (no new failures)

  [ ] TC-REG-002: Visual regression — zero pixel diff on all existing forms (SM-002)

  [ ] TC-REG-003: DFE-i18n-001 Arabic form baseline matches (no RTL regression)

  [ ] TC-REG-004: SM-008 zero DesignerStyleModel references confirmed

  [ ] TC-RTL-001..004: All RTL logical property unit tests pass

  [ ] TC-SC-001..010: All 10 security test cases pass (CSS injection, role gating,
      on-prem re-sanitization, CSS scoping, fontUrl domain validation)

  [ ] TC-PF-001..003: All 3 performance benchmark unit tests pass

  [ ] TC-AX-001: All 7 FR-025 blocking pairs have a WCAG indicator in the designer

  [ ] SM-004: 100% of forms published after deployment have a non-empty
      designPayload in their render cache JSON (verified by querying the cache
      for the test form and confirming the key exists and is non-null)

  [ ] SM-005: Portal and on-prem render comparison shows no visible differences
      for the style-test-form

  [ ] SM-007: Zero published forms have a <3:1 pair (publish gate test passed)

  [ ] OQ-007 decision recorded (test scope extended if new domains approved)

  [ ] OQ-010 go-live gate decision documented:
      If third-party audit required → audit scheduled and findings resolved
      If audit NOT required → QDB Compliance Team sign-off on record


7. QA ENTRY RISKS AND OPEN ITEMS
═══════════════════════════════════════════════════

RISK-QA-001: OQ-007 (font policy) — OPEN, blocks partial test coverage
  The QDB Brand Team has not confirmed which specific font CDN domains are
  approved beyond the seed defaults (fonts.googleapis.com, fonts.gstatic.com).
  Impact: TC-SC-006 positive case (valid fontUrl acceptance) cannot be
  parameterized with real approved domains. The negative cases (HTTP rejection,
  off-allowlist rejection) are fully testable now.
  Resolution path: QDB Brand Team provides approved domain list → QA extends
  TC-SC-006 with the confirmed domains and updates the allowlist seed record.
  Not a QA phase blocker, but a Phase 7 pre-deploy action item.

RISK-QA-002: OQ-010 (third-party WCAG audit as go-live gate) — OPEN, potential Phase 7 blocker
  The CEO approval for DFE-i18n-001 included an accessibility condition. It is
  not yet confirmed whether QDB Compliance requires a formal external WCAG 2.1
  AA audit for DFE-STYLE-001 specifically.
  Impact: If required, QA must coordinate with an external auditor BEFORE Phase 7.
  The audit findings may produce additional remediation tasks not in the current
  build scope.
  Resolution path: QDB Compliance Team / IT Director must answer OQ-010 before
  Phase 7 CEO approval. Flag this explicitly in the Phase 7 submission.
  Confidence: 90% that this is a real blocker if QDB Compliance follows the
  same standard they applied to DFE-i18n-001.

RISK-QA-003: Open item 3 from phase-4-tech-style.md — cssClassName backend read path
  The phase-4 build summary explicitly notes that backend DesignAssembler and
  backend constants may not yet read qdb_css_class / qdb_field_css_class because
  these 2 attributes are the only net-new schema additions.
  Impact: TC-INT-003 and TC-E2E-005/006 (cssClassName E2E flow) may fail until
  DesignAssembler is confirmed to read these two attribute names.
  Resolution path: Verify during code review (Step 7) that DesignAssembler
  includes SECTION_DESIGN_EXT_ATTRS.CSS_CLASS and FIELD_DESIGN_EXT_ATTRS.CSS_CLASS
  in its $select and maps them to cssClassName. If missing, this is a build defect,
  not a QA finding — raise as code-review blocker before QA execution.
  Confidence: 95% that this integration gap exists based on the explicit note in
  phase-4-tech-style.md open item 3.

RISK-QA-004: 6 deferred clean-code items are non-functional QA non-blockers
  Phase-4-tech-style.md lists M-002..M-010 (file/param splits, specific exception
  types, DI via interfaces, residual 'as' casts) as remaining code-review debt.
  These are clean-code standards issues, not functional defects.
  Impact on QA: Zero. These items do not affect test outcomes or correctness.
  They must be resolved before the code-review gate (Step 7) but are not QA
  test cases.

RISK-QA-005: SC-02 on-prem PostCSS sandbox — one manual confirmation outstanding
  The spike verified PostCSS runs in a window-shim environment. A real CRM
  web-resource iframe confirmation remains a recommended check per phase-4.
  Impact: TC-SC-004 (on-prem re-sanitization) requires this to be confirmed
  in the real CRM context.
  Resolution path: Use postcss-spike-test.html (shipped in build) to confirm
  PostCSS loads correctly in org5869857f before running TC-SC-004.
  Confidence: 85% that SC-02 is already resolved (spike passed); manual CRM
  confirmation is low-risk corroboration.


8. TEST COUNT ESTIMATE AND EXECUTION ORDER
═══════════════════════════════════════════════════

8.1 Total test case count
────────────────────────────────────────────────────
  Unit tests (TC-UT-001..053):              53 cases
  Integration tests (TC-INT-001..010):      10 cases
  E2E Playwright (TC-E2E-001..011):         11 cases
  Regression (TC-REG-001..005):             5 cases
  RTL cross-cutting (TC-RTL-001..005):      5 cases
  Backward compat (TC-BC-001..004):         4 cases
  Security (TC-SC-001..010):               10 cases
  Accessibility (TC-AX-001..005):           5 cases
  Performance (TC-PF-001..004):             4 cases
  ─────────────────────────────────────────────────
  TOTAL:                                   107 cases
  (plus the existing 442 baseline tests that remain as regression gate)

8.2 Recommended execution order
────────────────────────────────────────────────────
Phase A (Pre-provisioning — can run now in CI on mock/stub layer):
  All TC-UT-* unit tests (53 cases)
  TC-RTL-001..004 (RTL unit tests)
  TC-BC-001 (backward compat unit)
  TC-SC-001..003 (injection unit tests)
  TC-PF-001..003 (benchmark unit tests)
  TC-UT-051 / TC-REG-004 (DesignerStyleModel compile check)
  TC-REG-001 (existing 442 green)

  Pre-provisioning gate: ALL Phase A tests must pass before provisioning
  the org5869857f schema (schema changes are one-way for existing attributes).

Phase B (Post-provisioning — real Dataverse):
  TC-INT-009 FIRST (confirm 'global' key reads correctly — gate for all others)
  TC-INT-001..010 (all integration tests)
  TC-BC-002 (version snapshot integration)

Phase C (Staging — after code and web resources deployed):
  TC-E2E-001..010 (Playwright E2E suite)
  TC-REG-002..003 (visual regression, RTL E2E regression)
  TC-SC-004, TC-SC-008..009 (manual security in CRM context)
  TC-RTL-005 (on-prem RTL manual check)
  TC-AX-001..004 (accessibility manual checks)
  TC-PF-004 (style tab render timing)
  TC-E2E-011 (SM-001 UAT timing exercise — last, requires admin participant)

Phase D (Pre-Phase 7 gate):
  Definition of Done checklist review
  OQ-010 decision recorded
  OQ-007 extension of TC-SC-006/007 if domains confirmed


═══════════════════════════════════════════════════
END OF DOCUMENT — DFE-STYLE-001 Phase 5 QA Test Strategy v1.0
═══════════════════════════════════════════════════
