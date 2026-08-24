import { emptyWorkflowHooks, STEP_HOOKS, OUTCOME_HOOKS } from '@/services/workflowHooks';
import { BRANCH_EDGE_LABEL, routeLabelPair } from '@/styles/surfacePairs';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { MouseEvent } from 'react';
import type { Node, Edge, Connection, NodeChange } from '@xyflow/react';
import { useWorkflowStore } from '@/store/workflowStore';
import type { ICrmAdapter } from '@/services/ICrmAdapter';
import { emptyEscalationFields, escalationSummaryText } from '@/services/escalationFields';
import { emptyAssignmentFields } from '@/services/taskAssignment';
import {
  emptyBranchFields,
  branchSummaryText,
  fanOutSummaryText,
  branchChildrenOf,
  emptyOutcomeConcurrency,
} from '@/services/branchFields';
import type { WorkflowOutcome, WorkflowStep } from '@/types/WorkflowTypes';
import type { EditStepData } from '@/nodes/EditStepNode';
import type { StepOutcomeRow } from '@/services/WorkflowGraphBuilder';
import { computeEditLayout } from '@/services/EditGraphLayout';
import { collectErrorNodeIds } from '@/services/ValidationService';
import { useSyncedNodes } from '@/hooks/useSyncedNodes';

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

  const blueprint = useMemo<Node[]>(() => {
    const errorStepIds = collectErrorNodeIds(validationResults);

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

    const outcomesByStep = new Map<string, WorkflowOutcome[]>();
    for (const outcome of Object.values(outcomes)) {
      const forStep = outcomesByStep.get(outcome.stepId) ?? [];
      forStep.push(outcome);
      outcomesByStep.set(outcome.stepId, forStep);
    }

    const stepNodes: Node[] = stepOrder.map((stepId, index) => {
      const step = steps[stepId];
      if (!step) return null as unknown as Node;

      const outcomeRows: StepOutcomeRow[] = (outcomesByStep.get(stepId) ?? [])
        .slice()
        .sort((a, b) => a.sequenceNumber - b.sequenceNumber)
        .map((outcome) => {
          const target = outcome.nextStepId ? steps[outcome.nextStepId] : null;
          return {
            id: outcome.crmId,
            name: outcome.name,
            nextStepId: outcome.nextStepId,
            nextStepName: target?.name ?? null,
            applyFilter: outcome.applyFilter,
            isBackEdge: Boolean(target && target.sequenceNo < step.sequenceNo),
            isTerminal: !outcome.nextStepId,
          };
        });

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
        slaSummary: escalationSummaryText(step),
        outcomeRows,
        controlFlowSummary:
          branchSummaryText(step) ?? fanOutSummaryText(branchChildrenOf(step.crmId, steps).length),
        controlFlowDescription: describeConcurrency(step, branchChildrenOf(step.crmId, steps).length),
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
  }, [steps, stepOrder, nodePositions, selectedId, validationResults, outcomes]);

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

    // A branch has no outcome pointing at it — the engine creates its task from the
    // parent's. Without a synthesised edge the branch would float unconnected.
    for (const step of Object.values(steps)) {
      if (!step.parentStepId || !steps[step.parentStepId]) continue;
      result.push(buildBranchEdge(step.parentStepId, step.crmId, step.applyBranchFilter));
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
        ...emptyOutcomeConcurrency(),
      workflowHooks: emptyWorkflowHooks(OUTCOME_HOOKS),
        stepId: sourceStepId,
        nextStepId,
      };

      addOutcome(newOutcome);
    },
    [outcomes, addOutcome]
  );

  const persistNodePositions = useCallback(
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

  // React Flow reports measured sizes through onNodesChange; the synced state
  // keeps them across blueprint rebuilds so the minimap sees a measured graph.
  const { nodes, onNodesChange } = useSyncedNodes(blueprint, persistNodePositions);

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
    // A fresh layout with last session's bends applied reads as broken —
    // auto-layout is the reset gesture for edge decorations too.
    useWorkflowStore.getState().clearEdgeDecorations();
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
        ...emptyOutcomeConcurrency(),
      workflowHooks: emptyWorkflowHooks(OUTCOME_HOOKS),
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
    ...emptyEscalationFields(),
    ...emptyBranchFields(),
    ...emptyAssignmentFields(),
    workflowHooks: emptyWorkflowHooks(STEP_HOOKS),
    crmId: `tmp_${crypto.randomUUID()}`,
    name: 'New Step',
    sequenceNo,
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
    type: 'default',
    style: { stroke: 'var(--text-secondary)' },
    markerEnd: { type: 'arrowclosed' as const, color: 'var(--text-secondary)' },
  };
}

