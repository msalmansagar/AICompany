export interface CanvasPoint {
  x: number;
  y: number;
}

export interface SimEndpoints {
  start: CanvasPoint;
  end: CanvasPoint;
  /** Dominant axis of the layout — drives the terminals' handle orientation. */
  dir: 'LR' | 'TB';
}

/** Matches the keys computeEditLayout writes for the edit canvas terminals. */
const EDIT_START_KEY = 'edit_start';
const EDIT_END_KEY = 'edit_end';

const START_GAP = 200;
const END_GAP = 340;

/**
 * Where the simulation canvases place their Start and End circles.
 *
 * The step positions come straight from the edit canvas, which lays out
 * left-to-right — but the old fallbacks assumed a top-to-bottom column, so a
 * simulation over an LR-arranged process floated Start above the row and
 * dropped End far below it. Preference order:
 *
 * 1. The stored edit-canvas terminal positions — same coordinate space.
 * 2. Positions derived along the graph's dominant axis: before the entry
 *    step and after the furthest step.
 * 3. Static defaults when there are no steps to measure.
 */
export function resolveSimEndpoints(
  nodePositions: Record<string, CanvasPoint>,
  stepOrder: string[]
): SimEndpoints {
  const stored = resolveStoredEndpoints(nodePositions);
  if (stored) return stored;

  const stepPoints = stepOrder
    .map((stepId) => nodePositions[`step_${stepId}`])
    .filter((point): point is CanvasPoint => point != null);

  if (stepPoints.length === 0) {
    return { start: { x: 300, y: -80 }, end: { x: 300, y: stepOrder.length * 160 + 80 }, dir: 'TB' };
  }

  const entry = nodePositions[`step_${stepOrder[0]}`] ?? stepPoints[0];
  const minX = Math.min(...stepPoints.map((p) => p.x));
  const maxX = Math.max(...stepPoints.map((p) => p.x));
  const minY = Math.min(...stepPoints.map((p) => p.y));
  const maxY = Math.max(...stepPoints.map((p) => p.y));

  const isHorizontal = maxX - minX >= maxY - minY;
  if (isHorizontal) {
    return {
      start: { x: entry.x - START_GAP, y: entry.y },
      end: { x: maxX + END_GAP, y: pointAt(stepPoints, 'x', maxX).y },
      dir: 'LR',
    };
  }
  return {
    start: { x: entry.x, y: entry.y - START_GAP / 2 },
    end: { x: pointAt(stepPoints, 'y', maxY).x, y: maxY + END_GAP / 2 },
    dir: 'TB',
  };
}

function resolveStoredEndpoints(
  nodePositions: Record<string, CanvasPoint>
): SimEndpoints | null {
  const start = nodePositions[EDIT_START_KEY];
  const end = nodePositions[EDIT_END_KEY];
  if (!start || !end) return null;
  const dir = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y) ? 'LR' : 'TB';
  return { start, end, dir };
}

function pointAt(points: CanvasPoint[], axis: 'x' | 'y', value: number): CanvasPoint {
  return points.find((p) => p[axis] === value) ?? points[points.length - 1];
}
