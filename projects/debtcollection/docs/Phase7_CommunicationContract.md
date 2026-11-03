# Phase 7 — Communication Contract

**Status: REVISED 2026-09-20 with QDB's confirmed implementation details.** The channel contracts below are no longer inferred — QDB supplied them from the existing production/on-prem solution. Warning Letters are **out of scope**. Bulk SMS and Bulk Email are **in scope**.

**Superseded sections:** §1.2 (WhatsApp discriminator) and §2.2 are replaced by §4 below; §1.6 (Warning Letters) is withdrawn.

---

## 0. Original discovery, 2026-09-19

Every statement below is either read
from `org5869857f` metadata/data or marked as a gap. Where the Phase 0 proposal
(`CommunicationArchitecture.md`) assumed something that turns out not to exist, this document says so
rather than carrying the assumption forward.

---

## 1. What exists on the organisation

### 1.1 SMS — a real QDB schema on `fax`, and nothing driving it

`fax` carries **31 custom `qdb_` attributes**, and they are a coherent, purpose-built SMS model:

| Column | Type | What it is |
|---|---|---|
| `qdb_message_body` | String | The message text |
| `qdb_message_length` · `qdb_totalsmsmessages` | Integer | Character count and segment count |
| `qdb_sms_id` | String | The external provider's message id — the delivery handle |
| `qdb_sms_number_2` | String | Recipient number |
| `qdb_sender` | Picklist `qdb_smssender` | **QDB** · **NFG** |
| `qdb_sendernumber` | Picklist `qdb_smssendernumber` | **+97444300000** |
| `qdb_smssendto` | Picklist `new_fax_qdb_smssendto` | **Customer** · **Prospect** · **Lead** · **Customer Contact** |
| `qdb_language` | String | Not a picklist — free text |
| `qdb_cifno` · `qdb_contact` · `qdb_leadref` · `qdb_prospectref` | Lookup | The four recipient kinds `qdb_smssendto` selects between |
| `qdb_otp` | String | One-time-password sends |
| `qdb_whatsapptemplate` | String | **The only WhatsApp-specific column on the entity** |
| `qdb_isalfurjansms` · `qdb_posticcsmssend` | Boolean | Origin flags for other QDB modules |

Native activity model underneath: `from` and `to` are **PartyList** (activity parties),
`regardingobjectid` is a polymorphic lookup, `directioncode` is Boolean, plus `subject`, `description`,
`statecode`/`statuscode`, `ownerid`.

**What is not there.** On `org5869857f`:

- **0 fax rows.** No example of the convention in use.
- **0 workflows** with `fax` as primary entity.
- **1 plugin step on `fax`** — `LeadManagement.SendFax`, which is
  `Microsoft.Dynamics.LeadManagement.Plugins.PreOperationSendFax` on the **`Send`** message. That is
  Microsoft's own out-of-box handler, not a QDB dispatcher.
- Every SMS-related workflow and plugin assembly in the organisation belongs to **Microsoft**
  (Omnichannel, Field Service, Sales Insights). Searched 400 workflows and 200 assemblies.

So the schema QDB uses for SMS is present; **the mechanism that sends is not installed here**.

### 1.2 WhatsApp — no discriminator can be established from evidence

`qdb_whatsapptemplate` is the only WhatsApp-specific column, which *suggests* the convention is
"populated ⇒ WhatsApp, empty ⇒ SMS". **That is an inference, not evidence**, and with zero rows there
is nothing to confirm it against. Per the authorisation, it is not being invented — it is **KI-78**.

### 1.3 Email — standard Dynamics, unused here

`email` has 40 custom attributes, but they are almost entirely **Microsoft's** (`msdyn_*` for
Copilot, sentiment, classification) plus QDB columns belonging to other modules — `qdb_appointment`,
`qdb_events`, `qdb_partner_bank`, `qdb_reports` (which points at the *training/trade report* entity,
not a letter), `qdb_category`, `qdb_onetimeemail`, `qdb_attachmentshowinportal`.

