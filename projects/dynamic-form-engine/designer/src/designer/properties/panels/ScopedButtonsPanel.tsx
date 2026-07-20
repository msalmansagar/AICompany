// ScopedButtonsPanel — DFE-BTN-001 / DFE-CBTN-001 designer write path.
//
// Authors tab/section scoped buttons (list / add / edit / delete) against
// qdb_form_scoped_button. DFE-CBTN-001 adds two collapsible condition-builder
// sections per button: "Show this button when…" and "Enable this button when…".
//
// Condition builders use the same ButtonConditionSet type used by the runtime.
// Validation (CEO C-01) is enforced before every Dataverse write.

import React, { useCallback, useContext, useEffect, useState } from 'react';
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Button,
  Field,
  Input,
  MessageBar,
  Select,
  Spinner,
  Switch,
  Text,
  ToggleButton,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { Add16Regular, Delete16Regular, AddRegular, DeleteRegular } from '@fluentui/react-icons';
import { CrmContext } from '@/app/App';
import { useDesignerStore } from '@/state/designerStore';
import {
  ScopedButtonDesignService,
  validateButtonConditionSet,
  type ScopedButtonRecord,
} from '@/services/ScopedButtonDesignService';
import type {
  ButtonPlacementScope,
  ScopedButtonActionType,
  ButtonConditionSet,
  RuleCondition,
  ConditionOperator,
  LogicalOperator,
} from '@qdb/shared';

// ── Button type registry ───────────────────────────────────────────────────────

interface ButtonType {
  key: string;
  label: string;
  actionType: ScopedButtonActionType;
  config: string;
}

const BUTTON_TYPES: ButtonType[] = [
  { key: 'nextStep',     label: 'Navigate: Next step',     actionType: 'navigate',     config: '{"target":"nextStep"}'     },
  { key: 'previousStep', label: 'Navigate: Previous step', actionType: 'navigate',     config: '{"target":"previousStep"}' },
  { key: 'finalSubmit',  label: 'Final submit',            actionType: 'finalSubmit',  config: '{"extraParams":[]}'        },
  { key: 'saveDraft',    label: 'Save draft',              actionType: 'saveDraft',    config: '{}'                        },
];

function typeKeyOf(button: ScopedButtonRecord): string {
  if (button.actionType === 'finalSubmit') return 'finalSubmit';
  if (button.actionType === 'saveDraft') return 'saveDraft';
  try {
    return (JSON.parse(button.actionConfigJson) as { target?: string }).target === 'previousStep'
      ? 'previousStep'
      : 'nextStep';
  } catch {
    return 'nextStep';
  }
}

// ── Condition operator registry ────────────────────────────────────────────────

/** Operators that do NOT require a comparison value. */
const VALUE_FREE_OPS: ReadonlySet<ConditionOperator> = new Set<ConditionOperator>([
  'isEmpty',
  'isNotEmpty',
]);

const CONDITION_OPERATOR_OPTIONS: Array<{ value: ConditionOperator; label: string }> = [
  { value: 'equals',             label: 'equals'                  },
  { value: 'notEquals',          label: 'does not equal'          },
  { value: 'isEmpty',            label: 'is empty'                },
  { value: 'isNotEmpty',         label: 'is not empty'            },
  { value: 'greaterThan',        label: 'is greater than'         },
  { value: 'lessThan',           label: 'is less than'            },
  { value: 'greaterThanOrEqual', label: 'is greater than or equal'},
  { value: 'lessThanOrEqual',    label: 'is less than or equal'   },
  { value: 'contains',           label: 'contains'                },
  { value: 'inList',             label: 'is in list'              },
  { value: 'notInList',          label: 'is not in list'          },
];

// ── Styles ─────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  panel: { display: 'flex', flexDirection: 'column', gap: '10px' },
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '8px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: '4px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  rowTop: { display: 'flex', gap: '6px', alignItems: 'center' },
  rowToggles: { display: 'flex', gap: '12px', alignItems: 'center' },
  grow: { flex: 1 },
  empty: { color: tokens.colorNeutralForeground3, fontStyle: 'italic' },

  // Condition builder
  condBuilder: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '8px',
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: '4px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  condLogicRow: { display: 'flex', gap: '6px', alignItems: 'center' },
  condRow: {
    display: 'flex',
    gap: '6px',
    alignItems: 'flex-end',
    padding: '6px',
    backgroundColor: tokens.colorNeutralBackground4,
    borderRadius: '4px',
  },
  condField: { flex: 2, minWidth: 0 },
  condOp:    { flex: 2, minWidth: 0 },
  condVal:   { flex: 2, minWidth: 0 },
  condActions: {
    display: 'flex',
    gap: '6px',
    justifyContent: 'flex-end',
    marginTop: '4px',
  },
  summary: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    fontStyle: 'italic',
    padding: '2px 0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  accordionHeader: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },
});

