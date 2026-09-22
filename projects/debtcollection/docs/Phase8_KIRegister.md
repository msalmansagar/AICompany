# Phase 8 — consolidated Known-Issue register

**As of 2026-09-22.** Produced at Phase 8 closure. Every item here stays in `KnownIssues.md` with
its own number, wording and evidence; this document classifies them, it does not replace them.

---

## How these are classified

Phase 8 closure answers two questions that must not be blurred into one:

**A — Production blocker / required QDB decision.** Information, security or configuration that
must exist before *the relevant capability* can operate in production as intended. A capability
being safely unavailable does not make its dependency disappear.

**B — Functional acceptance dependency.** Business or configuration confirmation is still needed,
and the implementation meanwhile **fails closed or stays unavailable**. Nothing behaves wrongly;
something is simply not switched on.

**C — Deferred / non-blocking known gap.** Explicitly deferred work, or a limitation that does not
invalidate completed Phase 8 development.

**A is per capability, not per project.** Classifying everything as a blocker would say Phase 8 is
unusable, which is untrue; classifying nothing as one would say it is ready, which is also untrue.
Assignment cannot operate in production (KI-100, A) while the operational queues built on top of it
work today.

**Nothing here is closed because the software handles its absence gracefully.** Handling absence
well is what made development closable. It is not an answer to the question.

---

## A — Production blockers / required QDB decisions