**0 email rows.** No DCP-relevant customisation, and no QDB email-routing automation found. Standard
Dynamics Email with native activity-party semantics is therefore the correct target, exactly as the
boundary requires — but its behaviour in QDB production cannot be observed from here.

### 1.4 Templates — provisioned, empty

`qdb_communicationtemplate` exists with the **full DCP schema** already provisioned by Phase 1–3:
`qdb_code`, `qdb_name`, `qdb_channel`, `qdb_language`, `qdb_subject`, `qdb_body`, `qdb_placeholders`,
`qdb_approvalstatus`, `qdb_approvalrequired`, `qdb_freetextallowed`, `qdb_editingallowed`,
`qdb_attachmentsallowed`, `qdb_customertype`, `qdb_producttype`, `qdb_strategyid`,
`qdb_activitytypeid`, `qdb_effectivefrom`/`to`, `qdb_version`, `qdb_isactive`,
**`qdb_externaltemplateref`**. **0 rows.**

`qdb_externaltemplateref` matters: it is the natural home for the WhatsApp template name that
`fax.qdb_whatsapptemplate` expects, which is how a DCP template can point at a provider-registered
WhatsApp template without DCP owning that registry.

Other template stores exist and are **not** DCP's: `qdb_emailtemplate` (name/subject/template/record
entity, 0 rows), `qdb_document_template` (term-sheet document generation, 0 rows),
`qdb_legaltexttemplate`, `qdb_lodgment_template`.

**Language:** `qdb_language` exists on the template as a picklist and on `fax` as a **string**. Whether
Arabic/English is one row per language or one row carrying both is **not** established by evidence —
**KI-80**.

### 1.5 Contact Hold — the authoritative source does not exist

This is the most consequential finding.

`CommunicationArchitecture.md` §3.1 assumes contact/account carry `qdb_stopcontact`,
`qdb_deceasedflag`, `qdb_dateofdeath`, `qdb_deceasedsource`, `qdb_specialhandling`. **None of them
exists.** What contact and account actually have is the native Dynamics set: `donotemail`, `donotfax`,
`donotphone`, `donotpostalmail`, `donotbulkemail`, `donotbulkpostalmail`, `donotsendmm`,
`creditonhold`, `onholdtime`, `lastonholdtime`.

`qdb_platformconfiguration.qdb_contactholdrulesetcode` is **null** on both configuration rows, so no
Rule Engine ruleset is nominated either.

The deceased facts that do exist live on the **snapshot**, not the customer:
`qdb_delinquencysnapshot.qdb_isdeceasedperqcb`, with `qdb_exemptionpercentage` and
`qdb_exemptionamount`. Those are the 724 imported flags, and they are **MIS data attributes only** —
the authorisation forbids turning them into Phase 9 behaviour, and this contract does not.

**Consequence, per §6 of the authorisation: fail closed.** There is no authoritative Contact Hold
source, so the send path must **refuse** rather than default to allow. The native `donot*` flags are a
genuine platform control and will be honoured as a *necessary* condition, but they are marketing
contact preferences and must not be presented as QDB's Collection Contact Hold policy. **KI-79.**

### 1.6 Warning Letters — mechanism present, content absent

The **Report Engine is installed on this organisation** — `qdb_reportdefinition`, `qdb_reportlayout`,
`qdb_reportversion`, `qdb_reportexportsetting`, `qdb_reportexecutionlog`, `qdb_reportribbonplacement`,
`qdb_reporttransformation`, `qdb_reportcache`, `qdb_reportsecurity`, `qdb_reportdatasource` and more.
That is the engagement recorded as RPT-ENG-001, and it is the obvious candidate mechanism.

`qdb_reportdefinition` holds **13 definitions, all samples and demos** — *Sample — Overdue Facilities*,
*Demo — everything at once*, *Loan Origination Lineage* and similar. **No warning letter, demand
notice or collection letter exists.**

The 56 SSRS reports in the organisation contain **no** name matching letter / warning / notice /
demand / collection.

So: the mechanism plausibly exists, the letter does not, and **which mechanism QDB considers
authoritative for a legally-significant customer letter is a QDB decision — KI-81.** Per §8 this is
isolated as its own work package so it cannot block SMS/WhatsApp/Email.

