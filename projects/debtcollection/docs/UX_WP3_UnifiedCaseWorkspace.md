# DCP Collection Officer UX Simplification — WP3 Unified Collection Case Workspace

Date: 2026-10-06 · Branch `feat/dcp-officer-navigation` @ `a4c59637` · Deployed to org5869857f (11/11, byte-for-byte).
Paths are relative to `apps/web/src/`.

## 1. Before / after

| Before | After |
|---|---|
| **Two different case pages.** V1 `CaseWorkspaceView`: a card header, seven tabs (Summary, Actions, PTP, Communications, Documents placeholder, Workout & Legal, Audit). V2 `V2CasePage`: its own header, command bar and eight tabs. | **One shared page** (`views/caseWorkspace/CaseWorkspacePage.tsx`). V1 draws it directly; V2 draws it inside its frame (`case` removed from `V2_PAGES`), as Customer 360 already was. |
| Officer had to choose a tab to see the plan, promises, history or resolution. | One working surface: sticky header + action bar → Overview, Action Plan, Timeline (main column); Promise, Resolution, Delinquency (side column); full records in tabs below. |
| V1 command bar only switched tabs; V2 had Log/PTP/Send/Customer 360; no Complete follow-up anywhere. | Contact ▾ · + Log action · Capture PTP · Complete follow-up · More ▾, each opening a pane over the case. |
| Pane stayed open after save. | Save closes the pane, shows a "saved" status line, re-reads the case and every panel. |

Screenshots (local): V2 case `screenshot-1791284990273-3.jpg`, V1 case `screenshot-1791285433575-4.jpg`, phone-width probe `screenshot-1791285897752-5.jpg` (folder `%TEMP%/claude-chrome-screenshots-4euWIT/`).

## 2. Header (`CaseIdentityHeader.tsx`)
Sticky (`position: sticky; top: 0`, verified live in V1's `.scroll` and V2's page). Shows: ← Collection Cases ·
**customer name (link → Customer 360)** · customer type chip · **Loan Account** (HL) / **Facility** (BFD) from
`financialUnitTerms` · **Case number** (`aria-current="page"`) · status · CRM badge · owner (`OwnerLabel`, integration
users read "System") · DPD · bucket · arrears · Loan balance / Facility exposure · "Balances as of <date>".

