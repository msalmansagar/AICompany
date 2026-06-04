import type { OptionValue } from '@qdb/shared';
import apiClient from './apiClient';

export const optionsApi = {
  getOptions: (fieldId: string, formCode: string) =>
    apiClient.get<OptionValue[]>(`/options/${fieldId}`, { params: { formCode } }),

  getFilteredOptions: (fieldId: string, formCode: string, parentValue: string) =>
    apiClient.get<OptionValue[]>(`/options/${fieldId}`, {
      params: { formCode, parentValue },
    }),
};
