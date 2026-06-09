import { useCallback, useMemo } from 'react';
import type { MouseEvent } from 'react';
import type { Node, Edge, Connection, NodeChange } from '@xyflow/react';
import { useWorkflowStore } from '@/store/workflowStore';
import type { ICrmAdapter } from '@/services/ICrmAdapter';
import type { WorkflowOutcome, WorkflowStep } from '@/types/WorkflowTypes';
import type { EditStepData } from '@/nodes/EditStepNode';

interface UseEditModeResult {
  nodes: Node[];
  edges: Edge[];
  onConnect: (params: Connection) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onNodeClick: (event: MouseEvent, node: Node) => void;
  onEdgeClick: (event: MouseEvent, edge: Edge) => void;
  onPaneClick: () => void;
  addStep: () => void;
}

const START_NODE_ID = 'edit_start';
const END_NODE_ID = 'edit_end';

export function useEditMode(_adapter: ICrmAdapter): UseEditModeResult {
  const {
    steps,
    stepOrder,
    outcomes,
    nodePositions,
    selectedId,
    process,
    addStep,
    addOutcome,
    selectNode,
    clearSelection,
    updateNodePosition,
  } = useWorkflowStore((s) => ({
    steps: s.steps,
    stepOrder: s.stepOrder,
    outcomes: s.outcomes,
    nodePositions: s.nodePositions,
    selectedId: s.selectedId,
    process: s.process,
    addStep: s.addStep,
    addOutcome: s.addOutcome,
    selectNode: s.selectNode,
    clearSelection: s.clearSelection,
    updateNodePosition: s.updateNodePosition,
  }));

  const nodes = useMemo<Node[]>(() => {
    const stepCount = stepOrder.length;

    const startPosition = nodePositions[START_NODE_ID] ?? { x: 300, y: -80 };
    const endPosition = nodePositions[END_NODE_ID] ?? { x: 300, y: stepCount * 160 + 80 };

    const startNode: Node = {
      id: START_NODE_ID,
      type: 'viewStart',
      position: startPosition,
      data: { layoutDir: 'TB' },
      draggable: false,
      selectable: false,
    };

    const endNode: Node = {
      id: END_NODE_ID,
      type: 'viewEnd',
      position: endPosition,
      data: { layoutDir: 'TB' },
      draggable: false,
      selectable: false,
    };

    const stepNodes: Node[] = stepOrder.map((stepId, index) => {
      const step = steps[stepId];
      if (!step) return null as unknown as Node;

      const defaultPosition = { x: 300, y: index * 160 + 80 };
      const position = nodePositions[`step_${stepId}`] ?? defaultPosition;

      const data: EditStepData = {
        stepId: step.crmId,
        name: step.name,
        sequenceNo: step.sequenceNo,
        assignTo: step.assignTo,
        assigneeName: resolveAssigneeName(step),
        isSelected: selectedId === `step_${stepId}`,
      };

      return {
        id: `step_${stepId}`,
        type: 'editStep',
        position,
        data,
        draggable: true,
        selectable: true,
      };
    }).filter(Boolean);

    return [startNode, ...stepNodes, endNode];
  }, [steps, stepOrder, nodePositions, selectedId]);

  const edges = useMemo<Edge[]>(() => {
    const result: Edge[] = [];

    // Find the entry step — the step with no incoming outcomes
    const stepsWithIncoming = new Set<string>(
      Object.values(outcomes)
        .map((o) => o.nextStepId)
        .filter((id): id is string => id !== null)
    );
    const entryStepId = stepOrder.find((id) => !stepsWithIncoming.has(id));

    if (entryStepId) {
      result.push(buildStartEdge(entryStepId));
    }

    for (const outcome of Object.values(outcomes)) {
      const sourceNodeId = `step_${outcome.stepId}`;
      const targetNodeId = outcome.nextStepId
        ? `step_${outcome.nextStepId}`
        : END_NODE_ID;

      result.push(buildOutcomeEdge(outcome, sourceNodeId, targetNodeId));
    }

    return result;
  }, [outcomes, stepOrder]);

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;

      const sourceStepId = params.source.replace('step_', '');
      const isTargetEnd = params.target === END_NODE_ID;
      const nextStepId = isTargetEnd ? null : params.target.replace('step_', '');

      const nextSeqNo =
        Object.values(outcomes).reduce(
          (max, o) => (o.sequenceNumber > max ? o.sequenceNumber : max),
          0
        ) + 1;

      const newOutcome: WorkflowOutcome = {
        crmId: `tmp_${crypto.randomUUID()}`,
        name: 'Outcome',
        sequenceNumber: nextSeqNo,
        applyFilter: false,
        stepId: sourceStepId,
        nextStepId,
      };

      addOutcome(newOutcome);
    },
    [outcomes, addOutcome]
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const change of changes) {
        if (
          change.type === 'position' &&
          'position' in change &&
          change.position != null &&
          change.id.startsWith('step_')
        ) {
          updateNodePosition(change.id, change.position);
        }
      }
    },
    [updateNodePosition]
  );

  const onNodeClick = useCallback(
    (_event: MouseEvent, node: Node) => {
      if (node.id === START_NODE_ID || node.id === END_NODE_ID) return;
      selectNode(node.id);
    },
    [selectNode]
  );

  const onEdgeClick = useCallback(
    (_event: MouseEvent, edge: Edge) => {
      selectNode(edge.id);
    },
    [selectNode]
  );

  const onPaneClick = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  const handleAddStep = useCallback(() => {
    if (!process) return;

    const nextSeqNo = stepOrder.length + 1;
    const newStep: WorkflowStep = {
      crmId: `tmp_${crypto.randomUUID()}`,
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
      processId: process.crmId,
    };

    addStep(newStep);
    selectNode(`step_${newStep.crmId}`);
  }, [process, stepOrder.length, addStep, selectNode]);

  return {
    nodes,
    edges,
    onConnect,
    onNodesChange,
    onNodeClick,
    onEdgeClick,
    onPaneClick,
    addStep: handleAddStep,
  };
}

function resolveAssigneeName(step: WorkflowStep): string | null {
  if (step.assignTo === 'user') return step.assignedUserName;
  if (step.assignTo === 'team') return step.teamName;
  if (step.assignTo === 'roundRobin') return step.roundRobinTeamName;
  return null;
}

function buildStartEdge(entryStepId: string): Edge {
  return {
    id: `start_to_step_${entryStepId}`,
    source: START_NODE_ID,
    target: `step_${entryStepId}`,
    sourceHandle: 'out',
    targetHandle: 'in',
    type: 'smoothstep',
    style: { stroke: '#64748b' },
    markerEnd: { type: 'arrowclosed' as const, color: '#64748b' },
  };
}

function buildOutcomeEdge(outcome: WorkflowOutcome, sourceNodeId: string, targetNodeId: string): Edge {
  return {
    id: `outcome_${outcome.crmId}`,
    source: sourceNodeId,
    target: targetNodeId,
    sourceHandle: 'out',
    targetHandle: 'in',
    type: 'smoothstep',
    style: { stroke: '#64748b' },
    label: outcome.name,
    labelStyle: { fontSize: 10, fill: '#94a3b8' },
    labelBgStyle: { fill: '#0f172a', fillOpacity: 0.8 },
    markerEnd: { type: 'arrowclosed' as const, color: '#64748b' },
  };
}

