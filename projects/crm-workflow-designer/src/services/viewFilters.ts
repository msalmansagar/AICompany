import type { Node, Edge } from '@xyflow/react';
import { classifyEdge } from './flowClass';
import type { FlowClass } from './flowClass';

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

/** Lanes, terminals and stage bands are scenery — never removed by reachability. */
function isStructural(node: Node): boolean {
  const type = (node.type ?? '').toLowerCase();
  return (
    type.includes('start') ||
    type.includes('end') ||
    type.includes('swimlane') ||
    type.includes('stageband') ||
    type.includes('parallelgroup')
  );
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

/**
 * What the Flow Display toolbar controls (CWFD-017): each relationship class
 * shows or hides independently, and returns keep their two hidden strengths —
 * lines off (badges and card rows stay) or gone entirely.
 *
 * Presentation only. Toggles never touch the store or the saved process;
 * hidden work is still there on save.
 */
export interface FlowVisibility {
  primary: boolean;
  decisions: boolean;
  parallel: boolean;
  endings: boolean;
  returns: ReturnPathMode;
}

/**
 * Returns are OFF by default: on a 60-step process the return arcs bury the
 * happy path, and the card rows still say where work can go back to. The
 * user's choice wins for the rest of the session.
 */
export const DEFAULT_FLOW_VISIBILITY: FlowVisibility = {
  primary: true,
  decisions: true,
  parallel: true,
  endings: true,
  returns: 'hide-lines',
};

/** Everything on — what the canvases drew before the Flow Display toolbar. */
export const SHOW_ALL_FLOW_VISIBILITY: FlowVisibility = {
  primary: true,
  decisions: true,
  parallel: true,
  endings: true,
  returns: 'show',
};

function isEndMarkerNode(node: Node): boolean {
  return node.type === 'viewEnd';
}

/**
 * Applies the Flow Display toggles: the return-path filter first (its
 * strengths are already tested), then class filtering for the other four.
 *
 * Hiding decisions removes the gateway diamonds too — a diamond with no
 * lines is noise — and hiding endings removes the end markers; edges touching
 * a removed node go with it, which is what keeps a terminal route from
 * floating when only one of its two classes is hidden.
 */
export function applyFlowVisibility(
  nodes: Node[],
  edges: Edge[],
  visibility: FlowVisibility
): { nodes: Node[]; edges: Edge[] } {
  const afterReturns = applyReturnPathFilter(nodes, edges, visibility.returns);

  const hiddenClasses = new Set<FlowClass>();
  if (!visibility.primary) hiddenClasses.add('primary');
  if (!visibility.decisions) hiddenClasses.add('decision');
  if (!visibility.parallel) hiddenClasses.add('parallel');
  if (!visibility.endings) hiddenClasses.add('ending');
  if (hiddenClasses.size === 0) return afterReturns;

  let keptEdges = afterReturns.edges.filter((edge) => !hiddenClasses.has(classifyEdge(edge)));

  const removedNodeIds = new Set<string>();
  for (const node of afterReturns.nodes) {
    if (!visibility.decisions && node.type === 'routeGateway') removedNodeIds.add(node.id);
    if (!visibility.endings && isEndMarkerNode(node)) removedNodeIds.add(node.id);
    if (!visibility.parallel && node.type === 'parallelGroup') removedNodeIds.add(node.id);
  }
  if (removedNodeIds.size === 0) return { nodes: afterReturns.nodes, edges: keptEdges };

  let keptNodes = afterReturns.nodes.filter((node) => !removedNodeIds.has(node.id));
  keptEdges = keptEdges.filter(
    (edge) => !removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target)
  );

  // A gateway whose every route was filtered away dangles on its entry line —
  // a diamond promising choices it no longer shows. It goes too, entry and all.
  const gatewaysWithExits = new Set(
    keptEdges.filter((edge) => edge.source.startsWith('gw_')).map((edge) => edge.source)
  );
  const danglingGateways = new Set(
    keptNodes
      .filter((node) => node.type === 'routeGateway' && !gatewaysWithExits.has(node.id))
      .map((node) => node.id)
  );
  if (danglingGateways.size > 0) {
    keptNodes = keptNodes.filter((node) => !danglingGateways.has(node.id));
    keptEdges = keptEdges.filter(
      (edge) => !danglingGateways.has(edge.source) && !danglingGateways.has(edge.target)
    );
  }

  return { nodes: keptNodes, edges: keptEdges };
}
