# Phase 1 — CEO BRD Approval Decision

| | |
|---|---|
| **Engagement ID** | RPT-ENG-001 |
| **Project** | report-engine |
| **Reviews** | phase-2-ba.md (BRD v1.0) |
| **Date** | 2026-07-07 |
| **Decision authority** | CEO (Maqsad AI) |

---

## Decision: ✅ APPROVED WITH CONDITIONS

The BRD for the Metadata-Driven Report Engine (RPT-ENG-001) is approved to proceed to **GitHub Research → Phase 3 Architecture**, subject to the conditions below. The business case is strong: removing developer dependency from ~300 SSRS reports addresses a real delivery bottleneck and cost centre, and the phased MVP cut is a credible way to de-risk a large programme.

The four most architecture-shaping questions were resolved at the gate (middle tier permitted, async/staged execution allowed, V1 export set = PDF/Excel/CSV/Word/Image, functional parity for V1). This removes the primary architectural ambiguity and justifies approval now rather than a second BRD round.

---

## Strategic assessment

| Dimension | Assessment |
|---|---|
| Business value | **High** — directly attacks the #1 stated pain (developer dependency) with a measurable target (≥70% of new reports author-free). |
| ROI | **Positive** — displaces recurring developer cost across a 300-report estate; self-service reduces IT backlog. |
| Risk profile | **Moderate–High but managed** — scope is large; the MoSCoW MVP and phased migration are the correct mitigation. Middle-tier approval materially lowers technical risk. |
| Strategic fit | **Strong** — consistent with the platform direction (Dataverse-centric, on-prem→cloud path) and reuses the org's existing solution/prefix conventions. |
| Build vs adopt | **Defer to GitHub Research** — expression evaluation, PDF/Word/Excel rendering, and charting are areas where mature libraries must be adopted, not built (mandatory per constitution). |

---

## Conditions of approval

**Gating for Architecture (must be scheduled, may run in parallel with GitHub Research):**

- **C-1 (OQ-003):** Confirm exact CRM on-prem 9.x build/version and the network topology between the CRM tier, the middle tier, and external systems. Architecture connectivity design depends on this. *Owner: BA/Client. Due: before Phase 3 sign-off.*
- **C-2 (OQ-004):** Obtain written data-residency and audit/execution-log retention requirements. Drives cache placement and the audit schema. *Owner: Compliance/Client. Required before any external-data (V2) design is finalised; a stated assumption is acceptable to start V1 architecture.*

**Scope conditions:**

- **C-3:** V1 scope is locked to the recommended MVP cut in BRD §13, **amended** to include Word (.docx) and Image/PNG export (per OQ-005 resolution). No further V1 scope additions without a change request.
- **C-4 (OQ-006):** N:N relationships and unlimited/multi-level drilldown are **confirmed deferred to V2**. V1 delivers single-level drilldown + clickable-row navigation only.
- **C-5:** The expression/formula engine (FR-011/FR-067) must be a sandboxed, non-Turing-complete evaluator — **no arbitrary code execution**. This is a hard security condition carried into architecture and audit (ref R-9).

**Architecture-phase deliverables (owned by Architect in Phase 3):**

- **C-6:** Define the async/staged execution model concretely — job orchestration, cache keying (report+params+identity), TTL, and how partial/failed external results are surfaced. Must respect the CRM ~2-minute ceiling for the interactive path (NFR-002).
- **C-7:** Produce an ADR on the **on-prem vs cloud export/rendering** strategy — a single abstraction with per-target implementations, validated by an early spike (ref R-4). This is on the critical path because V1 must ship PDF/Excel/CSV/Word/Image on **both** targets.
- **C-8:** Confirm the Dataverse solution + publisher prefix (OQ-008) and ensure the 18-table schema is portable (no environment-hardcoding, BR-9).
- **C-9:** Design external-credential handling via a secret store (Key Vault / on-prem equivalent), per-connector RBAC and audit (ref R-5, BR-8).

---

## Success criteria the CEO will judge the final delivery against

1. A power user can author, publish, and run a CRM-data report end-to-end with **zero developer involvement** (OBJ-1).
2. A config-only change (add a column, change a filter) takes **minutes, not a developer cycle** (OBJ-2).
3. Every production execution is **audit-logged**, and masking + access control are provably enforced **server-side** (OBJ-5, BR-5/6).
4. The same report definition runs on **on-prem and cloud** without redesign (OBJ-7, NFR-011).
5. The V1 export set (PDF/Excel/CSV/Word/Image) renders faithfully on **both** targets.

---

## Instruction to orchestrator

Proceed to **GitHub Research** (mandatory dependency-adoption check for: expression evaluation, PDF rendering, Word/OpenXML, Excel (ClosedXML/EPPlus), charting, and HTML-to-PDF), then **Phase 3 Architecture**. Carry conditions C-1…C-9 into the architecture. Do not begin Phase 4 build until architecture addresses C-5, C-6, C-7, and the schema portability requirement (C-8).
