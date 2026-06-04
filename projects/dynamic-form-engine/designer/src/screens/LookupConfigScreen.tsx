import React, { useCallback, useContext, useEffect, useState } from 'react';
import {
  Button,
  Field,
  Input,
  Spinner,
  Text,
  Textarea,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { ArrowLeftRegular, CheckmarkRegular } from '@fluentui/react-icons';
import { useDesignerStore } from '@/state/designerStore';
import { CrmContext } from '@/app/App';
import { LookupConfigService } from '@/services/LookupConfigService';
import type { DesignerLookupConfig } from '@/state/models/DesignerFormModel';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: tokens.colorNeutralBackground3,
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 20px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    flexShrink: 0,
  },
  body: {
    flex: 1,
    overflow: 'auto',
    padding: '24px',
    maxWidth: '560px',
    margin: '0 auto',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    backgroundColor: tokens.colorNeutralBackground1,
    padding: '20px',
    borderRadius: '6px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  actions: {
    display: 'flex',
    justifyContent: 'space-between',
    paddingTop: '8px',
  },
});

export function LookupConfigScreen(): React.ReactElement {
  const styles = useStyles();
  const crmService = useContext(CrmContext);

  const navigateTo = useDesignerStore(s => s.navigateTo);
  const selectedId = useDesignerStore(s => s.selectedId);
  const field = useDesignerStore(s => (selectedId ? s.fields[selectedId] : null));
  const updateField = useDesignerStore(s => s.updateField);

  const [config, setConfig] = useState<DesignerLookupConfig>(() => ({
    targetEntity: field?.lookupConfig?.targetEntity ?? '',
    displayField: field?.lookupConfig?.displayField ?? '',
    valueField: field?.lookupConfig?.valueField ?? '',
    filterQuery: field?.lookupConfig?.filterQuery ?? null,
    searchMinChars: field?.lookupConfig?.searchMinChars ?? 3,
    maxResults: field?.lookupConfig?.maxResults ?? 10,
  }));

  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // On mount, fetch the latest config from CRM for saved (non-temp) fields
  useEffect(() => {
    if (!crmService || !selectedId || selectedId.startsWith('tmp_')) return;
    const service = new LookupConfigService(crmService.getWebApi());
    service.getLookupConfigForField(selectedId)
      .then(cfg => {
        if (cfg) {
          setConfig(cfg);
          updateField(selectedId, { lookupConfig: cfg });
        }
      })
      .catch(() => { /* keep store values as fallback */ });
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBack = useCallback(() => {
    navigateTo('designer');
  }, [navigateTo]);

  const patch = useCallback((update: Partial<DesignerLookupConfig>) => {
    setConfig(prev => ({ ...prev, ...update }));
    setIsDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!selectedId) return;
    setSaveError(null);
    setSaveSuccess(false);

    // Always update the store
    updateField(selectedId, { lookupConfig: config });

    // Persist to CRM immediately for saved fields
    if (crmService && !selectedId.startsWith('tmp_')) {
      setIsSaving(true);
      try {
        const service = new LookupConfigService(crmService.getWebApi());
        await service.upsertLookupConfig({
          fieldId: selectedId,
          targetEntity: config.targetEntity,
          displayField: config.displayField,
          valueField: config.valueField,
          filterQuery: config.filterQuery,
          searchMinChars: config.searchMinChars,
          maxResults: config.maxResults,
        });
        setSaveSuccess(true);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Failed to save lookup configuration');
      } finally {
        setIsSaving(false);
      }
    }
    setIsDirty(false);
  }, [selectedId, updateField, config, crmService]);

  const canSave = !isSaving && isDirty && config.targetEntity.trim().length > 0 && config.displayField.trim().length > 0 && config.valueField.trim().length > 0;

  if (!field) {
    return (
      <div className={styles.root}>
        <div className={styles.topBar}>
          <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={handleBack}>
            Back to Designer
          </Button>
        </div>
        <div className={styles.body}>
          <Text style={{ color: tokens.colorNeutralForeground3 }}>
            No field selected. Return to the designer and select a lookup field first.
          </Text>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.topBar}>
        <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={handleBack}>
          Back to Designer
        </Button>
        <Text size={400} weight="semibold">Lookup Configuration</Text>
        <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
          — {field.label || field.code}
        </Text>
      </div>

      <div className={styles.body}>
        <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
          Configure which Dataverse table this field queries and which columns are used for display and value binding.
        </Text>

        <div className={styles.form}>
          <Field
            label="Target Entity"
            required
            hint="The logical name of the Dataverse table to query (e.g. contact, account)."
          >
            <Input
              value={config.targetEntity}
              onChange={(_, data) => patch({ targetEntity: data.value.toLowerCase() })}
              placeholder="e.g. contact"
              style={{ fontFamily: 'monospace' }}
            />
          </Field>

          <Field
            label="Display Field"
            required
            hint="The column shown to the user in the dropdown (e.g. fullname)."
          >
            <Input
              value={config.displayField}
              onChange={(_, data) => patch({ displayField: data.value.toLowerCase() })}
              placeholder="e.g. fullname"
              style={{ fontFamily: 'monospace' }}
            />
          </Field>

          <Field
            label="Value Field"
            required
            hint="The column stored as the submission value — usually the primary key (e.g. contactid)."
          >
            <Input
              value={config.valueField}
              onChange={(_, data) => patch({ valueField: data.value.toLowerCase() })}
              placeholder="e.g. contactid"
              style={{ fontFamily: 'monospace' }}
            />
          </Field>

          <Field
            label="Filter Query (optional)"
            hint="OData filter expression to restrict the lookup results (e.g. statecode eq 0)."
          >
            <Textarea
              value={config.filterQuery ?? ''}
              onChange={(_, data) => patch({ filterQuery: data.value || null })}
              placeholder="e.g. statecode eq 0 and customertypecode eq 1"
              rows={3}
              style={{ fontFamily: 'monospace', fontSize: '12px' }}
            />
          </Field>
        </div>

        <div className={styles.actions}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {saveError && <Text size={200} style={{ color: tokens.colorPaletteRedForeground1 }}>{saveError}</Text>}
            {saveSuccess && <Text size={200} style={{ color: tokens.colorPaletteGreenForeground1 }}>Saved successfully</Text>}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button appearance="subtle" onClick={handleBack}>Cancel</Button>
            <Button
              appearance="primary"
              icon={isSaving ? <Spinner size="tiny" /> : <CheckmarkRegular />}
              onClick={() => void handleSave()}
              disabled={!canSave}
            >
              {isSaving ? 'Saving...' : 'Save Configuration'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
