# BRD APPROVAL — DXP-P1-001: Component Registry

```
═══════════════════════════════════════════════════
BRD APPROVAL RECORD
═══════════════════════════════════════════════════
Project:        DXP-P1-001 — Component Registry
Reviewed by:    CEO, Maqsad AI
BRD Version:    1.0
Review Date:    2026-06-17
═══════════════════════════════════════════════════
```

---

## DECISION: APPROVED WITH CONDITIONS

---

## 1. EXECUTIVE ASSESSMENT

The BRD is structurally sound and demonstrates strong business analysis work.
The problem is clearly stated, the value proposition is well-reasoned, the
downstream dependency chain is explicit, and the scope is disciplined. The
document is one of the most complete BRDs produced by this team.

The approval is conditional on four items — two of which are pre-build blockers
that must be resolved before architecture begins, and two that must be enforced
during build. None of them indicate a gap in the BA's analysis; they are
clarifications and guardrails that protect the integrity of the platform layer
this engagement is creating.

---

## 2. REVIEW AGAINST CRITERIA

### 2.1 Business Clarity

PASS. The problem is stated precisely: the existing widget-registry is
process-local, unversioned, non-queryable, and limited to widgets. The
downstream engagements (P1-002, P1-003, P1-004) each have a concrete,
named reason they depend on the registry. The distinction between durable
identity (definitions) and versioned schema contracts (versions) is well
articulated. The scope of the adapter — additive, not replacing — is the
correct architectural decision for zero disruption.

### 2.2 Completeness

PASS WITH OBSERVATIONS.

Strong areas:
- 72 functional requirements with explicit HTTP status codes, field-level
  immutability rules, and pagination constraints. This level of specificity
  is appropriate for a platform-layer capability.
- 13 NFRs covering performance targets with p95 numbers and record counts.
  These are measurable and verifiable.
- 10 user stories with Given/When/Then acceptance criteria. All 10 are
  traced in the RTM.
- The delete = deactivate pattern (FR-043) with a version-guard is correct
  platform hygiene.
- The fire-and-forget adapter pattern (FR-070) is the right risk mitigation
  for the citizen portal's zero-disruption requirement.

Gap identified — CONDITION 1 (see Section 3):
The BRD does not define an error response schema contract. FR-039 says
"structured error body" on 404, FR-041 says HTTP 409, FR-049 says HTTP 409,
but the shape of the error body is undefined. Downstream consumers (P1-002,
P1-003, P1-004) are described as API consumers. If each engagement interprets
the error body differently, integration bugs are guaranteed. The error response
contract must be defined in this BRD or explicitly delegated to the Architecture
phase with a constraint that it must match the existing portal-shell API error
schema.

Gap identified — CONDITION 2 (see Section 3):
NFR-013 requires bilingual support (EN/AR display names), and FR-067 requires
RTL rendering in Arabic locale. The risks section mentions the question of
whether the existing admin UI form component supports RTL input in an LTR
locale context. This risk is identified but unresolved. The BRD must either
confirm that the existing locale infrastructure covers this case, or explicitly
add a requirement that the architecture phase must validate RTL input support
before the frontend builds the create form. Leaving it as an open risk without
a resolution path is insufficient for a form that collects Arabic text.

### 2.3 Feasibility

PASS. The technology choices are fully consistent with the existing stack. The
provisioning script pattern mirrors the QdbPortalShell provisioning script. The
Fastify plugin approach is the correct extension pattern for the existing API.
The Next.js page follows the existing [locale]/admin/ convention. The adapter
pattern for the widget-registry is achievable without touching the existing
public contract.

The 800ms p95 target for list queries (NFR-001) against up to 500 records via
OData is achievable with correct use of $select, $filter, $top, and indexed
fields, but it will be tight if Dataverse introduces network latency in the
CRM4 region. The architect must validate this target against observed latency
in the org before committing it to the QA acceptance criteria.

The atomic set-latest via $batch (FR-053) is the correct design, but the BRD
correctly identifies in the risks section that OData $batch atomicity semantics
in Dataverse may be best-effort rather than transactional. This is a genuine
risk that the architect must resolve before the backend begins implementation.

