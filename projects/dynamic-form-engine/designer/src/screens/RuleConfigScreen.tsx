import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Divider,
  Field,
  Input,
  Select,
  Spinner,
  Text,
  Badge,
  makeStyles,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import {
  AddRegular,
  ArrowLeftRegular,
  DeleteRegular,
  CheckmarkRegular,
  DismissRegular,
  EditRegular,
  SaveRegular,
} from '@fluentui/react-icons';
import { useDesignerStore } from '@/state/designerStore';
import { CrmContext } from '@/app/App';
import { BusinessRuleService } from '@/services/BusinessRuleService';
import type { DesignerBusinessRule } from '@/state/models/DesignerRuleModel';
import type {
  BusinessRuleDefinition,
  ConditionOperator,
  LogicalOperator,
  RuleAction,
  RuleActionType,
  RuleCondition,
} from '@/types/businessRule';

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
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    gap: 0,
  },
  ruleList: {
    width: '280px',
    flexShrink: 0,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRight: `1px solid ${tokens.colorNeutralStroke1}`,
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
  },
  ruleListHeader: {
    padding: '12px 16px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ruleListItem: {
    padding: '12px 16px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ruleListItemActive: {
    backgroundColor: tokens.colorBrandBackground2,
  },
  editor: {
    flex: 1,
    overflow: 'auto',
    padding: '24px',
  },
  editorSection: {
    marginBottom: '24px',
  },
  formRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  conditionRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '8px',
    padding: '8px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: '4px',
    marginBottom: '4px',
  },
  actionRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '8px',
    padding: '8px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: '4px',
    marginBottom: '4px',
  },
  editorActions: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
    paddingTop: '16px',
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  emptyEditor: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: tokens.colorNeutralForeground3,
  },
  logicalOpRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '8px',
  },
  logicalOpButton: {
    padding: '4px 12px',
    borderRadius: '4px',
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    cursor: 'pointer',
    fontSize: '12px',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  logicalOpButtonSelected: {
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    ...shorthands.borderColor(tokens.colorBrandBackground),
    fontWeight: 600,
  },
});

const OPERATORS: Array<{ value: ConditionOperator; label: string }> = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Not Equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'not_contains', label: 'Not Contains' },
  { value: 'is_empty', label: 'Is Empty' },
  { value: 'is_not_empty', label: 'Is Not Empty' },
  { value: 'greater_than', label: 'Greater Than' },
  { value: 'less_than', label: 'Less Than' },
];

const ACTION_TYPES: Array<{ value: RuleActionType; label: string }> = [
  { value: 'show_field', label: 'Show Field' },
  { value: 'hide_field', label: 'Hide Field' },
  { value: 'set_required', label: 'Set Required' },
  { value: 'clear_required', label: 'Clear Required' },
  { value: 'set_value', label: 'Set Value' },
  { value: 'show_message', label: 'Show Message' },
];

const VALUE_OPERATORS = new Set<ConditionOperator>([
  'equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than',
]);

const VALUE_ACTION_TYPES = new Set<RuleActionType>(['set_value', 'show_message']);

