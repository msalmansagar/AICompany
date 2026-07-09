import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Field,
  Input,
  Select,
  Text,
  Textarea,
  makeStyles,
  tokens,
  Badge,
} from '@fluentui/react-components';
import { AddRegular, ArrowLeftRegular, DeleteRegular, EditRegular, CheckmarkRegular, DismissRegular } from '@fluentui/react-icons';
import { useDesignerStore } from '@/state/designerStore';
import { RuleTemplateService } from '@/services/RuleTemplateService';
import { CrmContext } from '@/app/App';
import type { DesignerRuleTemplateModel } from '@/state/models/DesignerRuleTemplateModel';
import type { ValidationRuleType } from '@/state/models/DesignerRuleModel';

const TEMPLATE_RULE_TYPES: Array<{ value: ValidationRuleType; label: string }> = [
  { value: 'required',          label: 'Required' },
  { value: 'min_length',        label: 'Min Length' },
  { value: 'max_length',        label: 'Max Length' },
  { value: 'regex',             label: 'Pattern (Regex)' },
  { value: 'min_value',         label: 'Min Value' },
  { value: 'max_value',         label: 'Max Value' },
  { value: 'custom_expression', label: 'Custom Expression' },
];

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: tokens.colorNeutralBackground3 },
  topBar: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px', backgroundColor: tokens.colorNeutralBackground1, borderBottom: `1px solid ${tokens.colorNeutralStroke1}`, flexShrink: 0 },
  body: { flex: 1, overflow: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '760px', margin: '0 auto', width: '100%' },
  card: { backgroundColor: tokens.colorNeutralBackground1, borderRadius: '6px', padding: '16px', border: `1px solid ${tokens.colorNeutralStroke2}`, display: 'flex', flexDirection: 'column', gap: '8px' },
  cardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  form: { display: 'flex', flexDirection: 'column', gap: '12px', backgroundColor: tokens.colorNeutralBackground3, padding: '16px', borderRadius: '6px', border: `1px solid ${tokens.colorBrandStroke2}` },
  formActions: { display: 'flex', gap: '8px', justifyContent: 'flex-end' },
  emptyState: { padding: '40px', textAlign: 'center' as const, color: tokens.colorNeutralForeground3, backgroundColor: tokens.colorNeutralBackground1, borderRadius: '4px', border: `1px dashed ${tokens.colorNeutralStroke1}` },
});

function emptyTemplate(): Omit<DesignerRuleTemplateModel, 'id'> {
  return { name: '', ruleType: 'required', errorMessage: '', minLength: null, maxLength: null, minValue: null, maxValue: null, regexPattern: null, customExpression: null };
}

