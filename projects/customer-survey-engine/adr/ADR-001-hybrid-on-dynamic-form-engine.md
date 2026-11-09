# ADR-001 — Hybrid on the Dynamic Form Engine

| | |
|---|---|
| Status | Accepted |
| Date | 2026-11-09 |
| Decided by | architect (design); approach set by the user 2026-11-09 (`approach-decision.md`) |
| Relates to | FR-CSE-019, 020, 021, 022, 023, 024, 025, 046; NFR-CSE-003, 004; C-5, C-6 |

## Context

The Customer Survey Engine needs a survey designer, a renderer, bilingual/RTL
content, versioning and a published-JSON cache. The DFE (`dfe-baseline-2026-11-08`)
already provides all of these inside CRM, and its render cache is keyed by
form code + published version + language — exactly the version-pinning a survey
invitation needs (AC16 / FR-CSE-046). The rejected alternative was Option E:
a renamed full copy of the DFE (~40 tables, plugin, Custom APIs, web resources).

## Decision

Reuse the DFE designer, renderer and render cache **unchanged** for survey
content. A form carries a new additive `Form Type = Survey`. Survey
orchestration (sources, setups, triggers, invitations, responses, suppression
log) lives in a **separate, removable** `SurveyEngine` solution. DFE changes are
**additive only** and ship in a DFE release (C-6). SurveyEngine depends on DFE;
DFE has zero dependency on SurveyEngine.

Conditions bound into the design: additive-only switch (FR-CSE-019), separate
survey submit path (FR-CSE-053), `SRV-` form-code prefix (FR-CSE-023), the
content-comparison regression gate (FR-CSE-025), and the inherited Save-defect
fix first (FR-CSE-024). This is Constitution Article XVII/XX reuse-before-rebuild.

## Consequences

- Saves ~15–25 dev-days; one designer for admins; defects fixed once for both.
- Survey data is isolated — removing SurveyEngine never touches form data
  (NFR-CSE-004).
- **Risk:** survey additions ride shared DFE code paths (notably the Save fix),
  so the FR-CSE-025 regression gate and live-org parity (PAT-002, ARC-M-002) are
  mandatory on every DFE deploy, including the Save fix itself.
- SurveyEngine releases are coupled to the DFE release train for core-touching
  changes.
