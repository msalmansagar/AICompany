import type { Node, Edge } from '@xyflow/react';
import type { SopDesignerState } from './sopStore';

export interface SopStepNodeData {
  stepId: string;
  name: string;
  sequenceNo: number;
  roleName: string | null;
  roleStatus: number | null;
  isSelected: boolean;
  hasError: boolean;
}

export interface SopOutcomeNodeData {
  outcomeId: string;
  name: string;
  sequenceNo: number;
  nextSopStepId: string | null;
  isSelected: boolean;
  hasError: boolean;
}

// ── Layout constants ──────────────────────────────────────────────────────────
const LANE_HEADER_W  = 160;  // width of role label column
const LANE_HEIGHT    = 240;  // fixed height per role lane
const CANVAS_TOP     = 90;   // y where first lane starts (Start node sits above)
const STEP_X_FIRST   = LANE_HEADER_W + 70;   // x of first step in any lane
const STEP_SPACING   = 460;                   // x distance between step left edges
const STEP_NODE_W    = 240;                   // step node maxWidth
const STEP_NODE_H    = 76;                    // approximate step node height
const OUTCOME_X_OFF  = STEP_NODE_W + 50;      // 50 px clear gap after step right edge
const OUTCOME_Y_BASE = 10;   // y of first outcome relative to step.y
const OUTCOME_Y_STEP = 52;   // y between consecutive outcomes
const START_R        = 30;   // half-size of start/end circle (60px diameter)
const END_PAD        = 30;   // gap between last lane bottom and End node centre

const SYNTHETIC_IDS = {
  start: '__sop_start__',
  end:   '__sop_end__',
  lane:  (key: string) => `__sop_lane__${key}`,
};

export const SOP_SYNTHETIC_PREFIX = '__sop_';

/** Derives ReactFlow Node[] from sopStore using a swimlane layout. Pure — no side effects. */
export function selectSopNodes(state: SopDesignerState): Node[] {
  const nodes: Node[] = [];

  // Build a set of node IDs that have at least one validation error.
  // Results can target a single node (affectedNodeId) or many (affectedNodeIds).
  const errorNodeIds = new Set<string>();
  for (const r of state.validationResults) {
    if (r.affectedNodeId) errorNodeIds.add(r.affectedNodeId);
    for (const id of (r.affectedNodeIds ?? [])) errorNodeIds.add(id);
  }

  // ── 1. Build role groups preserving first-occurrence order ─────────────────
  const roleOrder: string[] = [];
  const roleNames: Record<string, string> = {};
  const roleSteps: Record<string, string[]> = {};  // roleKey → stepIds (ordered by sequenceNo)

  for (const stepId of state.stepOrder) {
    const step = state.steps[stepId];
    if (!step) continue;
    const key = step.roleId ?? '__no_role__';
    if (!roleSteps[key]) {
      roleOrder.push(key);
      roleNames[key] = step.roleName ?? 'No Role';
      roleSteps[key] = [];
    }
    roleSteps[key].push(stepId);
  }

  // Sort steps within each lane by sequenceNo
  for (const key of roleOrder) {
    roleSteps[key].sort(
      (a, b) => (state.steps[a]?.sequenceNo ?? 0) - (state.steps[b]?.sequenceNo ?? 0)
    );
  }

  // ── 2. Compute canvas width (widest lane drives it) ────────────────────────
  const maxStepsInLane = Math.max(
    ...roleOrder.map((k) => roleSteps[k].length),
    1
  );
  const canvasWidth = STEP_X_FIRST + maxStepsInLane * STEP_SPACING + OUTCOME_X_OFF + 120;

  // ── 3. Lay out lanes, steps, and outcomes ─────────────────────────────────
  const stepPositions: Record<string, { x: number; y: number }> = {};
  let laneY = CANVAS_TOP;

  for (let li = 0; li < roleOrder.length; li++) {
    const key = roleOrder[li];
    const stepIds = roleSteps[key];

    // Swimlane background node (rendered first = lowest z-order)
    nodes.push({
      id: SYNTHETIC_IDS.lane(key),
      type: 'sopSwimlane',
      position: { x: 0, y: laneY },
      data: {
        roleName: roleNames[key],
        laneWidth: canvasWidth,
        laneHeight: LANE_HEIGHT,
        isFirst: li === 0,
        isLast: li === roleOrder.length - 1,
      },
      selectable: false,
      draggable: false,
      zIndex: -1,
    });

    // Step nodes
    stepIds.forEach((stepId, idx) => {
      const step = state.steps[stepId];
      if (!step) return;
      const sx = STEP_X_FIRST + idx * STEP_SPACING;
      const sy = laneY + LANE_HEIGHT / 2 - STEP_NODE_H / 2;
      stepPositions[stepId] = { x: sx, y: sy };

      nodes.push({
        id: stepId,
        type: 'sopStep',
        position: { x: sx, y: sy },
        draggable: false,
        data: {
          stepId,
          name: step.name,
          sequenceNo: step.sequenceNo,
          roleName: step.roleName,
          roleStatus: step.roleStatus,
          isSelected: state.selectedId === stepId,
          hasError: errorNodeIds.has(stepId),
        } satisfies SopStepNodeData,
      });

      // Outcome nodes for this step
      const outcomeIds = state.outcomeOrder[stepId] ?? [];
      outcomeIds.forEach((outcomeId, oidx) => {
        const outcome = state.outcomes[outcomeId];
        if (!outcome) return;
        const ox = sx + OUTCOME_X_OFF;
        const oy = sy + OUTCOME_Y_BASE + oidx * OUTCOME_Y_STEP;
        nodes.push({
          id: outcomeId,
          type: 'sopOutcome',
          position: { x: ox, y: oy },
          draggable: false,
          data: {
            outcomeId,
            name: outcome.name,
            sequenceNo: outcome.sequenceNo,
            nextSopStepId: outcome.nextSopStepId,
            isSelected: state.selectedId === outcomeId,
            hasError: errorNodeIds.has(outcomeId),
          } satisfies SopOutcomeNodeData,
        });
      });
    });

    laneY += LANE_HEIGHT;
  }

  const totalY = laneY; // y below last lane

  // ── 4. Start node — centred above the first step column ───────────────────
  const startCentreX = STEP_X_FIRST + 90;  // approximate centre of first step
  nodes.push({
    id: SYNTHETIC_IDS.start,
    type: 'sopStart',
    position: { x: startCentreX - START_R, y: CANVAS_TOP - START_R * 2 - 20 },
    data: {},
    selectable: false,
    draggable: false,
    zIndex: 1,
  });

  // ── 5. End node — centred below last lane ─────────────────────────────────
  nodes.push({
    id: SYNTHETIC_IDS.end,
    type: 'sopEnd',
    position: { x: startCentreX - START_R, y: totalY + END_PAD },
    data: {},
    selectable: false,
    draggable: false,
    zIndex: 1,
  });

  return nodes;
}

