import type { Node, Edge } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';
import type { WorkflowDesignerState } from './workflowStore';
import type { AssignToType } from '@/types/WorkflowTypes';

export interface StepNodeData extends Record<string, unknown> {
  kind: 'step';
  crmId: string;
  name: string;
  sequenceNo: number;
  assignTo: AssignToType;
  assignedUserName: string | null;
  teamName: string | null;
  roundRobinTeamName: string | null;
  recordEntityName: string | null;
  isSelected: boolean;
  hasValidationError: boolean;
}

export interface OutcomeNodeData extends Record<string, unknown> {
  kind: 'outcome';
  crmId: string;
  name: string;
  sequenceNumber: number;
  applyFilter: boolean;
  stepId: string;
  isOrphaned: boolean;
}

export interface StartNodeData extends Record<string, unknown> {
  kind: 'start';
  crmId: string;
  name: string;
}

export interface EndNodeData extends Record<string, unknown> {
  kind: 'end';
  crmId: string;
}

export interface RouteEdgeData extends Record<string, unknown> {
  kind: 'route';
  crmId: string;
  name: string;
  hasFilter: boolean;
  isFallback: boolean;
}

const STEP_X = 320;
const STEP_Y_GAP = 220;
const OUTCOME_X_OFFSET = 240;
const OUTCOME_Y_OFFSET = 60;

export function deriveNodes(state: WorkflowDesignerState): Node[] {
  const nodes: Node[] = [];
  const stepIds = new Set(Object.keys(state.steps));
  const steps = Object.values(state.steps).sort((a, b) => a.sequenceNo - b.sequenceNo);
  const stepsWithOutcomes = new Set(Object.values(state.outcomes).map((o) => o.stepId));

  // Step nodes
  steps.forEach((step, index) => {
    const hasValidationError = !stepsWithOutcomes.has(step.crmId);
    nodes.push({
      id: step.crmId,
      type: 'step',
      position: state.nodePositions[step.crmId] ?? {
        x: STEP_X,
        y: 80 + index * STEP_Y_GAP,
      },
      selected: state.selectedId === step.crmId,
      data: {
        kind: 'step',
        crmId: step.crmId,
        name: step.name,
        sequenceNo: step.sequenceNo,
        assignTo: step.assignTo,
        assignedUserName: step.assignedUserName,
        teamName: step.teamName,
        roundRobinTeamName: step.roundRobinTeamName,
        recordEntityName: step.recordEntityName,
        isSelected: state.selectedId === step.crmId,
        hasValidationError,
      } satisfies StepNodeData,
    });
  });

  // Outcome nodes — ALL outcomes, including orphaned (stepId='')
  Object.values(state.outcomes).forEach((outcome, index) => {
    const isOrphaned = !outcome.stepId || !stepIds.has(outcome.stepId);

    // Position: if orphaned, place in a staging area; if linked, position relative to step
    let defaultPosition: { x: number; y: number };
    if (!isOrphaned) {
      const stepIndex = steps.findIndex((s) => s.crmId === outcome.stepId);
      const outcomeIndex = (state.outcomeOrder[outcome.stepId] ?? []).indexOf(outcome.crmId);
      defaultPosition = {
        x: STEP_X + OUTCOME_X_OFFSET + Math.max(0, outcomeIndex) * 180,
        y: 80 + stepIndex * STEP_Y_GAP + OUTCOME_Y_OFFSET,
      };
    } else {
      defaultPosition = { x: 80 + index * 160, y: 40 };
    }

    nodes.push({
      id: outcome.crmId,
      type: 'outcome',
      position: state.nodePositions[outcome.crmId] ?? defaultPosition,
      selected: state.selectedId === outcome.crmId,
      data: {
        kind: 'outcome',
        crmId: outcome.crmId,
        name: outcome.name,
        sequenceNumber: outcome.sequenceNumber,
        applyFilter: outcome.applyFilter,
        stepId: outcome.stepId,
        isOrphaned,
      } satisfies OutcomeNodeData,
    });
  });

  return nodes;
}

export function deriveEdges(state: WorkflowDesignerState): Edge[] {
  const edges: Edge[] = [];
  const stepIds = new Set(Object.keys(state.steps));

  // Step → Outcome edges (only for linked outcomes)
  for (const outcome of Object.values(state.outcomes)) {
    if (!outcome.stepId || !stepIds.has(outcome.stepId)) continue;

    edges.push({
      id: `edge_step_outcome_${outcome.stepId}_${outcome.crmId}`,
      source: outcome.stepId,
      target: outcome.crmId,
      type: 'stepToOutcome',
      style: { stroke: '#94a3b8', strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
    });
  }

  // Route edges: outcome → next step
  for (const route of Object.values(state.routes)) {
    if (!route.outcomeId || !route.nextStepId) continue;

    const hasFilter = route.filter.trim().length > 0;
    const parentOutcome = state.outcomes[route.outcomeId];
    const isFallback = !hasFilter && (parentOutcome?.applyFilter ?? false);
    edges.push({
      id: `edge_route_${route.crmId}`,
      source: route.outcomeId,
      target: route.nextStepId,
      type: 'route',
      animated: hasFilter,
      label: route.name || undefined,
      selected: state.selectedId === route.crmId,
      data: {
        kind: 'route',
        crmId: route.crmId,
        name: route.name,
        hasFilter,
        isFallback,
      } satisfies RouteEdgeData,
    });
  }

  return edges;
}
