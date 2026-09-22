# WP11 — Restructuring / Workout, read from the organisation

Read-only discovery against `org5869857f`, 2026-09-21, via `crm/scripts/probe-restructuring.mts`.
Nothing was created, changed or populated.

**This corrects WP1.** WP1 swept entity and workflow *names* for eight terms, found four empty
tables, and recorded "no authoritative Restructuring/Workout process has yet been identified". That
conclusion was too narrow, and the reason is instructive: **QDB does not call it restructuring.**
The process is modelled as **Facility Amendment**, and restructuring is a *request type* inside it.

---

## 1. BFD — an authoritative process **is** identified

### `qdb_loan_amendment` — "Facility Amendment"

`qdb_request_type` settles it. Read from metadata, not inferred:

| Value | Label |
|---|---|
| 751090000 | **Rescheduling** |
| 751090004 | **Rescheduling due to financial difficulty** |
| 751090002 | **Restructuring** |
| 751090003 | **Restructuring due to financial difficulty** |
| 751090001 | Facility Amount |
| 751090005 | Renewal |
| 751090006 | QCB 2022 |

The two *"due to financial difficulty"* variants are precisely the collections-driven case — the
forbearance concept WP11 was sent to find.

It is a fully modelled approval process, not a stub:

- **114 creatable attributes**, of which nine are business-required on create, including
  `qdb_rescheduling_fees`, `qdb_request_type`, `qdb_loanamendmentfor`, `qdb_facility_no`,
  `qdb_interestrateafterloan`;
- restructuring mechanics: `qdb_grace_period_start_date` / `qdb_new_grace_period_start_date`,
  `qdb_interestratebeforeloan` / `qdb_interestrateafterloan`, `qdb_new_repayment_type`,
  `qdb_pre_repayment_frequency`, `qdb_isaccountrescheduledupdated`;
- credit governance: `qdb_icc_approval_reference` → `qdb_icc_descion`,
  `qdb_icc_rescheduling_approval_date`, `qdb_cad_officer_approval`,
  `qdb_head_of_cad_officer_approval`, `qdb_ed_credit_management_approval`;
- **a 13-status approval chain**, and it names its own roles:

> Saved (not submitted) → Pending Head Credit Admin Approval → Pending Director Credit & Risk
> Approval → Pending Operations Review → Operations Executing Loan Amendment → **Completed**,
> with return paths including *Return to Head Credit Admin by **Director BFD***.

- **named officer lookups at each stage** — `qdb_head_of_credit_admin`, `qdb_cad_officer`,
  `qdb_credit_admin_officer`, `qdb_credit_processor`, `qdb_creditanalyst`,
  `qdb_operations_officer`, `qdb_operations_processor` — plus `qdb_queue_item` → `queueitem`.

`qdb_loanamendmentfor` is **Project Finance | Al Dhameen** — both BFD product lines.

### Two supporting tables

| Entity | What it is |
|---|---|
| `qdb_repayment_plan` — Repayment Plan | The instalment schedule a rescheduling produces: principal, interest, `qdb_total_piti`, `qdb_graceperiodinst`, `qdb_projectgrace`, payment/post dates |
| `qdb_customer_restructure_history` — Customer_Restructure_History | CIF-keyed history; required `qdb_cif`, `qdb_name`; carries `qdb_restructure`, `qdb_rerstructure_date`, `qdb_credit_review` |

### What the Cloud organisation shows

**0 rows, 0 workflows, 0 custom plugin steps, 0 Custom APIs** on `qdb_loan_amendment` — but **3
forms**. Modelled and formed, unexercised here. This is the Legal pattern exactly, and it is read
the same way: an empty Cloud sandbox is an environment difference, not an absent process.

---

## 2. HL — **not** identified

No housing-loan rescheduling or amendment table exists. The sweep of all 3,144 entities across 26
terms returned ten matches; every one is BFD, trade-finance or guarantee work. `qdb_loan_amendment`
itself takes its customer as an **`account`**, which is the BFD customer model.

