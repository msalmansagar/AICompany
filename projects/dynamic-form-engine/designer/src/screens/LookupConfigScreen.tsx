import React, { useCallback, useContext, useEffect, useState } from 'react';
import {
  Button,
  Field,
  Input,
  Select,
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
    source: field?.lookupConfig?.source ?? 'entity',
    apiEndpointKey: field?.lookupConfig?.apiEndpointKey ?? null,
    apiValuePath: field?.lookupConfig?.apiValuePath ?? null,
    apiLabelPath: field?.lookupConfig?.apiLabelPath ?? null,
    apiSearchParamName: field?.lookupConfig?.apiSearchParamName ?? null,
    apiSearchMode: field?.lookupConfig?.apiSearchMode ?? 'typeahead',
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
          source: config.source,
          apiEndpointKey: config.apiEndpointKey,
          apiValuePath: config.apiValuePath,
          apiLabelPath: config.apiLabelPath,
          apiSearchParamName: config.apiSearchParamName,
          apiSearchMode: config.apiSearchMode,
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

  const isApi = config.source === 'api';
  const entityValid =
    config.targetEntity.trim().length > 0 &&
    config.displayField.trim().length > 0 &&
    config.valueField.trim().length > 0;
  // FR-032: an API-sourced lookup must name an endpoint key + the value/label paths.
  const apiValid =
    (config.apiEndpointKey ?? '').trim().length > 0 &&
    (config.apiValuePath ?? '').trim().length > 0 &&
    (config.apiLabelPath ?? '').trim().length > 0;
  const canSave = !isSaving && isDirty && (isApi ? apiValid : entityValid);

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
            label="Data Source"
            hint="Query a Dataverse table, or fetch options from an approved external API."
          >
            <Select
              value={config.source ?? 'entity'}
              onChange={(_, data) => patch({ source: data.value === 'api' ? 'api' : 'entity' })}
            >
              <option value="entity">CRM Entity</option>
              <option value="api">External API</option>
            </Select>
          </Field>

          {!isApi && (
            <>
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
            </>
          )}

          {isApi && (
            <>
              <Field
                label="Endpoint Key"
                required
                hint="An approved key registered server-side. The URL and credentials stay on the backend — an unrecognised key is rejected."
              >
                <Input
                  value={config.apiEndpointKey ?? ''}
                  onChange={(_, data) => patch({ apiEndpointKey: data.value || null })}
                  placeholder="e.g. hr-employees"
                  style={{ fontFamily: 'monospace' }}
                />
              </Field>

              <Field
                label="Value Path"
                required
                hint="Dot-path to the value in each API item (e.g. id, data.id)."
              >
                <Input
                  value={config.apiValuePath ?? ''}
                  onChange={(_, data) => patch({ apiValuePath: data.value || null })}
                  placeholder="e.g. id"
                  style={{ fontFamily: 'monospace' }}
                />
              </Field>

              <Field
                label="Label Path"
                required
                hint="Dot-path to the display label in each API item (e.g. name, data.displayName)."
              >
                <Input
                  value={config.apiLabelPath ?? ''}
                  onChange={(_, data) => patch({ apiLabelPath: data.value || null })}
                  placeholder="e.g. name"
                  style={{ fontFamily: 'monospace' }}
                />
              </Field>

              <Field
                label="Search Mode"
                hint="Typeahead sends the typed term to the API; Fetch All loads once and filters locally."
              >
                <Select
                  value={config.apiSearchMode ?? 'typeahead'}
                  onChange={(_, data) => patch({ apiSearchMode: data.value === 'fetchAll' ? 'fetchAll' : 'typeahead' })}
                >
                  <option value="typeahead">Typeahead (server-side search)</option>
                  <option value="fetchAll">Fetch All (filter locally)</option>
                </Select>
              </Field>

              {config.apiSearchMode !== 'fetchAll' && (
                <Field
                  label="Search Param Name"
                  hint="Query parameter that carries the typed term to the API (e.g. q, search)."
                >
                  <Input
                    value={config.apiSearchParamName ?? ''}
                    onChange={(_, data) => patch({ apiSearchParamName: data.value || null })}
                    placeholder="e.g. q"
                    style={{ fontFamily: 'monospace' }}
                  />
                </Field>
              )}
            </>
          )}
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
