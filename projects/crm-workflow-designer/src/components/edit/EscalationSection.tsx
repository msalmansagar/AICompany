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
  const summary = escalationSummaryText(value);

  useEffect(() => {
    if (!expanded || configs.length > 0 || loadFailed) return;
    adapter
      .getEscalationConfigs()
      .then(setConfigs)
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
        <div style={bodyStyle}>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor={`${sectionId}-config`}>Escalation policy</label>
            <select
              id={`${sectionId}-config`}
              style={selectStyle}
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
            <span style={hintStyle}>
              The deadline, its unit and the escalation levels live on the policy, so every
              step using it escalates the same way.
            </span>
          </div>

          {configs.length === 0 && !loadFailed && (
            <div style={noticeStyle}>
              No escalation policies exist in this environment yet. They are created outside the
              designer, on the escalation configuration table.
            </div>
          )}
          {loadFailed && (
            <div style={noticeStyle}>Could not load escalation policies.</div>
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
            <span style={hintStyle}>
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
  background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 11, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer', textAlign: 'left',
};
const caretStyle: React.CSSProperties = { fontSize: 10, color: '#64748b' };
const summaryBadgeStyle: React.CSSProperties = {
  marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: '#fbbf24',
  background: '#451a03', border: '1px solid #92400e', borderRadius: 3, padding: '1px 5px',
  textTransform: 'none', letterSpacing: 0, overflow: 'hidden', textOverflow: 'ellipsis',
  whiteSpace: 'nowrap', maxWidth: 150,
};
const bodyStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 6 };
const noticeStyle: React.CSSProperties = {
  fontSize: 10, color: '#fbbf24', background: '#1c1917', border: '1px solid #422006',
  borderRadius: 4, padding: '6px 8px', lineHeight: 1.4,
};
const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em',
};
const selectStyle: React.CSSProperties = {
  height: 30, padding: '0 8px', background: '#1e293b', border: '1px solid #334155',
  borderRadius: 4, color: '#e2e8f0', fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box',
};
const hintStyle: React.CSSProperties = { fontSize: 10, color: '#64748b', lineHeight: 1.4 };
const toggleRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' };
const toggleLabelStyle: React.CSSProperties = { fontSize: 12, color: '#e2e8f0' };
