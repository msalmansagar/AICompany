# DP-2b — Phase 3 Architecture
# SLA / Escalation Configuration on SOP Template Steps

**Project:** DP-2b (CWFD)
**Parent system:** CRM Workflow Designer (CWFD)
**Date:** 2026-07-22
**Architect:** Maqsad AI — Solution Architect
**Status:** Complete — Pending Phase 4 authorization
**Predecessor:** DP-2 Phase 3 Architecture (dp-2-sla-escalation/phase-3-arch.md)

---

## System Overview

DP-2b extends the SOP template step (`qdb_sopstep`) with the same 11 SLA and
escalation fields that DP-2 added to `qdb_work_item_steps`. The architecture
reuses DP-2's shared `slaStepFields.ts` module without modification, generalizes
`SlaEscalationSection` from a `WorkflowStep`-typed component to an entity-agnostic
`SlaConfigInput`-typed component, and introduces a one-time `copySlaFields` helper
in `deriveProcessFromSop.ts` to snapshot the SOP step's SLA configuration onto
each derived process step at derivation time. The entire feature is config-only
and inert at runtime — identical framing to DP-2.

---

## Component Diagram

```
 CWFD React Web Resource (single bundle)
 ┌──────────────────────────────────────────────────────────────────┐
 │                                                                  │
 │  SopStepPanel.tsx                     [UPDATED]                 │
 │  ├── [existing] Node Type / Channel / Name / Description / Role  │
 │  └── [NEW] SLA & Escalation (collapsed by default)             │
 │       └── SlaEscalationSection (GENERALIZED — see ADR-2b-001)  │
 │             value: SlaConfigInput                                │
 │             onChange: (patch) => onUpdateStep(patch)            │
 │             disabled: sopIsPublished   (OQ-3 resolution)        │
 │                                                                  │
 │  SlaEscalationSection.tsx             [UPDATED — generalized]   │
 │  ├── Previously: typed to WorkflowStep                          │
 │  └── Now:  value: SlaConfigInput + onChange + disabled          │
 │      (callers on process side unchanged in behaviour)            │
 │                                                                  │
 │  slaStepFields.ts                     [EXTENDED — 1 new fn]     │
 │  ├── [existing] SLA_SELECT_COLUMNS  — reused as-is             │
 │  ├── [existing] emptySlaFields()    — reused as-is             │
 │  ├── [existing] mapSlaFields(raw)   — reused as-is             │
 │  ├── [existing] buildSlaBody(data)  — reused as-is             │
 │  ├── [existing] buildEscalationBindPatches(rNP, entity, data)  │
 │  │              entity = 'qdb_sopstep' for SOP side            │
 │  └── [NEW]     copySlaFields(sopStep: SopStep) → SlaConfigInput │
 │                 (one-time snapshot copy at derivation time)      │
 │                                                                  │
 │  SopTypes.ts                          [UPDATED]                 │
 │  ├── SopStep: +14 SLA fields (same types as WorkflowStep)       │
 │  ├── CreateSopStepRequest: +11 optional SLA fields              │
 │  └── UpdateSopStepRequest: +11 optional SLA fields              │
 │                                                                  │
 │  WorkflowTypes.ts                     [UPDATED — 1 new type]    │
 │  └── [NEW] SlaConfigInput interface (11-field subset)           │
 │            (extracted from the 14 fields on WorkflowStep)       │
 │                                                                  │
 │  DataverseAdapter.ts                  [UPDATED]                 │
 │  ├── getSopSteps   — $select + SLA_SELECT_COLUMNS + mapSlaFields│
 │  ├── createSopStep — buildSlaBody + buildEscalationBindPatches  │
 │  └── updateSopStep — buildSlaBody + buildEscalationBindPatches  │
 │                      (entity = 'qdb_sopstep')                   │
 │                                                                  │
 │  ODataAdapter.ts                      [UPDATED — same changes]  │
 │                                                                  │
 │  deriveProcessFromSop.ts              [UPDATED]                 │
 │  └── createStep call: spread copySlaFields(sopStep) into body   │
 │                                                                  │
 │  slaValidator.ts                      [NO CHANGE]               │
 │  └── validateSlaConfig(value: SlaConfigInput) → FieldErrorMap  │
 │      SopStepPanel calls this on its save path (same as process) │
 │                                                                  │
 │  sopStore.ts                          [NO CHANGE]               │
 │  └── updateStep(id, patch: Partial<SopStep>) carries SLA fields │
 │      automatically once SopStep type is extended                 │
 │                                                                  │
 └──────────────────────────────────────────────────────────────────┘
                │  Dataverse Web API (OData v4)
                ▼
 qdb_sopstep        [EXTENDED — 11 new fields, 3 new 1:N relationships]
 qdb_work_item_steps [NO CHANGE — DP-2 fields, populated by derivation]
 qdb_SLADurationUnit, qdb_SLABasis, qdb_EscalationAction,
 qdb_EscalationTargetType  [REUSED global option sets — NO CHANGE]
 systemuser, team, qdb_role  [REUSED lookup targets — NO CHANGE]
```

