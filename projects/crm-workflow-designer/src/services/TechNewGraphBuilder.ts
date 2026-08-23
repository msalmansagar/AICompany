import { MarkerType } from '@xyflow/react';
import { BRANCH_EDGE_LABEL } from '../styles/surfacePairs';
import type { Node, Edge } from '@xyflow/react';
import type { CrmStep, CrmOutcome, CrmRoute } from '../types/ViewTypes';
import type { LayoutDir, StepOutcomeRow } from './WorkflowGraphBuilder';
import { conditionLabel } from './WorkflowGraphBuilder';
import { computeTechStepHeight } from './TechnicalGraphBuilder';

// TB layout: steps in a vertical column, outcome pills branch to the right
const STEP_W = 280;
const TB_STEP_X = 160;
const TB_OUTCOME_GAP = 70;    // gap from step right edge to outcome left edge
const TB_OUTCOME_Y_OFFSET = 8;
const TB_OUTCOME_Y_STEP = 44;
const TB_STEP_V_GAP = 50;
const TB_CANVAS_TOP = 80;

// LR layout: steps in a horizontal row, outcome pills branch downward
const LR_STEP_Y = 160;
const LR_OUTCOME_GAP = 60;   // gap from step bottom to outcome top
const LR_OUTCOME_X_STEP = 210;
const LR_STEP_H_GAP = 70;
const LR_CANVAS_LEFT = 80;

const MARKER_SIZE = 48;

const TN_START_ID = 'tn_start';
const TN_END_ID = 'tn_end';

export interface TechNewStepData extends Record<string, unknown> {
  step: CrmStep;
  outcomeRows: StepOutcomeRow[];
  layoutDir: LayoutDir;
}

export interface TechNewOutcomeData extends Record<string, unknown> {
  outcomeId: string;
  name: string;
  isReturn: boolean;
  isTerminal: boolean;
  nextStepName: string | null;
  layoutDir: LayoutDir;
}

function isReturnEdge(outcome: CrmOutcome, stepById: Map<string, CrmStep>): boolean {
  if (!outcome.nextStepId) return false;
  const parent = stepById.get(outcome.stepId);
  const next = stepById.get(outcome.nextStepId);
  return Boolean(parent && next && next.sequenceNo <= parent.sequenceNo);
}

function groupOutcomesByStep(steps: CrmStep[], outcomes: CrmOutcome[]): Map<string, CrmOutcome[]> {
  const map = new Map<string, CrmOutcome[]>();
  for (const s of steps) map.set(s.id, []);
  for (const o of outcomes) map.get(o.stepId)?.push(o);
  for (const list of map.values()) list.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  return map;
}

function makeStepNode(
  step: CrmStep,
  stepOutcomes: CrmOutcome[],
  stepById: Map<string, CrmStep>,
  pos: { x: number; y: number },
  dir: LayoutDir
): Node {
  const outcomeRows: StepOutcomeRow[] = stepOutcomes.map((o) => ({
    id: o.id,
    name: o.name,
    nextStepId: o.nextStepId,
    nextStepName: o.nextStepId ? (stepById.get(o.nextStepId)?.name ?? null) : null,
    applyFilter: o.applyFilter,
    isBackEdge: isReturnEdge(o, stepById),
    isTerminal: !o.nextStepId,
  }));
  return {
    id: `tn_step_${step.id}`,
    type: 'techNewStep',
    position: pos,
    draggable: true,
    selectable: true,
    data: { step, outcomeRows, layoutDir: dir } as TechNewStepData,
  };
}

function makeOutcomeNode(
  o: CrmOutcome,
  stepById: Map<string, CrmStep>,
  pos: { x: number; y: number },
  dir: LayoutDir
): Node {
  return {
    id: `tn_outcome_${o.id}`,
    type: 'techNewOutcome',
    position: pos,
    draggable: false,
    selectable: false,
    data: {
      outcomeId: o.id,
      name: o.name,
      isReturn: isReturnEdge(o, stepById),
      isTerminal: !o.nextStepId,
      nextStepName: o.nextStepId ? (stepById.get(o.nextStepId)?.name ?? null) : null,
      layoutDir: dir,
    } as TechNewOutcomeData,
  };
}

export function buildTechNewGraph(
  steps: CrmStep[],
  outcomes: CrmOutcome[],
  dir: LayoutDir = 'TB',
  routes: CrmRoute[] = []
): { nodes: Node[]; edges: Edge[] } {
  const sorted = [...steps].sort((a, b) => a.sequenceNo - b.sequenceNo);
  const stepById = new Map(steps.map((s) => [s.id, s]));
  const outcomesByStep = groupOutcomesByStep(steps, outcomes);
  const routesByOutcome = buildRoutesByOutcome(routes);
  return dir === 'LR'
    ? assembleLrGraph(sorted, outcomes, outcomesByStep, stepById, routesByOutcome)
    : assembleTbGraph(sorted, outcomes, outcomesByStep, stepById, routesByOutcome);
}

