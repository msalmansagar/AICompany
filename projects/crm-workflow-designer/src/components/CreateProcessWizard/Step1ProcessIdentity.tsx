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
        <label style={labelStyle}>
          Process Name <span style={requiredStyle}>*</span>
        </label>
        <input
          type="text"
          value={processName}
          onChange={(e) => { setProcessName(e.target.value); setNameError(''); }}
          placeholder="Enter process name"
          style={{ ...inputStyle, ...(nameError ? inputErrorStyle : {}) }}
          autoFocus
        />
        {nameError && <span style={errorTextStyle}>{nameError}</span>}
      </div>

      <div style={fieldGroupStyle}>
        <label style={labelStyle}>Description (optional)</label>
        <textarea
          value={processDescription}
          onChange={(e) => setProcessDescription(e.target.value)}
          placeholder="Describe this process…"
          rows={3}
          style={textareaStyle}
        />
      </div>

      <div style={footerStyle}>
        <button type="button" style={nextBtnStyle} onClick={handleNext}>
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

const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text)' };
const requiredStyle: React.CSSProperties = { color: 'var(--error)' };

const inputStyle: React.CSSProperties = {
  height: 34, padding: '0 10px',
  background: 'var(--surface)', border: '1px solid var(--border-strong)',
  borderRadius: 6, color: 'var(--text)', fontSize: 13,
  outline: 'none', width: '100%', boxSizing: 'border-box',
};

const inputErrorStyle: React.CSSProperties = { borderColor: 'var(--error)' };

const textareaStyle: React.CSSProperties = {
  padding: '8px 10px',
  background: 'var(--surface)', border: '1px solid var(--border-strong)',
  borderRadius: 6, color: 'var(--text)', fontSize: 13,
  outline: 'none', width: '100%', boxSizing: 'border-box',
  resize: 'vertical', fontFamily: 'inherit',
};

const errorTextStyle: React.CSSProperties = { fontSize: 11, color: 'var(--error)' };

const footerStyle: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', paddingTop: 4 };

const nextBtnStyle: React.CSSProperties = {
  height: 34, padding: '0 20px',
  background: 'var(--primary)', border: 'none',
  borderRadius: 6, color: 'var(--text-on-primary)',
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
