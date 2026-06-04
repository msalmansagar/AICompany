import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { StepNodeData } from '@/store/selectors';

const ASSIGN_LABELS: Record<string, string> = {
  user: 'User',
  team: 'Team',
  roundRobin: 'Round Robin',
};

export function StepNode({ data, selected }: NodeProps) {
  const d = data as unknown as StepNodeData;

  return (
    <div style={containerStyle(selected ?? false, d.hasValidationError)}>
      <Handle type="target" position={Position.Top} id="target-top" style={targetHandleStyle} />

      <div style={headerStyle}>
        <span style={seqBadgeStyle}>{d.sequenceNo}</span>
        <span style={nameStyle}>{d.name}</span>
        {d.hasValidationError && <span style={warnIconStyle} title="Step has no outcomes">⚠</span>}
      </div>

      <div style={metaRowStyle}>
        <span style={assignBadgeStyle}>{ASSIGN_LABELS[d.assignTo] ?? d.assignTo}</span>
        {d.assignTo === 'user' && d.assignedUserName && (
          <span style={detailBadgeStyle('#eff6ff', '#1d4ed8')}>{d.assignedUserName}</span>
        )}
        {d.assignTo === 'team' && d.teamName && (
          <span style={detailBadgeStyle('#f0fdf4', '#15803d')}>{d.teamName}</span>
        )}
        {d.assignTo === 'roundRobin' && d.roundRobinTeamName && (
          <span style={detailBadgeStyle('#faf5ff', '#7e22ce')}>{d.roundRobinTeamName}</span>
        )}
      </div>

      {d.recordEntityName && (
        <div style={entityRowStyle}>
          <span style={entityBadgeStyle}>{d.recordEntityName}</span>
        </div>
      )}

      <Handle type="source" position={Position.Bottom} id="source-bottom" style={sourceHandleStyle} />
    </div>
  );
}

function containerStyle(selected: boolean, hasError: boolean): React.CSSProperties {
  return {
    background: '#fff',
    border: hasError
      ? `2px solid #f59e0b`
      : selected
      ? '2px solid #2563eb'
      : '1.5px solid #e2e8f0',
    borderRadius: 8,
    padding: '10px 14px',
    minWidth: 190,
    maxWidth: 260,
    boxShadow: selected
      ? '0 0 0 3px rgba(37,99,235,0.15)'
      : hasError
      ? '0 0 0 3px rgba(245,158,11,0.15)'
      : '0 2px 8px rgba(0,0,0,0.08)',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    fontFamily: 'inherit',
    cursor: 'pointer',
  };
}

const targetHandleStyle: React.CSSProperties = {
  background: '#94a3b8',
  width: 14,
  height: 14,
  border: '2px solid #fff',
  borderRadius: '50%',
  top: -7,
};

const sourceHandleStyle: React.CSSProperties = {
  background: '#2563eb',
  width: 14,
  height: 14,
  border: '2px solid #fff',
  borderRadius: '50%',
  bottom: -7,
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  marginBottom: 7,
};

const seqBadgeStyle: React.CSSProperties = {
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
  flex: 1,
};

const warnIconStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#f59e0b',
  flexShrink: 0,
};

const metaRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
  marginBottom: 4,
};

const assignBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  background: '#f1f5f9',
  color: '#475569',
  border: '1px solid #e2e8f0',
  borderRadius: 4,
  padding: '1px 5px',
  fontWeight: 500,
};

function detailBadgeStyle(bg: string, color: string): React.CSSProperties {
  return {
    fontSize: 10,
    background: bg,
    color,
    border: `1px solid ${color}33`,
    borderRadius: 4,
    padding: '1px 5px',
    maxWidth: 120,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };
}

const entityRowStyle: React.CSSProperties = {
  marginTop: 2,
};

const entityBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  background: '#faf5ff',
  color: '#7e22ce',
  border: '1px solid #e9d5ff',
  borderRadius: 4,
  padding: '1px 5px',
};
