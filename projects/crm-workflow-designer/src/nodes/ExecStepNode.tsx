import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { getAssignToLabel } from '../types/ViewTypes';
import type { ExecStepData } from '../services/ExecutiveGraphBuilder';
import type { LayoutDir } from '../services/WorkflowGraphBuilder';

const ASSIGN_ACCENT: Record<string, string> = {
  'Specific User': '#2563eb',
  'Team':          '#16a34a',
  'Round Robin':   '#7c3aed',
};

export function ExecStepNode({ data, selected }: NodeProps) {
  const { step, layoutDir } = data as unknown as ExecStepData;
  const isLR = (layoutDir as LayoutDir | undefined) === 'LR';
  const assignLabel = getAssignToLabel(step.assignToCode);
  const accentColor = ASSIGN_ACCENT[assignLabel] ?? '#6366f1';

  return (
    <div style={container(selected ?? false, accentColor)}>
      <Handle
        type="target"
        position={isLR ? Position.Left : Position.Top}
        id="in"
        style={handleStyle(accentColor)}
      />

      <div style={accentBar(accentColor)} />

      <div style={body}>
        <div style={header}>
          <span style={seqBadge(accentColor)}>{step.sequenceNo}</span>
          <span style={nameText}>{step.name || 'Unnamed Step'}</span>
        </div>
        <div style={chipRow}>
          <span style={chip(accentColor)}>{assignLabel}</span>
          {(assignLabel === 'Specific User' ? step.assignedUserName
            : assignLabel === 'Team' ? step.teamName
            : step.roundRobinTeamName) && (
            <span style={ownerChip}>
              {truncate(
                (assignLabel === 'Specific User' ? step.assignedUserName
                  : assignLabel === 'Team' ? step.teamName
                  : step.roundRobinTeamName) ?? '',
                24
              )}
            </span>
          )}
        </div>
      </div>

      <Handle
        type="source"
        position={isLR ? Position.Right : Position.Bottom}
        id="out"
        style={handleStyle(accentColor)}
      />
    </div>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function handleStyle(color: string): React.CSSProperties {
  return { background: color, width: 10, height: 10, border: '2px solid #fff', borderRadius: '50%' };
}

function container(selected: boolean, accent: string): React.CSSProperties {
  return {
    width: 300,
    height: 78,
    background: '#fff',
    border: selected ? `2px solid ${accent}` : '1.5px solid #e2e8f0',
    borderRadius: 8,
    boxShadow: selected
      ? `0 0 0 3px ${accent}26, 0 4px 12px rgba(0,0,0,0.1)`
      : '0 3px 10px rgba(0,0,0,0.08)',
    display: 'flex',
    alignItems: 'stretch',
    overflow: 'hidden',
    cursor: 'pointer',
    transition: 'border-color 0.12s, box-shadow 0.12s',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  };
}

function accentBar(color: string): React.CSSProperties {
  return {
    width: 5,
    background: color,
    flexShrink: 0,
    borderRadius: '6px 0 0 6px',
  };
}

const body: React.CSSProperties = {
  flex: 1,
  padding: '10px 12px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: 6,
  minWidth: 0,
};

const header: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
};

function seqBadge(color: string): React.CSSProperties {
  return {
    background: color,
    color: '#fff',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 700,
    padding: '1px 7px',
    flexShrink: 0,
    lineHeight: '16px',
  };
}

const nameText: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: '#0f172a',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
};

const chipRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
};

function chip(color: string): React.CSSProperties {
  return {
    display: 'inline-block',
    fontSize: 10,
    fontWeight: 500,
    background: `${color}14`,
    color,
    border: `1px solid ${color}33`,
    borderRadius: 4,
    padding: '1px 7px',
    flexShrink: 0,
  };
}

const ownerChip: React.CSSProperties = {
  fontSize: 10,
  color: '#64748b',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
