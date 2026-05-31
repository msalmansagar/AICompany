import type { IWebApiAdapter } from './IWebApiAdapter';
import { ENTITY_NAMES } from '@/constants/entityNames';
import {
  FORM_DEFINITION_ATTRS,
  PICKLIST_TO_STATUS,
  STATUS_TO_PICKLIST,
} from '@/constants/attributeNames';
import type { DesignerFormModel, FormStatus } from '@/state/models/DesignerFormModel';
import { withRetry } from './crmRetry';

export interface CreateFormDto {
  name: string;
  code: string;
  description: string;
  entityLogicalName: string;
  themeId: string | null;
}

export interface UpdateFormDto {
  name?: string;
  code?: string;
  description?: string;
  entityLogicalName?: string | null;
  status?: FormStatus;
  currentVersion?: string;
  themeId?: string | null;
  allowSaveDraft?: boolean;
  draftExpiryDays?: number | null;
  powerAutomateFlowId?: string | null;
  confirmationMessage?: string | null;
  confirmationRecordRefAttribute?: string | null;
  accessGroupId?: string | null;
}

export interface FormSummary {
  id: string;
  name: string;
  code: string;
  status: FormStatus;
  currentVersion: string;
  modifiedOn: Date;
  modifiedBy: string;
}

export interface FormListFilter {
  status?: FormStatus;
  searchTerm?: string;
}

function picklistToStatus(raw: unknown): FormStatus {
  const n = typeof raw === 'number' ? raw : Number(raw);
  return (PICKLIST_TO_STATUS[n] ?? 'draft') as FormStatus;
}

function versionToString(raw: unknown): string {
  if (raw == null) return '1';
  const n = Number(raw);
  return isNaN(n) ? '1' : String(n);
}

export class FormDefinitionService {
  constructor(private readonly webApi: IWebApiAdapter) {}

  async createForm(dto: CreateFormDto): Promise<string> {
    const result = await withRetry(
      () =>
        this.webApi.createRecord(ENTITY_NAMES.FORM_DEFINITION, {
          [FORM_DEFINITION_ATTRS.NAME]: dto.name,
          [FORM_DEFINITION_ATTRS.CODE]: dto.code,
          [FORM_DEFINITION_ATTRS.DESCRIPTION]: dto.description,
          [FORM_DEFINITION_ATTRS.STATUS]: STATUS_TO_PICKLIST['draft'],
          [FORM_DEFINITION_ATTRS.CURRENT_VERSION]: 1,
          [FORM_DEFINITION_ATTRS.ALLOW_SAVE_DRAFT]: true,
        }),
      'createForm'
    );
    return result.id;
  }

  async updateForm(id: string, dto: UpdateFormDto): Promise<void> {
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data[FORM_DEFINITION_ATTRS.NAME] = dto.name;
    if (dto.code !== undefined) data[FORM_DEFINITION_ATTRS.CODE] = dto.code;
    if (dto.description !== undefined) data[FORM_DEFINITION_ATTRS.DESCRIPTION] = dto.description;
    if (dto.status !== undefined) {
      data[FORM_DEFINITION_ATTRS.STATUS] = STATUS_TO_PICKLIST[dto.status] ?? STATUS_TO_PICKLIST['draft'];
    }
    if (dto.currentVersion !== undefined) {
      data[FORM_DEFINITION_ATTRS.CURRENT_VERSION] = parseInt(dto.currentVersion, 10) || 1;
    }
    if (dto.allowSaveDraft !== undefined) data[FORM_DEFINITION_ATTRS.ALLOW_SAVE_DRAFT] = dto.allowSaveDraft;
    if (dto.draftExpiryDays !== undefined) data[FORM_DEFINITION_ATTRS.DRAFT_EXPIRY_DAYS] = dto.draftExpiryDays;
    if (dto.powerAutomateFlowId !== undefined) {
      data[FORM_DEFINITION_ATTRS.POWER_AUTOMATE_FLOW_ID] = dto.powerAutomateFlowId;
    }
    if (dto.confirmationMessage !== undefined) {
      data[FORM_DEFINITION_ATTRS.CONFIRMATION_MESSAGE] = dto.confirmationMessage;
    }
    if (dto.confirmationRecordRefAttribute !== undefined) {
      data[FORM_DEFINITION_ATTRS.CONFIRMATION_RECORD_REF_ATTRIBUTE] = dto.confirmationRecordRefAttribute;
    }
    if (dto.accessGroupId !== undefined) data[FORM_DEFINITION_ATTRS.ACCESS_GROUP_ID] = dto.accessGroupId;
    if (Object.keys(data).length === 0) return;

    await withRetry(
      () => this.webApi.updateRecord(ENTITY_NAMES.FORM_DEFINITION, id, data),
      'updateForm'
    );
  }

  async getForm(id: string): Promise<DesignerFormModel> {
    const select = [
      FORM_DEFINITION_ATTRS.ID,
      FORM_DEFINITION_ATTRS.NAME,
      FORM_DEFINITION_ATTRS.CODE,
      FORM_DEFINITION_ATTRS.DESCRIPTION,
      FORM_DEFINITION_ATTRS.STATUS,
      FORM_DEFINITION_ATTRS.CURRENT_VERSION,
      FORM_DEFINITION_ATTRS.ALLOW_SAVE_DRAFT,
      FORM_DEFINITION_ATTRS.DRAFT_EXPIRY_DAYS,
      FORM_DEFINITION_ATTRS.POWER_AUTOMATE_FLOW_ID,
      FORM_DEFINITION_ATTRS.CONFIRMATION_MESSAGE,
      FORM_DEFINITION_ATTRS.CONFIRMATION_RECORD_REF_ATTRIBUTE,
      FORM_DEFINITION_ATTRS.ACCESS_GROUP_ID,
      FORM_DEFINITION_ATTRS.CREATED_BY,
      FORM_DEFINITION_ATTRS.CREATED_ON,
      FORM_DEFINITION_ATTRS.MODIFIED_BY,
      FORM_DEFINITION_ATTRS.MODIFIED_ON,
    ].join(',');

    const record = await withRetry(
      () => this.webApi.retrieveRecord(ENTITY_NAMES.FORM_DEFINITION, id, `?$select=${select}`),
      'getForm'
    );

    return this.mapRecordToModel(record);
  }

