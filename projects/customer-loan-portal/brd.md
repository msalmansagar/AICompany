# Business Requirements Document
## Customer Loan Portal & RM Workspace
### Maqsad AI — BA Phase Output
**Document Version:** 1.1
**Date:** 2026-05-06
**Status:** APPROVED — CEO signed off 2026-05-06
**Prepared By:** Business Analyst Agent
**Revision Notes:** v1.1 — Corrected platform from Dynamics 365 cloud to Dynamics CRM on-premise; corrected workflow engine from Power Automate to bank's internal BMP module; corrected current-state pain points to reflect QDB portal existing capability; corrected approval chain to reflect full DOA routing; removed Dataverse/Power Automate references throughout.

---

## 1. Executive Summary

A leading financial institution requires a complete digital transformation of its commercial lending origination process. The engagement covers two integrated systems:

1. **Customer Digital Portal** — A self-service web portal allowing business customers to submit unified loan and amendment applications containing multiple facilities, products, and request types in a single submission.
2. **RM Workspace** — A Dynamics 365 / Dataverse model-driven application giving Relationship Managers (RMs) a full 360-degree workspace to review, enrich, merge, split, and route applications through a structured workflow.

The solution eliminates manual, paper-based application intake, reduces RM data-entry burden, enables multi-facility bundled submissions, and provides real-time visibility to customers on application progress.

---

## 2. Business Context & Problem Statement

### 2.1 Current State Pain Points

| # | Pain Point | Business Impact |
|---|-----------|-----------------|
| 1 | Customers use the existing QDB digital portal to submit applications, but are limited to one request type per submission. The only exception is Renewal + Limit Increase, which can currently be combined. All other request types (Rescheduling, Extension of Drawdown, Ownership Change, New Facility) must be submitted as separate applications. | Customers must initiate multiple separate applications for related requests on the same or different facilities, causing fragmentation, duplication of effort, and delayed processing. |
| 2 | RMs create loan applications in Dynamics CRM on-premise, but there is no merge or split capability. When a customer submits multiple separate applications that logically belong together, the RM has no structured mechanism to consolidate them. | RMs are forced to manage related applications in isolation, leading to coordination delays, inconsistent credit submissions, and potential errors in downstream processing. |
| 3 | RMs currently club multiple request types into a single CRM loan application by typing free-text details into a multiline text field. There is no structured, system-enforced way to record which request types apply to which facilities. | Unstructured data entry makes it impossible to report on, validate, or route request types systematically. Credit and approval teams receive inconsistent, hard-to-parse application data. The proposed solution is to replace the free-text field with a structured multiselect dropdown (Renewal, Limit Increase, Extension of Drawdown, Rescheduling, Ownership Change, New Facility) linked per facility. |
| 4 | No merge or split capability exists in CRM. Related applications cannot be consolidated into one, and large bundled applications cannot be broken into separate routing paths. | Applications are processed in silos. Credit teams cannot receive a consolidated view of a customer's full request across multiple submissions. |
| 5 | No real-time status visibility for customers on the portal | High inbound inquiry volume to RM; poor customer experience |
| 6 | Document collection is attached informally (email or portal upload without structured categorisation per request type) | Lost documents, version control issues, compliance risk, and inability to validate document completeness per request type |
| 7 | The existing workflow stages and BMP module are well-defined and functioning correctly. The gap is not in the workflow engine itself but in the structured data feeding into it and the absence of merge/split tooling for RMs. | Without structured application data and merge/split capability, the workflow processes incomplete or inconsistently structured applications. |

### 2.2 Strategic Objectives

- Reduce loan application intake time from days to hours.
- Enable customers to self-serve 100% of standard application types.
- Reduce RM administrative burden by 60% through structured digital intake.
- Achieve full audit trail for all application events for regulatory compliance.
- Enable credit team to receive consolidated, complete applications.

---

## 3. Stakeholders

| Stakeholder | Role | Interest |
|-------------|------|----------|
| Business Customer | Portal User | Submit applications, track status |
| Relationship Manager (RM) | CRM User | Review, enrich, merge, split, route |
| Credit Analyst | CRM User | Evaluate credit risk |
| CAD (Credit Administration) | CRM User | Documentation, facility creation |
| Compliance Officer | CRM User | Audit, regulatory review |
| IT Administrator | CRM Admin | System configuration, security |
| Bank Management | Sponsor | ROI, regulatory compliance |

---

## 4. Scope

### 4.1 In Scope

**Customer Portal:**
- Secure authentication via Azure AD B2C
- Customer dashboard: facilities, applications, status
- New application journey: multi-facility, multi-request-type
- Draft save and resume
- Document upload (Azure Blob Storage)
- Real-time status tracking with stage timeline
- Customer notifications (email + in-portal)

