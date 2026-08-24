# Change Note — EDP-DSN-002 (Designer improvements batch)

**Date:** 2026-08-24 · **Branch:** `feat/edp-designer-improvements` · **Type:** enhancement batch + 4 defects (fast-path; no contract change)
**Tracker:** `edp-designer-improvements-tracker.md` (per-step commits and verification)

## What changed

| Area | Change |
|---|---|
| Save | Saving an existing rule no longer duplicates the rule record: a Draft latest version is updated in place; past Draft, version N+1 is cut under the same rule. Renames propagate. |
| On-prem | All six Web API clients share one base module that derives the endpoint version from the org (`9.0` org → `/api/data/v9.0`); `v9.2` was hardcoded everywhere and 404s on-premises. |
| **GoRules canvas** | The target entity's fields (typed, one N:1 hop nested) are pinned as a JSON Schema on the Input node → real-field autocomplete in the JDM decision table and expressions. The PCRM translator emits typed bound inputs — dotted `lookup.field` references become `via` inputs — only for fields the graph references. |
| Canvas safety | Translation warnings show live in the Validation tab. An unparseable switch condition binds an undeclared symbol (validator error EDP004) instead of becoming an empty AND group that fired on every record. |
| Lookups | Lookup/Customer/Owner columns: `is` (record picker by primary name, stores the GUID), `is not`, `is empty`, `has a value`. |
| Multi-select | MultiSelectPicklist attributes are now visible with membership operators; the runtime treats a collection left operand as membership (Contains was substring-matching the collection's type name). |
| Testing | The test panel fills all inputs from a real record: anchor fields from the row, via fields from the parent row, aggregates computed over children (filter honoured, 5000-row cap). |
| Aggregates | Filter values are typed (option labels, Yes/No, numbers, dates); ordering operators only on numeric fields, matching runtime semantics. |
| Ergonomics | Row reorder (row order = priority), column reorder, CSV export. |
| Delete | Rule delete removes versions **and** the test-suite record, children first, with a retryable error — no more orphaned `qdb_edp_ruletest` rows or half-deleted rules. |

## Documented limits

- **Related depth is one hop** (anchor → parent). No grandparent traversal, in either authoring surface.
- **GUID equality is ordinal** — values must be lowercase as the Web API returns them; the record picker guarantees this, hand-typed GUIDs must match case.
- Fill-from-record leaves a multi-select's raw comma string as-is (the runtime receives a string, not a collection, on that path).
- The `In` value editor for option sets still picks a single value (pre-existing).
- Canvas switch conditions support the `field op value` form only; anything else is a validation error by design.

## Post-deploy addendum — 2026-08-24, found by verifying in the org

The step-1 save fix was **logically right but inert in the org**, and live verification caught it
minutes after deployment. Root cause: `req()` POSTs without `Prefer: return=representation`, and
Dataverse answers a plain POST with **204 No Content and an empty body** — the new id is only in the
`OData-EntityId` header. So `rule.qdb_edp_ruleid` was always `undefined`:

- the editor never learned its own `ruleId`, so a second save still created a **second rule record**;
- `'qdb_edp_ruleid@odata.bind': '/qdb_edp_rules(undefined)'` failed, and the old catch-fallback
  dropped the bind and created an **orphan version** — invisible to every list, which all filter on
  the parent lookup. Two orphans were found and removed during verification.

This is pre-existing (it predates EDP-DSN-002; it explains rules that show no entity and never leave v1),
but the batch did not fix it as intended. Fixed by a `createRecord()` helper that sends
`Prefer: return=representation`, falls back to the `OData-EntityId` header, and **throws** when neither
yields an id. Bind failures now surface instead of silently orphaning.

**Why the unit tests missed it:** the fetch mock returned a created-entity body on every POST — a
response real Dataverse never sends. The mock now mirrors the real contract (204 + empty body unless
`Prefer` is set), and there are regression tests for the bind carrying a real id, header-only id
recovery, and the no-id-at-all failure.

## Follow-ups (not in this batch)

1. Cascade-delete configuration on the rule→version/test relationships (schema change — **needs explicit go-ahead for the live org**).
2. Paste-from-Excel / CSV import of decision-table rows.
3. Multi-value editor for `In` on option sets, and multi-select record picker for lookup `In`.
4. Merge coordination: `feat/edp-fact-f2b-adapter` also edits `operatorsFor` — adopt its operator labels on conflict (`is null` vs `is empty` distinction).
