import type { Node, Edge } from '@xyflow/react';

/**
 * Decluttering filters for the view canvases.
 *
 * A process heavy with return outcomes (every approval step offering
 * "Return to RM", "Return to Credit …") buries its happy path under return
 * arcs. The return-path mode peels those away in two strengths:
 *
 * - 'hide-lines'  — the return edges disappear; everything else stays.
 * - 'hide-all'    — additionally removes the nodes that exist only for
 *                   returns (the ↩ outcome pills), strips the ↩ rows from
 *                   step cards, and drops anything the remaining edges can
 *                   no longer reach from Start.
 */
export type ReturnPathMode = 'show' | 'hide-lines' | 'hide-all';

/** The order the toolbar cycles through. */
export const RETURN_PATH_MODES: readonly ReturnPathMode[] = ['show', 'hide-lines', 'hide-all'];

/** What the toolbars print for each mode. */
export const RETURN_MODE_LABELS: Record<ReturnPathMode, string> = {
  show: 'Returns: on',
  'hide-lines': 'Returns: lines off',
  'hide-all': 'Returns: hidden',
};

/** The next mode in the toolbar cycle. */
export function nextReturnPathMode(mode: ReturnPathMode): ReturnPathMode {
  return RETURN_PATH_MODES[(RETURN_PATH_MODES.indexOf(mode) + 1) % RETURN_PATH_MODES.length];
}

interface ReturnFlaggedEdgeData {
  isBackEdge?: boolean;
}

interface ReturnFlaggedNodeData {
  isReturn?: boolean;
  outcomeRows?: Array<{ isBackEdge: boolean }>;
}

/** Every builder marks its return lines one of these ways. */
export function isReturnLine(edge: Edge): boolean {
  if ((edge.data as ReturnFlaggedEdgeData | undefined)?.isBackEdge === true) return true;
  return edge.id.startsWith('e_back_') || edge.id.startsWith('tn_e_return_');
}

function isReturnOnlyNode(node: Node): boolean {
  return (node.data as ReturnFlaggedNodeData | undefined)?.isReturn === true;
}

/** Lanes and terminals are scenery — never removed by reachability. */
function isStructural(node: Node): boolean {
  const type = (node.type ?? '').toLowerCase();
  return type.includes('start') || type.includes('end') || type.includes('swimlane');
}

function stripReturnRows(node: Node): Node {
  const data = node.data as ReturnFlaggedNodeData | undefined;
  if (!data?.outcomeRows?.some((row) => row.isBackEdge)) return node;
  return {
    ...node,
    data: { ...data, outcomeRows: data.outcomeRows.filter((row) => !row.isBackEdge) },
  };
}

export function applyReturnPathFilter(
  nodes: Node[],
  edges: Edge[],
  mode: ReturnPathMode
): { nodes: Node[]; edges: Edge[] } {
  if (mode === 'show') return { nodes, edges };

  let keptEdges = edges.filter((edge) => !isReturnLine(edge));
  if (mode === 'hide-lines') return { nodes, edges: keptEdges };

  const removedIds = new Set(nodes.filter(isReturnOnlyNode).map((node) => node.id));
  let keptNodes = nodes.filter((node) => !removedIds.has(node.id)).map(stripReturnRows);
  keptEdges = keptEdges.filter(
    (edge) => !removedIds.has(edge.source) && !removedIds.has(edge.target)
  );

  // Whatever the remaining edges cannot reach from a Start node existed only
  // to serve a return path — drop it, but never the scenery.
  const adjacency = new Map<string, string[]>();
  for (const edge of keptEdges) {
    const targets = adjacency.get(edge.source) ?? [];
    targets.push(edge.target);
    adjacency.set(edge.source, targets);
  }
  const roots = keptNodes
    .filter((node) => (node.type ?? '').toLowerCase().includes('start'))
    .map((node) => node.id);
  if (roots.length > 0) {
    const reached = new Set(roots);
    const queue = [...roots];
    while (queue.length > 0) {
      const current = queue.pop() as string;
      for (const target of adjacency.get(current) ?? []) {
        if (!reached.has(target)) {
          reached.add(target);
          queue.push(target);
        }
      }
    }
    keptNodes = keptNodes.filter((node) => reached.has(node.id) || isStructural(node));
    const keptIds = new Set(keptNodes.map((node) => node.id));
    keptEdges = keptEdges.filter((edge) => keptIds.has(edge.source) && keptIds.has(edge.target));
  }

  return { nodes: keptNodes, edges: keptEdges };
}
