// src/components/CreateProcessWizard/Step2CrmBinding.tsx
import { useState, useEffect, useCallback } from 'react';
import { useSopAdapter } from '@/hooks/useSopAdapter';
import type { AutoNumberEntityOption, AutoNumberFieldOption } from '@/types/WorkflowTypes';
import type { Step2Values } from './wizardSchemas';
import { SearchableDropdown } from '@/components/common/SearchableDropdown';

interface Step2CrmBindingProps {
  initialValues: Step2Values;
  onValidated(values: Step2Values): void;
  onBack(): void;
}

export function Step2CrmBinding({ initialValues, onValidated, onBack }: Step2CrmBindingProps) {
  const adapter = useSopAdapter();

  const [taskEntity, setTaskEntity] = useState(initialValues.taskEntity || '');
  const [regardingField, setRegardingField] = useState(initialValues.regardingField || '');
  const [parentEntity, setParentEntity] = useState(initialValues.parentEntity || '');

  const [entities, setEntities] = useState<AutoNumberEntityOption[]>([]);
  const [fields, setFields] = useState<AutoNumberFieldOption[]>([]);
  const [isLoadingEntities, setIsLoadingEntities] = useState(false);
  const [isLoadingFields, setIsLoadingFields] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [taskEntityError, setTaskEntityError] = useState('');

  useEffect(() => {
    setIsLoadingEntities(true);
    adapter
      .getAutoNumberEntities()
      .then(setEntities)
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load entities.');
      })
      .finally(() => setIsLoadingEntities(false));
  }, [adapter]);

  const handleTaskEntityChange = useCallback((id: string) => {
    setTaskEntity(id);
    setRegardingField('');
    setFields([]);
    setTaskEntityError('');
    if (!id) return;
    setIsLoadingFields(true);
    adapter
      .getAutoNumberEntityFields(id)
      .then(setFields)
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load fields.');
      })
      .finally(() => setIsLoadingFields(false));
  }, [adapter]);

  const handleNext = useCallback(() => {
    if (!taskEntity) {
      setTaskEntityError('Task entity is required.');
      return;
    }
    setTaskEntityError('');
    onValidated({ taskEntity, regardingField, parentEntity });
  }, [taskEntity, regardingField, parentEntity, onValidated]);

  return (
    <div style={containerStyle}>
      {loadError && <div className="notice error">{loadError}</div>}

      {isLoadingEntities ? (
        <div style={spinnerRowStyle}>
          <span className="spinner sm" /> Loading entities…
        </div>
      ) : (
        <>
          <SearchableDropdown
            label="Task Entity"
            placeholder="Search and select entity…"
            options={entities}
            value={taskEntity || null}
            onChange={handleTaskEntityChange}
            required
          />
          {taskEntityError && <span style={errorTextStyle}>{taskEntityError}</span>}

          {isLoadingFields ? (
            <div style={spinnerRowStyle}>
              <span className="spinner sm" /> Loading fields…
            </div>
          ) : (
            <SearchableDropdown
              label="Regarding Field (optional)"
              placeholder={taskEntity ? 'Search and select field…' : 'Select task entity first'}
              options={fields}
              value={regardingField || null}
              onChange={(id) => setRegardingField(id)}
              disabled={!taskEntity}
            />
          )}

          <SearchableDropdown
            label="Parent Entity (optional)"
            placeholder="Search and select entity…"
            options={entities}
            value={parentEntity || null}
            onChange={(id) => setParentEntity(id)}
          />
        </>
      )}

      <div className="dialog-foot">
        <button type="button" className="btn" onClick={onBack}>
          ← Back
        </button>
        <button type="button" className="btn primary" onClick={handleNext} disabled={isLoadingEntities}>
          Next →
        </button>
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 18 };

const spinnerRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  fontSize: 13, color: 'var(--text-secondary)', padding: '4px 0',
};

const errorTextStyle: React.CSSProperties = { fontSize: 11, color: 'var(--error)', marginTop: -12 };

