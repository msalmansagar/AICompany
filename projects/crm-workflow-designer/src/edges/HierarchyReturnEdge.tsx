import { BaseEdge, EdgeLabelRenderer } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import type { HierarchyReturnEdgeData } from '@/services/HierarchyGraphBuilder';

/**
 * A return drawn the only way the org chart can afford one: out of the card's
 * quiet side, along its own lane in the outer gutter, and back in at the
 * target — never through the tree. Each return owns a lane, so showing all
 * of them at once stays readable.
 */
export function HierarchyReturnEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: EdgeProps) {
  const edge = data as unknown as HierarchyReturnEdgeData;
  const isTB = edge.layoutDir !== 'LR';
  const gutter = edge.gutter;
  const radius = 10;

  // TB: travel horizontally to the gutter x, vertically along it, back in.
  // LR: the same journey with the axes swapped (the gutter is a y above).
  const path = isTB
    ? orthogonalPath(sourceX, sourceY, targetX, targetY, gutter, radius, 'x')
    : orthogonalPath(sourceX, sourceY, targetX, targetY, gutter, radius, 'y');

  const labelPosition = isTB
    ? { x: gutter, y: (sourceY + targetY) / 2 }
    : { x: (sourceX + targetX) / 2, y: gutter };

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: 'var(--accent-branch)',
          strokeWidth: 1.6,
          strokeDasharray: '6 4',
          fill: 'none',
        }}
        markerEnd="url(#hier-return-arrow)"
      />
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <marker
            id="hier-return-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent-branch)" />
          </marker>
        </defs>
      </svg>
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelPosition.x}px, ${labelPosition.y}px)`,
            background: 'var(--accent-branch-bg)',
            color: 'var(--accent-branch)',
            border: '1px solid var(--accent-branch)',
            borderRadius: 999,
            padding: '2px 9px',
            fontSize: 10.5,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
          className="nodrag nopan"
        >
          ↩ {edge.label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

/**
 * Rounded three-segment orthogonal path through a lane.
 * axis 'x': the lane is a vertical line at `lane` (TB trees).
 * axis 'y': the lane is a horizontal line at `lane` (LR trees).
 */
function orthogonalPath(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  lane: number,
  radius: number,
  axis: 'x' | 'y'
): string {
  if (axis === 'x') {
    const dirIn = Math.sign(lane - sx) || -1; // toward the lane
    const dirAlong = Math.sign(ty - sy) || -1; // along the lane
    const dirOut = Math.sign(tx - lane) || 1; // lane to target
    const r1 = Math.min(radius, Math.abs(lane - sx), Math.abs(ty - sy) / 2);
    const r2 = Math.min(radius, Math.abs(tx - lane), Math.abs(ty - sy) / 2);
    return [
      `M ${sx} ${sy}`,
      `L ${lane + r1 * -dirIn} ${sy}`,
      `Q ${lane} ${sy} ${lane} ${sy + r1 * dirAlong}`,
      `L ${lane} ${ty - r2 * dirAlong}`,
      `Q ${lane} ${ty} ${lane + r2 * dirOut} ${ty}`,
      `L ${tx} ${ty}`,
    ].join(' ');
  }
  const dirIn = Math.sign(lane - sy) || -1;
  const dirAlong = Math.sign(tx - sx) || -1;
  const dirOut = Math.sign(ty - lane) || 1;
  const r1 = Math.min(radius, Math.abs(lane - sy), Math.abs(tx - sx) / 2);
  const r2 = Math.min(radius, Math.abs(ty - lane), Math.abs(tx - sx) / 2);
  return [
    `M ${sx} ${sy}`,
    `L ${sx} ${lane + r1 * -dirIn}`,
    `Q ${sx} ${lane} ${sx + r1 * dirAlong} ${lane}`,
    `L ${tx - r2 * dirAlong} ${lane}`,
    `Q ${tx} ${lane} ${tx} ${lane + r2 * dirOut}`,
    `L ${tx} ${ty}`,
  ].join(' ');
}
