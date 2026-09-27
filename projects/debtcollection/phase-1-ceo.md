# DCP-001 — CEO Phase 1: Business Objectives and Engagement Authorization

**Project:** Debt Collection Platform (DCP-001)
**Date:** 2026-09-13
**Author:** CEO agent — MSS Technologies
**Status:** APPROVED — proceed to BA phase

---

## 1. The Problem

Qatar Development Bank's collection function is split across two Dynamics 365 CE
organisations — Housing Loan CRM and BFD CRM — with no unified workspace, no
cross-org customer view, and no systematic collection lifecycle management.
Officers work from spreadsheets, email, and manual CRM lookups. Evidence of
collection activity is inconsistent and cannot be produced for a regulatory audit.

The portfolio reality amplifies the urgency:

| Slice | Customers | Arrears (QAR) | Share |
|---|---:|---:|---:|
| >2000 DPD | 406 | 125,115,361 | 58.7% |
| ≥501 DPD (3 buckets) | 1,098 | 190,540,956 | 89.4% |
| 1–30 DPD (early collection) | 1,594 | 2,440,631 | 1.1% |

89.4% of arrears sit in the deep buckets, yet those customers also need a
governance-compliant hand-off to legal or insurance — exactly the work the
current tooling cannot evidence. The 1–30 DPD slice is where cure happens;
at 40.8% of case volume it needs automation and officer leverage, not spreadsheets.

---

## 2. Strategic Objectives

| # | Objective | Measure of success |
|---|---|---|
| SO-01 | Give collection officers a single operational workspace | All collection activity recorded inside one system per case; no parallel spreadsheet |
| SO-02 | Eliminate evidence gaps for regulatory audit | Every action, communication, PTP, approval and override in an append-only audit trail |
| SO-03 | Enforce stop-contact and consent before any outbound channel | Zero automated contacts reaching suppressed customers; router-enforced, not UI-enforced |
| SO-04 | Serve the Housing Loan portfolio first (80–90% of book) | Phase 1 live and in use for HL; BFD accessible behind a feature flag without rework |
| SO-05 | Lay the dual-org foundation once | CRM Context Router and QID identity map built from day one for both orgs |
| SO-06 | Keep Phase 1 in budget for a 2-person delivery team | Architecture sized to the data volume (4,300–4,900 customers); no over-engineering |

---

## 3. Phase 1 Scope Decision

Based on the analysis in `facts-and-analysis.md` and the two answered gating
questions (Q-05: two orgs, HL first; Q-07: build in-house), the CEO authorises
the following Phase 1 boundaries:

**In scope for Phase 1:**
- Housing Loan CRM (primary org); BFD behind a feature flag
- Modules 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16 as described in
  the brief — but **Q-01 (two modules or six) remains open for the BA to resolve**
- The CRM Context Router and QID identity map are built for dual-org from day one
- Legal and Insurance Officer work exclusively in native CRM; no portal UI for
  these personas in Phase 1 (ADR-DCP-03)
- Field Visit Management (module 11) is out of Phase 1; carried as an action type

**Out of scope for Phase 1:**
- WhatsApp (pending BSP contract, Meta template approval, PDPPL consent framework)
- BFD CRM live operations (feature-flagged, not deleted)
- Cross-org Customer 360 merge (router built for it; React surface deferred)
- Predictive scoring, propensity modelling, AI-driven next-best-action

**Non-negotiables carried forward:**
- Qatar: QAR, QID as the customer key; PDPPL applies to all contact data
- Audit written by a CRM plugin, append-only, never client-side
- Stop-contact enforced in the router before any channel adapter
- Exposure carries no discriminating signal in this portfolio; DPD and arrears
  are the only segmentation inputs that matter
- Config table must be able to express "no automated contact" for a bucket

---

## 4. Return on Investment and Business Case

| Lever | Quantification basis |
|---|---|
| Officer productivity | Current: manual lookup, spreadsheet entry, no system-assisted follow-up. Target: actions, PTPs and communications logged in the workspace with SLA visibility |
| Audit risk reduction | Current: no evidence pack for regulator or legal. Target: every action carries actor, timestamp, channel, outcome and template reference |
| Conduct risk reduction | Current: no systematic stop-contact enforcement. Target: router blocks every suppressed send with a logged reason; zero bypasses |
| Recovery uplift | Even a 5% improvement in cure rate in the 1–30 DPD bucket releases ~QAR 122K from the QAR 2.44M arrears in that slice; the return dwarfs a 2-person build |

No external vendor license cost. Build cost is internal delivery + infrastructure.

---

## 5. Strategic Risks and Mitigations

| Risk | CEO's view |
|---|---|
| R-01: Cross-org 360 not joinable in SQL | Accepted by design: router fan-out is the only permitted path. Must be enforced architecturally, not by convention |
| R-03: Audit written client-side is bypassable | Hard no. Plugin-written audit is a non-negotiable; the architecture phase must prove it |
| R-04: Stop-contact bypassed at UI level | Hard no. Router enforcement before any channel adapter; architecture must demonstrate the enforcement point |
| R-07: PDPPL applies to all customer contact data | Data-protection assessment must be completed before any production data lands. This is a go-live gate |
| Q-14: On-premise 2019 vs Dataverse cloud | Until this is answered, the router hosting approach (App Service vs on-prem IIS/containers) is unresolved. Must be closed before architecture begins |

---

## 6. Success Criteria for Phase 1

Phase 1 is considered successful when ALL of the following are true:

| SC-01 | A Collection Officer can open a customer's full HL facility view, log an action, and capture a PTP from one screen without leaving the portal |
| SC-02 | A PTP that passes its promised date without a matched payment is automatically flagged as broken and escalated |
| SC-03 | An SMS or email to a customer with `stopContact = true` is blocked at the router with a logged reason; the block is evidenced in the audit trail |
| SC-04 | The full audit trail for a case — actions, communications, PTP changes, approvals, status transitions — can be exported as a single evidence pack |
| SC-05 | A Senior Manager can see all open cases, SLA status, overdue actions and broken PTPs from one dashboard without a spreadsheet |
| SC-06 | Deploying the BFD feature flag enables BFD cases without any code change |

---

## 7. CEO Mandate to the BA Phase

1. Resolve Q-01 (two modules or six in Phase 1) as the single most important
   boundary question; the BRD must state the answer, not carry both readings.
2. Carry Q-02 through Q-14 as numbered open items with owners and default
   assumptions per `facts-and-analysis.md §8` — do not resolve what has not
   been confirmed.
3. Produce a BRD of sufficient depth that an architect can size the work
   without a second discovery round.
4. All requirements must be traceable, independently testable, and prioritised
   P1/P2/P3. P1 = the shippable Phase 1 minimum.
5. Data residency and PDPPL applicability are requirements in the BRD, not
   audit findings to be discovered later.

---

## 8. Engagement Approval

**APPROVED.** Proceed to Phase 2 — Business Analysis.
The CEO will review the completed BRD before Phase 3 (Architecture) begins.
No architecture or build work may start without that review.

| Decision | Authority | Date |
|---|---|---|
| Build in-house (Q-07) | User | 2026-09-12 |
| Two orgs, Housing Loan first (Q-05) | User | 2026-09-12 |
| Open BA phase | CEO | 2026-09-13 |
