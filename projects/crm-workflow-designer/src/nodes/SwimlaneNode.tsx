import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { getAssignToLabel } from '../types/ViewTypes';
import type { SwimStepData } from '../services/SwimlaneGraphBuilder';

// ─── Swimlane background band ──────────────────────────────────────────────

interface SwimlaneBackgroundData extends Record<string, unknown> {
  label: string;
  laneWidth: number;
  laneColor: string;
  laneBorder: string;
  laneTextColor: string;
}

export function SwimlaneNode({ data }: NodeProps) {
  const { label, laneWidth, laneColor, laneBorder, laneTextColor } =
    data as unknown as SwimlaneBackgroundData;

  return (
    <div
      style={{
        width: laneWidth,
        height: 140,
        background: laneColor,
        border: `1.5px solid ${laneBorder}`,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          writingMode: 'horizontal-tb',
          padding: '0 16px',
          fontSize: 11,
          fontWeight: 700,
          color: laneTextColor,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          width: 110,
          flexShrink: 0,
          borderRight: `1.5px solid ${laneBorder}`,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {label}
      </div>
    </div>
  );
}

// ─── Swimlane step node ────────────────────────────────────────────────────

const ASSIGN_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  'Specific User': { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  'Team':          { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  'Round Robin':   { bg: '#faf5ff', text: '#7e22ce', border: '#e9d5ff' },
};
const DEFAULT_ASSIGN = { bg: '#f8fafc', text: '#475569', border: '#e2e8f0' };

export function SwimStepNode({ data, selected }: NodeProps) {
  const { step, outcomeRows } = data as unknown as SwimStepData;
  const assignLabel = getAssignToLabel(step.assignToCode);
  const colors = ASSIGN_COLOR[assignLabel] ?? DEFAULT_ASSIGN;
  const assigneeName =
    assignLabel === 'Specific User' ? step.assignedUserName
    : assignLabel === 'Team'        ? step.teamName
    :                                 step.roundRobinTeamName;

  const forwardCount = outcomeRows.filter((r) => !r.isBackEdge && !r.isTerminal).length;
  const terminalCount = outcomeRows.filter((r) => r.isTerminal).length;
  const backCount = outcomeRows.filter((r) => r.isBackEdge).length;

  return (
    <div style={swimContainer(selected ?? false, colors.border)}>
      <Handle type="target" position={Position.Left}   id="left"   style={handle(colors.text)} />
      <Handle type="source" position={Position.Right}  id="right"  style={handle(colors.text)} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={handle('#7c3aed')} />
      <Handle type="target" position={Position.Bottom} id="bottom-t" style={handle('#7c3aed')} />

      <div style={swimHeader}>
        <span style={seqBadge(colors.text)}>{step.sequenceNo}</span>
        <span style={swimName}>{step.name || 'Unnamed Step'}</span>
      </div>

      <div style={swimChips}>
        <span style={chip(colors.bg, colors.text, colors.border)}>{assignLabel}</span>
        {assigneeName && (
          <span style={ownerText} title={assigneeName}>{truncate(assigneeName, 18)}</span>
        )}
      </div>

      <div style={swimFooter}>
        {forwardCount > 0 && <span style={badge('#16a34a')}>→ {forwardCount}</span>}
        {terminalCount > 0 && <span style={badge('#dc2626')}>⊘ {terminalCount}</span>}
        {backCount > 0     && <span style={badge('#7c3aed')}>↩ {backCount}</span>}
      </div>
    </div>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function handle(color: string): React.CSSProperties {
  return { background: color, width: 10, height: 10, border: '2px solid #fff', borderRadius: '50%' };
}

function swimContainer(selected: boolean, borderColor: string): React.CSSProperties {
  return {
    width: 240,
    height: 80,
    background: '#fff',
    border: selected ? '2px solid #2563eb' : `1.5px solid ${borderColor}`,
    borderRadius: 8,
    padding: '8px 12px',
    boxShadow: selected
      ? '0 0 0 3px rgba(37,99,235,0.15)'
      : '0 2px 6px rgba(0,0,0,0.07)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 4,
    cursor: 'pointer',
    transition: 'border-color 0.12s, box-shadow 0.12s',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  };
}

function seqBadge(color: string): React.CSSProperties {
  return {
    background: color, color: '#fff', borderRadius: 4,
    fontSize: 9, fontWeight: 700, padding: '1px 6px', flexShrink: 0,
  };
}

function chip(bg: string, color: string, border: string): React.CSSProperties {
  return {
    display: 'inline-block', fontSize: 9, fontWeight: 600,
    background: bg, color, border: `1px solid ${border}`,
    borderRadius: 4, padding: '0px 5px',
  };
}

function badge(color: string): React.CSSProperties {
  return {
    fontSize: 9, fontWeight: 700, color,
    background: `${color}14`, border: `1px solid ${color}33`,
    borderRadius: 4, padding: '1px 5px',
  };
}

const swimHeader: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 5 };
const swimName: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: '#0f172a',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
};
const swimChips: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 4 };
const ownerText: React.CSSProperties = { fontSize: 9, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const swimFooter: React.CSSProperties = { display: 'flex', gap: 4 };
