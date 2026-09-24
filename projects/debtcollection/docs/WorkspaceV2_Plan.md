# DCP Collection Workspace V2 — Plan and initial assessment

Branch `feat/dcp-workspace-v2` from `origin/main` @ `cf4e7642` (Phases 1–9). **Start 2026-09-24
13:03:04 +03 (Asia/Qatar).** Phase 10 not started. Reference:
`D:\QDB\Projects\Debt Collection Platform\collections-workspace-standalone-claude-design-responsive.html`
(a bundled design export: 1 template, 6 screens, inline styles, mock data).

---

## 1. The reference, analysed

| Area | What the reference does |
|---|---|
| Shell | Navy sidebar (232px, `#0F1B3D`) with brand block, grouped nav (*Work*, *Portfolio*) with count badges, user card at the foot. **<1180px** collapses to a 64px icon rail; **<860px** becomes an off-canvas drawer with scrim and burger |
| Header | White, sticky: breadcrumb, 22px H1, a search box, a filter icon, then a **tab strip repeating the navigation** |
| Tokens | Canvas `#EDF1F7`, surface `#FFF`, border `#D9E1EC`, dividers `#E6ECF5`/`#EDF1F7`, text `#0F1B3D`, muted `#5B6B8C`/`#66748F`, accent `#4F91E8`, link `#2A6FC9`, soft `#D2E5FC`; danger `#C0392B`/`#FBE9E7`, warning `#9A6410`/`#FDF3E0`, success `#2E7D5B`/`#E7F3EC`. Segoe UI, 12.5–13px body, 10.5–11px uppercase labels, radius 6 (controls) / 10 (cards) |
| Cases | KPI strip · command bar (navy primary *New action*, Log call, Capture PTP, Send reminder, Reassign, Export) · Split/Grid toggle · saved-view pills · bucket chips with counts · grid with priority flag, two-line case/customer cells, bucket pill, DPD, risk bar, SLA pill, next action · **split layout: list + preview + "Open full record"** · footer count and sort description |
| Customer 360 | Identity header (avatar, pills, QID/phone), stats strip, facilities "across both CRMs", contact-history **timeline**, sticky side column: dark *Recommended next action* card, Compliance and Eligibility panels |
| PTP | KPI strip, promises by due date with status bars |
| Strategy | Segmentation heat matrix (bucket × risk), rules in priority order |
| Workout & Exit | Exit-path cards with counts; open workout items |
| MIS | Portfolio KPIs, balance by bucket, roll rate, collector performance |
| Small screens | Grid rows become labelled cards |

**What makes it good and is kept:** a calm canvas with white cards and one navy accent; dense two-line
cells; semantic pills that pair a colour with text; a command bar that is a real bar; the split
list-and-preview for moving through work; a timeline for history; a sticky side column for "what next".

**What it gets wrong for DCP:** the tab strip duplicates the navigation; KPIs are decorative and
several are Phase 10 management measures; most colour-only signals (risk bar, priority flag) carry no
text; and much of its data is not something DCP has (§6).

### 1b. Second reference — `debt-collection-platform-standalone-latest.html` (19 Sep, added 13:15 +03)

Same design system (identical tokens and shell), but a far more complete product: **14 screens**,
role switching, modals, toasts, and a full case workspace. **It becomes the primary direction; the
first reference supplements it** (split list + preview; Customer 360 layout).

