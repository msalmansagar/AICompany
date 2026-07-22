import type { IWebApiAdapter } from './IWebApiAdapter';
import { FormDefinitionService } from './FormDefinitionService';
import { TabService } from './TabService';
import { SectionService } from './SectionService';
import { FieldService } from './FieldService';
import { OptionValueService } from './OptionValueService';
import { LookupConfigService } from './LookupConfigService';
import { ValidationRuleService } from './ValidationRuleService';

const OPTION_FIELD_TYPES = new Set(['dropdown', 'multi_select', 'radio']);
const LOOKUP_FIELD_TYPES = new Set(['lookup', 'child_entity_grid']);

export class FormCloneService {
  private readonly formService: FormDefinitionService;
  private readonly tabService: TabService;
  private readonly sectionService: SectionService;
  private readonly fieldService: FieldService;
  private readonly optionService: OptionValueService;
  private readonly lookupService: LookupConfigService;
  private readonly ruleService: ValidationRuleService;

  constructor(webApi: IWebApiAdapter) {
    this.formService = new FormDefinitionService(webApi);
    this.tabService = new TabService(webApi);
    this.sectionService = new SectionService(webApi);
    this.fieldService = new FieldService(webApi);
    this.optionService = new OptionValueService(webApi);
    this.lookupService = new LookupConfigService(webApi);
    this.ruleService = new ValidationRuleService(webApi);
  }

  async cloneForm(sourceFormId: string): Promise<string> {
    const source = await this.formService.getForm(sourceFormId);

    const newFormId = await this.formService.createForm({
      name: `${source.name} — Copy`,
      code: `${source.code}_copy_${Date.now()}`,
      description: source.description,
      entityLogicalName: source.entityLogicalName,
      themeId: source.themeId,
    });

    const tabs = await this.tabService.listTabsForForm(sourceFormId);
    for (const tab of tabs) {
      const newTabId = await this.tabService.createTab({
        formId: newFormId,
        label: tab.label,
        sortOrder: tab.sortOrder,
        iconName: tab.iconName,
        isVisible: tab.isVisible,
        requiresPreviousTabComplete: tab.requiresPreviousTabComplete,
      });

      const sections = await this.sectionService.listSectionsForTab(tab.id);
      for (const section of sections) {
        const newSectionId = await this.sectionService.createSection({
          tabId: newTabId,
          label: section.label,
          description: section.description,
          columnCount: section.columnCount,
          isCollapsible: section.isCollapsible,
          isExpandedByDefault: section.isExpandedByDefault,
          isVisible: section.isVisible,
          sortOrder: section.sortOrder,
        });

        const fields = await this.fieldService.listFieldsForSection(section.id);
        for (const field of fields) {
          const newFieldId = await this.fieldService.createField({
            sectionId: newSectionId,
            label: field.label,
            code: field.code,
            fieldType: field.fieldType,
            placeholder: field.placeholder,
            helpText: field.helpText,
            isRequired: field.isRequired,
            isReadOnly: field.isReadOnly,
            isHidden: field.isHidden,
            defaultValue: field.defaultValue,
            sortOrder: field.sortOrder,
            columnSpan: field.columnSpan,
            currencyCode: field.currencyCode,
            decimalPlaces: field.decimalPlaces,
            maxRows: field.maxRows,
            gridPageSize: field.gridPageSize,
            gridPagingStyle: field.gridPagingStyle,
          });

          await Promise.all([
            OPTION_FIELD_TYPES.has(field.fieldType) ? this.cloneOptions(field.id, newFieldId) : Promise.resolve(),
            LOOKUP_FIELD_TYPES.has(field.fieldType) ? this.cloneLookupConfig(field.id, newFieldId) : Promise.resolve(),
            this.cloneValidationRules(field.id, newFieldId),
          ]);
        }
      }
    }

    return newFormId;
  }

  private async cloneOptions(sourceFieldId: string, newFieldId: string): Promise<void> {
    const options = await this.optionService.listOptionsForField(sourceFieldId);
    await Promise.all(
      options.map(opt =>
        this.optionService.createOption({
          fieldId: newFieldId,
          label: opt.label,
          value: opt.value,
          sortOrder: opt.sortOrder,
          isDefault: opt.isDefault,
        })
      )
    );
  }

  private async cloneLookupConfig(sourceFieldId: string, newFieldId: string): Promise<void> {
    const config = await this.lookupService.getLookupConfigForField(sourceFieldId);
    if (!config) return;
    await this.lookupService.upsertLookupConfig({
      fieldId: newFieldId,
      targetEntity: config.targetEntity,
      displayField: config.displayField,
      valueField: config.valueField,
      filterQuery: config.filterQuery,
      searchMinChars: config.searchMinChars,
      maxResults: config.maxResults,
    });
  }

  private async cloneValidationRules(sourceFieldId: string, newFieldId: string): Promise<void> {
    const rules = await this.ruleService.listRulesForField(sourceFieldId);
    await Promise.all(
      rules.map(rule =>
        this.ruleService.createRule({
          fieldId: newFieldId,
          ruleType: rule.ruleType,
          ruleValue: rule.ruleValue,
          errorMessage: rule.errorMessage,
          sortOrder: rule.sortOrder,
        })
      )
    );
  }
}
