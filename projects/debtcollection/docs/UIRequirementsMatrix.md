# Phase 5 — UI Requirements Matrix

**Baseline:** `prototype/` — the Approved Frontend Design Baseline, confirmed 2026-09-18.
**Purpose:** every element of the approved GUI mapped to its React implementation, or to the future
phase that owns its functionality. **Nothing in the approved prototype silently disappears.**

Two classifications, used throughout:

| | Meaning |
|---|---|
| **P5 — Implement Now** | Built and functional in Phase 5, against real Phase 1–4 services |
| **P6–10 — Preserve UX Contract** | Screen, navigation and layout preserved; the feature is **clearly marked not yet implemented**. No fake backend behaviour, ever |

A third state appears where the prototype showed something the canonical architecture has since
superseded; each is called out with its reason rather than quietly dropped.

---

## A. Shell and chrome

| Prototype element | React implementation | Class |
|---|---|---|
| UCI header — "MSS Collections \| Debt Collection \| SANDBOX" | `<AppHeader>` | P5 |
| Global search box | `<GlobalSearch>` — server-side, bounded | P5 |
| Role switcher (officer / manager / rm / legal) | `<RoleContext>` + `<RoleSwitcher>`. **UX only**; CRM RBAC remains authoritative | P5 |
| Command bar (`DC.cmdbar`) | `<CommandBar>` with per-view command sets | P5 |
| Environment badge (SANDBOX) | `<EnvironmentBadge>`, from platform configuration | P5 |
| Copilot button | `<CommandBar>` slot, **disabled with a tooltip** — not a Phase 5 capability | P6–10 |
| Theme toggle (`DC.setTheme`) | `<ThemeProvider>` over the 143 tokens | P5 |
| Left navigation with groups, counts, role gates (`DC.renderNav`) | `<NavRail>` driven by one route table | P5 |
| Nav expander (`DC.navExpander`) | `<NavRail collapsible>` | P5 |
| Toast (`toast`) | `<ToastHost>` | P5 |
| Share (`share`) | `<ShareAction>` — deep link to the current view | P5 |
| Pop out / Form selector (`popout`, `formsel` icons) | Preserved in the command bar; pop-out targets the native CRM form | P5 |

---

## B. Navigation — all 21 views

Counts are the prototype's badge values; in React they come from the real bounded count where one is
available and are **hidden rather than faked** where it is not.

| # | Group | View | Role gate | Badge | Backing (Phase 1–4) | Class |
|---:|---|---|---|---|---|---|
| 1 | Workspace | My Day | all | — | `qdb_collectioncase`, activities | **P5** |
| 2 | Workspace | Work Queues | all | 92 | `qdb_collectioncase` + CRM queues | **P5** |
| 3 | Workspace | Collection Cases | all | 10 | `qdb_collectioncase` | **P5** |
| 4 | Customer | Customer & Loan 360 | all | — | contact/account + case + snapshot | **P5** |
| 5 | Customer | Case Detail | all | — | `qdb_collectioncase` + children | **P5** |
| 6 | Customer | Delinquency Intake | manager | — | `qdb_delinquencysnapshot`, `qdb_identityexception`, sync run report | **P5** |
| 7 | Strategy | Segmentation Matrix | all | — | `qdb_collectionstrategy` criteria | **P5 (read)** |
| 8 | Strategy | Strategy Rules | manager | — | `qdb_collectionstrategy` + `qdb_strategyaction` | **P5 (read)** · authoring + automation **P8** |
| 9 | Strategy | Action Plan | all | — | `qdb_strategyaction` | **P5 (read)** · execution **P8** |
| 10 | Engagement | Promise to Pay | all | 7 | `qdb_collectionactivity` (PTP type) | **P5 (read)** · capture/lifecycle **P6** |
| 11 | Engagement | Communication | all | — | native fax/email (KI-45) | **P6–10** — **P7** |
| 12 | Engagement | Template Library | all | — | `qdb_communicationtemplate` (provisioned, unused) | **P6–10** — **P7** |
| 13 | Workout | Disputes | all | 5 | no entity yet | **P6–10** — **P9** |
| 14 | Workout | Restructuring | all | — | no entity yet | **P6–10** — **P9** |
| 15 | Workout | Legal Hand-off | all | — | no entity yet | **P6–10** — **P9** |
| 16 | Workout | Deceased & Claims | all | — | no entity yet; FR-097 hold is KI-44 | **P6–10** — **P9** |
| 17 | Oversight | Dashboards | all | — | bounded counts over `qdb_collectioncase` | **P5 (read)** · full dashboards **P10** |
| 18 | Oversight | Portfolio MIS | manager, rm | — | MIS aggregates — **KI-53, no transport** | **P6–10** — **P10** |
| 19 | Oversight | Approvals | all | 4 | no entity yet | **P6–10** — **P10** |
| 20 | Oversight | Audit Trail | all | — | `qdb_crmlogs` + native audit | **P5 (read)** |
| 21 | Admin | Configuration | manager | — | `qdb_platformconfiguration`, `qdb_platformmapping` | **P5 (read)** · authoring **P8–10** |

