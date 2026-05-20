import React, { useCallback } from 'react';
import {
  Checkbox,
  Divider,
  Field,
  Input,
  Text,
  Textarea,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { useDesignerStore } from '@/state/designerStore';

const useStyles = makeStyles({
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  sectionHeading: {
    color: tokens.colorNeutralForeground3,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
});

function SectionHeading({ label }: { label: string }): React.ReactElement {
  const styles = useStyles();
  return (
    <Text size={100} weight="semibold" className={styles.sectionHeading}>
      {label}
    </Text>
  );
}

export function FormProperties(): React.ReactElement {
  const styles = useStyles();
  const form = useDesignerStore(state => state.form);
  const updateForm = useDesignerStore(state => state.updateForm);

  const handleCodeChange = useCallback(
    (_: React.ChangeEvent<HTMLInputElement>, data: { value: string }) => {
      const sanitized = data.value.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      updateForm({ code: sanitized });
    },
    [updateForm]
  );

  if (!form) return <></>;

  return (
    <div className={styles.form}>
      <SectionHeading label="Identity" />

      <Field label="Form Name" required>
        <Input
          value={form.name}
          onChange={(_, data) => updateForm({ name: data.value })}
          placeholder="e.g. Loan Application Form"
        />
      </Field>

      <Field
        label="Form Code"
        required
        hint="Unique identifier. Lowercase letters, numbers, underscores only."
      >
        <Input
          value={form.code}
          onChange={handleCodeChange}
          placeholder="e.g. loan_application"
          style={{ fontFamily: 'monospace' }}
        />
      </Field>

      <Field label="Description">
        <Textarea
          value={form.description}
          onChange={(_, data) => updateForm({ description: data.value })}
          placeholder="Describe the purpose of this form..."
          rows={3}
        />
      </Field>

      <Field label="Target CRM Entity" hint="Dataverse entity logical name (e.g. contact, account)">
        <Input
          value={form.entityLogicalName}
          onChange={(_, data) => updateForm({ entityLogicalName: data.value })}
          placeholder="e.g. contact, account, qdb_application"
        />
      </Field>

      <Divider />
      <SectionHeading label="Submission" />

      <Checkbox
        label="Allow Save as Draft"
        checked={form.allowSaveDraft}
        onChange={(_, data) => updateForm({ allowSaveDraft: data.checked === true })}
      />

      {form.allowSaveDraft && (
        <Field label="Draft Expiry (days)" hint="Leave blank for no expiry">
          <Input
            type="number"
            value={form.draftExpiryDays != null ? String(form.draftExpiryDays) : ''}
            onChange={(_, data) =>
              updateForm({ draftExpiryDays: data.value ? parseInt(data.value, 10) : null })
            }
            placeholder="e.g. 90"
          />
        </Field>
      )}

      <Field label="Power Automate Flow ID" hint="GUID of the flow triggered on submission">
        <Input
          value={form.powerAutomateFlowId ?? ''}
          onChange={(_, data) => updateForm({ powerAutomateFlowId: data.value || null })}
          placeholder="e.g. 00000000-0000-0000-0000-000000000000"
          style={{ fontFamily: 'monospace' }}
        />
      </Field>

      <Divider />
      <SectionHeading label="Confirmation" />

      <Field label="Confirmation Message" hint="Shown after successful submission. Use {refNumber} for the reference.">
        <Textarea
          value={form.confirmationMessage ?? ''}
          onChange={(_, data) => updateForm({ confirmationMessage: data.value || null })}
          placeholder="e.g. Your application has been submitted. Reference: {refNumber}"
          rows={3}
        />
      </Field>

      <Field
        label="Reference Number Attribute"
        hint="CRM attribute whose value shows as the reference number"
      >
        <Input
          value={form.confirmationRecordRefAttribute ?? ''}
          onChange={(_, data) =>
            updateForm({ confirmationRecordRefAttribute: data.value || null })
          }
          placeholder="e.g. qdb_ref_number"
          style={{ fontFamily: 'monospace' }}
        />
      </Field>

      <Divider />
      <SectionHeading label="Access Control" />

      <Field label="Access Group ID" hint="Azure AD group Object ID. Leave blank for any authenticated user.">
        <Input
          value={form.accessGroupId ?? ''}
          onChange={(_, data) => updateForm({ accessGroupId: data.value || null })}
          placeholder="e.g. 00000000-0000-0000-0000-000000000000"
          style={{ fontFamily: 'monospace' }}
        />
      </Field>
    </div>
  );
}
