# DebtCollection — Project Brief

**Project code:** DCP-001
**Created:** 2026-07-30
**Status:** Pre-BRD. This brief plus the UX prototype are the inputs to the BA phase.

---

## 1. Objective

Build an enterprise **Debt Collection Platform** that gives collection users a single
operational workspace, while **Housing Loan CRM** and **BFD CRM** each remain the source
of record for their own cases, workflows and customer/facility data.

| Pillar | Meaning |
|---|---|
| Single workspace | Customer 360, cases, actions, PTP, communication and dashboards in one React application |
| Controlled routing | Middleware routes each request to Housing Loan CRM or BFD CRM by record/product context |
| CRM-native workflow | Approvals, SLA/escalation and case orchestration stay inside Dynamics 365 CE |
| Collection lifecycle | Early arrears → actions → PTP → restructuring → legal hand-off → deceased/insurance → closure |
| Audit discipline | Every action, status update, communication and override is captured for audit |
| Delivery focus | Scope stays practical for a 2-person delivery model with AI-assisted acceleration |

---

## 2. Business principles and their design consequences

| Principle | Design impact |
|---|---|
| One platform, two CRMs | No duplicate front ends. Org identity is a runtime attribute of a *record*, never of a *page*. |
| Native BPM inside CRM | No separate BPM layer. React drives `statuscode` transitions; CRM plugins validate them. |
| Legal reuse over rebuild | Legal escalation links to the existing CRM Legal module. Hand-off and tracking only. |
| No direct React ingestion | Delinquency data is created in the target CRM before React displays it. |

---

## 3. Target operating model

| Role | Core responsibilities | Primary screens | Key decisions | Controls |
|---|---|---|---|---|
| Collection Officer | Daily follow-up, action logging, PTP capture, reminders | Customer 360, Action Plan, PTP, Communication | Next action, follow-up date, PTP proposal | Mandatory notes, templates, audit trail |
| RM | Relationship context and restructuring inputs | Customer 360, Restructuring | Workout eligibility, customer context | Approval routing |
| Senior Manager | Queue oversight, exceptions, escalations | Work Allocation, Dashboards, Admin | Reassignment, strategy exceptions | RBAC, approval history, SLA alerts |
| Legal | Receives escalated cases via the CRM Legal module | Legal hand-off link | Accept/reject hand-off, legal action path | Existing legal controls |
| Restructuring Officer | Workout proposal and monitoring | Restructuring / Workout | Tenor, instalment, grace, waiver proposal | Approval workflow, document evidence |

---

## 4. Solution architecture

```
                    ┌──────────────────────────────┐
                    │   React Debt Collection App  │   one UI, all roles
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────▼───────────────┐
                    │      CRM Context Router      │   routes + fans out + merges
                    └───────┬──────────────┬───────┘
                            │              │
              ┌─────────────▼───┐    ┌─────▼────────────┐
              │ Housing Loan CRM│    │     BFD CRM      │   D365 CE, native BPM each
              └─────────────────┘    └──────────────────┘
                            │              │
        ┌───────────────────┴──────────────┴──────────────────┐
        │ Core Banking · Payments · SMS/Email · QCB · DWH/BI   │
        └─────────────────────────────────────────────────────┘
```

| Layer | Purpose |
|---|---|
| React Application | Common user screens for all collection activities |
| CRM Context Router | Middleware API routing requests by product/case context |
| Housing Loan CRM | D365 CE case data + native BPM for Housing Loan |
| BFD CRM | D365 CE case data + native BPM for BFD |
| External Systems | Core Banking, Payments, SMS/Email, QCB/Credit Bureau, DWH/BI |

---

## 5. Functional module scope

| # | Capability | Business scope |
|---|---|---|
| 1 | Customer & Loan 360 | Unified customer, facility, collateral, guarantor, legal and insurance status |
| 2 | Delinquency & Case Creation | Overdue case creation and dispute handling on the shared CRM Case entity |
| 3 | Segmentation & Strategy Engine | DPD-bucket-driven action logic using risk, exposure and behaviour |
| 4 | Work Allocation & Queues | Early collection, high-risk, deceased/insurance, legal review, restructuring |
| 5 | Disputes & Complaint Management | Disputes on arrears, deductions and account status |
| 6 | Promise-to-Pay Management | PTP date, amount, full/partial, kept/broken, reminder linkage |
| 7 | Communication Management | SMS, email, phone and letter with logging and approved templates |
| 8 | Restructuring / Workout | Proposal, tenor, instalment, grace period, waiver and monitoring |
| 9 | Legal Case Creation | Hand-off/link to the existing CRM Legal module |
| 10 | Deceased & Insurance Claims | Stop-contact rules, required documents, claim lifecycle |
| 12 | Dashboards & MIS | Operational dashboards and MIS reporting inputs |
| 13 | Audit Trail, Maker-Checker & RBAC | D365 security roles, approval history, action audit |
| 14 | Admin Configuration & Rules | Business rules, thresholds, templates, queue settings |
| 15 | Integration Layer | Core Banking, dual CRM, Payments, SMS/Email, QCB, DWH/BI |

> **Note:** the source scope list has no module 11 — numbering jumps 10 → 12.
> Carried forward as-is pending BA confirmation.

---

## 6. Confirmed design decisions

| Decision | Choice | Rationale |
|---|---|---|
| Prototype packaging | Multi-file with a shared design system | Keeps every file within the 800-line ceiling; one capability area iterates at a time |
| CRM workflow model | `statuscode` + classic workflows + plugins | Far more flexible over Web API than Business Process Flows |
| MIS data source | DWH/BI for portfolio, live CRM for personal | Portfolio analytics span both orgs and cannot be served by either CRM alone |
| Default theme | Light — Power Platform blue | Matches the Report Engine designer; all four themes remain selectable |

---

## 7. Risks identified before build

| # | Risk | Impact | Proposed mitigation |
|---|---|---|---|
| R-01 | Cross-org Customer 360 cannot be served by a FetchXML join | High | Identity map keyed on QID/CR; router fans out to both orgs and merges |
| R-02 | Portfolio MIS spans both orgs | High | Portfolio metrics read from DWH; only personal counts read live |
| R-03 | Audit written client-side is bypassable | High | Audit write lives in a CRM plugin, unsuppressible, append-only |
| R-04 | Stop-contact enforced only in the UI is not enforced | High | Suppression enforced in the CRM Context Router, before any channel adapter |
| R-05 | Two CRMs means two role definitions that can drift | Medium | Single role matrix as source; deployment compares both orgs and reports drift |
| R-06 | Duplicate customer identity across orgs | Medium | QID/CR correlation key with an explicit unresolved-identity queue |
| R-07 | PDPPL applies to customer contact data and communications | High | Data-protection assessment before any production data lands |

---

## 8. Prototype

`prototype/` holds a self-contained, dependency-free UX prototype covering 22 screens
across 7 files, built on the same Fluent / Power Platform design language as the
Report Engine designer. It exists to validate requirements and feed the BRD.
It is **not** the production front end.

Open `prototype/index.html`.
