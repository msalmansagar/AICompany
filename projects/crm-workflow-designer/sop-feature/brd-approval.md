═══════════════════════════════════════════════════════════════════════
CEO BRD REVIEW — CWFD-002 SOP DESIGNER
═══════════════════════════════════════════════════════════════════════
Project:        CRM Visual Workflow Designer — SOP Feature
Document:       brd-approval.md
Reviewed by:    CEO — Maqsad AI
Date:           2026-06-12
BRD Version:    1.0 (brd.md)
Decision:       APPROVED WITH CONDITIONS
═══════════════════════════════════════════════════════════════════════


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 1 — EXECUTIVE ASSESSMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The BRD for CWFD-002 SOP Designer is well-structured and coherent. The
confirmed design decisions are faithfully documented as constraints. The
schema is precise, the Custom Action contract is complete, and the wizard
flow is adequately specified. The backward compatibility guarantee (BAs
can still create processes without SOP) is correctly treated as a
first-class acceptance criterion.

The BRD is approved to proceed to GitHub Research (Step 3) and
Architecture (Step 5), subject to the conditions enumerated below.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 2 — STRENGTHS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. ADDITIVE ARCHITECTURE — Section 5 (Confirmed Design Decisions) is
   the strongest section. Option B (separate SOP entities; no structural
   changes to existing entities beyond one nullable lookup) minimises
   deployment risk to the live system. This is the correct choice.

2. TRANSACTIONAL PLUGIN CONTRACT — FR-SOP-07 is complete and correct.
   The StepAssignment JSON schema, the sopStepGuid → workitemStepGuid
   mapping requirement, and the explicit transaction rollback guarantee
   are all present. This gives the architect clear implementation targets.

3. SECURITY DESIGN — Section 5.4 (permission matrix) and C-SOP-06
   (enforcement at entity level, not UI only) are both correct and
   explicitly called out. This is frequently missed at the BRD stage
   and is appropriately elevated here.

4. BACKWARD COMPATIBILITY — US-SOP-05 and AC-SOP-05a through 05d are
   explicit regression test targets. The nullable `qdb_sop_id` constraint
   is correctly specified.

