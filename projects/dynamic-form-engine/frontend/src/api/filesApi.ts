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

  // DFE-SUMMARY-DL — download a previously uploaded document by its stored URL
  // (e.g. '/api/files/<annotationId>'). Streams via the authenticated API and triggers
  // a browser download without leaving the page.
  downloadFile: async (fileUrl: string, fallbackName = 'download'): Promise<void> => {
    const token = await acquireBearerToken();
    const response = await axios.get<Blob>(fileUrl, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: 'blob',
    });

    const disposition = response.headers['content-disposition'] as string | undefined;
    let fileName = fallbackName;
    if (disposition) {
      const match = /filename="([^"]+)"/.exec(disposition);
      if (match?.[1]) fileName = match[1];
    }

    const url = URL.createObjectURL(response.data);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  },
};
