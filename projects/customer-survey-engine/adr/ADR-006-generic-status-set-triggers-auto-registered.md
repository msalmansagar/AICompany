# ADR-006 — Generic status-set triggers with auto-registered steps

| | |
|---|---|
| Status | Accepted |
| Date | 2026-11-09 |
| Decided by | architect; model set in `trigger-decisions.md` |
| Relates to | FR-CSE-001–006, 026–030; NFR-CSE-005; §6 |

## Context

The client originally framed events as named types (submitted, approved,
completed) on fixed record types. The user generalised this: **no table has a
submitted flag; every event is a `statuscode` transition into a configured value
set**, on any configured source table, with an unlimited number of sources added
by configuration without a deployment (FR-CSE-002). CRM only runs a plugin on
tables where a step is registered, and there is no wildcard registration.

## Decision

Implement **one generic async plugin** (`SurveyTriggerPlugin`) driven entirely by
`qdb_survey_source` + `qdb_survey_trigger` config. An event fires on a
**transition** — old status outside the set, new status inside — read from a
pre-image (FR-CSE-027/028). Activating a source (`qdb_srv_ActivateSource`,
SysAdmin only) **auto-registers** its Create + Update(filtered to the status
field, with pre-image) steps; deactivation removes exactly the recorded steps.
Type/status/field names and values are all read from config and the source
table's own option-set metadata (FR-CSE-004), never hardcoded (Article V).

## Consequences

- "Add a source with no code and no deployment" is genuinely true (FR-CSE-002,
  NFR-CSE-005); works across orgs with different status values (FR-CSE-006).
- One plugin to test and maintain, not one per event type.
- **Risk (R6, Skeptic ch. 7):** dynamic step registration needs
  `prvCreateSdkMessageProcessingStep`; if the service account lacks it, activation
  fails — checked at deploy, registration recorded for clean removal. A simpler
  path (ship steps for the three seed sources, dynamic only for extras) is noted
  as a fallback but not chosen, to keep one uniform mechanism.
- Transition correctness depends on the pre-image being registered on the status
  field; a missing pre-image would mis-fire — covered by the activation path.
