# DCP Collection Officer UX Simplification — WP5 Context Preservation + Complete & Next

Date: 2026-10-06 · Branch `feat/dcp-officer-navigation` @ `39384c7c` · Deployed to org5869857f (11/11, byte-for-byte).
Paths are relative to `apps/web/src/`.

## 1. Context model (`data/workContext.ts`, `views/workListContext.ts`)

A **work context**, per browser tab (sessionStorage `dcp.workContext`; a second tab works its own list, a refresh
keeps it, closing the tab forgets it), written by a list at the moment it opens a case:

| Field | Meaning |
|---|---|
| `originLabel` | "Overdue follow-ups" · "Upcoming follow-ups" · "All follow-ups" · "Work Queue · <bucket>" · "Collection Cases" · `Search “<term>”` |
| `returnHash` | the list's own route, filters included (`#myday`, `#queues/Legal`, `#cases/filter/…`, `#disputes`) |
| `items` | the rows the list **had already loaded**, in its own order (≤ 200): case id + activity id for follow-ups/queue work + a label |
| `index` | the row the officer opened, found by its own id (never guessed; a row not among them gives no Previous/Next) |
| `hasMore` / `totalCount` | whether the list held more than it loaded, and the platform's own total when it supplied one |
| `eligibility` | what keeps an item in the list: follow-up window; queue bucket (+ officer for "My work"); open case |
| `listState` | the list's choices to put back on Back: follow-up window; queue bucket + search; Cases search, owner chip, order |

Origins wired, **V1 and V2**: My Day follow-ups (Overdue / Upcoming / All — the windows My Day has), Work Queues
(every bucket, incl. the Disputes / Legal / Deceased Review entries, which return to their own route), Collection Cases
(Grid and Split preview Open), and **Search** (the header search lands on Collection Cases with the term, so the context
reads `Search “…”`). Grids report their loaded rows through a new read-only `onRows` (`useRowsReport`) — no extra request.

## 2. Previous / Next (`views/caseWorkspace/CaseWorkNavigator.tsx`, `useWorkNavigation.ts`)
`← Previous · 3 of 18 · Overdue follow-ups · Next →` in the sticky case header, above the action bar. `18+` when the list
had more than it loaded and no total. **Shown only when the case is the item the context points at** — a case opened by
link, bookmark, Customer 360 or another list shows no navigator and keeps "← Collection Cases". Previous is disabled on
the first item, Next on the last loaded item.

## 3. Complete & Next
Shown when the item is a piece of work (follow-up or queue item) and the case is open. It opens the **existing
activity pane at completion** for **that item's activity** (not another activity on the case), headed "<item> · then the
next item in <list>". The outcome and whatever it requires (notes, next follow-up) are still required — no rule is
bypassed. **Only a successful save moves on**: the case re-reads, then the step to the next eligible item of the same
list runs. Closing the pane stays put. An activity whose type has no outcome opens as an edit and explains (KI-131), so it
cannot "complete" and therefore does not move.

## 4. Back
"← Back to <origin>" returns to `returnHash` and asks the list to restore itself once (`requestRestore` →
`takeRestoredState` / `useRestoredListState`): My Day re-opens on the **same follow-up window**; Work Queues on the same
**bucket and search**; Collection Cases with the same **search, owner chip and order** (its URL already keeps bucket /
status / strategy / dashboard scope). A later visit from the navigation starts fresh, as before. Browser Back still works
and is unaffected (tab changes on the case replace history, WP3).

## 5. Stale-item handling
Every step (Next, Previous, Complete & Next) revalidates the item it would land on **against the platform** before moving
(`checkEligibility`, one bounded read per item) and skips one that:

| Change since the list loaded | Detected by | Officer sees |
|---|---|---|
| completed or cancelled elsewhere | activity `statecode` ≠ open | "Skipped 1: COL-… · Call (it was completed or cancelled)." |
| deleted | read returns nothing | "(it no longer exists)" |
| follow-up cleared | no follow-up date | "(its follow-up was cleared)" |
| rescheduled out of Overdue / into Overdue | follow-up date vs now, per window | "(it is no longer overdue)" / "(it is now overdue)" |
| reassigned out of "My work" | owner ≠ signed-in user | "(it was reassigned)" |
| case closed (Cases / Search) | case not open | "(the case is closed)" |
| no longer readable (refused / failed) | read throws | "(it could not be read just now)" — never opened |

