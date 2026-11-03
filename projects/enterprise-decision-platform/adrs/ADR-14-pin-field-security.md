# ADR-14: Version-Pin Least-Privilege via Field-Level Security; Justification-Boundary Plugin Deferred

**Status:** **Accepted** by the human sponsor 2026-08-19, closing QA condition C4. The layer-1 justification residual it discloses is unchanged: the pin guard plugin is merged and not deployed.
**Date:** 2026-07-19
**Decided by:** Solution Architect (proposed during Wave-0 production hardening)
**Amends:** ADR-12 (layers 1 and 3). Companion to ADR-09. Verified by C-005 (Phase 6).

---

## Context

Wave-0 go-live preparation audited the live `BusinessRuleEngine` solution (org5869857f)
against ADR-12's five-layer pin-governance design. The audit found that ADR-12 was
**designed but only partially built**:

1. **Layer 1 — the synchronous pre-operation pin plugin was never built or registered.**
   The EDP assembly ships eight plugin types (EvaluateDecision, RuleService, RuleMetadata,
   RuleAnalysis, DecisionIntelligence, GovernanceAction, AppendOnlyGuard, DeleteAudit) —
   none enforce pin-field writes. Justification-on-write is therefore unenforced at the
   platform boundary; only the ADR-09 Resolver door (execution path) checks it.
2. **Layer 3 — no dedicated `Manage Production Pin` privilege exists.** Dataverse does not
   permit creating a standalone named privilege through the Web API; custom privileges are
   table-bound or defined as solution-XML miscellaneous privileges (a build/solution task).
3. **Layer 2 — column-audit flags on `qdb_edp_ispinned`, `qdb_edp_pinjustificationcode`,
   and `qdb_edp_pinjustificationnote` are set, but entity-level auditing on
   `qdb_edp_ruleversion` was OFF**, so no pin change was actually recorded. Same for the
   `environmentvariablevalue.value` column.
4. **Layer 4 — the production designation IS a deployment-controlled Environment Variable**
   (`qdb_edp_IsProductionEnvironment`, Boolean, default `no`), as ADR-12 required.

An operational constraint compounds this: the Web API application user **cannot** toggle
entity `IsAuditEnabled` or attribute `IsSecured` — both return `405 0x80060888
"Operation not supported on EntityMetadata"`. These metadata flags must be set through the
maker portal, the Organization Service SDK, or a solution import.

## Decision

1. **Realize least-privilege (ADR-12 layer 3) as a Field Security Profile, not a custom
   privilege.** A profile `EDP - Manage Production Pin` secures the three pin columns; only
   its members (named pin-manager users plus the runtime service identity) may write them.
   This is the standard, fully provisionable Dataverse control for column-level write
   restriction and supersedes the "custom privilege" language in ADR-12 layer 3.
2. **Reaffirm tamper-evidence (layer 2)** by enabling entity-level auditing on
   `qdb_edp_ruleversion` (activating the already-flagged pin columns) and on
   `environmentvariablevalue` (activating the env-var value column), via the maker portal.
3. **Reaffirm layer 4** — the production designation remains the deployment-controlled
   Environment Variable; its change becomes tamper-evident once entity audit is enabled.
4. **Explicitly DEFER ADR-12 layer 1 (justification-on-write boundary enforcement).**
   Field-level security controls *who* may write the pin fields; it does **not** enforce
   that a valid `PinJustificationCode` + `PinJustificationNote` accompanies a pin. Until the
   pre-operation plugin is built, the justification requirement is enforced **only** at the
   ADR-09 Resolver (execution path) and, optionally, by marking the justification fields
   required on the authoring form (advisory; bypassable via SDK). The justification plugin
   moves to the hardening backlog.
5. **Residual (layer 5), unchanged and broadened.** (a) System Administrators and holders of
   the built-in System Administrator field-security profile retain full access — irreducible.
   (b) Field security also restricts **reads** of the pin columns; the runtime identity is a
   profile member so version resolution is preserved, and a read-path check is mandatory (see
   verification VP-5). If a non-privileged `EvaluateDecision` on a pinned rule fails to
   resolve, a broad read-only profile granting `canread` on the pin fields is added so writes
   stay gated while reads work.

## Consequences

- **Field Security Profile provisioned** (`fieldsecurityprofileid 3dbd141a-af83-f111-ab0f-000d3abd8313`),
  runtime SP added as member. Pin columns must be secured and entity audit enabled via the
  Wave-0 portal runbook; field permissions are then granted by script.
- **Human pin-managers must be added as profile members** — field-security profiles take
  users/teams, not roles; the six EDP security roles cannot be members directly.
- **Honest de-scope — ADR-12 is NOT fully satisfied.** Its strongest claim (no production pin
  without recorded justification, enforced for every write path) is **deferred**. The C-005
  Phase-6 pen-test *will* show that a privileged profile member can set a pin without
  justification via the SDK. This is disclosed here as a **known, tracked residual**, not a
  closed control. It is closed by building the pre-operation justification plugin (recommended;
  small) — after which this ADR is revised to "Accepted, layer 1 restored."
- **Determinism and the runtime are unaffected** — field security is authorization, not
  evaluation.
- Acceptance is gated by `wave-0-pin-governance-verification.md`.

## Alternatives considered

- **Custom privilege + pre-op plugin (ADR-12 as designed).** Faithful and stronger, but
  requires a plugin build plus a solution-XML miscellaneous privilege. **Deferred, not
  rejected** — it is the path to fully restoring layer 1.
- **Business rule / required-field for justification only.** Advisory, SDK-bypassable;
  insufficient on its own.

## Status in the registry

Add to `adrs/index.md`:
`| ADR-14 | Version-Pin Least-Privilege via Field-Level Security; Justification Plugin Deferred (amends ADR-12) | Proposed | 2026-07-19 | Architect |`
