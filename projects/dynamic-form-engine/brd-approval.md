═══════════════════════════════════════════════════
CEO BRD APPROVAL DECISION
═══════════════════════════════════════════════════
Project:        Dynamic Form Engine Portal — QDB
Reviewed by:    CEO, Maqsad AI
Date:           2026-05-08
BRD Version:    1.0
═══════════════════════════════════════════════════


DECISION: APPROVED
──────────────────────────────────────────────────


JUSTIFICATION
─────────────────────────────────────────────────────────────────────

The BRD represents a well-scoped, technically coherent engagement that
directly addresses a genuine operational bottleneck at a regulated
banking institution. The following reasoning supports approval.

1. BUSINESS OBJECTIVES ARE SOUND AND MEASURABLE

   All six business objectives (BO-001 through BO-006) map cleanly to
   real pain points: slow form deployment cycles, manual data re-entry
   by Relationship Managers, and compliance exposure from inconsistent
   audit trails. The core value proposition — reducing time-to-launch
   for a new banking form from weeks to hours — is credible given that
   the entire form definition is externalised into Dataverse
   configuration. That claim is verifiable during UAT by timing the
   configuration and publication of a net-new form against a baseline.

2. STRATEGIC ALIGNMENT IS STRONG

   QDB operates within the Microsoft ecosystem (Dataverse, Azure AD,
   Power Automate, SharePoint). This engagement deepens that investment
   rather than fragmenting it. Fluent UI, OData Web API, Azure AD PKCE,
   and Docker-on-Azure are all within Maqsad AI's technology defaults
   and require no deviations. There is no technology risk introduced by
   novel or unproven choices.

3. ROI POTENTIAL IS CLEAR

   A single developer sprint (two weeks) consumed per net-new form
   deployment, multiplied by the number of banking products and
   compliance forms QDB launches annually, produces a compounding
   saving. The self-service configuration model also de-risks QDB's
   dependency on Maqsad AI for ongoing form changes after handover.
   That is a strong selling point for executive sponsorship at QDB.

4. REGULATORY AND COMPLIANCE REQUIREMENTS ARE EXPLICITLY ADDRESSED

   The BRD explicitly calls out QCB record-keeping obligations (C-006),
   a 7-year audit log retention period (NFR-010), an append-only audit
   log (FR-046, BR-008), Qatar Azure region data residency (C-005), and
   TLS 1.2 minimum (NFR-005). These are the right controls for a
   regulated banking portal. They must be verified in the architecture
   phase and confirmed in the audit phase before go-live.

5. SCOPE IS WELL-BOUNDED

   The out-of-scope list is explicit and commercially sensible. Offline
   capability, e-signature, SMS/email notifications, multi-language,
   and B2C auth are correctly deferred. This prevents scope creep while
   leaving a clean extension path for Phase 2.

6. RISKS ARE IDENTIFIED AND OWNERS ARE ASSIGNED

   The risk register (Section 13) names ten risks with owners and
   resolution deadlines. Three risks are rated High: Dataverse
   throttling under peak load, Azure AD app registration delays by
   QDB IT, and data residency verification. All three are acknowledged
   and tracked. The architecture phase must address the throttling risk
   with a concrete caching and retry strategy before build begins.


CONDITIONS FOR THIS APPROVAL
─────────────────────────────────────────────────────────────────────

The following conditions must be satisfied. The Architecture phase may
begin immediately but must resolve or formally mitigate each condition
before the Architecture phase output is approved.

CONDITION 1 — DATAVERSE THROTTLING STRATEGY (High Risk)
  The architect must produce a concrete mitigation strategy for
  Dataverse Web API throttling under peak load. Acceptable mitigations
  include: server-side metadata caching with a configurable TTL,
  exponential back-off with retry on 429 responses, and a documented
  estimate of API call volume per concurrent user session. The NFR-001
  (500 ms at P95 under 100 concurrent users) and NFR-008 (200
  concurrent users without degradation) targets must be shown to be
  achievable with the proposed caching layer before build begins.

CONDITION 2 — CUSTOM EXPRESSION VALIDATION SCOPE (Medium Risk)
  FR-019 includes "custom JavaScript expression" as a validation type.
  This carries a security risk: arbitrary JavaScript evaluated in the
  browser or on the backend from Dataverse-stored strings. Before the
  Architecture phase is approved, the architect must define the sandbox
  model — whether this uses a restricted DSL, a safe expression
  evaluator library, or is deferred to Phase 2. Unrestricted eval() is
  not acceptable under our own coding standards (common.md, Security
  section) or any banking security policy.

CONDITION 3 — QCB AUDIT LOG FORMAT CONFIRMATION (Medium Risk)
  The BRD acknowledges that QCB record-keeping regulation specifics for
  the audit log format have not yet been confirmed (Section 13). Before
  the build phase begins, QDB's Compliance team must confirm whether
  QCB mandates a specific log format, field set, or reporting structure
  beyond what is defined in FR-044 and FR-045. If QCB requires
  structured reporting exports (e.g., a specific XML or CSV format),
  that is a functional gap that must be added to scope or explicitly
  documented as a Phase 2 item before first sprint.