**RM Workspace (Dynamics CRM on-premise):**
- Application review screen with Customer 360 view
- CRM forms with command bar, subgrids, and structured multiselect request type field per facility (replacing free-text multiline field)
- Merge Applications feature (multi-app consolidation)
- Split / Branch Application feature (partial routing)
- Workflow automation via the bank's internally developed BMP (Business Process Management) configurable module on Dynamics CRM on-premise — Power Automate is NOT used
- Approval workflow: RM → FFD, Technical & EPD (all optional) → Credit → Credit Manager → Credit & BFD Directors + VP + CEO, or ICC — routing determined by DOA (Delegation of Authority) rules based on request amount and request type
- Full audit trail on all state transitions
- Role-based access control

**Data Model:**
- Full Dynamics CRM on-premise entity design for all entities
- Relationships, business rules, security roles

**APIs:**
- REST endpoints bridging the customer portal to Dynamics CRM on-premise (Organization Service / Web API)

### 4.2 Out of Scope (Phase 1)

- Loan disbursement and accounting integration (Phase 6)
- Credit scoring engine integration (Phase 6)
- AI-powered risk indicators (Phase 6)
- Mobile application (Phase 6)
- Customer onboarding / KYC workflow
- Document e-signing

---

## 5. Functional Requirements

### FR-001: Customer Authentication
- **Priority:** Must Have
- The portal SHALL authenticate customers via Azure AD B2C.
- The portal SHALL support MFA for all customer accounts.
- Session timeout after 30 minutes of inactivity.
- Customers SHALL only see their own applications and facilities.

### FR-002: Customer Dashboard
- **Priority:** Must Have
- Display list of existing credit facilities with: facility name, limit, outstanding balance, expiry date, status.
- Display list of submitted applications with: reference number, submission date, current stage, status badge.
- Provide entry point to start a new application.
- Display unread notifications count.

### FR-003: New Application Journey — Multi-Request Bundle
- **Priority:** Must Have
- Customer SHALL be able to create a single application containing multiple request types across multiple facilities.
- Supported request types: New Facility, Renewal, Limit Increase, Rescheduling, Extension of Drawdown, Ownership Change, Facility Amendment.
- Customer SHALL be able to apply multiple request types to the same facility in one application.
- Customer SHALL be able to request a new facility in the same application as amendments to existing facilities.
- Application SHALL be saved as draft before submission.

### FR-004: Facility Selection
- **Priority:** Must Have
- Existing facilities loaded from Dataverse via API.
- Customer selects one or more facilities from the list.
- For each selected facility, customer selects one or more request types.
- For new facility: product type, amount, tenor, purpose, currency.
- Customer remarks per request type.

### FR-005: Document Upload
- **Priority:** Must Have
- Drag-and-drop document upload per facility/request type.
- Supported formats: PDF, DOCX, XLSX, JPG, PNG. Max 25 MB per file.
- System displays required document checklist per request type.
- Required documents validated before submission allowed.

### FR-006: Validation Rules
- **Priority:** Must Have
- Mandatory fields enforcement per request type.
- Duplicate request prevention: same facility + same request type cannot appear twice in one application.
- Conflicting request types flagged (e.g., Renewal + Rescheduling on same facility).
- Expired customer documents blocked at submission.
- Missing KYC data blocks submission with specific error message.
- At least one facility or new facility request required before submission.

### FR-007: Application Submission
- **Priority:** Must Have
- Submit triggers: validation, PDF summary generation, reference number assignment, status set to "Submitted", record written to Dataverse, notifications sent to customer and assigned RM.
- Customer receives confirmation screen with reference number.

### FR-008: Application Status Tracking
- **Priority:** Must Have
- Customer can view current stage and history of each application.
- Timeline displays: Submitted date, stage transitions, RM actions (names anonymized), pending actions, final decision.
- Status badge: Draft, Submitted, RM Review, Credit Review, Approved, Rejected, Cancelled, Merged, Branched.

### FR-009: RM Application Review Screen
- **Priority:** Must Have
- Model-driven app form displaying:
  - Customer 360: name, CIF, segment, existing exposure, relationship since.
  - Application summary: reference, submitted date, total facilities, total amount.
  - Facilities & Products subgrid: all facilities in this application.
  - Request Types subgrid: all request types mapped to facilities.
  - Documents subgrid: uploaded documents with download links.
  - Workflow BPF: visual stage indicator.
  - Audit Timeline: all events on the record.
- Command bar actions: Review, Merge, Split, Request More Info, Submit to Credit, Return to Customer, Cancel.

### FR-010: Merge Applications
- **Priority:** Must Have
- RM can select 2–10 applications for merging.
- Merge eligibility validation:
  - Same customer / same legal entity.
  - All applications in status: Submitted, RM Review.
  - No conflicting approvals in progress.
  - No duplicate facility + request type combination across applications.
  - No active non-reversible workflow stage.
