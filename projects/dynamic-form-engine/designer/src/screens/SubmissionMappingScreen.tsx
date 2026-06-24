import React, { useCallback, useContext, useEffect, useState } from 'react';
import {
  Button,
  Checkbox,
  Field,
  Input,
  Text,
  Badge,
  makeStyles,
  tokens,
  Switch,
} from '@fluentui/react-components';
import {
  ArrowLeftRegular,
  CheckmarkRegular,
  DeleteRegular,
  AddRegular,
} from '@fluentui/react-icons';
import { useDesignerStore } from '@/state/designerStore';
import { CrmContext } from '@/app/App';
import { SubmissionMappingService } from '@/services/SubmissionMappingService';
import type { SubmissionMapping } from '@/services/SubmissionMappingService';

// Spacing between sections in the body (replaces the removed flex gap)
const SECTION_SPACING = '16px';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: tokens.colorNeutralBackground3 },
  topBar: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px', backgroundColor: tokens.colorNeutralBackground1, borderBottom: `1px solid ${tokens.colorNeutralStroke1}`, flexShrink: 0 },
  // Body uses block layout so cards expand to their natural height and scroll correctly.
  // Flex layout with a fixed-height parent causes cards to collapse when there are many rows.
  body: { flex: 1, overflowY: 'auto', padding: '24px', maxWidth: '900px', margin: '0 auto', width: '100%' },
  infoBox: { padding: '12px 16px', backgroundColor: tokens.colorNeutralBackground2, borderRadius: '6px', border: `1px solid ${tokens.colorNeutralStroke1}`, marginBottom: '16px' },
  card: { backgroundColor: tokens.colorNeutralBackground1, borderRadius: '6px', border: `1px solid ${tokens.colorNeutralStroke2}`, overflow: 'hidden', marginBottom: '12px' },
  cardHeader: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', backgroundColor: tokens.colorNeutralBackground2, borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  cardBody: { padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' },
  fieldRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  fieldRowThree: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' },
  cardActions: { display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '8px', borderTop: `1px solid ${tokens.colorNeutralStroke2}` },
  emptyState: { padding: '40px', textAlign: 'center' as const, color: tokens.colorNeutralForeground3, backgroundColor: tokens.colorNeutralBackground1, borderRadius: '4px', border: `1px dashed ${tokens.colorNeutralStroke1}` },
  noMapping: { padding: '10px 16px', color: tokens.colorNeutralForeground3, fontStyle: 'italic', fontSize: '13px' },
});

interface FieldMappingCardProps {
  fieldId: string;
  fieldLabel: string;
  fieldCode: string;
  fieldType: string;
  mapping: SubmissionMapping | null;
  onSave: (fieldId: string, data: Omit<SubmissionMapping, 'id' | 'formId' | 'fieldId'>) => Promise<void>;
  onDelete: (mappingId: string) => Promise<void>;
}

