import { BaseEdge } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';

// Top-curving bezier for back-edges (outcome that targets an earlier step).
// In LR layout the source is to the RIGHT of the target, so we arc ABOVE
// all nodes to avoid crossing the main horizontal flow.
export function EditBackEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  style,
}: EdgeProps) {
  const topY = Math.min(sourceY, targetY) - 100;

  const path = [
    `M ${sourceX},${sourceY}`,
    `C ${sourceX},${topY}`,
    `  ${targetX},${topY}`,
    `  ${targetX},${targetY}`,
  ].join(' ');

  return <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />;
}
