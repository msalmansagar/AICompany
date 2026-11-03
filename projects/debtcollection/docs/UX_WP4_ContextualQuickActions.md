# DCP Collection Officer UX Simplification — WP4 Contextual Quick Actions

Date: 2026-10-06 · Branch `feat/dcp-officer-navigation` @ `05518e06` · Deployed to org5869857f (11/11, byte-for-byte).
Paths are relative to `apps/web/src/`. Builds on WP3's shared Case Workspace (V1 and V2 draw the same page).

## What changed

| Operation | Now |
|---|---|
| **Contact** | Contact ▾ lists only channels usable on this case: **Call** (each of the customer's own numbers, `tel:`), **Log the call…** (activity pane, case context shown), **SMS…** (only when the organisation's message table is configured — Letter on HL, Fax on BFD, never named), **Email…** (only when the customer has an address). **WhatsApp is not offered** — no screen can send one for any organisation yet. SMS/Email open the case's own composer in a **pane**, on that channel (`CaseMessagePane`); sending keeps the pane open to show what was handed over and re-reads the case behind it. |
| **Log action** | Existing `ActivityDialog` in a pane, headed "Customer · Loan Account/Facility · Case" — nothing to reselect. Save closes it, says so, re-reads. |
| **Capture PTP** | Existing `PromiseDialog` in a pane with the same context line. Save closes it, shows "The promise was saved.", re-reads the case's work → PTP panel, Action Plan, overview and timeline update (timeline remounts on the reload key). No navigation. **Tested end to end through the App.** |
| **Complete follow-up** | From the Action Plan's Complete, the action bar's Complete follow-up, **and now from My Day** (V1 and V2 follow-up lists have a Complete button; the row click still opens the case). All open the existing activity pane **at completion**: outcome required, and notes / next follow-up as that outcome's configuration requires — no field is bypassed. An activity type with no configured outcome opens as an edit that says so. |
| **Customer 360** | The customer name navigates with the known business id **and the case id** (`#customer/<id>/<caseId>`). Customer 360 pre-selects that case's Loan Account / Facility (it used to select the first) and shows **"← Back to case <number>"**. No search, no reselection. |

## Interaction counts (clicks/selections; typing and required form fields counted separately, as in WP1)

