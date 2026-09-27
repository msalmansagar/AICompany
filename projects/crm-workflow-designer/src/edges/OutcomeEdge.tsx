import { getBezierPath, EdgeLabelRenderer, BaseEdge } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import { useWorkflowStore, selectCanvasIsReadOnly } from '@/store/workflowStore';
import { pathThroughPoint, pointOnPathThrough } from '@/services/edgeGeometry';
import { useFlowPointerDrag } from '@/hooks/useFlowPointerDrag';

export interface OutcomeEdgeData extends Record<string, unknown> {
  label?: string;
  isBackEdge?: boolean;
  labelColor?: string;
}

/**
 * The outcome edge, FlowOn-grade: drag the grip to bend this one line through
 * a waypoint, drag the label to move it, double-click either to reset. Both
 * persist with the designer layout. Read-only canvases (simulation) render
 * the same geometry with the interactions off.
 */
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
  selected,
}: EdgeProps) {
  const anchor = useWorkflowStore((s) => s.edgeAnchors[id]);
  const labelOffset = useWorkflowStore((s) => s.labelOffsets[id]);
  const isReadOnly = useWorkflowStore(selectCanvasIsReadOnly);
  const setEdgeAnchor = useWorkflowStore((s) => s.setEdgeAnchor);
  const setLabelOffset = useWorkflowStore((s) => s.setLabelOffset);
  // The edit canvas tracks selection in the store (there is no onEdgesChange
  // wiring, so React Flow's own selected prop never fires for edges here).
  const isStoreSelected = useWorkflowStore((s) => s.selectedId === id);

  const source = { x: sourceX, y: sourceY };
  const target = { x: targetX, y: targetY };

  let edgePath: string;
  if (anchor) {
    edgePath = pathThroughPoint(source, target, anchor);
  } else {
    [edgePath] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
  }

  const d = (data ?? {}) as OutcomeEdgeData;

  // Label sits on the bend when bent; otherwise at 72% toward the target,
  // where fanned-out edges have separated and labels stop piling up.
  const labelBase = anchor
    ? pointOnPathThrough(source, target, anchor, 0.6)
    : { x: sourceX + (targetX - sourceX) * 0.72, y: sourceY + (targetY - sourceY) * 0.72 };
  const labelX = labelBase.x + (labelOffset?.dx ?? 0);
  const labelY = labelBase.y + (labelOffset?.dy ?? 0);

  const grip = anchor ?? { x: (sourceX + targetX) / 2, y: (sourceY + targetY) / 2 };
  const showGrip = !isReadOnly && (selected || isStoreSelected || Boolean(anchor));

  const insertStepBetween = useWorkflowStore((s) => s.insertStepBetween);
  // CWFD-016 B5: splicing a step into a transition is the most-used gesture
  // in BPM editors. The pill appears when the edge is selected; return edges
  // sit this one out — splicing a loop reads as rewiring, not inserting.
  const showInsert = !isReadOnly && !d.isBackEdge && isStoreSelected && id.startsWith('outcome_');
  const insertPoint = anchor ?? { x: (sourceX + targetX) / 2, y: (sourceY + targetY) / 2 };

  const anchorDrag = useFlowPointerDrag((point) => setEdgeAnchor(id, point));
  const labelDrag = useFlowPointerDrag((point) =>
    setLabelOffset(id, { dx: point.x - labelBase.x, dy: point.y - labelBase.y })
  );

  const labelColor = d.labelColor ?? (d.isBackEdge ? 'var(--warning)' : 'var(--text-secondary)');
  const labelBorder = d.isBackEdge ? 'var(--warning)' : 'var(--border-strong)';

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {d.label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: isReadOnly ? 'none' : 'all',
              cursor: isReadOnly ? 'default' : 'grab',
              background: 'var(--surface-raised)',
              border: `1px solid ${labelBorder}`,
              borderRadius: 4,
              padding: '2px 7px',
              fontSize: 10,
              fontFamily: '"Segoe UI", system-ui, sans-serif',
              color: labelColor,
              whiteSpace: 'nowrap',
              zIndex: 10,
              userSelect: 'none',
            }}
            title={isReadOnly ? undefined : 'Drag to move this label · double-click to reset'}
            onPointerDown={labelDrag.onPointerDown}
            onPointerMove={labelDrag.onPointerMove}
            onPointerUp={labelDrag.onPointerUp}
            onDoubleClick={() => setLabelOffset(id, null)}
          >
            {d.label}
          </div>
        </EdgeLabelRenderer>
      )}
      {showInsert && (
        <EdgeLabelRenderer>
          <button
            type="button"
            className="nodrag nopan"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${insertPoint.x}px,${insertPoint.y + 22}px)`,
              pointerEvents: 'all',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: 'var(--primary)',
              color: 'var(--text-on-primary)',
              border: 'none',
              borderRadius: 999,
              padding: '3px 10px',
              fontSize: 10.5,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 6px color-mix(in srgb, var(--text) 30%, transparent)',
              zIndex: 12,
              whiteSpace: 'nowrap',
            }}
            title="Splice a new step into this transition"
            onClick={(event) => {
              event.stopPropagation();
              insertStepBetween(id.slice('outcome_'.length));
            }}
          >
            + Insert step
          </button>
        </EdgeLabelRenderer>
      )}
      {showGrip && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${grip.x}px,${grip.y}px)`,
              pointerEvents: 'all',
              cursor: 'grab',
              width: 11,
              height: 11,
              borderRadius: '50%',
              background: anchor ? 'var(--primary)' : 'var(--surface)',
              border: '2px solid var(--primary)',
              boxShadow: '0 1px 3px color-mix(in srgb, var(--text) 25%, transparent)',
              zIndex: 11,
            }}
            title="Drag to bend this line · double-click to straighten"
            onPointerDown={anchorDrag.onPointerDown}
            onPointerMove={anchorDrag.onPointerMove}
            onPointerUp={anchorDrag.onPointerUp}
            onDoubleClick={() => setEdgeAnchor(id, null)}
          />
        </EdgeLabelRenderer>
      )}
    </>
  );
}
