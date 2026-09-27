import { MarkerType } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import { routeLabelPair } from '../styles/surfacePairs';
import { GATEWAY_SIZE } from './WorkflowGraphBuilder';
import { routeCanvasLabel } from './routeDisplay';
import type { WorkflowStep, WorkflowOutcome, WorkflowRoute } from '../types/WorkflowTypes';

/**
 * Virtual gateways for the EDIT canvas (CWFD-019 PR1).
 *
 * The engine already models conditional routing exactly the way BPMN draws
 * it — a decision (outcome with applyFilter) owning routes that each carry a
 * FetchXML condition and a target — but the edit canvas never said so: a
 * conditional outcome rendered as one plain edge into a stub, and its route
 * targets floated with no visible line reaching them. A Business Analyst
 * configured routing blind.
 *
 * These nodes and edges are PRESENTATION ONLY, the same contract as the view
 * canvases' gateways: derived at render time, no Dataverse record, no store
 * position (a gateway rides beside its source card, tracking drags), never
 * saved. Selecting the diamond selects the OUTCOME — the panels, save
 * planner and simulation never learn gateways exist.
 */

/** How far a gateway sits from its source card's right edge. */
export const EDIT_GATEWAY_GAP = 64;
/** Vertical spacing when one step owns several conditional decisions. */
const GATEWAY_STACK_GAP = 96;
/** The label ribbon above the diamond, part of the node's footprint. */
const GATEWAY_LABEL_H = 22;

export interface EditGatewayInput {
  stepOrder: string[];
  steps: Record<string, WorkflowStep>;
  outcomes: Record<string, WorkflowOutcome>;
  routes: Record<string, WorkflowRoute>;
  routeOrder: Record<string, string[]>;
  /** A step card's current position, or null when it has none yet. */
  positionOf: (stepId: string) => { x: number; y: number } | null;
  /** A step card's rendered height, for vertical centring. */
  heightOf: (stepId: string) => number;
  /** The card width the gateway sits beside. */
  stepWidth: number;
  selectedId: string | null;
}

export interface EditGatewayGraph {
  nodes: Node[];
  edges: Edge[];
  /** Outcomes now represented by a gateway — their plain edge must not draw. */
  outcomeIdsWithGateway: Set<string>;
}

export function buildEditGateways(input: EditGatewayInput): EditGatewayGraph {
  const {
    stepOrder,
    steps,
    outcomes,
    routes,
    routeOrder,
    positionOf,
    heightOf,
    stepWidth,
    selectedId,
  } = input;

  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const outcomeIdsWithGateway = new Set<string>();

  for (const stepId of stepOrder) {
    const step = steps[stepId];
    if (!step) continue;
    const conditionalOutcomes = Object.values(outcomes)
      .filter(
        (outcome) =>
          outcome.stepId === stepId &&
          outcome.applyFilter &&
          (routeOrder[outcome.crmId] ?? []).length > 0
      )
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    if (conditionalOutcomes.length === 0) continue;

    const sourcePosition = positionOf(stepId);
    if (!sourcePosition) continue;
    const sourceHeight = heightOf(stepId);
    const stackHeight =
      conditionalOutcomes.length * GATEWAY_SIZE +
      (conditionalOutcomes.length - 1) * (GATEWAY_STACK_GAP - GATEWAY_SIZE);
    let gatewayY =
      sourcePosition.y + sourceHeight / 2 - stackHeight / 2 - GATEWAY_LABEL_H;

    for (const outcome of conditionalOutcomes) {
      const gatewayId = `gw_${outcome.crmId}`;
      const outcomeRoutes = (routeOrder[outcome.crmId] ?? [])
        .map((routeId) => routes[routeId])
        .filter((route): route is WorkflowRoute => route !== undefined);

      outcomeIdsWithGateway.add(outcome.crmId);

      nodes.push({
        id: gatewayId,
        type: 'routeGateway',
        position: { x: sourcePosition.x + stepWidth + EDIT_GATEWAY_GAP, y: gatewayY },
        data: {
          outcomeName: outcome.name,
          outcomeId: outcome.crmId,
          routeCount: outcomeRoutes.length,
          isSelected: selectedId === `outcome_${outcome.crmId}`,
        },
        draggable: false,
        selectable: true,
      });
      gatewayY += GATEWAY_STACK_GAP;

      // Step → gateway. Quiet: the decision's identity lives on the diamond.
      edges.push({
        id: `e_entry_${outcome.crmId}`,
        source: `step_${stepId}`,
        target: gatewayId,
        sourceHandle: 'out',
        targetHandle: 'in-side',
        type: 'default',
        style: { stroke: 'var(--warning)', strokeWidth: 1.5, strokeDasharray: '5 3' },
        markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--warning)' },
        selectable: false,
      });

      // Gateway → each route's target. Terminal routes end at a local stub
      // hanging beneath the diamond, never across the canvas.
      const hasTerminalRoute = outcomeRoutes.some((route) => !route.nextStepId);
      const stubId = `end_stub_gw_${outcome.crmId}`;
      if (hasTerminalRoute) {
        nodes.push({
          id: stubId,
          type: 'viewEnd',
          parentId: gatewayId,
          position: { x: GATEWAY_SIZE / 2 - 11, y: GATEWAY_LABEL_H + GATEWAY_SIZE + 40 },
          data: { layoutDir: 'LR', compact: true },
          draggable: false,
          selectable: false,
        });
      }

      for (const route of outcomeRoutes) {
        const isFallback = route.isDefault;
        const stroke = isFallback ? 'var(--success)' : 'var(--warning)';
        const pair = routeLabelPair(isFallback ? 'fallback' : 'conditional');
        edges.push({
          id: `route_edge_${route.crmId}`,
          source: gatewayId,
          target: route.nextStepId ? `step_${route.nextStepId}` : stubId,
          sourceHandle: 'out-side',
          targetHandle: 'in',
          type: 'default',
          animated: !isFallback,
          label: routeCanvasLabel(route),
          labelStyle: { fontSize: 10, fontWeight: 600, fill: pair.foreground },
          labelBgStyle: { fill: pair.background, fillOpacity: 1, rx: 4 },
          style: {
            stroke,
            strokeWidth: 1.5,
            strokeDasharray: isFallback ? '4 4' : undefined,
          },
          markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
          selectable: true,
        });
      }
    }
  }

  return { nodes, edges, outcomeIdsWithGateway };
}
