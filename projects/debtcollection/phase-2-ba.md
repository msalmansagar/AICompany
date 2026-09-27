═══════════════════════════════════════════════════
BUSINESS REQUIREMENTS DOCUMENT
═══════════════════════════════════════════════════
Project:        Debt Collection Platform (DCP-001)
Prepared by:    MSS Technologies — Business Analyst
Date:           2026-09-13
Version:        1.0
Status:         DRAFT — Pending CEO Approval
═══════════════════════════════════════════════════

---

## 1. Executive Summary

Qatar Development Bank's collection function currently operates across two separate
Dynamics 365 CE organisations — Housing Loan (HL) and BFD — with no unified workspace,
no systematic case lifecycle, and no audit-grade evidence of collection activity. Officers
manage follow-up via spreadsheets, manual CRM lookups, and undocumented phone calls.
89.4% of arrears (QAR 190.5m of QAR 213m) sit in the three deepest DPD buckets, yet
those cases also need compliant hand-off to legal or insurance — work the current tooling
cannot evidence. This project delivers a standalone Next.js workspace backed by a Fastify
CRM Context Router that serves Housing Loan in Phase 1 (80–90% of the portfolio), with
BFD behind a feature flag from day one. The platform covers six functional modules:
Customer & Loan 360, Delinquency & Case Creation, Collection Action Plan, PTP Management,
Communication Management, Legal Escalation, Deceased & Insurance Claims, Disputes, and
supporting modules for Admin, Audit/RBAC, and Integration. Success means every action,
PTP, communication, approval, and override is in a plugin-written, append-only audit trail
that can be produced as an evidence pack for a regulatory examination.

---

## 2. Business Objectives and Success Criteria

| # | Objective | Measure of success |
|---|---|---|
| BO-01 | Enable Collection Officers to log every customer interaction in one workspace | Zero parallel spreadsheets; 100% of actions recorded in the system |
| BO-02 | Produce a complete, audit-grade evidence pack for any collection case | Full action, communication, PTP, approval and status-change history exportable per case |
| BO-03 | Enforce stop-contact and PDPPL consent before every outbound channel | Zero automated contacts reaching suppressed customers; every block logged in the router |
| BO-04 | Serve the Housing Loan portfolio first | Phase 1 live and in use for HL; BFD deployable via feature-flag flip with no code change |
| BO-05 | Lay the dual-org foundation once for both CRMs | CRM Context Router and QID identity map built for both orgs from day one |
| BO-06 | Keep Phase 1 within a 2-person delivery budget | Architecture sized to ~4,300–4,900 delinquent customers; no over-engineering |

Phase 1 success criteria (from CEO phase-1-ceo.md §6):

| SC-01 | Officer opens full HL facility view, logs action, captures PTP from one screen |
| SC-02 | PTP past promised date with no matched payment is automatically flagged broken |
| SC-03 | SMS/email to `stopContact = true` customer blocked at router with logged reason |
| SC-04 | Full case audit trail exported as a single evidence pack |
| SC-05 | Senior Manager sees all open cases, SLA, overdue actions, broken PTPs on one dashboard |
| SC-06 | Enabling the BFD feature flag activates BFD cases without any code change |

---

## 3. Phase 1 Scope

**Q-01 resolution — BROAD reading adopted (6 modules in Phase 1).**
The Final Requirements document says "2 features" but then fully specifies four further
modules (Action Plan, Legal Escalation, Deceased & Insurance, Disputes) with field-level
detail and edited feature lists. This editing evidence — including the deliberate removal
of "Assign field visit" — confirms the broad reading. All six modules are Phase 1 scope.
The literal "2 features" phrasing is superseded by this BRD.

### 3.1 In Scope — Phase 1

- Housing Loan CRM as the primary org; BFD CRM feature-flagged, not deleted
- CRM Context Router (Fastify) and QID identity map, built for dual-org from day one
- Module 1: Customer & Loan 360 (HL view; cross-org Customer 360 deferred)
- Module 2: Delinquency ingestion via MIS API + manual case creation
- Module 3: Segmentation and strategy engine (DPD + arrears; NOT exposure-based)
- Module 4: Work allocation and queue management
- Module 5: Collection Action Plan management
- Module 6: Promise-to-Pay management
- Module 7: Communication Management (SMS, email, phone log, official letter)
- Module 8: Restructuring / Workout
- Module 9: Legal Case Management (hand-off and status tracking)
- Module 10: Deceased & Insurance Claims
- Module 12: Dashboards and MIS (operational; portfolio from DWH)
- Module 13: Audit Trail, Maker-Checker, and RBAC
- Module 14: Admin Configuration and Business Rules
- Module 15: Integration Layer (MIS API, HL CRM, BFD CRM, SMS/Email gateway, Payments, QCB, DWH)
- Qatar data requirements: QAR currency, QID as customer key, PDPPL compliance

### 3.2 Out of Scope — Phase 1

- WhatsApp channel (pending BSP contract, Meta template approval, PDPPL consent framework)
- BFD CRM live operations (flagged; enabled via config)
- Cross-org Customer 360 React surface (router built; React component deferred)
- Portal UI for Legal User and Insurance Officer (they use native CRM — ADR-DCP-03)
- Field Visit Management (Module 11 — confirmed permanently out; carried as action type)
- Predictive scoring, propensity modelling, AI next-best-action
- Automated case creation (manual creation adopted per D-2; threshold configurable)

---

## 4. Stakeholders and User Roles

| Stakeholder | Role in DCP | Primary screens | Interest |
|---|---|---|---|
| Collection Officer | Daily follow-up, action logging, PTP capture | Customer 360, Action Plan, PTP, Comms | Single workspace; no spreadsheets |
| Relationship Manager | Customer context, restructuring inputs | Customer 360, Restructuring | RM follow-up visibility |
| Senior Manager — Collections | Queue oversight, approvals, escalations | Work Allocation, Dashboard, Admin | Workload + SLA visibility |
| Head of Collections | Final endorsement on major escalations | Dashboard, Approvals | Portfolio health + compliance |
| Legal User | Legal lifecycle post-hand-off | Native CRM Legal forms (not portal) | Clean hand-off packet |
| Insurance / Deceased Officer | Claims lifecycle | Native CRM forms (not portal) | Stop-contact evidence; claim docs |
| Restructuring Officer | Workout proposals | Restructuring screen | Approval trail |
| Risk / Credit Officer | Review restructuring / legal-risk cases | Approval queue | Credit risk visibility |
| Finance User | Payment and recovery view | Read-only | Recovery amounts |
| Admin User | Roles, templates, configuration | Admin Configuration | Business rule management |
| Audit / Compliance | Evidence review | Read-only audit trail | Regulatory evidence export |
| Management | Portfolio dashboards | Dashboards | NPL trend; officer productivity |
| IT — MSS Technologies | Build and operate | All | Delivery |
| QDB Product Owner | Scope and priority decisions | All | Feature completeness |

---

## 5. Business Context and Operating Model

The portfolio contains approximately 3,905 delinquent Housing Loan customers
(~4,300–4,900 including BFD) against QAR 3.42bn outstanding and QAR 213m arrears.
Key facts that shape requirements:

- **Buckets are days past due, not QAR bands.** The MIS API delivers pre-classified
  10-bucket DPD data. The platform must store and act on all ten buckets verbatim.
- **Arrears are extremely concentrated.** 406 customers (10.4% of cases) hold 58.7%
  of arrears; 1,098 customers (≥501 DPD) hold 89.4%. Top-of-funnel cure work (1–30 DPD)
  is where 41% of case volume sits, carrying only 1.1% of arrears.
- **Exposure carries no signal.** Average loan balance is nearly flat across all DPD
  buckets (QAR 795k–920k). DPD and arrears are the only discriminating inputs.
  Phase 1 must NOT segment by exposure.
- **The >2000 DPD population (406 customers) is not a collections book.** At 5.5+ years
  past due these are legal, NPL, write-off, or deceased cases. Automated outbound contact
  is both pointless and a conduct risk. The config table must be able to express
  "no automated contact" for this bucket.
