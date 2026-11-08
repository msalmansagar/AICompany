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

/**
 * Column ids a rule targets that the grid does not have. Such a rule changes nothing (FR-008);
 * the caller logs these so a maker can find a rule left pointing at a deleted column.
 */
export function findUnknownRuleColumns(
  columns: GridColumnConfig[],
  state: Record<string, GridColumnRuleState> | undefined,
): string[] {
  if (!state) return [];
  const knownIds = new Set(columns.map((column) => column.columnId));
  return Object.keys(state).filter((columnId) => !knownIds.has(columnId));
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
  return mapFormFields(formDefinition, (field) => {
    const state = gridColumnState[field.id];
    if (!state || !field.gridConfig) return field;
    const columnConfigs = applyGridColumnRuleState(field.gridConfig.columnConfigs ?? [], state);
    return { ...field, gridConfig: { ...field.gridConfig, columnConfigs } };
  });
}

/**
 * The form with every column of a read-only grid marked locked, for validation. The renderer
 * already disables every cell of such a grid; without this, a required column in it would
 * block submit with no way to fill it (DEF-003). A rule's verdict on the grid beats its
 * published setting, exactly as the section and tab renderers decide it.
 */
export function lockColumnsOfReadonlyGrids(
  formDefinition: FormDefinition,
  fieldReadonly: Record<string, boolean>,
): FormDefinition {
  return mapFormFields(formDefinition, (field) => {
    const isGridReadonly = fieldReadonly[field.id] ?? field.isReadonly;
    if (!isGridReadonly || !field.gridConfig) return field;
    const columnConfigs = (field.gridConfig.columnConfigs ?? []).map((column) => ({ ...column, isReadonly: true }));
    return { ...field, gridConfig: { ...field.gridConfig, columnConfigs } };
  });
}

function mapFormFields(
  formDefinition: FormDefinition,
  mapField: (field: FieldDefinition) => FieldDefinition,
): FormDefinition {
  return {
    ...formDefinition,
    tabs: formDefinition.tabs.map((tab) => ({
      ...tab,
      headerFields: tab.headerFields?.map(mapField),
      footerFields: tab.footerFields?.map(mapField),
      sections: tab.sections.map((section) => ({ ...section, fields: section.fields.map(mapField) })),
    })),
  };
}
