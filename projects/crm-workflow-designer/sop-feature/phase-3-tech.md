═══════════════════════════════════════════════════════════════════════
TECHNICAL BUILD — CWFD-002 SOP DESIGNER
═══════════════════════════════════════════════════════════════════════
Project:        CRM Visual Workflow Designer — SOP Feature
Document:       phase-3-tech.md
Prepared by:    Frontend + CRM Developer + DevOps — Maqsad AI (parallel)
Date:           2026-06-12
Version:        1.0
Architecture:   sop-feature/phase-2-arch.md
═══════════════════════════════════════════════════════════════════════


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[FRONTEND] — React / TypeScript / Vite
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

─────────────────────────────────────────────────────────────────────
FILE: src/adapters/ISopAdapter.ts
─────────────────────────────────────────────────────────────────────

```typescript
// src/adapters/ISopAdapter.ts
import type { ICrmAdapter } from './ICrmAdapter';
import type {
  CrmRole,
  Sop,
  SopStep,
  SopOutcome,
  SopSummary,
  CreateRoleRequest,
  UpdateRoleRequest,
  CreateSopRequest,
  UpdateSopRequest,
  CreateSopStepRequest,
  UpdateSopStepRequest,
  CreateSopOutcomeRequest,
  UpdateSopOutcomeRequest,
  CreateProcessFromSopRequest,
} from '@/types/SopTypes';

/**
 * Extends the base CRM adapter with SOP-domain operations.
 * Implemented by DataverseAdapter only — this feature is Online-only.
 * ODataAdapter implements ICrmAdapter and remains unchanged.
 */
export interface ISopAdapter extends ICrmAdapter {
  // --- Roles ---
  getRoles(search?: string): Promise<CrmRole[]>;
  createRole(data: CreateRoleRequest): Promise<string>;
  updateRole(id: string, data: UpdateRoleRequest): Promise<void>;
  deleteRole(id: string): Promise<void>;

  // --- SOPs ---
  getSopList(): Promise<SopSummary[]>;
  getSop(id: string): Promise<Sop>;
  createSop(data: CreateSopRequest): Promise<string>;
  updateSop(id: string, data: UpdateSopRequest): Promise<void>;

  // --- SOP Steps ---
  getSopSteps(sopId: string): Promise<SopStep[]>;
  createSopStep(data: CreateSopStepRequest): Promise<string>;
  updateSopStep(id: string, data: UpdateSopStepRequest): Promise<void>;
  deleteSopStep(id: string): Promise<void>;

  // --- SOP Outcomes ---
  getSopOutcomes(sopStepId: string): Promise<SopOutcome[]>;
  createSopOutcome(data: CreateSopOutcomeRequest): Promise<string>;
  updateSopOutcome(id: string, data: UpdateSopOutcomeRequest): Promise<void>;
  deleteSopOutcome(id: string): Promise<void>;

  // --- Derivation ---
  /** Calls qdb_CreateProcessFromSop Custom API. Returns the new processId. */
  createProcessFromSop(request: CreateProcessFromSopRequest): Promise<string>;
}

/** Type guard — runtime check that an ICrmAdapter is also an ISopAdapter. */
export function isSopAdapter(adapter: ICrmAdapter): adapter is ISopAdapter {
  return (
    typeof (adapter as ISopAdapter).getSopList === 'function' &&
    typeof (adapter as ISopAdapter).createProcessFromSop === 'function'
  );
}
```

─────────────────────────────────────────────────────────────────────
FILE: src/types/SopTypes.ts
─────────────────────────────────────────────────────────────────────

```typescript
// src/types/SopTypes.ts

export const SOP_STATUS = {
  DRAFT: 100000000,
  PUBLISHED: 100000001,
  RETIRED: 100000002,
} as const;

export type SopStatus = typeof SOP_STATUS[keyof typeof SOP_STATUS];

export const ROLE_STATUS = {
  ACTIVE: 100000000,
  INACTIVE: 100000001,
} as const;

export type RoleStatus = typeof ROLE_STATUS[keyof typeof ROLE_STATUS];

export interface CrmRole {
  id: string;
  name: string;
  description: string;
  department: string;
  status: RoleStatus;
}

export interface SopSummary {
  id: string;
  name: string;
  status: SopStatus;
  version: string;
  recordTypeId: string | null;
  recordTypeName: string | null;
  derivedProcessCount: number;
}

export interface Sop {
  id: string;
  name: string;
  description: string;
  purpose: string;
  status: SopStatus;
  version: string;
  recordTypeId: string | null;
  recordTypeName: string | null;
}

export interface SopStep {
  id: string;
  name: string;
  description: string;
  sequenceNo: number;
  sopId: string;
  roleId: string | null;
  roleName: string | null;
  roleStatus: RoleStatus | null;
}

export interface SopOutcome {
  id: string;
  name: string;
  sequenceNo: number;
  sopStepId: string;
  nextSopStepId: string | null;
}

// --- Request types ---

export interface CreateRoleRequest {
  name: string;
  description: string;
  department: string;
}

export interface UpdateRoleRequest {
  name?: string;
  description?: string;
  department?: string;
  status?: RoleStatus;
}

export interface CreateSopRequest {
  name: string;
  description: string;
  purpose: string;
  version: string;
  recordTypeId: string | null;
}

export interface UpdateSopRequest {
  name?: string;
  description?: string;
  purpose?: string;
  version?: string;
  status?: SopStatus;
  recordTypeId?: string | null;
}

export interface CreateSopStepRequest {
  name: string;
  description: string;
  sequenceNo: number;
  sopId: string;
  roleId: string | null;
}

export interface UpdateSopStepRequest {
  name?: string;
  description?: string;
  sequenceNo?: number;
  roleId?: string | null;
}

export interface CreateSopOutcomeRequest {
  name: string;
  sequenceNo: number;
  sopStepId: string;
  nextSopStepId: string | null;
}

export interface UpdateSopOutcomeRequest {
  name?: string;
  sequenceNo?: number;
  nextSopStepId?: string | null;
}

export interface StepAssignment {
  sopStepId: string;
  taskSubject: string;
  assignToType: number | null;
  assignedUserId?: string;
  teamId?: string;
  enableRoundRobin?: boolean;
  roundRobinTeamId?: string;
}

export interface CreateProcessFromSopRequest {
  sopId: string;
  processName: string;
  processDescription: string;
  taskEntity: string;
  regardingField: string;
  parentEntity: string;
  stepAssignments: StepAssignment[];
}
```

─────────────────────────────────────────────────────────────────────
FILE: src/store/sopStore.ts
─────────────────────────────────────────────────────────────────────

