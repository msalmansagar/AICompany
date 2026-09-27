import { MarkerType } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import type { CrmStep, CrmOutcome, CrmRoute } from '../types/ViewTypes';
import type { LayoutDir } from './WorkflowGraphBuilder';
import { roleOfStepName } from './stageRoles';
import { classifyCorrectionSteps } from './correctionSteps';
import { collectReturnRefs } from './returnSpotlight';

/**
 * The Overview canvas (CWFD-017 PR5): the process as its stages.
 *
 * START → Relationship Manager → EPD/Technical → … → END, each stage one
 * chip carrying its aggregates (steps, returns, parallel, endings). Every
 * fact is DERIVED from the live configuration — stages come from the same
 * role heuristic the stage bands and swimlanes already trust, returns from
 * the same resolver the ↩ badges use — so the Overview can never drift from
 * the process the way a hand-maintained summary would.
 *
 * Clicking a stage drills into the Detailed (Business) canvas at that
 * stage's first step; the canvas wires that, not this module.
 */

export interface StageSpec {
  /** Stable per-process id: the stage's position in flow order. */
  index: number;
  label: string;
  stepIds: string[];
  /** Where a drill-down into the Detailed view should land. */
  firstStepId: string;
  counts: {
    steps: number;
    returns: number;
    parallel: number;
    endings: number;
  };
}

export interface StageTransition {
  fromIndex: number;
  toIndex: number;
  /** How many distinct step-level transitions this stage link bundles. */
  transitionCount: number;
}

export interface StageOverview {
  stages: StageSpec[];
  transitions: StageTransition[];
}

const FALLBACK_STAGE = 'General';

/**
 * Stages in flow order, with their aggregates and the forward transitions
 * between them. Pure over the loaded configuration.
 */
