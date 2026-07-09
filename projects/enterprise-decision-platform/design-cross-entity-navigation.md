# Design Note — Cross-Entity Field Navigation (CEN-001)

**Status:** APPROVED 2026-07-09 (user sign-off) · **Scope:** N:1 (parent) navigation only · cross-table field-to-field DEFERRED to follow-up

## Problem
A rule is bound to a single `targetEntity`; decision-table inputs can only reference that
one table's fields. Real decisions need fields from related records too — a Loan Approval
that reads the customer **Account**'s credit score, or the **Product**'s max limit. Today
those bindings can't be authored and would fail validation.

## Decision — the contract everything keys off
Extend `PcrmInput` with an **optional** navigation source. A local (anchor) input is
unchanged; a related input adds `via`:

```jsonc
// Local input (unchanged — full back-compat)
{ "name": "loanAmount", "type": "Decimal", "binding": "qdb_loanamount" }

// Related input (new): field lives on the entity reached by following an N:1 lookup
{
  "name": "account_creditscore",   // stable input key used by conditions/table cells
  "type": "Decimal",
  "binding": "qdb_creditscore",     // the field ON THE RELATED entity
  "via": {
    "relationship": "qdb_accountid",// the lookup attribute ON THE ANCHOR entity
    "entity": "account"             // the related entity's logical name
  }
}
```

**Rules of the contract**
- `via` **absent** → resolve `binding` on the anchor entity (today's behavior, untouched).
- `via` **present** → resolve `binding` on `via.entity`, reached by following the anchor's
  `via.relationship` lookup.
- **Input-key convention:** `name = "<relationship-without-prefix>_<field>"` (kept stable so
  table cells/conditions reference it by name — resolution is the only thing that changes).
- Conditions, decision-table cells, and field-to-field operands reference inputs **by `name`**
  exactly as now. Navigation is resolved at **bind time** (record → inputs), so the executor
  and `TryResolve` are unchanged.

## Impact by layer (what Phase 1–2 build)
| Layer | Change |
|---|---|
| `PcrmModels` | add `PcrmVia { relationship, entity }` to `PcrmInput` |
| Metadata resolver | resolve anchor's N:1 lookups → target entity + its attributes |
| Validator | for `via` inputs, validate `binding` against `via.entity` metadata |
| In-CRM binder | follow the lookup, load the related record, read `binding` into the inputs dict; null lookup → null input |
| Executor | **none** (nav resolved before evaluation) |
| Designer | relationship-aware field picker; `via` on the table column; emit/round-trip |

## Back-compat & determinism
- Existing rules have no `via` → byte-identical behavior.
- Null/missing related record → the input resolves to null (operators handle null as today);
  no exception, deterministic.

## Explicitly out of scope (separate follow-ups)
- **1:N / N:N (child collections)** — needs aggregation semantics (sum/count/any/all). Not here.
- **Multi-hop paths** (A→B→C) — v1 is single-hop N:1 only.
- **Free-form / entity-less inputs** (caller-assembled payloads) — already works at the runtime
  input layer; a designer mode for it is a separate small track.

## Open decision (needs your call)
**Cross-table field-to-field** — should the value→field toggle also allow picking a *related*
field as the comparison operand in this pass, or defer it to a follow-up?
