import { describe, it, expect } from 'vitest';
import { TranslationResolutionService } from './TranslationResolutionService.js';
import type { FormDefinition, TranslationMap } from '@qdb/shared';

function makeMinimalForm(overrides: Partial<FormDefinition> = {}): FormDefinition {
  return {
    id: 'form-001',
    formCode: 'test-form',
    title: 'English Title',
    description: 'English Description',
    status: 'active',
    version: 1,
    allowSaveDraft: true,
    showSummaryStep: false,
    draftExpiryDays: 90,
    confirmationMessage: 'Thank you',
    allowInfocardSkip: false,
    infocardCountsInProgress: false,
    infoCards: [],
    submissionMappings: [],
    buttons: [],
    tabs: [],
    createdAt: '2026-01-01T00:00:00Z',
    modifiedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const service = new TranslationResolutionService();

describe('TranslationResolutionService', () => {
  it('resolveTranslations_formRoot_appliesTranslationForAllRootFields', () => {
    const map: TranslationMap = new Map([
      ['qdb_form_definition:form-001:qdb_title', 'العنوان'],
      ['qdb_form_definition:form-001:qdb_description', 'الوصف'],
      ['qdb_form_definition:form-001:qdb_confirmation_message', 'شكراً'],
    ]);
    const result = service.resolveTranslations(makeMinimalForm(), map);
    expect(result.title).toBe('العنوان');
    expect(result.description).toBe('الوصف');
    expect(result.confirmationMessage).toBe('شكراً');
  });

  it('resolveTranslations_formRoot_fallsBackToEnglishWhenTranslationMissing', () => {
    const result = service.resolveTranslations(makeMinimalForm(), new Map());
    expect(result.title).toBe('English Title');
    expect(result.confirmationMessage).toBe('Thank you');
  });

  it('resolveTranslations_tabs_appliesTabLabelTranslation', () => {
    const form = makeMinimalForm({
      tabs: [{
        id: 'tab-001',
        formDefinitionId: 'form-001',
        label: 'Personal Info',
        displayOrder: 1,
        isVisible: true,
        requiresPreviousTabComplete: false,
        sections: [],
      }],
    });
    const map: TranslationMap = new Map([
      ['qdb_form_tab:tab-001:qdb_label', 'المعلومات الشخصية'],
    ]);
    const result = service.resolveTranslations(form, map);
    expect(result.tabs[0]?.label).toBe('المعلومات الشخصية');
  });

  it('resolveTranslations_scopedButtons_appliesTabAndSectionButtonLabelTranslation', () => {
    // DFE-CBTN-001 scoped buttons were previously left untranslated.
    const scoped = (id: string, label: string) => ({
      id, label, placementScope: 'tab', displayOrder: 1, isVisible: true, isPrimary: false,
      confirmRequired: false, action: { type: 'saveDraft' },
    });
    const form = makeMinimalForm({
      tabs: [{
        id: 'tab-001', formDefinitionId: 'form-001', label: 'Tab', displayOrder: 1, isVisible: true,
        requiresPreviousTabComplete: false,
        buttons: [scoped('btn-tab', 'Verify')] as never,
        sections: [{
          id: 'sec-001', tabId: 'tab-001', label: 'Sec', description: null, columnCount: 1,
          isCollapsible: false, isExpandedByDefault: true, isVisible: true, displayOrder: 1,
          fields: [], buttons: [scoped('btn-sec', 'Save')] as never,
        }],
      }] as never,
    });
    const map: TranslationMap = new Map([
      ['qdb_form_scoped_button:btn-tab:qdb_label', 'تحقّق'],
      ['qdb_form_scoped_button:btn-sec:qdb_label', 'حفظ'],
    ]);
    const result = service.resolveTranslations(form, map);
    expect(result.tabs[0]?.buttons?.[0]?.label).toBe('تحقّق');
    expect(result.tabs[0]?.sections[0]?.buttons?.[0]?.label).toBe('حفظ');
  });

  it('resolveTranslations_sections_appliesLabelAndDescriptionTranslation', () => {
    const form = makeMinimalForm({
      tabs: [{
        id: 'tab-001',
        formDefinitionId: 'form-001',
        label: 'Tab',
        displayOrder: 1,
        isVisible: true,
        requiresPreviousTabComplete: false,
        sections: [{
          id: 'sec-001',
          tabId: 'tab-001',
          label: 'Basic Details',
          description: 'Enter your details',
          displayOrder: 1,
          columns: 2,
          isCollapsible: false,
          isCollapsedByDefault: false,
          isVisible: true,
          fields: [],
        }],
      }],
    });
    const map: TranslationMap = new Map([
      ['qdb_form_section:sec-001:qdb_label', 'التفاصيل الأساسية'],
      ['qdb_form_section:sec-001:qdb_description', 'أدخل تفاصيلك'],
    ]);
    const result = service.resolveTranslations(form, map);
    expect(result.tabs[0]?.sections[0]?.label).toBe('التفاصيل الأساسية');
    expect(result.tabs[0]?.sections[0]?.description).toBe('أدخل تفاصيلك');
  });

  it('resolveTranslations_fields_appliesAllFieldStringTypes', () => {
    const field = {
      id: 'field-001',
      sectionId: 'sec-001',
      fieldType: 'text' as const,
      schemaName: 'full_name',
      label: 'Full Name',
      placeholder: 'Enter name',
      tooltip: 'Your legal name',
      prefix: '$',
      suffix: 'USD',
      trueLabel: 'Yes',
      falseLabel: 'No',
      displayOrder: 1,
      columnSpan: 2 as const,
      isRequired: false,
      isReadonly: false,
      isHidden: false,
      isVisible: true,
      validationRules: [],
      businessRules: [],
    };
    const form = makeMinimalForm({
      tabs: [{
        id: 'tab-001', formDefinitionId: 'form-001', label: 'Tab',
        displayOrder: 1, isVisible: true, requiresPreviousTabComplete: false,
        sections: [{ id: 'sec-001', tabId: 'tab-001', label: 'S', displayOrder: 1,
          columns: 2 as const, isCollapsible: false, isCollapsedByDefault: false,
          isVisible: true, fields: [field] }],
      }],
    });
    const map: TranslationMap = new Map([
      ['qdb_form_field:field-001:qdb_label', 'الاسم الكامل'],
      ['qdb_form_field:field-001:qdb_placeholder', 'أدخل الاسم'],
      ['qdb_form_field:field-001:qdb_tooltip', 'اسمك القانوني'],
      ['qdb_form_field:field-001:qdb_prefix', 'ر.ق'],
      ['qdb_form_field:field-001:qdb_suffix', 'ر.ق'],
      ['qdb_form_field:field-001:qdb_true_label', 'نعم'],
      ['qdb_form_field:field-001:qdb_false_label', 'لا'],
    ]);
    const result = service.resolveTranslations(form, map);
    const f = result.tabs[0]?.sections[0]?.fields[0];
    expect(f?.label).toBe('الاسم الكامل');
    expect(f?.placeholder).toBe('أدخل الاسم');
    expect(f?.tooltip).toBe('اسمك القانوني');
    expect(f?.prefix).toBe('ر.ق');
    expect(f?.suffix).toBe('ر.ق');
    expect(f?.trueLabel).toBe('نعم');
    expect(f?.falseLabel).toBe('لا');
  });

  it('resolveTranslations_fields_skipsNullBaseValues', () => {
    const field = {
      id: 'field-001',
      sectionId: 'sec-001',
      fieldType: 'text' as const,
      schemaName: 'full_name',
      label: 'Label',
      displayOrder: 1,
      columnSpan: 1 as const,
      isRequired: false,
      isReadonly: false,
      isHidden: false,
      isVisible: true,
      validationRules: [],
      businessRules: [],
    };
    const form = makeMinimalForm({
      tabs: [{
        id: 'tab-001', formDefinitionId: 'form-001', label: 'Tab',
        displayOrder: 1, isVisible: true, requiresPreviousTabComplete: false,
        sections: [{ id: 'sec-001', tabId: 'tab-001', label: 'S', displayOrder: 1,
          columns: 2 as const, isCollapsible: false, isCollapsedByDefault: false,
          isVisible: true, fields: [field] }],
      }],
    });
    const result = service.resolveTranslations(form, new Map());
    expect(result.tabs[0]?.sections[0]?.fields[0]?.placeholder).toBeUndefined();
    expect(result.tabs[0]?.sections[0]?.fields[0]?.tooltip).toBeUndefined();
  });

  it('resolveTranslations_options_appliesOptionTranslationsWhenOptionRecordIdPresent', () => {
    const field = {
      id: 'field-001',
      sectionId: 'sec-001',
      fieldType: 'dropdown' as const,
      schemaName: 'status',
      label: 'Status',
      displayOrder: 1,
      columnSpan: 1 as const,
      isRequired: false,
      isReadonly: false,
      isHidden: false,
      isVisible: true,
      options: [{
        value: 'active',
        label: 'Active',
        displayOrder: 1,
        isDefault: false,
        isActive: true,
        optionRecordId: 'opt-rec-001',
      }],
      validationRules: [],
      businessRules: [],
    };
    const form = makeMinimalForm({
      tabs: [{
        id: 'tab-001', formDefinitionId: 'form-001', label: 'Tab',
        displayOrder: 1, isVisible: true, requiresPreviousTabComplete: false,
        sections: [{ id: 'sec-001', tabId: 'tab-001', label: 'S', displayOrder: 1,
          columns: 2 as const, isCollapsible: false, isCollapsedByDefault: false,
          isVisible: true, fields: [field] }],
      }],
    });
    const map: TranslationMap = new Map([
      ['qdb_form_option_value:opt-rec-001:qdb_label', 'نشط'],
    ]);
    const result = service.resolveTranslations(form, map);
    expect(result.tabs[0]?.sections[0]?.fields[0]?.options?.[0]?.label).toBe('نشط');
  });

  it('resolveTranslations_options_skipsOptionTranslationWhenNoOptionRecordId', () => {
    const field = {
      id: 'field-001',
      sectionId: 'sec-001',
      fieldType: 'dropdown' as const,
      schemaName: 'status',
      label: 'Status',
      displayOrder: 1,
      columnSpan: 1 as const,
      isRequired: false,
      isReadonly: false,
      isHidden: false,
      isVisible: true,
      options: [{ value: 'active', label: 'Active', displayOrder: 1, isDefault: false, isActive: true }],
      validationRules: [],
      businessRules: [],
    };
    const form = makeMinimalForm({
      tabs: [{
        id: 'tab-001', formDefinitionId: 'form-001', label: 'Tab',
        displayOrder: 1, isVisible: true, requiresPreviousTabComplete: false,
        sections: [{ id: 'sec-001', tabId: 'tab-001', label: 'S', displayOrder: 1,
          columns: 2 as const, isCollapsible: false, isCollapsedByDefault: false,
          isVisible: true, fields: [field] }],
      }],
    });
    // translation exists but no optionRecordId → label stays English
    const map: TranslationMap = new Map([
      ['qdb_form_option_value:undefined:qdb_label', 'نشط'],
    ]);
    const result = service.resolveTranslations(form, map);
    expect(result.tabs[0]?.sections[0]?.fields[0]?.options?.[0]?.label).toBe('Active');
  });

  it('resolveTranslations_validationRules_appliesErrorMessageTranslation', () => {
    const field = {
      id: 'field-001',
      sectionId: 'sec-001',
      fieldType: 'text' as const,
      schemaName: 'name',
      label: 'Name',
      displayOrder: 1,
      columnSpan: 1 as const,
      isRequired: true,
      isReadonly: false,
      isHidden: false,
      isVisible: true,
      validationRules: [{
        id: 'rule-001',
        fieldId: 'field-001',
        ruleType: 'required' as const,
        errorMessage: 'This field is required',
        isActive: true,
        priority: 100,
      }],
      businessRules: [],
    };
    const form = makeMinimalForm({
      tabs: [{
        id: 'tab-001', formDefinitionId: 'form-001', label: 'Tab',
        displayOrder: 1, isVisible: true, requiresPreviousTabComplete: false,
        sections: [{ id: 'sec-001', tabId: 'tab-001', label: 'S', displayOrder: 1,
          columns: 2 as const, isCollapsible: false, isCollapsedByDefault: false,
          isVisible: true, fields: [field] }],
      }],
    });
    const map: TranslationMap = new Map([
      ['qdb_form_validation_rule:rule-001:qdb_error_message', 'هذا الحقل مطلوب'],
    ]);
    const result = service.resolveTranslations(form, map);
    expect(result.tabs[0]?.sections[0]?.fields[0]?.validationRules[0]?.errorMessage).toBe('هذا الحقل مطلوب');
  });

  it('resolveTranslations_buttons_appliesLabelAndConfirmationMessage', () => {
    const form = makeMinimalForm({
      buttons: [{
        id: 'btn-001',
        formDefinitionId: 'form-001',
        label: 'Submit',
        action: 'submit',
        displayOrder: 1,
        isVisible: true,
        isPrimary: true,
        confirmationRequired: true,
        confirmationMessage: 'Are you sure?',
        isActive: true,
      }],
    });
    const map: TranslationMap = new Map([
      ['qdb_form_button:btn-001:qdb_label', 'إرسال'],
      ['qdb_form_button:btn-001:qdb_confirmation_message', 'هل أنت متأكد؟'],
    ]);
    const result = service.resolveTranslations(form, map);
    expect(result.buttons[0]?.label).toBe('إرسال');
    expect(result.buttons[0]?.confirmationMessage).toBe('هل أنت متأكد؟');
  });

  it('resolveTranslations_infocardScreens_appliesAllStringTypes', () => {
    const form = makeMinimalForm({
      infoCards: [{
        screenId: 'screen-001',
        displayOrder: 1,
        iconUrl: null,
        iconAltText: 'Icon',
        heading: 'Welcome',
        subHeading: 'Please read',
        sections: [{
          sectionId: 'ic-sec-001',
          displayOrder: 1,
          sectionTitle: 'Steps',
          sectionType: 'numbered-steps',
          noteText: 'Note here',
          items: [{
            itemId: 'item-001',
            displayOrder: 1,
            itemTitle: 'Step 1',
            itemDescription: 'Do this',
            iconReference: null,
            downloadUrl: null,
          }],
        }],
      }],
    });
    const map: TranslationMap = new Map([
      ['qdb_info_card_screen:screen-001:qdb_heading', 'مرحباً'],
      ['qdb_info_card_screen:screen-001:qdb_sub_heading', 'يرجى القراءة'],
      ['qdb_info_card_screen:screen-001:qdb_icon_alt_text', 'أيقونة'],
      ['qdb_info_card_section:ic-sec-001:qdb_section_title', 'الخطوات'],
      ['qdb_info_card_section:ic-sec-001:qdb_note_text', 'ملاحظة هنا'],
      ['qdb_info_card_item:item-001:qdb_item_title', 'الخطوة 1'],
      ['qdb_info_card_item:item-001:qdb_item_description', 'افعل هذا'],
    ]);
    const result = service.resolveTranslations(form, map);
    const screen = result.infoCards[0];
    expect(screen?.heading).toBe('مرحباً');
    expect(screen?.subHeading).toBe('يرجى القراءة');
    expect(screen?.sections[0]?.sectionTitle).toBe('الخطوات');
    expect(screen?.sections[0]?.items[0]?.itemTitle).toBe('الخطوة 1');
    expect(screen?.sections[0]?.items[0]?.itemDescription).toBe('افعل هذا');
  });

  it('resolveTranslations_gridColumns_appliesColumnLabelTranslation', () => {
    const field = {
      id: 'field-001',
      sectionId: 'sec-001',
      fieldType: 'interactive-grid' as const,
      schemaName: 'grid_field',
      label: 'Grid',
      displayOrder: 1,
      columnSpan: 4 as const,
      isRequired: false,
      isReadonly: false,
      isHidden: false,
      isVisible: true,
      validationRules: [],
      businessRules: [],
      gridConfig: {
        gridMode: 'entry' as const,
        targetEntity: 'contact',
        maxRows: 10,
        columnConfigs: [{
          columnId: 'col-001',
          displayOrder: 1,
          columnLabel: 'Name',
          targetAttribute: 'fullname',
          columnFieldType: 'text',
          filterType: 'text' as const,
        }],
      },
    };
    const form = makeMinimalForm({
      tabs: [{
        id: 'tab-001', formDefinitionId: 'form-001', label: 'Tab',
        displayOrder: 1, isVisible: true, requiresPreviousTabComplete: false,
        sections: [{ id: 'sec-001', tabId: 'tab-001', label: 'S', displayOrder: 1,
          columns: 2 as const, isCollapsible: false, isCollapsedByDefault: false,
          isVisible: true, fields: [field] }],
      }],
    });
    const map: TranslationMap = new Map([
      ['qdb_grid_column_config:col-001:qdb_column_label', 'الاسم'],
    ]);
    const result = service.resolveTranslations(form, map);
    const col = result.tabs[0]?.sections[0]?.fields[0]?.gridConfig?.columnConfigs[0];
    expect(col?.columnLabel).toBe('الاسم');
  });

  it('resolveTranslations_emptyTranslationMap_returnsEnglishFormUnchanged', () => {
    const form = makeMinimalForm();
    const result = service.resolveTranslations(form, new Map());
    expect(result.title).toBe('English Title');
    expect(result.description).toBe('English Description');
    expect(result.confirmationMessage).toBe('Thank you');
  });
});
