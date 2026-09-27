import type { Node } from '@xyflow/react';

/**
 * One minimap vocabulary for every canvas. The view canvas mapped only its
 * own four node types, so executive / technical / swimlane minimaps fell
 * through to the disabled grey; the mask was a hardcoded light wash that
 * stayed light in the dark themes.
 */
export const MINIMAP_MASK_COLOR = 'var(--minimap-mask)';

const NODE_COLORS: Readonly<Record<string, string>> = {
  viewStart: 'var(--success)',
  viewEnd: 'var(--error)',
  viewStep: 'var(--primary)',
  viewOutcome: 'var(--accent-route)',
  viewDecision: 'var(--accent-branch)',
  execStep: 'var(--primary)',
  techNewStep: 'var(--primary)',
  techNewOutcome: 'var(--accent-route)',
  swimlane: 'var(--lane-bg)',
  parallelGroup: 'var(--accent-branch-bg)',
  overviewStage: 'var(--primary)',
  stageBand: 'var(--lane-bg)',
  swimStep: 'var(--primary)',
  editStep: 'var(--primary)',
  routeGateway: 'var(--accent-branch)',
  simStep: 'var(--primary)',
  sopStep: 'var(--primary)',
  sopOutcome: 'var(--success)',
  sopGateway: 'var(--accent-branch)',
  sopStart: 'var(--success)',
  sopEnd: 'var(--error)',
  sopSwimlane: 'var(--lane-bg)',
};

/**
 * The minimap colour for a node.
 * @param node the node the minimap is drawing
 * @returns its accent, or the disabled grey for an unmapped type
 */
export function minimapNodeColor(node: Node): string {
  return (node.type && NODE_COLORS[node.type]) || 'var(--text-disabled)';
}
