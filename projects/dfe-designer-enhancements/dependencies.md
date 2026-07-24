# DFE-ENH-001 — Phase 1 Dependency Decisions
**Engagement:** DFE-ENH-001 — Dynamic Form Engine Designer Enhancement Backlog
**Prepared by:** Maqsad AI — GitHub Researcher
**Date:** 2026-07-10
**Scope:** Phase 1 must-haves (FR-001, FR-003, FR-006, FR-007, FR-009, ENT-005, ENT-008, ENT-010)

---

## Summary Decision Table

| Requirement | Topic | Decision | Library / Approach |
|---|---|---|---|
| ENT-008 | WCAG 2.1 AA automated testing (CI + Playwright) | ADOPT | `axe-core` v4.12.x + `@axe-core/playwright` |
| ENT-008 | WCAG 2.1 AA automated testing (Vitest component) | ADOPT (below-threshold) | `vitest-axe` v0.1.x — thin axe-core wrapper, practical necessity |
| FR-009 | Keyboard drag-drop — configure vs. switch | EXTEND incumbent | dnd-kit `KeyboardSensor` + custom key bindings; no library switch |
| ENT-010 | Large-form canvas virtualization | ADOPT | `@tanstack/react-virtual` v3.x |
| FR-003 | Design-time config linting engine | BUILD | Custom `FormLinter` on top of Zod (already adopted) + graph walk |
| FR-006 / FR-007 | Conditional-required + cross-field validation | EXTEND incumbent | Extend existing `ExpressionEngineServer/Client`; no second rule engine |
| FR-001 (conflict UX) / FR-004 (diff data) | Object diffing — conflict dialog + version diff data layer | ADOPT | `microdiff` v1.5.x |
| FR-004 (Phase 2) | Visual diff UI renderer | DEFER to architect | No 1000-star React diff component qualifies; recommend custom component over microdiff output |
| ENT-005 | Field-level before/after audit capture | EXTEND incumbent | Immer `produceWithPatches()` — already in stack (29k stars) |

**Three decisions requiring architect confirmation before Phase 1 build authorization:**
1. FR-009 / dnd-kit: Confirm whether KeyboardSensor issue #985 (broken with variable large items) is resolved or requires a custom sensor — if still broken, architect must decide between a custom KeyboardSensor wrapper and a library switch.
2. FR-004 visual diff renderer: No 1000-star React diff viewer is React-18-compatible and actively maintained. Architect must decide whether to BUILD a thin component over `microdiff` output or accept `jsondiffpatch`'s HTML formatter (5.3k stars, MIT, but last release Dec 2023).
3. ENT-008 / axe-core MPL-2.0: The license is not MIT/Apache/BSD. Architect must confirm with Maqsad AI legal that MPL-2.0 is accepted as a dev/test-only dependency that is never bundled into the shipped product.

---

## Detailed Findings

### 1. ENT-008 — WCAG 2.1 AA Accessibility Testing Tooling

**Requirement summary:** Automated WCAG 2.1 AA testing integrated into the existing Vitest + Playwright pipeline. Zero AA violations on axe-core scan is the acceptance criterion.

**Queries run:**
1. `site:github.com axe-core accessibility testing stars:>1000`
2. `site:github.com "@axe-core/playwright" vitest-axe playwright accessibility automation 2026`
3. `site:github.com vitest-axe axe accessibility vitest stars`

---

**Repo: dequelabs/axe-core**
- URL: https://github.com/dequelabs/axe-core
- Stars: 7,300
- Last commit: June 2026 (v4.12.1 release)
- License: MPL-2.0
- Open issues: 437
- Fit: The industry-standard automated accessibility engine. Powers Deque's commercial tooling and is the reference implementation for WCAG rule coverage. Integrates with any test runner via the axe-core JS API. Works in any browser-like environment (jsdom, real Chromium via Playwright).
- Blocking issues: MPL-2.0 is a weak-copyleft license, not MIT/Apache/BSD. However, as a dev/test dependency that is never bundled into the DFE product bundle, there is no copyleft obligation on the product code. The obligation only applies if Maqsad AI modifies and redistributes axe-core source files themselves — which will not happen. FLAG: architect must confirm this interpretation with Maqsad AI's license policy before adoption.

