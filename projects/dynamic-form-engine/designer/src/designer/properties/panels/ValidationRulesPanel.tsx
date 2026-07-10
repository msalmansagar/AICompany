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
import type {
  DesignerValidationRule,
  ValidationRuleType,
  StructuredCondition,
  StructuredConditionOperator,
  CrossFieldComparisonOperator,
} from '@/state/models/DesignerRuleModel';

// ── Rule type registry ─────────────────────────────────────────────────────────

type RuleUiMode = 'value' | 'expression' | 'conditions' | 'crossField' | 'none';

interface RuleTypeDef {
  value: ValidationRuleType;
  label: string;
  mode: RuleUiMode;
}

const RULE_TYPES: RuleTypeDef[] = [
  { value: 'required',              label: 'Required',              mode: 'none'       },
  { value: 'min_length',            label: 'Min Length',            mode: 'value'      },
  { value: 'max_length',            label: 'Max Length',            mode: 'value'      },
  { value: 'regex',                 label: 'Pattern (Regex)',        mode: 'value'      },
  { value: 'min_value',             label: 'Min Value',             mode: 'value'      },
  { value: 'max_value',             label: 'Max Value',             mode: 'value'      },
  { value: 'custom_expression',     label: 'Custom Expression',     mode: 'expression' },
  // DFE-ENH-001 FR-006
  { value: 'conditional_required',  label: 'Conditional Required',  mode: 'conditions' },
  // DFE-ENH-001 FR-007
  { value: 'cross_field',           label: 'Cross-Field Comparison', mode: 'crossField' },
];

const CONDITION_OPERATORS: Array<{ value: StructuredConditionOperator; label: string }> = [
  { value: 'equals',                label: 'equals'               },
  { value: 'not_equals',            label: 'does not equal'       },
  { value: 'greater_than',          label: 'is greater than'      },
  { value: 'less_than',             label: 'is less than'         },
  { value: 'greater_than_or_equal', label: 'is ≥'                 },
  { value: 'less_than_or_equal',    label: 'is ≤'                 },
  { value: 'is_empty',              label: 'is empty'             },
  { value: 'is_not_empty',          label: 'is not empty'         },
];

const CROSS_FIELD_OPERATORS: Array<{ value: CrossFieldComparisonOperator; label: string }> = [
  { value: '==', label: 'equals (==)'           },
  { value: '!=', label: 'does not equal (!=)'   },
  { value: '<',  label: 'is less than (<)'       },
  { value: '<=', label: 'is less than or equal (≤)' },
  { value: '>',  label: 'is greater than (>)'   },
  { value: '>=', label: 'is greater than or equal (≥)' },
];

const OPERATORS_REQUIRING_NO_VALUE: StructuredConditionOperator[] = ['is_empty', 'is_not_empty'];

// ── Styles ─────────────────────────────────────────────────────────────────────

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
  conditionRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '6px',
    padding: '6px 8px',
    backgroundColor: tokens.colorNeutralBackground4,
    borderRadius: '4px',
  },
  conditionRowField: { flex: 2 },
  conditionRowOp:    { flex: 2 },
  conditionRowVal:   { flex: 2 },
  ruleTypeBadge: { flexShrink: 0 },
  ruleMessage: {
    flex: 1,
    fontSize: '12px',
    color: tokens.colorNeutralForeground3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
});

// ── Condition builder (for conditional_required) ───────────────────────────────

interface ConditionBuilderProps {
  conditions: StructuredCondition[];
  allFieldCodes: string[];
  onChange: (conditions: StructuredCondition[]) => void;
}

