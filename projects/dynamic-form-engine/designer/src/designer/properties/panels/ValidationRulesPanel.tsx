import React, { useCallback, useState } from 'react';
import {
  Badge,
  Button,
  Field,
  Input,
  Select,
  Text,
  Textarea,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { AddRegular, CheckmarkRegular, DeleteRegular, DismissRegular } from '@fluentui/react-icons';
import { useDesignerStore } from '@/state/designerStore';
import type { DesignerValidationRule, ValidationRuleType } from '@/state/models/DesignerRuleModel';

const RULE_TYPES: Array<{ value: ValidationRuleType; label: string; hasValue: boolean; hasExpression: boolean }> = [
  { value: 'required',           label: 'Required',              hasValue: false, hasExpression: false },
  { value: 'min_length',         label: 'Min Length',            hasValue: true,  hasExpression: false },
  { value: 'max_length',         label: 'Max Length',            hasValue: true,  hasExpression: false },
  { value: 'regex',              label: 'Pattern (Regex)',        hasValue: true,  hasExpression: false },
  { value: 'min_value',          label: 'Min Value',             hasValue: true,  hasExpression: false },
  { value: 'max_value',          label: 'Max Value',             hasValue: true,  hasExpression: false },
  // Sprint 3
  { value: 'custom_expression',  label: 'Custom Expression',     hasValue: false, hasExpression: true  },
];

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  ruleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: '4px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  addForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '10px',
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: '4px',
    border: `1px solid ${tokens.colorBrandStroke2}`,
  },
  addFormActions: {
    display: 'flex',
    gap: '6px',
    justifyContent: 'flex-end',
  },
  ruleTypeBadge: {
    flexShrink: 0,
  },
  ruleMessage: {
    flex: 1,
    fontSize: '12px',
    color: tokens.colorNeutralForeground3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
});

function generateRuleId(): string {
  return `tmp_vr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

interface AddRuleFormProps {
  onSave: (rule: DesignerValidationRule) => void;
  onCancel: () => void;
  fieldId: string;
  sortOrder: number;
}

function AddRuleForm({ onSave, onCancel, fieldId, sortOrder }: AddRuleFormProps): React.ReactElement {
  const styles = useStyles();
  const [ruleType, setRuleType] = useState<ValidationRuleType>('required');
  const [ruleValue, setRuleValue] = useState('');
  const [customExpression, setCustomExpression] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const selectedTypeDef = RULE_TYPES.find(rt => rt.value === ruleType);

  function handleSave(): void {
    const newRule: DesignerValidationRule = {
      id: generateRuleId(),
      fieldId,
      ruleType,
      ruleValue: selectedTypeDef?.hasValue ? ruleValue : null,
      errorMessage: errorMessage || `${selectedTypeDef?.label ?? ruleType} validation failed`,
      sortOrder,
      customExpression: selectedTypeDef?.hasExpression ? customExpression : null,
      ruleTemplateId: null,
    };
    onSave(newRule);
  }

  return (
    <div className={styles.addForm}>
      <Field label="Rule Type">
        <Select
          value={ruleType}
          onChange={(_, d) => {
            setRuleType(d.value as ValidationRuleType);
            setRuleValue('');
            setCustomExpression('');
          }}
        >
          {RULE_TYPES.map(rt => (
            <option key={rt.value} value={rt.value}>{rt.label}</option>
          ))}
        </Select>
      </Field>

      {selectedTypeDef?.hasValue && (
        <Field label="Rule Value">
          <Input
            value={ruleValue}
            onChange={(_, d) => setRuleValue(d.value)}
            placeholder={ruleType === 'regex' ? 'e.g. ^[A-Z]+$' : 'Enter a number'}
          />
        </Field>
      )}

      {selectedTypeDef?.hasExpression && (
        <Field label="Expression" hint="Reference field values as {fieldSchemaName}. E.g. {amount} > 1000">
          <Textarea
            value={customExpression}
            onChange={(_, d) => setCustomExpression(d.value)}
            placeholder="{amount} > 1000 && {customerType} == 'corporate'"
            resize="vertical"
          />
        </Field>
      )}

      <Field label="Error Message">
        <Input
          value={errorMessage}
          onChange={(_, d) => setErrorMessage(d.value)}
          placeholder="e.g. This field is required"
        />
      </Field>

      <div className={styles.addFormActions}>
        <Button appearance="subtle" size="small" icon={<DismissRegular />} onClick={onCancel}>
          Cancel
        </Button>
        <Button appearance="primary" size="small" icon={<CheckmarkRegular />} onClick={handleSave}>
          Add Rule
        </Button>
      </div>
    </div>
  );
}

interface ValidationRulesPanelProps {
  fieldId: string;
}

export function ValidationRulesPanel({ fieldId }: ValidationRulesPanelProps): React.ReactElement {
  const styles = useStyles();
  const validationRules = useDesignerStore(s => s.validationRules);
  const [showAddForm, setShowAddForm] = useState(false);

  const fieldRules = Object.values(validationRules)
    .filter(r => r.fieldId === fieldId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const handleSaveRule = useCallback((newRule: DesignerValidationRule) => {
    const state = useDesignerStore.getState();
    const dirtyIds = state.dirtyIds.includes(newRule.fieldId)
      ? state.dirtyIds
      : [...state.dirtyIds, newRule.fieldId];
    useDesignerStore.setState({
      validationRules: { ...state.validationRules, [newRule.id]: newRule },
      isDirty: true,
      dirtyIds,
    });
    setShowAddForm(false);
  }, []);

  const handleDeleteRule = useCallback((ruleId: string) => {
    const state = useDesignerStore.getState();
    const rule = state.validationRules[ruleId];
    const updated = { ...state.validationRules };
    delete updated[ruleId];
    const dirtyIds =
      rule && !state.dirtyIds.includes(rule.fieldId)
        ? [...state.dirtyIds, rule.fieldId]
        : state.dirtyIds;
    useDesignerStore.setState({ validationRules: updated, isDirty: true, dirtyIds });
  }, []);

  return (
    <div className={styles.root}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text weight="semibold" size={200}>Validation Rules</Text>
        <Button
          appearance="subtle"
          size="small"
          icon={<AddRegular />}
          onClick={() => setShowAddForm(true)}
          disabled={showAddForm}
        >
          Add Rule
        </Button>
      </div>

      {fieldRules.length === 0 && !showAddForm && (
        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>No validation rules.</Text>
      )}

      {fieldRules.map(rule => (
        <div key={rule.id} className={styles.ruleRow} role="listitem">
          <Badge appearance="outline" color="informative" className={styles.ruleTypeBadge}>
            {rule.ruleType}
          </Badge>
          {rule.ruleValue && (
            <Text size={200} font="monospace">{rule.ruleValue}</Text>
          )}
          <span className={styles.ruleMessage} title={rule.errorMessage}>
            {rule.errorMessage}
          </span>
          <Button
            appearance="subtle"
            size="small"
            icon={<DeleteRegular />}
            aria-label={`Delete ${rule.ruleType} rule`}
            onClick={() => handleDeleteRule(rule.id)}
          />
        </div>
      ))}

      {showAddForm && (
        <AddRuleForm
          fieldId={fieldId}
          sortOrder={fieldRules.length}
          onSave={handleSaveRule}
          onCancel={() => setShowAddForm(false)}
        />
      )}
    </div>
  );
}
