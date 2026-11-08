import { describe, it, expect } from 'vitest';
import { resolveFileCapture } from './fileCapture';

describe('resolveFileCapture', () => {
  it('resolveFileCapture_AnyMode_KeepsTheFieldTypesAndNoCamera', () => {
    expect(resolveFileCapture(undefined, ['application/pdf'])).toEqual({ acceptedMimeTypes: ['application/pdf'], capture: undefined });
  });

  it('resolveFileCapture_CameraMode_KeepsOnlyImageTypesAndAsksForTheRearCamera', () => {
    expect(resolveFileCapture('camera', ['application/pdf', 'image/jpeg', 'image/png']))
      .toEqual({ acceptedMimeTypes: ['image/jpeg', 'image/png'], capture: 'environment' });
  });

  it('resolveFileCapture_CameraModeWithNoTypeLimit_AcceptsAnyImage', () => {
    expect(resolveFileCapture('camera', [])).toEqual({ acceptedMimeTypes: ['image/*'], capture: 'environment' });
  });

  it('resolveFileCapture_CameraModeButNoImageTypeAllowed_KeepsTheFieldTypesAndNoCamera', () => {
    expect(resolveFileCapture('camera', ['application/pdf'])).toEqual({ acceptedMimeTypes: ['application/pdf'], capture: undefined });
  });
});