---

## Technology Stack

| Layer | Technology | Reason / ADR reference |
|---|---|---|
| UI framework | React + TypeScript | Existing CWFD stack (ADR-001); no deviation |
| State management | Zustand sopStore flat-patch | Existing SOP pattern; `Partial<SopStep>` carries new SLA fields automatically |
| CRM communication | Dual adapter (DataverseAdapter / ODataAdapter) | ADR-002 — no deviation; both adapters updated in parallel |
| Schema storage | Dataverse fields on `qdb_sopstep` | CEO-locked scope; mirrors DP-2 pattern on `qdb_work_item_steps` |
| Option sets | 4 global option sets from DP-2 — reused by MetadataId reference | NFR-001 / BR-007 — no new option sets permitted |
| Validation | Pure TypeScript `slaValidator.ts` — reused from DP-2 | No library; testable without React mount; already covers SlaConfigInput shape |
| Provisioning | Node.js script using `crm-api-client.js` pattern | Existing script pattern (`add-sop-steptype-field.js`, etc.) |

---

## Architecture Decision Records

See `dp-2b-sla-sop/adrs/` for full ADR documents.

| ADR | Title | Status |
|---|---|---|
| ADR-2b-001 | SlaEscalationSection Component Generalization | Accepted |
| ADR-2b-002 | Copy-Not-Link Inheritance at Derivation Time | Accepted |
| ADR-2b-003 | Separate OTM Relationships for qdb_sopstep Lookup Fields | Accepted |

---

## 1. Dataverse Schema Design

### 1.1 New fields on `qdb_sopstep`

All 11 fields are nullable. Publisher prefix: `qdb_`. Field logical names are
identical to those on `qdb_work_item_steps` — this identity is the structural
premise that enables shared-module reuse (see §4).

| # | Logical name | Display name | Type | Allowed values / Details |
|---|---|---|---|---|
| 1 | `qdb_sla_enabled` | SLA Enabled | Two Options (boolean) | Default: false |
| 2 | `qdb_sla_duration` | SLA Duration | Whole Number | Positive integer; null when SLA disabled |
| 3 | `qdb_sla_duration_unit` | SLA Duration Unit | Option Set (global: `qdb_SLADurationUnit`) | Hours / CalendarDays / BusinessDays |
| 4 | `qdb_sla_basis` | SLA Clock Basis | Option Set (global: `qdb_SLABasis`) | TaskCreated / TaskAssigned / PreviousStepCompleted |
| 5 | `qdb_sla_warning_pct` | Warning Threshold (%) | Whole Number | 1–99; null = no warning |
| 6 | `qdb_escalation_enabled` | Escalation Enabled | Two Options (boolean) | Default: false |
| 7 | `qdb_escalation_action` | Escalation Action | Option Set (global: `qdb_EscalationAction`) | Reassign / Notify / Flag / ReassignAndNotify |
| 8 | `qdb_escalation_target_type` | Escalation Target Type | Option Set (global: `qdb_EscalationTargetType`) | SpecificUser / SpecificTeam / ManagerOfAssignee / Role |
| 9 | `qdb_escalation_user` | Escalation User | Lookup → `systemuser` | Active when target type = SpecificUser |
| 10 | `qdb_escalation_team` | Escalation Team | Lookup → `team` | Active when target type = SpecificTeam |
| 11 | `qdb_escalation_role` | Escalation Role | Lookup → `qdb_role` | Active when target type = Role |

### 1.2 New 1:N relationships for the three lookup fields

Fields 9–11 require new OTM relationships on `qdb_sopstep`. These must have
distinct schema names from the equivalent relationships on `qdb_work_item_steps`
(see ADR-2b-003). Proposed relationship schema names:

| Relationship schema name | Referencing entity | Referencing attribute | Referenced entity |
|---|---|---|---|
| `qdb_systemuser_qdb_sopstep_escalation_user` | `qdb_sopstep` | `qdb_escalation_user` | `systemuser` |
| `qdb_team_qdb_sopstep_escalation_team` | `qdb_sopstep` | `qdb_escalation_team` | `team` |
| `qdb_role_qdb_sopstep_escalation_role` | `qdb_sopstep` | `qdb_escalation_role` | `qdb_role` |

