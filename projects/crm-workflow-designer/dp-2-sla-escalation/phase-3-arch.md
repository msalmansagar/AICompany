# DP-2 — Phase 3 Architecture
# SLA / Escalation Configuration on Workflow Steps

**Project:** DP-2 (CWFD-007)
**Parent system:** CRM Workflow Designer (CWFD)
**Date:** 2026-07-21
**Architect:** Maqsad AI — Solution Architect
**Status:** Complete — Pending Phase 4 authorization

---

## System Overview

DP-2 extends the CWFD React web resource with a per-step SLA and escalation
configuration surface. The architecture is a schema-forward, config-only extension:
11 new Dataverse fields are added to `qdb_work_item_steps`; the existing adapter
layer (`DataverseAdapter` / `ODataAdapter`) is widened to carry these fields;
`StepPropertiesPanel` gains a new collapsible section with progressive disclosure;
the node cards gain a summary badge. Nothing fires at runtime — the entire
configuration is inert until the CWFD-005 execution engine reads and acts on it.

The design follows the existing dual-adapter contract (ADR-002), flat-field
extension pattern on `WorkflowStep`, and named-constant option-set code mapping
already established by `ASSIGN_TO_CODES` and `WORKFLOW_STATE_CODES`.

---

## Component Diagram

```
 CWFD React Web Resource (single bundle)
 ┌───────────────────────────────────────────────────────────┐
 │                                                           │
 │  StepPropertiesPanel                                      │
 │  ├── [existing] name / order / task subject / assignTo    │
 │  └── [NEW] SlaEscalationSection (collapsed by default)   │
 │       ├── SLA toggle                                      │
 │       ├── [conditional] SlaDurationFields                 │
 │       │     duration (int) + unit (dropdown) + basis     │
 │       │     warning threshold (optional int)             │
 │       ├── [conditional] Escalation toggle                 │
 │       └── [conditional] EscalationFields                 │
 │             action (dropdown) + target-type (dropdown)   │
 │             target lookup (user | team | role | none)    │
 │                                                           │
 │  EditStepNode / ViewStepNode                             │
 │  └── [NEW] SlaBadge (rendered when slaEnabled=true)      │
 │                                                           │
 │  WorkflowTypes.ts                                         │
 │  └── [NEW] SLA fields on WorkflowStep +                  │
 │            option-set code maps + type unions             │
 │                                                           │
 │  DataverseAdapter  ←──── Xrm.WebApi (CRM iframe)         │
 │  ODataAdapter      ←──── fetch (local dev proxy)         │
 │  ├── [UPDATED] buildStepBody — maps SLA fields           │
 │  ├── [UPDATED] buildStepBodyResolved — nav-prop binds    │
 │  │   for escalation user / team / role lookups           │
 │  ├── [UPDATED] getSteps — $select adds 11 new fields     │
 │  └── [UPDATED] mapStep — maps raw Dataverse → WorkflowStep│
 │                                                           │
 │  slaValidator.ts (NEW pure function module)              │
 │  └── validateSlaConfig(step) → FieldErrorMap             │
 │                                                           │
 │  useWorkflowSave — no change (calls adapter.updateStep)  │
 │                                                           │
 └───────────────────────────────────────────────────────────┘
               │  Dataverse Web API (OData v4)
               ▼
 qdb_work_item_steps   [EXTENDED — 11 new fields]
 qdb_SLADurationUnit   [NEW global option set]
 qdb_SLABasis          [NEW global option set]
 qdb_EscalationAction  [NEW global option set]
 qdb_EscalationTargetType [NEW global option set]
 systemuser            [existing — escalation user lookup target]
 team                  [existing — escalation team lookup target]
 qdb_role              [existing — escalation role lookup target]
```

---

## Technology Stack

| Layer | Technology | Reason / ADR reference |
|---|---|---|
| UI framework | React + TypeScript | Existing CWFD stack (ADR-001) |
| State management | Zustand flat-map store | Existing pattern (ADR-003). SLA fields added to WorkflowStep in the steps flat-map — no store structural change |
| CRM communication | Dual adapter (DataverseAdapter / ODataAdapter) | ADR-002 — no deviation. Both adapters updated in parallel |
| Schema storage | Dataverse fields on `qdb_work_item_steps` | CEO-locked scope; consistent with existing step schema |
| Option sets | Global Dataverse option sets | BR-005 — CWFD-005 must reference them without CWFD solution dependency |
| Validation | Pure TypeScript function (`slaValidator.ts`) | No library needed; testable without React mount |
| Local dev shim | `DevXrmWebApiShim` | No change — passes through updated $select string transparently |

---

## 1. Dataverse Schema Design

### 1.1 Fields on `qdb_work_item_steps`