So the two books must be stated separately, and the honest HL statement is the WP1 wording — now
true of HL alone rather than of restructuring generally:

> No authoritative HL Restructuring/Workout process has been identified in the Cloud development
> organisation. The On-Premises position requires QDB confirmation.

---

## 3. What was searched, so the negative is worth something

| Surface | Result |
|---|---|
| All **3,144** entities, logical **and** display names, 26 terms | 10 matches (WP1's 8 terms found 4) |
| All **1,622** workflows | 0 |
| All **500** Custom APIs | 0 |
| **Process Engine content** — 56 process/step/outcome/task tables, row by row | `qdb_outcome` 166 rows, `qdb_work_item_steps` 119, `qdb_outcomeworktasks` 16, `qdb_sopstep` 42, `qdb_sopoutcome` 47 — **no restructuring route**. The only matches (`N – Amendments Required`, `3.1 – In case of amendments…`) are document-amendment steps in an unrelated SOP |
| DCP configuration | `Restructuring Recommendation (P6-synthetic)`, code `P6-RESTRUCTREC`, **category null**; **0** strategy actions and **0** outcomes reference restructuring |

WP1 searched names only. The Process Engine sweep is new, and it is what makes "no configured
restructuring route on Cloud" a finding rather than an assumption.

---

## 4. The §13 stop conditions

| | Status |
|---|---|
| Authoritative downstream process | **BFD: identified** (`qdb_loan_amendment`). **HL: not identified** |
| Authoritative entry point | 🔴 **Ambiguous** — 0 workflows, 0 plugins, 0 Custom APIs on Cloud. Direct create is the only visible mechanism, exactly as Legal appeared before QDB confirmed the real process is on-premises |
| Customer resolution | 🔴 `qdb_customer_name` → **`account`**. BFD resolves; **HL cannot** — KI-108 recurs unchanged |
| Facility resolution | 🔴 **New unknown.** `qdb_facility_no` → `qdb_facility`, but DCP's `qdb_facilitynumber` (`DEMO-BFD-8801`, `ARR-HL-00001`) does not match any `qdb_facility` row (`DEMO-FAC-0001`, `Lab`, `Cafe`…). **KI-114** |
| Qualification / approval trigger | 🔴 **Not established.** The chain begins *Saved (not submitted)*; nothing says what makes a collection recommendation eligible to become one. KI-109's shape, for restructuring |
| Modifying the downstream entity | 🟡 Nothing points back to collections and there is **no alternate key** — the KI-110 decision again, not yet taken. **KI-115** |
| Security boundary | 🔴 **No DCP or Collection role holds `prvCreateqdb_loan_amendment` or `prvReadqdb_loan_amendment`.** KI-111's shape. **KI-116** |

---

## 5. What this does and does not authorise

**Nothing was created.** No `qdb_restructuringrequest`, no workout entity, no parallel lifecycle,
no approval process. QDB's capability exists and will be reused.

The Collection-side capability is already complete and needs no downstream decision: a
Restructuring Recommendation is an ordinary Collection Activity, so strategy generation (WP3/WP4),
re-evaluation (WP5), assignment (WP6), TAT (WP7) and Action Plan visibility (WP8) all apply to it
today without change.

**The downstream adapter is unresolved, not fabricated.** Building it needs the entry point, the
facility identity and the qualification trigger — the three items above that are genuinely
ambiguous, and which §13 says to report rather than choose.

### KI-112's lesson, applied immediately

`Restructuring Recommendation` carries code `P6-RESTRUCTREC` and **`qdb_category` is null**, exactly
as the Legal type did. A second code-suffix heuristic is **not** being added. Until configuration
establishes the semantic, restructuring recommendations are identified only where something
authoritative says so — recorded as a configuration dependency rather than buried in the UI.
