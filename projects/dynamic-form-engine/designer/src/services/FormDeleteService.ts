import type { IWebApiAdapter } from './IWebApiAdapter';
import { assertGuid } from './assertGuid';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { FORM_TAB_ATTRS, FORM_SECTION_ATTRS, FORM_FIELD_ATTRS } from '@/constants/attributeNames';
import { withRetry } from './crmRetry';

export class FormDeleteService {
  constructor(private readonly webApi: IWebApiAdapter) {}

  async deleteForm(formId: string): Promise<void> {
    assertGuid(formId, 'formId');
    const tabs = await this.listTabIds(formId);

    const sectionIdArrays = await Promise.all(tabs.map(tabId => this.listSectionIds(tabId)));
    const sections = sectionIdArrays.flat();

    const fieldIdArrays = await Promise.all(sections.map(sectionId => this.listFieldIds(sectionId)));
    const fieldIds = fieldIdArrays.flat();

    // Delete leaves first, then parents — CRM cascades options/lookupConfig/validationRules if configured
    await Promise.all(fieldIds.map(id => this.safeDelete(ENTITY_NAMES.FORM_FIELD, id)));
    await Promise.all(sections.map(id => this.safeDelete(ENTITY_NAMES.FORM_SECTION, id)));
    await Promise.all(tabs.map(id => this.safeDelete(ENTITY_NAMES.FORM_TAB, id)));

    await withRetry(
      () => this.webApi.deleteRecord(ENTITY_NAMES.FORM_DEFINITION, formId),
      'deleteFormDefinition'
    );
  }

  private async listTabIds(formId: string): Promise<string[]> {
    const result = await withRetry(
      () =>
        this.webApi.retrieveMultipleRecords(
          ENTITY_NAMES.FORM_TAB,
          `?$select=${FORM_TAB_ATTRS.ID}&$filter=${FORM_TAB_ATTRS.FORM_ID_VALUE} eq ${formId}`
        ),
      'deleteForm.listTabs'
    );
    return result.entities.map(r => String(r[FORM_TAB_ATTRS.ID] ?? ''));
  }

  private async listSectionIds(tabId: string): Promise<string[]> {
    const result = await withRetry(
      () =>
        this.webApi.retrieveMultipleRecords(
          ENTITY_NAMES.FORM_SECTION,
          `?$select=${FORM_SECTION_ATTRS.ID}&$filter=${FORM_SECTION_ATTRS.TAB_ID_VALUE} eq ${tabId}`
        ),
      'deleteForm.listSections'
    );
    return result.entities.map(r => String(r[FORM_SECTION_ATTRS.ID] ?? ''));
  }

  private async listFieldIds(sectionId: string): Promise<string[]> {
    const result = await withRetry(
      () =>
        this.webApi.retrieveMultipleRecords(
          ENTITY_NAMES.FORM_FIELD,
          `?$select=${FORM_FIELD_ATTRS.ID}&$filter=${FORM_FIELD_ATTRS.SECTION_ID_VALUE} eq ${sectionId}`
        ),
      'deleteForm.listFields'
    );
    return result.entities.map(r => String(r[FORM_FIELD_ATTRS.ID] ?? ''));
  }

  private async safeDelete(entityName: string, id: string): Promise<void> {
    if (!id) return;
    try {
      await withRetry(() => this.webApi.deleteRecord(entityName, id), `safeDelete.${entityName}`);
    } catch {
      // Swallow — record may already be deleted or not found
    }
  }
}