/** Derives ReactFlow Edge[] from sopStore. Pure — no side effects. */
export function selectSopEdges(state: SopDesignerState): Edge[] {
  const edges: Edge[] = [];

  // ── Start → first step (lowest sequenceNo globally) ───────────────────────
  const firstStepId = [...state.stepOrder].sort(
    (a, b) => (state.steps[a]?.sequenceNo ?? 0) - (state.steps[b]?.sequenceNo ?? 0)
  )[0];
  if (firstStepId) {
    edges.push({
      id: '__edge_start__',
      source: SYNTHETIC_IDS.start,
      target: firstStepId,
      type: 'smoothstep',
      style: { stroke: '#0f766e', strokeWidth: 2 },
      markerEnd: { type: 'arrowclosed' as const, color: '#0f766e' },
    });
  }

  // ── Step → Outcome edges (structural) ─────────────────────────────────────
  for (const [stepId, outcomeIds] of Object.entries(state.outcomeOrder)) {
    for (const outcomeId of outcomeIds) {
      edges.push({
        id: `se-${stepId}-${outcomeId}`,
        source: stepId,
        target: outcomeId,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#94a3b8', strokeWidth: 1.5 },
        markerEnd: { type: 'arrowclosed' as const, color: '#94a3b8' },
      });
    }
  }

  // ── Outcome → Next Step or End ─────────────────────────────────────────────
  for (const outcome of Object.values(state.outcomes)) {
    if (outcome.nextSopStepId) {
      edges.push({
        id: `oe-${outcome.id}-${outcome.nextSopStepId}`,
        source: outcome.id,
        target: outcome.nextSopStepId,
        type: 'smoothstep',
        animated: true,
        style: { strokeDasharray: '5,5', stroke: '#2563eb', strokeWidth: 1.5 },
        markerEnd: { type: 'arrowclosed' as const, color: '#2563eb' },
      });
    } else {
      // Terminal outcome → End
      edges.push({
        id: `te-${outcome.id}`,
        source: outcome.id,
        target: SYNTHETIC_IDS.end,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#94a3b8', strokeWidth: 1.2, strokeDasharray: '4,4' },
        markerEnd: { type: 'arrowclosed' as const, color: '#94a3b8' },
      });
    }
  }

  return edges;
}
