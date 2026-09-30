import { describe, it, expect } from 'vitest';
import { applyGridColumnRuleState, applyGridColumnRuleStateToForm, findUnknownRuleColumns } from './gridColumnRuleState';
import type { FieldDefinition, FormDefinition, GridColumnConfig } from '@qdb/shared';

function column(columnId: string, overrides: Partial<GridColumnConfig> = {}): GridColumnConfig {
  return {
    columnId,
    displayOrder: 1,
    columnLabel: columnId,
    targetAttribute: columnId,
    columnFieldType: 'text',
    ...overrides,
  };
}

describe('applyGridColumnRuleState', () => {
  it('should_return_the_columns_unchanged_without_rule_state', () => {
    const columns = [column('a', { isRequired: true })];

    expect(applyGridColumnRuleState(columns, undefined)).toBe(columns);
  });

  it('should_hide_a_column_and_make_it_optional', () => {
    const [result] = applyGridColumnRuleState(
      [column('a', { isRequired: true })],
      { a: { isVisible: false } },
    );

    expect(result).toMatchObject({ isVisible: false, isRequired: false });
  });

  it('should_let_a_rule_require_a_visible_column', () => {
    const [result] = applyGridColumnRuleState([column('a')], { a: { isRequired: true } });

    expect(result!.isRequired).toBe(true);
  });

  it('should_let_a_rule_show_a_column_its_configuration_hides', () => {
    const [result] = applyGridColumnRuleState([column('a', { isVisible: false })], { a: { isVisible: true } });

    expect(result!.isVisible).toBe(true);
  });

  it('should_mark_a_column_readonly', () => {
    const [result] = applyGridColumnRuleState([column('a')], { a: { isReadonly: true } });

    expect(result!.isReadonly).toBe(true);
  });

  it('should_not_mutate_the_published_columns', () => {
    const original = column('a', { isRequired: true });

    applyGridColumnRuleState([original], { a: { isVisible: false } });

    expect(original.isRequired).toBe(true);
  });

  it('should_ignore_state_for_a_column_the_grid_does_not_have', () => {
    const columns = [column('a')];

    expect(applyGridColumnRuleState(columns, { missing: { isVisible: false } })).toEqual(columns);
  });
});

describe('findUnknownRuleColumns', () => {
  it('should_list_rule_targets_the_grid_does_not_have', () => {
    expect(findUnknownRuleColumns([column('a')], { a: { isVisible: false }, gone: { isVisible: false } })).toEqual(['gone']);
  });

  it('should_list_nothing_without_rule_state', () => {
    expect(findUnknownRuleColumns([column('a')], undefined)).toEqual([]);
  });
});

describe('applyGridColumnRuleStateToForm', () => {
  const grid = {
    id: 'grid-1', schemaName: 'items', fieldType: 'interactive-grid',
    gridConfig: { gridMode: 'entry', targetEntity: 'x', maxRows: 5, columnConfigs: [column('a', { isRequired: true })] },
  } as unknown as FieldDefinition;
  const form = { tabs: [{ id: 't', sections: [{ id: 's', fields: [grid] }] }] } as unknown as FormDefinition;

  it('should_return_the_same_form_when_no_rule_touched_a_grid', () => {
    expect(applyGridColumnRuleStateToForm(form, {})).toBe(form);
  });

  it('should_apply_the_rule_state_to_the_grid_it_names', () => {
    const result = applyGridColumnRuleStateToForm(form, { 'grid-1': { a: { isVisible: false } } });

    expect(result.tabs[0]!.sections[0]!.fields[0]!.gridConfig!.columnConfigs![0]).toMatchObject({ isVisible: false, isRequired: false });
  });
});

describe('applyGridColumnRuleStateToForm header and footer grids', () => {
  it('should_apply_the_rule_state_to_a_grid_in_a_tab_header', () => {
    const headerGrid = {
      id: 'grid-h', schemaName: 'h', fieldType: 'interactive-grid',
      gridConfig: { gridMode: 'entry', targetEntity: 'x', maxRows: 5, columnConfigs: [column('a')] },
    } as unknown as FieldDefinition;
    const form = { tabs: [{ id: 't', sections: [], headerFields: [headerGrid] }] } as unknown as FormDefinition;

    const result = applyGridColumnRuleStateToForm(form, { 'grid-h': { a: { isRequired: true } } });

    expect(result.tabs[0]!.headerFields![0]!.gridConfig!.columnConfigs![0]!.isRequired).toBe(true);
  });
});
