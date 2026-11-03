# DCP-001 — Requirements Traceability Matrix

**Prepared by:** MSS Technologies — Business Analyst
**Date:** 2026-09-13
**BRD version:** 1.0
**Status:** DRAFT

---

## Traceability Matrix

| FR ID | Module | Priority | Source Document | Test Hook |
|---|---|---|---|---|
| FR-001 | 1 — Customer & Loan 360 | P1 | skeleton §A | Render Customer 360 screen for C-1001 and verify all 12 profile fields present |
| FR-002 | 1 — Customer & Loan 360 | P1 | skeleton §A; facts-and-analysis §5 | Verify live MIS balance displayed alongside snapshot value with "as of" timestamp |
| FR-003 | 1 — Customer & Loan 360 | P2 | facts-and-analysis §5; non-negotiable | Query `qdb_delinquencysnapshot` for a facility; verify MIS batchReference and asOf on every row |
| FR-004 | 1 — Customer & Loan 360 | P1 | ADR-DCP-01; skeleton §A | Open Customer 360 Timeline; verify `qdb_collectionaction` and `qdb_communication` records appear in chronological order |
| FR-005 | 1 — Customer & Loan 360 | P2 | skeleton §A | Verify legal case status, insurance claim status, and deceased flag rendered on Customer 360 |
| FR-006 | 1 — Customer & Loan 360 | P2 | skeleton §A | Verify open and historical PTPs, restructure cases, and disputes linked to customer are visible |
| FR-007 | 1 — Customer & Loan 360 | P1 | non-negotiable R-06; brief R-06 | Create customer without QID; verify record appears in `qdb_identityexception` queue |
| FR-008 | 1 — Customer & Loan 360 | P2 | non-negotiable R-06 | Open unresolved-identity queue; verify rows for: missing QID, name mismatch, QID in one org only |
| FR-009 | 1 — Customer & Loan 360 | P3 | non-negotiable R-01; facts §6.3 | With BFD flag ON, verify Customer 360 for C-1002 shows HL + BFD facilities merged |
| FR-010 | 1 — Customer & Loan 360 | P2 | facts-and-analysis §5 | Simulate MIS ingest failure; verify staleness alert displayed on Customer 360 |
| FR-011 | 1 — Customer & Loan 360 | P2 | skeleton §7.C | Verify payment history (date, amount, channel, rejection reason) rendered per facility |
| FR-012 | 1 — Customer & Loan 360 | P1 | skeleton §G | Verify communication history log (channel, template, direction, delivery status) rendered |
| FR-013 | 1 — Customer & Loan 360 | P2 | skeleton §L | Verify dispute history rendered on Customer 360 |
| FR-014 | 1 — Customer & Loan 360 | P1 | non-negotiable R-07; PDPPL | Log in as a role without "View Sensitive PII"; verify mobile number and bank account are masked |
| FR-015 | 1 — Customer & Loan 360 | P2 | facts-and-analysis §3 | Verify DPD bucket colour-coding uses 10-value taxonomy consistently |
| FR-016 | 2 — Delinquency & Case Creation | P1 | non-negotiable; facts §5; D-1 | Run MIS ingest; verify `qdb_delinquencysnapshot` appended, not overwritten |
| FR-017 | 2 — Delinquency & Case Creation | P1 | non-negotiable; ADR-DCP-01 | Attempt Update on a `qdb_delinquencysnapshot` row via Web API; verify plugin blocks with error |
| FR-018 | 2 — Delinquency & Case Creation | P1 | non-negotiable; facts §3; Q-03 default | Ingest MIS data for bucket "501-1000"; verify bucket field stores "501-1000", not "180+" |
| FR-019 | 2 — Delinquency & Case Creation | P1 | D-2; Final Requirements | Officer creates case manually for C-1001 F-HL-8801; verify case created with no automation |
| FR-020 | 2 — Delinquency & Case Creation | P1 | D-3; Final Requirements | Submit case creation form without product type; verify validation error |
| FR-021 | 2 — Delinquency & Case Creation | P3 | D-2; facts §2.2 | Set auto-creation threshold = 30 DPD in admin config; verify case auto-created on next ingest |
| FR-022 | 2 — Delinquency & Case Creation | P1 | skeleton §15 | Verify all 17 status values present in `statuscode` option set |
| FR-023 | 2 — Delinquency & Case Creation | P1 | brief §2; ADR-DCP-01 | Attempt invalid status transition (New → Closed); verify plugin rejects with explanatory error |
| FR-024 | 2 — Delinquency & Case Creation | P2 | non-negotiable; facts §5 | Open case screen; verify snapshot DPD and live DPD both displayed with "as of" label |
| FR-025 | 2 — Delinquency & Case Creation | P1 | skeleton §17; non-negotiable R-03 | Attempt Delete on a collection case via Web API with Admin role; verify plugin blocks |
| FR-026 | 2 — Delinquency & Case Creation | P2 | facts §2.2 | Filter case list to >2000 DPD; verify distinct colour and separate queue segment |
| FR-027 | 2 — Delinquency & Case Creation | P1 | facts §5 | Simulate MIS ingest timeout; verify alert displayed in workspace |
| FR-028 | 2 — Delinquency & Case Creation | P1 | CLAUDE.md enterprise rules | Create a case; verify created_by, created_on, modified_by, modified_on all populated; ID is GUID |
| FR-029 | 2 — Delinquency & Case Creation | P2 | skeleton §15 | Reopen a Closed case without providing reopen reason; verify validation error |
| FR-030 | 2 — Delinquency & Case Creation | P3 | Q-05; ADR-DCP-02 | Enable BFD feature flag; create BFD case; verify router sends to BFD CRM not HL CRM |
| FR-031 | 3 — Segmentation & Strategy | P1 | D-4; Final Requirements | Change a strategy rule in admin config; verify new rule fires on next qualifying case |
| FR-032 | 3 — Segmentation & Strategy | P1 | D-4; non-negotiable C-05 | Verify strategy config table UI supports all 10 DPD buckets, segment, and action type fields |
| FR-033 | 3 — Segmentation & Strategy | P1 | non-negotiable; facts §2.2 | Set "no automated contact" for >2000 DPD bucket; verify no communications sent for that bucket |
| FR-034 | 3 — Segmentation & Strategy | P1 | non-negotiable C-05; facts §2.3 | Verify strategy config table has no exposure/balance field; verify no FR uses exposure as input |
| FR-035 | 3 — Segmentation & Strategy | P1 | D-4; skeleton §12 | Deactivate a strategy rule; verify it stops firing without deployment |
| FR-036 | 3 — Segmentation & Strategy | P1 | skeleton §11; non-negotiable R-03 | Update a strategy rule; verify audit log entry with old/new value and actor |
| FR-037 | 4 — Work Allocation & Queues | P1 | skeleton §D | Verify six named queues present: Early Collection, High Risk, Deceased & Insurance, Legal Review, Restructuring, Disputes |
| FR-038 | 4 — Work Allocation & Queues | P1 | skeleton §D | Verify case automatically assigned to queue matching strategy rule triggered |
| FR-039 | 4 — Work Allocation & Queues | P2 | skeleton §6; C-05; FR-034 | (1) Reassign case without providing reason; verify validation error. (2) Configure an arrears threshold in the admin approval-limit table; attempt to reassign a case meeting that threshold without Head-of-Collections approval; verify the system blocks the reassignment. (3) Verify no "exposure" or "balance" field is referenced in the reassignment approval logic. |
| FR-040 | 4 — Work Allocation & Queues | P1 | skeleton §D | Breach a configurable SLA threshold; verify case flagged as overdue in supervisor view |
| FR-041 | 4 — Work Allocation & Queues | P1 | skeleton §D; SO-01 | Log in as Senior Manager; verify supervisor workload view shows cases, actions, overdue actions, broken PTPs per officer |
| FR-042 | 4 — Work Allocation & Queues | P2 | skeleton §D | Bulk-reassign 5 cases from Officer A to Officer B; verify all 5 updated with audit entries |
| FR-043 | 4 — Work Allocation & Queues | P1 | skeleton §D; ADR-DCP-01 constraint 3 | Set `stopContact = true` on C-1005; verify case moved to Deceased & Insurance queue automatically |
| FR-044 | 4 — Work Allocation & Queues | P2 | skeleton §12 | Change queue routing rule in admin config; verify new rule active without deployment |
| FR-045 | 5 — Collection Action Plan | P1 | ADR-DCP-01 decision 3 | Log a Call action against C-1001 with no open case; verify `qdb_collectionaction` created |
| FR-046 | 5 — Collection Action Plan | P1 | skeleton §E controls; ADR-DCP-01 | Submit action without `scheduledend`; verify validation error |
| FR-047 | 5 — Collection Action Plan | P1 | non-negotiable R-03; ADR-DCP-01 | Complete a `qdb_collectionaction`; attempt Update via Web API; verify plugin blocks |
| FR-048 | 5 — Collection Action Plan | P1 | skeleton §17; ADR-DCP-01 | Let `scheduledend` pass for an open action; verify action appears in overdue-actions view |
| FR-049 | 5 — Collection Action Plan | P2 | skeleton §E | Escalate case to supervisor from action plan screen; verify Supervisor Review action created and supervisor notified |
| FR-050 | 5 — Collection Action Plan | P2 | skeleton §E | Apply action plan template to case; verify template-defined actions created |
| FR-051 | 5 — Collection Action Plan | P2 | skeleton §E; skeleton §6 | Return Supervisor Review action with reason; verify outcome captured in audit |
| FR-052 | 5 — Collection Action Plan | P1 | D-4; skeleton §16 | Verify action outcome codes are loaded from config table, not hard-coded |
| FR-053 | 5 — Collection Action Plan | P1 | skeleton §E controls | Create action; verify user_id and system timestamp non-overridable |
| FR-054 | 5 — Collection Action Plan | P2 | D-8; ADR-DCP-01 constraint 5 | Verify "Field Visit" appears as a selectable action type in the action creation form |
| FR-055 | 6 — PTP Management | P1 | ADR-DCP-01 §5 | Create PTP without an open case; verify `qdb_ptprecord` created successfully |
| FR-056 | 6 — PTP Management | P1 | skeleton §F; SC-02 | Create PTP with reminder date = tomorrow; verify reminder SMS/email queued via router |
| FR-057 | 6 — PTP Management | P1 | SC-02; skeleton §F | Let PTP due date pass with no payment; verify status auto-set to Broken and broken-PTP action created |
| FR-058 | 6 — PTP Management | P1 | skeleton §4.B | Create second broken PTP for C-1001; verify supervisor escalation triggered |
| FR-059 | 6 — PTP Management | P1 | skeleton §F | Verify all 6 PTP status values available: Open, Kept, Partially Kept, Broken, Rescheduled, Cancelled |
| FR-060 | 6 — PTP Management | P2 | skeleton §F controls | Reschedule PTP 3rd time (threshold=2); verify Senior Manager approval required |
| FR-061 | 6 — PTP Management | P1 | non-negotiable R-03; skeleton §F | Cancel a PTP; verify audit log entry with actor, timestamp, old/new status |
| FR-062 | 6 — PTP Management | P2 | skeleton §F; integration §8.B | Post a matched payment event from Payments; verify linked PTP status updated to Kept |
| FR-063 | 6 — PTP Management | P2 | skeleton §10 KPIs | Log in as Senior Manager; verify PTP kept-rate per officer visible on performance dashboard |
| FR-064 | 6 — PTP Management | P1 | non-negotiable R-04 | Set `stopContact = true` on C-1005; let PTP reminder fire; verify blocked and logged with block reason |
| FR-065 | 7 — Communication Management | P1 | skeleton §G; D-7 | Verify channel options = SMS, Email, Official Letter, Call; WhatsApp absent from Phase 1 |
| FR-066 | 7 — Communication Management | P1 | ADR-DCP-01 decision 6 | Send an SMS; verify single `qdb_communication` created; verify no duplicate action row |
| FR-067 | 7 — Communication Management | P1 | non-negotiable R-04; ADR-DCP-01 | Attempt to send SMS to C-1005 (`stopContact = true`); verify router blocks and writes blocked record |
| FR-068 | 7 — Communication Management | P1 | non-negotiable R-04 | Bypass portal; call router REST endpoint directly for C-1005; verify stop-contact still enforced |
| FR-069 | 7 — Communication Management | P1 | skeleton §G controls | Log in as officer without "Send Free-Text" privilege; verify free-text field disabled |
| FR-070 | 7 — Communication Management | P1 | skeleton §G; brief §5 | Send reminder to C-1001 with Arabic preference; verify Arabic template used |
| FR-071 | 7 — Communication Management | P2 | skeleton §G controls | Activate a template without Compliance approval; verify activation blocked |
| FR-072 | 7 — Communication Management | P2 | Q-11; skeleton §G | Send official letter; set status to Delivered-Signed; verify status persisted |
| FR-073 | 7 — Communication Management | P1 | skeleton §G; ADR-DCP-01 | Log phone call as `qdb_communication` with channel=Call; verify record created with outcome and notes |
| FR-074 | 7 — Communication Management | P2 | skeleton §G; BO-03 | Create bulk campaign for B1 bucket; verify stop-contact check runs per recipient |
| FR-075 | 7 — Communication Management | P1 | non-negotiable R-03; ADR-DCP-01 | Complete a `qdb_communication`; attempt Update via Web API; verify plugin blocks |
| FR-076 | 7 — Communication Management | P1 | non-negotiable R-03 | Edit a template; verify audit log entry with old/new content and actor |
| FR-133 | 7 — Communication Management (consent) | P1 | PDPPL; NFR-008; BO-03 | Create a consent record for C-1001 for SMS channel with source=officer-captured; verify all 5 required fields stored: status, lawful-basis, source, timestamp, captured-by |
| FR-134 | 7 — Communication Management (consent) | P1 | PDPPL; NFR-008; FR-067; FR-074 | Attempt to send SMS to C-1002 where no consent record exists; verify router blocks send, writes refusal log with reason 'consent_not_established', and returns error to caller. Also verify that withdrawn consent blocks the send with reason 'consent_withdrawn'. |
| FR-135 | 7 — Communication Management (consent) | P1 | PDPPL; NFR-010; FR-067 | Record consent withdrawal for C-1001 SMS channel; immediately attempt SMS via router; verify blocked with no grace period. Inspect audit trail for withdrawal event carrying actor, timestamp, channel, and withdrawal reason. |
| FR-136 | 7 — Communication Management (consent) | P1 | Q-12; FR-067; C-02 | Attempt WhatsApp send to C-1001 where SMS consent=given and no WhatsApp record exists; verify router uses SMS consent gate (pass). Attempt where SMS consent=withdrawn; verify router blocks. Verify a [NEEDS CLARIFICATION: Q-12] marker is present until Q-12 is answered in writing. |
| FR-077 | 8 — Restructuring / Workout | P2 | skeleton §H; ADR-DCP-03 | Officer creates restructure proposal WO-3007; verify all mandatory fields enforced |
| FR-078 | 8 — Restructuring / Workout | P2 | skeleton §H approval workflow | Approve restructure at Senior Manager stage; verify status advances to Head of Collections stage |
| FR-079 | 8 — Restructuring / Workout | P2 | skeleton §12 | Change approval threshold in admin config; verify new threshold active without deployment |
| FR-080 | 8 — Restructuring / Workout | P2 | skeleton §6 | Submit restructure with waiver; verify separate waiver approval request created |
| FR-081 | 8 — Restructuring / Workout | P2 | skeleton §H | Submit restructure without uploading mandatory document; verify submission blocked |
| FR-082 | 8 — Restructuring / Workout | P2 | skeleton §H | Breach restructured instalment; verify case flagged as Re-Defaulted |
| FR-083 | 8 — Restructuring / Workout | P2 | skeleton §H | Submit restructure without financial assessment; verify mandatory field validation error |
| FR-084 | 8 — Restructuring / Workout | P2 | skeleton §H | Reject restructure without reason; verify rejection blocked |
| FR-085 | 8 — Restructuring / Workout | P2 | non-negotiable R-03 | Approve a restructure; verify audit log entry with stage, approver, timestamp |
| FR-086 | 8 — Restructuring / Workout | P2 | ADR-DCP-03 decision 3 | Log in as Collection Officer; verify restructure case status visible read-only on portal |
| FR-087 | 9 — Legal Case Management | P2 | skeleton §I; Final Requirements | Officer submits legal referral with all checklist items; verify `qdb_legalcase` created |
| FR-088 | 9 — Legal Case Management | P2 | skeleton §I controls | Submit legal referral without Senior Manager approval; verify submission blocked |
| FR-089 | 9 — Legal Case Management | P2 | skeleton §I controls | Submit legal referral for case below DPD threshold; verify router plugin blocks |
| FR-090 | 9 — Legal Case Management | P2 | skeleton §I; ADR-DCP-03 | Officer views legal case status (Case Filed); verify status displayed read-only; no edit controls present |
| FR-091 | 9 — Legal Case Management | P1 | ADR-DCP-03 decision 2 | Log in as Legal User; verify no Legal Case portal UI; user directed to native CRM |
| FR-092 | 9 — Legal Case Management | P2 | skeleton §I controls | Legal User returns case from native CRM; verify `qdb_collectionaction` created and case status updated |
| FR-093 | 9 — Legal Case Management | P2 | skeleton §I | Update legal recovery amount in native CRM; verify value reflected in portal read-only view |
| FR-094 | 9 — Legal Case Management | P2 | skeleton §I | Upload court document; verify audit log records document upload with actor and timestamp |
| FR-095 | 10 — Deceased & Insurance | P1 | skeleton §J; non-negotiable | Set deceased flag on C-1005; verify `stopContact = true` enforced immediately |
| FR-096 | 10 — Deceased & Insurance | P1 | non-negotiable R-04; skeleton §4.D | Set `stopContact = true`; attempt automated SMS via router; verify blocked with evidence log |
| FR-097 | 10 — Deceased & Insurance | P1 | skeleton §J controls | Set deceased flag; verify case automatically transferred to Deceased & Insurance queue |
| FR-098 | 10 — Deceased & Insurance | P2 | skeleton §J | Create insurance claim CLM-401; verify mandatory fields (kind, insurer, date, documents) enforced |
| FR-099 | 10 — Deceased & Insurance | P2 | skeleton §J; Final Requirements | Advance claim status from Submitted to Under Review; verify audit trail updated |
| FR-100 | 10 — Deceased & Insurance | P2 | skeleton §J controls; Q-13 | Attempt to send communication to heir without Senior Manager approval; verify blocked |
| FR-101 | 10 — Deceased & Insurance | P2 | skeleton §J | Mark claim as Paid; verify outstanding balance updated on facility record and Customer 360 |
| FR-102 | 10 — Deceased & Insurance | P1 | ADR-DCP-03 | Log in as Insurance Officer; verify no portal claim lifecycle UI; user directed to native CRM |
| FR-103 | 12 — Disputes | P2 | skeleton §L; Final Requirements | Register dispute DSP-301; verify mandatory fields: type, root cause, owner, SLA date |
| FR-104 | 12 — Disputes | P2 | skeleton §L; prototype DSP | Register dispute for HL-CC-20399; verify `collectionPaused = true` on the case |
| FR-105 | 12 — Disputes | P2 | skeleton §L | Add investigation note; verify captured in audit trail |
| FR-106 | 12 — Disputes | P2 | skeleton §L; skeleton §12 | Let SLA due date pass; verify dispute appears in supervisor queue as overdue |
| FR-107 | 12 — Disputes | P2 | skeleton §L; Final Requirements | Verify all 7 standard complaint types available as configurable options |
| FR-108 | 13 — Audit Trail & RBAC | P1 | non-negotiable R-03 | Create PTP via portal; verify corresponding audit log row in `qdb_auditlog`, written by plugin |
| FR-109 | 13 — Audit Trail & RBAC | P1 | skeleton §11; prototype AUDIT | Check audit row for PTP-5001; verify all required fields: action type, entity, record ID, old/new value, actor, timestamp, source path |
| FR-110 | 13 — Audit Trail & RBAC | P1 | non-negotiable R-03 | Attempt Update on `qdb_auditlog` as system administrator; verify plugin blocks |
| FR-111 | 13 — Audit Trail & RBAC | P1 | SC-04; skeleton §11 | Export evidence pack for HL-CC-20452; verify all action, communication, PTP, approval, and status-change entries included |
| FR-112 | 13 — Audit Trail & RBAC | P1 | non-negotiable R-05; brief R-05 | Deploy solution; verify role-drift report compares HL and BFD role definitions; report any difference |
| FR-113 | 13 — Audit Trail & RBAC | P1 | skeleton §5 | Verify all 12 role types present in CRM security role configuration |
| FR-114 | 13 — Audit Trail & RBAC | P1 | non-negotiable R-07; PDPPL | Call router API for C-1001 as "Finance User" role; verify mobile number masked in response |
| FR-115 | 13 — Audit Trail & RBAC | P2 | skeleton §11 | Log in and log out; verify login/logout events in audit trail |
| FR-116 | 14 — Admin Configuration | P2 | skeleton §12 | Admin changes SLA threshold for High Risk queue; verify new threshold active immediately, no deployment |
| FR-117 | 14 — Admin Configuration | P2 | skeleton §G controls | Create template without Compliance approval; verify template not available to officers |
| FR-118 | 14 — Admin Configuration | P1 | non-negotiable R-03 | Update a queue SLA; verify audit log entry with old/new value |
| FR-119 | 15 — Integration Layer | P1 | ADR-DCP-02; brief §4 | Send request with HL- prefix record ID; verify router dispatches to HL CRM |
| FR-120 | 15 — Integration Layer | P1 | non-negotiable R-04 | Call router outbound send endpoint for `stopContact = true` customer; verify suppressed before gateway |
| FR-121 | 15 — Integration Layer | P1 | D-1; Q-06 default | Invoke MIS ingest; verify DPD and arrears values come from MIS API, not CBS computation |
| FR-122 | 15 — Integration Layer | P1 | skeleton §8.D | Send SMS via gateway; simulate delivered webhook; verify `qdb_communication` status updated to Delivered |
| FR-123 | 15 — Integration Layer | P2 | skeleton §8.B | Post a Payments matched event; verify linked PTP set to Kept |
| FR-124 | 15 — Integration Layer | P3 | skeleton §8.E | Run QCB monthly file generation; verify file produced in correct format |
| FR-125 | 15 — Integration Layer | P2 | skeleton §8.F; facts §2 | Run DWH nightly extract; verify all collection entity types included in output |
| FR-126 | 15 — Integration Layer | P1 | facts §5; prototype INTEGRATIONS | Open integration health panel; verify status, last-run time, record counts, and latency for all integration endpoints |
| FR-127 | 12 — Dashboards & MIS | P1 | skeleton §9.A; SC-05 | Log in as Senior Manager; verify Operational Dashboard shows: total overdue, arrears by 10-bucket, new cases today, overdue actions, broken PTPs |
| FR-128 | 12 — Dashboards & MIS | P2 | skeleton §9.B; facts §2 | Open Portfolio Dashboard; verify data sourced from DWH extract, not live CRM query |
| FR-129 | 12 — Dashboards & MIS | P1 | skeleton §9.C; SC-05 | Open PTP Dashboard; verify PTP kept-rate per officer and repeat broken-PTP customers |
| FR-130 | 12 — Dashboards & MIS | P2 | skeleton §9.D | Open Legal Dashboard; verify cases displayed by legal stage with aging |
| FR-131 | 12 — Dashboards & MIS | P2 | skeleton §9.G; SO-02 | Open Management Dashboard; verify NPL trend, monthly recoveries, officer productivity |
| FR-132 | 12 — Dashboards & MIS | P2 | facts §2.2 | Verify >2000 DPD population shown in a segregated section on Operational Dashboard |

