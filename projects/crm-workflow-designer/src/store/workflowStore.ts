import { emptyWorkflowHooks, STEP_HOOKS, OUTCOME_HOOKS } from '@/services/workflowHooks';
import { create } from 'zustand';
import { temporal } from 'zundo';
import { immer } from 'zustand/middleware/immer';
import type { WorkflowProcess, WorkflowStep, WorkflowOutcome, WorkflowRoute } from '@/types/WorkflowTypes';
import type { SimPath } from '@/services/PathEnumerator';
import { emptyEscalationFields } from '@/services/escalationFields';
import { emptyAssignmentFields } from '@/services/taskAssignment';
import { emptyBranchFields, emptyOutcomeConcurrency } from '@/services/branchFields';
import type { Violation } from '@/services/ValidationService';

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
  validationResults: Violation[];

  // Manual simulation
  isSimulating: boolean;
  simCurrentStepId: string | null;
  simVisitedStepIds: string[];
  simTakenOutcomeIds: string[];
  simHistory: Array<{ stepId: string; outcomeId: string }>;
  simRoutePickerOutcomeId: string | null;

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
  setValidationResults: (results: Violation[]) => void;
  clearValidationResults: () => void;
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
  simOpenRoutePicker: (outcomeId: string) => void;
  simCloseRoutePicker: () => void;
  simTakeRoute: (outcomeId: string, nextStepId: string | null) => void;
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
  moveStepUp: (stepId: string) => void;
  moveStepDown: (stepId: string) => void;
  setNodePositions: (positions: Record<string, { x: number; y: number }>) => void;
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
  | 'startSimulation' | 'stopSimulation' | 'simTakeOutcome' | 'simOpenRoutePicker' | 'simCloseRoutePicker' | 'simTakeRoute' | 'simStepBack'
  | 'startAutoSimulation' | 'stopAutoSimulation'
  | 'initAutoSimPlayback' | 'autoSimAdvanceStep' | 'autoSimBeginHold' | 'autoSimBeginNextPath' | 'autoSimFinish' | 'setAutoSimSpeed'
  | 'resolveTemporaryId' | 'resolveProcessId' | 'assignOutcomeToStep' | 'loadWorkflow'
  | 'showToast' | 'clearToast' | 'setValidationResults' | 'clearValidationResults'
  | 'moveStepUp' | 'moveStepDown' | 'setNodePositions'
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
  validationResults: [],
  isSimulating: false,
  simCurrentStepId: null,
  simVisitedStepIds: [],
  simTakenOutcomeIds: [],
  simHistory: [],
  simRoutePickerOutcomeId: null,
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

// ── Temporary-id resolution ────────────────────────────────────────────────
// When the backend assigns a real GUID to a newly-created entity, every place
// that referenced the temporary id must be rewritten — otherwise edges built
// from stale foreign keys point at nodes that no longer exist and disappear.

/** Rewrites a step's temp id to its real id across all references. */
function remapStepId(state: WorkflowDesignerState, tmpId: string, realId: string): void {
  const step = state.steps[tmpId];
  if (!step) return;
  state.steps[realId] = { ...step, crmId: realId };
  delete state.steps[tmpId];
  state.stepOrder = state.stepOrder.map((id) => (id === tmpId ? realId : id));
  state.nodePositions[realId] = state.nodePositions[tmpId] ?? { x: 0, y: 0 };
  delete state.nodePositions[tmpId];
  if (state.outcomeOrder[tmpId]) {
    state.outcomeOrder[realId] = state.outcomeOrder[tmpId]!;
    delete state.outcomeOrder[tmpId];
  }
  for (const outcome of Object.values(state.outcomes)) {
    if (outcome.stepId === tmpId) outcome.stepId = realId;
    if (outcome.nextStepId === tmpId) outcome.nextStepId = realId;
  }
  for (const route of Object.values(state.routes)) {
    if (route.nextStepId === tmpId) route.nextStepId = realId;
  }
}

/** Rewrites an outcome's temp id to its real id across all references. */
function remapOutcomeId(state: WorkflowDesignerState, tmpId: string, realId: string): void {
  const outcome = state.outcomes[tmpId];
  if (!outcome) return;
  state.outcomes[realId] = { ...outcome, crmId: realId };
  delete state.outcomes[tmpId];
  const bucket = state.outcomeOrder[outcome.stepId];
  if (bucket) {
    state.outcomeOrder[outcome.stepId] = bucket.map((id) => (id === tmpId ? realId : id));
  }
  if (state.nodePositions[tmpId]) {
    state.nodePositions[realId] = state.nodePositions[tmpId]!;
    delete state.nodePositions[tmpId];
  }
  if (state.routeOrder[tmpId]) {
    state.routeOrder[realId] = state.routeOrder[tmpId]!;
    delete state.routeOrder[tmpId];
  }
  for (const route of Object.values(state.routes)) {
    if (route.outcomeId === tmpId) route.outcomeId = realId;
  }
}

