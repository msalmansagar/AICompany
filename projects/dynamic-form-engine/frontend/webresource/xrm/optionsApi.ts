// Xrm-backed replacement for src/api/optionsApi.ts. Static options come from the published
// form JSON; fields configured with an option-source entity/attribute fetch the option-set
// metadata live from CRM (Xrm.WebApi does not expose metadata, so a session fetch is used).
import type { OptionValue } from '@qdb/shared';
import { getLoadedForm } from './formApi';
import { webApiBaseUrl } from './xrmClient';

interface DynamicField {
  options?: OptionValue[];
  parentChild?: boolean;
  optionSourceEntity?: string;
  optionSourceAttribute?: string;
}

function findField(fieldId: string): DynamicField | null {
  const form = getLoadedForm();
  if (!form) return null;
  for (const tab of form.tabs) {
    for (const section of tab.sections) {
      for (const field of section.fields) {
        if (field.id === fieldId) return field as unknown as DynamicField;
      }
    }
  }
  return null;
}

// Reads the option-set values of an entity attribute via the metadata endpoint.
async function fetchOptionSetValues(entity: string, attribute: string): Promise<OptionValue[]> {
  const url = `${webApiBaseUrl()}/EntityDefinitions(LogicalName='${entity}')`
    + `/Attributes(LogicalName='${attribute}')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata`
    + `?$select=LogicalName&$expand=OptionSet($select=Options)`;

  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' },
    credentials: 'same-origin',
  });
  if (!response.ok) return [];

  const data = await response.json() as { OptionSet?: { Options?: Array<{ Value: number; Label?: { UserLocalizedLabel?: { Label?: string } } }> } };
  const options = data.OptionSet?.Options ?? [];
  return options.map((option, index) => ({
    value: String(option.Value),
    label: option.Label?.UserLocalizedLabel?.Label ?? String(option.Value),
    displayOrder: index,
    isDefault: false,
    isActive: true,
  }));
}

async function resolveOptions(fieldId: string): Promise<OptionValue[]> {
  const field = findField(fieldId);
  if (!field) return [];
  if (field.optionSourceEntity && field.optionSourceAttribute) {
    return fetchOptionSetValues(field.optionSourceEntity, field.optionSourceAttribute);
  }
  return field.options ?? [];
}

export const optionsApi = {
  getOptions: async (fieldId: string, _formCode: string): Promise<{ data: OptionValue[] }> => {
    return { data: await resolveOptions(fieldId) };
  },

  getFilteredOptions: async (
    fieldId: string,
    _formCode: string,
    parentValue: string,
  ): Promise<{ data: OptionValue[] }> => {
    const all = await resolveOptions(fieldId);
    const filtered = all.filter((option) => !option.parentOptionValue || option.parentOptionValue === parentValue);
    return { data: filtered };
  },
};