  async listForms(filter?: FormListFilter): Promise<FormSummary[]> {
    const select = [
      FORM_DEFINITION_ATTRS.ID,
      FORM_DEFINITION_ATTRS.NAME,
      FORM_DEFINITION_ATTRS.CODE,
      FORM_DEFINITION_ATTRS.STATUS,
      FORM_DEFINITION_ATTRS.CURRENT_VERSION,
      FORM_DEFINITION_ATTRS.MODIFIED_BY,
      FORM_DEFINITION_ATTRS.MODIFIED_ON,
    ].join(',');

    const filters: string[] = [];
    if (filter?.status) {
      const picklistValue = STATUS_TO_PICKLIST[filter.status];
      if (picklistValue !== undefined) {
        filters.push(`${FORM_DEFINITION_ATTRS.STATUS} eq ${picklistValue}`);
      }
    }
    if (filter?.searchTerm) {
      const term = filter.searchTerm.replace(/'/g, "''");
      filters.push(
        `(contains(${FORM_DEFINITION_ATTRS.NAME},'${term}') or contains(${FORM_DEFINITION_ATTRS.CODE},'${term}'))`
      );
    }

    const filterQuery = filters.length > 0 ? `&$filter=${filters.join(' and ')}` : '';
    const orderBy = `&$orderby=${FORM_DEFINITION_ATTRS.MODIFIED_ON} desc`;

    const result = await withRetry(
      () =>
        this.webApi.retrieveMultipleRecords(
          ENTITY_NAMES.FORM_DEFINITION,
          `?$select=${select}${filterQuery}${orderBy}`
        ),
      'listForms'
    );

    return result.entities.map(record => ({
      id: String(record[FORM_DEFINITION_ATTRS.ID] ?? ''),
      name: String(record[FORM_DEFINITION_ATTRS.NAME] ?? ''),
      code: String(record[FORM_DEFINITION_ATTRS.CODE] ?? ''),
      status: picklistToStatus(record[FORM_DEFINITION_ATTRS.STATUS]),
      currentVersion: versionToString(record[FORM_DEFINITION_ATTRS.CURRENT_VERSION]),
      modifiedOn: new Date(String(record[FORM_DEFINITION_ATTRS.MODIFIED_ON] ?? '')),
      modifiedBy: String(record[FORM_DEFINITION_ATTRS.MODIFIED_BY] ?? ''),
    }));
  }

  async deleteForm(id: string): Promise<void> {
    await withRetry(
      () => this.webApi.deleteRecord(ENTITY_NAMES.FORM_DEFINITION, id),
      'deleteForm'
    );
  }

  private mapRecordToModel(record: Record<string, unknown>): DesignerFormModel {
    return {
      id: String(record[FORM_DEFINITION_ATTRS.ID] ?? ''),
      name: String(record[FORM_DEFINITION_ATTRS.NAME] ?? ''),
      code: String(record[FORM_DEFINITION_ATTRS.CODE] ?? ''),
      description: String(record[FORM_DEFINITION_ATTRS.DESCRIPTION] ?? ''),
      entityLogicalName: '',
      status: picklistToStatus(record[FORM_DEFINITION_ATTRS.STATUS]),
      currentVersion: versionToString(record[FORM_DEFINITION_ATTRS.CURRENT_VERSION]),
      themeId: null,
      allowSaveDraft: record[FORM_DEFINITION_ATTRS.ALLOW_SAVE_DRAFT] !== false,
      draftExpiryDays: record[FORM_DEFINITION_ATTRS.DRAFT_EXPIRY_DAYS] != null
        ? Number(record[FORM_DEFINITION_ATTRS.DRAFT_EXPIRY_DAYS])
        : null,
      powerAutomateFlowId: record[FORM_DEFINITION_ATTRS.POWER_AUTOMATE_FLOW_ID]
        ? String(record[FORM_DEFINITION_ATTRS.POWER_AUTOMATE_FLOW_ID])
        : null,
      confirmationMessage: record[FORM_DEFINITION_ATTRS.CONFIRMATION_MESSAGE]
        ? String(record[FORM_DEFINITION_ATTRS.CONFIRMATION_MESSAGE])
        : null,
      confirmationRecordRefAttribute: record[FORM_DEFINITION_ATTRS.CONFIRMATION_RECORD_REF_ATTRIBUTE]
        ? String(record[FORM_DEFINITION_ATTRS.CONFIRMATION_RECORD_REF_ATTRIBUTE])
        : null,
      accessGroupId: record[FORM_DEFINITION_ATTRS.ACCESS_GROUP_ID]
        ? String(record[FORM_DEFINITION_ATTRS.ACCESS_GROUP_ID])
        : null,
      createdBy: String(record[FORM_DEFINITION_ATTRS.CREATED_BY] ?? ''),
      createdOn: new Date(String(record[FORM_DEFINITION_ATTRS.CREATED_ON] ?? '')),
      modifiedBy: String(record[FORM_DEFINITION_ATTRS.MODIFIED_BY] ?? ''),
      modifiedOn: new Date(String(record[FORM_DEFINITION_ATTRS.MODIFIED_ON] ?? '')),
    };
  }
}
