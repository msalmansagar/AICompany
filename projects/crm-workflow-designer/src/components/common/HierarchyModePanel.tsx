import { Panel } from '@xyflow/react';

/**
 * The Hierarchy view's three ways of reading the chart:
 * Forward — the calm default, returns live on their ↩ badges;
 * Returns — every return drawn in the outer gutter at once;
 * Selected path — the reporting-line idiom: root to the selected card
 * highlighted with its returns, everything else dimmed.
 */
export type HierarchyViewMode = 'forward' | 'returns' | 'selected';

const MODES: Array<{ id: HierarchyViewMode; label: string; title: string }> = [
  { id: 'forward', label: 'Forward', title: 'The forward flow only — hover or click a ↩ badge to see a return' },
  { id: 'returns', label: 'Returns', title: 'Every return decision, each in its own outer lane' },
  { id: 'selected', label: 'Selected path', title: 'Highlight the path from the start to the selected step, with its returns' },
];

export function HierarchyModePanel({
  mode,
  onChange,
}: {
  mode: HierarchyViewMode;
  onChange: (mode: HierarchyViewMode) => void;
}) {
  return (
    <Panel position="top-center" style={panelStyle}>
      <div style={segmentWrap} role="radiogroup" aria-label="Hierarchy display mode">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={mode === m.id}
            title={m.title}
            style={segmentStyle(mode === m.id)}
            onClick={() => onChange(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
    </Panel>
  );
}

const panelStyle: React.CSSProperties = { margin: 10 };

const segmentWrap: React.CSSProperties = {
  display: 'inline-flex',
  background: 'var(--surface)',
  border: '1px solid var(--border-strong)',
  borderRadius: 8,
  padding: 3,
  gap: 2,
  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
};

function segmentStyle(isActive: boolean): React.CSSProperties {
  return {
    border: 'none',
    borderRadius: 6,
    padding: '5px 14px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    background: isActive ? 'var(--primary)' : 'transparent',
    color: isActive ? 'var(--text-on-primary)' : 'var(--text-secondary)',
    transition: 'background 0.12s, color 0.12s',
  };
}
