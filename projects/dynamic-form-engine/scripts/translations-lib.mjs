/**
 * Shared plumbing for the translation round trip (export → Excel → import).
 *
 * The set of translatable strings is not a hand-written list: it is every (entity, field) pair
 * the publish generator passes through ITranslationResolver.Resolve — FormJsonGenerator.cs and
 * FieldBuilder.cs. If the generator resolves it, a translation for it will be honoured at
 * publish time, so those call sites are the authoritative definition and this mirrors them.
 *
 * Fields belong to an entity, not to the form as a whole. Kept in step with
 * designer/src/services/translations/translatableSpec.ts, which runs the same walk in the UI.
 */
const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
export const API = `${DATAVERSE_URL}/api/data/v9.2`;

/** Entities the publisher resolves translations for, how each is reached, and which fields. */
export const TRANSLATABLE_ENTITIES = [
  {
    entity: 'qdb_form_definition', idField: 'qdb_form_definitionid', scope: 'form',
    fields: [
      'qdb_title', 'qdb_description', 'qdb_confirmation_message',
      'qdb_submit_confirmation_label', 'qdb_submit_confirmation_message',
      'qdb_infocard_back_label', 'qdb_infocard_continue_label',
      'qdb_infocard_skip_label', 'qdb_infocard_start_label',
    ],
  },
  {
    entity: 'qdb_form_tab', idField: 'qdb_form_tabid', scope: 'form',
    parent: '_qdb_form_definition_id_value',
    fields: [
      'qdb_label', 'qdb_description',
      'qdb_submit_confirmation_label', 'qdb_submit_confirmation_message',
    ],
  },
  {
    entity: 'qdb_form_section', idField: 'qdb_form_sectionid', scope: 'tabs',
    parent: '_qdb_form_tab_id_value',
    fields: ['qdb_label', 'qdb_description'],
  },
  {
    entity: 'qdb_form_field', idField: 'qdb_form_fieldid', scope: 'sections',
    parent: '_qdb_form_section_id_value',
    fields: [
      'qdb_label', 'qdb_placeholder', 'qdb_tooltip', 'qdb_prefix', 'qdb_suffix',
      'qdb_true_label', 'qdb_false_label', 'qdb_static_content',
      'qdb_info_card_title', 'qdb_info_card_body', 'qdb_info_card_download_label',
      'qdb_file_download_label',
    ],
  },
  {
    entity: 'qdb_form_option_value', idField: 'qdb_form_option_valueid', scope: 'fields',
    parent: '_qdb_form_field_id_value',
    fields: ['qdb_label', 'qdb_description', 'qdb_notes'],
  },
  {
    entity: 'qdb_form_validation_rule', idField: 'qdb_form_validation_ruleid', scope: 'fields',
    parent: '_qdb_form_field_id_value',
    fields: ['qdb_error_message'],
  },
  {
    entity: 'qdb_grid_column_config', idField: 'qdb_grid_column_configid', scope: 'fields',
    parent: '_qdb_form_field_id_value',
    fields: ['qdb_column_label'],
  },
  {
    entity: 'qdb_form_button', idField: 'qdb_form_buttonid', scope: 'form',
    parent: '_qdb_form_definition_id_value',
    fields: ['qdb_label', 'qdb_confirmation_message'],
  },
  {
    entity: 'qdb_form_scoped_button', idField: 'qdb_form_scoped_buttonid', scope: 'form',
    parent: '_qdb_form_definition_id_value',
    fields: ['qdb_label', 'qdb_confirm_message'],
  },
  {
    entity: 'qdb_info_card_screen', idField: 'qdb_info_card_screenid', scope: 'form',
    parent: '_qdb_form_definition_id_value',
    fields: ['qdb_heading', 'qdb_sub_heading', 'qdb_icon_alt_text'],
  },
  {
    entity: 'qdb_info_card_section', idField: 'qdb_info_card_sectionid', scope: 'screens',
    parent: '_qdb_info_card_screen_id_value',
    fields: ['qdb_section_title', 'qdb_note_text'],
  },
  {
    entity: 'qdb_info_card_item', idField: 'qdb_info_card_itemid', scope: 'cardSections',
    parent: '_qdb_info_card_section_id_value',
    fields: ['qdb_item_title', 'qdb_item_description'],
  },
];

export async function acquireToken() {
  const secret = process.env.DV_CLIENT_SECRET;
  if (!secret) throw new Error('DV_CLIENT_SECRET env var is required.');
  const body = new URLSearchParams({
    grant_type: 'client_credentials', client_id: CLIENT_ID,
    client_secret: secret, scope: `${DATAVERSE_URL}/.default`,
  });
  const r = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description ?? 'token request failed');
  return j.access_token;
}

