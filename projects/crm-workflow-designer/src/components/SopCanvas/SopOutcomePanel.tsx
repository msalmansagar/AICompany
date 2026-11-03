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
    <div className="panel">
      <div className="panel-head">
        <h3>Outcome properties</h3>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">×</button>
      </div>

      <div className="panel-body">
        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Name</label>
          <input type="text" value={outcome.name} onChange={handleNameChange} className="fluent-input" />
        </div>

        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Sequence No.</label>
          <input
            type="number"
            value={outcome.sequenceNo}
            onChange={handleSeqChange}
            min={1}
            className="fluent-input"
          />
        </div>

        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Next Step (optional)</label>
          <select
            value={outcome.nextSopStepId ?? ''}
            onChange={handleNextStepChange}
            className="fluent-select"
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
          <button type="button" className="btn sm block danger" onClick={onRemove}>
            Delete Outcome
          </button>
        </div>
      </div>
    </div>
  );
}

const fieldGroupStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text)' };

const deleteSectionStyle: React.CSSProperties = { paddingTop: 8, borderTop: '1px solid var(--border)' };