// selectedId stores canvas node/edge ids, which carry a type prefix
// (e.g. "step_<crmId>"), unlike the raw crmId passed to resolveTemporaryId.
const SELECTED_ID_PREFIX: Record<'step' | 'outcome' | 'route', string> = {
  step: 'step_',
  outcome: 'outcome_',
  route: 'route_edge_',
};

/** Keeps the current selection pointed at an entity after its id resolves. */
function remapSelectedId(
  state: WorkflowDesignerState,
  entityType: 'step' | 'outcome' | 'route',
  tmpId: string,
  realId: string
): void {
  const prefix = SELECTED_ID_PREFIX[entityType];
  if (state.selectedId === `${prefix}${tmpId}`) {
    state.selectedId = `${prefix}${realId}`;
  }
}

/** Rewrites a route's temp id to its real id across all references. */
function remapRouteId(state: WorkflowDesignerState, tmpId: string, realId: string): void {
  const route = state.routes[tmpId];
  if (!route) return;
  state.routes[realId] = { ...route, crmId: realId };
  delete state.routes[tmpId];
  const bucket = state.routeOrder[route.outcomeId];
  if (bucket) {
    state.routeOrder[route.outcomeId] = bucket.map((id) => (id === tmpId ? realId : id));
  }
}

/**
 * Keeps the one-fallback-per-decision rule true by construction.
 *
 * The engine refuses a second default with "You cann't define multiple default
 * conditions", so promoting a route demotes whichever sibling held the role. Enforcing
 * it here means the state can never reach the save in a shape the server would reject,
 * rather than being told about it afterwards.
 */
function demoteOtherDefaults(
  state: { routes: Record<string, WorkflowRoute>; dirtyIds: string[] },
  promoted: WorkflowRoute
): void {
  if (!promoted.isDefault) return;
  for (const other of Object.values(state.routes)) {
    if (other.crmId === promoted.crmId) continue;
    if (other.outcomeId !== promoted.outcomeId || !other.isDefault) continue;
    other.isDefault = false;
    if (!state.dirtyIds.includes(other.crmId)) state.dirtyIds.push(other.crmId);
  }
}
/**
 * Whether the canvas is being watched rather than edited.
 *
 * Simulation and preview are separate flags and components kept checking only one of
 * them, so editing controls stayed live while a process was being played back - you
 * could delete a route mid-simulation. Asking one question in one place is what stops
 * the next control getting it wrong too.
 */
