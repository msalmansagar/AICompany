// Xrm-backed replacement for src/api/optionsApi.ts. Static options come from the published
// form JSON; fields configured with an option-source entity/attribute fetch the option-set
// metadata live from CRM (Xrm.WebApi does not expose metadata, so a session fetch is used).
import { optionSetMetadataCast } from '@qdb/shared';
import type { OptionValue } from '@qdb/shared';
import { getLoadedForm } from './formApi';
import { webApiBaseUrl } from './xrmClient';

interface CrmOption {
  Value: number;
  Label?: { UserLocalizedLabel?: { Label?: string } };
}

const METADATA_HEADERS = { Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' };

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

async function fetchMetadata<T>(path: string): Promise<T> {
  const response = await fetch(`${webApiBaseUrl()}/${path}`, { headers: METADATA_HEADERS, credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Metadata request failed with ${response.status}: ${path}`);
  return await response.json() as T;
}

// The OptionSet is only reachable through the attribute's own metadata type, so the type is read first.
async function fetchOptionSetValues(entity: string, attribute: string): Promise<OptionValue[]> {
  const attributePath = `EntityDefinitions(LogicalName='${entity}')/Attributes(LogicalName='${attribute}')`;
  const typed = await fetchMetadata<{ AttributeTypeName?: { Value?: string } }>(`${attributePath}?$select=AttributeTypeName`);
  const cast = optionSetMetadataCast(typed.AttributeTypeName?.Value ?? 'unknown');
  const data = await fetchMetadata<{ OptionSet?: { Options?: CrmOption[] } }>(
    `${attributePath}/${cast}?$select=LogicalName&$expand=OptionSet($select=Options)`,
  );
  return (data.OptionSet?.Options ?? []).map((option, index) => ({
    value: String(option.Value),
    label: option.Label?.UserLocalizedLabel?.Label ?? String(option.Value),
    displayOrder: index,
    isDefault: false,
    isActive: true,
  }));
}

// A source that cannot be read leaves the dropdown empty rather than breaking the form,
// but says why — an empty list with no message is what hid this defect.
async function fetchSourceOptions(entity: string, attribute: string): Promise<OptionValue[]> {
  try {
    return await fetchOptionSetValues(entity, attribute);
  } catch (error) {
    console.warn(`[DFE-options] option source ${entity}.${attribute} could not be read — no options shown`, error);
    return [];
  }
}

async function resolveOptions(fieldId: string): Promise<OptionValue[]> {
  const field = findField(fieldId);
  if (!field) return [];
  if (field.optionSourceEntity && field.optionSourceAttribute) {
    return fetchSourceOptions(field.optionSourceEntity, field.optionSourceAttribute);
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