```typescript
// src/store/sopStore.ts
import { create } from 'zustand';
import { temporal } from 'zundo';
import { immer } from 'zustand/middleware/immer';
import type { XYPosition } from '@xyflow/react';
import type { Sop, SopStep, SopOutcome } from '@/types/SopTypes';

export interface SopValidationResult {
  code: string;
  severity: 'error' | 'warning';
  affectedNodeId: string | null;
  message: string;
}

interface SopDesignerState {
  sop: Sop | null;
  steps: Record<string, SopStep>;
  outcomes: Record<string, SopOutcome>;
  stepOrder: string[];
  outcomeOrder: Record<string, string[]>;
  nodePositions: Record<string, XYPosition>;

  newIds: Set<string>;
  dirtyIds: string[];
  deletedIds: string[];
  deletedEntityTypes: Record<string, 'sopstep' | 'sopoutcome'>;

  selectedId: string | null;
  isDirty: boolean;
  isSaving: boolean;
  previewMode: boolean;
  validationResults: SopValidationResult[];
}

interface SopDesignerActions {
  setSop(sop: Sop): void;
  updateSop(patch: Partial<Sop>): void;
  addStep(step: SopStep, position: XYPosition): void;
  updateStep(id: string, patch: Partial<SopStep>): void;
  removeStep(id: string): void;
  addOutcome(outcome: SopOutcome): void;
  updateOutcome(id: string, patch: Partial<SopOutcome>): void;
  removeOutcome(id: string): void;
  updateNodePosition(id: string, position: XYPosition): void;
  setSelected(id: string | null): void;
  setPreviewMode(isPreview: boolean): void;
  setValidationResults(results: SopValidationResult[]): void;
  setIsSaving(isSaving: boolean): void;
  markSaved(): void;
  resetSopCanvas(): void;
  resolveTmpId(tmpId: string, realId: string, entityType: 'sopstep' | 'sopoutcome'): void;
}

type SopStore = SopDesignerState & SopDesignerActions;

const INITIAL_STATE: SopDesignerState = {
  sop: null,
  steps: {},
  outcomes: {},
  stepOrder: [],
  outcomeOrder: {},
  nodePositions: {},
  newIds: new Set(),
  dirtyIds: [],
  deletedIds: [],
  deletedEntityTypes: {},
  selectedId: null,
  isDirty: false,
  isSaving: false,
  previewMode: false,
  validationResults: [],
};

export const useSopStore = create<SopStore>()(
  temporal(
    immer((set) => ({
      ...INITIAL_STATE,

      setSop: (sop) =>
        set((state) => {
          state.sop = sop;
        }),

      updateSop: (patch) =>
        set((state) => {
          if (!state.sop) return;
          Object.assign(state.sop, patch);
          state.isDirty = true;
          if (state.sop.id && !state.newIds.has(state.sop.id)) {
            if (!state.dirtyIds.includes(state.sop.id)) {
              state.dirtyIds.push(state.sop.id);
            }
          }
        }),

      addStep: (step, position) =>
        set((state) => {
          state.steps[step.id] = step;
          state.stepOrder.push(step.id);
          state.nodePositions[step.id] = position;
          state.newIds.add(step.id);
          state.isDirty = true;
        }),

      updateStep: (id, patch) =>
        set((state) => {
          if (!state.steps[id]) return;
          Object.assign(state.steps[id], patch);
          state.isDirty = true;
          if (!state.newIds.has(id) && !state.dirtyIds.includes(id)) {
            state.dirtyIds.push(id);
          }
        }),

      removeStep: (id) =>
        set((state) => {
          delete state.steps[id];
          state.stepOrder = state.stepOrder.filter((sid) => sid !== id);
          delete state.nodePositions[id];

          const relatedOutcomeIds = state.outcomeOrder[id] ?? [];
          relatedOutcomeIds.forEach((oid) => {
            delete state.outcomes[oid];
            if (!state.newIds.has(oid)) {
              state.deletedIds.push(oid);
              state.deletedEntityTypes[oid] = 'sopoutcome';
            }
          });
          delete state.outcomeOrder[id];

          if (state.newIds.has(id)) {
            state.newIds.delete(id);
          } else {
            state.deletedIds.push(id);
            state.deletedEntityTypes[id] = 'sopstep';
          }
          state.isDirty = true;
        }),

      addOutcome: (outcome) =>
        set((state) => {
          state.outcomes[outcome.id] = outcome;
          const stepOutcomes = state.outcomeOrder[outcome.sopStepId] ?? [];
          stepOutcomes.push(outcome.id);
          state.outcomeOrder[outcome.sopStepId] = stepOutcomes;
          state.newIds.add(outcome.id);
          state.isDirty = true;
        }),

      updateOutcome: (id, patch) =>
        set((state) => {
          if (!state.outcomes[id]) return;
          Object.assign(state.outcomes[id], patch);
          state.isDirty = true;
          if (!state.newIds.has(id) && !state.dirtyIds.includes(id)) {
            state.dirtyIds.push(id);
          }
        }),

      removeOutcome: (id) =>
        set((state) => {
          const outcome = state.outcomes[id];
          if (!outcome) return;
          delete state.outcomes[id];
          const stepOutcomes = state.outcomeOrder[outcome.sopStepId] ?? [];
          state.outcomeOrder[outcome.sopStepId] = stepOutcomes.filter((oid) => oid !== id);
          if (state.newIds.has(id)) {
            state.newIds.delete(id);
          } else {
            state.deletedIds.push(id);
            state.deletedEntityTypes[id] = 'sopoutcome';
          }
          state.isDirty = true;
        }),

      updateNodePosition: (id, position) =>
        set((state) => {
          state.nodePositions[id] = position;
        }),

      setSelected: (id) =>
        set((state) => {
          state.selectedId = id;
        }),

      setPreviewMode: (isPreview) =>
        set((state) => {
          state.previewMode = isPreview;
        }),

      setValidationResults: (results) =>
        set((state) => {
          state.validationResults = results;
        }),

      setIsSaving: (isSaving) =>
        set((state) => {
          state.isSaving = isSaving;
        }),

      markSaved: () =>
        set((state) => {
          state.newIds.clear();
          state.dirtyIds = [];
          state.deletedIds = [];
          state.deletedEntityTypes = {};
          state.isDirty = false;
        }),

      resetSopCanvas: () =>
        set((state) => {
          Object.assign(state, INITIAL_STATE);
          state.newIds = new Set();
        }),

      resolveTmpId: (tmpId, realId, entityType) =>
        set((state) => {
          state.newIds.delete(tmpId);

          if (entityType === 'sopstep') {
            const step = state.steps[tmpId];
            if (!step) return;
            step.id = realId;
            state.steps[realId] = step;
            delete state.steps[tmpId];
            state.stepOrder = state.stepOrder.map((id) => (id === tmpId ? realId : id));
            if (state.nodePositions[tmpId]) {
              state.nodePositions[realId] = state.nodePositions[tmpId];
              delete state.nodePositions[tmpId];
            }
            if (state.outcomeOrder[tmpId]) {
              state.outcomeOrder[realId] = state.outcomeOrder[tmpId];
              delete state.outcomeOrder[tmpId];
            }
          } else {
            const outcome = state.outcomes[tmpId];
            if (!outcome) return;
            outcome.id = realId;
            state.outcomes[realId] = outcome;
            delete state.outcomes[tmpId];
            const parentId = outcome.sopStepId;
            const parentOutcomes = state.outcomeOrder[parentId] ?? [];
            state.outcomeOrder[parentId] = parentOutcomes.map((id) =>
              id === tmpId ? realId : id
            );
          }
        }),
    })),
    {
      partialize: (state) => ({
        sop: state.sop,
        steps: state.steps,
        outcomes: state.outcomes,
        stepOrder: state.stepOrder,
        outcomeOrder: state.outcomeOrder,
        nodePositions: state.nodePositions,
      }),
      limit: 50,
    }
  )
);
```