### 1.7 Authorisation — QDB's privilege convention

`qdb_privsendsms` exists (0 rows) alongside a family of `qdb_priv_*` marker entities
(`qdb_priv_cad`, `qdb_priv_credit_risk_unit`, `qdb_privcustinquiry`, …). QDB's convention is a
**privilege-marker entity whose access is granted through security roles**. `qdb_privsendsms` is
therefore the organisation's existing, authoritative "may this user send an SMS" control point, and
DCP should check it rather than inventing a privilege. **To be confirmed — KI-82.**

### 1.8 `qdb_communication` — exists, and is not ours

`qdb_communication` **already exists** as a custom **activity** with exactly `qdb_message` and
`qdb_partnerbank`. It belongs to the Partner Bank module. 0 rows.

The authorisation says *do not create* `qdb_communication`. It is not being created — and it is
equally not being **repurposed**, because it is another module's table and overloading it would be the
same mistake as repurposing `qdb_relatedrecordtype`.

---

## 2. The contract

### 2.1 Canonical request — one shape, three channels

```
CommunicationRequest
  channel        : 'SMS' | 'WhatsApp' | 'Email'
  caseId         : the collection case it is regarding
  recipient      : { kind: 'Customer' | 'CustomerContact', id, table: 'contact' | 'account' }
  templateCode?  : a qdb_communicationtemplate code
  subject?       : email only
  body           : rendered text
  language?      : as configuration expresses it
  activityId?    : the collection activity this was initiated from
```

The domain decides **whether**; the service translates to the native record; the adapter writes it.
React composes none of it — the Phase 6 layering carries forward unchanged.

### 2.2 Channel → native record

| Channel | Entity | Written |
|---|---|---|
| SMS | `fax` | `qdb_message_body`, `qdb_sender`, `qdb_sendernumber`, `qdb_smssendto`, `qdb_language`, recipient lookup, `regardingobjectid` → case, `to` party list |
| WhatsApp | `fax` | as SMS **plus** `qdb_whatsapptemplate` from the template's `qdb_externaltemplateref` — **pending KI-78** |
| Email | `email` | native `subject`, `description`, `from`/`to` activity parties, `regardingobjectid` → case |
| Warning letter | **undecided** | **blocked on KI-81** |

**DCP creates the record and stops.** No gateway, no HTTP to a provider, no `nodemailer`. Delivery is
QDB's mechanism — which, on this organisation, is not installed (§1.1), and that is the central risk.

### 2.3 The send gate — server-side, fail closed

Evaluated in the domain/service layer on every send, manual or system, in this order:

1. Customer resolvable
2. Recipient address present for the channel
3. **Contact Hold** — native `donot*` respected **and** the QDB hold source consulted. With no
   authoritative source configured, this step **refuses** (`contact_hold_unverifiable`). It does not
   pass by default.
4. Channel available for the organisation
5. Template approved, or free-text privilege held
6. Authorisation — `qdb_privsendsms` for SMS/WhatsApp, native `email` privileges for email

Every refusal carries a stable code and the reason. React may grey a button; it never decides.

### 2.4 History — read model, no second copy

A paged, server-filtered union over `fax` and `email` (and the letter activity once KI-81 resolves),
projected to one row shape: channel · direction · recipient · subject/summary · sent date · status ·
case · delivery reference (`qdb_sms_id` where present). Phase 4/5 paging contract applies —
server-side filter/sort/page, opaque continuation, virtualization, continuation reset and
stale-response suppression. **Nothing is persisted to make the UI easier.**

### 2.5 Idempotency — must be re-established, not copied

ADR-DCP-19 used a client-chosen primary key with `If-None-Match: *` on `qdb_collectionactivity`.
`fax` and `email` are **native activity entities** and it is not established that they accept the same
upsert-by-id semantics. **This must be spiked against the organisation before any send path is
built** — assuming it carries over is exactly the kind of assumption Phase 6 punished. Sending a
duplicate SMS is materially worse than a duplicate note, because the customer receives it twice.

---

