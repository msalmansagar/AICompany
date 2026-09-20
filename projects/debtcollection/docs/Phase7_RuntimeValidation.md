# Phase 7 — Manual runtime validation: the Communication Centre

**Organisation:** `org5869857f.crm4.dynamics.com` (sandbox only)
**Open it at:** `https://org5869857f.crm4.dynamics.com/main.aspx?pagetype=webresource&webresourceName=qdb_dcp_workspace.html`
**Deployed:** 2026-09-20, published, 11/11 deployment checks passed.

Written for a Collection Officer. There is no ETag, no HTTP status and no entity name anywhere in
these steps — if one appears on screen during the run, that is itself a defect worth reporting.

> **Nothing you do here sends a message to anybody.** The bank's own SMS and WhatsApp service is not
> installed on this sandbox, so a message you send is recorded and then sits still. That is the
> expected behaviour and it is stated on screen. No real customer can receive anything.

---

## Before you start

Open the workspace, choose **Communication** in the left-hand rail under *Engagement*.

You should see a list of collection cases and the line *"Communications belong to a case."*

> **If the nav entry still says "Phase 7"** — the screen did not deploy. Stop and say so.

---

## Step 1 — Open a case's communications

1. Pick any case from the list.
2. The screen should split into **New message** on the left and **Communication history** on the right.

**Expected**

- A blue banner explains that QDB's own mechanism delivers the message.
- The history either lists past SMS, emails and logged activity for that case, or says *"Nothing has
  been sent or logged on this case yet."*

**Report** — PASS / FAIL, and what the history showed.

---

## Step 2 — The templates you are offered

1. Leave **Channel** on *SMS* and **Language** on *English*.
2. Open the **Template** list.

**Expected**

- You see `P7-SMS-OVERDUE-EN` and `P7-SMS-FOLLOWUP-EN`.
- You do **not** see `P7-SMS-UNAPPROVED-EN`. That template exists in the organisation and has never
  been approved, so it must not be offered to you at all — not greyed out, not present.

3. Change **Language** to *العربية*.

**Expected** — the list changes to the Arabic template, and the Arabic wording is readable and not
garbled.

4. Change **Channel** to *Email*.

**Expected** — `P7-EMAIL-OVERDUE-EN` is offered, and the SMS templates are not.

**Report** — PASS / FAIL, and **name every template you were offered** at each step.

> This is the most important step on the page. An unapproved template appearing here would mean
> unreviewed wording could reach a customer.

---

## Step 3 — A message that is not finished cannot be sent

1. Channel *SMS*, Language *English*, template `P7-SMS-OVERDUE-EN`.
2. Leave the boxes **empty**.

**Expected**

- A message in red says the message still needs `customerName`, `amount`.
- **Send is greyed out.**

3. Fill in **customerName** only.

**Expected** — the red message now names `amount` alone, and Send is still greyed out.

4. Fill in **amount** as well.

**Expected** — the red message disappears, the preview reads as a finished sentence with your values
in it, and Send becomes available (unless Step 4 applies).

**Report** — PASS / FAIL, and paste the preview text you ended up with.

---

## Step 4 — Contact Hold (read this before you try to send)

QDB's Contact Hold rule has no source on this organisation. The rule the phase was given is to
**fail closed**: where the platform cannot confirm that a customer may be contacted, nothing is sent.

**Expected, as deployed today**

- A red line near the top reads *"Contact Hold cannot be checked on this organisation, so messages
  are not sent."*
- **Send stays greyed out even after Step 3 is complete.**

That is the correct behaviour, not a defect. It also means **Step 5 cannot be run** until the
deployment records a decision about it — see *The one decision needed* at the end.

**Report** — PASS / FAIL on the message appearing and Send staying unavailable.

---

## Step 5 — Sending *(only after the decision in the last section is made)*

1. Complete Step 3 so the message is finished.
2. Press **Send** once.

**Expected**

- The confirmation says the message was **recorded and handed to the bank's messaging service**.
- It does **not** say "delivered" or "sent successfully" — the bank's service reports delivery, not
  this screen.
- The new message appears in the history on the right.

3. Press **Send** a second time with the same message.

**Expected** — no second entry appears in the history. The same message is not recorded twice.

**Report** — PASS / FAIL, the exact confirmation wording, and how many history entries you ended up
with.

---

## Step 6 — A customer who must not be contacted

1. In Dynamics, open the customer on your chosen case and set **Do not allow Faxes** to *Do Not
   Allow*. Save.
2. Return to the Communication Centre, reload, and try to send an SMS.

**Expected**

- The message is refused, in plain words about the customer's preference.
- Nothing appears in the history.

3. Set the flag back to *Allow*.

**Report** — PASS / FAIL and the refusal wording.

---

## Step 7 — The history is one timeline

1. Look at the history for a case that has both an SMS and an email.

**Expected**

- Both appear in **one** list, newest first, with the channel named on each row.
- The status shown is the platform's own word (*Open*, *Draft*, *Completed*) — never a word like
  "Delivered" that this screen would have had to invent.
- If there is a **Show more** button, pressing it adds older entries and does not duplicate the ones
  already shown.

**Report** — PASS / FAIL, and the first three rows you saw.

---

## Step 8 — Nothing technical leaks

Read the whole screen, including every message you triggered above.

**Expected** — you see no ETag, no HTTP number such as 412, no `If-Match`, no table name such as
`fax` or `fax_activity_parties`, and no GUID presented as if it meant something to you.

**Report** — PASS / FAIL, and quote anything that looked like machine language.

---

## The one decision needed before Step 5 can run

Sending is blocked because no authoritative Contact Hold source exists on this organisation
(`qdb_contactholdrulesetcode` is empty on both platform configuration rows, and both rows are
inactive). The phase was instructed to fail closed rather than default to allow, so it does.

There are two ways forward, and the choice is QDB's:

| | What it means |
|---|---|
| **Configure the real source** | QDB names a Contact Hold ruleset on the platform configuration. This is the production answer. It does not unblock the sandbox by itself, because a ruleset still has to be evaluated server-side. |
| **Record a sandbox exception** | The sandbox's platform configuration records `{"contactHoldPolicy":"allow-when-unverifiable"}` in its feature flags. Sending then proceeds without a hold check **on this organisation only**, as a written-down, auditable decision rather than a silent default. |

Until one is done, Steps 1–4 and 6–8 are all runnable and Step 5 is not.

---

## What this validation does **not** prove

- **That any message was delivered.** QDB's SMS/WhatsApp dispatcher is not installed on this Cloud
  organisation (KI-83), so every recorded message is inert here. Delivery can only be proven where
  that mechanism runs.
- **Anything about On-Premises.** Nothing in this run touches the on-premises organisation.
- **Bulk sending.** The bulk executor is built and proven against the live organisation by
  automation, but its screen is not part of this slice.
