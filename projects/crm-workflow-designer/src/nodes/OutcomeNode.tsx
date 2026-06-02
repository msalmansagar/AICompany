import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { OutcomeNodeData } from '@/store/selectors';

const COLOR_MAP: Record<string, { bg: string; border: string; text: string }> = {
  approved: { bg: '#f0fdf4', border: '#86efac', text: '#15803d' },
  pass: { bg: '#f0fdf4', border: '#86efac', text: '#15803d' },
  complete: { bg: '#f0fdf4', border: '#86efac', text: '#15803d' },
  reject: { bg: '#fef2f2', border: '#fca5a5', text: '#dc2626' },
  rejected: { bg: '#fef2f2', border: '#fca5a5', text: '#dc2626' },
  fail: { bg: '#fef2f2', border: '#fca5a5', text: '#dc2626' },
  decline: { bg: '#fef2f2', border: '#fca5a5', text: '#dc2626' },
  escalate: { bg: '#fff7ed', border: '#fdba74', text: '#ea580c' },
  escalation: { bg: '#fff7ed', border: '#fdba74', text: '#ea580c' },
  pending: { bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
};

const DEFAULT_COLOR = { bg: '#eff6ff', border: '#93c5fd', text: '#1d4ed8' };
const ORPHAN_COLOR = { bg: '#f8fafc', border: '#cbd5e1', text: '#64748b' };

function resolveColor(name: string): { bg: string; border: string; text: string } {
  const lower = name.toLowerCase();
  for (const [key, colors] of Object.entries(COLOR_MAP)) {
    if (lower.includes(key)) return colors;
  }
  return DEFAULT_COLOR;
}

export function OutcomeNode({ data, selected }: NodeProps) {
  const d = data as unknown as OutcomeNodeData;
  const colors = d.isOrphaned ? ORPHAN_COLOR : resolveColor(d.name);

  return (
    <div style={containerStyle(colors, selected ?? false, d.isOrphaned)}>
      <Handle type="target" position={Position.Left} id="target-left" style={targetHandleStyle(colors)} />

      <div style={contentStyle}>
        <span style={nameStyle(colors)}>{d.name || 'Outcome'}</span>
        <span style={seqStyle}>{d.sequenceNumber}</span>
        {d.applyFilter && <span style={filterBadgeStyle} title="FetchXML filter active">F</span>}
        {d.isOrphaned && <span style={orphanBadgeStyle} title="Not connected to a step">⚡</span>}
      </div>

      <Handle type="source" position={Position.Right} id="source-right" style={sourceHandleStyle(colors)} />
    </div>
  );
}

function containerStyle(
  colors: { bg: string; border: string; text: string },
  selected: boolean,
  orphaned: boolean
): React.CSSProperties {
  return {
    background: colors.bg,
    border: orphaned
      ? '1.5px dashed #cbd5e1'
      : selected
      ? `2px solid ${colors.text}`
      : `1.5px solid ${colors.border}`,
    borderRadius: 20,
    padding: '5px 14px',
    display: 'flex',
    alignItems: 'center',
    minWidth: 90,
    boxShadow: selected && !orphaned ? `0 0 0 3px ${colors.border}` : '0 1px 4px rgba(0,0,0,0.08)',
    transition: 'border-color 0.15s',
    opacity: orphaned ? 0.7 : 1,
    cursor: 'pointer',
  };
}

const contentStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6 };

function nameStyle(colors: { text: string }): React.CSSProperties {
  return { fontSize: 12, fontWeight: 600, color: colors.text, whiteSpace: 'nowrap' };
}

const seqStyle: React.CSSProperties = { fontSize: 10, color: '#94a3b8', fontWeight: 500 };

const filterBadgeStyle: React.CSSProperties = {
  fontSize: 9, background: '#fef3c7', color: '#92400e',
  border: '1px solid #fde68a', borderRadius: 4, padding: '0 4px',
  fontWeight: 700,
};

const orphanBadgeStyle: React.CSSProperties = {
  fontSize: 10, color: '#94a3b8',
};

function targetHandleStyle(colors: { text: string }): React.CSSProperties {
  return {
    background: colors.text,
    width: 12, height: 12,
    border: '2px solid #fff',
    borderRadius: '50%',
    left: -6,
  };
}

function sourceHandleStyle(colors: { text: string }): React.CSSProperties {
  return {
    background: colors.text,
    width: 12, height: 12,
    border: '2px solid #fff',
    borderRadius: '50%',
    right: -6,
  };
}
