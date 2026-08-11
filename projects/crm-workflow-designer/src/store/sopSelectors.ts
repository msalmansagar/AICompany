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

/** Shared read-model passed to the node builders. */
interface SopBuildContext {
  state: SopDesignerState;
  errorNodeIds: Set<string>;
}

/** Role lanes in first-occurrence order, with their steps sorted by sequenceNo. */
interface RoleGroups {
  roleOrder: string[];
  roleNames: Record<string, string>;
  roleSteps: Record<string, string[]>;
}

/**
 * Node IDs with at least one validation error. A result can target a single
 * node (affectedNodeId) or many (affectedNodeIds).
 */
function collectErrorNodeIds(state: SopDesignerState): Set<string> {
  const errorNodeIds = new Set<string>();
  for (const result of state.validationResults) {
    if (result.affectedNodeId) errorNodeIds.add(result.affectedNodeId);
    for (const id of result.affectedNodeIds ?? []) errorNodeIds.add(id);
  }
  return errorNodeIds;
}

/** Groups steps into role lanes preserving first-occurrence order. */
function groupStepsByRole(state: SopDesignerState): RoleGroups {
  const roleOrder: string[] = [];
  const roleNames: Record<string, string> = {};
  const roleSteps: Record<string, string[]> = {};

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

  for (const key of roleOrder) {
    roleSteps[key].sort((a, b) => (state.steps[a]?.sequenceNo ?? 0) - (state.steps[b]?.sequenceNo ?? 0));
  }
  return { roleOrder, roleNames, roleSteps };
}

/** Canvas width is driven by the widest lane. */
function computeCanvasWidth(groups: RoleGroups): number {
  const maxStepsInLane = Math.max(...groups.roleOrder.map((k) => groups.roleSteps[k].length), 1);
  return STEP_X_FIRST + maxStepsInLane * STEP_SPACING + OUTCOME_X_OFF + 120;
}

function buildStepNode(stepId: string, position: { x: number; y: number }, ctx: SopBuildContext): Node {
  const step = ctx.state.steps[stepId];
  return {
    id: stepId,
    type: 'sopStep',
    position,
    draggable: false,
    data: {
      stepId,
      name: step.name,
      description: step.description,
      sequenceNo: step.sequenceNo,
      roleName: step.roleName,
      roleStatus: step.roleStatus,
      isSelected: ctx.state.selectedId === stepId,
      hasError: ctx.errorNodeIds.has(stepId),
      stepType: step.stepType ?? 'step',
      executionChannel: step.executionChannel ?? null,
    } satisfies SopStepNodeData,
  };
}

function buildSingleOutcomeNode(outcomeId: string, position: { x: number; y: number }, ctx: SopBuildContext): Node {
  const outcome = ctx.state.outcomes[outcomeId];
  return {
    id: outcomeId,
    type: 'sopOutcome',
    position,
    draggable: false,
    data: {
      outcomeId,
      name: outcome.name,
      sequenceNo: outcome.sequenceNo,
      nextSopStepId: outcome.nextSopStepId,
      isSelected: ctx.state.selectedId === outcomeId,
      hasError: ctx.errorNodeIds.has(outcomeId),
    } satisfies SopOutcomeNodeData,
  };
}

/** One gateway diamond aggregating all outcomes of a branching step. */
function buildGatewayNode(args: { stepId: string; outcomeIds: string[]; ox: number; sy: number }, ctx: SopBuildContext): Node {
  const { stepId, outcomeIds, ox, sy } = args;
  const gwId = `${SOP_GATEWAY_PREFIX}${stepId}`;
  const totalSpan = (outcomeIds.length - 1) * OUTCOME_Y_STEP;
  const gwY = sy + OUTCOME_Y_BASE + totalSpan / 2 - OUTCOME_H / 2;
  const step = ctx.state.steps[stepId];
  return {
    id: gwId,
    type: 'sopGateway',
    position: { x: ox, y: gwY },
    draggable: false,
    data: {
      stepId,
      decisionLabel: step?.decisionLabel ?? null,
      outcomes: outcomeIds.map((oid) => {
        const outcome = ctx.state.outcomes[oid];
        return { id: oid, name: outcome?.name ?? '', seq: outcome?.sequenceNo ?? 0, nextSopStepId: outcome?.nextSopStepId ?? null };
      }),
      isSelected: ctx.state.selectedId === stepId || ctx.state.selectedId === gwId,
      hasError: outcomeIds.some((oid) => ctx.errorNodeIds.has(oid)),
    } satisfies SopGatewayNodeData,
  };
}