- **Manual case creation (D-2) is adopted.** The officer decides whether to open a case.
  The creation threshold is configurable so automation can be enabled by a config change.
- **Delinquency source is the MIS middleware API (D-1).** The nightly CBS batch ingestion
  design is superseded. DPD and arrears are not computed by the platform.
- **MIS data storage (§5 of facts-and-analysis.md).** A thin immutable snapshot
  (`qdb_delinquencysnapshot`) is persisted in each CRM for audit and CRM-side automation;
  live balances are read from the MIS API on-screen with an "as of" timestamp.
- **ADR-DCP-01 (custom activity entities):** `qdb_collectionaction` and `qdb_communication`
  are separate custom activity entity types. PTP, legal case, restructure case, insurance
  claim, and dispute are normal entities with full lifecycle state.
- **ADR-DCP-02 (Next.js portal + Fastify router):** The workspace is a standalone portal;
  the router is a separate Fastify service callable by all consumers.
- **ADR-DCP-03 (portal owns submission; CRM owns downstream lifecycle):** Legal and
  Insurance Officers work in native CRM. No portal UI for these personas in Phase 1.

---

## 6. Assumptions and Constraints

1. The CRM on-premise vs Dataverse cloud question (Q-14) is resolved (on-prem now, cloud in ~18 months). All requirements
   are written to be technology-neutral between on-prem and cloud except where explicitly noted.
2. Housing Loan CRM and BFD CRM share an identical managed solution schema (`qdb_` prefix)
   deployed from one package. Schema drift between orgs is a deployment defect, not a feature.
3. A QID is the authoritative customer identity key across both orgs. Every customer record
   in both CRMs carries a QID. Records without a QID are placed in the unresolved-identity
   queue and are not merged.
4. The platform stores only delinquent accounts, not the full loan book.
5. Arabic and English bilingual support is required for all customer-facing communications
   and for all officer-facing screens where the skeleton specifies it.
6. PDPPL applies to all customer contact data, communication logs, and stored PII.
   A data-protection assessment is a go-live gate and must be completed before any
   production data lands on any environment.
7. Data residency: all CRM data resides in Qatar or in the tenant's designated data boundary.
   The router and portal follow the same residency constraint.
8. The `qdb_delinquencysnapshot` table is append-only. The plugin that enforces immutability
   is deployed to both orgs before any data is written.
9. The 2-person delivery model shapes prioritisation. Anything that requires a third team
   (e.g. BSP procurement) is deferred or flagged as a procurement workstream.
10. The portal is a new user-facing application requiring AAD app registration, hosting
    approval, and a bank security review. These are delivery prerequisites, not assumptions.

**Constraints**

- C-01: No intelligence layer (predictive scoring, AI next-best-action) in Phase 1.
- C-02: No WhatsApp channel in Phase 1 (BSP contract and PDPPL consent prerequisite).
- C-03: No cross-org Customer 360 React surface in Phase 1 (router is built; UI deferred).
- C-04: No portal UI for Legal User or Insurance Officer in Phase 1 (ADR-DCP-03).
- C-05: Exposure must not be used as a segmentation criterion. Arrears and DPD only.
- C-06: No auto-creation of cases on MIS ingestion (manual; threshold configurable).
- C-07: Q-14 resolved 2026-09-14 — on-premise 9.x now, Dataverse cloud in ~18 months. Every component must run on both without a rewrite; the migration itself is outside DCP-001 scope.

---

## 7. Open Questions

Each item below is carried with an owner and a default assumption that drives Phase 1 design.
A confirmed answer that differs from the default assumption may change requirements.

| # | Question | Owner | Default assumption used in this BRD |
|---|---|---|---|
| Q-02 | Automatic vs manual case creation: RFP acceptance criteria require auto-creation; Final Requirements say manual | Product Owner | Manual creation adopted; RFP criterion superseded by Final Requirements |
| Q-03 | Ten MIS buckets vs 6–8 option set in the earlier prototype | Architect | Ten MIS buckets adopted verbatim; NPL and Write-off are a separate account-status axis |
| Q-04 | UCI forms vs React workspace vs both for Collection Officer / RM / Manager | Product Owner | React workspace for CO/RM/Manager; UCI native CRM for Legal and Insurance (ADR-DCP-03) |
| Q-06 | Delinquency source: nightly CBS vs MIS middleware API | Integration Lead | ✅ **CLOSED 2026-09-14 (user):** MIS middleware API as sole source; QDB's warehouse is called MIS and the API returns data pre-classified into buckets. CBS ingestion design retired |
| Q-08 | WhatsApp in Phase 1 (BSP contract, template approval, session-window rules, PDPPL consent) | Compliance / Product Owner | WhatsApp is a procurement workstream; excluded from Phase 1 build |
| Q-09 | Treatment of 406 customers >2000 DPD — is automated contact permitted? | Compliance | Config table can express "no automated contact"; business sets the rule per bucket |
| Q-10 | Field Visit (Module 11) — permanently out of Phase 1? | Product Owner | Confirmed out; carried as action type on `qdb_collectionaction` |
| Q-11 | Official letters: physical dispatch + return-receipt lifecycle beyond Completed/Canceled? | Product Owner | `qdb_communication` statuses cover Completed/Canceled; sub-states added if confirmed |
| Q-12 | WhatsApp under same PDPPL consent gate as SMS? | Compliance | Assumed yes; procurement-gated so no Phase 1 build impact |
| Q-13 | Multi-recipient contact (guarantor/heir) in Phase 1 scope? | Product Owner | Deferred to Phase 2; PartyList limitation needs a design answer if confirmed |
| Q-14 | CRM on-premise 2019 or Dataverse cloud? | Client / Technical Lead | ✅ **CLOSED 2026-09-14 (user): both orgs on-premise 9.x now; both migrate to Dataverse cloud in ~18 months.** Architecture must treat the migration as a named constraint: pluggable router auth adapter (AD FS/OAuth now, Azure AD MSAL later), only features present on both platforms, containerised router, solution importable into Dataverse |

---

## 8. Module 1 — Customer & Loan 360

Source: skeleton §A; Final Requirements; brief §5; non-negotiable R-01.

| FR-001 | The system SHALL display a unified customer profile including name, QID, CR number, mobile, email, address, employer, salary transfer status, nationality, and vulnerability flag, sourced from the HL CRM (Phase 1). | P1 | Skeleton §A |
| FR-002 | The system SHALL display all loan/facility records for the customer: product type, outstanding balance (live "as of" from MIS API), arrears, instalment, DPD, maturity date, collateral, guarantor, restructure flag, and NPL flag. | P1 | Skeleton §A; FR-002 note: live balance shows alongside snapshot value with explicit "as of" timestamp |
| FR-003 | The system SHALL display the full delinquency snapshot history for each facility, with MIS batch reference and "as of" timestamp per row, sourced from `qdb_delinquencysnapshot`. | P2 | facts-and-analysis.md §5; non-negotiable |
| FR-004 | The system SHALL display the customer's complete collection history: all `qdb_collectionaction` and `qdb_communication` activity records in chronological order on the native CRM Timeline. | P1 | ADR-DCP-01; skeleton §A |
| FR-005 | The system SHALL display legal case status, insurance claim status, and deceased flag on the Customer 360 screen as read-only fields sourced from the respective CRM entities. | P2 | Skeleton §A |
| FR-006 | The system SHALL display all open and historical PTP records, restructure cases, and dispute records linked to the customer or facility. | P2 | Skeleton §A |
| FR-007 | The system SHALL enforce QID as the customer identity key; customers without a QID on their CRM record SHALL be placed in the unresolved-identity queue (`qdb_identityexception`). | P1 | Non-negotiable R-06; brief R-06 |
| FR-008 | The system SHALL display an unresolved-identity queue showing all identity mismatches (missing QID, name mismatch, QID found in one org only) with an action prompt for manual review. | P2 | Non-negotiable R-06 |
| FR-009 | The router SHALL fan out Customer 360 reads to both HL and BFD CRMs using the QID identity map and merge results into one view when BFD is enabled; in Phase 1 (BFD feature-flagged off) the view is HL-only with BFD data hidden but router routing logic built. | P3 | Non-negotiable R-01; facts-and-analysis.md §6.3 |
| FR-010 | The system SHALL display the MIS ingest batch status (last run, records processed, failures) on the Customer 360 screen so officers are informed of any data staleness. | P2 | facts-and-analysis.md §5 |
| FR-011 | The system SHALL display payment history (payment date, amount, channel, rejection reason, auto-sweep status) for each facility, sourced from the Payments integration. | P2 | Skeleton §7.C |
| FR-012 | The system SHALL display the communication history log (channel, template, direction, delivery status, timestamp) for all communications linked to the customer. | P1 | Skeleton §G |
| FR-013 | The system SHALL display the complaint and dispute history linked to the customer. | P2 | Skeleton §L |
| FR-014 | The system SHALL mask sensitive PII fields (such as full mobile number and bank account number) for roles that do not hold the "View Sensitive PII" privilege, enforced at the API layer. | P1 | Non-negotiable R-07; PDPPL |
| FR-015 | The system SHALL display the customer's DPD bucket colour-coded using the ten MIS bucket taxonomy, consistent with the strategy configuration table. | P2 | facts-and-analysis.md §3 |

