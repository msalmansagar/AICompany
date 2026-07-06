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
    <div style={panelStyle}>
      <div style={panelHeaderStyle}>
        <span style={panelTitleStyle}>Step Properties</span>
        <button type="button" style={closeBtnStyle} onClick={onClose}>×</button>
      </div>

      <div style={panelBodyStyle}>
        {/* Node Type Picker */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={fieldLabelStyle}>Node Type</label>
          <div style={typeGridStyle}>
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
          <label style={fieldLabelStyle}>Execution Channel</label>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['crm', 'manual', null] as (SopExecutionChannel | null)[]).map((ch) => {
              const isActive = (step.executionChannel ?? null) === ch;
              const label = ch === 'crm' ? 'CRM' : ch === 'manual' ? 'Manual' : 'Not set';
              const accent = ch === 'crm' ? '#1d4ed8' : ch === 'manual' ? '#92400e' : '#64748b';
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
            <label style={fieldLabelStyle}>
              Decision Label
              <span style={decisionHintStyle}>shown inside the gateway diamond</span>
            </label>
            <input
              type="text"
              value={step.decisionLabel ?? ''}
              onChange={handleDecisionLabelChange}
              placeholder="e.g. Approved?"
              style={inputStyle}
            />
          </div>
        )}

        <FieldGroup label="Name" required>
          <input type="text" value={step.name} onChange={handleNameChange} style={inputStyle} />
        </FieldGroup>

        <FieldGroup label="Description">
          <textarea
            value={step.description}
            onChange={handleDescChange}
            rows={2}
            style={textareaStyle}
          />
        </FieldGroup>

        <FieldGroup label="Sequence No.">
          <input
            type="number"
            value={step.sequenceNo}
            onChange={handleSeqChange}
            min={1}
            style={inputStyle}
          />
        </FieldGroup>

        <FieldGroup label="Role">
          <select value={step.roleId ?? ''} onChange={handleRoleChange} style={selectStyle}>
            <option value="">— No role —</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </FieldGroup>

        <div style={sectionHeaderStyle}>
          <span style={sectionTitleStyle}>Outcomes ({outcomes.length})</span>
          <button type="button" style={addOutcomeBtnStyle} onClick={onAddOutcome}>
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
          <button type="button" style={deleteBtnStyle} onClick={onRemoveStep}>
            Delete Step
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldGroup({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={fieldLabelStyle}>
        {label}{required && <span style={{ color: '#dc2626' }}> *</span>}
      </label>
      {children}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column',
  background: '#fff', borderLeft: '1px solid #e2e8f0',
  fontFamily: '"Segoe UI", system-ui, sans-serif',
};

const panelHeaderStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '12px 16px', borderBottom: '1px solid #f1f5f9', flexShrink: 0,
};

const panelTitleStyle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: '#0f172a' };

const closeBtnStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', color: '#94a3b8',
  fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 0,
};

const panelBodyStyle: React.CSSProperties = {
  flex: 1, overflowY: 'auto', padding: '14px 16px',
  display: 'flex', flexDirection: 'column', gap: 14,
};

const fieldLabelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#374151' };

const typeGridStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4,
};

function channelChipStyle(isActive: boolean, accent: string): React.CSSProperties {
  return {
    flex: 1, padding: '4px 0', borderRadius: 5, cursor: 'pointer',
    border: isActive ? `1.5px solid ${accent}` : '1.5px solid #e2e8f0',
    background: isActive ? `${accent}14` : '#fafafa',
    color: isActive ? accent : '#64748b',
    fontSize: 10, fontWeight: 600,
    transition: 'all 0.1s',
  };
}

function typeChipStyle(isActive: boolean, accent: string): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 5,
    padding: '5px 8px', borderRadius: 5, cursor: 'pointer',
    border: isActive ? `1.5px solid ${accent}` : '1.5px solid #e2e8f0',
    background: isActive ? `${accent}12` : '#fafafa',
    color: isActive ? accent : '#64748b',
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

const inputStyle: React.CSSProperties = {
  height: 30, padding: '0 8px',
  background: '#fff', border: '1px solid #cbd5e1',
  borderRadius: 5, fontSize: 12, color: '#1e293b', outline: 'none',
  width: '100%', boxSizing: 'border-box',
};

const textareaStyle: React.CSSProperties = {
  padding: '6px 8px', background: '#fff',
  border: '1px solid #cbd5e1', borderRadius: 5,
  fontSize: 12, color: '#1e293b', outline: 'none',
  width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit',
};

const selectStyle: React.CSSProperties = {
  height: 30, padding: '0 6px',
  background: '#fff', border: '1px solid #cbd5e1',
  borderRadius: 5, fontSize: 12, color: '#1e293b',
  width: '100%', cursor: 'pointer',
};

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  paddingTop: 4,
};

const sectionTitleStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#374151' };

const addOutcomeBtnStyle: React.CSSProperties = {
  height: 22, padding: '0 8px', background: '#f0fdf4',
  border: '1px solid #99f6e4', borderRadius: 4,
  fontSize: 11, fontWeight: 600, color: '#0f766e', cursor: 'pointer',
};

const emptyStyle: React.CSSProperties = {
  margin: 0, fontSize: 11, color: '#94a3b8', fontStyle: 'italic',
};

const outcomeListStyle: React.CSSProperties = {
  margin: 0, padding: '0 0 0 4px', listStyle: 'none',
  display: 'flex', flexDirection: 'column', gap: 4,
};

const outcomeItemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '3px 6px', background: '#f0fdf4',
  border: '1px solid #99f6e4', borderRadius: 4,
};

const outcomeSeqStyle: React.CSSProperties = { fontSize: 10, color: '#94a3b8', flexShrink: 0 };
const outcomeNameStyle: React.CSSProperties = { fontSize: 11, color: '#0f766e', fontWeight: 500 };

const deleteSectionStyle: React.CSSProperties = { paddingTop: 8, borderTop: '1px solid #f1f5f9' };

const decisionLabelGroupStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4,
  padding: '8px 10px', borderRadius: 6,
  background: '#faf5ff', border: '1px solid #e9d5ff',
};

const decisionHintStyle: React.CSSProperties = {
  fontSize: 9, fontWeight: 400, color: '#a78bfa',
  marginLeft: 6, fontStyle: 'italic',
};

const deleteBtnStyle: React.CSSProperties = {
  width: '100%', height: 30,
  background: '#fef2f2', border: '1px solid #fecaca',
  borderRadius: 5, fontSize: 12, fontWeight: 500,
  color: '#dc2626', cursor: 'pointer',
};
