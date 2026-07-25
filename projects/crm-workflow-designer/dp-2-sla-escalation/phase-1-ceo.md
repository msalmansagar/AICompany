# DP-2 — CEO Gate Decision (Phase 1)

| Field | Value |
|---|---|
| Engagement | DP-2 — SLA / Escalation on workflow steps |
| Decision | **APPROVED — proceed (config-only)** |
| Date | 2026-07-21 |
| Gate input | `brd.md` (BA Phase 2 deliverable) |

## Decision

Proceed with DP-2 as a **design-time configuration surface only** (BA recommendation accepted).
CWFD delivers the SLA/escalation configuration UI + Dataverse schema; enforcement
(timers, breach detection, escalation execution) remains with the future **CWFD-005 runtime**.

## Scope locks (CEO)

- **OQ-6 — CWFD-005 runtime is confirmed on the roadmap.** This is the basis for approving
  config-only now: the schema DP-2 defines becomes the contract CWFD-005 builds against.
- **OQ-3 — Process-step scope only.** SLA/escalation config lives on `qdb_work_item_steps`
  only. Configuring it on the SOP template (`qdb_sopstep`) with inheritance is **out of
  scope** for DP-2 and may be a later engagement.

## Delegated to Architecture (Phase 3)

- **OQ-1 — business-calendar source:** architect to store the SLA *unit* (calendar vs
  business days) as configuration intent; actual calendar resolution is a CWFD-005 runtime
  concern. Architect to recommend and flag the runtime dependency.
- **OQ-5 — warning-threshold action:** architect to recommend the minimal v1 model
  (default: store the threshold percentage only; no separate warning action/target in v1).

## Conditions

1. The feature must be **inert at runtime** — no UI claim or behaviour implying SLAs are
   enforced until CWFD-005 activates them.
2. The persisted schema is an explicit **contract for CWFD-005**; document it as such.
3. No hardcoded thresholds/offsets (per constitution) — all maker-configured.

## Next

GitHub research: **N/A** (domain-specific Dataverse schema + React panel on existing
patterns; no adoptable library — any date/business-day library is a CWFD-005 runtime
concern). → Proceed to **Architecture (Phase 3)**.
