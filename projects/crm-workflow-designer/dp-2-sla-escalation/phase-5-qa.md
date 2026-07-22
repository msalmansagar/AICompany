# DP-2 — Phase 5 QA Gate

| Field | Value |
|---|---|
| Engagement | DP-2 — SLA / Escalation configuration |
| Verdict | **CONDITIONAL PASS → conditions resolved / accepted** |
| Date | 2026-07-22 |
| Baseline | 82 vitest tests green, tsc clean, prod build green, live E2E on org5869857f |

## QA verdict

Core delivery sound: dual-adapter drift (R-1) solved via shared `slaStepFields.ts`;
option-set round-trips fully tested; `emptySlaFields()` wired into every step-creation
path; R-2 lookup null-clear verified live; inert-runtime contract enforced in UI copy.
QA raised 5 defects (D-1..D-5) + edge cases. Triage below.

## Fixed in this branch

- **D-1 / EG-5 — validation didn't gate the write.** SLA validation is now integrated
  into `ValidationService` (`INVALID_SLA` code, `checkInvalidSlaConfig`) — consistent with
  `INVALID_ASSIGNMENT`. Invalid SLA steps now show the red canvas error badge and **block
  Publish**; Save Draft still allows drafts (matching every other field). This is the
  FR-satisfying gate.
- **D-2 — `buildEscalationBindPatches` had no tests.** Added 4 unit tests (undefined→{},
  disabled→all-null, active-user→bind+null-others, empty-navprop→skip) — the R-2 regression
  guard. +1 `slaSummaryText` null-duration test (D-5 guard). 82 tests total.

## Accepted / documented follow-ups (not blocking; low severity)

- **D-3 — view-mode SLA badge (AC-7 second half).** Not a quick wire-up: view mode uses a
  **separate data path** (`WorkflowDataService` → `CrmStep` → `ViewStepData`), distinct from
  the edit path. Threading SLA fields through it is a scoped follow-up. Edit-mode badge (where
  SLA is configured) is delivered.
- **D-4 — dev-mode escalation display names null after reload.** Production unaffected
  (Xrm.WebApi auto-includes formatted values); only local ODataAdapter dev mode. Follow-up:
  add the `@FormattedValue` columns / `Prefer` header to ODataAdapter getSteps.
- **D-5 — `slaSummaryText` shows "SLA: ? Business Days" for an incomplete config.** Now
  accompanied by the red `INVALID_SLA` canvas badge (from D-1 fix), so incompleteness is
  clearly signalled. Regression test added.
- **EG-1 — nav-prop calls on create when SLA off.** QA's suggested guard (`if (!slaEnabled)
  return {}`) is **incorrect** — it would break R-2 clearing on *disable*. The calls are
  needed and `resolveNavProp` is session-cached, so overhead is one-time/minimal. No change.
- **EG-2 — `PreviousStepCompleted` external-write overwrite.** No active writer in DP-2
  scope; guard before CWFD-005 ships.
- **NFR-007 — bundle-size delta.** Measured: 1758 KB vs pre-DP-2 ~1745 KB ≈ **+13 KB**,
  within the 20 KB target.
- **§6.2 — automated live-org integration test.** Manual E2E + an API round-trip script
  performed the AC-8 round-trip (all fields + null-clear). A CI-automated version needs a
  live-org integration harness + secrets — deferred.

## Status: ready for Phase 6 (Audit) → CEO-final.
