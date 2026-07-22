import type { IWebApiAdapter } from './IWebApiAdapter';
import { ENTITY_NAMES } from '@/constants/entityNames';
import type { DesignerState } from '@/state/designerStore';
import { ConcurrencyConflictError } from './concurrency/ConcurrencyConflictError';
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
import { DesignService } from './DesignService';
import type { CrmUserContext } from './CrmContextService';
import type { DesignPayload } from '@qdb/shared';
import { withRetry } from './crmRetry';

/** Resolves a temp id to its server-assigned id (or returns it unchanged). */
function resolveRealId(id: string, resolvedIds: Record<string, string>): string {
  return resolvedIds[id] ?? id;
}

// DFE-TABZONE-001: a header/footer field targets the tab that owns its section
// (temp ids resolved to real). Body fields have no zone tab.
function resolveZoneTabId(
  field: { placement?: 'header' | 'footer' | 'body'; tabId?: string | null; sectionId: string },
  sections: Record<string, { tabId: string }>,
  resolvedIds: Record<string, string>,
): string | null {
  if (!field.placement || field.placement === 'body') return null;
  const rawTabId = field.tabId ?? sections[field.sectionId]?.tabId;
  return rawTabId ? resolveRealId(rawTabId, resolvedIds) : null;
}

/** True when the (resolved) id refers to a persisted, non-deleted record. */
function isPersistableId(id: string, resolvedIds: Record<string, string>, deleted: Set<string>): boolean {
  return !deleted.has(id) && !resolveRealId(id, resolvedIds).startsWith('tmp_');
}

function asJson(value: Record<string, string> | undefined): string | undefined {
  return value ? JSON.stringify(value) : undefined;
}

export class PartialSaveError extends Error {
  constructor(
    public readonly resolvedIds: Record<string, string>,
    public readonly resolvedThemeId: string | null,
    public readonly cause: unknown,
  ) {
    // { cause } ErrorOptions requires ES2022 lib — tsconfig targets ES2020 so we
    // store cause as an own property and pass only the message to the base class.
    super(cause instanceof Error ? cause.message : 'Save failed');
  }
}

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
  | 'designPayload'
> & {
  /**
   * Current @odata.etag for the qdb_form_definition record, held in
   * concurrencyStore.recordEtags[form.id] and captured at save-start time.
   * Required for the conditional PATCH (If-Match) — FormDefinitionService.updateForm
   * throws MissingEtagError when this is absent.
   * Populated after the first getFormWithEtag() call during form load.
   */
  formEtag: string;
};

