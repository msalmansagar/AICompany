import type {
  FormDefinition,
  TabDefinition,
  SectionDefinition,
  FieldDefinition,
  OptionValue,
  ValidationRule,
  FormButton,
  ScopedButton,
  GridColumnConfig,
  InfoCardScreen,
  InfoCardSection,
  InfoCardItem,
} from '@qdb/shared';
import type { TranslationMap } from '@qdb/shared';

export class TranslationResolutionService {
  resolveTranslations(form: FormDefinition, translationMap: TranslationMap): FormDefinition {
    return {
      ...form,
      ...resolveFormRoot(form, translationMap),
      tabs: form.tabs.map((tab) => resolveTab(tab, translationMap)),
      buttons: form.buttons.map((btn) => resolveButton(btn, translationMap)),
      infoCards: form.infoCards.map((screen) => resolveInfoCardScreen(screen, translationMap)),
    };
  }
}

function resolveString(
  entityName: string,
  recordId: string,
  fieldName: string,
  baseValue: string | undefined | null,
  map: TranslationMap,
): string | undefined {
  const key = `${entityName}:${recordId}:${fieldName}` as const;
  return (map.get(key) ?? baseValue) ?? undefined;
}

function resolveRequired(
  entityName: string,
  recordId: string,
  fieldName: string,
  baseValue: string,
  map: TranslationMap,
): string {
  return resolveString(entityName, recordId, fieldName, baseValue, map) ?? baseValue;
}

function resolveFormRoot(
  form: FormDefinition,
  map: TranslationMap,
): Partial<FormDefinition> {
  const e = 'qdb_form_definition';
  const id = form.id;
  return {
    title: resolveRequired(e, id, 'qdb_title', form.title, map),
    description: resolveString(e, id, 'qdb_description', form.description, map),
    confirmationMessage: resolveRequired(e, id, 'qdb_confirmation_message', form.confirmationMessage, map),
    infocardBackLabel: resolveString(e, id, 'qdb_infocard_back_label', form.infocardBackLabel, map),
    infocardContinueLabel: resolveString(e, id, 'qdb_infocard_continue_label', form.infocardContinueLabel, map),
    infocardStartLabel: resolveString(e, id, 'qdb_infocard_start_label', form.infocardStartLabel, map),
    infocardSkipLabel: resolveString(e, id, 'qdb_infocard_skip_label', form.infocardSkipLabel, map),
  };
}

function resolveTab(tab: TabDefinition, map: TranslationMap): TabDefinition {
  return {
    ...tab,
    label: resolveRequired('qdb_form_tab', tab.id, 'qdb_label', tab.label, map),
    buttons: tab.buttons?.map((b) => resolveScopedButton(b, map)),
    sections: tab.sections.map((s) => resolveSection(s, map)),
  };
}

function resolveSection(section: SectionDefinition, map: TranslationMap): SectionDefinition {
  const e = 'qdb_form_section';
  return {
    ...section,
    label: resolveRequired(e, section.id, 'qdb_label', section.label, map),
    description: resolveString(e, section.id, 'qdb_description', section.description, map),
    buttons: section.buttons?.map((b) => resolveScopedButton(b, map)),
    fields: section.fields.map((f) => resolveField(f, map)),
  };
}

// DFE-CBTN-001 scoped (tab/section) buttons were never translated. Resolve their label.
function resolveScopedButton(btn: ScopedButton, map: TranslationMap): ScopedButton {
  return {
    ...btn,
    label: resolveRequired('qdb_form_scoped_button', btn.id, 'qdb_label', btn.label, map),
  };
}

