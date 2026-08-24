# EDP Designer Improvements — Tracker

**Engagement:** EDP-DSN-002 (enhancement batch + one defect, fast-path per CLAUDE.md — no contract change)
**Branch:** `feat/edp-designer-improvements` (worktree, based on `origin/main` @ `77911168`)
**Source analysis:** designer review of 2026-08-24 (tableModel, DecisionTableEditor, App, metadataService, toPcrm, dataverse/client, runtime OperatorEvaluator).
**Rule:** this file is updated after every step — status, commit hash, and what was actually verified.

## Constraints established up front

- The C# runtime already supports all 21 operators including `IsEmpty` / `IsNotEmpty` / `IsNull` / `IsNotNull` (`OperatorEvaluator.cs`) — designer additions below use those exact names, matching the open PR `feat/edp-fact-f2b-adapter` so the eventual merge conflict in `operatorsFor` is trivial.
- Open EDP PRs (#105/#107 area) touch `tableModel.ts` operator lists and the ConditionBuilder only — everything else here is conflict-free.
- PCRM + runtime already understand `via` (N:1) and `aggregate` (1:N) inputs; no runtime schema change is needed for the canvas bridge.
- No live-org schema changes in this batch (cascade-delete config is recorded as a follow-up needing explicit go-ahead).

## Steps

| # | Step | Type | Status | Commit | Verified by |
|---|------|------|--------|--------|-------------|
| 0 | Worktree + tracker + baseline (`npm install`, tests, build green) | setup | ✅ done | — | 51 tests pass, `npm run build` green |
| 1 | **Defect:** saving an existing rule creates a duplicate rule record. Fix: Draft latest → update in place; Approved/Published latest → create version N+1 under the same rule | bug-fix | ✅ done | `96a52236` | 4 new fetch-mocked unit tests (new rule / draft-in-place / published→N+1 / rename); tsc clean |
| 2 | One shared Web API base module; derive endpoint version from Xrm (on-prem ≠ v9.2); de-duplicate — turned out to be SIX copies (`client`, `metadataService`, `testClient`, `governanceClient`, `logService`, `scenarioService`) | enhancement | ✅ done | `ba95be27` | 3 unit tests on version mapping; 58 tests green; tsc clean |
| 3 | **Canvas ↔ Dataverse bridge:** generate a JSON Schema from entity metadata, inject into the GoRules Input node (autocomplete + types on the JDM decision table); `deriveInputs` emits typed bindings and `via` for one-hop lookup paths | enhancement | ✅ done | `fb828166` | 8 new unit tests (schema typing, nesting, non-clobber, typed/filtered/via inputs); 66 tests green; tsc clean. Reference-filter scans expression strings only — JSON keys must not match |
| 4 | Surface `translate()` warnings in the Validation drawer; unparseable switch/ZEN condition = hard error, never a silent always-true rule | enhancement | ✅ done | `97c8aaa8` | Unparseable → undeclared-symbol condition (validator EDP004 confirmed at `RuleValidator.cs:129`); warnings live in Validation tab. 68 tests green. ⚠ Lesson: my Write clobbered an existing `toPcrm.test.ts` (7 tests) — restored from HEAD and merged |
| 5 | Lookup fields first-class in the table editor: `IsEmpty` / `IsNotEmpty`, and Equals with a record picker (resolves primary-name → GUID) | enhancement | ✅ done | `1a823935` | 4 unit tests (category, operators, GUID-only serialization, IsEmpty); 72 green; tsc clean. GUID compare is ordinal — picker stores API-cased (lowercase) ids |
| 6 | Multi-select option sets: expose `MultiSelectPicklist` attributes, designer ops + runtime left-side collection semantics if needed (C# + tests) | enhancement | ✅ done | `f5551229` | Runtime: collection-left Contains/In = membership/overlap, empty collection IsEmpty (3 new xUnit tests, 127 pass). Designer: 2 new tests, 74 green. Found: Contains on a collection was substring-matching the collection's TYPE NAME |
| 7 | Test-with-a-real-record: record picker on the target entity fills the test inputs (anchor fields, via through the parent row, aggregates computed from child fetch) | enhancement | ✅ done | `8b984a94` | 8 unit tests on the pure resolvers (columnValue/computeAggregate/passesFilter); 80 green. Note: implemented via parent-row fetch, not `$expand` (nav-property names are unreliable) |
| 8 | Aggregate filter upgrades: typed value editor + option-set dropdown; ordering operators only where the runtime orders (numeric) | enhancement | ✅ done | `0cfed0de` | Verified against `RuleDecisionService.MatchesFilter` — Equals/NotEquals textual + numeric orderings only; OptionSetValue → int confirmed. 80 tests green |
| 9 | Table ergonomics: row reorder (priority is row order), column reorder, CSV export of rows | enhancement | ✅ done | `1bc2f747` | Pure model helpers + 4 unit tests (reorder keeps cells aligned, CSV readable + escaped); 84 green |
| 10 | Delete robustness: `deleteRule` also removes the orphaned `qdb_edp_ruletest` record; ordered deletes with clear failure surfacing | enhancement | ✅ done | `07435930` | 2 unit tests (delete order incl. test suite; child failure leaves rule intact); 86 green |
| 11 | Docs: related-entity depth limit documented; change note for this batch; follow-ups list (cascade delete config, paste-from-Excel) | docs | ✅ done | — | `change-note-edp-dsn-002.md` |
| 12 | Wrap-up: full test + build, code review pass, push branch, open PR | release prep | in progress | — | — |

## Log

- **2026-08-24 — Step 0 started.** Worktree `edp-designer-imp` created off `origin/main` @ `77911168`; branch renamed to `feat/edp-designer-improvements`. Runtime operator inventory confirmed (21 ops). F2b overlap assessed: `operatorsFor` lists only.
