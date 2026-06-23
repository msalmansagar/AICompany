# CEO BRD Review — DXP-P1-003
**Date:** 2026-06-18
**Reviewer:** Maqsad AI — CEO
**Decision:** APPROVED WITH CONDITIONS

---

## Executive Assessment

DXP-P1-003 closes the final foundational gap in the QDB Digital Experience Platform. Combined with the Component Registry (DXP-P1-001) and RBAC (DXP-P1-002), a governed Token System completes the three pillars that must be in place before any service-specific portal feature can be built. The BA has correctly sequenced this engagement and correctly identifies why proceeding without it is operationally untenable: without tokens, rebranding means touching every component file, per-service customisation is impossible, and bilingual layout differences accumulate as undocumented hardcoded values scattered across the codebase.

The five-level hierarchy — global, render-target, category, component, service — is proportionate and sound. It provides enough granularity to support service-owner brand independence without introducing a hierarchy so deep that it becomes unmanageable. The resolution algorithm is deterministic and described precisely. The data model (two Dataverse entities: definitions and values) is lean and correctly extends the existing `QdbDxpPlatform` solution and the C-010 slug-based reference pattern.

The service-owner scoping at Level 5 is the correct implementation of the row-level security gap that was explicitly deferred from DXP-P1-002 Condition 4. The JWT `permissions` claim provides the service slug; the API enforces it at write time; the HTTP 403 guard is specified. This is clean and does not require a breaking change to the RBAC data model.

The bilingual design is competent. Locale-specific tokens override locale-neutral tokens of the same slug; the `direction` token type governs RTL at the CSS variable layer rather than inside component logic; icon mirroring is token-governed. This is the right architecture for a government portal that must serve Arabic and English simultaneously. One gap is identified below.

The publish-then-cache model is the correct posture for a government portal: token changes do not leak live until explicitly published, multiple changes can be batched, and the audit record is preserved. The 50 ms p95 and 5-second publish SLAs are realistic and measurable.

The 18 acceptance criteria are individually specific, testable, and traceable to functional requirements. Several open questions need resolution before architecture proceeds; the disposition of each is stated below.

---

## Strengths

- The five-level hierarchy is correctly ordered: service overrides are most specific, global defaults are least specific, and the resolution algorithm is deterministic and unambiguous.
- The C-010 slug-based reference pattern is correctly extended to tokens: `qdb_Slug` is the alternate key, slugs are immutable after creation, and GUIDs are never exposed as token references (FR-002, FR-020, FR-009).
- The DXP-P1-002 RBAC architecture gate is explicitly carried forward. The service-owner Level 5 write path enforces the JWT `permissions` claim at the API boundary — the gap flagged in DXP-P1-002 Condition 4 is now formally addressed by this BRD.
- Soft-delete only on token values (FR-010) preserves full history for audit. Deactivating a higher-level value produces a visible, reversible fallback — this is the correct behaviour for a regulated entity making brand changes.
- The staging window (FR-030) — changes do not take effect until publish is triggered — is the right model for government-grade change governance. Admins can batch multiple changes and review before they are visible to portal users.
- Locale-specific token override logic is explicit and correctly resolved: locale-specific wins over locale-neutral for the same slug; other slugs fall back to locale-neutral. This avoids the common trap of requiring complete locale-specific token sets.
- The public (unauthenticated) token resolution endpoint (FR-011, AC-013) is correctly identified as public — portal page renders must not be blocked by auth failures on a style-serving endpoint.
- NFR-005 (availability during Dataverse outage if cache is warm) is a critical resilience requirement for a portal that must remain visible to citizens even during backend maintenance windows. It is correctly stated.
- The provisioning script idempotency requirement (FR-007, AC-011) extends the established pattern from DXP-P1-001 and is non-negotiable for multi-environment ALM.
- The out-of-scope list is appropriately bounded: per-user themes, A/B testing, CSS-in-JS, mobile theming, and CDN edge caching are all correct deferrals. The boundary is clear and defensible.
- AC-017 (cascade soft delete from definition to all values) is correctly included — deactivating a definition without deactivating its values would produce orphaned overrides that silently apply during resolution.
- AC-018 (graceful fallback for unknown service slug) prevents a portal rendering failure when a service slug is misspelled or not yet provisioned.

---

## Issues Found

