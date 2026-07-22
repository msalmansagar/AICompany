═══════════════════════════════════════════════════
BUSINESS REQUIREMENTS DOCUMENT
═══════════════════════════════════════════════════
Project:        DP-2b — SLA / Escalation on SOP Template Steps
Engagement:     DP-2b (CWFD backlog — follow-on to DP-2)
Parent system:  CRM Workflow Designer (CWFD)
Prepared by:    Maqsad AI — Business Analyst
Date:           2026-07-22
Version:        1.0
Status:         DRAFT — Pending CEO Approval
═══════════════════════════════════════════════════


---

## 1. EXECUTIVE SUMMARY

DP-2 (shipped and merged to main) gave Process Managers the ability to configure
SLA and escalation rules on individual workflow process steps (`qdb_work_item_steps`).
The DP-2 CEO gate explicitly deferred one question: should SLA configuration also live
on the SOP template step (`qdb_sopstep`) and be inherited automatically when a process
is derived from an SOP?

DP-2b is that deferred work. It allows a Process Manager to set SLA/escalation
configuration on each step of an SOP template — once, in the SOP designer. When the
"Create Process from SOP" wizard runs, the SLA config is copied one-for-one onto the
resulting process steps, which DP-2 already supports editing. This eliminates the need
for a maker to re-enter identical SLA rules step by step every time a new process is
derived from the same SOP template.

A key pre-research question was whether process derivation runs in client-side TypeScript
or in a server-side Dynamics C# plugin. Code review of the repository confirms the
answer is unambiguous: both adapters (`DataverseAdapter` and `ODataAdapter`) implement
`createProcessFromSop` by delegating to the client-side `deriveProcessFromSop.ts`
function. The C# Custom API (`qdb_CreateProcessFromSop`) is explicitly documented in
that file as "not registered in Dataverse." No C# plugin workstream is needed.

The expected business outcome is a reduction in per-process SLA configuration effort
to near-zero for any process that is derived from a well-configured SOP template,
and a single authoritative source for SLA policy at the template level.


---

## 2. BUSINESS OBJECTIVES

1. Enable **Process Managers** to configure SLA and escalation rules once on an SOP
   template step so that all processes derived from that SOP inherit the rules without
   requiring per-process manual re-entry.

