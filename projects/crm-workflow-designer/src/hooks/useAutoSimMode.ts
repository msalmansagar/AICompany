import { useCallback, useMemo } from 'react';
import type { Node, Edge, NodeChange } from '@xyflow/react';
import { useWorkflowStore } from '@/store/workflowStore';
import type { SimStepData } from '@/nodes/SimStepNode';

const AUTO_SIM_START_ID = 'auto_sim_start';
const AUTO_SIM_END_ID = 'auto_sim_end';

export interface UseAutoSimModeResult {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: (changes: NodeChange[]) => void;
}

export function useAutoSimMode(): UseAutoSimModeResult {
  const {
    steps,
    stepOrder,
    outcomes,
    outcomeOrder,
    nodePositions,
    autoSimCurrentStepId,
    autoSimVisitedStepIds,
    autoSimTakenOutcomeIds,
  } = useWorkflowStore((s) => ({
    steps: s.steps,
    stepOrder: s.stepOrder,
    outcomes: s.outcomes,
    outcomeOrder: s.outcomeOrder,
    nodePositions: s.nodePositions,
    autoSimCurrentStepId: s.autoSimCurrentStepId,
    autoSimVisitedStepIds: s.autoSimVisitedStepIds,
    autoSimTakenOutcomeIds: s.autoSimTakenOutcomeIds,
  }));

  const nodes = useMemo<Node[]>(() => {
    if (stepOrder.length === 0) return [];

    const firstStepPos = nodePositions[`step_${stepOrder[0]}`] ?? { x: 300, y: 80 };
    const lastIndex = stepOrder.length - 1;
    const lastStepPos = nodePositions[`step_${stepOrder[lastIndex]}`] ?? { x: 300, y: lastIndex * 160 + 80 };

    const startNode: Node = {
      id: AUTO_SIM_START_ID,
      type: 'viewStart',
      position: { x: firstStepPos.x, y: firstStepPos.y - 100 },
      data: { layoutDir: 'TB' },
      draggable: false,
      selectable: false,
    };

    const endNode: Node = {
      id: AUTO_SIM_END_ID,
      type: 'viewEnd',
      position: { x: lastStepPos.x, y: lastStepPos.y + 120 },
      data: { layoutDir: 'TB' },
      draggable: false,
      selectable: false,
    };

    const stepNodes = stepOrder
      .map((stepId, index) => {
        const step = steps[stepId];
        if (!step) return null;
        const position = nodePositions[`step_${stepId}`] ?? { x: 300, y: index * 160 + 80 };

        let simStatus: SimStepData['simStatus'];
        if (stepId === autoSimCurrentStepId) simStatus = 'active';
        else if (autoSimVisitedStepIds.includes(stepId)) simStatus = 'visited';
        else simStatus = 'unreached';

        const data: SimStepData = {
          stepId: step.crmId,
          name: step.name,
          sequenceNo: step.sequenceNo,
          assignTo: step.assignTo,
          assigneeName: resolveAssigneeName(step),
          simStatus,
          monochrome: true,
        };

        return {
          id: `step_${stepId}`,
          type: 'simStep',
          position,
          data,
          draggable: false,
          selectable: false,
        } as Node;
      })
      .filter((n): n is Node => n !== null);

    return [startNode, ...stepNodes, endNode];
  }, [stepOrder, steps, nodePositions, autoSimCurrentStepId, autoSimVisitedStepIds]);

  const edges = useMemo<Edge[]>(() => {
    const result: Edge[] = [];
    const entryStepId = stepOrder[0];

    // Start → first step edge
    if (entryStepId) {
      const isFirstActive = entryStepId === autoSimCurrentStepId;
      const isFirstVisited = autoSimVisitedStepIds.includes(entryStepId);
      const stroke = isFirstActive ? 'var(--primary)' : isFirstVisited ? 'var(--text-disabled)' : 'var(--text)';
      result.push({
        id: `auto_start_to_${entryStepId}`,
        source: AUTO_SIM_START_ID,
        target: `step_${entryStepId}`,
        sourceHandle: 'out',
        targetHandle: 'in',
        type: 'smoothstep',
        animated: isFirstActive,
        style: { stroke, strokeWidth: isFirstActive ? 2 : 1.5 },
        markerEnd: { type: 'arrowclosed' as const, color: stroke },
      });
    }

    // Outcome edges between steps
    for (const stepId of stepOrder) {
      const step = steps[stepId];
      if (!step) continue;
      for (const outcomeId of (outcomeOrder[stepId] ?? [])) {
        const outcome = outcomes[outcomeId];
        if (!outcome) continue;

        const isTaken = autoSimTakenOutcomeIds.includes(outcomeId);
        const isBackEdge = outcome.nextStepId
          ? (steps[outcome.nextStepId]?.sequenceNo ?? 0) < step.sequenceNo
          : false;

        const targetNodeId = outcome.nextStepId ? `step_${outcome.nextStepId}` : AUTO_SIM_END_ID;
        const stroke = isTaken ? 'var(--text-disabled)' : 'var(--text)';
        const opacity = isTaken ? 1 : 0.5;

        result.push({
          id: `outcome_${outcomeId}`,
          source: `step_${stepId}`,
          target: targetNodeId,
          sourceHandle: 'out',
          targetHandle: 'in',
          type: 'outcome',
          style: { stroke, opacity, strokeDasharray: isBackEdge ? '5 4' : undefined },
          data: { label: isTaken ? outcome.name : '', isBackEdge },
          markerEnd: { type: 'arrowclosed' as const, color: stroke },
        });
      }
    }

    return result;
  }, [stepOrder, steps, outcomes, outcomeOrder, autoSimTakenOutcomeIds, autoSimCurrentStepId, autoSimVisitedStepIds]);

  const onNodesChange = useCallback((_changes: NodeChange[]) => {
    // read-only in auto sim
  }, []);

  return { nodes, edges, onNodesChange };
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
