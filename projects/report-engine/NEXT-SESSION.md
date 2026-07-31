# Report Engine — next session starts here

Written 2026-07-31 at the end of a long session. Branch `feat/report-engine-prototype`,
~104 commits ahead of `main`. Org `org5869857f`.

Read this before touching anything. Everything below is verified state, not assumption.

---

## Start with these three, in order

### 1. Fix the dashboard loader — small, and it blocks everything dashboard
The composer is built and works (commit `318bcb09`). Opening the saved dashboard
**"Accounts Overview"** shows its title and **0 sections**, while the org holds **3 sections and 5
widgets**. So the children are not being associated with their parent.

Look at `loadDashboardDefinition` / `definitionToDashboard` in `prototype/report-designer.html`, and
the child-fetch filters in `src/Qdb.ReportEngine.Execution/Dataverse/DashboardDefinitionFetch.cs`.
Same shape as the report-side defect where columns were filed against the wrong mapping.

**Gotcha already hit:** `qdb_dashboard` has **no `qdb_name`** column — it uses `qdb_dashboardcode`.
A `$select` naming `qdb_name` returns 400, not 404, which reads like "table missing" and is not.

### 2. Deploy into CRM — the user asked for **both** surfaces
Confirmed gap: the wizard's "Use in CRM" step saves placements to `qdb_reportribbonplacement` and
**nothing creates a CRM artifact**. No script touches `RibbonDiffXml`, the sitemap, `systemform` or
the `report` entity. Another stored-not-applied surface.

The user has decided on **both** of:

| Target | Mechanism | Notes |
|---|---|---|
| **Sitemap area** | subarea → `qdb_reportengine_runtime.html` | declarative, do first |
| **Native CRM dashboard** | `systemform` type dashboard hosting the runtime web resource with `dashboardId` | makes a Report Engine dashboard appear in CRM's own dashboard list |
| **Ribbon buttons** | `RibbonDiffXml` in the solution, opening the viewer with `reportId` + record context | hardest; this is where the wizard's passed-context work finally pays off |

Do sitemap + native dashboard first — both declarative and provable in one sitting. Ribbon after.

#### Ribbon design — AGREED with the user 2026-07-31, build to this

**One dynamically-populated flyout per entity. Not one button per report, and not the OOB Run
Report button.** RibbonDiffXml edits in the QDB solution are confirmed acceptable.

```
[ Reports ▾ ]   ← one FlyoutAnchor, added once per entity per ribbon location
    ├── Account portfolio
    ├── Overdue facilities
    └── Customer 360
         ↑ populated at click time from qdb_reportribbonplacement,
           filtered to this entity and this user's roles
```

Mechanism: `FlyoutAnchor` with `PopulateDynamically="true"` and a `PopulateQueryCommand`. The
command's JavaScript runs on click and returns the menu by setting
`commandProperties["PopulationXML"]`. Each item's command opens
`qdb_reportengine_runtime.html` with `reportId` plus context — record ID from `formContext`,
selected rows from `SelectedControlSelectedItemIds`, user and BU from the global context.

**The property that matters: adding a report to an entity is a data row, not a solution change.**
The ribbon is touched once per entity; after that no publish is needed. Anything that requires a
solution edit per report contradicts the metadata-driven thesis of the product.

**Why not the OOB Run Report button** — two reasons, the second decisive:
1. It is built for SSRS's `CRM_FilteredEntity`; a *Link to Web Page* report does not receive the
   record or the selected rows, so step 10's four context toggles would be decoration.
2. We would not own the menu — contents come from `report` records, so we could not filter by our
   own access list, nor order, group or label the items.

**Still register published reports as `report` records** of type *Link to Web Page* — cheap,
data-only, and it makes them findable in the native Reports area and in search. Not the
context-carrying launch path.

Three details decided up front:
- **Empty state** — return a single *disabled* item ("No reports available for this table") rather
  than an empty flyout, which reads as a bug.
- **Role filtering in the flyout is convenience, not security.** Enforcement stays
  `ReportAccessGuard.DemandExecute` in the plugin. Say so in the docs so a hidden menu item is not
  mistaken for a permission boundary.
- **Three ribbon locations, one command** — form, home grid and subgrid are separate locations, so
  three FlyoutAnchor definitions per entity sharing the same populate command and JS. They differ
  only in what context each can supply.

The same flyout mechanism will serve dashboards later, so this is not single-use.

**Scope note:** this is a full session's work — solution export, RibbonDiffXml for three locations,
a new JS web resource for the populate handler, the command handler, re-import, publish, then prove
it on `account` before touching a second entity. Prove one entity end to end first.

### 3. C-2 — the Arabic language path (blocks merge per Phase 7)
The runtime viewer has `.report-paper[dir="rtl"]` CSS and a `const lang = opts.lang || "en"` helper,
**no UI to choose a language, and zero references to the report's stored languages** (`grep` = 0).
So a report configured as English + العربية always renders English LTR. Needs: a language control,
the stored languages loaded, `opts.lang` threaded through, `dir="rtl"` for Arabic/Urdu — and then
check the PDF export honours it (the jsPDF RTL risk, open since earlier sessions).

---

## Also open

- **C-1 exports** — the runtime viewer is verified (60 rows, linked columns, display names, ETL
  rename all correct). The four exports are untested and need the user's go-ahead to download.
- **"1 rows"** — group headers say "1 rows". One-line fix, next time the viewer is touched.
- **Demo report artefact** — `End-to-end — Account portfolio` has a filter whose prompt reads
  "City begins with" but which filters on `name`. Repointed deliberately to get a discriminating
  test, because every account in the org has an empty city. Fix the prompt or the field.
- **Phase 7 conditions C-3 to C-8** — see `phase-7-ceo.md`. C-6 (2-minute plugin ceiling on realistic
  volume) is the one that is a question rather than a task; ADR-RPT-011 rests on the answer.

---

## The finding that should shape how the next session works

Nineteen defects were found in one session. **None were caught by the 221 automated tests**, which
were green throughout. Several had existed for weeks. Two returned wrong data that looked like data.
One meant every report using the generated query failed outright, hidden because earlier testing
happened to use the saved-view path.

Practical consequences, learned the hard way:

- **A run that returns rows proves nothing.** Prove behaviour by a *change* in result — 5 rows vs 0,
  "Q"→39 vs "M"→3. Several "verified" claims collapsed under this test.
- **Read the screen, not the DOM.** A dialog that `querySelector` said was open was invisible behind
  a scrim; a summary said "Not configured yet" beside settings that were configured.
- **Web resource publish lags.** The org has the new bytes before the iframe's version token
  rotates. Poll for a marker string; do not conclude "not deployed" from one reload.
- **Suspect the vocabulary.** Three separate defects were label-vs-code mismatches
  (`BeginsWith`/"Begins with", 11 phantom ETL ops, 5 transform types claiming to be implemented).
  When the UI and the engine name the same thing differently, something is silently falling through.