At most **10 checks per step**; past that it stops and says "Too many items have changed — go back to the list to see it
as it is now." End of list: "That was the last item in <list>." Nothing is ever chosen outside the originating set.

## 6. Concurrency
- One step at a time: Previous / Next / Complete & Next are disabled while a step is checking ("Checking the next item…"), so double clicks cannot race to two cases.
- Another officer's change is caught by revalidation at the moment of the step, not trusted from the list.
- Per-tab storage: two tabs working two lists do not overwrite each other. A context that does not point at the open case is ignored.
- Two follow-ups on the same case: Next moves position without re-navigating.

## 7. Click-count improvement (vs WP1 baseline K)
| Journey | WP1 V1 / V2 | WP5 |
|---|---|---|
| Next item after finishing one | ≥3 + re-find (Back, list reloads at page 1 with filters/scroll lost, find, open) / 2–3 ("← Cases" to the wrong list) | **1** (Next) |
| Complete the follow-up and move on | Complete (2) + back (1) + find + open (1–2) ≈ **5–6** | **2** + outcome fields (Complete & Next → Complete activity) |
| Back to the originating list as it was | browser Back; window/search/sort lost | **1**, window / bucket / search / order restored |

## 8. Tests
2,860 passing, 0 failing, type-check clean (web **1,515**, +34): unit — position wording, every stale reason, unreadable item
skipped, bounded checks, backwards step, end of list, context ownership, restore-once and not-to-another-list, opened row
not among loaded rows → no position (review finding); App-level, **V1 and V2** — position + Back label from My Day, Next
after revalidation, a stale next item skipped with its reason, Complete & Next opens the pane on the item with its
context, Back to My Day, no navigator on a linked case or for a list left for another case, Back restores **Upcoming**.
Note: running all five packages in parallel timed out 1–2 unrelated slow tests on this machine (different ones each run);
every one passes alone and the whole suite passes with `--concurrency=1`.
Code review: first pass FAIL (note read/write in a state initialiser; 4–5-parameter functions); fixed — pure read +
clear in an effect, parameter objects (`CheckSession`, landing setters), shorter hook, explicit no-position for a missing row.

## 9. Screenshots / live evidence (org5869857f, V2, browser "QDB Profile")
- My Day → first overdue follow-up → DEMO-HL-1001: "1 of 5 · Overdue follow-ups", "← Back to Overdue follow-ups", Previous disabled, Complete & Next shown.
- Next → DEMO-BFD-1001 "2 of 5"; Next → DEMO-BFD-1002 "3 of 5"; Previous → DEMO-BFD-1001 "2 of 5". Screenshot: `%TEMP%/claude-chrome-screenshots-4euWIT/screenshot-1791306871914-7.jpg`.
- Back → `#myday`, Overdue window selected.
- Work Queues › My work → Open case: "1 of 8 · Work Queue · My work"; Back → `#queues/MyAssigned`.
- Not exercised live: Complete & Next to a save (would complete real sandbox work; and every due follow-up is a PTP type without outcomes — KI-131), and a stale skip (would need another user's change). Both are covered by the App-level tests.

## 10. Remaining gaps
1. Only rows the list had **loaded** travel (≤ 200); Next stops at the last loaded row ("18+" says more exist) instead of fetching the list's next page. Following the continuation would need the list's query re-created from the context — feasible later; not done to avoid re-running list queries from the case.
2. Scroll position and the Split selection are not restored on Back (the virtualised list keeps scroll locally).
3. My Day has no "Today" window (Overdue / Upcoming / All exist); a Today filter is a list change, not context.
4. Complete & Next cannot complete PTP-type follow-ups until outcomes are configured (KI-131).
5. Customer 360, Promise to Pay and the Customers list do not create a context (no ordered work); cases opened from them show no Previous/Next by design.
6. V1 Collection Cases embedded inside My Day / Work Queues returns to that host page, labelled "Collection Cases".
7. Evidence is System Administrator; Collection Officer RBAC unvalidated.

## WP6 readiness — Consolidation + Hardening
Candidates now proven safe to retire: unrouted `V2CasePage` / V2 `CaseHeader` / `CaseOverview` / `caseTabs`; V1 global
command-bar Log action / Capture PTP / Send message (duplicated by the case action bar); `rememberCaseListReturn` (superseded
by the work context for case Back); officer nav entries hidden in WP2 (already only reachable contextually). Plus the WP1
baseline re-measure, accessibility pass, request-count budget check and the open decisions (CRM role mapping, "my"
follow-ups, outcome catalogue).