## 3. Gaps requiring QDB confirmation

| Ref | Gap | Blocks |
|---|---|---|
| **KI-78** | How SMS and WhatsApp are distinguished on `fax`. `qdb_whatsapptemplate` is a plausible discriminator with zero rows to confirm it | WhatsApp only; SMS can proceed |
| **KI-79** | No authoritative Contact Hold source exists. Send fails closed until one is nominated | **All outbound sends** |
| **KI-80** | Arabic/English template model — one row per language, or one row with both | Templates |
| **KI-81** | Which mechanism is authoritative for warning letters, and how the document associates to case/customer/activity | Warning letters only |
| **KI-82** | Whether `qdb_privsendsms` is the intended authorisation control point | Authorisation design |
| **KI-83** | **QDB's SMS/WhatsApp dispatch mechanism is not installed on `org5869857f`.** A created `fax` row will be persisted and nothing will send it. End-to-end delivery cannot be proven here | Runtime proof of delivery |

**KI-79 and KI-83 are the two that shape the phase.** The first means the gate must refuse by default;
the second means Phase 7 can prove *"the correct native record is created, bound and read back"* but
**cannot** prove *"a message reached a customer"* on this organisation. That distinction must be
stated in every status line rather than blurred.

---

# PART TWO — the confirmed contract (QDB, 2026-09-20)

Everything above is the discovery record and is retained for traceability. Where it conflicts with
this part, **this part wins**.

## 4. Channel contracts — confirmed by QDB, not inferred

QDB has an existing **Custom Workflow Activity on-prem** that sends SMS and WhatsApp from the Dynamics
**Fax** activity. DCP's entire responsibility is to create the correct Fax row. **DCP builds no
dispatcher, no provider integration, and does not reverse-engineer or replace the CWA.**

### 4.1 SMS — exactly three fields

| Purpose | Fax field |
|---|---|
| Mobile number | `faxnumber` |
| Message body | `qdb_message_body` |
| Sender | `qdb_sender` |

**No other SMS field is written.** The discovery in §1.1 catalogued `qdb_sms_id`, `qdb_sendernumber`,
`qdb_smssendto`, `qdb_message_length`, `qdb_totalsmsmessages` and the recipient lookups — those belong
to QDB's own mechanism and other modules, and DCP does not populate them. Writing a field because it
exists is how a contract drifts from the implementation that owns it.

Native context is preserved where the existing implementation supports it: `regardingobjectid` → the
collection case, `subject`, and the `to` activity party.

### 4.2 WhatsApp — the same entity, three more fields

| Purpose | Fax field |
|---|---|
| Mobile number | `faxnumber` |
| Message body | `qdb_message_body` |
| Sender | `qdb_sender` |
| Language | `qdb_language` |
| WhatsApp template | `qdb_whatsapptemplate` |
| OTP | `qdb_otp` |

`qdb_language`, `qdb_whatsapptemplate` and `qdb_otp` are **WhatsApp-only**. That is the discriminator,
and it is now **confirmed by QDB rather than inferred from the schema** — KI-78 is closed on that
basis. An SMS row carries none of the three; a WhatsApp row carries them.

### 4.3 Email — standard Dynamics, nothing custom

DCP creates a standard `email` activity and stops. QDB's existing email mechanism sends it.

Native semantics are preserved rather than replaced: `from`/`to` as **ActivityParty**,
`regardingobjectid` → the collection case, native `subject` and `description`. **No SMTP, no Graph, no
Exchange, no custom DCP email entity.**

### 4.4 The approved architecture

```
Collection Workspace
  → Communication domain/service      (decides; canonical request)
  → Dynamics Fax / Email activity     (DCP's last step)
  → existing QDB Custom Workflow Activity / email mechanism
  → SMS · WhatsApp · Email provider
```

**Status language for this phase, used everywhere without softening:**
**Record Creation Proven — Delivery Unproven on the Cloud organisation.** The QDB dispatcher exists
on-prem and is simply absent from the Cloud development org, so the Cloud proof is that DCP produces
the correct contract and it reads back. External delivery is an on-prem deployment test (KI-83).

