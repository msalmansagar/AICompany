# DCP Collection Officer UX Simplification — WP1 Current UX & Navigation Audit

Date: 2026-10-06 · Branch `feat/dcp-workspace-parity` @ `8daf9347` · Read-only audit, **no UI changed**.
Paths are relative to `apps/web/src/`.

**Evidence basis.** Every count and finding below was traced from source code (route table, handlers,
hash builders, dialog state). Key findings were spot-checked by hand (V1 header search, V1 case
Communications tab, follow-up filter, `go()` early return, dialog `onSaved`). **No live browser
click-through was performed for WP1** — counts are code-traced, not stopwatch-measured. Screenshots
are deferred to WP2 so before/after can be captured in one session on the same data.

Conventions for click counts: one count = one click/selection that changes screen or opens/submits
something. Typing and required form fields are counted separately as "+ fields". Lists default to
**Split** layout (`data/layoutPreference.ts:9`), so opening a record from a list = select row + Open.

---

## 1. Current navigation map

Hash grammar: `#view[/recordId[/tab]]` (`shell/useHashRoute.ts:29-39`). `go()` assigns
`location.hash` → every move is a browser-history entry; `go()` is a no-op when the hash is unchanged
(`useHashRoute.ts:53`). Unknown view → `myday`.

```
Header  V1: [☰] title | search (DEAD — no handler, AppShell.tsx:80-83) | Role | CRM scope (Both/HL/BFD) | avatar
        V1 command bar: Refresh · Log action* · Capture PTP* · Send message(disabled) · Escalate(disabled) · Workspace V2
                        (* navigate to the case tab, do not open the form)
        V2: [☰] breadcrumb+title | search (WORKS → #cases) | CRM scope | Role | Refresh | V1/V2 switch

Left nav (shell/navigation.ts — identical words in V1 and V2)
  Workspace     My Day · Work Queues · Collection Cases
  Customer      Customer 360
  Collection    Action Plan · Promise to Pay · Communications
  Resolution    Disputes · Legal Hand-off · Deceased Review
  Strategy & Oversight (manager, rm)  Portfolio & Strategy · Dashboards · Approvals(pending)
  Control (manager)                   Audit Trail
  Administration (manager)            Delinquency Intake · Strategy Rules · Configuration

Contextual (never in nav): case (#case/<id>/<tab>), comms/<caseId>, comms/bulk[/<runId>]
Not offered: templates, mis (pending), restructure (parked)
```

## 2. Collection Officer route inventory

| Route | Hash params | V1 component | V2 | Officer does work here? |
|---|---|---|---|---|
| myday | – | `MyDayView` (`views/index.tsx:304`) — tiles + follow-ups + embedded full CasesView | native `V2HomePage` | No (navigate only) |
| queues | V2 `#queues/<bucket>` | `QueuesView` = `MyWorkView` + 2nd CasesView (`index.tsx:455`) | native `V2QueuePage` | No |
| cases | V1 `#cases/scope/…`, V2 `#cases/filter/…` | `CasesView` | native `V2CasesPage` | Yes via preview (Log/PTP; V2 + Send message) |
| case | `#case/<guid>/<tab>` | `CaseWorkspaceView` (tabs: summary, actions, ptp, comms, documents, workout, audit) | native `V2CasePage` (overview, plan, actions, ptp, comms, history, workout, audit) | **Yes — primary** |
| customer | `#customer/<businessId>`; none = list | `Customer360View` / `CustomersView` | `V2CustomerPage` (shared C360) / `V2CustomersList` | Yes (Log action, PTP per unit) |
| actionplan | – | `strategyViews.tsx:378` | bridged V1 | No (read-only strategy actions) |
| ptp | – | `PromiseToPayView` (`operationsViews.tsx:157`) | native `V2PromisesPage` | Via preview (Log/PTP) |
| comms | `#comms/<caseId>`, `#comms/bulk[/<runId>]` | `CommunicationCenterView` | bridged V1 | Yes (send; bulk) |
| disputes / legal / claims | – | `WorkoutQueueView` (= MyWorkView on one bucket) | `V2Disputes/Legal/DeceasedPage` (fixed bucket) | No (forward to case) |
| dashboards, buckets | – | manager/rm | native | Oversight |

