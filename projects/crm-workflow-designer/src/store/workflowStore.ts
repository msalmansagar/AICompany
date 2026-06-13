import { create } from 'zustand';
import { temporal } from 'zundo';
import { immer } from 'zustand/middleware/immer';
import type { WorkflowProcess, WorkflowStep, WorkflowOutcome, WorkflowRoute } from '@/types/WorkflowTypes';
import type { SimPath } from '@/services/PathEnumerator';

export type AutoSimSpeed = 'slow' | 'normal' | 'fast';
export type AutoSimPhase = 'playing' | 'holding' | 'done' | null;

export interface WorkflowDesignerState {
  process: WorkflowProcess | null;
  steps: Record<string, WorkflowStep>;
  outcomes: Record<string, WorkflowOutcome>;
  routes: Record<string, WorkflowRoute>;
  stepOrder: string[];
  outcomeOrder: Record<string, string[]>;
  routeOrder: Record<string, string[]>;
  nodePositions: Record<string, { x: number; y: number }>;
  newIds: string[];
  dirtyIds: string[];
  deletedIds: string[];
  deletedEntityTypes: Record<string, 'step' | 'outcome' | 'route'>;
  selectedId: string | null;
  isDirty: boolean;
  isPublishing: boolean;
  isPreviewMode: boolean;
  toastMessage: string | null;
  toastType: 'error' | 'success' | null;

  // Manual simulation
  isSimulating: boolean;
  simCurrentStepId: string | null;
  simVisitedStepIds: string[];
  simTakenOutcomeIds: string[];
  simHistory: Array<{ stepId: string; outcomeId: string }>;

  // Auto simulation playback
  isAutoSimulating: boolean;
  autoSimPhase: AutoSimPhase;
  autoSimSpeed: AutoSimSpeed;
  autoSimPaths: SimPath[];
  autoSimCurrentPathIndex: number;
  autoSimCurrentStepIndex: number;
  autoSimCurrentStepId: string | null;
  autoSimVisitedStepIds: string[];
  autoSimTakenOutcomeIds: string[];

  // Actions
  showToast: (message: string, type: 'error' | 'success') => void;
  clearToast: () => void;
  setProcess: (process: WorkflowProcess) => void;
  setStep: (step: WorkflowStep) => void;
  setOutcome: (outcome: WorkflowOutcome) => void;
  setRoute: (route: WorkflowRoute) => void;
  addStep: (step: WorkflowStep) => void;
  addStepAfter: (fromStepId: string) => void;
  addOutcome: (outcome: WorkflowOutcome) => void;
  addRoute: (route: WorkflowRoute) => void;
  deleteStep: (id: string) => void;
  deleteOutcome: (id: string) => void;
  deleteRoute: (id: string) => void;
  updateNodePosition: (id: string, position: { x: number; y: number }) => void;
  selectNode: (id: string | null) => void;
  clearSelection: () => void;
  markClean: () => void;
  markDirty: () => void;
  resetStore: () => void;
  setPublishing: (value: boolean) => void;
  setPreviewMode: (value: boolean) => void;
  startSimulation: () => void;
  stopSimulation: () => void;
  simTakeOutcome: (outcomeId: string) => void;
  simStepBack: () => void;
  startAutoSimulation: () => void;
  stopAutoSimulation: () => void;
  initAutoSimPlayback: (paths: SimPath[]) => void;
  autoSimAdvanceStep: () => void;
  autoSimBeginHold: () => void;
  autoSimBeginNextPath: () => void;
  autoSimFinish: () => void;
  setAutoSimSpeed: (speed: AutoSimSpeed) => void;
  resolveTemporaryId: (tmpId: string, realId: string, entityType: 'step' | 'outcome' | 'route') => void;
  resolveProcessId: (realId: string) => void;
  assignOutcomeToStep: (outcomeId: string, stepId: string) => void;
  loadWorkflow: (
    process: WorkflowProcess,
    steps: WorkflowStep[],
    outcomes: WorkflowOutcome[],
    routes: WorkflowRoute[],
    positions: Record<string, { x: number; y: number }>
  ) => void;
}

