import type { IWebApiAdapter } from './IWebApiAdapter';
import { ENTITY_NAMES } from '@/constants/entityNames';
import type { DesignerState } from '@/state/designerStore';
import { FormDefinitionService } from './FormDefinitionService';
import { TabService } from './TabService';
import { SectionService } from './SectionService';
import { FieldService } from './FieldService';
import { OptionValueService } from './OptionValueService';
import { LookupConfigService } from './LookupConfigService';
import { ValidationRuleService } from './ValidationRuleService';
import { BusinessRuleService } from './BusinessRuleService';
import { AuditLogService } from './AuditLogService';
import { GridColumnConfigService } from './GridColumnConfigService';
import type { CrmUserContext } from './CrmContextService';
import { withRetry } from './crmRetry';

const OPTION_FIELD_TYPES = new Set(['dropdown', 'multi_select', 'radio']);
const LOOKUP_FIELD_TYPES = new Set(['lookup', 'child_entity_grid']);
const GRID_FIELD_TYPES = new Set(['repeating_grid', 'interactive-grid']);

type SaveableState = Pick<
  DesignerState,
  | 'form'
  | 'tabs'
  | 'sections'
  | 'fields'
  | 'tabOrder'
  | 'sectionOrder'
  | 'fieldOrder'
  | 'newIds'
  | 'dirtyIds'
  | 'deletedIds'
  | 'deletedEntityTypes'
  | 'validationRules'
  | 'businessRules'
>;

export interface FormSaveResult {
  resolvedIds: Record<string, string>;
}

export class FormSaveService {
  private readonly formService: FormDefinitionService;
  private readonly tabService: TabService;
  private readonly sectionService: SectionService;
  private readonly fieldService: FieldService;
  private readonly optionService: OptionValueService;
  private readonly lookupService: LookupConfigService;
  private readonly validationRuleService: ValidationRuleService;
  private readonly businessRuleService: BusinessRuleService;
  private readonly gridColumnService: GridColumnConfigService;

  constructor(
    private readonly webApi: IWebApiAdapter,
    private readonly userContext: CrmUserContext
  ) {
    this.formService = new FormDefinitionService(webApi);
    this.tabService = new TabService(webApi);
    this.sectionService = new SectionService(webApi);
    this.fieldService = new FieldService(webApi);
    this.optionService = new OptionValueService(webApi);
    this.lookupService = new LookupConfigService(webApi);
    this.validationRuleService = new ValidationRuleService(webApi);
    this.businessRuleService = new BusinessRuleService(webApi);
    this.gridColumnService = new GridColumnConfigService(webApi);
  }

