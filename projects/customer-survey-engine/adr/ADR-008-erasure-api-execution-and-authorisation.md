# ADR-008 — Erasure Custom API: execution model and authorisation

| | |
|---|---|
| Status | Accepted |
| Date | 2026-11-15 |
| Decided by | architect |
| Relates to | FR-CSE-081, FR-CSE-082; NFR-CSE-012, NFR-CSE-013, NFR-CSE-014; BRD Addendum C (D8); ADR-003, ADR-005 |

## Context

BRD Addendum C (D8) requires a per-customer erasure operation
(`qdb_srv_EraseCustomerSurveyData`) for PDPPL DSAR right-to-erasure. It must:
run on both on-prem orgs and cloud from one assembly (NFR-CSE-014); find and
remove or anonymise all of a customer's survey data; return per-table counts and
support a dry run; be callable by QDB Compliance without full System
Administrator rights; stay inside the 2-minute plugin limit at the highest
per-customer volumes (NFR-CSE-012, ~300 invitations / 100 responses / 2,000
suppression logs); and leave an auditable record (NFR-CSE-013).

Three sub-decisions were open:

1. **Deletion mechanism.** A `BulkDeleteRequest` (per `dependencies.md`) is
   asynchronous: it returns a job id, not synchronous per-table counts, cannot
   drive the dry-run contract, and splits the trace record from the work. The
   alternative is synchronous per-row `Delete`/`Update` inside a time budget,
   exactly as the daily `RetentionPass` already does.
2. **Authorisation.** The work is permanently destructive and must not be
   reachable from the portal integration account or any operational role, yet
   requiring full System Administrator to process a DSAR grants excessive
   privilege (OQ-PDR-02, CEO chose Option B).
3. **`Mode` parameter shape.** A picklist-typed Custom API parameter needs a
   bound global option set (new schema); an integer input carrying the two fixed
   option values does not.

## Decision

- **One unbound Custom API `qdb_srv_EraseCustomerSurveyData`**, backed by a thin
  `EraseCustomerSurveyDataPlugin` that delegates to a `CustomerErasureService`
  with injected repository, clock, trace and budget — the same layering as
  `RunDueSurveysPlugin` → `RunDueSurveysService` (clean-code: thin plugin,
  injected dependencies, no static mutable state).
- **Runs as SYSTEM** (`CreateOrganizationService(null)`), gating only the
  invoking user — identical to `qdb_srv_RunDueSurveys` (ADR-005). The caller's
  role therefore grants no table access; all data operations occur under SYSTEM.
- **Synchronous per-row delete/anonymise inside a `RunBudget`**, not
  `BulkDeleteRequest`. The operation is idempotent (a re-run finds nothing left),
  returns synchronous counts, and — when a pathological volume exhausts the
  budget — returns `IsComplete = false` so the DSAR operator re-invokes until a
  run reports complete, mirroring the daily pass.
- **Authorised by a new least-privilege `Survey Data Officer` role**, matched by
  name (`ErasureAccessCheck`, mirroring `SchedulerAccessCheck`), admitting a
  System Administrator or a holder of that role (direct or via team). The role
  holds only `organization` Read — the platform minimum CRM 9.1 may require
  before a plugin runs — and no survey or customer table rights. Dry-run callers
  pass the same check (dry-run is not a bypass).
- **`Mode` as a validated integer input** (100000000 = Delete, 100000001 =
  Anonymise), validated at the plugin boundary; no new option set.
- **Delete mode:** delete invitations (cascade removes their responses and
  answers), delete any residual responses still carrying the customer lookup,
  then delete suppression logs. **Anonymise mode:** anonymise each response
  *first* (which severs its `qdb_survey_invitation_id`, FR-CSE-079) and *then*
  delete the invitations, so the invitation cascade no longer reaches the
  now-unlinked response; suppression logs are deleted (BR-PDR-02/03: they cannot
  be anonymised in place). Counts are captured from the found sets before any
  mutation.

## Consequences

- One code path, one assembly, both customer tables via `CustomerLink`
  (NFR-CSE-014). Passing a contact GUID on an account org matches zero rows and
  returns zero counts with no error (FR-CSE-081 AC5).
- Idempotency is load-bearing: a partial (budget-cut) live erasure is completed
  by re-running, and a repeat DSAR on an already-erased customer is a safe no-op.
- The **anonymise-before-delete ordering is correctness-critical**: reversing it
  would let the invitation cascade destroy the response the operator meant to
  keep (anonymised). It is pinned by a unit test.
- **`IsComplete` is an output beyond the BRD's listed parameters.** It is the
  budget-and-rerun mechanism NFR-CSE-012 explicitly authorises ("like the daily
  pass"); flagged to BA/CEO as a contract note, not a scope expansion.
- **Audit record (NFR-CSE-013):** the plugin emits one trace line (caller, mode,
  dry-run, the four counts, `AreActual`, UTC timestamp) before returning. Plugin
  trace logs are ephemeral and admin-only, which is weak multi-year DSAR
  evidence; a durable append-only `qdb_survey_erasure_log` table is recommended
  as the authoritative register. That table adds schema beyond the literal NFR,
  so it is raised as **OQ-C1** for the CEO rather than assumed here; the service
  is designed to write the trace line unconditionally and the table row behind an
  injected writer that is a no-op until the table exists (PAT-003).
- `BulkDeleteRequest` is rejected for the reasons above and is consistent with
  ADR-003 (keep the plugin self-contained and observable).