function FieldMappingCard({ fieldId, fieldLabel, fieldCode, fieldType, mapping, onSave, onDelete }: FieldMappingCardProps): React.ReactElement {
  const styles = useStyles();
  const [isEditing, setIsEditing] = useState(false);
  const [targetEntity, setTargetEntity] = useState(mapping?.targetEntity ?? '');
  const [targetAttribute, setTargetAttribute] = useState(mapping?.targetAttribute ?? '');
  const [transformExpression, setTransformExpression] = useState(mapping?.transformExpression ?? '');
  const [isChildEntity, setIsChildEntity] = useState(mapping?.isChildEntity ?? false);
  const [childRelationship, setChildRelationship] = useState(mapping?.childEntityRelationshipName ?? '');
  const [isActive, setIsActive] = useState(mapping?.isActive ?? true);

  const handleSave = useCallback(async () => {
    await onSave(fieldId, { targetEntity, targetAttribute, transformExpression: transformExpression || null, isChildEntity, childEntityRelationshipName: isChildEntity ? childRelationship || null : null, isActive });
    setIsEditing(false);
  }, [fieldId, targetEntity, targetAttribute, transformExpression, isChildEntity, childRelationship, isActive, onSave]);

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <Badge appearance="outline" color="informative">{fieldType}</Badge>
        <Text weight="semibold">{fieldLabel}</Text>
        <Text size={200} style={{ color: tokens.colorNeutralForeground3, fontFamily: 'monospace' }}>{fieldCode}</Text>
        <div style={{ flex: 1 }} />
        {mapping ? (
          <Badge appearance="filled" color="success">Mapped</Badge>
        ) : (
          <Badge appearance="outline" color="subtle">Not mapped</Badge>
        )}
        {!isEditing && (
          <Button size="small" appearance="outline" icon={<AddRegular />} onClick={() => setIsEditing(true)}>
            {mapping ? 'Edit' : 'Add Mapping'}
          </Button>
        )}
      </div>

      {!isEditing && mapping && (
        <div className={styles.cardBody}>
          <div className={styles.fieldRowThree}>
            <div><Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>Target Entity</Text><br /><Text size={300}>{mapping.targetEntity}</Text></div>
            <div><Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>Target Attribute</Text><br /><Text size={300}>{mapping.targetAttribute}</Text></div>
            <div><Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>Transform</Text><br /><Text size={300} font="monospace">{mapping.transformExpression ?? '—'}</Text></div>
          </div>
          <Button size="small" appearance="subtle" icon={<DeleteRegular />} onClick={() => void onDelete(mapping.id)}>Remove Mapping</Button>
        </div>
      )}

      {!isEditing && !mapping && (
        <div className={styles.noMapping}>No CRM attribute mapping configured — field value will not be written on submit.</div>
      )}

      {isEditing && (
        <div className={styles.cardBody}>
          <div className={styles.fieldRow}>
            <Field label="Target Entity" required hint="CRM entity logical name (e.g. qdb_loan_application)">
              <Input value={targetEntity} onChange={(_, d) => setTargetEntity(d.value)} placeholder="e.g. qdb_loan_application" />
            </Field>
            <Field label="Target Attribute" required hint="CRM attribute logical name (e.g. qdb_full_name)">
              <Input value={targetAttribute} onChange={(_, d) => setTargetAttribute(d.value)} placeholder="e.g. qdb_full_name" />
            </Field>
          </div>
          <Field label="Transform Expression" hint="Optional: transform value before writing (e.g. toUpper(value))">
            <Input value={transformExpression} onChange={(_, d) => setTransformExpression(d.value)} placeholder="e.g. parseFloat(value) * 1000" style={{ fontFamily: 'monospace' }} />
          </Field>
          <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
            <Checkbox checked={isChildEntity} onChange={(_, d) => setIsChildEntity(d.checked === true)} label="Child entity mapping" />
            <Switch checked={isActive} onChange={(_, d) => setIsActive(d.checked)} label="Active" />
          </div>
          {isChildEntity && (
            <Field label="Child Entity Relationship Name" required>
              <Input value={childRelationship} onChange={(_, d) => setChildRelationship(d.value)} placeholder="e.g. qdb_loanapp_documents" />
            </Field>
          )}
          <div className={styles.cardActions}>
            <Button appearance="subtle" onClick={() => setIsEditing(false)}>Cancel</Button>
            <Button appearance="primary" icon={<CheckmarkRegular />} onClick={() => void handleSave()} disabled={!targetEntity || !targetAttribute}>Save Mapping</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SubmissionMappingScreen(): React.ReactElement {
  const styles = useStyles();
  const crmService = useContext(CrmContext);
  const navigateTo = useDesignerStore(s => s.navigateTo);
  const form = useDesignerStore(s => s.form);
  const fields = useDesignerStore(s => s.fields);
  const fieldOrder = useDesignerStore(s => s.fieldOrder);
  const sectionOrder = useDesignerStore(s => s.sectionOrder);
  const tabOrder = useDesignerStore(s => s.tabOrder);

  const [mappings, setMappings] = useState<SubmissionMapping[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Flatten all fields in display order (block-scoped so it doesn't affect callbacks below)
  const orderedFields = tabOrder.flatMap(tabId =>
    (sectionOrder[tabId] ?? []).flatMap(sectionId =>
      (fieldOrder[sectionId] ?? []).map(fieldId => fields[fieldId]).filter(Boolean)
    )
  );

  const load = useCallback(async () => {
    if (!crmService || !form) return;
    const svc = new SubmissionMappingService(crmService.getWebApi());
    setIsLoading(true);
    try {
      setMappings(await svc.listMappingsForForm(form.id));
    } finally {
      setIsLoading(false);
    }
  }, [crmService, form?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(); }, [load]);

  const handleSave = useCallback(async (fieldId: string, data: Omit<SubmissionMapping, 'id' | 'formId' | 'fieldId'>) => {
    if (!crmService || !form) return;
    const svc = new SubmissionMappingService(crmService.getWebApi());
    const existing = mappings.find(m => m.fieldId === fieldId);
    if (existing) {
      await svc.updateMapping(existing.id, data);
    } else {
      await svc.createMapping({ formId: form.id, fieldId, ...data });
    }
    await load();
  }, [crmService, form, mappings, load]);

  const handleDelete = useCallback(async (mappingId: string) => {
    if (!crmService) return;
    const svc = new SubmissionMappingService(crmService.getWebApi());
    await svc.deleteMapping(mappingId);
    await load();
  }, [crmService, load]);

  if (!form) {
    return (
      <div className={styles.root}>
        <div className={styles.topBar}>
          <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={() => navigateTo('designer')}>Back to Designer</Button>
        </div>
        <div className={styles.body}><Text style={{ color: tokens.colorNeutralForeground3 }}>No form loaded.</Text></div>
      </div>
    );
  }

  const mappedCount = mappings.length;
  const totalFields = orderedFields.length;

  return (
    <div className={styles.root}>
      <div className={styles.topBar}>
        <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={() => navigateTo('designer')}>Back to Designer</Button>
        <Text size={400} weight="semibold">Submission Mapping</Text>
        <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>— {form.name}</Text>
        <div style={{ flex: 1 }} />
        <Badge appearance="outline">{mappedCount} / {totalFields} fields mapped</Badge>
      </div>

      <div className={styles.body}>
        <div className={styles.infoBox}>
          <Text size={200} style={{ color: tokens.colorNeutralForeground2 }}>
            Configure which CRM attribute each form field should write its value to on submission.
            Fields without a mapping are collected in the submission payload but not written to Dataverse directly.
            The target entity should match the form's submission entity (<strong>{form.entityLogicalName || 'not set'}</strong>).
          </Text>
        </div>

        {isLoading && (
          <Text style={{ color: tokens.colorNeutralForeground3, display: 'block', marginBottom: SECTION_SPACING }}>
            Loading mappings…
          </Text>
        )}

        {!isLoading && orderedFields.length === 0 && (
          <div className={styles.emptyState}>
            <Text size={300}>No fields in this form yet. Add fields in the designer first.</Text>
          </div>
        )}

        {!isLoading && orderedFields.map(field => (
          field ? (
            <FieldMappingCard
              key={field.id}
              fieldId={field.id}
              fieldLabel={field.label}
              fieldCode={field.code}
              fieldType={field.fieldType}
              mapping={mappings.find(m => m.fieldId === field.id) ?? null}
              onSave={handleSave}
              onDelete={handleDelete}
            />
          ) : null
        ))}
      </div>
    </div>
  );
}
