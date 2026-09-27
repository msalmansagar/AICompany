import { useEffect, useRef } from 'react';
import { useReactFlow, useStore } from '@xyflow/react';
import type { FitViewOptions } from '@xyflow/react';

/**
 * Fits the viewport exactly once, as soon as every rendered node has been
 * measured. Mount it inside the ReactFlow it should frame.
 *
 * Exists because neither alternative is reliable: a fixed delay races
 * measurement (the old 80ms setTimeout mis-framed simulation), and React
 * Flow's own fitView-on-init can fire against a graph it has not finished
 * measuring. Watching the store for "all nodes measured" is deterministic —
 * the same guard the view canvas uses for its rebuild fits.
 */
export function FitOnceMeasured({ options }: { options?: FitViewOptions }) {
  const { fitView } = useReactFlow();
  const hasFitted = useRef(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

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
    void fitView(optionsRef.current);
  }, [allNodesMeasured, fitView]);

  return null;
}