**Repo: dequelabs/axe-core-npm (sub-package: @axe-core/playwright)**
- URL: https://github.com/dequelabs/axe-core-npm
- Stars: 708 (monorepo; axe-core parent has 7.3k)
- Last commit: Active (tracks axe-core releases)
- License: MPL-2.0
- Packages: `@axe-core/playwright`, `@axe-core/react`, `@axe-core/puppeteer`, `@axe-core/cli`
- Fit: `@axe-core/playwright` injects axe-core into Playwright browser contexts and returns structured violation objects. This integrates directly with the existing Playwright E2E test suite at the route level.

**Repo: chaance/vitest-axe**
- URL: https://github.com/chaance/vitest-axe
- Stars: 94 — BELOW 1,000-star threshold
- Last commit: Active
- License: MIT
- Fit: The only Vitest-native axe matcher (`toHaveNoViolations`). It is a thin wrapper that delegates to axe-core. The low star count is explained by the fact that most projects run axe-core via Playwright (E2E) rather than in unit tests; this package fills a niche use. Since the underlying engine (axe-core, 7.3k stars) is the trusted dependency, vitest-axe is an acceptable adapter. NOTE: incompatible with Happy-DOM Vitest environment; requires jsdom.

**VERDICT: ADOPT**

**Recommended toolchain:**
- E2E / CI layer: `@axe-core/playwright` — inject into all Playwright test spec files that exercise DFE designer pages and rendered form pages. Run as part of every E2E pass. Zero AA violations is the gate condition.
- Component unit test layer: `vitest-axe` (`toHaveNoViolations`) — add to component tests for key interactive components (drag handles, validation error displays, focus traps). Below threshold but practical necessity; there is no alternative Vitest integration above 1,000 stars.
- Manual audit layer: NVDA on Windows + VoiceOver on macOS per BRD acceptance criteria. No library replaces this; it is a process deliverable.
- RTL layer: test Arabic/Urdu forms with screen reader in RTL mode per ENT-008 acceptance criterion. axe-core runs language-agnostic rules; RTL correctness requires manual validation.

**License risk:** MPL-2.0 — moderate flag. Acceptable as dev dependency; never ships in product. Architect confirmation required.

---

### 2. FR-009 — Keyboard-Accessible Drag-Drop and dnd-kit Robustness

**Requirement summary:** Alt+Up / Alt+Down keyboard reordering; eliminate text-selection degradation and freeze on 50+ field forms. dnd-kit is already in the stack.

**Queries run:**
1. `site:github.com dnd-kit keyboard sensor accessibility drag drop stars:>1000`
2. `site:github.com dnd-kit last commit 2025 2026 maintenance status`

---

**Repo: clauderic/dnd-kit (INCUMBENT)**
- URL: https://github.com/clauderic/dnd-kit
- Stars: 17,400
- Last commit: April 2026 (fixes for SortableContext and grouped record sorting)
- License: MIT
- Open issues: 80
- Fit: Already in the stack. Has `KeyboardSensor` and `sortableKeyboardCoordinates` built into `@dnd-kit/sortable`. Keyboard activation defaults to Space/Enter; arrow keys move the item in 25px increments during drag. The `sortableKeyboardCoordinates` coordinate getter maps the sensor to sortable-list reordering.
- Known issue: GitHub issue #985 ("Keyboard sensor is completely broken with variable large items") is open. This affects forms where field heights vary (e.g., section headers vs. fields). The fix requires either a custom `KeyboardSensor` that uses item-index snapping rather than pixel offsets, or upgrading to the new dnd-kit API (the repo references a new version in progress).
- Maintenance concern: Issue #1830 (Nov 2025) raises active maintenance concerns. Main branch commit pace has slowed. However, April 2026 activity and 17.4k stars indicate the library is not abandoned.

**Alternative evaluated: @hello-pangea/dnd**
- Fork of react-beautiful-dnd, maintained fork. Good keyboard support and simpler API for list reordering.
- Switching cost: all existing dnd-kit code (DndContext, SortableContext, useSortable hooks) would need replacement. Not justified unless KeyboardSensor issue #985 is confirmed unresolvable.