function resolveField(field: FieldDefinition, map: TranslationMap): FieldDefinition {
  const e = 'qdb_form_field';
  const id = field.id;
  return {
    ...field,
    label: resolveRequired(e, id, 'qdb_label', field.label, map),
    placeholder: resolveString(e, id, 'qdb_placeholder', field.placeholder, map),
    tooltip: resolveString(e, id, 'qdb_tooltip', field.tooltip, map),
    prefix: resolveString(e, id, 'qdb_prefix', field.prefix, map),
    suffix: resolveString(e, id, 'qdb_suffix', field.suffix, map),
    trueLabel: resolveString(e, id, 'qdb_true_label', field.trueLabel, map),
    falseLabel: resolveString(e, id, 'qdb_false_label', field.falseLabel, map),
    infoCardTitle: resolveString(e, id, 'qdb_info_card_title', field.infoCardTitle, map),
    infoCardBody: resolveString(e, id, 'qdb_info_card_body', field.infoCardBody, map),
    infoCardDownloadLabel: resolveString(e, id, 'qdb_info_card_download_label', field.infoCardDownloadLabel, map),
    fileDownloadLabel: resolveString(e, id, 'qdb_file_download_label', field.fileDownloadLabel, map),
    options: field.options?.map((opt) => resolveOption(opt, map)),
    validationRules: field.validationRules.map((r) => resolveValidationRule(r, map)),
    gridConfig: field.gridConfig
      ? {
          ...field.gridConfig,
          columnConfigs: field.gridConfig.columnConfigs.map((col) => resolveGridColumn(col, map)),
        }
      : undefined,
  };
}

function resolveOption(opt: OptionValue, map: TranslationMap): OptionValue {
  if (!opt.optionRecordId) return opt;
  const e = 'qdb_form_option_value';
  const id = opt.optionRecordId;
  return {
    ...opt,
    label: resolveRequired(e, id, 'qdb_label', opt.label, map),
    description: resolveString(e, id, 'qdb_description', opt.description, map),
    notes: resolveString(e, id, 'qdb_notes', opt.notes, map),
  };
}

function resolveValidationRule(rule: ValidationRule, map: TranslationMap): ValidationRule {
  return {
    ...rule,
    errorMessage: resolveRequired(
      'qdb_form_validation_rule',
      rule.id,
      'qdb_error_message',
      rule.errorMessage,
      map,
    ),
  };
}

function resolveButton(btn: FormButton, map: TranslationMap): FormButton {
  const e = 'qdb_form_button';
  return {
    ...btn,
    label: resolveRequired(e, btn.id, 'qdb_label', btn.label, map),
    confirmationMessage: resolveString(e, btn.id, 'qdb_confirmation_message', btn.confirmationMessage, map),
  };
}

function resolveGridColumn(col: GridColumnConfig, map: TranslationMap): GridColumnConfig {
  return {
    ...col,
    columnLabel: resolveRequired(
      'qdb_grid_column_config',
      col.columnId,
      'qdb_column_label',
      col.columnLabel,
      map,
    ),
  };
}

function resolveInfoCardScreen(screen: InfoCardScreen, map: TranslationMap): InfoCardScreen {
  const e = 'qdb_info_card_screen';
  return {
    ...screen,
    heading: resolveRequired(e, screen.screenId, 'qdb_heading', screen.heading, map),
    subHeading: resolveString(e, screen.screenId, 'qdb_sub_heading', screen.subHeading, map) ?? null,
    iconAltText: resolveString(e, screen.screenId, 'qdb_icon_alt_text', screen.iconAltText, map) ?? null,
    sections: screen.sections.map((s) => resolveInfoCardSection(s, map)),
  };
}

function resolveInfoCardSection(section: InfoCardSection, map: TranslationMap): InfoCardSection {
  const e = 'qdb_info_card_section';
  return {
    ...section,
    sectionTitle: resolveString(e, section.sectionId, 'qdb_section_title', section.sectionTitle, map) ?? null,
    noteText: resolveString(e, section.sectionId, 'qdb_note_text', section.noteText, map) ?? null,
    items: section.items.map((item) => resolveInfoCardItem(item, map)),
  };
}

function resolveInfoCardItem(item: InfoCardItem, map: TranslationMap): InfoCardItem {
  const e = 'qdb_info_card_item';
  return {
    ...item,
    itemTitle: resolveRequired(e, item.itemId, 'qdb_item_title', item.itemTitle, map),
    itemDescription: resolveString(e, item.itemId, 'qdb_item_description', item.itemDescription, map) ?? null,
  };
}
