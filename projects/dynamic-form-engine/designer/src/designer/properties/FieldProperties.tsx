import React from 'react';
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Button,
  Divider,
  Field,
  Input,
  Switch,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { TableRegular } from '@fluentui/react-icons';
import { useDesignerStore } from '@/state/designerStore';
import { TranslationsPanel } from '@/designer/properties/panels/TranslationsPanel';
import type { DesignerFieldModel } from '@/state/models/DesignerFormModel';
import { ValidationRulesPanel } from './panels/ValidationRulesPanel';
import { TextFieldPanel } from './panels/TextFieldPanel';
import { NumberFieldPanel } from './panels/NumberFieldPanel';
import { DropdownFieldPanel } from './panels/DropdownFieldPanel';
import { LookupFieldPanel } from './panels/LookupFieldPanel';
import { DateFieldPanel } from './panels/DateFieldPanel';
import { CheckboxFieldPanel } from './panels/CheckboxFieldPanel';
import { FileUploadFieldPanel } from './panels/FileUploadFieldPanel';
import { RichTextFieldPanel } from './panels/RichTextFieldPanel';
import { BooleanFieldPanel } from './panels/BooleanFieldPanel';
import { InfoCardFieldPanel } from './panels/InfoCardFieldPanel';
import { InteractiveGridFieldPanel } from './panels/InteractiveGridFieldPanel';
import { RepeatingGridFieldPanel } from './panels/RepeatingGridFieldPanel';
import { LabelFieldPanel } from './panels/LabelFieldPanel';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  sectionHeading: {
    color: tokens.colorNeutralForeground3,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  columnSpanGroup: {
    display: 'flex',
    gap: '6px',
  },
  columnSpanButton: {
    flex: 1,
  },
  switchRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  emptyState: {
    color: tokens.colorNeutralForeground3,
    padding: '16px 0',
  },
});

function resolveTypePanel(field: DesignerFieldModel): React.ReactElement | null {
  switch (field.fieldType) {
    case 'text':
    case 'textarea':
    case 'email':
    case 'phone':
      return <TextFieldPanel field={field} />;
    case 'number':
      return <NumberFieldPanel field={field} />;
    case 'dropdown':
    case 'multi_select':
    case 'radio':
      return <DropdownFieldPanel field={field} />;
    case 'lookup':
      return <LookupFieldPanel field={field} />;
    case 'date':
    case 'datetime':
      return <DateFieldPanel field={field} />;
    case 'checkbox':
      return <CheckboxFieldPanel field={field} />;
    case 'file_upload':
      return <FileUploadFieldPanel field={field} />;
    case 'rich_text':
      return <RichTextFieldPanel field={field} />;
    case 'boolean':
      return <BooleanFieldPanel field={field} />;
    case 'info-card':
      return <InfoCardFieldPanel field={field} />;
    case 'interactive-grid':
      return <InteractiveGridFieldPanel field={field} />;
    case 'repeating_grid':
      return <RepeatingGridFieldPanel field={field} />;
    case 'custom':
      return <CustomFieldPanel field={field} />;
    case 'label':
      return <LabelFieldPanel field={field} />;
    default:
      return null;
  }
}

// Display-only field types that have no input value — hide irrelevant controls.
const DISPLAY_ONLY_TYPES = new Set(['info-card', 'label']);

// Field types that support inline prefix/suffix decorators.
const FIELD_TYPES_WITH_AFFIX = new Set([
  'text', 'textarea', 'email', 'phone', 'url',
  'number', 'decimal',
]);

function CustomFieldPanel({ field }: { field: DesignerFieldModel }): React.ReactElement {
  const updateField = useDesignerStore(s => s.updateField);
  return (
    <Field
      label="Component Key"
      hint="ComponentRegistry key used to resolve the custom React component at runtime."
    >
      <Input
        value={field.componentKey ?? ''}
        onChange={(_, d) => updateField(field.id, { componentKey: d.value || null })}
        placeholder="e.g. qdb/loanCalculator"
        style={{ fontFamily: 'monospace' }}
      />
    </Field>
  );
}

