import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { AssignToType } from '@/types/WorkflowTypes';
import { ASSIGN_TO_LABELS } from '@/services/taskAssignment';

export interface EditStepData extends Record<string, unknown> {
  stepId: string;
  name: string;
  sequenceNo: number;
  assignTo: AssignToType;
  assigneeName: string | null;
  isSelected: boolean;
  hasError: boolean;
  slaSummary: string | null;
  /** "ALL" / "WAIT ALL" when the step declares concurrent control flow (DP-1), else null. */
  controlFlowSummary: string | null;
  /** The same semantics spelled out, for the badge tooltip. */
  controlFlowDescription: string | null;
}

export function EditStepNode({ data }: NodeProps) {
  const stepData = data as EditStepData;
  const isSelected = stepData.isSelected ?? false;

  return (
    <div style={buildContainerStyle(isSelected, stepData.hasError ?? false)}>
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={handleStyle}
        isConnectable
      />

      <div style={headerStyle}>
        <span style={seqBadgeStyle}>{stepData.sequenceNo}</span>
        <span style={stepNameStyle}>{stepData.name || 'Unnamed Step'}</span>
        {stepData.controlFlowSummary && (
          <span style={controlFlowBadgeStyle} title={stepData.controlFlowDescription ?? undefined}>
            ⧉ {stepData.controlFlowSummary}
          </span>
        )}
      </div>

      <div style={bodyStyle}>
        <span style={buildAssignChipStyle(stepData.assignTo)}>
          {ASSIGN_TO_LABELS[stepData.assignTo]}
        </span>
        {stepData.assigneeName && (
          <span style={assigneeNameStyle}>{stepData.assigneeName}</span>
        )}
        {stepData.slaSummary && (
          <span style={slaBadgeStyle} title={stepData.slaSummary}>{stepData.slaSummary}</span>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={handleStyle}
        isConnectable
      />
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


function buildAssignChipStyle(assignTo: EditStepData['assignTo']): React.CSSProperties {
  const colorMap: Record<EditStepData['assignTo'], string> = {
    user: '#1d4ed8',
    team: '#065f46',
    readFromParent: '#9a3412',
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

const controlFlowBadgeStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '2px 6px',
  borderRadius: 4,
  background: '#4c1d95',
  border: '1px solid #7c3aed',
  color: '#ddd6fe',
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const slaBadgeStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: 99,
  background: '#78350f',
  border: '1px solid #b45309',
  color: '#fcd34d',
  fontSize: 10,
  fontWeight: 600,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '100%',
};

const handleStyle: React.CSSProperties = {
  background: '#64748b',
  width: 10,
  height: 10,
  border: '2px solid #fff',
  borderRadius: '50%',
};
