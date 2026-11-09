# ADR-002 — Publisher prefix and naming

| | |
|---|---|
| Status | Accepted |
| Date | 2026-11-09 |
| Decided by | architect |
| Relates to | FR-CSE-006; deployment §13; reference_publisher_prefix_convention |

## Context

The company-wide rule (`global/PUBLISHER-AND-PREFIX.md`) is one `MSST`
publisher, prefix `msst`, with a product segment on entities/Custom APIs. But
this engagement deploys into the **existing QDB orgs** where the DFE already
lives under the `qdb_` publisher/prefix, alongside Report Engine, EDP and CWFD.
The DCP precedent established that for QDB-owned components the client's `qdb`
rule wins over the house rule. SurveyEngine shares those orgs and reads DFE's
`qdb_` tables (render cache, form definition).

A prefix cannot be changed once components exist — it is a full table+row
migration in every org (reference trap). So this is a permanent decision.

## Decision

Use publisher prefix **`qdb_`** with a **`survey`** product segment on every
entity and Custom API: `qdb_survey_source`, `qdb_survey_setup`,
`qdb_survey_invitation`, …; Custom APIs `qdb_srv_RunDueSurveys`,
`qdb_srv_SubmitResponse`, etc. Columns carry no segment (scoped to their entity).
The segment prevents org-wide name clashes with DFE's `qdb_form_*` tables (which
would otherwise fail silently on the second import).

## Consequences

- Consistent with the QDB estate; no cross-publisher friction reading DFE tables.
- Clear visual separation of survey vs form tables in every org.
- Diverges from the `msst` house rule — acceptable per the DCP/QDB precedent;
  recorded here so it is a decision, not an omission.
- On-prem: the on-prem publisher must also be `qdb_`, or all schema names must be
  recreated (they cannot be renamed — RENDER-CACHE-SCHEMA on-prem note).
