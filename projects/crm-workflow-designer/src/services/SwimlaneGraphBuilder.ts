import { MarkerType } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import type { CrmStep, CrmOutcome } from '../types/ViewTypes';
import { getAssignToLabel } from '../types/ViewTypes';
import type { StepOutcomeRow } from './WorkflowGraphBuilder';

export const SWIM_STEP_W = 240;
export const SWIM_STEP_H = 80;
const X_GAP = 340;
const LANE_H = 160;
const LANE_LABEL_W = 120;
const LANE_PAD_Y = 10;

export interface SwimStepData extends Record<string, unknown> {
  step: CrmStep;
  outcomeRows: StepOutcomeRow[];
}

export interface SwimlaneData extends Record<string, unknown> {
  label: string;
  laneWidth: number;
  laneColor: string;
}

const LANE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  'Specific User': { bg: 'var(--primary-tint-2)', border: 'var(--primary-tint)', text: 'var(--primary-pressed)' },
  'Team':          { bg: 'var(--success-bg)', border: 'var(--success)', text: 'var(--success)' },
  'Round Robin':   { bg: 'var(--accent-branch-bg)', border: 'var(--accent-branch)', text: 'var(--accent-branch)' },
};
const DEFAULT_LANE_COLOR = { bg: 'var(--surface-alt)', border: 'var(--border)', text: 'var(--text-secondary)' };

export function buildSwimlaneGraph(
  steps: CrmStep[],
  outcomes: CrmOutcome[]
): { nodes: Node[]; edges: Edge[] } {
  const sorted = [...steps].sort((a, b) => a.sequenceNo - b.sequenceNo);
  const stepById = new Map(sorted.map((s) => [s.id, s]));

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
  for (const step of sorted) outcomesByStep.set(step.id, []);
  for (const o of outcomes) outcomesByStep.get(o.stepId)?.push(o);
  for (const list of outcomesByStep.values()) {
    list.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  }

  // Build lane order by first appearance in the sorted sequence.
  const laneOrder: string[] = [];
  const seenLanes = new Set<string>();
  for (const step of sorted) {
    const lane = getAssignToLabel(step.assignToCode);
    if (!seenLanes.has(lane)) { laneOrder.push(lane); seenLanes.add(lane); }
  }
  const laneIndex = new Map(laneOrder.map((l, i) => [l, i]));

  const totalWidth = LANE_LABEL_W + sorted.length * X_GAP + 80;

  // Swimlane background nodes (rendered behind steps).
  const laneNodes: Node[] = laneOrder.map((lane, i) => {
    const colors = LANE_COLORS[lane] ?? DEFAULT_LANE_COLOR;
    return {
      id: `lane_${i}`,
      type: 'swimlane',
      position: { x: 0, y: i * LANE_H },
      data: {
        label: lane,
        laneWidth: totalWidth,
        laneColor: colors.bg,
        laneBorder: colors.border,
        laneTextColor: colors.text,
      } as SwimlaneData & { laneBorder: string; laneTextColor: string },
      selectable: false,
      draggable: false,
      zIndex: -1,
    };
  });

  // Step nodes positioned in their lane at their sequence x.
  const stepNodes: Node[] = sorted.map((step, seqIndex) => {
    const lane = getAssignToLabel(step.assignToCode);
    const li = laneIndex.get(lane) ?? 0;
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

    const x = LANE_LABEL_W + seqIndex * X_GAP;
    const y = li * LANE_H + LANE_PAD_Y + (LANE_H - LANE_PAD_Y * 2 - SWIM_STEP_H) / 2;

    return {
      id: `step_${step.id}`,
      type: 'swimStep',
      position: { x, y },
      data: { step, outcomeRows } as SwimStepData,
      draggable: true,
      selectable: true,
    };
  });

  // Forward step-to-step edges (deduplicated).
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
      sourceHandle: 'right', targetHandle: 'left',
      type: 'default',
      style: { stroke: 'var(--text-secondary)', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--text-secondary)' },
      selectable: false,
    });
  }

  // Back-edges route below all lanes.
  const backEdges: Edge[] = outcomes
    .filter((o) => backEdgeOutcomeIds.has(o.id))
    .map((o) => ({
      id: `e_back_${o.id}`,
      source: `step_${o.stepId}`, target: `step_${o.nextStepId!}`,
      sourceHandle: 'bottom', targetHandle: 'bottom',
      type: 'default',
      label: `↩ ${truncate(o.name, 16)}`,
      labelStyle: { fontSize: 10, fill: 'var(--accent-branch)', fontWeight: 600 },
      labelBgStyle: { fill: 'var(--accent-branch)', fillOpacity: 0.95, rx: 4 },
      style: { stroke: 'var(--accent-branch)', strokeWidth: 1.5, strokeDasharray: '6 3' },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--accent-branch)' },
      selectable: true,
    }));

  const nodes: Node[] = [...laneNodes, ...stepNodes];
  const edges: Edge[] = [...forwardEdges, ...backEdges];
  return { nodes, edges };
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
