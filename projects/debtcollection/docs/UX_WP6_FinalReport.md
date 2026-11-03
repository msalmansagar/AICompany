# DCP Collection Officer UX Simplification — WP6 Consolidation, Hardening and Final Report

Date: 2026-10-06 · Branch `feat/dcp-officer-navigation` @ `ba5e932e` (+ this report) · Deployed to org5869857f (cloud
sandbox, 11/11 byte-for-byte). Program: WP1 audit → WP2 navigation → WP3 unified case → WP4 quick actions → WP5 context
→ WP6 consolidation. Detailed per-WP reports: `docs/UX_WP1…UX_WP5*.md`. Paths are relative to `apps/web/src/`.

## 1. Final officer navigation (also Legal role)
**My Work**: My Day · Work Queues · Collection Cases · Customers. **Insights**: Dashboards. (WP1: 10 entries in 4 sections.)

## 2. Final manager navigation
Officer's two sections + **Manager**: Approvals (pending screen) · Portfolio & Strategy · Action Plan (portfolio list of
strategy actions) · Communications (bulk SMS & Email runs) · Audit Trail. Relationship Manager: Manager section without
Communications and Audit Trail.

## 3. Final admin navigation
**Administration** (manager): Delinquency Intake · Strategy Rules · Configuration — unchanged.

## 4. Final My Day journey
Tiles and My queues as before; the **Follow-ups** list (Overdue / Upcoming / All) now has **Complete** on each row (activity
pane at completion, in place) and a row opens the case **with the list as context** ("1 of 5 · Overdue follow-ups").

## 5. Final Case Workspace journey (one shared page, V1 and V2)
Sticky header: ← Back to <origin> · customer (→ Customer 360, carrying the case) · Loan Account / Facility · case · status ·
owner (System for integrations) · DPD · bucket · arrears · balance · balances date. Work-list bar: ← Previous · n of N ·
<origin> · Next → · Complete & Next. Action bar: Contact ▾ (Call, Log the call, SMS, Email — only usable channels) ·
Log action · Capture PTP · Complete follow-up · More ▾ (complaint on HL, dispute, resolution). Surface: Overview · Action
Plan (overdue / today / upcoming / completed, Complete in place) · Timeline · Promise to Pay · Resolution · Delinquency.
Records: Activities · Promises · Communications · Action Plan · Resolution · Delinquency history · Case details · Audit.
Every command is a pane over the case; saving closes it, says so and re-reads.

**Primary target met** — My Day → (row) Case → (Complete & Next) action → (Complete activity) next case, with **no
main-navigation round trip**: 3 clicks + the outcome's required fields per item, then 2 per further item.

## 6. Final Customer 360 journey
From a case: one click on the customer name → Customer 360 **on that case's Loan Account / Facility** with "← Back to case
<number>" (one click). From the Customers nav: search/list → customer → units → "Open case". Log action / Capture PTP per
unit as before.

## 7. Before / after click matrix (WP1 journeys; clicks, form fields separate)

| # | Journey | WP1 V1 / V2 | Final (both) | Context reselection removed |
|---|---|---|---|---|
| A | Complete overdue follow-up (from My Day) | 6 / 6 | **2** (Complete → Complete activity) | case + activity no longer re-found |
| B | Contact customer from My Day — SMS | ≥5+search / 4 | **4** (row → Contact → SMS → Send) | V1 no longer re-selects the case in a second list |
| B | — Call | not possible | **3** (row → Contact → Call) | — |
| C | Log collection action (from My Day) | 5 / 4 | **3** (row → Log action → Save) | pane names customer · unit · case |
| D | Capture PTP (from My Day) | 5 / 4 | **3** | same |
| E | Review existing PTP | 5 / 4 | **2** (row → View on the PTP panel) | lands on the case, promise in view |
| F | Open Customer 360 (from case) / return | 1 + browser Back (wrong unit) | **1 / 1** (right unit, Back to case) | unit no longer reselected |
| G | Review communication history (from case) | 3+search / 1 | **1** (timeline on the surface; Communications tab 1) | — |
| H | Create complaint, HL (from case) | 4 | **3** (More → Raise complaint → Create) | — |
| I | Legal hand-off | not possible | **not possible** (no qualification rule — KI-109) | — |
| J | Start deceased review (from case) | 2 | **3** (More → Resolution → Record) — moved off the top level; same in the Resolution tab | — |
| K | Completed item → next item | ≥3 + re-find / 2–3 | **1** (Next) or **0 extra** (Complete & Next) | list, filter, position kept |
| L | Find a case by search | V1 not possible (dead box) · V2 2+typing | **2**+typing (V1 header search now works: case no./customer id; V2: name, facility too) | — |