**Alternative evaluated: react-aria (Adobe)**
- URL: https://github.com/adobe/react-spectrum (15k stars, MIT)
- react-aria's `useDraggable`/`useDroppable` is WCAG-focused and excellent for accessibility.
- Switching cost: heavy — react-aria uses its own focus and keyboard management system that overlaps with Fluent UI v9's own accessibility primitives.

**VERDICT: EXTEND incumbent (dnd-kit)**

**Rationale:** Switching carries a full refactor risk across all drag-drop components. dnd-kit is stable enough for the non-keyboard path. The keyboard path (FR-009) requires either:
(a) A custom `KeyboardSensor` that moves by sorted index rather than pixel coordinates (resolvable in ~50 lines of TypeScript), or
(b) Waiting for dnd-kit's upcoming new API version.

The FR-009 key bindings (Alt+Up / Alt+Down) are non-default and require a custom sensor or overriding `sortableKeyboardCoordinates` regardless of which library is used. Build the custom sensor wrapping dnd-kit's primitive.

Text-selection degradation fix: add `user-select: none` on `.dfe-canvas` during drag via dnd-kit's `DragOverlay` + CSS-variable approach. No new dependency needed.

**Architect confirmation required:** Confirm whether KeyboardSensor issue #985 is resolved in the April 2026 release or still affects the field list (which uses variable-height items). If unresolved, architect must decide between the custom sensor approach and an upstream PR.

---

### 3. ENT-010 — Large-Form Editor Virtualization

**Requirement summary:** Eliminate canvas freeze for 100–200 field forms. Performance target: 200-field load < 3s, reorder < 200ms.

**Queries run:**
1. `site:github.com react-virtual tanstack virtual list stars:>1000`

---

**Repo: TanStack/virtual (`@tanstack/react-virtual`)**
- URL: https://github.com/TanStack/virtual
- Stars: 7,000
- Last release: July 2, 2026 (v3.13.32)
- License: MIT
- Bundle size: ~10–15 KB
- Fit: Headless virtualizer for React. Renders only the visible slice of any scrollable list. Supports variable item heights (measured or estimated), horizontal + vertical virtualization, and sticky items. React 18 compatible. No opinion on styling — wraps any child component, which means Fluent UI v9 field cards work unchanged inside the virtualized list.
- Compatibility with dnd-kit: known integration pattern exists (render drag overlay outside the virtualized list, use transform CSS for drag positions).

**Repo: petyosi/react-virtuoso**
- URL: https://github.com/petyosi/react-virtuoso
- Stars: 6,400
- Last release: June 27, 2026 (v4.18.10)
- License: MIT
- Fit: Component-driven virtualized list. Simpler API for pure lists but tighter coupling to its own scroll container, which complicates integration with dnd-kit's DndContext overlay strategy.

**Repo: bvaughn/react-window**
- Not evaluated in detail — project has minimal recent commits. TanStack/virtual is the modern successor.

**VERDICT: ADOPT `@tanstack/react-virtual`**

**Rationale:** Headless API composable with dnd-kit. Actively maintained (July 2026). MIT. Variable-height support handles the mixed field-type list (sections are taller than fields). react-virtuoso is a strong alternative but its component-centric model creates friction with dnd-kit's drag overlay pattern.

