import dagre from '@dagrejs/dagre';
import { MarkerType } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import type { CrmStep, CrmOutcome } from '../types/ViewTypes';

export type LayoutDir = 'TB' | 'LR';

export const STEP_W = 280;
export const MARKER_SIZE = 48;

const STEP_BASE_H = 90;
const OUTCOME_ROW_H = 22;
const DIVIDER_H = 12;

// Kept for ViewDecisionNode back-compat (not used in graph output).
export interface ViewOutcomeData extends Record<string, unknown> {
  outcome: CrmOutcome;
  hasNoNextStep: boolean;
  isBackEdge: boolean;
}

export interface StepOutcomeRow {
  id: string;
  name: string;
  nextStepId: string | null;
  nextStepName: string | null;
  applyFilter: boolean;
  isBackEdge: boolean;
  isTerminal: boolean;
}

export interface ViewStepData extends Record<string, unknown> {
  step: CrmStep;
  outcomeRows: StepOutcomeRow[];
  nodeHeight: number;
  layoutDir: LayoutDir;
}

export function computeStepHeight(outcomeCount: number): number {
  if (outcomeCount === 0) return STEP_BASE_H;
  return STEP_BASE_H + DIVIDER_H + outcomeCount * OUTCOME_ROW_H + 8;
}

const START_NODE_ID = 'node_start';
const END_NODE_ID = 'node_end';