| KI | Capability | Decision or question QDB must resolve | Current evidence | What DCP does safely today | Impact if unresolved | Owner | Blocks dev? | Blocks production? |
|---|---|---|---|---|---|---|---|---|
| **KI-99** | Audit | Should native Dynamics Audit be enabled on `qdb_collectionactivity` and `qdb_collectioncase`? | `IsAuditEnabled = false` on both, read from `org5869857f` 2026-09-21 | Phase 8's own evaluation trace goes to `qdb_crmlogs` and does not depend on Audit | No field-level history of who changed a status, reassigned or cancelled — on the two entities Phase 8 writes to most. The Phase 8 authorisation names native Audit as *the* business audit mechanism | QDB CRM platform | No | **Yes** |
| **KI-100** | Assignment / ownership | Which role, and which team, may hold collection work? | Assigning to an ordinary user returns **403** *"missing prvReadActivity"*; to an owner team **400**, `privilegeCount=0`. Live, `smoke-assignment-ownership.mts` | Assignment is proven with the application user only, and reported as such — never as officer validation | **No real officer can be given any collection work.** Assignment, queues, escalation and TAT all rest on this | QDB Security | No | **Yes** |
| **KI-101** | TAT | When does an officer's turn-around clock start — creation, assignment, acknowledgement, or another event? | No column on any DCP or QDB entity expresses an origin. `qdb_escalationhours` gives a duration only | Every deadline reads *Due date not configured*. **Due soon** and **Overdue** are not offered as queues at all, and say why | No deadline can be computed, so no queue, report or escalation can be time-based | QDB Collections | No | **Yes** (TAT) |
| **KI-102** | TAT | Do the configured hours mean elapsed hours, working hours, or working days against a business calendar? | 1,719 `calendar` rows are per-user work hours; no business-closure calendar is nominated | No calendar is assumed and no deadline is derived | A working-week assumption moves every deadline in the book. QDB operates in Qatar, so the default guess would be wrong | QDB Collections | No | **Yes** (TAT) |
| **KI-104** | Escalation | What is the escalation policy, and who configures it? | `qdb_escalationconiguration` models a full policy and holds **0 rows**; `CreateEscalationRecord` is referenced by 0 of 1,523 activated workflows; `qdb_escalations` is empty | Escalation is **read** from the platform's own flag and never inferred from lateness. No escalation is performed | The mechanism exists and is dormant. Nothing escalates, and nothing would | QDB Collections | No | **Yes** (escalation) |
| **KI-108** | Legal (HL) | How does a Housing Loan customer resolve to a BFD Account, which a Litigation Request requires? | `qdb_platformmapping` is authoritative for identity but carries no cross-CRM link; HL ids are government ids, BFD ids are account numbers | HL-originated hand-off is refused rather than resolved by guesswork | Legal hand-off works for BFD and **cannot** work for HL | QDB Data / Legal | No | **Yes** (HL Legal) |
| **KI-109** | Legal hand-off | Which cases qualify for litigation, and who authorises it? | An approval *mechanism* exists (`qdb_requiresapproval`, `qdb_approvalstatus`); **0** activities have ever used it, and nothing states that approval is the qualifying event | **Fail-closed.** `ReadyForHandoff` is unreachable, and no enabled officer action offers *Send to Legal*, *Raise Litigation* or *Create Litigation Request* | Legal hand-off cannot be switched on for anybody | QDB Legal | No | **Yes** |
| **KI-111** | Legal visibility | Which Collection role may read `qdb_qdblegal`? | `prvReadqdb_qdblegal` is held by 4 roles, **none** of the 24 DCP/Collection roles. Asserted every run | 403 and 404 stay distinct: *withheld* is never rendered as *absent* | Every Collection Officer would see no litigation at all, and administrator evidence would prove nothing | QDB Security | No | **Yes** |
| **KI-114** | Restructuring **(PARKED)** | How does a collection case's facility number resolve to a `qdb_facility` record? | `qdb_loan_amendment.qdb_facility_no` is a lookup; DCP holds a facility **number string**; none of the 8 `qdb_facility` rows matches | Nothing is written to `qdb_loan_amendment`; the Collection-side recommendation only | Facility Amendment hand-off cannot be built | QDB Lending | No | **Yes** (restructuring) |
| **KI-115** | Restructuring **(PARKED)** | How does a Facility Amendment link back to collections? | 25 lookups on `qdb_loan_amendment`, none to a collections table; no alternate key | No link is invented | The chain breaks at its last step and a retry has nothing to be idempotent against | QDB Lending | No | **Yes** (restructuring) |
| **KI-116** | Restructuring **(PARKED)** | Which Collection role may create or read a Facility Amendment? | Neither `prvCreate` nor `prvRead qdb_loan_amendment` is granted to any of the 24 DCP/Collection roles | Nothing is attempted | An officer could neither raise nor see a restructuring request | QDB Security | No | **Yes** (restructuring) |
| **KI-119** | Dispute | What does a dispute do to collection — pause, suppress, stop escalation, or nothing? | `qdb_collectionpaused` is false on all 4,363 cases and read by nothing; `qdb_strategyaction` has no stop-on-dispute flag | Recording a dispute has **no** collection effect, asserted as an explicit contract rather than left implicit | Either a customer is chased while contesting, or collection is paused with no agreed rule. Both are policy, not code | QDB Collections | No | **Yes** |
| **KI-120** | Complaint | Which Collection role may read, create or write a Case? | `prvReadIncident` 33 roles, `prvCreateIncident` 14, `prvWriteIncident` 15 — none a DCP or Collection role | Complaint creation and traceability are proven under the administrator identity and reported as such | An officer could neither raise a complaint nor see its outcome | QDB Security | No | **Yes** |
| **KI-123** | Complaint | What is the data impact of redefining `casetypecode` in place? | Option set **replaced, not extended**: `2` was *Problem*, is now *Complaint*. Stored integers unchanged; meaning changed | DCP resolves the value by **label**, from live metadata, never by a hard-coded number | Every historical Case with `casetypecode = 2` now reads as a Complaint. Any count, report or filter over history is wrong | QDB CRM / Data | No | **Yes** |
| **KI-124** | Deceased | What does the QCB deceased indication mean — verified death, reported death, or an operational marker? | Set on 724 of 4,373 snapshots, sourced from QCB. No deceased entity, process, workflow, plugin or route exists anywhere | The card says **"QCB deceased indication — verification required"** and never *"customer is deceased"*. Reviewing changes nothing | Without it, either the indication is ignored or a living customer is treated as dead | QDB Collections / Risk | No | **Yes** |
| **KI-127** | Deceased | What does a deceased indication do to collection and to communication? | Nothing establishes behaviour during verification, during a claim, or after settlement. `100000612 Deceased/Insurance Review` holds 0 cases | No pause, no suppression, no Legal effect, no DPD change — and the screen says so in as many words | The most likely conduct failure in the portfolio: chasing a deceased borrower's family | QDB Collections | No | **Yes** |
| **KI-128** | Deceased | Which Collection role holds deceased privileges, and where do death certificates live? | Of 37 matching privileges, **none** is granted to a DCP or Collection role. `sharepointdocumentlocation` and `sharepointsite` hold **0 rows** | No document capability is claimed or built | Verification needs evidence, and there is nowhere to put it | QDB Security / ECM | No | **Yes** |