All 11 fields are nullable. Publisher prefix: `qdb_`. All field types use only
types that Dataverse standard auditing captures (no special field type exclusions).

| # | Logical name | Display name | Type | Details / Allowed values |
|---|---|---|---|---|
| 1 | `qdb_sla_enabled` | SLA Enabled | Two Options (boolean) | Default: false |
| 2 | `qdb_sla_duration` | SLA Duration | Whole Number | Minimum 1; no maximum enforced at schema level |
| 3 | `qdb_sla_duration_unit` | SLA Duration Unit | Option Set (global: `qdb_SLADurationUnit`) | See §1.2 |
| 4 | `qdb_sla_basis` | SLA Clock Basis | Option Set (global: `qdb_SLABasis`) | See §1.3 |
| 5 | `qdb_sla_warning_pct` | Warning Threshold (%) | Whole Number | 1–99; null = no warning |
| 6 | `qdb_escalation_enabled` | Escalation Enabled | Two Options (boolean) | Default: false |
| 7 | `qdb_escalation_action` | Escalation Action | Option Set (global: `qdb_EscalationAction`) | See §1.4 |
| 8 | `qdb_escalation_target_type` | Escalation Target Type | Option Set (global: `qdb_EscalationTargetType`) | See §1.5 |
| 9 | `qdb_escalation_user` | Escalation User | Lookup → `systemuser` | Active when target type = SpecificUser |
| 10 | `qdb_escalation_team` | Escalation Team | Lookup → `team` | Active when target type = SpecificTeam |
| 11 | `qdb_escalation_role` | Escalation Role | Lookup → `qdb_role` | Active when target type = Role |

**Provisioning note:** Fields 9–11 are standard single-valued Lookup columns.
The navigation property name for each is assigned by Dataverse at relationship
creation time. The adapters resolve nav-prop names at runtime via `resolveNavProp()`,
so no nav-prop name is hardcoded (consistent with existing lookup fields).

### 1.2 Global Option Set: `qdb_SLADurationUnit`

| Label | Integer code | Meaning |
|---|---|---|
| Hours | 100000000 | Clock ticks in calendar hours |
| Calendar Days | 100000001 | Calendar days including weekends |
| Business Days | 100000002 | Working days per organisation calendar (resolved by runtime) |

### 1.3 Global Option Set: `qdb_SLABasis`

| Label | Integer code | Meaning |
|---|---|---|
| Task Created | 100000000 | Clock starts when the CRM task record is created |
| Task Assigned | 100000001 | Clock starts when the task is assigned to a user or team |
| Previous Step Completed | 100000002 | Clock starts when the immediately preceding step is closed |

**Runtime note:** `PreviousStepCompleted` requires the runtime to track step-completion
timestamps. OQ-7 flagged this as unverified. The option code is included in the schema
now to avoid a future schema addition; the CWFD-005 team must confirm whether
step-completion timestamps are persisted before activating this basis in the runtime.
If not available, the runtime should treat `PreviousStepCompleted` as equivalent to
`TaskCreated` and document the fallback. This constraint is explicitly noted in the
CWFD-005 contract (§2).

### 1.4 Global Option Set: `qdb_EscalationAction`

| Label | Integer code | Meaning |
|---|---|---|
| Reassign | 100000000 | Transfer task ownership to escalation target |
| Notify | 100000001 | Send notification to escalation target without reassigning |
| Flag | 100000002 | Mark the task with a breach flag; no routing action |
| Reassign and Notify | 100000003 | Transfer ownership and send notification |

### 1.5 Global Option Set: `qdb_EscalationTargetType`

| Label | Integer code | Meaning |
|---|---|---|
| Specific User | 100000000 | A named CRM user; paired with `qdb_escalation_user` lookup |
| Specific Team | 100000001 | A named CRM team; paired with `qdb_escalation_team` lookup |
| Manager of Assignee | 100000002 | Resolved at runtime via `systemuser.parentsystemuserid` hierarchy; no extra lookup |
| Role | 100000003 | A `qdb_role` record; paired with `qdb_escalation_role` lookup |

---

## 2. Contract Note for CWFD-005

This section documents the DP-2 schema as the formal runtime contract that
CWFD-005 must build against. The fields are read-only from the CWFD-005 perspective
— the designer writes, the runtime reads.

### 2.1 How the runtime reads the contract

```
GET /api/data/v9.2/qdb_work_item_stepses?
  $select=qdb_work_item_stepsid,qdb_sla_enabled,qdb_sla_duration,
  qdb_sla_duration_unit,qdb_sla_basis,qdb_sla_warning_pct,
  qdb_escalation_enabled,qdb_escalation_action,
  qdb_escalation_target_type,_qdb_escalation_user_value,
  _qdb_escalation_team_value,_qdb_escalation_role_value
  &$filter=_qdb_record_type_value eq <processId>
```