CONDITION 4 — BACKEND FRAMEWORK ALIGNMENT
  The BRD specifies Node.js + Express + TypeScript (C-002). Maqsad
  AI's technology default is Node.js + TypeScript + Fastify + Prisma.
  The architect must file an ADR if Express is retained instead of
  Fastify, justifying the deviation. This is a constraint imposed by
  the client's BRD; a brief ADR documenting the client mandate is
  sufficient. The deviation does not block approval but must be
  formally recorded.

CONDITION 5 — DRAFT EXPIRY CLEANUP OWNERSHIP
  BR-004 defines a 90-day draft expiry with configurable period but
  does not define the cleanup mechanism. The architect must specify
  whether this is an Azure Function on a cron schedule, a Power
  Automate scheduled flow, or a CRM background job, and confirm who
  owns its operational monitoring after handover.

CONDITION 6 — A-010 GUEST/B2C CONFIRMATION
  Assumption A-010 states all users (bank customers and internal staff)
  authenticate through the same Azure AD tenant and that B2C is out of
  scope. This must be formally confirmed in writing by QDB before
  Sprint 1 begins, because the authentication model is a foundational
  architectural decision. If QDB customers are external (not QDB
  employees), Azure AD B2C or Entra External ID is the correct solution
  and the assumption may be incorrect. The BA must obtain written
  confirmation from the QDB project sponsor before the Architecture
  phase design is locked.


WHAT MUST NOT BEGIN UNTIL CONDITIONS ARE RESOLVED
─────────────────────────────────────────────────────────────────────
- No backend API code may be written until Condition 2 (custom
  expression validation sandbox) is resolved.
- No Sprint 1 work may begin until Condition 6 (A-010 B2C
  confirmation) is confirmed in writing from QDB.
- No deployment configuration may be finalised until Condition 3
  (QCB audit log format) is confirmed.


WHAT IS AUTHORISED TO BEGIN NOW
─────────────────────────────────────────────────────────────────────
The Architecture phase is authorised to begin immediately. The
architect should proceed with:

  - Dataverse schema design for all 12 configuration tables
  - React portal component architecture and rule engine design
  - Backend API service layer design (with Fastify ADR or Express
    justification per Condition 4)
  - Authentication flow design (Azure AD PKCE, token validation
    middleware)
  - Caching strategy for metadata API (addressing Condition 1)
  - File upload routing design (CRM Notes vs SharePoint conditional)
  - Audit log data model and append-only enforcement mechanism
  - Dependency research: confirm or reject use of established
    open-source rule engine libraries (per CLAUDE.md dependency
    adoption policy — github-researcher must assess before the
    rule engine is designed from scratch)


SUCCESS CRITERIA FOR THIS ENGAGEMENT
─────────────────────────────────────────────────────────────────────
These criteria must be met at UAT for Phase 7 final approval:

  1. A net-new banking form (not the Loan Application reference form)
     is created entirely through Dataverse configuration and appears on
     the portal, fully rendered with correct field types, validation,
     and conditional rules, within 4 hours of configuration completion
     — with no frontend code changes or redeployment.

  2. A portal user submits the Loan Application form and the correct
     parent (Opportunity) and child (Contact) CRM records are created
     in Dataverse with 100% of mapped field values populated correctly.

  3. The Compliance team can access the audit log viewer and retrieve
     a complete audit trail for any submission, filterable by user,
     form, event type, and date range, and no audit record can be
     edited or deleted through any exposed interface.

  4. The metadata API returns a complete form definition in under
     500 ms at P95 under a simulated load of 100 concurrent users,
     verified by a load test report.

  5. Azure AD authentication blocks all unauthenticated access to
     every portal route and API endpoint, verified by a security test
     that confirms 401 responses on all endpoints without a valid token.

  6. All data remains within the Qatar Azure region, confirmed by QDB
     IT in a signed data residency declaration before go-live.


OPEN ITEMS FOR THE BA TO CLOSE BEFORE SPRINT 1
─────────────────────────────────────────────────────────────────────
  - Obtain written confirmation from QDB project sponsor on A-010
    (same Azure AD tenant for all users, no B2C) — blocks Sprint 1.
  - Confirm QCB audit log format requirements with QDB Compliance.
  - Confirm Power Automate flow data contract with QDB CRM team
    (currently open, owner: QDB CRM Team, deadline: Sprint 3 start —
    bring this forward to before architecture sign-off if possible).
  - Confirm SharePoint document library structure and naming convention
    with QDB CRM Team (currently open, deadline: Sprint 2 start).


═══════════════════════════════════════════════════
SIGNED OFF
Role:     CEO, Maqsad AI
Decision: APPROVED (with conditions above)
Date:     2026-05-08
═══════════════════════════════════════════════════
