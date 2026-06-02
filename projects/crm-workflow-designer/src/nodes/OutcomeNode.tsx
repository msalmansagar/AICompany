import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { OutcomeNodeData } from '@/store/selectors';

const OUTCOME_COLOR_MAP: Record<string, { bg: string; border: string; text: string }> = {
  approved: { bg: '#f0fdf4', border: '#86efac', text: '#15803d' },
  pass: { bg: '#f0fdf4', border: '#86efac', text: '#15803d' },
  rejected: { bg: '#fef2f2', border: '#fca5a5', text: '#dc2626' },
  fail: { bg: '#fef2f2', border: '#fca5a5', text: '#dc2626' },
  decline: { bg: '#fef2f2', border: '#fca5a5', text: '#dc2626' },
  escalate: { bg: '#fff7ed', border: '#fdba74', text: '#ea580c' },
  escalation: { bg: '#fff7ed', border: '#fdba74', text: '#ea580c' },
};

const DEFAULT_COLOR = { bg: '#eff6ff', border: '#93c5fd', text: '#1d4ed8' };

function resolveOutcomeColor(name: string): { bg: string; border: string; text: string } {
  const lower = name.toLowerCase();
  for (const [key, colors] of Object.entries(OUTCOME_COLOR_MAP)) {
    if (lower.includes(key)) return colors;
  }
  return DEFAULT_COLOR;
}

export function OutcomeNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as OutcomeNodeData;
  const colors = resolveOutcomeColor(nodeData.name);

  return (
    <div style={containerStyle(colors, selected ?? false)}>
      <Handle
        type="target"
        position={Position.Left}
        id="target-left"
        style={handleStyle}
      />

      <div style={contentStyle}>
        <span style={nameStyle(colors)}>{nodeData.name}</span>
        <span style={sequenceStyle}>{nodeData.sequenceNumber}</span>
        {nodeData.applyFilter && <span style={filterBadgeStyle}>Filter</span>}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="source-right"
        style={handleStyle}
      />
    </div>
  );
}

function containerStyle(
  colors: { bg: string; border: string; text: string },
  selected: boolean
): React.CSSProperties {
  return {
    background: colors.bg,
    border: selected ? `2px solid ${colors.text}` : `1px solid ${colors.border}`,
    borderRadius: 20,
    padding: '4px 12px',
    display: 'flex',
    alignItems: 'center',
    minWidth: 80,
    boxShadow: selected ? `0 0 0 3px ${colors.border}` : '0 1px 4px rgba(0,0,0,0.08)',
    transition: 'border-color 0.15s',
  };
}

const contentStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

function nameStyle(colors: { text: string }): React.CSSProperties {
  return {
    fontSize: 12,
    fontWeight: 600,
    color: colors.text,
    whiteSpace: 'nowrap',
  };
}

const sequenceStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#94a3b8',
  fontWeight: 500,
};

const filterBadgeStyle: React.CSSProperties = {
  fontSize: 9,
  background: '#fef3c7',
  color: '#92400e',
  border: '1px solid #fde68a',
  borderRadius: 4,
  padding: '0 4px',
};

const handleStyle: React.CSSProperties = {
  background: '#94a3b8',
  width: 10,
  height: 10,
};