Role gating is presentation only (`routes.ts:129-140`); any route opens by URL.

## 3. Current My Day journey

- **V1** (`index.tsx:304-348`): 8–9 KPI tiles, **none clickable** (`primitives.tsx:60-72`); Follow-ups panel
  (Overdue default / Upcoming / All, grid, only the Case-number cell is a link); then a full embedded
  Cases list. No "My queues" panel.
- **V2** (`V2HomePage.tsx`): tiles — My open work → `#queues/MyAssigned`; Cases → `#cases` (**officer's
  "My open cases" tile lands on All cases**); Promises due → `#ptp`; follow-up tiles **not clickable**.
  My queues panel (7 buckets + Promises due + Broken → both go to unfiltered `#ptp`). Follow-ups panel,
  whole row clickable.
- **Defect-level finding: follow-ups are not the officer's.** `buildFollowUpFilter`
  (`data/followUpQueries.ts:45-63`) has no owner clause — every officer sees every follow-up in scope.
- Follow-up row → `#case/<id>` on Summary/Overview; **no tab, no activity id** — officer must re-find the
  activity on the case.
- No way to complete a follow-up, contact the customer, or capture a PTP from My Day.

## 4. Current Collection Case journey

- **V1**: header has **no back button**, only "Customer 360". Tabs are local state (not in URL → refresh
  loses tab, Back skips tabs). Communications and Documents tabs are **placeholders** — the V1 case
  cannot send a message. Command-bar Log action / Capture PTP only switch tabs, and **silently do
  nothing** when the hash already equals the target tab (V1 tab clicks never update the hash;
  `go()` early-returns).
- **V2**: header "← Cases" + command bar (Log action, Capture PTP, Send message → comms tab, Customer
  360). Tabs are in the URL (each tab = a history entry). Comms tab embeds the real V1 composer.
- **Both**: after a successful save on the case screen the side pane **stays open** (`onSaved` only
  reloads — `CaseWorkspace.tsx:301,357`, `V2CasePage.tsx:77,139,147`); officer closes it manually.

## 5. Current Customer 360 journey

- Case → C360: 1 click, `#customer/<MIS business id>`; no search/reselection needed.
- C360 **does not know the originating case** — preselects the first unit (`Customer360.tsx:70`), so a
  multi-case customer may open on a different case.
- C360 → case: per-unit "Open case" (`#case/<id>`), "Open Action Plan" (V1 `actions` / V2 `plan`).
- No "back to case" control; browser Back only. From a case reached via C360, V2 "← Cases" goes to the
  Cases list, not C360.
- C360 can work: header "+ Log action" (case picker when >1 open case), per-unit Log action / Capture
  PTP — all via canonical `CaseCommandDialogs`.

## 6. Action Plan journey

- Nav "Action Plan" = list of **active strategy actions** (portfolio configuration), 4 KPIs always "—",
  row → read-only 16-field side pane, "Show cases on this strategy" → `#cases/scope/strategy=…`.
  **Not a per-case or per-officer work list; performs no work.**
- The per-case plan lives on the case: V1 Actions tab (below activities), V2 Plan tab + Overview "Next
  planned action". V1 plan does not refresh after Log action (`CaseActionPlan` ignores `reloadKey`).

## 7. PTP journey

- Captured: case (tab button; V2 header), Cases/PTP previews, C360 per unit — all one `PromiseDialog`.
- Reviewed/edited: **only** on the case PTP tab (row → edit). Lists cannot edit.
- V1 PTP list: no filters; Grid row → case **Summary** (+1 to PTP tab); Split preview read-only.
- V2 PTP list: status chips; row → `#case/<id>/ptp`; preview shows the case's **latest** promise, not the
  selected row (`CasePreview.tsx:128-160`); page ignores incoming request (Broken → unfiltered).

## 8. Communication journey

- One composer: `CommunicationCenter.tsx` `Composer` → `CommunicationService.send`. Channels offered:
  SMS, Email (`:41-44`). History labels SMS/WhatsApp via `channelOfMessage`.