---

## 9. Module 2 — Delinquency & Case Creation

Source: skeleton §B; Final Requirements; ADR-DCP-01; facts-and-analysis.md §1 D-1, D-2, D-3.

| FR-016 | The system SHALL ingest delinquency data for overdue accounts (not the full book) from the MIS middleware API on a configurable schedule, upsert `qdb_customer` and `qdb_loanfacility`, and append an immutable row to `qdb_delinquencysnapshot` per facility per run. | P1 | Non-negotiable; facts §5; D-1 |
| FR-017 | Each `qdb_delinquencysnapshot` row SHALL carry: MIS batch reference, `asOf` timestamp, DPD value, arrears amount, outstanding balance, and bucket classification from the MIS source. The row is append-only; Update and Delete are blocked by a CRM plugin. | P1 | Non-negotiable; ADR-DCP-01 §constraints |
| FR-018 | The system SHALL store DPD bucket using the ten-value MIS taxonomy: 1–30, 31–60, 61–90, 91–180, 181–270, 271–360, 361–500, 501–1000, 1001–2000, >2000. NPL and Write-off SHALL be stored as a separate account-status field, not in the bucket field. | P1 | Non-negotiable; facts §3; Q-03 default |
| FR-019 | An officer SHALL be able to create a collection case (`qdb_collectioncase`) manually against a customer and facility, without requiring any automated trigger. | P1 | D-2; Final Requirements |
| FR-020 | The case creation form SHALL require the officer to select the product type (Housing Loan, Corporate Loan, SME Facility, Restructured Facility, Legal Account, Deceased Account) and a mandatory case reason. | P1 | D-3; Final Requirements |
| FR-021 | The system SHALL allow an administrator to configure an automatic case creation threshold (e.g. "create case when DPD reaches N"), which defaults to disabled (manual-only) in Phase 1 but can be enabled by a config change. | P3 | D-2; facts §2.2 |
| FR-022 | The case SHALL support the following `statuscode` values: New, Assigned, In Progress, Pending Customer Response, PTP Active, PTP Broken, Restructure Review, Restructured, Escalated to Supervisor, Pending Legal Review, Referred to Legal, Under Legal Action, Deceased/Insurance Review, Settled, Closed, Written Off, Reopened. | P1 | Skeleton §15 |
| FR-023 | Status transitions SHALL be enforced by a CRM plugin that validates the allowed transition matrix; invalid transitions SHALL be rejected with an explanatory error. | P1 | Brief §2; ADR-DCP-01 |
| FR-024 | The system SHALL display the delinquency snapshot value (arrears, DPD) captured at case creation alongside the current live value with an "as of" timestamp on the case screen. | P2 | Non-negotiable; facts §5 |
| FR-025 | The system SHALL prevent deletion of any collection case record; the Delete privilege SHALL be removed from every security role. | P1 | Skeleton §17; non-negotiable R-03 |
| FR-026 | The system SHALL segregate the >2000 DPD population visually (distinct colour, separate queue segment) on the case list and dashboard. | P2 | facts §2.2 |
| FR-027 | The system SHALL display an ingestion-failure alert on the workspace when the MIS ingest batch fails or has not completed within the configured SLA window. | P1 | facts §5 |
| FR-028 | The case entity SHALL capture `created_by`, `created_on`, `modified_by`, `modified_on` on every record. All IDs are GUIDs. | P1 | CLAUDE.md enterprise rules |
| FR-029 | The system SHALL support case reopening from Closed status, requiring a mandatory reopen reason, captured in the audit trail. | P2 | Skeleton §15 |
| FR-030 | A case created against a BFD facility SHALL be routed by the CRM Context Router to the BFD CRM; the feature flag controls whether BFD cases are visible in the portal UI. | P3 | Q-05 (answered); ADR-DCP-02 |

---

## 10. Modules 3–4 — Segmentation, Strategy & Work Allocation

Source: skeleton §C, §D; Final Requirements; facts-and-analysis.md §2.2, §2.3; non-negotiable C-05.

**Segmentation (Module 3)**

| FR-031 | The system SHALL read the strategy configuration table (`qdb_strategyconfig`) at runtime to determine the action triggered for each DPD bucket and segment combination. No segmentation rules SHALL be hard-coded. | P1 | D-4; Final Requirements |
| FR-032 | The strategy configuration table SHALL support: DPD bucket (10-value), customer segment (Retail/SME), and action type (SMS, Email, Letter, Queue assignment, No contact). | P1 | D-4; non-negotiable C-05 |
| FR-033 | The system SHALL support a "no automated contact" rule in the strategy table that suppresses all outbound communications for a bucket, so the >2000 DPD population can be excluded from automated outreach. | P1 | Non-negotiable; facts §2.2 |
| FR-034 | The strategy engine SHALL NOT segment by exposure (outstanding balance). DPD and arrears amount are the only permitted segmentation inputs in Phase 1. | P1 | Non-negotiable C-05; facts §2.3 |
| FR-035 | An administrator SHALL be able to activate, deactivate, and edit strategy rules without a deployment; rule changes take effect on the next MIS ingest cycle. | P1 | D-4; skeleton §12 |
| FR-036 | All strategy rule changes SHALL be captured in the audit trail with the actor, timestamp, old value, and new value. | P1 | Skeleton §11; non-negotiable R-03 |

**Work Allocation & Queues (Module 4)**

| FR-037 | The system SHALL maintain named queues in CRM: Early Collection, High Risk, Deceased & Insurance, Legal Review, Restructuring, Disputes & Complaints. | P1 | Skeleton §D; prototype Q-EARLY etc. |
| FR-038 | The system SHALL support automatic case assignment to a queue based on the strategy rule triggered by the DPD bucket, with manual reassignment available to supervisors. | P1 | Skeleton §D |
| FR-039 | Manual case reassignment SHALL require a mandatory reason and SHALL be captured in the audit trail. Reassignment of cases where the arrears amount or DPD bucket meets or exceeds the threshold configured in the admin approval-limit table SHALL require Head-of-Collections approval; the approval threshold is read at runtime from the configuration table and SHALL NOT be hard-coded. | P2 | Skeleton §6 approval matrix; C-05; FR-034 |
| FR-040 | The system SHALL track SLA for each queue: time since case was assigned, overdue indicator when SLA is breached. SLA thresholds SHALL be configurable per queue. | P1 | Skeleton §D |
| FR-041 | The system SHALL provide a supervisor view showing team workload per officer: open cases, actions completed, overdue actions, broken PTPs. | P1 | Skeleton §D; SO-01 |
| FR-042 | The system SHALL support workload-balancing reassignment: a supervisor can drag-and-drop or bulk-reassign cases from one officer to another. | P2 | Skeleton §D |
| FR-043 | A deceased or stop-contact case SHALL be automatically moved to the Deceased & Insurance queue; all other queues SHALL reject assignment of stop-contact cases. | P1 | Skeleton §D; ADR-DCP-01 constraint 3 |
| FR-044 | The system SHALL support configurable queue routing rules (by product, DPD bucket, risk level, legal status, deceased status) without code deployment. | P2 | Skeleton §12 |

