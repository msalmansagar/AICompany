import type { Node, Edge } from '@xyflow/react';
import type { WorkflowDesignerState } from './workflowStore';

export interface StepNodeData extends Record<string, unknown> {
  kind: 'step';
  crmId: string;
  name: string;
  sequenceNo: number;
  assignTo: 'user' | 'team';
  assignedUserName: string | null;
  teamName: string | null;
  recordEntity: string;
  isSelected: boolean;
}

export interface OutcomeNodeData extends Record<string, unknown> {
  kind: 'outcome';
  crmId: string;
  name: string;
  sequenceNumber: number;
  applyFilter: boolean;
  stepId: string;
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
}

const DEFAULT_POSITION = { x: 0, y: 0 };
const STEP_X_BASE = 300;
const STEP_Y_GAP = 200;
const OUTCOME_X_OFFSET = 200;
const OUTCOME_Y_OFFSET = 80;

export function deriveNodes(state: WorkflowDesignerState): Node[] {
  const nodes: Node[] = [];
  const steps = Object.values(state.steps).sort((a, b) => a.sequenceNo - b.sequenceNo);

  if (steps.length === 0) return nodes;

  const startStep = steps[0]!;

  // Start node
  nodes.push({
    id: `start_${startStep.crmId}`,
    type: 'start',
    position: state.nodePositions[`start_${startStep.crmId}`] ?? { x: STEP_X_BASE, y: 40 },
    data: {
      kind: 'start',
      crmId: startStep.crmId,
      name: startStep.name,
    } satisfies StartNodeData,
  });

  // Step nodes
  steps.forEach((step, index) => {
    nodes.push({
      id: step.crmId,
      type: 'step',
      position: state.nodePositions[step.crmId] ?? {
        x: STEP_X_BASE,
        y: 40 + 100 + index * STEP_Y_GAP,
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
        recordEntity: step.recordEntity,
        isSelected: state.selectedId === step.crmId,
      } satisfies StepNodeData,
    });

    // Outcome nodes for this step
    const outcomeIds = state.outcomeOrder[step.crmId] ?? [];
    outcomeIds.forEach((outcomeId, oi) => {
      const outcome = state.outcomes[outcomeId];
      if (!outcome) return;

      nodes.push({
        id: outcome.crmId,
        type: 'outcome',
        position: state.nodePositions[outcome.crmId] ?? {
          x: STEP_X_BASE + OUTCOME_X_OFFSET + oi * 180,
          y: 40 + 100 + index * STEP_Y_GAP + OUTCOME_Y_OFFSET,
        },
        selected: state.selectedId === outcome.crmId,
        data: {
          kind: 'outcome',
          crmId: outcome.crmId,
          name: outcome.name,
          sequenceNumber: outcome.sequenceNumber,
          applyFilter: outcome.applyFilter,
          stepId: outcome.stepId,
        } satisfies OutcomeNodeData,
      });
    });
  });

  return nodes;
}

export function deriveEdges(state: WorkflowDesignerState): Edge[] {
  const edges: Edge[] = [];
  const steps = Object.values(state.steps).sort((a, b) => a.sequenceNo - b.sequenceNo);

  if (steps.length === 0) return edges;

  const startStep = steps[0]!;

  // Start -> first step
  edges.push({
    id: `edge_start_${startStep.crmId}`,
    source: `start_${startStep.crmId}`,
    target: startStep.crmId,
    type: 'smoothstep',
    style: { stroke: '#16a34a', strokeWidth: 2 },
  });

  // Step -> Outcome edges
  for (const step of steps) {
    const outcomeIds = state.outcomeOrder[step.crmId] ?? [];
    for (const outcomeId of outcomeIds) {
      edges.push({
        id: `edge_step_outcome_${step.crmId}_${outcomeId}`,
        source: step.crmId,
        target: outcomeId,
        type: 'stepToOutcome',
        style: { stroke: '#94a3b8', strokeWidth: 1.5 },
      });
    }
  }

  // Route edges: outcome -> next step
  for (const route of Object.values(state.routes)) {
    const hasFilter = route.filter.trim().length > 0;
    edges.push({
      id: `edge_route_${route.crmId}`,
      source: route.outcomeId,
      target: route.nextStepId,
      type: 'route',
      animated: hasFilter,
      label: route.name,
      data: {
        kind: 'route',
        crmId: route.crmId,
        name: route.name,
        hasFilter,
      } satisfies RouteEdgeData,
    });
  }

  return edges;
}

/** Positions come from nodePositions in store — DEFAULT_POSITION is the fallback */
const _unused = DEFAULT_POSITION;
void _unused;