---

## Non-Functional Requirements Traceability

| NFR ID | Category | Priority | Source | Test Hook |
|---|---|---|---|---|
| NFR-001 | Performance | P1 | Skeleton §14 | Load test Customer 360 for p95 response time at concurrent load |
| NFR-002 | Performance | P1 | Facts §2.4 | Time MIS ingest for 4,900 records; verify completes within 30 minutes |
| NFR-003 | Availability | P1 | Business critical | Monitor portal and router uptime over 30-day period during business hours |
| NFR-004 | Availability | P1 | Operational | Verify maintenance window scheduling process documented and 48h notice issued |
| NFR-005 | Security | P1 | ADR-DCP-02; PDPPL | Call router API without Bearer token; verify HTTP 401 returned |
| NFR-006 | Security | P1 | ADR-DCP-02 decision 4; PDPPL | Inspect SSR HTML output for portal pages; verify no customer PII in rendered HTML |
| NFR-007 | Security | P1 | ADR-DCP-01; R-04 | Bypass portal; call router directly with forged role claim; verify CRM plugin still rejects |
| NFR-008 | Compliance — PDPPL | P1 | Non-negotiable R-07; CEO §5 | Verify data-protection assessment signed off before any production data migration |
| NFR-009 | Compliance — Data Residency | P1 | Non-negotiable; assumption 7 | Verify tenant/hosting region is Qatar or approved data boundary before go-live |
| NFR-010 | Compliance — Audit Retention | P1 | Regulatory standard; non-negotiable | Verify audit log records cannot be deleted and retention policy set to minimum 7 years |
| NFR-011 | Scalability | P1 | Facts §2.4 | Verify no distributed cache or sharding components present in Phase 1 architecture |
| NFR-012 | Scalability — BFD flag | P1 | SC-06; ADR-DCP-02 | Enable BFD feature flag; verify BFD cases appear without any code deployment |
| NFR-013 | Internationalisation | P1 | Skeleton §G; brief §5 | Switch portal to Arabic mode; verify RTL layout correct on all screens |
| NFR-014 | Reliability — MIS staleness | P1 | Facts §5 | Simulate MIS ingest failure; verify alert visible in workspace within 5 minutes |
| NFR-015 | Auditability | P1 | CLAUDE.md enterprise rules | Inspect all entity records; verify created_by, created_on, modified_by, modified_on present; all IDs are GUIDs |
| NFR-016 | Testing | P1 | CLAUDE.md testing | Run coverage report on router and plugin code; verify ≥80% line coverage |
| NFR-017 | Deployment | P1 | CLAUDE.md CRM packaging | Import solution into HL CRM; verify all web resources and entities in solution.xml RootComponents individually declared |
| NFR-018 | Configuration | P1 | CLAUDE.md enterprise rules | Grep codebase for hard-coded GUID or business-rule constant; verify none found |
| NFR-019 | Monitoring | P1 | Facts §5 | Verify integration health panel (FR-126) available at portal launch; inspect for all configured endpoints |
| NFR-020 | Q-14 Dependency | P1 | Q-14 open | Verify architecture document is not committed until Q-14 (on-prem vs cloud) is answered |

