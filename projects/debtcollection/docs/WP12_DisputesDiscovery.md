# WP12 — Disputes & Complaints, read from the organisation

Read-only discovery against `org5869857f`, 2026-09-21, via `crm/scripts/probe-disputes.mts`.
Nothing was created, changed or populated.

Built around WP11's lesson: **QDB may not use the word.** Restructuring was modelled as *Facility
Amendment* and a name sweep missed it. So this searched entity and display names, **option-set
labels**, the Process Engine's content, and native Dynamics Case management.

The answer was not in an entity name. It was in **108 custom columns on `incident`**.

---

## 1. Customer Complaint — an established, operational QDB process

**QDB's complaint process is native Dynamics Case (`incident`), heavily extended.** It is not
something DCP should build, and not something DCP should duplicate.

### The complaint model

A category taxonomy, as individual columns:

`qdb_category_delayed_procesing` · `qdb_category_financing_delay` ·
`qdb_category_documentation_requirements_issue` · `qdb_category_incomplete_information_given` ·
`qdb_category_process_related` · `qdb_category_product_issue` · `qdb_category_product_related` ·
`qdb_category_qdb_staff` · `qdb_category_staff_issue` · **`qdb_category_rescheduling_issue`** ·
`qdb_category_compliment_other` · `qdb_complaint_other`

Handling and governance: `qdb_dept_complaint_resolution`, `qdb_qa_resolution_comments`,
`qdb_casual_category`, `qdb_casual_category_risk`, `qdb_case_category`, `qdb_requesttype`.

### Its own lifecycle — 12 statuses, and DCP must not copy them

> Saved (not submitted) → Submitted → In Progress → On Hold → Waiting for Details → Researching →
> Pending for Quality Review → **Problem Solved** / Information Provided / Case Returned /
> Canceled / Merged

### Its own escalation ladder

`qdb_escalation_level`: **Manager 1 → Manager 2 → Directors → CEO**, with `qdb_ceo_escalation` and
`qdb_inquiry_escalation_mgr_1`, and the global set `qdb_case_escalation_alert_type` carrying
`COMPLAINT_REMINDER_ASSIGNEE`, `COMPLAINT_ESCALATION_MANAGER1`, `COMPLAINT_ESCALATION_MANAGER2`,
`COMPLAINT_ESCALATION_CEO`. An SLA model sits beside it — `qdb_sla_agreement`, `qdb_sla_item`,
`qdb_sla_target`, `qdb_slaviolation`, `qdb_conditionalescalationconfiguration`,
`qdb_escalationrecipient`, `qdb_case_crm_alerts`.

### Its intake channels

`caseorigincode` is customised well beyond the defaults: **Walk In Customer, myQDB APP, Whatsapp,
CEO Office, Press & Media, Social Media, Twitter, Facebook**, Phone, Email, Web, IoT, Other.

`qdb_casetype` and `qdb_myqdb_casetypes` both carry **`751090001 = Complaint`**.

**Cloud data:** 3 rows, all test records (`Test SLA`, `Test Letter`, `Test`). As with Legal and
Restructuring, that is an environment fact, not evidence about the process.

---

## 2. Collection Dispute — **not** represented anywhere

Every complaint category above is about **service, process, product or staff**. Not one expresses a
customer contesting their **arrears, DPD, payment posting, balance or facility information**.

- The entity sweep found **1** match across 3,144 entities: `qdb_contest`, display name **"Event"**
  — a competition, not a dispute. Noise.
- **0** of 1,622 workflows and **0** of 500 Custom APIs match dispute terms.
- The Process Engine's 46 process/step/outcome tables contain **no** dispute route.

### So QDB has a Complaint process and no Dispute process

The two are therefore **not** interchangeable, and §4's question is answered as far as the evidence
allows: QDB models *Customer Complaint* and does not model *Collection Dispute*.

**DCP currently collapses them.** The activity type is `Complaint / Dispute` (code `P6-DISPUTE`,
`qdb_category` **null**), and four outcomes read *"Customer disputes the balance"* — one each for
Call, Meeting, Payment Request and Follow-up. That collapse is Phase 6's, and whether a collection
dispute should become a QDB Case, remain a Collection Activity, or be something else, is a business
decision nobody has made. **KI-118.**

---

## 3. Collection control during a dispute — **nothing establishes any**

The question §5 forbids assuming. What actually exists:

| Mechanism | State |
|---|---|
| `qdb_collectioncase.qdb_collectionpaused` (Boolean) | exists; **false on all 4,363 cases**; nothing reads or sets it |
| `qdb_strategyaction.qdb_stoponpayment` / `qdb_stoponptp` | configured **false** on all four DEMO actions; **there is no stop-on-dispute flag at all** |
| `account`/`contact.creditonhold`, `donotemail`, `donotphone`, … | native channel restrictions, already honoured; **not** a dispute mechanism |
| `qdb_customerfacilityfreezestatus` (account) | exists; not connected to collections |

**No configuration anywhere states that a dispute stops collection, suppresses communication,
freezes DPD, halts strategy or closes a case.** That is QDB policy, and it is recorded rather than
filled in. **KI-119.**

The Rule Engine remains authoritative for strategy eligibility; MIS remains authoritative for
delinquency. Nothing in DCP will modify MIS DPD or arrears because a dispute exists.

---

## 4. If DCP ever hands off to a Case — what the contract would be

| | |
|---|---|
| **Customer identity** | **`customerid` is polymorphic** — `customerid_account` *and* `customerid_contact`. **KI-108 does NOT recur here**: an HL customer, who is a contact, can be named on a Case directly. This is the first downstream process that accepts both books |
| **Alternate key** | **none** — so idempotency would need a derived id and `If-None-Match`, exactly as Legal |
| **Link back to collections** | **none.** The only existing path is `qdb_collectionactivity.regardingobjectid` → `incident`, and §6 forbids overloading it: it already carries the collection case and the fax/email mirroring. A DCP-side lookup would be the Legal pattern — **not provisioned**, because the business decision in KI-118 comes first |
| **Security** | `prvReadIncident` 33 roles, `prvCreateIncident` 14, `prvWriteIncident` 15 — **no DCP or Collection role holds any of them**. **KI-120** |

---

## 5. What was searched, so the negative is worth something

| Surface | Result |
|---|---|
| All **3,144** entities, logical and display names | 1 match, and it was noise |
| **1,260 global option sets, by label** | 5 matches — `qdb_casetype`, `qdb_myqdb_casetypes`, `qdb_activity_category`, `qdb_case_escalation_alert_type`, `qdb_reasonofreturn`. **This is where the answer was** |
| All **1,622** workflows | 0 |
| All **500** Custom APIs | 0 |
| Process Engine content, 46 tables row by row | 4 matches, all DCP's own `Customer disputes the balance` outcomes |
| Native `incident` | **108 custom columns** — the finding |

---

## 6. Conclusions

1. **Customer Complaint is an established QDB process on `incident`.** DCP must not rebuild it, must
   not copy its 12-status lifecycle, and must not implement its escalation ladder or SLA model.
2. **Collection Dispute is not modelled by QDB at all**, and DCP's current `Complaint / Dispute`
   activity type collapses two different things.
3. **No policy links a dispute to collection control.** Nothing is inferred.
4. The Collection-side capability can proceed independently, because a dispute is already an
   ordinary `qdb_collectionactivity` with an approved type and four configured outcomes.
5. **No DCP entity is created.** Whether a downstream hand-off to `incident` should exist is
   KI-118, and no lookup is provisioned until it is answered.
