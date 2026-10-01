// DFE-APIVAL-CAM-001: a maker chooses whether a file field opens the phone camera.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import type { DesignerFieldModel } from '@/state/models/DesignerFormModel';

const mockUpdateField = vi.fn();
const mockState = { updateField: mockUpdateField };

vi.mock('@/state/designerStore', () => ({
  useDesignerStore: vi.fn((selector: (state: typeof mockState) => unknown) => selector(mockState)),
}));

import { FileUploadFieldPanel } from '@/designer/properties/panels/FileUploadFieldPanel';

function renderPanel(fileCaptureMode: DesignerFieldModel['fileCaptureMode'] = null) {
  const field = { id: 'f1', fieldType: 'file', fileCaptureMode } as unknown as DesignerFieldModel;
  render(
    <FluentProvider theme={webLightTheme}>
      <FileUploadFieldPanel field={field} />
    </FluentProvider>,
  );
}

describe('FileUploadFieldPanel capture mode', () => {
  beforeEach(() => mockUpdateField.mockReset());

  it('FileUploadFieldPanel_NoSavedMode_ShowsAny', () => {
    renderPanel();

    expect(screen.getByLabelText('File Capture Mode')).toHaveValue('any');
  });

  it('FileUploadFieldPanel_ChooseCameraOnly_SavesCamera', () => {
    renderPanel();

    fireEvent.change(screen.getByLabelText('File Capture Mode'), { target: { value: 'camera' } });

    expect(mockUpdateField).toHaveBeenCalledWith('f1', { fileCaptureMode: 'camera' });
  });

  it('FileUploadFieldPanel_CameraOnly_WarnsThatImagesMustBeAllowed', () => {
    renderPanel('camera');

    expect(screen.getByText(/must allow at least one image type/)).toBeInTheDocument();
  });
});