const emptyState: Omit<
  WorkflowDesignerState,
  | 'setProcess' | 'setStep' | 'setOutcome' | 'setRoute'
  | 'addStep' | 'addStepAfter' | 'addOutcome' | 'addRoute'
  | 'deleteStep' | 'deleteOutcome' | 'deleteRoute'
  | 'updateNodePosition' | 'selectNode' | 'clearSelection'
  | 'markClean' | 'markDirty' | 'resetStore' | 'setPublishing' | 'setPreviewMode'
  | 'startSimulation' | 'stopSimulation' | 'simTakeOutcome' | 'simStepBack'
  | 'startAutoSimulation' | 'stopAutoSimulation'
  | 'initAutoSimPlayback' | 'autoSimAdvanceStep' | 'autoSimBeginHold' | 'autoSimBeginNextPath' | 'autoSimFinish' | 'setAutoSimSpeed'
  | 'resolveTemporaryId' | 'resolveProcessId' | 'assignOutcomeToStep' | 'loadWorkflow' | 'showToast' | 'clearToast'
> = {
  process: null,
  steps: {},
  outcomes: {},
  routes: {},
  stepOrder: [],
  outcomeOrder: {},
  routeOrder: {},
  nodePositions: {},
  newIds: [],
  dirtyIds: [],
  deletedIds: [],
  deletedEntityTypes: {},
  selectedId: null,
  isDirty: false,
  isPublishing: false,
  isPreviewMode: false,
  toastMessage: null,
  toastType: null,
  isSimulating: false,
  simCurrentStepId: null,
  simVisitedStepIds: [],
  simTakenOutcomeIds: [],
  simHistory: [],
  isAutoSimulating: false,
  autoSimPhase: null,
  autoSimSpeed: 'normal',
  autoSimPaths: [],
  autoSimCurrentPathIndex: 0,
  autoSimCurrentStepIndex: 0,
  autoSimCurrentStepId: null,
  autoSimVisitedStepIds: [],
  autoSimTakenOutcomeIds: [],
};

