import dagre from '@dagrejs/dagre';
import { routeLabelPair } from '../styles/surfacePairs';
import { BRANCH_EDGE_LABEL } from '@/styles/surfacePairs';
import { hasRealCondition } from '@/services/routeFilter';
import {
  classifyCorrectionSteps,
  placeCorrectionSteps,
  nudgeClearOfObstacles,
  CORRECTION_PILL_H,
  CORRECTION_PILL_W,
} from '@/services/correctionSteps';
import { MarkerType } from '@xyflow/react';
import { routeCanvasLabel } from './routeDisplay';
import type { Node, Edge } from '@xyflow/react';
import type { CrmStep, CrmOutcome, CrmRoute } from '../types/ViewTypes';

export type LayoutDir = 'TB' | 'LR';

export const STEP_W = 280;
export const MARKER_SIZE = 48;

const STEP_BASE_H = 90;
const OUTCOME_ROW_H = 22;
const DIVIDER_H = 12;

// Kept for ViewDecisionNode back-compat (not used in graph output).
export interface ViewOutcomeData extends Record<string, unknown> {
  outcome: CrmOutcome;
  hasNoNextStep: boolean;
  isBackEdge: boolean;
}

export interface StepOutcomeRow {
  id: string;
  name: string;
  nextStepId: string | null;
  nextStepName: string | null;
  applyFilter: boolean;
  isBackEdge: boolean;
  isTerminal: boolean;
}

export interface ViewStepData extends Record<string, unknown> {
  step: CrmStep;
  outcomeRows: StepOutcomeRow[];
  nodeHeight: number;
  layoutDir: LayoutDir;
  /** True when the step is a pure correction loop, drawn as a compact pill. */
  isCorrection?: boolean;
  /** Where the correction resubmits to, for the pill's caption. */
  returnTargetName?: string | null;
}

export function computeStepHeight(outcomeCount: number): number {
  if (outcomeCount === 0) return STEP_BASE_H;
  return STEP_BASE_H + DIVIDER_H + outcomeCount * OUTCOME_ROW_H + 8;
}

const START_NODE_ID = 'node_start';
const END_NODE_ID = 'node_end';

export const GATEWAY_SIZE = 52; // diamond bounding box

const OPERATOR_LABELS: Record<string, string> = {
  eq: '=', ne: '≠', lt: '<', le: '≤', gt: '>', ge: '≥',
  like: 'like', 'not-like': '!like', null: 'is null', 'not-null': '!null',
};

export function conditionLabel(filter: string): string {
  if (!hasRealCondition(filter)) return 'else';
  try {
    const doc = new DOMParser().parseFromString(filter, 'text/xml');
    const conds = Array.from(doc.querySelectorAll('condition'));
    if (!conds.length) return 'FetchXML';
    return conds.map((c) => {
      const attr = c.getAttribute('attribute') ?? '';
      const op = OPERATOR_LABELS[c.getAttribute('operator') ?? ''] ?? c.getAttribute('operator') ?? '';
      const val = c.getAttribute('value') ?? '';
      return val ? `${attr} ${op} ${val}` : `${attr} ${op}`;
    }).join(', ');
  } catch { return 'FetchXML'; }
}

