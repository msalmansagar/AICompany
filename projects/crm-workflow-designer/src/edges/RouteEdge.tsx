import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
} from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import { useState } from 'react';
import { useWorkflowStore } from '@/store/workflowStore';
import type { RouteEdgeData } from '@/store/selectors';
import { routeLabelPair } from '@/styles/surfacePairs';
import type { RouteLabelKind } from '@/styles/surfacePairs';

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
  const labelKind: RouteLabelKind = isFallback ? 'fallback' : isConditional ? 'conditional' : 'plain';

  const strokeColor = selected ? 'var(--primary)' : isFallback ? 'var(--success)' : isConditional ? 'var(--warning)' : 'var(--text-secondary)';
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
            <span style={labelTextStyle(labelKind)}>{edgeData.name}</span>
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

function labelTextStyle(kind: RouteLabelKind): React.CSSProperties {
  const pair = routeLabelPair(kind);
  return {
    fontSize: 10,
    fontWeight: 600,
    color: pair.foreground,
    background: pair.background,
    border: `1px solid ${pair.border}`,
    borderRadius: 4,
    padding: '1px 6px',
  };
}

const filterBadgeStyle: React.CSSProperties = {
  fontSize: 9,
  background: 'var(--warning)',
  color: 'var(--text-on-primary)',
  borderRadius: 4,
  padding: '0 4px',
};

const fallbackBadgeStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  background: 'var(--success)',
  color: 'var(--text-on-primary)',
  borderRadius: 4,
  padding: '0 5px',
  letterSpacing: '0.04em',
};

const deleteButtonStyle: React.CSSProperties = {
  width: 16,
  height: 16,
  borderRadius: '50%',
  border: '1px solid var(--error)',
  background: 'var(--error-bg)',
  color: 'var(--error)',
  fontSize: 10,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  lineHeight: 1,
};
