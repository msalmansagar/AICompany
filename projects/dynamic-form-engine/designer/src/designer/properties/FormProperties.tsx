import React, { useCallback } from 'react';
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Checkbox,
  Divider,
  Dropdown,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Option,
  Text,
  Textarea,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import type { SummaryMode } from '@qdb/shared';
import { isRenderableImageUrl } from '@qdb/shared';
import { useDesignerStore } from '@/state/designerStore';
import { SUBMIT_CONFIRMATION_LABEL_MAX_LENGTH } from '@/constants/columnLimits';
import { EntityCombobox } from '@/components/EntityCombobox';
import { TranslationsPanel } from '@/designer/properties/panels/TranslationsPanel';

// DFE-FBE-001: display label for a summary mode value.
function summaryModeLabel(mode: SummaryMode): string {
  if (mode === 'SystemGenerated') return 'System-generated';
  if (mode === 'Manual') return 'Manual (summary tab)';
  return 'None';
}

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

interface ValidationHint {
  state: 'none' | 'error';
  message?: string;
}

function describeImageUrl(url: string | null | undefined): ValidationHint {
  if (!url) return { state: 'none' };
  if (isRenderableImageUrl(url)) return { state: 'none' };
  return { state: 'error', message: 'Must be an absolute http:// or https:// URL — this will not render.' };
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

  // Only absolute http(s) URLs render — see isRenderableImageUrl. Saying so in the panel
  // beats a maker discovering it as a missing image in the published form.
  const imageUrlState = describeImageUrl(form?.imageUrl);

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

      <Field label="Target CRM Entity" hint="Search Dataverse tables by name (e.g. contact, account)">
        <EntityCombobox
          value={form.entityLogicalName}
          onChange={logicalName => updateForm({ entityLogicalName: logicalName })}
          preferredEntity={form.entityLogicalName}
          placeholder="e.g. contact, account, qdb_application"
        />
      </Field>

      <Divider />
      <SectionHeading label="Submission" />

      {/* DFE-FBE-001: Summary mode replaces the legacy Show Summary Step boolean. */}
      <Field
        label="Summary Mode"
        hint="None = no review step · System-generated = auto review · Manual = build a summary tab"
      >
        <Dropdown
          selectedOptions={[form.summaryMode ?? (form.showSummaryStep ? 'SystemGenerated' : 'None')]}
          value={summaryModeLabel(form.summaryMode ?? (form.showSummaryStep ? 'SystemGenerated' : 'None'))}
          onOptionSelect={(_, data) => {
            const mode = data.optionValue as SummaryMode;
            // Keep the legacy boolean in sync so older readers still behave correctly.
            updateForm({ summaryMode: mode, showSummaryStep: mode === 'SystemGenerated' });
          }}
        >
          <Option value="None">None</Option>
          <Option value="SystemGenerated">System-generated</Option>
          <Option value="Manual">Manual (summary tab)</Option>
        </Dropdown>
      </Field>
      {form.summaryMode == null && form.showSummaryStep && (
        <MessageBar intent="warning">
          <MessageBarBody>
            This form uses the legacy summary flag. Selecting a Summary Mode above migrates it (no data is lost).
          </MessageBarBody>
        </MessageBar>
      )}

      {/* DFE-FBE-002: form-completion progress bar. */}
      <Checkbox
        label="Show completion progress bar"
        checked={form.showProgressBar === true}
        onChange={(_, data) => updateForm({ showProgressBar: data.checked === true })}
      />

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
      <SectionHeading label="Form Mark" />

      <Field
        label="Icon"
        hint="Fluent icon shown beside the form title. Ignored while an image URL is set."
      >
        <Input
          value={form.iconName ?? ''}
          onChange={(_, data) => updateForm({ iconName: data.value || null })}
          placeholder="e.g. DocumentBulletList"
          style={{ fontFamily: 'monospace' }}
        />
      </Field>

      <Field
        label="Image URL"
        hint="Absolute https image shown instead of the icon. The portal CSP must allow the host."
        validationState={imageUrlState.state}
        validationMessage={imageUrlState.message}
      >
        <Input
          value={form.imageUrl ?? ''}
          onChange={(_, data) => updateForm({ imageUrl: data.value || null })}
          placeholder="https://example.com/logo.png"
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
      <SectionHeading label="Submit Confirmation" />

      <Field
        label="Acknowledgement Checkbox Label"
        hint="When set, the final step shows this checkbox and Submit stays disabled until it is ticked. Leave blank to disable the gate."
      >
        <Textarea
          value={form.submitConfirmationLabel ?? ''}
          onChange={(_, data) => updateForm({ submitConfirmationLabel: data.value || null })}
          placeholder="e.g. I confirm the information is accurate and complete"
          maxLength={SUBMIT_CONFIRMATION_LABEL_MAX_LENGTH}
          rows={2}
        />
      </Field>

      <Field label="Confirmation Dialog Message" hint="Body of the popup shown when the box is ticked.">
        <Textarea
          value={form.submitConfirmationMessage ?? ''}
          onChange={(_, data) => updateForm({ submitConfirmationMessage: data.value || null })}
          placeholder="e.g. Are you sure you want to submit this application?"
          rows={2}
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

      <Divider />
      <Accordion collapsible>
        <AccordionItem value="translations">
          <AccordionHeader>Translations</AccordionHeader>
          <AccordionPanel>
            <TranslationsPanel
              entityName="qdb_form_definition"
              recordId={form.id}
              entityLabel="Form"
              formCode={form.code}
            />
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
