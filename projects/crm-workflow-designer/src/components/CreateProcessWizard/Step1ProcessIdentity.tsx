// src/components/CreateProcessWizard/Step1ProcessIdentity.tsx
import { useState, useCallback } from 'react';
import type { Sop } from '@/types/SopTypes';
import type { Step1Values } from './wizardSchemas';

interface Step1ProcessIdentityProps {
  sop: Sop;
  initialValues: Step1Values;
  onValidated(values: Step1Values): void;
}

export function Step1ProcessIdentity({ sop, initialValues, onValidated }: Step1ProcessIdentityProps) {
  const [processName, setProcessName] = useState(initialValues.processName || sop.name);
  const [processDescription, setProcessDescription] = useState(initialValues.processDescription || sop.description);
  const [nameError, setNameError] = useState('');

  const handleNext = useCallback(() => {
    const trimmed = processName.trim();
    if (!trimmed) {
      setNameError('Process name is required.');
      return;
    }
    setNameError('');
    onValidated({ processName: trimmed, processDescription: processDescription.trim() });
  }, [processName, processDescription, onValidated]);

  return (
    <div style={containerStyle}>
      <div style={sopInfoStyle}>
        <span style={sopLabelStyle}>Deriving from SOP:</span>
        <span style={sopNameStyle}>{sop.name}</span>
        {sop.version && <span style={sopVersionStyle}>v{sop.version}</span>}
      </div>

      <div style={fieldGroupStyle}>
        <label className="lbl">
          Process Name <span className="req">*</span>
        </label>
        <input
          type="text"
          value={processName}
          onChange={(e) => { setProcessName(e.target.value); setNameError(''); }}
          placeholder="Enter process name"
          className={nameError ? "fluent-input invalid" : "fluent-input"}
          autoFocus
        />
        {nameError && <span className="hint-inline" style={{ color: 'var(--error)' }}>{nameError}</span>}
      </div>

      <div style={fieldGroupStyle}>
        <label className="lbl">Description (optional)</label>
        <textarea
          value={processDescription}
          onChange={(e) => setProcessDescription(e.target.value)}
          placeholder="Describe this process…"
          rows={3}
          className="fluent-input"
        />
      </div>

      <div className="dialog-foot">
        <button type="button" className="btn primary" onClick={handleNext}>
          Next →
        </button>
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 18 };

const sopInfoStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 14px',
  background: 'var(--primary-tint-2)',
  border: '1px solid var(--primary-tint)',
  borderRadius: 6,
};

const sopLabelStyle: React.CSSProperties = { fontSize: 12, color: 'var(--primary)', fontWeight: 500 };
const sopNameStyle: React.CSSProperties = { fontSize: 13, color: 'var(--primary-pressed)', fontWeight: 600 };
const sopVersionStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--primary)', background: 'var(--primary-tint)',
  border: '1px solid var(--primary-tint)', borderRadius: 4, padding: '1px 6px',
};

const fieldGroupStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5 };

