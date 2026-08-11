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
          <span style={detailBadgeStyle('var(--primary)', 'var(--primary-pressed)')}>{d.assignedUserName}</span>
        )}
        {d.assignTo === 'team' && d.teamName && (
          <span style={detailBadgeStyle('var(--success)', 'var(--success)')}>{d.teamName}</span>
        )}
        {d.assignTo === 'roundRobin' && d.roundRobinTeamName && (
          <span style={detailBadgeStyle('var(--accent-branch)', 'var(--accent-branch)')}>{d.roundRobinTeamName}</span>
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
    background: 'var(--surface)',
    border: hasError
      ? `2px solid var(--warning)`
      : selected
      ? '2px solid var(--primary)'
      : '1.5px solid var(--border)',
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
  background: 'var(--neutral-chip)',
  width: 14,
  height: 14,
  border: '2px solid var(--border)',
  borderRadius: '50%',
  top: -7,
};

const sourceHandleStyle: React.CSSProperties = {
  background: 'var(--primary)',
  width: 14,
  height: 14,
  border: '2px solid var(--border)',
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
  background: 'var(--primary)',
  color: 'var(--text-on-primary)',
  borderRadius: 4,
  fontSize: 10,
  fontWeight: 700,
  padding: '1px 6px',
  flexShrink: 0,
};

const nameStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
};

const warnIconStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--warning)',
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
  background: 'var(--surface-alt)',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border)',
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
  background: 'var(--accent-branch-bg)',
  color: 'var(--accent-branch)',
  border: '1px solid var(--accent-branch)',
  borderRadius: 4,
  padding: '1px 5px',
};