**Integration approach:** Wrap the field list in `useVirtualizer`. Render drag overlay items outside the virtual container (in dnd-kit's `DragOverlay`). Estimated item heights: 56px for fields, 80px for section headers. Use `overscan: 5` to prevent scroll-visible jitter during keyboard navigation.

---

### 4. FR-003 — Design-Time Config Linting

**Requirement summary:** Pre-publish static analysis: duplicate schemaNames, unmapped required fields, orphaned CRM attribute references, rules referencing deleted fields, empty containers.

**Queries run:**
1. `site:github.com json form validation linting schema integrity stars:>1000`

---

**Repos evaluated:**
- `giantswarm/schemalint` — lints JSON *Schema* documents for schema quality, not form definitions.
- `zaach/jsonlint` — JSON syntax validator only.
- `sourcemeta/jsonschema` — CLI for JSON Schema validation, not form business logic.
- `json-schema-org/json-schema-linting` — lint rules for JSON Schema authoring, not domain-specific form integrity.

None of these address the domain-specific lint rules needed:
- Cross-reference between field `schemaName` values and submission mapping targets
- Cross-reference between rule `fieldRef` values and the live field registry
- CRM attribute existence check (requires Dataverse metadata, not pure JSON analysis)

Zod is already in the stack and can validate the shape of the form definition object (structural validity). The lint rules above are business-logic checks that walk the form definition graph.

**VERDICT: BUILD**

**Rationale:** No 1000-star library covers form-definition cross-reference integrity. The five lint rules are domain functions:
- Duplicate schemaName: `Set` uniqueness check on all field records.
- Required fields with no mapping: intersection of `isRequired=true` fields and `submissionMappings` keys.
- Orphaned mappings: compare mapping target attribute names against a fetched list of CRM entity attributes (async; cached for the session).
- Orphaned rule references: walk all `conditions[].fieldRef` and `actions[].fieldRef` across business and validation rules; compare against live field schemaNames.
- Empty containers: walk tab/section tree for sections with `fields.length === 0`.

**Implementation:** A `FormLinter` class with one method per lint rule, returning a typed `LintResult[]`. Zod validates the form definition's structural shape before linting. All methods are pure functions (no side effects). Output: `{ severity: 'error' | 'warning', code: string, message: string, affectedIds: string[] }[]`.

---

### 5. FR-006 / FR-007 — Conditional-Required and Cross-Field Validation

**Requirement summary:** New validation rule types using the existing condition builder. Strong bias to extend the incumbent expression engine rather than introduce a second rule system.

**Queries run:**
1. `site:github.com json-rules-engine json-logic-js business rules stars:>1000`

---

**Repo: CacheControl/json-rules-engine**
- URL: https://github.com/CacheControl/json-rules-engine
- Stars: 3,100
- Last commit: unclear (not displayed)
- License: ISC (permissive; equivalent to MIT for all practical purposes)
- TypeScript: type definitions in `/types`
- Fit: A capable rules engine with async fact evaluation. However, introducing it would create a second rule serialization format alongside the existing `ExpressionEngineServer/Client`, which stores rules in a Dataverse-specific JSON schema already used by the business-rule builder.

**Repos evaluated (disqualified for same reason):**
- `json-logic/json-logic-engine`: lower community traction
- `RXNT/json-rules-engine-simplified`: too simplistic for cross-field comparisons
- All require a separate rule storage schema inconsistent with the existing engine

**Analysis of EXTEND vs. ADOPT:**
- The existing `ExpressionEngineServer` already processes conditions of the form `{ fieldRef, operator, value }`.
- FR-006 (Conditional Required) is: "apply `isRequired=true` if condition evaluates to `true`." This is a new _effect type_, not a new condition type — the condition structure is unchanged.
- FR-007 (Cross-Field Validation) is: compare field A's value against field B's value using a comparison operator. This adds `{ fieldRef2: string }` as a right-hand operand to the condition, which the existing operator/value pattern already partially supports.
- The condition-builder UI already exists and is reused per BRD (FR-006 acceptance criteria).

Adding a second library means two rule-evaluation pipelines, two Dataverse entity schemas for rule storage, and duplicate validation logic in the runtime. This is the "two rule systems" anti-pattern.

**VERDICT: EXTEND incumbent (`ExpressionEngineServer/Client`)**

**Extension plan:**
- Add `conditional_required` to the validation rule type enum (alongside `required`, `min_length`, etc.).
- Add `cross_field` operator support to the condition evaluator: `{ fieldRef, operator, targetFieldRef }` instead of `{ fieldRef, operator, value }`.
- The runtime already calls `ExpressionEngineClient.evaluate()` at submission time; extend the output schema to include a `conditionalRequired` flag propagated to the field state.
- No new npm dependency required.

---

### 6. FR-001 Conflict Dialog / FR-004 Diff Foundation — Object Diffing

**Requirement summary:** (a) 412 conflict resolution dialog showing "what changed" between two form versions. (b) Phase-2 version diff view (FR-004 is Phase 2 but the diff data layer must be chosen now to avoid rework).

**Queries run:**
1. `site:github.com microdiff deep-object-diff jsondiffpatch object diff javascript stars:>1000`
2. `site:github.com react-diff-viewer react 18 stars:>1000`

---

**Repo: AsyncBanana/microdiff**
- URL: https://github.com/AsyncBanana/microdiff
- Stars: 3,800
- Last commit: December 2024 (v1.5.0)
- License: MIT
- Bundle size: <1 KB minified, zero dependencies
- TypeScript: native types
- Fit: Compares two objects and returns an array of `{ type: 'CREATE'|'REMOVE'|'CHANGE', path: string[], oldValue: any, value: any }`. Handles nested objects and arrays. Significantly faster than most alternatives. Stable API with no recent breaking changes.
- Last commit concern: December 2024 is 7 months old. However, at <1 KB with zero dependencies, the library is feature-complete and stable. This is low risk.

**Repo: benjamine/jsondiffpatch**
- URL: https://github.com/benjamine/jsondiffpatch
- Stars: 5,300
- Last release: December 2023 (v0.6.0)
- License: MIT
- Bundle size: 16 KB min+gzip
- Fit: More powerful — LCS array diffing, patch/unpatch functions, and an HTML visual formatter. However, last release is December 2023 (18 months ago). The HTML formatter is jQuery-free but outputs raw DOM strings, not React components.
- Blocking issue for Phase-2 visual diff: the HTML formatter does not produce React elements; integrating it in the designer requires dangerouslySetInnerHTML or a custom wrapper. Maintenance pace is a moderate concern.

**Repo: mattphillips/deep-object-diff**
- URL: https://github.com/mattphillips/deep-object-diff
- Stars: 1,100 (just above threshold)
- License: MIT
- Fit: Returns a flat diff object (only changed keys at each level). Simpler than microdiff; does not return old values, only new values. Insufficient for "before → after" audit records where both values are required.

**React diff viewer candidates:**
- `praneshr/react-diff-viewer`: 1.2k stars, MIT, React 18 issue open (issue #166), last release old — BLOCKED on React 18 compatibility.
- `Aeolun/react-diff-viewer-continued`: 226 stars — BELOW 1,000-star threshold, but released v4.3.0 on July 10, 2026 (active), MIT, supports `DiffMethod.JSON`. Cannot recommend as primary adoption due to star threshold, but architect may note it as a candidate.

**VERDICT: ADOPT `microdiff` (diff core)**

**Rationale:** At <1 KB, zero dependencies, native TypeScript, and MIT license, microdiff is the right choice for the diff data layer. It covers both use cases:
- FR-001 conflict dialog: diff the server's current form JSON against the editor's local form JSON; map `microdiff` output to a human-readable "X fields changed, Y rules changed" summary.
- FR-004 data layer: diff version A JSON against version B JSON; the resulting patch array feeds the visual diff UI.

**Phase-2 visual diff renderer (FR-004 UI): DEFER to architect.** No 1,000-star React diff renderer is both React-18-compatible and actively maintained. Options for the architect:
1. BUILD a thin React component (~100-150 lines) that renders `microdiff` output as a two-column before/after table — straightforward and stays within the existing Fluent UI v9 design system.
2. Accept `jsondiffpatch`'s HTML formatter (5.3k stars, MIT) behind `dangerouslySetInnerHTML` — quick but not React-native and maintenance pace is a concern.
3. Accept `react-diff-viewer-continued` (226 stars, MIT, active) with explicit acknowledgment that it is below the star threshold.
Option 1 is the cleanest architectural choice; the architect should confirm.

---

### 7. ENT-005 — Field-Level Audit Before/After Capture

**Requirement summary:** Per-save, one audit record per modified field containing `{ fieldSchemaName, before, after }`. Append-only Dataverse entity. Zustand + immer already in the stack.

**Queries run:**
1. `site:github.com immer patches change tracking zustand audit log stars:>1000`

---

**Repo: immerjs/immer (INCUMBENT)**
- URL: https://github.com/immerjs/immer
- Stars: 29,000
- Last release: July 3, 2026 (v11.1.11)
- License: MIT
- Fit: Already used in the designer via Zustand's immer middleware. Key capability: `produceWithPatches(baseState, recipe)` returns `[nextState, patches, inversePatches]`. Patches are path-array objects: `{ op: 'replace'|'add'|'remove', path: string[], value: any }`. Inverse patches represent the prior state.
- Patches are enabled via `enablePatches()` at app initialization (one-time setup, no new dependency).

**Why immer patches over a dedicated change-tracking library:**
- immer is already the state mutation layer; using `produceWithPatches` intercepts changes at the exact boundary where mutations occur — no additional instrumentation.
- The `path` array maps directly to field schema names when the Zustand store is structured by schema name (e.g., `['fields', 'loan_amount', 'validationRules', 0]`).
- `inversePatches` give "before" values without needing to snapshot the entire form state before each operation.
- The alternative — a dedicated audit library — would require hooking into state transitions from the outside, duplicating what immer already tracks internally.

No dedicated change-tracking library reviewed meets the 1,000-star threshold for this specific use case beyond immer itself.

**VERDICT: EXTEND incumbent (immer `produceWithPatches`)**

**Implementation approach:**
1. Enable patches at app startup: `import { enablePatches } from 'immer'; enablePatches();`
2. Wrap all Zustand store mutations that modify field-level state in `produceWithPatches` at the save boundary (not on every keystroke — only on explicit save).
3. Map the resulting `patches` array to `{ fieldSchemaName: string, before: unknown, after: unknown }[]` using the path segments.
4. Write each entry as one append-only record to the Dataverse `qdb_dfe_audit` entity via the backend save API.
5. The inverse patches serve as the undo stack source (ENT-005 and FR-005 undo/redo extension are the same mechanism).

---

## Disqualified Candidates

| Library | Reason |
|---|---|
| `dequelabs/react-axe` | DEPRECATED by Deque. Superseded by `@axe-core/react`. |
| `praneshr/react-diff-viewer` | React 18 issue unresolved (issue #166, open since Aug 2022). |
| `RXNT/json-rules-engine-simplified` | Introduces second rule system; evaluated but rejected per EXTEND decision. |
| `mattphillips/deep-object-diff` | Does not return old values; insufficient for before/after audit records. |
| `react-window` (bvaughn) | Minimal recent commits; TanStack/virtual is the active successor. |
| `giantswarm/schemalint` | Lints JSON Schema documents, not form-definition business logic. |

---

## License Summary

| Library | License | Permissive? | Notes |
|---|---|---|---|
| axe-core | MPL-2.0 | Weak copyleft | Acceptable as dev/test dependency; never bundled. Architect must confirm. |
| @axe-core/playwright | MPL-2.0 | Same as above | Same caveat |
| vitest-axe | MIT | Yes | |
| dnd-kit (incumbent) | MIT | Yes | |
| @tanstack/react-virtual | MIT | Yes | |
| microdiff | MIT | Yes | |
| jsondiffpatch | MIT | Yes | Considered for Phase-2 visual diff |
| immer (incumbent) | MIT | Yes | |

No GPL libraries evaluated. No GPL libraries adopted.

---

## Open Architecture Questions

The following decisions require architect sign-off before Phase 1 build authorization:

1. **dnd-kit KeyboardSensor issue #985:** The keyboard sensor is reported broken for variable-height items. Phase 1 must either deliver a custom sensor or accept reduced keyboard reliability for variable-height fields. Architect decides.

2. **Phase-2 visual diff renderer (FR-004):** No qualifying React diff component (1,000+ stars, React 18 compatible, active). Three options presented above under finding #6. Architect must select one before FR-004 implementation begins in Phase 2.

3. **axe-core MPL-2.0 license approval:** Maqsad AI policy prefers MIT/Apache/BSD. MPL-2.0 is the industry-standard accessibility engine license. Architect must obtain confirmation that MPL-2.0 is accepted for dev/test-only dependencies before `axe-core` is added to the project.