- **V1**: send only at `#comms/<caseId>`; reached via nav → embedded "Choose a case" CasesView → row.
  Case tab placeholder contradicts `routes.ts:66` ("SMS and email are sent from a case").
- **V2**: same composer embedded in the case Comms tab. "One customer / Bulk" pivot inside it can
  navigate away to `#comms/bulk`.
- **Call**: no call/tel action anywhere; phone numbers are plain text (`CaseOverview.tsx:55-57`).
- **Technical leak**: `messagingConfiguration.ts:117` error text contains "(fax or letter)" + raw table
  name, displayed at `CommunicationCenter.tsx:171`. "Official letter" is a configuration channel label
  (`schema.ts:449`) — business term, acceptable. Other fax/letter occurrences are code/data attributes.
- Two history readers: case (`communicationHistoryQueries.ts`) and customer (`customerHistoryQueries.ts`).

## 9. Complaint / Dispute journey

- Complaint: only on case → Workout & Legal → `RaiseComplaintCard` → `CreateComplaintPane` (POST
  Integration Service `/collection-cases/{id}/complaints` → Case Management case; result link).
  **HL cases only** (`CreateComplaintPane.tsx:25`, `complaintService.ts:73-75`) — the programme says BFD
  collection cases also go to BFD Case Management, so BFD has no path today.
- Dispute: no dedicated control; logged through Log action with a dispute activity type.
- Disputes nav = Work Queue on the Disputes bucket; its intro text says complaints are raised by Case
  Management and "listed under Complaints" — contradicts the button; Complaints is only a queue bucket.
- Card sits below up to four other cards on the Workout tab.

## 10. Legal journey

- **No Legal hand-off can be initiated anywhere** — deliberate (`legalTraceCard.tsx:20-22`; empty
  policy `caseLegalTraces.ts:20-28`; command omitted `App.tsx:235-239`; KI-108/109: no HL→BFD account
  resolution, qualification unconfigured).
- Case Workout tab shows read-only `qdb_qdblegal` traces (hidden when none).
- Nav "Legal Hand-off" = queue on the Legal bucket, named after an action officers cannot take.

## 11. Deceased journey

- Start: case → Workout & Legal → "Record deceased review" — **one-click write, no confirmation**, only
  when an indication exists and a review can start.
- Continue: **no control**; open review shows a "stays open until QDB configures…" banner; only path is
  the Activities tab as an ordinary activity.
- Nav "Deceased Review" = queue on that bucket; row opens the case on Summary (+1 to Workout).

## 12. Click-count baseline (code-traced)

| # | Journey | Start | V1 | V2 | Context lost / problems |
|---|---|---|---|---|---|
| A | Complete overdue follow-up | My Day | **6** + outcome field: case-no. cell (1) → Actions tab (2) → find row (3) → Complete… (4) → Complete activity (5) → close pane (6) | **6** + outcome: row (1) → Activities tab (2) → row (3) → Complete… (4) → Complete (5) → close (6) | Lands on Summary not Actions; activity id not carried; officer re-finds the row (no follow-up filter on case) |
| B | Contact customer (SMS) from My Day | My Day | **≥5** + search + template: nav Communications (1) → search case (typing) → select row (2) → (open) (3) → Send (4); case cannot be used — phone number is the only thing on screen | **4** + template: follow-up row (1) → Send message (2) → Send (3); call = not possible | V1: case re-selected in a second list; Call has no action in either |
| C | Log collection action | My Day | **5** + 2 fields: case cell (1) → Actions tab or cmd bar (2) → Log action (3) → Save (4) → close (5) | **4** + 2 fields: row (1) → Log action (2) → Save (3) → close (4) | V1 cmd bar may silently no-op |
| D | Capture PTP | My Day | **5** + 2 fields (as C via PTP tab) | **4** + 2 fields | – |
| E | Review existing PTP | My Day | read-only **2** (nav PTP → row); to edit **5** (+ Open case → Summary → PTP tab → row) | **4** (Promises tile → row → Open → row) | V1 lands on Summary; V2 preview may show a different promise |
| F | Open Customer 360 | case | **1** (from My Day **2**) | **1** (from My Day **2**) | C360 preselects first unit, not the originating case; no way back except browser |
| G | Review communication history | case | **3** + search (nav Comms → find case → open); from My Day **5** | **1** (Comms tab) | V1 dead-end tab; case re-selected |
| H | Create complaint (HL only) | case | **4** + 1 field; from Disputes nav **7** | same | BFD cases: not possible; Disputes queue text contradicts |
| I | Initiate Legal hand-off | – | **not possible** (Legal nav → row → Open → Workout = read-only trace, 4 clicks) | same | Nav label promises an action |
| J | Start / continue Deceased Review | case | start **2** (no confirmation); from nav **5**; continue: no control | same | Nav → case lands on Summary |
| K | Completed item → next item | case | **≥3**: browser Back (1 per tab visited) → list reloaded at page 1, selection/scroll lost → re-find → open | **≥2–3**: "← Cases" goes to Collection Cases even when the case came from My Day/queue | **No next-item concept anywhere** |
| L | Find case from search | any | header search **dead**; Cases list searches case no./customer id only; by name: **4** + typing via Customer 360 | **2** + typing (header search + Enter → Open full record; +1 if not first) | V2 search drops the current filters |