export function buildGraph(
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

  const outcomesByStep = new Map<string, CrmOutcome[]>();
  for (const step of steps) outcomesByStep.set(step.id, []);
  for (const o of outcomes) outcomesByStep.get(o.stepId)?.push(o);
  for (const list of outcomesByStep.values()) {
    list.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  }

  // Entry step: not targeted by any forward outcome.
  const forwardTargetStepIds = new Set(
    outcomes
      .filter((o) => o.nextStepId && !backEdgeOutcomeIds.has(o.id))
      .map((o) => o.nextStepId!)
  );
  const entrySteps = steps.filter((s) => !forwardTargetStepIds.has(s.id));
  const firstSteps =
    entrySteps.length > 0
      ? [entrySteps.reduce((min, s) => (s.sequenceNo < min.sequenceNo ? s : min))]
      : [...steps].sort((a, b) => a.sequenceNo - b.sequenceNo).slice(0, 1);

  // Pure correction loops leave the spine: unranked, they pile up at the top
  // of the diagram (Dagre puts every edgeless node at rank 0), so the process
  // opened on its corrections instead of its entry step. They are attached
  // beside their resubmit target after layout instead.
  const correctionInfo = classifyCorrectionSteps(
    steps.map((s) => ({ id: s.id, sequenceNo: s.sequenceNo })),
    outcomes.map((o) => ({
      stepId: o.stepId,
      nextStepId: o.nextStepId,
      sequenceNumber: o.sequenceNumber,
      isConditional: o.applyFilter,
    })),
    firstSteps[0]?.id ?? null
  );
  // A correction whose target is itself a correction has nowhere to attach —
  // keep it on the spine rather than let it land at the origin.
  const correctionIds = new Set(
    [...correctionInfo.correctionIds].filter(
      (id) => !correctionInfo.correctionIds.has(correctionInfo.returnTargetOf.get(id) ?? '')
    )
  );

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

    const isCorrection = correctionIds.has(step.id);
    const returnTargetId = correctionInfo.returnTargetOf.get(step.id);
    return {
      id: `step_${step.id}`,
      type: 'viewStep',
      position: { x: 0, y: 0 },
      data: {
        step,
        outcomeRows,
        nodeHeight: isCorrection ? CORRECTION_PILL_H : computeStepHeight(stepOutcomes.length),
        layoutDir: dir,
        isCorrection,
        returnTargetName: returnTargetId ? (stepById.get(returnTargetId)?.name ?? null) : null,
      } as ViewStepData,
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

  // Build route lookup: outcomeId → routes[]
  const routesByOutcome = new Map<string, CrmRoute[]>();
  for (const r of routes) {
    if (!routesByOutcome.has(r.outcomeId)) routesByOutcome.set(r.outcomeId, []);
    routesByOutcome.get(r.outcomeId)!.push(r);
  }
  for (const list of routesByOutcome.values()) {
    list.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  }

  // Gateway nodes — one per conditional outcome that has routes
  const gatewayNodes: Node[] = [];
  for (const o of outcomes) {
    if (!o.applyFilter) continue;
    const outcomeRoutes = routesByOutcome.get(o.id) ?? [];
    if (outcomeRoutes.length === 0) continue;
    gatewayNodes.push({
      id: `gw_${o.id}`,
      type: 'routeGateway',
      position: { x: 0, y: 0 },
      data: {
        outcomeName: o.name,
        outcomeId: o.id,
        routeCount: outcomeRoutes.length,
        isSelected: false,
      },
      draggable: true,
      selectable: true,
    });
  }

  const spineStepNodes = stepNodes.filter((n) => !(n.data as ViewStepData).isCorrection);
  const correctionNodes = stepNodes.filter((n) => (n.data as ViewStepData).isCorrection);

  const nodes: Node[] = [startNode, ...spineStepNodes, ...gatewayNodes, endNode];

  const startEdges: Edge[] = firstSteps.map((s) => ({
    id: `e_start_${s.id}`,
    source: START_NODE_ID,
    target: `step_${s.id}`,
    sourceHandle: 'out',
    targetHandle: 'in',
    type: 'default',
    style: { stroke: 'var(--success)', strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--success)' },
    selectable: false,
  }));

  const forwardEdges: Edge[] = [];
  const seenForwardPairs = new Set<string>();

  for (const o of outcomes) {
    if (backEdgeOutcomeIds.has(o.id)) continue;

    const outcomeRoutes = routesByOutcome.get(o.id) ?? [];
    const hasGateway = o.applyFilter && outcomeRoutes.length > 0;

    if (hasGateway) {
      // Step → gateway (entry edge). No label — the outcome name is already
      // shown in the step card's outcome pill and on the gateway node itself.
      const entryKey = `${o.stepId}→gw_${o.id}`;
      if (!seenForwardPairs.has(entryKey)) {
        seenForwardPairs.add(entryKey);
        forwardEdges.push({
          id: `e_entry_${o.id}`,
          source: `step_${o.stepId}`,
          target: `gw_${o.id}`,
          // The gateway sits beside the card in TB — connect side to side, or
          // the edge loops out of the bottom and doubles back up.
          // TB exits the card's side; LR's main 'out' is already the right edge.
          sourceHandle: dir === 'TB' ? 'side-out' : 'out',
          targetHandle: 'in-side',
          type: 'default',
          style: { stroke: 'var(--warning)', strokeWidth: 1.5, strokeDasharray: '5 3' },
          markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--warning)' },
          selectable: false,
        });
      }

      // Gateway → each route destination
      for (const route of outcomeRoutes) {
        const targetId = route.nextStepId ? `step_${route.nextStepId}` : `end_stub_gw_${o.id}`;
        const isFallback = route.isDefault;
        const stroke = isFallback ? 'var(--success)' : 'var(--warning)';
        // Name first, "Default" for the fallback — the full condition lives
        // in the Decision and Route panels (CWFD-019 PR2).
        const edgeLabel = routeCanvasLabel(route);

        forwardEdges.push({
          id: `e_route_${route.id}`,
          source: `gw_${o.id}`,
          target: targetId,
          sourceHandle: 'out-side',
          targetHandle: 'in',
          type: 'default',
          animated: !isFallback,
          data: { isFallback },
          label: edgeLabel,
          // Text and fill were the SAME colour — a solid orange bar with
          // invisible writing. The registered route-label pairs sit the text
          // on the neutral raised ground the contrast guard checks.
          labelStyle: {
            fontSize: 10,
            fontWeight: 600,
            fill: routeLabelPair(isFallback ? 'fallback' : 'conditional').foreground,
          },
          labelBgStyle: {
            fill: routeLabelPair(isFallback ? 'fallback' : 'conditional').background,
            fillOpacity: 1,
            rx: 4,
          },
          style: {
            stroke,
            strokeWidth: 1.5,
            strokeDasharray: isFallback ? '4 4' : undefined,
          },
          markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
          selectable: true,
        });
      }
    } else if (o.nextStepId) {
      // Plain non-conditional forward edge (deduplicated by step pair)
      const key = `${o.stepId}→${o.nextStepId}`;
      if (!seenForwardPairs.has(key)) {
        seenForwardPairs.add(key);
        forwardEdges.push({
          id: `e_fwd_${o.stepId}_${o.nextStepId}`,
          source: `step_${o.stepId}`,
          target: `step_${o.nextStepId}`,
          sourceHandle: 'out',
          targetHandle: 'in',
          type: 'default',
          style: { stroke: 'var(--text-secondary)', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--text-secondary)' },
          selectable: false,
        });
      }
    }
  }

  // Terminal edges: steps with terminal outcomes → END
  const terminalStepIds = new Set<string>();
  for (const o of outcomes) {
    if (o.applyFilter) {
      // For conditional outcomes, terminal routes go gateway → END (already added above).
      // The step itself still needs a Dagre rank connection if ALL routes are terminal.
      continue;
    }
    if (!o.nextStepId) terminalStepIds.add(o.stepId);
  }
  // Also collect steps whose gateway routes are all terminal (nextStepId=null)
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

  // Only the main path runs to the global END. Every other terminating step
  // ends at a LOCAL stub beside its own card (added after layout) — visible
  // endings without canvas-length sweeps.
  const endEdges: Edge[] = lastTerminalStepId
    ? [{
        id: `e_end_${lastTerminalStepId}`,
        source: `step_${lastTerminalStepId}`,
        target: END_NODE_ID,
        sourceHandle: 'out',
        targetHandle: 'in',
        type: 'default',
        style: { stroke: 'var(--error)', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--error)' },
        selectable: false,
      } as Edge]
    : [];

  // A branch step has no outcome pointing at it - the engine creates its task from
  // the parent's. Without a synthesised edge it has nothing tying it to the parent,
  // so the layout places it with no regard for where the parent sits and the two
  // collide. The edit canvas already does this; the view canvas did not, which is
  // why parallel tasks overlapped here and not there.
  const branchEdges: Edge[] = steps
    .filter((step) => step.parentStepId && stepById.has(step.parentStepId))
    .map((step) => buildViewBranchEdge(step));

  const layoutEdges = [...startEdges, ...forwardEdges, ...endEdges, ...branchEdges];

  // A spine step whose only links ran through a collapsed pill — or nowhere,
  // like the Loan spec's genuinely orphaned steps — has no rank edges left,
  // and Dagre floats every such node above the entry step. Anchor each one
  // under its nearest lower-sequence connected spine step with an invisible
  // rank-only edge: the diagram then reads in business order even where the
  // configuration is incomplete. These edges are never rendered.
  const anchorEdges = buildAnchorEdges(
    spineStepNodes.map((n) => (n.data as ViewStepData).step),
    layoutEdges,
    new Set(nodes.map((n) => n.id)),
    firstSteps[0]?.id ?? null,
    START_NODE_ID
  );

  let positionedNodes = applyDagreLayout(nodes, [...layoutEdges, ...anchorEdges], dir);

  // Move route-destination step nodes to the RIGHT of their gateway so routes
  // branch horizontally instead of stacking in the center column. This must
  // run in BOTH directions: in LR, Dagre puts the destinations in one rank and
  // the centre-line pass then forces every step to the same y — CEO and
  // Chairman rendered exactly on top of each other until this branched them.
  if (routes.length > 0) {
    positionedNodes = branchRouteDestinations(positionedNodes, routes, outcomes, STEP_W);
  }

  positionedNodes = resolveCardCollisions(positionedNodes, dir);

  const withStubs = addLocalEndStubs(
    positionedNodes,
    layoutEdges,
    terminalStepIds,
    lastTerminalStepId,
    dir
  );

  return attachCorrectionLoops(withStubs, correctionNodes, correctionInfo.returnTargetOf, outcomes, dir);
}