5. RISK TABLE — R-SOP-01 (plugin timeout) is well-mitigated with the
   50-step cap. R-SOP-03 (security misconfiguration) is correctly
   flagged as Medium probability and High impact.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 3 — CONDITIONS PRECEDENT TO PHASE 5 (ARCHITECTURE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The following conditions must be resolved in the Architecture document
before Phase 6 (Build) is authorised. They are not blockers to the
Architecture phase itself — the architect may proceed while these are
being resolved in parallel.

─────────────────────────────────────────────────────────────────────
COND-SOP-01 — Entity Logical Name Disambiguation (A-SOP-07)
─────────────────────────────────────────────────────────────────────
Priority: CRITICAL

Section 9.2 states `qdb_sop.qdb_recordtype_id` is a lookup to
`qdb_work_item_record_types` (plural). Section 8.1 of the parent BRD
(CWFD-001 brd.md) names the entity `qdb_work_item_record_type`
(singular). These must be the same entity — one character difference is
a deployment-breaking discrepancy.

Required resolution: The architect must confirm the exact logical name
of the record type entity from the live Dataverse org
(org5869857f.crm4.dynamics.com) and ensure it is used consistently
across all BRD, architecture, and code artefacts.

─────────────────────────────────────────────────────────────────────
COND-SOP-02 — ICrmAdapter Extension Impact Analysis
─────────────────────────────────────────────────────────────────────
Priority: HIGH

Section 11.3 lists 16 new methods on ICrmAdapter. The existing adapter
has approximately 20 methods (from CWFD-001 architecture). An 80%
increase in interface surface area requires the architect to confirm:
(a) that both DataverseAdapter and ODataAdapter can be extended without
breaking the existing contract; (b) whether an ISopAdapter sub-interface
should be introduced to avoid forcing ODataAdapter to implement SOP
methods that On-Premise deployments may never use (the SOP feature is
scoped to Online only per the tech stack).

Required resolution: Architecture document must explicitly address
interface segregation for the adapter extension.

─────────────────────────────────────────────────────────────────────
COND-SOP-03 — SOP Canvas State Store Isolation
─────────────────────────────────────────────────────────────────────
Priority: HIGH

NFR-SOP-05c states the wizard state shall be managed in a "dedicated
Zustand slice or local React state" — not mixed into the existing
workflowStore. This is correct intent, but the BRD does not address
the SOP canvas state (not just the wizard). The SOP canvas will need
its own nodes, edges, dirty tracking, undo history, and selection state
that must not contaminate the process workflow store.

Required resolution: Architecture must define the store boundary
between the SOP canvas and the Process canvas. Two options: (a) a
separate sopStore mirroring the workflowStore structure; (b) a shared
generic canvasStore parameterised by domain type. Either is acceptable
with explicit ADR justification.

─────────────────────────────────────────────────────────────────────
COND-SOP-04 — Plugin Transaction Scope Confirmation
─────────────────────────────────────────────────────────────────────
Priority: HIGH

FR-SOP-07j states the plugin runs "within a single CRM transaction."
In Dataverse, Custom Actions registered as synchronous pre-operation
steps participate in the platform transaction automatically. However,
the BRD does not specify whether this is a Message-level Custom Action
(registered on a custom message) or an action bound to a specific entity.
The registration mode determines transaction participation rules.

Required resolution: Architecture must confirm the exact plugin
registration: Custom Action message name, binding (none = global, or
bound to qdb_sop), synchronous vs. asynchronous step, and transaction
participation mode. The target Dataverse version (Online) does support
transactional Custom Actions — this just needs to be made explicit.

─────────────────────────────────────────────────────────────────────
COND-SOP-05 — Bundle Size Impact of SOP Feature
─────────────────────────────────────────────────────────────────────
Priority: MEDIUM

The existing CWFD-001 architecture reports an eager bundle of ~532 KB
gzip against a 4,500 KB CI gate. The SOP feature introduces: two new
canvas screens, a three-step wizard, a roles management grid, and new
store slices. The BRD acknowledges this in C-SOP-05 and NFR-SOP-02a
but does not provide a delta estimate.

Required resolution: Architecture must produce a revised bundle budget
table (as per CWFD-001 Section 13 format) showing estimated delta from
SOP-specific components and confirming the total remains below the
4,500 KB CI gate with at least 200 KB headroom.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 4 — CLARIFICATIONS REQUIRED BEFORE BUILD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

These are not architecture blockers but must be resolved by the BA or
product owner before build (Phase 6) is authorised:

CLR-SOP-01 — SOP Versioning Policy
The BRD scopes SOP versioning to "Draft / Published / Retired" status
only. However, the `qdb_version` field (Text 20) is present on `qdb_sop`
with no management rules defined. Is the version label free-text entered
by Ops Excellence (e.g., "1.0", "2.1-draft")? Or is it system-managed?
If system-managed, what are the increment rules? This must be specified
before the SOP canvas save logic is built.

CLR-SOP-02 — "Derived Processes" Count Display
FR-SOP-01a and US-SOP-06 specify a count of derived processes per SOP
on the list screen. This requires a query against `qdb_workitemprocess`
filtered by `qdb_sop_id`. For a large org with hundreds of SOPs, this
is N+1 queries unless handled with aggregation. The architect must
design the query strategy (batch aggregate query, or lazy-load on row
expand). This should be raised with the client: is a real-time count
required, or is an approximate/cached count acceptable?

CLR-SOP-03 — Role Deletion vs. Deactivation Policy
FR-SOP-05d states "Prevent deletion of a role that is referenced by one
or more qdb_sopstep records." But FR-SOP-05d and the Roles Screen
(Section 10.7) both mention "Delete" and "Deactivate" as separate
actions. The BRD must clarify: are roles ever hard-deleted, or is
deactivation the only permitted operation once a role exists? If
hard-deletion is permitted only for unreferenced roles, the plugin must
enforce this check server-side (not only in the UI).

CLR-SOP-04 — SOP Retire Consequences
Section 5.1 and FR-SOP-02h include a Retired state. The BRD does not
specify what happens to processes derived from a Retired SOP. Are they
still valid? Is the BA notified? Can the BA continue editing the process
after its source SOP is retired? This must be clarified for the wizard
and process canvas to handle correctly.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 5 — MINOR CORRECTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MINOR-01 — Entity Name in Section 9.2
`qdb_sop.qdb_recordtype_id` references `qdb_work_item_record_types`
(plural). This is almost certainly a typo for `qdb_work_item_record_type`
(singular — per CWFD-001 brd.md). Fix before architecture phase.
(Also logged as COND-SOP-01 above.)

MINOR-02 — `qdb_workitemprocess` Entity Name Inconsistency
The BRD uses `qdb_workitemprocess` (Section 9.5) but the CWFD-001 BRD
uses `qdb_work_item_record_type` (with underscores between words). The
team should confirm whether the existing process entity is named
`qdb_workitemprocess` or `qdb_work_item_process` to ensure the modified
entity name in Section 9.5 and the lookup field addition are correct.

MINOR-03 — FR-SOP-07l: "TBD" Threshold
FR-SOP-07l states the maximum step count threshold is "TBD in architecture,
expected maximum 50 steps." The BA assumption table (A-SOP-08) already
caps at 50. These must be reconciled — state 50 as the confirmed maximum
in FR-SOP-07l or explicitly leave the cap to architecture with a concrete
range (e.g., "between 30 and 100 steps").


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 6 — DECISION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STATUS: APPROVED WITH CONDITIONS

The BRD is approved. The engagement may proceed to:
  Step 3 — GitHub Research
  Step 5 — Architecture (concurrent with GitHub Research)

Phase 6 (Build) is gated on:
  - Conditions COND-SOP-01 through COND-SOP-05 resolved in the
    Architecture document
  - Clarifications CLR-SOP-01 through CLR-SOP-04 answered by the
    product owner / BA before Sprint 1 planning

The four clarifications (CLR-SOP-01 to CLR-SOP-04) do not block
architecture but must be resolved before the respective components
are built. Architect to flag them as open items in the ADR log.

─────────────────────────────────────────────────────────────────────
Signed: CEO — Maqsad AI | 2026-06-12
─────────────────────────────────────────────────────────────────────

═══════════════════════════════════════════════════════════════════════
END OF CEO BRD REVIEW — CWFD-002 v1.0
═══════════════════════════════════════════════════════════════════════
