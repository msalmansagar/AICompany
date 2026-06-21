import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
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
  const deleteOutcome = useWorkflowStore((s) => s.deleteOutcome);
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
  const isFallback = edgeData?.isFallback ?? false;
  const isConditional = hasFilter;

  const strokeColor = selected ? '#2563eb' : isFallback ? '#16a34a' : isConditional ? '#d97706' : '#64748b';
  const strokeDasharray = isFallback ? '4 4' : isConditional ? '6 3' : undefined;

  function handleDeleteClick(event: React.MouseEvent): void {
    event.stopPropagation();
    const outcomeId = id.replace('outcome_', '');
    deleteOutcome(outcomeId);
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
            <span style={labelTextStyle(isConditional, isFallback)}>{edgeData.name}</span>
          )}
          {hasFilter && <span style={filterBadgeStyle}>FetchXML</span>}
          {isFallback && <span style={fallbackBadgeStyle}>ELSE</span>}
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

function labelTextStyle(isConditional: boolean, isFallback: boolean): React.CSSProperties {
  const color = isFallback ? '#166534' : isConditional ? '#92400e' : '#475569';
  const bg    = isFallback ? '#f0fdf4' : isConditional ? '#fef3c7' : '#f8fafc';
  const border = isFallback ? '#86efac' : isConditional ? '#fde68a' : '#e2e8f0';
  return {
    fontSize: 10,
    fontWeight: 600,
    color,
    background: bg,
    border: `1px solid ${border}`,
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

const fallbackBadgeStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  background: '#16a34a',
  color: '#fff',
  borderRadius: 4,
  padding: '0 5px',
  letterSpacing: '0.04em',
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
