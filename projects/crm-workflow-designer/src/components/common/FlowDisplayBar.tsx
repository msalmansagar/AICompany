import { Panel } from '@xyflow/react';
import { FLOW_CLASS_LABELS, FLOW_CLASS_DESCRIPTIONS } from '@/services/flowClass';
import type { FlowClass } from '@/services/flowClass';
import type { FlowVisibility } from '@/services/viewFilters';

/**
 * The Flow Display toolbar (CWFD-017): one chip per relationship class, so a
 * reader dials the diagram down to the layer they are asking about. Returns
 * open with their lines hidden — the highest-value declutter on a large
 * process — and, once hidden, offer the deeper clean that also removes the
 * steps existing only for returns (the old "Returns: hidden" cycle stop).
 *
 * Presentation state only; toggling never touches the process definition.
 */
export function FlowDisplayBar({
  visibility,
  onChange,
}: {
  visibility: FlowVisibility;
  onChange(next: FlowVisibility): void;
}) {
  const returnsOn = visibility.returns === 'show';

  const chip = (
    flowClass: Exclude<FlowClass, 'return'>,
    key: 'primary' | 'decisions' | 'parallel' | 'endings'
  ) => (
    <FlowChip
      label={FLOW_CLASS_LABELS[flowClass]}
      description={FLOW_CLASS_DESCRIPTIONS[flowClass]}
      isOn={visibility[key]}
      onToggle={() => onChange({ ...visibility, [key]: !visibility[key] })}
    />
  );

  return (
    <Panel position="top-right" style={panelStyle} aria-label="Flow display">
      <span style={captionStyle}>Show</span>
      {chip('primary', 'primary')}
      {chip('decision', 'decisions')}
      {chip('parallel', 'parallel')}
      <FlowChip
        label={FLOW_CLASS_LABELS.return}
        description={FLOW_CLASS_DESCRIPTIONS.return}
        isOn={returnsOn}
        onToggle={() =>
          onChange({ ...visibility, returns: returnsOn ? 'hide-lines' : 'show' })
        }
      />
      {chip('ending', 'endings')}
      {!returnsOn && (
        <FlowChip
          label="return steps"
          description="Also hide the steps that exist only to send work back, and strip the ↩ rows from cards"
          isOn={visibility.returns !== 'hide-all'}
          subordinate
          onToggle={() =>
            onChange({
              ...visibility,
              returns: visibility.returns === 'hide-all' ? 'hide-lines' : 'hide-all',
            })
          }
        />
      )}
    </Panel>
  );
}

function FlowChip({
  label,
  description,
  isOn,
  onToggle,
  subordinate = false,
}: {
  label: string;
  description: string;
  isOn: boolean;
  onToggle(): void;
  subordinate?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={isOn}
      title={`${description} — click to ${isOn ? 'hide' : 'show'}`}
      onClick={onToggle}
      style={chipStyle(isOn, subordinate)}
    >
      <span aria-hidden style={dotStyle(isOn)} />
      {label}
    </button>
  );
}

const panelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '4px 8px',
  boxShadow: '0 2px 8px color-mix(in srgb, var(--text) 10%, transparent)',
};

const captionStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  color: 'var(--text-secondary)',
  marginRight: 2,
};

function chipStyle(isOn: boolean, subordinate: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontSize: subordinate ? 10 : 11,
    fontWeight: 600,
    fontFamily: 'inherit',
    color: isOn ? 'var(--text)' : 'var(--text-secondary)',
    background: isOn ? 'var(--surface-alt)' : 'transparent',
    border: `1px solid ${isOn ? 'var(--border-strong)' : 'var(--border)'}`,
    borderRadius: 999,
    padding: subordinate ? '1px 8px' : '2px 9px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
}

function dotStyle(isOn: boolean): React.CSSProperties {
  return {
    width: 7,
    height: 7,
    borderRadius: '50%',
    flexShrink: 0,
    background: isOn ? 'var(--primary)' : 'transparent',
    border: `1.5px solid ${isOn ? 'var(--primary)' : 'var(--text-disabled)'}`,
  };
}
