import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import type { FieldDefinition, GridFieldConfig } from '@qdb/shared';

const mockUpdateFieldValue = vi.fn();
let mockFieldValues: Record<string, unknown> = { entryGrid: [] };

vi.mock('../../../contexts/FormContext', () => ({
  useFormContext: () => ({ fieldValues: mockFieldValues, updateFieldValue: mockUpdateFieldValue }),
}));

const mockUpload = vi.fn();
vi.mock('../../../api/filesApi', () => ({
  filesApi: { upload: (...args: unknown[]) => mockUpload(...args) },
}));

// eslint-disable-next-line import/first
import { EntryGridField } from './EntryGridField';

const FILE_REF = {
  fileId: 'f1',
  fileName: 'contract.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 100,
  url: '/files/f1',
};

function fileGridField(): FieldDefinition {
  return {
    id: 'g1',
    sectionId: 's1',
    fieldType: 'interactive-grid',
    schemaName: 'entryGrid',
    label: 'Docs',
    displayOrder: 1,
    columnSpan: 4,
    isRequired: false,
    isReadonly: false,
    isHidden: false,
    isVisible: true,
    validationRules: [],
    businessRules: [],
    gridConfig: {
      gridMode: 'entry',
      targetEntity: 'qdb_test',
      maxRows: 200,
      minRows: 0,
      columnConfigs: [
        {
          columnId: 'col-doc',
          displayOrder: 1,
          columnLabel: 'Document',
          targetAttribute: 'qdb_doc',
          columnFieldType: 'file',
        },
      ],
    } as GridFieldConfig,
  } as unknown as FieldDefinition;
}

function renderGrid(readonly = false) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <EntryGridField
        field={fileGridField()}
        inputId="g"
        isRequired={false}
        isReadonly={readonly}
        errorId={undefined}
        appearance="outline"
        isTabActive={false}
      />
    </FluentProvider>,
  );
}

describe('EntryGridField file/document column', () => {
  beforeEach(() => {
    mockFieldValues = { entryGrid: [{ qdb_doc: undefined }] };
    vi.clearAllMocks();
  });

  it('renders an Upload button for an empty file cell', () => {
    renderGrid();
    expect(screen.getByRole('button', { name: /upload/i })).toBeTruthy();
  });

  it('uploads the selected file and stores the reference in the cell', async () => {
    mockUpload.mockResolvedValue({ data: FILE_REF });
    const { container } = renderGrid();

    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    const file = new File(['x'], 'contract.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(mockUpload).toHaveBeenCalledWith('entryGrid', file));
    await waitFor(() =>
      expect(mockUpdateFieldValue).toHaveBeenCalledWith('entryGrid', [{ qdb_doc: FILE_REF }]),
    );
  });

  it('shows the filename and a remove action for an uploaded document', () => {
    mockFieldValues = { entryGrid: [{ qdb_doc: FILE_REF }] };
    renderGrid();
    expect(screen.getByText('contract.pdf')).toBeTruthy();
    expect(screen.getByRole('button', { name: /remove document/i })).toBeTruthy();
  });

  it('clears the cell when the document is removed', () => {
    mockFieldValues = { entryGrid: [{ qdb_doc: FILE_REF }] };
    renderGrid();
    fireEvent.click(screen.getByRole('button', { name: /remove document/i }));
    expect(mockUpdateFieldValue).toHaveBeenCalledWith('entryGrid', [{ qdb_doc: undefined }]);
  });

  it('read-only shows the filename without upload or remove controls', () => {
    mockFieldValues = { entryGrid: [{ qdb_doc: FILE_REF }] };
    renderGrid(true);
    expect(screen.getByText('contract.pdf')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /upload/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /remove document/i })).toBeNull();
  });
});
