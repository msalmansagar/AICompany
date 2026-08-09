import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { AssignToType } from '@/types/WorkflowTypes';
import { ASSIGN_TO_ACCENTS, ASSIGN_TO_LABELS as ASSIGN_LABELS } from '@/services/taskAssignment';

export type SimStepStatus = 'active' | 'visited' | 'unreached';

export interface SimStepData extends Record<string, unknown> {
  stepId: string;
  name: string;
  sequenceNo: number;
  assignTo: AssignToType;
  assigneeName: string | null;
  simStatus: SimStepStatus;
  monochrome?: boolean;
}

export function SimStepNode({ data }: NodeProps) {
  const d = data as SimStepData;
  const mono = d.monochrome ?? false;

  return (
    <div style={buildContainerStyle(d.simStatus, mono)}>
      {d.simStatus === 'active' && (
        <style>{`
          @keyframes simPulse {
            0%, 100% { box-shadow: 0 0 0 3px rgba(37,99,235,0.4); }
            50% { box-shadow: 0 0 0 8px rgba(37,99,235,0.08); }
          }
        `}</style>
      )}

      <Handle type="target" position={Position.Top} id="in" style={handleStyle} isConnectable={false} />

      <div style={buildHeaderStyle(d.simStatus, mono)}>
        <span style={seqBadgeStyle}>{d.sequenceNo}</span>
        <span style={stepNameStyle}>{d.name || 'Unnamed Step'}</span>
        {d.simStatus === 'visited' && (
          <span style={{ ...visitedBadgeStyle, color: mono ? 'var(--text-secondary)' : 'var(--success)' }}>✓</span>
        )}
        {d.simStatus === 'active' && <span style={activePipStyle} />}
      </div>

      <div style={bodyStyle}>
        <span style={buildChipStyle(d.assignTo, mono)}>{ASSIGN_LABELS[d.assignTo]}</span>
        {d.assigneeName && <span style={assigneeStyle}>{d.assigneeName}</span>}
      </div>

      <Handle type="source" position={Position.Bottom} id="out" style={handleStyle} isConnectable={false} />
    </div>
  );
}

function buildContainerStyle(status: SimStepStatus, mono: boolean): React.CSSProperties {
  const base: React.CSSProperties = {
    width: 260,
    background: 'var(--surface)',
    borderRadius: 8,
    cursor: 'default',
    overflow: 'hidden',
  };
  if (status === 'active') {
    return { ...base, border: '2px solid var(--primary)', animation: 'simPulse 1.8s ease-in-out infinite' };
  }
  if (status === 'visited') {
    return {
      ...base,
      border: `2px solid ${mono ? 'var(--border)' : 'var(--success)'}`,
      opacity: mono ? 0.8 : 0.72,
      boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    };
  }
  return { ...base, border: '1.5px solid var(--border-strong)', opacity: mono ? 0.22 : 0.38, boxShadow: 'none' };
}

function buildHeaderStyle(status: SimStepStatus, mono: boolean): React.CSSProperties {
  const bgMap: Record<SimStepStatus, string> = {
    active: 'var(--primary-pressed)',
    visited: mono ? 'var(--text)' : 'var(--success)',
    unreached: 'var(--text)',
  };
  return { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: bgMap[status] };
}

function buildChipStyle(assignTo: SimStepData['assignTo'], mono: boolean): React.CSSProperties {
  return {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 99,
    background: mono ? 'var(--surface-alt)' : ASSIGN_TO_ACCENTS[assignTo],
    color: 'var(--text-on-primary)',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.03em',
    flexShrink: 0,
  };
}

const seqBadgeStyle: React.CSSProperties = {
  minWidth: 20,
  height: 20,
  borderRadius: 4,
  background: 'rgba(255,255,255,0.15)',
  color: 'var(--text-disabled)',
  fontSize: 10,
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const stepNameStyle: React.CSSProperties = {
  color: 'var(--text)',
  fontSize: 12,
  fontWeight: 600,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
};

const visitedBadgeStyle: React.CSSProperties = {
  color: 'var(--success)',
  fontSize: 14,
  fontWeight: 700,
  flexShrink: 0,
};

const activePipStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: 'var(--primary-tint)',
  flexShrink: 0,
};

const bodyStyle: React.CSSProperties = {
  padding: '8px 10px',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
};

const assigneeStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-secondary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
};

const handleStyle: React.CSSProperties = {
  background: 'var(--neutral-chip)',
  width: 10,
  height: 10,
  border: '2px solid var(--border)',
  borderRadius: '50%',
};
