═══════════════════════════════════════════════════
BUSINESS REQUIREMENTS DOCUMENT
═══════════════════════════════════════════════════
Project:        DP-2 — SLA / Escalation on Workflow Steps
Engagement:     DP-2 (CWFD backlog item CWFD-007)
Parent system:  CRM Workflow Designer (CWFD)
Prepared by:    Maqsad AI — Business Analyst
Date:           2026-07-21
Version:        1.0
Status:         DRAFT — Pending CEO Approval
═══════════════════════════════════════════════════


---

## 1. EXECUTIVE SUMMARY

The CRM Workflow Designer (CWFD) already lets makers lay out multi-step business processes
and write that configuration into Dataverse (`qdb_work_item_steps` and related entities).
However, every step is currently time-blind: there is no concept of when a task is due,
no warning when a deadline approaches, and no automatic escalation when a breach occurs.
This is a P1 gap versus every major enterprise BPM platform (Camunda, Nintex, Appian,
ServiceNow) and is the single most common objection from process owners during workflow
sign-off.

DP-2 closes this gap by adding a per-step SLA and escalation configuration surface inside
CWFD. Makers will be able to specify, for each step, a due-date offset (e.g. "2 business
days after task creation"), an optional warning threshold, and an escalation action
(reassign / notify / flag) to a defined target (user, team, or manager of assignee) when
the SLA is breached.

**The central architectural fact governing this engagement:** CWFD has no runtime. It is
a design-time visual modeler that writes configuration into Dataverse. SLA enforcement
(timer firing, breach detection, escalation execution) is a runtime behaviour that requires
an execution engine. That engine does not yet exist; it is the subject of the separate
CWFD-005 engagement. DP-2 therefore delivers only the configuration surface and Dataverse
persistence. The runtime enforcement is explicitly out of scope. Section 4 and section 10
contain the formal recommendation to the CEO on how to proceed given this split.


---

## 2. BUSINESS OBJECTIVES

1. Enable **Process Managers** to define a response-time commitment per workflow step so
   that SLA expectations are encoded in the process definition and visible to all
   stakeholders without requiring a separate spreadsheet or verbal agreement.

2. Enable **Process Managers** to specify an escalation target and action per step so
   that when the future runtime engine detects an SLA breach, it has an unambiguous,
   machine-readable instruction to act on without human intervention.

3. Enable the **QDB Platform Team** to deliver the SLA/escalation configuration schema
   to Dataverse now so that the CWFD-005 runtime engagement can begin implementation
   immediately against a stable, tested contract rather than designing its own schema.

4. Enable **Business Analysts** to review SLA commitments on the visual canvas so that
   SLA parameters are auditable from within the designer without querying raw Dataverse
   records.


---

## 3. STAKEHOLDERS

| Stakeholder              | Role                                       | Interest in this project                                                              |
|--------------------------|--------------------------------------------|---------------------------------------------------------------------------------------|
| Process Manager          | Primary maker — designs process workflows  | Needs a UI to set due-date offsets and escalation rules per step without editing data |
| Business Analyst         | Reviews and documents process logic        | Needs SLA parameters visible on the canvas in read-only / view mode                  |
| Task Owner (CRM user)    | End recipient of tasks created by runtime  | Affected by escalation behaviour when SLA is breached (runtime, not this engagement)  |
| Manager / Escalation Target | Receives reassigned/notified tasks      | Affected by escalation behaviour (runtime); must be selectable as a target in designer|
| QDB Platform Team        | Owns CWFD and the future runtime (CWFD-005)| Needs a stable Dataverse schema contract to build the runtime enforcement against     |
| IT System Administrator  | Deploys Dataverse schema changes           | Must provision new fields on `qdb_work_item_steps` before feature is usable           |
| Maqsad AI Delivery Team  | Builder                                    | Needs complete, approved requirements before any design or code begins                |


---

## 4. SCOPE

### 4.1 In Scope — Design-Time Deliverable (DP-2)

- New SLA configuration fields on `qdb_work_item_steps` (Dataverse schema additions).
  Proposed fields: SLA enabled flag, duration value, duration unit (hours / calendar days /
  business days), SLA basis (task created / task assigned / previous step completed),
  warning threshold percentage, escalation enabled flag, escalation action code
  (option set), escalation target type (user / team / manager of assignee / role),
  escalation user lookup, escalation team lookup, escalation role lookup.
- Designer UI panel per step: an "SLA & Escalation" expandable section within the existing
  step configuration panel, rendering the above fields with appropriate controls
  (toggles, numeric inputs, dropdowns, lookups).
- Conditional field display: escalation target fields rendered only when escalation
  is enabled; escalation target lookup rendered based on selected target type.
- Client-side validation of SLA configuration before save:
  - Duration must be a positive integer when SLA is enabled.
  - Escalation target must be selected when escalation is enabled.
  - Warning threshold must be between 1 and 99 when set.
- Persistence: SLA configuration round-trips correctly through Dataverse
  (create, update, load, and display without data loss).
- Read-only rendering of SLA parameters on the step card on the visual canvas
  (a badge or summary line: e.g. "SLA: 2 business days | Escalate to Manager").
- View-mode rendering (SLA fields visible but not editable).
- The Dataverse field schema is documented in this BRD (section 9) to serve as
  the contract for the CWFD-005 runtime engagement.

### 4.2 Out of Scope / Runtime-Dependent (Not DP-2)

The following behaviours require a runtime execution engine that does not yet exist.
They are explicitly excluded from DP-2 and will be addressed in CWFD-005.

- Timer creation, scheduling, or firing when a task is created or assigned.
- SLA breach detection: comparing current timestamp to the computed due date.
- Warning notification dispatch (e.g. "75% of SLA elapsed" alert).
- Escalation action execution: reassigning tasks, sending notifications, setting flags.
- Business calendar lookup or calculation (what constitutes a "business day" at runtime).
- SLA status display on live tasks in CRM (e.g. a "breach imminent" visual indicator).
- SLA reporting, dashboards, or KPI tracking.
- SLA fields on `qdb_sopstep` (SOP template level) — addressed in OQ-7 below.
- Any changes to the existing CRM plugin execution layer.
- Microsoft Teams or external notification channel integration.


---

## 5. FUNCTIONAL REQUIREMENTS

### 5.1 Dataverse Schema

**FR-001:** The system shall add the following fields to the `qdb_work_item_steps` entity
in Dataverse before any designer UI is built. All fields must be nullable (SLA
configuration is optional per step).

| Proposed logical name          | Type          | Description                                              |
|--------------------------------|---------------|----------------------------------------------------------|
| `qdb_sla_enabled`              | Boolean       | Whether SLA tracking is active for this step             |
| `qdb_sla_duration`             | Integer       | Numeric duration value (e.g. 2)                          |
| `qdb_sla_duration_unit`        | Option Set    | Hours / CalendarDays / BusinessDays                      |
| `qdb_sla_basis`                | Option Set    | TaskCreated / TaskAssigned / PreviousStepCompleted       |
| `qdb_sla_warning_pct`          | Integer       | 1–99; percentage of duration at which warning fires      |
| `qdb_escalation_enabled`       | Boolean       | Whether escalation is active for this step               |
| `qdb_escalation_action`        | Option Set    | Reassign / Notify / Flag / ReassignAndNotify             |
| `qdb_escalation_target_type`   | Option Set    | SpecificUser / SpecificTeam / ManagerOfAssignee / Role   |
| `qdb_escalation_user_id`       | Lookup (systemuser) | Target user when target type = SpecificUser         |
| `qdb_escalation_team_id`       | Lookup (team)       | Target team when target type = SpecificTeam         |
| `qdb_escalation_role_id`       | Lookup (qdb_role)   | Target role when target type = Role                 |

**FR-002:** All option set values introduced by FR-001 must use the `qdb_` publisher
prefix. No hardcoded integer literals for option set values may appear in application code;
all values must be referenced via named constants (per Maqsad AI constitution).

### 5.2 Designer UI — SLA Section

**FR-003:** The system shall render an "SLA & Escalation" section within the step
configuration panel when any step is opened for editing. The section shall be collapsed
by default and expandable on demand.

**FR-004:** The system shall render an SLA enabled toggle. When toggled off, all SLA
sub-fields shall be visually hidden and their values shall not be validated or persisted
(fields left null/cleared on save).

**FR-005:** When SLA is enabled, the system shall render the following controls:
  - Duration: a positive integer input labelled "Duration".
  - Unit: a dropdown with options Hours, Calendar Days, Business Days.
  - Basis: a dropdown labelled "SLA clock starts when" with options
    Task Created, Task Assigned, Previous Step Completed.
  - Warning threshold: a numeric input (1–99) labelled "Warning at (% of SLA)" with a
    note that this field is optional; when left blank no warning fires.

**FR-006:** The system shall render an Escalation enabled toggle. This toggle shall only
be visible when SLA is enabled (escalation without an SLA is not a valid configuration).

**FR-007:** When Escalation is enabled, the system shall render the following controls:
  - Escalation action: a dropdown with options Reassign, Notify, Flag,
    Reassign and Notify.
  - Escalation target type: a dropdown with options Specific User, Specific Team,
    Manager of Assignee, Role.
  - Escalation target lookup: rendered dynamically based on selected target type:
    - Specific User: a user search/lookup field (reuses existing user lookup).
    - Specific Team: a team dropdown (reuses existing team list).
    - Manager of Assignee: no additional lookup rendered (manager resolved at runtime
      via CRM user hierarchy).
    - Role: a role dropdown (sourced from `qdb_role` — already loaded by the adapter).

**FR-008:** The system shall display a read-only summary line on each step node card on
the canvas when that step has SLA enabled. The summary shall state the duration,
unit, and — if escalation is also enabled — the escalation action.
Example: "SLA: 2 Business Days | Escalate: Notify".
When SLA is not enabled the summary line shall not be rendered.

### 5.3 Validation

**FR-009:** The system shall prevent saving a step when SLA is enabled and the duration
field is empty, zero, or negative; it shall display a field-level validation message:
"Duration must be a positive whole number."

**FR-010:** The system shall prevent saving a step when SLA is enabled and no unit is
selected; it shall display: "Select a duration unit."

**FR-011:** The system shall prevent saving a step when SLA is enabled and no basis is
selected; it shall display: "Select when the SLA clock starts."

**FR-012:** The system shall prevent saving a step when escalation is enabled and no
escalation action is selected.

**FR-013:** The system shall prevent saving a step when escalation is enabled and the
target type is Specific User but no user is selected.

**FR-014:** The system shall prevent saving a step when escalation is enabled and the
target type is Specific Team but no team is selected.

**FR-015:** The system shall prevent saving a step when escalation is enabled and the
target type is Role but no role is selected.

**FR-016:** The system shall prevent saving a step when the warning threshold is present
and is not an integer between 1 and 99 (inclusive); it shall display: "Warning threshold
must be between 1 and 99."

### 5.4 Persistence

**FR-017:** The system shall persist all SLA and escalation field values to
`qdb_work_item_steps` in Dataverse when the step save action is confirmed, using the
existing `DataverseAdapter.updateStep` / `createStep` path extended for the new fields.

**FR-018:** When SLA is disabled on a step, the system shall write null to all SLA and
escalation fields on save, clearing any previously persisted values for that step.

**FR-019:** The system shall load and display previously saved SLA and escalation
configuration for a step when the step configuration panel is opened, with all controls
reflecting the persisted values without requiring a page reload.

**FR-020:** The system shall correctly round-trip all option set values: the value stored
in Dataverse must be the integer option set code; the value displayed to the user must be
the corresponding label.


---

## 6. NON-FUNCTIONAL REQUIREMENTS

**NFR-001: Usability**
The SLA section must not increase the step configuration panel's cognitive load for makers
who do not use SLA. The section must be collapsed by default with a single expand affordance.
All SLA fields must be progressively disclosed (SLA fields hidden unless SLA toggle is on;
escalation fields hidden unless escalation toggle is on).

**NFR-002: Validation responsiveness**
Field-level validation messages must appear inline (adjacent to the offending field) within
one render cycle of the user submitting the panel. No validation may block the panel from
opening or rendering.

**NFR-003: Persistence correctness**
A step with SLA configuration must round-trip identically through save and reload with
zero data loss. This must be verified by an automated integration test against a live
Dataverse environment (org5869857f or equivalent dev org).

**NFR-004: No hardcoded thresholds**
No duration value, option set integer, or escalation behaviour code may be hardcoded as a
magic number in the application code. All such values must be declared as named constants
in the type layer (consistent with the existing `ASSIGN_TO_CODES` / `WORKFLOW_STATE_CODES`
pattern in `WorkflowTypes.ts`).

**NFR-005: Auditability of configuration changes**
Changes to SLA configuration on a step must be captured by the existing CRM audit log
(standard Dataverse field auditing, enabled at org level). No additional custom audit
mechanism is required in DP-2, but the schema must not use any field type that suppresses
audit trail capture.

**NFR-006: Backwards compatibility**
Steps that have no SLA configuration (all new fields null) must load, display, and save
identically to their current behaviour. DP-2 must introduce zero regression on existing
step management.

**NFR-007: Bundle size**
The addition of the SLA panel must not increase the total deployable web resource bundle
by more than 20 KB (uncompressed). No new third-party dependency may be introduced
without an ADR.


---

## 7. BUSINESS RULES

**BR-001:** SLA configuration is optional per step. A process with no SLA-enabled steps
is valid and must not be treated differently by the designer.

**BR-002:** A step may not have escalation enabled without also having SLA enabled.
Escalation without a due-date anchor is not meaningful and must be prevented at the UI
and validation level.

**BR-003:** Duration must be a positive integer greater than zero. Fractional durations
(e.g. 0.5 days) are not supported in V1; the duration unit must be chosen to express
the desired granularity (e.g. 4 hours, not 0.5 days).

**BR-004:** Warning threshold is optional. When set, it must be between 1 and 99 (%)
inclusive. A value of 0 or 100 is not permitted (0 means "warn immediately on creation"
which is nonsensical; 100 means "warn when SLA is already breached" which is redundant
with escalation).

**BR-005:** The option set values for `qdb_sla_duration_unit`, `qdb_sla_basis`,
`qdb_escalation_action`, and `qdb_escalation_target_type` must be authored as Dataverse
global option sets (not local to the entity) so that the CWFD-005 runtime can reference
them without schema dependency on the CWFD solution.

**BR-006:** When escalation target type is Manager of Assignee, the designer stores no
additional lookup. The runtime engine is responsible for resolving the assignee's manager
at execution time using the CRM user hierarchy. The designer cannot pre-validate whether
a manager exists.

**BR-007:** SLA fields apply to workflow process steps (`qdb_work_item_steps`) only.
They do not apply to SOP template steps (`qdb_sopstep`) in DP-2. See OQ-7 for the
open question on SOP-level SLA inheritance.

**BR-008:** The duration unit "Business Days" is stored as a label/code in Dataverse.
Calculation of what constitutes a business day (calendar, public holidays, working hours)
is the sole responsibility of the CWFD-005 runtime engine. The designer does not validate
or constrain this; it stores the intent.


---

## 8. USER STORIES

---

**US-01**
As a **Process Manager**, I want to enable an SLA on a workflow step and specify a due-date
offset so that when the runtime engine creates a task for this step, it knows the deadline.

Priority: Must Have

Acceptance Criteria:
- Given: A process step configuration panel is open in the designer
- When: The maker enables the SLA toggle and sets Duration = 2, Unit = Business Days,
  Basis = Task Created
- Then: The panel accepts the input without validation errors
- And: On save and reload, the step displays "SLA: 2 Business Days" on its canvas card
- And: The Dataverse record for the step has `qdb_sla_enabled = true`,
  `qdb_sla_duration = 2`, `qdb_sla_duration_unit = BusinessDays` (option code),
  `qdb_sla_basis = TaskCreated` (option code)

---

**US-02**
As a **Process Manager**, I want to configure an escalation target and action on a step
so that the runtime knows what to do when the SLA is breached without any manual
intervention.

Priority: Must Have

Acceptance Criteria:
- Given: A step with SLA enabled in the configuration panel
- When: The maker enables escalation, selects action = Reassign and Notify,
  target type = Specific User, and selects a user from the lookup
- Then: The escalation fields accept the input without validation errors
- And: On save and reload, the persisted values round-trip exactly
- And: Attempting to save with escalation enabled but no user selected shows
  a field-level error and blocks the save

---

**US-03**
As a **Process Manager**, I want the SLA section to be hidden by default so that makers
who do not use SLA are not presented with additional complexity.

Priority: Must Have

Acceptance Criteria:
- Given: The step configuration panel is opened for any step
- When: The panel first renders
- Then: The SLA & Escalation section is collapsed; no SLA fields are visible
- And: A single expand control is present
- And: The panel opens within the same latency as before DP-2

---

**US-04**
As a **Process Manager**, I want to set a warning threshold so that the runtime can
alert the assignee before the full SLA is breached.

Priority: Should Have

Acceptance Criteria:
- Given: A step with SLA enabled
- When: The maker enters a warning threshold of 75
- Then: The field accepts the value
- And: Entering 0 or 100 produces a validation error
- And: The field may be left blank; the step saves without error when the field is empty

---

**US-05**
As a **Business Analyst**, I want to see SLA configuration on each step card in
view-mode so that I can review the process's time commitments without opening each
step's configuration panel.

Priority: Should Have

Acceptance Criteria:
- Given: A process is loaded in view mode in the designer
- When: One or more steps have SLA enabled
- Then: Each SLA-enabled step card displays a summary badge (e.g. "SLA: 2 Business Days |
  Escalate: Notify")
- And: Steps without SLA show no badge
- And: No SLA field is editable in view mode

---

**US-06**
As a **QDB Platform Team member**, I want the SLA fields in Dataverse to follow the
existing naming convention and be defined as global option sets so that the CWFD-005
runtime can consume them without coupling to the CWFD solution internals.

Priority: Must Have

Acceptance Criteria:
- Given: The IT System Administrator provisions the DP-2 Dataverse schema
- When: A developer queries the Dataverse metadata for `qdb_work_item_steps`
- Then: All SLA fields are present with the `qdb_` prefix and are nullable
- And: All option sets are global (not entity-local)
- And: The CWFD-005 team can read and write SLA fields via Web API without
  dependency on any CWFD web resource code

---

## 9. DATA REQUIREMENTS

| Entity                   | New fields added | Volume impact | Retention   | Sensitivity |
|--------------------------|------------------|---------------|-------------|-------------|
| `qdb_work_item_steps`    | 11 new fields (see FR-001) | Negligible — same record count, wider rows | Same as parent process record | Internal |
| Dataverse global option sets | 4 new option sets (duration unit, basis, escalation action, escalation target type) | Schema only — no row growth | Permanent (part of solution) | Internal |
| `qdb_role` (existing)    | No new fields — used as escalation target lookup | No change | Existing | Internal |
| `systemuser` (existing)  | No new fields — used as escalation user lookup | No change | Existing | Internal |
| `team` (existing)        | No new fields — used as escalation team lookup | No change | Existing | Internal |

Notes:
- No PII is introduced. User GUIDs are stored as lookup references, not copied data.
- The SLA configuration fields store intent (a number and an option set code) not
  computed timestamps. Computed due-date values are the runtime's responsibility.
- Audit trail capture of field changes relies on standard Dataverse field auditing
  (enabled at org level). No additional tables are introduced.


---

## 10. RECOMMENDATION TO THE CEO

### Recommended approach: Proceed as config-only (design-time only, no runtime)

**Recommendation:** Approve DP-2 to proceed immediately as a config-only engagement.
Do not defer until the CWFD-005 runtime engine is complete.

**Rationale:**

1. **Schema contract first.** The CWFD-005 runtime team needs a stable, tested
   Dataverse schema to build against. Doing DP-2 now defines that contract. If DP-2
   is deferred until the runtime is done, the runtime team must invent its own schema
   without maker input, risking a mismatch with what process designers actually need
   when the UI is finally built.

2. **Independent deliverability.** The designer UI and Dataverse schema have zero
   dependency on the runtime engine. The config surface can be built, tested, and
   shipped now without blocking or being blocked by CWFD-005.

3. **Enterprise sales motion.** The P1 parity gap is already causing objections from
   process owners during workflow sign-off. Even a config-only release gives the sales
   and delivery team a credible answer: "SLA is configurable today; enforcement goes
   live when CWFD-005 ships." This is standard practice in enterprise BPM tooling —
   Nintex and Appian both allowed SLA configuration in designer before enforcement was
   live in all deployment topologies.

4. **No technical debt risk.** Config-only does not create migration debt. The fields
   written in DP-2 are the exact same fields the runtime will read. There is no
   intermediate format to migrate away from.

5. **Transparent to end users.** Steps without a runtime engine simply do not have
   timers or escalations fire — the business continues operating exactly as today.
   No regression. No confusion. The feature is dormant until CWFD-005 activates it.

**What the CEO is NOT approving in DP-2:**
- Any runtime enforcement behaviour.
- Any timer, notification, or escalation execution.
- Any change to the CRM plugin layer.

**The CEO IS approving in DP-2:**
- 11 new Dataverse fields on `qdb_work_item_steps`.
- 4 new global option sets.
- A designer UI panel section for SLA/escalation configuration.
- Client-side validation and round-trip persistence of that configuration.


---

## 11. INTEGRATION DEPENDENCIES

| System                           | Integration type            | Data exchanged                                   | Direction                |
|----------------------------------|-----------------------------|--------------------------------------------------|--------------------------|
| Dataverse (`qdb_work_item_steps`)| Web API PATCH/POST          | New SLA + escalation field values                | Designer WRITES to CRM   |
| Dataverse (`qdb_work_item_steps`)| Web API GET                 | SLA + escalation field values on step load       | Designer READS from CRM  |
| Dataverse (`qdb_role`)           | Web API GET (existing path) | Role ID + name for escalation role lookup        | Designer READS from CRM  |
| Dataverse (`systemuser`)         | Web API GET (existing path) | User ID + name for escalation user lookup        | Designer READS from CRM  |
| Dataverse (`team`)               | Web API GET (existing path) | Team ID + name for escalation team lookup        | Designer READS from CRM  |
| CWFD-005 Runtime Engine (future) | Indirect — reads Dataverse  | SLA and escalation field values from steps       | Runtime READS what Designer WRITES |

Note: All new Dataverse calls go through the existing `DataverseAdapter` class.
No new HTTP integration surface is introduced.


---

## 12. ASSUMPTIONS

1. The IT System Administrator will provision the 11 new fields and 4 new global option
   sets on `qdb_work_item_steps` in Dataverse (org5869857f) before any build begins.
   The architect will produce the exact field definitions and option set codes in Phase 3.

2. The existing `DataverseAdapter.buildStepBodyResolved` method can be extended to include
   SLA fields without requiring a structural refactor. The new fields follow the same
   pattern as existing step fields.

3. The CWFD-005 runtime engagement either exists or will be formally initiated. DP-2's
   value is conditional on CWFD-005 being on the roadmap. If CWFD-005 is cancelled, the
   SLA configuration fields become inert data (no harm, but no value either).

4. The CRM user hierarchy (manager field on `systemuser`) is populated in the Dataverse
   environment for at least some users. The "Manager of Assignee" escalation target type
   is only useful at runtime if this hierarchy exists; the designer does not validate it.

5. The existing `qdb_role` entity (already in the CWFD solution) is appropriate for
   use as an escalation target role. No new role concept is required.

6. "Business Days" as a duration unit will be interpreted by the CWFD-005 runtime using
   a business calendar. The source of that calendar (a CRM calendar record, a configuration
   entity, or a hardcoded M-F assumption) is to be decided by the CWFD-005 team. DP-2
   stores the intent; it does not define the calculation.

7. The escalation notification channel (when action is Notify or Reassign and Notify)
   will be CRM-native (a CRM task or notification to the target user/team). Microsoft
   Teams integration is not in scope for either DP-2 or the initial CWFD-005 runtime.
   This assumption should be confirmed with stakeholders (see OQ-4).

8. React components for user and team lookups already exist in the CWFD codebase and
   can be reused for escalation target selection with minimal adaptation.


---

## 13. CONSTRAINTS

1. **Design-time only.** DP-2 must not introduce any server-side logic, plugin code,
   Power Automate flows, or scheduled jobs. The deliverable is UI + Dataverse schema only.

2. **Dataverse schema naming.** All new fields must use the `qdb_` publisher prefix.
   Field logical names proposed in FR-001 are preliminary; the architect will confirm
   exact names in Phase 3.

3. **No new dependencies.** No new npm package may be added for the SLA panel. All UI
   controls must be implemented using the existing React + TypeScript component set
   in the CWFD codebase. If a new dependency is needed, an ADR must be approved first.

4. **Option set values are global.** Per BR-005, all new option sets must be global
   (solution-level), not entity-local. This is a Dataverse schema constraint enforced
   during provisioning.

5. **Backwards compatibility is mandatory.** Existing step records with all SLA fields
   null must behave identically to the current experience. Zero regression is a hard gate.

6. **Bundle size ceiling.** The deployable web resource bundle must not exceed the
   existing 5 MB limit (NFR-007 from the parent CWFD BRD). DP-2's incremental addition
   must not push the bundle over this limit.

7. **Timeline.** Not yet specified. To be set by CEO and delivery lead after approval.

8. **Budget.** Not yet specified. To be confirmed after approval.


---

## 14. RISKS AND OPEN QUESTIONS

| Risk / Question | Impact | Owner | Resolution needed by |
|---|---|---|---|
| **OQ-1 (Business calendar source):** What constitutes a "business day" in this organisation — M–F excluding public holidays of which country, or a CRM calendar entity? The designer stores "Business Days" as an intent; the runtime must calculate it. If no business calendar exists in Dataverse, the runtime may need to default to M–F with no holidays, which may not match user expectations. | HIGH — affects runtime correctness; should be acknowledged in DP-2 even though enforcement is out of scope | Process Manager / IT Admin | Before CWFD-005 architecture; must be documented in DP-2 acceptance |
| **OQ-2 (Escalation target: Manager of Assignee):** Is the CRM user hierarchy (`systemuser.parentsystemuserid` or manager lookup) populated for all relevant users? If not, "Manager of Assignee" escalation silently has no target at runtime. Should the designer warn the maker when this option is selected? | MEDIUM — could produce silent no-ops at runtime | IT System Administrator | Before Phase 3 architecture |
| **OQ-3 (SLA on SOP template steps):** Should SLA configuration live on `qdb_sopstep` (the SOP template level) and be inherited when a process is derived from a SOP, or should it only be set on `qdb_work_item_steps` (the derived process step)? Template-level SLA would give makers a single place to define SLA policy; process-level SLA allows per-deployment customisation. This choice affects schema design significantly. | HIGH — changes scope if template-level SLA is required | QDB Platform Team / Process Manager | Before Phase 3; if template-level is required, DP-2 scope expands |
| **OQ-4 (Notification channel):** When escalation action is Notify, what channel does the runtime use — a CRM Activity (Task/Email), a native Dataverse notification, or Microsoft Teams? The designer stores the target; the runtime chooses the channel. Stakeholders should confirm so the UX copy is accurate ("you will be notified" must reflect the actual channel). | MEDIUM — affects accuracy of UI labels and user expectations | QDB Platform Team | Before build begins; does not block schema |
| **OQ-5 (Warning threshold behaviour):** When a warning threshold is set (e.g. 75%), the runtime must fire a warning event. What does a "warning" mean — a notification to the assignee, to the process manager, or both? DP-2 stores only the threshold percentage; the runtime defines the action. If the business also wants to configure the warning target and action (separate from the breach escalation target), the SLA panel scope expands. | MEDIUM — may require additional fields if warning action is configurable | Process Manager / QDB Platform Team | Before build begins |
| **OQ-6 (CWFD-005 timeline dependency):** If CWFD-005 (the runtime engine) is not on a confirmed roadmap, DP-2 config fields will be permanently inert. Is CWFD-005 formally planned? If not, the CEO may choose to defer DP-2 until CWFD-005 has a delivery date. | HIGH if CWFD-005 is not on roadmap — reduces DP-2 ROI | CEO | CEO gate (this document) |
| **OQ-7 (SLA basis: Previous Step Completed):** The "Previous Step Completed" basis requires the runtime to know when the immediately preceding step was closed. This information may or may not be persisted by the CRM execution layer. If it is not tracked, this SLA basis option cannot be enforced at runtime and the designer should either exclude it or display a caveat. Confirm with the CWFD-005 team whether step-completion timestamps are persisted. | LOW-MEDIUM — affects whether one of three SLA basis options is viable | QDB Platform Team | Before Phase 4 build; if unconfirmed, exclude option from V1 |


---

## 15. ACCEPTANCE CRITERIA (DESIGN-TIME GATE)

The following criteria define completion of DP-2. They deliberately do NOT claim any
runtime enforcement behaviour.

**AC-1:** A maker can open any process step in the CWFD designer and see a collapsed
"SLA & Escalation" section that has no effect on the step when left collapsed.

**AC-2:** A maker can enable SLA on a step, set all required fields (duration, unit,
basis), save, reload the designer, and see identical values — no data loss.

**AC-3:** A maker can enable escalation on an SLA-enabled step, configure a target type
and target, save, reload, and see identical values.

**AC-4:** Client-side validation blocks save when SLA is enabled but duration is missing
or invalid, displaying a descriptive field-level message.

**AC-5:** Client-side validation blocks save when escalation is enabled but no action
or no target is selected, displaying a descriptive field-level message.

**AC-6:** Steps without SLA enabled load, save, and display identically to their
pre-DP-2 behaviour (zero regression).

**AC-7:** SLA-enabled step cards display a summary badge on the visual canvas in both
edit mode and view mode.

**AC-8:** A Dataverse query against `qdb_work_item_steps` for a step with SLA configured
returns all 11 new field values correctly, confirming the schema is correctly provisioned
and the adapter correctly writes them.

**What is NOT an acceptance criterion for DP-2:**
- Timers fire.
- Escalation actions execute.
- SLA breach is detected.
- Any runtime behaviour whatsoever.


---

## 16. GLOSSARY

| Term | Definition |
|---|---|
| Business Days | Working days excluding weekends and public holidays. The exact definition (which country's holidays, working hours) is determined by the CWFD-005 runtime; DP-2 stores the intent only. |
| Calendar Days | All days including weekends and public holidays. |
| CWFD | CRM Workflow Designer — the React web resource (Dataverse) that is the parent system of DP-2. |
| CWFD-005 | The separate planned engagement to build the CRM runtime execution engine that will consume the SLA configuration produced by DP-2. |
| DP-2 | This engagement — the second feature in the Workflow Designer enhancement backlog (CWFD-007). Delivers SLA/escalation configuration only. |
| Escalation | A configured response to an SLA breach: reassigning the task, notifying a target, or flagging the record. Configured in the designer; executed by the runtime. |
| Manager of Assignee | The CRM user designated as the manager of the task's assignee, resolved via the CRM user hierarchy at runtime. |
| SLA | Service Level Agreement — in this context, a time-based commitment expressed as a duration offset from a defined start event (task creation, assignment, or previous step completion). |
| SLA Basis | The event from which the SLA duration begins counting (Task Created / Task Assigned / Previous Step Completed). |
| SLA Breach | The moment when the computed due date passes without the task being completed. Detected at runtime by CWFD-005; not detectable by the designer. |
| SLA Warning | A notification or alert triggered when a configurable percentage of the SLA duration has elapsed without the task being completed. Executed at runtime; percentage is configured in the designer. |
| `qdb_work_item_steps` | The Dataverse entity (logical name) that stores individual workflow step definitions. DP-2 adds 11 new fields to this entity. |
| `qdb_sopstep` | The Dataverse entity for SOP template steps. Not modified in DP-2 (see OQ-3). |


---

## 17. REQUIREMENTS TRACEABILITY MATRIX

| User Story | Functional Requirements         | Business Rules              | Test Case (QA fills)  | Status |
|------------|---------------------------------|-----------------------------|-----------------------|--------|
| US-01      | FR-001, FR-004, FR-005, FR-017, FR-019 | BR-001, BR-003, BR-004, BR-008 | TC-XXX (pending) | Draft |
| US-02      | FR-006, FR-007, FR-013, FR-014, FR-015, FR-017, FR-019 | BR-002, BR-005, BR-006 | TC-XXX (pending) | Draft |
| US-03      | FR-003, FR-004                  | BR-001                      | TC-XXX (pending)      | Draft  |
| US-04      | FR-005 (warning threshold), FR-016 | BR-004                   | TC-XXX (pending)      | Draft  |
| US-05      | FR-008                          | BR-001                      | TC-XXX (pending)      | Draft  |
| US-06      | FR-001, FR-002, FR-017, FR-018, FR-019, FR-020 | BR-005, BR-007 | TC-XXX (pending) | Draft |


---

## 18. APPROVAL

| Role       | Name     | Decision | Date |
|------------|----------|----------|------|
| CEO        | Pending  | PENDING  |      |
| Requestor  | Pending  | PENDING  |      |

═══════════════════════════════════════════════════
END OF DOCUMENT
═══════════════════════════════════════════════════

---

BRD is complete. Submitting to CEO for approval before any design or code begins.