export function buildGraph(
  steps: CrmStep[],
  outcomes: CrmOutcome[],
  dir: LayoutDir = 'TB'
): { nodes: Node[]; edges: Edge[] } {
  const stepById = new Map(steps.map((s) => [s.id, s]));

  const backEdgeOutcomeIds = new Set<string>();
  for (const o of outcomes) {
    if (!o.nextStepId) continue;
    const parent = stepById.get(o.stepId);
    const next = stepById.get(o.nextStepId);
    if (parent && next && next.sequenceNo <= parent.sequenceNo) {
      backEdgeOutcomeIds.add(o.id);
    }
  }

  const outcomesByStep = new Map<string, CrmOutcome[]>();
  for (const step of steps) outcomesByStep.set(step.id, []);
  for (const o of outcomes) outcomesByStep.get(o.stepId)?.push(o);
  for (const list of outcomesByStep.values()) {
    list.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  }

  // Entry step: not targeted by any forward outcome.
  const forwardTargetStepIds = new Set(
    outcomes
      .filter((o) => o.nextStepId && !backEdgeOutcomeIds.has(o.id))
      .map((o) => o.nextStepId!)
  );
  const entrySteps = steps.filter((s) => !forwardTargetStepIds.has(s.id));
  const firstSteps =
    entrySteps.length > 0
      ? [entrySteps.reduce((min, s) => (s.sequenceNo < min.sequenceNo ? s : min))]
      : [...steps].sort((a, b) => a.sequenceNo - b.sequenceNo).slice(0, 1);

  const stepNodes: Node[] = steps.map((step) => {
    const stepOutcomes = outcomesByStep.get(step.id) ?? [];
    const outcomeRows: StepOutcomeRow[] = stepOutcomes.map((o) => ({
      id: o.id,
      name: o.name,
      nextStepId: o.nextStepId,
      nextStepName: o.nextStepId ? (stepById.get(o.nextStepId)?.name ?? null) : null,
      applyFilter: o.applyFilter,
      isBackEdge: backEdgeOutcomeIds.has(o.id),
      isTerminal: !o.nextStepId,
    }));

    return {
      id: `step_${step.id}`,
      type: 'viewStep',
      position: { x: 0, y: 0 },
      data: {
        step,
        outcomeRows,
        nodeHeight: computeStepHeight(stepOutcomes.length),
        layoutDir: dir,
      } as ViewStepData,
      draggable: true,
      selectable: true,
    };
  });

  const startNode: Node = {
    id: START_NODE_ID, type: 'viewStart', position: { x: 0, y: 0 },
    data: { layoutDir: dir }, draggable: false, selectable: false,
  };
  const endNode: Node = {
    id: END_NODE_ID, type: 'viewEnd', position: { x: 0, y: 0 },
    data: { layoutDir: dir }, draggable: false, selectable: false,
  };

  const nodes: Node[] = [startNode, ...stepNodes, endNode];

  const startEdges: Edge[] = firstSteps.map((s) => ({
    id: `e_start_${s.id}`,
    source: START_NODE_ID,
    target: `step_${s.id}`,
    sourceHandle: 'out',
    targetHandle: 'in',
    type: 'smoothstep',
    style: { stroke: '#16a34a', strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#16a34a' },
    selectable: false,
  }));

  // One forward edge per unique (source step, target step) pair.
  const forwardEdges: Edge[] = [];
  const seenForwardPairs = new Set<string>();
  for (const o of outcomes) {
    if (!o.nextStepId || backEdgeOutcomeIds.has(o.id)) continue;
    const key = `${o.stepId}→${o.nextStepId}`;
    if (seenForwardPairs.has(key)) continue;
    seenForwardPairs.add(key);
    forwardEdges.push({
      id: `e_fwd_${o.stepId}_${o.nextStepId}`,
      source: `step_${o.stepId}`,
      target: `step_${o.nextStepId}`,
      sourceHandle: 'out',
      targetHandle: 'in',
      type: 'smoothstep',
      style: { stroke: '#64748b', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
      selectable: false,
    });
  }

  // Terminal edges: only the last step (highest sequenceNo with terminal outcomes)
  // gets a visible red edge to END. Others are invisible (Dagre ranking only).
  const terminalStepIds = new Set(outcomes.filter((o) => !o.nextStepId).map((o) => o.stepId));
  const lastTerminalStep = [...terminalStepIds]
    .map((id) => stepById.get(id))
    .filter((s): s is CrmStep => s !== undefined)
    .sort((a, b) => b.sequenceNo - a.sequenceNo)[0];
  const lastTerminalStepId = lastTerminalStep?.id ?? null;

  const endEdges: Edge[] = [...terminalStepIds].map((stepId) => {
    const isLast = stepId === lastTerminalStepId;
    return {
      id: `e_end_${stepId}`,
      source: `step_${stepId}`,
      target: END_NODE_ID,
      sourceHandle: 'out',
      targetHandle: 'in',
      type: 'smoothstep',
      style: isLast
        ? { stroke: '#dc2626', strokeWidth: 2 }
        : { stroke: 'transparent', strokeWidth: 0 },
      markerEnd: isLast ? { type: MarkerType.ArrowClosed, color: '#dc2626' } : undefined,
      selectable: false,
    };
  });

  // Back-edges: route left-side in TB (U-curve to the left), bottom in LR.
  // Handle positions are rendered in ViewStepNode based on layoutDir.
  const backEdges: Edge[] = outcomes
    .filter((o) => backEdgeOutcomeIds.has(o.id))
    .map((o) => ({
      id: `e_back_${o.id}`,
      source: `step_${o.stepId}`,
      target: `step_${o.nextStepId!}`,
      sourceHandle: 'back-out',
      targetHandle: 'back-in',
      type: 'smoothstep',
      label: `↩ ${truncate(o.name, 18)}`,
      labelStyle: { fontSize: 10, fill: '#7c3aed', fontWeight: 600 },
      labelBgStyle: { fill: '#f5f3ff', fillOpacity: 1, rx: 4 },
      labelBgPadding: [8, 4] as [number, number],
      style: { stroke: '#7c3aed', strokeWidth: 1.5, strokeDasharray: '6 3' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#7c3aed' },
      selectable: true,
    }));

  const layoutEdges = [...startEdges, ...forwardEdges, ...endEdges];
  const positionedNodes = applyDagreLayout(nodes, layoutEdges, dir);

  return { nodes: positionedNodes, edges: [...layoutEdges, ...backEdges] };
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export function applyDagreLayout(nodes: Node[], edges: Edge[], dir: LayoutDir = 'TB'): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: dir, nodesep: 100, ranksep: 60, marginx: 80, marginy: 60 });

  for (const node of nodes) {
    const w = node.type === 'viewStep' ? STEP_W : MARKER_SIZE;
    const h =
      node.type === 'viewStep'
        ? (node.data as ViewStepData).nodeHeight
        : MARKER_SIZE;
    g.setNode(node.id, { width: w, height: h });
  }

  for (const edge of edges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }

  dagre.layout(g);

  const positioned = nodes.map((node) => {
    const w = node.type === 'viewStep' ? STEP_W : MARKER_SIZE;
    const h =
      node.type === 'viewStep'
        ? (node.data as ViewStepData).nodeHeight
        : MARKER_SIZE;
    const pos = g.node(node.id);
    if (!pos) return node;
    return { ...node, position: { x: pos.x - w / 2, y: pos.y - h / 2 } };
  });

  const stepNodes = positioned.filter((n) => n.type === 'viewStep');
  if (stepNodes.length === 0) return positioned;

  if (dir === 'TB') {
    // Align all nodes to same center X to prevent staircase drift.
    const centerX =
      stepNodes.reduce((sum, n) => sum + n.position.x + STEP_W / 2, 0) / stepNodes.length;
    return positioned.map((node) => {
      if (node.type === 'viewStep')
        return { ...node, position: { ...node.position, x: centerX - STEP_W / 2 } };
      if (node.type === 'viewStart' || node.type === 'viewEnd')
        return { ...node, position: { ...node.position, x: centerX - MARKER_SIZE / 2 } };
      return node;
    });
  } else {
    // LR: align all nodes to same center Y.
    const centerY =
      stepNodes.reduce((sum, n) => sum + n.position.y + (n.data as ViewStepData).nodeHeight / 2, 0) /
      stepNodes.length;
    return positioned.map((node) => {
      if (node.type === 'viewStep') {
        const h = (node.data as ViewStepData).nodeHeight;
        return { ...node, position: { ...node.position, y: centerY - h / 2 } };
      }
      if (node.type === 'viewStart' || node.type === 'viewEnd')
        return { ...node, position: { ...node.position, y: centerY - MARKER_SIZE / 2 } };
      return node;
    });
  }
}
