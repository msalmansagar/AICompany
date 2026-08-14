# Migrating SSRS reports into the Report Engine

**Written 2026-08-15.** Analysis, a recommendation, and a working triage tool.

> ⚠️ Calibration warning. None of this has been run against real customer RDLs. The percentages
> people usually want here cannot be honestly given until the tool is pointed at the actual
> inventory. Everything below is derived from the two schemas and from measurements taken on this
> engine; the first action is to get the RDLs off the report server.

---

## The architecture this is actually migrating from

**SSRS runs on its own report server. CRM opens reports by URL from JavaScript.** That is a
different starting point from CRM-integrated SSRS, and it changes three things.

**The RDLs are not in Dataverse.** Querying the `report` entity returns nothing, because the
definitions live in the report server catalog. Get them from there (`rs.exe`, the ReportService2010
SOAP endpoint, or the ReportServer database) — not from CRM.

**Every dataset is almost certainly SQL.** A standalone report server has no `MSCRMFETCH` data
provider, so these reports read the CRM database directly — filtered views if someone was careful,
base tables if not. FetchXML conversion is therefore not an edge case to handle, it is the **whole
job**. That is why `gradeSqlRewrite` exists: marking every dataset BLOCKER would be true and
useless, so each is graded EASY / MODERATE / HARD / NOT POSSIBLE instead, and that grading is the
estimate.

**🔴 Security changes meaning, and this is the risk to check first.** In CRM-integrated SSRS the
report runs as the caller and filtered views apply row-level security. A standalone report server
usually connects under a **service account**. Two consequences, in opposite directions:

- If the reports read **base tables**, they return every row to whoever opens the link, regardless
  of that user's CRM privileges. The tool flags this per dataset. Worth knowing before migration,
  because it means today's reports may be leaking.
- Whatever they read, the migrated report **will** be security-trimmed: the engine executes as the
  calling user, and `ReportAccessGuard` enforces its own access list on top. So a migrated report
  can legitimately return **fewer rows than the SSRS one**. That will be reported as a bug. Agree in
  advance that it is a fix, and reconcile against a user whose privileges you know.

**What gets easier.** The launch half maps well. The JS-opens-a-URL pattern has a direct equivalent
in `qdb_reportribbonplacement` and the ribbon flyout, and the runtime viewer already accepts a report
id plus context — record id, selected rows, user, business unit. Passing the current record to a
report stops being hand-written URL construction and becomes configuration.

**What it is worth.** Retiring the report server removes a server, an authentication boundary, a
network path from CRM to it, and its patching and licensing. That is usually the actual business
case, and it is worth naming explicitly rather than selling the migration on report features.

**Two answers that change the plan:**
1. **Is Dynamics on-premise or cloud?** If a move to Dataverse cloud is coming, direct SQL dies with
   it and this migration becomes forced rather than optional — which changes its priority entirely.
2. **Does the report server impersonate the caller, or use a service account?** This decides whether
   "fewer rows after migration" is a regression or the correction of a leak.

---

## The thing to be clear about first

SSRS and this engine are not two implementations of the same idea.

**SSRS is a paginated document renderer.** An RDL positions items in inches on a page, knows about
page headers, page breaks and `Globals!PageNumber`, and is happiest producing something that will be
printed or filed.

**This engine is a metadata-driven query-and-grid.** It reads one query, shapes rows, and renders
them into one of a catalogue of layouts in a browser. It has no page model at all.

So "migrate the SSRS reports" is the wrong goal to hold. The right goal is: **decide which reports
belong here, move those, and leave the rest alone.** A statutory statement that must paginate
identically every quarter is not a candidate however much effort is spent on it. An operational list
of accounts with a filter and a total is an excellent candidate and will be better here — filterable,
exportable, embedded on the form.

---

## Triage, and the tool that does it

`rdl-migrate.mjs` reads RDL files and sorts them:

```
node migration/rdl-migrate.mjs <file.rdl|directory>            # the report
node migration/rdl-migrate.mjs <dir> --emit out                # + a report definition per file
node migration/rdl-migrate.mjs <dir> --json                    # machine-readable
```

| Verdict | Meaning |
|---|---|
| **AUTOMATIC** | Converts unattended. |
| **ASSISTED** | Converts, then needs the listed work — usually a layout detail or one expression. |
| **REWRITE** | Cannot be converted as it stands; estimate as new build. |

It refuses to guess. Every construct without a faithful equivalent is named, with why and what to do
instead, against the report that contains it. That bias is deliberate: converting the easy part of a
report is simple, and a converter that silently drops a page footer or a custom function produces
something that **looks** migrated, which costs far more than a refusal.

