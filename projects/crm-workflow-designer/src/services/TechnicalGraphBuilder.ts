import dagre from '@dagrejs/dagre';
import { MarkerType } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import type { CrmStep, CrmOutcome } from '../types/ViewTypes';
import type { StepOutcomeRow, LayoutDir } from './WorkflowGraphBuilder';
import { STEP_W, MARKER_SIZE } from './WorkflowGraphBuilder';

export interface BackHandleInfo {
  outcomeId: string;
  offset: number; // % position along the top (LR) or left (TB) edge
}

export interface TechStepData extends Record<string, unknown> {
  step: CrmStep;
  outcomeRows: StepOutcomeRow[];
  nodeHeight: number;
  layoutDir: LayoutDir;
  backOutHandles: BackHandleInfo[];
  backInHandles: BackHandleInfo[];
}

const TECH_BASE_H = 90;
const TECH_SCHEMA_ROW_H = 18;
const TECH_TASK_ROW_H = 18;
const TECH_ENTITY_ROW_H = 18;
const TECH_OUTCOME_ROW_H = 22;
const TECH_DIVIDER_H = 12;
// Technical nodes always show the schema row (even if empty), so we reserve that height.
const TECH_ALWAYS_H = TECH_SCHEMA_ROW_H;

export function computeTechStepHeight(step: CrmStep, outcomeCount: number): number {
  let h = TECH_BASE_H + TECH_ALWAYS_H;
  if (step.taskSubject) h += TECH_TASK_ROW_H;
  if (step.recordEntityName) h += TECH_ENTITY_ROW_H;
  if (outcomeCount > 0) h += TECH_DIVIDER_H + outcomeCount * TECH_OUTCOME_ROW_H;
  return h + 8;
}

const START_NODE_ID = 'node_start';
const END_NODE_ID = 'node_end';

export function buildTechnicalGraph(
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

  // Per-step back-handle registries — each outcome gets its own handle slot.
  const backOutsByStep = new Map<string, string[]>();
  const backInsByStep  = new Map<string, string[]>();
  for (const o of outcomes) {
    if (!backEdgeOutcomeIds.has(o.id)) continue;
    if (!backOutsByStep.has(o.stepId))     backOutsByStep.set(o.stepId, []);
    if (!backInsByStep.has(o.nextStepId!)) backInsByStep.set(o.nextStepId!, []);
    backOutsByStep.get(o.stepId)!.push(o.id);
    backInsByStep.get(o.nextStepId!)!.push(o.id);
  }

  const outcomesByStep = new Map<string, CrmOutcome[]>();
  for (const step of steps) outcomesByStep.set(step.id, []);
  for (const o of outcomes) outcomesByStep.get(o.stepId)?.push(o);
  for (const list of outcomesByStep.values()) {
    list.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  }

  const forwardTargetStepIds = new Set(
    outcomes.filter((o) => o.nextStepId && !backEdgeOutcomeIds.has(o.id)).map((o) => o.nextStepId!)
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
    const nodeHeight = computeTechStepHeight(step, stepOutcomes.length);

    return {
      id: `step_${step.id}`,
      type: 'techStep',
      position: { x: 0, y: 0 },
      data: {
        step, outcomeRows, nodeHeight, layoutDir: dir,
        backOutHandles: spreadHandles(backOutsByStep.get(step.id) ?? []),
        backInHandles:  spreadHandles(backInsByStep.get(step.id)  ?? []),
      } as TechStepData,
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
    source: START_NODE_ID, target: `step_${s.id}`,
    sourceHandle: 'out', targetHandle: 'in',
    type: 'smoothstep',
    style: { stroke: '#16a34a', strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#16a34a' },
    selectable: false,
  }));

  const forwardEdges: Edge[] = [];
  const seenPairs = new Set<string>();
  for (const o of outcomes) {
    if (!o.nextStepId || backEdgeOutcomeIds.has(o.id)) continue;
    const key = `${o.stepId}→${o.nextStepId}`;
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    forwardEdges.push({
      id: `e_fwd_${o.stepId}_${o.nextStepId}`,
      source: `step_${o.stepId}`, target: `step_${o.nextStepId}`,
      sourceHandle: 'out', targetHandle: 'in',
      type: 'smoothstep',
      style: { stroke: '#64748b', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
      selectable: false,
    });
  }

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
      source: `step_${stepId}`, target: END_NODE_ID,
      sourceHandle: 'out', targetHandle: 'in',
      type: 'smoothstep',
      style: isLast
        ? { stroke: '#dc2626', strokeWidth: 2 }
        : { stroke: 'transparent', strokeWidth: 0 },
      markerEnd: isLast ? { type: MarkerType.ArrowClosed, color: '#dc2626' } : undefined,
      selectable: false,
    };
  });

  // Each back-edge gets its own per-outcome handle ID so arcs never share a point.
  const backEdges: Edge[] = outcomes
    .filter((o) => backEdgeOutcomeIds.has(o.id))
    .map((o) => ({
      id: `e_back_${o.id}`,
      source: `step_${o.stepId}`, target: `step_${o.nextStepId!}`,
      sourceHandle: `back-out-${o.id}`, targetHandle: `back-in-${o.id}`,
      type: 'bezier',
      label: `↩ ${o.name}${o.applyFilter ? ' ◈' : ''}`,
      labelStyle: { fontSize: 10, fill: '#7c3aed', fontWeight: 600 },
      labelBgStyle: { fill: '#f5f3ff', fillOpacity: 1, rx: 4 },
      labelBgPadding: [8, 4] as [number, number],
      style: { stroke: '#7c3aed', strokeWidth: 1.5, strokeDasharray: '6 3' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#7c3aed' },
      selectable: true,
    }));

  const layoutEdges = [...startEdges, ...forwardEdges, ...endEdges];
  const positionedNodes = applyTechLayout(nodes, layoutEdges, dir);
  return { nodes: positionedNodes, edges: [...layoutEdges, ...backEdges] };
}