**Coverage: 21 of 21 views present in the React navigation.** **13** functional in Phase 5 (the ten
marked P5 plus the three marked *P5 read*), **8** preserved as navigable screens that state plainly
which phase owns them. The route table in `apps/web/src/shell/routes.ts` is the enforced copy of this
table, and a test asserts both counts against it.

---

## C. Shared components — `DC.*` to React

The prototype's 31-function shell is the component contract. Each becomes a React component or hook.

| Prototype | React | Notes | Class |
|---|---|---|---|
| `DC.boot`, `DC.route`, `DC.go`, `DC.renderView` | `<WorkspaceRouter>` | Deep-link and refresh safe under a web resource | P5 |
| `DC.renderNav`, `DC.navExpander`, `DC.isVisible` | `<NavRail>`, `useVisibleViews()` | Role gating is UX only | P5 |
| `DC.cmdbar` | `<CommandBar>` | P5 |
| `DC.grid`, `DC.readGrid`, `labelizeGrid` | **`<DataGrid>`** — the large-data engine | Virtualized, server-paged. **Package 6** | P5 |
| `DC.kpiRow`, `DC.hero` | `<KpiRow>`, `<Hero>` | Values from bounded counts only | P5 |
| `DC.card`, `DC.sideCard`, `DC.panel`, `DC.uciSection` | `<Card>`, `<SideCard>`, `<Panel>`, `<Section>` | P5 |
| `DC.pivot` | `<Pivot>` (tabs) | P5 |
| `DC.dialog` | `<Dialog>` | P5 |
| `DC.timeline`, `DC.timelineEntry`, `DC.timelineNote`, `DC.uciTimeline`, `DC.toggleNoteText` | `<Timeline>`, `<TimelineEntry>`, `<TimelineNote>` | P5 |
| `DC.f`, `DC.fLookup` | `<Field>`, `<LookupField>` | Lookup reads the **`_value` form** — KI-52 | P5 |
| `DC.uciEmpty` | `<EmptyState>` | One of the required request states | P5 |
| `DC.barChart`, `DC.columnChart`, `DC.donut` | `<BarChart>`, `<ColumnChart>`, `<Donut>` | Rendered from bounded aggregates, never from a downloaded population | P5 |
| `DC.setTheme`, `DC.wireHeader`, `DC.shellHtml` | `<ThemeProvider>`, `<AppShell>` | P5 |
| `bucketPill`, `statusPill`, `statusTone`, `slaChip`, `orgBadge` | `<BucketPill>`, `<StatusPill>`, `<SlaChip>`, `<OrgBadge>` | **`<OrgBadge>` is the HL/BFD system-of-record marker** | P5 |
| `money`, `moneyM`, `pct`, `esc` | `formatMoney`, `formatMoneyM`, `formatPercent` | Formatting only — **no calculation** | P5 |
| `casesFor`, `actionsFor`, `auditFor`, `commsFor`, `facilitiesFor`, `ptpsFor`, `openCases`, `findCase`, `findCustomer`, `findFacility` | Data hooks over the **service layer** | These become **server queries**, not client filters over a downloaded set | P5 |
| `el`, `show`, `close`, `share`, `toast` | React idioms / `<ToastHost>` / `<ShareAction>` | P5 |

