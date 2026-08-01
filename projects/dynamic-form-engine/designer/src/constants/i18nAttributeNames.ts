// i18n entity attribute registries (translations, language config, field labels).
// Split from attributeNames.ts (SC-09).

export const FIELD_LABEL_ATTRS = {
  ID: 'qdb_fieldlabelid',
  FIELD_ID: 'qdb_form_field_id',
  FIELD_ID_VALUE: '_qdb_form_field_id_value',
  NAME: 'qdb_name',
  LOCALE: 'qdb_locale',
  LABEL: 'qdb_label',
  PLACEHOLDER: 'qdb_placeholder',
  TOOLTIP: 'qdb_tooltip',
} as const;

export const TRANSLATION_ATTRS = {
  ID: 'qdb_translationid',
  ENTITY_NAME: 'qdb_entity_name',
  RECORD_ID: 'qdb_record_id',
  FIELD_NAME: 'qdb_field_name',
  LANGUAGE_CODE: 'qdb_language_code',
  TRANSLATED_VALUE: 'qdb_translated_value',
  /** English the translation was made from — lets an export flag rows whose source has moved on. */
  SOURCE_VALUE: 'qdb_source_value',
  IS_ACTIVE: 'qdb_is_active',
} as const;

export const LANGUAGE_CONFIG_ATTRS = {
  ID: 'qdb_language_configid',
  LANGUAGE_CODE: 'qdb_language_code',
  DISPLAY_NAME: 'qdb_display_name',
  DISPLAY_NAME_NATIVE: 'qdb_display_name_native',
  LCID: 'qdb_lcid',
  IS_DEFAULT: 'qdb_is_default',
  RTL_DIRECTION: 'qdb_rtl_direction',
  DISPLAY_ORDER: 'qdb_display_order',
  IS_ACTIVE: 'qdb_is_active',
} as const;