**Nav-prop names are resolved at runtime** by `resolveNavProp('qdb_sopstep', 'qdb_escalation_user')` etc. in both adapters. No nav-prop name is hardcoded in application code.

### 1.3 Global option sets — reused by MetadataId

The 4 global option sets provisioned in DP-2 are referenced on `qdb_sopstep`
by their MetadataId at attribute creation time. The provisioning script (§2)
fetches each option set's MetadataId at runtime before creating the attribute.
This is the same bind-by-MetadataId pattern mandated by DP-2 ADR-008 to prevent
Dataverse from creating a new local copy.

---

## 2. Provisioning Script Design

**File:** `scripts/add-sla-sopstep-fields.js`

**Purpose:** Create the 11 new SLA fields and 3 lookup relationships on
`qdb_sopstep`. Idempotent — all 11 fields are checked for existence before
creation; existing fields are skipped without error.

**Dependencies:**
- `scripts/crm-api-client.js` — shared auth + HTTP helpers (existing)
- `scripts/sla-option-codes.js` — the named constants for the 4 global option
  set MetadataIds (produced by DP-2; must exist before this script is run)

**Script structure:**

```
Phase 1 — Acquire token (crm-api-client.getToken)
Phase 2 — Fetch MetadataIds of all 4 global option sets from Dataverse
           EntityDefinitions for GlobalOptionSetMetadata
           (same lookup pattern as the DP-2 add-sla-fields.js script)
Phase 3 — Create scalar fields (fields 1–8) if not already present:
           Fields 1, 6: BooleanAttributeMetadata (Two Options)
           Fields 2, 5: IntegerAttributeMetadata (Whole Number)
           Fields 3, 4, 7, 8: PicklistAttributeMetadata bound to global option
             set MetadataId (IsGlobal: true, GlobalOptionSetMetadata.MetadataId)
Phase 4 — Create 3 lookup fields (fields 9–11) via 1:N relationship definitions
           POST to /RelationshipDefinitions
           Body: OneToManyRelationshipMetadata with the schema names from §1.2
           Each create is idempotent: check RelationshipDefinitions by schema
             name before creating
Phase 5 — Publish qdb_sopstep entity to activate new fields
```

**Key constraint:** Option set fields must use the global option set bind pattern
(pass `MetadataId` under `GlobalOptionSet`), not the entity-local pattern
(which would create a new local copy). The lesson from DP-2's provisioning: never
use `IsGlobal: false` with the same name — Dataverse will silently create a
local duplicate.

---

## 3. Type Layer Design

### 3.1 WorkflowTypes.ts — new `SlaConfigInput` interface

A new extracted interface containing only the 11 SLA fields (and 3 display-name
companions). This is the shared contract for the generalized `SlaEscalationSection`.
Both `WorkflowStep` and `SopStep` embed this shape via field extension (they are
not required to extend the interface; the fields are structurally compatible).

```typescript
// New export in WorkflowTypes.ts
export interface SlaConfigInput {
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

`WorkflowStep` already carries these 14 fields (per DP-2). It is structurally
assignable to `Pick<WorkflowStep, SlaConfigInputKeys>` = `SlaConfigInput`.

### 3.2 SopTypes.ts — SopStep extended

`SopStep` gains all 14 SLA-related fields. Import of `SlaDurationUnit`,
`SlaBasis`, `EscalationAction`, `EscalationTargetType`, and `SlaConfigInput`
from `WorkflowTypes.ts` avoids duplicating type definitions.

```typescript
// Added to SopStep interface in SopTypes.ts
import type {
  SlaDurationUnit, SlaBasis, EscalationAction, EscalationTargetType
} from '@/types/WorkflowTypes';

export interface SopStep {
  // ... all existing fields unchanged ...

