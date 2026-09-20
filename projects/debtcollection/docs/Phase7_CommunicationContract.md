# Phase 7 — Communication Contract

**Status: discovery complete, 2026-09-19. Nothing implemented.** Every statement below is either read
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