const BRANCH_STROKE = 'var(--accent-branch)';

/**
 * The link from a step to one that runs alongside it. Dashed, because nothing
 * "transitions" here — the engine creates both tasks at once. The label, not the
 * colour, carries the meaning, so the notation survives greyscale export.
 */
function buildBranchEdge(parentStepId: string, childStepId: string, isConditional: boolean): Edge {
  return {
    id: `branch_${parentStepId}_${childStepId}`,
    source: `step_${parentStepId}`,
    target: `step_${childStepId}`,
    sourceHandle: 'out',
    targetHandle: 'in',
    type: 'default',
    animated: false,
    label: isConditional ? 'AT SAME TIME · IF' : 'AT SAME TIME',
    labelStyle: { fill: BRANCH_EDGE_LABEL.foreground, fontSize: 10, fontWeight: 700 },
    labelBgStyle: { fill: BRANCH_EDGE_LABEL.background },
    style: { stroke: BRANCH_STROKE, strokeWidth: 2, strokeDasharray: '6 4' },
    markerEnd: { type: 'arrowclosed' as const, color: BRANCH_STROKE },
    selectable: false,
  };
}

/** Spells the concurrency badge out for the node tooltip. */
function describeConcurrency(step: WorkflowStep, childCount: number): string | null {
  if (step.parentStepId) {
    const conditional = step.applyBranchFilter ? ', when its condition is met' : '';
    return `Runs at the same time as "${step.parentStepName ?? 'another step'}"${conditional}`;
  }
  if (childCount > 0) {
    return `${childCount} step${childCount === 1 ? '' : 's'} run at the same time as this one`;
  }
  return null;
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
    const backPair = routeLabelPair('conditional');
    return {
      id: `outcome_${outcome.crmId}`,
      source: sourceNodeId,
      target: targetNodeId,
      sourceHandle: 'out',
      targetHandle: 'in',
      type: 'editBack',
      animated: false,
      // 0.45 opacity at 1px made return paths effectively invisible — the
      // dash carries the 'backwards' meaning, the colour needs to be seen.
      style: { stroke: 'var(--warning)', strokeWidth: 1.5, strokeDasharray: '5 4', opacity: 0.85 },
      // custom edge components ignore the built-in label prop — labels travel in data
      data: { isBackEdge: true, isConditional, label: outcome.name, labelColor: backPair.foreground },
      markerEnd: { type: 'arrowclosed' as const, color: 'var(--warning)' },
    };
  }

  const stroke = isConditional ? 'var(--primary)' : 'var(--text-secondary)';
  const strokeWidth = isConditional ? 1.5 : 1;
  const labelPair = routeLabelPair(isConditional ? 'conditional' : 'plain');

  return {
    id: `outcome_${outcome.crmId}`,
    source: sourceNodeId,
    target: targetNodeId,
    sourceHandle: 'out',
    targetHandle: 'in',
    type: 'outcome',
    animated: false,
    style: { stroke, strokeWidth },
    data: { isBackEdge: false, isConditional, label: outcome.name, labelColor: labelPair.foreground },
    markerEnd: { type: 'arrowclosed' as const, color: stroke },
  };
}