1. **[BLOCKER] OQ-001 — Publish model requires a formal client decision before architecture.**
   FR-014 specifies an explicit publish action (`POST /api/admin/tokens/publish`). FR-015 specifies automatic cache invalidation on any admin write. These two requirements are not contradictory in isolation, but OQ-001 asks whether the staging window (FR-030) should exist at all. If the client chooses instant publish (no staging window), FR-014 and FR-030 are redundant and the architect will design a simpler single-path model. If the client chooses explicit publish, FR-015 must be scoped to apply only to draft/staging state, not to live serving. The architect cannot design the cache invalidation contract without knowing which model is chosen. The QDB IT Director must provide a formal decision on this before architecture begins.

2. **[BLOCKER] OQ-002 — Service-owner token approval workflow is unresolved with regulatory implications.**
   FR-018 allows a `service-owner` to write Level 5 token overrides that take effect on publish without `portal-admin` review. For a government-owned development bank, a service owner independently changing `color-primary` on a citizen-facing financing application page may carry brand governance and accessibility compliance implications (Qatar e-government accessibility standards, WCAG). If QDB Compliance or the IT Director requires a secondary approval step for Level 5 changes, the data model needs a `status` field on `qdb_token_values` (draft / pending-approval / approved) and the architect must design a review workflow. If no approval is required, the architect proceeds with the current model. This decision must come from the QDB IT Director or Compliance before architecture begins — it directly determines whether the data model is more complex than specified.

3. **[CONDITION] The DXP-P1-001 architecture gate is a prerequisite that must be confirmed, not assumed.**
   Section 2.3 of this BRD states that Theme Tokens complete the three foundational pillars, but it does not explicitly restate the DXP-P1-001 Phase 7 gate. The DXP-P1-001 CEO decision (Section 5, DXP-P1-003 gate) requires: (a) all six DXP-P1-001 blocking conditions confirmed, and (b) GGAP-001 resolved via Path A or Path B. Until both are confirmed in writing, DXP-P1-003 architecture may not begin. The BRD addendum must carry a confirmation date for these gates before the architect is engaged.

4. **[CONDITION] The DXP-P1-002 architecture gate must also be confirmed for the service-owner slug dependency.**
   FR-018 and NFR-008 depend on the JWT `permissions` claim delivering a validated service slug. This claim is authored by the DXP-P1-002 RBAC system. If DXP-P1-002 has not cleared its architecture gate — specifically, that the `service-owner` role and the service slug claim are designed and implemented — the DXP-P1-003 service-level enforcement has no slug source to enforce against. The architect must confirm that DXP-P1-002 has either completed its Phase 3 architecture or has produced a stable interface contract for the `permissions` claim structure before DXP-P1-003 architecture begins. A stable interface contract is acceptable; a completed build is not required.

5. **[CONDITION] Level 3 (category) and Level 4 (component) resolution context is only partially specified for the public endpoint.**
   FR-026 states that `category` and `componentSlug` are optional parameters on the public resolution endpoint. AC-001 through AC-005 test only render-target, locale, and service resolution. There are no acceptance criteria covering Level 3 (category) or Level 4 (component) override resolution. This is a gap: the architect will need to know whether the public endpoint is expected to receive component-level context from the portal shell at SSR time, or whether Level 3/4 are reserved for admin/diagnostic use only. The BA must clarify this with QDB IT before architecture begins — it affects the SSR integration contract with the Next.js portal shell.

6. **[CONDITION] Seed token content ownership is unresolved.**
   A-004 states that QDB's design team will provide the initial seed token values for global Level 1 tokens. However, FR-007 requires the provisioning script to ship with a seed set. If QDB's design team has not delivered brand guidelines before the architect designs the provisioning script, the script will contain placeholder values that may not satisfy AC-011 (idempotent provisioning). The BA must obtain a firm commitment from QDB on when the seed token values will be available relative to the start of Phase 4 (build). The provisioning script cannot be final without this input. Seed delivery must be a tracked dependency, not an assumption.

7. **[CONDITION] Redis availability is assumed but not confirmed.**
   A-002 assumes Redis is available in the API environment. NFR-004 specifies a 5-minute TTL fallback for in-memory cache. The NFR-001 p95 target of 50 ms is achievable with both Redis and in-memory on a warm cache. However, the NFR-005 availability guarantee (portal remains up during Dataverse outage) behaves differently in a multi-instance deployment: in-memory cache is per-instance and will cold-miss on new or restarted instances, while Redis is shared. For a government portal that may have multiple API instances behind a load balancer, the architect must know which cache model to design for. QDB IT / DevOps must confirm Redis availability before architecture begins.

