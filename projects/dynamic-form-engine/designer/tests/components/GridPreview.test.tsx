// A grid field used to render on the canvas exactly like every other field — its label and a
// type badge — so a maker who had configured ten columns saw no sign of them until they
// opened the properties rail. The canvas now shows the shape of the grid itself.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { GridPreview, GRID_PREVIEW_COLUMN_LIMIT } from '@/designer/canvas/GridPreview';
import type { DesignerGridColumnConfig } from '@/state/models/DesignerFormModel';

function column(overrides: Partial<DesignerGridColumnConfig>): DesignerGridColumnConfig {
  return {
    id: `col-${overrides.columnLabel ?? 'x'}`,
    columnLabel: 'Column',
    targetAttribute: 'qdb_x',
    columnFieldType: 'text',
    displayOrder: 0,
    isVisible: true,
    isEditable: true,
    isRequired: false,
    maxLength: null,
    validationFormat: 'none',
    validationPattern: null,
    validationMessage: null,
    optionsJson: null,
    filterType: 'none',
    lookupTargetEntity: null,
    lookupDisplayAttribute: null,
    lookupValueAttribute: null,
    ...overrides,
  };
}

function renderPreview(columns: DesignerGridColumnConfig[]) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <GridPreview columns={columns} />
    </FluentProvider>,
  );
}

describe('GridPreview', () => {
  it('rendersAHeaderCell_perColumn', () => {
    renderPreview([column({ columnLabel: 'Item' }), column({ columnLabel: 'Quantity' })]);

    expect(screen.getByText('Item')).toBeTruthy();
    expect(screen.getByText('Quantity')).toBeTruthy();
  });

  it('keepsTheConfiguredColumnOrder', () => {
    const { container } = renderPreview([
      column({ columnLabel: 'Second', displayOrder: 2 }),
      column({ columnLabel: 'First', displayOrder: 1 }),
    ]);

    const headers = [...container.querySelectorAll('th')].map(h => h.textContent);
    expect(headers[0]).toContain('First');
  });

  // Point 5 of the batch: a hidden column is still saved and still published. It has to stay
  // visible to the MAKER on the canvas, or hiding one looks like deleting it.
  it('stillShowsAHiddenColumn_markedAsHidden', () => {
    const { container } = renderPreview([column({ columnLabel: 'Internal', isVisible: false })]);

    const header = container.querySelector('th[data-hidden="true"]');
    expect(header?.textContent).toContain('Internal');
  });

  it('marksARequiredColumn', () => {
    const { container } = renderPreview([column({ columnLabel: 'Item', isRequired: true })]);

    expect(container.querySelector('th')?.textContent).toContain('*');
  });

  // A wide grid must not stretch the field slot or introduce a scroll container inside the
  // drag handle, so the preview truncates instead.
  it('capsTheColumnsShown_andSaysHowManyAreLeft', () => {
    const many = Array.from({ length: GRID_PREVIEW_COLUMN_LIMIT + 3 }, (_, i) =>
      column({ columnLabel: `C${i}`, displayOrder: i }));

    const { container } = renderPreview(many);

    expect(container.querySelectorAll('th').length).toBe(GRID_PREVIEW_COLUMN_LIMIT);
    expect(screen.getByText('+3 more')).toBeTruthy();
  });

  it('showsNoOverflowNote_whenEveryColumnFits', () => {
    renderPreview([column({ columnLabel: 'Only' })]);

    expect(screen.queryByText(/more$/)).toBeNull();
  });

  // A grid with no columns yet has nothing to draw; the caller falls back to the plain slot.
  it('rendersNothing_whenThereAreNoColumns', () => {
    const { container } = renderPreview([]);

    expect(container.querySelector('table')).toBeNull();
  });
});
