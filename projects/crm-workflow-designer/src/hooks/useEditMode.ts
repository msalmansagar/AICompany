import { emptyWorkflowHooks, STEP_HOOKS, OUTCOME_HOOKS } from '@/services/workflowHooks';
import { clearUndoHistorySoon } from '@/services/undoHistory';
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
import type { WorkflowOutcome, WorkflowRoute, WorkflowStep } from '@/types/WorkflowTypes';
import type { EditStepData } from '@/nodes/EditStepNode';
import type { StepOutcomeRow } from '@/services/WorkflowGraphBuilder';
import { computeStepHeight } from '@/services/WorkflowGraphBuilder';
import { computeEditLayout } from '@/services/EditGraphLayout';
import { buildParallelGroupNodes } from '@/services/parallelGroups';
import { buildEditGateways } from '@/services/editGateways';
import { CORRECTION_PILL_H, CORRECTION_PILL_W } from '@/services/correctionSteps';
import { classifyCorrectionSteps } from '@/services/correctionSteps';
import { collectErrorNodeIds } from '@/services/ValidationService';
import { useSyncedNodes } from '@/hooks/useSyncedNodes';

interface UseEditModeResult {
  nodes: Node[];
  edges: Edge[];
  onConnect: (params: Connection) => void;
  onReconnect: (oldEdge: Edge, connection: Connection) => void;
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
    routes,
    routeOrder,
    nodePositions,
    selectedId,
    process,
    validationResults,
    addStep,
    addOutcome,
    setOutcome,
    selectNode,
    clearSelection,
    updateNodePosition,
    setNodePositions,
  } = useWorkflowStore((s) => ({
    steps: s.steps,
    stepOrder: s.stepOrder,
    outcomes: s.outcomes,
    routes: s.routes,
    routeOrder: s.routeOrder,
    nodePositions: s.nodePositions,
    selectedId: s.selectedId,
    process: s.process,
    validationResults: s.validationResults,
    addStep: s.addStep,
    addOutcome: s.addOutcome,
    setOutcome: s.setOutcome,
    selectNode: s.selectNode,
    clearSelection: s.clearSelection,
    updateNodePosition: s.updateNodePosition,
    setNodePositions: s.setNodePositions,
  }));

  // The one step whose endings still run to the global END; every other
  // terminal decision ends at a local stub beside its own card (CWFD-009 P7).
  // BPMN draws an end event per branch for the same reason — the alternative
  // was fourteen bezier curves converging on a single dot.
  const mainTerminalStepId = useMemo(() => {
    let best: { id: string; sequenceNo: number } | null = null;
    for (const outcome of Object.values(outcomes)) {
      if (outcome.nextStepId) continue;
      const step = steps[outcome.stepId];
      if (!step) continue;
      if (!best || step.sequenceNo > best.sequenceNo) {
        best = { id: outcome.stepId, sequenceNo: step.sequenceNo };
      }
    }
    return best?.id ?? null;
  }, [outcomes, steps]);

  const blueprint = useMemo<Node[]>(() => {
    const errorStepIds = collectErrorNodeIds(validationResults);

    // Pure correction loops draw as pills (CWFD-009 P2) — same classifier the
    // layout uses, so what collapses is exactly what sits beside its target.
    const correctionInfo = classifyCorrectionSteps(
      stepOrder.map((id) => ({ id, sequenceNo: steps[id]?.sequenceNo ?? 0 })),
      Object.values(outcomes).map((o) => ({
        stepId: o.stepId,
        nextStepId: o.nextStepId,
        sequenceNumber: o.sequenceNumber,
        isConditional: o.applyFilter,
      })),
      stepOrder[0] ?? null
    );

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
        isCorrection: correctionInfo.correctionIds.has(stepId),
        returnTargetName: (() => {
          const targetId = correctionInfo.returnTargetOf.get(stepId);
          return targetId ? (steps[targetId]?.name ?? null) : null;
        })(),
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

    // Virtual decision gateways (CWFD-019 PR1): presentation-only diamonds
    // beside their source card, one per conditional decision with routes.
    const gatewayGraph = buildEditGateways({
      stepOrder,
      steps,
      outcomes,
      routes,
      routeOrder,
      positionOf: (id) => {
        const node = stepNodes.find((candidate) => candidate.id === `step_${id}`);
        return node ? node.position : null;
      },
      heightOf: (id) =>
        computeStepHeight((outcomesByStep.get(id) ?? []).length),
      stepWidth: 280,
      selectedId,
    });

    // Local end stubs ride their step as child nodes, so they follow when the
    // card is dragged. A decision that routes through a gateway ends at the
    // gateway's own stub instead.
    const stubNodes: Node[] = [];
    for (const stepId of stepOrder) {
      if (stepId === mainTerminalStepId) continue;
      const stepOutcomes = outcomesByStep.get(stepId) ?? [];
      const terminals = stepOutcomes
        .filter(
          (outcome) =>
            !outcome.nextStepId && !gatewayGraph.outcomeIdsWithGateway.has(outcome.crmId)
        )
        .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
      if (terminals.length === 0) continue;
      const cardHeight = computeStepHeight(stepOutcomes.length);
      terminals.forEach((outcome, index) => {
        stubNodes.push({
          id: `end_stub_${outcome.crmId}`,
          type: 'viewEnd',
          parentId: `step_${stepId}`,
          position: { x: 14 + index * 36, y: cardHeight + 28 },
          data: { layoutDir: 'LR', compact: true },
          draggable: false,
          selectable: false,
        });
      });
    }

    // Parallel group bands wrap the branch children, tracking every drag —
    // the blueprint rebuilds on each position change anyway (CWFD-017 PR4).
    const cardById = new Map(stepNodes.map((node) => [node.id, node]));
    const parallelGroups = buildParallelGroupNodes(
      stepOrder
        .map((id) => steps[id])
        .filter((step): step is WorkflowStep => Boolean(step))
        .map((step) => ({
          id: step.crmId,
          parentStepId: step.parentStepId,
          name: step.name,
        })),
      (id) => {
        const node = cardById.get(`step_${id}`);
        if (!node) return null;
        const nodeData = node.data as EditStepData;
        const isPill = nodeData.isCorrection === true;
        return {
          x: node.position.x,
          y: node.position.y,
          w: isPill ? CORRECTION_PILL_W : 280,
          h: isPill
            ? CORRECTION_PILL_H
            : computeStepHeight((nodeData.outcomeRows ?? []).length),
        };
      }
    );

    return [startNode, ...parallelGroups, ...stepNodes, ...gatewayGraph.nodes, ...stubNodes, endNode];
  }, [steps, stepOrder, nodePositions, selectedId, validationResults, outcomes, routes, routeOrder, mainTerminalStepId]);

  const edges = useMemo<Edge[]>(() => {
    const result: Edge[] = [];

    const entryStepId = stepOrder[0];
    if (entryStepId) {
      result.push(buildStartEdge(entryStepId));
    }

    // A decision drawn as a gateway carries its flow on the gateway's own
    // entry and route edges — the plain outcome edge would say it twice.
    const gatewayedOutcomeIds = new Set(
      Object.values(outcomes)
        .filter((o) => o.applyFilter && (routeOrder[o.crmId] ?? []).length > 0)
        .map((o) => o.crmId)
    );

    for (const outcome of Object.values(outcomes)) {
      if (gatewayedOutcomeIds.has(outcome.crmId)) continue;
      const sourceStep = steps[outcome.stepId];
      const targetStep = outcome.nextStepId ? steps[outcome.nextStepId] : null;
      const isBackEdge = Boolean(
        targetStep && sourceStep && targetStep.sequenceNo < sourceStep.sequenceNo
      );
      const sourceNodeId = `step_${outcome.stepId}`;
      const targetNodeId = outcome.nextStepId
        ? `step_${outcome.nextStepId}`
        : outcome.stepId === mainTerminalStepId
          ? END_NODE_ID
          : `end_stub_${outcome.crmId}`;
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

    // The gateway edges themselves come from the same derivation the
    // blueprint used, so diamond and lines can never disagree.
    const gatewayGraph = buildEditGateways({
      stepOrder,
      steps,
      outcomes,
      routes,
      routeOrder,
      positionOf: () => ({ x: 0, y: 0 }),
      heightOf: () => 0,
      stepWidth: 280,
      selectedId: null,
    });
    result.push(...gatewayGraph.edges);

    return result;
  }, [outcomes, steps, stepOrder, routes, routeOrder, mainTerminalStepId]);

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

      const outcomeId = `tmp_${crypto.randomUUID()}`;
      const targetName = nextStepId ? steps[nextStepId]?.name : null;
      const newOutcome: WorkflowOutcome = {
        crmId: outcomeId,
        // A decision named after its destination beats a canvas full of
        // "Outcome" rows the duplicate-name rule then complains about.
        name: targetName ? `To ${targetName}` : 'Complete',
        sequenceNumber: nextSeqNo,
        applyFilter: false,
        ...emptyOutcomeConcurrency(),
      workflowHooks: emptyWorkflowHooks(OUTCOME_HOOKS),
        stepId: sourceStepId,
        nextStepId,
      };

      addOutcome(newOutcome);
      selectNode(`outcome_${outcomeId}`);
    },
    [outcomes, addOutcome, steps, selectNode]
  );

  // CWFD-016 B4: dragging an edge end onto another card re-points the
  // decision. Only the TARGET may move — a decision belongs to its step, so a
  // source drag snaps back (the edges derive from the store; not writing the
  // change IS the revert).
  const onReconnect = useCallback(
    (oldEdge: Edge, connection: Connection) => {
      if (!oldEdge.id.startsWith('outcome_')) return;
      const outcome = outcomes[oldEdge.id.slice('outcome_'.length)];
      if (!outcome) return;
      if (connection.source !== oldEdge.source) return;
      const target = connection.target ?? '';
      const nextStepId =
        target === END_NODE_ID || target.startsWith('end_stub_')
          ? null
          : target.startsWith('step_')
            ? target.slice('step_'.length)
            : undefined;
      if (nextStepId === undefined) return;
      if (nextStepId === outcome.stepId) return; // a decision cannot loop onto its own step
      if (nextStepId === outcome.nextStepId) return;
      setOutcome({ ...outcome, nextStepId });
    },
    [outcomes, setOutcome]
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
      // A gateway is the drawing of a decision — selecting it selects the
      // outcome, which opens the existing Decision Properties panel.
      if (node.id.startsWith('gw_')) {
        selectNode(`outcome_${node.id.slice('gw_'.length)}`);
        return;
      }
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
    const positions = computeEditLayout(
      stepOrder,
      outcomeList,
      routeLinksOf(routes, outcomes),
      branchLinksOf(steps)
    );
    setNodePositions(positions);
    // A fresh layout with last session's bends applied reads as broken —
    // auto-layout is the reset gesture for edge decorations too.
    useWorkflowStore.getState().clearEdgeDecorations();
  }, [stepOrder, outcomes, routes, steps, setNodePositions]);

  const nodePositionsRef = useRef(nodePositions);
  nodePositionsRef.current = nodePositions;

  const outcomesRef = useRef(outcomes);
  outcomesRef.current = outcomes;

  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  const routesRef = useRef(routes);
  routesRef.current = routes;

  const autoLayoutDone = useRef(false);
  useEffect(() => {
    if (autoLayoutDone.current || stepOrder.length === 0) return;
    autoLayoutDone.current = true;
    const hasAnyPosition = stepOrder.some((id) => !!nodePositionsRef.current[`step_${id}`]);
    if (!hasAnyPosition) {
      const outcomeList = Object.values(outcomesRef.current);
      const positions = computeEditLayout(
        stepOrder,
        outcomeList,
        routeLinksOf(routesRef.current, outcomesRef.current),
        branchLinksOf(stepsRef.current)
      );
      setNodePositions(positions);
    }
    // This first layout is the canvas arranging itself, not an edit — undoing
    // into it would leave the user staring at coordinates they never chose.
    clearUndoHistorySoon();
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
    onReconnect,
    onNodesChange,
    onNodeClick,
    onEdgeClick,
    onPaneClick,
    addStep: handleAddStep,
    reLayout,
  };
}

