import { useEffect, useRef } from 'react';
import { useReactFlow, useStore } from '@xyflow/react';
import type { FitViewOptions, Node } from '@xyflow/react';

/**
 * The first thing a reader sees (CWFD-009 P3).
 *
 * Fit-all on a 35-step process lands at ~6% zoom — a filament of unreadable
 * confetti. A small graph still fits whole, but a large one opens on its
 * FIRST stage at reading zoom: the entry step and what follows it, with the
 * minimap and fit-all one click away for the rest.
 */

export const LARGE_GRAPH_THRESHOLD = 15;

/** How much of the flow axis counts as "the opening scene". */
const ENTRY_BAND_TB = 1100;
const ENTRY_BAND_LR = 1700;

export function computeSmartFit(nodes: Node[], dir: 'TB' | 'LR'): FitViewOptions {
  const steps = nodes.filter((n) => n.id.startsWith('step_'));
  if (steps.length <= LARGE_GRAPH_THRESHOLD) {
    return { padding: 0.2, maxZoom: 1.1 };
  }
  const mainAxis = (n: Node) => (dir === 'TB' ? n.position.y : n.position.x);
  const minPos = Math.min(...steps.map(mainAxis));
  const band = dir === 'TB' ? ENTRY_BAND_TB : ENTRY_BAND_LR;
  const opening = nodes.filter((n) => mainAxis(n) <= minPos + band);
  return {
    nodes: opening.map((n) => ({ id: n.id })),
    padding: 0.15,
    maxZoom: 1.0,
  };
}

/**
 * Applies the smart fit exactly once, as soon as every rendered node has been
 * measured — the same deterministic guard FitOnceMeasured uses, because a
 * fixed delay races measurement and fitView-on-init fires too early.
 */
export function SmartInitialView({ dir }: { dir: 'TB' | 'LR' }) {
  const { fitView, getNodes } = useReactFlow();
  const hasFitted = useRef(false);

  const allNodesMeasured = useStore((state) => {
    if (state.nodeLookup.size === 0) return false;
    for (const [, node] of state.nodeLookup) {
      if (!node.measured?.width) return false;
    }
    return true;
  });

  useEffect(() => {
    if (hasFitted.current || !allNodesMeasured) return;
    hasFitted.current = true;
    void fitView(computeSmartFit(getNodes(), dir));
  }, [allNodesMeasured, fitView, getNodes, dir]);

  return null;
}