Headline: the five target operations from the case are already **1–4 clicks in V2** but **every
journey that starts at My Day lands on the wrong tab**, every save needs a manual close, V1 cannot
contact from the case, and moving to the next item has no support at all.

## 13. Duplicate functionality

| Capability | Places | Canonical |
|---|---|---|
| Log action | case tab + V2 header; V1 cmd bar (navigates); Cases previews V1/V2; PTP previews; C360 header + per unit | `ActivityDialog` (via `CaseCommandDialogs`) — **single implementation, keep** |
| Capture PTP | same set (not C360 header) | `PromiseDialog` — **single, keep** |
| PTP list | `PromiseToPayView` (V1) vs `V2PromisesPage` | **two builds that behave differently** |
| Send message | V1 `#comms/<id>`; V2 case tab; V2 preview → case comms | `Composer` in `CommunicationCenter.tsx` — single, but not exported as a component |
| Comms history | case reader vs customer reader | two readers by grain (justified) |
| Customer preview | `CustomerPreview` (`previews.tsx:139`) vs `V2CustomerPreview` | duplicate builds |
| Case preview | V1 `CasePreview`/`WorkItemPreview` vs V2 `CasePreview` vs V2 `QueuePreview` | three builds; only V2 Cases preview has actions |
| Work queues | Disputes/Legal/Deceased nav = Work Queue buckets = V2 Home "My queues" | one queue, three entrances |
| Case picking | Cases list; Comms "Choose a case" embeds a second CasesView; My Day embeds a third (V1); Queues embeds a fourth (V1) | `CasesView` reused 4× in V1 |
| Complaint / legal trace / deceased | `WorkoutLegalTab` only (shared V1/V2) | single |

## 14. Unnecessary navigation

1. My Day / queue / PTP / resolution rows open the case on **Summary**, then the officer clicks the tab
   the row was about (follow-up → Actions, PTP → PTP (V1), Disputes/Legal/Deceased → Workout).
2. V1 Communications: leave the case, re-find it in another list.
3. V1 command bar "Log action"/"Capture PTP" navigate to a tab instead of opening the pane.
4. Manual close after every successful save.
5. Return to list via browser Back, one press per tab visited (V2 tabs are history entries).
6. Resolution nav entries are a second door to Work Queue buckets.
7. Action Plan nav entry is strategy configuration, not officer work.
8. V1 Work Queues and My Day each stack a second full Cases list below their own list.

## 15. Context-loss points

| State | V1 | V2 My Day | V2 Queue | V2 Cases |
|---|---|---|---|---|
| Originating list | lost | lost | lost | sessionStorage `dcp.v2.cases.return` (filters only) |
| Filter / bucket | lost (dashboard scope kept in URL) | window resets to Overdue | bucket kept (URL); search lost | URL filters kept; search, status, owner, sort lost |
| Current item | lost (first row auto-selected) | n/a | lost | `dcp.v2.cases.selected` |
| Continuation / page | lost | lost | lost | lost |
| Scroll | lost | lost | lost | lost |
| Case tab | lost on refresh (not in URL) | – | – | kept (URL) |
| Customer → case | C360 forgets originating case | | | |