---

## 11. Modules 5–6 — Collection Action Plan & PTP Management

Source: skeleton §E, §F; Final Requirements; ADR-DCP-01.

**Collection Action Plan (Module 5)**

| FR-045 | An officer SHALL be able to log a `qdb_collectionaction` activity (Call, Meeting, Supervisor Review, Manual Note) against a customer, facility, or case — without a case being required. | P1 | ADR-DCP-01 decision 3 |
| FR-046 | The action record SHALL capture: action type (configurable), outcome code (from config table), mandatory notes, actor, timestamp, and `scheduledend` (next-action date). `scheduledend` is mandatory for every open action. | P1 | Skeleton §E controls; ADR-DCP-01 |
| FR-047 | The system SHALL prevent Update or Delete of a `qdb_collectionaction` once `statecode = Completed`; a CRM plugin SHALL enforce this unconditionally. | P1 | Non-negotiable R-03; ADR-DCP-01 constraint 1 |
| FR-048 | The system SHALL flag open `qdb_collectionaction` records where `scheduledend` is in the past as overdue; these SHALL appear in the overdue-actions view for the assigned officer and supervisor. | P1 | Skeleton §17; ADR-DCP-01 |
| FR-049 | The officer SHALL be able to escalate a case to supervisor from the action plan screen; the escalation SHALL create a `qdb_collectionaction` of type Supervisor Review and notify the supervisor. | P2 | Skeleton §E |
| FR-050 | The system SHALL support action plan templates (pre-defined sequences of action types) that an officer can apply to a case to generate the initial action backlog. | P2 | Skeleton §E |
| FR-051 | A Supervisor Review action SHALL require approval (accept/return with reason) from the assigned supervisor; the outcome SHALL be captured in the audit trail. | P2 | Skeleton §E; skeleton §6 |
| FR-052 | The system SHALL capture action outcome codes from the configurable action-outcome table, not from a hard-coded option set. The standard outcomes from skeleton §16 are the initial seed values. | P1 | D-4; skeleton §16 |
| FR-053 | The system SHALL record `user_id` and system timestamp on every action creation and update, non-overridable. | P1 | Skeleton §E controls |
| FR-054 | The field-visit action type SHALL be available on `qdb_collectionaction` (as action type "Field Visit") even though Module 11 is deferred; the field visit lifecycle entity is not built in Phase 1. | P2 | D-8; ADR-DCP-01 constraint 5 |

**PTP Management (Module 6)**

| FR-055 | An officer SHALL be able to create a `qdb_ptprecord` entity capturing: PTP date, promised amount, partial/full flag, customer commitment notes, and reminder date. A case is recommended but not required. | P1 | ADR-DCP-01 §5 |
| FR-056 | The system SHALL send an automatic reminder communication (SMS or email using an approved template) one day before the PTP due date, subject to stop-contact and consent checks. | P1 | Skeleton §F; SC-02 |
| FR-057 | The system SHALL monitor each PTP after its due date; when no matched payment is received by end-of-day on the promised date, the system SHALL automatically set PTP status to Broken and create a broken-PTP `qdb_collectionaction`. | P1 | SC-02; skeleton §F |
| FR-058 | A broken PTP SHALL trigger an escalation notification to the assigned supervisor. After a configurable number of broken PTPs for the same customer, the case SHALL be escalated to the supervisor queue. | P1 | Skeleton §4.B; skeleton §F |
| FR-059 | The system SHALL support PTP statuses: Open, Kept, Partially Kept, Broken, Rescheduled, Cancelled. | P1 | Skeleton §F |
| FR-060 | A PTP reschedule SHALL require a mandatory reason. After a configurable limit of reschedules (default: 2), further reschedule SHALL require Senior Manager approval. | P2 | Skeleton §F controls |
| FR-061 | All PTP changes (create, edit, reschedule, status change, cancellation) SHALL be captured in the audit trail with actor, timestamp, old value, and new value. | P1 | Non-negotiable R-03; skeleton §F |
| FR-062 | A Payments integration event (matched payment received) SHALL automatically update the linked PTP status to Kept or Partially Kept based on the amount matched. | P2 | Skeleton §F; integration §8.B |
| FR-063 | The system SHALL track the PTP kept rate per officer and expose it on the performance dashboard. | P2 | Skeleton §10 KPIs |
| FR-064 | A customer flagged with `stopContact = true` SHALL NOT receive a PTP reminder communication; the blocked attempt SHALL be logged in the audit trail with the block reason. | P1 | Non-negotiable R-04 |

---

## 12. Module 7 — Communication Management

Source: skeleton §G; Final Requirements; ADR-DCP-01; non-negotiable R-04.

| FR-065 | The system SHALL support the following outbound communication channels in Phase 1: SMS, Email, Official Letter, Outbound Phone Call log. | P1 | Skeleton §G; D-7 (WhatsApp excluded) |
| FR-066 | All outbound communications SHALL be recorded as `qdb_communication` activity entities; the communication record is the single authoritative record of a send (no duplicate action row per ADR-DCP-01 §6). | P1 | ADR-DCP-01 decision 6 |
| FR-067 | The CRM Context Router SHALL evaluate stop-contact status (`stopContact = true`) and PDPPL consent before creating any `qdb_communication` record. A blocked attempt SHALL still be written to the communication log with channel, block reason, and timestamp. | P1 | Non-negotiable R-04; ADR-DCP-01 constraint 3 |
| FR-068 | The system SHALL enforce stop-contact in the router before reaching any channel adapter. Stop-contact enforcement SHALL NOT be implemented at the UI layer only. | P1 | Non-negotiable R-04 |
| FR-069 | All outbound communications SHALL use pre-approved templates. An officer WITHOUT the "Send Free-Text Message" privilege SHALL NOT be able to compose a free-text message to a customer. | P1 | Skeleton §G controls |
| FR-070 | Communication templates SHALL support Arabic and English content. Templates SHALL be selected based on the customer's preferred language where configured; default is Arabic. | P1 | Skeleton §G; brief §5 |
| FR-071 | Templates SHALL be subject to a template approval workflow before they can be used. Template creation and change SHALL require Compliance or Management approval. | P2 | Skeleton §G controls |
| FR-072 | The system SHALL track delivery status for SMS and email where available from the gateway (Delivered, Failed, Opened). Official letters SHALL support Sent, Delivered-Signed, and Returned statuses (default per Q-11; see Section 7 — sub-states added if Q-11 is confirmed). | P2 | Q-11 default; skeleton §G |
| FR-073 | An officer SHALL be able to log an inbound or outbound phone call as a `qdb_communication` record (channel = Call) with outcome and notes; no telephony integration is required in Phase 1. | P1 | Skeleton §G; ADR-DCP-01 |
| FR-074 | Bulk outbound campaigns (SMS or email to a filtered segment) SHALL be supported, subject to stop-contact and consent validation for every recipient in the batch. | P2 | Skeleton §G; BO-03 |
| FR-075 | The system SHALL prevent Update or Delete of a `qdb_communication` record once `statecode = Completed`; enforced by plugin. | P1 | Non-negotiable R-03; ADR-DCP-01 |
| FR-076 | Communication template changes SHALL be captured in the audit trail with actor, timestamp, template ID, and old/new content. | P1 | Non-negotiable R-03 |

**PDPPL Consent Management (added per COND-DCP-003)**

