import { useStore } from '@xyflow/react';

/**
 * Semantic zoom (CWFD-009 P6): what a card should show at the current zoom.
 *
 * Below reading zoom a full card is confetti — eleven-point text rendered at
 * three physical pixels. Instead of shrinking the same drawing, the card
 * changes what it says: everything at reading zoom, name-and-icons when the
 * text would blur, and a titled block when even that is too small — with the
 * name drawn LARGER in canvas units so it stays legible on screen.
 */

export type DetailLevel = 'full' | 'compact' | 'dot';

export const COMPACT_BELOW = 0.72;
export const DOT_BELOW = 0.3;

function levelFor(zoom: number): DetailLevel {
  if (zoom < DOT_BELOW) return 'dot';
  if (zoom < COMPACT_BELOW) return 'compact';
  return 'full';
}

/** The current detail level; re-renders only when the level changes. */
export function useDetailLevel(): DetailLevel {
  return useStore((state) => levelFor(state.transform[2]));
}

/**
 * The zoom, quantised so font-scaling re-renders in steps instead of every
 * animation frame of a pinch.
 */
export function useQuantisedZoom(): number {
  return useStore((state) => Math.max(0.05, Math.round(state.transform[2] * 20) / 20));
}

/**
 * A font size that lands at ~`targetPx` on the reader's screen regardless of
 * zoom, clamped so it never becomes absurd inside the card.
 */
export function screenStableFontSize(zoom: number, targetPx: number, maxCanvasPx: number): number {
  return Math.min(maxCanvasPx, Math.max(targetPx, targetPx / zoom));
}