export function headers(token) {
  return {
    Authorization: `Bearer ${token}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
    Accept: 'application/json', 'Content-Type': 'application/json',
  };
}

export async function get(H, path) {
  const r = await fetch(`${API}/${path}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

/**
 * Entity-set names come from metadata, never from appending "s" — hundreds of custom tables
 * in this org are irregular, and guessing produces a 404.
 */
const entitySetCache = new Map();
export async function entitySet(H, logicalName) {
  if (entitySetCache.has(logicalName)) return entitySetCache.get(logicalName);
  const meta = await get(H, `EntityDefinitions(LogicalName='${logicalName}')?$select=EntitySetName`);
  entitySetCache.set(logicalName, meta.EntitySetName);
  return meta.EntitySetName;
}

/** Accepts a form code or a form record id. */
export async function resolveForm(H, formRef) {
  const isGuid = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i.test(formRef);
  const filter = isGuid
    ? `qdb_form_definitionid eq ${formRef.replace(/[{}]/g, '')}`
    : `qdb_form_code eq '${formRef.replace(/'/g, "''")}'`;
  const found = await get(H, `qdb_form_definitions?$filter=${encodeURIComponent(filter)}&$select=qdb_form_definitionid,qdb_form_code,qdb_title`);
  if (!found.value.length) throw new Error(`No form found for '${formRef}'.`);
  return found.value[0];
}

/** OData filter matching any of the given parent ids, or null when there are none. */
function parentFilter(field, ids) {
  if (!ids.length) return null;
  return ids.map((id) => `${field} eq ${id}`).join(' or ');
}

/**
 * Every record on the form that can carry a translation, walked parent-first so each level
 * can filter on the ids collected above it.
 */
export async function collectRecords(H, formId) {
  const byEntity = new Map();
  const idsByScope = { form: [formId], tabs: [], sections: [], fields: [], screens: [], cardSections: [] };

  for (const spec of TRANSLATABLE_ENTITIES) {
    const set = await entitySet(H, spec.entity);
    let records = [];

    if (spec.entity === 'qdb_form_definition') {
      records = (await get(H, `${set}?$filter=${spec.idField} eq ${formId}`)).value;
    } else {
      const filter = parentFilter(spec.parent, idsByScope[spec.scope] ?? []);
      if (filter) {
        try {
          records = (await get(H, `${set}?$filter=${encodeURIComponent(filter)}`)).value;
        } catch {
          // An optional table (info cards, scoped buttons) may not exist in every org.
          records = [];
        }
      }
    }

    byEntity.set(spec.entity, records);
    const ids = records.map((r) => r[spec.idField]).filter(Boolean);
    if (spec.entity === 'qdb_form_tab') idsByScope.tabs = ids;
    if (spec.entity === 'qdb_form_section') idsByScope.sections = ids;
    if (spec.entity === 'qdb_form_field') idsByScope.fields = ids;
    if (spec.entity === 'qdb_info_card_screen') idsByScope.screens = ids;
    if (spec.entity === 'qdb_info_card_section') idsByScope.cardSections = ids;
  }

  return byEntity;
}

/** One row per translatable string that actually has source text. */
export function buildRows(byEntity) {
  const rows = [];
  for (const spec of TRANSLATABLE_ENTITIES) {
    for (const record of byEntity.get(spec.entity) ?? []) {
      for (const field of spec.fields) {
        const value = record[field];
        if (typeof value !== 'string' || !value.trim()) continue;
        rows.push({
          entity: spec.entity,
          recordId: record[spec.idField],
          field,
          source: value,
          context: record.qdb_schema_name ?? record.qdb_form_code ?? '',
        });
      }
    }
  }
  return rows;
}

/** Existing translations for these records, keyed entity|recordId|field|language. */
export async function loadTranslations(H, recordIds) {
  const map = new Map();
  if (!recordIds.length) return map;

  // qdb_record_id is a string column holding the standard "D" GUID format.
  for (let i = 0; i < recordIds.length; i += 20) {
    const chunk = recordIds.slice(i, i + 20);
    const filter = chunk.map((id) => `qdb_record_id eq '${id}'`).join(' or ');
    const found = await get(H, `qdb_translations?$filter=${encodeURIComponent(filter)}`);
    for (const t of found.value) {
      map.set(translationKey(t.qdb_entity_name, t.qdb_record_id, t.qdb_field_name, t.qdb_language_code), t);
    }
  }
  return map;
}

export function translationKey(entity, recordId, field, language) {
  return `${entity}|${String(recordId).toLowerCase()}|${field}|${language}`;
}

/**
 * Active languages configured in the org, source language excluded, in display order.
 *
 * The table is qdb_language_config. An earlier version asked for qdb_language, which does not
 * exist in this org, and fell back to a hardcoded ['ar'] — so the fallback was the only code
 * path that ever ran and a third configured language would never have reached a workbook.
 * The query is no longer wrapped: a workbook missing a language is worse than a failed export.
 */
export async function activeLanguages(H, sourceLanguage) {
  const filter = encodeURIComponent('qdb_is_active eq true');
  const found = await get(
    H,
    'qdb_language_configs'
      + '?$select=qdb_language_code,qdb_rtl_direction,qdb_display_order'
      + `&$filter=${filter}&$orderby=qdb_display_order`,
  );

  const seen = new Set();
  return found.value
    .filter((l) => l.qdb_language_code)
    .filter((l) => l.qdb_language_code.toLowerCase() !== sourceLanguage.toLowerCase())
    .filter((l) => !seen.has(l.qdb_language_code) && seen.add(l.qdb_language_code))
    .map((l) => ({ code: l.qdb_language_code, isRtl: Boolean(l.qdb_rtl_direction) }));
}
