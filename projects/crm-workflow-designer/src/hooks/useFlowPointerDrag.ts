import { useCallback, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';

export interface FlowDragHandlers {
  onPointerDown: (event: React.PointerEvent) => void;
  onPointerMove: (event: React.PointerEvent) => void;
  onPointerUp: (event: React.PointerEvent) => void;
}

/**
 * Pointer-capture dragging in FLOW coordinates, for the HTML overlays an edge
 * renders (label chips, bend grips). Pointer capture keeps the drag alive when
 * the cursor outruns the little element; stopPropagation keeps React Flow
 * from panning the canvas underneath.
 */
export function useFlowPointerDrag(
  onMove: (point: { x: number; y: number }) => void
): FlowDragHandlers {
  const { screenToFlowPosition } = useReactFlow();
  const isDragging = useRef(false);

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    event.stopPropagation();
    event.preventDefault();
    (event.target as Element).setPointerCapture(event.pointerId);
    isDragging.current = true;
  }, []);

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!isDragging.current) return;
      event.stopPropagation();
      onMove(screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    },
    [onMove, screenToFlowPosition]
  );

  const onPointerUp = useCallback((event: React.PointerEvent) => {
    isDragging.current = false;
    (event.target as Element).releasePointerCapture(event.pointerId);
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp };
}
