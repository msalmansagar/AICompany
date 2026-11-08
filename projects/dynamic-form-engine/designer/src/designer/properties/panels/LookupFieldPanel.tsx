import React, { useCallback } from 'react';
import {
  Badge,
  Button,
  Field,
  Textarea,
  makeStyles,
} from '@fluentui/react-components';
import { OpenRegular } from '@fluentui/react-icons';
import { useDesignerStore } from '@/state/designerStore';
import { EntityCombobox } from '@/components/EntityCombobox';
import { AttributeCombobox } from '@/components/AttributeCombobox';
import type { DesignerFieldModel, DesignerLookupConfig } from '@/state/models/DesignerFormModel';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  badgeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
});

interface Props {
  field: DesignerFieldModel;
}

function buildLookupPatch(
  existing: DesignerLookupConfig | null,
  patch: Partial<DesignerLookupConfig>
): DesignerLookupConfig {
  return {
    // Spread existing first so the API-source fields (DFE-APILOOKUP-001) survive a
    // quick-panel edit to the entity fields.
    ...existing,
    targetEntity: existing?.targetEntity ?? '',
    displayField: existing?.displayField ?? '',
    valueField: existing?.valueField ?? '',
    filterQuery: existing?.filterQuery ?? null,
    searchMinChars: existing?.searchMinChars ?? 3,
    maxResults: existing?.maxResults ?? 10,
    ...patch,
  };
}

export function LookupFieldPanel({ field }: Props): React.ReactElement {
  const styles = useStyles();
  const updateField = useDesignerStore(s => s.updateField);
  const selectItem = useDesignerStore(s => s.selectItem);
  const navigateTo = useDesignerStore(s => s.navigateTo);

  const handleOpenFullConfig = useCallback(() => {
    selectItem(field.id, 'field');
    navigateTo('lookup-config');
  }, [field.id, selectItem, navigateTo]);

  const handleTargetEntityChange = useCallback(
    (value: string) => {
      updateField(field.id, {
        lookupConfig: buildLookupPatch(field.lookupConfig, { targetEntity: value }),
      });
    },
    [field.id, field.lookupConfig, updateField]
  );

  const handleDisplayFieldChange = useCallback(
    (value: string) => {
      updateField(field.id, {
        lookupConfig: buildLookupPatch(field.lookupConfig, { displayField: value }),
      });
    },
    [field.id, field.lookupConfig, updateField]
  );

  const handleValueFieldChange = useCallback(
    (value: string) => {
      updateField(field.id, {
        lookupConfig: buildLookupPatch(field.lookupConfig, { valueField: value }),
      });
    },
    [field.id, field.lookupConfig, updateField]
  );

  const handleFilterQueryChange = useCallback(
    (_: React.ChangeEvent<HTMLTextAreaElement>, data: { value: string }) => {
      updateField(field.id, {
        lookupConfig: buildLookupPatch(field.lookupConfig, {
          filterQuery: data.value || null,
        }),
      });
    },
    [field.id, field.lookupConfig, updateField]
  );

  return (
    <div className={styles.root}>
      <div className={styles.badgeRow}>
        <Badge appearance="outline" color="brand">{field.fieldType}</Badge>
        <Button
          size="small"
          appearance="outline"
          icon={<OpenRegular />}
          onClick={handleOpenFullConfig}
        >
          Full Config
        </Button>
      </div>

      <div className={styles.fieldGroup}>
        <Field label="Target Entity" required hint="CRM entity logical name">
          <EntityCombobox
            value={field.lookupConfig?.targetEntity ?? ''}
            onChange={handleTargetEntityChange}
            ariaLabel="Target Entity"
          />
        </Field>

        <Field label="Display Field" required hint="Field shown in the lookup results">
          <AttributeCombobox
            entityLogicalName={field.lookupConfig?.targetEntity ?? ''}
            value={field.lookupConfig?.displayField ?? ''}
            onChange={handleDisplayFieldChange}
            ariaLabel="Display Field"
          />
        </Field>

        <Field label="Value Field" required hint="Field stored as the selected value">
          <AttributeCombobox
            entityLogicalName={field.lookupConfig?.targetEntity ?? ''}
            value={field.lookupConfig?.valueField ?? ''}
            onChange={handleValueFieldChange}
            ariaLabel="Value Field"
          />
        </Field>

        <Field
          label="Filter Query"
          hint="OData filter expression (optional)"
        >
          <Textarea
            value={field.lookupConfig?.filterQuery ?? ''}
            onChange={handleFilterQueryChange}
            placeholder="e.g. statuscode eq 1"
            rows={3}
            style={{ fontFamily: 'monospace' }}
          />
        </Field>
      </div>
    </div>
  );
}