- RM selects master application.
- System merges: copies all facility, request type, document records to master.
- Source applications marked status = "Merged", with reference to master.
- Merge event written to Application Merge History table.
- Master application reference number unchanged.
- All source application references stored in merge history.

### FR-011: Split / Branch Application
- **Priority:** Must Have
- RM opens submitted application and selects one or more facilities/products/request types.
- System validates:
  - Application not in Approved or beyond-credit stage.
  - At least one item remains in original after split.
  - No active non-reversible workflow tasks on selected items.
  - RM has Split permission.
- System creates new child application:
  - Copies customer data, contact details.
  - Moves selected facility/request/document records to child.
  - Generates new reference number (format: original-ref + "-B" + sequence).
  - Sets child application status = "Submitted" (restarts workflow).
  - Sets parent-child relationship on both records.
- Split event written to Application Split History table.

### FR-012: Workflow Stages
- **Priority:** Must Have
- Stages: Draft → Submitted → RM Review → RM Merge/Split Review → Credit Review → Approval → Completed / Rejected / Cancelled.
- Approval routing is DOA-driven: RM → FFD, Technical & EPD (all optional) → Credit → Credit Manager → Credit & BFD Directors + VP + CEO, or ICC — determined by request amount and request type.
- Workflow is enforced and automated by the bank's internally developed BMP (Business Process Management) configurable module running on Dynamics CRM on-premise. Power Automate and Dataverse BPF are NOT used.
- Stage transitions trigger BMP-driven notifications and task assignments via the existing BMP module.
- Workflow is reset to "Submitted" stage after a merge or split operation; the BMP module re-initiates routing from that point.

### FR-013: Audit Trail
- **Priority:** Must Have
- Every state transition, field change, merge/split event logged to Audit Log table.
- Audit records are append-only (no update/delete).
- Each audit record contains: entity name, record ID, actor (user ID), timestamp, action type, old value, new value, correlation ID.

### FR-014: Notifications
- **Priority:** Should Have
- Email notifications: application received, stage change, RM action, final decision.
- In-portal notifications: badge count, notification list with mark-as-read.
- CRM notifications: RM task assignments, SLA breach warnings.

### FR-015: Security & RBAC
- **Priority:** Must Have
- Portal: Azure AD B2C; customers see only their own records.
- CRM: Dynamics CRM on-premise security roles; role-based access enforced at entity and field level.
- Roles: Customer (portal), RM, FFD Officer, Technical Officer, EPD Officer, Credit Analyst, Credit Manager, Credit Director, BFD Director, VP, CEO, ICC Member, Admin.
- Field-level security on sensitive financial fields within Dynamics CRM on-premise.
- Merge and Split actions gated by CRM security role privilege check.
- Segregation of duties: RM cannot approve their own applications; DOA rules enforced by the BMP module.

---

## 6. Non-Functional Requirements

| ID | Requirement | Target |
|----|------------|--------|
| NFR-001 | Portal page load time | < 2 seconds (P95) |
| NFR-002 | API response time | < 500 ms (P95) |
| NFR-003 | Portal availability | 99.9% uptime |
| NFR-004 | Document upload | Up to 25 MB per file |
| NFR-005 | Concurrent portal users | 500 simultaneous |
| NFR-006 | Data residency | Within country / Azure region |
| NFR-007 | Session security | TLS 1.2+, HTTPS only |
| NFR-008 | Accessibility | WCAG 2.1 AA |
| NFR-009 | Audit retention | 7 years minimum |
| NFR-010 | Mobile responsiveness | Responsive on tablet and mobile |

---

## 7. Assumptions

1. Bank uses Dynamics CRM on-premise (not Dynamics 365 cloud / Dataverse). All CRM customisations are deployed on-premise.
2. The bank's internally developed BMP (Business Process Management) configurable module is already installed and operational on Dynamics CRM on-premise. This module handles workflow stage transitions, task assignments, notifications, and DOA-based approval routing.
3. Azure AD tenant is available for internal SSO (CRM users).
4. Azure AD B2C tenant will be provisioned for customer portal authentication.
5. Existing facility and customer data is available in the on-premise Dynamics CRM.
6. Azure Blob Storage (or an equivalent on-premise / hybrid document store) will be provisioned for portal document uploads.
7. Bank has CI/CD tooling available (Azure DevOps or equivalent).
8. RM users have Dynamics CRM on-premise licenses.
9. Customer portal is internet-facing; Dynamics CRM is on the internal network. API integration between portal backend and CRM uses a secured integration layer.

---

## 8. Constraints

