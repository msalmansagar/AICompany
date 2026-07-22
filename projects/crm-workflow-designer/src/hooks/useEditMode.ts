import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { MouseEvent } from 'react';
import type { Node, Edge, Connection, NodeChange } from '@xyflow/react';
import { useWorkflowStore } from '@/store/workflowStore';
import type { ICrmAdapter } from '@/services/ICrmAdapter';
import { emptySlaFields, slaSummaryText } from '@/services/slaStepFields';
import type { WorkflowOutcome, WorkflowStep } from '@/types/WorkflowTypes';
import type { EditStepData } from '@/nodes/EditStepNode';
import { computeEditLayout } from '@/services/EditGraphLayout';

interface UseEditModeResult {
  nodes: Node[];
  edges: Edge[];
  onConnect: (params: Connection) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onNodeClick: (event: MouseEvent, node: Node) => void;
  onEdgeClick: (event: MouseEvent, edge: Edge) => void;
  onPaneClick: () => void;
  addStep: () => void;
  reLayout: () => void;
}

const START_NODE_ID = 'edit_start';
const END_NODE_ID = 'edit_end';

export function useEditMode(_adapter: ICrmAdapter): UseEditModeResult {
  const {
    steps,
    stepOrder,
    outcomes,
    routeOrder,
    nodePositions,
    selectedId,
    process,
    validationResults,
    addStep,
    addOutcome,
    selectNode,
    clearSelection,
    updateNodePosition,
    setNodePositions,
  } = useWorkflowStore((s) => ({
    steps: s.steps,
    stepOrder: s.stepOrder,
    outcomes: s.outcomes,
    routeOrder: s.routeOrder,
    nodePositions: s.nodePositions,
    selectedId: s.selectedId,
    process: s.process,
    validationResults: s.validationResults,
    addStep: s.addStep,
    addOutcome: s.addOutcome,
    selectNode: s.selectNode,
    clearSelection: s.clearSelection,
    updateNodePosition: s.updateNodePosition,
    setNodePositions: s.setNodePositions,
  }));

  const nodes = useMemo<Node[]>(() => {
    const errorStepIds = new Set<string>();
    for (const v of validationResults) {
      if (v.nodeId && (!v.nodeType || v.nodeType === 'step')) {
        errorStepIds.add(v.nodeId);
      }
      for (const id of (v.affectedNodeIds ?? [])) errorStepIds.add(id);
    }

    const stepCount = stepOrder.length;

    const startPosition = nodePositions[START_NODE_ID] ?? { x: -80, y: 0 };
    const endPosition = nodePositions[END_NODE_ID] ?? { x: stepCount * 340 + 80, y: 0 };

    const startNode: Node = {
      id: START_NODE_ID,
      type: 'viewStart',
      position: startPosition,
      data: { layoutDir: 'LR' },
      draggable: false,
      selectable: false,
    };

    const endNode: Node = {
      id: END_NODE_ID,
      type: 'viewEnd',
      position: endPosition,
      data: { layoutDir: 'LR' },
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
        hasError: errorStepIds.has(step.crmId),
        slaSummary: slaSummaryText(step),
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
  }, [steps, stepOrder, nodePositions, selectedId, validationResults]);

  const edges = useMemo<Edge[]>(() => {
    const result: Edge[] = [];

    const entryStepId = stepOrder[0];
    if (entryStepId) {
      result.push(buildStartEdge(entryStepId));
    }

    for (const outcome of Object.values(outcomes)) {
      const sourceStep = steps[outcome.stepId];
      const targetStep = outcome.nextStepId ? steps[outcome.nextStepId] : null;
      const isBackEdge = Boolean(
        targetStep && sourceStep && targetStep.sequenceNo < sourceStep.sequenceNo
      );
      const sourceNodeId = `step_${outcome.stepId}`;
      const targetNodeId = outcome.nextStepId ? `step_${outcome.nextStepId}` : END_NODE_ID;
      const routeCount = outcome.applyFilter
        ? (routeOrder[outcome.crmId] ?? []).length
        : 0;

      result.push(buildOutcomeEdge(outcome, sourceNodeId, targetNodeId, isBackEdge, routeCount));
    }

    return result;
  }, [outcomes, steps, stepOrder, routeOrder]);

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
        if (change.type === 'position' && 'position' in change && change.position != null) {
          if (change.id.startsWith('step_') || change.id.startsWith('gateway_')) {
            updateNodePosition(change.id, change.position);
          }
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

  const reLayout = useCallback(() => {
    const outcomeList = Object.values(outcomes);
    const positions = computeEditLayout(stepOrder, outcomeList);
    setNodePositions(positions);
  }, [stepOrder, outcomes, setNodePositions]);

  const nodePositionsRef = useRef(nodePositions);
  nodePositionsRef.current = nodePositions;

  const outcomesRef = useRef(outcomes);
  outcomesRef.current = outcomes;

  const autoLayoutDone = useRef(false);
  useEffect(() => {
    if (autoLayoutDone.current || stepOrder.length === 0) return;
    autoLayoutDone.current = true;
    const hasAnyPosition = stepOrder.some((id) => !!nodePositionsRef.current[`step_${id}`]);
    if (!hasAnyPosition) {
      const outcomeList = Object.values(outcomesRef.current);
      const positions = computeEditLayout(stepOrder, outcomeList);
      setNodePositions(positions);
    }
  }, [stepOrder, setNodePositions]);

  const handleAddStep = useCallback(() => {
    if (!process) return;

    const newStep = buildNewStep(process.crmId, stepOrder.length + 1);
    // Wire the new step into the flow from the selected step, else the last step.
    const sourceStepId = resolveConnectSourceStepId(selectedId, stepOrder);
    addStep(newStep);

    if (sourceStepId) {
      const nextSeqNo = Object.values(outcomes).reduce((max, o) => Math.max(max, o.sequenceNumber), 0) + 1;
      addOutcome({
        crmId: `tmp_${crypto.randomUUID()}`,
        name: 'Next',
        sequenceNumber: nextSeqNo,
        applyFilter: false,
        stepId: sourceStepId,
        nextStepId: newStep.crmId,
      });
    }

    selectNode(`step_${newStep.crmId}`);
  }, [process, stepOrder, outcomes, selectedId, addStep, addOutcome, selectNode]);

  return {
    nodes,
    edges,
    onConnect,
    onNodesChange,
    onNodeClick,
    onEdgeClick,
    onPaneClick,
    addStep: handleAddStep,
    reLayout,
  };
}

function resolveAssigneeName(step: WorkflowStep): string | null {
  if (step.assignTo === 'user') return step.assignedUserName;
  if (step.assignTo === 'team') return step.teamName;
  if (step.assignTo === 'roundRobin') return step.roundRobinTeamName;
  return null;
}

/** Step to connect a newly-added step from: the selected step, else the last step. */
function resolveConnectSourceStepId(selectedId: string | null, stepOrder: string[]): string | null {
  if (selectedId?.startsWith('step_')) {
    const id = selectedId.slice('step_'.length);
    if (stepOrder.includes(id)) return id;
  }
  return stepOrder.length > 0 ? stepOrder[stepOrder.length - 1] : null;
}

function buildNewStep(processId: string, sequenceNo: number): WorkflowStep {
  return {
    ...emptySlaFields(),
    crmId: `tmp_${crypto.randomUUID()}`,
    name: 'New Step',
    sequenceNo,
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
    processId,
  };
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

function buildOutcomeEdge(
  outcome: WorkflowOutcome,
  sourceNodeId: string,
  targetNodeId: string,
  isBackEdge: boolean,
  _routeCount = 0
): Edge {
  const isConditional = outcome.applyFilter;

  if (isBackEdge) {
    return {
      id: `outcome_${outcome.crmId}`,
      source: sourceNodeId,
      target: targetNodeId,
      sourceHandle: 'out',
      targetHandle: 'in',
      type: 'editBack',
      animated: false,
      style: { stroke: '#d97706', strokeWidth: 1, strokeDasharray: '5 4', opacity: 0.45 },
      data: { isBackEdge: true, isConditional },
      markerEnd: { type: 'arrowclosed' as const, color: '#d97706' },
    };
  }

  const stroke = isConditional ? '#3b82f6' : '#64748b';
  const strokeWidth = isConditional ? 1.5 : 1;

  return {
    id: `outcome_${outcome.crmId}`,
    source: sourceNodeId,
    target: targetNodeId,
    sourceHandle: 'out',
    targetHandle: 'in',
    type: 'outcome',
    animated: false,
    style: { stroke, strokeWidth },
    data: { isBackEdge: false, isConditional },
    markerEnd: { type: 'arrowclosed' as const, color: stroke },
  };
}