### 2.2 Field semantics for enforcement

| Field | Runtime behaviour |
|---|---|
| `qdb_sla_enabled = false` | Skip all SLA logic for this step. No timer created |
| `qdb_sla_enabled = true` + `qdb_sla_duration` + `qdb_sla_duration_unit` + `qdb_sla_basis` | Compute due-date: add duration (in units) to the basis event timestamp |
| `qdb_sla_duration_unit = BusinessDays (100000002)` | Runtime must resolve the working calendar. If no calendar entity is configured, default to M–F with no holidays and document this as a configurable default — DO NOT hardcode |
| `qdb_sla_warning_pct = N` | Fire warning event when `elapsedTime / totalDuration >= N/100`. Warning action and target are not configured in v1; the runtime dispatches a notification to the step's current assignee |
| `qdb_sla_warning_pct = null` | No warning event fires |
| `qdb_escalation_enabled = false` | No escalation action on breach |
| `qdb_escalation_target_type = ManagerOfAssignee (100000002)` | Resolve manager via `systemuser.parentsystemuserid`. If null, the runtime must log the breach without executing an escalation action — silent no-ops are not acceptable |
| `qdb_sla_basis = PreviousStepCompleted (100000002)` | **Unverified dependency**: the runtime must persist step-completion timestamps; if absent, fall back to `TaskCreated` and surface this as a configuration warning |

### 2.3 Open runtime dependency — OQ-1: Business calendar source

**Architect recommendation:** CWFD-005 should provision a dedicated
`qdb_business_calendar` configuration entity with working-hour intervals per day.
The SLA enforcement engine reads from this entity at task creation time. A system-default
row (M–F 08:00–18:00) must exist so the engine never falls back to guessing.
The calendar entity is NOT in DP-2 scope; it is a prerequisite for CWFD-005
going live with `BusinessDays` mode.

### 2.4 Warning threshold — OQ-5 resolution

**Decision (V1):** Only the percentage threshold is stored (`qdb_sla_warning_pct`).
The warning action (notify assignee) and warning target (assignee only) are not
configurable in V1. The runtime fires a single CRM notification to the current task
assignee at the threshold point. If the business requires configurable warning
actions or separate warning targets, those fields will be added in a future
engagement. This is a deliberate V1 scope boundary and matches the CEO approval
conditions.

**Consequence for the designer UI:** The warning threshold field carries a note:
"The system will notify the task's assignee when this percentage of the SLA
has elapsed." This UX copy makes the runtime behaviour transparent without
over-engineering the data model now.

---

## 3. Designer UI Design

### 3.1 Panel placement

The `SlaEscalationSection` is the final section in `StepPropertiesPanel`, rendered
below the existing Assignment section. It is an expandable accordion with default
state: collapsed.

```
┌─ StepPropertiesPanel ──────────────────────────────────┐
│  [existing] Name                                       │
│  [existing] Order (up/down)                            │
│  [existing] Task Subject                               │
│  [existing] Task Description                           │
│  [existing] Assign To + assignee lookup               │
│  ──────────────────────────────────────────────────── │
│  [NEW] ▶ SLA & Escalation           [collapsed badge] │
│          click to expand                               │
└────────────────────────────────────────────────────────┘

Expanded state:
┌─ SLA & Escalation ────────────────────────────────────┐
│  [!] Configuration only — SLA enforcement requires    │
│      the CWFD-005 runtime to be active.               │
│                                                        │
│  Enable SLA  [toggle: OFF → ON]                       │
│                                                        │
│  [visible only when SLA = ON]                         │
│  Duration  [___ number input]  [unit dropdown ▼]      │
│            Hours / Calendar Days / Business Days       │
│                                                        │
│  SLA clock starts when  [basis dropdown ▼]            │
│    Task Created / Task Assigned /                      │
│    Previous Step Completed                             │
│                                                        │
│  Warning at (% of SLA)  [___ number input, optional]  │
│  ℹ Notifies the task assignee. Leave blank to skip.   │
│                                                        │
│  [visible only when SLA = ON]                         │
│  Enable Escalation  [toggle: OFF → ON]                │
│                                                        │
│  [visible only when SLA = ON AND escalation = ON]     │
│  Escalation action  [action dropdown ▼]               │
│    Reassign / Notify / Flag / Reassign and Notify      │
│                                                        │
│  Target type  [target-type dropdown ▼]                │
│    Specific User / Specific Team /                     │
│    Manager of Assignee / Role                          │
│                                                        │
│  [conditional target lookup]                           │
│    SpecificUser   → user search field                  │
│    SpecificTeam   → team dropdown                      │
│    ManagerOfAssignee → (no extra control; note below) │
│    Role           → role dropdown                      │
│                                                        │
│  ℹ Manager of Assignee is resolved by the runtime     │
│    using the CRM user hierarchy. No selection needed.  │
└────────────────────────────────────────────────────────┘
```

