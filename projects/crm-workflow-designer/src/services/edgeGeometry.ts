import type { CanvasPoint } from './designerLayout';

/**
 * A quadratic bezier whose apex passes THROUGH `through`. The naive
 * `Q through` only bends toward the point; solving for the control that puts
 * the curve's midpoint on it is `2T − (S+E)/2`.
 */
export function pathThroughPoint(
  source: CanvasPoint,
  target: CanvasPoint,
  through: CanvasPoint
): string {
  const cx = 2 * through.x - (source.x + target.x) / 2;
  const cy = 2 * through.y - (source.y + target.y) / 2;
  return `M ${source.x},${source.y} Q ${cx},${cy} ${target.x},${target.y}`;
}

/** The point at parameter t on that curve — used to place the label. */
export function pointOnPathThrough(
  source: CanvasPoint,
  target: CanvasPoint,
  through: CanvasPoint,
  t: number
): CanvasPoint {
  const cx = 2 * through.x - (source.x + target.x) / 2;
  const cy = 2 * through.y - (source.y + target.y) / 2;
  const mt = 1 - t;
  return {
    x: mt * mt * source.x + 2 * mt * t * cx + t * t * target.x,
    y: mt * mt * source.y + 2 * mt * t * cy + t * t * target.y,
  };
}
