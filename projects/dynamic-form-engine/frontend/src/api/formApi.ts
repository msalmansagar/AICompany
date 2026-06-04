import type { FormDefinition, FormSummary, DraftSubmission, FormFieldValues, FormVersion } from '@qdb/shared';
import apiClient from './apiClient';

export const formApi = {
  list: (params?: { search?: string; status?: string }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.status) query.set('status', params.status);
    const qs = query.toString();
    return apiClient.get<FormSummary[]>(qs ? `/forms?${qs}` : '/forms');
  },

  clone: (formCode: string) =>
    apiClient.post<{ newFormId: string; newFormCode: string }>(`/forms/${formCode}/clone`, {}),

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