/**
 * Rank-only anchors for steps nothing routes into (CWFD-009 P1).
 *
 * A spine step with no incoming layout edge — the Loan spec's orphans, or a
 * step whose only links ran through a collapsed pill — floats to rank 0 and
 * the diagram opens above its own entry step. Each such step is anchored
 * under its nearest lower-sequence connected step with an invisible edge, so
 * the canvas reads in business order even where the configuration is
 * incomplete. These edges feed Dagre only and are never rendered.
 */
export function buildAnchorEdges(
  spineSteps: Array<{ id: string; sequenceNo: number }>,
  layoutEdges: Edge[],
  dagreNodeIds: Set<string>,
  entryId: string | null,
  startNodeId: string
): Edge[] {
  const touchedByEdges = new Set<string>();
  const hasIncoming = new Set<string>();
  for (const e of layoutEdges) {
    if (dagreNodeIds.has(e.source) && dagreNodeIds.has(e.target)) {
      touchedByEdges.add(e.source);
      touchedByEdges.add(e.target);
      hasIncoming.add(e.target);
    }
  }
  const bySequence = [...spineSteps].sort((a, b) => a.sequenceNo - b.sequenceNo);
  const anchorEdges: Edge[] = [];
  for (const s of bySequence) {
    const nodeId = `step_${s.id}`;
    // The start edge is the entry's incoming; everything else without one gets
    // an anchor — otherwise its outgoing chain can rank it ABOVE the entry.
    if (s.id === entryId || hasIncoming.has(nodeId)) continue;
    const prev = [...bySequence]
      .reverse()
      .find((p) => p.sequenceNo < s.sequenceNo && touchedByEdges.has(`step_${p.id}`));
    anchorEdges.push({
      id: `anchor_${s.id}`,
      source: prev ? `step_${prev.id}` : startNodeId,
      target: nodeId,
    } as Edge);
    touchedByEdges.add(nodeId);
    hasIncoming.add(nodeId);
  }
  return anchorEdges;
}