export function deriveStageOverview(
  steps: CrmStep[],
  outcomes: CrmOutcome[],
  routes: CrmRoute[]
): StageOverview {
  const ordered = [...steps].sort((a, b) => a.sequenceNo - b.sequenceNo);
  const entry = ordered[0];
  const correctionInfo = classifyCorrectionSteps(
    ordered.map((s) => ({ id: s.id, sequenceNo: s.sequenceNo })),
    outcomes.map((o) => ({
      stepId: o.stepId,
      nextStepId: o.nextStepId,
      sequenceNumber: o.sequenceNumber,
      isConditional: o.applyFilter,
    })),
    entry?.id ?? null
  );

  // Walk the spine in sequence order; a new role starts a new stage, and a
  // step with no role hint stays with the stage it follows. Corrections are
  // plumbing — they count as returns (below), never as stage steps.
  const stages: StageSpec[] = [];
  const stageOfStep = new Map<string, number>();
  let currentLabel: string | null = null;
  for (const step of ordered) {
    if (correctionInfo.correctionIds.has(step.id)) continue;
    const role: string = roleOfStepName(step.name) ?? currentLabel ?? FALLBACK_STAGE;
    if (role !== currentLabel) {
      stages.push({
        index: stages.length,
        label: role,
        stepIds: [],
        firstStepId: step.id,
        counts: { steps: 0, returns: 0, parallel: 0, endings: 0 },
      });
      currentLabel = role;
    }
    const stage = stages[stages.length - 1];
    stage.stepIds.push(step.id);
    stage.counts.steps += 1;
    if (step.parentStepId) stage.counts.parallel += 1;
    stageOfStep.set(step.id, stage.index);
  }
  // A correction belongs to its resubmit target's stage for transition math.
  for (const correctionId of correctionInfo.correctionIds) {
    const targetId = correctionInfo.returnTargetOf.get(correctionId);
    const stageIndex = targetId !== undefined ? stageOfStep.get(targetId) : undefined;
    if (stageIndex !== undefined) stageOfStep.set(correctionId, stageIndex);
  }

  // Returns: the same resolver the ↩ badges use, so the counts agree. A
  // correction step's own hop is skipped — the routed ref already charged
  // that return to the step that actually decided it.
  const returnRefs = collectReturnRefs(steps, outcomes);
  for (const ref of returnRefs.values()) {
    if (correctionInfo.correctionIds.has(ref.sourceStepId)) continue;
    const stageIndex = stageOfStep.get(ref.sourceStepId);
    if (stageIndex !== undefined) stages[stageIndex].counts.returns += 1;
  }

  // Endings: terminal decisions and terminal routes, owned by their step's stage.
  const conditionalOutcomeIds = new Set(
    outcomes.filter((outcome) => outcome.applyFilter).map((outcome) => outcome.id)
  );
  const stepOfOutcome = new Map(outcomes.map((outcome) => [outcome.id, outcome.stepId]));
  for (const outcome of outcomes) {
    if (outcome.nextStepId || conditionalOutcomeIds.has(outcome.id)) continue;
    const stageIndex = stageOfStep.get(outcome.stepId);
    if (stageIndex !== undefined) stages[stageIndex].counts.endings += 1;
  }
  for (const route of routes) {
    if (route.nextStepId) continue;
    const stepId = stepOfOutcome.get(route.outcomeId);
    const stageIndex = stepId !== undefined ? stageOfStep.get(stepId) : undefined;
    if (stageIndex !== undefined) stages[stageIndex].counts.endings += 1;
  }

  // Forward transitions that cross a stage boundary, bundled per stage pair.
  const transitionCounts = new Map<string, StageTransition>();
  const addTransition = (sourceStepId: string, targetStepId: string) => {
    const from = stageOfStep.get(sourceStepId);
    const to = stageOfStep.get(targetStepId);
    if (from === undefined || to === undefined || to <= from) return;
    const key = `${from}→${to}`;
    const existing = transitionCounts.get(key);
    if (existing) existing.transitionCount += 1;
    else transitionCounts.set(key, { fromIndex: from, toIndex: to, transitionCount: 1 });
  };
  for (const outcome of outcomes) {
    if (!outcome.nextStepId || conditionalOutcomeIds.has(outcome.id)) continue;
    if (correctionInfo.correctionIds.has(outcome.stepId)) continue;
    addTransition(outcome.stepId, outcome.nextStepId);
  }
  for (const route of routes) {
    if (!route.nextStepId) continue;
    const stepId = stepOfOutcome.get(route.outcomeId);
    if (stepId === undefined || correctionInfo.correctionIds.has(stepId)) continue;
    addTransition(stepId, route.nextStepId);
  }
  // Branch links are flow too: the engine creates the child's task from the
  // parent's, so a fork into another stage is a real stage transition.
  for (const step of ordered) {
    if (!step.parentStepId || correctionInfo.correctionIds.has(step.id)) continue;
    addTransition(step.parentStepId, step.id);
  }

  return { stages, transitions: [...transitionCounts.values()] };
}

// ─── The canvas graph ──────────────────────────────────────────────────────

export const OVERVIEW_STAGE_W = 320;
export const OVERVIEW_STAGE_H = 92;
const CHAIN_GAP = 72;
const MARKER = 48;

export interface OverviewStageData extends Record<string, unknown> {
  stage: StageSpec;
  layoutDir: LayoutDir;
  /** The first few step names, for the tooltip. */
  stepNames: string[];
}

