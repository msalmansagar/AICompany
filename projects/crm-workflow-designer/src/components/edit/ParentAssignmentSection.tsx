import { useEffect, useId, useState } from 'react';
import type { AssignmentFields, AutoNumberEntityOption, AutoNumberFieldOption } from '@/types/WorkflowTypes';
import type { ICrmAdapter } from '@/services/ICrmAdapter';
import { logError } from '@/services/logError';

// DP-3 — "Read From Parent" assignment (qdb_task_assign_to = 100000003).
//
// The engine's resolver walks three hops to find the owner:
//
//   1. qdb_assignto_parentfield     — a lookup on the task's OWN record
//   2. qdb_assignto_parententity    — the table that lookup points at
//   3. qdb_assignto_user_mapping    — the user field on THAT record
//
// so ownership follows the application rather than being fixed at design time.
// All three must be set: the resolver's branch tests every one of them, and
// falls through to "Task Assignment is not proper defined" if any is missing.

interface ParentAssignmentSectionProps {
  value: AssignmentFields;
  onChange: (patch: Partial<AssignmentFields>) => void;
  adapter: ICrmAdapter;
  disabled?: boolean;
}

export function ParentAssignmentSection({
  value,
  onChange,
  adapter,
  disabled,
}: ParentAssignmentSectionProps) {
  const sectionId = useId();
  const [entities, setEntities] = useState<AutoNumberEntityOption[]>([]);
  const [ownFields, setOwnFields] = useState<AutoNumberFieldOption[]>([]);
  const [parentFields, setParentFields] = useState<AutoNumberFieldOption[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    adapter
      .getAutoNumberEntities()
      .then(setEntities)
      .catch((error) => {
        logError('ParentAssignmentSection:loadEntities', error);
        setLoadFailed(true);
      });
  }, [adapter]);

  useEffect(() => {
    adapter
      .getAutoNumberEntityFields()
      .then(setOwnFields)
      .catch((error) => logError('ParentAssignmentSection:loadOwnFields', error));
  }, [adapter]);

  const parentEntityId = value.parentAssignEntityId;
  useEffect(() => {
    if (!parentEntityId) {
      setParentFields([]);
      return;
    }
    adapter
      .getAutoNumberEntityFields(parentEntityId)
      .then(setParentFields)
      .catch((error) => logError('ParentAssignmentSection:loadParentFields', error));
  }, [adapter, parentEntityId]);

  return (
    <div className="section-body">
      <div style={fieldStyle}>
        <label className="lbl" htmlFor={`${sectionId}-lookup`}>
          Lookup on the task&rsquo;s record
        </label>
        <select
          id={`${sectionId}-lookup`}
          className="fluent-select"
          disabled={disabled}
          value={value.parentAssignFieldId ?? ''}
          onChange={(event) => {
            const id = event.target.value || null;
            onChange({
              parentAssignFieldId: id,
              parentAssignFieldName: ownFields.find((field) => field.id === id)?.name ?? null,
            });
          }}
        >
          <option value="">— Choose a lookup —</option>
          {ownFields.map((field) => (
            <option key={field.id} value={field.id}>{field.name}</option>
          ))}
        </select>
        <span className="hint-inline">The field that points at the parent record.</span>
      </div>

      <div style={fieldStyle}>
        <label className="lbl" htmlFor={`${sectionId}-entity`}>Parent table</label>
        <select
          id={`${sectionId}-entity`}
          className="fluent-select"
          disabled={disabled}
          value={value.parentAssignEntityId ?? ''}
          onChange={(event) => {
            const id = event.target.value || null;
            onChange({
              parentAssignEntityId: id,
              parentAssignEntityName: entities.find((entity) => entity.id === id)?.name ?? null,
              parentAssignUserFieldId: null,
              parentAssignUserFieldName: null,
            });
          }}
        >
          <option value="">— Choose a table —</option>
          {entities.map((entity) => (
            <option key={entity.id} value={entity.id}>{entity.name}</option>
          ))}
        </select>
      </div>

      <div style={fieldStyle}>
        <label className="lbl" htmlFor={`${sectionId}-owner`}>Owner field on the parent</label>
        <select
          id={`${sectionId}-owner`}
          className="fluent-select"
          disabled={disabled || !value.parentAssignEntityId}
          value={value.parentAssignUserFieldId ?? ''}
          onChange={(event) => {
            const id = event.target.value || null;
            onChange({
              parentAssignUserFieldId: id,
              parentAssignUserFieldName: parentFields.find((field) => field.id === id)?.name ?? null,
            });
          }}
        >
          <option value="">— Choose a field —</option>
          {parentFields.map((field) => (
            <option key={field.id} value={field.id}>{field.name}</option>
          ))}
        </select>
        <span className="hint-inline">
          {value.parentAssignEntityId
            ? 'The user on this field becomes the task owner.'
            : 'Choose a parent table first.'}
        </span>
      </div>

      {loadFailed && <div className="notice warning">Could not load tables.</div>}
    </div>
  );
}

// --- styles (match the dark step panel) ---

const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
