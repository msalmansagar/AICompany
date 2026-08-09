import { useState, useEffect, useCallback } from 'react';
import type { ICrmAdapter } from '@/services/ICrmAdapter';
import type { AutoNumberEntityOption, AutoNumberFieldOption } from '@/types/WorkflowTypes';
import { SearchableDropdown } from '@/components/common/SearchableDropdown';

interface NewProcessConfirmParams {
  name: string;
  taskEntityId: string;
  taskEntityName: string;
  regardingFieldId: string;
  regardingFieldName: string;
  parentEntityId: string;
  parentEntityName: string;
}

interface NewProcessDialogProps {
  adapter: ICrmAdapter;
  onConfirm: (params: NewProcessConfirmParams) => void;
  onClose: () => void;
}

export function NewProcessDialog({ adapter, onConfirm, onClose }: NewProcessDialogProps) {
  const [name, setName] = useState('');
  const [taskEntityId, setTaskEntityId] = useState<string | null>(null);
  const [taskEntityName, setTaskEntityName] = useState('');
  const [regardingFieldId, setRegardingFieldId] = useState<string | null>(null);
  const [regardingFieldName, setRegardingFieldName] = useState('');
  const [parentEntityId, setParentEntityId] = useState<string | null>(null);
  const [parentEntityName, setParentEntityName] = useState('');

  const [entities, setEntities] = useState<AutoNumberEntityOption[]>([]);
  const [fields, setFields] = useState<AutoNumberFieldOption[]>([]);
  const [isLoadingEntities, setIsLoadingEntities] = useState(false);
  const [isLoadingFields, setIsLoadingFields] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const isFormComplete =
    name.trim().length > 0 &&
    taskEntityId !== null &&
    regardingFieldId !== null &&
    parentEntityId !== null;

  useEffect(() => {
    setIsLoadingEntities(true);
    setFetchError(null);
    adapter
      .getAutoNumberEntities()
      .then(setEntities)
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setFetchError(`Failed to load entities: ${message}`);
      })
      .finally(() => setIsLoadingEntities(false));
  }, [adapter]);

  const handleTaskEntityChange = useCallback(
    (id: string, entityName: string) => {
      if (!id) return;
      setTaskEntityId(id);
      setTaskEntityName(entityName);
      setRegardingFieldId(null);
      setRegardingFieldName('');
      setFields([]);

      setIsLoadingFields(true);
      setFetchError(null);
      adapter
        .getAutoNumberEntityFields(id)
        .then(setFields)
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          setFetchError(`Failed to load fields: ${message}`);
        })
        .finally(() => setIsLoadingFields(false));
    },
    [adapter]
  );

  const handleRegardingFieldChange = useCallback((id: string, fieldName: string) => {
    if (!id) return;
    setRegardingFieldId(id);
    setRegardingFieldName(fieldName);
  }, []);

  const handleParentEntityChange = useCallback((id: string, entityName: string) => {
    if (!id) return;
    setParentEntityId(id);
    setParentEntityName(entityName);
  }, []);

  const handleConfirm = useCallback(() => {
    if (!isFormComplete || !taskEntityId || !regardingFieldId || !parentEntityId) return;
    onConfirm({
      name: name.trim(),
      taskEntityId,
      taskEntityName,
      regardingFieldId,
      regardingFieldName,
      parentEntityId,
      parentEntityName,
    });
  }, [
    isFormComplete, name, taskEntityId, taskEntityName,
    regardingFieldId, regardingFieldName, parentEntityId, parentEntityName, onConfirm,
  ]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose(); },
    [onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => { if (e.key === 'Escape') onClose(); },
    [onClose]
  );

  return (
    <div className="dialog-backdrop" onClick={handleOverlayClick} onKeyDown={handleKeyDown}>
      <div className="dialog" style={{ width: 560 }} role="dialog" aria-modal="true" aria-label="New process">
        {/* Header */}
        <div className="dialog-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2>Create new process</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        {/* Body */}
        <div style={bodyStyle}>
          {isLoadingEntities && (
            <div style={spinnerRowStyle}>
              <span style={spinnerStyle} /> Loading entities…
            </div>
          )}

          {fetchError && <div style={errorStyle}>{fetchError}</div>}

          {!isLoadingEntities && (
            <>
              {/* Process Name */}
              <div style={fieldGroupStyle}>
                <label style={labelStyle}>
                  Process Name <span style={requiredMark}>*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter process name"
                  style={inputStyle}
                  autoFocus
                />
              </div>

              {/* Task Entity */}
              <div style={fieldGroupStyle}>
                <SearchableDropdown
                  label="Task Entity"
                  placeholder="Search and select entity…"
                  options={entities}
                  value={taskEntityId}
                  onChange={handleTaskEntityChange}
                  required
                />
                <div style={hintStyle}>The entity that stores each workflow task (e.g. QDB Task).</div>
              </div>

              {/* Regarding Field */}
              {isLoadingFields ? (
                <div style={spinnerRowStyle}>
                  <span style={spinnerStyle} /> Loading fields…
                </div>
              ) : (
                <div style={fieldGroupStyle}>
                  <SearchableDropdown
                    label="Regarding Field"
                    placeholder={taskEntityId ? 'Search and select field…' : 'Select task entity first'}
                    options={fields}
                    value={regardingFieldId}
                    onChange={handleRegardingFieldChange}
                    disabled={!taskEntityId}
                    required
                  />
                  <div style={hintStyle}>Lookup on the task that links back to the parent record.</div>
                </div>
              )}

              {/* Parent Entity */}
              <div style={fieldGroupStyle}>
                <SearchableDropdown
                  label="Parent Entity"
                  placeholder="Search and select entity…"
                  options={entities}
                  value={parentEntityId}
                  onChange={handleParentEntityChange}
                  required
                />
                <div style={hintStyle}>The business record the process runs on (e.g. Loan Application).</div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="dialog-foot">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            style={isFormComplete ? confirmBtnStyle : confirmBtnDisabledStyle}
            onClick={handleConfirm}
            disabled={!isFormComplete}
          >
            Create Process
          </button>
        </div>
      </div>
    </div>
  );
}

const bodyStyle: React.CSSProperties = {
  padding: '20px 24px',
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
};

const fieldGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text)',
};

const requiredMark: React.CSSProperties = {
  color: 'var(--error)',
};

const hintStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-disabled)',
  lineHeight: 1.4,
};

const inputStyle: React.CSSProperties = {
  height: 34,
  padding: '0 10px',
  background: 'var(--surface)',
  border: '1px solid var(--border-strong)',
  borderRadius: 6,
  color: 'var(--text)',
  fontSize: 13,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const confirmBtnStyle: React.CSSProperties = {
  height: 34,
  padding: '0 18px',
  background: 'var(--primary)',
  border: 'none',
  borderRadius: 6,
  color: 'var(--text-on-primary)',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const confirmBtnDisabledStyle: React.CSSProperties = {
  ...confirmBtnStyle,
  background: 'var(--primary-tint)',
  cursor: 'not-allowed',
};

const spinnerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 0',
  fontSize: 13,
  color: 'var(--text-secondary)',
};

const spinnerStyle: React.CSSProperties = {
  display: 'inline-block',
  width: 14,
  height: 14,
  border: '2px solid var(--border)',
  borderTopColor: 'var(--primary)',
  borderRadius: '50%',
  animation: 'spin 0.7s linear infinite',
};

const errorStyle: React.CSSProperties = {
  padding: '10px 14px',
  background: 'var(--error-bg)',
  border: '1px solid var(--error)',
  borderRadius: 6,
  color: 'var(--error)',
  fontSize: 13,
};