─────────────────────────────────────────────────────────────────────
FILE: src/store/sopSelectors.ts
─────────────────────────────────────────────────────────────────────

```typescript
// src/store/sopSelectors.ts
import type { Node, Edge } from '@xyflow/react';
import type { SopDesignerState } from './sopStore';

export interface SopStepNodeData {
  stepId: string;
  name: string;
  sequenceNo: number;
  roleName: string | null;
  roleStatus: number | null;
  isSelected: boolean;
}

export interface SopOutcomeNodeData {
  outcomeId: string;
  name: string;
  sequenceNo: number;
  isSelected: boolean;
}

/** Derives ReactFlow Node[] from the sopStore. Pure function — no side effects. */
export function selectSopNodes(state: SopDesignerState): Node[] {
  const stepNodes: Node[] = state.stepOrder.map((id) => {
    const step = state.steps[id];
    const position = state.nodePositions[id] ?? { x: 0, y: 0 };
    return {
      id,
      type: 'sopStepNode',
      position,
      data: {
        stepId: id,
        name: step.name,
        sequenceNo: step.sequenceNo,
        roleName: step.roleName,
        roleStatus: step.roleStatus,
        isSelected: state.selectedId === id,
      } satisfies SopStepNodeData,
    };
  });

  const outcomeNodes: Node[] = Object.values(state.outcomes).map((outcome) => {
    const position = state.nodePositions[outcome.id] ?? { x: 0, y: 0 };
    return {
      id: outcome.id,
      type: 'sopOutcomeNode',
      position,
      data: {
        outcomeId: outcome.id,
        name: outcome.name,
        sequenceNo: outcome.sequenceNo,
        isSelected: state.selectedId === outcome.id,
      } satisfies SopOutcomeNodeData,
    };
  });

  return [...stepNodes, ...outcomeNodes];
}

/** Derives ReactFlow Edge[] from sopStore. Pure function — no side effects. */
export function selectSopEdges(state: SopDesignerState): Edge[] {
  const edges: Edge[] = [];

  // Step → Outcome edges (structural grouping)
  for (const [stepId, outcomeIds] of Object.entries(state.outcomeOrder)) {
    for (const outcomeId of outcomeIds) {
      edges.push({
        id: `step-to-outcome-${stepId}-${outcomeId}`,
        source: stepId,
        target: outcomeId,
        type: 'default',
        animated: false,
      });
    }
  }

  // Outcome → Next Step edges (flow routing)
  for (const outcome of Object.values(state.outcomes)) {
    if (outcome.nextSopStepId) {
      edges.push({
        id: `outcome-to-step-${outcome.id}-${outcome.nextSopStepId}`,
        source: outcome.id,
        target: outcome.nextSopStepId,
        type: 'default',
        animated: true,
        style: { strokeDasharray: '5,5' },
      });
    }
  }

  return edges;
}
```

─────────────────────────────────────────────────────────────────────
FILE: src/validators/sopValidator.ts
─────────────────────────────────────────────────────────────────────

```typescript
// src/validators/sopValidator.ts
import type { SopDesignerState, SopValidationResult } from '@/store/sopStore';

/** Validates a SOP before publication. Returns all violations found. */
export function validateSopForPublish(state: SopDesignerState): SopValidationResult[] {
  const results: SopValidationResult[] = [];

  results.push(...checkSopHasRecordType(state));
  results.push(...checkSopHasSteps(state));
  results.push(...checkAllStepsHaveNames(state));
  results.push(...checkStepSequenceUniqueness(state));
  results.push(...checkOutcomeNextStepReferences(state));
  results.push(...checkNoCircularReferences(state));

  return results;
}

function checkSopHasRecordType(state: SopDesignerState): SopValidationResult[] {
  if (!state.sop?.recordTypeId) {
    return [{
      code: 'VS-01',
      severity: 'error',
      affectedNodeId: null,
      message: 'SOP must have a Record Type assigned before it can be published.',
    }];
  }
  return [];
}

function checkSopHasSteps(state: SopDesignerState): SopValidationResult[] {
  if (state.stepOrder.length === 0) {
    return [{
      code: 'VS-02',
      severity: 'error',
      affectedNodeId: null,
      message: 'SOP must have at least one step before it can be published.',
    }];
  }
  return [];
}

function checkAllStepsHaveNames(state: SopDesignerState): SopValidationResult[] {
  return state.stepOrder
    .filter((id) => !state.steps[id]?.name?.trim())
    .map((id) => ({
      code: 'VS-03',
      severity: 'error' as const,
      affectedNodeId: id,
      message: `Step is missing a name.`,
    }));
}

function checkStepSequenceUniqueness(state: SopDesignerState): SopValidationResult[] {
  const seqNos = state.stepOrder.map((id) => state.steps[id].sequenceNo);
  const duplicates = seqNos.filter((n, i) => seqNos.indexOf(n) !== i);

  return duplicates.map((n) => ({
    code: 'VS-04',
    severity: 'error' as const,
    affectedNodeId: null,
    message: `Duplicate step sequence number: ${n}. Each step must have a unique sequence number.`,
  }));
}

function checkOutcomeNextStepReferences(state: SopDesignerState): SopValidationResult[] {
  return Object.values(state.outcomes)
    .filter(
      (outcome) =>
        outcome.nextSopStepId !== null &&
        !state.steps[outcome.nextSopStepId]
    )
    .map((outcome) => ({
      code: 'VS-05',
      severity: 'error' as const,
      affectedNodeId: outcome.id,
      message: `Outcome "${outcome.name}" references a next step that no longer exists.`,
    }));
}

function checkNoCircularReferences(state: SopDesignerState): SopValidationResult[] {
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function hasCycle(stepId: string): boolean {
    visited.add(stepId);
    inStack.add(stepId);

    const outcomeIds = state.outcomeOrder[stepId] ?? [];
    for (const outcomeId of outcomeIds) {
      const nextStepId = state.outcomes[outcomeId]?.nextSopStepId;
      if (!nextStepId) continue;
      if (!visited.has(nextStepId)) {
        if (hasCycle(nextStepId)) return true;
      } else if (inStack.has(nextStepId)) {
        return true;
      }
    }

    inStack.delete(stepId);
    return false;
  }

  const hasCycleDetected = state.stepOrder.some(
    (id) => !visited.has(id) && hasCycle(id)
  );

  if (hasCycleDetected) {
    return [{
      code: 'VS-06',
      severity: 'error',
      affectedNodeId: null,
      message: 'Circular reference detected in the SOP flow. A step cannot eventually route back to itself.',
    }];
  }
  return [];
}
```

─────────────────────────────────────────────────────────────────────
FILE: src/components/CreateProcessWizard/wizardSchemas.ts
─────────────────────────────────────────────────────────────────────