### 3.2 Collapsed badge behaviour

When the section is collapsed AND `slaEnabled = true`, the header row shows an
inline summary: `SLA: 2 Business Days | Escalate: Notify` (or `SLA: 4 Hours` if
escalation is off). This lets the maker confirm configuration at a glance without
expanding the section. When `slaEnabled = false`, the collapsed header shows only
"SLA & Escalation" with no summary.

### 3.3 Conditional visibility rules

| Control | Visible when |
|---|---|
| SLA sub-fields (duration, unit, basis, warning) | `slaEnabled === true` |
| Escalation toggle | `slaEnabled === true` |
| Escalation sub-fields (action, target type, target lookup) | `slaEnabled === true AND escalationEnabled === true` |
| User lookup | target type = SpecificUser |
| Team dropdown | target type = SpecificTeam |
| Role dropdown | target type = Role |
| Manager note | target type = ManagerOfAssignee |

### 3.4 Validation rules (client-side)

All validation is performed by the new `slaValidator.ts` pure function before
the `setStep` call proceeds to `useWorkflowSave`. The function returns a
`FieldErrorMap` (`Record<string, string>`); an empty map means valid.

| Rule | Field key | Message |
|---|---|---|
| FR-009: duration missing/zero/negative when SLA on | `slaDuration` | "Duration must be a positive whole number." |
| FR-010: no unit when SLA on | `slaDurationUnit` | "Select a duration unit." |
| FR-011: no basis when SLA on | `slaBasis` | "Select when the SLA clock starts." |
| FR-012: no action when escalation on | `escalationAction` | "Select an escalation action." |
| FR-013: no user when target = SpecificUser | `escalationUserId` | "Select an escalation user." |
| FR-014: no team when target = SpecificTeam | `escalationTeamId` | "Select an escalation team." |
| FR-015: no role when target = Role | `escalationRoleId` | "Select an escalation role." |
| FR-016: warning pct present and outside 1–99 | `slaWarningPct` | "Warning threshold must be between 1 and 99." |
| BR-002: escalation on without SLA on | `escalationEnabled` | "Escalation requires SLA to be enabled." (guard — UI prevents this state) |

Validation is triggered on the panel's save button click, not on every field
change (avoids premature error messages while the maker is mid-configuration).

### 3.5 View-mode rendering

In view mode (`ReadOnlyPropertyPanel` / `ViewStepNode`), all SLA fields are
rendered read-only using the same labels and values. The escalation section
displays "Not configured" when `slaEnabled = false`.

### 3.6 Inert-at-runtime framing

The panel section header and the info banner must carry copy that does not
imply enforcement:

- Section info notice: "Configuration only — SLA enforcement requires the CWFD-005 runtime to be active."
- Tooltip on warning threshold: "Notifies the task's assignee when this percentage of the SLA has elapsed, once the runtime is active."
- No copy anywhere should say "the system will automatically reassign" or "SLA will be enforced."

---

## 4. Persistence Design

### 4.1 WorkflowTypes.ts additions

Two files currently share step-related types: `WorkflowTypes.ts` (used by web and
adapters) and — by constitution precedent for DFE — any mobile sibling. CWFD has
no mobile layer; `WorkflowTypes.ts` is the single source of truth.

```typescript
// --- New type unions ---

export type SlaDurationUnit = 'Hours' | 'CalendarDays' | 'BusinessDays';
export type SlaBasis        = 'TaskCreated' | 'TaskAssigned' | 'PreviousStepCompleted';
export type EscalationAction      = 'Reassign' | 'Notify' | 'Flag' | 'ReassignAndNotify';
export type EscalationTargetType  = 'SpecificUser' | 'SpecificTeam' | 'ManagerOfAssignee' | 'Role';

// --- Named constants (no magic numbers in application code) ---

export const SLA_DURATION_UNIT_CODES: Record<SlaDurationUnit, number> = {
  Hours:         100000000,
  CalendarDays:  100000001,
  BusinessDays:  100000002,
};

export const SLA_BASIS_CODES: Record<SlaBasis, number> = {
  TaskCreated:            100000000,
  TaskAssigned:           100000001,
  PreviousStepCompleted:  100000002,
};

export const ESCALATION_ACTION_CODES: Record<EscalationAction, number> = {
  Reassign:          100000000,
  Notify:            100000001,
  Flag:              100000002,
  ReassignAndNotify: 100000003,
};

export const ESCALATION_TARGET_TYPE_CODES: Record<EscalationTargetType, number> = {
  SpecificUser:       100000000,
  SpecificTeam:       100000001,
  ManagerOfAssignee:  100000002,
  Role:               100000003,
};

// Inverse maps (code → type key) for use in mapStep()
export const SLA_DURATION_UNIT_FROM_CODE: Record<number, SlaDurationUnit> = ...
export const SLA_BASIS_FROM_CODE:         Record<number, SlaBasis> = ...
export const ESCALATION_ACTION_FROM_CODE: Record<number, EscalationAction> = ...
export const ESCALATION_TARGET_TYPE_FROM_CODE: Record<number, EscalationTargetType> = ...
```

