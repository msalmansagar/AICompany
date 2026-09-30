import type { FieldDefinition, FormDefinition, GridColumnConfig, GridColumnRuleState } from '@qdb/shared';

/**
 * The grid's columns as rules have left them: the published configuration with each rule's
 * visibility, required and readonly state laid over it.
 *
 * The Entry Grid draws from this and grid validation checks against it, so what a user sees
 * and what blocks their submit cannot disagree. A column a rule hides is also made optional:
 * a required cell the user cannot see would block the form with no way to fix it.
 */
export function applyGridColumnRuleState(
  columns: GridColumnConfig[],
  state: Record<string, GridColumnRuleState> | undefined,
): GridColumnConfig[] {
  if (!state || Object.keys(state).length === 0) return columns;
  return columns.map((column) => applyColumnState(column, state[column.columnId]));
}

function applyColumnState(column: GridColumnConfig, state: GridColumnRuleState | undefined): GridColumnConfig {
  if (!state) return column;
  const merged = { ...column, ...definedFlags(state) };
  return state.isVisible === false ? { ...merged, isRequired: false } : merged;
}

function definedFlags(state: GridColumnRuleState): GridColumnRuleState {
  return Object.fromEntries(
    Object.entries(state).filter(([, value]) => value !== undefined),
  ) as GridColumnRuleState;
}

/**
 * The form with every entry grid's columns as rules have left them, for validation. Grids no
 * rule touches keep their field object, so an untouched form validates exactly as before.
 */
export function applyGridColumnRuleStateToForm(
  formDefinition: FormDefinition,
  gridColumnState: Record<string, Record<string, GridColumnRuleState>>,
): FormDefinition {
  if (Object.keys(gridColumnState).length === 0) return formDefinition;
  const applyToField = (field: FieldDefinition): FieldDefinition => {
    const state = gridColumnState[field.id];
    if (!state || !field.gridConfig) return field;
    const columnConfigs = applyGridColumnRuleState(field.gridConfig.columnConfigs ?? [], state);
    return { ...field, gridConfig: { ...field.gridConfig, columnConfigs } };
  };
  return {
    ...formDefinition,
    tabs: formDefinition.tabs.map((tab) => ({
      ...tab,
      headerFields: tab.headerFields?.map(applyToField),
      footerFields: tab.footerFields?.map(applyToField),
      sections: tab.sections.map((section) => ({ ...section, fields: section.fields.map(applyToField) })),
    })),
  };
}