8. **[CONDITION] There is no stated upper limit on the number of token definitions that can be referenced in a single resolution response.**
   NFR-006 caps Phase 1 at 200 token definitions. With 200 tokens across all types, a single resolution response returning all `{ slug: value }` pairs is a small JSON payload and poses no performance concern. However, the resolution endpoint returns all active token definitions resolved for the given context — there is no pagination. If the Phase 1 cap is later lifted without revisiting the endpoint contract, a large token set could degrade SSR response time. The architect must document this ceiling explicitly in Phase 3 and require that any increase beyond 200 tokens triggers a performance review.

9. **[ADVISORY] The `icon-mirror` token type uses string values `true` / `false` rather than a boolean.**
   FR-005 specifies the `direction` token type with values `ltr / rtl / true / false`. Mixing string boolean representations (`true`/`false`) with directional strings (`ltr`/`rtl`) in the same type category introduces ambiguity. A component consuming `var(--icon-mirror)` must parse the string value rather than treating it as a boolean. The architect should evaluate whether `icon-mirror` warrants its own token type (`boolean`) or whether the portal shell's CSS injection layer converts the string to a CSS boolean-equivalent (e.g. `1` / `0`). Not a blocker — the design is workable as specified — but the architect must produce an explicit resolution.

10. **[ADVISORY] AC-015 covers `text-direction` but no acceptance criterion covers `icon-mirror` behaviour.**
    The `icon-mirror` token is specified in FR-023 but has no corresponding acceptance criterion. The QA agent should add a criterion confirming that `icon-mirror=true` with `locale=ar` resolves correctly and that the portal shell applies the appropriate CSS transform. This is a QA-phase gap, not a BRD rejection reason.

11. **[ADVISORY] No rate limiting or abuse protection is specified on `POST /api/admin/tokens/publish`.**
    A publish action triggers a Dataverse re-fetch and cache rebuild. An admin making rapid repeated publish calls could create a Dataverse query flood. The architect should define a minimum interval between publish calls (e.g. a 10-second debounce or a queue-based serialisation) and the BA should confirm whether this is acceptable with QDB IT. Not blocking, but the architect must address it in Phase 3.

---

## Open Questions Disposition

| ID | Question | Disposition | Rationale |
|----|---------|-------------|-----------|
| OQ-001 | Instant publish vs. explicit publish action | BLOCKER — must answer before architecture | The cache invalidation contract and FR-015/FR-030 interaction cannot be designed without this decision. See Issue 1. |
| OQ-002 | Service-owner token changes: require portal-admin approval? | BLOCKER — must answer before architecture | Determines whether `qdb_token_values` needs a status/approval workflow field in the data model. See Issue 2. |
| OQ-003 | Is Redis available? | BLOCKER — must answer before architecture | Determines multi-instance cache model and NFR-005 availability guarantee under load. See Issue 7. |
| OQ-004 | Max number of services in Phase 1 | DEFER TO ARCHITECT | NFR-006 caps token definitions at 200. The architect can document the service count assumption and revisit if the cap is exceeded. |
| OQ-005 | Existing QDB brand guidelines for seed tokens | CONDITION — must track delivery commitment | Seed token content is a provisioning dependency. Delivery must be committed before Phase 4 begins. See Issue 6. |
| OQ-006 | CDN-level token serving | DEFER TO ARCHITECT | The 50 ms p95 target is achievable from a Redis or in-memory cache within the API tier. CDN edge caching is a future DevOps enhancement correctly out of scope. |

---

## Conditions

### BRD-gate conditions (client answers required before architecture phase begins)

1. **OQ-001 must receive a formal yes/no decision from the QDB IT Director before architecture begins.** The BA must document the client's choice — explicit publish window or instant publish on save — in a BRD addendum. The architect must not design the cache invalidation contract until this is confirmed.

2. **OQ-002 must receive a formal yes/no decision from the QDB IT Director or QDB Compliance before architecture begins.** If the answer is yes (approval required), the architect must include a pending-approval state in the `qdb_token_values` data model and design a Level 5 review workflow in Phase 3. If the answer is no, this must be documented with the decision-maker's name and date.

