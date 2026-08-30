import type { Edge } from '@xyflow/react';

/**
 * The one vocabulary for what an edge MEANS, across every canvas (CWFD-017).
 *
 * Six builders each decide edge styling independently, and that independence
 * is how three separate invisible-label bugs shipped. Meaning now has a single
 * home: every edge classifies into exactly one flow class, and the visibility
 * filters, toolbars and legends all consume this classification instead of
 * re-deriving it from id prefixes in their own way.
 *
 * - primary   — the main forward business journey (start links included)
 * - decision  — conditional routing: gateway entries and their routes
 * - parallel  — "AT SAME TIME" links to steps that run alongside their parent
 * - return    — an edge that sends work back to an earlier step
 * - ending    — an edge into an end marker (the global END or a local stub)
 */
export type FlowClass = 'primary' | 'decision' | 'parallel' | 'return' | 'ending';

/** What the Flow Display toolbar and tooltips call each class. */
export const FLOW_CLASS_LABELS: Record<FlowClass, string> = {
  primary: 'Primary',
  decision: 'Decisions',
  parallel: 'Parallel',
  return: 'Returns',
  ending: 'Endings',
};

/** One-line meaning of each class, for the toolbar tooltips. */
export const FLOW_CLASS_DESCRIPTIONS: Record<FlowClass, string> = {
  primary: 'The main forward business journey',
  decision: 'Conditional routing — gateways and their routes',
  parallel: 'Steps that run at the same time as another step',
  return: 'Paths that send work back to an earlier step',
  ending: 'Where the process ends — the END marker and local end stubs',
};

/** Every builder marks its return lines one of these ways. */
const RETURN_ID_PREFIXES = ['e_back_', 'tn_e_return_'];

/** Conditional-routing edges: step → gateway entries and gateway → route lines. */
const DECISION_ID_PREFIXES = [
  'e_entry_',
  'e_route_',
  'e_exec_entry_',
  'e_exec_route_',
  'tn_e_route_',
];

/** Edges whose id alone says they run into an end marker. */
const ENDING_ID_PREFIXES = ['e_end_', 'e_exec_end_', 'tn_e_end_'];

/** The global END node of each canvas. */
const END_NODE_IDS = new Set(['node_end', 'edit_end', 'tn_end', 'sim_end']);

function hasPrefix(id: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => id.startsWith(prefix));
}

interface FlowFlaggedEdgeData {
  isBackEdge?: boolean;
  isConditional?: boolean;
}

/** True when the edge runs into an end marker — the global END or a stub. */
export function isEndingEdge(edge: Edge): boolean {
  return (
    hasPrefix(edge.id, ENDING_ID_PREFIXES) ||
    END_NODE_IDS.has(edge.target) ||
    edge.target.startsWith('end_stub_')
  );
}

/**
 * The flow class of an edge, derived from what the builders already encode
 * in ids, data flags and targets — no builder changes required, and a new
 * edge kind fails loudly into 'primary' where it is most visible.
 *
 * Priority order matters for edges that qualify twice:
 * - return wins outright — a conditional loop backwards is still a return;
 * - parallel next — the branch link's meaning is concurrency, not flow;
 * - ending beats decision — a route that terminates IS an ending, and hiding
 *   decisions must not hide where the process stops (the gateway-node removal
 *   in the filter is what takes its floating routes with it);
 * - decision beats primary.
 */
export function classifyEdge(edge: Edge): FlowClass {
  const data = (edge.data ?? {}) as FlowFlaggedEdgeData;
  if (data.isBackEdge === true) return 'return';
  if (hasPrefix(edge.id, RETURN_ID_PREFIXES)) return 'return';
  if (edge.type === 'hierReturn') return 'return';

  if (edge.id.startsWith('branch_')) return 'parallel';

  if (isEndingEdge(edge)) return 'ending';

  if (hasPrefix(edge.id, DECISION_ID_PREFIXES)) return 'decision';
  if (data.isConditional === true) return 'decision';

  return 'primary';
}