/**
 * The positioning passes each solve their own problem — Dagre ranks, the
 * gateway pass branches destinations sideways, the anchors pull orphans into
 * business order — and none of them sees the others' output. Where two cards
 * end up clipping, the later step slides along the flow axis until clear.
 */
function resolveCardCollisions(nodes: Node[], dir: LayoutDir): Node[] {
  const MARGIN = 16;
  const cards = nodes
    .filter((n) => n.type === 'viewStep')
    .sort(
      (a, b) =>
        (a.data as ViewStepData).step.sequenceNo - (b.data as ViewStepData).step.sequenceNo
    );
  const moved = new Map<string, { x: number; y: number }>();
  const rectOf = (n: Node) => {
    const pos = moved.get(n.id) ?? n.position;
    return { x: pos.x, y: pos.y, w: STEP_W, h: (n.data as ViewStepData).nodeHeight ?? 78 };
  };

  for (let iteration = 0; iteration < 6; iteration += 1) {
    let collided = false;
    for (let i = 0; i < cards.length; i += 1) {
      for (let j = i + 1; j < cards.length; j += 1) {
        const a = rectOf(cards[i]);
        const b = rectOf(cards[j]);
        const overlapsX = a.x < b.x + b.w + MARGIN && a.x + a.w + MARGIN > b.x;
        const overlapsY = a.y < b.y + b.h + MARGIN && a.y + a.h + MARGIN > b.y;
        if (!overlapsX || !overlapsY) continue;
        collided = true;
        const pos = moved.get(cards[j].id) ?? cards[j].position;
        moved.set(
          cards[j].id,
          dir === 'TB'
            ? { x: pos.x, y: a.y + a.h + MARGIN }
            : { x: a.x + a.w + MARGIN, y: pos.y }
        );
      }
    }
    if (!collided) break;
  }

  if (moved.size === 0) return nodes;
  return nodes.map((n) => {
    const pos = moved.get(n.id);
    return pos ? { ...n, position: pos } : n;
  });
}