Defects found: (a) `dcp.v2.cases.return` is never cleared by My Day/Queue, so "← Cases" can restore a
stale filter from earlier in the session; (b) the recalled selection is not cleared when filters change,
so the Split preview can show a case not in the current list.

## 16. Reusable components (for WP3/WP4)

| Need | Component | Inputs | Embed as |
|---|---|---|---|
| Log action | `views/ActivityDialog.tsx` | `mode, caseId, activityId?, onClose, onSaved, contextNote?` | side pane (already) |
| Capture PTP | `views/PromiseDialog.tsx` | `mode, caseId, promiseId?, onClose, onSaved` | side pane (already) |
| Complete follow-up | `ActivityDialog` edit mode → "Complete…" (`:446-461`) | `caseId + activityId` | side pane opened **directly in complete mode** — needs only an entry point carrying the activity id |
| Contact (SMS/Email) | `Composer` / `CaseCommunications` in `CommunicationCenter.tsx:124,191` | `caseId` | extract to an exported component → side pane or inline Comms tab (V2 already inline) |
| Create wrapper | `views/CaseCommandDialogs.tsx` | `caseId, dialog` | already reused by 5 callers |
| Complaint | `CreateComplaintPane.tsx` | `caseId, onClose` | side pane (already) |
| Deceased | `deceasedReviewCard.tsx` `startReview` | case | inline card; needs a confirm step |
| Side pane | `components/forms.tsx` `Dialog` | – | right-docked; no Escape handler |
| Case read model | `data/useCaseRecord.ts`, `useNextAction.ts` | `caseId` | shared |
| Preview | V2 `CasePreview.tsx` | case | basis for a single preview |

## 17. Current Case Workspace capability

Already on the case: header facts (status, bucket, arrears, DPD, as-of), customer + facility cards with
mobile/phone/email, next planned action, recent activity, activities + edit/complete, promises +
edit, action plan, delinquency history, comms composer + history (V2 only), workout & legal (complaint
HL, legal traces, concerns, deceased), audit, Customer 360 link.
Missing for the target: Call action; follow-up-aware entry (open/complete a specific activity); close-on-
save; a return/next model; V1 comms; BFD complaint path; legal initiation (business-blocked).

## 18. API / read-model dependencies

- V1 case load: 1 (`retrieveCase`); tabs lazy (Actions = 1 + plan 3; PTP 1; Audit 1).
- V2 case load ≈ 6: case → customer (sequential, `useCaseRecord.ts:40-42`), plan (3), recent activity (1).
  Plan tab re-reads plan (3, uncached). Every save re-reads case, customer, plan, recent activity.
- V2 Comms tab ≈ 6+: **re-reads case and customer** (`CommunicationCenter.tsx:139,153`), hold policy,
  messaging config (2), templates, history pages.
- **Workout & Legal tab ≈ 20–22 requests**: `loadActivityTypes` uncached ×~8, `loadOutcomes` ×~6,
  integration endpoint ×2, plus legal/concern/deceased reads. Not per-row N+1 (summaries are batched)
  but the same configuration questions re-asked — a **catalogue cache** is the fix, and it is the main
  read-model risk once more panels sit on one surface.
- Lists: server paging + opaque continuation bound to query fingerprint, `usePagedQuery` stale-response
  sequence, `VirtualizedRows`, `$count` per tile, FetchXML aggregates, 300 ms debounce (V2). Large-data
  rules are already met.

## 19. V1 / V2 differences

V1 is the **default** (`v2/version/workspaceVersion.ts`); V2 falls back to V1 on render error.

| Area | V1 | V2 |
|---|---|---|
| Header search | dead | works (→ Cases) |
| Tiles | not clickable | partly clickable |
| Case tabs | local state | URL |
| Case back | none | "← Cases" (always Cases) |
| Case comms | placeholder | real composer |
| Command bar | navigates to tab | opens pane |
| Cases search | case no. / customer id | + customer name, facility |
| Cases sort | fixed DPD desc | 6 presets |
| Queue bucket | React state | URL |
| PTP row target | Summary | PTP tab |
| Plan tab id | `actions` | `plan` (V1 falls back to Summary on a `plan` link) |
| Return state | none | `dcp.v2.cases.return`, `.selected` |

