# Phase 6 — manual runtime validation

**Status: NOT PASSED.** Nothing in this document has been exercised by the build. Everything below
needs a signed-in Dynamics session, which the build does not have, and the result is yours to
record — §14 of the authorisation reserves this gate to you.

What *is* proven, and by what:

| Claim | Evidence |
|---|---|
| The domain, service and query layers behave against the real organisation | `smoke-domain-operations.mts` **50/50** — `docs/evidence/Phase6_domain_operations_smoke.txt` |
| Concurrency, idempotency and the transport behave | `smoke-browser-writes.mts` 27/27, `spike-concurrency` 16/16, `spike-idempotent-create` 10/10 |
| Every column and navigation property exists | `verify-view-columns.mts` **17/17, 205 names** |
| The forms behave as components over the real service and domain | 241 web tests, including 19 Phase 6 form tests |
| The artefact reached the organisation intact | deploy **11/11**, byte-for-byte |
| **The workspace runs inside Dynamics and an officer can use it** | ⬜ **this document** |

---

## Open it

```
https://org5869857f.crm4.dynamics.com/main.aspx?pagetype=webresource&webresourceName=qdb_dcp_workspace.html
```

Or from the **Debt Collection** model-driven app, which is how a user would reach it.

> Do **not** verify at the raw `/WebResources/qdb_dcp_workspace.html` path. It works there and fails
> everywhere a user opens it, because only the `main.aspx` URL has a parent `Xrm`. That confusion
> cost the Form Engine an on-premises release.

If the page says *"Debt Collection Workspace — no CRM context"*, it was opened at the wrong URL or
the session has expired. Ctrl+F5; a stale web resource is cached aggressively.

## Records to use

Seeded demonstration data, marked `DEMO-`. **Housing Loan cases are contacts, BFD cases are
accounts** — both must work from the same screens, which is item 10 below.

| Case | CRM | DPD | Id |
|---|---|---|---|
| `DEMO-HL-1000` | HL (contact) | 74 | `d6b58ff0-acb3-f111-aaac-70a8a55bc6a5` |
| `DEMO-HL-1001` | HL (contact) | 22 | `3d308af1-acb3-f111-aaac-000d3abd8313` |
| `DEMO-BFD-1000` | BFD (account) | 132 | `4f250df7-acb3-f111-aaac-000d3abcf32d` |
| `DEMO-BFD-1001` | BFD (account) | 48 | `464ecaf8-acb3-f111-aaac-000d3abd8313` |

Configuration is the synthetic `P6-` set (**KI-66** — not QDB policy): 11 active activity types, 30
outcomes. The ones that matter below:

- **Call** offers 7 outcomes. *Customer contacted* → follow-up in 3 days. *Customer refused* →
  requires a note **and** flags escalation. *Customer disputes the balance* → requires a note and a
  5-day follow-up.
- **Field Visit** offers 2 different outcomes, which is how you can see the filtering is real.
- **Promise to Pay** is the type a promise is captured under.

Anything you create will be `DEMO-`-adjacent live data on the sandbox. That is fine and expected —
please do **not** run the smoke cleanup afterwards, as it removes `SMOKE-` rows only and your
records will not carry that marker.

---

## 1 — Log an action

1. Open `DEMO-HL-1000` → **Actions** tab.
2. The grid lists existing actions and there is a **Log action** button.
3. Click it. The dialog opens.
4. **Activity type** is populated from configuration. Confirm you see *Call*, *Payment Request*,
   *Field Visit* and the rest — **not** an empty list.
5. Choose **Call**, type a subject, leave the date as today. Save.
6. ⬜ The dialog reports saved and the grid behind it shows the new row.

**Fails if:** the type dropdown is empty (configuration was not read), or the row does not appear.

## 2 — Open, edit, complete

1. Click the row you just created.
2. ⬜ It opens with its subject, date and status filled in, and the **Activity type** is disabled —
   the type is fixed once logged, because its outcomes hang off it.
3. Change the subject, click **Save changes**. ⬜ It saves.
4. Click **Save changes** again without changing anything. ⬜ It says *"Nothing has been changed."*
   rather than reporting a silent success.
5. Click **Complete…**. The **Outcome** field appears.
6. ⬜ The outcomes offered are the **Call** ones only.

## 3 — Configuration decides, not code

1. Still completing, choose **Customer refused**.
2. ⬜ Chips appear saying *A note is required* and *Flagged for escalation — Phase 8 acts on it*.
3. Click **Complete activity** with the notes box empty.
4. ⬜ It refuses, with the message **beside the Notes field**, and nothing is saved.
5. Type a note and complete. ⬜ It saves.
6. Reopen the activity. ⬜ It is read-only, says it is completed, and offers no Save or Complete
   button — the buttons are gone rather than present-and-failing.

Then, on a **new** action: choose **Customer contacted** and complete it with no follow-up date.
⬜ The saved activity has a follow-up **3 days out**, scheduled by configuration rather than typed.