**Navigation reduction:** officer primary entries 10 → 5; officer sections 4 → 2; main-navigation round trips in the core
loop (work an item → next item) **from 1 per item to 0**.

## 8. Removed navigation
From officers' primary navigation (routes kept, reachable contextually): Action Plan, Promise to Pay, Communications,
Disputes, Legal Hand-off, Deceased Review. From the V1 global command bar (WP6): Log action, Capture PTP, Send message (they
only jumped to case tabs; the case action bar does them in place). Retired code (WP6): unrouted `V2CasePage`, V2
`CaseHeader`, `CaseOverview`, `caseTabs` and their dead V2 styles.

## 9. Contextualized functionality
| Capability | Where now |
|---|---|
| Action Plan (one case) | Case: Action Plan panel + Action Plan tab |
| Promise to Pay | Case: PTP panel (View) + Capture PTP + Promises tab; Work Queues › Promise to Pay; My Day tiles (V2) |
| Communications | Case: Contact ▾ panes + Communications tab (incl. Bulk pivot); Manager › Communications |
| Disputes / Legal / Deceased lists | Work Queues buckets (and their old routes) |
| Complaint / dispute / deceased actions | Case: More ▾ and Resolution tab |
| Follow-up completion | My Day row Complete; case Action Plan; Complete follow-up; Complete & Next |
| Customer 360 | Every customer name; Customers nav |

## 10. Capability preservation matrix
Every operation supported before WP1, where it is now, and for whom (role = presentation; CRM security authoritative).

