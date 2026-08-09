import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { ViewOutcomeData } from '../services/WorkflowGraphBuilder';

const COLOR_MAP: Record<string, { bg: string; border: string; text: string }> = {
  approved: { bg: 'var(--success-bg)', border: 'var(--success)', text: 'var(--success)' },
  pass: { bg: 'var(--success-bg)', border: 'var(--success)', text: 'var(--success)' },
  complete: { bg: 'var(--success-bg)', border: 'var(--success)', text: 'var(--success)' },
  success: { bg: 'var(--success-bg)', border: 'var(--success)', text: 'var(--success)' },
  reject: { bg: 'var(--error-bg)', border: 'var(--error)', text: 'var(--error)' },
  rejected: { bg: 'var(--error-bg)', border: 'var(--error)', text: 'var(--error)' },
  fail: { bg: 'var(--error-bg)', border: 'var(--error)', text: 'var(--error)' },
  decline: { bg: 'var(--error-bg)', border: 'var(--error)', text: 'var(--error)' },
  escalate: { bg: 'var(--warning-bg)', border: 'var(--warning)', text: 'var(--warning)' },
  pending: { bg: 'var(--warning-bg)', border: 'var(--warning)', text: 'var(--warning)' },
};

const DEFAULT_COLORS = { bg: 'var(--primary-tint-2)', border: 'var(--primary-tint)', text: 'var(--primary-pressed)' };
const NO_NEXT_COLORS = { bg: 'var(--surface-alt)', border: 'var(--border-strong)', text: 'var(--text-secondary)' };

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
  return { background: color, width: 12, height: 12, border: '2px solid var(--border)', borderRadius: '50%' };
}

function containerStyle(
  colors: { bg: string; border: string; text: string },
  selected: boolean,
  hasNoNextStep: boolean
): React.CSSProperties {
  return {
    background: colors.bg,
    border: hasNoNextStep
      ? '1.5px dashed var(--border-strong)'
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

const seqStyle: React.CSSProperties = { fontSize: 10, color: 'var(--text-disabled)', fontWeight: 500, flexShrink: 0 };

const filterBadge: React.CSSProperties = {
  fontSize: 9,
  background: 'var(--warning-bg)',
  color: 'var(--warning)',
  border: '1px solid var(--warning)',
  borderRadius: 3,
  padding: '0 4px',
  fontWeight: 700,
  flexShrink: 0,
};

const noNextBadge: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-disabled)',
  flexShrink: 0,
};