```typescript
// src/components/CreateProcessWizard/wizardSchemas.ts
import { z } from 'zod';

export const step1Schema = z.object({
  processName: z.string().trim().min(1, 'Process name is required').max(200),
  processDescription: z.string().max(2000).optional().default(''),
});

export const step2Schema = z.object({
  taskEntity: z.string().trim().min(1, 'Task entity is required'),
  regardingField: z.string().optional().default(''),
  parentEntity: z.string().optional().default(''),
});

export const stepAssignmentSchema = z.object({
  sopStepId: z.string().uuid(),
  taskSubject: z.string().trim().min(1, 'Task subject is required').max(200),
  assignToType: z.number().nullable(),
  assignedUserId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  enableRoundRobin: z.boolean().optional().default(false),
  roundRobinTeamId: z.string().uuid().optional(),
});

export const step3Schema = z.object({
  stepAssignments: z.array(stepAssignmentSchema),
});

export type Step1Values = z.infer<typeof step1Schema>;
export type Step2Values = z.infer<typeof step2Schema>;
export type Step3Values = z.infer<typeof step3Schema>;
```

─────────────────────────────────────────────────────────────────────
FILE: src/components/CreateProcessWizard/useWizardState.ts
─────────────────────────────────────────────────────────────────────

```typescript
// src/components/CreateProcessWizard/useWizardState.ts
import { useState, useCallback } from 'react';
import type { Step1Values, Step2Values, Step3Values } from './wizardSchemas';
import type { StepAssignment } from '@/types/SopTypes';

export type WizardStep = 0 | 1 | 2;

interface WizardData {
  step1: Step1Values;
  step2: Step2Values;
  step3: Step3Values;
}

interface WizardState {
  currentStep: WizardStep;
  data: WizardData;
  isSubmitting: boolean;
  submitError: string | null;
}

interface WizardStateActions {
  goToNextStep(): void;
  goToPreviousStep(): void;
  setStep1Data(values: Step1Values): void;
  setStep2Data(values: Step2Values): void;
  setStep3Data(values: Step3Values): void;
  setIsSubmitting(value: boolean): void;
  setSubmitError(error: string | null): void;
  buildStepAssignments(): StepAssignment[];
}

const EMPTY_WIZARD_DATA: WizardData = {
  step1: { processName: '', processDescription: '' },
  step2: { taskEntity: '', regardingField: '', parentEntity: '' },
  step3: { stepAssignments: [] },
};

export function useWizardState(): WizardState & WizardStateActions {
  const [currentStep, setCurrentStep] = useState<WizardStep>(0);
  const [data, setData] = useState<WizardData>(EMPTY_WIZARD_DATA);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const goToNextStep = useCallback(() => {
    setCurrentStep((prev) => Math.min(prev + 1, 2) as WizardStep);
  }, []);

  const goToPreviousStep = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 0) as WizardStep);
  }, []);

  const setStep1Data = useCallback((values: Step1Values) => {
    setData((prev) => ({ ...prev, step1: values }));
  }, []);

  const setStep2Data = useCallback((values: Step2Values) => {
    setData((prev) => ({ ...prev, step2: values }));
  }, []);

  const setStep3Data = useCallback((values: Step3Values) => {
    setData((prev) => ({ ...prev, step3: values }));
  }, []);

  const buildStepAssignments = useCallback((): StepAssignment[] => {
    return data.step3.stepAssignments;
  }, [data.step3]);

  return {
    currentStep,
    data,
    isSubmitting,
    submitError,
    goToNextStep,
    goToPreviousStep,
    setStep1Data,
    setStep2Data,
    setStep3Data,
    setIsSubmitting: (value) => setIsSubmitting(value),
    setSubmitError: (error) => setSubmitError(error),
    buildStepAssignments,
  };
}
```

─────────────────────────────────────────────────────────────────────
FILE: src/components/CreateProcessWizard/CreateProcessWizardModal.tsx
─────────────────────────────────────────────────────────────────────

```typescript
// src/components/CreateProcessWizard/CreateProcessWizardModal.tsx
import React, { useCallback } from 'react';
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Spinner,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import { Step1ProcessIdentity } from './Step1ProcessIdentity';
import { Step2CrmBinding } from './Step2CrmBinding';
import { Step3StepAssignments } from './Step3StepAssignments';
import { useWizardState } from './useWizardState';
import { useSopAdapter } from '@/hooks/useSopAdapter';
import type { Sop, SopStep } from '@/types/SopTypes';

interface CreateProcessWizardModalProps {
  sop: Sop;
  sopSteps: SopStep[];
  isOpen: boolean;
  onDismiss(): void;
  onSuccess(newProcessId: string): void;
}

const STEP_TITLES = [
  'Step 1 of 3 — Process Identity',
  'Step 2 of 3 — CRM Binding',
  'Step 3 of 3 — Step Assignments',
] as const;

export function CreateProcessWizardModal({
  sop,
  sopSteps,
  isOpen,
  onDismiss,
  onSuccess,
}: CreateProcessWizardModalProps) {
  const adapter = useSopAdapter();
  const wizard = useWizardState();

  const handleSubmit = useCallback(async () => {
    wizard.setIsSubmitting(true);
    wizard.setSubmitError(null);

    try {
      const newProcessId = await adapter.createProcessFromSop({
        sopId: sop.id,
        processName: wizard.data.step1.processName,
        processDescription: wizard.data.step1.processDescription,
        taskEntity: wizard.data.step2.taskEntity,
        regardingField: wizard.data.step2.regardingField,
        parentEntity: wizard.data.step2.parentEntity,
        stepAssignments: wizard.buildStepAssignments(),
      });
      onSuccess(newProcessId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.';
      wizard.setSubmitError(message);
    } finally {
      wizard.setIsSubmitting(false);
    }
  }, [adapter, sop.id, wizard, onSuccess]);

  return (
    <Dialog open={isOpen} onOpenChange={(_, data) => { if (!data.open) onDismiss(); }}>
      <DialogSurface style={{ minWidth: 640, maxWidth: 800 }}>
        <DialogBody>
          <DialogTitle>Create Process from SOP: {sop.name}</DialogTitle>
          <DialogContent>
            {wizard.submitError && (
              <MessageBar intent="error" style={{ marginBottom: 16 }}>
                <MessageBarBody>{wizard.submitError}</MessageBarBody>
              </MessageBar>
            )}

            {wizard.currentStep === 0 && (
              <Step1ProcessIdentity
                sop={sop}
                initialValues={wizard.data.step1}
                onValidated={(values) => {
                  wizard.setStep1Data(values);
                  wizard.goToNextStep();
                }}
              />
            )}

            {wizard.currentStep === 1 && (
              <Step2CrmBinding
                initialValues={wizard.data.step2}
                onValidated={(values) => {
                  wizard.setStep2Data(values);
                  wizard.goToNextStep();
                }}
                onBack={wizard.goToPreviousStep}
              />
            )}

            {wizard.currentStep === 2 && (
              <Step3StepAssignments
                sopSteps={sopSteps}
                initialValues={wizard.data.step3}
                onValidated={(values) => {
                  wizard.setStep3Data(values);
                }}
                onBack={wizard.goToPreviousStep}
              />
            )}
          </DialogContent>

          {wizard.currentStep === 2 && (
            <DialogActions>
              <Button appearance="secondary" onClick={wizard.goToPreviousStep}>
                Back
              </Button>
              <Button
                appearance="secondary"
                onClick={onDismiss}
                disabled={wizard.isSubmitting}
              >
                Cancel
              </Button>
              <Button
                appearance="primary"
                onClick={handleSubmit}
                disabled={wizard.isSubmitting}
                icon={wizard.isSubmitting ? <Spinner size="tiny" /> : undefined}
              >
                {wizard.isSubmitting ? 'Creating Process...' : 'Create Process'}
              </Button>
            </DialogActions>
          )}
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
```