export const useWorkflowStore = create<WorkflowDesignerState>()(
  temporal(
    immer((set) => ({
      ...emptyState,

      showToast: (message, type) =>
        set((state) => {
          state.toastMessage = message;
          state.toastType = type;
        }),

      clearToast: () =>
        set((state) => {
          state.toastMessage = null;
          state.toastType = null;
        }),

      setProcess: (process) =>
        set((state) => {
          state.process = process;
          state.isDirty = true;
        }),

      setStep: (step) =>
        set((state) => {
          state.steps[step.crmId] = step;
          if (!state.dirtyIds.includes(step.crmId)) {
            state.dirtyIds.push(step.crmId);
          }
          state.isDirty = true;
        }),

      setOutcome: (outcome) =>
        set((state) => {
          state.outcomes[outcome.crmId] = outcome;
          if (!state.dirtyIds.includes(outcome.crmId)) {
            state.dirtyIds.push(outcome.crmId);
          }
          state.isDirty = true;
        }),

      setRoute: (route) =>
        set((state) => {
          state.routes[route.crmId] = route;
          if (!state.dirtyIds.includes(route.crmId)) {
            state.dirtyIds.push(route.crmId);
          }
          state.isDirty = true;
        }),

      addStep: (step) =>
        set((state) => {
          state.steps[step.crmId] = step;
          state.stepOrder.push(step.crmId);
          state.newIds.push(step.crmId);
          state.isDirty = true;
        }),

      addStepAfter: (fromStepId) =>
        set((state) => {
          if (!state.process) return;
          const fromStep = state.steps[fromStepId];
          if (!fromStep) return;

          const newStepId = `tmp_${crypto.randomUUID()}`;
          const nextSeqNo = state.stepOrder.length + 1;

          const newStep: WorkflowStep = {
            crmId: newStepId,
            name: 'New Step',
            sequenceNo: nextSeqNo,
            schemaName: '',
            taskSubject: '',
            taskDescription: '',
            assignTo: 'user',
            assignedUserId: null,
            assignedUserName: null,
            teamId: null,
            teamName: null,
            roundRobinTeamId: null,
            roundRobinTeamName: null,
            recordEntityId: null,
            recordEntityName: null,
            regardingFieldId: null,
            regardingFieldName: null,
            parentEntityId: null,
            parentEntityName: null,
            processId: state.process.crmId,
          };

          state.steps[newStepId] = newStep;
          state.stepOrder.push(newStepId);
          state.newIds.push(newStepId);

          // Position new step directly below the source step
          const fromIndex = state.stepOrder.indexOf(fromStepId);
          const defaultFromPos = { x: 300, y: fromIndex * 160 + 80 };
          const fromPos = state.nodePositions[`step_${fromStepId}`] ?? defaultFromPos;
          state.nodePositions[`step_${newStepId}`] = { x: fromPos.x, y: fromPos.y + 180 };

          // Auto-create connecting outcome
          const maxSeq = Object.values(state.outcomes).reduce(
            (max, o) => (o.sequenceNumber > max ? o.sequenceNumber : max), 0
          );
          const outcomeId = `tmp_${crypto.randomUUID()}`;
          state.outcomes[outcomeId] = {
            crmId: outcomeId,
            name: 'Next',
            sequenceNumber: maxSeq + 1,
            applyFilter: false,
            stepId: fromStepId,
            nextStepId: newStepId,
          };
          if (!state.outcomeOrder[fromStepId]) state.outcomeOrder[fromStepId] = [];
          state.outcomeOrder[fromStepId]!.push(outcomeId);
          state.newIds.push(outcomeId);

          state.selectedId = `step_${newStepId}`;
          state.isDirty = true;
        }),

      addOutcome: (outcome) =>
        set((state) => {
          state.outcomes[outcome.crmId] = outcome;
          if (!state.outcomeOrder[outcome.stepId]) {
            state.outcomeOrder[outcome.stepId] = [];
          }
          state.outcomeOrder[outcome.stepId]!.push(outcome.crmId);
          state.newIds.push(outcome.crmId);
          state.isDirty = true;
        }),

      addRoute: (route) =>
        set((state) => {
          state.routes[route.crmId] = route;
          if (!state.routeOrder[route.outcomeId]) {
            state.routeOrder[route.outcomeId] = [];
          }
          state.routeOrder[route.outcomeId]!.push(route.crmId);
          state.newIds.push(route.crmId);
          state.isDirty = true;
        }),

      deleteStep: (id) =>
        set((state) => {
          const step = state.steps[id];
          if (step) {
            // Cascade delete outcomes and routes
            const outcomeIds = Object.values(state.outcomes)
              .filter((o) => o.stepId === id)
              .map((o) => o.crmId);

            for (const outcomeId of outcomeIds) {
              const routeIds = Object.values(state.routes)
                .filter((r) => r.outcomeId === outcomeId)
                .map((r) => r.crmId);
              for (const routeId of routeIds) {
                delete state.routes[routeId];
                state.deletedIds.push(routeId);
                state.deletedEntityTypes[routeId] = 'route';
              }
              delete state.outcomes[outcomeId];
              state.deletedIds.push(outcomeId);
              state.deletedEntityTypes[outcomeId] = 'outcome';
            }

            delete state.steps[id];
            state.stepOrder = state.stepOrder.filter((s) => s !== id);
            state.deletedIds.push(id);
            state.deletedEntityTypes[id] = 'step';
            state.isDirty = true;
          }
        }),

      deleteOutcome: (id) =>
        set((state) => {
          const outcome = state.outcomes[id];
          if (outcome) {
            const routeIds = Object.values(state.routes)
              .filter((r) => r.outcomeId === id)
              .map((r) => r.crmId);
            for (const routeId of routeIds) {
              delete state.routes[routeId];
              state.deletedIds.push(routeId);
              state.deletedEntityTypes[routeId] = 'route';
            }
            delete state.outcomes[id];
            if (state.outcomeOrder[outcome.stepId]) {
              state.outcomeOrder[outcome.stepId] = state.outcomeOrder[outcome.stepId]!.filter(
                (oid) => oid !== id
              );
            }
            state.deletedIds.push(id);
            state.deletedEntityTypes[id] = 'outcome';
            state.isDirty = true;
          }
        }),

      deleteRoute: (id) =>
        set((state) => {
          const route = state.routes[id];
          if (route) {
            delete state.routes[id];
            if (state.routeOrder[route.outcomeId]) {
              state.routeOrder[route.outcomeId] = state.routeOrder[route.outcomeId]!.filter(
                (rid) => rid !== id
              );
            }
            state.deletedIds.push(id);
            state.deletedEntityTypes[id] = 'route';
            state.isDirty = true;
          }
        }),

      updateNodePosition: (id, position) =>
        set((state) => {
          state.nodePositions[id] = position;
        }),

      selectNode: (id) =>
        set((state) => {
          state.selectedId = id;
        }),

      clearSelection: () =>
        set((state) => {
          state.selectedId = null;
        }),

      markClean: () =>
        set((state) => {
          state.isDirty = false;
          state.newIds = [];
          state.dirtyIds = [];
          state.deletedIds = [];
          state.deletedEntityTypes = {};
        }),

      markDirty: () =>
        set((state) => {
          state.isDirty = true;
        }),

      setPublishing: (value) =>
        set((state) => {
          state.isPublishing = value;
        }),

      setPreviewMode: (value) =>
        set((state) => {
          state.isPreviewMode = value;
        }),

      startSimulation: () =>
        set((state) => {
          if (state.stepOrder.length === 0) return;
          const stepsWithIncoming = new Set<string>(
            Object.values(state.outcomes)
              .map((o) => o.nextStepId)
              .filter((id): id is string => id !== null)
          );
          const entryStepId =
            state.stepOrder.find((id) => !stepsWithIncoming.has(id)) ?? state.stepOrder[0]!;
          state.isSimulating = true;
          state.simCurrentStepId = entryStepId;
          state.simVisitedStepIds = [];
          state.simTakenOutcomeIds = [];
          state.simHistory = [];
          state.selectedId = null;
        }),

      stopSimulation: () =>
        set((state) => {
          state.isSimulating = false;
          state.simCurrentStepId = null;
          state.simVisitedStepIds = [];
          state.simTakenOutcomeIds = [];
          state.simHistory = [];
        }),

      startAutoSimulation: () =>
        set((state) => {
          state.isAutoSimulating = true;
          state.autoSimPhase = null;
          state.autoSimPaths = [];
          state.autoSimCurrentPathIndex = 0;
          state.autoSimCurrentStepIndex = 0;
          state.autoSimCurrentStepId = null;
          state.autoSimVisitedStepIds = [];
          state.autoSimTakenOutcomeIds = [];
          state.selectedId = null;
        }),

      stopAutoSimulation: () =>
        set((state) => {
          state.isAutoSimulating = false;
          state.autoSimPhase = null;
          state.autoSimPaths = [];
          state.autoSimCurrentPathIndex = 0;
          state.autoSimCurrentStepIndex = 0;
          state.autoSimCurrentStepId = null;
          state.autoSimVisitedStepIds = [];
          state.autoSimTakenOutcomeIds = [];
        }),

      initAutoSimPlayback: (paths) =>
        set((state) => {
          state.autoSimPaths = paths;
          state.autoSimCurrentPathIndex = 0;
          state.autoSimCurrentStepIndex = 0;
          state.autoSimPhase = paths.length > 0 ? 'playing' : 'done';
          state.autoSimCurrentStepId = paths[0]?.steps[0]?.stepId ?? null;
          state.autoSimVisitedStepIds = [];
          state.autoSimTakenOutcomeIds = [];
        }),

      autoSimAdvanceStep: () =>
        set((state) => {
          const path = state.autoSimPaths[state.autoSimCurrentPathIndex];
          if (!path) return;
          const current = path.steps[state.autoSimCurrentStepIndex];
          if (current) {
            if (!state.autoSimVisitedStepIds.includes(current.stepId)) {
              state.autoSimVisitedStepIds.push(current.stepId);
            }
            if (current.outcomeTaken) {
              state.autoSimTakenOutcomeIds.push(current.outcomeTaken.outcomeId);
            }
          }
          state.autoSimCurrentStepIndex += 1;
          const next = path.steps[state.autoSimCurrentStepIndex];
          state.autoSimCurrentStepId = next?.stepId ?? null;
        }),

      autoSimBeginHold: () =>
        set((state) => {
          const path = state.autoSimPaths[state.autoSimCurrentPathIndex];
          if (!path) return;
          const current = path.steps[state.autoSimCurrentStepIndex];
          if (current && !state.autoSimVisitedStepIds.includes(current.stepId)) {
            state.autoSimVisitedStepIds.push(current.stepId);
          }
          state.autoSimPhase = 'holding';
          state.autoSimCurrentStepId = null;
        }),

      autoSimBeginNextPath: () =>
        set((state) => {
          state.autoSimCurrentPathIndex += 1;
          state.autoSimCurrentStepIndex = 0;
          state.autoSimPhase = 'playing';
          const next = state.autoSimPaths[state.autoSimCurrentPathIndex];
          state.autoSimCurrentStepId = next?.steps[0]?.stepId ?? null;
          state.autoSimVisitedStepIds = [];
          state.autoSimTakenOutcomeIds = [];
        }),

      autoSimFinish: () =>
        set((state) => {
          state.autoSimPhase = 'done';
          state.autoSimCurrentStepId = null;
        }),

      setAutoSimSpeed: (speed) =>
        set((state) => {
          state.autoSimSpeed = speed;
        }),

      simTakeOutcome: (outcomeId) =>
        set((state) => {
          const outcome = state.outcomes[outcomeId];
          if (!outcome || state.simCurrentStepId === null) return;
          state.simHistory.push({ stepId: state.simCurrentStepId, outcomeId });
          if (!state.simVisitedStepIds.includes(state.simCurrentStepId)) {
            state.simVisitedStepIds.push(state.simCurrentStepId);
          }
          state.simTakenOutcomeIds.push(outcomeId);
          state.simCurrentStepId = outcome.nextStepId;
        }),

      simStepBack: () =>
        set((state) => {
          const last = state.simHistory.pop();
          if (!last) return;
          state.simCurrentStepId = last.stepId;
          state.simVisitedStepIds = state.simVisitedStepIds.filter((id) => id !== last.stepId);
          state.simTakenOutcomeIds = state.simTakenOutcomeIds.filter((id) => id !== last.outcomeId);
        }),

      resolveProcessId: (realId) =>
        set((state) => {
          if (state.process) {
            state.process.crmId = realId;
          }
        }),

      assignOutcomeToStep: (outcomeId, stepId) =>
        set((state) => {
          const outcome = state.outcomes[outcomeId];
          if (!outcome) return;

          // Remove from old outcomeOrder bucket
          const oldStepId = outcome.stepId;
          if (oldStepId && state.outcomeOrder[oldStepId]) {
            state.outcomeOrder[oldStepId] = state.outcomeOrder[oldStepId]!.filter(
              (id) => id !== outcomeId
            );
          }

          // Update outcome
          outcome.stepId = stepId;
          if (!state.dirtyIds.includes(outcomeId)) {
            state.dirtyIds.push(outcomeId);
          }

          // Add to new outcomeOrder bucket
          if (!state.outcomeOrder[stepId]) {
            state.outcomeOrder[stepId] = [];
          }
          if (!state.outcomeOrder[stepId]!.includes(outcomeId)) {
            state.outcomeOrder[stepId]!.push(outcomeId);
          }

          state.isDirty = true;
        }),

      resolveTemporaryId: (tmpId, realId, entityType) =>
        set((state) => {
          if (entityType === 'step' && state.steps[tmpId]) {
            const step = { ...state.steps[tmpId]!, crmId: realId };
            delete state.steps[tmpId];
            state.steps[realId] = step;
            state.stepOrder = state.stepOrder.map((id) => (id === tmpId ? realId : id));
            state.nodePositions[realId] = state.nodePositions[tmpId] ?? { x: 0, y: 0 };
            delete state.nodePositions[tmpId];
          } else if (entityType === 'outcome' && state.outcomes[tmpId]) {
            const outcome = { ...state.outcomes[tmpId]!, crmId: realId };
            delete state.outcomes[tmpId];
            state.outcomes[realId] = outcome;
            const stepId = outcome.stepId;
            if (state.outcomeOrder[stepId]) {
              state.outcomeOrder[stepId] = state.outcomeOrder[stepId]!.map((id) =>
                id === tmpId ? realId : id
              );
            }
          } else if (entityType === 'route' && state.routes[tmpId]) {
            const route = { ...state.routes[tmpId]!, crmId: realId };
            delete state.routes[tmpId];
            state.routes[realId] = route;
          }
          state.newIds = state.newIds.filter((id) => id !== tmpId);
        }),

      resetStore: () =>
        set((state) => {
          Object.assign(state, emptyState);
        }),

      loadWorkflow: (process, steps, outcomes, routes, positions) =>
        set((state) => {
          state.process = process;
          state.steps = {};
          state.outcomes = {};
          state.routes = {};
          state.stepOrder = [];
          state.outcomeOrder = {};
          state.routeOrder = {};
          state.nodePositions = positions;
          state.newIds = [];
          state.dirtyIds = [];
          state.deletedIds = [];
          state.deletedEntityTypes = {};
          state.isDirty = false;

          const sortedSteps = [...steps].sort((a, b) => a.sequenceNo - b.sequenceNo);
          for (const step of sortedSteps) {
            state.steps[step.crmId] = step;
            state.stepOrder.push(step.crmId);
          }

          for (const outcome of outcomes) {
            state.outcomes[outcome.crmId] = outcome;
            if (!state.outcomeOrder[outcome.stepId]) {
              state.outcomeOrder[outcome.stepId] = [];
            }
            state.outcomeOrder[outcome.stepId]!.push(outcome.crmId);
          }

          for (const route of routes) {
            state.routes[route.crmId] = route;
            if (!state.routeOrder[route.outcomeId]) {
              state.routeOrder[route.outcomeId] = [];
            }
            state.routeOrder[route.outcomeId]!.push(route.crmId);
          }
        }),
    })),
    { limit: 50 }
  )
);
