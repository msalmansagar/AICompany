// Panel for adding, renaming, typing, and removing declared facts (FR-B1-07).
// A declared fact is supplied by the caller or upstream chaining — never read from the target record.

import { useState } from 'react';
import { type DeclaredFact, newDeclaredFact, DECLARED_FACT_TYPES } from './declaredFacts';

interface Props {
  facts: DeclaredFact[];
  onChange: (facts: DeclaredFact[]) => void;
  disabled: boolean;
}

export function DeclaredFactsPanel({ facts, onChange, disabled }: Props) {
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('Text');

  function addFact() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (facts.some((f) => f.name === trimmed)) return;
    onChange([...facts, newDeclaredFact(trimmed, newType)]);
    setNewName('');
  }

  function removeFact(name: string) {
    onChange(facts.filter((f) => f.name !== name));
  }

  function renameFact(name: string, nextName: string) {
    if (!nextName.trim() || facts.some((f) => f.name === nextName && f.name !== name)) return;
    onChange(facts.map((f) => f.name === name ? { ...f, name: nextName.trim() } : f));
  }

  function setFactField<K extends keyof DeclaredFact>(name: string, field: K, value: DeclaredFact[K]) {
    onChange(facts.map((f) => f.name === name ? { ...f, [field]: value } : f));
  }

  return (
    <div className="facts-panel">
      <div className="facts-head">
        <span className="facts-title">Declared facts</span>
        <span className="facts-hint">Inputs supplied by the caller — not read from the record</span>
      </div>
      {facts.map((f) => (
        <div key={f.name} className="fact-row">
          <input
            className="fact-name" value={f.name} disabled={disabled} aria-label="Fact name"
            onChange={(e) => renameFact(f.name, e.target.value)}
          />
          <select
            className="fact-type" value={f.type} disabled={disabled} aria-label="Fact type"
            onChange={(e) => setFactField(f.name, 'type', e.target.value)}
          >
            {DECLARED_FACT_TYPES.map((t) => <option key={t.name} value={t.name}>{t.label}</option>)}
          </select>
          <label className="fact-check" title="Required — the rule rejects a missing value (strict rules only)">
            <input
              type="checkbox" checked={f.required} disabled={disabled}
              onChange={(e) => setFactField(f.name, 'required', e.target.checked)}
            />
            req
          </label>
          <label className="fact-check" title="Nullable — allows null to be passed as the value">
            <input
              type="checkbox" checked={f.nullable} disabled={disabled}
              onChange={(e) => setFactField(f.name, 'nullable', e.target.checked)}
            />
            null ok
          </label>
          <button className="fact-del" disabled={disabled} onClick={() => removeFact(f.name)} aria-label={`Remove ${f.name}`}>✕</button>
        </div>
      ))}
      {!disabled && (
        <div className="fact-add">
          <input
            className="fact-name" placeholder="Fact name" value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addFact()}
          />
          <select className="fact-type" value={newType} onChange={(e) => setNewType(e.target.value)}>
            {DECLARED_FACT_TYPES.map((t) => <option key={t.name} value={t.name}>{t.label}</option>)}
          </select>
          <button className="tb ghost" onClick={addFact} disabled={!newName.trim()}>＋ Add fact</button>
        </div>
      )}
    </div>
  );
}
