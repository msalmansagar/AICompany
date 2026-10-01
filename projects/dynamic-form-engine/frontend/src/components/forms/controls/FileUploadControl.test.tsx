import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { FileUploadControl } from './FileUploadControl';
import type { ControlProps } from '../FieldRenderer';
import type { FieldDefinition, FormFieldValues } from '@qdb/shared';

const mockFieldValues = vi.hoisted(() => ({ current: {} as FormFieldValues }));

vi.mock('../../../contexts/FormContext', () => ({
  useFormContext: vi.fn(() => ({ fieldValues: mockFieldValues.current, updateFieldValue: vi.fn() })),
}));

vi.mock('../../../api/filesApi', () => ({
  filesApi: { upload: vi.fn(), downloadTemplate: vi.fn() },
}));

function makeUploadField(maxFiles: number): FieldDefinition {
  return {
    id: 'field-1',
    sectionId: 'section-1',
    fieldType: 'file',
    schemaName: 'supporting_document',
    label: 'Supporting Document',
    displayOrder: 1,
    columnSpan: 1,
    isRequired: false,
    isReadonly: false,
    isHidden: false,
    isVisible: true,
    validationRules: [],
    businessRules: [],
    fileUploadConfig: {
      id: 'upload-config-1',
      fieldId: 'field-1',
      allowedMimeTypes: ['application/pdf'],
      destination: 'crmNotes',
      maxFiles,
      maxFileSizeBytes: 1024 * 1024,
    },
  };
}

function renderUpload(maxFiles: number) {
  mockFieldValues.current = {};
  const props: ControlProps = {
    field: makeUploadField(maxFiles),
    inputId: 'upload-zone',
    isRequired: false,
    isReadonly: false,
  };
  return render(
    <FluentProvider theme={webLightTheme}>
      <FileUploadControl {...props} />
    </FluentProvider>,
  );
}

const DROPZONE_TEXT = /drag and drop files here/i;

function renderCameraUpload(allowedMimeTypes: string[]) {
  mockFieldValues.current = {};
  const field = makeUploadField(1);
  const props: ControlProps = {
    field: { ...field, fileUploadConfig: { ...field.fileUploadConfig!, allowedMimeTypes, captureMode: 'camera' } },
    inputId: 'upload-zone',
    isRequired: false,
    isReadonly: false,
  };
  return render(
    <FluentProvider theme={webLightTheme}>
      <FileUploadControl {...props} />
    </FluentProvider>,
  );
}

describe('FileUploadControl camera mode (DFE-APIVAL-CAM-001)', () => {
  it('FileUploadControl_CameraMode_AsksForTheRearCameraAndImagesOnly', () => {
    renderCameraUpload(['application/pdf', 'image/jpeg']);

    const input = screen.getByLabelText('Take a photo for Supporting Document');
    expect(input).toHaveAttribute('capture', 'environment');
    expect(input).toHaveAttribute('accept', 'image/jpeg');
  });

  it('FileUploadControl_CameraMode_SaysTapToTakeAPhoto', () => {
    renderCameraUpload(['image/jpeg']);

    expect(screen.getByText('Tap to take a photo')).toBeInTheDocument();
  });

  it('FileUploadControl_AnyMode_HasNoCaptureAttribute', () => {
    renderUpload(1);

    expect(screen.getByLabelText('Upload files for Supporting Document')).not.toHaveAttribute('capture');
  });
});

describe('FileUploadControl', () => {
  it('showsDropzoneImmediately_whenSingleDocumentField', () => {
    renderUpload(1);

    expect(screen.getByText(DROPZONE_TEXT)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add document/i })).not.toBeInTheDocument();
  });

  it('hidesDropzoneBehindCommandButton_whenMultiDocumentField', () => {
    renderUpload(5);

    expect(screen.queryByText(DROPZONE_TEXT)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add document/i })).toBeInTheDocument();
  });

  it('revealsDropzone_whenAddDocumentClicked', async () => {
    const user = userEvent.setup();
    renderUpload(5);

    await user.click(screen.getByRole('button', { name: /add document/i }));

    expect(screen.getByText(DROPZONE_TEXT)).toBeInTheDocument();
  });

  it('marksButtonExpanded_whenDropzoneRevealed', async () => {
    const user = userEvent.setup();
    renderUpload(5);

    await user.click(screen.getByRole('button', { name: /add document/i }));

    expect(screen.getByRole('button', { name: /cancel/i })).toHaveAttribute('aria-expanded', 'true');
  });

  it('collapsesDropzone_whenCancelClicked', async () => {
    const user = userEvent.setup();
    renderUpload(5);

    await user.click(screen.getByRole('button', { name: /add document/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.queryByText(DROPZONE_TEXT)).not.toBeInTheDocument();
  });
});
