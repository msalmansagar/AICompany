import { useState, useEffect, useCallback } from 'react';
import type { SopStep, SopOutcome, CrmRole, SopStepType, SopExecutionChannel } from '@/types/SopTypes';
import { SOP_STEP_TYPE_META } from '@/types/SopTypes';
import type { ISopAdapter } from '@/services/ISopAdapter';

const STEP_TYPES = Object.entries(SOP_STEP_TYPE_META) as [SopStepType, typeof SOP_STEP_TYPE_META[SopStepType]][];

interface SopStepPanelProps {
  step: SopStep;
  steps: SopStep[];
  outcomes: SopOutcome[];
  adapter: ISopAdapter;
  onUpdateStep(patch: Partial<SopStep>): void;
  onAddOutcome(): void;
  onRemoveStep(): void;
  onClose(): void;
}

export function SopStepPanel({
  step,
  outcomes,
  adapter,
  onUpdateStep,
  onAddOutcome,
  onRemoveStep,
  onClose,
}: SopStepPanelProps) {
  const [roles, setRoles] = useState<CrmRole[]>([]);

  useEffect(() => {
    adapter.getRoles()
      .then(setRoles)
      .catch(() => { /* non-fatal */ });
  }, [adapter]);

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateStep({ name: e.target.value });
  }, [onUpdateStep]);

  const handleDescChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onUpdateStep({ description: e.target.value });
  }, [onUpdateStep]);

  const handleSeqChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) onUpdateStep({ sequenceNo: val });
  }, [onUpdateStep]);

  const handleRoleChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const roleId = e.target.value || null;
    const role = roles.find((r) => r.id === roleId) ?? null;
    onUpdateStep({ roleId, roleName: role?.name ?? null, roleStatus: role?.status ?? null });
  }, [roles, onUpdateStep]);

  const handleTypeChange = useCallback((type: SopStepType) => {
    onUpdateStep({ stepType: type });
  }, [onUpdateStep]);

  const handleChannelChange = useCallback((channel: SopExecutionChannel | null) => {
    onUpdateStep({ executionChannel: channel });
  }, [onUpdateStep]);

  const handleDecisionLabelChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateStep({ decisionLabel: e.target.value || null });
  }, [onUpdateStep]);

  const activeType: SopStepType = step.stepType ?? 'step';
  const activeMeta = SOP_STEP_TYPE_META[activeType];

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Step properties</h3>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">×</button>
      </div>

      <div className="panel-body">
        {/* Node Type Picker */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label className="lbl">Node type</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {STEP_TYPES.map(([type, meta]) => (
              <button
                key={type}
                type="button"
                title={meta.label}
                onClick={() => handleTypeChange(type)}
                style={typeChipStyle(type === activeType, meta.accent)}
              >
                {meta.icon && <span style={{ fontSize: 11 }}>{meta.icon}</span>}
                <span style={{ fontSize: 10, fontWeight: 600 }}>{meta.label}</span>
              </button>
            ))}
          </div>
          <div style={activeTypeLabelStyle(activeMeta.accent)}>
            {activeMeta.icon && <span>{activeMeta.icon}</span>}
            <span>{activeMeta.label} selected</span>
          </div>
        </div>

        {/* Execution Channel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label className="lbl">Execution Channel</label>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['crm', 'manual', null] as (SopExecutionChannel | null)[]).map((ch) => {
              const isActive = (step.executionChannel ?? null) === ch;
              const label = ch === 'crm' ? 'CRM' : ch === 'manual' ? 'Manual' : 'Not set';
              const accent = ch === 'crm' ? 'var(--primary-pressed)' : ch === 'manual' ? 'var(--warning)' : 'var(--text-secondary)';
              return (
                <button
                  key={String(ch)}
                  type="button"
                  onClick={() => handleChannelChange(ch)}
                  style={channelChipStyle(isActive, accent)}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Decision Label — only for steps with 2+ outcomes (gateway decision point) */}
        {outcomes.length >= 2 && (
          <div style={decisionLabelGroupStyle}>
            <label className="lbl">
              Decision Label
              <span style={decisionHintStyle}>shown inside the gateway diamond</span>
            </label>
            <input
              type="text"
              value={step.decisionLabel ?? ''}
              onChange={handleDecisionLabelChange}
              placeholder="e.g. Approved?"
              className="fluent-input"
            />
          </div>
        )}

        <FieldGroup label="Name" required>
          <input type="text" value={step.name} onChange={handleNameChange} className="fluent-input" />
        </FieldGroup>

        <FieldGroup label="Description">
          <textarea
            value={step.description}
            onChange={handleDescChange}
            rows={2}
            className="fluent-input"
          />
        </FieldGroup>

        <FieldGroup label="Sequence No.">
          <input
            type="number"
            value={step.sequenceNo}
            onChange={handleSeqChange}
            min={1}
            className="fluent-input"
          />
        </FieldGroup>

        <FieldGroup label="Role">
          <select value={step.roleId ?? ''} onChange={handleRoleChange} className="fluent-select">
            <option value="">— No role —</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </FieldGroup>

        {/* No escalation here. `qdb_sopstep` carries neither qdb_escalation nor
            qdb_applyescalationfilter, so anything set would fail on save. A step
            escalates once it is a process step, where the columns exist and the
            engine reads them. */}

        <div style={sectionHeaderStyle}>
          <span style={sectionTitleStyle}>Outcomes ({outcomes.length})</span>
          <button type="button" className="btn sm" onClick={onAddOutcome}>
            + Add
          </button>
        </div>
        {outcomes.length === 0 ? (
          <p style={emptyStyle}>No outcomes yet. Add at least one.</p>
        ) : (
          <ul style={outcomeListStyle}>
            {outcomes.map((o) => (
              <li key={o.id} style={outcomeItemStyle}>
                <span style={outcomeSeqStyle}>{o.sequenceNo}.</span>
                <span style={outcomeNameStyle}>{o.name}</span>
              </li>
            ))}
          </ul>
        )}

        <div style={deleteSectionStyle}>
          <button type="button" className="btn danger" onClick={onRemoveStep}>
            Delete step
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldGroup({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label className="lbl">
        {label}{required && <span style={{ color: 'var(--error)' }}> *</span>}
      </label>
      {children}
    </div>
  );
}

function channelChipStyle(isActive: boolean, accent: string): React.CSSProperties {
  return {
    flex: 1, padding: '4px 0', borderRadius: 5, cursor: 'pointer',
    border: isActive ? `1.5px solid ${accent}` : '1.5px solid var(--border)',
    background: isActive ? `${accent}14` : 'var(--surface-alt)',
    color: isActive ? accent : 'var(--text-secondary)',
    fontSize: 10, fontWeight: 600,
    transition: 'all 0.1s',
  };
}

function typeChipStyle(isActive: boolean, accent: string): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 5,
    padding: '5px 8px', borderRadius: 5, cursor: 'pointer',
    border: isActive ? `1.5px solid ${accent}` : '1.5px solid var(--border)',
    background: isActive ? `${accent}12` : 'var(--surface-alt)',
    color: isActive ? accent : 'var(--text-secondary)',
    transition: 'all 0.1s',
    textAlign: 'left',
  };
}

