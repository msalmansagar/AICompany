// src/components/SopCanvas/SopOutcomePanel.tsx
import { useCallback } from 'react';
import type { SopOutcome, SopStep } from '@/types/SopTypes';

interface SopOutcomePanelProps {
  outcome: SopOutcome;
  steps: SopStep[];
  onUpdate(patch: Partial<SopOutcome>): void;
  onRemove(): void;
  onClose(): void;
}

export function SopOutcomePanel({ outcome, steps, onUpdate, onRemove, onClose }: SopOutcomePanelProps) {
  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate({ name: e.target.value });
  }, [onUpdate]);

  const handleSeqChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) onUpdate({ sequenceNo: val });
  }, [onUpdate]);

  const handleNextStepChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    onUpdate({ nextSopStepId: e.target.value || null });
  }, [onUpdate]);

  const availableNextSteps = steps.filter((s) => s.id !== outcome.sopStepId);

  return (
    <div style={panelStyle}>
      <div style={panelHeaderStyle}>
        <span style={panelTitleStyle}>Outcome Properties</span>
        <button type="button" style={closeBtnStyle} onClick={onClose}>×</button>
      </div>

      <div style={panelBodyStyle}>
        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Name</label>
          <input type="text" value={outcome.name} onChange={handleNameChange} style={inputStyle} />
        </div>

        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Sequence No.</label>
          <input
            type="number"
            value={outcome.sequenceNo}
            onChange={handleSeqChange}
            min={1}
            style={inputStyle}
          />
        </div>

        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Next Step (optional)</label>
          <select
            value={outcome.nextSopStepId ?? ''}
            onChange={handleNextStepChange}
            style={selectStyle}
          >
            <option value="">— End of flow —</option>
            {availableNextSteps.map((s) => (
              <option key={s.id} value={s.id}>
                {s.sequenceNo}. {s.name}
              </option>
            ))}
          </select>
        </div>

        <div style={deleteSectionStyle}>
          <button type="button" style={deleteBtnStyle} onClick={onRemove}>
            Delete Outcome
          </button>
        </div>
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column',
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

const fieldGroupStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#374151' };

const inputStyle: React.CSSProperties = {
  height: 30, padding: '0 8px',
  background: '#fff', border: '1px solid #cbd5e1',
  borderRadius: 5, fontSize: 12, color: '#1e293b', outline: 'none',
  width: '100%', boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  height: 30, padding: '0 6px',
  background: '#fff', border: '1px solid #cbd5e1',
  borderRadius: 5, fontSize: 12, color: '#1e293b',
  width: '100%', cursor: 'pointer',
};

const deleteSectionStyle: React.CSSProperties = { paddingTop: 8, borderTop: '1px solid #f1f5f9' };
const deleteBtnStyle: React.CSSProperties = {
  width: '100%', height: 30,
  background: '#fef2f2', border: '1px solid #fecaca',
  borderRadius: 5, fontSize: 12, fontWeight: 500,
  color: '#dc2626', cursor: 'pointer',
};
