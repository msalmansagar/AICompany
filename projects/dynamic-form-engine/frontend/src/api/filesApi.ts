import apiClient from './apiClient';

export interface UploadProgressCallback {
  (progressPercent: number): void;
}

export interface UploadedFileReference {
  fileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
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
};
