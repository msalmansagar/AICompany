import { Panel } from '@xyflow/react';
import { AssignIcon, ASSIGN_ICON_ORDER, assignLabelOf } from '@/nodes/assignIcons';

interface LegendEntry {
  color: string;
  label: string;
  dashed?: boolean;
}

/**
 * The one-line decoder for the canvas's edge vocabulary — the encodings were
 * five and the legend was zero. Sits bottom-left, clear of the zoom controls.
 */
const ENTRIES: LegendEntry[] = [
  { color: 'var(--text-secondary)', label: 'Transition' },
  { color: 'var(--primary)', label: 'Conditional' },
  { color: 'var(--warning)', label: 'Back / return', dashed: true },
  { color: 'var(--accent-branch)', label: 'Runs alongside', dashed: true },
];

export function CanvasLegend() {
  return (
    <Panel position="bottom-left" style={panelStyle}>
      {ENTRIES.map((entry) => (
        <span key={entry.label} style={itemStyle}>
          <svg width="18" height="6" aria-hidden="true">
            <line
              x1="0" y1="3" x2="18" y2="3"
              stroke={entry.color}
              strokeWidth="2"
              strokeDasharray={entry.dashed ? '4 3' : undefined}
            />
          </svg>
          {entry.label}
        </span>
      ))}
      <span style={dividerStyle} aria-hidden="true" />
      {ASSIGN_ICON_ORDER.map((type) => (
        <span key={type} style={itemStyle}>
          <span style={{ display: 'inline-flex', color: 'var(--text-secondary)' }}>
            <AssignIcon type={type} size={13} />
          </span>
          {assignLabelOf(type)}
        </span>
      ))}
    </Panel>
  );
}

const panelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  marginLeft: 52,
  padding: '4px 10px',
  background: 'var(--surface-raised)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  fontSize: 10,
  color: 'var(--text-secondary)',
};

const dividerStyle: React.CSSProperties = {
  width: 1,
  height: 12,
  background: 'var(--border-strong)',
  flexShrink: 0,
};

const itemStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  whiteSpace: 'nowrap',
};