Run against the two samples here it returns 1 ASSISTED and 1 REWRITE, with reasons.

---

## What maps

| RDL | Engine | Notes |
|---|---|---|
| FetchXML dataset | `qdb_reportdatasource` type FetchXML | Carried across verbatim. |
| `Fields` + Tablix detail row | `qdb_reportcolumn` | Header text becomes the label, `=Fields!x.Value` the attribute. |
| `ReportParameter` | `qdb_reportparameter` | Name, prompt, type, required. |
| Tablix group | Grouped Report layout | One level. |
| `Sum()` in a footer row | grand total | |
| `Format="C2"` / `N2` / date formats | column type + a transformation | Currency, Number, Date. |
| FetchXML `filter` | stays in the query | Not lifted into `qdb_reportfilter`, which is fine — it still filters. |
| Sort expressions | FetchXML `order` | |

That covers the shape of a typical operational report end to end.

## What does not

Ordered by how many reports each will actually hit.

**1. SQL / filtered-view queries — the big one.** On-premise SSRS reports are usually written against
`FilteredAccount` and friends. This engine speaks FetchXML or a saved view, and on Dataverse cloud a
SQL query cannot run at all. Every such report needs its query rewritten. In most estates this single
item decides the size of the project.

**2. The 5,000-row ceiling.** Measured, not assumed — see `c6-scale-characterisation.md`. The engine
issues one FetchXML query capped at `top="5000"` and does not page, so a report written to return
20,000 rows will come back short. SSRS has no such limit and extract-style reports routinely exceed
it. **If any report in scope returns more than 5,000 rows, paging (condition C-5) is a prerequisite,
not a nice-to-have.**

**3. Custom code.** `<Code>` blocks and `<CodeModules>` assemblies. The engine evaluates a sandboxed
expression language and deliberately cannot execute arbitrary code. The logic has to move into the
query, a computed column, or the plugin.

**4. Cross-dataset `Lookup()`.** A report definition executes one primary query. Combine with
`link-entity` or split the report.

**5. Pagination semantics.** Page headers and footers, page breaks, `PageNumber`/`TotalPages`.
Nothing to map to. Fine to drop for a screen report; decisive if the PDF must paginate identically.

**6. Subreports, charts, images, gauges, maps.** Each has either a different model here or none.

---

## Recommended approach

**Do not attempt a big-bang migration.** Four steps:

**1. Inventory before estimating.** Export the RDLs and run the tool over the lot. The output is the
estimate — AUTOMATIC and ASSISTED counts are the work, REWRITE count is new build. Anyone quoting a
date before this has run is guessing.

```
node migration/rdl-migrate.mjs ./rdls --json > inventory.json
```

**2. Sort by intent, not by feasibility.** Three piles:
- *Operational lists* — "accounts by status with a total". **Migrate.** They gain filters, export,
  form embedding, and in-CRM security.
- *Paginated documents* — statements, certificates, anything printed or filed with a regulator.
  **Leave in SSRS.** This engine has no page model and pretending otherwise ends badly.
- *Analytical* — trends, comparisons, KPI packs. **Rewrite as dashboards**, which is a different
  capability rather than a conversion.

**3. Convert the first five by hand, with the tool as scaffolding.** Emit the definitions, load them,
and compare row counts and totals against SSRS for the same parameters. The five will teach you what
the tool gets wrong on your estate; fix the tool, then batch the rest.

**4. Verify by reconciliation, not by inspection.** For each migrated report, run both and compare
row count and every numeric total. A report that renders is not a report that agrees. This project's
own history is emphatic on the point: nineteen defects once passed 221 green tests, and the layout
renderer was silently falling back to a grid for months.

---

## What to build first, if the answer is "we are doing this"

1. **Paging (C-5)** — only if the inventory contains reports over 5,000 rows. Check first; it may not.
2. **Verify FetchXML parameter binding.** SSRS writes `@NamePrefix` placeholders into the FetchXML.
   The engine has report parameters and binds launch context, but that the two use the same
   substitution syntax has **not been verified** — confirm it with one report before relying on it.
3. **A reconciliation harness** — run report X in both, diff row count and totals. Cheap, and it is
   what turns "migrated" into something defensible.

---

## Status of this tool

A triage and scaffolding aid, not a press-button migration, and it should not be sold as one. It
reads RDL with a small purpose-built tag scanner rather than a full XML parser — adequate for the
constructs listed above and honest about the rest. Productising it beyond triage is a new capability
and needs a BRD.
