// DFE-RULES-002 item 1: a grid-column rule targets a grid by code and a column by id.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { GridColumnTargetPicker, type GridColumnTarget } from '@/screens/rules/GridColumnTargetPicker';
import type { RuleAction } from '@/types/businessRule';

const GRIDS: GridColumnTarget[] = [
  { gridCode: 'items', gridLabel: 'Line items', columns: [{ id: 'col-hs', label: 'HS code' }, { id: 'col-qty', label: 'Quantity' }] },
  { gridCode: 'docs', gridLabel: 'Documents', columns: [{ id: 'col-type', label: 'Type' }] },
];

function renderPicker(action: RuleAction) {
  const onChange = vi.fn();
  render(
    <FluentProvider theme={webLightTheme}>
      <GridColumnTargetPicker action={action} grids={GRIDS} onChange={onChange} />
    </FluentProvider>,
  );
  return onChange;
}

describe('GridColumnTargetPicker', () => {
  it('offersOnlyTheSelectedGridsColumns', () => {
    renderPicker({ action_type: 'hide_column', target_field_code: 'items' });

    const columnOptions = Array.from(screen.getByLabelText('Target Column').querySelectorAll('option')).map(o => o.textContent);
    expect(columnOptions).toEqual(['Select a column…', 'HS code', 'Quantity']);
  });

  it('clearsTheColumn_whenTheGridChanges', () => {
    const onChange = renderPicker({ action_type: 'hide_column', target_field_code: 'items', target_column_id: 'col-hs' });

    fireEvent.change(screen.getByLabelText('Target Grid'), { target: { value: 'docs' } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ target_field_code: 'docs', target_column_id: undefined }));
  });

  it('storesTheColumnId', () => {
    const onChange = renderPicker({ action_type: 'hide_column', target_field_code: 'items' });

    fireEvent.change(screen.getByLabelText('Target Column'), { target: { value: 'col-qty' } });

    expect(onChange).toHaveBeenCalledWith({ target_column_id: 'col-qty' });
  });

  it('disablesTheColumnPicker_untilAGridIsChosen', () => {
    renderPicker({ action_type: 'hide_column' });

    expect(screen.getByLabelText('Target Column')).toBeDisabled();
  });
});