  // SLA configuration — matches WorkflowStep shape exactly
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

`CreateSopStepRequest` and `UpdateSopStepRequest` gain the same 11 persistence
fields (no display-name fields — those are read-only from Dataverse):

```typescript
// Additions to both CreateSopStepRequest and UpdateSopStepRequest
slaEnabled?: boolean;
slaDuration?: number | null;
slaDurationUnit?: SlaDurationUnit | null;
slaBasis?: SlaBasis | null;
slaWarningPct?: number | null;
escalationEnabled?: boolean;
escalationAction?: EscalationAction | null;
escalationTargetType?: EscalationTargetType | null;
escalationUserId?: string | null;
escalationTeamId?: string | null;
escalationRoleId?: string | null;
```

---

## 4. Shared Module Reuse Verdict — `slaStepFields.ts`

**Verdict: the shared module requires one new function (`copySlaFields`) and
is otherwise fully reusable for `qdb_sopstep` without modification.**

Rationale for each function in the module:

| Function / constant | Used for sopstep? | Reason |
|---|---|---|
| `SLA_SELECT_COLUMNS` | Yes, unchanged | Column names are identical on both entities (same `qdb_*` logical names) |
| `emptySlaFields()` | Yes, unchanged | Returns a zero-state SLA object; entity-agnostic |
| `mapSlaFields(raw)` | Yes, unchanged | Maps raw Dataverse column names → typed values; column names are identical |
| `buildSlaBody(data)` | Yes, unchanged | Maps typed SLA fields → Dataverse column names; column names are identical |
| `buildEscalationBindPatches(resolveNavProp, entity, data)` | Yes, unchanged | Takes `entity` as a parameter; calling with `'qdb_sopstep'` resolves the correct nav props via `resolveNavProp('qdb_sopstep', 'qdb_escalation_user')` etc., which return the `qdb_sopstep`-specific relationship nav prop names from §1.2 |
| `copySlaFields(sopStep)` | NEW — added in DP-2b | Direct field-to-field copy from `SopStep` → `SlaConfigInput`, for use in `deriveProcessFromSop.ts` (see §7) |

**Prerequisite:** If DP-2's Phase 4 embeds SLA logic directly inside
`DataverseAdapter` / `ODataAdapter` without extracting `slaStepFields.ts`,
DP-2b Phase 4 must perform that extraction first. This is a Phase 4 pre-condition
that the tech lead must confirm before DP-2b build begins.

---

## 5. Adapter Layer Design

### 5.1 getSopSteps — $select extension

Both adapters extend the `$select` string in `getSopSteps` by appending
`SLA_SELECT_COLUMNS`:

```
// Existing columns:
qdb_sopstepid,qdb_name,qdb_description,qdb_sequenceno,qdb_steptypecode,
qdb_executionchannel,qdb_decisionlabel,_qdb_sop_id_value,_qdb_role_id_value

// Appended from SLA_SELECT_COLUMNS:
,qdb_sla_enabled,qdb_sla_duration,qdb_sla_duration_unit,qdb_sla_basis,
qdb_sla_warning_pct,qdb_escalation_enabled,qdb_escalation_action,
qdb_escalation_target_type,
_qdb_escalation_user_value,
_qdb_escalation_user_value@OData.Community.Display.V1.FormattedValue,
_qdb_escalation_team_value,
_qdb_escalation_team_value@OData.Community.Display.V1.FormattedValue,
_qdb_escalation_role_value,
_qdb_escalation_role_value@OData.Community.Display.V1.FormattedValue
```

`mapSopStep` adds a spread of `mapSlaFields(raw)` at the end:
```typescript
function mapSopStep(raw: Record<string, unknown>): SopStep {
  // existing field mappings...
  return {
    id: ..., name: ..., /* all current fields */,
    ...mapSlaFields(raw),   // NEW: maps the 14 SLA fields from raw
  };
}
```

### 5.2 createSopStep — SLA body + escalation binds

**DataverseAdapter:** The inline body-building in `createSopStep` is extended:
```typescript
// After building the existing body:
const slaBody = buildSlaBody(data);          // NEW
Object.assign(body, slaBody);                 // NEW

// Then resolve and apply escalation nav-prop binds:
const patches = await buildEscalationBindPatches(
  (e, a) => this.resolveNavProp(e, a),       // NEW
  'qdb_sopstep',                              // NEW entity arg
  data,
);
Object.assign(body, patches);                 // NEW
```

**ODataAdapter:** Same pattern using its `resolveNavProp` method.

### 5.3 updateSopStep — SLA body + escalation binds + null-clear

When `slaEnabled = false` in the update payload:
- `buildSlaBody` emits explicit `null` for all 9 SLA sub-fields
- `buildEscalationBindPatches` emits null for all 3 lookup fields

This clears previously persisted SLA config from the record (same null-clear
pattern as DP-2 for `qdb_work_item_steps`). The same Dataverse PATCH semantics
apply: field set to `null` clears the value.

---

## 6. UI Design

### 6.1 SlaEscalationSection generalization (ADR-2b-001)

The component's current prop signature (post-DP-2):
```typescript
interface SlaEscalationSectionProps {
  step: WorkflowStep;          // tightly coupled to WorkflowStep
  onChange: (step: Partial<WorkflowStep>) => void;
  adapter: ICrmAdapter;
  errors: FieldErrorMap;
}
```

Generalized prop signature (DP-2b change):
```typescript
interface SlaEscalationSectionProps {
  value: SlaConfigInput;       // decoupled — accepts any entity's SLA fields
  onChange: (patch: Partial<SlaConfigInput>) => void;
  adapter: ICrmAdapter;        // unchanged — getRoles() still on ISopAdapter
  errors: FieldErrorMap;       // unchanged
  disabled?: boolean;          // NEW — for published SOP (OQ-3)
}
```

**Impact on the process side (StepPropertiesPanel):** the caller extracts SLA
fields from the `WorkflowStep` in the Zustand store:
```typescript
// Inside StepPropertiesPanel — no behavioural change, only reshape at call site
const slaValue: SlaConfigInput = {
  slaEnabled: step.slaEnabled,
  /* all 13 other SLA fields from step */
};
<SlaEscalationSection
  value={slaValue}
  onChange={(patch) => setStep({ ...step, ...patch })}
  adapter={adapter}
  errors={slaErrors}
/>
```

**Impact on the SOP side (SopStepPanel):**
```typescript
// Inside SopStepPanel
<SlaEscalationSection
  value={{
    slaEnabled: step.slaEnabled,
    /* all 13 other SLA fields from step */
  }}
  onChange={(patch) => onUpdateStep(patch)}
  adapter={adapter}
  errors={slaErrors}
  disabled={sopIsPublished}
/>
```

### 6.2 SopStepPanel changes

New props added to `SopStepPanelProps`:
- `sopIsPublished: boolean` — passed from the SOP canvas parent, derived from `sop.status === SOP_STATUS.PUBLISHED`
- `slaErrors: FieldErrorMap` — populated after a failed save attempt

New state:
- `slaErrors: FieldErrorMap` (local state, set on save validation failure)
- `isSlaSectionExpanded: boolean` (collapsed by default)

New render section at the bottom of the panel body:

```
┌─ SopStepPanel — extended bottom section ──────────────────────┐
│  [existing sections unchanged above]                          │
│  ─────────────────────────────────────────────────────────    │
│  [NEW] ▶ SLA & Escalation           [collapsed badge]        │
│          (collapsed by default; expand to configure)          │
│                                                               │
│  [expanded, when sopIsPublished = true]                       │
│  [!] This SOP is published. Set it to Draft to edit SLA.     │
│  [all SLA controls rendered read-only]                        │
│                                                               │
│  [expanded, when sopIsPublished = false]                      │
│  [!] Configuration only — enforcement requires CWFD-005.      │
│  [same SLA controls as StepPropertiesPanel — fully editable]  │
└───────────────────────────────────────────────────────────────┘
```

SLA summary badge on the collapsed section header when `slaEnabled = true`:
`SLA: 2 Business Days | Notify` — mirrors DP-2's process step badge format.

### 6.3 OQ-3 Resolution — Published SOP editing

**Decision: SLA configuration is read-only when the parent SOP is published.**

Rationale:
1. A published SOP is the authoritative template. Modifying SLA on a published
   SOP would only affect future derivations (BR-003 snapshot model), not
   already-derived processes. Makers cannot easily reason about this divergence.
2. The "set to Draft → edit → re-publish" workflow is the established CWFD
   pattern for published entity changes.
3. The read-only state is safe: the `disabled` prop on `SlaEscalationSection`
   prevents mutation; no data loss risk.

Implementation: the parent SOP canvas component passes the SOP's status to
`SopStepPanel` via the new `sopIsPublished` prop. The canvas already holds
the SOP record (loaded for display). No new API calls are needed.

**What is NOT read-only:** The existing non-SLA fields in `SopStepPanel`
(name, description, role, step type, etc.) retain their current mutability.
DP-2b introduces SLA-section read-only only; it does not widen the scope
to make the entire panel read-only on published SOPs. That is a separate UX
decision for a future engagement.

### 6.4 Canvas SLA badge on SOP step nodes

SOP step node cards gain an SLA summary badge when `slaEnabled = true`,
matching the badge introduced on process step cards in DP-2. The SOP canvas
node data builder (wherever it assembles node data from `SopStep`) passes through:
- `slaEnabled`
- `slaDuration`
- `slaDurationUnit`
- `escalationEnabled`
- `escalationAction`

Badge text format: `SLA: {duration} {unitLabel}` optionally followed by
`| {actionLabel}` when escalation is enabled. Same truncation at 32 characters.

---

## 7. Inheritance Copy Design

### 7.1 `copySlaFields` helper (new function in `slaStepFields.ts`)

```typescript
// Copies SLA configuration from a SopStep to a SlaConfigInput
// for use in deriveProcessFromSop.ts at step creation time.
// This is a one-time snapshot — no link is maintained after copy.
export function copySlaFields(sopStep: SopStep): SlaConfigInput {
  return {
    slaEnabled: sopStep.slaEnabled,
    slaDuration: sopStep.slaDuration,
    slaDurationUnit: sopStep.slaDurationUnit,
    slaBasis: sopStep.slaBasis,
    slaWarningPct: sopStep.slaWarningPct,
    escalationEnabled: sopStep.escalationEnabled,
    escalationAction: sopStep.escalationAction,
    escalationTargetType: sopStep.escalationTargetType,
    escalationUserId: sopStep.escalationUserId,
    escalationUserName: sopStep.escalationUserName,
    escalationTeamId: sopStep.escalationTeamId,
    escalationTeamName: sopStep.escalationTeamName,
    escalationRoleId: sopStep.escalationRoleId,
    escalationRoleName: sopStep.escalationRoleName,
  };
}
```

No transformation, no default substitution, no business rule application.
BR-008 mandates a direct field-to-field copy.

### 7.2 `deriveProcessFromSop.ts` change

The `createStep` call in the `for (const sopStep of sopSteps)` loop gains a
spread of `copySlaFields(sopStep)`:

```typescript
// Current (before DP-2b):
const workflowStepId = await adapter.createStep({
  name: sopStep.name,
  sequenceNo: sopStep.sequenceNo,
  /* ...other non-SLA fields... */
});

// After DP-2b:
const workflowStepId = await adapter.createStep({
  name: sopStep.name,
  sequenceNo: sopStep.sequenceNo,
  /* ...other non-SLA fields... */
  ...copySlaFields(sopStep),   // NEW: snapshot SLA from SOP step
});
```

When `sopStep.slaEnabled = false` (or all SLA fields are null on an existing SOP
step before DP-2b provisioning), `copySlaFields` returns a zero-state SLA object
equivalent to `emptySlaFields()`. The `buildSlaBody` in the adapter writes
explicit nulls for all SLA fields in this case, correctly clearing any stale
values.

**Atomicity:** The existing error-propagation model of `deriveProcessFromSop` is
unchanged. `createStep` failures propagate to the wizard as before; there is no
partial-success recovery. The SLA spread does not introduce new failure modes
(the SLA fields flow through `buildStepBodyResolved` exactly as they do on
a normal process step update via DP-2).

---

## 8. Validation Design

### 8.1 Reuse `slaValidator.ts` from DP-2

`validateSlaConfig(value: SlaConfigInput) → FieldErrorMap` — post-generalization,
the input type is already `SlaConfigInput`, not `WorkflowStep`. No changes to
the validator.

### 8.2 Call site in SopStepPanel

Validation is triggered on the SOP step panel's save button, before `onUpdateStep`
is called:

```typescript
const handleSave = () => {
  const errors = validateSlaConfig(slaDraft);
  if (Object.keys(errors).length > 0) {
    setSlaErrors(errors);
    return;   // block save; display inline field errors
  }
  setSlaErrors({});
  onUpdateStep(slaDraft);
};
```

`slaDraft` is the local edit state for SLA fields within the panel (the panel
does not mutate the store on every keypress; only on save).

### 8.3 SOP publish gate

**Recommendation:** If a SOP publish action exists (setting status to PUBLISHED),
the publish gate should run `validateSlaConfig` on each step before allowing
publish. Steps with `slaEnabled = true` but invalid SLA config (e.g., duration
missing) should block publish with a clear message identifying the step.

This is a should-have, not a must-have for DP-2b. If the SOP publish path is
not in the current SOP canvas scope, document it as a known gap and defer to
the next SOP engagement.

---

## 9. sopStore Assessment (OQ-6)

`sopStore.ts` uses `updateStep(id: string, patch: Partial<SopStep>)` for all
SOP step mutations. Adding 14 optional nullable fields to `SopStep` is safe:
- `Partial<SopStep>` already accepts partial patches; the new fields are included
- Selectors that derive data from `SopStep` arrays (e.g., graph builders) do not
  inspect SLA fields and are unaffected
- `sopValidator.ts` validates SOP-level fields (name, version, step presence),
  not step-level SLA; no changes needed
- The canvas data builder that creates step node data will need to be extended
  to pass SLA summary fields (slaEnabled, slaDuration, escalationEnabled,
  escalationAction) through to the step node component for the badge (§6.4)

**Verdict: no store action changes required. One canvas data builder method
requires extension for the badge.**

---

## 10. Test Strategy

### 10.1 Unit tests (Vitest)

**`slaStepFields.test.ts` — SOP-side additions:**

| Test | What to assert |
|---|---|
| `copySlaFields` — SLA enabled SopStep | All 14 fields copied exactly; no transformation |
| `copySlaFields` — SLA disabled SopStep | slaEnabled=false, all other SLA fields null |
| `mapSlaFields` with qdb_sopstep raw data | Same as existing test but verified against sopstep column names (identical — should pass without changes) |
| `buildSlaBody` with SopStep SLA data | Output column names match qdb_sopstep logical names (same as work_item_steps — should pass) |

**`deriveProcessFromSop.test.ts` — inheritance copy:**

| Test | What to assert |
|---|---|
| SOP step with slaEnabled=true | `createStep` spy receives all SLA fields matching the sopStep values |
| SOP step with slaEnabled=false | `createStep` spy receives slaEnabled=false and all SLA fields null |
| Mixed SOP (2 SLA steps, 1 non-SLA step) | First two createStep calls carry SLA; third has null SLA |

**`slaValidator.test.ts` — no new tests** (existing validator tests already cover
`SlaConfigInput` shape post-generalization; confirm no regression).

**`sopStepPanel.test.ts` — SLA section:**

| Test | What to assert |
|---|---|
| Panel renders with SLA section collapsed | No SLA fields visible; expand control present |
| Toggle SLA on | SLA sub-fields appear |
| Save with SLA enabled but no duration | `validateSlaConfig` returns error; `onUpdateStep` NOT called |
| Published SOP (sopIsPublished=true) | SLA section controls are disabled; notice visible |
| Draft SOP (sopIsPublished=false) | SLA section controls are enabled |

### 10.2 Integration tests (Vitest against org5869857f)

| Test | Steps |
|---|---|
| SOP step SLA round-trip | Create sopstep with all 11 SLA fields → getSopSteps → assert all 11 fields match |
| SOP step SLA null round-trip | Create sopstep with slaEnabled=false → getSopSteps → assert slaEnabled=false, all SLA sub-fields null |
| SLA field update + clear | updateSopStep with slaEnabled=true then updateSopStep with slaEnabled=false → assert all SLA fields null |
| Derivation inheritance | SOP with 3 steps (2 SLA, 1 non-SLA) → deriveProcessFromSop → getSteps on derived process → assert SLA values match SOP step values; 3rd process step has null SLA |

### 10.3 Playwright UI tests

| Scenario | Assert |
|---|---|
| SOP canvas — SLA badge | SLA-configured step card shows badge; non-SLA step shows no badge |
| SopStepPanel — round-trip | Set SLA on step, save, reload step → SLA config loaded back correctly |
| Published SOP | Step panel SLA section shows read-only notice; inputs non-interactive |
| Derivation + inherited badge | Derive process from SLA-configured SOP → open derived process canvas → process step cards show SLA badge |

---

## 11. Architectural Risks

| Rank | Risk | Impact | Mitigation |
|---|---|---|---|
| R-1 (HIGH) | DP-2 Phase 4 not yet built — `slaStepFields.ts` may not be extracted as a standalone module. If SLA logic is inlined inside the adapter, DP-2b Phase 4 must refactor DP-2's adapter code before building DP-2b. This widens Phase 4 scope. | HIGH — scheduling impact | Phase 4 pre-condition: confirm `slaStepFields.ts` exists as a standalone module before starting DP-2b build. If not, extract it from DP-2's adapters as the first Phase 4 task. Document as a prerequisite in Phase 4 kickoff. |
| R-2 (HIGH) | OQ-1 — C# plugin: `qdb_CreateProcessFromSop` is confirmed "not registered" by code comment, but that comment may be stale. If a server-side derivation path is active in any production deployment, the TypeScript inheritance copy is bypassed entirely. Scope doubles with a C# workstream. | HIGH — scope impact | CEO must obtain explicit confirmation from QDB Platform Team before Phase 4. Carry as a hard gate. |
| R-3 (MEDIUM) | Lookup relationship name collision: if a relationship with the proposed schema name already exists in the solution (from a prior attempt or a different field), the provisioning script will fail. | MEDIUM — provisioning failure | Provisioning script checks RelationshipDefinitions by schema name before creating. If a collision is found, log clearly and exit with a named error. Test provisioning in dev org before production. |
| R-4 (MEDIUM) | Dual-adapter drift: SLA fields must be added to both adapters' `getSopSteps`, `createSopStep`, and `updateSopStep` identically. A partial update leaves one adapter silently dropping SLA data. | MEDIUM — silent data loss on one adapter | Phase 4 code review checklist must verify all three method pairs. Integration tests run on BOTH adapters (DataverseAdapter against org5869857f; ODataAdapter against local dev proxy). |
| R-5 (MEDIUM) | `sopIsPublished` prop not wired in canvas caller: if the parent SOP canvas doesn't pass the correct published status, the SLA section is editable on published SOPs (violating OQ-3 decision). | MEDIUM — UX regression | Playwright test for published-SOP read-only state. Canvas caller code review in Phase 4 checklist. |
| R-6 (LOW) | SLA on `PreviousStepCompleted` basis — same as DP-2 R-3. The SOP step SLA config inherits this option; the SOP canvas cannot pre-validate whether the CWFD-005 runtime supports it. | LOW — inert until CWFD-005 | Carry DP-2's tooltip ("Previous Step Completed requires the runtime to track step-completion timestamps") into the SOP SLA section. |
| R-7 (LOW) | Bundle size: the generalized `SlaEscalationSection` adds one new prop and the `SopStepPanel` SLA section adds ~80–120 new lines of React. Expected increase < 5 KB uncompressed, well within NFR-009 (10 KB limit). | LOW | Measure post-build delta in Phase 4. |
| R-8 (LOW) | Escalation lookup GUIDs (user/team/role) are org-specific. A SOP step configured with a specific user GUID in org5869857f will produce a derived process step with that GUID, which is only valid in that org. Cross-org SOP import (if it exists) would produce invalid lookup references. | LOW — cross-org import is out of scope | Document explicitly: SLA lookup targets are org-specific. Cross-org SOP portability is a future engagement concern. |

---

## Skeptic Review

> CHALLENGE 1 — slaStepFields.ts shared module assumption: The entire DP-2b
> architecture depends on DP-2 having extracted SLA logic into a standalone
> `slaStepFields.ts` module. DP-2's Phase 3 architecture describes the logic
> inline within the adapter. If Phase 4 inlines the SLA code without extracting
> a shared module, DP-2b's "reuse" story becomes either a refactor (risky scope
> addition) or duplication (DRY violation). What prevents Phase 4 developers from
> inlining the code as described in DP-2's Phase 3, without creating the module
> DP-2b depends on?

