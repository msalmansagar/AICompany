import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { StepNodeData } from '@/store/selectors';

export function StepNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as StepNodeData;

  return (
    <div style={containerStyle(selected ?? false)}>
      <Handle
        type="target"
        position={Position.Top}
        id="target-top"
        style={handleStyle}
      />

      <div style={headerStyle}>
        <span style={sequenceBadgeStyle}>{nodeData.sequenceNo}</span>
        <span style={nameStyle}>{nodeData.name}</span>
      </div>

      <div style={badgesRowStyle}>
        {nodeData.assignTo === 'user' && nodeData.assignedUserName && (
          <span style={userBadgeStyle}>User: {nodeData.assignedUserName}</span>
        )}
        {nodeData.assignTo === 'team' && nodeData.teamName && (
          <span style={teamBadgeStyle}>Team: {nodeData.teamName}</span>
        )}
        {nodeData.recordEntity && (
          <span style={entityBadgeStyle}>{nodeData.recordEntity}</span>
        )}
      </div>

      <div style={statusRowStyle}>
        <span style={statusDotStyle(selected ?? false)} />
        <span style={statusLabelStyle}>{selected ? 'Selected' : 'Step'}</span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        id="source-bottom"
        style={handleStyle}
      />
    </div>
  );
}

function containerStyle(selected: boolean): React.CSSProperties {
  return {
    background: '#fff',
    border: selected ? '2px solid #2563eb' : '1px solid #e2e8f0',
    borderRadius: 8,
    padding: '10px 14px',
    minWidth: 180,
    maxWidth: 240,
    boxShadow: selected
      ? '0 0 0 3px rgba(37, 99, 235, 0.2)'
      : '0 2px 6px rgba(0,0,0,0.08)',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    fontFamily: 'inherit',
  };
}

const handleStyle: React.CSSProperties = {
  background: '#94a3b8',
  width: 10,
  height: 10,
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 6,
};

const sequenceBadgeStyle: React.CSSProperties = {
  background: '#2563eb',
  color: '#fff',
  borderRadius: 4,
  fontSize: 10,
  fontWeight: 700,
  padding: '1px 6px',
  flexShrink: 0,
};

const nameStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#1e293b',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const badgesRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
  marginBottom: 4,
};

const userBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  background: '#eff6ff',
  color: '#1d4ed8',
  border: '1px solid #bfdbfe',
  borderRadius: 4,
  padding: '1px 6px',
};

const teamBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  background: '#f0fdf4',
  color: '#15803d',
  border: '1px solid #bbf7d0',
  borderRadius: 4,
  padding: '1px 6px',
};

const entityBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  background: '#faf5ff',
  color: '#7e22ce',
  border: '1px solid #e9d5ff',
  borderRadius: 4,
  padding: '1px 6px',
};

const statusRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
};

function statusDotStyle(selected: boolean): React.CSSProperties {
  return {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: selected ? '#2563eb' : '#94a3b8',
  };
}

const statusLabelStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#64748b',
};
