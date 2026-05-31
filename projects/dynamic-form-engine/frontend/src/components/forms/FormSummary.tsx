import {
  Card,
  CardHeader,
  makeStyles,
  tokens,
  Text,
  Badge,
} from '@fluentui/react-components';
import { useFormContext } from '../../contexts/FormContext';
import type { FieldDefinition } from '@qdb/shared';

const useStyles = makeStyles({
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  summaryHeader: {
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
    marginBottom: tokens.spacingVerticalM,
  },
  stats: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
    marginBottom: tokens.spacingVerticalL,
  },
  statBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  tabSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  tabTitle: {
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  fieldRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 2fr',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalXS} 0`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  fieldLabel: {
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase300,
  },
  fieldValue: {
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase300,
    wordBreak: 'break-word',
  },
  emptyValue: {
    color: tokens.colorNeutralForeground3,
    fontStyle: 'italic',
  },
});

export function FormSummary() {
  const styles = useStyles();
  const { formDefinition, fieldValues, ruleState } = useFormContext();

  if (!formDefinition) return null;

  const visibleTabs = formDefinition.tabs
    .filter((tab) => ruleState.tabVisibility[tab.id] ?? tab.isVisible)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  let totalSections = 0;
  let requiredFilled = 0;
  let requiredTotal = 0;

  for (const tab of visibleTabs) {
    for (const section of tab.sections) {
      const sectionVisible = ruleState.sectionVisibility[section.id] ?? section.isVisible;
      if (!sectionVisible) continue;

      totalSections++;

      for (const field of section.fields) {
        const fieldVisible = ruleState.fieldVisibility[field.id] ?? field.isVisible;
        if (!fieldVisible || field.isHidden) continue;

        const isRequired = ruleState.fieldRequired[field.id] ?? field.isRequired;
        if (!isRequired) continue;

        requiredTotal++;

        const value = fieldValues[field.schemaName];
        if (value !== null && value !== undefined && value !== '') requiredFilled++;
      }
    }
  }

  return (
    <div className={styles.wrapper} aria-label="Form summary">
      <div className={styles.summaryHeader}>Review your answers</div>

      <div className={styles.stats} aria-live="polite">
        <div className={styles.statBadge}>
          <Badge appearance="outline" color="informative">
            {totalSections} sections
          </Badge>
        </div>
        <div className={styles.statBadge}>
          <Badge
            appearance="outline"
            color={requiredFilled === requiredTotal ? 'success' : 'warning'}
          >
            {requiredFilled} / {requiredTotal} required fields filled
          </Badge>
        </div>
      </div>

      {visibleTabs.map((tab) => {
        const visibleSections = tab.sections
          .filter((s) => ruleState.sectionVisibility[s.id] ?? s.isVisible)
          .sort((a, b) => a.displayOrder - b.displayOrder);

        return (
          <div key={tab.id} className={styles.tabSection}>
            <div className={styles.tabTitle}>{tab.label}</div>

            {visibleSections.map((section) => {
              const visibleFields = section.fields
                .filter((f) => {
                  const visible = ruleState.fieldVisibility[f.id] ?? f.isVisible;
                  return visible && !f.isHidden;
                })
                .sort((a, b) => a.displayOrder - b.displayOrder);

              return (
                <Card key={section.id} aria-label={section.label}>
                  <CardHeader header={<Text weight="semibold">{section.label}</Text>} />
                  <div aria-label={`${section.label} fields`}>
                    {visibleFields.map((field) => (
                      <div key={field.id} className={styles.fieldRow}>
                        <span className={styles.fieldLabel}>{field.label}</span>
                        <span className={styles.fieldValue}>
                          <FieldValueDisplay
                            field={field}
                            value={fieldValues[field.schemaName]}
                          />
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

interface FieldValueDisplayProps {
  field: FieldDefinition;
  value: unknown;
}

function FieldValueDisplay({ field, value }: FieldValueDisplayProps) {
  const styles = useStyles();

  if (value === null || value === undefined || value === '') {
    return <span className={styles.emptyValue}>Not provided</span>;
  }

  switch (field.fieldType) {
    case 'checkbox':
      return <span>{Boolean(value) ? 'Yes' : 'No'}</span>;

    case 'dropdown':
    case 'radio': {
      const option = field.options?.find((o) => o.value === String(value));
      return <span>{option?.label ?? String(value)}</span>;
    }

    case 'multiselect': {
      const selectedValues = Array.isArray(value) ? value.map(String) : [];
      const labels = selectedValues.map(
        (v) => field.options?.find((o) => o.value === v)?.label ?? v,
      );
      return <span>{labels.join(', ') || 'None selected'}</span>;
    }

    case 'lookup': {
      const lookupVal = value as { displayName?: string } | null;
      return <span>{lookupVal?.displayName ?? String(value)}</span>;
    }

    case 'currency': {
      const currencyCode = field.currencyCode ?? 'USD';
      const num = Number(value);

      if (isNaN(num)) return <span>{String(value)}</span>;

      return (
        <span>
          {new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currencyCode,
          }).format(num)}
        </span>
      );
    }

    case 'file': {
      const files = Array.isArray(value) ? value : [value];
      return <span>{files.length} file(s) uploaded</span>;
    }

    case 'repeatingGrid': {
      const rows = Array.isArray(value) ? value : [];
      return <span>{rows.length} row(s)</span>;
    }

    case 'richText':
      // Render as plain text in the summary to avoid XSS from stored HTML
      return <span>{String(value).replace(/<[^>]*>/g, ' ').trim()}</span>;

    default:
      return <span>{String(value)}</span>;
  }
}
