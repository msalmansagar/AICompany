# ADR-2b-001 — SlaEscalationSection Component Generalization

**Project:** DP-2b — SLA / Escalation on SOP Template Steps (CWFD)
**Status:** Accepted
**Date:** 2026-07-22
**Decided by:** Architect — Maqsad AI

---

## Context

DP-2 introduces a standalone `SlaEscalationSection.tsx` component for use inside
`StepPropertiesPanel`. This component is the complete SLA configuration UI:
toggles, duration fields, escalation fields, conditional lookup controls.

DP-2b requires the identical SLA UI in `SopStepPanel`. NFR-002 mandates that
the SLA section on a SOP step panel must be visually and behaviourally identical
to the SLA section on a process step panel. The DRY mandate in the constitution's
common rules prohibits duplication.

The question is how to structure the component to serve both contexts without
coupling it to either domain type.

The current (DP-2) prop signature after Phase 4 will be approximately:
```typescript
interface SlaEscalationSectionProps {
  step: WorkflowStep;
  onChange: (patch: Partial<WorkflowStep>) => void;
  adapter: ICrmAdapter;
  errors: FieldErrorMap;
}
```

`SopStepPanel` works with `SopStep`, not `WorkflowStep`. The two types share
the 14 SLA-related fields but differ in all other fields. A direct prop of
`WorkflowStep` cannot accept a `SopStep` without unsafe casting.

---

## Decision

**Extract `SlaConfigInput` and generalize the component props.**

1. Add a new `SlaConfigInput` interface to `WorkflowTypes.ts` containing only
   the 14 SLA-related fields (11 Dataverse-persisted + 3 display-name companions).

2. Change `SlaEscalationSection` props from `{ step: WorkflowStep }` to:
   ```typescript
   interface SlaEscalationSectionProps {
     value: SlaConfigInput;
     onChange: (patch: Partial<SlaConfigInput>) => void;
     adapter: ICrmAdapter;
     errors: FieldErrorMap;
     disabled?: boolean;   // for published-SOP read-only (OQ-3)
   }
   ```

3. Both callers extract SLA fields from their domain type and pass them as
   `SlaConfigInput`. The caller's `onChange` callback applies the patch to its
   respective store or state:
   - `StepPropertiesPanel`: `onChange={(patch) => setStep({ ...step, ...patch })}`
   - `SopStepPanel`: `onChange={(patch) => onUpdateStep(patch)}`

4. The component's internal render logic is unchanged — it renders the same
   controls against the same field names.

5. `disabled={true}` makes all controls non-interactive and displays a contextual
   notice. Used when `sopIsPublished = true`.

---

## Alternatives Considered

**Duplicate the SLA section in SopStepPanel (rejected):**
Copy `SlaEscalationSection`'s JSX into `SopStepPanel` under a different name.
Rejected: violates DRY and the constitution common rules. Any future SLA UI
change (e.g., adding a warning target field) must be made in two places.
Divergence is inevitable in a team context.

**Extend WorkflowStep to be a supertype of SopStep (rejected):**
Merge `SopStep` and `WorkflowStep` into a single type that covers both contexts.
Rejected: the two types represent distinct domain entities with different fields,
relationships, and persistence paths. Merging them creates a god type that violates
Single Responsibility and makes the domain model opaque.

**Use a render-prop pattern (rejected):**
Pass the field values individually as separate props rather than a shaped object.
Rejected: the component already has 14 SLA fields; individual props would exceed
the 3-parameter maximum mandated by common.md and create a brittle call site.

---

## Consequences

**Positive:**
- Single component implementation serves both process and SOP contexts.
- Future SLA UI changes (e.g., V2 warning target field) require one edit.
- `SlaConfigInput` is a well-defined, reusable type that documents exactly what
  the SLA subsystem consumes.
- The `disabled` prop enables OQ-3 (published SOP read-only) without a separate
  component variant.

**Negative / Risks:**
- `StepPropertiesPanel` (process side, DP-2) must be updated when DP-2b is built
  to reshape its `WorkflowStep` into `SlaConfigInput` at the call site. This is
  a one-time change at the call site only; the component's internal logic is
  unchanged. Risk: a developer building DP-2b may miss updating the process-side
  caller if the two changes are not treated as a coupled change set.
- If DP-2 Phase 4 completes before DP-2b Phase 4, the interim DP-2 component
  will use `WorkflowStep` as its prop. DP-2b Phase 4 will need to update the
  prop and update both callers in the same commit. The Phase 4 tech lead must
  plan for this two-caller update.
