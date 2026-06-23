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
    <div style={overlayStyle} onClick={handleOverlayClick} onKeyDown={handleKeyDown}>
      <div style={cardStyle} role="dialog" aria-modal="true" aria-label="New Process">
        {/* Header */}
        <div style={headerStyle}>
          <span style={titleStyle}>Create New Process</span>
          <button type="button" style={closeBtnStyle} onClick={onClose} aria-label="Close">
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
              <SearchableDropdown
                label="Task Entity"
                placeholder="Search and select entity…"
                options={entities}
                value={taskEntityId}
                onChange={handleTaskEntityChange}
                required
              />

              {/* Regarding Field */}
              {isLoadingFields ? (
                <div style={spinnerRowStyle}>
                  <span style={spinnerStyle} /> Loading fields…
                </div>
              ) : (
                <SearchableDropdown
                  label="Regarding Field"
                  placeholder={taskEntityId ? 'Search and select field…' : 'Select task entity first'}
                  options={fields}
                  value={regardingFieldId}
                  onChange={handleRegardingFieldChange}
                  disabled={!taskEntityId}
                  required
                />
              )}

              {/* Parent Entity */}
              <SearchableDropdown
                label="Parent Entity"
                placeholder="Search and select entity…"
                options={entities}
                value={parentEntityId}
                onChange={handleParentEntityChange}
                required
              />
            </>
          )}
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <button type="button" style={cancelBtnStyle} onClick={onClose}>
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

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15,23,42,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9000,
};

const cardStyle: React.CSSProperties = {
  width: 500,
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
  display: 'flex',
  flexDirection: 'column',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '18px 24px 16px',
  borderBottom: '1px solid #f1f5f9',
  flexShrink: 0,
};

const titleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: '#0f172a',
};

const closeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#94a3b8',
  fontSize: 22,
  cursor: 'pointer',
  lineHeight: 1,
  padding: 0,
  display: 'flex',
  alignItems: 'center',
};

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
  color: '#374151',
};

const requiredMark: React.CSSProperties = {
  color: '#dc2626',
};

const inputStyle: React.CSSProperties = {
  height: 34,
  padding: '0 10px',
  background: '#fff',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  color: '#1e293b',
  fontSize: 13,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const footerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  padding: '14px 24px',
  borderTop: '1px solid #f1f5f9',
  background: '#f8fafc',
  borderRadius: '0 0 12px 12px',
  flexShrink: 0,
};

const cancelBtnStyle: React.CSSProperties = {
  height: 34,
  padding: '0 18px',
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  color: '#374151',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
};

const confirmBtnStyle: React.CSSProperties = {
  height: 34,
  padding: '0 18px',
  background: '#2563eb',
  border: 'none',
  borderRadius: 6,
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const confirmBtnDisabledStyle: React.CSSProperties = {
  ...confirmBtnStyle,
  background: '#93c5fd',
  cursor: 'not-allowed',
};

const spinnerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 0',
  fontSize: 13,
  color: '#64748b',
};

const spinnerStyle: React.CSSProperties = {
  display: 'inline-block',
  width: 14,
  height: 14,
  border: '2px solid #e2e8f0',
  borderTopColor: '#2563eb',
  borderRadius: '50%',
  animation: 'spin 0.7s linear infinite',
};

const errorStyle: React.CSSProperties = {
  padding: '10px 14px',
  background: '#fef2f2',
  border: '1px solid #fecaca',
  borderRadius: 6,
  color: '#991b1b',
  fontSize: 13,
};