## 3. Action bar (`CaseActionBar.tsx`, `components/MenuButton.tsx`)
- **Contact ▾**: Call mobile / Call phone (`tel:` links, customer's own numbers), Send SMS or email… (opens the case composer). WhatsApp not shown — no screen sends WhatsApp for any org yet.
- **+ Log action**, **Capture PTP**: existing `ActivityDialog` / `PromiseDialog`.
- **Complete follow-up**: one due item → opens it; several → menu (oldest first); none → disabled with reason.
- **More ▾**: Raise complaint (**HL only**, the Integration Service supports no other route), Record a dispute (activity pane), Resolution details.
- **Not exposed (unsupported)**: Legal hand-off (no qualification rule — KI-109), Reassign (ownership not grantable — KI-100), Escalate, Restructure. Tests assert their absence.
- Closed case: no write commands, sentence instead.

## 4. Overview (`CaseOverviewPanel.tsx`)
Next planned action · Due (follow-up date that placed it, or "No due date set" — KI-101) · **Last contact** (newest
message in the case timeline — same list, cannot disagree) · Last action recorded · Promise to pay · Strategy (only
when the case names one) · Case owner · Case status. No recommendations.

## 5. Action Plan (`CaseActionPlanPanel.tsx`, `data/caseWorkPlan.ts`)
OVERDUE · TODAY · UPCOMING · COMPLETED (latest 5), with **Complete** on open work. Lines are the existing plan:
`toPlanItem` (domain) for planned actions + officers' open follow-ups. Grouping uses the record's follow-up date in the
officer's local day; planned actions nothing has answered are Upcoming, undated. "Full plan" opens the existing
`CaseActionPlan` (provenance, unattributed history) in the Action Plan tab. No new engine.

## 6. PTP (`CasePromisePanel.tsx`)
Current promise prominently (latest **open** — Active/Rescheduled — else latest recorded, labelled "Latest
promise"): amount, due date, status, **View** (opens `PromiseDialog` in edit, which offers whatever update the promise's
state allows) + the three before it + "All promises (n)" → Promises tab. Capture PTP stays on the bar.

## 7. Communications
Composer + history embedded in the Communications record tab (both workspaces); reached from Contact ▾ without
leaving the case. Channel words are the business ones (SMS / WhatsApp / Email) — the composer and timeline already use
`channelOfMessage`; no Letter/Fax shown.

## 8. Timeline
The existing Customer 360 reader/component (`CollectionHistoryTimeline` + `customerHistoryQueries`) narrowed to this
one case — an aggregation read model over activities, message tables and email, server-filtered and paged with
stale-answer suppression; nothing copied to a new table. Filters shown only when supported: All · Actions · PTP ·
Communications · Complaint / Dispute · Legal · Deceased / Insurance. **Deviation:** the brief's single "Resolution"
filter is shown as its three existing categories (no new reader written to merge them).

## 9. Resolution (`CaseResolutionPanel.tsx`)
Complaint / Dispute · Legal · Deceased / Insurance → "Not initiated", "Open · <subject> · ref <number> · <date>", or
"n recorded, none open" — classified from the activities already read, by hand-off reference and configured type
codes. Lifecycle stays with Case Management / Legal / the deceased process. Details → Resolution tab (existing Workout &
Legal: complaint pane, legal traces, deceased review with its own eligibility).
Live: DEMO-HL-1000 shows "Complaint / Dispute — Open · test complaint · 5 Oct 2026; Legal — Not initiated; Deceased — Not initiated".

## 10. Delinquency context (`CaseDelinquencyPanel.tsx`)
This episode's last 6 stored snapshots (as of, DPD, bucket, arrears), **loaded only when scrolled into view**; "Full
history" → Delinquency history tab. The customer-wide portfolio view stays Customer 360's.

## 11. Customer 360 navigation
Customer name in the header is the link (CustomerLink, WP2). V2's separate "Customer 360" button is gone; the link
is the one way, in both workspaces. Customer 360 → case still via unit "Open case" / case-number links.

## 12. Reused components
`ActivityDialog` (+ new `complete` mode), `PromiseDialog`, `CreateComplaintPane`, `CommunicationCenterView`,
`CaseActionPlan`, `WorkoutLegalTab`, `CollectionHistoryTimeline`, `loadHistoryContext`, `toPlanItem`, `useCaseRecord`,
`SectionBoundary`/`useSectionData`, `OwnerLabel`, `BalancesAsOf`, `CustomerLink`, `financialUnitTerms`, the V1 tab
bodies (moved intact into `CaseRecordTabs.tsx`).

## 13. Backend / read-model changes
No backend, no API, **no schema**. Front-end read model only:
- `loadCaseWork` (`data/followUpQueries.ts`): the two case-activity reads now select the promise columns and run **in
  parallel with** the strategy-actions read (was sequential); returns plan + all activities. `loadActionPlan` delegates to it.
- `data/caseWorkPlan.ts`: pure grouping, current promise, resolution status, next work.
- `configurationCatalog.ts`: per-session reuse (60 s) of activity types and per-type outcomes; failures forgotten; a
  read that must re-admit a retired row is never shared.

## 14. N+1 / performance findings
| Surface | Before | After |
|---|---|---|
| Overview + plan + promises + follow-ups + resolution | V2: case→customer (seq) + plan 3 (2+1 seq) + recent 1; resolution only in Workout tab | case→customer + **3 parallel** work reads; all five panels derived, **0 extra** |
| Workout & Legal tab (still lazy) | ~20–22 requests, activity types ×~8, outcomes ×~6 | types/outcomes now read once per session → ~8–10 |
| Timeline | (none on V1 case) | 1 history-context read (types cached) + message-table/email/activity sources, one bounded page |
| Delinquency | in Summary tab | 1 request, only when visible |
No per-record request anywhere (tested: exactly two filtered work reads on load). Known remaining cost: the default
Activities record tab paints its own grid on load (1 request); Communications tab still re-reads case+customer when opened.

## 15. Responsive behaviour
- ≥1081 px: header/bar sticky; two columns (main · 340 px side).
- ≤1080 px: one column; side panels follow the main column.
- ≤640 px (phone): a sticky header measured **358 of 740 px**, so the identity now scrolls away and the **action bar is
  pinned to the bottom edge** (thumb zone; 129 px when wrapped to three rows), menus open upward full-width. Verified
  in a 400 px probe frame: no horizontal scroll, every action on screen. V1's own nav rail does not collapse at phone
  width (pre-existing V1 shell limit; V2 has its drawer).

## 16. Accessibility
Menus: `aria-haspopup="menu"`, `aria-expanded`, `aria-controls`, `role=menu/menuitem`, arrow keys, Escape returns focus
(verified live), outside click closes. Calls are real links. Sections are `section` + heading ids; position figures are
`dl`; snapshot table has `th scope`; case number `aria-current="page"`; save notice `role="status"`; record tabs keep the
existing tablist; disabled commands carry a reason in `title`.

## 17. Tests
2,816 passing, 0 failing, type-check clean: web **1,471** (WP2 1,429; +46 case workspace, +15 grouping, +6 catalogue,
−18 retired V2 case page tests whose behaviours moved, ±V1 tab tests), domain 855, api 412, dataverse-client 39, auth 14, tooling 25.
`caseWorkspace.test.tsx` runs header and action-bar suites in **both V1 and V2**, with a fake that honours the
attributed/unattributed filters. Code review: PASS WITH WARNINGS, nothing blocking; applied: callback deps, function
length, JSDoc, removed non-null and tab assertions, cache-expiry test. Not covered by an automated test: the activity
pane entering completion when outcomes exist (live-checked only that it opens and explains when they don't).

## 18. Screenshots / live evidence (org5869857f, System Administrator)
DEMO-HL-1000: header, figures, actions in order, Contact (2 numbers + composer), More (complaint, dispute,
resolution), Escape focus return, Overview (next action, due 25 Sep, last contact SMS 6 Oct 08:20, strategy), Action Plan
overdue/upcoming, promise QAR 41,250 Active + Kept history, resolution, timeline (8 rows, 7 filters), delinquency (3
snapshots), 8 record tabs, sticky in V1 and V2, phone probe. Complete opened the pane and said "Completion unavailable —
no outcomes are configured" for that PTP type (KI-131) — correct behaviour, not completed. Owner bug found live
("# DFE Backend API" on a plan line) — fixed and re-verified ("System"). Browser restored to V2 / My Day.

## 19. Files changed
New: `views/caseWorkspace/{CaseWorkspacePage,CaseIdentityHeader,CaseActionBar,CaseOverviewPanel,CaseActionPlanPanel,
CasePromisePanel,CaseResolutionPanel,CaseDelinquencyPanel,CaseRecordTabs,CasePanes}.tsx`, `views/caseWorkspace/useCaseWorkspace.ts`,
`components/MenuButton.tsx`, `data/caseWorkPlan.ts`, `styles/caseworkspace.css`, tests `caseWorkspace`, `caseWorkPlan`, `catalogueReuse`.
Changed: `views/CaseWorkspace.tsx` (now the thin route view), `App.tsx`, `v2/pages/v2Pages.ts`, `views/ActivityDialog.tsx`,
`data/followUpQueries.ts`, `data/configurationCatalog.ts`, `views/customer360/{CollectionHistoryTimeline.tsx,useCustomer360Sections.ts}`,
tests `views`, `v2Coverage`. Removed: `__tests__/v2CasePage.test.tsx` (behaviours migrated).

## 20. Schema changes
**NONE.**

## 21. Remaining gaps
1. Completion depends on configured outcomes: PTP/legal/deceased/dispute types have none (KI-131), so Complete opens the pane in edit mode and explains.
2. Contact does not preselect the channel in the composer (SMS vs Email) — WP4.
3. V1's global command bar still shows its old Log action / Capture PTP / Send message (now duplicates that jump to tabs) — retire in WP6.
4. `V2CasePage`, V2 `CaseHeader`, `CaseOverview`, `caseTabs` are unrouted, kept until acceptance — retire in WP6.
5. Documents placeholder tab removed (it held nothing).
6. Back still goes to Collection Cases (V2 restores its filter); returning to My Day/queue origin and Next are WP5.
7. Timeline "Resolution" shown as three filters, not one.
8. Activities tab is the default record tab and reads on load; Communications tab re-reads case/customer.
9. V1 shell is not phone-responsive (nav rail).
10. All evidence is System Administrator; Collection Officer RBAC unvalidated (KI-100/111/116/120/128).

## 22. WP4 readiness — Contextual Quick Actions
Ready. The action bar, pane host (`CasePanes`), complete mode and the case read model are the seams WP4 needs:
1. Contact → open the composer with the channel preselected (thread an initial channel through `CommunicationCenterView`), and a "Log call outcome" that opens the activity pane with the call type chosen.
2. Quick actions from lists/My Day rows (preview + My Day follow-up "Complete") reusing `CasePanes`.
3. Close-on-save + notice for list previews (already in V2 lists; unify).
4. Optional: deceased review confirm step before its one-click write.
No schema or business-logic change foreseen.
