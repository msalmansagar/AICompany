# DCP Collection Officer UX Simplification — WP2 Navigation Simplification

Date: 2026-10-06 · Branch `feat/dcp-officer-navigation` @ `25936023` (on `8daf9347` + WP1 audit `84d17f02`)
Baseline: `docs/UX_WP1_NavigationAudit.md`. Paths are relative to `apps/web/src/`.

## 1. Before / after navigation

| Before (both workspaces) | After (both workspaces) |
|---|---|
| **Workspace**: My Day · Work Queues · Collection Cases | **My Work**: My Day · Work Queues · Collection Cases · Customers |
| **Customer**: Customer 360 | **Insights**: Dashboards |
| **Collection**: Action Plan · Promise to Pay · Communications | **Manager** *(role-specific)*: Approvals · Portfolio & Strategy · Action Plan · Communications · Audit Trail |
| **Resolution**: Disputes · Legal Hand-off · Deceased Review | **Administration** *(manager)*: Delinquency Intake · Strategy Rules · Configuration |
| **Strategy & Oversight** (mgr/rm): Portfolio & Strategy · Dashboards · Approvals | |
| **Control** (mgr): Audit Trail | |
| **Administration** (mgr): Intake · Rules · Configuration | |

Officer entries: **10 → 5**. Sections an officer sees: **4 → 2**.

## 2. Officer navigation (also Legal role)

My Work: My Day · Work Queues · Collection Cases · Customers. Insights: Dashboards.

## 3. Manager navigation

The officer's two sections, then **Manager**: Approvals (still a pending screen, advertised as before)
· Portfolio & Strategy · Action Plan · Communications · Audit Trail.
Relationship Manager: Manager section with Approvals · Portfolio & Strategy · Action Plan only.
**Team Work is not offered**: no screen shows a team's work, and an entry must not promise one.

## 4. Admin navigation

Administration (manager only): Delinquency Intake · Strategy Rules · Configuration — unchanged.

## 5. Moved items

| Item | Officer reaches it from | Manager |
|---|---|---|
| Action Plan | the case's own Action Plan (V1 Actions tab, V2 Plan tab + Overview) | Manager › Action Plan (portfolio list of strategy actions) |
| Promise to Pay | case Promises/PTP tab; **Work Queues › Promise to Pay** (new button, V1 + V2); V2 My Day tiles | same |
| Communications | **case Communications tab** — now in V1 too (embeds the same `CommunicationCenterView` V2 already embedded); V1 command bar "Send message" now opens it; Bulk via the tab's "Bulk SMS & Email" pivot | Manager › Communications |
| Disputes | Work Queues › Disputes bucket; case Workout & Legal | same |
| Legal Hand-off | Work Queues › Legal bucket; case Workout & Legal | same |
| Deceased Review | Work Queues › Deceased Review bucket; case Workout & Legal | same |

The rule is recorded in code: `CONTEXTUAL_ROUTES` in `shell/navigation.ts` names, for every contextual
route, the primary entry it belongs under and where it is reached from. A contextual route
highlights that entry (e.g. officer on `#ptp` → Work Queues highlighted, `aria-current="page"`).

## 6. Hidden items

Nothing was deleted. No route, screen, component or route id changed. Hidden from the **officer's
primary navigation only**: the six above. Still not offered to anyone (as before): Case Detail
(contextual), Template Library, Portfolio MIS (pending), Restructuring (parked).

## 7. Functionality reachability

Proven by tests (`__tests__/navigationModel.test.tsx` › "no functionality became unreachable"):
- for every role, every built route is either offered or contextual with a parent the role is offered
  (routes the model gives only to other roles — Portfolio & Strategy, Audit Trail — excepted by design);
- every contextual route names an existing parent and where it is reached from;
- Disputes / Legal / DeceasedReview remain Work Queue buckets (`QUEUE_BUCKETS`; V1 `BUCKETS` unchanged);
- 9 bookmarks still resolve (`#ptp`, `#comms/<id>`, `#comms/bulk`, `#disputes`, `#legal`, `#claims`,
  `#actionplan`, `#case/<id>/workout`, `#customer/<id>`);
- through the real App: Work Queues › Promise to Pay opens `#ptp` (V1 and V2); V1 case
  Communications tab renders the composer (`view-comms`), no placeholder.

**One honest scope change:** the *portfolio* Action Plan list (every strategy action across strategies)
is now a Manager/RM entry. An officer still has the plan of each case on that case, and can open
`#actionplan` by URL, but it is no longer offered to them. Reverting is one line in `NAVIGATION`.

## 8. V1 / V2 reuse

- One model: `shell/navigation.ts` (`NAVIGATION`, `navigationFor`, `activeNavigationId(view, role)`,
  `pageTitleOf`, `CONTEXTUAL_ROUTES`); V1 `NavRail` and V2 `V2Nav` render it. The existing test that V1
  and V2 render identical sections/words/order for every role still passes.
