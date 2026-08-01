# Report Engine — next session starts here

Written 2026-07-31 at the end of a long session. Branch `feat/report-engine-prototype`,
~104 commits ahead of `main`. Org `org5869857f`.

Read this before touching anything. Everything below is verified state, not assumption.

---

## Start with these three, in order

### 1. ~~Fix the dashboard loader~~ — INVESTIGATED 2026-08-01, **NOT A DEFECT, CLOSED**

The reported symptom (opening **"Accounts Overview"** shows its title and **0 sections**) **does not
reproduce**. The loader, the mapping and the composer are all correct. Nothing was changed.

Verified live on `org5869857f`, signed in through
`main.aspx?pagetype=webresource&webresourceName=qdb_reportengine_designer.html`, by driving the real
user path (click the dashboard name in the list) and reading the **rendered screen**:

| Dashboard | Rendered on screen | Org actually holds |
|---|---|---|
| Accounts Overview | 2 section(s) · 5 widget(s) | 2 sections, 5 widgets ✓ |
| Portfolio Overview (edited) | 1 section(s) · 1 widget(s) | 1 section, 1 widget ✓ |
| Test | 3 section(s) · 3 widget(s) | 3 sections, 3 widgets ✓ |

That is proof *by a change in result* across three dashboards, not one run that returned rows. None
of the three showed the "No sections yet" empty state.

Also ruled out along the way:
- **Deployed bytes are current** — `webresourceset` content is **byte-identical** to
  `prototype/report-designer.html` (527,630 bytes) and contains `renderDashboardComposer`.
  So this was not the publish-lag trap.
- **The stored data is correctly parented** — every `qdb_dashboardsection` carries the right
  `_qdb_dashboardid_value`, every widget the right `_qdb_dashboardsectionid_value`.
- **The queries are right** — replaying `loadDashboardDefinition`'s exact OData as the app user, and
  again by calling the page's own `loadDashboardDefinition()` inside the signed-in browser, both
  return 2 sections / 5 widgets for Accounts Overview.

**What most likely produced the original report:** the "3 sections and 5 widgets" figure does not
describe any single dashboard — *Test* has 3 sections, *Accounts Overview* has 5 widgets. Two
dashboards were probably conflated. A contributing factor is real and worth carrying forward:

> **Coordinate clicks drift.** A physical click at the correct-looking screenshot coordinate did
> nothing, because the viewport had resized (1512x811 → 1432x717) between the screenshot and the
> click, and `devicePixelRatio` is 2. The same click at the recomputed point worked. The designer
> runs inside iframe `#FullPageWebResource0` at a **y-offset of 85px**. Compute the target from
> `getBoundingClientRect()` plus the frame offset, or click via `element.click()` — do not trust a
> coordinate read off a screenshot. A click that silently does nothing reads exactly like a broken
> feature.

**Gotcha still true and still worth knowing:** `qdb_dashboard` has **no `qdb_name`** column — the
primary name is `qdb_dashboardname` and there is also `qdb_dashboardcode`. A `$select` naming
`qdb_name` returns 400, not 404, which reads like "table missing" and is not.

### 2. Deploy into CRM — **sitemap DONE 2026-08-01. Dashboard BLOCKED. Ribbon NOT STARTED.**

| Target | Status |
|---|---|
| **Sitemap area** | ✅ **DONE and verified on screen** — `scripts/provision-report-app.mjs` |
| **Native CRM dashboard** | ✅ **DONE and verified on screen** — `scripts/provision-report-dashboard.mjs` |
| **Ribbon buttons** | 🟡 **deployed on `account`; needs one visual confirmation** — see below |

#### ✅ The "Report Engine" model-driven app exists
`node scripts/provision-report-app.mjs <env>` creates app `qdb_ReportEngine`
(**`cb3adcc9-968d-f111-ab10-000d3abd8313`**) + sitemap `qdb_reportengine_sitemap`
(`04c1df9c-968d-f111-ab0f-70a8a55bc6a5`), idempotent, re-runnable as the service principal.
Open: `main.aspx?appid=cb3adcc9-968d-f111-ab10-000d3abd8313`.
**Verified by reading the rendered screen:** *Run a report* loads the runtime viewer showing 7 real
report definitions; *Report Designer* loads the designer showing the same 7.

**The trap that cost the most time — an unpublished appmodule is INVISIBLE.** `POST /appmodules`
returns 204 with an id, then `GET appmodules(<that id>)` returns **404 "Does Not Exist"** and
`$filter` finds nothing. The row is real; it is an unpublished solution component. Worse, a retry
with the same `uniquename` then fails with an opaque **0x80050135 / "-2147155681"** because
duplicate detection sees what retrieve cannot — so a half-finished run *strands the name*. Publish
in the same run that creates. Also: `webresourceid` (icon) is **required** and is a plain guid, not
a lookup; `Prefer: return=representation` is rejected; a web resource **cannot** be an app component
(0x80050112); `ValidateApp` is a GET function; and `<SiteMap>` has no `SiteMapName` attribute.

