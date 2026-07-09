# Design Note — 1:N Child Aggregation (AGG-001)

**Status:** APPROVED 2026-07-09 (best-judgment, user-delegated) · **Scope:** single-hop 1:N aggregation · Functions = Count/Sum/Avg/Min/Max (Any/All via count) · single-condition filter applied IN-MEMORY

## Problem
A rule anchored on a parent record often needs to reason over its **child collection** —
total collateral value vs the loan amount, count of open opportunities, whether any line
item is rejected. Today inputs are scalar fields on the anchor (or an N:1 parent); there
is no way to fold a child collection into a single value a condition can test.

## Decision — the contract
Add an **optional** `aggregate` source to `PcrmInput`. The input resolves to a single
**scalar** (a number), so it flows into the decision table exactly like any other numeric
input — conditions use the normal numeric operators.

```jsonc
{
  "name": "collateral_total",
  "type": "Decimal",                 // Count -> WholeNumber; Sum/Avg/Min/Max -> the field's numeric type
  "binding": "qdb_value",            // child field to aggregate; omitted/ignored for Count
  "aggregate": {
    "function": "Sum",               // Count | Sum | Avg | Min | Max
    "childEntity": "qdb_collateral", // the 1:N child entity
    "childLookup": "qdb_loanapplicationid", // the lookup ON THE CHILD pointing back to the anchor
    "filter": { "field": "qdb_status", "operator": "Equals", "value": "Active" } // optional, single condition
  }
}
```

**Rules of the contract**
- `aggregate` **absent** → today's behavior (anchor field or N:1 `via`), untouched.
- Resolution (record-context bind time): query `childEntity` where `childLookup == anchor.id`
  (+ the optional `filter`), then fold with `function` over `binding`.
- **Empty result:** `Count → 0`, `Sum → 0`, `Avg/Min/Max → null` (deterministic).
- **Function set (v1):** `Count, Sum, Avg, Min, Max`. `Count` needs no `binding`.
- **Any/All without new operators:** expressed as count comparisons —
  *any rejected* = `Count(filter: status=Rejected) > 0`; *all verified* = `Count(filter: verified=false) == 0`.
- **Filter (v1):** a single condition `{ field, operator, value }` on a child field. Applied as
  query criteria where possible.
- Conditions, table cells reference the aggregate input **by name** — only bind-time
  resolution differs; the executor is unchanged.

## Impact by layer
| Layer | Change |
|---|---|
| `PcrmModels` | `PcrmAggregate { function, childEntity, childLookup, filter? }` on `PcrmInput` |
| Validator | child entity exists; `childLookup` exists on child; `binding`/filter field exist on child (new codes EDP008/009/012/013) |
| Binder | `RetrieveMultiple(childEntity)` by lookup + filter; in-memory fold to a scalar |
| Executor | **none** (aggregate resolved before evaluation) |
| Designer | 1:N relationship picker + function + child field + optional filter; shows "Sum of Collateral · Value" |

## Determinism & limits
- In-memory fold over a single retrieved page (cap noted); server-side FetchXML aggregation
  is a **perf follow-up**, not needed for correctness.
- Null child values are skipped by Sum/Avg/Min/Max; Count counts rows (matching the filter).
- Empty collection is deterministic (above).

## Explicitly out of scope (follow-ups)
- **Multi-hop / nested aggregation** (aggregate over a grandchild, or filter referencing a
  parent of the child). v1 is one hop.
- **Multi-condition child filters** (v1 is a single condition).
- **Server-side FetchXML aggregation** (perf; v1 folds in memory).
- **Aggregating N:N collections** (v1 is 1:N via a child lookup).

## Open decisions (need your call)
1. **Function set** — ship `Count/Sum/Avg/Min/Max` (Any/All via count comparisons), or also add
   explicit `Any`/`All` quantifier functions with a predicate?
2. **Filter in v1** — include the single-condition child filter now, or defer (aggregate all
   children) to keep v1 smaller?