- One link component: `shell/RecordLinks.tsx` (`CustomerLink`, `CaseLink`, `navigateTo`) used by both
  workspaces. Customer name → Customer 360 now in: V1 Cases grid + Split, V1 case header + Summary, V1
  case preview, V1 PTP grid + Split, V2 Cases grid + Split, V2 case header, V2 case preview, V2 Promises
  grid + Split. Case number → case in: V1 and V2 case previews, Customer 360 unit list. Lists whose row
  already opens the case are unchanged.
- One composer: V1 case Communications reuses `CommunicationCenterView` exactly as V2.
- "Customers" is the nav word; a single customer's page is titled "Customer 360" (`pageTitleOf`).

## 9. Tests

| Package | Before (WP1) | After |
|---|---|---|
| @dcp/web | 1,375 | **1,429** (+54) |
| @dcp/domain | 855 | 855 |
| @dcp/api | 412 | 412 |
| @dcp/dataverse-client | 39 | 39 |
| @dcp/auth-adapters | 14 | 14 |
| tooling | 25 | 25 |
| **Total** | 2,720 | **2,774, 0 failed**; type-check clean |

New/changed: `navigationModel.test.tsx` (canonical model per role, moved items, admin never offered to
officers, reachability per role, bookmarks, highlight, **keyboard**: Tab reaches every entry and Enter
opens it, **collapsed**: every entry keeps its name), `recordLinks.test.tsx` (navigation, row not
activated by click or Enter, keyboard, plain text without an id, accessible name — for both links),
`v2CasesPage` (customer name in a grid row opens Customer 360, not the case), `v2QueuePage` / `v1ListLayouts`
(Work Queues › Promise to Pay), `views.test` (V1 case Communications embeds the composer), `v2Shell`.
Eight existing tests that encoded the old navigation were updated to the new contract.
Note: one V2 Cases test (`filters, search, scope and sort survive the switch`) timed out once under full-suite
load at 22 s; it passed alone and in the following full run.

Code review (code-reviewer): **PASS WITH WARNINGS**, no blocking findings; both warnings applied
(CaseLink edge/keyboard tests added; CSS rules regrouped).

**CRM security remains authoritative**: navigation visibility is computed from the presentation role
only; route role gates in `routes.ts` are unchanged; every route still resolves by URL for every role
(existing test kept); no new security rule, no role mapping invented.

## 10. Screenshots / live evidence (org5869857f, 2026-10-06, System Administrator)

Deployed with `deploy-workspace-webresource.mjs --publish`: 11/11, stored content byte-for-byte equal to the
build. The CRM frame first served the **previous** bundle (old seven-section menu) — the known stale-iframe
cache; re-pointing `FullPageWebResource0` at `/WebResources/qdb_dcp_workspace.html?cb=…` loaded the new one.

| Check | V2 | V1 |
|---|---|---|
| Officer menu = My Work (4) + Insights (Dashboards) | ✅ | ✅ |
| Manager / RM / Legal menus as §3 | ✅ all four roles | (same model) |
| Work Queues › Promise to Pay opens `#ptp`, Work Queues highlighted | ✅ | ✅ |
| Disputes / Legal / Deceased buckets present on Work Queues | ✅ | ✅ |
| Customer name in Cases list opens `#customer/<id>`, title "Customer 360" | ✅ | — |
| Case numbers in Customer 360 are links to the case | ✅ | ✅ (shared) |
| Case header customer name is a link | ✅ | ✅ |
| Case Communications tab embeds composer + history (no placeholder) | ✅ (as before) | ✅ **new** |
| Command bar "Send message" enabled on a case, opens Communications | — | ✅ |
| Bookmarks `#disputes #legal #claims #actionplan #comms/bulk` open their screens | ✅ | ✅ |
| Keyboard: Tab through the menu, Enter opens the entry | — | ✅ |
| Collapsed rail keeps every entry's name (title), re-expands to 248 px | — | ✅ |
| Mobile (400 px probe frame): menu off-screen, burger opens drawer with the 5 entries, choosing one navigates and closes it, no horizontal scroll | ✅ | — |
| Console errors | none captured (tracking started after first load) | |

Screenshots saved locally: V2 My Day with the new menu; V2 Customer 360 reached from a customer name; V1 case
Communications tab with composer and history. Browser left as found: V2, My Day, Collection Officer, rail expanded.

Cosmetic finding: on the V1 case header the customer-name line renders under the "Customer 360" button instead
of beside the case number (Card actions layout). Not functional; fix in WP3 with the case composition.

## 11. Files changed