export interface FormSaveResult {
  resolvedIds: Record<string, string>;
  resolvedThemeId: string | null;
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
  private readonly designService: DesignService;

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
    this.designService = new DesignService(webApi);
  }

  async save(state: SaveableState): Promise<FormSaveResult> {
    const { form, tabs, sections, fields, tabOrder, sectionOrder, fieldOrder, newIds, dirtyIds, deletedIds, deletedEntityTypes, validationRules, businessRules, designPayload, formEtag } = state;
    if (!form) throw new Error('No form loaded');

    const resolvedIds: Record<string, string> = {};
    let resolvedThemeId: string | null = null;
    const newIdSet = new Set(newIds);
    const deletedIdSet = new Set(deletedIds);

    try {
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
        hideTabBar: tab.hideTabBar,
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
          // DFE-TABZONE-001: header/footer placement + the tab whose zone it renders in.
          placement: field.placement ?? 'body',
          tabId: resolveZoneTabId(field, sections, resolvedIds),
          currencyCode: field.currencyCode,
          decimalPlaces: field.decimalPlaces,
          maxRows: field.maxRows,
          maxFiles: field.maxFiles,
          boolRenderStyle: field.boolRenderStyle,
          trueLabel: field.trueLabel,
          falseLabel: field.falseLabel,
          infoCardStyle: field.infoCardStyle,
          infoCardTitle: field.infoCardTitle,
          infoCardBody: field.infoCardBody,
          infoCardIcon: field.infoCardIcon,
          infoCardDownloadUrl: field.infoCardDownloadUrl,
          infoCardDownloadLabel: field.infoCardDownloadLabel,
          prefix: field.prefix,
          suffix: field.suffix,
          gridMode: field.gridMode,
          gridEntityName: field.gridEntityName,
          gridSelectionMode: field.gridSelectionMode,
          gridMinRows: field.gridMinRows,
          gridSavedViewId: field.gridSavedViewId,
          gridFilterExpression: field.gridFilterExpression,
          gridDependsOnFieldId: field.gridDependsOnFieldId,
          gridDependsOnFilterTemplate: field.gridDependsOnFilterTemplate,
          gridDataSource: field.gridDataSource,
          gridJsonData: field.gridJsonData,
          gridDisplayMode: field.gridDisplayMode,
          gridViewMode: field.gridViewMode,
          gridCardLayout: field.gridCardLayout,
          gridSelectable: field.gridSelectable,
          gridCardIcon: field.gridCardIcon,
          gridPageSize: field.gridPageSize,
          gridPagingStyle: field.gridPagingStyle,
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
          hideTabBar: tab.hideTabBar,
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
          // DFE-TABZONE-001: header/footer placement + the tab whose zone it renders in.
          placement: field.placement ?? 'body',
          tabId: resolveZoneTabId(field, sections, resolvedIds),
          currencyCode: field.currencyCode,
          decimalPlaces: field.decimalPlaces,
          maxRows: field.maxRows,
          maxFiles: field.maxFiles,
          boolRenderStyle: field.boolRenderStyle,
          trueLabel: field.trueLabel,
          falseLabel: field.falseLabel,
          infoCardStyle: field.infoCardStyle,
          infoCardTitle: field.infoCardTitle,
          infoCardBody: field.infoCardBody,
          infoCardIcon: field.infoCardIcon,
          infoCardDownloadUrl: field.infoCardDownloadUrl,
          infoCardDownloadLabel: field.infoCardDownloadLabel,
          prefix: field.prefix,
          suffix: field.suffix,
          gridMode: field.gridMode,
          gridEntityName: field.gridEntityName,
          gridSelectionMode: field.gridSelectionMode,
          gridMinRows: field.gridMinRows,
          gridSavedViewId: field.gridSavedViewId,
          gridFilterExpression: field.gridFilterExpression,
          gridDependsOnFieldId: field.gridDependsOnFieldId,
          gridDependsOnFilterTemplate: field.gridDependsOnFilterTemplate,
          gridDataSource: field.gridDataSource,
          gridJsonData: field.gridJsonData,
          gridDisplayMode: field.gridDisplayMode,
          gridViewMode: field.gridViewMode,
          gridCardLayout: field.gridCardLayout,
          gridSelectable: field.gridSelectable,
          gridCardIcon: field.gridCardIcon,
          gridPageSize: field.gridPageSize,
          gridPagingStyle: field.gridPagingStyle,
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

      // Step 7: Update form definition header with conditional PATCH (If-Match: formEtag).
      // ConcurrencyConflictError propagates out of save() when Dataverse returns 412.
      await this.formService.updateForm(form.id, {
        name: form.name,
        code: form.code,
        description: form.description,
        allowSaveDraft: form.allowSaveDraft,
        draftExpiryDays: form.draftExpiryDays,
        showSummaryStep: form.showSummaryStep,
        summaryMode: form.summaryMode,
        showProgressBar: form.showProgressBar,
        powerAutomateFlowId: form.powerAutomateFlowId,
        confirmationMessage: form.confirmationMessage,
        confirmationRecordRefAttribute: form.confirmationRecordRefAttribute,
        accessGroupId: form.accessGroupId,
      }, formEtag);

      // Step 8: Save theme and form design
      if (form.id && !form.id.startsWith('tmp_') && designPayload) {
        const { theme, formDesign } = designPayload;
        resolvedThemeId = await this.designService.upsertTheme(
          {
            name: theme.themeName,
            themeCode: theme.themeCode,
            primaryColor: theme.primaryColor,
            secondaryColor: theme.secondaryColor,
            backgroundColor: theme.backgroundColor,
            fontFamily: theme.fontFamily,
            baseFontSize: theme.baseFontSize,
            borderRadius: theme.borderRadius,
            isDarkMode: theme.isDarkMode,
          },
          theme.id || undefined,
        );
        const formDesignId = await this.designService.upsertFormDesign({
          formId: form.id,
          themeId: resolvedThemeId,
          customCss: formDesign.customCss ?? '',
          layoutType: formDesign.layoutType,
          labelPosition: formDesign.labelPosition,
          buttonStyle: formDesign.buttonStyle,
          tabStyle: formDesign.tabStyle,
          alignment: formDesign.alignment,
          sectionStyle: formDesign.sectionStyle,
          animationEnabled: formDesign.animationEnabled,
          stickyActionBar: formDesign.stickyActionBar,
          skeletonLoaderEnabled: formDesign.skeletonLoaderEnabled,
        });

        // Persist per-element design (section/field/button/responsive). These link to the
        // real (resolved) section/field ids; deleted/unresolved-temp ids are skipped.
        await this.persistElementDesigns(form.id, formDesignId, designPayload, resolvedIds, deletedIdSet);
      }

      // Step 9: Write audit log
      const auditService = new AuditLogService(this.webApi, this.userContext);
      await auditService.logAction(form.id, 'SAVE_DRAFT', {
        fieldCount: Object.keys(fields).length,
        tabCount: tabOrder.length,
      });

      // BR-012: record a style-change audit entry for the persisted design (theme +
      // form design). The CSS content itself is never logged — only a changed flag.
      if (form.id && !form.id.startsWith('tmp_') && designPayload) {
        await auditService.logAction(form.id, 'STYLE_CHANGE', {
          styleEntities: ['theme', 'formDesign', 'sectionDesigns', 'fieldDesigns', 'buttonDesigns', 'layoutGrid'],
          customCssChanged: Boolean(designPayload.formDesign.customCss),
        });
      }

      return { resolvedIds, resolvedThemeId };
    } catch (error) {
      // 412 conflicts must propagate unwrapped so DesignerScreen's onError can
      // instanceof-check ConcurrencyConflictError and open the conflict dialog.
      // Wrapping it in PartialSaveError would make that check always false (B-1).
      if (error instanceof ConcurrencyConflictError) throw error;
      // All other errors carry partial-progress context for duplicate-create prevention.
      throw new PartialSaveError(resolvedIds, resolvedThemeId, error);
    }
  }

  // entityTypeMap is built by save() so each ID resolves to the correct entity without
  // making multiple trial-and-error delete calls against the API.
  private async deleteById(id: string, entityName: string): Promise<void> {
    await withRetry(
      () => this.webApi.deleteRecord(entityName, id),
      `delete.${entityName}`
    );
  }

  // Persists per-element design from the DesignPayload. Each design record links to the
  // real (resolved) section/field id; entries for deleted or unresolved-temp ids are skipped.
  private async persistElementDesigns(
    formId: string,
    formDesignId: string,
    designPayload: DesignPayload,
    resolvedIds: Record<string, string>,
    deletedIdSet: Set<string>,
  ): Promise<void> {
    await this.persistSectionDesigns(designPayload, resolvedIds, deletedIdSet);
    await this.persistFieldDesigns(designPayload, resolvedIds, deletedIdSet);
    await this.persistButtonDesigns(formId, designPayload);
    await this.persistLayoutGrids(formDesignId, designPayload, resolvedIds, deletedIdSet);
  }

  private async persistSectionDesigns(
    designPayload: DesignPayload, resolvedIds: Record<string, string>, deleted: Set<string>,
  ): Promise<void> {
    for (const [sectionId, sd] of Object.entries(designPayload.sectionDesigns)) {
      if (!isPersistableId(sectionId, resolvedIds, deleted)) continue;
      await this.designService.upsertSectionDesign({
        sectionId: resolveRealId(sectionId, resolvedIds),
        cssClass: sd.cssClassName,
        backgroundColor: sd.backgroundColor, borderStyle: sd.borderStyle,
        padding: sd.padding, margin: sd.margin, columnLayout: sd.columnLayout,
        cardStyle: sd.cardStyle, collapsibleStyle: sd.collapsibleStyle,
        visibilityAnimation: sd.visibilityAnimation, headerStyleJson: asJson(sd.headerStyle),
      });
    }
  }

  private async persistFieldDesigns(
    designPayload: DesignPayload, resolvedIds: Record<string, string>, deleted: Set<string>,
  ): Promise<void> {
    for (const [fieldId, fd] of Object.entries(designPayload.fieldDesigns)) {
      if (!isPersistableId(fieldId, resolvedIds, deleted)) continue;
      await this.designService.upsertFieldDesign({
        fieldId: resolveRealId(fieldId, resolvedIds),
        labelStyle: asJson(fd.labelStyle), inputStyle: fd.inputStyle,
        width: fd.width, customWidth: fd.customWidth, height: fd.height,
        iconPrefix: fd.iconPrefix, iconSuffix: fd.iconSuffix,
        focusStyleJson: asJson(fd.focusStyle), errorStyleJson: asJson(fd.errorStyle),
        disabledStyleJson: asJson(fd.disabledStyle), placeholderStyleJson: asJson(fd.placeholderStyle),
        tooltipStyleJson: asJson(fd.tooltipStyle), cssClass: fd.cssClassName,
      });
    }
  }

  private async persistButtonDesigns(formId: string, designPayload: DesignPayload): Promise<void> {
    for (const bd of Object.values(designPayload.buttonDesigns)) {
      if (!bd) continue;
      await this.designService.upsertButtonDesign({
        formId, buttonType: bd.buttonType, color: bd.color, size: bd.size,
        borderRadius: bd.borderRadius, alignment: bd.alignment, icon: bd.icon,
        hoverEffect: bd.hoverEffect, loadingStyle: bd.loadingStyle,
      });
    }
  }

  private async persistLayoutGrids(
    formDesignId: string, designPayload: DesignPayload, resolvedIds: Record<string, string>, deleted: Set<string>,
  ): Promise<void> {
    for (const lg of designPayload.layoutGrid) {
      if (!isPersistableId(lg.fieldId, resolvedIds, deleted)) continue;
      await this.designService.upsertLayoutGrid({
        formDesignId, fieldId: resolveRealId(lg.fieldId, resolvedIds),
        columnsTotal: lg.columnsTotal, spanMobile: lg.spanMobile,
        spanTablet: lg.spanTablet, spanDesktop: lg.spanDesktop,
      });
    }
  }
}
