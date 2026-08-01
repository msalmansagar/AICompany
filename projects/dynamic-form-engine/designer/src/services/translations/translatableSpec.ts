// Which strings on a form can be translated, and how each record is reached from the form.
//
// This list is NOT hand-written from the UI: it is every (entity, field) pair the publish
// generator passes through ITranslationResolver.Resolve — FormJsonGenerator.cs and
// FieldBuilder.cs. If the generator resolves it, a translation for it is honoured at publish
// time, so the generator's call sites are the authoritative definition and this file mirrors
// them. A field the generator does not resolve must not be exported: translating it would do
// nothing, and the workbook would be inviting work that has no effect.
//
// Fields belong to an entity, not to the form as a whole. qdb_description is resolved on the
// form, tab, section and option value but not on a field; qdb_label is resolved on nine
// entities but never on the form. One flat list applied to every entity gets both directions
// wrong at once.
//
// Kept in step with scripts/translations-lib.mjs, which runs the same round trip headlessly.

import type { WebApiRecord } from '../IWebApiAdapter';

/**
 * Buckets of record ids gathered while walking the form, so each level can filter on the
 * level above it. The form itself seeds the walk.
 */
export type CollectionScope = 'form' | 'tabs' | 'sections' | 'fields' | 'screens' | 'cardSections';

export interface TranslatableEntitySpec {
  /** Logical name — the adapter resolves the entity set, so irregular plurals are not our problem. */
  readonly entity: string;
  readonly idField: string;
  /** Which bucket of parent ids this entity is filtered by. */
  readonly scope: CollectionScope;
  /** Lookup column holding the parent id. Absent only for the form itself. */
  readonly parentField?: string;
  /** Bucket this entity's own ids fill, when a deeper level filters on them. */
  readonly fills?: CollectionScope;
  /** Exactly the fields the generator resolves for this entity. */
  readonly fields: readonly string[];
}

/** Ordered parent-first: every spec's scope is filled by a spec above it. */
export const TRANSLATABLE_ENTITIES: readonly TranslatableEntitySpec[] = [
  {
    entity: 'qdb_form_definition',
    idField: 'qdb_form_definitionid',
    scope: 'form',
    fields: [
      'qdb_title', 'qdb_description', 'qdb_confirmation_message',
      'qdb_submit_confirmation_label', 'qdb_submit_confirmation_message',
      'qdb_infocard_back_label', 'qdb_infocard_continue_label',
      'qdb_infocard_skip_label', 'qdb_infocard_start_label',
    ],
  },
  {
    entity: 'qdb_form_tab',
    idField: 'qdb_form_tabid',
    scope: 'form',
    parentField: '_qdb_form_definition_id_value',
    fills: 'tabs',
    fields: [
      'qdb_label', 'qdb_description',
      'qdb_submit_confirmation_label', 'qdb_submit_confirmation_message',
    ],
  },
  {
    entity: 'qdb_form_section',
    idField: 'qdb_form_sectionid',
    scope: 'tabs',
    parentField: '_qdb_form_tab_id_value',
    fills: 'sections',
    fields: ['qdb_label', 'qdb_description'],
  },
  {
    entity: 'qdb_form_field',
    idField: 'qdb_form_fieldid',
    scope: 'sections',
    parentField: '_qdb_form_section_id_value',
    fills: 'fields',
    fields: [
      'qdb_label', 'qdb_placeholder', 'qdb_tooltip', 'qdb_prefix', 'qdb_suffix',
      'qdb_true_label', 'qdb_false_label', 'qdb_static_content',
      'qdb_info_card_title', 'qdb_info_card_body', 'qdb_info_card_download_label',
      'qdb_file_download_label',
    ],
  },
  {
    entity: 'qdb_form_option_value',
    idField: 'qdb_form_option_valueid',
    scope: 'fields',
    parentField: '_qdb_form_field_id_value',
    fields: ['qdb_label', 'qdb_description', 'qdb_notes'],
  },
  {
    entity: 'qdb_form_validation_rule',
    idField: 'qdb_form_validation_ruleid',
    scope: 'fields',
    parentField: '_qdb_form_field_id_value',
    fields: ['qdb_error_message'],
  },
  {
    entity: 'qdb_grid_column_config',
    idField: 'qdb_grid_column_configid',
    scope: 'fields',
    parentField: '_qdb_form_field_id_value',
    fields: ['qdb_column_label'],
  },
  {
    entity: 'qdb_form_button',
    idField: 'qdb_form_buttonid',
    scope: 'form',
    parentField: '_qdb_form_definition_id_value',
    fields: ['qdb_label', 'qdb_confirmation_message'],
  },
  {
    entity: 'qdb_form_scoped_button',
    idField: 'qdb_form_scoped_buttonid',
    scope: 'form',
    parentField: '_qdb_form_definition_id_value',
    fields: ['qdb_label', 'qdb_confirm_message'],
  },
  {
    entity: 'qdb_info_card_screen',
    idField: 'qdb_info_card_screenid',
    scope: 'form',
    parentField: '_qdb_form_definition_id_value',
    fills: 'screens',
    fields: ['qdb_heading', 'qdb_sub_heading', 'qdb_icon_alt_text'],
  },
  {
    entity: 'qdb_info_card_section',
    idField: 'qdb_info_card_sectionid',
    scope: 'screens',
    parentField: '_qdb_info_card_screen_id_value',
    fills: 'cardSections',
    fields: ['qdb_section_title', 'qdb_note_text'],
  },
  {
    entity: 'qdb_info_card_item',
    idField: 'qdb_info_card_itemid',
    scope: 'cardSections',
    parentField: '_qdb_info_card_section_id_value',
    fields: ['qdb_item_title', 'qdb_item_description'],
  },
];

/** One translatable string: the key the round trip matches on, plus context for the translator. */
export interface TranslatableString {
  readonly entity: string;
  readonly recordId: string;
  readonly field: string;
  readonly source: string;
  /** Where it sits — "Name" means nothing to a translator without it. */
  readonly context: string;
}

/** Identity of a translation. Record ids are lower-cased: Dataverse casing is not stable. */
export function translationKey(
  entity: string,
  recordId: string,
  field: string,
  language: string,
): string {
  return `${entity}|${String(recordId).toLowerCase()}|${field}|${language}`;
}

/** One row per translatable string that actually holds source text. */
export function buildTranslatableRows(
  recordsByEntity: ReadonlyMap<string, readonly WebApiRecord[]>,
): TranslatableString[] {
  const rows: TranslatableString[] = [];
  for (const spec of TRANSLATABLE_ENTITIES) {
    for (const record of recordsByEntity.get(spec.entity) ?? []) {
      rows.push(...rowsForRecord(spec, record));
    }
  }
  return rows;
}

function rowsForRecord(spec: TranslatableEntitySpec, record: WebApiRecord): TranslatableString[] {
  const recordId = String(record[spec.idField] ?? '');
  if (!recordId) return [];

  return spec.fields
    .filter(field => hasText(record[field]))
    .map(field => ({
      entity: spec.entity,
      recordId,
      field,
      // Verbatim, not trimmed. The source snapshot an import stores is compared byte for byte
      // against this on the next export, so trimming here would make a workbook produced by
      // one of the two implementations read as stale to the other.
      source: String(record[field]),
      context: readContext(record),
    }));
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function readContext(record: WebApiRecord): string {
  const schemaName = record['qdb_schema_name'];
  if (hasText(schemaName)) return schemaName;
  const formCode = record['qdb_form_code'];
  return hasText(formCode) ? formCode : '';
}
