import type { IWebApiAdapter } from './IWebApiAdapter';
import { MissingEtagError } from './concurrency/MissingEtagError';
import { ENTITY_NAMES } from '@/constants/entityNames';
import {
  FORM_DEFINITION_ATTRS,
  PICKLIST_TO_STATUS,
  STATUS_TO_PICKLIST,
  SUMMARY_MODE_TO_PICKLIST,
  PICKLIST_TO_SUMMARY_MODE,
} from '@/constants/attributeNames';
import type { DesignerFormModel, FormStatus } from '@/state/models/DesignerFormModel';
import type { SummaryMode } from '@qdb/shared';
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
  showSummaryStep?: boolean;
  summaryMode?: SummaryMode | null;
  showProgressBar?: boolean;
  powerAutomateFlowId?: string | null;
  confirmationMessage?: string | null;
  submitConfirmationLabel?: string | null;
  submitConfirmationMessage?: string | null;
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
          // qdb_entity_logical_name is not deployed on qdb_form_definition —
          // entityLogicalName lives in the store only and is used for submission mapping.
        }),
      'createForm'
    );
    return result.id;
  }

  async updateForm(id: string, dto: UpdateFormDto, etag?: string): Promise<void> {
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
    if (dto.showSummaryStep !== undefined) data[FORM_DEFINITION_ATTRS.SHOW_SUMMARY_STEP] = dto.showSummaryStep;
    if (dto.summaryMode !== undefined) {
      data[FORM_DEFINITION_ATTRS.SUMMARY_MODE] = dto.summaryMode != null ? SUMMARY_MODE_TO_PICKLIST[dto.summaryMode] : null;
    }
    if (dto.showProgressBar !== undefined) data[FORM_DEFINITION_ATTRS.SHOW_PROGRESS_BAR] = dto.showProgressBar;
    if (dto.powerAutomateFlowId !== undefined) {
      data[FORM_DEFINITION_ATTRS.POWER_AUTOMATE_FLOW_ID] = dto.powerAutomateFlowId;
    }
    if (dto.confirmationMessage !== undefined) {
      data[FORM_DEFINITION_ATTRS.CONFIRMATION_MESSAGE] = dto.confirmationMessage;
    }
    if (dto.submitConfirmationLabel !== undefined) {
      data[FORM_DEFINITION_ATTRS.SUBMIT_CONFIRMATION_LABEL] = dto.submitConfirmationLabel;
    }
    if (dto.submitConfirmationMessage !== undefined) {
      data[FORM_DEFINITION_ATTRS.SUBMIT_CONFIRMATION_MESSAGE] = dto.submitConfirmationMessage;
    }
    if (dto.confirmationRecordRefAttribute !== undefined) {
      data[FORM_DEFINITION_ATTRS.CONFIRMATION_RECORD_REF_ATTRIBUTE] = dto.confirmationRecordRefAttribute;
    }
    if (dto.accessGroupId !== undefined) data[FORM_DEFINITION_ATTRS.ACCESS_GROUP_ID] = dto.accessGroupId;
    // entityLogicalName intentionally not written — qdb_entity_logical_name not deployed on qdb_form_definition
    if (Object.keys(data).length === 0) return;

    if (!etag) {
      // Unconditional PATCH is forbidden by the concurrency architecture.
      // Load the record via getFormWithEtag() before calling updateForm.
      throw new MissingEtagError(ENTITY_NAMES.FORM_DEFINITION, id);
    }

    // ConcurrencyConflictError propagates to the caller — do not catch here.
    await withRetry(
      () => this.webApi.updateRecordConditional(ENTITY_NAMES.FORM_DEFINITION, id, data, { ifMatch: etag }),
      'updateFormConditional',
    );
  }

  async getForm(id: string): Promise<DesignerFormModel> {
    const select = [
      FORM_DEFINITION_ATTRS.ID,
      FORM_DEFINITION_ATTRS.NAME,
      FORM_DEFINITION_ATTRS.CODE,
      FORM_DEFINITION_ATTRS.DESCRIPTION,
      // ENTITY_LOGICAL_NAME excluded — not deployed on qdb_form_definition entity
      FORM_DEFINITION_ATTRS.STATUS,
      FORM_DEFINITION_ATTRS.CURRENT_VERSION,
      FORM_DEFINITION_ATTRS.ALLOW_SAVE_DRAFT,
      FORM_DEFINITION_ATTRS.DRAFT_EXPIRY_DAYS,
      FORM_DEFINITION_ATTRS.SHOW_SUMMARY_STEP,
      FORM_DEFINITION_ATTRS.SUMMARY_MODE,
      FORM_DEFINITION_ATTRS.SHOW_PROGRESS_BAR,
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

  /** Returns the form model together with its current @odata.etag for optimistic concurrency. */
  async getFormWithEtag(id: string): Promise<{ model: DesignerFormModel; etag: string | null }> {
    const select = [
      FORM_DEFINITION_ATTRS.ID,
      FORM_DEFINITION_ATTRS.NAME,
      FORM_DEFINITION_ATTRS.CODE,
      FORM_DEFINITION_ATTRS.DESCRIPTION,
      FORM_DEFINITION_ATTRS.STATUS,
      FORM_DEFINITION_ATTRS.CURRENT_VERSION,
      FORM_DEFINITION_ATTRS.ALLOW_SAVE_DRAFT,
      FORM_DEFINITION_ATTRS.DRAFT_EXPIRY_DAYS,
      FORM_DEFINITION_ATTRS.SHOW_SUMMARY_STEP,
      FORM_DEFINITION_ATTRS.SUMMARY_MODE,
      FORM_DEFINITION_ATTRS.SHOW_PROGRESS_BAR,
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
      'getFormWithEtag',
    );

    const rawEtag = record['@odata.etag'];
    const etag = typeof rawEtag === 'string' ? rawEtag : null;

    return { model: this.mapRecordToModel(record), etag };
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
      entityLogicalName: '', // not stored in CRM — populated by wizard and held in store only
      status: picklistToStatus(record[FORM_DEFINITION_ATTRS.STATUS]),
      currentVersion: versionToString(record[FORM_DEFINITION_ATTRS.CURRENT_VERSION]),
      themeId: null,
      allowSaveDraft: record[FORM_DEFINITION_ATTRS.ALLOW_SAVE_DRAFT] !== false,
      draftExpiryDays: record[FORM_DEFINITION_ATTRS.DRAFT_EXPIRY_DAYS] != null
        ? Number(record[FORM_DEFINITION_ATTRS.DRAFT_EXPIRY_DAYS])
        : null,
      showSummaryStep: Boolean(record[FORM_DEFINITION_ATTRS.SHOW_SUMMARY_STEP]),
      summaryMode: record[FORM_DEFINITION_ATTRS.SUMMARY_MODE] != null
        ? (PICKLIST_TO_SUMMARY_MODE[Number(record[FORM_DEFINITION_ATTRS.SUMMARY_MODE])] ?? null)
        : null,
      showProgressBar: Boolean(record[FORM_DEFINITION_ATTRS.SHOW_PROGRESS_BAR]),
      powerAutomateFlowId: record[FORM_DEFINITION_ATTRS.POWER_AUTOMATE_FLOW_ID]
        ? String(record[FORM_DEFINITION_ATTRS.POWER_AUTOMATE_FLOW_ID])
        : null,
      confirmationMessage: record[FORM_DEFINITION_ATTRS.CONFIRMATION_MESSAGE]
        ? String(record[FORM_DEFINITION_ATTRS.CONFIRMATION_MESSAGE])
        : null,
      submitConfirmationLabel: record[FORM_DEFINITION_ATTRS.SUBMIT_CONFIRMATION_LABEL]
        ? String(record[FORM_DEFINITION_ATTRS.SUBMIT_CONFIRMATION_LABEL])
        : null,
      submitConfirmationMessage: record[FORM_DEFINITION_ATTRS.SUBMIT_CONFIRMATION_MESSAGE]
        ? String(record[FORM_DEFINITION_ATTRS.SUBMIT_CONFIRMATION_MESSAGE])
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