| # | Operation | WP1 baseline V1 / V2 | WP4 (both workspaces) | Evidence |
|---|---|---|---|---|
| 1 | **Contact customer — SMS**, from the case | V1 not possible (placeholder tab; ≥3 + search via Communications) · V2 2 (Send message → tab → Send) | **3** + template: Contact → SMS → Send — channel preselected, stays on the case | live ✓ |
| 1 | Contact customer — **Call**, from the case | not possible (number was plain text) | **2**: Contact → Call (+1 Log the call → Save to record it) | live ✓ |
| 1 | Contact customer — SMS, from My Day | V1 ≥5 + search · V2 4 | **4** + template: row → Contact → SMS → Send | live ✓ |
| 2 | **Log action**, from the case | V1 4 · V2 3 (incl. manual close) | **2** + 2 fields: Log action → Save (pane closes itself) | live ✓ (to Save) |
| 2 | Log action, from My Day | V1 5 · V2 4 | **3** + 2 fields | |
| 3 | **Capture PTP**, from the case | V1 4 · V2 3 | **2** + 2 fields: Capture PTP → Capture promise | tested ✓, live ✓ (to Save) |
| 3 | Capture PTP, from My Day | V1 5 · V2 4 | **3** + 2 fields | |
| 4 | **Complete follow-up**, from My Day | V1 6 · V2 6 (+ outcome) | **2** + outcome (+ notes/next date if required): Complete → Complete activity | live ✓ (pane opens in place) |
| 4 | Complete follow-up, from the case | V1 5 · V2 5 | **2** + outcome: Complete follow-up (or the plan line's Complete) → Complete activity | tested ✓ |
| 5 | **Open Customer 360**, from the case | 1 · 1 | **1** | live ✓ |
| 5 | Return to the case from Customer 360 | browser Back (1; V1 lost the tab; Customer 360 had shown a different unit) | **1**: "← Back to case", and Customer 360 opened on the right unit | live ✓ (DEMO-HL-1001 → unit DEMO-HL-4402 selected) |

Net: from the case, Log action and Capture PTP **4/3 → 2**, Complete follow-up **5 → 2**, from My Day **6 → 2**;
SMS from the case is **3** (one more than V2's 2, because Contact is now a menu of real channels and the channel is
preselected; V1 goes from impossible to 3); Call goes from impossible to **2**.

## Live verification (org5869857f, V2, System Administrator)
- My Day: 5 Complete buttons; Complete opens the activity pane **in place** (hash stays `#myday`) with "Case DEMO-HL-1001 · DEMO-Promise to pay — DEMO-HL-4402".
- Case DEMO-HL-1000: Contact = Call (mobile), Call (phone), Log the call…, SMS…, Email… demo.aisha@example.qa; SMS pane opens on SMS, Email pane on Email ("Send an email"); hash unchanged.
- Log action and Capture PTP panes: "Aisha Al-Mansouri (DEMO) · Loan Account DEMO-HL-4401 · Case DEMO-HL-1000".
- Customer 360 round trip with the correct unit preselected for a customer's second case.
- **Not done live (deliberately):** no message was sent, no promise or action saved, no follow-up completed on the shared sandbox. Saves are proven by the App-level test.
- **Cannot be shown live:** every due follow-up on the sandbox is a PTP-type activity with **no configured outcome (KI-131)**, so completion explains instead of completing. Completion with required outcome/notes/next follow-up is covered by the existing activity-dialog tests; WP4 adds no rule.
- Screenshot: Email pane on the case — `%TEMP%/claude-chrome-screenshots-4euWIT/screenshot-1791287991972-6.jpg`.

## Tests
2,826 passing, 0 failing, type-check clean: web **1,481** (WP3 1,471, +10): Contact shows no unusable channel and no
WhatsApp/Letter/Fax; SMS and Email panes open on their channel without leaving the case; Log action and Capture PTP
carry the case context; **Capture PTP save closes the pane, shows the notice and re-reads the case's work**; Complete
from My Day opens in place in V1 and V2; Customer 360 back-to-case and no back link when not opened from a case.
Code review: first pass FAIL on `as FollowUpQuery` casts — fixed by declaring `reloadKey` on `FollowUpQuery`; also
applied: stable pane callbacks (`useMemo`), one shared "follow-up completed" constant, send/refresh split.

## Files
New `views/FollowUpCompletion.tsx`. Changed `views/caseWorkspace/{CaseActionBar,CasePanes,CaseWorkspacePage,CaseIdentityHeader}.tsx`,
`views/CommunicationCenter.tsx` (`CaseMessagePane`, initial channel), `views/PromiseDialog.tsx` (context note),
`views/Customer360.tsx` (`fromCaseId`, preselect, back), `shell/RecordLinks.tsx` (`fromCaseId`), `views/index.tsx` and
`v2/pages/home/V2HomePage.tsx` (Complete on follow-ups), `v2/pages/customer/V2CustomerPage.tsx`, `App.tsx`,
`data/followUpQueries.ts` (`reloadKey`), `styles/customer360.css`, test `caseWorkspace.test.tsx`. **Schema: none.**

## Remaining gaps
1. Completion needs configured outcomes; PTP, legal, deceased and dispute types have none (KI-131) — QDB configuration, not code.
2. "Log the call" cannot preselect a call activity type: no type code identifies "call" in configuration, and inventing one would be a business rule. The officer picks the type.
3. WhatsApp: needs the HL `vrp_type` mapping + a template column and a sending path; not offered until then.
4. My Day follow-ups are still every follow-up in scope, not only the officer's (no owner clause — WP1 finding, awaits your decision).
5. Customer 360 → case from a *different* unit still opens that case without a back link to Customer 360 (browser Back works).
6. All evidence is System Administrator; Collection Officer RBAC unvalidated.

## WP5 readiness — Queue Context + Complete & Next
Ready: every list already opens the case by id, the case page is one component, and panes close themselves on save.
WP5 needs a work-context store above both workspaces (origin list, its query, the loaded ids, continuation, scroll) so
the case shows "← Back to <origin>" and "Next ▸", and "Complete & Next" after a completion.
