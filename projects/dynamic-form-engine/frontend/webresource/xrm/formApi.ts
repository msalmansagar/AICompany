// Xrm-backed replacement for src/api/formApi.ts. Reads the published form JSON via the
// qdb_GetPublishedFormJson action (CRM owns the cache lookup, active-version selection,
// language fallback, and gzip decompression) and submits via direct Xrm.WebApi writes.
// Same shape as the portal formApi ({ data } envelope) so the renderer is reused unchanged.
import type { FormDefinition, FormFieldValues } from '@qdb/shared';
import { executeUnboundAction } from './xrmClient';
import { submitForm } from './submitEngine';

const GET_PUBLISHED_FORM_JSON = 'qdb_GetPublishedFormJson';
const LATEST_ACTIVE_VERSION = 0;
const STRING_PARAMETER = 1;
const INTEGER_PARAMETER = 1;

// The definition loaded by getMetadata is kept so submit() can use its mappings without
// a second round-trip (the renderer calls submit with only formCode + values).
let loadedForm: FormDefinition | null = null;

function wrap<T>(data: T): { data: T } {
  return { data };
}

/** The form definition loaded by the most recent getMetadata call (used by the options adapter). */
export function getLoadedForm(): FormDefinition | null {
  return loadedForm;
}

async function fetchPublishedJson(formCode: string, lang: string): Promise<string> {
  const result = await executeUnboundAction(GET_PUBLISHED_FORM_JSON, {
    FormCode: { value: formCode, typeName: 'Edm.String', structuralProperty: STRING_PARAMETER },
    LanguageCode: { value: lang, typeName: 'Edm.String', structuralProperty: STRING_PARAMETER },
    Version: { value: LATEST_ACTIVE_VERSION, typeName: 'Edm.Int32', structuralProperty: INTEGER_PARAMETER },
  });
  return result.RuntimeJson as string;
}

export const formApi = {
  getMetadata: async (formCode: string, lang?: string) => {
    const runtimeJson = await fetchPublishedJson(formCode, lang ?? 'en');
    if (!runtimeJson) {
      throw new Error(`Form '${formCode}' has not been published. Publish it from the form record first.`);
    }
    const form = JSON.parse(runtimeJson) as FormDefinition;
    loadedForm = form;
    return wrap(form);
  },

  submit: async (_formCode: string, data: FormFieldValues) => {
    if (!loadedForm) throw new Error('Form metadata is not loaded.');
    const referenceNumber = await submitForm(loadedForm, data);
    return wrap({ referenceNumber });
  },

  // Edit-mode prefill is a future iteration for the in-CRM engine; new submissions return empty.
  getData: async (_formCode: string, _recordId: string) => wrap({} as FormFieldValues),

  // Drafts/versioning/catalogue are portal-only features; surfaced as clear no-ops here.
  saveDraft: async () => { throw new Error('Saving drafts is not supported in the in-CRM form engine yet.'); },
  validate: async () => wrap({} as Record<string, string[]>),
  getVersions: async () => wrap([] as never[]),
  list: async () => wrap([] as never[]),
  clone: async () => { throw new Error('Clone is not available in the in-CRM form engine.'); },
};