(Inverse maps are derived from the forward maps using `Object.fromEntries(Object.entries(map).map(([k,v]) => [v,k]))` — the exact derivation is a Phase 4 implementation detail.)

**WorkflowStep additions** (flat field extension, consistent with existing pattern):

```typescript
export interface WorkflowStep {
  // ... all existing fields remain unchanged ...

  // SLA configuration — all nullable; slaEnabled defaults to false
  slaEnabled: boolean;
  slaDuration: number | null;
  slaDurationUnit: SlaDurationUnit | null;
  slaBasis: SlaBasis | null;
  slaWarningPct: number | null;
  escalationEnabled: boolean;
  escalationAction: EscalationAction | null;
  escalationTargetType: EscalationTargetType | null;
  escalationUserId: string | null;
  escalationUserName: string | null;
  escalationTeamId: string | null;
  escalationTeamName: string | null;
  escalationRoleId: string | null;
  escalationRoleName: string | null;
}
```

### 4.2 buildStepBody extension (identical in both adapters)

The `buildStepBody` pure function in `DataverseAdapter.ts` and `ODataAdapter.ts`
receives the additions below. Both files must be updated identically (ADR-002
dual-implementation constraint).

**When `slaEnabled = false`:** write explicit nulls for all 9 dependent SLA fields
to clear any previously persisted values (FR-018).

**When `slaEnabled = true`:** write only the fields that are defined on `data`.

**Lookup null-clearing:** When SLA is disabled, the three lookup fields
(`qdb_escalation_user`, `qdb_escalation_team`, `qdb_escalation_role`) must
be explicitly dissociated. In `DataverseAdapter` (Xrm.WebApi), pass
`{ _qdb_escalation_user_value: null }` via the logical name field. In
`ODataAdapter` (fetch/OData), pass the navigation property bind with
`null` value. Phase 4 must verify the exact Dataverse API semantics for
single-value nav-prop nullification on PATCH; this is a known Dataverse edge
case (see Risk R-2 in §8).

### 4.3 buildStepBodyResolved additions

The `buildStepBodyResolved` method resolves navigation property names for lookup
fields. Three new lookups follow the existing pattern:

```
// Three additional items in the Promise.all array:
data.escalationUserId ? this.resolveNavProp(E, 'qdb_escalation_user') : Promise.resolve(''),
data.escalationTeamId ? this.resolveNavProp(E, 'qdb_escalation_team') : Promise.resolve(''),
data.escalationRoleId ? this.resolveNavProp(E, 'qdb_escalation_role') : Promise.resolve(''),
```

And the corresponding bind entries:

```
if (data.escalationUserId && eu) body[`${eu}@odata.bind`] = `/systemusers(${data.escalationUserId})`;
if (data.escalationTeamId && et) body[`${et}@odata.bind`] = `/teams(${data.escalationTeamId})`;
if (data.escalationRoleId && er) body[`${er}@odata.bind`] = `/${SET.role}(${data.escalationRoleId})`;
```

The `resolveNavProp()` function caches results; no additional round-trips beyond
the first save per session.

### 4.4 $select additions (both adapters, in getSteps)

The `$select` query string in both adapters' `getSteps` method is extended with:

```
qdb_sla_enabled,
qdb_sla_duration,
qdb_sla_duration_unit,
qdb_sla_basis,
qdb_sla_warning_pct,
qdb_escalation_enabled,
qdb_escalation_action,
qdb_escalation_target_type,
_qdb_escalation_user_value,
_qdb_escalation_user_value@OData.Community.Display.V1.FormattedValue,
_qdb_escalation_team_value,
_qdb_escalation_team_value@OData.Community.Display.V1.FormattedValue,
_qdb_escalation_role_value,
_qdb_escalation_role_value@OData.Community.Display.V1.FormattedValue
```

The formatted-value annotations allow `mapStep` to populate display-name fields
(`escalationUserName`, `escalationTeamName`, `escalationRoleName`) without
additional lookups.