`shell/navigation.ts`, `shell/routes.ts`, `shell/AppShell.tsx`, `shell/RecordLinks.tsx` (new),
`v2/shell/V2Shell.tsx`, `App.tsx`, `views/CaseWorkspace.tsx`, `views/index.tsx`,
`views/operationsViews.tsx`, `views/previews.tsx`, `views/customer360/FinancialUnitList.tsx`,
`v2/pages/case/CaseHeader.tsx`, `v2/pages/cases/CasePreview.tsx`, `v2/pages/cases/casesColumns.tsx`,
`v2/pages/ptp/V2PromisesPage.tsx`, `v2/pages/queue/V2QueuePage.tsx`, `data/caseQueries.ts` (PTP read adds
`qdb_customerbusinessid` to its existing case `$expand` — no extra request, no schema), `styles/components.css`;
tests listed in §9. **Schema changes: none.**

## 12. Click reduction achieved so far (code-traced against the WP1 baseline)

| Journey | WP1 V1 / V2 | WP2 V1 / V2 |
|---|---|---|
| G comms history from the case | 3 + search / 1 | **1 / 1** |
| B contact customer (SMS) from My Day | ≥5 + search / 4 | **4 / 4** (row → Communications tab or Send message → Send) |
| Open Customer 360 from a list row (Split) | 3 (select → Open case → Customer 360) | **1** (customer name) |
| E review PTP list as officer | 1 nav click | 2 (Work Queues → Promise to Pay) — **+1**, the price of leaving the nav |
| Primary nav entries an officer scans | 10 | **5** |

A, C, D, F, K, L are unchanged — they are WP3–WP5 work.

## 13. Remaining issues

1. Deployed and live-checked (§10); the deploy also carried the previously unrecorded `8daf9347`.
2. **Role is not derived from CRM roles.** The working role is still the header picker (default Officer,
   presentation only). The CRM context exposes only security-role *ids*; mapping them to Officer/Manager
   needs a QDB-agreed role→working-role mapping (configuration, not schema). Until then an officer can
   pick "Manager" and see manager navigation — CRM still refuses what they may not read.
3. "Both CRMs" scope picker unchanged (out of WP2 scope; WP1 §20).
4. Dashboards are now offered to officers; the dashboard content is the same four compositions managers
   see. Whether an officer-specific dashboard is wanted is a business question.
5. Work Queue rows have no customer name in the read, so no customer link there.
6. Opening from My Day/queues still lands on Summary and "← Cases" still ignores origin (WP5).
7. Case-number links inside previews duplicate the preview's "Open case" button (intentional consistency).

## 14. Recommended WP3 scope — Unified Collection Case Workspace

1. One case composition in both workspaces (V2 layout as the reference): header with customer link,
   facts and quick-action bar; Overview with **open follow-ups for this case** (each with Complete),
   next planned action, recent activity; tabs Activities · Promises · Communications · Action Plan ·
   History · Resolution (Workout & Legal) · Audit.
2. V1 case tabs into the URL (as V2) so refresh/back keep the tab.
3. Close the side pane on successful save with a confirmation toast (both workspaces).
4. Catalogue cache for activity types / outcomes / integration endpoint (Workout tab ~20 → ~8 requests)
   and pass the loaded case + customer to the Communications tab instead of re-reading.
5. Deceased review gets a confirm step before its write.
6. Customer 360 opened from a case preselects that case's unit and offers "← Back to case".
No business-logic, schema or security change expected.

## 15. Completion check against the WP2 brief

| Brief item | Status |
|---|---|
| Officer navigation = My Work (My Day, Work Queues, Collection Cases, Customers) + Insights (Dashboards) | ✅ done, live in V1 + V2 |
| Manager section: Team Work where supported, Approvals, Portfolio & Strategy, Audit Trail | ✅ (Team Work omitted — not supported). **Deviation:** Action Plan and Communications (bulk) also sit here so they are not orphaned — awaiting acceptance |
| Administration: Intake, Strategy Rules, Configuration | ✅ |
| Six items out of officer primary nav, functionality kept | ✅ — reachable from case / Work Queues, proven by tests and live |
| "Customers" destination; selecting a customer leads to Customer 360 | ✅ |
| Customer name **throughout** DCP → Customer 360 | ⚠️ **Mostly.** Linked in cases lists, previews, case headers, promise lists. Not linked: Work Queue rows (the queue read carries no customer), Legal trace card (Legal's account, no DCP business id) |
| Case identifiers → Collection Case | ✅ lists/rows already open the case; previews and Customer 360 units now link |
| Use **existing CRM role/permission context** for role-aware presentation | ❌ **Not met.** Still the header role picker; the host gives only security-role ids and no agreed role → working-role mapping exists (configuration decision for QDB). Admin navigation is not offered to the Officer role, but a user can choose another role in the picker |
| Tests: unreachable / deep links / one model / keyboard / mobile+collapsed / CRM authoritative | ✅ automated + live (mobile verified in a 400 px probe frame, not on a phone) |
| Return items 1–14 | ✅ this document |

**Verdict: WP2 is complete except one brief item (role from CRM context) and one partial (customer name in
Work Queue rows / Legal trace), both needing a decision or data the current read model does not carry.**