## 20. Role / navigation findings

- Officer and Legal roles see the identical 10-item nav. RM adds 3; manager adds 7.
- Role is a header picker, default `officer`, **not persisted and not derived from CRM roles** even though
  `securityRoleIds` are read (`platform/crmContext.ts:133`). Presentation only — correct, CRM RBAC
  authoritative.
- **"Both CRMs" scope picker** in both headers (default `all`, not persisted, not derived from the
  deployed org; `context.tsx:85-93`). The code has **no org-level HL/BFD detection** — type is decided
  per record (customer lookup annotation; `financialUnit.ts` from source-system code). V1 Cases always
  shows a "both CRMs appear together" banner. Org codes are hard-coded in three places
  (`context.tsx:83`, `v2/data/portfolioMatrix.ts:88`, `views/index.tsx:204`). This conflicts with the
  programme's deployment rule and is the cloud sandbox's demo arrangement (one org holds DEMO-HL and
  DEMO-BFD configs).

## 21. Proposed final officer navigation

```
Workspace   My Day (primary) · Work Queues · Collection Cases
Customer    Customer 360
(officer, collapsed "More" or removed after migration)
            Promise to Pay (list = queue view) · Communications → Bulk only (manager)
Resolution  — moved into the case Workout area; Disputes / Legal / Deceased stay as Work Queue buckets
Manager/RM  unchanged + Action Plan moves to Strategy & Oversight
```

| Nav item | Classification |
|---|---|
| My Day | KEEP PRIMARY |
| Work Queues | KEEP PRIMARY |
| Collection Cases | KEEP PRIMARY |
| Customer 360 | KEEP PRIMARY (entry for customer search) |
| Action Plan | KEEP ROLE-SPECIFIC (manager/rm — strategy configuration); per-case plan already MOVE INTO CASE |
| Promise to Pay | QUEUE ONLY (becomes a queue/bucket view; capture/review MOVE INTO CASE); HIDE AFTER MIGRATION for officers |
| Communications | MOVE INTO CASE (single); Bulk = KEEP ROLE-SPECIFIC; HIDE AFTER MIGRATION for officers |
| Disputes | QUEUE ONLY (already a bucket); creation MOVE INTO CASE; HIDE AFTER MIGRATION |
| Legal Hand-off | QUEUE ONLY (read-only traces); HIDE AFTER MIGRATION; rename if kept ("Legal referrals") |
| Deceased Review | QUEUE ONLY; action MOVE INTO CASE; HIDE AFTER MIGRATION |
| Portfolio & Strategy, Dashboards | KEEP ROLE-SPECIFIC |
| Approvals | KEEP ROLE-SPECIFIC (pending screen) |
| Audit Trail | ADMIN ONLY |
| Delinquency Intake, Strategy Rules, Configuration | ADMIN ONLY |
| templates, mis, restructure | REMOVE / DEAD (already not offered) |
| V1 header search | REMOVE / DEAD unless wired (wire to V2 behaviour) |
| CRM "Both" scope picker | HIDE AFTER MIGRATION in production (derive from deployed org; keep as sandbox/dev control) |

## 22. Proposed Collection Case composition (drives WP3)

```
Header      ← Back to <origin>   Customer · Case · Loan Account/Facility · badges · arrears · DPD · as-of
            Quick actions: Call · SMS · WhatsApp* · Email · Log action · Capture PTP · Customer 360   [Complete & Next ▸]
Left/main   Work panel: open follow-ups for this case (with Complete) · Next planned action · Recent activity
Tabs        Overview · Activities · Promises · Communications · Action Plan · History · Resolution (Workout & Legal) · Audit
Side pane   one at a time: Log action / Complete follow-up / PTP / Message / Complaint / Deceased confirm
Customer    C360 opens as a side pane or keeps "← Back to case <id>" with the originating case preselected
```
*WhatsApp shown only where the org's messaging configuration offers it (HL: not yet).
Resolution actions (complaint, deceased, legal traces) stay in one tab, below the fold of the normal flow.

