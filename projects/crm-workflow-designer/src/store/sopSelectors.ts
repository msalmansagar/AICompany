import type { Node, Edge } from '@xyflow/react';
import type { SopDesignerState } from './sopStore';

export interface SopGatewayNodeData {
  stepId: string;
  decisionLabel: string | null;
  outcomes: Array<{ id: string; name: string; seq: number; nextSopStepId: string | null }>;
  isSelected: boolean;
  hasError: boolean;
}

export interface SopStepNodeData {
  stepId: string;
  name: string;
  description: string;
  sequenceNo: number;
  roleName: string | null;
  roleStatus: number | null;
  isSelected: boolean;
  hasError: boolean;
  stepType: import('@/types/SopTypes').SopStepType;
  executionChannel: import('@/types/SopTypes').SopExecutionChannel | null;
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
const OUTCOME_H      = 72;   // outcome/gateway diamond height
const START_R        = 30;   // half-size of start/end circle (60px diameter)
const END_PAD        = 30;   // gap between last lane bottom and End node centre

// Prefix for gateway nodes that aggregate multiple outcomes of one step.
export const SOP_GATEWAY_PREFIX = '__gw__';

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

      const resolvedStepType = step.stepType ?? 'step';
      nodes.push({
        id: stepId,
        type: 'sopStep',
        position: { x: sx, y: sy },
        draggable: false,
        data: {
          stepId,
          name: step.name,
          description: step.description,
          sequenceNo: step.sequenceNo,
          roleName: step.roleName,
          roleStatus: step.roleStatus,
          isSelected: state.selectedId === stepId,
          hasError: errorNodeIds.has(stepId),
          stepType: resolvedStepType,
          executionChannel: step.executionChannel ?? null,
        } satisfies SopStepNodeData,
      });

      // Outcome nodes for this step
      const outcomeIds = state.outcomeOrder[stepId] ?? [];
      const ox = sx + OUTCOME_X_OFF;
      if (outcomeIds.length === 1) {
        // Single outcome → individual sopOutcome diamond (current behaviour)
        const outcome = state.outcomes[outcomeIds[0]];
        if (outcome) {
          nodes.push({
            id: outcomeIds[0],
            type: 'sopOutcome',
            position: { x: ox, y: sy + OUTCOME_Y_BASE },
            draggable: false,
            data: {
              outcomeId: outcomeIds[0],
              name: outcome.name,
              sequenceNo: outcome.sequenceNo,
              nextSopStepId: outcome.nextSopStepId,
              isSelected: state.selectedId === outcomeIds[0],
              hasError: errorNodeIds.has(outcomeIds[0]),
            } satisfies SopOutcomeNodeData,
          });
        }
      } else if (outcomeIds.length > 1) {
        // Multiple outcomes → ONE gateway diamond centred across all routes
        const gwId = `${SOP_GATEWAY_PREFIX}${stepId}`;
        const totalSpan = (outcomeIds.length - 1) * OUTCOME_Y_STEP;
        const gwY = sy + OUTCOME_Y_BASE + totalSpan / 2 - OUTCOME_H / 2;
        const step = state.steps[stepId];
        nodes.push({
          id: gwId,
          type: 'sopGateway',
          position: { x: ox, y: gwY },
          draggable: false,
          data: {
            stepId,
            decisionLabel: step?.decisionLabel ?? null,
            outcomes: outcomeIds.map((oid) => {
              const o = state.outcomes[oid];
              return { id: oid, name: o?.name ?? '', seq: o?.sequenceNo ?? 0, nextSopStepId: o?.nextSopStepId ?? null };
            }),
            isSelected: state.selectedId === stepId || state.selectedId === gwId,
            hasError: outcomeIds.some((oid) => errorNodeIds.has(oid)),
          } satisfies SopGatewayNodeData,
        });
      }
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

  // ── Step → Outcome/Gateway (structural) ───────────────────────────────────
  for (const [stepId, outcomeIds] of Object.entries(state.outcomeOrder)) {
    if (outcomeIds.length === 1) {
      // Single outcome: step → individual outcome diamond
      edges.push({
        id: `se-${stepId}-${outcomeIds[0]}`,
        source: stepId,
        target: outcomeIds[0],
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#94a3b8', strokeWidth: 1.5 },
        markerEnd: { type: 'arrowclosed' as const, color: '#94a3b8' },
      });
    } else if (outcomeIds.length > 1) {
      // Multiple outcomes: step → single gateway diamond
      edges.push({
        id: `sg-${stepId}`,
        source: stepId,
        target: `${SOP_GATEWAY_PREFIX}${stepId}`,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#94a3b8', strokeWidth: 1.5 },
        markerEnd: { type: 'arrowclosed' as const, color: '#94a3b8' },
      });
    }
  }

  // ── Outcome/Gateway → Next Step or End ────────────────────────────────────
  for (const outcome of Object.values(state.outcomes)) {
    const siblingCount = (state.outcomeOrder[outcome.sopStepId] ?? []).length;
    const isBranching = siblingCount > 1;

    // Source: gateway node for multi-outcome steps, outcome node for single
    const sourceId = isBranching ? `${SOP_GATEWAY_PREFIX}${outcome.sopStepId}` : outcome.id;

    if (outcome.nextSopStepId) {
      edges.push({
        id: `oe-${outcome.id}-${outcome.nextSopStepId}`,
        source: sourceId,
        target: outcome.nextSopStepId,
        type: 'smoothstep',
        animated: true,
        style: { strokeDasharray: '5,5', stroke: '#2563eb', strokeWidth: 1.5 },
        markerEnd: { type: 'arrowclosed' as const, color: '#2563eb' },
        // Labels only on gateway branches (where multiple routes exist)
        ...(isBranching && outcome.name ? {
          label: outcome.name,
          labelStyle: { fontSize: 9, fontWeight: 600, fill: '#1e40af' },
          labelBgStyle: { fill: '#eff6ff', fillOpacity: 1 },
          labelBgPadding: [5, 3] as [number, number],
          labelBgBorderRadius: 3,
          labelShowBg: true,
        } : {}),
      });
    } else {
      // Terminal → End
      edges.push({
        id: `te-${outcome.id}`,
        source: sourceId,
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