export function RuleTemplateEditorScreen(): React.ReactElement {
  const styles = useStyles();
  const navigateTo = useDesignerStore(s => s.navigateTo);
  const crmService = useContext(CrmContext);
  const service = useMemo(
    () => (crmService ? new RuleTemplateService(crmService.getWebApi()) : null),
    [crmService],
  );

  const [templates, setTemplates] = useState<DesignerRuleTemplateModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Omit<DesignerRuleTemplateModel, 'id'>>(emptyTemplate());

  const load = useCallback(async (): Promise<void> => {
    if (!service) return;
    setIsLoading(true);
    try {
      setTemplates(await service.listTemplates());
    } finally {
      setIsLoading(false);
    }
  }, [service]);

  useEffect(() => { void load(); }, [load]);

  const handleOpenNew = useCallback((): void => {
    setDraft(emptyTemplate());
    setEditingId(null);
    setShowForm(true);
  }, []);

  const handleEdit = useCallback((t: DesignerRuleTemplateModel): void => {
    setDraft({ name: t.name, ruleType: t.ruleType, errorMessage: t.errorMessage, minLength: t.minLength, maxLength: t.maxLength, minValue: t.minValue, maxValue: t.maxValue, regexPattern: t.regexPattern, customExpression: t.customExpression });
    setEditingId(t.id);
    setShowForm(true);
  }, []);

  const handleSave = useCallback(async (): Promise<void> => {
    if (!service) return;
    if (editingId) {
      await service.updateTemplate(editingId, draft);
    } else {
      await service.createTemplate(draft);
    }
    setShowForm(false);
    setEditingId(null);
    await load();
  }, [service, editingId, draft, load]);

  const handleDelete = useCallback(async (id: string): Promise<void> => {
    if (!service) return;
    await service.deleteTemplate(id);
    await load();
  }, [service, load]);

  return (
    <div className={styles.root}>
      <div className={styles.topBar}>
        <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={() => navigateTo('designer')}>
          Back to Designer
        </Button>
        <Text size={400} weight="semibold">Rule Template Editor</Text>
        <div style={{ flex: 1 }} />
        <Button appearance="primary" icon={<AddRegular />} onClick={handleOpenNew} disabled={showForm}>
          New Template
        </Button>
      </div>

      <div className={styles.body}>
        {showForm && (
          <div className={styles.form}>
            <Text weight="semibold" size={300}>{editingId ? 'Edit Template' : 'New Template'}</Text>
            <Field label="Name" required>
              <Input value={draft.name} onChange={(_, d) => setDraft(p => ({ ...p, name: d.value }))} placeholder="e.g. QAR phone format" />
            </Field>
            <Field label="Rule Type" required>
              <Select value={draft.ruleType} onChange={(_, d) => setDraft(p => ({ ...p, ruleType: d.value as ValidationRuleType }))}>
                {TEMPLATE_RULE_TYPES.map(rt => <option key={rt.value} value={rt.value}>{rt.label}</option>)}
              </Select>
            </Field>
            <Field label="Default Error Message" required>
              <Input value={draft.errorMessage} onChange={(_, d) => setDraft(p => ({ ...p, errorMessage: d.value }))} placeholder="e.g. Invalid phone number format" />
            </Field>
            {draft.ruleType === 'min_length' && <Field label="Min Length"><Input type="number" value={String(draft.minLength ?? '')} onChange={(_, d) => setDraft(p => ({ ...p, minLength: d.value ? Number(d.value) : null }))} /></Field>}
            {draft.ruleType === 'max_length' && <Field label="Max Length"><Input type="number" value={String(draft.maxLength ?? '')} onChange={(_, d) => setDraft(p => ({ ...p, maxLength: d.value ? Number(d.value) : null }))} /></Field>}
            {draft.ruleType === 'min_value'  && <Field label="Min Value"><Input type="number" value={String(draft.minValue ?? '')} onChange={(_, d) => setDraft(p => ({ ...p, minValue: d.value ? Number(d.value) : null }))} /></Field>}
            {draft.ruleType === 'max_value'  && <Field label="Max Value"><Input type="number" value={String(draft.maxValue ?? '')} onChange={(_, d) => setDraft(p => ({ ...p, maxValue: d.value ? Number(d.value) : null }))} /></Field>}
            {draft.ruleType === 'regex'      && <Field label="Regex Pattern"><Input value={draft.regexPattern ?? ''} onChange={(_, d) => setDraft(p => ({ ...p, regexPattern: d.value || null }))} placeholder="^[0-9]{8}$" style={{ fontFamily: 'monospace' }} /></Field>}
            {draft.ruleType === 'custom_expression' && <Field label="Expression" hint="Reference fields as {fieldSchemaName}"><Textarea value={draft.customExpression ?? ''} onChange={(_, d) => setDraft(p => ({ ...p, customExpression: d.value || null }))} resize="vertical" /></Field>}
            <div className={styles.formActions}>
              <Button appearance="subtle" icon={<DismissRegular />} onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</Button>
              <Button appearance="primary" icon={<CheckmarkRegular />} onClick={() => void handleSave()} disabled={!draft.name || !draft.errorMessage}>Save</Button>
            </div>
          </div>
        )}

        {isLoading && <Text style={{ color: tokens.colorNeutralForeground3 }}>Loading templates…</Text>}

        {!isLoading && templates.length === 0 && !showForm && (
          <div className={styles.emptyState}><Text size={300}>No rule templates yet. Click "New Template" to create the first one.</Text></div>
        )}

        {templates.map(t => (
          <div key={t.id} className={styles.card}>
            <div className={styles.cardHeader}>
              <Text weight="semibold">{t.name}</Text>
              <div style={{ display: 'flex', gap: '4px' }}>
                <Button size="small" appearance="subtle" icon={<EditRegular />} onClick={() => handleEdit(t)} aria-label="Edit" />
                <Button size="small" appearance="subtle" icon={<DeleteRegular />} onClick={() => void handleDelete(t.id)} aria-label="Delete" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <Badge appearance="outline" color="informative">{t.ruleType}</Badge>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>{t.errorMessage}</Text>
            </div>
            {t.customExpression && <Text size={200} font="monospace" style={{ color: tokens.colorNeutralForeground2 }}>{t.customExpression}</Text>}
          </div>
        ))}
      </div>
    </div>
  );
}
