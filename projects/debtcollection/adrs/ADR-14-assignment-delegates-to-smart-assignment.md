# ADR-DCP-14 — Assignment configuration selects an engine; DCP builds no routing algorithm

**Status:** Accepted (Phase 3) · **Date:** 2026-09-18 · **Deciders:** user (Phase 3 authorisation), architect
**Relates to:** KI-09 (Smart Assignment contract not located).

## Context

Phase 3 was authorised to build the *assignment configuration foundation* and explicitly instructed not
to build "another generic assignment engine". QDB is understood to have a Smart Assignment capability;
no artefact, contract or organisation evidence for it has been found in this repository or under the QDB
project folder (KI-09).

The provisioned `qdb_assignment_method` choice offers `RoundRobin`, `Load`, `Territory`,
`SmartAssignment` and `Manual`. Four of those five name algorithms that would be perhaps thirty lines
each to write. Writing them is the trap: a plausible round-robin, shipped because the real capability
was not to hand, becomes the platform's assignment policy by default, and is then very hard to remove.

## Decision

1. **DCP models assignment configuration; it does not route.** `qdb_assignmentconfiguration` rows carry
   the method, priority, activation, effective dates, SLA hours, segmentation columns and an opaque
   `qdb_smartassignmentref` that DCP passes through unread.
2. **`resolveAssignmentConfiguration` selects the configuration, not the officer.** Active and effective
   only; lowest priority wins; **a priority tie is a `Conflict` error, not a coin toss** — configuration
   that cannot say which rule applies is a configuration defect, and guessing hides it.
3. **`IAssignmentEngine` is the seam.** Routing is performed by whichever engine the configuration
   names, injected per method.
4. **`UnavailableSmartAssignment` is the honest placeholder.** Where the configuration selects
   `SmartAssignment` and no adapter has been supplied, it refuses, cites KI-09, and says what would have
   to be confirmed. It never routes.
5. **Which cases a configuration covers is not decided here.** The segmentation columns
   (`customerType`, `productType`, `region`, `riskLevel`, `legalStatus`) are read by the Rule Engine or
   by Smart Assignment. Evaluating them in this module would be building the engine by instalments.
6. **Queues are named, never referenced by GUID** (Constitution Article V), consistent with Phase 1.

## Consequences

**Positive.** A deployment that selects Smart Assignment gets a clear, actionable failure rather than
silent mis-assignment. When QDB supplies the contract, the change is one adapter class against an
interface that already has tests. Nothing has to be un-built.

**Negative.** Assignment does not function end-to-end in Phase 3, on any method. This is visible and
intended; it is recorded as a remaining TBD rather than papered over.

**Neutral.** The other four methods are modelled but unimplemented for the same reason — if `RoundRobin`
were implemented and `SmartAssignment` were not, deployments would drift onto the one that works.

## Alternatives considered

| Option | Rejected because |
|---|---|
| Implement RoundRobin/Load/Territory now, leave SmartAssignment refusing | The working methods become the de-facto policy; QDB's capability then has to displace an incumbent |
| Assign every case to a default queue until Smart Assignment arrives | A silent default for a business-critical decision — exactly what the Phase 1 principle forbids |
| Omit assignment configuration from Phase 3 entirely | The configuration surface is needed by strategy actions and by the workspace; only the *routing* is blocked |
| Break a priority tie by name or by created-on | Produces a stable answer that is nevertheless arbitrary, and hides a configuration error indefinitely |

## Evidence

| Proof | Where |
|---|---|
| Configuration model, resolution rules, refusal | `packages/domain/src/assignment.ts` |
| Repository and service | `apps/api/src/services/collection/AssignmentService.ts` |
| Live: method read back as a label, `SmartAssignment` refusal citing KI-09 | Phase 3 smoke |
| Tests | `packages/domain/src/assignment.test.ts`, `apps/api/src/__tests__/strategy-and-assignment.test.ts` |