### 4.5 mapStep additions

The `mapStep` function in both adapters maps raw Dataverse response fields to the
`WorkflowStep` SLA fields:

```typescript
slaEnabled:            (raw['qdb_sla_enabled'] as boolean) ?? false,
slaDuration:           (raw['qdb_sla_duration'] as number | null) ?? null,
slaDurationUnit:       mapOptionCode(SLA_DURATION_UNIT_FROM_CODE, raw['qdb_sla_duration_unit']),
slaBasis:              mapOptionCode(SLA_BASIS_FROM_CODE, raw['qdb_sla_basis']),
slaWarningPct:         (raw['qdb_sla_warning_pct'] as number | null) ?? null,
escalationEnabled:     (raw['qdb_escalation_enabled'] as boolean) ?? false,
escalationAction:      mapOptionCode(ESCALATION_ACTION_FROM_CODE, raw['qdb_escalation_action']),
escalationTargetType:  mapOptionCode(ESCALATION_TARGET_TYPE_FROM_CODE, raw['qdb_escalation_target_type']),
escalationUserId:      (raw['_qdb_escalation_user_value'] as string | null) ?? null,
escalationUserName:    (raw[`_qdb_escalation_user_value${FMT}`] as string | null) ?? null,
escalationTeamId:      (raw['_qdb_escalation_team_value'] as string | null) ?? null,
escalationTeamName:    (raw[`_qdb_escalation_team_value${FMT}`] as string | null) ?? null,
escalationRoleId:      (raw['_qdb_escalation_role_value'] as string | null) ?? null,
escalationRoleName:    (raw[`_qdb_escalation_role_value${FMT}`] as string | null) ?? null,
```

Where `mapOptionCode<T>(map, raw)` is a small helper that returns `map[raw as number] ?? null`.

### 4.6 DevXrmWebApiShim

`DevXrmWebApiShim` routes all requests through the Vite proxy to the live
Dataverse org (`org5869857f`). No code changes are required to the shim itself;
the extended `$select` string in `getSteps` passes through the proxy transparently.
The shim's `resolveSetName` cache handles `qdb_work_item_steps` already. No new
entity set name resolutions are needed for the SLA fields (they are scalar
columns and lookups on the existing entity).

### 4.7 useWorkflowSave

`useWorkflowSave` calls `adapter.updateStep(step.crmId, step)` (line 107) and
`adapter.createStep({...step, ...})` (lines 95–104). Both calls pass the full
`WorkflowStep` object. Because the SLA fields are part of `WorkflowStep`, they
are included in every save automatically — no changes to `useWorkflowSave` are
required. The hook's `step` variable from the Zustand store already carries all
fields including the new SLA ones.

### 4.8 Canvas badge (EditStepNode and ViewStepNode)

**EditStepData additions:**
```typescript
slaEnabled: boolean;
slaDuration: number | null;
slaDurationUnit: SlaDurationUnit | null;
escalationEnabled: boolean;
escalationAction: EscalationAction | null;
```

**EditStepNode** renders the badge below the existing assign chip when
`slaEnabled = true`:

```
[SLA: 2 Business Days | Notify]   ← amber pill badge, 10px
```

The `WorkflowGraphBuilder` (which assembles node data from `WorkflowStep`)
passes the SLA summary fields through. `ViewStepNode` receives the same fields
via `ViewStepData` and renders an identical badge in the `chipsRow`.

Badge text format: `SLA: {duration} {unitLabel}` optionally followed by
`| {actionLabel}` when `escalationEnabled = true`. Truncated to 32 characters
if needed.

### 4.9 Role lookup: ISopAdapter dependency

The escalation role dropdown requires `getRoles()`, which is on `ISopAdapter`
(not on `ICrmAdapter`). `StepPropertiesPanel` receives `adapter: ICrmAdapter`.
The panel must use the existing `isSopAdapter()` type guard:

```typescript
import { isSopAdapter } from '@/services/ISopAdapter';
// Inside SlaEscalationSection:
const loadRoles = useCallback(async () => {
  if (!isSopAdapter(adapter)) return; // ICrmAdapter without SOP — roles unavailable
  const roles = await adapter.getRoles();
  setRoleOptions(roles.map(r => ({ id: r.id, name: r.name })));
}, [adapter]);
```

In practice both concrete adapters implement `ISopAdapter`, so this guard will
always pass in production. The guard exists to preserve strict interface
contracts and to make the unit test stub simpler (stubs that only implement
`ICrmAdapter` will safely yield an empty role list).

---

## 5. Architecture Decision Records

See `/dp-2-sla-escalation/adrs/` for full ADR documents.