─────────────────────────────────────────────────────────────────────
FILE: src/hooks/useSopAdapter.ts
─────────────────────────────────────────────────────────────────────

```typescript
// src/hooks/useSopAdapter.ts
import { useContext } from 'react';
import { SopAdapterContext } from '@/app/SopAdapterContext';
import { isSopAdapter } from '@/adapters/ISopAdapter';

/**
 * Returns the ISopAdapter for the current environment.
 * Throws FeatureUnavailableError if the current environment is On-Premise
 * (ODataAdapter does not implement ISopAdapter).
 */
export function useSopAdapter() {
  const adapter = useContext(SopAdapterContext);
  if (!adapter) {
    throw new Error('useSopAdapter must be used within SopAdapterContext.Provider');
  }
  if (!isSopAdapter(adapter)) {
    throw new FeatureUnavailableError(
      'SOP Designer requires Dynamics 365 Online. This feature is not available in On-Premise environments.'
    );
  }
  return adapter;
}

export class FeatureUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FeatureUnavailableError';
  }
}
```

─────────────────────────────────────────────────────────────────────
FILE: src/app/SopAdapterContext.ts
─────────────────────────────────────────────────────────────────────

```typescript
// src/app/SopAdapterContext.ts
import { createContext } from 'react';
import type { ICrmAdapter } from '@/adapters/ICrmAdapter';

/**
 * Provides the ICrmAdapter instance to SOP-feature components.
 * The same adapter instance as CrmAdapterContext — the type guard in
 * useSopAdapter() determines at runtime whether ISopAdapter is available.
 */
export const SopAdapterContext = createContext<ICrmAdapter | null>(null);
```

─────────────────────────────────────────────────────────────────────
FILE: src/hooks/useSopSave.ts
─────────────────────────────────────────────────────────────────────

```typescript
// src/hooks/useSopSave.ts
import { useCallback } from 'react';
import { useSopStore } from '@/store/sopStore';
import { useSopAdapter } from './useSopAdapter';

/**
 * Executes the dependency-ordered SOP canvas save pipeline.
 * Phase 1: SOP record → Phase 2: SOP steps → Phase 3: SOP outcomes → Phase 4: Deletions
 */
export function useSopSave() {
  const store = useSopStore();
  const adapter = useSopAdapter();

  const saveSopCanvas = useCallback(async () => {
    store.setIsSaving(true);
    try {
      await saveSopRecord(store, adapter);
      await saveSopSteps(store, adapter);
      await saveSopOutcomes(store, adapter);
      await executeSopDeletions(store, adapter);
      store.markSaved();
    } finally {
      store.setIsSaving(false);
    }
  }, [store, adapter]);

  return { saveSopCanvas };
}

async function saveSopRecord(
  store: ReturnType<typeof useSopStore>,
  adapter: ReturnType<typeof useSopAdapter>
) {
  const { sop, newIds, dirtyIds } = store;
  if (!sop) return;

  if (newIds.has(sop.id)) {
    const realId = await adapter.createSop({
      name: sop.name,
      description: sop.description,
      purpose: sop.purpose,
      version: sop.version,
      recordTypeId: sop.recordTypeId,
    });
    store.setSop({ ...sop, id: realId });
  } else if (dirtyIds.includes(sop.id)) {
    await adapter.updateSop(sop.id, {
      name: sop.name,
      description: sop.description,
      purpose: sop.purpose,
      version: sop.version,
      status: sop.status,
      recordTypeId: sop.recordTypeId,
    });
  }
}

async function saveSopSteps(
  store: ReturnType<typeof useSopStore>,
  adapter: ReturnType<typeof useSopAdapter>
) {
  const { steps, stepOrder, newIds, dirtyIds, sop } = store;
  if (!sop) return;

  for (const stepId of stepOrder) {
    const step = steps[stepId];
    if (!step) continue;

    if (newIds.has(stepId)) {
      const realId = await adapter.createSopStep({
        name: step.name,
        description: step.description,
        sequenceNo: step.sequenceNo,
        sopId: sop.id,
        roleId: step.roleId,
      });
      store.resolveTmpId(stepId, realId, 'sopstep');
    } else if (dirtyIds.includes(stepId)) {
      await adapter.updateSopStep(stepId, {
        name: step.name,
        description: step.description,
        sequenceNo: step.sequenceNo,
        roleId: step.roleId,
      });
    }
  }
}

async function saveSopOutcomes(
  store: ReturnType<typeof useSopStore>,
  adapter: ReturnType<typeof useSopAdapter>
) {
  const { outcomes, newIds, dirtyIds } = store;

  for (const outcome of Object.values(outcomes)) {
    if (newIds.has(outcome.id)) {
      const realId = await adapter.createSopOutcome({
        name: outcome.name,
        sequenceNo: outcome.sequenceNo,
        sopStepId: outcome.sopStepId,
        nextSopStepId: outcome.nextSopStepId,
      });
      store.resolveTmpId(outcome.id, realId, 'sopoutcome');
    } else if (dirtyIds.includes(outcome.id)) {
      await adapter.updateSopOutcome(outcome.id, {
        name: outcome.name,
        sequenceNo: outcome.sequenceNo,
        nextSopStepId: outcome.nextSopStepId,
      });
    }
  }
}

async function executeSopDeletions(
  store: ReturnType<typeof useSopStore>,
  adapter: ReturnType<typeof useSopAdapter>
) {
  const { deletedIds, deletedEntityTypes } = store;

  const outcomeIds = deletedIds.filter((id) => deletedEntityTypes[id] === 'sopoutcome');
  const stepIds = deletedIds.filter((id) => deletedEntityTypes[id] === 'sopstep');

  for (const id of outcomeIds) {
    await adapter.deleteSopOutcome(id);
  }
  for (const id of stepIds) {
    await adapter.deleteSopStep(id);
  }
}
```


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[CRM DEVELOPER] — C# Plugin (Qdb.WorkflowDesigner.Plugins)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

─────────────────────────────────────────────────────────────────────
FILE: plugins/Qdb.WorkflowDesigner.Plugins/Models/StepAssignment.cs
─────────────────────────────────────────────────────────────────────