---

## D. Design system

| Asset | Treatment | Class |
|---|---|---|
| `tokens.css` — **143 tokens** | Ported verbatim as CSS custom properties under `<ThemeProvider>` | P5 |
| `components.css` (21 KB) | Refactored into component-scoped styles, visual output preserved | P5 |
| `uci.css` (14 KB) | Retained — it is what makes the workspace look native inside Dynamics | P5 |
| `icons.js` — **63 icons** | `<Icon name>` over the same SVG set | P5 |
| Layout conventions (card grid, section card, split list/detail) | Preserved | P5 |

**No token is replaced, renamed or re-valued in Phase 5.** Any material visible deviation is recorded
in §H with its reason.

---

## E. Per-view element matrix

Abbreviations: **G** grid · **K** KPI · **F** filter · **A** action/command · **D** dialog · **T** tabs · **B** badge.

### 1. My Day — P5
Info banner naming the dual-CRM rule · KPI row: My open cases, Overdue balance, Due today, SLA breached,
Promised this week · "Today's follow-ups" grid (Case, Customer, Bucket, Overdue, Status, SLA, Next action) ·
"Promises falling due" grid · "Recent activity" timeline · commands: Log action, Capture PTP, Send message, Refresh.
**P5:** banner, KPIs (bounded counts), both grids, timeline, Refresh. **P6:** Log action, Capture PTP. **P7:** Send message.

### 2. Work Queues — P5
Info banner on queue mirroring · queue tiles with counts · "Queue contents" grid filtered by tile.
**P5:** all read behaviour. **P8:** queue assignment/routing actions.

### 3. Collection Cases — P5
Filter bar: **Org (HL/BFD)**, Bucket, Status, Owner, free-text (Case id or customer) · case grid with
selection · `data-sel` row selection.
**P5 in full** — this is the primary proving ground for the large-data engine: server-side filter, sort,
search, bounded paging, infinite scroll, virtualization.

### 4. Customer & Loan 360 — P5
KPIs: Total exposure, Total overdue, Facilities, Open cases, Worst DPD, Risk grade ·
Facilities grid (Facility, CRM, Product, Outstanding, Overdue, DPD, Collateral, Guarantor, Insurance) ·
Cases grid (Case, Opened, Bucket, Status, Owner).
**P5:** aggregation over contact/account + cases + snapshots. **Aggregation only — no persistent frontend
customer or facility master.** Collateral/Guarantor/Insurance columns are **preserved but marked
not-yet-sourced**: no canonical field exists for them (P9).

### 5. Case Detail — P5
Command bar: Cases, Form, Pop out, Log action, Capture PTP, Send message, Propose restructure,
Refer to legal, Escalate, Customer 360, Share ·
Tabs: **Summary · Actions · PTP · Communications · Documents · Workout & Legal · Audit**.
**P5:** Summary, Audit, Share, Customer 360, Pop out, Form, Cases; all seven tabs present.
**P6:** Actions, PTP, Log action, Capture PTP. **P7:** Communications, Documents, Send message.
**P9:** Workout & Legal, Propose restructure, Refer to legal. **P8:** Escalate.

### 6. Delinquency Intake — P5 *(manager)*
KPIs: Records read today, New cases, Cases updated, Skipped, Failed ·
Runs grid (Run, When, Source, CRM, Read, Updated, Status) ·
Exceptions grid (QID, Housing Loan CRM, BFD CRM, Issue, Resolution).
**P5:** backed by the Phase 4 sync run report and `qdb_identityexception`. **MIS freshness is surfaced
here** — Live vs Cached with as-of and retrieved-at.

### 7. Segmentation Matrix — P5 (read)
KPIs: Active rules, Buckets in use, Cases governed, Uncovered combinations, Last published · bucket×segment matrix.
**P5:** read from `qdb_collectionstrategy` criteria. **P8:** publishing.

### 8. Strategy Rules — P5 (read) *(manager)*
Grid: Priority, Rule, Bucket, Segment, Gated on, Risk, Exposure, Action, Channel, Queue, State ·
rule builder ("When all of these are true" / "Then do this").
**P5:** read-only list. **P8:** the builder is preserved and **disabled**, because authoring belongs with
strategy automation — and because thresholds live in the Rule Engine, never in React.