function spreadHandles(ids: string[]): BackHandleInfo[] {
  const n = ids.length;
  return ids.map((id, i) => ({
    outcomeId: id,
    offset: n === 1 ? 50 : 15 + (i / (n - 1)) * 70,
  }));
}

function applyTechLayout(nodes: Node[], edges: Edge[], dir: LayoutDir = 'TB'): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: dir, nodesep: 120, ranksep: 70, marginx: 80, marginy: 60 });

  for (const node of nodes) {
    const w = node.type === 'techStep' ? STEP_W : MARKER_SIZE;
    const h = node.type === 'techStep' ? (node.data as TechStepData).nodeHeight : MARKER_SIZE;
    g.setNode(node.id, { width: w, height: h });
  }
  for (const edge of edges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }
  dagre.layout(g);

  const positioned = nodes.map((node) => {
    const w = node.type === 'techStep' ? STEP_W : MARKER_SIZE;
    const h = node.type === 'techStep' ? (node.data as TechStepData).nodeHeight : MARKER_SIZE;
    const pos = g.node(node.id);
    if (!pos) return node;
    return { ...node, position: { x: pos.x - w / 2, y: pos.y - h / 2 } };
  });

  const stepNodes = positioned.filter((n) => n.type === 'techStep');
  if (stepNodes.length === 0) return positioned;

  if (dir === 'TB') {
    const centerX =
      stepNodes.reduce((sum, n) => sum + n.position.x + STEP_W / 2, 0) / stepNodes.length;
    return positioned.map((node) => {
      if (node.type === 'techStep')
        return { ...node, position: { ...node.position, x: centerX - STEP_W / 2 } };
      if (node.type === 'viewStart' || node.type === 'viewEnd')
        return { ...node, position: { ...node.position, x: centerX - MARKER_SIZE / 2 } };
      return node;
    });
  } else {
    const centerY =
      stepNodes.reduce((sum, n) => sum + n.position.y + (n.data as TechStepData).nodeHeight / 2, 0) /
      stepNodes.length;
    return positioned.map((node) => {
      if (node.type === 'techStep') {
        const h = (node.data as TechStepData).nodeHeight;
        return { ...node, position: { ...node.position, y: centerY - h / 2 } };
      }
      if (node.type === 'viewStart' || node.type === 'viewEnd')
        return { ...node, position: { ...node.position, y: centerY - MARKER_SIZE / 2 } };
      return node;
    });
  }
}
