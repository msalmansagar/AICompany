# DCP — Communication Architecture (Phase 0)

**Status:** proposal · 2026-09-17 · Master Prompt §32–40, Correction Prompt §40. Non-destructive.
Physical entities: `EntityDictionary.md` §E; contracts: `APIContracts.md` §4.

---

## 1. Decision — reuse QDB's existing communication mechanisms

| Channel | CRM transaction entity | Existing QDB mechanism | Phase |
|---|---|---|---|
| SMS | `fax` | QDB's Fax-based SMS sending — **trigger mechanism `TBD — Requires QDB Confirmation`** (workflow? plugin on create? a field convention on `fax`?) | 1 |
| WhatsApp | `fax` | Same mechanism, channel distinguished on the fax row (how — `TBD`) | 1 (MP: unconditional) |
| Email | `email` | Dynamics Email entity + QDB's existing email routing | 1 |
| Phone call | `qdb_collectionactivity` (type = Call) | Logged, not dispatched | 1 |
| Official letter | Report Engine → document; status on an activity | Deck marks it Phase 2 | 2 |

Consequences:
- **`msst_dcpcommunication` retires.** No custom communication transaction entity (MP §32). Its 6 plugin
  steps (subject composer, immutability ×2, audit ×2 … ) become moot.
- **`nodemailer` and the planned `ISmsGateway` are withdrawn** from `dependencies.md` — sending is a CRM
  record creation, delivery is QDB's existing mechanism. `liquidjs` stays for `{{placeholder}}` rendering.
- The **router no longer enforces stop-contact** (BRD FR-067/068/120 wording is superseded): the
  Communication Service evaluates the **Contact Hold / Special Handling** gate (§3.1) on every send —
  server-side, on the manual and automated paths alike — and the plugin `StatusTransitionValidator`
  remains the defence-in-depth backstop, blocking any case move into a contact-bearing state for a held
  customer. Two independent controls, neither in a gateway that the web resource bypasses.
- If QDB's fax/email mechanism lacks a home for *why a send was refused*, DCP proposes `qdb_blockreason`
  (and `qdb_channel`, `qdb_templatecode`, `qdb_deliverystatus`) as `qdb_` columns on `fax`/`email` — only
  after the existing schema is inspected (`TBD`). A refused send is **not** a fax/email row at all if the
  refusal happens before creation; then the refusal is recorded on `qdb_crmlogs` (system sends) or
  surfaced to the user (manual sends) and, if a business rule demands it, as a `qdb_collectionactivity`
  with outcome *Blocked*.

---

## 2. One Communication Service (MP §36–37)

```
   USER-INITIATED                                  SYSTEM-INITIATED
   Communication Center (React)                    Strategy Action · PTP reminder · Broken PTP ·
        │                                          SLA / escalation · Process Engine · background sync
        │  CommunicationRequest                          │  CommunicationRequest (same type)
        └─────────────────────┬──────────────────────────┘
                              ▼
                 CommunicationService  (shared package; ONE implementation)
                   validateCommunication(request)   ── the chain in §3, in this order, all mandatory
                   previewTemplate(templateCode, context, language)
                   sendCommunication(request)        ── creates the CRM row, never talks to a gateway
                   getAvailableTemplates(context)
                   getCommunicationHistory(subject)
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        fax (SMS)       fax (WhatsApp)     email
              └───────────────┴───────────────┘
                              ▼
               QDB's existing dispatch mechanism (TBD)  → delivery status back on the row (§6)
```

Where it runs: **in the browser** for manual sends (the user's CRM session creates the fax/email row —
CRM security applies) and **in the Integration Service** for system sends (service identity, same
package, same validation chain). Both paths call the same TypeScript module; the plugin layer adds the
non-bypassable floor (§3, row "security").

---

## 2a. The Communication Service is the send authority (KI-35)