function buildRoutesByOutcome(routes: CrmRoute[]): Map<string, CrmRoute[]> {
  const map = new Map<string, CrmRoute[]>();
  for (const r of routes) {
    if (!map.has(r.outcomeId)) map.set(r.outcomeId, []);
    map.get(r.outcomeId)!.push(r);
  }
  for (const list of map.values()) list.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  return map;
}

function assembleTbGraph(
  sorted: CrmStep[],
  outcomes: CrmOutcome[],
  outcomesByStep: Map<string, CrmOutcome[]>,
  stepById: Map<string, CrmStep>,
  routesByOutcome: Map<string, CrmRoute[]>
): { nodes: Node[]; edges: Edge[] } {
  const dir: LayoutDir = 'TB';
  const stepPositions = new Map<string, { x: number; y: number }>();
  let currentY = TB_CANVAS_TOP;

  for (const step of sorted) {
    const stepOutcomes = outcomesByStep.get(step.id) ?? [];
    const stepH = computeTechStepHeight(step, stepOutcomes.length);
    const rowH = Math.max(stepH, TB_OUTCOME_Y_OFFSET + stepOutcomes.length * TB_OUTCOME_Y_STEP + 20);
    stepPositions.set(step.id, { x: TB_STEP_X, y: currentY });
    currentY += rowH + TB_STEP_V_GAP;
  }

  const stepCenterX = TB_STEP_X + STEP_W / 2;
  const startNode: Node = {
    id: TN_START_ID, type: 'viewStart',
    position: { x: stepCenterX - MARKER_SIZE / 2, y: TB_CANVAS_TOP - MARKER_SIZE - 30 },
    data: { layoutDir: dir }, selectable: false, draggable: false,
  };
  const endNode: Node = {
    id: TN_END_ID, type: 'viewEnd',
    position: { x: stepCenterX - MARKER_SIZE / 2, y: currentY + 20 },
    data: { layoutDir: dir }, selectable: false, draggable: false,
  };

  const stepNodes = sorted.map((step) =>
    makeStepNode(step, outcomesByStep.get(step.id) ?? [], stepById, stepPositions.get(step.id)!, dir)
  );

  const outcomeNodes: Node[] = [];
  for (const step of sorted) {
    const sp = stepPositions.get(step.id)!;
    (outcomesByStep.get(step.id) ?? []).forEach((o, idx) => {
      outcomeNodes.push(makeOutcomeNode(o, stepById, {
        x: sp.x + STEP_W + TB_OUTCOME_GAP,
        y: sp.y + TB_OUTCOME_Y_OFFSET + idx * TB_OUTCOME_Y_STEP,
      }, dir));
    });
  }

  const edges = buildEdges(sorted, outcomes, outcomesByStep, stepById, routesByOutcome);
  return { nodes: [startNode, ...stepNodes, ...outcomeNodes, endNode], edges };
}

function assembleLrGraph(
  sorted: CrmStep[],
  outcomes: CrmOutcome[],
  outcomesByStep: Map<string, CrmOutcome[]>,
  stepById: Map<string, CrmStep>,
  routesByOutcome: Map<string, CrmRoute[]>
): { nodes: Node[]; edges: Edge[] } {
  const dir: LayoutDir = 'LR';
  const stepPositions = new Map<string, { x: number; y: number }>();
  let currentX = LR_CANVAS_LEFT;
  let maxStepH = 0;

  for (const step of sorted) {
    const stepOutcomes = outcomesByStep.get(step.id) ?? [];
    const stepH = computeTechStepHeight(step, stepOutcomes.length);
    if (stepH > maxStepH) maxStepH = stepH;
    const colW = Math.max(STEP_W, stepOutcomes.length * LR_OUTCOME_X_STEP + 20);
    stepPositions.set(step.id, { x: currentX, y: LR_STEP_Y });
    currentX += colW + LR_STEP_H_GAP;
  }

  const stepCenterY = LR_STEP_Y + maxStepH / 2;
  const startNode: Node = {
    id: TN_START_ID, type: 'viewStart',
    position: { x: LR_CANVAS_LEFT - MARKER_SIZE - 30, y: stepCenterY - MARKER_SIZE / 2 },
    data: { layoutDir: dir }, selectable: false, draggable: false,
  };
  const endNode: Node = {
    id: TN_END_ID, type: 'viewEnd',
    position: { x: currentX + 20, y: stepCenterY - MARKER_SIZE / 2 },
    data: { layoutDir: dir }, selectable: false, draggable: false,
  };

  const stepNodes = sorted.map((step) =>
    makeStepNode(step, outcomesByStep.get(step.id) ?? [], stepById, stepPositions.get(step.id)!, dir)
  );

  const outcomeNodes: Node[] = [];
  for (const step of sorted) {
    const stepOutcomes = outcomesByStep.get(step.id) ?? [];
    const stepH = computeTechStepHeight(step, stepOutcomes.length);
    const sp = stepPositions.get(step.id)!;
    stepOutcomes.forEach((o, idx) => {
      outcomeNodes.push(makeOutcomeNode(o, stepById, {
        x: sp.x + idx * LR_OUTCOME_X_STEP,
        y: sp.y + stepH + LR_OUTCOME_GAP,
      }, dir));
    });
  }

  const edges = buildEdges(sorted, outcomes, outcomesByStep, stepById, routesByOutcome);
  return { nodes: [startNode, ...stepNodes, ...outcomeNodes, endNode], edges };
}