### 2.4 Risk Coverage

PASS. The eight identified risks are the right risks. Three deserve elevation
from the risk table to pre-architecture blockers:

1. OData $batch atomicity: if this cannot be confirmed as transactional, the
   set-latest design must change before the backend writes a single line of
   code. The architect must resolve this first.

2. Alternate key in unmanaged solution: if Dataverse does not enforce the
   alternate key at the DB layer in an unmanaged solution, the uniqueness
   guarantee reverts to the API-layer pre-create check only, which is not
   atomic under concurrent creates. The provisioning script design must account
   for this outcome.

3. Seed data timing collision (provisioning script vs. adapter first-run):
   the BRD correctly identifies this but does not resolve it. FR-072 implies
   the provisioning script seeds first, and FR-068/FR-070 implies the adapter
   creates-or-updates. The "create-or-updates" language in FR-068 is the
   correct resolution, but it must be made explicit as a requirement, not
   left as an open question in the risk table. See CONDITION 3.

One risk is missing:
The BRD does not address what happens if a downstream engagement (P1-002,
P1-003, P1-004) begins consuming the API and a component definition GUID
changes — for example, if the provisioning script is re-run against a fresh
org (for staging or UAT) and generates different GUIDs for the same component
slugs. Since GUIDs are Dataverse-managed and not deterministic, each
environment will have different GUIDs for the same logical component. The
qdb_name slug is the stable cross-environment identifier; downstream consumers
must resolve by slug, not by GUID. This must be stated as a design constraint.
See CONDITION 4.

### 2.5 Dependency Chain

PASS. The dependency diagram in Section 2.4 is clear. The constraint C-009
(downstream engagements cannot begin implementation until the schema is
provisioned and API routes are deployed) is explicit. The three downstream
consumer sections (8.3, 8.4, 8.5) each state what they will consume and why
stability of those fields matters.

### 2.6 Scope Discipline

PASS. The out-of-scope list is specific and correctly defers bundle CDN,
runtime rendering, fine-grained RBAC, and cross-solution FK references.
These are the right deferrals for a foundational engagement. Nothing in scope
appears prematurely included.

The scope of the admin UI is appropriate for Phase 1: list, filter, create,
version-view, promote-to-latest. The decision not to build a rich JSON Schema
editor (A-009) is correct for this engagement.

### 2.7 Dataverse Constraints

PASS WITH OBSERVATIONS.

The BRD demonstrates solid Dataverse knowledge:
- Publisher prefix qdb_ enforced throughout (C-002).
- Solution boundary strictly enforced — no modifications to QdbPortalShell
  or QdbDynamicFormEngine (C-003, NFR-008, A-007).
- No FK across solutions — the integration note in Section 8.2 explicitly
  excludes cross-solution entity references.
- Restrict delete on parent while child records exist is the correct
  cascade behaviour.
- OData $batch for atomic operations is correctly used and the risk is
  correctly identified.

The one open Dataverse constraint is the alternate key behaviour in unmanaged
solutions, which is already in the risk table and is addressed as a condition.

### 2.8 Immutability Rules

PASS. The BRD is rigorous on immutability:
- qdb_name: alternate key + immutable after creation (FR-008, FR-042, C-005)
- qdb_version_number: immutable after creation (FR-054, C-005)
- qdb_props_schema: immutable after creation (FR-054, C-005)
- qdb_is_latest: settable only via set-latest endpoint, not via PATCH
  (FR-052, C-006)
- qdb_category: immutable after creation (FR-042)

These are all correct decisions for a platform-layer identity and versioning
system.

---

## 3. CONDITIONS

All four conditions must be addressed before the Architecture phase begins
or during the Architecture phase as specified.

---

### CONDITION 1 — Define the API error response schema (Pre-Architecture)

The BRD specifies HTTP status codes for error cases (400, 401, 403, 404, 409)
but does not define the shape of the error response body. Downstream
engagements P1-002, P1-003, and P1-004 are described as API consumers. An
undefined error contract will produce inconsistent client-side error handling
across those three engagements.

