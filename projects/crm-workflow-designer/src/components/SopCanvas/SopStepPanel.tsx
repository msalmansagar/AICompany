// src/components/SopCanvas/SopStepPanel.tsx
import { useState, useEffect, useCallback } from 'react';
import type { SopStep, SopOutcome, CrmRole } from '@/types/SopTypes';
import type { ISopAdapter } from '@/services/ISopAdapter';

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
    onUpdateStep({
      roleId,
      roleName: role?.name ?? null,
      roleStatus: role?.status ?? null,
    });
  }, [roles, onUpdateStep]);

  return (
    <div style={panelStyle}>
      <div style={panelHeaderStyle}>
        <span style={panelTitleStyle}>Step Properties</span>
        <button type="button" style={closeBtnStyle} onClick={onClose}>×</button>
      </div>

      <div style={panelBodyStyle}>
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
      <label style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>
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

const deleteBtnStyle: React.CSSProperties = {
  width: '100%', height: 30,
  background: '#fef2f2', border: '1px solid #fecaca',
  borderRadius: 5, fontSize: 12, fontWeight: 500,
  color: '#dc2626', cursor: 'pointer',
};
