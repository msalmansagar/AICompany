import { BaseEdge, EdgeLabelRenderer } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';

interface EditBackEdgeData {
  label?: string;
  labelColor?: string;
}

// Top-curving bezier for back-edges (outcome that targets an earlier step).
// In LR layout the source is to the RIGHT of the target, so we arc ABOVE
// all nodes to avoid crossing the main horizontal flow.
export function EditBackEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
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

  const d = (data ?? {}) as EditBackEdgeData;
  // The label sits on the flat top of the arc, where nothing else is drawn.
  const labelX = (sourceX + targetX) / 2;
  const labelY = topY + 25;

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      {d.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'none',
              background: 'var(--surface-raised)',
              border: '1px solid var(--warning)',
              borderRadius: 4,
              padding: '2px 7px',
              fontSize: 10,
              fontFamily: '"Segoe UI", system-ui, sans-serif',
              color: d.labelColor ?? 'var(--warning)',
              whiteSpace: 'nowrap',
              zIndex: 10,
            }}
          >
            ↩ {d.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