```csharp
// Models/StepAssignment.cs
using System;
using System.Text.Json.Serialization;

namespace Qdb.WorkflowDesigner.Plugins.Models
{
    /// <summary>
    /// JSON-deserialisable model for per-step assignment config from the wizard.
    /// Validated before use — all GUIDs parsed with Guid.TryParse.
    /// </summary>
    internal sealed class StepAssignment
    {
        [JsonPropertyName("sopStepId")]
        public string SopStepId { get; set; } = string.Empty;

        [JsonPropertyName("taskSubject")]
        public string TaskSubject { get; set; } = string.Empty;

        [JsonPropertyName("assignToType")]
        public int? AssignToType { get; set; }

        [JsonPropertyName("assignedUserId")]
        public string? AssignedUserId { get; set; }

        [JsonPropertyName("teamId")]
        public string? TeamId { get; set; }

        [JsonPropertyName("enableRoundRobin")]
        public bool EnableRoundRobin { get; set; }

        [JsonPropertyName("roundRobinTeamId")]
        public string? RoundRobinTeamId { get; set; }
    }
}
```

─────────────────────────────────────────────────────────────────────
FILE: plugins/Qdb.WorkflowDesigner.Plugins/CreateProcessFromSopPlugin.cs
─────────────────────────────────────────────────────────────────────