## 5. Single-customer communication

From the Case or Customer context an authorised collector initiates SMS, WhatsApp or Email. Recipient
details come from the established **HL Contact / BFD Account** context through the existing customer
read path — **no duplicate customer master**. The officer reviews the recipient before submitting.

## 6. Bulk SMS and Bulk Email

**Bulk WhatsApp is out of scope** and is not built.

### 6.1 Selection — two modes, neither loads the population

| Mode | What is held |
|---|---|
| **Selected records** | An explicit, bounded set of case ids the officer picked |
| **All matching filter** | The **filter definition** — never the rows. The population is resolved server-side, page by page, at execution |

The large-data rule is absolute here: a bulk run over the whole book must never transfer the book to
the browser to be iterated.

### 6.2 One native record per recipient

Each eligible recipient produces **its own** Fax or Email activity, because that is what QDB's sending
mechanism consumes. **No single record containing many customers.**

### 6.3 Execution — bounded batches, resumable, idempotent

```
run → resolve population page (bounded)
    → for each recipient: eligibility gate → create native record at a DETERMINISTIC id
    → checkpoint → next page
```

**Idempotency is structural, not procedural.** Each recipient's activity id is derived
deterministically from the run and the recipient — `uuidv5(bulkRunId + recipientId)` — and created
with `If-None-Match: *`. The consequences fall out for free:

| Scenario | Why it is safe |
|---|---|
| Double-click initiation | Same run id → same recipient ids → platform refuses the second create |
| Request retry after an uncertain response | Same id → refused → reported as already sent |
| Interrupted batch, then resume | Completed recipients return `created: false` and are skipped |
| Same customer twice in the population | Same recipient id → one record |
| Partial batch failure | Only the failed recipients lack a record; a resume creates exactly those |

Disabling a button is **not** the mechanism, exactly as in ADR-DCP-19. It is a courtesy on top.

**`fax` and `email` are native activity entities and it is NOT established that they accept
upsert-by-id.** That must be spiked against Dataverse before any send path is built (WP3). A duplicate
SMS reaches the customer twice, so this is the single highest-risk assumption in the phase.

### 6.4 The durable run header — proposed, not created

Safety above needs no new entity. **Resumability after a browser close does**, because the population
definition and progress must survive the session. No existing mechanism can carry it (KI-84), so a
minimal entity is **proposed for approval** and nothing is created until it is granted.

## 7. Eligibility — identical for single and bulk

A bulk operation must not bypass a restriction that applies to one send. The same gate runs per
recipient in both paths.

KI-79 remains open: **no authoritative QDB Collection Contact Hold source exists.** Until QDB names
one, the gate:

- **honours native Dynamics channel restrictions** — `donotfax` for SMS/WhatsApp, `donotemail` for
  Email — as a necessary condition;
- **does not call that QDB Collection Contact Hold**, because it is a marketing preference;
- **does not use `creditonhold`** as a generic communication hold, there being no evidence for it;
- **does not** read the 724 deceased MIS flags into Phase 9 behaviour;
- stays **pluggable**, so the authoritative rule drops in without the call sites changing.

## 8. Templates

`qdb_communicationtemplate` is the DCP configuration entity for all three channels. Synthetic
development templates are marked **`P7-`** and are never presented as approved QDB wording. No
production message text is hard-coded in React. `qdb_externaltemplateref` carries the
provider-registered WhatsApp template name that `fax.qdb_whatsapptemplate` expects.

## 9. Unified Communication History

A read model over the native records — **`fax` (SMS and WhatsApp) and `email`**. `qdb_communication`
is not created and not repurposed. Server-side filter, sort and page with an opaque continuation and
bounded virtualization; a filter change resets paging and suppresses stale responses. **Nothing is
copied into another table for display convenience.**

## 10. Warning Letters — out of scope

**Deferred / Out of Scope by QDB decision, 2026-09-20.** No Report Engine configuration, no letter
templates, no UI, no SSRS integration, no document generation, no entities or fields, and no further
investigation time. Recorded as a scope decision, not an unresolved blocker (KI-81).