## 23. Proposed quick-action composition (drives WP4)

| Quick action | Reuse | Change needed (UI only) |
|---|---|---|
| Call | none today | `tel:` link on the mobile/phone + "Log call outcome" opening `ActivityDialog` with a call activity type preselected (contextNote) |
| SMS / Email (WhatsApp later) | `Composer` | export it, open in side pane with channel preselected; V1 gets it for the first time |
| Log action | `ActivityDialog` | close on save + toast |
| Capture PTP | `PromiseDialog` | close on save + toast |
| Complete follow-up | `ActivityDialog` edit → Complete | open directly in complete mode from a follow-up row (My Day and case work panel) |
| Customer 360 | existing route | carry originating case id; preselect that unit; back link |

## 24. Proposed context-preservation model (drives WP5)

A `WorkContext` provider above both versions (beside `OrgProvider`, `App.tsx:98-102`), mirrored to
sessionStorage:

```
{ origin: { view, recordId?, filterHash, bucket?, window?, sort?, search? },
  items: [caseId…]  (ids of the currently loaded page(s) only — bounded, no extra fetch),
  index, continuation (opaque, as already issued by usePagedQuery), scrollTop }
```
- Every list (My Day follow-ups, queue, cases, PTP, resolution queues) registers itself when it opens a
  case; the case header renders "← Back to <origin label>" and "Next ▸ (n of m)".
- Next beyond the loaded page fetches the next page with the stored continuation (server-side, bounded).
- Stale-return defects (§15) are fixed by construction: the origin is written by whoever opened the case.
- Deep links (`#case/<id>/<tab>`) carry the right tab: follow-up → actions + `?activity=<id>`-style
  third segment, PTP → ptp, resolution queue → workout.

## 25. Expected click reduction (targets to verify in WP6)

| Journey | Today V1 / V2 | Target |
|---|---|---|
| A complete overdue follow-up | 6 / 6 | **2** (row → Complete in pane → saved, pane closes) |
| B contact customer (SMS) | ≥5+search / 4 | **3** (row → SMS → Send) ; Call **2** |
| C log action | 5 / 4 | **3** |
| D capture PTP | 5 / 4 | **3** |
| E review PTP | 5 / 4 | **2–3** (row lands on Promises tab) |
| F Customer 360 | 1 / 1 | 1, plus 1-click return to the same case |
| G comms history | 3+search / 1 | **1** both |
| K next item | ≥3 + re-find / ≥2–3 | **1** (Complete & Next or Next) |
| L find by name | 4+typing / 2+typing | **2**+typing both |

## 26. Schema impact

**NONE expected.** Every proposal reuses existing entities, activities, follow-up fields, composer and
routes. Call logging uses an existing activity type if one is configured; if no call activity type
exists in an org's catalogue that is **configuration**, not schema.

## 27. Backend changes potentially required

None for WP2–WP5. Front-end read-model work only:
- a per-session cache for `loadActivityTypes` / `loadOutcomes` / integration endpoint (Workout tab ~20
  requests → ~8);
- share the already-loaded case/customer with the Comms tab instead of re-reading;
- follow-ups "mine" needs an owner clause on the existing OData query (presentation filter; note: all
  4,363 sandbox cases are owned by `# DFE Backend API`, so "mine" will be empty on the sandbox).
Out of scope but surfaced: BFD complaint path (Integration Service currently HL-only), legal initiation
(KI-108/109, business decision), org-derived context (needs a config read, not schema).

## 28. Risks

1. **V1 is default, V2 is not** — every WP must either land in both or the user must decide to make V2
   the officer surface. Building twice doubles cost. (Decision needed before WP2.)
2. Sandbox ownership: every case is owned by the integration user → "my work" journeys cannot be
   demonstrated as an officer without reassignment test data; all browser evidence remains Administrator.
3. Collection Officer RBAC still unvalidated (KI-100/111/116/120/128) — embedding more panels on one
   surface surfaces more refused reads; each panel must fail in isolation (SectionBoundary exists).
4. Request volume on the case surface (Workout ~20, Comms re-reads) grows if panels are embedded without
   the catalogue cache.
