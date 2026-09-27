# Phase 7 WP12 — Bulk Communication, browser runtime validation

**Organisation:** `org5869857f.crm4.dynamics.com` (Cloud sandbox — the only authorised organisation)
**Opened at:** `main.aspx?pagetype=webresource&webresourceName=qdb_dcp_workspace.html`
**Signed in as:** Mohammad Salman (`{051A9302-4F19-EC11-B6E5-6045BD8B2B7A}`), Collection Officer role
**Platform:** Dynamics 9.2.26084.00156
**Date:** 2026-09-21
**Artefact:** `qdb_dcp_workspace.html`, deployed and published, 11/11, content matching byte for byte

Driven through the deployed workspace inside Dynamics. Every figure below was **read back from the
platform** after the screen claimed it, because the screen's own tally is not evidence.

---

## Controlled population

The two `DEMO-HL` cases, reached with the screen's own narrowing (`Case number or customer
reference` = `DEMO-HL`). Both belong to `Aisha Al-Mansouri (DEMO)`, whose mobile is the synthetic
non-assignable `+97400000000` and whose email is `demo.aisha@example.qa`.

Deliberately small and deliberately more than one: a single recipient would not exercise batching,
merging or reconciliation. The unfiltered population — 4,363 open cases — was never confirmed.

**No message could reach anyone.** QDB's dispatcher is not installed on this organisation (KI-83),
and the recipient details are synthetic.

---

## Gate results

| # | Gate | Result | Evidence |
|---|---|---|---|
| 1 | An officer can initiate **Bulk SMS** | **PASS** | Run created from the screen; `qdb_communicationrun` `13d5ac7a…`, Draft, target 2 |
| 2 | An officer can initiate **Bulk Email** | **PASS** | Run `3f3247e6…`, Draft, target 2, subject frozen on the run |
| 3 | Target count correct **before** confirmation | **PASS** | 4,363 unfiltered and 2 narrowed — both matching a server-side `$count` run independently |
| 4 | **Approved templates only** | **PASS** | SMS offered `P7-SMS-OVERDUE-EN`, `P7-SMS-FOLLOWUP-EN`. `P7-SMS-UNAPPROVED-EN` **never offered**. Switching to Email offered only `P7-EMAIL-OVERDUE-EN` and withdrew the SMS templates |
| 5 | The browser does **not** process recipient-by-recipient | **PASS** | The screen calls for a bounded batch; the executor performs it and writes one checkpoint. Asserted in automation: three recipients produce **three** run-header writes (create, claim, checkpoint), not one per recipient |
| 6 | The run starts and progress is visible | **PASS** | Target / Processed / Recorded / Refused / Needs retry, with the platform's own status word |
| 7 | Counts **reconcile** | **PASS** | Screen: 2 recorded. Platform: 2 activities, each with exactly **one** recipient ActivityParty (`participationtypemask eq 2`) |
| 8 | Refresh / reopen preserves run state | **PASS, with a stated limitation** | Reopening from the Bulk runs list restored Target 2 / Processed 2 / Completed, read from the run record. The in-screen **Refresh** re-reads from the platform. **A top-level browser reload loses the deep link** — see below |
| 9 | A Paused run resumes safely | **PASS** | Run set to Paused with one recorded retryable failure; the screen showed Recorded 1 / Needs retry 1 and named the case. Retry returned it to Completed |
| 10 | Retry does **not** duplicate native activities | **PASS** | Before retry: 1 fax on `DEMO-HL-1001`. After retry: **the same 1 fax, same id** `605f5fec…` |
| 11 | Recipient parties complete | **PASS** | Every activity carried exactly one `participationtypemask eq 2` party. Masks observed: 8 (sender), 9 (owner), 2 (recipient) |
| 12 | Communication History reflects the result | **PASS** | The case timeline showed the new Email and SMS at the top, above the Phase 6 activities, each with the platform's own status (`Draft`, `New SMS`) |
| 13 | No technical internals leak | **PASS** | Live sweep of both bulk screens for 13 leak classes: clean. One apparent hit was the arrears-bucket label `361-500` matching an HTTP-status pattern — business data, not a leak; the pattern has been tightened |
| 14 | Cloud SMS wording does not claim delivery | **PASS** | "DCP records each message and **QDB's own mechanism sends it**. Nothing on this screen reports whether a message reached anyone — that service does." No form of "deliver" appears on the run screen |

### The SMS contract, as written

Read back from the platform for both recipients:

```
faxnumber          +97400000000
qdb_message_body   Dear Valued Customer, your instalment of QAR 1,000 is overdue. …
qdb_sender         100000000
qdb_language       null
qdb_whatsapptemplate null
qdb_otp            null
regardingobjectid  the collection case
```

Exactly QDB's three confirmed SMS fields. The three WhatsApp-only fields are **null**, which is the
discriminator QDB confirmed — an SMS row carries none of them.

### Gate 8's limitation, stated plainly

A Dynamics web resource owns only the fragment of **its own** URL, and the host restores the iframe
at its original `src` when the top-level page reloads. So pressing F5 on `main.aspx` returns the
workspace to its default view — for a bulk run exactly as for a case.

**No run state is lost**: the population, cursor and recorded failures live on the run record, and
the officer reopens the run from the Bulk runs list with everything intact. What is lost is the
navigation position, and that is a property of the whole workspace inherited from Phase 5, not
something the bulk screen introduced.

---

## Defect found by this validation

**KI-96 — `Xrm.WebApi` does not return `@odata.count`.** The target count rendered **"0 recipients
will be contacted"** above a grid that was listing cases. The identical query through a same-origin
`fetch` returned `4363`; through the client API it returned `undefined`.

The same call backs the My Day and Dashboard KPI tiles, which have shown an em dash since Phase 5 —
read as "a later phase owns this" rather than as a defect. **436 automated tests passed over it**,
because the fake `Xrm` returned a count the real one never sends.

Fixed by counting over the transport, and the fakes no longer answer counts through `Xrm`, so a
regression to the client-API path fails. Verified live afterwards: 4,363 unfiltered, 2 narrowed.

---

## Regression re-run after deployment (KI-89 to KI-94)

| Ref | Re-checked on the deployed build | Result |
|---|---|---|
| KI-89 | The unified history loads and pages | **PASS** — 6 entries, no error panel |
| KI-90 | No `[object Object]` anywhere | **PASS** — live sweep clean on both bulk screens |
| KI-91 | Send pressed **twice** creates one record | **PASS** — platform holds 1 fax with 1 recipient party |
| KI-92 | The history re-reads after a send | **PASS** — 4 rows → 5 rows on the first press, still 5 on the second |
| KI-93 | No organisation unique name, no KI numbers, no platform error text | **PASS** — live sweep clean |
| KI-94 | The guard is not vacuous | **PASS** — the new bulk sweep was **proven to fail** by rendering a run id, and again by asserting before the screen had settled; both were fixed |

---

## Data hygiene

Cleaned by **derived** id, not by searching for text the platform composed:
`crm/scripts/qa-clean-bulk-run.mts` recomputes `uuidv5(runId | recipientId | channel)` for every
recipient in the frozen population, deletes those activities and the run, then **re-reads every one
of those ids** and fails if any still resolves.

```
=== 8/8 checks passed ===
```

Verified afterwards across the whole organisation:

| | |
|---|---|
| `qdb_communicationrun` rows | **0** |
| `fax` rows | **0** |
| `email` rows | **0** |
| `ARR-` cases preserved | **4,358** |
| `DEMO-` cases preserved | **5** |
| `P7-` templates preserved | **5** |
| Aisha Al-Mansouri (DEMO) | mobile `+97400000000`, `donotfax` false, `donotemail` false — unchanged |

**Zero transient QA residue.** Nothing was created that was not removed, and nothing that existed
before was altered.

---

## What this does not prove

- **That any message was delivered.** QDB's SMS/WhatsApp dispatcher is not installed on this
  organisation (KI-83). Every record created here is inert. **Cloud SMS/WhatsApp: Native Record
  Creation Proven — External Delivery Unproven.**
- **Anything about on-premises.** Nothing here touched an on-premises organisation.
  **Dynamics 365 CE 9.1 On-Prem — Compatible by Design; Phase 7 Runtime Validation Pending.**
- **Behaviour at scale.** The largest population confirmed was two. The refusal above the run
  ceiling was exercised by unit test, not against the book.
