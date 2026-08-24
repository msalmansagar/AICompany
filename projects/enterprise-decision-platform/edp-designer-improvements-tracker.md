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
| 0 | Worktree + tracker + baseline (`npm install`, tests, build green) | setup | in progress | — | — |
| 1 | **Defect:** saving an existing rule creates a duplicate rule record. Fix: Draft latest → update in place; Approved/Published latest → create version N+1 under the same rule | bug-fix | pending | — | — |
| 2 | One shared Web API base module; derive endpoint version from Xrm (on-prem ≠ v9.2); de-duplicate the three copies in `client.ts` / `metadataService.ts` / `testClient.ts` | enhancement | pending | — | — |
| 3 | **Canvas ↔ Dataverse bridge:** generate a JSON Schema from entity metadata, inject into the GoRules Input node (autocomplete + types on the JDM decision table); `deriveInputs` emits typed bindings and `via` for one-hop lookup paths | enhancement | pending | — | — |
| 4 | Surface `translate()` warnings in the Validation drawer; unparseable switch/ZEN condition = hard error, never a silent always-true rule | enhancement | pending | — | — |
| 5 | Lookup fields first-class in the table editor: `IsEmpty` / `IsNotEmpty`, and Equals with a record picker (resolves primary-name → GUID) | enhancement | pending | — | — |
| 6 | Multi-select option sets: expose `MultiSelectPicklist` attributes, designer ops + runtime left-side collection semantics if needed (C# + tests) | enhancement | pending | — | — |
| 7 | Test-with-a-real-record: record picker on the target entity fills the test inputs (anchor fields, `via` via `$expand`, aggregates computed from child fetch) | enhancement | pending | — | — |
| 8 | Aggregate filter upgrades: typed value editor + option-set dropdown + empty/has-value operators | enhancement | pending | — | — |
| 9 | Table ergonomics: row reorder (priority is row order), column reorder, CSV export of rows | enhancement | pending | — | — |
| 10 | Delete robustness: `deleteRule` also removes the orphaned `qdb_edp_ruletest` record; ordered deletes with clear failure surfacing | enhancement | pending | — | — |
| 11 | Docs: related-entity depth limit documented; change notes for this batch; follow-ups list (cascade delete config, paste-from-Excel) | docs | pending | — | — |
| 12 | Wrap-up: full test + build, code review pass, push branch, open PR | release prep | pending | — | — |

## Log

- **2026-08-24 — Step 0 started.** Worktree `edp-designer-imp` created off `origin/main` @ `77911168`; branch renamed to `feat/edp-designer-improvements`. Runtime operator inventory confirmed (21 ops). F2b overlap assessed: `operatorsFor` lists only.
