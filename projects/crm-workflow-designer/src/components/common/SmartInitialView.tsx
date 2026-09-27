import { useEffect } from 'react';
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
 * Applies the smart fit while the viewport is still untouched, and stops the
 * moment any fit (or the user) has moved it.
 *
 * "Fit exactly once when all nodes are measured" was the previous contract,
 * and it lost twice on slow loads: the store can refill after the canvas
 * mounts, replacing every node — which cancels an in-flight fit and wipes
 * measurements — and the once-guard then refused to try again, leaving the
 * editor at translate(0,0) scale(1) framing a single card. The identity
 * transform IS the signal: no successful fit and no human ever leaves the
 * viewport exactly there.
 */
export function SmartInitialView({ dir }: { dir: 'TB' | 'LR' }) {
  const { fitView, getNodes } = useReactFlow();

  // 'done' — the viewport has moved; nothing left to do, ever.
  // 'empty' — no measured step card yet (a slow load renders start/end first).
  // 'ready' — every node measured: fit now.
  // 'settling' — steps measured but some node still is not; a node React Flow
  //   never mounts must not hold the fit hostage, so fit after a deadline.
  const status = useStore((state) => {
    const [x, y, zoom] = state.transform;
    if (x !== 0 || y !== 0 || zoom !== 1) return 'done';
    if (state.nodeLookup.size === 0) return 'empty';
    let hasMeasuredStep = false;
    let allMeasured = true;
    for (const [id, node] of state.nodeLookup) {
      if (node.measured?.width) {
        if (id.startsWith('step_')) hasMeasuredStep = true;
      } else {
        allMeasured = false;
      }
    }
    if (!hasMeasuredStep) return 'empty';
    return allMeasured ? 'ready' : 'settling';
  });

  useEffect(() => {
    if (status === 'done' || status === 'empty') return;
    if (status === 'ready') {
      void fitView(computeSmartFit(getNodes(), dir));
      return;
    }
    const deadline = window.setTimeout(() => {
      void fitView(computeSmartFit(getNodes(), dir));
    }, 1500);
    return () => window.clearTimeout(deadline);
  }, [status, fitView, getNodes, dir]);

  return null;
}