2. Enable **Process Managers** to review and override inherited SLA configuration on
   individual derived process steps (using DP-2's existing step SLA panel) so that
   per-deployment exceptions remain possible without forking the SOP template.

3. Enable the **QDB Platform Team** to maintain SLA policy at the SOP template level
   as the single source of truth, so that updating the template does not silently
   diverge from already-derived processes (which retain their snapshot values).

4. Enable **Business Analysts** to see SLA configuration on SOP step cards in the SOP
   canvas so that they can audit the template's SLA commitments without querying raw
   Dataverse records.


---

## 3. STAKEHOLDERS

| Stakeholder              | Role                                          | Interest in this project                                                                           |
|--------------------------|-----------------------------------------------|----------------------------------------------------------------------------------------------------|
| Process Manager          | Primary maker — designs SOP templates         | Wants to configure SLA/escalation once on the template so derived processes inherit it             |
| Business Analyst         | Reviews process and SOP documentation         | Needs SLA parameters visible on SOP step cards for audit and review                               |
| QDB Platform Team        | Owns CWFD, the SOPs subsystem, and CWFD-005   | Needs a stable `qdb_sopstep` schema contract; wants SOP as the authoritative SLA policy source     |
| IT System Administrator  | Deploys Dataverse schema changes               | Must provision ~11 new fields on `qdb_sopstep` before any build begins                            |
| CWFD-005 Runtime Team    | Will enforce SLA at runtime (future)           | SLA config on derived process steps is what the runtime reads; SOP-level config feeds that path   |
| Maqsad AI Delivery Team  | Builder                                        | Needs complete, approved requirements before any design or code begins                             |
| Task Owner (CRM user)    | End recipient of process tasks                 | Indirectly affected: inheriting SLA from SOP template ensures consistent deadlines across processes|


---

## 4. SCOPE

### 4.1 In Scope

- Eleven new SLA and escalation fields on `qdb_sopstep` in Dataverse, mirroring the
  eleven fields added to `qdb_work_item_steps` by DP-2. The same four global Dataverse
  option sets provisioned in DP-2 (`qdb_SLADurationUnit`, `qdb_SLABasis`,
  `qdb_EscalationAction`, `qdb_EscalationTargetType`) are reused; no new option sets
  are created.
- Extension of the `SopStep` TypeScript type and the `CreateSopStepRequest` /
  `UpdateSopStepRequest` request types in `SopTypes.ts` to carry all eleven SLA fields.
- Extension of the `ISopAdapter` interface methods `createSopStep`, `updateSopStep`, and
  `getSopSteps` to persist and load SLA fields on SOP steps.
- Extension of both `DataverseAdapter` and `ODataAdapter` SOP step methods to map the
  new SLA fields to and from Dataverse payloads.
- A new "SLA and Escalation" collapsible section in `SopStepPanel.tsx`, presenting
  the same controls and progressive-disclosure pattern already specified by DP-2 for
  `StepPropertiesPanel.tsx`. The two panels must be visually and behaviourally consistent.
- Client-side validation of SLA configuration on SOP steps, applying the same rules
  already implemented for process steps in DP-2 (`slaValidator.ts` or equivalent).
- A one-time inheritance copy in `deriveProcessFromSop.ts`: when a process step is
  created from a SOP step, the SLA field values from the SOP step are written directly
  into the `createStep` call, replacing the current null defaults.
- Read-only SLA summary badge on SOP step node cards in the SOP canvas, analogous to
  the badge introduced on process step cards in DP-2.
- View-mode display of SLA fields in the SOP canvas (read-only; consistent with DP-2
  view-mode behaviour on process steps).
- Round-trip persistence tests: SOP step SLA config saves, reloads, and inheritance
  copies correctly onto derived process steps.
- Backwards compatibility: existing SOP steps with no SLA configuration (all new fields
  null) behave identically to their current state.

### 4.2 Out of Scope

- **Runtime enforcement.** SLA configuration on `qdb_sopstep` is inert at runtime, just
  as it is on `qdb_work_item_steps`. The CWFD-005 execution engine is the runtime
  concern and is explicitly excluded from DP-2b.
- **Live link between SOP template and derived processes.** There is no synchronisation
  mechanism; the copy is a one-time snapshot at derivation time. After derivation,
  updating the SOP template's SLA configuration does not propagate to existing derived
  processes. This is a deliberate design decision (see BR-003).
- **C# plugin development.** Code evidence confirms the C# Custom API
  (`qdb_CreateProcessFromSop`) is not registered in Dataverse and is not in the
  active derivation path. No C# or plugin workstream is in scope for DP-2b
  (see Section 12, Assumption A-2 and Risk OQ-1 for the CEO confirmation required).
- **New global option sets.** DP-2's four global option sets cover all necessary
  SLA/escalation codes. No new option sets are required.
- **Timer, scheduling, breach detection, escalation execution.** These are CWFD-005 scope.
- **Diff or "inherited from SOP" indicator on derived process steps.** Deferred to a
  later engagement if business demand exists.
- **SLA reporting, dashboards, or KPI tracking.** Not in DP-2b.
- **Microsoft Teams or external notification integration.** Not in DP-2b.
- **Any change to the CRM plugin execution layer.**


---

## 5. FUNCTIONAL REQUIREMENTS

### 5.1 Dataverse Schema

**FR-001:** The system shall add the following eleven fields to the `qdb_sopstep` entity
in Dataverse. All fields must be nullable. Proposed logical names, types, and allowed
values mirror the DP-2 fields on `qdb_work_item_steps` exactly.

| # | Logical name                    | Type                           | Allowed values / Details                                         |
|---|---------------------------------|--------------------------------|------------------------------------------------------------------|
| 1 | `qdb_sla_enabled`               | Two Options (boolean)          | Default: false                                                   |
| 2 | `qdb_sla_duration`              | Whole Number                   | Minimum 1 when SLA enabled; null otherwise                       |
| 3 | `qdb_sla_duration_unit`         | Option Set (global: `qdb_SLADurationUnit`) | Hours / CalendarDays / BusinessDays                |
| 4 | `qdb_sla_basis`                 | Option Set (global: `qdb_SLABasis`) | TaskCreated / TaskAssigned / PreviousStepCompleted          |
| 5 | `qdb_sla_warning_pct`           | Whole Number                   | 1–99; null = no warning configured                               |
| 6 | `qdb_escalation_enabled`        | Two Options (boolean)          | Default: false                                                   |
| 7 | `qdb_escalation_action`         | Option Set (global: `qdb_EscalationAction`) | Reassign / Notify / Flag / ReassignAndNotify        |
| 8 | `qdb_escalation_target_type`    | Option Set (global: `qdb_EscalationTargetType`) | SpecificUser / SpecificTeam / ManagerOfAssignee / Role |
| 9 | `qdb_escalation_user`           | Lookup → `systemuser`          | Active when target type = SpecificUser                           |
| 10 | `qdb_escalation_team`          | Lookup → `team`                | Active when target type = SpecificTeam                           |
| 11 | `qdb_escalation_role`          | Lookup → `qdb_role`            | Active when target type = Role                                   |

**FR-002:** The four global option sets provisioned in DP-2 (`qdb_SLADurationUnit`,
`qdb_SLABasis`, `qdb_EscalationAction`, `qdb_EscalationTargetType`) shall be reused
on the new `qdb_sopstep` fields without modification. No new option sets shall be
created. No hardcoded integer literals for option set values may appear in application
code; all values must be referenced via the named constants established in DP-2.

### 5.2 Type Layer

**FR-003:** The `SopStep` interface in `src/types/SopTypes.ts` shall be extended to
include the eleven SLA fields defined in FR-001, all typed as optional/nullable
matching the DP-2 `WorkflowStep` SLA field types exactly.

**FR-004:** The `CreateSopStepRequest` interface in `src/types/SopTypes.ts` shall be
extended to accept the eleven SLA fields so that a create call can persist SLA
configuration at the time the SOP step is first saved.

**FR-005:** The `UpdateSopStepRequest` interface in `src/types/SopTypes.ts` shall be
extended to accept the eleven SLA fields so that SLA configuration can be updated on
an existing SOP step.

### 5.3 Adapter Layer

**FR-006:** The `ISopAdapter` interface method `getSopSteps(sopId)` shall return `SopStep`
objects with all eleven SLA fields populated from Dataverse when present. The OData
`$select` clause in both adapter implementations must include all eleven new field
logical names.

**FR-007:** The `ISopAdapter` interface method `createSopStep(data)` shall persist all
eleven SLA fields to Dataverse when provided in the request. Fields omitted from the
request shall be written as null.

**FR-008:** The `ISopAdapter` interface method `updateSopStep(id, data)` shall persist
SLA field changes to Dataverse. When SLA is disabled in the update payload, all eleven
SLA fields shall be explicitly written as null (clearing any previously persisted values).

### 5.4 SOP Step Panel — SLA Section

**FR-009:** The system shall render a collapsible "SLA and Escalation" section at the
bottom of `SopStepPanel.tsx`. The section shall be collapsed by default. Its visual
structure, field controls, and progressive-disclosure behaviour shall be identical to
the `SlaEscalationSection` on `StepPropertiesPanel.tsx` introduced in DP-2.

**FR-010:** The system shall render an SLA enabled toggle within the section. When
toggled off, all SLA sub-fields shall be visually hidden and shall not be validated
or persisted (fields written as null on save).

**FR-011:** When SLA is enabled, the system shall render:
  - Duration: a positive integer input labelled "Duration".
  - Unit: a dropdown with options Hours, Calendar Days, Business Days.
  - Basis: a dropdown labelled "SLA clock starts when" with options Task Created,
    Task Assigned, Previous Step Completed.
  - Warning threshold: an optional numeric input (1–99) labelled "Warning at (% of SLA)".

**FR-012:** The system shall render an Escalation enabled toggle, visible only when
SLA is enabled. When Escalation is enabled, the system shall render:
  - Escalation action: a dropdown with options Reassign, Notify, Flag,
    Reassign and Notify.
  - Escalation target type: a dropdown with options Specific User, Specific Team,
    Manager of Assignee, Role.
  - Escalation target lookup: rendered conditionally based on selected target type
    (user lookup / team dropdown / role dropdown / no additional field for Manager of Assignee),
    reusing the same lookup components used in DP-2's `StepPropertiesPanel`.

**FR-013:** The system shall display a read-only SLA summary badge on each SOP step
node card in the SOP canvas when that step has SLA enabled. The badge format shall
match DP-2's process step badge (example: "SLA: 2 Business Days | Escalate: Notify").
Steps without SLA enabled shall display no badge.

### 5.5 Validation

**FR-014:** The system shall apply the same client-side validation rules to SOP step
SLA configuration that DP-2 applies to process step SLA configuration. Specifically:
  - Duration must be a positive whole number when SLA is enabled (FR-014a).
  - A duration unit must be selected when SLA is enabled (FR-014b).
  - An SLA basis must be selected when SLA is enabled (FR-014c).
  - An escalation action must be selected when escalation is enabled (FR-014d).
  - An escalation target must be selected when escalation is enabled and the target
    type requires a named entity (Specific User, Specific Team, Role) (FR-014e).
  - Warning threshold, when present, must be an integer between 1 and 99 inclusive (FR-014f).
The system shall display field-level validation messages adjacent to the offending
field and shall block save until all violations are resolved.

### 5.6 Inheritance at Derivation

**FR-015:** The `deriveProcessFromSop` function in
`src/services/deriveProcessFromSop.ts` shall be updated so that when it calls
`adapter.createStep(...)` for each SOP step, it copies the eleven SLA field values
from the source `SopStep` object into the `createStep` request. When a SOP step has
SLA disabled (or SLA fields are null), the derived process step shall receive null
values for all eleven SLA fields.

**FR-016:** The inheritance copy described in FR-015 shall be a one-time snapshot.
The derived process step's SLA configuration is immediately independently editable
via DP-2's existing step SLA panel, with no link back to the source SOP step.

**FR-017:** The system shall not derive or infer SLA values from any source other than
the explicitly stored fields on the `SopStep` record. No default SLA values shall be
applied during derivation beyond what the SOP step itself stores.

### 5.7 Persistence and Round-Trip

**FR-018:** A SOP step with SLA configuration shall round-trip identically through
save and reload in the SOP designer: the values stored in Dataverse must exactly match
the values displayed when the step panel is reopened.

**FR-019:** Deriving a process from an SOP template that has SLA-configured steps shall
result in derived process steps where a Dataverse query on `qdb_work_item_steps` returns
the same SLA field values as the source `qdb_sopstep` records, confirming the copy was
written correctly.

**FR-020:** Existing SOP steps with all SLA fields null shall load, display, and save
identically to their current behaviour. No regression shall be introduced.


---

## 6. NON-FUNCTIONAL REQUIREMENTS

**NFR-001: Schema reuse**
DP-2's four global option sets must be reused without modification. No new Dataverse
option sets may be created for DP-2b. This ensures a single set of option set codes
spans both `qdb_work_item_steps` and `qdb_sopstep`, and the CWFD-005 runtime references
a single schema vocabulary.

**NFR-002: UI consistency**
The SLA section in `SopStepPanel.tsx` must be visually and behaviourally identical to
the SLA section in `StepPropertiesPanel.tsx` from DP-2. The maker must not notice any
difference between configuring SLA on a process step versus an SOP step. The same
shared components, constants, and validation logic must be reused or extracted.

**NFR-003: No hardcoded values**
No duration value, option set integer, or escalation code may be hardcoded as a magic
number in application code. All such values must be referenced via the named constants
established by DP-2 (consistent with `ASSIGN_TO_CODES` / `WORKFLOW_STATE_CODES` pattern).

**NFR-004: Config-only, inert framing**
SLA configuration on SOP steps is inert at runtime, exactly as DP-2 configuration is
inert on process steps. No UI text, tooltip, or label may imply that SLA rules are
enforced at the SOP template level. Enforcement remains a CWFD-005 runtime concern.

**NFR-005: Backwards compatibility**
Existing SOP steps with no SLA configuration (all eleven new fields null) must load,
display, and save identically to their current behaviour. This is a hard gate; zero
regression is required.

**NFR-006: Validation responsiveness**
Field-level validation messages must appear inline within one render cycle of the user
attempting to save the SOP step panel. Validation must not block the panel from opening
or rendering.

**NFR-007: Persistence correctness**
SOP step SLA configuration must round-trip with zero data loss. This must be verified
by an automated integration test against a live Dataverse environment (org5869857f or
equivalent dev org), consistent with DP-2's NFR-003.

**NFR-008: No new dependencies**
No new npm package may be introduced for the SLA section in `SopStepPanel.tsx`.
All UI controls must reuse the existing React + TypeScript component set. If a new
dependency is needed, an ADR must be approved first.

**NFR-009: Bundle size**
The addition of the SOP step SLA panel must not increase the total deployable web
resource bundle by more than 10 KB (uncompressed), as most implementation is reused
from DP-2 with minimal net-new code.

**NFR-010: Derivation atomicity**
The `deriveProcessFromSop` function must not partially succeed. If any `createStep`
call fails during a derivation (including a step where SLA fields are being copied),
the error behaviour must remain identical to the pre-DP-2b behaviour: the error
propagates to the wizard and the user is informed. No partial state should be silently
persisted.


---

## 7. BUSINESS RULES

**BR-001:** SLA configuration on a SOP step is optional. A SOP template with no
SLA-configured steps is valid. A mixed template where some steps have SLA and others
do not is also valid.

**BR-002:** A SOP step may not have escalation enabled without also having SLA enabled.
This mirrors BR-002 from DP-2 and must be enforced at the SOP step UI and validation
level, as well as treated consistently by the derivation copy.

**BR-003:** The inheritance copy is a one-time snapshot at derivation time. After a
process is derived from a SOP template, that process's step SLA configuration is
independent of the SOP template. Subsequent changes to the SOP template's SLA fields
do not propagate to already-derived processes. This is the intended model to preserve
independent editability of derived processes.

**BR-004:** Duration must be a positive integer greater than zero on a SOP step, for
the same reasons stated in DP-2 BR-003. Fractional durations are not supported in V1.

**BR-005:** Warning threshold on a SOP step must be between 1 and 99 (%) inclusive
when set, for the same reasons stated in DP-2 BR-004.

**BR-006:** When escalation target type on a SOP step is Manager of Assignee, no
additional lookup is stored. This mirrors DP-2 BR-006. The runtime resolves the manager
at execution time using the CRM user hierarchy; the SOP designer cannot pre-validate it.

**BR-007:** SLA fields added to `qdb_sopstep` must use the same four global option sets
as `qdb_work_item_steps`. No entity-local option sets are permitted on `qdb_sopstep`
for these fields.

**BR-008:** The derivation copy must write the SOP step's actual SLA field values into
the process step. It must not apply any transformation, default, or business rule
beyond a direct field-to-field copy. All business rule enforcement remains on the
CWFD-005 runtime side.

**BR-009:** A process step that inherits SLA configuration from a SOP step is
immediately editable. The maker may clear or change the inherited SLA config on the
process step in DP-2's step panel without constraint. There is no lock, watermark,
or warning preventing the override.


---

## 8. USER STORIES

---

**US-01**
As a **Process Manager**, I want to configure SLA and escalation rules on each step of
an SOP template so that all processes I derive from that template inherit the rules
automatically without re-entry.

Priority: Must Have

Acceptance Criteria:
- Given: A SOP step configuration panel is open in the SOP designer
- When: The maker enables the SLA toggle and sets Duration = 3, Unit = Business Days,
  Basis = Task Created, and Escalation = Notify → Manager of Assignee
- Then: The panel accepts all inputs without validation errors
- And: On save and reload, the SOP step displays the correct values in the panel
- And: The Dataverse `qdb_sopstep` record contains all eleven SLA fields with their
  correct values

---

**US-02**
As a **Process Manager**, I want the process I derive from a SOP to inherit the SLA
rules from the template steps automatically so that I do not have to re-enter them.

Priority: Must Have

Acceptance Criteria:
- Given: A SOP template with three steps, two of which have SLA configured
- When: The maker completes the "Create Process from SOP" wizard and the process is saved
- Then: The derived process's steps corresponding to the two SLA-configured SOP steps
  have all eleven SLA field values matching the SOP step values in Dataverse
- And: The derived process step corresponding to the non-SLA-configured SOP step has
  all eleven SLA fields null
- And: The derived process opens in the CWFD process designer with the SLA badge visible
  on the two SLA-configured steps

---

**US-03**
As a **Process Manager**, I want to override the inherited SLA on a derived process
step so that deployment-specific exceptions are possible without forking the SOP template.

Priority: Must Have

Acceptance Criteria:
- Given: A process derived from a SOP, where a step has inherited SLA = 3 Business Days
- When: The maker opens the process step panel in DP-2's process designer and changes
  duration to 5 Business Days and saves
- Then: The process step's `qdb_sla_duration` field is updated to 5 in Dataverse
- And: The SOP template step is not affected (still shows 3 Business Days)
- And: The change is reflected on the process step's canvas badge

---

**US-04**
As a **Business Analyst**, I want to see SLA configuration on SOP step cards in the
SOP canvas so that I can audit the template's SLA commitments without opening each step.

Priority: Should Have

Acceptance Criteria:
- Given: A SOP template is open in the SOP designer
- When: One or more SOP steps have SLA enabled
- Then: Each SLA-enabled step node card displays a summary badge (e.g. "SLA: 3
  Business Days | Escalate: Notify")
- And: Steps without SLA enabled show no badge
- And: No SLA field is editable when the SOP is in view mode or published state

---

**US-05**
As a **Process Manager**, I want the SLA section on the SOP step panel to be collapsed
by default so that makers who do not use SLA are not presented with additional complexity.

Priority: Must Have

Acceptance Criteria:
- Given: The SOP step configuration panel is opened for any step
- When: The panel first renders
- Then: The SLA and Escalation section is collapsed; no SLA fields are visible
- And: A single expand control is present
- And: The panel opens without any increase in load latency compared to before DP-2b

---

**US-06**
As a **QDB Platform Team member**, I want the SLA fields on `qdb_sopstep` to reuse
DP-2's existing global option sets so that the CWFD-005 runtime references a single
vocabulary across both template and process steps.

Priority: Must Have

Acceptance Criteria:
- Given: The IT System Administrator provisions the DP-2b schema
- When: A developer queries Dataverse metadata for `qdb_sopstep`
- Then: All eleven SLA fields are present with the `qdb_` prefix and are nullable
- And: The option set fields on `qdb_sopstep` reference the same global option sets
  (`qdb_SLADurationUnit`, `qdb_SLABasis`, `qdb_EscalationAction`,
  `qdb_EscalationTargetType`) as `qdb_work_item_steps`
- And: No new global option sets have been created


---

## 9. DATA REQUIREMENTS

| Entity                        | New fields added          | Volume impact    | Retention                     | Sensitivity |
|-------------------------------|---------------------------|------------------|-------------------------------|-------------|
| `qdb_sopstep`                 | 11 new fields (see FR-001)| Negligible — same record count, wider rows | Same as parent SOP record | Internal |
| `qdb_work_item_steps`         | No new fields             | No change — DP-2 already added the 11 process-step fields; DP-2b only populates them via derivation | Existing | Internal |
| Global option sets (4 existing from DP-2) | No new option sets; reused as-is | No change | Permanent | Internal |
| `qdb_role`, `systemuser`, `team` | No new fields | No change — used as escalation target lookups on `qdb_sopstep` same as on `qdb_work_item_steps` | Existing | Internal |

Notes:
- No PII is introduced. User GUIDs are stored as lookup references, not copied data.
- The SLA configuration fields on `qdb_sopstep` store intent (option codes and a number),
  not computed timestamps. Audit trail capture relies on standard Dataverse field
  auditing. No additional tables are introduced.
- At derivation time, copying SLA fields from `qdb_sopstep` to `qdb_work_item_steps`
  is a read-then-write pattern within the existing `deriveProcessFromSop` function; no
  new API surface or data flow is introduced.


---

## 10. INTEGRATION DEPENDENCIES

| System                            | Integration type               | Data exchanged                                       | Direction                             |
|-----------------------------------|--------------------------------|------------------------------------------------------|---------------------------------------|
| Dataverse (`qdb_sopstep`)         | Web API PATCH/POST             | New SLA + escalation field values on SOP step saves  | SOP Designer WRITES to CRM            |
| Dataverse (`qdb_sopstep`)         | Web API GET                    | SLA + escalation field values on SOP step load       | SOP Designer READS from CRM           |
| Dataverse (`qdb_work_item_steps`) | Web API POST (via createStep)  | SLA field values copied from SOP step at derivation  | `deriveProcessFromSop` WRITES to CRM  |
| Dataverse (`qdb_role`)            | Web API GET (existing path)    | Role ID + name for SOP step escalation role lookup   | SOP Designer READS from CRM           |
| Dataverse (`systemuser`)          | Web API GET (existing path)    | User ID + name for SOP step escalation user lookup   | SOP Designer READS from CRM           |
| Dataverse (`team`)                | Web API GET (existing path)    | Team ID + name for SOP step escalation team lookup   | SOP Designer READS from CRM           |
| CWFD-005 Runtime Engine (future)  | Indirect — reads Dataverse     | SLA fields on `qdb_work_item_steps` (written at derivation; SOP-level fields are not read by runtime) | Runtime READS what Derivation WRITES |

Note: All new Dataverse calls go through the existing `DataverseAdapter` and `ODataAdapter`
classes. The `ISopAdapter` interface is extended but its contract pattern is unchanged.
No new HTTP integration surface is introduced.


---

## 11. ASSUMPTIONS

**A-1:** DP-2 is merged to main and the four global option sets (`qdb_SLADurationUnit`,
`qdb_SLABasis`, `qdb_EscalationAction`, `qdb_EscalationTargetType`) exist in the
live Dataverse environment (org5869857f). This BRD depends on those option sets being
present; provisioning `qdb_sopstep` fields against them is only possible if they exist.

**A-2:** The authoritative SOP-to-process derivation path is the client-side TypeScript
function `deriveProcessFromSop.ts`. Both `DataverseAdapter` and `ODataAdapter`
implement `createProcessFromSop` by calling `deriveProcessFromSop(this, request)`.
The C# Custom API (`qdb_CreateProcessFromSop`) is confirmed NOT registered in Dataverse
(per the explicit comment in `deriveProcessFromSop.ts`: "Replaces the
qdb_CreateProcessFromSop Custom API (not registered in Dataverse)"). No C# plugin
workstream is required for DP-2b. **The CEO must confirm this assumption with the
technical team before authorising build (see OQ-1).**

**A-3:** The `SlaEscalationSection` React component (or its constituent controls and
constants) introduced in DP-2 for `StepPropertiesPanel.tsx` can be extracted into a
shared component and reused in `SopStepPanel.tsx` without structural refactoring. If
DP-2 did not produce a reusable component, the architect will determine the extraction
approach in Phase 3.

**A-4:** The `SopStep` type and the SOP adapter methods are the only TypeScript
surfaces that need to be extended. The `sopStore.ts` actions (`addStep`, `updateStep`)
operate on the `SopStep` shape and will carry the new SLA fields automatically once
the type is extended, without requiring store action logic changes.

**A-5:** The existing `qdb_role` entity (already in the CWFD solution) is appropriate
for use as an escalation target role on SOP steps, the same as on process steps.

**A-6:** A SOP step can have `executionChannel = 'crm'` or `'manual'` — the SLA
configuration is independent of the execution channel and applies to all channel types.
No channel-specific SLA restrictions exist in V1.

**A-7:** The CWFD-005 runtime engine reads SLA configuration from `qdb_work_item_steps`
(the derived process step), not directly from `qdb_sopstep`. The inheritance copy at
derivation time is therefore the complete handoff; the runtime has no awareness of
whether a given SLA config originated from a SOP template or was manually entered.


---

## 12. CONSTRAINTS

1. **Design-time only.** DP-2b must not introduce any server-side logic, plugin code,
   Power Automate flows, or scheduled jobs. The deliverable is schema + TypeScript only.

2. **No new option sets.** The four global option sets from DP-2 must be reused.
   Creating redundant entity-local option sets is not permitted.

3. **Snapshot inheritance only.** The derivation copy is a one-time field copy at
   derivation time. No synchronisation, subscription, or live-link mechanism between
   `qdb_sopstep` SLA fields and `qdb_work_item_steps` SLA fields may be introduced.

4. **Dataverse naming.** All new fields on `qdb_sopstep` must use the `qdb_` publisher
   prefix. Exact field names are preliminary; the architect will confirm in Phase 3.

5. **No new npm dependencies.** All UI controls must use the existing React + TypeScript
   component set and any shared components extracted from DP-2's implementation.

6. **Backwards compatibility is mandatory.** Existing SOP steps and the existing
   derivation path for SOP steps without SLA must be unaffected.

7. **Budget and timeline.** Not yet specified. To be confirmed by CEO after approval.


---

## 13. RISKS AND OPEN QUESTIONS

| Risk / Question | Impact | Owner | Resolution needed by |
|---|---|---|---|
| **OQ-1 (C# plugin confirmation — CRITICAL):** The BRD assumes the C# Custom API `qdb_CreateProcessFromSop` is not registered and the TS `deriveProcessFromSop.ts` is the sole active derivation path. This is supported by two code sources: the comment in `deriveProcessFromSop.ts` and the adapter implementations. However, the CEO must confirm with the technical team that no server-side plugin executes derivation in any deployment context (production, staging, or test). If a C# plugin is active on any Dataverse org, the inheritance copy logic must ALSO be implemented in C#, materially expanding scope. | HIGH — if C# plugin is active anywhere, scope doubles with a C# workstream | CEO + QDB Platform Team | CEO gate (this document) — must be resolved before Phase 3 begins |
| **OQ-2 (Shared SLA component from DP-2):** DP-2 added the SLA panel to `StepPropertiesPanel.tsx`. For DP-2b, the same controls are needed in `SopStepPanel.tsx`. NFR-002 requires them to be visually identical. If DP-2 did not extract the SLA controls into a shared reusable component, DP-2b must either (a) extract and refactor, widening scope, or (b) duplicate, violating DRY. The architect must assess DP-2's implementation and determine the extraction strategy. | MEDIUM — may add extraction work to Phase 4 scope | Architect (Phase 3) | Phase 3 architecture; does not block CEO gate |
| **OQ-3 (SOP step SLA on published SOPs):** Can a maker edit SLA configuration on a published (`qdb_status = PUBLISHED`) SOP? The existing SOP designer may prevent editing published SOPs entirely. If so, SLA config must be added before the SOP is published — a potential workflow constraint. Should DP-2b add a specific message when a maker tries to open the SLA panel on a published SOP step? | MEDIUM — affects UX and instruction to makers | QDB Platform Team / Process Manager | Before Phase 4 build; does not block CEO gate |
| **OQ-4 (SLA config on SOP steps not carried through the wizard Step 3):** The "Create Process from SOP" wizard (Step 3 — Step Assignments) currently lets makers override assignment per step. Should SLA config also be overridable per step in the wizard (before derivation), or is post-derivation editing via DP-2's panel sufficient? Including SLA override in the wizard increases wizard complexity significantly; post-derivation editing is simpler. Recommendation: post-derivation editing only. | LOW-MEDIUM — affects wizard scope; recommend deferring in-wizard SLA override | Process Manager / QDB Platform Team | Before Phase 3; CEO may lock this |
| **OQ-5 (SLA basis "Previous Step Completed" on SOP steps):** DP-2 included this basis option with a runtime caveat (OQ-7 from DP-2). Carrying it on `qdb_sopstep` is consistent. However, if the CWFD-005 team has since confirmed the option is not viable, it may be excluded from the SOP step panel in DP-2b. Recommend keeping it (schema-forward) but surfacing the same runtime caveat tooltip as on process steps. | LOW — schema-level, inherits DP-2 decision | QDB Platform Team / CWFD-005 Team | Before Phase 4 build |
| **OQ-6 (sopStore.ts: does SopStep shape change break existing selectors?):** The `sopStore.ts` uses `Partial<SopStep>` patches via `updateStep(id, patch)` and builds objects from `SopStep` shape across several actions. Extending `SopStep` with eleven optional nullable fields should be safe, but the architect must verify no existing selector, validator (`sopValidator.ts`), or graph builder derives assumptions from the SopStep shape being fixed. | LOW — likely safe given all fields are optional; architect to confirm | Architect (Phase 3) | Phase 3 |


---

## 14. GLOSSARY

| Term | Definition |
|---|---|
| Business Days | Working days excluding weekends and public holidays. The definition is the same as DP-2: stored as intent in Dataverse; interpreted by the CWFD-005 runtime. |
| Config-only | A design-time configuration surface that stores intent in Dataverse without any runtime enforcement. DP-2 and DP-2b are both config-only engagements. |
| CWFD | CRM Workflow Designer — the React web resource (Dataverse) that is the parent system of DP-2 and DP-2b. |
| CWFD-005 | The separate planned engagement to build the CRM runtime execution engine that will consume the SLA configuration produced by DP-2 (on process steps) and inherited via DP-2b (from SOP templates). |
| Derivation / Derived Process | The process created when a maker runs "Create Process from SOP". Each SOP step becomes a process step; DP-2b causes SLA config to be copied at this moment. |
| DP-2 | The immediately preceding engagement — SLA/Escalation on workflow process steps (`qdb_work_item_steps`). Merged to main; the global option sets and schema pattern DP-2b inherits. |
| DP-2b | This engagement — SLA/Escalation on SOP template steps (`qdb_sopstep`) with one-time inheritance at derivation time onto process steps. |
| `deriveProcessFromSop.ts` | The client-side TypeScript function that creates a workflow process and its steps/outcomes from a source SOP. The authoritative derivation path. Located at `src/services/deriveProcessFromSop.ts`. |
| Inheritance copy | The one-time field-to-field copy of SLA configuration from a `qdb_sopstep` record to the corresponding `qdb_work_item_steps` record, performed by `deriveProcessFromSop.ts` at derivation time. |
| Inert | SLA configuration that is persisted in Dataverse but produces no runtime behaviour because the CWFD-005 engine has not yet been built. All DP-2 and DP-2b configuration is inert until CWFD-005 is active. |
| Process Manager | The maker role that designs SOP templates and workflow processes in CWFD. |
| `qdb_sopstep` | The Dataverse entity for SOP template steps. DP-2b adds eleven SLA fields to this entity. |
| `qdb_work_item_steps` | The Dataverse entity for workflow process step definitions. DP-2 added eleven SLA fields to this entity; DP-2b populates them via the inheritance copy. |
| Snapshot | The inheritance model: SLA config is copied once at derivation; subsequent SOP template changes do not propagate to already-derived processes. |
| SOP | Standard Operating Procedure — a template in CWFD from which workflow processes are derived. |
| `SopStepPanel.tsx` | The React component rendering the SOP step configuration panel. DP-2b adds an SLA section to this component. Analogous to `StepPropertiesPanel.tsx` on the process side. |


---

## 15. REQUIREMENTS TRACEABILITY MATRIX

| User Story | Functional Requirements                            | Business Rules              | Test Case (QA fills)  | Status |
|------------|----------------------------------------------------|-----------------------------|------------------------|--------|
| US-01      | FR-001, FR-003, FR-004, FR-007, FR-009, FR-010, FR-011, FR-012, FR-018 | BR-001, BR-002, BR-004, BR-007 | TC-XXX (pending) | Draft |
| US-02      | FR-015, FR-016, FR-017, FR-019                     | BR-003, BR-008              | TC-XXX (pending)       | Draft  |
| US-03      | FR-016 (post-derivation editability via DP-2)      | BR-009                      | TC-XXX (pending)       | Draft  |
| US-04      | FR-013                                             | BR-001                      | TC-XXX (pending)       | Draft  |
| US-05      | FR-009, FR-010                                     | BR-001                      | TC-XXX (pending)       | Draft  |
| US-06      | FR-001, FR-002, FR-006, FR-007, FR-008, FR-018, FR-019, FR-020 | BR-007 | TC-XXX (pending) | Draft |


---

## 16. RECOMMENDATION TO THE CEO

### Recommended approach: Proceed — client-side TS scope only, no C# workstream

**Recommendation:** Approve DP-2b to proceed as a TypeScript-only engagement, with the
C# plugin path confirmed as inactive.

**Rationale:**

1. **Derivation path is confirmed client-side.** Both adapters delegate `createProcessFromSop`
   to `deriveProcessFromSop.ts`. The C# Custom API is not registered. This is the most
   important finding of the pre-BRD analysis and removes the highest-risk scope question
   before architecture begins.

2. **SLA reuse is maximal.** All four global option sets, the eleven-field schema pattern,
   the validation rules, and the adapter extension method are fully established by DP-2.
   DP-2b is an extension, not a re-invention. The net-new surface is confined to:
   `qdb_sopstep` fields, `SopTypes.ts` type extensions, `SopStepPanel.tsx` SLA section,
   adapter SOP methods, and a few lines in `deriveProcessFromSop.ts`.

3. **High maker value per effort.** Template-level SLA config eliminates repeated data
   entry across every process derived from the same SOP — the most common complaint from
   process managers who use SOP templates as the basis for multiple deployments.

4. **Schema-forward, zero runtime risk.** Like DP-2, DP-2b is config-only. No runtime
   behaviour changes. No plugin registration. The schema extension on `qdb_sopstep` is
   additive and backwards-compatible.

**What the CEO must confirm before authorising Phase 3:**

1. **OQ-1 (C# plugin):** Confirm with the QDB Platform Team that `qdb_CreateProcessFromSop`
   is not registered on any Dataverse environment the customer uses. If it IS registered
   anywhere, the scope must be extended to include a C# plugin change.

2. **OQ-4 (In-wizard SLA override):** Confirm that post-derivation editing via DP-2's
   step panel is sufficient and no SLA override step is needed inside the "Create Process
   from SOP" wizard. Adding in-wizard SLA override would materially expand the wizard
   scope.

**What the CEO IS approving in DP-2b:**
- Eleven new Dataverse fields on `qdb_sopstep`.
- No new global option sets — full reuse of DP-2's four.
- SLA section in `SopStepPanel.tsx` (same behaviour as `StepPropertiesPanel.tsx`).
- Type and adapter extensions for the SOP step SLA fields.
- One-time inheritance copy in `deriveProcessFromSop.ts`.
- Client-side validation and round-trip persistence.

**What the CEO is NOT approving in DP-2b:**
- Any C# plugin changes (pending OQ-1 confirmation).
- Any runtime enforcement behaviour.
- In-wizard SLA override (pending OQ-4 decision).
- Live link or synchronisation between SOP template and derived processes.


---

## 17. APPROVAL

| Role       | Name     | Decision | Date |
|------------|----------|----------|------|
| CEO        | Pending  | PENDING  |      |
| Requestor  | Pending  | PENDING  |      |

═══════════════════════════════════════════════════
END OF DOCUMENT
═══════════════════════════════════════════════════

BRD is complete. Submitting to CEO for approval before any design or code begins.