---

## B — Functional acceptance dependencies

The implementation is complete and safe; a business or configuration answer is still owed.

| KI | Capability | Decision or question | Current safe behaviour | Owner | Blocks dev? | Blocks production? |
|---|---|---|---|---|---|---|
| KI-09 | Smart Assignment | Is there an authoritative Smart Assignment contract, or is native ownership the mechanism? | Native Dynamics ownership is used and proven. `qdb_smartassignmentref` is a placeholder, and no routing algorithm is invented | QDB Collections | No | No — native assignment operates |
| KI-72 | PTP | What are the promise limits — maximum amount, horizon, concurrent promises, tolerance, grace? | No limit is invented. An implausible promise is visible to a supervisor rather than silently rejected | QDB Collections | No | No |
| KI-76 | Follow-up | May an officer override a configured follow-up window? | The typed date is **preserved** — the choice that loses no information either way | QDB Collections | No | No |
| KI-98 | Strategy re-evaluation | May a completed or cancelled action be raised again within one delinquency episode? | Identity holds within the episode, so nothing is regenerated. Only this behaviour is held | QDB Collections | No | No |
| KI-103 | TAT | Does reassignment restart the clock? | Ownership change and TAT restart are kept as separate concepts; neither is assumed | QDB Collections | No | No — follows KI-101 |
| KI-105 | Escalation | What happens to work that never obtained an assignee? | Never-assigned work is not reported as an officer running late | QDB Collections | No | No — follows KI-104 |
| KI-112 | Legal | Which activity type is a Legal Recommendation, in configuration? | Matched on `qdb_code`, never on display name. Contained to one place | QDB CRM config | No | No |
| KI-117 | Restructuring **(PARKED)** | Which activity type is a Restructuring Recommendation? | Matched on code. **No second heuristic was added** | QDB CRM config | No | No |
| KI-118 | Dispute / Complaint | Is one combined *Complaint / Dispute* activity type correct, or are these two types? | The two concepts are already separated by the **Complaint link**, not by the type label | QDB Collections | No | No |
| KI-125 | Insurance | Does credit-life or mortgage-protection insurance exist for HL, and what is the exemption programme? | **No insurance module was built.** The claims capability that exists is guarantee and programme claims, a different product family | QDB Products | No | No — nothing built to break |
| KI-126 | Deceased | Where does exemption data come from, and will it be populated? | `qdb_exemptionpercentage` and `qdb_exemptionamount` are null on every row, and no sub-state is inferred from absence | QDB MIS | No | No |

---

## C — Deferred / non-blocking known gaps

