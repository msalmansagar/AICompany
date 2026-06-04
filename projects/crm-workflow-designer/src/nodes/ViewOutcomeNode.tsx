import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { ViewOutcomeData } from '../services/WorkflowGraphBuilder';

const COLOR_MAP: Record<string, { bg: string; border: string; text: string }> = {
  approved: { bg: '#f0fdf4', border: '#86efac', text: '#15803d' },
  pass: { bg: '#f0fdf4', border: '#86efac', text: '#15803d' },
  complete: { bg: '#f0fdf4', border: '#86efac', text: '#15803d' },
  success: { bg: '#f0fdf4', border: '#86efac', text: '#15803d' },
  reject: { bg: '#fef2f2', border: '#fca5a5', text: '#dc2626' },
  rejected: { bg: '#fef2f2', border: '#fca5a5', text: '#dc2626' },
  fail: { bg: '#fef2f2', border: '#fca5a5', text: '#dc2626' },
  decline: { bg: '#fef2f2', border: '#fca5a5', text: '#dc2626' },
  escalate: { bg: '#fff7ed', border: '#fdba74', text: '#ea580c' },
  pending: { bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
};

const DEFAULT_COLORS = { bg: '#eff6ff', border: '#93c5fd', text: '#1d4ed8' };
const NO_NEXT_COLORS = { bg: '#f8fafc', border: '#cbd5e1', text: '#64748b' };

function pickColors(name: string, hasNoNextStep: boolean) {
  if (hasNoNextStep) return NO_NEXT_COLORS;
  const lower = name.toLowerCase();
  for (const [key, colors] of Object.entries(COLOR_MAP)) {
    if (lower.includes(key)) return colors;
  }
  return DEFAULT_COLORS;
}

export function ViewOutcomeNode({ data, selected }: NodeProps) {
  const { outcome, hasNoNextStep } = data as unknown as ViewOutcomeData;
  const colors = pickColors(outcome.name, hasNoNextStep);

  return (
    <div style={containerStyle(colors, selected ?? false, hasNoNextStep)}>
      <Handle type="target" position={Position.Left} id="left" style={handleStyle(colors.text)} />

      <div style={contentStyle}>
        <span style={nameStyle(colors.text)}>{outcome.name || 'Outcome'}</span>
        <span style={seqStyle}>{outcome.sequenceNumber}</span>
        {outcome.applyFilter && (
          <span style={filterBadge} title="FetchXML conditional filter active">F</span>
        )}
        {hasNoNextStep && (
          <span style={noNextBadge} title="No next step defined">–</span>
        )}
      </div>

      <Handle type="source" position={Position.Right} id="right" style={handleStyle(colors.text)} />
    </div>
  );
}

function handleStyle(color: string): React.CSSProperties {
  return { background: color, width: 12, height: 12, border: '2px solid #fff', borderRadius: '50%' };
}

function containerStyle(
  colors: { bg: string; border: string; text: string },
  selected: boolean,
  hasNoNextStep: boolean
): React.CSSProperties {
  return {
    background: colors.bg,
    border: hasNoNextStep
      ? '1.5px dashed #cbd5e1'
      : selected
      ? `2px solid ${colors.text}`
      : `1.5px solid ${colors.border}`,
    borderRadius: 20,
    padding: '5px 14px',
    display: 'flex',
    alignItems: 'center',
    minWidth: 110,
    maxWidth: 140,
    boxShadow: selected && !hasNoNextStep ? `0 0 0 3px ${colors.border}` : '0 1px 4px rgba(0,0,0,0.07)',
    opacity: hasNoNextStep ? 0.8 : 1,
    cursor: 'pointer',
    transition: 'border-color 0.12s',
    fontFamily: 'inherit',
  };
}

const contentStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' };

function nameStyle(color: string): React.CSSProperties {
  return {
    fontSize: 12,
    fontWeight: 600,
    color,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: 80,
  };
}

const seqStyle: React.CSSProperties = { fontSize: 10, color: '#94a3b8', fontWeight: 500, flexShrink: 0 };

const filterBadge: React.CSSProperties = {
  fontSize: 9,
  background: '#fef3c7',
  color: '#92400e',
  border: '1px solid #fde68a',
  borderRadius: 3,
  padding: '0 4px',
  fontWeight: 700,
  flexShrink: 0,
};

const noNextBadge: React.CSSProperties = {
  fontSize: 10,
  color: '#94a3b8',
  flexShrink: 0,
};