| FR-133 | The system SHALL maintain a PDPPL consent record per customer per channel (SMS, email, WhatsApp, phone, official letter), capturing: consent status (given / withdrawn / not-recorded), lawful-processing basis, source of consent (officer-captured, portal self-service, or imported), timestamp, and the identity of the person who recorded or withdrew it. | P1 | PDPPL; NFR-008; BO-03 |
| FR-134 | The CRM Context Router SHALL read the consent record for the target customer and the requested channel before creating any `qdb_communication` record. If consent status is unknown, missing, or withdrawn for that channel, the router SHALL block the send, write a refusal record carrying channel, timestamp, and reason ('consent_not_established' or 'consent_withdrawn'), and return an error to the caller. Absence of a consent record SHALL be treated as no consent (fail-closed). | P1 | PDPPL; NFR-008; FR-067; FR-074 |
| FR-135 | A consent withdrawal SHALL take effect immediately upon being recorded; the router SHALL honour the withdrawal on the next communication attempt with no grace period. The withdrawal event SHALL be captured in the audit trail with actor, timestamp, channel, and the stated withdrawal reason. | P1 | PDPPL; NFR-010; FR-067 |
| FR-136 | WhatsApp consent SHALL default to the same consent gate as SMS; the router SHALL evaluate WhatsApp communication requests using the customer's SMS consent record unless Q-12 is confirmed otherwise by the client in writing. [NEEDS CLARIFICATION: Q-12 — client confirmation required on whether WhatsApp requires a separate consent record or shares the SMS gate.] | P1 | Q-12; FR-067; C-02 |

---

## 13. Module 8 — Restructuring / Workout

Source: skeleton §H; Final Requirements; ADR-DCP-03.

| FR-077 | An officer or RM SHALL be able to create a `qdb_restructurecase` entity from the portal, capturing: customer and facility, new tenor, new instalment, grace period, waiver amount, eligibility checklist, and supporting documents. | P2 | Skeleton §H; ADR-DCP-03 |
| FR-078 | The restructure case SHALL follow the approval workflow: Collection Officer → Senior Manager → Head of Collections → Credit/Risk → Committee (if required). Each stage SHALL record actor, timestamp, decision, and reason. | P2 | Skeleton §H approval workflow |
| FR-079 | The approval workflow stages and limits SHALL be configurable by an administrator; no stage thresholds are hard-coded. | P2 | Skeleton §12 |
| FR-080 | A waiver request within a restructure proposal SHALL require a separate maker-checker approval, with the waiver amount and justification captured as mandatory fields. | P2 | Skeleton §6 |
| FR-081 | The system SHALL enforce a document checklist for restructure proposals; the proposal cannot be submitted for approval until all mandatory documents are uploaded. | P2 | Skeleton §H |
| FR-082 | After a restructure is approved, the system SHALL create a post-restructure monitoring schedule; any breach of the restructured terms SHALL flag the case as Re-Defaulted. | P2 | Skeleton §H |
| FR-083 | The officer SHALL be able to submit a financial assessment for the customer (income, liabilities, employment status) as part of the restructure proposal, stored against the restructure case. | P2 | Skeleton §H |
| FR-084 | A rejected restructure proposal SHALL require a mandatory rejection reason; the officer SHALL be able to revise and resubmit. | P2 | Skeleton §H |
| FR-085 | All restructure case changes (status, approval decisions, document uploads, re-default events) SHALL be captured in the audit trail. | P2 | Non-negotiable R-03 |
| FR-086 | The portal SHALL display the officer a read-only status view of any restructure case they submitted, showing the current approval stage and approver comments. | P2 | ADR-DCP-03 decision 3 |

---

## 14. Module 9 — Legal Case Management

Source: skeleton §I; Final Requirements; ADR-DCP-03.

| FR-087 | An officer SHALL be able to submit a legal referral from the portal by completing a `qdb_legalcase` hand-off entity. The entity requires: legal referral checklist completion, case history summary, outstanding balance, communication history, PTP history, restructuring history, and mandatory documents. | P2 | Skeleton §I; Final Requirements |
| FR-088 | Submission of a legal referral SHALL require maker-checker approval (Senior Manager and Head of Collections) before the case is transmitted to the CRM Legal module. | P2 | Skeleton §I controls |
| FR-089 | The legal referral SHALL only be submitted when the case has passed the configured DPD threshold and all previous collection attempts are recorded. These preconditions are enforced by the router plugin. | P2 | Skeleton §I controls |
| FR-090 | The portal SHALL display the officer a read-only legal case status view (Pending Legal Review, Notice Issued, Case Filed, Court Stage, Judgment Received, Execution Stage, Settlement Reached, Closed) sourced from the CRM Legal module via the router. | P2 | Skeleton §I; ADR-DCP-03 decision 3 |
| FR-091 | Legal Users track the legal lifecycle in native CRM forms. No portal UI for the Legal User persona is built in Phase 1. | P1 | ADR-DCP-03 decision 2 |
| FR-092 | The Legal User SHALL be able to return a case to Collections from native CRM, with a mandatory return reason. The return SHALL create a `qdb_collectionaction` and update the case status. | P2 | Skeleton §I controls |
| FR-093 | Legal recovery amount and legal cost shall be captured on the `qdb_legalcase` entity, updated by the Legal User in native CRM. | P2 | Skeleton §I |
| FR-094 | Court documents SHALL be uploadable against the legal case in CRM. All document uploads SHALL be captured in the audit trail. | P2 | Skeleton §I |

---

## 15. Modules 10 & 12 — Deceased & Insurance Claims + Disputes

Source: skeleton §J, §L; Final Requirements; non-negotiables R-04.

**Deceased & Insurance Claims (Module 10)**

| FR-095 | An officer SHALL be able to flag a customer as deceased by setting a deceased flag and `stopContact = true` on the customer record, capturing: date of death, source of confirmation, and mandatory approver. | P1 | Skeleton §J; non-negotiable |
| FR-096 | Setting `stopContact = true` SHALL immediately suppress all automated outbound communications to the customer in the router; the suppression is enforced before any channel adapter and cannot be overridden at the UI. | P1 | Non-negotiable R-04; skeleton §4.D |
| FR-097 | A deceased case SHALL be automatically transferred to the Deceased & Insurance queue and all standard collection queue membership removed. | P1 | Skeleton §J controls |
| FR-098 | An officer SHALL be able to create an `qdb_insuranceclaim` entity capturing: claim kind (Credit Life, Takaful Life, Disability), insurer, claim submission date, claim amount, and a document checklist. | P2 | Skeleton §J |
| FR-099 | The insurance claim SHALL support statuses: Pending Documents, Submitted, Under Review, Approved, Rejected, Paid. Status transitions SHALL be captured in the audit trail. | P2 | Skeleton §J; Final Requirements |
| FR-100 | Any communication with the estate or heirs SHALL require mandatory Senior Manager approval, captured in the audit trail (default per Q-13; see Section 7 — if Q-13 confirms multi-recipient is out of scope, this FR is scoped to deceased-family approval only). | P2 | Skeleton §J controls; Q-13 default |
| FR-101 | The outstanding balance after insurance claim settlement SHALL be updated on the facility record and displayed on the Customer 360 screen. | P2 | Skeleton §J |
| FR-102 | Insurance Officers manage the claim lifecycle in native CRM. No portal UI for the Insurance Officer persona is built in Phase 1. | P1 | ADR-DCP-03 |

**Disputes & Complaint Management (Module 12 in the module list; implemented here)**

