// Xrm-backed replacement for src/api/optionsApi.ts. Options are already embedded in the
// published form JSON, so they are served from the loaded definition (dependent dropdowns
// filter by parent value).
import type { OptionValue } from '@qdb/shared';
import { getLoadedForm } from './formApi';

function findFieldOptions(fieldId: string): OptionValue[] {
  const form = getLoadedForm();
  if (!form) return [];
  for (const tab of form.tabs) {
    for (const section of tab.sections) {
      for (const field of section.fields) {
        if (field.id === fieldId) return field.options ?? [];
      }
    }
  }
  return [];
}

export const optionsApi = {
  getOptions: async (fieldId: string, _formCode: string): Promise<{ data: OptionValue[] }> => {
    return { data: findFieldOptions(fieldId) };
  },

  getFilteredOptions: async (
    fieldId: string,
    _formCode: string,
    parentValue: string,
  ): Promise<{ data: OptionValue[] }> => {
    const filtered = findFieldOptions(fieldId)
      .filter((option) => !option.parentOptionValue || option.parentOptionValue === parentValue);
    return { data: filtered };
  },
};
