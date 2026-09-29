# HL complaint → BFD Case Management — inspection findings

Status: **inspection only. No code, no org change.** Date 2026-09-29 (Asia/Qatar).

Sources: the cloud sandbox org5869857f (Node probes `probe-case-management*.mjs`) and the QDB
on-prem organisation `QDB1` (CRM 9.1.42.8, browser script `onprem-case-management-inspect.js`,
run by the user as System Administrator). DCP is **not installed** on `QDB1`.

The cloud sandbox carries the Case columns and the same product ids, but not QDB's configuration
(no Non Customer account, one business unit, blank product names, none of QDB's Case workflows).
**On-prem is the authoritative source for this integration.**

## 1. Field-source matrix (HL, from on-prem)

| Case field | Type on-prem | Approved rule | On-prem evidence | Result |
|---|---|---|---|---|
| `customerid` | Customer (account/contact), SystemRequired | existing Non Customer account | exactly **one** active account named "Non Customer" (created 2015); **40 of 40** newest complaints use it | ✅ resolvable, needs a server-side configuration mechanism (§3 D1) |
| `qdb_businessunit` | **Picklist**, not a lookup | "Housing Loan, lookup" | option `100000000 = Housing Loan` | ⚠️ **metadata conflict** — value is fine, but it carries no manager (§3 D2) |
| `qdb_department` | Lookup → `businessunit`, AppRequired | Housing Loan | business unit "Housing Loan" exists, active, with `qdb_manager` set; a second unit "Collections - Housing Loans" also exists | ✅ "Housing Loan" (§3 D2) |
| `qdb_assigned_to_user` | Lookup → systemuser, AppRequired | Housing Loan BU manager | "Housing Loan" unit's `qdb_manager` is set; the newest HL complaint with that department is assigned to exactly that manager | ✅ read from `businessunit.qdb_manager` via the department, not from the picklist |
| `qdb_product` | Lookup → `qdb_case_products`, AppRequired | Housing Loan | one active row "Housing Loan" (same id in the cloud sandbox, name blank there) | ✅ |
| `casetypecode` | Picklist, AppRequired | Complaint | `2 = Complaint` (resolved by label) | ✅ |
| `caseorigincode` | Picklist, AppRequired | 1 Phone | `1 = Phone` | ✅ |
| `qdb_case_source` | Boolean | 0 Internal | false = "Internal (QDB)"; all 40 sampled complaints are External | ✅ (DCP complaints will be the first Internal ones seen) |
| `qdb_existing_customer` | Boolean | 0 No | false = "No (other)" | ✅ |
| `qdb_customer_name` / `qdb_contact_name` | String (name AppRequired) | actual HL customer name | filled on 40/40 and 34/40 | ✅ |
| `qdb_customer_mobile_number` | String, AppRequired | actual HL mobile | filled on 40/40 | ✅ |
| `description` | Memo, AppRequired | officer's text | — | ✅ |
| `ownerid` | Owner | initiating Collection user | owner ≠ assigned on 38 of 40 — the two are genuinely different people | ✅ |
| `followupby` | DateTime, display name **"Recieved Date"** | received date | equals `createdon` (0 h) on 37 of 40, −1 h on 3 | ✅ set to the creation moment |
| CR number | `qdb_crnumber` exists | none for HL | — | not mapped (as instructed) |

The form marks five partner-bank fields ApplicationRequired; the Web API does not enforce them
(KI-122), and existing complaints do not carry them.

## 2. Automation and security (on-prem)

- **No plugin steps and no SLAs** on `incident`. The platform has **no Custom API table on 9.1**.
- Active on-create workflows include **"Case : SMS Alert to Customer"**, **"Case : Email Alert to
  Customer"**, "Case : Set Paramters", "Set Expected Closure date for Case Type Complaint",
  "Assign Case to Owner if Case Created From Middleware", "Case -onCreate: Extract HTML Description"
  and the "Phone to Case Process" BPF. Their conditions are not yet read
  (`onprem-case-workflows-inspect.js`). **Risk: a DCP-raised complaint may SMS/email the
  customer.**
- An existing Action "Case Management : Case Submit Action" and a "Case Creation" security role
  exist. Roles holding `prvCreateIncident` include "Case Creation", "Head of Collection" and
  "Relationship Manager/Colleciton Manager"; no DCP role exists on-prem.
- The incident has `qdb_contact` (lookup to contact) and `qdb_qid` columns — candidates for HL
  context, **not used without a decision** ("do not populate a field merely because it looks
  similar").

## 3. Decisions still open

- **D1 Non Customer resolution.** Proposed: its id held in server-side configuration, verified at
  runtime to be active and named "Non Customer"; refuse otherwise. Needs a configuration home.
- **D2 Business Unit path.** The brief reads the manager from `qdb_businessunit`, which is a
  picklist. Proposed: picklist = Housing Loan; department = the "Housing Loan" business unit;
  assigned-to = that unit's `qdb_manager`. Confirm, and confirm "Housing Loan" rather than
  "Collections - Housing Loans".
- **D3 Server-side boundary — recommendation follows from D4.** DCP runs in HL CRM; the Case is written in QDB1. A plugin or Action in HL CRM cannot write to another organisation without holding QDB1 credentials inside CRM, and 9.1 has no Custom API. The **Integration Service** is the designed cross-organisation boundary: its org router already targets HL and BFD by configuration, it holds each org's service identity server-side, and it can derive every fixed value. It needs a host on QDB infrastructure and a decision on browser → service authentication (P11). Awaiting confirmation.
- **D4 Cross-CRM — ANSWERED 2026-09-29 (user): HL CRM is a separate organisation from `QDB1`.** The Case can never hold a lookup to the HL contact; `qdb_contact` points at QDB1 contacts and stays empty. HL identity reaches the Case only as values (name, mobile, and whatever D5 approves).
- **D5 HL context.** Loan account, DCP case reference, source system: `qdb_qid` / `qdb_contact`
  or nothing.
- **D6 Customer notification.** Whether a DCP-raised complaint may trigger the customer SMS/email.
- **D7 Security.** Which role lets a collection user raise a complaint.
