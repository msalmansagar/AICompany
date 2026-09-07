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

/** How long an object URL handed to a new tab stays alive before it is released. */
const OBJECT_URL_LIFETIME_MS = 60_000;

function triggerDownload(objectUrl: string, fileName: string): void {
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType || 'application/octet-stream' });
}

// Reads the note that holds the document. The annotation id travels on the reference as
// fileId — url is empty in CRM because nothing streams the file over HTTP here.
async function fetchAnnotationBlob(
  fileRef: UploadedFileReference,
): Promise<{ blob: Blob; fileName: string }> {
  const note = await webApi().retrieveRecord(
    'annotation', fileRef.fileId, '?$select=documentbody,mimetype,filename',
  );

  const documentBody = note.documentbody as string | undefined;
  if (!documentBody) throw new Error(`Document '${fileRef.fileName}' has no content in CRM.`);

  const mimeType = (note.mimetype as string | undefined) ?? fileRef.mimeType;
  const fileName = (note.filename as string | undefined) ?? fileRef.fileName ?? 'download';

  return { blob: base64ToBlob(documentBody, mimeType), fileName };
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

  // The portal streams documents from an authenticated API; in CRM they are annotation
  // bodies, so both actions read the note and rebuild the file client-side. The reference's
  // url is empty here — the annotation id is the only handle.
  downloadFile: async (fileRef: UploadedFileReference): Promise<void> => {
    const { blob, fileName } = await fetchAnnotationBlob(fileRef);

    const url = URL.createObjectURL(blob);
    triggerDownload(url, fileName);
    URL.revokeObjectURL(url);
  },

  openFile: async (fileRef: UploadedFileReference): Promise<void> => {
    // Claim the tab synchronously, before reading the note: a window.open that lands after
    // an await has lost the user gesture and gets caught by the popup blocker.
    const documentWindow = window.open('', '_blank');
    if (documentWindow) documentWindow.opener = null;

    const { blob, fileName } = await fetchAnnotationBlob(fileRef);
    const url = URL.createObjectURL(blob);

    if (documentWindow) {
      documentWindow.location.href = url;
    } else {
      // Popup blocked — saving the file still gets the user to the document.
      triggerDownload(url, fileName);
    }
    // The new tab needs the URL to outlive this call; release it once it has loaded.
    window.setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_LIFETIME_MS);
  },

  downloadTemplate: async (_downloadDocumentSetting: string): Promise<void> => {
    throw new Error('Template download is not available in the in-CRM form engine.');
  },
};
