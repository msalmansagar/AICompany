// Xrm-backed replacement for src/api/formApi.ts. Reads the published render-cache JSON
// straight from CRM and submits via direct Xrm.WebApi writes. Same shape as the portal
// formApi ({ data } envelope) so the renderer is reused unchanged.
import type { FormDefinition, FormFieldValues } from '@qdb/shared';
import { webApi, decodeRuntimeJson } from './xrmClient';
import { submitForm } from './submitEngine';

const RENDER_CACHE_STATUS_ACTIVE = 2;

interface RenderCacheRow {
  qdb_language_code: string;
  qdb_runtime_json: string;
  qdb_is_compressed: boolean;
}

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

async function fetchActiveRows(formCode: string): Promise<RenderCacheRow[]> {
  const filter = `qdb_form_code eq '${formCode}' and qdb_is_active eq true and qdb_status eq ${RENDER_CACHE_STATUS_ACTIVE}`;
  const select = 'qdb_language_code,qdb_runtime_json,qdb_is_compressed';
  const result = await webApi().retrieveMultipleRecords(
    'qdb_form_render_cache',
    `?$filter=${encodeURIComponent(filter)}&$select=${select}`,
  );
  return result.entities as unknown as RenderCacheRow[];
}

function selectRow(rows: RenderCacheRow[], lang: string): RenderCacheRow {
  return rows.find((r) => r.qdb_language_code === lang)
    ?? rows.find((r) => r.qdb_language_code === 'en')
    ?? rows[0];
}

export const formApi = {
  getMetadata: async (formCode: string, lang?: string) => {
    const rows = await fetchActiveRows(formCode);
    if (rows.length === 0) {
      throw new Error(`Form '${formCode}' has not been published. Publish it from the form record first.`);
    }
    const row = selectRow(rows, lang ?? 'en');
    const form = JSON.parse(decodeRuntimeJson(row.qdb_runtime_json, row.qdb_is_compressed)) as FormDefinition;
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