/** Outcome/gateway node(s) to the right of a step: single diamond, one gateway, or none. */
function buildOutcomeNodes(args: { stepId: string; ox: number; sy: number }, ctx: SopBuildContext): Node[] {
  const outcomeIds = ctx.state.outcomeOrder[args.stepId] ?? [];
  if (outcomeIds.length === 1 && ctx.state.outcomes[outcomeIds[0]]) {
    return [buildSingleOutcomeNode(outcomeIds[0], { x: args.ox, y: args.sy + OUTCOME_Y_BASE }, ctx)];
  }
  if (outcomeIds.length > 1) {
    return [buildGatewayNode({ stepId: args.stepId, outcomeIds, ox: args.ox, sy: args.sy }, ctx)];
  }
  return [];
}

/** A step node plus its outcome/gateway nodes. */
function buildStepColumn(args: { stepId: string; index: number; laneY: number }, ctx: SopBuildContext): Node[] {
  const sx = STEP_X_FIRST + args.index * STEP_SPACING;
  const sy = args.laneY + LANE_HEIGHT / 2 - STEP_NODE_H / 2;
  return [
    buildStepNode(args.stepId, { x: sx, y: sy }, ctx),
    ...buildOutcomeNodes({ stepId: args.stepId, ox: sx + OUTCOME_X_OFF, sy }, ctx),
  ];
}

/** Swimlane background node plus every step column within it. */
function buildLane(args: { index: number; groups: RoleGroups; canvasWidth: number }, ctx: SopBuildContext): Node[] {
  const { index, groups, canvasWidth } = args;
  const key = groups.roleOrder[index];
  const laneY = CANVAS_TOP + index * LANE_HEIGHT;
  const lane: Node = {
    id: SYNTHETIC_IDS.lane(key),
    type: 'sopSwimlane',
    position: { x: 0, y: laneY },
    data: { roleName: groups.roleNames[key], laneWidth: canvasWidth, laneHeight: LANE_HEIGHT, isFirst: index === 0, isLast: index === groups.roleOrder.length - 1 },
    selectable: false,
    draggable: false,
    zIndex: -1,
  };
  const columns = groups.roleSteps[key]
    .filter((stepId) => ctx.state.steps[stepId])
    .flatMap((stepId, columnIndex) => buildStepColumn({ stepId, index: columnIndex, laneY }, ctx));
  return [lane, ...columns];
}

function buildTerminalNode(id: string, y: number): Node {
  const startCentreX = STEP_X_FIRST + 90;  // approximate centre of first step column
  return {
    id,
    type: id === SYNTHETIC_IDS.start ? 'sopStart' : 'sopEnd',
    position: { x: startCentreX - START_R, y },
    data: {},
    selectable: false,
    draggable: false,
    zIndex: 1,
  };
}

/** Derives ReactFlow Node[] from sopStore using a swimlane layout. Pure — no side effects. */
export function selectSopNodes(state: SopDesignerState): Node[] {
  const ctx: SopBuildContext = { state, errorNodeIds: collectErrorNodeIds(state) };
  const groups = groupStepsByRole(state);
  const canvasWidth = computeCanvasWidth(groups);

  const laneNodes = groups.roleOrder.flatMap((_, index) => buildLane({ index, groups, canvasWidth }, ctx));
  const startY = CANVAS_TOP - START_R * 2 - 20;
  const endY = CANVAS_TOP + groups.roleOrder.length * LANE_HEIGHT + END_PAD;

  return [
    ...laneNodes,
    buildTerminalNode(SYNTHETIC_IDS.start, startY),
    buildTerminalNode(SYNTHETIC_IDS.end, endY),
  ];
}

