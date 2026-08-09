export function Legend() {
  return (
    <div style={legend}>
      <LegendItem color="var(--success)" label="Trigger (Start)" circle />
      <LegendItem color="var(--warning)" label="Condition" />
      <LegendItem color="var(--primary)" label="Action" />
      <LegendItem color="var(--warning)" label="Approval" />
      <LegendItem color="var(--error)" label="End" circle />
      <div style={divider} />
      <div style={transitionItem}>
        <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke="var(--text-disabled)" strokeWidth="1.5" /></svg>
        <span style={transitionLabel}>Transition</span>
      </div>
    </div>
  );
}

function LegendItem({ color, label, circle }: { color: string; label: string; circle?: boolean }) {
  return (
    <div style={item}>
      {circle
        ? <div style={circleIndicator(color)} />
        : <div style={barIndicator(color)} />}
      <span style={itemLabel}>{label}</span>
    </div>
  );
}

const legend: React.CSSProperties = {
  position: 'absolute',
  bottom: 16,
  left: 16,
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '7px 14px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
  fontSize: 11,
  zIndex: 5,
};

const item: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
};

const itemLabel: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontWeight: 500,
};

function circleIndicator(color: string): React.CSSProperties {
  return { width: 12, height: 12, borderRadius: '50%', background: color, flexShrink: 0 };
}

function barIndicator(color: string): React.CSSProperties {
  return { width: 4, height: 14, borderRadius: 2, background: color, flexShrink: 0 };
}

const divider: React.CSSProperties = {
  width: 1, height: 20, background: 'var(--surface-alt)', margin: '0 2px',
};

const transitionItem: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 5,
};

const transitionLabel: React.CSSProperties = {
  color: 'var(--text-secondary)', fontWeight: 500,
};
