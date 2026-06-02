import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
} from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import { useState } from 'react';
import { useWorkflowStore } from '@/store/workflowStore';
import type { RouteEdgeData } from '@/store/selectors';

export function RouteEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  markerEnd,
}: EdgeProps) {
  const edgeData = data as unknown as RouteEdgeData | undefined;
  const [isHovered, setIsHovered] = useState(false);
  const { deleteElements } = useReactFlow();
  const isPreviewMode = useWorkflowStore((s) => s.isPreviewMode);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const hasFilter = edgeData?.hasFilter ?? false;
  const isConditional = hasFilter;

  const strokeColor = selected ? '#2563eb' : isConditional ? '#d97706' : '#64748b';
  const strokeDasharray = isConditional ? '6 3' : undefined;

  function handleDeleteClick(event: React.MouseEvent): void {
    event.stopPropagation();
    deleteElements({ edges: [{ id }] });
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: strokeColor,
          strokeWidth: selected ? 2.5 : 1.5,
          strokeDasharray,
          animation: isConditional ? 'dashFlow 0.5s linear infinite' : undefined,
        }}
      />

      <EdgeLabelRenderer>
        <div
          style={labelContainerStyle(labelX, labelY)}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {edgeData?.name && (
            <span style={labelTextStyle(isConditional)}>{edgeData.name}</span>
          )}
          {edgeData?.hasFilter && <span style={filterBadgeStyle}>FetchXML</span>}
          {isHovered && !isPreviewMode && (
            <button
              style={deleteButtonStyle}
              onClick={handleDeleteClick}
              aria-label={`Delete route ${edgeData?.name ?? ''}`}
            >
              x
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

function labelContainerStyle(x: number, y: number): React.CSSProperties {
  return {
    position: 'absolute',
    transform: `translate(-50%, -50%) translate(${x}px,${y}px)`,
    pointerEvents: 'all',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  };
}

function labelTextStyle(isConditional: boolean): React.CSSProperties {
  return {
    fontSize: 10,
    fontWeight: 600,
    color: isConditional ? '#92400e' : '#475569',
    background: isConditional ? '#fef3c7' : '#f8fafc',
    border: `1px solid ${isConditional ? '#fde68a' : '#e2e8f0'}`,
    borderRadius: 4,
    padding: '1px 6px',
  };
}

const filterBadgeStyle: React.CSSProperties = {
  fontSize: 9,
  background: '#d97706',
  color: '#fff',
  borderRadius: 4,
  padding: '0 4px',
};

const deleteButtonStyle: React.CSSProperties = {
  width: 16,
  height: 16,
  borderRadius: '50%',
  border: '1px solid #fca5a5',
  background: '#fef2f2',
  color: '#dc2626',
  fontSize: 10,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  lineHeight: 1,
};
