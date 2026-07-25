// src/store/sopStore.ts
import { create } from 'zustand';
import { temporal } from 'zundo';
import { immer } from 'zustand/middleware/immer';
import type { XYPosition } from '@xyflow/react';
import type { Sop, SopStep, SopOutcome, SopStepType } from '@/types/SopTypes';
import { SOP_STEP_TYPE_META } from '@/types/SopTypes';
import { emptySlaFields } from '@/services/slaStepFields';

export interface SopValidationResult {
  code: string;
  severity: 'error' | 'warning';
  affectedNodeId: string | null;
  affectedNodeIds?: string[];   // used when multiple nodes share one error (e.g. dead-loop cycle)
  message: string;
}

export interface SopDesignerState {
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
  initNewSop(sop: Sop): void;
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
  addStepAfterOutcome(outcomeId: string): void;
  addTypedStepAfterOutcome(outcomeId: string, stepType: SopStepType): void;
  addTypedStepAfterStep(stepId: string, stepType: SopStepType): void;
  resolveTmpId(tmpId: string, realId: string, entityType: 'sopstep' | 'sopoutcome'): void;
}

export type SopStore = SopDesignerState & SopDesignerActions;

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

      initNewSop: (sop) =>
        set((state) => {
          state.sop = sop;
          state.newIds.add(sop.id);
          state.isDirty = true;
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

      addStepAfterOutcome: (outcomeId) =>
        set((state) => {
          const outcome = state.outcomes[outcomeId];
          if (!outcome || outcome.nextSopStepId) return;

          const parentStep = state.steps[outcome.sopStepId];
          const newSeq = state.stepOrder.length + 1;
          const tmpId = `tmp_step_${crypto.randomUUID()}`;

          const newStep = {
            id: tmpId,
            name: `Step ${newSeq}`,
            description: '',
            sequenceNo: newSeq,
            sopId: state.sop?.id ?? '',
            roleId: parentStep?.roleId ?? null,
            roleName: parentStep?.roleName ?? null,
            roleStatus: parentStep?.roleStatus ?? null,
            stepType: 'step' as const,
            ...emptySlaFields(),
          };

          state.steps[tmpId] = newStep;
          state.stepOrder.push(tmpId);
          state.outcomeOrder[tmpId] = [];
          state.outcomes[outcomeId].nextSopStepId = tmpId;
          state.newIds.add(tmpId);
          state.isDirty = true;
          state.selectedId = tmpId;
        }),

      addTypedStepAfterOutcome: (outcomeId, stepType) =>
        set((state) => {
          const outcome = state.outcomes[outcomeId];
          if (!outcome || outcome.nextSopStepId) return;

          const parentStep = state.steps[outcome.sopStepId];
          const newSeq = state.stepOrder.length + 1;
          const tmpId = `tmp_step_${crypto.randomUUID()}`;
          const label = SOP_STEP_TYPE_META[stepType].label;

          state.steps[tmpId] = {
            id: tmpId,
            name: `${label} ${newSeq}`,
            description: '',
            sequenceNo: newSeq,
            sopId: state.sop?.id ?? '',
            roleId: parentStep?.roleId ?? null,
            roleName: parentStep?.roleName ?? null,
            roleStatus: parentStep?.roleStatus ?? null,
            stepType,
            ...emptySlaFields(),
          };
          state.stepOrder.push(tmpId);
          state.outcomeOrder[tmpId] = [];
          state.outcomes[outcomeId].nextSopStepId = tmpId;
          state.newIds.add(tmpId);
          state.isDirty = true;
          state.selectedId = tmpId;
        }),

      addTypedStepAfterStep: (stepId, stepType) =>
        set((state) => {
          const sourceStep = state.steps[stepId];
          if (!sourceStep) return;

          const newSeq = state.stepOrder.length + 1;
          const tmpStepId    = `tmp_step_${crypto.randomUUID()}`;
          const tmpOutcomeId = `tmp_outcome_${crypto.randomUUID()}`;
          const label = SOP_STEP_TYPE_META[stepType].label;
          const existingOutcomeCount = (state.outcomeOrder[stepId] ?? []).length;

          state.steps[tmpStepId] = {
            id: tmpStepId,
            name: `${label} ${newSeq}`,
            description: '',
            sequenceNo: newSeq,
            sopId: state.sop?.id ?? '',
            roleId: sourceStep.roleId,
            roleName: sourceStep.roleName,
            roleStatus: sourceStep.roleStatus,
            stepType,
            ...emptySlaFields(),
          };
          state.stepOrder.push(tmpStepId);
          state.outcomeOrder[tmpStepId] = [];

          state.outcomes[tmpOutcomeId] = {
            id: tmpOutcomeId,
            name: 'Next',
            sequenceNo: existingOutcomeCount + 1,
            sopStepId: stepId,
            nextSopStepId: tmpStepId,
          };
          const stepOutcomes = state.outcomeOrder[stepId] ?? [];
          stepOutcomes.push(tmpOutcomeId);
          state.outcomeOrder[stepId] = stepOutcomes;

          state.newIds.add(tmpStepId);
          state.newIds.add(tmpOutcomeId);
          state.isDirty = true;
          state.selectedId = tmpStepId;
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
            for (const outcome of Object.values(state.outcomes)) {
              if (outcome.sopStepId === tmpId) outcome.sopStepId = realId;
              if (outcome.nextSopStepId === tmpId) outcome.nextSopStepId = realId;
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
