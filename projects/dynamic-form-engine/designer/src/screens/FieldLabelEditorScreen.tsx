import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Field,
  Input,
  Text,
  makeStyles,
  tokens,
  Badge,
} from '@fluentui/react-components';
import { AddRegular, ArrowLeftRegular, DeleteRegular, CheckmarkRegular, DismissRegular } from '@fluentui/react-icons';
import { useDesignerStore } from '@/state/designerStore';
import { FieldLabelService } from '@/services/FieldLabelService';
import { CrmContext } from '@/app/App';
import type { DesignerFieldLabelModel } from '@/state/models/DesignerFieldLabelModel';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: tokens.colorNeutralBackground3 },
  topBar: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px', backgroundColor: tokens.colorNeutralBackground1, borderBottom: `1px solid ${tokens.colorNeutralStroke1}`, flexShrink: 0 },
  body: { flex: 1, overflow: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '760px', margin: '0 auto', width: '100%' },
  card: { backgroundColor: tokens.colorNeutralBackground1, borderRadius: '6px', padding: '16px', border: `1px solid ${tokens.colorNeutralStroke2}`, display: 'flex', flexDirection: 'column', gap: '10px' },
  form: { display: 'flex', flexDirection: 'column', gap: '12px', backgroundColor: tokens.colorNeutralBackground3, padding: '16px', borderRadius: '6px', border: `1px solid ${tokens.colorBrandStroke2}` },
  formActions: { display: 'flex', gap: '8px', justifyContent: 'flex-end' },
  emptyState: { padding: '40px', textAlign: 'center' as const, color: tokens.colorNeutralForeground3, backgroundColor: tokens.colorNeutralBackground1, borderRadius: '4px', border: `1px dashed ${tokens.colorNeutralStroke1}` },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' },
});

interface LabelDraft {
  locale: string;
  label: string;
  placeholder: string;
  tooltip: string;
}

function emptyDraft(): LabelDraft {
  return { locale: '', label: '', placeholder: '', tooltip: '' };
}

export function FieldLabelEditorScreen(): React.ReactElement {
  const styles = useStyles();
  const navigateTo = useDesignerStore(s => s.navigateTo);
  const selectedId = useDesignerStore(s => s.selectedId);
  const field = useDesignerStore(s => selectedId ? s.fields[selectedId] : null);
  const crmService = useContext(CrmContext);
  const service = useMemo(
    () => (crmService && selectedId ? new FieldLabelService(crmService.getWebApi()) : null),
    [crmService, selectedId],
  );

  const [labels, setLabels] = useState<DesignerFieldLabelModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<LabelDraft>(emptyDraft());

  const load = useCallback(async (): Promise<void> => {
    if (!service || !selectedId) return;
    setIsLoading(true);
    try {
      setLabels(await service.listLabelsForField(selectedId));
    } finally {
      setIsLoading(false);
    }
  }, [service, selectedId]);

  useEffect(() => { void load(); }, [load]);

  const handleSave = useCallback(async (): Promise<void> => {
    if (!service || !selectedId) return;
    await service.createLabel({
      fieldId: selectedId,
      locale: draft.locale,
      label: draft.label || null,
      placeholder: draft.placeholder || null,
      tooltip: draft.tooltip || null,
    });
    setShowForm(false);
    setDraft(emptyDraft());
    await load();
  }, [service, selectedId, draft, load]);

  const handleDelete = useCallback(async (id: string): Promise<void> => {
    if (!service) return;
    await service.deleteLabel(id);
    await load();
  }, [service, load]);

  if (!field) {
    return (
      <div className={styles.root}>
        <div className={styles.topBar}>
          <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={() => navigateTo('designer')}>Back to Designer</Button>
        </div>
        <div className={styles.body}>
          <Text style={{ color: tokens.colorNeutralForeground3 }}>No field selected. Return to the designer and select a field first.</Text>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.topBar}>
        <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={() => navigateTo('designer')}>Back to Designer</Button>
        <Text size={400} weight="semibold">Field Label Translations</Text>
        <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>— {field.label || field.code}</Text>
        <div style={{ flex: 1 }} />
        <Button appearance="primary" icon={<AddRegular />} onClick={() => setShowForm(true)} disabled={showForm}>Add Locale</Button>
      </div>

      <div className={styles.body}>
        {showForm && (
          <div className={styles.form}>
            <Text weight="semibold" size={300}>New Translation</Text>
            <Field label="Locale" required hint="BCP 47 tag, e.g. ar, ar-SA, fr">
              <Input value={draft.locale} onChange={(_, d) => setDraft(p => ({ ...p, locale: d.value }))} placeholder="ar" />
            </Field>
            <div className={styles.row}>
              <Field label="Label"><Input value={draft.label} onChange={(_, d) => setDraft(p => ({ ...p, label: d.value }))} placeholder="Translated label" /></Field>
              <Field label="Placeholder"><Input value={draft.placeholder} onChange={(_, d) => setDraft(p => ({ ...p, placeholder: d.value }))} placeholder="Translated placeholder" /></Field>
              <Field label="Tooltip"><Input value={draft.tooltip} onChange={(_, d) => setDraft(p => ({ ...p, tooltip: d.value }))} placeholder="Translated tooltip" /></Field>
            </div>
            <div className={styles.formActions}>
              <Button appearance="subtle" icon={<DismissRegular />} onClick={() => { setShowForm(false); setDraft(emptyDraft()); }}>Cancel</Button>
              <Button appearance="primary" icon={<CheckmarkRegular />} onClick={() => void handleSave()} disabled={!draft.locale || (!draft.label && !draft.placeholder && !draft.tooltip)}>Save</Button>
            </div>
          </div>
        )}

        {isLoading && <Text style={{ color: tokens.colorNeutralForeground3 }}>Loading translations…</Text>}

        {!isLoading && labels.length === 0 && !showForm && (
          <div className={styles.emptyState}><Text size={300}>No translations yet. Click "Add Locale" to add the first one.</Text></div>
        )}

        {labels.map(l => (
          <div key={l.id} className={styles.card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Badge appearance="filled" color="brand">{l.locale}</Badge>
              <Button size="small" appearance="subtle" icon={<DeleteRegular />} onClick={() => void handleDelete(l.id)} aria-label="Delete locale" />
            </div>
            {l.label && <div><Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>Label </Text><Text size={200}>{l.label}</Text></div>}
            {l.placeholder && <div><Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>Placeholder </Text><Text size={200}>{l.placeholder}</Text></div>}
            {l.tooltip && <div><Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>Tooltip </Text><Text size={200}>{l.tooltip}</Text></div>}
          </div>
        ))}
      </div>
    </div>
  );
}
