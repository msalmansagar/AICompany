import axios from 'axios';
import apiClient from './apiClient';
import { acquireBearerToken } from '../auth/tokenService';

export interface UploadProgressCallback {
  (progressPercent: number): void;
}

export interface UploadedFileReference {
  fileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  // Blob URL created client-side for in-session preview (not persisted to server).
  previewUrl?: string;
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

// Streams a stored document through the authenticated API. Shared by download and open so
// both actions agree on the file name the server reports.
async function fetchDocument(
  fileRef: UploadedFileReference,
): Promise<{ blob: Blob; fileName: string }> {
  const token = await acquireBearerToken();
  const response = await axios.get<Blob>(fileRef.url, {
    headers: { Authorization: `Bearer ${token}` },
    responseType: 'blob',
  });

  const disposition = response.headers['content-disposition'] as string | undefined;
  const match = disposition ? /filename="([^"]+)"/.exec(disposition) : null;

  return { blob: response.data, fileName: match?.[1] ?? fileRef.fileName ?? 'download' };
}

export const filesApi = {
  upload: (
    fieldId: string,
    file: File,
    onProgress?: UploadProgressCallback,
  ) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fieldId', fieldId);

    return apiClient.post<UploadedFileReference>('/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      },
    });
  },

  deleteFile: (fileId: string) =>
    apiClient.delete(`/files/${fileId}`),

  // Downloads a document template from CRM and triggers a browser download.
  // Uses a raw axios call (responseType: 'blob') to bypass the ApiResponse envelope.
  downloadTemplate: async (downloadDocumentSetting: string): Promise<void> => {
    const token = await acquireBearerToken();
    const response = await axios.post<Blob>(
      '/api/files/document-template',
      { downloadDocumentSetting },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        responseType: 'blob',
      },
    );

    // Extract filename from Content-Disposition header if present
    const disposition = response.headers['content-disposition'] as string | undefined;
    let fileName = 'template.docx';
    if (disposition) {
      const match = /filename="([^"]+)"/.exec(disposition);
      if (match?.[1]) fileName = match[1];
    }

    // Trigger browser download without leaving the page
    const url = URL.createObjectURL(response.data);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  },

  // DFE-SUMMARY-DL — download a previously uploaded document. Takes the whole reference
  // rather than a URL so the in-CRM adapter, where documents are annotations and the URL
  // is empty, can resolve the same call from the file id.
  downloadFile: async (fileRef: UploadedFileReference): Promise<void> => {
    const { blob, fileName } = await fetchDocument(fileRef);

    const url = URL.createObjectURL(blob);
    triggerDownload(url, fileName);
    URL.revokeObjectURL(url);
  },

  // Opens the document in a new tab. The stored URL is an authenticated API endpoint, so
  // pointing the browser straight at it would 401 — the body is fetched with the bearer
  // token and handed over as an object URL instead.
  openFile: async (fileRef: UploadedFileReference): Promise<void> => {
    // Claim the tab synchronously, before the fetch: a window.open that lands after an
    // await has lost the user gesture and gets caught by the popup blocker.
    const documentWindow = window.open('', '_blank');
    if (documentWindow) documentWindow.opener = null;

    const { blob } = await fetchDocument(fileRef);
    const url = URL.createObjectURL(blob);

    if (documentWindow) {
      documentWindow.location.href = url;
    } else {
      // Popup blocked — saving the file still gets the user to the document.
      triggerDownload(url, fileRef.fileName ?? 'download');
    }
    // The new tab needs the URL to outlive this call; release it once it has loaded.
    window.setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_LIFETIME_MS);
  },
};