function activeTypeLabelStyle(accent: string): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 5,
    fontSize: 10, color: accent, fontWeight: 600,
    padding: '3px 6px', background: `${accent}10`,
    borderRadius: 4, border: `1px solid ${accent}25`,
  };
}

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  paddingTop: 4,
};

const sectionTitleStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text)' };

const emptyStyle: React.CSSProperties = {
  margin: 0, fontSize: 11, color: 'var(--text-disabled)', fontStyle: 'italic',
};

const outcomeListStyle: React.CSSProperties = {
  margin: 0, padding: '0 0 0 4px', listStyle: 'none',
  display: 'flex', flexDirection: 'column', gap: 4,
};

const outcomeItemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '3px 6px', background: 'var(--success-bg)',
  border: '1px solid var(--accent-route)', borderRadius: 4,
};

const outcomeSeqStyle: React.CSSProperties = { fontSize: 10, color: 'var(--text-disabled)', flexShrink: 0 };
const outcomeNameStyle: React.CSSProperties = { fontSize: 11, color: 'var(--accent-route)', fontWeight: 500 };

const deleteSectionStyle: React.CSSProperties = { paddingTop: 8, borderTop: '1px solid var(--border)' };

const decisionLabelGroupStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4,
  padding: '8px 10px', borderRadius: 6,
  background: 'var(--accent-branch-bg)', border: '1px solid var(--accent-branch)',
};

const decisionHintStyle: React.CSSProperties = {
  fontSize: 9, fontWeight: 400, color: 'var(--accent-branch)',
  marginLeft: 6, fontStyle: 'italic',
};

