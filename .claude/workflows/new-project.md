# Workflow — New Project

A new product, system, or client engagement. The full seven-phase pipeline.
Nothing here is optional.

**Entry gate:** none — this is the entry point.
**Output:** `projects/<name>/`

---

## Phases

| # | Agent | Deliverable | Gate |
|---|---|---|---|
| 1 | `ceo` | Business objective, success KPIs, strategic risks | — |
| 2 | `ba` | BRD, 17 sections, traceability matrix | **CEO approval — hard stop** |
| — | `github-researcher` | `dependencies.md` — adopt over build, 1000+ stars | — |
| 3 | `architect` | Architecture, system boundaries, ADRs | **CEO approval — hard stop** |
| 4 | specialists | Implementation, in parallel by service line | `code-reviewer` after each |
| 5 | `qa` | Test strategy, cases, E2E, performance benchmarks | — |
| 6 | `auditor` + `security-engineer` | Governance, compliance, residency; appsec | — |
| 7 | `ceo` | Approve / reject / approve-with-conditions | **hard stop** |

Phase 4 agents are selected by service line — see the mapping table in
`.claude/agents/orchestrator.md`. `ui-ux-designer` joins Phase 4 whenever the
work has a user interface, and produces its output before the frontend agent
begins.

## Before Phase 3

The architect states data residency, tenant type, and PDPPL applicability
explicitly. On QDB engagements these have blocked go-live four times when
raised late. They are architecture inputs, not audit findings.

## Standing rules

- Every agent reads its experience file and `company-knowledge.json` first.
- Every task carries a `VERIFICATION` block.
- Live-org schema provisioning is gated on an explicit user go-ahead each time.
- `projects/state.yml` is updated after every phase, with `ceo_approved_phases`.
- Build on a feature branch, never on `main`.

## Completion

The CEO decision is recorded in `phase-7-ceo.md`. Any APPROVED WITH CONDITIONS
carries uniquely numbered blockers, each with an owner and the milestone it
gates, mirrored into `projects/state.yml`.