/**
 * Puts the collapsed correction pills beside the step each one resubmits to,
 * and draws their return as a short hop instead of a canvas-length sweep.
 * Runs after every other positioning pass so the pills track wherever the
 * gateway/stub passes finally left their targets.
 */
function attachCorrectionLoops(
  graph: { nodes: Node[]; edges: Edge[] },
  correctionNodes: Node[],
  returnTargetOf: Map<string, string>,
  outcomes: CrmOutcome[],
  dir: LayoutDir
): { nodes: Node[]; edges: Edge[] } {
  if (correctionNodes.length === 0) return graph;

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const info = {
    correctionIds: new Set(correctionNodes.map((n) => (n.data as ViewStepData).step.id)),
    returnTargetOf,
  };
  const positions = placeCorrectionSteps(
    info,
    (stepId) => {
      const target = nodeById.get(`step_${stepId}`);
      if (!target) return null;
      return {
        x: target.position.x,
        y: target.position.y,
        height: (target.data as ViewStepData).nodeHeight ?? 78,
      };
    },
    dir
  );

  // Everything already on the canvas is an obstacle, and each placed pill
  // becomes one too, so pills clear the cards AND each other.
  const obstacles = graph.nodes
    .filter((n) => n.type === 'viewStep' || n.type === 'routeGateway')
    .map((n) => ({
      x: n.position.x,
      y: n.position.y,
      w: n.type === 'routeGateway' ? GATEWAY_SIZE : STEP_W,
      h:
        n.type === 'routeGateway'
          ? GATEWAY_SIZE
          : ((n.data as ViewStepData).nodeHeight ?? 78),
    }));

  const placedNodes = correctionNodes.map((node) => {
    const stepId = (node.data as ViewStepData).step.id;
    const raw = positions.get(stepId);
    if (!raw) return node;
    const pos = nudgeClearOfObstacles(raw, obstacles, dir);
    obstacles.push({ x: pos.x, y: pos.y, w: CORRECTION_PILL_W, h: CORRECTION_PILL_H });
    return { ...node, position: pos };
  });

  // The pill's return edge: pill side → target's back-in. Short by
  // construction, and its e_back_ id keeps it under the returns toggle.
  const returnEdges: Edge[] = [];
  for (const o of outcomes) {
    if (!info.correctionIds.has(o.stepId) || !o.nextStepId) continue;
    if (!nodeById.has(`step_${o.nextStepId}`)) continue;
    returnEdges.push({
      id: `e_back_${o.id}`,
      source: `step_${o.stepId}`,
      target: `step_${o.nextStepId}`,
      sourceHandle: 'side-out',
      targetHandle: 'back-in',
      type: 'default',
      style: { stroke: 'var(--accent-branch)', strokeWidth: 1.5, strokeDasharray: '5 4' },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--accent-branch)' },
      selectable: false,
    });
  }

  return { nodes: [...graph.nodes, ...placedNodes], edges: [...graph.edges, ...returnEdges] };
}