| ADR | Title | Status |
|---|---|---|
| ADR-008 | SLA Schema as Config-Only Dataverse Contract | Accepted |
| ADR-009 | Escalation Target: Option-Set + Conditional Lookup Pattern | Accepted |

---

## 6. Test Strategy

### 6.1 Unit tests (Vitest — existing foundation from DP-11)

All tests in `src/validators/slaValidator.test.ts` and
`src/services/adapter.stepMapping.test.ts`.

| Test area | What to cover |
|---|---|
| `validateSlaConfig` — happy path | slaEnabled=true with all required fields set → empty error map |
| `validateSlaConfig` — missing duration | Returns error on `slaDuration` field |
| `validateSlaConfig` — invalid warning pct (0, 100, 101) | Returns error on `slaWarningPct` |
| `validateSlaConfig` — escalation without SLA | Returns error on `escalationEnabled` |
| `validateSlaConfig` — SpecificUser with no userId | Returns error on `escalationUserId` |
| `validateSlaConfig` — SpecificTeam with no teamId | Returns error on `escalationTeamId` |
| `validateSlaConfig` — Role with no roleId | Returns error on `escalationRoleId` |
| `validateSlaConfig` — ManagerOfAssignee with no target lookup | No error (manager resolved at runtime) |
| `buildStepBody` — SLA enabled, all fields set | Body contains correct Dataverse field names and option-set integer codes |
| `buildStepBody` — SLA disabled | Body contains explicit nulls for all 9 SLA sub-fields |
| `mapStep` — raw Dataverse response with SLA fields | WorkflowStep carries correct typed values (option codes → type union values) |
| `mapStep` — raw response with null SLA fields | WorkflowStep defaults to `slaEnabled=false`, all SLA fields null |
| Option-set code round-trip | Forward map → inverse map → forward map is identity for all 4 option sets |

Target: 100% branch coverage of `slaValidator.ts` and all SLA-related branches of
`buildStepBody` / `mapStep`. These are pure functions with no DOM dependency.

### 6.2 Integration test

One test against `org5869857f` (or a dedicated test process):
1. Create a step with all 11 SLA fields populated.
2. Read back the step via `getSteps`.
3. Assert all 11 fields match exactly (AC-8).
4. Update the step with `slaEnabled = false`.
5. Read back; assert all SLA fields are null.

### 6.3 UI tests (Playwright)

| Scenario | Assert |
|---|---|
| Open step panel — section collapsed | "SLA & Escalation" visible; no SLA fields rendered |
| Toggle SLA on | SLA sub-fields appear |
| Toggle escalation on | Escalation action + target fields appear |
| Select SpecificUser target type | User search control appears; no team/role control |
| Select ManagerOfAssignee | Explanatory note appears; no lookup |
| Save without duration | Field-level error "Duration must be a positive whole number." appears; no save occurs |
| Save with SLA configured | Canvas step card shows SLA badge |
| Reload page | SLA configuration loads back correctly |

---

## 7. Resolved Open Questions

### OQ-1 — Business calendar source

**Resolution:** The designer stores `BusinessDays` as an intent code (option-set value
100000002). The designer never calculates business days. CWFD-005 owns the calendar
resolution. The architect recommends a `qdb_business_calendar` config entity for
CWFD-005 with a system-default M–F row. This entity is not in DP-2 scope. The
CWFD-005 contract note (§2.3) documents this dependency explicitly.

**Design consequence for DP-2:** No change to schema or UI. The warning threshold
field help text says "elapsed time calculation for Business Days requires the CWFD-005
runtime." This is the only reference to the calendar constraint visible to the maker.

### OQ-5 — Warning threshold behaviour

**Resolution:** V1 stores `qdb_sla_warning_pct` only. No warning action or warning
target field is introduced. The runtime sends a CRM notification to the task's current
assignee at the threshold percentage. The help text on the field reflects this:
"Notifies the task assignee when this percentage of the SLA has elapsed."

If V2 requires a configurable warning target or action, two new fields
(`qdb_warning_action`, `qdb_warning_target_type`) and associated lookups would be
added. The schema design leaves room for this without conflict.

---

## 8. Architectural Risks

