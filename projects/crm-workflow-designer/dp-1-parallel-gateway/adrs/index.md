# DP-1 — Architecture Decision Records

| ADR | Title | Status | Resolves |
|---|---|---|---|
| [ADR-1-001](ADR-1-001-step-level-control-flow-semantics.md) | Control-flow semantics live on the step, as option sets | Accepted | BRD §16 modelling choice |
| [ADR-1-002](ADR-1-002-parallel-region-analysis.md) | Parallel region analysis: strict, acyclic, graphlib-backed | Accepted | OQ-3, OQ-4, OQ-7 |
| [ADR-1-003](ADR-1-003-publish-block-as-validation-violation.md) | The publish block is a validation violation, not a new gate | Accepted | OQ-2, CEO condition C-1 |
| [ADR-1-004](ADR-1-004-simulation-collapses-parallel-regions.md) | Simulation collapses a parallel region into one concurrent path node | Accepted | OQ-5 |

OQ-1 (execution-layer behaviour) is **not** resolved by an ADR — it is a platform-team
question, contained by ADR-1-003's publish block and carried as a release condition for
the follow-on engagement that lifts the block.

OQ-6 (SOP templates) was answered *no* at the CEO gate; deferred to DP-1b.