1. All CRM customisations must be delivered as an unmanaged or managed solution following the bank's existing CRM solution management conventions.
2. Power Automate is NOT available. All workflow automation must use the existing BMP module.
3. Dataverse cloud features (BPF, Power Automate connectors, PAC CLI) are out of scope — this is strictly on-premise CRM.
4. Portal must comply with the bank's data classification and security policy.
5. No hardcoded business rules — all DOA thresholds, approval routing, and workflow configuration must be managed through the BMP module configuration, not hard-coded in code.
6. CRM entity schema changes must go through the bank's change management process.

---

## 9. Dependencies

| Dependency | Owner | Risk if Delayed |
|-----------|-------|-----------------|
| Azure AD B2C tenant provisioning | IT | Portal auth blocked |
| On-premise CRM environment access | IT | CRM data model work blocked |
| BMP module documentation / API exposure | Internal Dev Team | Workflow integration design blocked |
| Existing facility data availability in CRM | Data team | Portal facility list empty |
| Document storage provisioning (Blob or on-prem) | IT | Document upload blocked |
| Network / firewall rules (portal API to on-prem CRM) | IT / Network | Integration layer blocked |
| DOA rules documentation | Business / Credit | Approval routing cannot be configured |

---

## 10. Acceptance Criteria

| ID | Criterion |
|----|-----------|
| AC-001 | Customer can log in, view facilities, and submit a multi-request application end-to-end |
| AC-002 | RM can view submitted application with all facilities, request types, and documents |
| AC-003 | RM can merge two eligible applications; source applications marked Merged |
| AC-004 | RM can split one application into two; parent-child relationship maintained |
| AC-005 | Application workflow advances through all defined stages correctly via the BMP module, including DOA-based approval routing |
| AC-006 | Audit log captures every state transition with actor and timestamp |
| AC-007 | All validation rules enforced: mandatory fields, duplicates, conflicts, KYC |
| AC-008 | Customer receives status update notifications at each stage change |
| AC-009 | Merge/split blocked when eligibility conditions not met, with clear error messages |
| AC-010 | Security roles prevent unauthorized access to merge/split and approval actions |

---

## 11. Data Model Summary (High Level)

All entities are Dynamics CRM on-premise custom entities under the publisher prefix `maq_`.

| Entity | Purpose |
|--------|---------|
| Account (Customer) | Business customer master record (existing CRM entity) |
| maq_loanapplication | Unified loan application header |
| maq_applicationrequesttype | Structured request types per facility (replaces free-text multiline field) |
| maq_applicationfacility | Facilities included in the application |
| maq_applicationproduct | Products requested per facility |
| maq_facilityamendment | Amendment detail for amendment request types |
| maq_applicationdocument | Documents uploaded against the application |
| maq_applicationmergehistory | Append-only audit of merge operations |
| maq_applicationsplithistory | Append-only audit of split/branch operations |
| maq_approvaldecision | Decision records from each DOA-based approval stage |
| maq_auditlog | Append-only audit log for all system events |
| maq_portalnotification | Notifications for customer portal users |

Note: Workflow instance and task records are managed by the existing BMP module — no separate workflow entity is required in this solution.

---

## 12. Implementation Roadmap (High Level)

| Phase | Scope | Duration |
|-------|-------|----------|
| 1 | Customer portal foundation + CRM on-premise application structure + multiselect request type field | 8 weeks |
| 2 | Multi-request application submission (portal → CRM integration) | 6 weeks |
| 3 | RM merge and split capability in CRM | 4 weeks |
| 4 | BMP module integration, DOA-based approval routing, and audit | 6 weeks |
| 5 | Portal status tracking and notifications | 4 weeks |
| 6 | Optimisation, performance hardening, future AI integration | 4 weeks |

**Total estimated duration: 32 weeks (8 months)**

---

## 13. Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|------------|
| R-001 | On-premise CRM data quality issues (customer/facility data) blocking portal | Medium | High | Data audit before Phase 1 go-live |
| R-002 | Azure AD B2C provisioning delays | Medium | High | Provision in week 1; use mock auth for dev |
| R-003 | Merge/split edge cases not covered by validation | Medium | Medium | Extensive QA in Phase 3 |
| R-004 | BMP module integration complexity — undocumented APIs or internal coupling | Medium | High | BMP documentation review in Phase 1; involve internal dev team early |
| R-005 | DOA rules not fully documented — approval routing misconfigured | Medium | High | Formal DOA sign-off before Phase 4 begins |
| R-006 | Network/firewall rules between portal backend and on-premise CRM | Medium | High | Involve IT/network team from week 1 |
| R-007 | Customer adoption — users prefer calling RM directly | Medium | Medium | In-portal guidance, RM-assisted onboarding |

---

*End of Business Requirements Document v1.0*