| Rank | Risk | Impact | Probability | Mitigation |
|---|---|---|---|---|
| R-1 | Dual-adapter drift: SLA fields added to one adapter but not the other | HIGH — silent data loss on the missed adapter | Medium | Phase 4 code review checklist must verify both files. Integration test runs against the ODataAdapter path (local dev) AND DataverseAdapter path (live org) |
| R-2 | Lookup null-clear on PATCH: Dataverse API semantics for clearing single-value nav-props may differ between Xrm.WebApi and OData fetch | MEDIUM — stale lookup references after SLA is disabled | Medium | Phase 4 must test null-clear on both adapters. Fallback: re-write the binding with the next valid non-null value rather than null-clearing (operational workaround) |
| R-3 | PreviousStepCompleted SLA basis cannot be enforced | MEDIUM — maker configures a basis the runtime silently ignores | Low–Medium | CWFD-005 contract (§2.2) specifies fallback to TaskCreated with a configuration warning. Designer UI does not need to warn (the option is valid to configure; only runtime enforcement is uncertain) |
| R-4 | ISopAdapter not available in all ICrmAdapter contexts | LOW — role dropdown is empty, blocking escalation-to-role configuration | Low | isSopAdapter() guard in panel; roles fail gracefully to empty list; in practice both production adapters implement ISopAdapter |
| R-5 | Bundle size increase exceeds 20 KB NFR-007 target | LOW — well within typical React component addition | Low | Phase 4 to measure post-build bundle delta. New SLA section is ~150–250 lines of React; expected increase < 10 KB uncompressed |
| R-6 | ManagerOfAssignee silent no-op if CRM user hierarchy is not populated | MEDIUM — escalation fires but has no target | Low | The designer cannot pre-validate the hierarchy. CWFD-005 must log a structured error when manager resolution returns null; a future designer enhancement could warn the maker via a real-time Dataverse check |
| R-7 | CWFD-005 is cancelled; DP-2 fields become permanently inert | LOW — fields are nullable and harmless | Low | CEO confirmed CWFD-005 is on roadmap (scope lock). Fields are additive; no regression if runtime never comes |

---

## Skeptic Review

> CHALLENGE 1 — Dual buildStepBody: Both DataverseAdapter and ODataAdapter have
> independent `buildStepBody` implementations that are manually kept in sync. Adding 14
> more field mappings to both doubles the surface area for the known "dual-adapter drift"
> risk (R-1). What is the single test that would catch a mis-sync between the two
> implementations today?

> CHALLENGE 2 — Lookup null-clear: The existing adapter code never explicitly clears a
> lookup when the assignee type changes — it simply stops writing the old nav-prop bind.
> This means previous lookup values can persist in Dataverse silently. The architecture
> calls out this risk (R-2) but defers it to Phase 4. Is "verify during Phase 4" strong
> enough, or should the architect mandate a specific null-clear approach now (e.g., an
> explicit dissociation DELETE call on the $ref endpoint) to prevent stale lookup data
> from corrupting CWFD-005 runtime behaviour?

> CHALLENGE 3 — slaValidator pure function: Validation lives in `slaValidator.ts` and
> is "called before the setStep call". Which component calls it — the panel's save button
> handler, the store's setStep action, or useWorkflowSave? If it lives in the panel
> handler, it is bypassed by any code that calls setStep directly (e.g., a future bulk
> import). If it lives in useWorkflowSave, it fires too late (after the user has moved
> on). The architecture does not pick a definitive call site.

> CHALLENGE 4 — $select string growth: The $select string in getSteps is already long
> (180+ chars before DP-2 additions). Adding 14 more parameters pushes it further. What
> is the URL length limit in Xrm.WebApi.retrieveMultipleRecords? Dataverse's OData layer
> has a documented 2000-character URI limit for some operations. Has the post-DP-2 $select
> length been measured?

> CHALLENGE 5 — PreviousStepCompleted included "to avoid a future schema addition":
> Including an option-set value that the runtime cannot currently honour is a DX risk for
> process designers who select it in good faith. If CWFD-005 ultimately cannot support
> this basis, the option must be removed from the UI — which requires a UI release
> WITHOUT a schema change. Is the option-set code included as a convenience to the
> schema team, or will the UI actually expose it to makers in Phase 4?

> CHALLENGE 6 — Warning threshold UX: "Leave blank to skip" is not the same as a
> disabled state. A maker who enters 75 then wants to remove the warning must delete the
> value, leaving an empty field. What is the validation state for a blank, non-zero field?
> An empty number input often serialises as 0 in React — is 0 treated as "no warning"
> (i.e., null) or as an invalid input (1–99 check)?

> CHALLENGE 7 — No changes to useWorkflowSave "automatically included": The architecture
> states SLA fields are passed through automatically because step is spread in full.
> But lines 95–104 of useWorkflowSave construct the createStep call with explicit field
> spread: `{ ...step, processId: resolvedProcessId, recordEntityId: ..., regardingFieldId: ..., parentEntityId: ... }`.
> The SLA fields are on `step`, so they ARE included in the spread. Confirm this is not
> a false automatic assumption — i.e., confirm that buildStepBody handles unknown or
> undefined SLA fields gracefully when step objects loaded before the schema is
> provisioned return null for all SLA fields.

These challenges must be addressed before Phase 4 begins.