Required action: The BA must add a constraint (or the Architect must define
it as an ADR decision) that the Component Registry error response body follows
the same schema as the existing portal-shell API error responses. If the
portal-shell API does not have a standard error schema, one must be defined
before the backend begins implementation.

Owner: BA (to add constraint) or Architect (to resolve as ADR in Phase 3).
Blocking: Architecture phase must not close without this resolved.

---

### CONDITION 2 — Validate RTL input support before frontend build begins (Pre-Frontend)

FR-067 requires RTL rendering in Arabic locale and FR-059/FR-060 require a
create form that collects qdb_display_name_ar. The risks section identifies
that RTL input in an LTR locale context may not be supported by the existing
form components. This risk has no resolution path in the BRD.

Required action: The Frontend agent must, as the first step of its Phase 4
work, verify that the existing admin form components support RTL text input
when the UI is in EN locale. If they do not, the frontend must include a
targeted fix for Arabic text input fields before the create form is built.
This verification result must be documented in the Phase 4 tech spec.

Owner: Frontend agent (Phase 4).
Blocking: Frontend build must not begin until verified.

---

### CONDITION 3 — Make the adapter's create-or-update behaviour an explicit requirement (Pre-Architecture)

FR-068 says the adapter "creates or updates" a corresponding component_definitions
record when registerWidget() is called. FR-072 says seed data is provisioned
by the provisioning script. These two paths are correct in combination, but the
BRD leaves the resolution of the seed-data timing collision in the risk table
rather than in the requirements.

Required action: The BA must add a requirement (FR-073 or equivalent) that
the adapter's Dataverse write must use the qdb_name alternate key as an upsert
key — if a definition record with the given qdb_name already exists (seeded by
the provisioning script), the adapter must update it rather than create a
duplicate. This is a concrete requirement, not an open risk.

Owner: BA (to add FR-073 before Architecture begins).
Blocking: Architecture phase must not begin until this requirement is added
to the BRD.

---

### CONDITION 4 — Add a cross-environment GUID stability design constraint (Pre-Architecture)

The BRD correctly establishes qdb_name as the stable, immutable slug
identifier. However, it does not address the multi-environment scenario:
development, staging, and production Dataverse orgs will each generate
different GUIDs for the same logical component when the provisioning script
is run. Downstream consumers that store GUIDs directly (rather than resolving
by slug at query time) will break on environment promotion.

Required action: The BA must add a constraint (C-010 or equivalent) that
downstream consumers of the Component Registry API must resolve component
definitions by qdb_name slug, not by Dataverse GUID, when building
cross-environment features. The API must expose qdb_name in all responses
(it already does per FR-037) and the downstream engagement BRDs must
reference this constraint explicitly.

Owner: BA (to add C-010 to BRD and communicate to DXP-P1-002/003/004 BAs).
Blocking: Must be in place before DXP-P1-002 BRD is drafted.

---

## 4. SUMMARY JUDGEMENT

The BRD is approved to proceed to the Architecture phase once Conditions 1 and
3 are addressed by the BA (two requirement additions). Conditions 2 and 4 may
be addressed in parallel with Architecture — they are constraints on downstream
phases, not blockers to the architect beginning design.

The BA should update BRD v1.0 to v1.1 with FR-073 (upsert requirement) and
C-010 (cross-environment GUID constraint), and add a note to the existing error
response FRs delegating error schema definition to Architecture. The BRD does
not require a full re-review by the CEO after these minor additions — the
architect may proceed with Architecture using this approval record as the gate
pass.

---

## 5. APPROVAL RECORD

| Role          | Name                  | Decision                  | Date       |
|---------------|-----------------------|---------------------------|------------|
| CEO           | Maqsad AI CEO         | APPROVED WITH CONDITIONS  | 2026-06-17 |
| Requestor     | QDB Digital Team      | PENDING CLIENT SIGN-OFF   |            |

---

```
═══════════════════════════════════════════════════
END OF APPROVAL RECORD
DXP-P1-001 Component Registry — BRD Approval v1.0
CEO, Maqsad AI
2026-06-17
═══════════════════════════════════════════════════
```