/**
 * The step-to-step links carried by conditional routes, for the layout.
 * A gateway destination's only incoming link is a route — without these the
 * layout has no idea where those steps belong.
 */
/** The concurrency links, for the layout: parent step → each branch child. */
function branchLinksOf(steps: Record<string, WorkflowStep>): Array<{ parentStepId: string; childStepId: string }> {
  return Object.values(steps)
    .filter((step) => step.parentStepId && steps[step.parentStepId])
    .map((step) => ({ parentStepId: step.parentStepId as string, childStepId: step.crmId }));
}

function routeLinksOf(
  routes: Record<string, WorkflowRoute>,
  outcomes: Record<string, WorkflowOutcome>
): Array<{ stepId: string; nextStepId: string | null; outcomeId: string; isDefault: boolean }> {
  return Object.values(routes)
    .map((route) => ({
      stepId: outcomes[route.outcomeId]?.stepId ?? '',
      nextStepId: route.nextStepId,
      outcomeId: route.outcomeId,
      isDefault: route.isDefault,
    }))
    .filter((link) => link.stepId !== '');
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

  // An ending reads as an ending: red and dashed, like the view's stubs.
  const isEnding = targetNodeId === END_NODE_ID || targetNodeId.startsWith('end_stub_');
  const stroke = isEnding
    ? 'var(--error)'
    : isConditional
      ? 'var(--primary)'
      : 'var(--text-secondary)';
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
    style: {
      stroke,
      strokeWidth,
      ...(isEnding ? { strokeDasharray: '4 4', opacity: 0.75 } : null),
    },
    data: { isBackEdge: false, isConditional, label: outcome.name, labelColor: labelPair.foreground },
    markerEnd: { type: 'arrowclosed' as const, color: stroke },
  };
}

