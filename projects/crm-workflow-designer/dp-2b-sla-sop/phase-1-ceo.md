# DP-2b — CEO Gate Decision (Phase 1)

| Field | Value |
|---|---|
| Engagement | DP-2b — SLA / Escalation on SOP templates |
| Decision | **APPROVED — proceed (TypeScript-only)** |
| Date | 2026-07-22 |
| Gate input | `brd.md` (BA Phase 2) |

## Decision

Proceed with DP-2b as a **TypeScript-only** engagement: SLA/escalation config on SOP
template steps (`qdb_sopstep`) that is **inherited** (one-time copy) onto process steps when a
process is derived from a SOP. Config-only / inert until CWFD-005, same as DP-2.

## Scope locks (CEO)

- **OQ-1 — TS-only, no C# workstream.** Both adapters' `createProcessFromSop` delegate to the
  client-side `deriveProcessFromSop`; the C# `qdb_CreateProcessFromSop` Custom API is "not
  registered." Carried as a **QDB Platform Team confirmation** (like DP-2's CWFD-005 check): if
  the plugin turns out to be registered on a customer environment, scope must add a C# change.
- **OQ-4 — in-wizard SLA override DEFERRED.** Inheritance + post-derivation editing via DP-2's
  step panel is sufficient for V1. The SOP→process wizard stays as-is.

## Resolved / delegated

- **OQ-2 — RESOLVED.** DP-2's SLA UI is already the standalone `SlaEscalationSection.tsx`
  component (not embedded) — reusable in the SOP step panel. The architect should design the
  small generalization needed (it currently types its input to `WorkflowStep`).
- **OQ-3 — delegated to architecture.** Whether SLA is editable on a *published* SOP (and the
  resulting maker workflow) is a UX decision for Phase 3.

## Conditions

1. Config-only / inert-at-runtime framing (reuse DP-2's UI notice).
2. **Reuse DP-2 assets**: the shared `slaStepFields.ts` module and the 4 existing GLOBAL option
   sets — do NOT create new option sets. Add only ~11 fields on `qdb_sopstep`.
3. No hardcoded option codes — reuse `scripts/sla-option-codes.js` (the DP-2 audit single source).

## Next

GitHub research: **N/A** (reuses DP-2 patterns; nothing to adopt). → **Architecture (Phase 3)**.
