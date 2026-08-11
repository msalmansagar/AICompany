import { useState } from 'react';
import { SOP_STATUS } from '@/types/SopTypes';
import type { Sop, SopStatus } from '@/types/SopTypes';

// The SOP's own properties, which until now could only be set at creation and
// never changed. Name, version and description are free text; status is the
// lifecycle, so it is a picker rather than something typed.

interface SopPropertiesDialogProps {
  sop: Sop;
  onSave(patch: Partial<Sop>): void;
  onClose(): void;
}

const STATUS_OPTIONS: Array<{ value: SopStatus; label: string; hint: string }> = [
  { value: SOP_STATUS.DRAFT, label: 'Draft', hint: 'Editable; cannot yet produce a process' },
  { value: SOP_STATUS.PUBLISHED, label: 'Published', hint: 'Processes can be derived from it' },
  { value: SOP_STATUS.RETIRED, label: 'Retired', hint: 'Kept for history; no new processes' },
];

export function SopPropertiesDialog({ sop, onSave, onClose }: SopPropertiesDialogProps) {
  const [name, setName] = useState(sop.name);
  const [version, setVersion] = useState(sop.version);
  const [description, setDescription] = useState(sop.description);
  const [status, setStatus] = useState<SopStatus>(sop.status);

  const trimmedName = name.trim();
  const statusHint = STATUS_OPTIONS.find((option) => option.value === status)?.hint;

  const handleSave = () => {
    if (!trimmedName) return;
    onSave({
      name: trimmedName,
      version: version.trim() || '1.0',
      description: description.trim(),
      status,
    });
  };

  return (
    <div
      className="dialog-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="SOP properties"
    >
      <div className="dialog" style={{ width: 520 }}>
        <div className="dialog-head"><h2>SOP properties</h2></div>

        <div className="dialog-body">
          <div className="field-grid">
            <div className="field col-2">
              <label className="lbl" htmlFor="sop-prop-name">Name<span className="req">*</span></label>
              <input
                id="sop-prop-name"
                type="text"
                className="fluent-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="field">
              <label className="lbl" htmlFor="sop-prop-version">Version</label>
              <input
                id="sop-prop-version"
                type="text"
                className="fluent-input"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0"
              />
            </div>

            <div className="field">
              <label className="lbl" htmlFor="sop-prop-status">Status</label>
              <select
                id="sop-prop-status"
                className="fluent-select"
                value={status}
                onChange={(e) => setStatus(Number(e.target.value) as SopStatus)}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              {statusHint && <span className="hint-inline">{statusHint}</span>}
            </div>

            <div className="field col-2">
              <label className="lbl" htmlFor="sop-prop-description">Description</label>
              <textarea
                id="sop-prop-description"
                className="fluent-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="What this procedure covers, and when it applies."
              />
            </div>
          </div>
        </div>

        <div className="dialog-foot">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" onClick={handleSave} disabled={!trimmedName}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
