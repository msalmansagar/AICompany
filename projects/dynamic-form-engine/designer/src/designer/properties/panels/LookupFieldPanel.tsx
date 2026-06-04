import React, { useCallback } from 'react';
import {
  Badge,
  Button,
  Field,
  Input,
  Textarea,
  makeStyles,
} from '@fluentui/react-components';
import { OpenRegular } from '@fluentui/react-icons';
import { useDesignerStore } from '@/state/designerStore';
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
    (_: React.ChangeEvent<HTMLInputElement>, data: { value: string }) => {
      updateField(field.id, {
        lookupConfig: buildLookupPatch(field.lookupConfig, { targetEntity: data.value }),
      });
    },
    [field.id, field.lookupConfig, updateField]
  );

  const handleDisplayFieldChange = useCallback(
    (_: React.ChangeEvent<HTMLInputElement>, data: { value: string }) => {
      updateField(field.id, {
        lookupConfig: buildLookupPatch(field.lookupConfig, { displayField: data.value }),
      });
    },
    [field.id, field.lookupConfig, updateField]
  );

  const handleValueFieldChange = useCallback(
    (_: React.ChangeEvent<HTMLInputElement>, data: { value: string }) => {
      updateField(field.id, {
        lookupConfig: buildLookupPatch(field.lookupConfig, { valueField: data.value }),
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
          <Input
            value={field.lookupConfig?.targetEntity ?? ''}
            onChange={handleTargetEntityChange}
            placeholder="e.g. contact, account"
          />
        </Field>

        <Field label="Display Field" required hint="Field shown in the lookup results">
          <Input
            value={field.lookupConfig?.displayField ?? ''}
            onChange={handleDisplayFieldChange}
            placeholder="e.g. fullname"
          />
        </Field>

        <Field label="Value Field" required hint="Field stored as the selected value">
          <Input
            value={field.lookupConfig?.valueField ?? ''}
            onChange={handleValueFieldChange}
            placeholder="e.g. contactid"
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
