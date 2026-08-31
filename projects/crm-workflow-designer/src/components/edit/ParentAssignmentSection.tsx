import { useEffect, useState } from 'react';
import type { AssignmentFields, AutoNumberEntityOption, AutoNumberFieldOption } from '@/types/WorkflowTypes';
import type { ICrmAdapter } from '@/services/ICrmAdapter';
import { logError } from '@/services/logError';
import { LookupField } from '@/components/common/LookupDialog';

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
        <LookupField
          label="Lookup on the task’s record"
          placeholder="— Choose a lookup —"
          dialogTitle="Choose a lookup field"
          clearLabel="— No lookup —"
          disabled={disabled}
          options={ownFields.map((field) => ({ id: field.id, name: field.name }))}
          value={value.parentAssignFieldId}
          onChange={(id, name) =>
            onChange({
              parentAssignFieldId: id || null,
              parentAssignFieldName: id ? name : null,
            })
          }
        />
        <span className="hint-inline">The field that points at the parent record.</span>
      </div>

      <div style={fieldStyle}>
        <LookupField
          label="Parent table"
          placeholder="— Choose a table —"
          dialogTitle="Choose the parent table"
          clearLabel="— No parent table —"
          disabled={disabled}
          options={entities.map((entity) => ({ id: entity.id, name: entity.name }))}
          value={value.parentAssignEntityId}
          onChange={(id, name) =>
            onChange({
              parentAssignEntityId: id || null,
              parentAssignEntityName: id ? name : null,
              parentAssignUserFieldId: null,
              parentAssignUserFieldName: null,
            })
          }
        />
      </div>

      <div style={fieldStyle}>
        <LookupField
          label="Owner field on the parent"
          placeholder="— Choose a field —"
          dialogTitle="Choose the owner field"
          clearLabel="— No owner field —"
          disabled={disabled || !value.parentAssignEntityId}
          options={parentFields.map((field) => ({ id: field.id, name: field.name }))}
          value={value.parentAssignUserFieldId}
          onChange={(id, name) =>
            onChange({
              parentAssignUserFieldId: id || null,
              parentAssignUserFieldName: id ? name : null,
            })
          }
        />
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
