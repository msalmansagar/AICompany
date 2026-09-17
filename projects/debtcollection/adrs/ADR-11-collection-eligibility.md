# ADR-DCP-11 — Collection Eligibility / Grace evaluation between MIS resolution and case creation

**Status:** Proposed (Phase 0, awaiting review) · **Date:** 2026-09-17 · **Deciders:** architect, ceo (pending)
**Drives:** the F2 decision of the F1–F11 review; MP §19–21, §47; CP §20, §38–39.
**Amends:** ADR-DCP-05 (the eligibility stage is inserted before case creation).

## Context

Background MIS synchronisation resolves each delinquency record to a customer and a facility and then, in
the design as it stood, created or updated a Collection Case. That equates *"MIS says this account is
delinquent"* with *"Collections must work this account"* — and the supplied Housing Loan data shows the two
are not the same:

- All 1,670 accounts in the 1-30 bucket carry *First Arrear Date = 30/06/2026*; **769 accounts — 17.6 % of
  the entire book — owe less than one instalment, QAR 83,646 in total (0.04 % of arrears)**. June
  collections in that bucket were 305 % of its arrears: it cures itself.
- A month-end feed would therefore create roughly **1,600 Collection Cases that need no action**, every
  month, burying the ~2,800 accounts that do.

The obvious fix — a rule such as `arrears < 1 instalment ⇒ no case` — is exactly what must **not** be
written into application source. The Housing Loan numbers are sample evidence from one organisation; the
threshold is business policy, it is still unconfirmed, and BFD SME/Corporate may need materially different
criteria. The project also already has a Rule Engine; MP §47 and §102 forbid building another.

## Decision

**A MIS delinquency record does not equal a Collection Case.** A configurable **Collection Eligibility /
Grace evaluation** runs after identity and facility resolution and before any case is created.

```
MIS Delinquency
   → Identity Resolution        (QID primary · Customer Number cross-check → contact/account)
   → Facility Resolution        (qdb_facilitynumber → configured facility entity)
   → ELIGIBILITY / GRACE RULES  (IRuleEngine · configured ruleset)
   → Strategy Evaluation
   → Create Case │ Update Existing Case │ Monitor Without Case │ Exclude
```

1. **Reuse, do not build.** The evaluation is invoked through the existing `IRuleEngine` facade against a
   ruleset named by `qdb_platformconfiguration.qdb_eligibilityrulesetcode`. **No new entity and no new
   engine.** Criteria may include DPD, arrears amount, arrears relative to instalment, product,
   facility/customer status, special handling, an existing case, cure/grace period and any other approved
   Rule Engine criterion.
2. **Outcome set.** The evaluation yields `qdb_eligibility_outcome` ∈
   `EligibleCreateCase` · `ExistingEpisodeUpdate` · `GraceMonitor` · `ExcludedSpecialHandling` ·
   `IdentityException` · `FacilityException`.
3. **The decision is recorded, not just acted on.** `qdb_delinquencysnapshot` carries
   `qdb_eligibilityoutcome`, `qdb_eligibilityreason`, `qdb_eligibilityrulesetcode`,
   `qdb_eligibilityrulesetversion` and `qdb_eligibilityevaluatedon`, so a record that produced **no** case
   still has auditable history — "why was nothing done about this account in July?" is answerable. The
   snapshot's `qdb_collectioncaseid` is therefore **optional**. Which records are persisted is governed by
   `qdb_platformconfiguration.qdb_snapshotpolicy`, so a `GraceMonitor` decision need not write a row per
   account per run.
4. **No threshold in application source.** Not `arrears < 1 instalment`, not `DPD < N`, not a grace-period
   length. Values live in the ruleset; the code knows only the outcome contract.
5. **HL and BFD may differ materially.** Each deployment points at its own ruleset through platform
   configuration; the same build serves both, on either platform.

## Consequences

**Positive.** Case volume reflects collections policy rather than feed volume. The Rule Engine becomes the
single place a business user changes eligibility, with versioning and an audit trail. `GraceMonitor` gives
a real answer to "delinquent but not yet actionable", which the previous binary create/skip had no way to
express. The outcome is traceable per record and per ruleset version.

**Negative.** One more configured artefact that must exist before background sync is useful — a missing or
empty ruleset must fail closed and loud, not silently create or silently skip. The Rule Engine's own
on-prem path (Process Actions rather than Custom API) is compatible by design but not yet runtime-validated
(KI-08), so eligibility inherits that risk. A `GraceMonitor` record with no case makes the snapshot's case
link optional, which the ERD and field dictionary must state explicitly.

**Neutral.** The motivating Housing Loan evidence — 769 sub-instalment accounts, ~1,600 month-end churn
records — is recorded as **sample evidence and an HL default recommendation, not a constant**. The actual
thresholds and the cure/grace period remain `TBD — Requires QDB Confirmation`
(`CurrentStateAssessment.md` §10 item 17).

## Alternatives considered

| Option | Rejected because |
|---|---|
| Create a Collection Case for every MIS delinquency record (the prior design) | ~1,600 no-action cases per month on HL alone; officers lose the ~2,800 that matter; case counts stop meaning anything |
| Hard-code `arrears < 1 instalment` (and/or a DPD floor) in the sync service | The user explicitly forbade it; it is unconfirmed business policy, it differs between HL and BFD, and it would be invisible to the people who own the rule |
| A dedicated eligibility engine or `qdb_eligibilityrule` entity | MP §47/§102 — reuse the Rule Engine; a fourth configuration surface with its own evaluator is duplication |
| Filter at the MIS query instead (ask MIS for actionable accounts only) | Moves QDB collections policy into the MIS contract, loses the record of what was excluded and why, and is unavailable until the MIS contract exists |
| Decide eligibility inside Strategy Evaluation | Conflates "should this be a case at all" with "what treatment does this case get"; a monitored account has no strategy yet, and exclusions would be invisible |