/**
 * A terminating branch ends where it is: each terminal step (other than the
 * main path's) gets a small end marker beside its card, and a gateway whose
 * routes terminate gets one beneath the diamond. BPMN draws an end event per
 * branch for the same reason — endings should be visible without dragging a
 * line across the whole canvas to one global END.
 */
function addLocalEndStubs(
  nodes: Node[],
  edges: Edge[],
  terminalStepIds: Set<string>,
  lastTerminalStepId: string | null,
  dir: LayoutDir
): { nodes: Node[]; edges: Edge[] } {
  const STUB = 22;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const stubNodes: Node[] = [];
  const stubEdges: Edge[] = [];

  const stub = (id: string, x: number, y: number): Node => ({
    id,
    type: 'viewEnd',
    position: { x, y },
    data: { layoutDir: dir, compact: true },
    draggable: false,
    selectable: false,
  });

  // Direct terminal steps (except the main path) end beside their card.
  for (const stepId of terminalStepIds) {
    if (stepId === lastTerminalStepId) continue;
    const stepNode = nodeById.get(`step_${stepId}`);
    if (!stepNode) continue;
    const hasDirectEnd = edges.some(
      (e) => e.source === `step_${stepId}` && e.id.startsWith('e_end_')
    );
    void hasDirectEnd;
    const h = (stepNode.data as { nodeHeight?: number }).nodeHeight ?? 78;
    const stubId = `end_stub_${stepId}`;
    // Tucked under the card's left corner in both directions — tight enough
    // to clear the next card in a 72px destination stack (34 + 22px < 72),
    // and off the main flow, which runs rightward in LR.
    const x = stepNode.position.x + 10;
    const y = stepNode.position.y + h + 34;
    stubNodes.push(stub(stubId, x, y));
    stubEdges.push({
      id: `e_end_${stepId}`,
      source: `step_${stepId}`,
      target: stubId,
      sourceHandle: 'out',
      targetHandle: 'in',
      type: 'default',
      style: { stroke: 'var(--error)', strokeWidth: 1.5, strokeDasharray: '4 4', opacity: 0.7 },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--error)' },
      selectable: false,
    });
  }

  // Gateways whose routes terminate: the stub hangs beneath the diamond, so
  // the terminal route is as short as the ones that continue.
  for (const edge of edges) {
    if (typeof edge.target !== 'string' || !edge.target.startsWith('end_stub_gw_')) continue;
    if (nodeById.has(edge.target) || stubNodes.some((n) => n.id === edge.target)) continue;
    const gwNode = nodeById.get(edge.source);
    if (!gwNode) continue;
    const x = dir === 'TB' ? gwNode.position.x + GATEWAY_SIZE / 2 - STUB / 2 : gwNode.position.x + GATEWAY_SIZE / 2 - STUB / 2;
    const y = gwNode.position.y + GATEWAY_SIZE + 56;
    stubNodes.push(stub(edge.target, x, y));
  }

  // The rank-only end edges for non-main terminals are gone; drop any stale
  // global-END edge that a stub now replaces.
  const replaced = new Set(stubEdges.map((e) => e.id));
  const keptEdges = edges.filter((e) => !replaced.has(e.id));

  return { nodes: [...nodes, ...stubNodes], edges: [...keptEdges, ...stubEdges] };
}