function generateRuleId(): string {
  return `tmp_rule_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function buildDefaultDefinition(fieldCodes: string[]): BusinessRuleDefinition {
  return {
    version: '1.0',
    trigger_field_code: fieldCodes[0] ?? '',
    trigger_event: 'on_change',
    condition_group: {
      logical_operator: 'AND',
      conditions: [{ field_code: fieldCodes[0] ?? '', operator: 'equals', value: '' }],
    },
    actions: [{ action_type: 'show_field', target_field_code: fieldCodes[0] ?? '' }],
  };
}

interface RuleEditorProps {
  rule: DesignerBusinessRule;
  fieldCodes: string[];
  onSave: (updated: DesignerBusinessRule) => void;
  onCancel: () => void;
  onDelete: (id: string) => void;
}

function normaliseDefinition(raw: BusinessRuleDefinition | null | undefined): BusinessRuleDefinition {
  const fallbackCondition = { field_code: '', operator: 'equals' as ConditionOperator, value: '' };
  const fallbackAction = { action_type: 'show_field' as RuleActionType, target_field_code: '' };
  return {
    version: raw?.version ?? '1.0',
    trigger_field_code: raw?.trigger_field_code ?? '',
    trigger_event: raw?.trigger_event ?? 'on_change',
    condition_group: raw?.condition_group ?? { logical_operator: 'AND', conditions: [fallbackCondition] },
    actions: Array.isArray(raw?.actions) && raw.actions.length > 0 ? raw.actions : [fallbackAction],
  };
}

function RuleEditor({ rule, fieldCodes, onSave, onCancel, onDelete }: RuleEditorProps): React.ReactElement {
  const styles = useStyles();
  const [name, setName] = useState(rule.name ?? '');
  const [definition, setDefinition] = useState<BusinessRuleDefinition>(() => normaliseDefinition(rule.definition));

  const updateTriggerField = useCallback((code: string) => {
    setDefinition(prev => ({ ...prev, trigger_field_code: code }));
  }, []);

  const updateLogicalOp = useCallback((op: LogicalOperator) => {
    setDefinition(prev => ({
      ...prev,
      condition_group: { ...prev.condition_group, logical_operator: op },
    }));
  }, []);

  const addCondition = useCallback(() => {
    setDefinition(prev => ({
      ...prev,
      condition_group: {
        ...prev.condition_group,
        conditions: [
          ...prev.condition_group.conditions,
          { field_code: fieldCodes[0] ?? '', operator: 'equals' as ConditionOperator, value: '' },
        ],
      },
    }));
  }, [fieldCodes]);

  const updateCondition = useCallback((index: number, patch: Partial<RuleCondition>) => {
    setDefinition(prev => {
      const updated = [...prev.condition_group.conditions];
      updated[index] = { ...updated[index]!, ...patch };
      return { ...prev, condition_group: { ...prev.condition_group, conditions: updated } };
    });
  }, []);

  const removeCondition = useCallback((index: number) => {
    setDefinition(prev => {
      const updated = prev.condition_group.conditions.filter((_, i) => i !== index);
      return { ...prev, condition_group: { ...prev.condition_group, conditions: updated } };
    });
  }, []);

  const addAction = useCallback(() => {
    setDefinition(prev => ({
      ...prev,
      actions: [...prev.actions, { action_type: 'show_field' as RuleActionType, target_field_code: fieldCodes[0] ?? '' }],
    }));
  }, [fieldCodes]);

  const updateAction = useCallback((index: number, patch: Partial<RuleAction>) => {
    setDefinition(prev => {
      const updated = [...prev.actions];
      updated[index] = { ...updated[index]!, ...patch };
      return { ...prev, actions: updated };
    });
  }, []);

  const removeAction = useCallback((index: number) => {
    setDefinition(prev => ({ ...prev, actions: prev.actions.filter((_, i) => i !== index) }));
  }, []);

  const handleSave = useCallback(() => {
    onSave({ ...rule, name, definition });
  }, [rule, name, definition, onSave]);

  return (
    <div>
      <div className={styles.editorSection}>
        <Field label="Rule Name" required>
          <Input value={name} onChange={(_, d) => setName(d.value)} placeholder="e.g. Show employment fields" />
        </Field>
      </div>

      <Divider />

      <div className={styles.editorSection} style={{ marginTop: '16px' }}>
        <Text weight="semibold" size={300} block style={{ marginBottom: '12px' }}>Trigger</Text>
        <Field label="Trigger Field">
          <Select
            value={definition.trigger_field_code}
            onChange={(_, d) => updateTriggerField(d.value)}
          >
            {fieldCodes.map(code => (
              <option key={code} value={code}>{code}</option>
            ))}
          </Select>
        </Field>
        <Field label="Trigger Event" style={{ marginTop: '8px' }}>
          <Input value="On Change" readOnly />
        </Field>
      </div>

      <Divider />

      <div className={styles.editorSection} style={{ marginTop: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <Text weight="semibold" size={300}>Conditions</Text>
          <div className={styles.logicalOpRow} style={{ margin: 0 }}>
            {(['AND', 'OR'] as LogicalOperator[]).map(op => (
              <button
                key={op}
                type="button"
                className={`${styles.logicalOpButton} ${definition.condition_group.logical_operator === op ? styles.logicalOpButtonSelected : ''}`}
                onClick={() => updateLogicalOp(op)}
              >
                {op}
              </button>
            ))}
          </div>
        </div>

        {definition.condition_group.conditions.map((condition, idx) => (
          <div key={idx} className={styles.conditionRow}>
            <Field label="Field" style={{ flex: 1 }}>
              <Select value={condition.field_code} onChange={(_, d) => updateCondition(idx, { field_code: d.value })}>
                {fieldCodes.map(code => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </Select>
            </Field>
            <Field label="Operator" style={{ flex: 1 }}>
              <Select
                value={condition.operator}
                onChange={(_, d) => updateCondition(idx, { operator: d.value as ConditionOperator })}
              >
                {OPERATORS.map(op => (
                  <option key={op.value} value={op.value}>{op.label}</option>
                ))}
              </Select>
            </Field>
            {VALUE_OPERATORS.has(condition.operator) && (
              <Field label="Value" style={{ flex: 1 }}>
                <Input
                  value={condition.value ?? ''}
                  onChange={(_, d) => updateCondition(idx, { value: d.value })}
                />
              </Field>
            )}
            <Button
              appearance="subtle"
              icon={<DeleteRegular />}
              aria-label="Remove condition"
              onClick={() => removeCondition(idx)}
              disabled={definition.condition_group.conditions.length === 1}
            />
          </div>
        ))}

        <Button appearance="subtle" icon={<AddRegular />} onClick={addCondition} size="small">
          Add Condition
        </Button>
      </div>

      <Divider />

      <div className={styles.editorSection} style={{ marginTop: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <Text weight="semibold" size={300}>Actions</Text>
        </div>

        {definition.actions.map((action, idx) => (
          <div key={idx} className={styles.actionRow}>
            <Field label="Action Type" style={{ flex: 1 }}>
              <Select
                value={action.action_type}
                onChange={(_, d) => updateAction(idx, { action_type: d.value as RuleActionType })}
              >
                {ACTION_TYPES.map(at => (
                  <option key={at.value} value={at.value}>{at.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Target Field" style={{ flex: 1 }}>
              <Select
                value={action.target_field_code}
                onChange={(_, d) => updateAction(idx, { target_field_code: d.value })}
              >
                {fieldCodes.map(code => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </Select>
            </Field>
            {VALUE_ACTION_TYPES.has(action.action_type) && (
              <Field label="Value" style={{ flex: 1 }}>
                <Input
                  value={action.value ?? ''}
                  onChange={(_, d) => updateAction(idx, { value: d.value })}
                />
              </Field>
            )}
            <Button
              appearance="subtle"
              icon={<DeleteRegular />}
              aria-label="Remove action"
              onClick={() => removeAction(idx)}
              disabled={definition.actions.length === 1}
            />
          </div>
        ))}

        <Button appearance="subtle" icon={<AddRegular />} onClick={addAction} size="small">
          Add Action
        </Button>
      </div>

      <div className={styles.editorActions}>
        <Button
          appearance="subtle"
          icon={<DeleteRegular />}
          onClick={() => onDelete(rule.id)}
        >
          Delete Rule
        </Button>
        <Button appearance="subtle" icon={<DismissRegular />} onClick={onCancel}>
          Cancel
        </Button>
        <Button appearance="primary" icon={<CheckmarkRegular />} onClick={handleSave} disabled={!name.trim()}>
          Save Rule
        </Button>
      </div>
    </div>
  );
}

export function RuleConfigScreen(): React.ReactElement {
  const styles = useStyles();
  const crmService = useContext(CrmContext);

  const navigateTo = useDesignerStore(s => s.navigateTo);
  const storeBusinessRules = useDesignerStore(s => s.businessRules);
  const fields = useDesignerStore(s => s.fields);
  const form = useDesignerStore(s => s.form);

  const fieldCodes = useMemo(
    () => Object.values(fields).map(f => f.code).filter(Boolean),
    [fields],
  );

  const [localRules, setLocalRules] = useState<DesignerBusinessRule[]>(
    () => Object.values(storeBusinessRules).sort((a, b) => a.sortOrder - b.sortOrder),
  );
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(
    () => (localRules.length > 0 ? (localRules[0]?.id ?? null) : null),
  );
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [saveAllError, setSaveAllError] = useState<string | null>(null);
  const [saveAllSuccess, setSaveAllSuccess] = useState(false);

  // Load rules from CRM on mount so the list always reflects the latest saved state,
  // not just what was in the Zustand store when the form was opened.
  const loadFromCrm = useCallback(async () => {
    if (!crmService || !form?.id || form.id.startsWith('tmp_')) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const svc = new BusinessRuleService(crmService.getWebApi());
      const freshRules = await svc.listRulesForForm(form.id);
      const sorted = freshRules.sort((a, b) => a.sortOrder - b.sortOrder);
      setLocalRules(sorted);
      setSelectedRuleId(prev => {
        if (prev && sorted.some(r => r.id === prev)) return prev;
        return sorted.length > 0 ? (sorted[0]?.id ?? null) : null;
      });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load rules');
    } finally {
      setIsLoading(false);
    }
  }, [crmService, form?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void loadFromCrm(); }, [loadFromCrm]);

  const handleBack = useCallback(() => {
    navigateTo('designer');
  }, [navigateTo]);

  const handleAddRule = useCallback(() => {
    const newRule: DesignerBusinessRule = {
      id: generateRuleId(),
      formId: form?.id ?? '',
      name: 'New Rule',
      definition: buildDefaultDefinition(fieldCodes),
      isActive: true,
      sortOrder: localRules.length,
    };
    setLocalRules(prev => [...prev, newRule]);
    setSelectedRuleId(newRule.id);
    setIsAddingNew(true);
  }, [form, fieldCodes, localRules.length]);

  const handleSaveRule = useCallback((updated: DesignerBusinessRule) => {
    setLocalRules(prev => prev.map(r => (r.id === updated.id ? updated : r)));
    setIsAddingNew(false);

    // Commit to the store by directly updating the businessRules map
    const state = useDesignerStore.getState();
    useDesignerStore.setState({
      businessRules: {
        ...state.businessRules,
        [updated.id]: updated,
      },
      isDirty: true,
    });
  }, []);

  const handleDeleteRule = useCallback((id: string) => {
    setLocalRules(prev => prev.filter(r => r.id !== id));
    setSelectedRuleId(prev => (prev === id ? null : prev));

    const state = useDesignerStore.getState();
    const updated = { ...state.businessRules };
    delete updated[id];
    useDesignerStore.setState({ businessRules: updated, isDirty: true });
  }, []);

  const handleCancelEdit = useCallback(() => {
    if (isAddingNew && selectedRuleId) {
      setLocalRules(prev => prev.filter(r => r.id !== selectedRuleId));
      setSelectedRuleId(null);
    }
    setIsAddingNew(false);
  }, [isAddingNew, selectedRuleId]);

  const handleSaveAllToCrm = useCallback(async () => {
    if (!crmService || !form?.id || form.id.startsWith('tmp_')) return;
    setIsSavingAll(true);
    setSaveAllError(null);
    setSaveAllSuccess(false);
    try {
      const svc = new BusinessRuleService(crmService.getWebApi());
      await svc.syncRules(form.id, localRules);
      setSaveAllSuccess(true);
      // Refetch so tmp_ IDs are replaced with real Dataverse IDs
      await loadFromCrm();
    } catch (err) {
      setSaveAllError(err instanceof Error ? err.message : 'Failed to save rules');
    } finally {
      setIsSavingAll(false);
    }
  }, [crmService, form, localRules, loadFromCrm]);

  const selectedRule = localRules.find(r => r.id === selectedRuleId) ?? null;

  return (
    <div className={styles.root}>
      <div className={styles.topBar}>
        <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={handleBack}>
          Back to Designer
        </Button>
        <Text size={400} weight="semibold">Business Rules</Text>
        <div style={{ flex: 1 }} />
        {loadError && <Text size={200} style={{ color: tokens.colorPaletteRedForeground1 }}>{loadError}</Text>}
        {saveAllError && <Text size={200} style={{ color: tokens.colorPaletteRedForeground1 }}>{saveAllError}</Text>}
        {saveAllSuccess && <Text size={200} style={{ color: tokens.colorPaletteGreenForeground1 }}>Saved to Dataverse</Text>}
        <Button
          appearance="subtle"
          icon={isLoading ? <Spinner size="tiny" /> : undefined}
          onClick={() => void loadFromCrm()}
          disabled={isLoading || isSavingAll}
          aria-label="Refresh rules"
        >
          {isLoading ? 'Loading...' : 'Refresh'}
        </Button>
        <Button
          appearance="primary"
          icon={isSavingAll ? <Spinner size="tiny" /> : <SaveRegular />}
          onClick={() => void handleSaveAllToCrm()}
          disabled={isSavingAll || isLoading || localRules.length === 0}
        >
          {isSavingAll ? 'Saving...' : 'Save to Dataverse'}
        </Button>
      </div>

      <div className={styles.body}>
        <div className={styles.ruleList}>
          <div className={styles.ruleListHeader}>
            <Text weight="semibold" size={200}>{localRules.length} Rule{localRules.length !== 1 ? 's' : ''}</Text>
            <Button
              appearance="primary"
              size="small"
              icon={<AddRegular />}
              onClick={handleAddRule}
            >
              Add
            </Button>
          </div>

          {isLoading ? (
            <div style={{ padding: '20px', display: 'flex', justifyContent: 'center' }}>
              <Spinner size="small" label="Loading rules..." />
            </div>
          ) : localRules.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: tokens.colorNeutralForeground3 }}>
              <Text size={200}>No rules yet. Click Add to create one.</Text>
            </div>
          ) : (
            localRules.map(rule => (
              <div
                key={rule.id}
                className={`${styles.ruleListItem} ${rule.id === selectedRuleId ? styles.ruleListItemActive : ''}`}
                onClick={() => setSelectedRuleId(rule.id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && setSelectedRuleId(rule.id)}
                aria-pressed={rule.id === selectedRuleId}
                aria-label={`Select rule: ${rule.name}`}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'hidden' }}>
                  <Text size={300} weight="semibold" truncate>{rule.name}</Text>
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    on_change → {rule.definition.trigger_field_code}
                  </Text>
                </div>
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                  <Badge appearance="outline" color={rule.isActive ? 'success' : 'subtle'}>
                    {rule.isActive ? 'Active' : 'Off'}
                  </Badge>
                  <Button
                    appearance="subtle"
                    size="small"
                    icon={<EditRegular />}
                    aria-label={`Edit ${rule.name}`}
                    onClick={e => { e.stopPropagation(); setSelectedRuleId(rule.id); }}
                  />
                </div>
              </div>
            ))
          )}
        </div>

        <div className={styles.editor}>
          {selectedRule ? (
            <RuleEditor
              key={selectedRule.id}
              rule={selectedRule}
              fieldCodes={fieldCodes.length > 0 ? fieldCodes : ['(no fields)']}
              onSave={handleSaveRule}
              onCancel={handleCancelEdit}
              onDelete={handleDeleteRule}
            />
          ) : (
            <div className={styles.emptyEditor}>
              <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
                Select a rule from the list or click Add to create one.
              </Text>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
