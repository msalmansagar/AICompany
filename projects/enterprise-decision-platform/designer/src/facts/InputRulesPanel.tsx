// Required / nullable for the rule's record-bound inputs (FR-B2-12).

import { type InputRules, ruleFor } from './inputRules';

interface Props {
  names: string[];
  rules: InputRules;
  onChange: (rules: InputRules) => void;
  disabled: boolean;
}

export function InputRulesPanel({ names, rules, onChange, disabled }: Props) {
  const setFlag = (name: string, flag: 'required' | 'nullable', value: boolean) =>
    onChange({ ...rules, [name]: { ...ruleFor(rules, name), [flag]: value } });

  if (names.length === 0) return null;
  return (
    <div className="facts-panel">
      <div className="facts-head">
        <span className="facts-title">Record inputs</span>
        <span className="facts-hint">Read from the record. Mark the ones the rule cannot decide without.</span>
      </div>
      {names.map((name) => (
        <div key={name} className="fact-row">
          <span className="fact-name fact-static">{name}</span>
          <label className="fact-check" title="Required: the rule rejects a missing value (EDP060)">
            <input type="checkbox" checked={ruleFor(rules, name).required} disabled={disabled}
              onChange={(e) => setFlag(name, 'required', e.target.checked)} />
            req
          </label>
          <label className="fact-check" title="Nullable: clear it to reject an empty value (EDP061)">
            <input type="checkbox" checked={ruleFor(rules, name).nullable} disabled={disabled}
              onChange={(e) => setFlag(name, 'nullable', e.target.checked)} />
            null ok
          </label>
        </div>
      ))}
    </div>
  );
}