export function applyDagreLayout(nodes: Node[], edges: Edge[], dir: LayoutDir = 'TB'): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: dir, nodesep: 80, ranksep: 100, marginx: 80, marginy: 60 });

  for (const node of nodes) {
    const { w, h } = nodeDimensions(node);
    g.setNode(node.id, { width: w, height: h });
  }

  for (const edge of edges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }

  dagre.layout(g);

  const positioned = nodes.map((node) => {
    const { w, h } = nodeDimensions(node);
    const pos = g.node(node.id);
    if (!pos) return node;
    return { ...node, position: { x: pos.x - w / 2, y: pos.y - h / 2 } };
  });

  const stepNodes = positioned.filter((n) => n.type === 'viewStep');
  if (stepNodes.length === 0) return positioned;

  // Straighten the spine WITHOUT flattening branches: a rank holding one card
  // snaps onto the centre line, but a rank holding several keeps its Dagre
  // spread and shifts as a group. Forcing every card to one column stacked
  // rank-siblings exactly on top of each other in the Loan process.
  //
  // Ranks are recognised by their CENTRE, not their top edge: Dagre centres
  // each node within its rank, so two same-rank cards of different heights
  // have different y — grouping on y split them apart and stacked them.
  const rankKey = (n: Node) =>
    Math.round(
      dir === 'TB'
        ? n.position.y + ((n.data as ViewStepData).nodeHeight ?? 0) / 2
        : n.position.x + STEP_W / 2
    );
  const ranks = new Map<number, Node[]>();
  for (const n of stepNodes) {
    const key = rankKey(n);
    ranks.set(key, [...(ranks.get(key) ?? []), n]);
  }

  if (dir === 'TB') {
    const centerX =
      stepNodes.reduce((sum, n) => sum + n.position.x + STEP_W / 2, 0) / stepNodes.length;
    const shiftOf = new Map<string, number>();
    for (const group of ranks.values()) {
      if (group.length === 1) {
        shiftOf.set(group[0].id, centerX - STEP_W / 2 - group[0].position.x);
      } else {
        const centroid =
          group.reduce((sum, n) => sum + n.position.x + STEP_W / 2, 0) / group.length;
        for (const n of group) shiftOf.set(n.id, centerX - centroid);
      }
    }
    return positioned.map((node) => {
      const shift = shiftOf.get(node.id);
      if (shift !== undefined)
        return { ...node, position: { ...node.position, x: node.position.x + shift } };
      if (node.type === 'viewStart' || node.type === 'viewEnd')
        return { ...node, position: { ...node.position, x: centerX - MARKER_SIZE / 2 } };
      // Gateway nodes keep Dagre's x (they branch off the center column naturally)
      return node;
    });
  } else {
    const centerY =
      stepNodes.reduce(
        (sum, n) => sum + n.position.y + (n.data as ViewStepData).nodeHeight / 2,
        0
      ) / stepNodes.length;
    const shiftOf = new Map<string, number>();
    for (const group of ranks.values()) {
      if (group.length === 1) {
        const h = (group[0].data as ViewStepData).nodeHeight;
        shiftOf.set(group[0].id, centerY - h / 2 - group[0].position.y);
      } else {
        const centroid =
          group.reduce(
            (sum, n) => sum + n.position.y + (n.data as ViewStepData).nodeHeight / 2,
            0
          ) / group.length;
        for (const n of group) shiftOf.set(n.id, centerY - centroid);
      }
    }
    return positioned.map((node) => {
      const shift = shiftOf.get(node.id);
      if (shift !== undefined)
        return { ...node, position: { ...node.position, y: node.position.y + shift } };
      if (node.type === 'viewStart' || node.type === 'viewEnd')
        return { ...node, position: { ...node.position, y: centerY - MARKER_SIZE / 2 } };
      return node;
    });
  }
}

function nodeDimensions(node: Node): { w: number; h: number } {
  if (node.type === 'viewStep') {
    return { w: STEP_W, h: (node.data as ViewStepData).nodeHeight };
  }
  if (node.type === 'routeGateway') {
    return { w: GATEWAY_SIZE, h: GATEWAY_SIZE };
  }
  return { w: MARKER_SIZE, h: MARKER_SIZE };
}

const STEP_NODE_TYPES = new Set(['viewStep', 'execStep', 'techStep']);
// 80/40 crammed the conditional fan-out: destination cards nearly touched
// the gateway and each other, and the route labels overlapped both.
const BRANCH_GAP = 140;
const ROUTE_STACK_GAP = 72;

/**
 * After Dagre layout, explicitly positions both gateway diamonds and their
 * destination steps so the layout branches RIGHT instead of center-stacking.
 *
 * Chain: [Source Step] → [Gateway ◈] → [Dest1]
 *                                     → [Dest2]
 *                                     → [Dest3]
 *
 * Gateway is placed BRANCH_GAP to the right of its source step, vertically
 * centered on the source step. Destination steps are stacked vertically as a
 * block centered on the gateway, BRANCH_GAP to the right of the gateway.
 */