| FR-103 | An officer SHALL be able to register a `qdb_dispute` entity capturing: complaint type (configurable), root cause, supporting documents, assigned owner, and SLA due date. | P2 | Skeleton §L; Final Requirements |
| FR-104 | When a dispute is registered against a case, collection activity on that case SHALL be paused (`collectionPaused = true`) until the dispute is resolved or rejected. | P2 | Skeleton §L; prototype DSP data |
| FR-105 | The dispute SHALL track investigation notes, resolution decision, customer response, and escalation to management if required. All changes SHALL be in the audit trail. | P2 | Skeleton §L |
| FR-106 | The dispute SLA timer SHALL start on registration; overdue disputes SHALL appear in the supervisor queue. SLA thresholds are configurable per complaint type. | P2 | Skeleton §L; skeleton §12 |
| FR-107 | Standard complaint types (configurable initial seed): Payment Already Made, Wrong Deduction, Incorrect Arrears Amount, Bank Rejection Issue, Communication Sent by Mistake, Deceased Case Communication Issue, Legal Escalation Objection. | P2 | Skeleton §L; Final Requirements |

---

## 16. Modules 13–15 — Audit Trail & RBAC, Admin Configuration, Integration Layer, Dashboards & MIS

Source: skeleton §11, §12, §8, §9; non-negotiables R-03, R-04, R-05, R-07.

**Audit Trail & RBAC (Module 13)**

| FR-108 | The system SHALL maintain an append-only audit log (`qdb_auditlog`) written exclusively by a CRM plugin; no audit writes SHALL originate from the portal or the router. | P1 | Non-negotiable R-03 |
| FR-109 | The audit log SHALL capture: action type, entity name, record ID, old value, new value, actor (user ID + role), timestamp, and request source path (React → Router → CRM). | P1 | Skeleton §11; prototype AUDIT data |
| FR-110 | A CRM plugin SHALL block Update and Delete on `qdb_auditlog` unconditionally, including for system administrators. | P1 | Non-negotiable R-03 |
| FR-111 | The system SHALL support a full evidence-pack export: all audit entries for a case, including actions, communications, PTPs, approvals, and status changes, in a single exportable file. | P1 | SC-04; skeleton §11 |
| FR-112 | Security roles SHALL be defined in a single role matrix deployed identically to both CRMs from one solution package. A role-drift report SHALL be generated on each deployment comparing both orgs. | P1 | Non-negotiable R-05; brief R-05 |
| FR-113 | Standard roles: Collection Officer, Relationship Manager, Senior Manager, Head of Collections, Legal User, Insurance Officer, Restructuring Officer, Risk/Credit User, Finance User, Admin User, Audit/Compliance (read-only), Management (dashboards only). | P1 | Skeleton §5 |
| FR-114 | Sensitive PII fields (mobile number, bank account, full address) SHALL be masked for roles without "View Sensitive PII" privilege; masking is enforced at the API layer in the router, not in the portal. | P1 | Non-negotiable R-07; PDPPL |
| FR-115 | User activity logs (login, logout, data access, export) SHALL be captured in the audit trail. | P2 | Skeleton §11 |

**Admin Configuration (Module 14)**

| FR-116 | An Admin User SHALL be able to manage the following via the portal Admin screen without a code deployment: DPD strategy rules, communication templates, SLA thresholds, queue assignment rules, PTP reschedule limits, legal referral thresholds, approval limit matrix. | P2 | Skeleton §12 |
| FR-117 | Template creation and activation SHALL require a Compliance or Management approval step before the template is available to officers. | P2 | Skeleton §G controls |
| FR-118 | All admin configuration changes SHALL be captured in the audit trail with actor, timestamp, and old/new values. | P1 | Non-negotiable R-03 |

**Integration Layer (Module 15)**

| FR-119 | The CRM Context Router SHALL route all requests to Housing Loan CRM (Phase 1) or BFD CRM (when feature flag is enabled) based on the record ID prefix, facility product type, or explicit org parameter. | P1 | ADR-DCP-02; brief §4 |
| FR-120 | The router SHALL evaluate `stopContact` status on every outbound communication request before invoking any channel adapter; a blocked request SHALL be logged. | P1 | Non-negotiable R-04 |
| FR-121 | The system SHALL integrate with the MIS middleware API to receive pre-classified delinquency data. Raw DPD and arrears are received; no DPD calculation is performed by the platform. | P1 | D-1; Q-06 default |
| FR-122 | The system SHALL integrate with the SMS/Email gateway for outbound communications using pre-approved templates; delivery-status webhooks SHALL update the `qdb_communication` delivery status field. | P1 | Skeleton §8.D |
| FR-123 | The system SHALL integrate with the Payments system via an event stream; a matched payment event SHALL trigger PTP status update (Kept/Partially Kept) and a collection action log. | P2 | Skeleton §8.B |
| FR-124 | The system SHALL produce a monthly QCB/credit bureau delinquency file in the required format; the file generation is configurable for frequency and content. | P3 | Skeleton §8.E |
| FR-125 | The system SHALL emit a nightly extract to DWH/BI covering all collection entities; the extract feeds portfolio-level dashboards that neither CRM can answer alone. | P2 | Skeleton §8.F; facts §2 |
| FR-126 | The integration layer SHALL surface a health/status panel showing last successful run, record counts, latency, and failure count for each integration endpoint. | P1 | Facts §5; prototype INTEGRATIONS data |

**Dashboards & MIS (Module 12 of the module list)**

| FR-127 | The system SHALL provide an Operational Dashboard: total overdue cases, arrears by DPD bucket (10-value), new cases today, pending actions, overdue actions, broken PTPs, high-risk cases. | P1 | Skeleton §9.A; SC-05 |
| FR-128 | The system SHALL provide a Portfolio Dashboard fed from DWH: arrears by product, by DPD bucket, roll-rate by bucket transition, cure rate, recovery rate, NPL movement. | P2 | Skeleton §9.B; facts §2 |
| FR-129 | The system SHALL provide a PTP Dashboard: total PTPs, kept/broken/partial counts, PTP kept rate per officer, repeat broken-PTP customers. | P1 | Skeleton §9.C; SC-05 |
| FR-130 | The system SHALL provide a Legal Dashboard: cases in each legal stage, legal recovery amount, aging of legal cases, settlements reached. | P2 | Skeleton §9.D |
| FR-131 | The system SHALL provide a Management Dashboard: total overdue exposure, monthly recoveries, NPL trend, collection efficiency, officer productivity. | P2 | Skeleton §9.G; SO-02 |
| FR-132 | The Operational Dashboard SHALL segregate the >2000 DPD population from the active collection population, consistent with FR-026. | P2 | Facts §2.2 |

---

**Non-Functional Requirements**