interface ColumnSpanButtonsProps {
  value: 1 | 2 | 3;
  onChange: (span: 1 | 2 | 3) => void;
}

function ColumnSpanButtons({ value, onChange }: ColumnSpanButtonsProps): React.ReactElement {
  const styles = useStyles();

  return (
    <div className={styles.columnSpanGroup}>
      {([1, 2, 3] as const).map(span => (
        <Button
          key={span}
          className={styles.columnSpanButton}
          appearance={value === span ? 'primary' : 'outline'}
          size="small"
          onClick={() => onChange(span)}
          aria-pressed={value === span}
        >
          {span}
        </Button>
      ))}
    </div>
  );
}

interface SectionHeadingProps {
  label: string;
}

function SectionHeading({ label }: SectionHeadingProps): React.ReactElement {
  const styles = useStyles();
  return (
    <Text size={100} weight="semibold" className={styles.sectionHeading}>
      {label}
    </Text>
  );
}

interface FieldPropertiesProps {
  fieldId: string;
}

export function FieldProperties({ fieldId }: FieldPropertiesProps): React.ReactElement {
  const styles = useStyles();
  const field = useDesignerStore(s => s.fields[fieldId] ?? null);
  const updateField = useDesignerStore(s => s.updateField);
  const formCode = useDesignerStore(s => s.form?.code ?? '');

  const handleLabelChange = (
    _: React.ChangeEvent<HTMLInputElement>,
    data: { value: string }
  ): void => { updateField(fieldId, { label: data.value }); };

  const handleCodeChange = (
    _: React.ChangeEvent<HTMLInputElement>,
    data: { value: string }
  ): void => {
    const sanitized = data.value.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    updateField(fieldId, { code: sanitized });
  };

  const handleColumnSpanChange = (span: 1 | 2 | 3): void => {
    updateField(fieldId, { columnSpan: span });
  };

  if (!field) {
    return (
      <Text className={styles.emptyState}>Select a field to edit its properties.</Text>
    );
  }

  const typePanel = resolveTypePanel(field);
  const isDisplayOnly = DISPLAY_ONLY_TYPES.has(field.fieldType);

  return (
    <div className={styles.root}>
      <SectionHeading label="Identity" />
      <div className={styles.fieldGroup}>
        <Field label="Label" required>
          <Input
            value={field.label}
            onChange={handleLabelChange}
            placeholder="e.g. First Name"
          />
        </Field>
        <Field
          label="Code"
          required
          hint="Lowercase letters, numbers, underscores only."
        >
          <Input
            value={field.code}
            onChange={handleCodeChange}
            placeholder="lowercase_with_underscores"
            style={{ fontFamily: 'monospace' }}
          />
        </Field>
      </div>

      <Divider />

      {!isDisplayOnly && (
        <>
          <SectionHeading label="Display" />
          <div className={styles.fieldGroup}>
            <Field label="Placeholder">
              <Input
                value={field.placeholder}
                onChange={(_, data) => updateField(fieldId, { placeholder: data.value })}
                placeholder="e.g. Enter your first name"
              />
            </Field>
            <Field label="Help Text" hint="Shown below the field as guidance">
              <Input
                value={field.helpText}
                onChange={(_, data) => updateField(fieldId, { helpText: data.value })}
                placeholder="e.g. Must match your ID document"
              />
            </Field>
            {FIELD_TYPES_WITH_AFFIX.has(field.fieldType) && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <Field label="Prefix" style={{ flex: 1 }}>
                  <Input
                    value={field.prefix ?? ''}
                    onChange={(_, data) => updateField(fieldId, { prefix: data.value || null })}
                    placeholder="e.g. $"
                  />
                </Field>
                <Field label="Suffix" style={{ flex: 1 }}>
                  <Input
                    value={field.suffix ?? ''}
                    onChange={(_, data) => updateField(fieldId, { suffix: data.value || null })}
                    placeholder="e.g. kg"
                  />
                </Field>
              </div>
            )}
            <Field label="Column Span">
              <ColumnSpanButtons value={field.columnSpan} onChange={handleColumnSpanChange} />
            </Field>
          </div>
          <Divider />
        </>
      )}

      {isDisplayOnly && (
        <>
          <SectionHeading label="Display" />
          <div className={styles.fieldGroup}>
            <Field label="Column Span">
              <ColumnSpanButtons value={field.columnSpan} onChange={handleColumnSpanChange} />
            </Field>
          </div>
          <Divider />
        </>
      )}

      <SectionHeading label="Behaviour" />
      <div className={styles.fieldGroup}>
        <div className={styles.switchRow}>
          {!isDisplayOnly && (
            <>
              <Switch
                label="Required"
                checked={field.isRequired}
                onChange={(_, data) => updateField(fieldId, { isRequired: data.checked })}
              />
              <Switch
                label="Read Only"
                checked={field.isReadOnly}
                onChange={(_, data) => updateField(fieldId, { isReadOnly: data.checked })}
              />
            </>
          )}
          <Switch
            label="Hidden"
            checked={field.isHidden}
            onChange={(_, data) => updateField(fieldId, { isHidden: data.checked })}
          />
        </div>
        {!isDisplayOnly && (
          <Field label="Default Value">
            <Input
              value={field.defaultValue ?? ''}
              onChange={(_, data) =>
                updateField(fieldId, { defaultValue: data.value || null })
              }
              placeholder="Optional default value"
            />
          </Field>
        )}
        {(field.fieldType === 'currency') && (
          <Field label="Currency Code" hint="ISO 4217, e.g. QAR, USD">
            <Input
              value={field.currencyCode ?? ''}
              onChange={(_, data) => updateField(fieldId, { currencyCode: data.value || null })}
              placeholder="e.g. QAR"
            />
          </Field>
        )}
        {(field.fieldType === 'currency' || field.fieldType === 'decimal') && (
          <Field label="Decimal Places">
            <Input
              type="number"
              value={field.decimalPlaces != null ? String(field.decimalPlaces) : ''}
              onChange={(_, data) =>
                updateField(fieldId, { decimalPlaces: data.value ? parseInt(data.value, 10) : null })
              }
              placeholder="e.g. 2"
            />
          </Field>
        )}
      </div>

      {typePanel !== null && (
        <>
          <Divider />
          <SectionHeading label="Type Configuration" />
          {typePanel}
        </>
      )}

      {!isDisplayOnly && (
        <>
          <Divider />
          <SectionHeading label="Validation Rules" />
          <ValidationRulesPanel fieldId={field.id} />
        </>
      )}

      <Divider />
      <FieldMappingSummary field={field} />

      <Divider />
      <Accordion collapsible>
        <AccordionItem value="translations">
          <AccordionHeader>Translations</AccordionHeader>
          <AccordionPanel>
            <TranslationsPanel
              entityName="qdb_form_field"
              recordId={fieldId}
              entityLabel="Field"
              formCode={formCode}
            />
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

interface FieldMappingSummaryProps {
  field: DesignerFieldModel;
}

function FieldMappingSummary({ field }: FieldMappingSummaryProps): React.ReactElement {
  const navigateTo = useDesignerStore(s => s.navigateTo);
  const selectItem = useDesignerStore(s => s.selectItem);

  // Read the mapping for this field from the submission mapping store (if loaded)
  // We show a summary badge and navigate to the full screen on click.
  const handleOpenMapping = (): void => {
    selectItem(field.id, 'field');
    navigateTo('submission-mapping');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text size={100} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          CRM Mapping
        </Text>
        <Button
          size="small"
          appearance="outline"
          icon={<TableRegular />}
          onClick={handleOpenMapping}
        >
          Configure
        </Button>
      </div>
      <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
        Map this field to a Dataverse attribute for submission.
      </Text>
    </div>
  );
}