function buildEdges(
  sorted: CrmStep[],
  outcomes: CrmOutcome[],
  outcomesByStep: Map<string, CrmOutcome[]>,
  stepById: Map<string, CrmStep>,
  routesByOutcome: Map<string, CrmRoute[]>
): Edge[] {
  const edges: Edge[] = [];

  if (sorted.length > 0) {
    edges.push({
      id: 'tn_e_start',
      source: TN_START_ID,
      target: `tn_step_${sorted[0].id}`,
      sourceHandle: 'out',
      targetHandle: 'in',
      type: 'default',
      style: { stroke: 'var(--success)', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--success)' },
      selectable: false,
    });
  }

  for (const step of sorted) {
    for (const o of (outcomesByStep.get(step.id) ?? [])) {
      edges.push({
        id: `tn_e_so_${o.id}`,
        source: `tn_step_${step.id}`,
        target: `tn_outcome_${o.id}`,
        sourceHandle: 'out',
        targetHandle: 'in',
        type: 'default',
        style: { stroke: 'var(--text-secondary)', strokeWidth: 1.5 },
        selectable: false,
      });
    }
  }

  for (const o of outcomes) {
    const outcomeRoutes = routesByOutcome.get(o.id) ?? [];
    const hasRoutes = o.applyFilter && outcomeRoutes.length > 0;

    if (hasRoutes) {
      // Outcome pill → each route destination with condition label
      for (const route of outcomeRoutes) {
        const targetId = route.nextStepId ? `tn_step_${route.nextStepId}` : TN_END_ID;
        const isFallback = route.isDefault;
        const stroke = isFallback ? 'var(--success)' : 'var(--warning)';
        const cond = conditionLabel(route.filter);
        const rawLabel = route.name && cond !== 'else' ? `${route.name}: ${cond}` : cond;
        const label = rawLabel.length > 28 ? `${rawLabel.slice(0, 28)}…` : rawLabel;

        edges.push({
          id: `tn_e_route_${route.id}`,
          source: `tn_outcome_${o.id}`,
          target: targetId,
          sourceHandle: 'out',
          targetHandle: 'in',
          type: 'default',
          animated: !isFallback,
          label,
          labelStyle: { fontSize: 9, fontWeight: 600, fill: isFallback ? 'var(--success)' : 'var(--warning)' },
          labelBgStyle: { fill: isFallback ? 'var(--success)' : 'var(--warning)', fillOpacity: 1 },
          style: { stroke, strokeWidth: 1.5, strokeDasharray: isFallback ? '4 4' : undefined },
          markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
          selectable: false,
        });
      }
    } else if (!o.nextStepId) {
      edges.push({
        id: `tn_e_end_${o.id}`,
        source: `tn_outcome_${o.id}`,
        target: TN_END_ID,
        sourceHandle: 'term',
        targetHandle: 'in',
        type: 'default',
        style: { stroke: 'var(--text-secondary)', strokeWidth: 1.5, strokeDasharray: '4 3' },
        markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--text-secondary)' },
        selectable: false,
      });
    } else if (isReturnEdge(o, stepById)) {
      edges.push({
        id: `tn_e_return_${o.id}`,
        source: `tn_outcome_${o.id}`,
        target: `tn_step_${o.nextStepId}`,
        sourceHandle: 'out',
        targetHandle: 'in',
        type: 'default',
        label: `↩ ${o.name}`,
        // was accent-on-accent — the same invisible-text pairing the contrast
        // guard now protects against; BRANCH_EDGE_LABEL is registered there.
        labelStyle: { fontSize: 10, fill: BRANCH_EDGE_LABEL.foreground, fontWeight: 600 },
        labelBgStyle: { fill: BRANCH_EDGE_LABEL.background, fillOpacity: 1, rx: 4 },
        labelBgPadding: [8, 4] as [number, number],
        style: { stroke: 'var(--accent-branch)', strokeWidth: 2, strokeDasharray: '6 3' },
        markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--accent-branch)' },
        selectable: true,
      });
    } else {
      edges.push({
        id: `tn_e_fwd_${o.id}`,
        source: `tn_outcome_${o.id}`,
        target: `tn_step_${o.nextStepId}`,
        sourceHandle: 'out',
        targetHandle: 'in',
        type: 'default',
        style: { stroke: 'var(--primary)', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--primary)' },
        selectable: true,
      });
    }
  }

  return edges;
}