| NFR-001 | Performance — Operational screens (Customer 360, case list) SHALL render in under 2 seconds at p95 on a standard office connection. | P1 | Skeleton §14 |
| NFR-002 | Performance — The MIS ingest batch SHALL complete for the full ~4,900 delinquent accounts within 30 minutes. | P1 | Facts §2.4 |
| NFR-003 | Availability — The portal and router SHALL target 99.5% availability during Qatar business hours (06:00–22:00 AST). | P1 | Business critical |
| NFR-004 | Availability — Planned maintenance windows SHALL be outside Qatar business hours with 48h notice. | P1 | Operational |
| NFR-005 | Security — All API endpoints SHALL require authentication via MSAL; unauthenticated requests are rejected with HTTP 401. | P1 | ADR-DCP-02; PDPPL |
| NFR-006 | Security — Customer PII SHALL NOT be rendered in server-side HTML. Contact data, arrears, and balances are fetched as client components via the router. | P1 | ADR-DCP-02 decision 4; PDPPL |
| NFR-007 | Security — RBAC is enforced at the router and CRM plugin layers; portal-layer enforcement is supplementary and not authoritative. | P1 | ADR-DCP-01 constraint; R-04 |
| NFR-008 | Compliance — PDPPL (Qatar Law No. 13 of 2016): all customer contact data, communication logs, and stored PII require a lawful processing basis. A data-protection assessment is a go-live gate. | P1 | Non-negotiable R-07; CEO §5 |
| NFR-009 | Compliance — Data residency: all CRM and platform data resides in Qatar or the tenant's designated data boundary. | P1 | Non-negotiable; assumption 7 |
| NFR-010 | Compliance — Audit logs are append-only, uneditable, and retained for a minimum of 7 years. | P1 | Regulatory standard; non-negotiable |
| NFR-011 | Scalability — The data volume (~4,900 delinquent accounts) is a small-data problem. The architecture must not over-engineer for a volume it does not have; avoid distributed caching and sharding unless the DWH integration requires it. | P1 | Facts §2.4 |
| NFR-012 | Scalability — The platform must support adding BFD CRM data without a code change; only a feature flag and router configuration change is required. | P1 | SC-06; ADR-DCP-02 decision 5 |
| NFR-013 | Internationalisation — All customer-facing communications support Arabic and English. The portal UI supports RTL layout for Arabic-language mode. | P1 | Skeleton §G; brief business context |
| NFR-014 | Reliability — MIS ingest failures SHALL surface as an alert in the workspace; a silent MIS outage must not leave stale data with no visible indicator. | P1 | Facts §5 |
| NFR-015 | Auditability — Every record in the system carries `created_by`, `created_on`, `modified_by`, `modified_on`. All IDs are GUIDs. | P1 | CLAUDE.md enterprise rules |
| NFR-016 | Testing — Minimum 80% automated test coverage on router and CRM plugin code. Every API endpoint has: happy path, validation failure, and auth failure test cases. | P1 | CLAUDE.md testing |
| NFR-017 | Deployment — The CRM managed solution is packaged as a single solution with all web resources and entities declared individually in `solution.xml` RootComponents; wildcard includes are not permitted. | P1 | CLAUDE.md CRM packaging |
| NFR-018 | Dependency — No hard-coded GUIDs, thresholds, rates, or business rules in code; all business parameters come from the admin configuration tables. | P1 | CLAUDE.md enterprise rules |
| NFR-019 | Monitoring — The integration health panel (FR-126) is a go-live requirement; operators must be able to see the status of all integrations from the portal. | P1 | Facts §5 |
| NFR-020 | Platform portability — the CRMs are on-premise 9.x today and migrate to Dataverse cloud in ~18 months. Router authentication SHALL be a pluggable adapter (AD FS/OAuth on-prem, Azure AD MSAL cloud) with no business logic aware of the flavour; the solution SHALL use only components available on both platforms; the router SHALL be containerised so the same image is redeployed to Azure. NFR-005 and NFR-006 apply under both flavours. | P1 | Q-14 closed 2026-09-14 |

---

## 17. Requirements Quality Checklist

**Completeness**

| # | Check | Answer |
|---|---|---|
| RQ-01 | Does every stakeholder group have at least one user story represented in the FR set? | Yes |
| RQ-02 | Are all non-negotiables from the CEO mandate captured as FRs or NFRs? | Yes — R-01 through R-07 each map to one or more FRs |
| RQ-03 | Does every open question Q-02 through Q-14 appear in Section 7 with an owner and default? | Yes |
| RQ-04 | Is Q-01 explicitly resolved (not carried as open)? | Yes — broad reading declared in Section 3 |
| RQ-05 | Are all six Phase 1 modules represented in the FR set? | Yes — Modules 1, 2, 3+4, 5+6, 7, 8, 9, 10, 12, 13, 14, 15 |

**Clarity**

| # | Check | Answer |
|---|---|---|
| RQ-06 | Does every FR use SHALL language with one unambiguous interpretation? | Yes |
| RQ-07 | Are all inline uncertainty markers visible and limited to open questions only? | Yes — FR-072 carries Q-11 (letter sub-states); FR-100 carries Q-13 (heir contact scope) |
| RQ-08 | Is exposure-based segmentation explicitly excluded by a named FR? | Yes — FR-034 and C-05 |
| RQ-09 | Is WhatsApp exclusion explicitly stated? | Yes — Section 3.2 and FR-065 |

**Consistency**

| # | Check | Answer |
|---|---|---|
| RQ-10 | Do all FR IDs use the FR-nnn (three-digit) format consistently? | Yes — FR-001 through FR-136 |
| RQ-11 | Do all NFR IDs use the NFR-nnn format? | Yes — NFR-001 through NFR-020 |
| RQ-12 | Is the module numbering consistent with brief.md §5 (no Module 16, no Module 11 as a module)? | Yes |
| RQ-13 | Does the portal scope (no Legal/Insurance portal UI) appear consistently in FRs 091, 102, and Section 3? | Yes |

**Coverage**

| # | Check | Answer |
|---|---|---|
| RQ-14 | Are all MIS bucket values (10-value taxonomy) required in FRs? | Yes — FR-018, FR-015 |
| RQ-15 | Is audit-trail append-only enforcement covered as a non-functional? | Yes — NFR-010, FR-108–FR-110 |
| RQ-16 | Is QCB/PDPPL compliance expressed as a go-live gate? | Yes — NFR-008 |

**Uncertainty**

| # | Check | Answer |
|---|---|---|
| RQ-17 | Are all requirements that depend on Q-14 (on-prem vs cloud) flagged? | Yes — NFR-020 and FR-030 |
| RQ-18 | Are there any guesses presented as decisions? | No — every unresolved item is flagged with an inline uncertainty marker and carried in Section 7 as an open question |

See `phase-2-ba-traceability.md` for the full traceability matrix mapping every FR to its
source document, module, priority, and test hook.

═══════════════════════════════════════════════════
END OF DOCUMENT
═══════════════════════════════════════════════════

---

## CEO BRD Approval Gate

**Date:** 2026-09-13
**Authority:** CEO — MSS Technologies
**Artifact reviewed:** `phase-2-ba.md` v1.0 (132 FRs, 20 NFRs) + `phase-2-ba-traceability.md`
**Gate run:** `.claude/scripts/gate-brd.sh` → PASS (1 warn: no `US-nn` user stories; FR-level P1/P2 priorities are present on all 132 FRs)

### Decision: APPROVED WITH CONDITIONS

I am approving this BRD as the requirements baseline for DCP-001 Phase 1: Q-01 is
resolved in favour of the broad six-module reading with the editing evidence stated,
every non-negotiable from the brief (R-01 through R-07) lands on a named FR or NFR,
PDPPL and Qatar data residency are written as requirements (NFR-008, NFR-009) rather
than deferred to audit, and every one of the 132 FRs carries a priority and a test hook.
The conditions below exist because the document is complete but not yet *deliverable* —
120 of 132 FRs are marked P1 against a 2-person team, the PDPPL consent gate that FR-067
depends on is referenced but never specified, and Q-14 still blocks the architecture the
approval is meant to unblock.

### What I verified

| Mandate item (phase-1-ceo.md §7) | Finding |
|---|---|
| Q-01 resolved, not carried | ✅ §3 — broad reading, six modules, reasoning stated |
| Q-02..Q-14 with owner + default | ✅ §7 — 11 items (Q-05 and Q-07 correctly absent, already answered) |
| P1/P2/P3 on every FR | ⚠️ Present on all 132, but **120 P1 / 12 P2 / 0 P3** — see COND-DCP-001 |
| Residency + PDPPL as requirements | ✅ NFR-008, NFR-009 |
| SC-01..SC-06 traceable to FRs | ⚠️ SC-02/04/05/06 traced; **SC-01 and SC-03 have no named FR linkage** — COND-DCP-007 |
| Audit plugin-written, append-only (R-03) | ✅ FR-108, FR-109, FR-110, FR-025, FR-047, FR-075, NFR-010 |
| Stop-contact in router before adapter (R-04) | ✅ FR-067, FR-068, FR-120, FR-064, FR-096, NFR-007 |
| Cross-org via QID map + router only (R-01) | ✅ FR-009, FR-119 (merge surface correctly P2 per CEO scope) |
| Role-drift detection across orgs (R-05) | ✅ FR-112 |
| Unresolved-identity queue (R-06) | ✅ FR-007, FR-008 |
| MIS thin snapshot + live "as of" balance | ✅ FR-002, FR-003, FR-016, FR-017, FR-024 |
| Config expresses "no automated contact" | ✅ FR-033 |
| Exposure excluded from segmentation | ⚠️ FR-034 and C-05 hold, but **FR-039 reintroduces "high-exposure cases"** — COND-DCP-005 |

