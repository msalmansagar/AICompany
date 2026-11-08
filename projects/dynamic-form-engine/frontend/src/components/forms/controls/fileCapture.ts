import type { FileCaptureMode } from '@qdb/shared';

/** How the upload input should ask for files (DFE-APIVAL-CAM-001). */
export interface FileCaptureSettings {
  /** MIME types the input accepts; undefined accepts anything. */
  acceptedMimeTypes: string[] | undefined;
  /** "environment" asks a phone for the rear camera; desktop browsers ignore it. */
  capture: 'environment' | undefined;
}

/**
 * Camera mode narrows the accepted types to images and asks for the rear camera. A field that
 * allows no image type at all cannot take a photo, so it keeps its own types and no camera:
 * the designer warns about that configuration rather than the runtime silently refusing files.
 */
export function resolveFileCapture(
  captureMode: FileCaptureMode | undefined,
  allowedMimeTypes: string[] | undefined,
): FileCaptureSettings {
  if (captureMode !== 'camera') return { acceptedMimeTypes: allowedMimeTypes, capture: undefined };
  if (!allowedMimeTypes || allowedMimeTypes.length === 0) {
    return { acceptedMimeTypes: ['image/*'], capture: 'environment' };
  }
  const imageTypes = allowedMimeTypes.filter((mimeType) => mimeType.startsWith('image/'));
  if (imageTypes.length === 0) return { acceptedMimeTypes: allowedMimeTypes, capture: undefined };
  return { acceptedMimeTypes: imageTypes, capture: 'environment' };
}