export function selectCanvasIsReadOnly(state: { isSimulating: boolean; isPreviewMode: boolean }): boolean {
  return state.isSimulating || state.isPreviewMode;
}

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

      setValidationResults: (results) =>
        set((state) => {
          state.validationResults = results;
        }),

      clearValidationResults: () =>
        set((state) => {
          state.validationResults = [];
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
          demoteOtherDefaults(state, route);
          if (!state.dirtyIds.includes(route.crmId)) {
            state.dirtyIds.push(route.crmId);
          }
          state.isDirty = true;
        }),

      addStep: (step) =>
        set((state) => {
          state.steps[step.crmId] = step;
          state.stepOrder.push(step.crmId);
          state.outcomeOrder[step.crmId] = [];
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
            ...emptyEscalationFields(),
            ...emptyBranchFields(),
            ...emptyAssignmentFields(),
            workflowHooks: emptyWorkflowHooks(STEP_HOOKS),
            crmId: newStepId,
            name: 'New Step',
            sequenceNo: nextSeqNo,
            schemaName: '',
            taskSubject: '',
            taskDescription: '',
            allowBulkApproval: false,
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
            ...emptyOutcomeConcurrency(),
            workflowHooks: emptyWorkflowHooks(OUTCOME_HOOKS),
            stepId: fromStepId,
            nextStepId: newStepId,
          };
          if (!state.outcomeOrder[fromStepId]) state.outcomeOrder[fromStepId] = [];
          state.outcomeOrder[fromStepId]!.push(outcomeId);
          state.newIds.push(outcomeId);

          // The new step needs a decision of its own. The engine stops on a task
          // completed without one, so a step created without an outcome is not a
          // half-built step - it is a broken one, and it would block the next save.
          const terminalOutcomeId = `tmp_${crypto.randomUUID()}`;
          state.outcomes[terminalOutcomeId] = {
            crmId: terminalOutcomeId,
            name: 'Complete',
            sequenceNumber: maxSeq + 2,
            applyFilter: false,
            ...emptyOutcomeConcurrency(),
            workflowHooks: emptyWorkflowHooks(OUTCOME_HOOKS),
            stepId: newStepId,
            nextStepId: null,
          };
          state.outcomeOrder[newStepId] = [terminalOutcomeId];
          state.newIds.push(terminalOutcomeId);

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
          demoteOtherDefaults(state, route);
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
          // Only count FORWARD outcomes as "incoming" — ignore back-edges.
          // A back-edge is one where the target step has a lower sequenceNo than
          // the source (e.g. CEO Approval → Initial Review RM loop). Without this
          // guard, step 1 ends up in stepsWithIncoming and the algorithm picks the
          // last step (the only one with no forward-incoming) as the entry point.
          const stepsWithForwardIncoming = new Set<string>();
          for (const outcome of Object.values(state.outcomes)) {
            if (!outcome.nextStepId) continue;
            const src = state.steps[outcome.stepId];
            const tgt = state.steps[outcome.nextStepId];
            if (src && tgt && tgt.sequenceNo > src.sequenceNo) {
              stepsWithForwardIncoming.add(outcome.nextStepId);
            }
          }
          const entryStepId =
            state.stepOrder.find((id) => !stepsWithForwardIncoming.has(id)) ?? state.stepOrder[0]!;
          state.isSimulating = true;
          state.simCurrentStepId = entryStepId;
          state.simVisitedStepIds = [];
          state.simTakenOutcomeIds = [];
          state.simHistory = [];
          state.simRoutePickerOutcomeId = null;
          state.selectedId = null;
        }),

      stopSimulation: () =>
        set((state) => {
          state.isSimulating = false;
          state.simCurrentStepId = null;
          state.simVisitedStepIds = [];
          state.simTakenOutcomeIds = [];
          state.simHistory = [];
          state.simRoutePickerOutcomeId = null;
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

      simOpenRoutePicker: (outcomeId) =>
        set((state) => {
          state.simRoutePickerOutcomeId = outcomeId;
        }),

      simCloseRoutePicker: () =>
        set((state) => {
          state.simRoutePickerOutcomeId = null;
        }),

      simTakeRoute: (outcomeId, nextStepId) =>
        set((state) => {
          if (state.simCurrentStepId === null) return;
          state.simHistory.push({ stepId: state.simCurrentStepId, outcomeId });
          if (!state.simVisitedStepIds.includes(state.simCurrentStepId)) {
            state.simVisitedStepIds.push(state.simCurrentStepId);
          }
          state.simTakenOutcomeIds.push(outcomeId);
          state.simCurrentStepId = nextStepId;
          state.simRoutePickerOutcomeId = null;
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

      moveStepUp: (stepId) =>
        set((state) => {
          const idx = state.stepOrder.indexOf(stepId);
          if (idx <= 0) return;
          [state.stepOrder[idx - 1], state.stepOrder[idx]] = [state.stepOrder[idx]!, state.stepOrder[idx - 1]!];
          state.stepOrder.forEach((id, i) => {
            if (state.steps[id]) {
              state.steps[id]!.sequenceNo = i + 1;
              if (!state.dirtyIds.includes(id)) state.dirtyIds.push(id);
            }
          });
          state.isDirty = true;
        }),

      moveStepDown: (stepId) =>
        set((state) => {
          const idx = state.stepOrder.indexOf(stepId);
          if (idx < 0 || idx >= state.stepOrder.length - 1) return;
          [state.stepOrder[idx], state.stepOrder[idx + 1]] = [state.stepOrder[idx + 1]!, state.stepOrder[idx]!];
          state.stepOrder.forEach((id, i) => {
            if (state.steps[id]) {
              state.steps[id]!.sequenceNo = i + 1;
              if (!state.dirtyIds.includes(id)) state.dirtyIds.push(id);
            }
          });
          state.isDirty = true;
        }),

      setNodePositions: (positions) =>
        set((state) => {
          for (const [id, pos] of Object.entries(positions)) {
            state.nodePositions[id] = pos;
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
          if (entityType === 'step') remapStepId(state, tmpId, realId);
          else if (entityType === 'outcome') remapOutcomeId(state, tmpId, realId);
          else if (entityType === 'route') remapRouteId(state, tmpId, realId);
          state.newIds = state.newIds.filter((id) => id !== tmpId);
          remapSelectedId(state, entityType, tmpId, realId);
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
          state.validationResults = [];

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