### Conditions

**COND-DCP-001 — Re-cut P1 into a genuinely shippable minimum.**
120 of 132 FRs are P1 and no requirement is P3. That is not a prioritisation; it is the
full engagement relabelled mandatory, and it directly contradicts BO-06 and SO-06. Produce
a P1 slice a 2-person team can ship and evidence against SC-01..SC-06, demoting the
remainder to P2/P3. My expectation is that Modules 8, 9, 10 and 12 (Restructuring, Legal,
Insurance, Disputes) contain substantial P2 material, that five dashboards (FR-127..FR-132)
are not all P1, and that FR-100 cannot stay P1 while Q-13 defaults its capability to Phase 2.
- **Gates:** Architecture (the architect must not size against 120 mandatory requirements)
- **Owner:** BA with QDB Product Owner; CEO countersigns the re-cut
- **Risk if unresolved:** Phase 1 is sized to a scope the team cannot deliver, and slips as
  a whole rather than shipping a working HL collections workspace.

**COND-DCP-002 — Q-14 answered in writing before Phase 3 opens.**
On-premise CRM 2019 versus Dataverse cloud is still open. The BRD itself makes this a hard
stop (C-07, NFR-020), so this approval does not by itself unblock architecture.
- **Gates:** Architecture
- **Owner:** QDB Client / Technical Lead
- **Risk if unresolved:** Router hosting, MSAL flavour, plugin registration model and the
  deployment pipeline are all guessed, and a wrong guess is a rebuild, not a refactor.

**COND-DCP-003 — Specify the PDPPL consent model as requirements.**
FR-056, FR-067 and FR-074 all gate on "consent", but no FR defines where consent is captured,
which lawful basis applies per channel, or what the router does when consent status is
**unknown**. The default must be fail-closed: unknown consent blocks the send and logs the
block. A fail-open default here is a PDPPL breach, not a defect.
- **Gates:** Architecture
- **Owner:** BA with QDB Compliance
- **Risk if unresolved:** The single most important control in the platform evaluates a field
  nobody has defined, and the failure mode is silent and outbound.

**COND-DCP-004 — Seed the >2000 DPD bucket as "no automated contact" by default.**
Q-09 is correctly carried as open, but its default leaves the decision to configuration set
later. Invert it: FR-033 ships with "no automated contact" seeded ON for the >2000 DPD bucket,
and only Compliance may turn it off. These 406 customers are 5.5+ years past due — legal, NPL,
write-off or deceased — and automated dunning is a conduct exposure with no recovery upside.
- **Gates:** Build (seed configuration) and Go-live
- **Owner:** QDB Compliance
- **Risk if unresolved:** The platform's first production run dials 406 customers it should
  never have contacted, and the audit trail proves we did it deliberately.

**COND-DCP-005 — Remove or restate "high-exposure cases" in FR-039.**
FR-039 requires Head-of-Collections approval for reassignment of "high-exposure cases" while
C-05 and FR-034 prohibit exposure as a discriminator. Average balance is flat at QAR 795k–920k
across every DPD bucket, so an exposure threshold either fires on everything or on nothing.
Restate the approval trigger in DPD or arrears terms, or delete it.
- **Gates:** Architecture
- **Owner:** BA
- **Risk if unresolved:** An architect implements an exposure-keyed approval rule that the
  portfolio data cannot support, and the internal contradiction surfaces at QA instead.

**COND-DCP-006 — Confirm the DWH counterparty exists, or demote FR-125 and FR-128 to P2.**
Both are P1 and both depend on a data warehouse the BRD never establishes, with an owner it
never names. Assumption 9 states that anything requiring a third team is deferred; these two
requirements are the exception nobody flagged.
- **Gates:** Architecture
- **Owner:** QDB Product Owner with the Integration Lead
- **Risk if unresolved:** The Portfolio Dashboard is a P1 commitment against an integration
  with no counterparty, no interface contract and no delivery date.

**COND-DCP-007 — Map SC-01..SC-06 to FR IDs in the traceability matrix.**
SC-02, SC-04, SC-05 and SC-06 are traced. SC-01 and SC-03 — the two criteria that define the
officer's core workflow and the stop-contact control — carry no named FR linkage.
- **Gates:** Architecture
- **Owner:** BA
- **Risk if unresolved:** Phase 1 cannot be proven complete against the mandate it was
  approved under, and the Phase 7 decision has nothing to test.

### What I am explicitly accepting

- The broad Q-01 reading and the resulting six-module Phase 1 boundary.
- Manual case creation (D-2) with a configurable automation threshold held at P2.
- WhatsApp, Field Visit, cross-org 360 React surface, and Legal/Insurance portal UI all out
  of Phase 1 as scoped.
- BFD feature-flagged with router logic built from day one — the dual-org foundation is laid
  once, as SO-05 requires.

Conditions gate their named milestone; they do not gate the BA phase, which is complete.
Phase 3 opens when COND-DCP-001, COND-DCP-002, COND-DCP-003, COND-DCP-005, COND-DCP-006 and
COND-DCP-007 are closed. COND-DCP-004 gates Build and Go-live.

### Condition Closure Log

| Condition | Closed | What changed | FR IDs touched |
|---|---|---|---|
| COND-DCP-005 | 2026-09-14 | FR-039 restated: approval trigger changed from "high-exposure cases" (prohibited by C-05/FR-034) to an arrears/DPD threshold read from the admin approval-limit configuration table. Word "exposure" removed entirely. Source column updated to reference C-05 and FR-034. | FR-039 |
| COND-DCP-003 | 2026-09-14 | Four new P1 FRs added to Module 7 (Communication Management): FR-133 (consent record per channel, with source and captured-by), FR-134 (router reads consent before every send; fail-closed on unknown/missing), FR-135 (withdrawal immediate + audit-logged), FR-136 (WhatsApp inherits SMS gate pending Q-12). Traceability matrix and module count updated. | FR-133, FR-134, FR-135, FR-136 |
| COND-DCP-001 | 2026-09-14 | Priority re-cut proposed in `phase-2-ba-priority-recut.md`, countersigned by the Product Owner (T1 Workout P2, T2 Legal/Insurance/Disputes P2, T3 MIS + gateway only, admin on CRM forms, PTP Kept from MIS drop or manual mark) and SIGNED OFF WITH NOTES by the CEO. Priorities applied to every FR row here and in the traceability matrix: **73 P1 / 59 P2 / 4 P3** (was 124/12/0). SC-01 mapping trimmed to FR-001/002/045/046/055. CEO note for architecture: evaluate PTP Broken against the latest MIS snapshot and make the manual Kept mark the correction path. | 55 rows re-prioritised; see the re-cut file |
| COND-DCP-002 | 2026-09-14 | Q-14 answered by the user: both orgs on-premise 9.x now, both to Dataverse cloud in ~18 months. Section 7 Q-14 row, C-07 and NFR-020 restated as a portability constraint. | NFR-020 |
| COND-DCP-006 | 2026-09-14 | User confirmed a DWH exists — it is MIS, exposed through the Middleware API in buckets. FR-125 and FR-128 stay P1; the counterparty is the Middleware API in front of MIS (same feed as FR-121), never a direct warehouse connection. Q-06 closed with it. | FR-121, FR-125, FR-128 |
| COND-DCP-007 | 2026-09-14 | SC-01..SC-06 mapping table added to `phase-2-ba-traceability.md`. SC-01 mapped to FR-001, FR-002, FR-003, FR-045, FR-046, FR-055. SC-03 mapped to FR-067, FR-068, FR-096, FR-120. All six SCs now map to at least one P1 FR. | FR-001, FR-002, FR-003, FR-045, FR-046, FR-055, FR-067, FR-068, FR-096, FR-111, FR-120 (SC mappings only; FRs unchanged) |