3. **OQ-003 (Redis availability) must be confirmed by QDB IT / DevOps before architecture begins.** The confirmation must be documented in the BRD addendum. The architect requires this to design the cache layer and provide the NFR-005 availability guarantee under multi-instance deployment.

4. **DXP-P1-001's six blocking conditions must be confirmed as cleared before architecture begins.** The date of confirmation must appear in the BRD addendum. This gate was set in the DXP-P1-001 CEO Phase 7 decision (Section 5) and is non-negotiable.

5. **A stable DXP-P1-002 interface contract for the `permissions` claim (service slug delivery) must exist before architecture begins.** The architect must confirm that the JWT `permissions` claim structure is defined and stable — either via a completed DXP-P1-002 Phase 3 architecture document or via a frozen interface contract signed off by the DXP-P1-002 architect. If neither exists, DXP-P1-003 architecture cannot proceed because FR-018 has no slug source.

6. **The BA must obtain a delivery commitment from QDB's design team on seed token values** before Phase 4 (build) begins. The commitment date must be documented in the BRD addendum. The provisioning script cannot ship with final values without this input.

### Architecture-phase deliverables (owned by the Architect, resolved in Phase 3)

7. The architect must resolve the Level 3/4 (category and component) context question for the public resolution endpoint: does the Next.js portal shell pass `category` and `componentSlug` at SSR time, or are these reserved for admin/diagnostic use? The resolution must be documented in Phase 3 and reflected in the API contract.

8. The architect must produce an explicit decision on the `icon-mirror` token value format (string `true`/`false` vs. numeric CSS equivalent) and how the portal shell injection layer handles the conversion.

9. The architect must define a ceiling and performance review trigger for the token definition count (currently capped at 200 in NFR-006) and document the implications of exceeding it on the resolution endpoint response time.

10. The architect must define a publish debounce or serialisation mechanism for `POST /api/admin/tokens/publish` to prevent a Dataverse query flood from rapid repeated publish calls.

---

## Architecture Gate Status

DXP-P1-003 architecture may begin once all of the following are confirmed:

1. DXP-P1-001's six release blockers cleared (target date confirmed in writing).
2. OQ-001 answered by QDB IT Director (publish model decision).
3. OQ-002 answered by QDB IT Director or Compliance (Level 5 approval workflow decision).
4. OQ-003 answered by QDB IT / DevOps (Redis availability confirmed).
5. Stable DXP-P1-002 interface contract for the JWT `permissions` claim in place.

Architecture-phase items 7 through 10 above are gates for architecture sign-off, not for BRD handoff. The architect owns them and must resolve them within Phase 3.

---

## Decision Rationale

This BRD is approved with conditions because the business case is correct, the data model is sound, the hierarchy is well-designed, and the acceptance criteria are specific and automatable. The C-010 constraint is honoured throughout. The DXP-P1-002 service-owner scoping gap — explicitly flagged in the DXP-P1-002 CEO approval as Condition 4 — is addressed by Level 5 service slug enforcement. The bilingual and RTL design is competent and architecture-ready.

The two blockers (OQ-001 and OQ-002) are not deficiencies in the BA's analysis — they are genuine policy choices that belong to QDB. They cannot, however, be left open when the architect begins design: OQ-001 determines the cache contract, and OQ-002 determines the data model. OQ-003 (Redis) is equally non-deferrable because it determines whether the NFR-005 availability guarantee is achievable in a multi-instance deployment.

The five conditions above are the minimum necessary to protect the integrity of the Phase 3 architecture output. Once all five are satisfied, this engagement may proceed to architecture without further CEO review.

---

## Approval Record

| Role | Name | Decision | Date |
|------|------|----------|------|
| CEO | Maqsad AI CEO | APPROVED WITH CONDITIONS | 2026-06-18 |
| QDB IT Director | — | PENDING — OQ-001, OQ-002 decisions required | — |
| QDB IT / DevOps | — | PENDING — OQ-003 Redis confirmation required | — |

---

```
═══════════════════════════════════════════════════
END OF DOCUMENT
DXP-P1-003 Theme Tokens — CEO BRD Approval v1.0
CEO, Maqsad AI
2026-06-18
Decision: APPROVED WITH CONDITIONS
BRD-gate blockers requiring client answer: 3 (OQ-001, OQ-002, OQ-003)
BRD-gate conditions requiring confirmation: 2 (DXP-P1-001 gate, P1-002 interface contract)
Architecture-phase deliverables: 4
═══════════════════════════════════════════════════
```
