# Workflow — Enhancement

Refinement of something that already exists, **within its approved contract**:
UX polish, performance work, refactoring, added test coverage, a configuration
option, a rendering improvement.

**Entry gate:** a change note. No BRD.
**Output:** appended to the parent engagement's documents.

---

## Steps

1. **Change note** — the orchestrator writes three lines before delegating:
   what changes, what must not regress, how it will be verified. This is the
   entire ceremony.
2. **Implement** — the owning specialist, reading its memory first.
3. **Review** — `code-reviewer`, always.
4. **Verify** — `VERIFICATION` block, with live-org evidence if it reaches CRM.
5. **Update** — `projects/state.yml` if the change affects a tracked blocker.

No BA phase. No architecture phase. No CEO gate.

## The boundary

This workflow applies only while the contract is unchanged. Escalate to
`new-feature.md` the moment any of these becomes true:

- a user can observe new behaviour and depend on it
- a new field, endpoint, entity, or permission appears
- an agreed behaviour changes rather than improves
- the change alters what another system integrating with this one receives

Escalation is stated, not silent: name the trigger and re-enter at the BA gate.

## Refactoring

A refactor is an enhancement only when behaviour is provably unchanged. That
proof is the existing test suite passing **before and after**, plus live-org
evidence for anything touching CRM. Without a suite covering the refactored
code, write the characterisation tests first — otherwise there is nothing to
verify against and this is not an enhancement, it is an unverified rewrite.

## Standing rules

- Boy Scout rule applies; opportunistic refactoring beyond the change does not.
- Do not add configuration options with only one current value (YAGNI).
- Every task carries a `VERIFICATION` block.