---

## Requirement ID Summary

| Module | FR range | Count |
|---|---|---|
| Module 1 — Customer & Loan 360 | FR-001–FR-015 | 15 |
| Module 2 — Delinquency & Case Creation | FR-016–FR-030 | 15 |
| Module 3 — Segmentation & Strategy | FR-031–FR-036 | 6 |
| Module 4 — Work Allocation & Queues | FR-037–FR-044 | 8 |
| Module 5 — Collection Action Plan | FR-045–FR-054 | 10 |
| Module 6 — PTP Management | FR-055–FR-064 | 10 |
| Module 7 — Communication Management | FR-065–FR-076, FR-133–FR-136 | 16 |
| Module 8 — Restructuring / Workout | FR-077–FR-086 | 10 |
| Module 9 — Legal Case Management | FR-087–FR-094 | 8 |
| Module 10 — Deceased & Insurance | FR-095–FR-102 | 8 |
| Module 12 — Disputes | FR-103–FR-107 | 5 |
| Module 13 — Audit Trail & RBAC | FR-108–FR-115 | 8 |
| Module 14 — Admin Configuration | FR-116–FR-118 | 3 |
| Module 15 — Integration Layer | FR-119–FR-126 | 8 |
| Module 12 — Dashboards & MIS | FR-127–FR-132 | 6 |
| **Total** | **FR-001–FR-132, FR-133–FR-136** | **136** |

