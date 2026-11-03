import { MarkerType } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import { BRANCH_EDGE_LABEL } from '../styles/surfacePairs';
import { classifyCorrectionSteps } from './correctionSteps';
import type { CrmStep, CrmOutcome } from '../types/ViewTypes';

/**
 * The return spotlight (CWFD-017 PR2): returns render on demand, not as
 * standing wiring.
 *
 * With return lines hidden by default, a reader still asks "where can this
 * step send work back to?" — the ↩ badge answers with a list, and hovering
 * or pinning an entry lights exactly that relationship: a temporary edge,
 * both endpoint cards at full strength, everything else faded. The Business
 * view never built edges for non-correction returns at all, so the spotlight
 * synthesises its own edge instead of un-hiding one.
 */

export interface ReturnRef {
  outcomeId: string;
  /** The decision's name — "Return to RM Review". */
  name: string;
  sourceStepId: string;
  sourceStepName: string;
  targetStepId: string;
  targetStepName: string;
  /**
   * Set when the return travels THROUGH a pure correction step: the decision
   * points forward at "Return to X by Y", and that step sends the work back.
   * The business meaning is still source ↩ target; the pill is plumbing.
   */
  viaStepId?: string;
}

/** A return arriving at a card, for its "↩ from …" indicator. */
export interface IncomingReturn {
  outcomeId: string;
  sourceStepName: string;
}

/** Which handles a spotlight edge should anchor on, per canvas. */
export interface SpotlightHandles {
  sourceHandle: string;
  targetHandle: string;
}

/**
 * Every return relationship in the process, keyed by outcome id.
 *
 * Two shapes count. A DIRECT return targets an earlier-or-same-sequence step
 * (every builder's rule). A ROUTED return points forward at a pure
 * correction step — "Return to Credit Analyst by Credit Manager" — which
 * exists only to send the work back; the requirement's "Credit Manager
 * Approval ↩ 2" counts exactly these, so the ref resolves through the pill
 * to where the work actually lands.
 */
export function collectReturnRefs(
  steps: CrmStep[],
  outcomes: CrmOutcome[]
): Map<string, ReturnRef> {
  const stepById = new Map(steps.map((s) => [s.id, s]));
  const entry = [...steps].sort((a, b) => a.sequenceNo - b.sequenceNo)[0];
  const correctionInfo = classifyCorrectionSteps(
    steps.map((s) => ({ id: s.id, sequenceNo: s.sequenceNo })),
    outcomes.map((o) => ({
      stepId: o.stepId,
      nextStepId: o.nextStepId,
      sequenceNumber: o.sequenceNumber,
      isConditional: o.applyFilter,
    })),
    entry?.id ?? null
  );

  const refs = new Map<string, ReturnRef>();
  for (const outcome of outcomes) {
    if (!outcome.nextStepId) continue;
    const source = stepById.get(outcome.stepId);
    const next = stepById.get(outcome.nextStepId);
    if (!source || !next) continue;

    if (next.sequenceNo <= source.sequenceNo) {
      refs.set(outcome.id, {
        outcomeId: outcome.id,
        name: outcome.name,
        sourceStepId: source.id,
        sourceStepName: source.name,
        targetStepId: next.id,
        targetStepName: next.name,
      });
      continue;
    }

    if (!correctionInfo.correctionIds.has(next.id)) continue;
    const resolvedId = correctionInfo.returnTargetOf.get(next.id);
    const resolved = resolvedId ? stepById.get(resolvedId) : undefined;
    // A correction resubmitting into another correction has no resolvable
    // landing step — leave it to the pill itself.
    if (!resolved || correctionInfo.correctionIds.has(resolved.id)) continue;
    refs.set(outcome.id, {
      outcomeId: outcome.id,
      name: outcome.name,
      sourceStepId: source.id,
      sourceStepName: source.name,
      targetStepId: resolved.id,
      targetStepName: resolved.name,
      viaStepId: next.id,
    });
  }
  return refs;
}

