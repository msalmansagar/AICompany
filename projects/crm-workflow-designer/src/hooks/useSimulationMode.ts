import { useMemo } from 'react';
import type { Node, Edge, NodeChange } from '@xyflow/react';
import { useWorkflowStore } from '@/store/workflowStore';
import type { WorkflowOutcome } from '@/types/WorkflowTypes';
import type { SimStepData, SimStepStatus } from '@/nodes/SimStepNode';
import { resolveSimEndpoints } from '@/services/simEndpoints';
import { useSyncedNodes } from '@/hooks/useSyncedNodes';

interface UseSimulationModeResult {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: (changes: NodeChange[]) => void;
}

const SIM_START_ID = 'sim_start';
const SIM_END_ID = 'sim_end';

export function useSimulationMode(): UseSimulationModeResult {
  const {
    steps,
    stepOrder,
    outcomes,
    nodePositions,
    simCurrentStepId,
    simVisitedStepIds,
    simTakenOutcomeIds,
  } = useWorkflowStore((s) => ({
    steps: s.steps,
    stepOrder: s.stepOrder,
    outcomes: s.outcomes,
    nodePositions: s.nodePositions,
    simCurrentStepId: s.simCurrentStepId,
    simVisitedStepIds: s.simVisitedStepIds,
    simTakenOutcomeIds: s.simTakenOutcomeIds,
  }));

  const blueprint = useMemo<Node[]>(() => {
    const { start: startPos, end: endPos, dir } = resolveSimEndpoints(nodePositions, stepOrder);

    const startNode: Node = {
      id: SIM_START_ID,
      type: 'viewStart',
      position: startPos,
      data: { layoutDir: dir },
      draggable: false,
      selectable: false,
    };

    const endNode: Node = {
      id: SIM_END_ID,
      type: 'viewEnd',
      position: endPos,
      data: { layoutDir: dir },
      draggable: false,
      selectable: false,
    };

    const stepNodes = stepOrder
      .map((stepId, index) => buildSimStepNode(stepId, index, steps, nodePositions, simCurrentStepId, simVisitedStepIds))
      .filter((n): n is Node => n !== null);

    return [startNode, ...stepNodes, endNode];
  }, [steps, stepOrder, nodePositions, simCurrentStepId, simVisitedStepIds]);

  const edges = useMemo<Edge[]>(() => {
    const result: Edge[] = [];

    const entryStepId = stepOrder[0];
    if (entryStepId) {
      result.push(buildStartEdge(entryStepId, simVisitedStepIds, simCurrentStepId));
    }

    for (const outcome of Object.values(outcomes)) {
      const sourceNodeId = `step_${outcome.stepId}`;
      const targetNodeId = outcome.nextStepId ? `step_${outcome.nextStepId}` : SIM_END_ID;

      result.push(buildSimOutcomeEdge(outcome, sourceNodeId, targetNodeId, simTakenOutcomeIds, simCurrentStepId));
    }

    return result;
  }, [outcomes, stepOrder, simTakenOutcomeIds, simCurrentStepId, simVisitedStepIds]);

  // Applies the NodeChanges React Flow emits (dimensions above all) so the
  // canvas fits a measured graph; simulation stays read-only otherwise.
  const { nodes, onNodesChange } = useSyncedNodes(blueprint);

  return { nodes, edges, onNodesChange };
}

function buildSimStepNode(
  stepId: string,
  index: number,
  steps: ReturnType<typeof useWorkflowStore.getState>['steps'],
  nodePositions: ReturnType<typeof useWorkflowStore.getState>['nodePositions'],
  simCurrentStepId: string | null,
  simVisitedStepIds: string[]
): Node | null {
  const step = steps[stepId];
  if (!step) return null;

  const defaultPos = { x: 300, y: index * 160 + 80 };
  const position = nodePositions[`step_${stepId}`] ?? defaultPos;

  const simStatus = resolveSimStatus(stepId, simCurrentStepId, simVisitedStepIds);

  const data: SimStepData = {
    stepId: step.crmId,
    name: step.name,
    sequenceNo: step.sequenceNo,
    assignTo: step.assignTo,
    assigneeName: resolveAssigneeName(step),
    simStatus,
  };

  return {
    id: `step_${stepId}`,
    type: 'simStep',
    position,
    data,
    draggable: false,
    selectable: false,
  };
}

function resolveSimStatus(
  stepId: string,
  simCurrentStepId: string | null,
  simVisitedStepIds: string[]
): SimStepStatus {
  if (stepId === simCurrentStepId) return 'active';
  if (simVisitedStepIds.includes(stepId)) return 'visited';
  return 'unreached';
}

function resolveAssigneeName(
  step: ReturnType<typeof useWorkflowStore.getState>['steps'][string]
): string | null {
  if (!step) return null;
  if (step.assignTo === 'user') return step.assignedUserName;
  if (step.assignTo === 'team') return step.teamName;
  if (step.assignTo === 'roundRobin') return step.roundRobinTeamName;
  return null;
}

function buildStartEdge(
  entryStepId: string,
  simVisitedStepIds: string[],
  simCurrentStepId: string | null
): Edge {
  const isActive = entryStepId === simCurrentStepId;
  const isVisited = simVisitedStepIds.includes(entryStepId);
  const { stroke, strokeWidth } = resolveEdgeStyle(false, isActive, isVisited);

  return {
    id: `sim_start_to_${entryStepId}`,
    source: SIM_START_ID,
    target: `step_${entryStepId}`,
    sourceHandle: 'out',
    targetHandle: 'in',
    type: 'default',
    style: { stroke, strokeWidth },
    markerEnd: { type: 'arrowclosed' as const, color: stroke },
  };
}

function buildSimOutcomeEdge(
  outcome: WorkflowOutcome,
  sourceNodeId: string,
  targetNodeId: string,
  simTakenOutcomeIds: string[],
  simCurrentStepId: string | null
): Edge {
  const isTaken = simTakenOutcomeIds.includes(outcome.crmId);
  const isAvailable = outcome.stepId === simCurrentStepId && !isTaken;
  const { stroke, strokeWidth, opacity } = resolveEdgeStyle(isTaken, isAvailable, false);
  const labelColor = isTaken ? 'var(--success)' : isAvailable ? 'var(--primary)' : 'var(--text-secondary)';

  return {
    id: `outcome_${outcome.crmId}`,
    source: sourceNodeId,
    target: targetNodeId,
    sourceHandle: 'out',
    targetHandle: 'in',
    type: 'outcome',
    animated: isAvailable,
    style: { stroke, strokeWidth, opacity },
    data: { label: outcome.name, isBackEdge: false, labelColor },
    markerEnd: { type: 'arrowclosed' as const, color: stroke },
  };
}

function resolveEdgeStyle(
  isTaken: boolean,
  isAvailable: boolean,
  _isVisited: boolean
): { stroke: string; strokeWidth: number; opacity: number } {
  if (isTaken) return { stroke: 'var(--success)', strokeWidth: 2.5, opacity: 1 };
  if (isAvailable) return { stroke: 'var(--primary)', strokeWidth: 2, opacity: 1 };
  return { stroke: 'var(--text-secondary)', strokeWidth: 1, opacity: 0.28 };
}
