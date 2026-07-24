# Workflow — New Feature

New capability on an existing project that **changes what the system
promises**: a new entity, endpoint, screen, or user-visible behaviour.

**Entry gate:** BRD, CEO-approved.
**Output:** `projects/<name>/` alongside the existing engagement documents,
suffixed with the feature slug (`brd-<slug>.md`, `phase-3-arch-<slug>.md`).

---

## Phases

| # | Agent | Deliverable | Gate |
|---|---|---|---|
| 1 | `ba` | Feature BRD — scoped to the delta, not a restatement of the project | **CEO approval — hard stop** |
| 2 | `architect` | Architecture delta and ADRs, **only if** the change touches boundaries, schema, or the stack | CEO gate if produced |
| 3 | specialists | Implementation | `code-reviewer` after each |
| 4 | `qa` | Test cases for the delta plus regression over what it touches | — |
| 5 | `auditor` / `security-engineer` | **Only if** the feature touches auth, personal data, external egress, or persistence | — |
| 6 | `ceo` | Final decision | **hard stop** |

Phase 2 and Phase 5 are conditional. The orchestrator states in writing which
were skipped and why. Silent omission is not permitted.

## Scoping the BRD

A feature BRD covers the delta only. It references the parent engagement's
BRD rather than repeating it, and states explicitly:

- what changes in the contract
- what is deliberately out of scope
- which existing behaviour must not regress

## Gates carried forward

Blockers from the parent engagement still apply. A feature cannot ship past
an open blocker on the system it extends — check `projects/state.yml` before
Phase 1 and name any inherited gate in the BRD.

## Standing rules

- Every agent reads its memory first.
- Every task carries a `VERIFICATION` block.
- Feature branch off the current integration branch, not `main`, when the
  parent engagement is itself unmerged.
- Shared types touched? Both `form.types.ts` and `form.ts` — see `GOT-019`.
