import { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { useWorkflowStore } from '@/store/workflowStore';

export interface EditStepData extends Record<string, unknown> {
  stepId: string;
  name: string;
  sequenceNo: number;
  assignTo: 'user' | 'team' | 'roundRobin';
  assigneeName: string | null;
  isSelected: boolean;
  hasError: boolean;
}

const ASSIGN_TO_LABELS: Record<EditStepData['assignTo'], string> = {
  user: 'Specific User',
  team: 'Team',
  roundRobin: 'Round Robin',
};

export function EditStepNode({ data }: NodeProps) {
  const stepData = data as EditStepData;
  const isSelected = stepData.isSelected ?? false;
  const [plusHover, setPlusHover] = useState(false);

  const addStepAfter = useWorkflowStore((s) => s.addStepAfter);

  const handlePlusClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    addStepAfter(stepData.stepId);
  };

  return (
    <div style={buildContainerStyle(isSelected, stepData.hasError ?? false)}>
      <Handle
        type="target"
        position={Position.Top}
        id="in"
        style={handleStyle}
        isConnectable
      />

      <div style={headerStyle}>
        <span style={seqBadgeStyle}>{stepData.sequenceNo}</span>
        <span style={stepNameStyle}>{stepData.name || 'Unnamed Step'}</span>
      </div>

      <div style={bodyStyle}>
        <span style={buildAssignChipStyle(stepData.assignTo)}>
          {ASSIGN_TO_LABELS[stepData.assignTo]}
        </span>
        {stepData.assigneeName && (
          <span style={assigneeNameStyle}>{stepData.assigneeName}</span>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        id="out"
        style={handleStyle}
        isConnectable
      />

      {/* Add next step button */}
      <button
        type="button"
        title="Add next step"
        onClick={handlePlusClick}
        onMouseEnter={() => setPlusHover(true)}
        onMouseLeave={() => setPlusHover(false)}
        style={buildPlusStyle(plusHover)}
      >
        +
      </button>
    </div>
  );
}

function buildContainerStyle(isSelected: boolean, hasError: boolean): React.CSSProperties {
  const borderColor = hasError ? '#ef4444' : isSelected ? '#2563eb' : '#334155';
  const borderWidth = hasError || isSelected ? '2px' : '1.5px';
  const boxShadow = hasError
    ? '0 0 0 3px rgba(239,68,68,0.18), 0 2px 8px rgba(0,0,0,0.12)'
    : isSelected
    ? '0 0 0 3px rgba(37,99,235,0.2)'
    : '0 2px 8px rgba(0,0,0,0.12)';
  return {
    width: 260,
    background: hasError ? '#fff8f8' : '#fff',
    border: `${borderWidth} solid ${borderColor}`,
    borderRadius: 8,
    overflow: 'visible',
    boxShadow,
    cursor: 'pointer',
    position: 'relative',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  };
}

function buildPlusStyle(hover: boolean): React.CSSProperties {
  return {
    position: 'absolute',
    bottom: -34,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: hover ? '#1d4ed8' : '#2563eb',
    color: '#fff',
    border: '2px solid #fff',
    boxShadow: hover
      ? '0 2px 8px rgba(37,99,235,0.5)'
      : '0 1px 4px rgba(37,99,235,0.35)',
    fontSize: 16,
    lineHeight: '18px',
    textAlign: 'center',
    cursor: 'pointer',
    padding: 0,
    zIndex: 10,
    transition: 'background 0.12s, box-shadow 0.12s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 400,
  };
}

function buildAssignChipStyle(assignTo: EditStepData['assignTo']): React.CSSProperties {
  const colorMap: Record<EditStepData['assignTo'], string> = {
    user: '#1d4ed8',
    team: '#065f46',
    roundRobin: '#6b21a8',
  };
  return {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 99,
    background: colorMap[assignTo],
    color: '#fff',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.03em',
    flexShrink: 0,
  };
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 10px',
  background: '#1e293b',
};

const seqBadgeStyle: React.CSSProperties = {
  minWidth: 20,
  height: 20,
  borderRadius: 4,
  background: '#334155',
  color: '#94a3b8',
  fontSize: 10,
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const stepNameStyle: React.CSSProperties = {
  color: '#f1f5f9',
  fontSize: 12,
  fontWeight: 600,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
};

const bodyStyle: React.CSSProperties = {
  padding: '8px 10px',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
};

const assigneeNameStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#475569',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
};

const handleStyle: React.CSSProperties = {
  background: '#64748b',
  width: 10,
  height: 10,
  border: '2px solid #fff',
  borderRadius: '50%',
};
