# HL complaint → BFD Case Management — findings and implementation

Status 2026-09-29 (Asia/Qatar): **code complete and tested; not yet runnable end to end.** It needs the
Integration Service hosted and configured, browser sign-in to it decided, and privileges granted
(§5). No schema change, no Case Management change. Started 15:21, code complete 17:10 against a
5-hour estimate. Nothing here is production ready.

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
  and the "Phone to Case Process" BPF. Their definitions were read on 2026-10-04 — see §7. **A
  DCP-raised HL complaint WILL send the customer an SMS; it will not send an email.**
- An existing Action "Case Management : Case Submit Action" and a "Case Creation" security role
  exist. Roles holding `prvCreateIncident` include "Case Creation", "Head of Collection" and
  "Relationship Manager/Colleciton Manager"; no DCP role exists on-prem.
- The incident has `qdb_contact` (lookup to contact) and `qdb_qid` columns — candidates for HL
  context, **not used without a decision** ("do not populate a field merely because it looks
  similar").

## 3. Decisions

| # | Decision | Outcome |
|---|---|---|
| D1 | Non Customer resolution | **Configured id, verified.** `CASE_MANAGEMENT_NON_CUSTOMER_ACCOUNT_ID` in the Integration Service's validated configuration. Every request checks the account exists, is active and is named "Non Customer", else refuses. No GUID in React; no search that picks a first match. |
| D2 | Business Unit path | **Picklist + department manager** — the metadata conflict with the brief, resolved as reported: `qdb_businessunit` = the option labelled Housing Loan; `qdb_department` = the one enabled business unit named exactly "Housing Loan"; Assigned To = its `qdb_manager`. Missing, ambiguous or manager-less refuses. "Collections - Housing Loans" is **not** used — to be confirmed with QDB. |
| D3 | Server-side boundary | **Integration Service** (user, 2026-09-29: QDB will host it, reachable from HL CRM and QDB1). |
| D4 | Cross-CRM | **HL CRM is a separate organisation from QDB1** (user, 2026-09-29). No lookup to the HL contact; name and mobile travel as values. |
| D5 | HL context on the Case | **Nothing beyond the approved fields.** Loan account, Collection Case number and source system are not written to the Case (no approved field; `qdb_qid` / `qdb_contact` not used). Open if Case Management users must see them. |
| D6 | Customer SMS / email on create | **Open — now a business decision, not an unknown.** The definitions were read (§7): QDB1 sends the HL customer an acknowledgement SMS for every complaint DCP raises (the same SMS a phone-raised complaint gets); no email is sent. Whether that is wanted is QDB's call. QDB1 workflows are not to be changed by DCP. |
| D7 | Security | **CRM decides.** The service reads the Collection Case as the HL user and creates the Case as the QDB1 user (`MSCRMCallerID`); each must hold the privileges in their own organisation. |

## 4. What was built

- **Integration Service** `POST /collection-cases/:id/complaints` (`apps/api/src/routes/complaints.ts`,
  `apps/api/src/services/caseManagement/`). Body = `{ requestId, description }` with `.strict()` —
  any other field is refused. Steps: find the user in HL CRM by email → read the Collection Case
  and the HL contact as that user → find the user in QDB1 → resolve Non Customer, department and
  manager, product, option values by label, and lookup navigation names from metadata → create
  the Case **create-only** (`PATCH` + `If-None-Match: *`, ADR-DCP-19) under an id derived from
  Collection Case + user + request id → read it back → return case number, status, created,
  assigned to, owner and a Case Management link. 201 new · 200 repeat · 403 refused by CRM ·
  404 no case · 422 context/validation · 503 configuration.
- **Nothing is written to HL CRM**, so a Case Management failure cannot leave the Collection Case
  changed. 0..N complaints per Collection Case: each new pane is a new request id.
- **Dataverse client**: `callerId` (`MSCRMCallerID`), `createWithId`, `getSingle`.
- **Workspace**: a *Raise a complaint* card on the Workout & Legal tab of HL cases (V1 and V2 share
  it). The side pane asks only for the description, sends one request id per pane (repeated on
  retry) and shows the result with *Open Case Management Case*. The service address is the HL
  platform configuration flag `caseManagementServiceUrl` (https only); sign-in is an optional
  session capability. Either missing → the pane says why. Deployed to org5869857f and shown there
  in its "not configured" state (`docs/evidence/2026-09-29-create-complaint-unconfigured.jpg`).
- **ADR-DCP-21** records the architecture; the field dictionaries and React architecture no longer
  describe complaint data as DCP's own.
- **Tests**: API 388 (+33), Dataverse client 39 (+6), web 1,252 (+13). Code-reviewed; its critical
  finding (a retry recognised by an unproven error code) was fixed by moving to the create-only
  pattern.

## 5. Before it can run (deployment prerequisites)

1. Host the Integration Service on QDB infrastructure, reachable from HL CRM and QDB1, with
   `FEATURE_BFD=true`, the `DV_BFD_*` settings for QDB1 (API version 9.1), and
   `CASE_MANAGEMENT_NON_CUSTOMER_ACCOUNT_ID` = the Non Customer account's id in QDB1.
2. Its service identity needs **Act on Behalf of Another User** in both HL CRM and QDB1 (for
   `MSCRMCallerID`), plus read on systemuser, businessunit, account, qdb_case_products and metadata
   in QDB1.
3. Each collection user must be an **enabled QDB1 user** with the same primary email as in HL CRM,
   holding a role with Case create and read — for example the existing "Case Creation" role.
   Role assignment is QDB's decision.
4. Decide browser → service sign-in (AD FS on-prem; P11) and supply it to the workspace session.
5. Set `caseManagementServiceUrl` in the HL `qdb_platformconfiguration.qdb_featureflags`.
6. Settle D6 (customer SMS, §7) before the first real complaint.

## 6. Remaining gaps

- **Not run end to end** against any Case Management: no hosted service, no sign-in. The route is
  proven against a fake of both organisations only.
- The existing "Customer complaints" list on the case reads complaints through
  `qdb_collectionactivity.qdb_complaintcaseid`, a same-organisation lookup, so it cannot show
  complaints raised in QDB1. Listing them needs a stored cross-organisation reference — a schema
  decision (D5).
- Users are matched by primary email in each organisation; a user without one, or with different
  emails in the two, is refused.
- BFD complaints are not implemented (mapping not approved); the service refuses non-HL cases.

## 7. What QDB1 does after DCP creates the Case (workflow inspection, 2026-10-04)

Source: `docs/evidence/onprem/case-workflows-inspection-2026-10-04.json` (QDB1 test, 12 Case process
definitions, XAML read statically — nothing was run). Plugin steps and SLAs: none on `incident`
(inspection of 2026-09-29, §2). Activation state is not in the file; the 2026-09-29 inspection listed
the on-create ones as active.

### On create — runs for a DCP complaint

| Automation | Mode | What it does with the approved mapping | Customer contact |
|---|---|---|---|
| **Case : SMS Alert to Customer** | background | Copies `qdb_customer_mobile_number` (= HL customer mobile) into `qdb_mobile_number`. If `qdb_isthisnfg` = true it sends the NFG text and stops; DCP leaves it unset. Otherwise, because `casetypecode` 2 (Complaint) is in its list {1, 2, 3, 751090000–751090002}, it **creates an outbound SMS (`fax`, `qdb_smssendto` 751090003) to that mobile**: *"This is to confirm that we received your [case type] [case number] and we will update you soon…"* plus the Arabic text. | **YES — SMS to the HL customer** |
| Case : Set Expected Closure date for Case Type Complaint | background | `casetypecode` = 2 → custom activity `QDBDigital.CRM.Customization.Workflows.CaseSetExpectedClosureDate` sets the expected closure date (the SLA-like due date) | no |
| Case : Set Paramters | background | Sets `qdb_lc_documents_link` (a SharePoint URL built from the title). Copies the account's name into `qdb_customer_name` **only when it is empty** — DCP fills it, so the HL customer's name stays. Sets `followupby` to now **only when empty** — DCP fills it, so the approved Received Date stays | no |
| Case -onCreate: Extract HTML Description | real-time | Runs only when `caseorigincode` = 3986 (Twitter) and a specific owner — DCP sends 1 (Phone): **does not run** | no |
| Phone to Case Process | BPF | default stage flow for the Case | no |

### Not on create

| Automation | Trigger | Relevance |
|---|---|---|
| Case : Email Alert to Customer | not on create (on demand / child) | **Stops immediately when `qdb_email` is empty** — DCP sends none, so no email even if started. Otherwise emails "Case Submission Alert" from a QDB queue |
| Case : Update Customer Details | update of `customerid` | Only if someone changes the customer; would overwrite `qdb_customer_name` with the account name (for "Non Customer" that would replace the HL customer's name) |
| Updating Non Customer (business rule) | form | When `casetypecode` is empty, sets it to 751090003 and `customerid` to account `9a50e4b2-743b-e511-8277-00155d780414` — the likely **Non Customer** account; DCP always sets the type, so it does not fire. Candidate value for `CASE_MANAGEMENT_NON_CUSTOMER_ACCOUNT_ID` (confirm) |
| Case : Submit (dialog), Case Management : Case Submit Action (action) | user / action | Progression: creates `qdb_status_history` work items, sets state, assigns pending user, starts 3 child workflows (ids only — not in the file) |
| Case : Assign Case, Case Assign to user | on demand | Assign to a fixed user (two hard-coded users) and set assigned/pending user |

### Implications

- **SMS:** every DCP-raised HL complaint sends the HL customer an acknowledgement SMS from QDB1 — the
  same as a phone-raised complaint. Whether the SMS actually leaves depends on QDB1's SMS gateway
  processing `fax` records (not inspected). Decision D6.
- **Email:** none — `qdb_email` is not in the approved mapping.
- **WhatsApp:** no WhatsApp step in any of the 12 definitions.
- **Other:** expected closure date set; a SharePoint link field set; no assignment on create (owner and
  Assigned To stay as DCP sets them); no plugin, SLA or integration call on create.
- **Not covered by the file:** "Assign Case to Owner if Case Created From Middleware" appeared in the
  2026-09-29 list of active on-create workflows but its definition is **not** in this file — unanalysed;
  and the three child workflows of *Case : Submit*. Neither runs from DCP's create alone as far as the
  read definitions show, but the first is named for exactly this path and must be read.
- **Not validated end to end** until a real cross-organisation Case creation is run and its SMS,
  closure date and assignment are observed.