### 9. Action Plan — P5 (read)
KPIs: Cases with a plan, Contact suppressed, Escalation advised, Reminders queued ·
Grid: Case, Customer, Bucket, Recommended action, Channel, SLA · Accept action.
**P5:** read of the resolved strategy actions. **P8:** Accept/execute. **Contact suppressed** reflects
KI-44 and shows *pending QDB confirmation* rather than a computed value.

### 10. Promise to Pay — P5 (read)
KPIs: Open promises, Amount promised, Kept, Broken, Kept rate · grid (PTP, CRM, Case, Customer, Amount,
Type, Promised, Reminder, Status, Captured by) · trend chart.
**P5:** read of PTP-typed activities. **P6:** capture, reminders, kept/broken evaluation.

### 11. Communication — **P7**
Form (Case, Channel, Template, Language) · history grid (Ref, CRM, Case, Channel, Template, Recipient,
Lang, When, Result, By).
**Preserved and marked Phase 7.** Sending is not implemented and is not simulated.

### 12. Template Library — **P7**
Grid (Ref, Name, Channel, Languages, Bucket, Owner, State) · preview dialog. Preserved, marked Phase 7.

### 13–16. Disputes · Restructuring · Legal Hand-off · Deceased & Claims — **P9**
Each keeps its KPI row, grid and dialog exactly as designed, and states that Phase 9 owns it.
No entity exists for any of them; **none is faked**.

### 17. Dashboards — P5 (read)
KPIs: Open cases, Overdue balance, SLA breached, Open PTPs, In legal, Contacts suppressed ·
queue/owner/SLA breakdown. **P5:** bounded counts only. **P10:** full dashboards.

### 18. Portfolio MIS — **P10** *(manager, rm)*
Bucket table (Housing Loan, BFD, Combined, Accounts, Transition, This month, Prior month, Movement),
collector table, roll-rate charts. **Blocked by KI-53** — no MIS transport. Preserved, marked Phase 10.

### 19. Approvals — **P10**
KPIs and grid (Ref, Type, Subject, CRM, Requested by, On, Value, Summary, Status) preserved, marked Phase 10.

### 20. Audit Trail — P5 (read)
Append-only entries from `qdb_crmlogs` and native audit, **server-paged and virtualized** — it is the
largest table in the system.

### 21. Configuration — P5 (read) *(manager)*
Sections: Rules & Thresholds, Queues, RBAC, CRM Context Router, Integrations ·
commands: Publish configuration, Compare organisations, Version history, Export.
**P5:** read from `qdb_platformconfiguration` / `qdb_platformmapping`. **P8–10:** publishing, comparison,
version history, export — preserved and disabled.

---

## F. Mock collections → real sources

The prototype's 22 mock collections are replaced by service calls. **No mock survives into Phase 5
runtime**; where no real source exists the view is marked for its owning phase instead.

| Mock | Real source | Class |
|---|---|---|
| `CASES`, `QUEUES`, `ACTIONS` | `qdb_collectioncase`, CRM queues, `qdb_collectionactivity` | P5 |
| `CUSTOMERS` | contact (HL) / account (BFD) | P5 |
| `FACILITIES` | MIS facility identity carried on case and snapshot — **never a CRM facility record** | P5 |
| `BUCKETS`, `STRATEGY_RULES` | `qdb_collectionstrategy`, `qdb_strategyaction` | P5 read |
| `PTPS` | PTP-typed activities | P5 read |
| `AUDIT` | `qdb_crmlogs` + native audit | P5 |
| `ORGS`, `ROLES`, `ROUTER_RULES` | `qdb_platformconfiguration`, CRM security roles | P5 |
| `MIS` | MIS service — **KI-53, transport pending** | P10 |
| `COMMS`, `TEMPLATES` | native fax/email, `qdb_communicationtemplate` | P7 |
| `DISPUTES`, `RESTRUCTURES`, `LEGAL_CASES`, `CLAIMS`, `APPROVALS` | none exist | P9 / P10 |
| `INTEGRATIONS` | `qdb_platformconfiguration` + sync run reports | P5 |

