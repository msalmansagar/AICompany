import dagre from '@dagrejs/dagre';
import { MarkerType } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import type { CrmStep, CrmOutcome } from '../types/ViewTypes';
import type { LayoutDir } from './WorkflowGraphBuilder';
import { MARKER_SIZE } from './WorkflowGraphBuilder';

export const EXEC_STEP_W = 300;
export const EXEC_STEP_H = 78;

export interface ExecStepData extends Record<string, unknown> {
  step: CrmStep;
  primaryOutcomeName: string | null;
  layoutDir: LayoutDir;
}

const START_NODE_ID = 'node_start';
const END_NODE_ID = 'node_end';

export function buildExecutiveGraph(
  steps: CrmStep[],
  outcomes: CrmOutcome[],
  dir: LayoutDir = 'TB'
): { nodes: Node[]; edges: Edge[] } {
  const sorted = [...steps].sort((a, b) => a.sequenceNo - b.sequenceNo);

  // For each step, find the primary forward outcome (first by sequenceNumber
  // that leads to the next step in sequence order).
  const stepById = new Map(sorted.map((s) => [s.id, s]));
  const outcomesByStep = new Map<string, CrmOutcome[]>();
  for (const step of sorted) outcomesByStep.set(step.id, []);
  for (const o of outcomes) outcomesByStep.get(o.stepId)?.push(o);
  for (const list of outcomesByStep.values()) {
    list.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  }

  // Back-edge detection (same rule as business builder).
  const backEdgeOutcomeIds = new Set<string>();
  for (const o of outcomes) {
    if (!o.nextStepId) continue;
    const parent = stepById.get(o.stepId);
    const next = stepById.get(o.nextStepId);
    if (parent && next && next.sequenceNo <= parent.sequenceNo) {
      backEdgeOutcomeIds.add(o.id);
    }
  }

  // Primary label per step: first forward outcome name heading to the next step.
  const primaryLabelByStep = new Map<string, string>();
  for (const step of sorted) {
    const stepOutcomes = outcomesByStep.get(step.id) ?? [];
    const primary = stepOutcomes.find(
      (o) => o.nextStepId && !backEdgeOutcomeIds.has(o.id)
    );
    if (primary) primaryLabelByStep.set(step.id, primary.name);
  }

  const stepNodes: Node[] = sorted.map((step) => ({
    id: `step_${step.id}`,
    type: 'execStep',
    position: { x: 0, y: 0 },
    data: {
      step,
      primaryOutcomeName: primaryLabelByStep.get(step.id) ?? null,
      layoutDir: dir,
    } as ExecStepData,
    draggable: true,
    selectable: true,
  }));

  const startNode: Node = {
    id: START_NODE_ID, type: 'viewStart', position: { x: 0, y: 0 },
    data: { layoutDir: dir }, draggable: false, selectable: false,
  };
  const endNode: Node = {
    id: END_NODE_ID, type: 'viewEnd', position: { x: 0, y: 0 },
    data: { layoutDir: dir }, draggable: false, selectable: false,
  };

  const nodes: Node[] = [startNode, ...stepNodes, endNode];

  // Entry step (lowest sequenceNo with no forward predecessors).
  const forwardTargetIds = new Set(
    outcomes.filter((o) => o.nextStepId && !backEdgeOutcomeIds.has(o.id)).map((o) => o.nextStepId!)
  );
  const entrySteps = sorted.filter((s) => !forwardTargetIds.has(s.id));
  const firstStep =
    entrySteps.length > 0
      ? entrySteps.reduce((min, s) => (s.sequenceNo < min.sequenceNo ? s : min))
      : sorted[0];

  const startEdge: Edge = {
    id: 'e_exec_start',
    source: START_NODE_ID, target: `step_${firstStep.id}`,
    sourceHandle: 'out', targetHandle: 'in',
    type: 'smoothstep',
    style: { stroke: '#16a34a', strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#16a34a' },
    selectable: false,
  };

  // Forward step-to-step edges (deduplicated, primary outcome as label).
  const forwardEdges: Edge[] = [];
  const seen = new Set<string>();
  for (const o of outcomes) {
    if (!o.nextStepId || backEdgeOutcomeIds.has(o.id)) continue;
    const key = `${o.stepId}→${o.nextStepId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const primaryLabel = primaryLabelByStep.get(o.stepId);
    forwardEdges.push({
      id: `e_exec_fwd_${o.stepId}_${o.nextStepId}`,
      source: `step_${o.stepId}`, target: `step_${o.nextStepId}`,
      sourceHandle: 'out', targetHandle: 'in',
      type: 'smoothstep',
      label: primaryLabel ?? undefined,
      labelStyle: { fontSize: 11, fill: '#475569', fontWeight: 500 },
      labelBgStyle: { fill: '#f8fafc', fillOpacity: 0.9, rx: 4 },
      style: { stroke: '#475569', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#475569' },
      selectable: false,
    });
  }

  // Last step → END (only from the final step in sequence).
  const lastStep = sorted[sorted.length - 1];
  const endEdge: Edge = {
    id: 'e_exec_end',
    source: `step_${lastStep.id}`, target: END_NODE_ID,
    sourceHandle: 'bottom', targetHandle: 'top',
    type: 'smoothstep',
    style: { stroke: '#dc2626', strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#dc2626' },
    selectable: false,
  };

  const allEdges = [startEdge, ...forwardEdges, endEdge];
  const positionedNodes = applyExecLayout(nodes, allEdges, dir);
  return { nodes: positionedNodes, edges: allEdges };
}

function applyExecLayout(nodes: Node[], edges: Edge[], dir: LayoutDir = 'TB'): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: dir, nodesep: 80, ranksep: 80, marginx: 80, marginy: 60 });

  for (const node of nodes) {
    const w = node.type === 'execStep' ? EXEC_STEP_W : MARKER_SIZE;
    const h = node.type === 'execStep' ? EXEC_STEP_H : MARKER_SIZE;
    g.setNode(node.id, { width: w, height: h });
  }
  for (const edge of edges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }
  dagre.layout(g);

  const positioned = nodes.map((node) => {
    const w = node.type === 'execStep' ? EXEC_STEP_W : MARKER_SIZE;
    const h = node.type === 'execStep' ? EXEC_STEP_H : MARKER_SIZE;
    const pos = g.node(node.id);
    if (!pos) return node;
    return { ...node, position: { x: pos.x - w / 2, y: pos.y - h / 2 } };
  });

  // Align all step and terminal nodes to the same center x.
  const stepNodes = positioned.filter((n) => n.type === 'execStep');
  if (stepNodes.length > 0) {
    const centerX =
      stepNodes.reduce((sum, n) => sum + n.position.x + EXEC_STEP_W / 2, 0) / stepNodes.length;
    return positioned.map((node) => {
      if (node.type === 'execStep') {
        return { ...node, position: { ...node.position, x: centerX - EXEC_STEP_W / 2 } };
      }
      if (node.type === 'viewStart' || node.type === 'viewEnd') {
        return { ...node, position: { ...node.position, x: centerX - MARKER_SIZE / 2 } };
      }
      return node;
    });
  }
  return positioned;
}
