# ADR-DCP-12 — MIS determines financial cure; DCP owns the Collection lifecycle transition

**Status:** Accepted (Phase 2 gate decision, 2026-09-18) · **Date:** 2026-09-18 · **Deciders:** user (gate), architect
**Closes:** KI-46. **Amends:** the case status matrix behind ADR-DCP-01 and ADR-DCP-05.

## Context

The approved case status matrix allowed `Settled` only from PTP Active, Restructured, Under Legal Action
and Deceased/Insurance Review. Those four are the states in which *DCP itself* had been the reason the
debt was resolved.

But DCP is not the system that decides a debt is paid. MIS is. A customer can clear their arrears while
their case sits in **Assigned**, **In Progress**, **Pending Customer Response**, **Escalated to
Supervisor**, **Restructure Review**, **Pending Legal Review** or **Referred to Legal** — none of which
could reach `Settled`. The background synchronisation would then observe a cure it had no way to record:
the case stayed open, the officer kept working an account with nothing owing, and the arrears figure on
the case contradicted MIS.

Two workarounds were rejected before this decision:

- **Route the cure through an intermediate state** (for example `In Progress` → `PTP Active` → `Settled`).
  That invents a promise-to-pay nobody made, and writes a false history.
- **Let the sync service write `statuscode` directly, bypassing the validator.** That removes the
  guarantee the matrix exists to give, for every transition, in order to fix one.

## Decision

**MIS determines financial cure. DCP manages the resulting Collection lifecycle transition.**

1. `Settled` becomes a **universal transition target** from every non-terminal case state, joining
   `Deceased/Insurance Review`, which was made universal by the same reasoning on 2026-09-16: an
   externally-determined fact about the customer can arrive at any point in the lifecycle, and the
   lifecycle must be able to represent it.
2. The matrix is otherwise unchanged. This is **not** permission for arbitrary transitions — every other
   edge still has to be declared, and `StatusTransitionValidator` still refuses everything undeclared.
   A case may not, for example, go `New` → `In Progress`: assignment cannot be skipped.
3. `Settled` is not `Closed`. Closure remains a separate, configured step. Synchronisation records the
   cure — status, `qdb_curedate`, `qdb_resolutiontype = Cured` — and stops there.
4. The rule lives in **one** place, `StatusTransitionMatrix.cs`, with the TypeScript mirror
   (`packages/domain/src/caseLifecycle.ts`) parity-tested against it, so the plugin and the Integration
   Service cannot drift.

## Consequences

**Positive.** A cure observed by MIS is representable from any working state without inventing history.
The case's arrears can no longer disagree with MIS indefinitely. The matrix keeps its meaning: one
universal-target concept, applied twice, for the two facts the outside world can assert at any moment —
the customer died; the debt was paid.

**Negative.** Two of the matrix's states are now reachable from almost everywhere, so "can this
transition happen?" is a slightly weaker statement than before. This is mitigated by the rule being
declared once and tested: `caseLifecycle.test.ts` asserts the universal-target set explicitly, so adding
a third requires changing a test that says what it is for.

**Neutral.** The Phase 1 smoke's transition assertion had to change — it used `New → Settled` as its
example of a refused transition. It now uses `New → In Progress`, and the Settled path is proved live by
the Phase 2 smoke, which records a cure and reads back `statuscode = Settled` with
`resolutiontype = Cured`.

## Evidence

| Proof | Where |
|---|---|
| Matrix amendment, C# source of truth | `crm/plugins/Qdb.DebtCollection.Plugins/Domain/StatusTransitionMatrix.cs` |
| TypeScript mirror + parity test | `packages/domain/src/caseLifecycle.ts`, `caseLifecycle.test.ts` |
| Live cure from a working state | Phase 2 smoke — "Cure recorded from a working state: Settled, cure date, resolution Cured" |
| Live refusal that still holds | Phase 1 smoke — "Case New → In Progress refused, assignment cannot be skipped" |
