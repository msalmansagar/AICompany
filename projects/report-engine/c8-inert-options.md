# C-8 — The inert transform and source types

**Condition:** Phase 7. "The five inert transform types and eight inert source types are labelled in
the UI as stored-not-applied. That is honest for UAT. Before production, each is either implemented
or removed from the option set — shipping a permanently disabled option is a support burden and an
audit finding waiting to happen." *Owner: CEO, with BA.*

**Surveyed 2026-08-12 against org5869857f.** The decision is not mine to take; this records what it
costs, so it can be taken quickly.

---

## The count in C-8 is wrong for transforms

| | C-8 says | Actually |
|---|---|---|
| Inert transform types | 5 | **10** of 18 |
| Inert source types | 8 | **8** of 11 ✓ |

The sources match. The transform count has grown since C-8 was written, or was miscounted then.
Anyone budgeting "implement them all" from C-8's number would be planning half the work.

**Inert transforms:** Split value · Lookup name resolution · Option set label · Formula ·
Conditional value · Aggregation · Grouping · Pivot · JSON flatten · External data map

**Inert sources:** QueryExpression · Dataverse Web API · Custom API / Plugin · SQL ·
External REST API · Middleware API · Core Banking API · MIS API

The UI is already honest about all of them: `TRANSFORMS` and `SOURCES` carry a `live` flag and every
inert entry is suffixed **"— stored, not applied yet"** in the pickers. What C-8 objects to is not
dishonesty, it is shipping the option at all.

---

## Removal is nearly free, because almost nothing uses them

| Table | Stored rows | Rows using an inert option |
|---|---|---|
| `qdb_reporttransformation` | 8 | **0** |
| `qdb_reportdatasource` | 11 | **1** |

**All ten inert transform types are unused.** They can be removed from the option set without
touching a single stored row.

**One data source uses an inert type, and it is worth looking at:**

> **Sample — Overdue Facilities** has a second, non-primary source named **`GET /balances`**, typed
> **External REST API** (100000006), with an `externalMapping` payload configured.

That is C-8's concern in the concrete: a source was configured, saved, and does nothing. The report
renders without the balances it was set up to fetch, and says nothing about it. The report is a Draft
sample rather than anything published, so the exposure is a misleading sample, not a live defect.

**Also found: six of the eleven data sources have `qdb_sourcetype = null`** — no type at all, rather
than an inert one. They work, because the engine falls back, but a null in a required-by-design
choice column is its own audit finding and is not covered by C-8 as written.

---

## The three groups, because "implement or remove" is not one decision

**1. Redundant by design — remove, nothing is lost.** The capability exists elsewhere, and the
transform entry is a second door to it that was never opened. The designer's own descriptions admit
it: *Formula* says "see the Formulas tab", *Aggregation* says "use a column aggregate instead".
→ Formula · Aggregation · Grouping (the layout engine groups) · Pivot (Pivot Report layout)

**2. Genuinely unbuilt, and small.** Each is a pure function over the result set, of the same shape
as the eight that already work.
→ Split value · Lookup name resolution · Option set label · Conditional value · JSON flatten

**3. Not transforms at all — they are the outbound-execution story.** Every inert *source* plus
External data map depends on calling something outside Dataverse from a sandboxed plugin. That is
gated by ADR-RPT-011 and by the CEO's V2/V3 scope, not by this condition. Removing them from the
picker would be removing the roadmap from the UI.
→ all 8 inert sources · External data map

---

## What removal actually costs

Dataverse option-set values can be deleted, but the value is written into stored rows as an integer,
so deleting one that is referenced leaves a row pointing at a code with no label. Group 1 and group 2
are referenced by nothing and are therefore safe to delete outright.

The single External REST API reference must be dealt with first if the sources are ever removed —
either delete that sample source or retype it — but group 3 is the group most likely to be kept.

**Cheapest honest outcome, if the decision is to defer:** delete groups 1 and 2 from the option set
(nine values, zero references, no data migration), and leave group 3 with its "stored, not applied
yet" labelling as a visible roadmap. That removes every option that is inert *and* has no future,
which is the audit finding C-8 is actually worried about, and leaves only the ones whose absence is
a scope decision rather than a gap.
