# DP-1 — CEO Final Decision (Phase 7)

Engagement: DP-1 — Parallel (AND) Gateway: split and join
Date:       2026-07-26
Inputs:     brd · phase-1-ceo · github-research · phase-3-arch + 4 ADRs ·
            phase-4-build · phase-5-qa · phase-6-audit

---

## Decision

**APPROVED WITH CONDITIONS. Merge to main authorised. Production gated.**

The engagement delivered what the Phase-1 gate scoped, at the size it was scoped, with the
one thing that mattered most — the publish block — implemented as a control that cannot be
bypassed rather than a control that looks like one.

---

## What was delivered against what was approved

| Phase-1 scope lock | Delivered |
|---|---|
| AND only, no inclusive/OR | Yes. 100000002 left unallocated and uncreated in both sets |
| Process steps only, SOP → DP-1b | Yes. `qdb_sopstep` untouched |
| Design-time only | Yes. Nothing executes; the columns are a contract for CWFD-005 |
| No C# workstream | Yes. Client-side TypeScript only |
| No migration | Yes. Verified live: existing steps read null → Exclusive/None |
| Step-level option sets | Yes, per ADR-1-001 |

| Condition | Status |
|---|---|
| **C-1** Publish block required, must be untestable-to-bypass | **MET.** Implemented as an error-severity violation, so it inherits the gate `usePublish` runs before any mutation. QA asserts the severity against the real service; the audit confirms no code path around it |
| **C-2** Deadlock validation pure and unit-tested with adversarial cases | **MET.** Pure module, 40 tests, adversarial fixtures for both starvation modes, loops in regions, and nested regions |
| **C-3** Regression evidence, not inspection | **MET.** A valid non-parallel process yields **zero** violations; live check shows the pre-existing process unchanged |
| **C-4** Provisioning on explicit authorisation | **MET.** Authorised, run, verified, and it caught a real bug |
| **C-5** New columns inherit GL-01/GL-02 | **MET** — recorded in the audit; no new governance track |
| **C-6** Notation not colour-alone | **MET.** ⧉ ALL / ⧉ WAIT ALL text badges, `AND` edge labels |

---

## What I want on the record

**The gates did work, and that is the finding.** Every phase after the build found
something the phase before it missed, and none of it was cosmetic:

- **Provisioning** found that `Description` on a picklist bound to a global option set
  makes Dataverse reject the request with an error naming a completely different property.
  No amount of unit testing would have surfaced that.
- **Code review** found the interior computation was quadratic — a stated NFR violation on
  the live-validation path — plus a radio group that was not a group, which *looked*
  correct and would therefore have shipped.
- **Audit** found type assertions the constitution forbids, in precisely the module whose
  correctness C-2 singled out.

Three gates, three real defects, in work that was tsc-clean and fully green at every point.
That is the argument for keeping the pipeline, and I want it cited the next time skipping a
gate is proposed.

**Value delivered, stated honestly.** DP-1 ships a capability that **cannot be published**.
That was my ruling and I stand behind it, but nobody should describe this release as
"parallel gateways are available". What is available is: modelling concurrency truthfully,
validating it, seeing it on the canvas and in exports, simulating it honestly, and a
persisted contract for CWFD-005 to build against. The execution half does not exist.

---

## Production gate — unchanged in kind, widened in scope

Production remains gated on the same three human/org conditions carried since DP-2, now
covering two more columns and two more option sets:

- **GL-01** [CRITICAL] managed-solution packaging — the metadata is unmanaged on the org
- **GL-02** [HIGH] native Dataverse field audit on `qdb_work_item_steps`
- **GL-03** [MED] provisioning-SP scoping — unchanged, same principal
- **GL-04** PDPPL — clears by equivalence

Plus one condition specific to DP-1:

- **GL-05** [HIGH] **OQ-1 must be answered before the publish block is lifted.** The block
  is what makes the OQ-1 unknown safe. Any future engagement that removes it must first
  have, in writing from the QDB platform team, what the CRM execution layer does with a
  step that has several successors. Lifting the block without that answer re-creates the
  exact silent-misexecution risk this design was built to contain.

---

## Accepted deferrals

- **G-2 canvas layout for a real parallel region** — asserted by design, not yet observed.
  Cheapest possible check; do it the first time anyone builds one in the UI.
- **G-1 no component tests** — the project has no jsdom environment. CR-3 was exactly that
  class of bug. Ties to the existing DP-11 follow-up; I am not opening new work for it here.
- **G-3 no CI harness** for Dataverse round-trips — same position as DP-2.
- **GG-1** the publish block is a designer-level control, not a platform guarantee — add
  one line to the go-live checklist so nobody overstates it.
- **DP-1b** SOP-template parallel gateways — not authorised.

---

## Authorisation

**Merge to main: AUTHORISED**, subject to the standing rule that the merge itself is
confirmed with the user.

**Production deployment: BLOCKED** on GL-01/02/03, unchanged from DP-2 and not a DP-1
regression.

**FULL PIPELINE COMPLETE.**