| Area | What it adds | V2 decision |
|---|---|---|
| Navigation | Groups *Work · Customer · Resolution · Control*, count badges, `title` tooltips when collapsed | **Adopt the grouping**, fed by the real route inventory (§8) |
| Header | Working search, role select, *Run batch* | Search **adopt**; role select **adopt** (V1's presentation-only role, not security); *Run batch* **omit** — the MIS batch is not officer UI |
| My Day | KPI strip · **"What needs you today"** list, each row with its own CTA · queue load | **Adopt the structure** on real counts: my work, awaiting assignment, PTPs due (real `ptpDate`), broken PTPs (real PTP status), advanced-process waits. *SLA breached* omitted (KI-101) |
| Case detail | Back link · avatar, name, bucket pill · **command row** · **stats strip joined to the header** · tabs in the same card · Summary = Customer and Facility key/value cards + a dark *strategy rule* next-action card · Actions as a **timeline** · Promises · Communication log · Workout · Audit | **Adopt as the Case Workspace V2 skeleton.** Next-action card = the real next planned strategy action. Communications tab shows the **real per-case communication history** (V1's tab still says Phase 7 — KI-135) |
| Case commands | Log action, Capture PTP, Send message, Propose restructure, Refer to Legal, Reassign, Register dispute, Flag deceased | **Keep** Log action, Capture PTP, Send message. **Omit** Propose restructure (parked), Refer to Legal (KI-109), Reassign (KI-100), Flag deceased (no confirmation process; review only on a QCB indication). *Register dispute* = Log action with the dispute type, if the dialog can take a preset type without changing it |
| Stats strip | Overdue, Outstanding, DPD, Risk, SLA | Arrears, balance, DPD, bucket, "Stored MIS position as of …". Risk and SLA omitted |
| Status pills | "Contact suppressed" | **Omitted** — no authoritative hold (KI-79); V1 shows native channel preferences, which are not a hold |
| Promises | Inline *Kept / Broken* | Transitions stay in the existing `PromiseDialog`, which applies the domain rules |
| Workout tab | Restructure, legal stages, insurance claim, dispute *Uphold / Reject* | Phase 9 cards and capability matrix only; **no** stage buttons, claims or uphold/reject (KI-109, KI-125, KI-131, KI-119) |
| Modals | 560px, title + subtitle, footer *Cancel* + primary | V1 dialogs are re-skinned to this frame through the token bridge; no behaviour change |
| Toast | Confirmation after an action | Adopt, for confirmations the server has already returned — never optimistic |
| Approvals, Dashboards & MIS, Administration with queue editing | — | Approvals and MIS are Phase 10 (omit); Administration = the existing Configuration view only |
| Invented data | 7 roles with permissions, queue SLAs, risk-based rules, warning letters, salary transfer | Not DCP; ignored |

**Scope change (recorded, baseline unchanged):** reviewing the second reference added **1.00 h**
to WP1. Original baseline **51.00 h**; revised forecast **52.00 h**; completion forecast unchanged.

---

## 2. V1 inventory — protected baseline

**Bootstrap:** `main.tsx` → `App` (builds one CRM session: context, `XrmCrmAdapter`, same-origin write
transport) → `CrmSessionProvider` → `RoleProvider` → `OrgProvider` → `Workspace` (hash router +
`AppShell` + `ViewHost`). Plain React 18, no UI library; own CSS (`tokens.css` `:root` themes plus
class-based components); single-file build (`vite-plugin-singlefile`) deployed as
`qdb_dcp_workspace.html`. Hash routes `#<view>/<recordId>/<tab>`.

| Route | V1 component | Services / data | V1 UX problems |
|---|---|---|---|
| `myday` | `MyDayView` | counts, case query | Tiles, little "what next" |
| `queues` | `QueuesView` → `MyWorkView` + `CasesView` | `operationalQueue`, `usePagedQuery` | Two stacked lists; buckets as buttons |
| `cases` | `CasesView` | `createCaseQuery`, `DataGrid` | Dense table, weak hierarchy, filters are selects |
| `case` (7 tabs) | `CaseWorkspaceView` | `retrieveCase`, activity/PTP/snapshot/audit queries, Action Plan, Phase 9 cards | Header carries no "what needs attention"; P7 badges on delivered tabs (KI-135) |
| `customer` | `Customer360View` | `loadCustomerAggregate` | Flat; no timeline |
| `intake` (manager) | `DelinquencyIntakeView` | MIS intake | — |
| `buckets` | `SegmentationView` | strategy config | — |
| `rules` (manager) | `StrategyRulesView` | strategy actions | Read-only |
| `actionplan` | `ActionPlanView` | strategy actions | — |
| `ptp` | `PromiseToPayView` | PTP query | — |
| `comms` | `CommunicationCenterView` (+ bulk) | communication services, bulk run driver | Large, dense |
| `disputes` / `legal` / `claims` | `WorkoutQueueView` | operational queue | — |
| `dashboards` | `DashboardsView` | counts | Partial by design |
| `audit` | `AuditView` | audit query | — |
| `admin` (manager) | `ConfigurationView` | configuration | — |
| `templates`, `restructure`, `mis`, `approvals` | `PendingView` | none | Pending / parked |

Dialogs: `ActivityDialog` (log / edit / complete / cancel), `PromiseDialog`, bulk run detail. Header
search box is **decorative** (no handler) — V1 debt, not fixed.

---

## 3. Reference vs V1 vs V2

| Area | Reference | V1 | **V2** | Decision |
|---|---|---|---|---|
| Shell | Navy rail, collapsible, drawer | Fluent-ish top bar + nav | Navy rail, **collapsible with tooltips**, drawer below 860px | Improve |
| Header | Crumb, title, search, **duplicate tabs** | Search (decorative), role/CRM pickers | Crumb, title, **working** search, refresh, version switch, user | Replace; **remove** the duplicate tab strip |
| Home | Cases-screen KPIs | My Day tiles | "What needs my attention": real counts only, links into the queue | Replace |
| Work Queue | Split + Grid, chips, views | Buckets + list | **Split list/preview + grid**, bucket chips, real counts, server paging | Improve |
| Cases | Grid | Grid | V2 grid, filter chips, active-filter count, clear all | Improve |
| Case Workspace | — (not in reference) | 7 tabs | Case header + attention strip + next action + tabs | Replace (highest priority) |
| Customer 360 | Identity, stats, facilities, timeline, side column | Flat | Reference layout on real data; side column shows the next planned action | Improve |
| PTP | KPIs + list | List | List with real counts only | Improve |
| Strategy | Heat matrix, rules | Matrix, rules | Real matrix and rules in the V2 style | Retain data, restyle |
| Workout | Exit paths with counts | Phase 9 queues and tab | Phase 9 capability matrix + queues; **no exit-path counts** | Retain behaviour, restyle |
| MIS | Management KPIs | Pending (P10) | **Not built** — Phase 10 | Remove |
| Statuses | Colour pills | Pills | One `StatusBadge`: icon + text + colour | Consolidate |
| Grids | Inline styles | `DataGrid` | One `V2DataGrid` on the shared `usePagedQuery` | Make reusable |

---

## 4. Runtime architecture

```
qdb_dcp_workspace.html  (one web resource, one build)
  main.tsx → App: one CRM session, one adapter, one transport, Role/Org providers
    └─ WorkspaceVersionRoot  ← resolves v1 | v2, owns the switch
         ├─ V1: existing Workspace (unchanged)
         └─ V2: <div class="dcp-v2"> V2Workspace   (inside an error boundary → falls back to V1)
                     └─ both call the same data/, services/, platform/, @dcp/domain
```

The boundary is presentation, routing and composition only. **No second session, adapter, transport
or service.** Both versions read the same hash (`#case/<id>/<tab>`), so switching keeps the record in
view — deliberate shared URL state, which makes side-by-side comparison exact.

## 5. Version switch

- **Resolution order:** explicit URL value → saved preference → **V1**. The URL value is read from
  `?ui=` **or** from Dynamics' supported pass-through `?data=ui%3Dv2`. Adding arbitrary parameters to
  `main.aspx` is known to fail (500); `data=` is the documented route, and the inner frame's own query
  works for testing.
- **Persistence:** `localStorage` key `dcp.workspaceVersion`, every access in `try/catch`. Not
  Dataverse, not any business record.
- **Visible switch:** a small *Workspace V1 · V2* control in each shell. Switching re-renders in
  place — no reload, no redeploy.
- **Safe default:** unknown, invalid, missing or unreadable → **V1**. V2 render failure → error
  boundary shows V1 with a one-line notice. V2 is never promoted automatically.

## 6. Reference features NOT backed by DCP — omitted

| Reference feature | Why |
|---|---|
| Risk grade x/10, risk bar, priority flag, segment "Retail + SME" | No such fields in DCP |
| SLA "hours left / over" | TAT start undefined (KI-101); due dates are not invented |
| Contact rate, kept rate, broken this month, portfolio at risk, collected, roll rate, collector performance | Phase 10 management KPIs |
| Exit-path counts (cured/restructured/legal/insurance) | Restructuring parked, insurance deferred; cured counts are reporting |
| "Collection paused", "Contact suppressed", "Filed at court", "credit life verified" | Invented effects (KI-119, KI-124/127, KI-125) |
| Compliance panel: contact window, contacts this week | No authoritative source (KI-79) |
| Eligibility: restructure eligible, second PTP blocked, fee waiver | No such policy in DCP |
| *Start action / Override* on a recommendation | No override capability; V2 shows the next **planned** action and routes to Log action |
| *Call customer*, *Send reminder*, *Reassign*, *Export* | No telephony; reminders are the Communication Centre; officers cannot receive ownership (KI-100); export is Phase 10 |
| Collateral, rate, tenor, guarantor, KYC, "customer since" | Not in the DCP model |
| Warning letters | Out of scope |

## 7. V1 protection and CSS isolation

- V1 files change only where unavoidable: `App.tsx` (render the version root instead of `Workspace`
  directly) and one small version control in V1's header. No V1 component, class or style is edited.
- All V2 CSS is under **`.dcp-v2`**; V2 tokens are `--v2-*` on `.dcp-v2`, never `:root`. V2 uses its
  own `v2-` class namespace.
- **Token bridge:** inside `.dcp-v2` only, V1's variables (`--primary`, `--surface`, `--border`, …)
  are redefined to V2 values, so reused V1 leaf components (dialogs, bulk flow) take the V2 palette
  without being copied or edited. Outside `.dcp-v2` nothing changes.
- V1's few global rules (`*`, `body`, `h1–h4`, `a`, `button`) are neutralised inside `.dcp-v2`.
- Guards: every V2 selector must start with `.dcp-v2`; no V2 file may declare `:root`; V2 components
  may use only `v2-` classes except the approved reused leaves; V1 renders byte-identical markup with
  the version root in place.

## 8. Information architecture and navigation (from the real route inventory)

| Group | Items (V2 route → shared route) |
|---|---|
| Work | **Home** (`myday`), **Work Queue** (`queues`), **Cases** (`cases`), **Promise to Pay** (`ptp`) |
| Customer | **Customer 360** (`customer`) — reached from a case or a search; not a list |
| Engagement | **Communications** (`comms`, incl. bulk) |
| Advanced processes | **Disputes**, **Legal**, **Deceased review** (`disputes`, `legal`, `claims`); Restructuring shown *Parked* |
| Strategy | **Action Plan**, **Segmentation**, **Strategy Rules** (manager) |
| Oversight | **Audit trail**; Dashboards only as the existing partial view |
| Admin | **Configuration**, **Delinquency Intake** (manager) |

Pending/parked items (`templates`, `mis`, `approvals`, `restructure`) are not given V2 pages; the nav
shows Restructuring as *Parked* and omits Phase 10 items rather than advertising them.

## 9. Case Workspace V2

```
CASE HEADER     customer · case no. · facility · source system · owner · state · episode
POSITION        DPD · bucket · arrears · balance · "Stored MIS position as of <date>" (never "live")
ATTENTION       real signals only: open work count, next planned action, open PTP, advanced-process
                waits (Legal/Deceased/Dispute), communications hold where authoritative
COMMAND BAR     Log action · Capture PTP · Send message (existing Communication Centre) · Customer 360
TABS            Overview · Action Plan · Activities · Promise to Pay · Communications ·
                Delinquency history · Workout & Legal · Audit
```

Overview = position + attention + next planned action + a short activity timeline.

## 10. Design system

`v2/theme/tokens.css` (scoped): colour roles from §1 mapped to *primary, accent, canvas, surface,
navigation, border, divider, text, text-muted, success, warning, danger, info, hover, selected, focus,
disabled*; type scale 11 / 12 / 13 / 14 / 16 / 20; spacing 4-pt (4–32); control heights 28 / 32 / 36;
radius 4 / 6 / 10; two shadows; nav 232 / 64; z-layers nav 50, overlay 60, dialog 70. Focus ring
2px accent. Bucket palette from the reference.

## 11. Components

**New, V2-only:** `V2Shell`, `V2Nav`, `PageHeader`, `CommandBar`, `SearchBox`, `FilterChips`,
`StatusBadge`, `MetricTile`, `V2DataGrid`, `EmptyState`, `ErrorState`, `LoadingSkeleton`, `Section`,
`SummaryField`, `Tabs`, `CaseHeader`, `PositionStrip`, `AttentionList`, `ActivityTimeline`,
`VersionSwitch`.

**Reused unchanged (shared, presentation-neutral):** every `data/*` query module, `usePagedQuery`,
`useConcludability`, `useAdvancedProcessEvidence`, `services/*`, `platform/*`, `@dcp/domain`.

**Reused V1 leaves, restyled through the token bridge:** `ActivityDialog`, `PromiseDialog`,
`CommunicationCenterView`/`BulkCommunication`/`BulkRunDetail`, Phase 9 cards and panel,
configuration/intake/strategy views. These carry business rules; copying them would fork behaviour.

## 12. Shared by V1 and V2 — will NOT change

Domain model · API contracts · Dataverse adapters and write transport · MIS pipeline and authority ·
authentication · CRM-native security · Rule Engine and strategy automation · assignment and escalation
semantics · activities, outcomes and the KI-131 rule · PTP (activity, not an entity) · communications
(Fax/Email, no `qdb_communication`), bulk runs and their idempotency · deterministic ids · provenance
(`qdb_strategyactionid`, "Not recorded — predates provenance") · advanced-process contracts and every
fail-closed boundary · error interpretation (`dataverseErrors.ts`, KI-129) · paging, continuation and
stale-response suppression · no schema, entity, role or plugin change.

## 13. Accessibility, responsive, performance

- **A11y:** landmarks; nav as `nav` with `aria-current`; icon-only buttons named; collapsed-nav
  tooltips; visible focus; tab list semantics; dialogs keep their existing focus handling; statuses
  are text + icon + colour; contrast checked against the tokens.
- **Responsive:** desktop first; ≥1180 full nav; 860–1179 icon rail; <860 drawer. Grids scroll
  horizontally inside their card; no mobile card mode.
- **Performance:** V2 adds CSS and components only; lists stay server-paged and virtualised through
  `usePagedQuery`; no full-portfolio load; no animation library; no new runtime dependency. Bundle-size
  delta measured at closure.

## 14. Deployment and browser plan

Same web resource, same deploy script; the artefact contains both versions. Validate `?ui=v1`,
`?ui=v2` on the inner frame and `data=ui%3Dv2` on `main.aspx`, the visible switch both ways, refresh
persistence and invalid-value fallback — then a V2 matrix over every screen and a V1 smoke. DEMO and
owned synthetic fixtures only; ARR read-only; System Administrator evidence labelled as such.

## 15. Work packages and estimate

| WP | Scope | Est. h |
|---|---|---|
| WP1 | Reference analysis + V1 inventory (this document) | 1.50 |
| WP2 | Version resolver, switch, persistence, fallback, error boundary | 2.00 |
| WP3 | V2 tokens, scoped CSS, token bridge, isolation guards | 2.50 |
| WP4 | V2 shell + navigation (collapsible, drawer, search, user) | 3.00 |
| WP5 | Home — operational landing | 2.00 |
| WP6 | Work Queue (split + grid) | 2.50 |
| WP7 | Cases | 2.00 |
| WP8 | Case Workspace | 5.00 |
| WP9 | Customer 360 | 2.50 |
| WP10 | Action Plan + Activities | 2.50 |
| WP11 | PTP | 1.50 |
| WP12 | Communications + bulk | 2.50 |
| WP13 | Advanced processes | 1.50 |
| WP14 | Reusable primitives: grid, statuses, forms, dialogs, loading/empty/error | 2.50 |
| WP15 | Strategy, audit, configuration, intake, dashboards in V2 | 3.00 |
| WP16 | Accessibility, responsive, performance hardening | 2.50 |
| WP17 | V1/V2 regression + automated tests | 3.00 |
| WP18 | Cloud deployment + browser QA | 4.00 |
| WP19 | Documentation + closure | 2.00 |
| | Debugging allowance | 3.00 |
| | **Baseline** | **51.00** |

**Expected completion: 2026-09-26 18:00 +03.** Browser QA depends on the verified Chrome profile
being available; any wait is recorded as blocked time.

**Assumptions:** no new dependency; `org5869857f` only; DEMO fixtures; Phase 9 baseline 2,027 holds.
**Risks:** V1 global CSS leaking into V2 (mitigated by resets and guards); reused V1 leaves looking
inconsistent (token bridge); `main.aspx` parameter handling (use `data=`); single-file bundle growth.