| KI | Gap | Why it does not invalidate Phase 8 |
|---|---|---|
| KI-106 | No strategy action names an activity type | **No longer blocks the Action Plan.** WP8 replaced Activity-Type correlation with provenance, so the plan reads the link the work itself carries. The configuration question remains open and costs nothing |
| KI-107 | Attributed work not carrying its derived id reads as not-current | Visible and labelled *"Not recorded — predates provenance"* rather than hidden. Revisit only if non-DCP systems begin attributing collection work |
| KI-113 | The `LitigationLinkBroken` state is unreachable on Dataverse | Binding to a missing request is refused (404) and delete behaviour is `RemoveLink`. The defence is untested **by design**; revisit for on-premises |
| KI-95 | "CUSTOMER TABLE" is technical officer-facing wording | UX debt; blocks nothing |
| KI-97 | A **top-level** browser reload returns the workspace to its default view | The fragment lives on the inner frame. A workspace reload restores the same case — verified this session. Routing debt; blocks nothing |
| KI-59 | `qdb_crmlogs` carries no correlation column | The correlation id rides in the `description` JSON block; queryable, not indexed |
| KI-43 | `AuditLogWriter` has no home in the canonical schema | Native audit is the required mechanism — see KI-99, which is the live question |

---

## Reconciliation — every other open item

Checked against `KnownIssues.md` so that nothing open is omitted by being older than Phase 8. These
are carried forward from earlier phases; Phase 8 neither resolved nor worsened them.

| KI | Area | Classification |
|---|---|---|
| KI-02, KI-03, KI-05, KI-22 | On-premises: hard-coded API version, Entra-only script auth, AD FS adapter never exercised, no on-prem org ever used for DCP | **A — for the on-premises deployment only.** Nothing in Cloud Phase 8 depends on them |
| KI-14 | No solution package, no CI/CD, no deployable artefact | **A — for any deployment beyond this sandbox** |
| KI-12, KI-13 | `projects/debtcollection/` untracked on the checked-out branch; strong-name key exists only on disk | **A — repository/build continuity.** See closure hygiene below |
| KI-53, KI-54, KI-55 | No QDB MIS API contract; observation identity unsolved; the `1-30` bucket arrives as a date | **A — for live MIS ingestion.** Phase 8 reads the stored MIS position and labels it as stored |
| KI-79, KI-83 | No authoritative Contact Hold source; QDB's SMS/WhatsApp dispatcher is not installed here | **A — for production sending.** Phase 7 sends fail closed |
| KI-80, KI-82 | Arabic/English template model; `qdb_privsendsms` as the authorisation point | **B** |
| KI-44 | `StopContactQueueMover` has no trigger in the canonical schema | **B** |
| KI-66 | `qdb_activityoutcome` holds zero rows in production terms | **B — configuration** |
| KI-51, KI-65 | Strategy criteria unconfirmed; ordering within the activity Open-state group | **B** |
| KI-48, KI-49, KI-50 | Rule Engine eligibility contract provisional; case numbers provisional; legacy `msst_` routes pending retirement | **C** |
| KI-11 / KI-32 | Exposure segmentation and the F1–F11 conflicts — proposed BRD amendments awaiting QDB approval | **B — BRD governance** |
| KI-34, KI-35, KI-36, KI-37, KI-39 | Duplicate configuration infrastructure risk; consolidated-activity privilege granularity; legacy role grants; PII field security; case-number autonumber | **C**, except KI-35 which feeds the security review below |
| KI-16, KI-17, KI-19, KI-20, KI-23, KI-25, KI-27, KI-28, KI-31 | Source-data semantics and the existing BFD DA collections module | **C — discovery findings, unchanged by Phase 8** |
| KI-07, KI-08 | Form Engine / EDP on-premises validation | **C — outside DCP** |

**Closed during Phase 8, recorded as decision history, not as dependencies:** KI-71 (provenance
replaces inference), KI-96 (`Xrm.WebApi` returns no `@odata.count`), KI-110 (one lookup on DCP's
side), **KI-121** (`casetypecode = 2`, read from live metadata), **KI-122** (minimum Complaint
contract proven live), and the two recorded at this closure — KI-129 and KI-130.
