import type { Node, Edge } from '@xyflow/react';

/**
 * Focus Mode (CWFD-017 PR3): the selected step and everything that touches
 * it at full strength, the rest of the canvas faded to context.
 *
 * The lit set comes from `stepRelationships` — the same derivation the
 * Overview tab reads out — so the light and the words always agree. Edges
 * incident to the selection are shown even when a visibility filter hid them
 * (a return IS one of the selected step's relationships), which is why the
 * fade takes both the filtered edges and the unfiltered set.
 */

const FADED_NODE_OPACITY = 0.2;
const FADED_EDGE_OPACITY = 0.12;
/** Scenery stays readable — it is the map the focus sits on. */
const UNFADED_NODE_TYPES = new Set(['swimlane', 'stageBand']);

export function applyFocusFade(
  nodes: Node[],
  visibleEdges: Edge[],
  allEdges: Edge[],
  selectedNodeId: string,
  focusStepIds: ReadonlySet<string>
): { nodes: Node[]; edges: Edge[] } {
  const incidentEdges = allEdges.filter(
    (edge) => edge.source === selectedNodeId || edge.target === selectedNodeId
  );
  const incidentIds = new Set(incidentEdges.map((edge) => edge.id));

  // Everything the light touches: the selection, its related steps, and both
  // ends of every incident edge (start markers, end stubs, END itself).
  const litNodeIds = new Set<string>([selectedNodeId]);
  for (const stepId of focusStepIds) litNodeIds.add(`step_${stepId}`);
  for (const edge of incidentEdges) {
    litNodeIds.add(edge.source);
    litNodeIds.add(edge.target);
  }

  const fadedNodes = nodes.map((node) => {
    if (UNFADED_NODE_TYPES.has(node.type ?? '')) return node;
    if (litNodeIds.has(node.id)) return { ...node, style: { ...node.style, opacity: 1 } };
    return { ...node, style: { ...node.style, opacity: FADED_NODE_OPACITY } };
  });

  // Filtered-out incident edges come back for the duration of the focus.
  const restoredEdges = incidentEdges.filter(
    (edge) => !visibleEdges.some((visible) => visible.id === edge.id)
  );

  const emphasised = (edge: Edge): Edge => ({
    ...edge,
    style: { ...edge.style, opacity: 1 },
    zIndex: 30,
  });

  const fadedEdges = visibleEdges.map((edge) =>
    incidentIds.has(edge.id)
      ? emphasised(edge)
      : { ...edge, style: { ...edge.style, opacity: FADED_EDGE_OPACITY } }
  );

  return { nodes: fadedNodes, edges: [...fadedEdges, ...restoredEdges.map(emphasised)] };
}

/**
 * The gentler cousin for plain hover (req 16): edges touching the hovered
 * node come forward, the rest step back a little, and nodes are left alone —
 * a hover must never restyle cards or the pointer flickers the whole canvas.
 */
export function applyHoverEmphasis(edges: Edge[], hoveredNodeId: string): Edge[] {
  const touchesHover = (edge: Edge) =>
    edge.source === hoveredNodeId || edge.target === hoveredNodeId;
  if (!edges.some(touchesHover)) return edges;
  return edges.map((edge) =>
    touchesHover(edge)
      ? {
          ...edge,
          style: {
            ...edge.style,
            opacity: 1,
            strokeWidth: Number(edge.style?.strokeWidth ?? 1.5) + 0.8,
          },
          zIndex: 20,
        }
      : { ...edge, style: { ...edge.style, opacity: 0.45 } }
  );
}