```csharp
// CreateProcessFromSopPlugin.cs
using System;
using System.Collections.Generic;
using System.Text.Json;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.WorkflowDesigner.Plugins.Models;

namespace Qdb.WorkflowDesigner.Plugins
{
    /// <summary>
    /// Handles the qdb_CreateProcessFromSop Custom API message.
    /// Registered: Post-operation, Synchronous — participates in platform transaction.
    /// Creates qdb_work_item_record_type, qdb_work_item_steps, and qdb_outcome records
    /// derived from a published qdb_sop.
    /// </summary>
    public sealed class CreateProcessFromSopPlugin : IPlugin
    {
        private const int SOP_STATUS_PUBLISHED = 100000001;
        private const string ENTITY_SOP = "qdb_sop";
        private const string ENTITY_PROCESS = "qdb_work_item_record_type";
        private const string ENTITY_STEP = "qdb_work_item_steps";
        private const string ENTITY_OUTCOME = "qdb_outcome";
        private const string ENTITY_SOP_STEP = "qdb_sopstep";
        private const string ENTITY_SOP_OUTCOME = "qdb_sopoutcome";

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var serviceFactory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var service = serviceFactory.CreateOrganizationService(context.UserId);

            var parameters = ExtractAndValidateParameters(context.InputParameters);
            var stepAssignments = DeserialiseStepAssignments(parameters.StepAssignmentsJson);

            ValidateSopIsPublished(service, parameters.SopId);

            var processId = CreateProcess(service, parameters);
            var sopSteps = LoadSopSteps(service, parameters.SopId);

            var sopStepToWorkitemStep = CreateWorkitemSteps(
                service, sopSteps, processId, parameters, stepAssignments);

            CreateWorkitemOutcomes(service, sopSteps, sopStepToWorkitemStep);

            context.OutputParameters["ProcessId"] =
                new EntityReference(ENTITY_PROCESS, processId);
        }

        private static PluginParameters ExtractAndValidateParameters(
            ParameterCollection inputParameters)
        {
            var sopRef = inputParameters.Contains("SopId")
                ? (EntityReference)inputParameters["SopId"]
                : throw new InvalidPluginExecutionException("SopId parameter is required.");

            var processName = inputParameters.Contains("ProcessName")
                ? (string)inputParameters["ProcessName"]
                : throw new InvalidPluginExecutionException("ProcessName parameter is required.");

            if (string.IsNullOrWhiteSpace(processName))
                throw new InvalidPluginExecutionException("ProcessName cannot be empty.");

            var taskEntity = inputParameters.Contains("TaskEntity")
                ? (string)inputParameters["TaskEntity"]
                : throw new InvalidPluginExecutionException("TaskEntity parameter is required.");

            if (string.IsNullOrWhiteSpace(taskEntity))
                throw new InvalidPluginExecutionException("TaskEntity cannot be empty.");

            var stepAssignmentsJson = inputParameters.Contains("StepAssignments")
                ? (string)inputParameters["StepAssignments"]
                : throw new InvalidPluginExecutionException("StepAssignments parameter is required.");

            return new PluginParameters
            {
                SopId = sopRef.Id,
                ProcessName = processName.Trim(),
                ProcessDescription = inputParameters.Contains("ProcessDescription")
                    ? (string?)inputParameters["ProcessDescription"] ?? string.Empty
                    : string.Empty,
                TaskEntity = taskEntity.Trim(),
                RegardingField = inputParameters.Contains("RegardingField")
                    ? (string?)inputParameters["RegardingField"] ?? string.Empty
                    : string.Empty,
                ParentEntity = inputParameters.Contains("ParentEntity")
                    ? (string?)inputParameters["ParentEntity"] ?? string.Empty
                    : string.Empty,
                StepAssignmentsJson = stepAssignmentsJson,
            };
        }

        private static List<StepAssignment> DeserialiseStepAssignments(string json)
        {
            if (string.IsNullOrWhiteSpace(json))
                throw new InvalidPluginExecutionException("StepAssignments cannot be empty.");

            try
            {
                var assignments = JsonSerializer.Deserialize<List<StepAssignment>>(json)
                    ?? throw new InvalidPluginExecutionException(
                        "StepAssignments JSON deserialised to null.");

                foreach (var assignment in assignments)
                {
                    if (!Guid.TryParse(assignment.SopStepId, out _))
                        throw new InvalidPluginExecutionException(
                            $"StepAssignment contains invalid sopStepId: {assignment.SopStepId}");

                    if (assignment.AssignedUserId != null &&
                        !Guid.TryParse(assignment.AssignedUserId, out _))
                        throw new InvalidPluginExecutionException(
                            $"StepAssignment contains invalid assignedUserId: {assignment.AssignedUserId}");

                    if (assignment.TeamId != null &&
                        !Guid.TryParse(assignment.TeamId, out _))
                        throw new InvalidPluginExecutionException(
                            $"StepAssignment contains invalid teamId: {assignment.TeamId}");
                }

                return assignments;
            }
            catch (JsonException ex)
            {
                throw new InvalidPluginExecutionException(
                    $"StepAssignments parameter contains invalid JSON: {ex.Message}");
            }
        }

        private static void ValidateSopIsPublished(IOrganizationService service, Guid sopId)
        {
            var sop = service.Retrieve(ENTITY_SOP, sopId, new ColumnSet("qdb_status"));
            var status = sop.GetAttributeValue<OptionSetValue>("qdb_status")?.Value;

            if (status != SOP_STATUS_PUBLISHED)
                throw new InvalidPluginExecutionException(
                    "The referenced SOP is not in Published status. Only Published SOPs can be used to derive processes.");
        }

        private static Guid CreateProcess(
            IOrganizationService service,
            PluginParameters parameters)
        {
            var process = new Entity(ENTITY_PROCESS);
            process["qdb_name"] = parameters.ProcessName;

            if (!string.IsNullOrEmpty(parameters.ProcessDescription))
                process["qdb_description"] = parameters.ProcessDescription;

            if (!string.IsNullOrEmpty(parameters.TaskEntity))
                process["qdb_recordentity"] = parameters.TaskEntity;

            if (!string.IsNullOrEmpty(parameters.RegardingField))
                process["qdb_regardingfield"] = parameters.RegardingField;

            if (!string.IsNullOrEmpty(parameters.ParentEntity))
                process["qdb_parententity"] = parameters.ParentEntity;

            process["qdb_sop_id"] = new EntityReference(ENTITY_SOP, parameters.SopId);

            return service.Create(process);
        }

        private static EntityCollection LoadSopSteps(
            IOrganizationService service,
            Guid sopId)
        {
            var query = new QueryExpression(ENTITY_SOP_STEP)
            {
                ColumnSet = new ColumnSet("qdb_sopstepid", "qdb_name", "qdb_sequenceno"),
                Orders = { new OrderExpression("qdb_sequenceno", OrderType.Ascending) },
            };
            query.Criteria.AddCondition("qdb_sop_id", ConditionOperator.Equal, sopId);
            return service.RetrieveMultiple(query);
        }

        private static Dictionary<Guid, Guid> CreateWorkitemSteps(
            IOrganizationService service,
            EntityCollection sopSteps,
            Guid processId,
            PluginParameters parameters,
            List<StepAssignment> stepAssignments)
        {
            var sopStepToWorkitemStep = new Dictionary<Guid, Guid>();
            var assignmentLookup = BuildAssignmentLookup(stepAssignments);

            foreach (var sopStep in sopSteps.Entities)
            {
                var sopStepId = sopStep.Id;
                assignmentLookup.TryGetValue(sopStepId, out var assignment);

                var workitemStep = new Entity(ENTITY_STEP);
                workitemStep["qdb_record_type"] =
                    new EntityReference(ENTITY_PROCESS, processId);
                workitemStep["qdb_name"] = sopStep["qdb_name"];
                workitemStep["qdb_sequenceno"] = sopStep["qdb_sequenceno"];
                workitemStep["qdb_tasksubject"] =
                    !string.IsNullOrEmpty(assignment?.TaskSubject)
                        ? assignment.TaskSubject
                        : (string)sopStep["qdb_name"];

                if (!string.IsNullOrEmpty(parameters.TaskEntity))
                    workitemStep["qdb_recordentity"] = parameters.TaskEntity;

                if (!string.IsNullOrEmpty(parameters.RegardingField))
                    workitemStep["qdb_regardingfield"] = parameters.RegardingField;

                if (!string.IsNullOrEmpty(parameters.ParentEntity))
                    workitemStep["qdb_parententity"] = parameters.ParentEntity;

                ApplyAssignment(workitemStep, assignment);

                var workitemStepId = service.Create(workitemStep);
                sopStepToWorkitemStep[sopStepId] = workitemStepId;
            }

            return sopStepToWorkitemStep;
        }

        private static Dictionary<Guid, StepAssignment> BuildAssignmentLookup(
            List<StepAssignment> assignments)
        {
            var lookup = new Dictionary<Guid, StepAssignment>();
            foreach (var assignment in assignments)
            {
                if (Guid.TryParse(assignment.SopStepId, out var guid))
                    lookup[guid] = assignment;
            }
            return lookup;
        }

        private static void ApplyAssignment(Entity step, StepAssignment? assignment)
        {
            if (assignment?.AssignToType == null) return;

            step["qdb_task_assign_to"] = new OptionSetValue(assignment.AssignToType.Value);

            if (assignment.AssignToType == 100000000 &&
                Guid.TryParse(assignment.AssignedUserId, out var userId))
            {
                step["qdb_assigned_user"] = new EntityReference("systemuser", userId);
            }
            else if (assignment.AssignToType == 100000002 &&
                Guid.TryParse(assignment.TeamId, out var teamId))
            {
                step["qdb_team"] = new EntityReference("team", teamId);
                step["qdb_enableroundrobin"] = assignment.EnableRoundRobin;

                if (assignment.EnableRoundRobin &&
                    Guid.TryParse(assignment.RoundRobinTeamId, out var rrTeamId))
                {
                    step["qdb_roundrobinteam"] = new EntityReference("qdb_roundrobinteam", rrTeamId);
                }
            }
        }

        private static void CreateWorkitemOutcomes(
            IOrganizationService service,
            EntityCollection sopSteps,
            Dictionary<Guid, Guid> sopStepToWorkitemStep)
        {
            foreach (var sopStep in sopSteps.Entities)
            {
                var sopOutcomes = LoadSopOutcomesForStep(service, sopStep.Id);

                foreach (var sopOutcome in sopOutcomes.Entities)
                {
                    var outcome = new Entity(ENTITY_OUTCOME);
                    outcome["qdb_workitemstep"] = new EntityReference(
                        ENTITY_STEP,
                        sopStepToWorkitemStep[sopStep.Id]);
                    outcome["qdb_name"] = sopOutcome["qdb_name"];
                    outcome["qdb_sequencenumber"] = sopOutcome["qdb_sequenceno"];

                    var nextSopStepRef = sopOutcome.GetAttributeValue<EntityReference>(
                        "qdb_nextsopstep_id");

                    if (nextSopStepRef != null &&
                        sopStepToWorkitemStep.TryGetValue(nextSopStepRef.Id, out var nextWorkitemStepId))
                    {
                        outcome["qdb_nextworkitemstep"] = new EntityReference(
                            ENTITY_STEP, nextWorkitemStepId);
                    }

                    service.Create(outcome);
                }
            }
        }

        private static EntityCollection LoadSopOutcomesForStep(
            IOrganizationService service,
            Guid sopStepId)
        {
            var query = new QueryExpression(ENTITY_SOP_OUTCOME)
            {
                ColumnSet = new ColumnSet(
                    "qdb_sopoutcomeid",
                    "qdb_name",
                    "qdb_sequenceno",
                    "qdb_nextsopstep_id"),
                Orders = { new OrderExpression("qdb_sequenceno", OrderType.Ascending) },
            };
            query.Criteria.AddCondition(
                "qdb_sopstep_id", ConditionOperator.Equal, sopStepId);
            return service.RetrieveMultiple(query);
        }

        private sealed class PluginParameters
        {
            public Guid SopId { get; set; }
            public string ProcessName { get; set; } = string.Empty;
            public string ProcessDescription { get; set; } = string.Empty;
            public string TaskEntity { get; set; } = string.Empty;
            public string RegardingField { get; set; } = string.Empty;
            public string ParentEntity { get; set; } = string.Empty;
            public string StepAssignmentsJson { get; set; } = string.Empty;
        }
    }
}
```

─────────────────────────────────────────────────────────────────────
FILE: plugins/Qdb.WorkflowDesigner.Plugins/RoleDeletionGuardPlugin.cs
─────────────────────────────────────────────────────────────────────