---

## G. HL / BFD context

| Requirement | Implementation |
|---|---|
| One workspace, two CRMs | Single app; `<OrgContext>` carries the active organisation code |
| System-of-record visible per row | `<OrgBadge>` on every case, PTP, communication and audit row — the prototype's rule, preserved |
| HL → Contact, BFD → Account | Resolved by `qdb_platformconfiguration.qdb_customerentity`; **React never hard-codes either** |
| Facility identity | MIS facility number + source system. **No frontend facility master** |
| Cross-org lists | Both organisations appear together, exactly as the approved banner states |

---

## H. Deviations from the approved baseline

Recorded per the instruction that any material visible deviation carries a reason.

| Deviation | Reason |
|---|---|
| Grids become virtualized and server-paged | The prototype renders a fixed mock array. At 100K rows the approved layout is unchanged, but the DOM must stay bounded |
| Badge counts hidden where no bounded count exists | A fabricated count is worse than none; the prototype's numbers were mock data |
| Copilot, and the Phase 6–10 commands, rendered **disabled with a tooltip** | Preserves the approved command bar without faking behaviour |
| Customer 360 Collateral / Guarantor / Insurance columns shown as *not yet sourced* | No canonical field exists; inventing one would be a schema change (P9) |
| Strategy rule builder present but disabled | Authoring is P8, and thresholds must never live in React |

*No token, colour, layout, navigation item, terminology or screen was changed for preference.*

---

## I. Coverage summary — as built

| | Count |
|---|---:|
| Views in the approved prototype | **21** |
| Views present in the React navigation | **21 (100 %)** |
| Views with a Phase 5 implementation bound to the router | **13** |
| Views preserved with a stated owning phase, showing no data | **8** |
| Shared components mapped | 31 |
| Design tokens preserved | 143 |
| Icons preserved | 63 |
| Mock collections re-pointed or phase-assigned | 22 |
| Elements silently dropped | **0** |

Enforced rather than asserted: `apps/web/src/shell/routes.ts` is the single source of navigation
truth, and `views.test.tsx` walks **every** Phase 5 view through the real application bootstrap and
fails if the router has nothing bound to it. That test was verified by removing a route on purpose
and confirming it failed. A separate test asserts the eight later-phase views each render a notice
carrying their owning phase.

---

## J. What each Phase 5 view actually does now

| View | Reads | Bounded by |
|---|---|---|
| My Day | open cases; three `$count` KPIs | the shared `DataGrid` |
| Work Queues | open cases across both organisations | the shared `DataGrid` |
| Collection Cases | cases, filtered by bucket, status, free text and organisation scope | the shared `DataGrid` — the phase's proving ground |
| Customer & Loan 360 | one customer's cases, their CRM record (contact or account), their facilities, their MIS snapshots | one bounded page of cases; the snapshot list is paged |
| Case Detail | one case; its activities, promises, snapshots and correlated log entries | each tab's own paged grid |
| Delinquency Intake | snapshots, identity exceptions, three `$count` KPIs | two paged grids |
| Segmentation Matrix | collection strategies and their criteria | paged |
| Strategy Rules | strategies and their actions; the rule builder, disabled | two paged grids |
| Action Plan | active strategy actions | paged |
| Promise to Pay | PTP-typed activities; four `$count` KPIs | paged |
| Dashboards | six `$count` KPIs, scoped by organisation | counts only, no rows |
| Audit Trail | `qdb_crmlogs`, the largest table in the organisation | paged, 100 at a time |
| Configuration | platform configurations, their field mappings, the resolved CRM session; four disabled commands | bounded by nature |

## K. What the eight preserved views show

Each keeps its navigation entry, its group, its icon and its place. Each renders a notice carrying
`data-owning-phase` and a sentence saying what it will do. **None renders data**, because none would
be real: Communication and Template Library (Phase 7); Disputes, Restructuring, Legal Hand-off and
Deceased & Claims (Phase 9, no entity exists for any of them); Portfolio MIS (Phase 10, blocked by
KI-53 — no MIS transport contract); Approvals (Phase 10, no entity exists).

---