Because collection actions, promises and the record of a communication share one table
(`qdb_collectionactivity`, Master Prompt §23/§26), a CRM entity privilege can no longer distinguish
"may log a call" from "may send a message". The consequence is architectural, not cosmetic, and it is
answered here rather than in the role matrix:

**Nothing sends except through the Communication Service, and the service authorises every send
itself, server-side.** Before it creates the `fax` or `email` row that performs the send it checks,
in this order:

1. the caller's privilege on the **native `fax` / `email` activity** — the record the send actually
   creates, and the platform's own control point for it;
2. the **Contact Hold** ruleset for this customer (ADR-DCP-11), evaluated server-side, which is what
   stops a send to someone who must not be contacted;
3. the template / free-text role claim, unchanged from Phase 0.

A background job reaches the same service through the same method. There is no second path, so there
is nothing to bypass — which is the point of §3's validation chain.

What this does **not** do is give `qdb_collectionactivity` privileges any send meaning: a user with
Create on that table can record that they called someone, and nothing more. See SecurityModel §5a.

**Status:** architecturally resolved. The remaining question for QDB is narrower — whether privilege
on the native `fax` / `email` activities is an acceptable control point in their environment (KI-35).

---

## 3. Validation chain (MP §38) — background jobs cannot skip it

| # | Check | Source of truth | Outcome on failure |
|---|---|---|---|
| 1 | Customer exists and is resolvable (contact / account via Platform Mapping) | CRM | refuse — `customer_not_found` |
| 2 | Recipient address valid for channel (mobile / email present, format) | CRM customer fields (masked to the user, not to the service) | refuse — `recipient_invalid` |
| 3 | **Contact Hold / Special Handling** — one evaluation over the whole deceased / special-handling fact set (§3.1) | `IRuleEngine.evaluateContactHold(...)`; ruleset named by `qdb_platformconfiguration.qdb_contactholdrulesetcode`; facts from contact/account and the latest snapshot | refuse — `contact_hold`, carrying the rule that held it; logged |
| 4 | **Estate / heir communication approval**, where the hold rule permits contacting a third party | Process Engine — Senior Manager approval (BRD FR-100) | refuse unless approved — `estate_contact_unapproved` |
| 5 | Channel available for this org/platform | `qdb_platformconfiguration` (sms/whatsapp/email entity set, feature flags) | refuse — `channel_unavailable` |
| 6 | Consent where required (SMS/WhatsApp; PDPPL) | existing QDB consent capability or `qdb_consent` — `TBD` | refuse — `consent_missing` |
| 7 | Approved template required (free text only with privilege) | `qdb_communicationtemplate.qdb_approvalstatus`, `qdb_freetextallowed` | refuse — `template_not_approved` |
| 8 | Free-text permission | CRM privilege / role claim "Send Free-Text Message" (BRD FR-069) | refuse — `free_text_forbidden` |
| 9 | Approval requirement (template or activity type says so) | Process Engine (`IProcessEngine`) | park as *Awaiting Approval* |
| 10 | Applicable business rules (bucket "no automated contact", >2000 DPD policy, quiet hours…) | Rule Engine (`IRuleEngine`) | refuse — `policy_blocked` |
| 11 | User / system security authorisation | CRM privileges on `fax`/`email` + case; service identity for system sends | refuse — `unauthorised` |

Every refusal carries a stable code, the correlation id and the blocking rule; system-path refusals are
written to `qdb_crmlogs`. The hold is duplicated as a **plugin** guard on case transitions so that
a customer held mid-flight cannot be moved into a contact-bearing state by any path (already built:
`StatusTransitionValidator.ContactBearingStates`).

### 3.1 Contact Hold / Special Handling (F6 decision, 2026-09-17)

Deceased customers are a distinct Collection population and the platform must be able to stop contact the
moment a deceased indicator is confirmed. What the platform must **not** do is decide the policy itself.

