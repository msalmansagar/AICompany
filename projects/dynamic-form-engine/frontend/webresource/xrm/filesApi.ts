// Xrm-backed replacement for src/api/filesApi.ts. File-field uploads are stored as CRM
// annotations (Notes) carrying the file body; the returned fileId is the annotation id,
// which the submit mapping writes onto the target record.
import { webApi } from './xrmClient';

export interface UploadProgressCallback {
  (progressPercent: number): void;
}

export interface UploadedFileReference {
  fileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  previewUrl?: string;
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.substring(result.indexOf(',') + 1)); // strip the "data:...;base64," prefix
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export const filesApi = {
  upload: async (
    _fieldId: string,
    file: File,
    onProgress?: UploadProgressCallback,
  ): Promise<{ data: UploadedFileReference }> => {
    const documentbody = await readAsBase64(file);
    onProgress?.(60);
    const note = await webApi().createRecord('annotation', {
      subject: file.name,
      filename: file.name,
      mimetype: file.type || 'application/octet-stream',
      documentbody,
      isdocument: true,
    });
    onProgress?.(100);
    return {
      data: {
        fileId: note.id,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        url: '',
      },
    };
  },

  deleteFile: async (fileId: string): Promise<{ data: undefined }> => {
    await webApi().deleteRecord('annotation', fileId);
    return { data: undefined };
  },

  downloadTemplate: async (_downloadDocumentSetting: string): Promise<void> => {
    throw new Error('Template download is not available in the in-CRM form engine.');
  },
};
