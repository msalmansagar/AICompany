import dagre from '@dagrejs/dagre';
import { MarkerType } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import type { CrmStep, CrmOutcome, CrmRoute } from '../types/ViewTypes';
import type { LayoutDir } from './WorkflowGraphBuilder';
import { MARKER_SIZE, GATEWAY_SIZE, conditionLabel, branchRouteDestinations } from './WorkflowGraphBuilder';

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
  dir: LayoutDir = 'TB',
  routes: CrmRoute[] = []
): { nodes: Node[]; edges: Edge[] } {
  const sorted = [...steps].sort((a, b) => a.sequenceNo - b.sequenceNo);
  const stepById = new Map(sorted.map((s) => [s.id, s]));

  const outcomesByStep = new Map<string, CrmOutcome[]>();
  for (const step of sorted) outcomesByStep.set(step.id, []);
  for (const o of outcomes) outcomesByStep.get(o.stepId)?.push(o);
  for (const list of outcomesByStep.values()) {
    list.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  }

  const backEdgeOutcomeIds = new Set<string>();
  for (const o of outcomes) {
    if (!o.nextStepId) continue;
    const parent = stepById.get(o.stepId);
    const next = stepById.get(o.nextStepId);
    if (parent && next && next.sequenceNo <= parent.sequenceNo) {
      backEdgeOutcomeIds.add(o.id);
    }
  }

  const primaryLabelByStep = new Map<string, string>();
  for (const step of sorted) {
    const stepOutcomes = outcomesByStep.get(step.id) ?? [];
    const primary = stepOutcomes.find((o) => o.nextStepId && !backEdgeOutcomeIds.has(o.id));
    if (primary) primaryLabelByStep.set(step.id, primary.name);
  }

  const routesByOutcome = new Map<string, CrmRoute[]>();
  for (const r of routes) {
    if (!routesByOutcome.has(r.outcomeId)) routesByOutcome.set(r.outcomeId, []);
    routesByOutcome.get(r.outcomeId)!.push(r);
  }
  for (const list of routesByOutcome.values()) {
    list.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
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

  const nodes: Node[] = [startNode, ...stepNodes, ...gatewayNodes, endNode];

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

  const forwardEdges: Edge[] = [];
  const seen = new Set<string>();

  for (const o of outcomes) {
    if (backEdgeOutcomeIds.has(o.id)) continue;
    const outcomeRoutes = routesByOutcome.get(o.id) ?? [];
    const hasGateway = o.applyFilter && outcomeRoutes.length > 0;

    if (hasGateway) {
      const entryKey = `${o.stepId}→gw_${o.id}`;
      if (!seen.has(entryKey)) {
        seen.add(entryKey);
        forwardEdges.push({
          id: `e_exec_entry_${o.id}`,
          source: `step_${o.stepId}`, target: `gw_${o.id}`,
          sourceHandle: 'out', targetHandle: 'in',
          type: 'smoothstep',
          style: { stroke: '#d97706', strokeWidth: 1.5, strokeDasharray: '5 3' },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#d97706' },
          selectable: false,
        });
      }

      for (const route of outcomeRoutes) {
        const targetId = route.nextStepId ? `step_${route.nextStepId}` : END_NODE_ID;
        const isFallback = !route.filter?.trim();
        const stroke = isFallback ? '#16a34a' : '#d97706';
        const cond = conditionLabel(route.filter);
        const label = route.name && cond !== 'else' ? `${route.name}: ${cond}` : cond;

        forwardEdges.push({
          id: `e_exec_route_${route.id}`,
          source: `gw_${o.id}`, target: targetId,
          sourceHandle: 'out', targetHandle: 'in',
          type: 'smoothstep',
          animated: !isFallback,
          label,
          labelStyle: { fontSize: 9, fontWeight: 600, fill: isFallback ? '#166534' : '#92400e' },
          labelBgStyle: { fill: isFallback ? '#f0fdf4' : '#fef3c7', fillOpacity: 1 },
          style: { stroke, strokeWidth: 1.5, strokeDasharray: isFallback ? '4 4' : undefined },
          markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
          selectable: true,
        });
      }
    } else if (o.nextStepId) {
      const key = `${o.stepId}→${o.nextStepId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      forwardEdges.push({
        id: `e_exec_fwd_${o.stepId}_${o.nextStepId}`,
        source: `step_${o.stepId}`, target: `step_${o.nextStepId}`,
        sourceHandle: 'out', targetHandle: 'in',
        type: 'smoothstep',
        label: primaryLabelByStep.get(o.stepId) ?? undefined,
        labelStyle: { fontSize: 11, fill: '#475569', fontWeight: 500 },
        labelBgStyle: { fill: '#f8fafc', fillOpacity: 0.9, rx: 4 },
        style: { stroke: '#475569', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#475569' },
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
  if (terminalStepIds.size === 0 && sorted.length > 0) {
    terminalStepIds.add(sorted[sorted.length - 1].id);
  }

  const lastTerminalStep = [...terminalStepIds]
    .map((id) => stepById.get(id))
    .filter((s): s is CrmStep => s !== undefined)
    .sort((a, b) => b.sequenceNo - a.sequenceNo)[0];

  const endEdges: Edge[] = [...terminalStepIds].map((stepId) => {
    const isLast = stepId === lastTerminalStep?.id;
    return {
      id: `e_exec_end_${stepId}`,
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

  const allEdges = [startEdge, ...forwardEdges, ...endEdges];
  let positionedNodes = applyExecLayout(nodes, allEdges, dir);

  if (dir === 'TB' && routes.length > 0) {
    positionedNodes = branchRouteDestinations(positionedNodes, routes, outcomes, EXEC_STEP_W);
  }

  return { nodes: positionedNodes, edges: allEdges };
}

function applyExecLayout(nodes: Node[], edges: Edge[], dir: LayoutDir = 'TB'): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: dir, nodesep: 80, ranksep: 100, marginx: 80, marginy: 60 });

  for (const node of nodes) {
    const { w, h } = execNodeDimensions(node);
    g.setNode(node.id, { width: w, height: h });
  }
  for (const edge of edges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }
  dagre.layout(g);

  const positioned = nodes.map((node) => {
    const { w, h } = execNodeDimensions(node);
    const pos = g.node(node.id);
    if (!pos) return node;
    return { ...node, position: { x: pos.x - w / 2, y: pos.y - h / 2 } };
  });

  const stepNodes = positioned.filter((n) => n.type === 'execStep');
  if (stepNodes.length === 0) return positioned;

  if (dir === 'TB') {
    const centerX =
      stepNodes.reduce((sum, n) => sum + n.position.x + EXEC_STEP_W / 2, 0) / stepNodes.length;
    return positioned.map((node) => {
      if (node.type === 'execStep')
        return { ...node, position: { ...node.position, x: centerX - EXEC_STEP_W / 2 } };
      if (node.type === 'viewStart' || node.type === 'viewEnd')
        return { ...node, position: { ...node.position, x: centerX - MARKER_SIZE / 2 } };
      return node;
    });
  } else {
    const centerY =
      stepNodes.reduce((sum, n) => sum + n.position.y + EXEC_STEP_H / 2, 0) / stepNodes.length;
    return positioned.map((node) => {
      if (node.type === 'execStep')
        return { ...node, position: { ...node.position, y: centerY - EXEC_STEP_H / 2 } };
      if (node.type === 'viewStart' || node.type === 'viewEnd')
        return { ...node, position: { ...node.position, y: centerY - MARKER_SIZE / 2 } };
      return node;
    });
  }
}

function execNodeDimensions(node: Node): { w: number; h: number } {
  if (node.type === 'execStep') return { w: EXEC_STEP_W, h: EXEC_STEP_H };
  if (node.type === 'routeGateway') return { w: GATEWAY_SIZE, h: GATEWAY_SIZE };
  return { w: MARKER_SIZE, h: MARKER_SIZE };
}