  async save(state: SaveableState): Promise<FormSaveResult> {
    const { form, tabs, sections, fields, tabOrder, sectionOrder, fieldOrder, newIds, dirtyIds, deletedIds, deletedEntityTypes, validationRules, businessRules } = state;
    if (!form) throw new Error('No form loaded');

    const resolvedIds: Record<string, string> = {};
    const newIdSet = new Set(newIds);
    const deletedIdSet = new Set(deletedIds);

    // Step 1: Create new tabs in display order
    for (const tempTabId of tabOrder.filter(id => newIdSet.has(id))) {
      const tab = tabs[tempTabId];
      if (!tab) continue;
      const realId = await this.tabService.createTab({
        formId: form.id,
        label: tab.label,
        sortOrder: tab.sortOrder,
        iconName: tab.iconName,
        isVisible: tab.isVisible,
        requiresPreviousTabComplete: tab.requiresPreviousTabComplete,
      });
      resolvedIds[tempTabId] = realId;
    }

    // Step 2: Create new sections (resolve temp tab IDs)
    const allTabIds = [...new Set([...tabOrder, ...Object.keys(sectionOrder)])];
    for (const tabId of allTabIds) {
      const realTabId = resolvedIds[tabId] ?? tabId;
      const sectionsInTab = sectionOrder[tabId] ?? [];
      for (const tempSectionId of sectionsInTab.filter(id => newIdSet.has(id))) {
        const section = sections[tempSectionId];
        if (!section) continue;
        const realId = await this.sectionService.createSection({
          tabId: realTabId,
          label: section.label,
          description: section.description,
          columnCount: section.columnCount,
          isCollapsible: section.isCollapsible,
          isExpandedByDefault: section.isExpandedByDefault,
          isVisible: section.isVisible,
          sortOrder: section.sortOrder,
        });
        resolvedIds[tempSectionId] = realId;
      }
    }

    // Step 3: Create new fields (resolve temp section IDs)
    for (const sectionId of Object.keys(fieldOrder)) {
      const realSectionId = resolvedIds[sectionId] ?? sectionId;
      const fieldsInSection = fieldOrder[sectionId] ?? [];
      for (const tempFieldId of fieldsInSection.filter(id => newIdSet.has(id))) {
        const field = fields[tempFieldId];
        if (!field) continue;
        const realId = await this.fieldService.createField({
          sectionId: realSectionId,
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
          boolRenderStyle: field.boolRenderStyle,
          trueLabel: field.trueLabel,
          falseLabel: field.falseLabel,
          infoCardStyle: field.infoCardStyle,
          infoCardTitle: field.infoCardTitle,
          infoCardBody: field.infoCardBody,
          infoCardIcon: field.infoCardIcon,
          gridMode: field.gridMode,
          gridEntityName: field.gridEntityName,
          gridSelectionMode: field.gridSelectionMode,
          gridMinRows: field.gridMinRows,
          gridSavedViewId: field.gridSavedViewId,
          gridFilterExpression: field.gridFilterExpression,
          gridDependsOnFieldId: field.gridDependsOnFieldId,
          gridDependsOnFilterTemplate: field.gridDependsOnFilterTemplate,
        });
        resolvedIds[tempFieldId] = realId;

        // Step 3b: Create options for new dropdown/multi_select/radio fields
        if (OPTION_FIELD_TYPES.has(field.fieldType) && field.options.length > 0) {
          for (const option of field.options) {
            await this.optionService.createOption({
              fieldId: realId,
              label: option.label,
              value: option.value,
              sortOrder: option.sortOrder,
              isDefault: option.isDefault,
            });
          }
        }

        // Step 3c: Create lookup config for new lookup fields
        if (LOOKUP_FIELD_TYPES.has(field.fieldType) && field.lookupConfig?.targetEntity) {
          await this.lookupService.upsertLookupConfig({
            fieldId: realId,
            targetEntity: field.lookupConfig.targetEntity,
            displayField: field.lookupConfig.displayField,
            valueField: field.lookupConfig.valueField,
            filterQuery: field.lookupConfig.filterQuery,
            searchMinChars: field.lookupConfig.searchMinChars,
            maxResults: field.lookupConfig.maxResults,
          });
        }

        // Step 3d: Sync grid columns for new grid fields
        if (GRID_FIELD_TYPES.has(field.fieldType) && field.gridColumns.length > 0) {
          await this.gridColumnService.syncColumns(realId, field.gridColumns);
        }

        // Step 3e: Create validation rules for new fields
        const fieldRules = Object.values(validationRules).filter(r => r.fieldId === tempFieldId);
        for (const rule of fieldRules) {
          await this.validationRuleService.createRule({
            fieldId: realId,
            ruleType: rule.ruleType,
            ruleValue: rule.ruleValue,
            errorMessage: rule.errorMessage,
            sortOrder: rule.sortOrder,
          });
        }
      }
    }

    // Step 4: Update dirty non-new items
    const dirtyNonNew = dirtyIds.filter(id => !newIdSet.has(id) && !deletedIdSet.has(id));
    for (const id of dirtyNonNew) {
      if (tabs[id]) {
        const tab = tabs[id];
        await this.tabService.updateTab(id, {
          label: tab.label,
          sortOrder: tab.sortOrder,
          iconName: tab.iconName,
          isVisible: tab.isVisible,
          requiresPreviousTabComplete: tab.requiresPreviousTabComplete,
        });
      } else if (sections[id]) {
        const section = sections[id];
        await this.sectionService.updateSection(id, {
          label: section.label,
          description: section.description,
          columnCount: section.columnCount,
          isCollapsible: section.isCollapsible,
          isExpandedByDefault: section.isExpandedByDefault,
          isVisible: section.isVisible,
          sortOrder: section.sortOrder,
        });
      } else if (fields[id]) {
        const field = fields[id];
        await this.fieldService.updateField(id, {
          label: field.label,
          code: field.code,
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
          boolRenderStyle: field.boolRenderStyle,
          trueLabel: field.trueLabel,
          falseLabel: field.falseLabel,
          infoCardStyle: field.infoCardStyle,
          infoCardTitle: field.infoCardTitle,
          infoCardBody: field.infoCardBody,
          infoCardIcon: field.infoCardIcon,
          gridMode: field.gridMode,
          gridEntityName: field.gridEntityName,
          gridSelectionMode: field.gridSelectionMode,
          gridMinRows: field.gridMinRows,
          gridSavedViewId: field.gridSavedViewId,
          gridFilterExpression: field.gridFilterExpression,
          gridDependsOnFieldId: field.gridDependsOnFieldId,
          gridDependsOnFilterTemplate: field.gridDependsOnFilterTemplate,
        });

        // Step 4b: Sync options for dirty dropdown/multi_select/radio fields
        if (OPTION_FIELD_TYPES.has(field.fieldType)) {
          await this.optionService.syncOptions(id, field.options);
        }

        // Step 4c: Upsert lookup config for dirty lookup fields
        if (LOOKUP_FIELD_TYPES.has(field.fieldType) && field.lookupConfig?.targetEntity) {
          await this.lookupService.upsertLookupConfig({
            fieldId: id,
            targetEntity: field.lookupConfig.targetEntity,
            displayField: field.lookupConfig.displayField,
            valueField: field.lookupConfig.valueField,
            filterQuery: field.lookupConfig.filterQuery,
            searchMinChars: field.lookupConfig.searchMinChars,
            maxResults: field.lookupConfig.maxResults,
          });
        }

        // Step 4d: Sync grid columns for dirty grid fields
        if (GRID_FIELD_TYPES.has(field.fieldType)) {
          await this.gridColumnService.syncColumns(id, field.gridColumns);
        }

        // Step 4e: Sync validation rules for dirty fields
        const fieldRules = Object.values(validationRules).filter(r => r.fieldId === id);
        await this.validationRuleService.syncRules(id, fieldRules);
      }
    }

    // Step 5: Delete real (non-temp) CRM records that were removed from the canvas.
    // Use deletedEntityTypes (recorded at delete time) because the items are no longer
    // in the tabs/sections/fields maps by the time save() runs.
    const ENTITY_TYPE_MAP: Record<string, string> = {
      tab: ENTITY_NAMES.FORM_TAB,
      section: ENTITY_NAMES.FORM_SECTION,
      field: ENTITY_NAMES.FORM_FIELD,
    };

    const realDeletedIds = deletedIds.filter(id => !id.startsWith('tmp_'));
    for (const deletedId of realDeletedIds) {
      const entityType = deletedEntityTypes[deletedId];
      const entityName = entityType ? ENTITY_TYPE_MAP[entityType] : null;
      if (entityName) {
        await this.deleteById(deletedId, entityName);
      }
    }

    // Step 6: Sync business rules for the form
    if (form.id && !form.id.startsWith('tmp_')) {
      await this.businessRuleService.syncRules(form.id, Object.values(businessRules));
    }

    // Step 7: Update form definition header
    await this.formService.updateForm(form.id, {
      name: form.name,
      code: form.code,
      description: form.description,
      // entityLogicalName not written — field not deployed on qdb_form_definition
      allowSaveDraft: form.allowSaveDraft,
      draftExpiryDays: form.draftExpiryDays,
      powerAutomateFlowId: form.powerAutomateFlowId,
      confirmationMessage: form.confirmationMessage,
      confirmationRecordRefAttribute: form.confirmationRecordRefAttribute,
      accessGroupId: form.accessGroupId,
    });

    // Step 8: Write audit log
    const auditService = new AuditLogService(this.webApi, this.userContext);
    await auditService.logAction(form.id, 'SAVE_DRAFT', {
      fieldCount: Object.keys(fields).length,
      tabCount: tabOrder.length,
    });

    return { resolvedIds };
  }

  // entityTypeMap is built by save() so each ID resolves to the correct entity without
  // making multiple trial-and-error delete calls against the API.
  private async deleteById(id: string, entityName: string): Promise<void> {
    await withRetry(
      () => this.webApi.deleteRecord(entityName, id),
      `delete.${entityName}`
    );
  }
}