export function branchRouteDestinations(
  nodes: Node[],
  routes: CrmRoute[],
  outcomes: CrmOutcome[],
  stepW: number
): Node[] {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const outcomeSourceStep = new Map<string, string>();
  for (const o of outcomes) {
    if (o.applyFilter) outcomeSourceStep.set(o.id, o.stepId);
  }

  const routesByOutcome = new Map<string, CrmRoute[]>();
  for (const r of routes) {
    if (!routesByOutcome.has(r.outcomeId)) routesByOutcome.set(r.outcomeId, []);
    routesByOutcome.get(r.outcomeId)!.push(r);
  }
  for (const list of routesByOutcome.values()) {
    list.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  }

  const newPositions = new Map<string, { x: number; y: number }>();

  for (const [outcomeId, outcomeRoutes] of routesByOutcome) {
    const gwNodeId = `gw_${outcomeId}`;
    const sourceStepId = outcomeSourceStep.get(outcomeId);
    if (!sourceStepId) continue;
    const sourceNode = nodeById.get(`step_${sourceStepId}`);
    if (!sourceNode) continue;

    const srcH = (sourceNode.data as { nodeHeight?: number }).nodeHeight ?? 78;
    const gwX = sourceNode.position.x + stepW + BRANCH_GAP;
    const gwY = sourceNode.position.y + srcH / 2 - GATEWAY_SIZE / 2;
    newPositions.set(gwNodeId, { x: gwX, y: gwY });

    const gwCenterY = gwY + GATEWAY_SIZE / 2;
    const destX = gwX + GATEWAY_SIZE + BRANCH_GAP;

    const destStepIds = outcomeRoutes
      .filter((r) => r.nextStepId)
      .map((r) => `step_${r.nextStepId}`);

    if (destStepIds.length === 0) continue;

    const heights = destStepIds.map((id) => {
      const n = nodeById.get(id);
      return n ? ((n.data as { nodeHeight?: number }).nodeHeight ?? 78) : 78;
    });
    const totalH =
      heights.reduce((s, h) => s + h, 0) + (destStepIds.length - 1) * ROUTE_STACK_GAP;

    let currentY = gwCenterY - totalH / 2;
    for (let i = 0; i < destStepIds.length; i++) {
      if (!newPositions.has(destStepIds[i])) {
        newPositions.set(destStepIds[i], { x: destX, y: currentY });
      }
      currentY += heights[i] + ROUTE_STACK_GAP;
    }
  }

  if (newPositions.size === 0) return nodes;

  return nodes.map((node) => {
    const newPos = newPositions.get(node.id);
    if (!newPos) return node;
    const isRelocatable = STEP_NODE_TYPES.has(node.type ?? '') || node.type === 'routeGateway';
    if (!isRelocatable) return node;
    return { ...node, position: newPos };
  });
}

/**
 * The link from a step to one that runs alongside it, for the read-only canvas.
 *
 * Dashed, because nothing transitions here — the engine creates both tasks at once
 * (`OnTaskCreate` fans out over `qdb_parentworkitemstep`). The label carries the
 * meaning rather than the colour, so the notation survives a greyscale export, and it
 * matches the edit canvas so the same relationship reads the same way in both.
 */
function buildViewBranchEdge(step: CrmStep): Edge {
  return {
    id: `branch_${step.parentStepId}_${step.id}`,
    source: `step_${step.parentStepId}`,
    target: `step_${step.id}`,
    sourceHandle: 'out',
    targetHandle: 'in',
    type: 'default',
    label: step.applyBranchFilter ? 'AT SAME TIME · IF' : 'AT SAME TIME',
    labelStyle: { fill: BRANCH_EDGE_LABEL.foreground, fontSize: 10, fontWeight: 700 },
    labelBgStyle: { fill: BRANCH_EDGE_LABEL.background },
    labelBgPadding: [4, 2] as [number, number],
    labelBgBorderRadius: 3,
    style: { stroke: BRANCH_EDGE_LABEL.foreground, strokeWidth: 2, strokeDasharray: '6 4' },
    markerEnd: { type: MarkerType.ArrowClosed, color: BRANCH_EDGE_LABEL.foreground },
    selectable: false,
  };
}