function buildStartEdge(state: SopDesignerState): Edge | null {
  const firstStepId = [...state.stepOrder].sort(
    (a, b) => (state.steps[a]?.sequenceNo ?? 0) - (state.steps[b]?.sequenceNo ?? 0)
  )[0];
  if (!firstStepId) return null;
  return {
    id: '__edge_start__',
    source: SYNTHETIC_IDS.start,
    target: firstStepId,
    type: 'smoothstep',
    style: { stroke: 'var(--accent-route)', strokeWidth: 2 },
    markerEnd: { type: 'arrowclosed' as const, color: 'var(--accent-route)' },
  };
}

/** Structural edge from a step to its single outcome diamond or its gateway. */
function buildStepToOutcomeEdge(stepId: string, outcomeIds: string[]): Edge | null {
  if (outcomeIds.length === 0) return null;
  const isBranching = outcomeIds.length > 1;
  const target = isBranching ? `${SOP_GATEWAY_PREFIX}${stepId}` : outcomeIds[0];
  return {
    id: isBranching ? `sg-${stepId}` : `se-${stepId}-${outcomeIds[0]}`,
    source: stepId,
    target,
    type: 'smoothstep',
    animated: false,
    style: { stroke: 'var(--text-disabled)', strokeWidth: 1.5 },
    markerEnd: { type: 'arrowclosed' as const, color: 'var(--text-disabled)' },
  };
}

/** Edge from an outcome (or its gateway) to the next step, or to the End node. */
function buildOutcomeTargetEdge(outcome: SopDesignerState['outcomes'][string], state: SopDesignerState): Edge {
  const isBranching = (state.outcomeOrder[outcome.sopStepId] ?? []).length > 1;
  const source = isBranching ? `${SOP_GATEWAY_PREFIX}${outcome.sopStepId}` : outcome.id;

  if (!outcome.nextSopStepId) {
    return {
      id: `te-${outcome.id}`,
      source,
      target: SYNTHETIC_IDS.end,
      type: 'smoothstep',
      animated: false,
      style: { stroke: 'var(--text-disabled)', strokeWidth: 1.2, strokeDasharray: '4,4' },
      markerEnd: { type: 'arrowclosed' as const, color: 'var(--text-disabled)' },
    };
  }
  return {
    id: `oe-${outcome.id}-${outcome.nextSopStepId}`,
    source,
    target: outcome.nextSopStepId,
    type: 'smoothstep',
    animated: true,
    style: { strokeDasharray: '5,5', stroke: 'var(--primary)', strokeWidth: 1.5 },
    markerEnd: { type: 'arrowclosed' as const, color: 'var(--primary)' },
    // Labels only on gateway branches (where multiple routes exist)
    ...(isBranching && outcome.name ? {
      label: outcome.name,
      labelStyle: { fontSize: 9, fontWeight: 600, fill: 'var(--primary-pressed)' },
      labelBgStyle: { fill: 'var(--primary)', fillOpacity: 1 },
      labelBgPadding: [5, 3] as [number, number],
      labelBgBorderRadius: 3,
      labelShowBg: true,
    } : {}),
  };
}

/** Derives ReactFlow Edge[] from sopStore. Pure — no side effects. */
export function selectSopEdges(state: SopDesignerState): Edge[] {
  const startEdge = buildStartEdge(state);
  const structuralEdges = Object.entries(state.outcomeOrder)
    .map(([stepId, outcomeIds]) => buildStepToOutcomeEdge(stepId, outcomeIds))
    .filter((edge): edge is Edge => edge !== null);
  const targetEdges = Object.values(state.outcomes).map((outcome) => buildOutcomeTargetEdge(outcome, state));

  return [...(startEdge ? [startEdge] : []), ...structuralEdges, ...targetEdges];
}
