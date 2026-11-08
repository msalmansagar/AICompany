import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { FileUploadControl } from './FileUploadControl';
import type { ControlProps } from '../FieldRenderer';
import type { FieldDefinition, FormFieldValues } from '@qdb/shared';

const mockFieldValues = vi.hoisted(() => ({ current: {} as FormFieldValues }));
const mockFilesApi = vi.hoisted(() => ({
  openFile: vi.fn(() => Promise.resolve()),
  downloadFile: vi.fn(() => Promise.resolve()),
  upload: vi.fn(),
  downloadTemplate: vi.fn(),
}));

vi.mock('../../../contexts/FormContext', () => ({
  useFormContext: vi.fn(() => ({ fieldValues: mockFieldValues.current, updateFieldValue: vi.fn() })),
}));

vi.mock('../../../api/filesApi', () => ({ filesApi: mockFilesApi }));

const DOCUMENT = {
  fileId: 'file-1',
  fileName: 'invoice.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 2048,
  url: '/api/files/file-1',
};

function makeFileField(overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return {
    id: 'field-1',
    sectionId: 'section-1',
    fieldType: 'file',
    schemaName: 'summary_docs',
    label: 'Uploaded documents',
    displayOrder: 1,
    columnSpan: 1,
    isRequired: false,
    isReadonly: true,
    isHidden: false,
    isVisible: true,
    validationRules: [],
    businessRules: [],
    ...overrides,
  } as unknown as FieldDefinition;
}

function renderReadonly(field: FieldDefinition, fieldValues: FormFieldValues) {
  mockFieldValues.current = fieldValues;
  const props: ControlProps = { field, inputId: 'docs', isRequired: false, isReadonly: true };
  return render(
    <FluentProvider theme={webLightTheme}>
      <FileUploadControl {...props} />
    </FluentProvider>,
  );
}

describe('read-only document display', () => {
  beforeEach(() => {
    mockFilesApi.openFile.mockClear();
    mockFilesApi.downloadFile.mockClear();
  });

  it('listsDocuments_withoutAnyUploadAffordance', () => {
    renderReadonly(makeFileField(), { summary_docs: [DOCUMENT] });

    expect(screen.getByText('invoice.pdf')).toBeInTheDocument();
    expect(screen.queryByText(/drag and drop files here/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add document/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });

  it('offersViewAndDownload_perDocument', () => {
    renderReadonly(makeFileField(), { summary_docs: [DOCUMENT] });

    expect(screen.getByRole('button', { name: /view invoice\.pdf/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download invoice\.pdf/i })).toBeInTheDocument();
  });

  it('opensTheDocument_whenViewClicked', async () => {
    const user = userEvent.setup();
    renderReadonly(makeFileField(), { summary_docs: [DOCUMENT] });

    await user.click(screen.getByRole('button', { name: /view invoice\.pdf/i }));

    expect(mockFilesApi.openFile).toHaveBeenCalledWith(DOCUMENT);
  });

  it('downloadsTheDocument_whenDownloadClicked', async () => {
    const user = userEvent.setup();
    renderReadonly(makeFileField(), { summary_docs: [DOCUMENT] });

    await user.click(screen.getByRole('button', { name: /download invoice\.pdf/i }));

    expect(mockFilesApi.downloadFile).toHaveBeenCalledWith(DOCUMENT);
  });

  it('readsAnotherFieldsDocuments_whenBoundBySourceFieldSchemaName', () => {
    // A summary page shows the upload field from an earlier tab without reusing its schema name.
    const field = makeFileField({ schemaName: 'summary_view', sourceFieldSchemaName: 'upload_docs' });

    renderReadonly(field, { upload_docs: [DOCUMENT], summary_view: null });

    expect(screen.getByText('invoice.pdf')).toBeInTheDocument();
  });

  describe('action toggles', () => {
    it('hidesView_whenShowDocumentViewIsFalse', () => {
      renderReadonly(makeFileField({ showDocumentView: false }), { summary_docs: [DOCUMENT] });

      expect(screen.queryByRole('button', { name: /view invoice\.pdf/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /download invoice\.pdf/i })).toBeInTheDocument();
    });

    it('hidesDownload_whenShowDocumentDownloadIsFalse', () => {
      renderReadonly(makeFileField({ showDocumentDownload: false }), { summary_docs: [DOCUMENT] });

      expect(screen.getByRole('button', { name: /view invoice\.pdf/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /download invoice\.pdf/i })).not.toBeInTheDocument();
    });

    it('stillListsTheDocument_whenBothActionsAreOff', () => {
      renderReadonly(
        makeFileField({ showDocumentView: false, showDocumentDownload: false }),
        { summary_docs: [DOCUMENT] },
      );

      expect(screen.getByText('invoice.pdf')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /view invoice\.pdf/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /download invoice\.pdf/i })).not.toBeInTheDocument();
    });

    it('offersBoth_whenTheTogglesAreUnset', () => {
      // Fields created before the toggles existed carry neither value.
      renderReadonly(makeFileField(), { summary_docs: [DOCUMENT] });

      expect(screen.getByRole('button', { name: /view invoice\.pdf/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /download invoice\.pdf/i })).toBeInTheDocument();
    });
  });

  it('showsEmptyState_whenNothingUploaded', () => {
    renderReadonly(makeFileField(), { summary_docs: [] });

    expect(screen.getByText(/no documents uploaded/i)).toBeInTheDocument();
  });

  it('surfacesAnError_whenOpeningFails', async () => {
    const user = userEvent.setup();
    mockFilesApi.openFile.mockRejectedValueOnce(new Error('boom'));
    renderReadonly(makeFileField(), { summary_docs: [DOCUMENT] });

    await user.click(screen.getByRole('button', { name: /view invoice\.pdf/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not open/i);
  });
});