**Architecture (decided).** A confirmed deceased indicator must be *capable of immediately triggering* a
Contact Hold / Special Handling rule that runs **before any automated or manual communication proceeds**.
The hold is a single Rule Engine evaluation — `IRuleEngine.evaluateContactHold` — invoked by the one
Communication Service at chain step 3, so a React send and a background job pass through the identical
gate. No new engine and no new entity: the ruleset is named by
`qdb_platformconfiguration.qdb_contactholdrulesetcode` and maintained as configuration.

**Policy (not decided).** Whether **QCB DEAD alone** is sufficient to establish the hold is a business and
compliance decision — `TBD — Requires QDB Confirmation`. It is deliberately **not** encoded as a default in
application logic, in the plugin, or in seeded configuration. Until QDB confirms, the shipped ruleset
carries no deceased policy; the facts below are merely made available to whatever rule QDB approves.

Facts the hold ruleset can read (the model supports them; the rule that combines them is configuration):

| Fact | Source |
|---|---|
| QCB deceased status | MIS snapshot (`qcbDeceasedStatus`) / mapped customer column |
| QDB deceased status, where available | contact/account `qdb_deceasedflag`, `qdb_dateofdeath`, `qdb_deceasedsource` |
| Exemption state — applied / not applied / none, percentage, amount | MIS snapshot |
| Legal state | legal activity / existing QDB legal record (`TBD — Requires QDB Confirmation`) |
| Insurance / estate processing state | Deceased & Insurance process instance |
| Special handling | contact/account `qdb_specialhandling` |
| Contact restriction / hold already recorded | contact/account `qdb_stopcontact` (+ reason, date) |
| Dedicated strategy / process routing | `qdb_collectionstrategy` segmentation; Process Engine route |

Outcomes the gate returns: **Allow** · **Hold — no contact** · **Hold — approval required** (estate/heir
contact, chain step 4) · **Route to special handling** (Deceased/Insurance Review). Every non-Allow outcome
carries the rule identifier, is written to `qdb_crmlogs` on the system path, and is shown with its
reason on the manual path.

**Enforcement, not presentation.** The gate is server-side inside the shared Communication Service; the
`StatusTransitionValidator` plugin is the defence-in-depth backstop for case status transitions. React may
grey a button — it may never be the thing that stops a send.

---

## 4. Communication Center / Composer (MP §33–34) — UX outline

Opened from a case, a customer, a queue row, or the timeline. Never leaves the workspace.

```
 ┌ Communication Center ─────────────────────────────────────────────────────────┐
 │ Channel  [SMS] [WhatsApp] [Email]           Language [العربية | English]        │
 │ Recipient  ▾ Customer (masked mobile)  ▾ Guarantor/heir (if permitted)         │
 │ Template   ▾ approved templates for channel · language · customer type ·       │
 │              product · activity type · strategy   (free text only if privileged)│
 │ Subject    [auto from template · editable if template allows]                   │
 │ Message    [rendered body — placeholders resolved, RTL for Arabic]              │
 │ Attachments [+]  (email only; template must allow)                              │
 │ Preview ─────────────────────────────────────────────────────────────────────   │
 │  ✓ contact hold clear  ✓ consent on file  ✓ template approved  ⚠ approval req. │
 │                                                     [Cancel]   [Send] / [Submit for approval] │
 └────────────────────────────────────────────────────────────────────────────────┘
```

Behaviour: validation runs on open and again on Send (§3); a refusal explains *which* rule blocked;
sending creates the fax/email row regarding the case and returns to the timeline with the new entry;
"Send" is disabled (not hidden) for a held customer with the reason shown. **Disabling the button is
presentation only** — the Communication Service re-evaluates the hold server-side on every call, so a
console call, a replayed request or a background job meets the identical gate. UI hiding is never the
control.

---

## 5. Templates (MP §39)