> CHALLENGE 2 — OQ-1 C# plugin: the evidence that `qdb_CreateProcessFromSop` is
> not registered is a code comment ("Replaces the ... Custom API (not registered
> in Dataverse)"). Code comments are not Dataverse metadata. The plugin could
> have been registered after the comment was written. What stops a QDB Platform
> Team member from registering the plugin between DP-2b's architecture and its
> Phase 4 build?

> CHALLENGE 3 — copySlaFields display names: `copySlaFields` copies
> `escalationUserName`, `escalationTeamName`, `escalationRoleName` from the SOP
> step. These display names come from Dataverse FormattedValue annotations and
> are populated at query time. If the user or team record is renamed between SOP
> creation and derivation, the copied display name in the derived process step
> will be stale until a reload. Is a stale display name acceptable, or should
> `copySlaFields` set display names to null and let the first `getSteps` call
> populate them from current Dataverse data?

> CHALLENGE 4 — sopIsPublished prop threading: the `sopIsPublished` flag must
> travel from the SOP record (loaded at the SOP canvas level) down through the
> canvas → step panel. Looking at `SopStepPanel.tsx`, the panel already receives
> `adapter` and `step` but not the parent SOP. Adding `sopIsPublished` to
> `SopStepPanelProps` requires the canvas to pass it. How many components sit
> between the SOP record load and the `SopStepPanel` render? If there are
> intermediate layers, prop-drilling may be the wrong pattern — consider reading
> the SOP status from the sopStore instead.

