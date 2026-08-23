import dagre from '@dagrejs/dagre';
import { MarkerType } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import type { CrmStep, CrmOutcome, CrmRoute } from '../types/ViewTypes';
import type { StepOutcomeRow, LayoutDir } from './WorkflowGraphBuilder';
import { STEP_W, MARKER_SIZE, GATEWAY_SIZE, conditionLabel, branchRouteDestinations } from './WorkflowGraphBuilder';

export interface BackHandleInfo {
  outcomeId: string;
  offset: number;
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
  dir: LayoutDir = 'TB',
  routes: CrmRoute[] = []
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

  const routesByOutcome = new Map<string, CrmRoute[]>();
  for (const r of routes) {
    if (!routesByOutcome.has(r.outcomeId)) routesByOutcome.set(r.outcomeId, []);
    routesByOutcome.get(r.outcomeId)!.push(r);
  }
  for (const list of routesByOutcome.values()) {
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

  const gatewayNodes: Node[] = [];
  for (const o of outcomes) {
    if (!o.applyFilter) continue;
    const outcomeRoutes = routesByOutcome.get(o.id) ?? [];
    if (outcomeRoutes.length === 0) continue;
    gatewayNodes.push({
      id: `gw_${o.id}`,
      type: 'routeGateway',
      position: { x: 0, y: 0 },
      data: { outcomeName: o.name, outcomeId: o.id, routeCount: outcomeRoutes.length, isSelected: false },
      draggable: true,
      selectable: true,
    });
  }

  const startNode: Node = {
    id: START_NODE_ID, type: 'viewStart', position: { x: 0, y: 0 },
    data: { layoutDir: dir }, draggable: false, selectable: false,
  };
  const endNode: Node = {
    id: END_NODE_ID, type: 'viewEnd', position: { x: 0, y: 0 },
    data: { layoutDir: dir }, draggable: false, selectable: false,
  };

  const nodes: Node[] = [startNode, ...stepNodes, ...gatewayNodes, endNode];

  const startEdges: Edge[] = firstSteps.map((s) => ({
    id: `e_start_${s.id}`,
    source: START_NODE_ID, target: `step_${s.id}`,
    sourceHandle: 'out', targetHandle: 'in',
    type: 'default',
    style: { stroke: 'var(--success)', strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--success)' },
    selectable: false,
  }));

  const forwardEdges: Edge[] = [];
  const seenPairs = new Set<string>();

  for (const o of outcomes) {
    if (backEdgeOutcomeIds.has(o.id)) continue;
    const outcomeRoutes = routesByOutcome.get(o.id) ?? [];
    const hasGateway = o.applyFilter && outcomeRoutes.length > 0;

    if (hasGateway) {
      const entryKey = `${o.stepId}→gw_${o.id}`;
      if (!seenPairs.has(entryKey)) {
        seenPairs.add(entryKey);
        forwardEdges.push({
          id: `e_tech_entry_${o.id}`,
          source: `step_${o.stepId}`, target: `gw_${o.id}`,
          sourceHandle: 'out', targetHandle: 'in',
          type: 'default',
          style: { stroke: 'var(--warning)', strokeWidth: 1.5, strokeDasharray: '5 3' },
          markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--warning)' },
          selectable: false,
        });
      }

      for (const route of outcomeRoutes) {
        const targetId = route.nextStepId ? `step_${route.nextStepId}` : END_NODE_ID;
        const isFallback = route.isDefault;
        const stroke = isFallback ? 'var(--success)' : 'var(--warning)';
        const cond = conditionLabel(route.filter);
        const label = route.name && cond !== 'else' ? `${route.name}: ${cond}` : cond;

        forwardEdges.push({
          id: `e_tech_route_${route.id}`,
          source: `gw_${o.id}`, target: targetId,
          sourceHandle: 'out', targetHandle: 'in',
          type: 'default',
          animated: !isFallback,
          label,
          labelStyle: { fontSize: 9, fontWeight: 600, fill: isFallback ? 'var(--success)' : 'var(--warning)' },
          labelBgStyle: { fill: isFallback ? 'var(--success)' : 'var(--warning)', fillOpacity: 1 },
          style: { stroke, strokeWidth: 1.5, strokeDasharray: isFallback ? '4 4' : undefined },
          markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
          selectable: true,
        });
      }
    } else if (o.nextStepId) {
      const key = `${o.stepId}→${o.nextStepId}`;
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      forwardEdges.push({
        id: `e_fwd_${o.stepId}_${o.nextStepId}`,
        source: `step_${o.stepId}`, target: `step_${o.nextStepId}`,
        sourceHandle: 'out', targetHandle: 'in',
        type: 'default',
        style: { stroke: 'var(--text-secondary)', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--text-secondary)' },
        selectable: false,
      });
    }
  }

  const terminalStepIds = new Set<string>();
  for (const o of outcomes) {
    if (o.applyFilter) continue;
    if (!o.nextStepId) terminalStepIds.add(o.stepId);
  }
  for (const o of outcomes) {
    if (!o.applyFilter) continue;
    const outcomeRoutes = routesByOutcome.get(o.id) ?? [];
    if (outcomeRoutes.length > 0 && outcomeRoutes.every((r) => !r.nextStepId)) {
      terminalStepIds.add(o.stepId);
    }
  }

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
      type: 'default',
      style: isLast
        ? { stroke: 'var(--error)', strokeWidth: 2 }
        : { stroke: 'transparent', strokeWidth: 0 },
      markerEnd: isLast ? { type: MarkerType.ArrowClosed, color: 'var(--error)' } : undefined,
      selectable: false,
    };
  });

  const backEdges: Edge[] = outcomes
    .filter((o) => backEdgeOutcomeIds.has(o.id))
    .map((o) => ({
      id: `e_back_${o.id}`,
      source: `step_${o.stepId}`, target: `step_${o.nextStepId!}`,
      sourceHandle: `back-out-${o.id}`, targetHandle: `back-in-${o.id}`,
      type: 'bezier',
      label: `↩ ${o.name}${o.applyFilter ? ' ◈' : ''}`,
      labelStyle: { fontSize: 10, fill: 'var(--accent-branch)', fontWeight: 600 },
      labelBgStyle: { fill: 'var(--accent-branch)', fillOpacity: 1, rx: 4 },
      labelBgPadding: [8, 4] as [number, number],
      style: { stroke: 'var(--accent-branch)', strokeWidth: 1.5, strokeDasharray: '6 3' },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--accent-branch)' },
      selectable: true,
    }));

  const layoutEdges = [...startEdges, ...forwardEdges, ...endEdges];
  let positionedNodes = applyTechLayout(nodes, layoutEdges, dir);

  if (dir === 'TB' && routes.length > 0) {
    positionedNodes = branchRouteDestinations(positionedNodes, routes, outcomes, STEP_W);
  }

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
  g.setGraph({ rankdir: dir, nodesep: 120, ranksep: 100, marginx: 80, marginy: 60 });

  for (const node of nodes) {
    const { w, h } = techNodeDimensions(node);
    g.setNode(node.id, { width: w, height: h });
  }
  for (const edge of edges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }
  dagre.layout(g);

  const positioned = nodes.map((node) => {
    const { w, h } = techNodeDimensions(node);
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

function techNodeDimensions(node: Node): { w: number; h: number } {
  if (node.type === 'techStep') return { w: STEP_W, h: (node.data as TechStepData).nodeHeight };
  if (node.type === 'routeGateway') return { w: GATEWAY_SIZE, h: GATEWAY_SIZE };
  return { w: MARKER_SIZE, h: MARKER_SIZE };
}