`qdb_communicationtemplate`: code · name · channel · language · subject · body · customer type · product ·
activity type · strategy · effective from/to · approval status · version · active · free-text allowed ·
editing allowed · approval required · attachments allowed. Arabic and English rows (or one row with
both bodies — decide in Phase 1). Placeholders (rendered by `liquidjs`, resolved from the canonical
Customer / Facility / Case / PTP models, never from raw CRM columns):

`{{CustomerName}} {{FacilityNumber}} {{ArrearsAmount}} {{LoanBalance}} {{DPD}} {{DueDate}} {{PTPAmount}} {{PTPDate}}`

Template creation/activation requires Compliance or Management approval (BRD FR-071/117) via the
Process Engine; changes are audited natively. **Reuse check:** QDB has an `EmailEditor` project
(`D:\QDB\Projects\EmailEditor`) — whether it already provides a template store/editor covering SMS and
WhatsApp is `TBD — Requires QDB Confirmation`; if yes, `qdb_communicationtemplate` becomes a thin
reference or is dropped.

---

## 6. Delivery status

Delivery status is whatever QDB's existing mechanism writes back on the fax/email row (OOB `statuscode`
on `email`; `fax` statuses; any `qdb_` status column the mechanism already uses — `TBD`). DCP reads it;
it does not poll gateways. Where a channel offers no delivery feedback (letters), the activity holds the
status. BRD FR-072 (Delivered / Failed / Opened) is satisfied to the extent the mechanism reports it.

---

## 7. Unified Communication History (MP §40; KI-45 confirmed 2026-09-17)

The Collection Officer sees **one communication history**. They should never have to open Fax, then
Email, then a document library to work out what was said to a customer. Physically those are three
different mechanisms; that is an implementation detail the workspace hides.

**The unified history is a read/aggregation model, not a source of truth.** Nothing is copied into a
Collection-owned table to make the timeline work.

### 7.1 Where each channel actually lives

| Channel | Physical record | Who delivers it |
|---|---|---|
| SMS | **`fax` activity** | the existing QDB workflow that fires on Fax create |
| WhatsApp | **`fax` activity** | the same existing QDB workflow |
| Email | **`email` activity** | standard Dynamics / QDB email processing |
| Warning Letter | the **approved QDB document / report capability** | QDB's existing document mechanism |

DCP creates the record and stops. It does not talk to a gateway, and it does not reimplement
delivery. Sending is:

    Workspace or automation
      → Communication Service: authorisation + Contact Hold
      → create fax / email / letter record
      → existing QDB mechanism delivers

### 7.2 Entities DCP must NOT create

No `qdb_communication`, no `qdb_collectioncommunication`, no SMS entity, no WhatsApp entity, no email
entity — **not even to make the timeline easier to query**. A second copy of a message is a second
version of the truth, and the first thing that happens is that the two disagree.

`qdb_collectionactivity` stays what it is: the Collection **operational/action** record. A separate
activity is not created merely to mirror a send; it exists when the configured collection process
needs an action record (a strategy step that must be completed, a follow-up, a supervisor review).

### 7.3 Identifying DCP-originated communications

**Not every fax or email in the organisation belongs to Debt Collection**, and the history must not
pretend otherwise. Communications are attributed to DCP through the relationship that already exists
rather than through a duplicated record:

| Signal | Preference |
|---|---|
| `regardingobjectid` = `qdb_collectioncase` | **first choice** — native, already indexed, no new column |
| `qdb_collectionactivity.qdb_relatedrecordtype` / `qdb_relatedrecordid` pointing at the fax/email | where an action record exists for the send |
| A minimal DCP correlation marker on the native record | **only if neither of the above can carry it** — the smallest possible reference, never a copy of the message |

Which of these QDB's environment actually supports is `TBD — Requires QDB Confirmation` (§9). The
rule that does not change: **correlate, never duplicate.**

### 7.4 What the history shows

Per entry, where the source provides it:

