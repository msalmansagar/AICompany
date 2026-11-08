import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Field,
  Input,
  Select,
  Text,
  makeStyles,
  tokens,
  Badge,
} from '@fluentui/react-components';
import { AddRegular, ArrowLeftRegular, DeleteRegular, CheckmarkRegular, DismissRegular, InfoRegular } from '@fluentui/react-icons';
import { useDesignerStore } from '@/state/designerStore';
import { AccessPolicyService } from '@/services/AccessPolicyService';
import { CrmContext } from '@/app/App';
import type { DesignerAccessPolicyModel, AccessPolicyType } from '@/state/models/DesignerAccessPolicyModel';

const ACCESS_TYPES: Array<{ value: AccessPolicyType; label: string; description: string }> = [
  { value: 'view',   label: 'View',   description: 'Read metadata, view data, clone' },
  { value: 'submit', label: 'Submit', description: 'POST submit — create CRM record' },
  { value: 'draft',  label: 'Draft',  description: 'POST draft — save partial submission' },
];

const ACCESS_TYPE_COLORS: Record<AccessPolicyType, 'brand' | 'success' | 'warning'> = {
  view: 'brand', submit: 'success', draft: 'warning',
};

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: tokens.colorNeutralBackground3 },
  topBar: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px', backgroundColor: tokens.colorNeutralBackground1, borderBottom: `1px solid ${tokens.colorNeutralStroke1}`, flexShrink: 0 },
  body: { flex: 1, overflow: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '760px', margin: '0 auto', width: '100%' },
  infoBox: { padding: '12px 16px', backgroundColor: tokens.colorNeutralBackground2, borderRadius: '6px', border: `1px solid ${tokens.colorNeutralStroke1}`, display: 'flex', gap: '8px', alignItems: 'flex-start' },
  card: { backgroundColor: tokens.colorNeutralBackground1, borderRadius: '6px', padding: '12px 16px', border: `1px solid ${tokens.colorNeutralStroke2}`, display: 'flex', alignItems: 'center', gap: '12px' },
  form: { display: 'flex', flexDirection: 'column', gap: '12px', backgroundColor: tokens.colorNeutralBackground3, padding: '16px', borderRadius: '6px', border: `1px solid ${tokens.colorBrandStroke2}` },
  formRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  formActions: { display: 'flex', gap: '8px', justifyContent: 'flex-end' },
  emptyState: { padding: '40px', textAlign: 'center' as const, color: tokens.colorNeutralForeground3, backgroundColor: tokens.colorNeutralBackground1, borderRadius: '4px', border: `1px dashed ${tokens.colorNeutralStroke1}` },
});

export function AccessPolicyEditorScreen(): React.ReactElement {
  const styles = useStyles();
  const navigateTo = useDesignerStore(s => s.navigateTo);
  const form = useDesignerStore(s => s.form);
  const crmService = useContext(CrmContext);
  const service = useMemo(
    () => (crmService && form ? new AccessPolicyService(crmService.getWebApi()) : null),
    [crmService, form],
  );

  const [policies, setPolicies] = useState<DesignerAccessPolicyModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [draftRole, setDraftRole] = useState('');
  const [draftType, setDraftType] = useState<AccessPolicyType>('view');

  const load = useCallback(async (): Promise<void> => {
    if (!service || !form) return;
    setIsLoading(true);
    try {
      setPolicies(await service.listPoliciesForForm(form.id));
    } finally {
      setIsLoading(false);
    }
  }, [service, form]);

  useEffect(() => { void load(); }, [load]);

  const handleSave = useCallback(async (): Promise<void> => {
    if (!service || !form) return;
    await service.createPolicy({ formId: form.id, roleId: draftRole, accessType: draftType });
    setShowForm(false);
    setDraftRole('');
    setDraftType('view');
    await load();
  }, [service, form, draftRole, draftType, load]);

  const handleDelete = useCallback(async (id: string): Promise<void> => {
    if (!service) return;
    await service.deletePolicy(id);
    await load();
  }, [service, load]);

  if (!form) {
    return (
      <div className={styles.root}>
        <div className={styles.topBar}>
          <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={() => navigateTo('designer')}>Back to Designer</Button>
        </div>
        <div className={styles.body}>
          <Text style={{ color: tokens.colorNeutralForeground3 }}>No form loaded.</Text>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.topBar}>
        <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={() => navigateTo('designer')}>Back to Designer</Button>
        <Text size={400} weight="semibold">Access Policies</Text>
        <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>— {form.name}</Text>
        <div style={{ flex: 1 }} />
        <Button appearance="primary" icon={<AddRegular />} onClick={() => setShowForm(true)} disabled={showForm}>Add Policy</Button>
      </div>

      <div className={styles.body}>
        <div className={styles.infoBox}>
          <InfoRegular style={{ flexShrink: 0, marginTop: 2 }} />
          <Text size={200} style={{ color: tokens.colorNeutralForeground2 }}>
            Policies restrict access by Azure AD app role. When no policies exist for an access type, access is open to all authenticated users.
            Adding even one policy for an access type switches it to allowlist mode — only users with a matching role claim can proceed.
          </Text>
        </div>

        {showForm && (
          <div className={styles.form}>
            <Text weight="semibold" size={300}>New Policy</Text>
            <div className={styles.formRow}>
              <Field label="Azure AD App Role" required hint="Exact role name from the JWT roles[] claim (case-sensitive)">
                <Input value={draftRole} onChange={(_, d) => setDraftRole(d.value)} placeholder="e.g. LoanOfficer" />
              </Field>
              <Field label="Access Type" required>
                <Select value={draftType} onChange={(_, d) => setDraftType(d.value as AccessPolicyType)}>
                  {ACCESS_TYPES.map(at => <option key={at.value} value={at.value}>{at.label} — {at.description}</option>)}
                </Select>
              </Field>
            </div>
            <div className={styles.formActions}>
              <Button appearance="subtle" icon={<DismissRegular />} onClick={() => { setShowForm(false); setDraftRole(''); setDraftType('view'); }}>Cancel</Button>
              <Button appearance="primary" icon={<CheckmarkRegular />} onClick={() => void handleSave()} disabled={!draftRole}>Save</Button>
            </div>
          </div>
        )}

        {isLoading && <Text style={{ color: tokens.colorNeutralForeground3 }}>Loading policies…</Text>}

        {!isLoading && policies.length === 0 && !showForm && (
          <div className={styles.emptyState}><Text size={300}>No policies configured — this form is open to all authenticated users. Click "Add Policy" to restrict access.</Text></div>
        )}

        {policies.map(p => (
          <div key={p.id} className={styles.card}>
            <Badge appearance="filled" color={ACCESS_TYPE_COLORS[p.accessType]}>{p.accessType}</Badge>
            <Text weight="semibold" style={{ fontFamily: 'monospace' }}>{p.roleId}</Text>
            <div style={{ flex: 1 }} />
            <Button size="small" appearance="subtle" icon={<DeleteRegular />} onClick={() => void handleDelete(p.id)} aria-label="Delete policy" />
          </div>
        ))}
      </div>
    </div>
  );
}