| NFR range | Count |
|---|---|
| NFR-001–NFR-020 | 20 |

---

## Success Criteria Traceability (SC-01..SC-06)

Source: `phase-1-ceo.md` §6. Every SC must map to at least one P1 FR; where no mapping
exists this table says so explicitly rather than inventing a requirement.

| SC | Success Criterion | FR IDs | All mapped FRs are P1? | Notes |
|---|---|---|---|---|
| SC-01 | A Collection Officer can open a customer's full HL facility view, log an action, and capture a PTP from one screen without leaving the portal | FR-001, FR-002, FR-045, FR-046, FR-055 | Yes | FR-001 + FR-002 carry the full facility view; FR-045/046 deliver action logging; FR-055 delivers PTP capture. FR-003 (snapshot provenance) and FR-024 (side-by-side display) follow as P2 per the 2026-09-14 re-cut |
| SC-02 | A PTP that passes its promised date without a matched payment is automatically flagged as broken and escalated | FR-056, FR-057, FR-058 | Yes | FR-057 is the auto-flag; FR-058 is the escalation; FR-056 is the pre-due reminder |
| SC-03 | An SMS or email to a customer with `stopContact = true` is blocked at the router with a logged reason; the block is evidenced in the audit trail | FR-067, FR-068, FR-096, FR-120 | Yes | FR-067/068 define router enforcement; FR-120 is the integration-layer enforcement; FR-096 covers the deceased/stopContact path |
| SC-04 | The full audit trail for a case — actions, communications, PTP changes, approvals, status transitions — can be exported as a single evidence pack | FR-111 | Yes | FR-111 is the evidence-pack export; supported by FR-108/109/110 (audit log completeness) |
| SC-05 | A Senior Manager can see all open cases, SLA status, overdue actions and broken PTPs from one dashboard without a spreadsheet | FR-041, FR-127, FR-129 | Yes | FR-127 is the Operational Dashboard; FR-041 is the supervisor workload view; FR-129 adds broken-PTP visibility |
| SC-06 | Deploying the BFD feature flag enables BFD cases without any code change | NFR-012, FR-119 | Yes (NFR-012 is P1; FR-119 is P1) | NFR-012 is the scalability requirement; FR-119 is the router routing requirement |