| Operation (pre-program) | Before | Now | Roles | Proven by |
|---|---|---|---|---|
| See My Day tiles / queues / follow-ups | My Day | My Day (+ Complete, + context) | all | v2HomePage, caseWorkspace tests, live |
| Work a queue bucket (incl. Disputes, Legal, Complaints, Deceased, Restructuring recommendations) | Work Queues / Resolution nav | Work Queues buckets; old routes still resolve | all | navigationModel reachability tests, live |
| Search / filter / sort cases | Collection Cases | same (+ V1 header search) | all | v2CasesPage, caseWorkspace tests |
| Open a case | lists | lists, links, previews, Customer 360, Next | all | tests, live |
| Log / edit / complete / cancel an activity | case Actions tab | case action bar, Action Plan, Activities tab, My Day | all (CRM decides) | caseWorkspace, phase6Forms |
| Capture / update / record outcome of a promise | case PTP tab, previews | case PTP panel + tab, previews, Customer 360 | all | caseWorkspace (save end to end), phase6Forms |
| Send SMS / Email (one customer) | V1 `#comms/<id>`, V2 case tab | Contact ▾ pane; Communications tab | all | caseWorkspace (SMS/Email panes) |
| Bulk SMS & Email runs | Communications nav | Manager › Communications; Bulk pivot on the case tab; `#comms/bulk` | manager (nav), all (route) | bulkCommunication tests |
| View the plan for one case | case Actions tab (V1) / Plan tab (V2) | Action Plan panel + tab | all | caseWorkspace |
| Portfolio list of strategy actions | Action Plan nav | Manager › Action Plan; `#actionplan` | manager, RM (nav) | navigationModel |
| Customer 360 | nav, case header | nav (Customers), every customer name, case header | all | recordLinks, caseWorkspace |
| Raise complaint (HL) | case Workout tab | More ▾ + Resolution tab | all (HL only) | caseWorkspace, createComplaint |
| Record a dispute | Log action | More ▾ → Record a dispute; Log action | all | caseWorkspace |
| Legal traces (read-only) | case Workout tab; Legal nav | Resolution panel + tab; Legal bucket | all | legalCardWaits |
| Deceased review (record) | case Workout tab | Resolution tab (More ▾ → Resolution) | all | deceasedReviewWrite |
| Delinquency snapshots | case Summary | Delinquency panel + tab | all | caseWorkspace |
| Case stored details / audit | Summary / Audit tabs | Case details / Audit tabs | all | views tests |
| Dashboards | Strategy & Oversight (mgr/rm) | Insights — **now also officers** | all | v1ListLayouts |
| Portfolio & Strategy, Approvals, Audit Trail, Intake, Rules, Configuration | manager sections | Manager / Administration | as before | navigationModel |
| Documents tab | placeholder ("not available yet") | removed — it held nothing | — | — |
**No supported operation was lost.** One deliberate scope change: the *portfolio* Action Plan list is a Manager/RM entry
(officers keep each case's plan).

## 11. Role behavior
Navigation per role as §1–3 (tested for officer, legal, manager, rm). Role is still the **header picker** (presentation,
default Officer): the CRM context exposes only security-role ids and no agreed CRM-role → working-role mapping exists
(decision pending). Every route resolves for every role by URL; CRM security decides every read and write (unchanged,
tested). **Collection Officer RBAC is not validated** — all live evidence is System Administrator (KI-100/111/116/120/128).

## 12. HL behavior
Loan Account wording from the case's source system (header, previews, Customer 360, V1 grid header "Loan Account /
Facility"); SMS via the org's configured message table (Letter on HL — never named to the officer); WhatsApp not offered
(HL is SMS-only today); Raise complaint offered on HL cases only. Verified on the cloud sandbox's DEMO-HL cases. **The HL
on-prem org has not received any of WP2–WP6**: the `onprem-deploy/2026-10-04` kit predates them; a new kit and import
(your approval) are needed. Nothing added depends on cloud-only APIs (sessionStorage, IntersectionObserver with fallback,
Xrm/Web API reads already used on 9.1).

## 13. QDB1 (BFD) behavior
Facility wording; SMS via Fax mapping; no Raise complaint (Integration Service supports HL only); verified on the sandbox's
DEMO-BFD cases (navigation, Next across DEMO-BFD-1001/1002). **QDB1 has never been imported** (preflight + D6 SMS decision
still open), so QDB1 behavior is unverified on its own org.

## 14. Performance
- Fresh case load, measured live across all frames: **11 Dataverse requests** — case 1, customer 1, activities 4 (two work reads, Activities tab, timeline), strategy actions 1, messaging configuration 2, Letter and Email history 1 each; activity types served from the 60-s catalogue cache; delinquency deferred until visible. No per-record (N+1) read anywhere.
- WP1 comparison: V2 case overview ~6 requests with every other tab re-reading; Workout tab ~20–22 → now ~8–10 (catalogue reuse).
- Lists: server-side paging, filtering, sorting and opaque continuation unchanged; work context carries ≤200 loaded ids, no extra request; Next revalidates one item per step (≤10).
- Stale requests: `usePagedQuery` sequence guard, `useSectionData` latest-only, timeline request id — unchanged and covered.

## 15. Accessibility
Menus with `aria-haspopup`/`aria-expanded`/`menu`/`menuitem`, arrow keys, Escape returns focus (verified live); calls are real
links; record links are buttons with accessible names and don't trigger their row; work-list position `aria-live`;
notices `role="status"`; header search `role="search"` with a label; rail keyboard (Tab/Enter) and collapsed names verified
live; current page `aria-current`. No automated axe audit was run (no tool available in this environment).

## 16. Responsive
≥1081 px two columns, sticky header + bars; ≤1080 px one column; ≤640 px the identity scrolls away and the **action bar is
pinned to the bottom edge** (thumb zone), menus open upward; verified in a 400 px probe frame (no horizontal scroll, all
actions reachable). V2 nav drawer works at 400 px. **V1's own nav rail is not phone-responsive** (pre-existing).

## 17. Regression results
**2,863 passing, 0 failing; type-check clean** — web 1,518 · domain 855 · api 412 · dataverse-client 39 · auth 14 ·
tooling 25 (WP1 baseline 2,720; web +143). C# plugin tests (159 on record) not run (no change to plugins). Note: with
all packages in parallel this machine times out 1–2 random slow tests; the suite is green with `--concurrency=1` and each
timed-out file passes alone. Every WP had an independent code review; all required changes applied.

Hardening checklist:
| Item | Result |
|---|---|
| V1 / V2 | one shared case page; header, action bar, nav tested in both; live in both |
| Server paging / large data | unchanged mechanisms; context bounded at 200; Next bounded |
| Loading / empty / partial errors | every panel in its own `SectionBoundary` with Retry; empty states worded (tested) |
| Deep links / bookmarks | `#case/<id>/<tab>`, old `#case/<id>/summary|documents`, `#disputes` etc. resolve (tested, live) |
| Browser Back | leaves the case in one step after tab changes; returns to My Day (live) |
| Stale requests / concurrent updates | sequence guards; Next revalidates; versioned writes in panes (unchanged) |
| CRM RBAC / HL on-prem / QDB1 | **not validated** — see §11–13 |

## 18. Schema changes
**None** across WP1–WP6.

## 19. API / read-model changes (front end only; no backend, no API)
`loadCaseWork` (activities with promise columns + strategy actions, parallel); `caseWorkPlan` grouping; 60-s catalogue reuse;
PTP list `$expand` adds `qdb_customerbusinessid`; `ActivityDialog` complete mode; `CaseMessagePane`; timeline `title`/`onEntries`;
grids `onRows`; per-tab work context; domain `DeceasedReviewRow.ownerId` (optional).

## 20. Remaining UX debt
1. Role from CRM security roles (needs a QDB-agreed mapping).
2. "My" follow-ups: My Day lists every follow-up in scope (no owner clause) — your decision.
3. Outcome catalogue for PTP / legal / deceased / dispute types (KI-131) — completion blocked for those types.
4. Next follows only loaded rows; scroll and Split selection not restored on Back.
5. V1 search covers case number and customer id only (guarded by design); V2 also searches names and facility.
6. V1 shell not phone-responsive; V1/V2 both still shipped — choosing V2 as default would remove a whole skin.
7. Customer name not linkable on Work Queue rows (the queue read carries no customer) or the Legal trace.
8. Legal hand-off initiation (KI-108/109), WhatsApp for HL (`vrp_type` + template column), "Today" window on My Day.
9. Collection Officer RBAC validation; HL on-prem and QDB1 deployment of WP2–WP6.
10. Recent / Pinned: **assessed, not built.** A per-browser "recent cases" list (localStorage, ≤10 ids) is feasible without
    schema, but the measured journeys no longer need it (Next/Back cover the loop, Customer 360 covers the customer), and a
    pinned list that does not follow the officer across devices would need a table. Not added.

## 21. Screenshots (local, `%TEMP%/claude-chrome-screenshots-4euWIT/`)
WP2 nav `screenshot-1791282588122-0.jpg` · WP3 V2 case `…1791284990273-3.jpg`, V1 case `…1791285433575-4.jpg`, phone
`…1791285897752-5.jpg` · WP4 Email pane `…1791287991972-6.jpg` · WP5 Previous/Next `…1791306871914-7.jpg` · WP6 My Day
final `…1791308910952-9.jpg`.

## 22. Files changed (program)
New: `shell/RecordLinks.tsx`, `components/{MenuButton.tsx,initials.ts}`, `data/{caseWorkPlan.ts,workContext.ts}`,
`views/{FollowUpCompletion.tsx,workListContext.ts}`, `views/caseWorkspace/*` (12 files), `styles/caseworkspace.css`, tests
`{recordLinks,caseWorkspace,caseWorkPlan,catalogueReuse,workContext}`. Changed: navigation/routes/shells, `App.tsx`, `views/{index,
CaseWorkspace,CommunicationCenter,ActivityDialog,PromiseDialog,Customer360,MyWorkView,previews,operationsViews,…}`, V2 home/queue/
cases/ptp/customer pages, `data/{followUpQueries,configurationCatalog,caseQueries,legalTraceRows,deceasedQueries}`, grids,
domain `deceasedReview.ts`. Retired: V2 case page (4 files) + test file. Full list: `git diff --stat 8daf9347..HEAD`.

## 23. Commits (`feat/dcp-officer-navigation`, pushed, no PR)
`84d17f02` WP1 audit · `25936023` WP2 nav · `a37be1b2`/`8f51e083` WP2 docs · `a4c59637` WP3 · `cdc11fdb` WP3 docs · `05518e06` WP4 ·
`4415bef9` WP4 docs · `39384c7c` WP5 · `66159472` WP5 docs · `ba5e932e` WP6 · (this report).

## 24. Final recommendation
**Accept the simplification for the cloud sandbox, and do not call it production-ready yet.** The officer loop — My Day →
case → act → next — now runs without the main navigation, every earlier capability is reachable, the read model is lighter,
and nothing changed schema or business rules. Before production: (1) decide the CRM-role → working-role mapping and "my"
follow-ups; (2) QDB configures outcomes for PTP/legal/deceased/dispute types; (3) validate with a real **Collection Officer**
account; (4) build and import a new on-prem kit to **HL**, then QDB1 after its preflight and D6; (5) raise the PR for
`feat/dcp-officer-navigation` (stacked on the earlier unmerged UI branches) and decide whether V2 becomes the default.
