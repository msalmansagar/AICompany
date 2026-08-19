import { useState, useEffect, useCallback } from 'react';
import type { ICrmAdapter } from '@/services/ICrmAdapter';
import type { AutoNumberEntityOption, AutoNumberFieldOption, WorkflowProcess } from '@/types/WorkflowTypes';

/**
 * The process's own settings, reachable from inside the designer.
 *
 * Until now these could only be chosen when the process was created, so a typo in the
 * name meant rebuilding it. The entity bindings are editable too, but they carry a
 * warning once steps exist: a step stores its own copy of the entity references, taken
 * from the process when the step was first saved, so changing them here reaches new
 * steps and leaves the existing ones as they were.
 */

interface ProcessPropertiesDialogProps {
  process: WorkflowProcess;
  adapter: ICrmAdapter;
  /** How many steps the process has, so the entity warning is only shown when it applies. */
  stepCount: number;
  onSave: (process: WorkflowProcess) => void;
  onDismiss: () => void;
}

export function ProcessPropertiesDialog({
  process,
  adapter,
  stepCount,
  onSave,
  onDismiss,
}: ProcessPropertiesDialogProps) {
  const [name, setName] = useState(process.name);
  const [recordEntity, setRecordEntity] = useState(process.recordEntity);
  const [recordEntityName, setRecordEntityName] = useState(process.recordEntityName);
  const [regardingField, setRegardingField] = useState(process.regardingField);
  const [parentEntity, setParentEntity] = useState(process.parentEntity);
  const [parentEntityName, setParentEntityName] = useState(process.parentEntityName);

  const [entities, setEntities] = useState<AutoNumberEntityOption[]>([]);
  const [fields, setFields] = useState<AutoNumberFieldOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    adapter
      .getAutoNumberEntities()
      .then(setEntities)
      .catch((error: unknown) => setLoadError(describe(error, 'entities')));
  }, [adapter]);

  const loadFields = useCallback(
    (entityId: string) => {
      if (!entityId) {
        setFields([]);
        return;
      }
      adapter
        .getAutoNumberEntityFields(entityId)
        .then(setFields)
        .catch((error: unknown) => setLoadError(describe(error, 'fields')));
    },
    [adapter]
  );

  useEffect(() => { loadFields(recordEntity); }, [loadFields, recordEntity]);

  const entityChanged = recordEntity !== process.recordEntity;
  const canSave = name.trim().length > 0;

  function handleSave(): void {
    if (!canSave) return;
    onSave({
      ...process,
      name: name.trim(),
      recordEntity,
      recordEntityName,
      regardingField,
      parentEntity,
      parentEntityName,
    });
  }

  return (
    <div className="dialog-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}>
      <div className="dialog" style={{ width: 'min(620px, 94vw)' }} role="dialog" aria-modal="true" aria-label="Process properties">
        <div className="dialog-head"><h2>Process properties</h2></div>

        <div className="dialog-body" style={bodyStyle}>
          <Field label="Name">
            <input
              className="fluent-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Process name"
              autoFocus
            />
            {!canSave && <div style={errorText} role="alert">A process needs a name.</div>}
          </Field>

          <Field label="Application entity">
            <select
              className="fluent-select"
              value={recordEntity}
              onChange={(e) => {
                const chosen = entities.find((entity) => entity.id === e.target.value);
                setRecordEntity(chosen?.id ?? '');
                setRecordEntityName(chosen?.name ?? null);
                setRegardingField('');
              }}
            >
              <option value="">— Not set —</option>
              {entities.map((entity) => (
                <option key={entity.id} value={entity.id}>{entity.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Regarding field">
            <select
              className="fluent-select"
              value={regardingField}
              onChange={(e) => setRegardingField(e.target.value)}
              disabled={!recordEntity}
            >
              <option value="">— Not set —</option>
              {fields.map((field) => (
                <option key={field.id} value={field.id}>{field.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Parent entity">
            <select
              className="fluent-select"
              value={parentEntity}
              onChange={(e) => {
                const chosen = entities.find((entity) => entity.id === e.target.value);
                setParentEntity(chosen?.id ?? '');
                setParentEntityName(chosen?.name ?? null);
              }}
            >
              <option value="">— Not set —</option>
              {entities.map((entity) => (
                <option key={entity.id} value={entity.id}>{entity.name}</option>
              ))}
            </select>
          </Field>

          {entityChanged && stepCount > 0 && (
            <div className="notice warning" role="alert">
              Changing the application entity affects steps added from now on. The{' '}
              {stepCount} step{stepCount === 1 ? '' : 's'} already in this process keep the
              entity references saved with them.
            </div>
          )}

          {loadError && <div className="notice error" role="alert">{loadError}</div>}

          <div style={readOnlyGrid}>
            <ReadOnly label="Version" value={`${process.versionMajor}.${process.versionMinor}`} />
            <ReadOnly label="State" value={process.workflowState} />
            <ReadOnly label="Created on" value={formatDate(process.createdOn)} />
            <ReadOnly label="Created by" value={process.createdByName ?? '—'} />
          </div>
        </div>

        <div className="dialog-foot">
          <button type="button" className="btn" onClick={onDismiss}>Cancel</button>
          <button type="button" className="btn primary" onClick={handleSave} disabled={!canSave}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

function describe(error: unknown, what: string): string {
  return `Failed to load ${what}: ${error instanceof Error ? error.message : String(error)}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString();
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div className="lbl">{label}</div>
      {children}
    </div>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="lbl">{label}</div>
      <div style={readOnlyValue}>{value}</div>
    </div>
  );
}

const bodyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  maxHeight: '68vh',
  overflowY: 'auto',
  minHeight: 0,
};

const readOnlyGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 12,
  paddingTop: 4,
  borderTop: '1px solid var(--border)',
};

const readOnlyValue: React.CSSProperties = {
  fontSize: 12.5,
  color: 'var(--text-secondary)',
  padding: '4px 0',
};

const errorText: React.CSSProperties = { fontSize: 11.5, color: 'var(--error)' };