// ── Condition summary ──────────────────────────────────────────────────────────

function buildSummaryText(
  set: ButtonConditionSet | null,
  allFieldLabels: Map<string, string>,
): string {
  if (!set || set.conditions.length === 0) return 'No conditions — button uses its static visibility/enabled state.';
  const parts = set.conditions.map(c => {
    const fieldLabel = allFieldLabels.get(c.fieldId) ?? c.fieldId;
    const opLabel = CONDITION_OPERATOR_OPTIONS.find(o => o.value === c.operator)?.label ?? c.operator;
    const valuePart = VALUE_FREE_OPS.has(c.operator) ? '' : ` "${String(c.value ?? '')}"`;
    return `${fieldLabel} ${opLabel}${valuePart}`;
  });
  const joiner = ` ${set.logic} `;
  return parts.join(joiner);
}

// ── Pure condition-row key helpers ─────────────────────────────────────────────

function newConditionRow(): RuleCondition & { _key: string } {
  return { _key: `cond_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, fieldId: '', operator: 'equals', value: '' };
}

type KeyedCondition = RuleCondition & { _key: string };

// ── ButtonConditionBuilder ─────────────────────────────────────────────────────

interface ButtonConditionBuilderProps {
  /** Human title shown in the accordion header (e.g. "Show this button when…"). */
  title: string;
  /** The saved condition set from Dataverse (null = none). */
  savedSet: ButtonConditionSet | null;
  /** All form fields keyed by fieldId — hidden and read-only included. */
  allFieldLabels: Map<string, string>;
  /** Called with the new set to write, or null to clear. Throws on validation error. */
  onSave: (set: ButtonConditionSet | null) => Promise<void>;
  isBusy: boolean;
}

function ButtonConditionBuilder({
  title,
  savedSet,
  allFieldLabels,
  onSave,
  isBusy,
}: ButtonConditionBuilderProps): React.ReactElement {
  const styles = useStyles();

  // Local draft state, independent from savedSet so the user can discard.
  const [draft, setDraft] = useState<KeyedCondition[]>(
    () => (savedSet?.conditions ?? []).map(c => ({ ...c, _key: `cond_${Math.random().toString(36).slice(2)}` })),
  );
  const [logic, setLogic] = useState<LogicalOperator>(savedSet?.logic ?? 'AND');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Reset draft when savedSet changes externally (e.g. after a successful load).
  useEffect(() => {
    setDraft(
      (savedSet?.conditions ?? []).map(c => ({ ...c, _key: `cond_${Math.random().toString(36).slice(2)}` })),
    );
    setLogic(savedSet?.logic ?? 'AND');
    setValidationError(null);
  }, [savedSet]);

  function addRow(): void {
    setDraft(prev => [...prev, newConditionRow()]);
  }

  function removeRow(key: string): void {
    setDraft(prev => prev.filter(c => c._key !== key));
  }

  function updateField(key: string, fieldId: string): void {
    setDraft(prev => prev.map(c => c._key === key ? { ...c, fieldId } : c));
  }

  function updateOperator(key: string, operator: ConditionOperator): void {
    setDraft(prev => prev.map(c => {
      if (c._key !== key) return c;
      const clearValue = VALUE_FREE_OPS.has(operator);
      return { ...c, operator, value: clearValue ? undefined : (c.value ?? '') };
    }));
  }

  function updateValue(key: string, value: string): void {
    setDraft(prev => prev.map(c => c._key === key ? { ...c, value } : c));
  }

  async function handleSave(): Promise<void> {
    setValidationError(null);
    // No conditions → clear the set in Dataverse (backward-compatible: no conditions = no set).
    if (draft.length === 0) {
      setIsSaving(true);
      try {
        await onSave(null);
      } finally {
        setIsSaving(false);
      }
      return;
    }

    const set: ButtonConditionSet = {
      // Strip the _key UI-only property before persisting.
      conditions: draft.map(({ _key: _, ...rest }) => rest),
      logic,
    };

    const err = validateButtonConditionSet(set);
    if (err) {
      setValidationError(err.message);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(set);
    } finally {
      setIsSaving(false);
    }
  }

  const fieldIds = [...allFieldLabels.keys()];
  const summaryText = buildSummaryText(savedSet, allFieldLabels);

  return (
    <AccordionItem value={title}>
      <AccordionHeader className={styles.accordionHeader}>
        {title}
      </AccordionHeader>
      <AccordionPanel>
        <div className={styles.condBuilder}>
          {/* AND / OR toggle */}
          {draft.length > 1 && (
            <div className={styles.condLogicRow}>
              <Text size={200}>Combine with:</Text>
              <ToggleButton
                size="small"
                checked={logic === 'AND'}
                onClick={() => setLogic('AND')}
                appearance={logic === 'AND' ? 'primary' : 'secondary'}
              >
                AND
              </ToggleButton>
              <ToggleButton
                size="small"
                checked={logic === 'OR'}
                onClick={() => setLogic('OR')}
                appearance={logic === 'OR' ? 'primary' : 'secondary'}
              >
                OR
              </ToggleButton>
            </div>
          )}

          {/* Condition rows */}
          {draft.length === 0 && (
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              No conditions — add a row to make this button conditional.
            </Text>
          )}

          {draft.map((cond, index) => {
            const showValue = !VALUE_FREE_OPS.has(cond.operator);
            return (
              <div key={cond._key} className={styles.condRow} role="listitem">
                {/* Field picker */}
                <div className={styles.condField}>
                  <Field label={index === 0 ? 'Field' : undefined}>
                    <Select
                      value={cond.fieldId}
                      onChange={(_, d) => updateField(cond._key, d.value)}
                      aria-label={`Condition ${index + 1} field`}
                    >
                      <option value="">— select a field —</option>
                      {fieldIds.map(fid => (
                        <option key={fid} value={fid}>
                          {allFieldLabels.get(fid) ?? fid}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                {/* Operator dropdown */}
                <div className={styles.condOp}>
                  <Field label={index === 0 ? 'Operator' : undefined}>
                    <Select
                      value={cond.operator}
                      onChange={(_, d) => updateOperator(cond._key, d.value as ConditionOperator)}
                      aria-label={`Condition ${index + 1} operator`}
                    >
                      {CONDITION_OPERATOR_OPTIONS.map(op => (
                        <option key={op.value} value={op.value}>{op.label}</option>
                      ))}
                    </Select>
                  </Field>
                </div>

                {/* Value input — hidden for isEmpty / isNotEmpty */}
                {showValue && (
                  <div className={styles.condVal}>
                    <Field label={index === 0 ? 'Value' : undefined}>
                      <Input
                        value={String(cond.value ?? '')}
                        onChange={(_, d) => updateValue(cond._key, d.value)}
                        placeholder="comparison value"
                        aria-label={`Condition ${index + 1} value`}
                      />
                    </Field>
                  </div>
                )}

                <Button
                  icon={<DeleteRegular />}
                  appearance="subtle"
                  size="small"
                  aria-label={`Remove condition ${index + 1}`}
                  onClick={() => removeRow(cond._key)}
                  style={{ alignSelf: index === 0 ? 'flex-end' : 'center', marginBottom: index === 0 ? '2px' : undefined }}
                />
              </div>
            );
          })}

          {/* Validation error */}
          {validationError && (
            <MessageBar intent="error">{validationError}</MessageBar>
          )}

          {/* Plain-language summary of saved state */}
          <Text className={styles.summary} title={summaryText}>
            {summaryText}
          </Text>

          {/* Actions */}
          <div className={styles.condActions}>
            <Button
              appearance="subtle"
              size="small"
              icon={<AddRegular />}
              onClick={addRow}
              disabled={isBusy || isSaving}
            >
              Add condition
            </Button>
            <Button
              appearance="primary"
              size="small"
              onClick={() => void handleSave()}
              disabled={isBusy || isSaving}
            >
              {isSaving ? 'Saving…' : 'Save conditions'}
            </Button>
          </div>
        </div>
      </AccordionPanel>
    </AccordionItem>
  );
}

// ── Panel props ────────────────────────────────────────────────────────────────

interface ScopedButtonsPanelProps {
  scope: ButtonPlacementScope;
  placementId: string;
}

// ── ScopedButtonsPanel ─────────────────────────────────────────────────────────

export function ScopedButtonsPanel({ scope, placementId }: ScopedButtonsPanelProps): React.ReactElement {
  const styles = useStyles();
  const crmContext = useContext(CrmContext);
  const formDefinitionId = useDesignerStore(state => state.form?.id ?? '');

  // All form fields — hidden and read-only included per CEO OQ-002.
  const allFields = useDesignerStore(state => state.fields);
  // DFE-CBTN-001: a condition's fieldId must be the field's SCHEMA NAME (field.code),
  // not its CRM GUID (field.id) — the runtime RuleEngine evaluates conditions against
  // fieldValues keyed by schema name. Keying by GUID here would make no condition fire.
  const allFieldLabels = React.useMemo((): Map<string, string> => {
    const map = new Map<string, string>();
    for (const field of Object.values(allFields)) {
      if (!field.code) continue;
      map.set(field.code, field.label || field.code);
    }
    return map;
  }, [allFields]);

  const [service] = useState(() => (crmContext ? new ScopedButtonDesignService(crmContext.getWebApi()) : null));
  const [buttons, setButtons] = useState<ScopedButtonRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const load = useCallback(async () => {
    if (!service) return;
    setIsLoading(true);
    setError(null);
    try {
      setButtons(await service.listByPlacement(scope, placementId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load buttons');
    } finally {
      setIsLoading(false);
    }
  }, [service, scope, placementId]);

  useEffect(() => { void load(); }, [load]);

  const addButton = useCallback(async () => {
    if (!service) return;
    setIsBusy(true);
    setError(null);
    try {
      const nextOrder = buttons.reduce((max, b) => Math.max(max, b.displayOrder), -1) + 1;
      await service.create({
        formDefinitionId,
        placementScope: scope,
        placementId,
        label: 'New button',
        displayOrder: nextOrder,
        isPrimary: false,
        isVisible: true,
        actionType: 'navigate',
        actionConfigJson: '{"target":"nextStep"}',
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add button');
    } finally {
      setIsBusy(false);
    }
  }, [service, buttons, formDefinitionId, scope, placementId, load]);

  const patch = useCallback(
    async (id: string, change: Parameters<ScopedButtonDesignService['update']>[1]) => {
      if (!service) return;
      setError(null);
      try {
        await service.update(id, change);
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update button');
      }
    },
    [service, load],
  );

  const removeButton = useCallback(
    async (id: string) => {
      if (!service) return;
      setError(null);
      try {
        await service.remove(id);
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete button');
      }
    },
    [service, load],
  );

  if (isLoading) return <Spinner size="tiny" label="Loading buttons…" />;

  return (
    <div className={styles.panel}>
      {error && <MessageBar intent="error">{error}</MessageBar>}

      {buttons.length === 0 && (
        <Text className={styles.empty}>No buttons on this {scope} yet.</Text>
      )}

      {buttons.map(button => {
        const typeKey = typeKeyOf(button);
        return (
          <div key={button.id} className={styles.row}>
            {/* Label + delete */}
            <div className={styles.rowTop}>
              <Input
                className={styles.grow}
                value={button.label}
                onChange={(_, data) =>
                  setButtons(prev => prev.map(b => (b.id === button.id ? { ...b, label: data.value } : b)))
                }
                onBlur={() => void patch(button.id, { label: button.label })}
                aria-label="Button label"
              />
              <Button
                icon={<Delete16Regular />}
                appearance="subtle"
                onClick={() => void removeButton(button.id)}
                aria-label="Delete button"
              />
            </div>

            {/* Action type */}
            <Select
              value={typeKey}
              onChange={(_, data) => {
                const t = BUTTON_TYPES.find(x => x.key === data.value);
                if (t) void patch(button.id, { actionType: t.actionType, actionConfigJson: t.config });
              }}
              aria-label="Button type"
            >
              {BUTTON_TYPES.map(t => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </Select>

            {/* Static flags */}
            <div className={styles.rowToggles}>
              <Switch
                label="Primary"
                checked={button.isPrimary}
                onChange={(_, data) => void patch(button.id, { isPrimary: data.checked })}
              />
              <Switch
                label="Visible"
                checked={button.isVisible}
                onChange={(_, data) => void patch(button.id, { isVisible: data.checked })}
              />
            </div>

            {/* DFE-CBTN-001: conditional visibility + enablement builders */}
            <Accordion collapsible multiple>
              <ButtonConditionBuilder
                title="Show this button when…"
                savedSet={button.visibleWhen ?? null}
                allFieldLabels={allFieldLabels}
                onSave={set => patch(button.id, { visibleWhen: set })}
                isBusy={isBusy}
              />
              <ButtonConditionBuilder
                title="Enable this button when…"
                savedSet={button.enabledWhen ?? null}
                allFieldLabels={allFieldLabels}
                onSave={set => patch(button.id, { enabledWhen: set })}
                isBusy={isBusy}
              />
            </Accordion>
          </div>
        );
      })}

      <Button
        icon={<Add16Regular />}
        appearance="secondary"
        disabled={isBusy || !service}
        onClick={() => void addButton()}
      >
        Add button
      </Button>
    </div>
  );
}