5. Hiding nav entries could orphan bookmarks — route ids must stay (navigation.ts already separates
   offering from routing).
6. Deceased one-click write without confirmation becomes more dangerous when promoted to a quick action.
7. "Both CRMs" picker removal must keep the sandbox usable (one org holds HL and BFD demo configs).
8. Complete & Next across pages depends on continuation validity; expired continuation must fall back to
   re-query, never to a full client-side load.

## 29. Recommended WP2 scope (Navigation Simplification — no capability removed)

1. Decide the officer surface: V2-first with V1 parity only for defects, or both (user decision).
2. Deep links land on the right tab: follow-up → Activities (with the activity), PTP → Promises,
   Disputes/Legal/Deceased queues → Workout & Legal; officer "My open cases" tile → My cases chip;
   Broken promises → broken filter.
3. Close the side pane on successful save (toast), both versions.
4. Fix V1 command bar no-op (open the pane, don't navigate) and V1 header search (wire to Cases search).
5. Clear/repair `dcp.v2.cases.return` and stale selection (§15 defects); "← Back" names the real origin
   (minimal version of WP5's model).
6. Officer nav regrouping per §21 **as presentation only**: resolution entries and PTP/Communications
   behind "More" for officers — **routes and screens untouched** (hide-after-migration happens in WP6).
7. Remove the "(fax or letter)" + table-name wording from the officer-visible error.
8. Follow-ups "mine" for officers (owner clause) — flag: needs the user's confirmation since the sandbox
   will show none.
Out of WP2: case composition (WP3), quick actions (WP4), Complete & Next (WP5).

## 30. Files inspected

`App.tsx`, `main.tsx`, `shell/{AppShell,context,navigation,routes,useHashRoute}.ts(x)`,
`components/{Sidebar,forms,primitives,listLayout,OwnerLabel,BalancesAsOf}.tsx`,
`views/{index,CaseWorkspace,CaseCommandDialogs,ActivityDialog,PromiseDialog,MyWorkView,operationsViews,
previews,Customer360,CustomersView,CommunicationCenter,BulkCommunication,BulkRunDetail,strategyViews,
workoutQueueView,workoutLegalTab,advancedProcessPanel,concernsCard,legalTraceCard,deceasedReviewCard,
CreateComplaintPane,moreOnActionsNotice}.tsx`, `views/customer360/*`,
`v2/{V2Workspace.tsx,shell/V2Shell.tsx,pages/v2Pages.ts,version/*}`, `v2/pages/{home,queue,cases,case,
customer,ptp,dashboards,portfolio}/*`, `v2/components/V2DataGrid.tsx`, `v2/data/caseListFilterUrl.ts`,
`data/{DataGrid,VirtualizedRows,usePagedQuery,caseQueries,collectionQueries,caseListScopeUrl,
followUpQueries,myDayOversight,operationalQueue,counts,layoutPreference,useCaseRecord,useNextAction,
useConcludability,useAdvancedProcessEvidence,actionPlanRows,configurationCatalog,messagingConfiguration,
communicationHistoryQueries,customerAggregate,customerHistoryQueries,customerListQuery,financialUnit,
complaintService,deceasedQueries,caseLegalTraces,legalTraceRows,caseConcerns,schema}.ts`,
`platform/{XrmCrmAdapter,webApiHost,crmContext}.ts`.

## 31. Tests baseline (2026-10-06, `8daf9347`, all green)

| Package | Tests |
|---|---|
| @dcp/web | 1,375 (84 files) |
| @dcp/domain | 855 (41 files) |
| @dcp/api | 412 (19 files) |
| @dcp/dataverse-client | 39 |
| @dcp/auth-adapters | 14 |
| tooling (node --test) | 25 |
| **Total** | **2,720 passed, 0 failed** |

C# plugin tests (159 on record) were not run in this audit.

## 32. Screenshots / evidence

None captured for WP1 (code-traced audit). Recommendation: at the start of WP2, capture a before-set on
org5869857f for journeys A, B, C, K, L in V1 and V2 (same case, same browser profile, layout keys set
explicitly) so WP6 compares against recorded screens as well as these counts.