/** The refs grouped by the card they leave from, for the ↩ badges. */
export function groupRefsBySource(refs: Map<string, ReturnRef>): Map<string, ReturnRef[]> {
  const bySource = new Map<string, ReturnRef[]>();
  for (const ref of refs.values()) {
    const list = bySource.get(ref.sourceStepId) ?? [];
    list.push(ref);
    bySource.set(ref.sourceStepId, list);
  }
  return bySource;
}

const SPOTLIGHT_EDGE_PREFIX = 'spotlight_return_';
/** Scenery never fades — lanes and stage bands are the map, not the subject. */
const UNFADED_NODE_TYPES = new Set(['swimlane', 'stageBand']);
const FADED_NODE_OPACITY = 0.25;
const FADED_EDGE_OPACITY = 0.15;

/**
 * Draws the active returns over the filtered graph: a dashed accent edge per
 * active ref, endpoint cards marked and kept at full strength (the target
 * additionally learns who is returning to it, for its "↩ from …" chip), and
 * every uninvolved node and edge faded. With nothing active it is a
 * pass-through, so the default render pays nothing.
 */
export function applyReturnSpotlight(
  nodes: Node[],
  edges: Edge[],
  activeRefs: readonly ReturnRef[],
  handles: SpotlightHandles
): { nodes: Node[]; edges: Edge[] } {
  if (activeRefs.length === 0) return { nodes, edges };

  const nodeIds = new Set(nodes.map((n) => n.id));
  const drawableRefs = activeRefs.filter(
    (ref) => nodeIds.has(`step_${ref.sourceStepId}`) && nodeIds.has(`step_${ref.targetStepId}`)
  );
  if (drawableRefs.length === 0) return { nodes, edges };

  const endpointIds = new Set<string>();
  const incomingByTarget = new Map<string, IncomingReturn[]>();
  for (const ref of drawableRefs) {
    endpointIds.add(`step_${ref.sourceStepId}`);
    endpointIds.add(`step_${ref.targetStepId}`);
    if (ref.viaStepId) endpointIds.add(`step_${ref.viaStepId}`);
    const incoming = incomingByTarget.get(`step_${ref.targetStepId}`) ?? [];
    incoming.push({ outcomeId: ref.outcomeId, sourceStepName: ref.sourceStepName });
    incomingByTarget.set(`step_${ref.targetStepId}`, incoming);
  }

  const spotlightEdges: Edge[] = drawableRefs.map((ref) => ({
    id: `${SPOTLIGHT_EDGE_PREFIX}${ref.outcomeId}`,
    source: `step_${ref.sourceStepId}`,
    target: `step_${ref.targetStepId}`,
    sourceHandle: handles.sourceHandle,
    targetHandle: handles.targetHandle,
    type: 'default',
    animated: true,
    label: `↩ ${ref.name}`,
    labelStyle: { fontSize: 10, fontWeight: 700, fill: BRANCH_EDGE_LABEL.foreground },
    labelBgStyle: { fill: BRANCH_EDGE_LABEL.background, fillOpacity: 1, rx: 4 },
    labelBgPadding: [6, 3] as [number, number],
    style: { stroke: 'var(--accent-branch)', strokeWidth: 2.5, strokeDasharray: '6 4' },
    markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--accent-branch)' },
    selectable: false,
    zIndex: 40,
  }));

  const litNodes = nodes.map((node) => {
    if (UNFADED_NODE_TYPES.has(node.type ?? '')) return node;
    if (endpointIds.has(node.id)) {
      return {
        ...node,
        style: { ...node.style, opacity: 1 },
        data: {
          ...node.data,
          isSpotlightEndpoint: true,
          incomingReturns: incomingByTarget.get(node.id) ?? [],
        },
      };
    }
    return { ...node, style: { ...node.style, opacity: FADED_NODE_OPACITY } };
  });

  const dimmedEdges = edges.map((edge) => ({
    ...edge,
    style: { ...edge.style, opacity: FADED_EDGE_OPACITY },
  }));

  return { nodes: litNodes, edges: [...dimmedEdges, ...spotlightEdges] };
}