function ConditionBuilder({ conditions, allFieldCodes, onChange }: ConditionBuilderProps): React.ReactElement {
  const styles = useStyles();

  function addCondition(): void {
    onChange([
      ...conditions,
      { fieldRef: allFieldCodes[0] ?? '', operator: 'equals', value: '' },
    ]);
  }

  function removeCondition(index: number): void {
    onChange(conditions.filter((_, i) => i !== index));
  }

  function updateConditionField(index: number, fieldRef: string): void {
    onChange(conditions.map((c, i) => i === index ? { ...c, fieldRef } : c));
  }

  function updateConditionOperator(index: number, operator: StructuredConditionOperator): void {
    const needsValue = !OPERATORS_REQUIRING_NO_VALUE.includes(operator);
    onChange(conditions.map((c, i) => i === index ? { ...c, operator, value: needsValue ? (c.value ?? '') : null } : c));
  }

  function updateConditionValue(index: number, value: string): void {
    onChange(conditions.map((c, i) => i === index ? { ...c, value } : c));
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <Text size={200} weight="semibold">Conditions (all must be true)</Text>
        <Button appearance="subtle" size="small" icon={<AddRegular />} onClick={addCondition}>
          Add Condition
        </Button>
      </div>

      {conditions.length === 0 && (
        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
          No conditions — field will always be required. Add at least one condition.
        </Text>
      )}

      {conditions.map((condition, index) => {
        const showValue = !OPERATORS_REQUIRING_NO_VALUE.includes(condition.operator);
        return (
          <div key={index} className={styles.conditionRow}>
            <div className={styles.conditionRowField}>
              <Field label="Field">
                <Select
                  value={condition.fieldRef}
                  onChange={(_, d) => updateConditionField(index, d.value)}
                >
                  {allFieldCodes.map(code => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className={styles.conditionRowOp}>
              <Field label="Operator">
                <Select
                  value={condition.operator}
                  onChange={(_, d) => updateConditionOperator(index, d.value as StructuredConditionOperator)}
                >
                  {CONDITION_OPERATORS.map(op => (
                    <option key={op.value} value={op.value}>{op.label}</option>
                  ))}
                </Select>
              </Field>
            </div>
            {showValue && (
              <div className={styles.conditionRowVal}>
                <Field label="Value">
                  <Input
                    value={condition.value ?? ''}
                    onChange={(_, d) => updateConditionValue(index, d.value)}
                    placeholder="comparison value"
                  />
                </Field>
              </div>
            )}
            <Button
              appearance="subtle"
              size="small"
              icon={<DeleteRegular />}
              aria-label="Remove condition"
              onClick={() => removeCondition(index)}
              style={{ alignSelf: 'flex-end', marginBottom: '2px' }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── Cross-field editor (for cross_field) ───────────────────────────────────────

interface CrossFieldEditorProps {
  sourceFieldLabel: string;
  operator: CrossFieldComparisonOperator;
  targetFieldRef: string;
  allFieldCodes: string[];
  onOperatorChange: (op: CrossFieldComparisonOperator) => void;
  onTargetChange: (fieldRef: string) => void;
}

function CrossFieldEditor({
  sourceFieldLabel,
  operator,
  targetFieldRef,
  allFieldCodes,
  onOperatorChange,
  onTargetChange,
}: CrossFieldEditorProps): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <Field label="Source field (this field)">
        <Input value={sourceFieldLabel} readOnly />
      </Field>
      <Field label="Operator">
        <Select
          value={operator}
          onChange={(_, d) => onOperatorChange(d.value as CrossFieldComparisonOperator)}
        >
          {CROSS_FIELD_OPERATORS.map(op => (
            <option key={op.value} value={op.value}>{op.label}</option>
          ))}
        </Select>
      </Field>
      <Field label="Compare against">
        <Select
          value={targetFieldRef}
          onChange={(_, d) => onTargetChange(d.value)}
        >
          {allFieldCodes.length === 0 && (
            <option value="">No other fields available</option>
          )}
          {allFieldCodes.map(code => (
            <option key={code} value={code}>{code}</option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

// ── AddRuleForm ────────────────────────────────────────────────────────────────

function generateRuleId(): string {
  return `tmp_vr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

interface AddRuleFormProps {
  onSave: (rule: DesignerValidationRule) => void;
  onCancel: () => void;
  fieldId: string;
  fieldCode: string;
  sortOrder: number;
  otherFieldCodes: string[];
}

function AddRuleForm({
  onSave,
  onCancel,
  fieldId,
  fieldCode,
  sortOrder,
  otherFieldCodes,
}: AddRuleFormProps): React.ReactElement {
  const styles = useStyles();
  const [ruleType, setRuleType] = useState<ValidationRuleType>('required');
  const [ruleValue, setRuleValue] = useState('');
  const [customExpression, setCustomExpression] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [conditions, setConditions] = useState<StructuredCondition[]>([]);
  const [crossFieldOperator, setCrossFieldOperator] = useState<CrossFieldComparisonOperator>('==');
  const [crossFieldTargetRef, setCrossFieldTargetRef] = useState(otherFieldCodes[0] ?? '');

  const selectedTypeDef = RULE_TYPES.find(rt => rt.value === ruleType);
  const mode = selectedTypeDef?.mode ?? 'none';

  function handleRuleTypeChange(newType: ValidationRuleType): void {
    setRuleType(newType);
    setRuleValue('');
    setCustomExpression('');
    setConditions([]);
    setCrossFieldOperator('==');
    setCrossFieldTargetRef(otherFieldCodes[0] ?? '');
  }

  function handleSave(): void {
    const newRule: DesignerValidationRule = {
      id: generateRuleId(),
      fieldId,
      ruleType,
      ruleValue: mode === 'value' ? ruleValue : null,
      errorMessage: errorMessage || `${selectedTypeDef?.label ?? ruleType} validation failed`,
      sortOrder,
      customExpression: mode === 'expression' ? customExpression : null,
      ruleTemplateId: null,
      conditions: mode === 'conditions' ? conditions : [],
      crossFieldOperator: mode === 'crossField' ? crossFieldOperator : null,
      crossFieldTargetRef: mode === 'crossField' ? crossFieldTargetRef : null,
    };
    onSave(newRule);
  }

  return (
    <div className={styles.addForm}>
      <Field label="Rule Type">
        <Select
          value={ruleType}
          onChange={(_, d) => handleRuleTypeChange(d.value as ValidationRuleType)}
        >
          {RULE_TYPES.map(rt => (
            <option key={rt.value} value={rt.value}>{rt.label}</option>
          ))}
        </Select>
      </Field>

      {mode === 'value' && (
        <Field label="Rule Value">
          <Input
            value={ruleValue}
            onChange={(_, d) => setRuleValue(d.value)}
            placeholder={ruleType === 'regex' ? 'e.g. ^[A-Z]+$' : 'Enter a number'}
          />
        </Field>
      )}

      {mode === 'expression' && (
        <Field label="Expression" hint="Reference field values as {fieldSchemaName}. E.g. {amount} > 1000">
          <Textarea
            value={customExpression}
            onChange={(_, d) => setCustomExpression(d.value)}
            placeholder="{amount} > 1000 && {customerType} == 'corporate'"
            resize="vertical"
          />
        </Field>
      )}

      {mode === 'conditions' && (
        <ConditionBuilder
          conditions={conditions}
          allFieldCodes={otherFieldCodes}
          onChange={setConditions}
        />
      )}

      {mode === 'crossField' && (
        <CrossFieldEditor
          sourceFieldLabel={fieldCode}
          operator={crossFieldOperator}
          targetFieldRef={crossFieldTargetRef}
          allFieldCodes={otherFieldCodes}
          onOperatorChange={setCrossFieldOperator}
          onTargetChange={setCrossFieldTargetRef}
        />
      )}

      <Field label={mode === 'conditions' ? 'Required message (optional)' : 'Error Message'}>
        <Input
          value={errorMessage}
          onChange={(_, d) => setErrorMessage(d.value)}
          placeholder={mode === 'conditions' ? 'e.g. This field is required for secured loans' : 'e.g. This field is required'}
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

// ── ValidationRulesPanel ───────────────────────────────────────────────────────

interface ValidationRulesPanelProps {
  fieldId: string;
}

export function ValidationRulesPanel({ fieldId }: ValidationRulesPanelProps): React.ReactElement {
  const styles = useStyles();
  const validationRules = useDesignerStore(s => s.validationRules);
  const fields = useDesignerStore(s => s.fields);
  const [showAddForm, setShowAddForm] = useState(false);

  const fieldRules = Object.values(validationRules)
    .filter(r => r.fieldId === fieldId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const currentField = fields[fieldId];
  const currentFieldCode = currentField?.code ?? '';
  const otherFieldCodes = Object.values(fields)
    .filter(f => f.id !== fieldId)
    .map(f => f.code)
    .sort();

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
          {rule.crossFieldTargetRef && (
            <Text size={200} font="monospace">{rule.crossFieldOperator} {rule.crossFieldTargetRef}</Text>
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
          fieldCode={currentFieldCode}
          sortOrder={fieldRules.length}
          otherFieldCodes={otherFieldCodes}
          onSave={handleSaveRule}
          onCancel={() => setShowAddForm(false)}
        />
      )}
    </div>
  );
}
