import { getSmoothStepPath, EdgeLabelRenderer, BaseEdge } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';

export interface OutcomeEdgeData extends Record<string, unknown> {
  label?: string;
  isBackEdge?: boolean;
  labelColor?: string;
}

export function OutcomeEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  style,
}: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const d = (data ?? {}) as OutcomeEdgeData;

  // Place label at 72% along the straight-line path toward target.
  // Edges spread to distinct x/y positions by the time they reach the target,
  // so labels near the target avoid the overlap that occurs at the midpoint.
  const labelX = sourceX + (targetX - sourceX) * 0.72;
  const labelY = sourceY + (targetY - sourceY) * 0.72;

  const labelColor = d.labelColor ?? (d.isBackEdge ? '#fcd34d' : '#94a3b8');
  const labelBorder = d.isBackEdge ? '#92400e' : '#334155';

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {d.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'none',
              background: '#0f172a',
              border: `1px solid ${labelBorder}`,
              borderRadius: 4,
              padding: '2px 7px',
              fontSize: 10,
              fontFamily: '"Segoe UI", system-ui, sans-serif',
              color: labelColor,
              whiteSpace: 'nowrap',
              zIndex: 10,
            }}
          >
            {d.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