Date/time · channel (SMS / WhatsApp / Email / Warning Letter) · customer · facility or account ·
collection case · related collection activity · recipient · sender · subject or title · message or
letter preview where permitted · delivery status · created by / initiated by · manual versus
automated · related document · failure indication.

A field the source does not carry is shown as absent, not invented. Delivery status in particular
depends on what the existing QDB mechanism reports (§9).

### 7.5 Filtering

The officer can filter and search by channel, date range, customer, facility/account, collection
case, status, and communication type. Filtering happens server-side: the workspace must not pull a
customer's whole history to filter it in the browser.

### 7.6 The Communication Service is thin

It orchestrates and aggregates. It does not deliver, and it does not store:

1. validate Contact Hold (server-side, ADR-DCP-11);
2. authorise the send (§2a);
3. prepare and create the native `fax` / `email` / letter record;
4. establish the case / activity correlation (§7.3);
5. retrieve DCP-originated communications across the sources;
6. normalise them into one **Communication History DTO** (§7.4);
7. return the unified history to the React workspace.

### 7.7 Security

Aggregation does not bypass CRM security. A user sees only communications they are entitled to see,
enforced server-side per source — the service reads as the caller, never with elevated rights to
"complete" a timeline. See SecurityModel §5a and §5b.

### 7.8 Where it appears

A **Communications** tab in the Collection Workspace, showing one chronological stream with a clear
channel icon and status per row, available on the Collection Case view, Customer 360 and the
facility/account view, subject to permission.

---

## 8. Sequence — system-initiated send (PTP reminder)

```
 background job (T-1 day)      Integration Service
   │  find PTP activities due tomorrow (paged)            ─ CRM read (service identity)
   │  for each: build CommunicationRequest(channel from strategy action / template)
   │  CommunicationService.validateCommunication  ─ chain §3 (contact hold, consent, policy …)
   │     refused → qdb_crmlogs (existing) + (optional) activity outcome Blocked
   │  CommunicationService.sendCommunication      ─ create fax/email regarding the case
   │  QDB mechanism dispatches (TBD)               ─ status back on the row
   └  timeline shows the send; officer sees it next morning
```

The manual path is identical from `validateCommunication` onward.

---

## 9. Open items

**The communication architecture itself is confirmed and closed (KI-45, 2026-09-17).** What remains
below is implementation detail of the mechanisms DCP reuses — none of it changes the model in §1, §2a
or §7, and none of it is a reason to create a communication entity.

| Item | Status |
|---|---|
| **Exact `fax` fields that distinguish SMS from WhatsApp** (which column the existing QDB workflow reads) | `TBD — Requires QDB Confirmation` |
| **The DCP-origin marker**, if `regardingobjectid` = collection case cannot carry attribution on its own (§7.3) | `TBD — Requires QDB Confirmation` |
| **Warning Letter physical source** — which approved QDB document/report capability produces and stores the letter | `TBD — Requires QDB Confirmation` |
| **Delivery-status fields** available from the existing QDB fax/email mechanisms (§6, §7.4) | `TBD — Requires QDB Confirmation` |
| **Whether QCB DEAD alone establishes a Contact Hold** (F6 — business/compliance policy, not architecture) | `TBD — Requires QDB Confirmation` |
| Which legal / estate record supplies the *legal state* fact to the hold ruleset | `TBD — Requires QDB Confirmation` |
| Which column on the customer master signals a Contact Hold (KI-44) | `TBD — Requires QDB Confirmation` |
| Existing consent / opt-out capability | `TBD — Requires QDB Confirmation` |
| EmailEditor as template engine | `TBD — Requires QDB Confirmation` |
| Multi-recipient (guarantor / heir) — custom activities have no PartyList | design in Phase 7 (lookups per recipient) |
| WhatsApp BSP / template pre-approval / 24-hour session window | procurement, outside DCP code |

Each open item has a safe default: **do not invent the field, do not create the entity, surface the
information as unavailable.** A missing delivery status is shown as unknown; it is never inferred.
