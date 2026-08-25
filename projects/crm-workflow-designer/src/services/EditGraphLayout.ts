import dagre from '@dagrejs/dagre';
import { STEP_W, computeStepHeight } from './WorkflowGraphBuilder';
import {
  classifyCorrectionSteps,
  placeCorrectionSteps,
  nudgeClearOfObstacles,
  CORRECTION_PILL_H,
  CORRECTION_PILL_W,
} from './correctionSteps';

const START_ID = 'edit_start';
const END_ID = 'edit_end';

interface OutcomeEdge {
  stepId: string;
  nextStepId: string | null;
  sequenceNumber?: number;
  applyFilter?: boolean;
}

/**
 * Computes LR Dagre layout positions for all edit-mode nodes.
 * Returns a flat map of nodeId → {x, y} using the same key convention
 * as nodePositions in the store (`step_<id>`, `edit_start`, `edit_end`).
 *
 * CWFD-009 P1: only the forward flow ranks. Return edges used to feed the
 * ranking too, which let Dagre pull correction loops ahead of their approvers
 * and turned a 35-step process into a hairball. Corrections now sit out of
 * the ranking entirely and are attached beside the step they resubmit to.
 */
export interface RouteLink {
  /** The step whose conditional decision owns the route. */
  stepId: string;
  /** Where the route leads; null routes end the process. */
  nextStepId: string | null;
}

export function computeEditLayout(
  stepIds: string[],
  outcomes: OutcomeEdge[],
  routeLinks: RouteLink[] = []
): Record<string, { x: number; y: number }> {
  // stepOrder is sequence order, so array position stands in for sequenceNo.
  const orderOf = new Map(stepIds.map((id, index) => [id, index]));
  const isBackEdge = (o: { stepId: string; nextStepId: string | null }): boolean => {
    if (!o.nextStepId) return false;
    const from = orderOf.get(o.stepId);
    const to = orderOf.get(o.nextStepId);
    return from !== undefined && to !== undefined && to <= from;
  };

  const correctionInfo = classifyCorrectionSteps(
    stepIds.map((id, index) => ({ id, sequenceNo: index })),
    outcomes.map((o, index) => ({
      stepId: o.stepId,
      nextStepId: o.nextStepId,
      sequenceNumber: o.sequenceNumber ?? index,
      isConditional: o.applyFilter ?? false,
    })),
    stepIds[0] ?? null
  );
  const correctionIds = new Set(
    [...correctionInfo.correctionIds].filter(
      (id) => !correctionInfo.correctionIds.has(correctionInfo.returnTargetOf.get(id) ?? '')
    )
  );

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', ranksep: 80, nodesep: 60 });
  g.setDefaultEdgeLabel(() => ({}));

  g.setNode(START_ID, { width: 40, height: 40 });
  g.setNode(END_ID, { width: 40, height: 40 });

  const outcomeCountByStep = new Map<string, number>();
  for (const o of outcomes) {
    outcomeCountByStep.set(o.stepId, (outcomeCountByStep.get(o.stepId) ?? 0) + 1);
  }

  for (const id of stepIds) {
    if (correctionIds.has(id)) continue;
    g.setNode(`step_${id}`, {
      width: STEP_W,
      height: computeStepHeight(outcomeCountByStep.get(id) ?? 0),
    });
  }

  if (stepIds[0]) {
    g.setEdge(START_ID, `step_${stepIds[0]}`);
  }

  const addedEdges = new Set<string>();
  const hasIncoming = new Set<string>();
  const addRankEdge = (src: string, tgt: string) => {
    if (!g.hasNode(src) || !g.hasNode(tgt)) return;
    const key = `${src}→${tgt}`;
    if (addedEdges.has(key)) return;
    g.setEdge(src, tgt);
    addedEdges.add(key);
    hasIncoming.add(tgt);
  };

  for (const o of outcomes) {
    if (isBackEdge(o)) continue;
    addRankEdge(`step_${o.stepId}`, o.nextStepId ? `step_${o.nextStepId}` : END_ID);
  }
  // A gateway destination's only incoming link is a route, not an outcome —
  // without these it ranks at the far left, above the entry step.
  for (const link of routeLinks) {
    if (!link.nextStepId || isBackEdge(link)) continue;
    addRankEdge(`step_${link.stepId}`, `step_${link.nextStepId}`);
  }

  // Steps nothing routes into (the Loan spec has several) still need a rank:
  // anchor each under its nearest lower-sequence connected step so the canvas
  // reads in business order even where the configuration is incomplete.
  for (let index = 0; index < stepIds.length; index += 1) {
    const id = stepIds[index];
    if (index === 0 || correctionIds.has(id)) continue;
    const nodeId = `step_${id}`;
    if (hasIncoming.has(nodeId)) continue;
    for (let prev = index - 1; prev >= 0; prev -= 1) {
      if (correctionIds.has(stepIds[prev])) continue;
      addRankEdge(`step_${stepIds[prev]}`, nodeId);
      break;
    }
  }

  dagre.layout(g);

  const positions: Record<string, { x: number; y: number }> = {};
  for (const nodeId of g.nodes()) {
    const n = g.node(nodeId);
    positions[nodeId] = { x: n.x - n.width / 2, y: n.y - n.height / 2 };
  }

  // Corrections attach above their resubmit target (the edit canvas flows LR,
  // so the vertical band above the spine is free space).
  const pillPositions = placeCorrectionSteps(
    { correctionIds, returnTargetOf: correctionInfo.returnTargetOf },
    (stepId) => {
      const pos = positions[`step_${stepId}`];
      if (!pos) return null;
      return { ...pos, height: computeStepHeight(outcomeCountByStep.get(stepId) ?? 0) };
    },
    'LR'
  );
  const obstacles = stepIds
    .filter((id) => !correctionIds.has(id) && positions[`step_${id}`])
    .map((id) => ({
      ...positions[`step_${id}`],
      w: STEP_W,
      h: computeStepHeight(outcomeCountByStep.get(id) ?? 0),
    }));
  for (const [stepId, raw] of pillPositions) {
    const pos = nudgeClearOfObstacles(raw, obstacles, 'LR');
    obstacles.push({ x: pos.x, y: pos.y, w: CORRECTION_PILL_W, h: CORRECTION_PILL_H });
    positions[`step_${stepId}`] = pos;
  }
  // A correction whose target never got a position still needs somewhere sane.
  let orphanShelf = 0;
  for (const id of correctionIds) {
    if (!positions[`step_${id}`]) {
      positions[`step_${id}`] = { x: orphanShelf * (CORRECTION_PILL_W + 20), y: -CORRECTION_PILL_H - 120 };
      orphanShelf += 1;
    }
  }

  return positions;
}
