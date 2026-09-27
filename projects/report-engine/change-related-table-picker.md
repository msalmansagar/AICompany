# Change note — related-table picker on "Add dataset"

**Type:** enhancement (refinement within the ADD-002 multi-dataset contract — no new promise).
**Requested:** 2026-09-08 — "in dataset I should be able to add main table, and its related
tables (not show all) — developer will search and then add related/child tables. Start small."

## What changed

"Add dataset" in the Report Data tree no longer drops the author into an empty dialog with an
all-entities picker. With a main table chosen, it opens a searchable list of that table's
**related tables** (Dataverse one-to-many relationship metadata, filtered to reportable entities),
each row showing the display name, the logical name, and **which lookup scopes it** ("via
parentcustomerid"). Picking one creates the block already wired: named after the table,
Standalone, entity set, child key = the relationship's referencing attribute, parent key = the
main table's primary id. The properties dialog then opens as before, with only Fields left to do.

The manual path survives as "Another table…" — a block on an unrelated table is legitimate, just
rarer. A report with no main table yet skips the picker entirely.

A table that relates to the main one several ways (contact carries several lookups to account) is
listed once per relationship, so the author picks the *lookup*, not just the table — the ambiguity
`suggestJoinKeys` could never resolve on its own.

## Deliberately NOT in this round (start small)

- The wizard's Add dataset and the tabbed grid's "Add data source" keep the old behaviour.
- No many-to-many, no grandchild (related-of-related) traversal.
- No relationship-aware default columns.

## Verification

- 726 browser tests green (8 new in test-designer-datasets.mjs: system relationships filtered
  out, sort order, both join keys carried, dataset born a block, base defaults kept, no mutation).
- Driven live in the local designer against org5869857f: picker opened on the multi-dataset demo
  (main = account), search "contact" filtered with highlight, "Contact via parentcustomerid"
  created a dataset whose Query tab showed Block table/Parent key/Child key prefilled; removed
  without saving.