> CHALLENGE 5 — Provisioning atomicity: the script creates 11 fields and 3
> relationships in sequence. If the script is interrupted after field 7 (e.g.,
> network timeout), a re-run skips fields 1–7 (they exist) and creates 8–11.
> But what if Dataverse accepted field 8's HTTP request, returned a 201, and
> THEN lost the record? The idempotency check passes but the field is missing.
> The re-run then attempts to create field 8 again and gets a duplicate error.
> Is the "check then create" pattern actually idempotent against Dataverse's
> consistency model?

> CHALLENGE 6 — Validation call site in SopStepPanel: the architecture places
> `validateSlaConfig` in the panel's save handler. But `SopStepPanel` currently
> doesn't have a save button — it calls `onUpdateStep` on individual field
> changes (look at `handleNameChange`, `handleRoleChange`, etc., which call
> `onUpdateStep` immediately). Introducing a save button solely for the SLA
> section creates an inconsistent UX within the same panel. If the SLA section
> follows the existing pattern (immediate update on change), where does
> validation trigger?

> CHALLENGE 7 — SLA on "subprocess" step type: `SopStepType` includes
> `subprocess`. A subprocess SOP step presumably delegates to another SOP.
> Assigning an SLA to a subprocess step is conceptually valid, but the CWFD-005
> runtime would need to decide whether the subprocess's own SLA or the parent
> step's SLA governs timing. DP-2b introduces SLA on all step types including
> subprocess without restriction. Is this intentional, or should subprocess
> steps be excluded from SLA configuration in V1?

These challenges must be addressed before Phase 4 begins.
