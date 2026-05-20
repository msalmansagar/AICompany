import type { FormDefinition, FormSummary, DraftSubmission, FormFieldValues, FormVersion } from '@dfe/shared';
import apiClient from './apiClient';

export const formApi = {
  list: () =>
    apiClient.get<FormSummary[]>('/forms'),

  getMetadata: (formCode: string) =>
    apiClient.get<FormDefinition>(`/forms/${formCode}/metadata`),

  getData: (formCode: string, recordId: string) =>
    apiClient.get<FormFieldValues>(`/forms/${formCode}/data/${recordId}`),

  saveDraft: (formCode: string, draft: DraftSubmission) =>
    apiClient.post<DraftSubmission>(`/forms/${formCode}/draft`, draft),

  submit: (formCode: string, data: FormFieldValues) =>
    apiClient.post<{ referenceNumber: string }>(`/forms/${formCode}/submit`, data),

  validate: (formCode: string, data: FormFieldValues) =>
    apiClient.post<Record<string, string[]>>(`/forms/${formCode}/validate`, data),

  getVersions: (formCode: string) =>
    apiClient.get<FormVersion[]>(`/forms/${formCode}/versions`),
};