/** Matches the shared BuildFn shape the canvas dispatches on. */
export function buildOverviewGraph(
  steps: CrmStep[],
  outcomes: CrmOutcome[],
  dir: LayoutDir = 'TB',
  routes: CrmRoute[] = []
): { nodes: Node[]; edges: Edge[] } {
  const overview = deriveStageOverview(steps, outcomes, routes);
  const nameOf = new Map(steps.map((step) => [step.id, step.name]));
  const isTB = dir === 'TB';

  const mainPos = (slot: number) => {
    const offset = slot * ((isTB ? OVERVIEW_STAGE_H : OVERVIEW_STAGE_W) + CHAIN_GAP);
    return isTB
      ? { x: 0, y: offset }
      : { x: offset, y: 0 };
  };

  const markerCenter = (isTB ? OVERVIEW_STAGE_W : OVERVIEW_STAGE_H) / 2 - MARKER / 2;
  const nodes: Node[] = [
    {
      id: 'node_start',
      type: 'viewStart',
      position: isTB ? { x: markerCenter, y: -MARKER - CHAIN_GAP } : { x: -MARKER - CHAIN_GAP, y: markerCenter },
      data: { layoutDir: dir },
      draggable: false,
      selectable: false,
    },
    ...overview.stages.map((stage) => ({
      id: `stage_${stage.index}`,
      type: 'overviewStage',
      position: mainPos(stage.index),
      data: {
        stage,
        layoutDir: dir,
        stepNames: stage.stepIds.slice(0, 6).map((id) => nameOf.get(id) ?? ''),
      } as OverviewStageData,
      draggable: true,
      selectable: true,
    })),
    {
      id: 'node_end',
      type: 'viewEnd',
      position: isTB
        ? { x: markerCenter, y: overview.stages.length * (OVERVIEW_STAGE_H + CHAIN_GAP) }
        : { x: overview.stages.length * (OVERVIEW_STAGE_W + CHAIN_GAP), y: markerCenter },
      data: { layoutDir: dir },
      draggable: false,
      selectable: false,
    },
  ];

  const edges: Edge[] = [];
  if (overview.stages.length > 0) {
    edges.push({
      id: 'e_ovr_start',
      source: 'node_start',
      target: 'stage_0',
      sourceHandle: 'out',
      targetHandle: 'in',
      type: 'default',
      style: { stroke: 'var(--success)', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--success)' },
      selectable: false,
    });
    edges.push({
      id: 'e_ovr_end',
      source: `stage_${overview.stages.length - 1}`,
      target: 'node_end',
      sourceHandle: 'out',
      targetHandle: 'in',
      type: 'default',
      style: { stroke: 'var(--error)', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--error)' },
      selectable: false,
    });
  }

  const adjacentPairs = new Set(
    overview.transitions
      .filter((t) => t.toIndex === t.fromIndex + 1)
      .map((t) => t.fromIndex)
  );
  for (let index = 0; index < overview.stages.length - 1; index += 1) {
    if (adjacentPairs.has(index)) continue;
    edges.push({
      id: `e_ovr_seq_${index}`,
      source: `stage_${index}`,
      target: `stage_${index + 1}`,
      sourceHandle: 'out',
      targetHandle: 'in',
      type: 'default',
      // Sequence order, not a claimed transition — dotted, quiet, no arrow.
      style: { stroke: 'var(--border-strong)', strokeWidth: 1.5, strokeDasharray: '2 5', opacity: 0.8 },
      selectable: false,
    });
  }

  for (const transition of overview.transitions) {
    const isAdjacent = transition.toIndex === transition.fromIndex + 1;
    edges.push({
      id: `e_ovr_${transition.fromIndex}_${transition.toIndex}`,
      source: `stage_${transition.fromIndex}`,
      target: `stage_${transition.toIndex}`,
      // Non-adjacent hops leave and arrive by the side, so they arc beside
      // the chain instead of drawing through the chips between them.
      sourceHandle: isAdjacent ? 'out' : 'side-out',
      targetHandle: isAdjacent ? 'in' : 'side-in',
      type: 'default',
      label: transition.transitionCount > 1 ? `${transition.transitionCount} paths` : undefined,
      labelStyle: { fontSize: 10, fontWeight: 600, fill: 'var(--text-secondary)' },
      labelBgStyle: { fill: 'var(--surface-raised)', fillOpacity: 1, rx: 4 },
      style: isAdjacent
        ? { stroke: 'var(--text-secondary)', strokeWidth: 2 }
        : { stroke: 'var(--primary)', strokeWidth: 1.5, strokeDasharray: '5 4' },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: isAdjacent ? 'var(--text-secondary)' : 'var(--primary)',
      },
      selectable: false,
    });
  }

  return { nodes, edges };
}
