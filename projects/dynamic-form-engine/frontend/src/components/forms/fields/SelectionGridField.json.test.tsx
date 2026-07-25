import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import type { FieldDefinition, GridFieldConfig } from '@qdb/shared';

vi.mock('../../../contexts/FormContext', () => ({
  useFormContext: () => ({ fieldValues: {}, updateFieldValue: vi.fn() }),
}));
vi.mock('../../../services/gridDataService', () => ({
  fetchGridPage: vi.fn(), // never called for a JSON source
}));

// eslint-disable-next-line import/first
import { SelectionGridField } from './SelectionGridField';

const JSON_DATA = JSON.stringify([
  { id: 'p1', name: 'Alice', role: 'Engineer' },
  { id: 'p2', name: 'Bob', role: 'Designer' },
]);

function jsonGridField(over: Partial<GridFieldConfig> = {}): FieldDefinition {
  return {
    id: 'g1',
    sectionId: 's1',
    fieldType: 'interactive-grid',
    schemaName: 'jsonGrid',
    label: 'Team',
    displayOrder: 1,
    columnSpan: 4,
    isRequired: false,
    isReadonly: false,
    isHidden: false,
    isVisible: true,
    validationRules: [],
    businessRules: [],
    gridConfig: {
      gridMode: 'selection',
      targetEntity: '',
      maxRows: 200,
      dataSource: 'json',
      jsonData: JSON_DATA,
      displayMode: 'infocard',
      selectable: false,
      cardIconName: 'PersonRegular',
      columnConfigs: [
        { columnId: 'c1', displayOrder: 1, columnLabel: 'Name', targetAttribute: 'name', columnFieldType: 'text' },
        { columnId: 'c2', displayOrder: 2, columnLabel: 'Role', targetAttribute: 'role', columnFieldType: 'text' },
      ],
      ...over,
    } as GridFieldConfig,
  } as unknown as FieldDefinition;
}

function renderGrid(field: FieldDefinition) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <SelectionGridField
        field={field}
        inputId="g"
        isRequired={false}
        isReadonly={false}
        errorId={undefined}
        appearance="outline"
        isTabActive
      />
    </FluentProvider>,
  );
}

describe('SelectionGridField JSON data source (DFE-GRIDSRC-001)', () => {
  it('renders rows from static JSON without fetching', () => {
    renderGrid(jsonGridField());
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getByText('Engineer')).toBeTruthy();
  });

  it('is read-only when selectable is false — no selection controls', () => {
    const { container } = renderGrid(jsonGridField({ selectable: false, selectionMode: 'multi' }));
    expect(container.querySelectorAll('input[type=checkbox]').length).toBe(0);
    expect(screen.queryByRole('option')).toBeNull();
  });

  it('defaults to the info-card display when displayMode is infocard', () => {
    renderGrid(jsonGridField({ displayMode: 'infocard' }));
    expect(screen.getByRole('list', { name: /card view/i })).toBeTruthy();
  });

  it('supports selectable JSON rows (renders options)', () => {
    renderGrid(jsonGridField({ selectable: true, displayMode: 'infocard' }));
    expect(screen.getAllByRole('option').length).toBe(2);
  });

  it('renders info cards as horizontal rows when cardLayout is row', () => {
    renderGrid(jsonGridField({ displayMode: 'infocard', cardLayout: 'row' }));
    // Row layout renders inline "Label:" prefixes (one per row).
    expect(screen.getAllByText('Role:').length).toBe(2);
    expect(screen.getByText('Alice')).toBeTruthy();
  });

  it('falls back to empty for invalid JSON without crashing', () => {
    renderGrid(jsonGridField({ jsonData: 'not json' }));
    expect(screen.getByText(/no records found/i)).toBeTruthy();
  });
});
