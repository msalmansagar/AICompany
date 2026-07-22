# DP-2b — CEO Final Decision (Phase 7)
# SLA / Escalation Configuration on SOP Template Steps

| Field | Value |
|---|---|
| Engagement | DP-2b — SLA / Escalation on SOP template steps (`qdb_sopstep`) |
| Decision | **APPROVED WITH CONDITIONS** |
| Date | 2026-07-22 |
| Branch | `feat/cwfd-dp2b-sla-sop` — authorized to merge to `main` |
| Predecessor | DP-2 (phase-7: Approved With Conditions, PR #42 merged) |

---

## Decision

DP-2b is approved. The code is authorized to merge to `main` via PR.

**Production go-live** is gated on the three conditions below. They are not new gates — they are DP-2's existing GA-1, GA-2, and GA-4 conditions with scope widened to cover `qdb_sopstep`. The conditions gate deployment of schema to production as a managed solution, not the merge of the code itself.

---

## Business Rationale

### Why approve

DP-2b is the logical completion of the DP-2 investment. DP-2 gave Process Managers the ability to configure SLA and escalation rules on individual workflow process steps. DP-2b lets them configure those same rules once on the SOP template and have them copied automatically onto every derived process step at derivation time.

The business impact is concrete: any organization that derives multiple processes from the same SOP template (the dominant usage pattern for the CWFD process wizard) eliminates repeated SLA data entry entirely. Without DP-2b, a Process Manager with a 10-step SOP template used for 20 different processes would need to manually re-enter SLA configuration 200 times. With DP-2b, that work reduces to the 10 steps on the SOP template — done once.

The strategic fit with the CWFD-005 runtime roadmap is equally clear. The runtime enforcement engine reads SLA configuration from `qdb_work_item_steps` (derived process steps). If DP-2b is not shipped before CWFD-005 enforcement lands, all existing derived processes will have null SLA at derivation time, meaning the runtime will have nothing to enforce and makers will be forced into manual per-process backfill under deadline pressure. DP-2b cleans up the inheritance path now, at low cost, so CWFD-005 can enforce against a populated schema from day one.

### Risk assessment

The risk profile of DP-2b is as low as this team produces. It is config-only and inert at runtime (no enforcement until CWFD-005 ships). The architecture reuses all four global option sets from DP-2 with no modifications. The `slaStepFields.ts` shared module — including `buildSlaBody`, `mapSlaFields`, `buildEscalationBindPatches`, and the new `copySlaFields` — is unit-tested and clean. The code review passed without required changes and commended the `sla-schema-lib.js` DRY extraction and the `SlaFields` ISP generalization. The audit found zero code-fix items.

The net-new surface added by DP-2b is narrow: 11 fields and 3 relationships on `qdb_sopstep`, the `copySlaFields` snapshot function, adapter extensions on three SOP step methods in both adapters, a collapsible SLA section in `SopStepPanel.tsx`, and the VS-07 SOP publish gate. All of it follows established DP-2 patterns.

---

## Phase 1 Conditions — Verified Honored

The conditions I set at the Phase 1 gate were:

**Condition 1: Config-only / inert-at-runtime framing (reuse DP-2's UI notice).**
HONORED. The Audit (Pass 3) confirmed the `SopStepPanel` SLA section renders the same "Configuration only — enforcement requires CWFD-005" notice as the process-step panel. No UI copy implies runtime enforcement at the SOP template level.

**Condition 2: Reuse DP-2 assets — the shared `slaStepFields.ts` module and the 4 existing global option sets. Do not create new option sets. Add only ~11 fields on `qdb_sopstep`.**
HONORED. The Audit (Pass 6) confirmed all four global option sets are referenced by MetadataId (no new local copies). The `sla-schema-lib.js` shared library eliminated the duplication the original DP-2 `add-sla-fields.js` would have required. The code review commended this DRY extraction. Exactly 11 fields and 3 lookup relationships were added to `qdb_sopstep`.

**Condition 3: No hardcoded option codes — reuse `scripts/sla-option-codes.js`.**
HONORED. The Audit (Pass 6) confirmed all option-set integer codes in application source and provisioning scripts reference `sla-option-codes.js`. The `slaOptionCodes.test.ts` cross-check (4 assertions) guards CI against drift.

All three Phase 1 conditions are confirmed honored.

---

## Go-Live Conditions — Must Close Before Production Deployment

The following conditions must be satisfied before this schema reaches any production Dataverse environment. They gate production deployment, not the code merge. They are identical to DP-2's GA-1, GA-2, and GA-4, with scope widened to include `qdb_sopstep`.

**GL-01 [CRITICAL] — Managed solution packaging (= DP-2 GA-1, widened)**
The CWFD managed solution package must include the `qdb_sopstep` entity definition with all 11 SLA fields and the 3 OTM relationships (`qdb_systemuser_qdb_sopstep_escalation_user`, `qdb_team_qdb_sopstep_escalation_team`, `qdb_role_qdb_sopstep_escalation_role`). These are currently unmanaged on org5869857f. A future managed CWFD solution import that includes the `qdb_sopstep` entity without these fields would orphan all existing SOP-step SLA configuration. No separate solution for DP-2b — add to the existing GA-1 work item.

**GL-02 [HIGH] — Native Dataverse field auditing on `qdb_sopstep` SLA fields (= DP-2 GA-2, widened)**
The same `IsAuditEnabled=true` configuration that GA-2 requires for `qdb_work_item_steps` SLA fields must also be applied to the 11 new `qdb_sopstep` SLA fields. Until this is enabled, changes to SLA configuration on SOP template steps cannot be reconstructed from any audit log. Best codified as part of the GL-01 managed solution. No separate track needed — add to GA-2 work item.

**GL-03 [MEDIUM] — Provisioning SP scoping (= DP-2 GA-4, unchanged)**
The provisioning service principal used to run `add-sla-sopstep-fields.js` is the same SP used for DP-2's `add-sla-fields.js`. Confirm its Dataverse security role is System Customizer (not System Administrator). Document this in the CWFD DevOps runbook. Revoke schema-write access or deactivate the SP application registration after provisioning is complete. No additional SP work beyond confirming this applies to both scripts.

**GL-04 — PDPPL / AUTH-C-2/C-6 (DP-2 sign-off extends by equivalence)**
The QDB IT Director sign-off obtained for DP-2 covers DP-2b by extension. The Audit confirmed equivalence: DP-2b stores only reference GUIDs (escalation user/team/role) and option-set codes in `qdb_sopstep` — all within-tenant, no PII, no cross-border transfer. No separate PDPPL sign-off track is required unless `qdb_sopstep` is deployed to a jurisdiction different from `qdb_work_item_steps`.

---

## Runtime Inertness — Explicit Statement

All SLA configuration produced by DP-2 (on `qdb_work_item_steps`) and DP-2b (on `qdb_sopstep`, copied to `qdb_work_item_steps` at derivation time) is inert at runtime. No deadline counting, breach detection, escalation execution, or notification occurs until the CWFD-005 runtime enforcement engine is built and deployed. This is the intended model and is reflected in the UI copy. Enabling CWFD-005 does not require any code change to DP-2 or DP-2b — the schema is ready.

---

## Merge Cleared; Production Gated

| Action | Status |
|---|---|
| Merge `feat/cwfd-dp2b-sla-sop` → `main` via PR | **AUTHORIZED** |
| Deploy schema to development / staging org | AUTHORIZED (no managed solution required for non-production) |
| Deploy schema to production Dataverse org | GATED on GL-01 + GL-02 + GL-03 + GL-04 |

---

## Accepted Deferrals (Tracked, Not Blocking)

The following items are accepted as deliberate deferrals. They do not block this phase gate. They must be entered into the engagement backlog.

| Item | Rationale | Track |
|---|---|---|
| C-3 / GG-4: Canvas SLA badge on SOP step nodes (FR-013, US-04 "Should Have") | SLA is inert until CWFD-005. Makers can open the step panel to see SLA config. The canvas badge is a discoverability nicety, not a correctness gap. Estimated ~3h isolated change. | Next SOP canvas engagement |
| GG-5: `SlaStepFields` type alias vs `SlaFields` interface redundancy | Structural types are identical and compatible. Future cleanup: update return types and remove the alias. Non-breaking. | Future sprint / Boy Scout pass |
| OQ-4: In-wizard SLA override | Post-derivation editing via DP-2's step panel is sufficient for V1. The wizard stays as-is. | Evaluate at CWFD-005 planning |
| G-4: `useSopSave` unit test coverage | Thin wiring layer; covered by live E2E. Low regression risk. | Next SOP hook test sprint |
| G-5: `SopStepPanel` component test | Panel has no `.test.tsx` file. Low priority given live E2E coverage. | When component test infra is set up |

---

## Next Steps

1. **Open PR**: `feat/cwfd-dp2b-sla-sop` → `main`. Reference DP-2 PR #42 for reviewer context. Tag QDB Platform Team for the OQ-1 C# plugin confirmation as a PR comment (not a code gate).
2. **Update GA-1 work item**: Add the 11 `qdb_sopstep` SLA fields and 3 relationships to the managed solution packaging scope.
3. **Update GA-2 work item**: Add `qdb_sopstep` SLA fields to the native field auditing enablement scope.
4. **Confirm GA-4 / GL-03**: Document that the existing provisioning SP covers both scripts and verify the System Customizer role assignment.
5. **Backlog**: Register C-3 (canvas badge) and GG-5 (type alias cleanup) as tracked items for the next SOP canvas engagement.

---

## Status: Engagement COMPLETE. Merge authorized. Production go-live gated on GL-01 / GL-02 / GL-03 (same three conditions as DP-2, widened in scope).