> Escalation is *recorded*, not performed. Nothing should be routed, assigned or escalated — that is
> Phase 8. If anything appears to have been escalated, that is a defect.

## 4 — Follow-up round trip

1. Go to **My Day**.
2. ⬜ There is a **Follow-ups** card with **Overdue / Upcoming / All**.
3. Click **Upcoming**. ⬜ The activity from §3 appears, with its date.
4. Click the row. ⬜ It navigates to that case.
5. Open the activity from **Actions** and complete it.
6. Return to **My Day** → **Upcoming**. ⬜ It is gone — completing the activity cleared the work.

## 5 — Promise to pay

1. Open `DEMO-HL-1001` → **PTP** tab → **Capture promise**.
2. Enter an amount and a date a few weeks out. Save. ⬜ It saves and appears in the grid.
3. ⬜ Its status reads **Active** with **no** "unverified" marker — an active promise claims nothing.
4. Open it. ⬜ Amount, date and notes are editable; the outcome section offers only *Kept*,
   *Partially kept*, *Broken*, *Rescheduled*, *Cancelled* — never *Active* again.
5. Choose **Kept**, enter an amount reported paid, click **Record outcome**. ⬜ It saves.
6. ⬜ The grid row now shows **Kept** *followed by* **unverified**.
7. Reopen it. ⬜ A notice says the outcome was recorded by the officer and has **not been verified
   against MIS**, the amount is labelled *as the customer reported it*, and the terms are locked.

**This is the most important check in the document.** If anywhere shows a Kept promise as settled,
paid or verified — a green tick, the word "paid", a confirmation — that is a defect, not a nicety.

Also try: open the promise and attempt to record **Broken** after it is Kept. ⬜ Not offered.

## 6 — Validation, refusals

1. New promise: enter amount `0`. ⬜ Refused beside the Amount field, nothing saved.
2. New promise: leave the date blank. ⬜ Refused beside the Date field.
3. New action: press Save with no type and no subject. ⬜ Two refusals, beside their own fields.
4. ⬜ Enter a very large promise (e.g. 50,000,000) a long way out (e.g. 2031). **It should save.**
   No maximum amount or horizon is enforced, because none is QDB policy and inventing one would
   enforce an unagreed rule on real customers (**KI-72**). If you want limits, they are yours to
   specify.

## 7 — Concurrency (needs two windows)

1. Open the same activity in **two** browser tabs, both on the Actions tab, both with the dialog open.
2. In tab A, change the subject and save. ⬜ Saves.
3. In tab B — which is now holding the older version — change the subject and save.
4. ⬜ Tab B shows **"This record was changed by someone else"** with a **Reload latest** button.
5. ⬜ The message contains no `412`, no `ETag`, no `If-Match`, no `RowVersion`.
6. ⬜ There is **no** "save anyway" and no automatic merge.
7. Click **Reload latest**. ⬜ Tab A's subject appears. Edit and save. ⬜ It now saves.
8. Save again immediately. ⬜ It saves again — two consecutive saves must both work.

## 8 — Duplicate submission

1. New action, fill it in, then **double- or triple-click Save** as fast as you can.
2. ⬜ Exactly **one** row appears in the grid.
3. Repeat with the PTP dialog. ⬜ One promise.

## 9 — States

Worth a look as you go:

- ⬜ A list that is loading says so; an empty list says *why* it is empty; a failed one offers Retry.
- ⬜ An empty result never looks the same as a failure.
- ⬜ Saving disables the button and shows *Saving…*.

## 10 — BFD, the same screens

Repeat **§1, §2 and §5** against `DEMO-BFD-1000`.

⬜ Everything behaves identically. The BFD customer is an **account** where HL's is a **contact**,
and the same components and the same service must handle both without a separate code path.

## 11 — Action plan

On a case whose strategy has actions, **Actions** tab, below the grid:

1. ⬜ An **Action plan** card lists the planned actions.
2. ⬜ A banner states that matching is **by activity type** and that the schema records no link
   between an activity and the planned action that prompted it.
3. ⬜ No column claims an activity was *generated by* a planned action.

This is **KI-71** and it stays open. If the plan ever needs to prove provenance, that is a schema
change and needs your approval.

## 12 — Large data

1. **Collection Cases**, scroll hard.
2. ⬜ Rows keep loading; the browser stays responsive.
3. Change a filter mid-scroll. ⬜ The list restarts from the top and shows results for the **new**
   filter — no rows from the previous one survive.

---

## Recording the result

Please tell me, per numbered section: **pass**, or what you saw. A screenshot of anything odd is
worth more than a description — the Phase 5 styling defect was found from one.

If everything passes, Phase 6 closes on your word and not before. If anything fails I will fix it
and re-deploy; I will not reinterpret a failure as a pass.

**Phase 7 will not be started either way until you say so.**
