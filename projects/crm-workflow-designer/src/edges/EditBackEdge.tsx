import { BaseEdge, EdgeLabelRenderer } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import { useWorkflowStore, selectCanvasIsReadOnly } from '@/store/workflowStore';
import { useFlowPointerDrag } from '@/hooks/useFlowPointerDrag';

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
}: EdgeProps & { id: string }) {
  const labelOffset = useWorkflowStore((s) => s.labelOffsets[id]);
  const isReadOnly = useWorkflowStore(selectCanvasIsReadOnly);
  const setLabelOffset = useWorkflowStore((s) => s.setLabelOffset);
  const topY = Math.min(sourceY, targetY) - 100;

  const path = [
    `M ${sourceX},${sourceY}`,
    `C ${sourceX},${topY}`,
    `  ${targetX},${topY}`,
    `  ${targetX},${targetY}`,
  ].join(' ');

  const d = (data ?? {}) as EditBackEdgeData;
  // The label sits on the flat top of the arc, where nothing else is drawn —
  // unless it was dragged somewhere better; the offset persists.
  const baseX = (sourceX + targetX) / 2;
  const baseY = topY + 25;
  const labelX = baseX + (labelOffset?.dx ?? 0);
  const labelY = baseY + (labelOffset?.dy ?? 0);
  const labelDrag = useFlowPointerDrag((point) =>
    setLabelOffset(id, { dx: point.x - baseX, dy: point.y - baseY })
  );

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      {d.label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            title={isReadOnly ? undefined : 'Drag to move this label · double-click to reset'}
            onPointerDown={labelDrag.onPointerDown}
            onPointerMove={labelDrag.onPointerMove}
            onPointerUp={labelDrag.onPointerUp}
            onDoubleClick={() => setLabelOffset(id, null)}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: isReadOnly ? 'none' : 'all',
              cursor: isReadOnly ? 'default' : 'grab',
              userSelect: 'none',
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
