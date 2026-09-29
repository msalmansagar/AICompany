# CEO ship decision — Rule Engine 1.1.0 (EDP-RE-ENH-001 Release 1) → cloud sandbox

**Decision date:** 2026-09-29 · **Function:** CEO ship decision, entry gate of `.claude/workflows/release.md` (A7 §4 step 4)
**Target:** org5869857f (cloud **sandbox**, non-production) · solution **BusinessRuleEngine** · prefix `qdb_edp_`
**Release SHA:** PR #169 head `fe4df34c` (reviewed); main `a4c04fd2` unchanged. Merge remains a separate human gate.

---

## Decision

**APPROVED WITH CONDITIONS — deployment steps only (Order Y R3–R4 and the read-only smoke/regression).**
**HARD STOP before TC-1.** RuleKey backfill (R6), uniqueness key (R8) and the SUPPORTED declaration (R10) are **NOT authorised** in this run.

## Justification

This is a release into a sandbox, not production; PDPPL and data-residency gates do not apply. The release-gate checks are met:

- **Blockers (step 1):** `state.yml` carries no Rule Engine blocker.
- **Environment (step 2):** named — cloud sandbox org5869857f, solution BusinessRuleEngine.
- **Pre-flight (step 3):** package built clean from the reviewed SHA (`verify-package` PASS: release 1.1.0, record 1.0.0, 9 IPlugin types, **unsigned, no Microsoft.Xrm dll** → no secret, no framework leak); CI 8/8 green; TC-3 replay 600 cases **0 diffs** proves decision parity with the live rules; security gate 0 critical; three code reviews, all findings resolved. The CEO BRD conditions MC-1…MC-5 are evidenced satisfied (Option A typing, `Outcome` discriminator, InputsDigest removed, ContentHash canonical + vectors, baseline recorded).
- **No drift:** 14 rules / 14 versions byte-identical to the TC-3 capture; package record unchanged since 2026-08-19.
- **User go-ahead (step 4):** the sponsor authorised this controlled deployment, in-message, under Order Y with stop conditions.
- **Rollback stated before deploy:** package content backed up; `a7-repoint --rollback` / `--to-legacy`; signed 1.0.23 stays registered; metadata additive; designer content backed up; **no deletes planned**. Every deployment step is additive and reversible.

The A7 invariant holds: RuleKey is **not** exposed as a supported identity in this run; ID and name lookup keep working throughout. Deploying the package while leaving RuleKey unsupported is a coherent, safe intermediate state — so the TC-1 blocker gates only the later steps, not the deployment.

The TC-1 blocker is the reason for the stop, not for rejection: it requires assigning an EDP security role to a non-admin identity — a **security change the sponsor made a stop-and-report condition**. Therefore R6/R8/R10 cannot and must not proceed here.

## Conditions

1. **Sequence is binding.** Follow A7 §4 steps 3→5→6→7→8 then §4a R4 (designer), then cloud smoke + TC-3 regression. Metadata **before** any re-point move (EvaluateDecision writes `ExecutionId`/`ChildResultsJson` unconditionally).
2. **Re-run the dry run immediately before applying;** proceed only on **0 problems, 10 metadata creates, 29 moves**. Any drift, incompatibility, or a re-derived plan differing from the record → STOP and report.
3. **HARD STOP at TC-1 (R5).** Do **not** create a non-admin application user or assign any EDP security role to enable TC-1. Return to the sponsor; that security change is a separate authorisation.
4. **R6/R8/R10 remain BLOCKED** until TC-1 passes as a non-administrator. No RuleKey backfill, no uniqueness key, no SUPPORTED declaration in this run.
5. **Removal of signed 1.0.23 is not authorised** — it stays registered as the rollback path (soak, then separate go-ahead).
6. **Shared sandbox:** other QDB engagements share org5869857f. After the re-point, verify per A7 §5 (wait, re-read, smoke) before declaring done. On any failure, `--rollback`/`--to-legacy` and report.
7. **Verification (release.md step 6–7):** produce a `VERIFICATION` block against the **deployed** org, not local, and append the release record. No merge of #169 is implied by this decision.