#### ✅ The native dashboard — `scripts/provision-report-dashboard.mjs`
Creates systemform **`0c625f7d-9b8d-f111-ab0f-70a8a55bc6a5`** ("Report Engine — Report Catalog"),
a single full-width web-resource cell hosting `qdb_reportengine_runtime.html`, publishes it and links
it to the app. **Verified on screen:** the Dashboards nav item in the Report Engine app opens it and
the report catalogue renders inside with the real 7 reports.

🔑 **A component-scoped `PublishXml` is NOT enough for a new dashboard — you must call
`PublishAllXml`.** This cost most of the session. With only the `<dashboards>` publish the record
saves, publishes, reports healthy and matches a working OOB dashboard on every field, yet CRM never
lists it in the picker and silently renders **"Tier 1 Dashboard"** instead. Every route fell back the
same way: `pagetype=dashboard&id=…`, `&type=system`, and
`Xrm.Navigation.navigateTo({pageType:'dashboard', dashboardId:…})`.

**What proved it was not the Form XML:** cloning a working OOB dashboard *byte-for-byte* under a new
name produced a dashboard that was **equally invisible**. That ruled out the markup in one step,
after a lot of wasted effort tuning it. One `PublishAllXml` made both appear immediately.

Also learned, worth keeping:
- The dashboard **Form XML schema is stricter than the entity-form one** and rejects on save:
  `IsUserDefined` on a tab; `name`, `layout`, `celllabelalignment`, `celllabelposition` on a section.
  A dashboard cell's `Url` is the **bare web-resource name**, not `$webresource:…`.
- Three things are accepted on save but load-bearing at render: `columns="1111"` on the section,
  filler `<row />` elements matching the cell's rowspan, and a `<DisplayConditions>` block.
- The classic `/workplace/home_dashboards.aspx` subarea is **not app-aware** — it lists the org's
  dashboards and never the app's own. Use `Url="/main.aspx?pagetype=dashboard"` with
  `DefaultDashboard="{guid}"` instead, which is what the sitemap now does.
- The **sitemap itself is client-cached**: the Dashboards nav item only appeared after a full reload.
- The fallback URL carries `_canOverride=true` — the signed-in user's **personal default dashboard**
  outranks the sitemap's `DefaultDashboard`. Harmless once the dashboard is actually published.

#### 🟡 The ribbon — built and deployed on `account`, one visual check outstanding

Three new pieces, all committed:
- **`prototype/report-ribbon.js`** → web resource `qdb_reportengine_ribbon.js`. Handlers
  `populateFormFlyout` / `populateGridFlyout` (build the menu) and `openReport` (open the viewer).
- **`scripts/seed-ribbon-placements.mjs`** — seeds `qdb_reportribbonplacement`; **6 rows now on
  `account`** (3 reports × form + grid). The table was empty before, so nothing could have shown.
- **`scripts/deploy-ribbon.mjs`** — applies the RibbonDiffXml. `node deploy-ribbon.mjs <env> [entity]`.

**Confirmed ingested by the platform** — `ribbondiffs` holds both custom actions against `account`:
`qdb.account.Form.ReportsFlyout.CustomAction` and `qdb.account.HomeGrid.ReportsFlyout.CustomAction`.

**⏳ NOT yet seen on screen.** The browser session expired before the flyout could be opened, so the
menu has never actually been clicked. **First job next session:** open an account form and the
account home grid, click **Reports**, confirm the three seeded reports appear and that choosing one
opens the viewer. Until then treat the ribbon as deployed-but-unproven — this project has a long
history of things that deploy cleanly and do not work.

Implementation notes worth keeping:
- **There is no supported Web API for RibbonDiffXml.** `ribboncustomization` has *no* `ribbondiffxml`
  column and the underlying `ribbondiff` rows are not safely writable. Export → edit
  `customizations.xml` → import → publish is the only reliable route.
- The script uses a **small dedicated solution** (`qdb_reportengineribbon`, just the target entity
  with `DoNotIncludeSubcomponents`) instead of round-tripping `qdb_reportengine`. Export/import is
  seconds rather than minutes and a bad import cannot damage the engine's own components.
- **Use `ImportSolutionAsync`, not `ImportSolution`.** The synchronous message holds the connection
  open for the whole import and reliably trips Node's default header timeout — the client fails while
  the server carries on and *succeeds*, so a retry then dies on "Cannot start another [Import]
  because there is a previous [Import] running". That is what happened here: the first, apparently
  failed, run had actually imported fine. Poll `asyncoperations` for statecode 3 / statuscode 30.
- **The populate handler must be synchronous.** The ribbon reads `PopulationXML` the instant the
  handler returns, so `Xrm.WebApi` would always answer too late. `report-ribbon.js` uses a deliberate
  synchronous `XMLHttpRequest`; this is not an oversight, do not "fix" it into an async call.
- The report id rides in each generated button's `Id` (`qdb.report.<guid>`) because every item shares
  one command; `openReport` recovers it from `CommandProperties.SourceControlId`.

#### Ribbon design — AGREED with the user 2026-07-31

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
