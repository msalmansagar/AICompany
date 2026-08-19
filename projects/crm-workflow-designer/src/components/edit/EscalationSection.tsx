import { useEffect, useId, useState } from 'react';
import type { EscalationFields, EscalationConfigOption } from '@/types/WorkflowTypes';
import type { ICrmAdapter } from '@/services/ICrmAdapter';
import { escalationSummaryText } from '@/services/escalationFields';
import { logError } from '@/services/logError';

// CWFD-005 — escalation, expressed the way the platform engine expresses it.
//
// A step names a reusable escalation configuration, or asks for one to be
// resolved by condition. Everything the deadline needs — value, unit,
// working-days, the level chain, the email template — lives on that
// configuration record, shared by every step that points at it.

interface EscalationSectionProps {
  value: EscalationFields;
  onChange: (patch: Partial<EscalationFields>) => void;
  adapter: ICrmAdapter;
  /** When true (e.g. a published SOP), edits are suppressed. */
  disabled?: boolean;
}

export function EscalationSection({ value, onChange, adapter, disabled }: EscalationSectionProps) {
  const sectionId = useId();
  const [expanded, setExpanded] = useState(false);
  const [configs, setConfigs] = useState<EscalationConfigOption[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  // An empty list and a list that has not arrived yet look identical, and saying
  // "no policies exist" before the fetch returns states something not yet known.
  const [hasLoaded, setHasLoaded] = useState(false);
  const summary = escalationSummaryText(value);

  useEffect(() => {
    if (!expanded || configs.length > 0 || loadFailed) return;
    adapter
      .getEscalationConfigs()
      .then((loaded) => {
        setConfigs(loaded);
        setHasLoaded(true);
      })
      .catch((error) => {
        logError('EscalationSection:loadConfigs', error);
        setLoadFailed(true);
      });
  }, [expanded, configs.length, loadFailed, adapter]);

  return (
    <div>
      <button type="button" style={headerStyle} onClick={() => setExpanded((open) => !open)}>
        <span style={caretStyle}>{expanded ? '▾' : '▸'}</span>
        <span>Escalation</span>
        {!expanded && summary && <span style={summaryBadgeStyle}>{summary}</span>}
      </button>

      {expanded && (
        <div className="section-body">
          <div style={fieldStyle}>
            <label className="lbl" htmlFor={`${sectionId}-config`}>Escalation policy</label>
            <select
              id={`${sectionId}-config`}
              className="fluent-select"
              disabled={disabled}
              value={value.escalationConfigId ?? ''}
              onChange={(event) => {
                const id = event.target.value || null;
                const chosen = configs.find((config) => config.id === id);
                onChange({ escalationConfigId: id, escalationConfigName: chosen?.name ?? null });
              }}
            >
              <option value="">— Does not escalate —</option>
              {configs.map((config) => (
                <option key={config.id} value={config.id}>
                  {config.name}{config.summary ? ` · ${config.summary}` : ''}
                </option>
              ))}
            </select>
            <span className="hint-inline">
              The deadline, its unit and the escalation levels live on the policy, so every
              step using it escalates the same way.
            </span>
          </div>

          {hasLoaded && configs.length === 0 && !loadFailed && (
            <div className="notice warning">
              No escalation policies exist in this environment yet. They are created outside the
              designer, on the escalation configuration table.
            </div>
          )}
          {loadFailed && (
            <div className="notice warning">Could not load escalation policies.</div>
          )}

          <label style={toggleRowStyle}>
            <input
              type="checkbox"
              checked={value.applyEscalationFilter}
              disabled={disabled || Boolean(value.escalationConfigId)}
              onChange={(event) => onChange({ applyEscalationFilter: event.target.checked })}
            />
            <span style={toggleLabelStyle}>Pick the policy by condition instead</span>
          </label>
          {Boolean(value.escalationConfigId) && (
            <span className="hint-inline">
              Clear the policy above to choose by condition — a named policy always wins.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// --- styles (match the dark step panel) ---

const headerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '6px 0',
  background: 'transparent', border: 'none', color: 'var(--text-disabled)', fontSize: 11, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer', textAlign: 'left',
};
const caretStyle: React.CSSProperties = { fontSize: 10, color: 'var(--text-secondary)' };
const summaryBadgeStyle: React.CSSProperties = {
  marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: 'var(--warning)',
  background: 'var(--warning-bg)', border: '1px solid var(--warning)', borderRadius: 3, padding: '1px 5px',
  textTransform: 'none', letterSpacing: 0, overflow: 'hidden', textOverflow: 'ellipsis',
  whiteSpace: 'nowrap', maxWidth: 150,
};
const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
const toggleRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' };
const toggleLabelStyle: React.CSSProperties = { fontSize: 12, color: 'var(--text)' };