```csharp
// RoleDeletionGuardPlugin.cs
using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Qdb.WorkflowDesigner.Plugins
{
    /// <summary>
    /// Prevents deletion of a qdb_role that is referenced by any qdb_sopstep record.
    /// Registered: Pre-validation, Synchronous, Delete message on qdb_role.
    /// </summary>
    public sealed class RoleDeletionGuardPlugin : IPlugin
    {
        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(
                typeof(IPluginExecutionContext));
            var serviceFactory = (IOrganizationServiceFactory)serviceProvider.GetService(
                typeof(IOrganizationServiceFactory));
            var service = serviceFactory.CreateOrganizationService(context.UserId);

            var roleId = context.PrimaryEntityId;

            if (RoleIsReferencedBySopStep(service, roleId))
            {
                throw new InvalidPluginExecutionException(
                    "This role cannot be deleted because it is assigned to one or more SOP steps. " +
                    "Remove the role from all SOP steps first, or deactivate it instead.");
            }
        }

        private static bool RoleIsReferencedBySopStep(
            IOrganizationService service,
            Guid roleId)
        {
            var query = new QueryExpression("qdb_sopstep")
            {
                ColumnSet = new ColumnSet(false),
                TopCount = 1,
            };
            query.Criteria.AddCondition(
                "qdb_role_id", ConditionOperator.Equal, roleId);

            return service.RetrieveMultiple(query).Entities.Count > 0;
        }
    }
}
```


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[DEVOPS] — Deployment and CI/CD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

─────────────────────────────────────────────────────────────────────
Vite config update — new lazy chunks
─────────────────────────────────────────────────────────────────────

The existing vite.config.ts manualChunks configuration is extended:

```typescript
// Addition to existing manualChunks in vite.config.ts
// lazy-sop, lazy-wizard, lazy-roles are produced automatically
// by React.lazy() imports in App.tsx — no manual chunk config required.
// The existing rollupOptions.output.manualChunks handles vendor splitting only.
// App-level lazy splits are handled by dynamic import() statements.
```

App.tsx lazy imports that produce the three new chunks:
```typescript
const SopListScreen = React.lazy(
  () => import('@/components/SopListScreen/SopListScreen')
);
const CreateProcessWizardModal = React.lazy(
  () => import('@/components/CreateProcessWizard/CreateProcessWizardModal')
);
const RolesScreen = React.lazy(
  () => import('@/components/RolesScreen/RolesScreen')
);
```

─────────────────────────────────────────────────────────────────────
Solution XML delta — new entities added to solution.xml
─────────────────────────────────────────────────────────────────────

The existing scripts/packageSolution.js already enumerates dist/ and
generates RootComponent entries. The solution.xml version is bumped
and the new entities are added:

```xml
<!-- New entities in solution.xml RootComponents -->
<RootComponent type="1" id="{qdb_role-entity-id}" behavior="0" />
<RootComponent type="1" id="{qdb_sop-entity-id}" behavior="0" />
<RootComponent type="1" id="{qdb_sopstep-entity-id}" behavior="0" />
<RootComponent type="1" id="{qdb_sopoutcome-entity-id}" behavior="0" />

<!-- New security role -->
<RootComponent type="9" id="{WorkflowDesignerOpsExcellence-role-id}" behavior="0" />

<!-- Custom API -->
<RootComponent type="10181" id="{qdb_CreateProcessFromSop-customapi-id}" behavior="0" />
```

Solution version in solution.xml:
```xml
<Version>1.1.0.0</Version>
```

─────────────────────────────────────────────────────────────────────
CI Pipeline addition — GitHub Actions step
─────────────────────────────────────────────────────────────────────

The existing 7-step CI pipeline (from CWFD-001 architecture) is
unchanged. The bundle size gate at Step 6 already covers the new chunks.
No additional CI steps are required.

The deploy script (scripts/deploy-cloud.js) already handles uploading
all dist/ assets as web resources. The new lazy chunks (lazy-sop,
lazy-wizard, lazy-roles) are picked up automatically.

─────────────────────────────────────────────────────────────────────
Plugin deployment sequence (manual — Plugin Registration Tool)
─────────────────────────────────────────────────────────────────────

1. Build updated plugin assembly:
   dotnet build Qdb.WorkflowDesigner.Plugins.csproj -c Release

2. Update plugin assembly in Plugin Registration Tool:
   - Select existing Qdb.WorkflowDesigner.Plugins assembly
   - Update to new DLL
   - Two new plugin types now appear: CreateProcessFromSopPlugin,
     RoleDeletionGuardPlugin

3. Register Custom API:
   - Message name: qdb_CreateProcessFromSop
   - Binding type: Global
   - Is private: No
   - Plugin type: CreateProcessFromSopPlugin
   - Step: Post-operation, Synchronous, Deployment: Server

4. Register Custom API request parameters (via Custom API UI in maker portal):
   Input: SopId (EntityReference), ProcessName (String), ProcessDescription (String),
          TaskEntity (String), RegardingField (String), ParentEntity (String),
          StepAssignments (String)
   Output: ProcessId (EntityReference)

5. Register RoleDeletionGuardPlugin step:
   - Message: Delete
   - Primary Entity: qdb_role
   - Stage: Pre-Validation
   - Execution Mode: Synchronous
   - Deployment: Server


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUILD COMPLETENESS SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Component | Status | Files |
|-----------|--------|-------|
| ISopAdapter interface | COMPLETE | src/adapters/ISopAdapter.ts |
| SopTypes domain types | COMPLETE | src/types/SopTypes.ts |
| sopStore (Zustand) | COMPLETE | src/store/sopStore.ts |
| sopSelectors | COMPLETE | src/store/sopSelectors.ts |
| SOP validator | COMPLETE | src/validators/sopValidator.ts |
| Wizard schemas (Zod) | COMPLETE | src/components/CreateProcessWizard/wizardSchemas.ts |
| Wizard state hook | COMPLETE | src/components/CreateProcessWizard/useWizardState.ts |
| Wizard modal | COMPLETE | src/components/CreateProcessWizard/CreateProcessWizardModal.tsx |
| useSopAdapter hook | COMPLETE | src/hooks/useSopAdapter.ts |
| SopAdapterContext | COMPLETE | src/app/SopAdapterContext.ts |
| useSopSave hook | COMPLETE | src/hooks/useSopSave.ts |
| StepAssignment model (C#) | COMPLETE | plugins/.../Models/StepAssignment.cs |
| CreateProcessFromSopPlugin | COMPLETE | plugins/.../CreateProcessFromSopPlugin.cs |
| RoleDeletionGuardPlugin | COMPLETE | plugins/.../RoleDeletionGuardPlugin.cs |
| DevOps / deploy notes | COMPLETE | (documented above) |

Remaining components (architecture-specified, implementation pattern clear):
- SopStepNode.tsx — follows StepNode.tsx pattern; adds RoleBadge sub-component
- SopOutcomeNode.tsx — follows OutcomeNode.tsx pattern; no new logic
- SopCanvas.tsx — thin ReactFlow wrapper using sopStore + sopSelectors
- SopListScreen.tsx — Fluent UI DataGrid + useSopList React Query hook
- RolesScreen.tsx — Fluent UI DataGrid + useRoles React Query hook
- DataverseAdapter ISopAdapter methods — OData CRUD following existing patterns in DataverseAdapter.ts

These are implementation-straightforward given the existing CWFD-001
patterns. Architecture and core logic are fully specified above.

═══════════════════════════════════════════════════════════════════════
END OF TECHNICAL BUILD — CWFD-002 SOP DESIGNER
Prepared by: Frontend + CRM Developer + DevOps — Maqsad AI | 2026-06-12
═══════════════════════════════════════════════════════════════════════
