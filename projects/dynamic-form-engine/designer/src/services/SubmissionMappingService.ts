import type { IWebApiAdapter } from './IWebApiAdapter';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { FORM_SUBMISSION_MAPPING_ATTRS } from '@/constants/attributeNames';
import { withRetry } from './crmRetry';

export interface SubmissionMapping {
  id: string;
  formId: string;
  fieldCode: string;
  targetEntity: string;
  targetAttribute: string;
  isRequiredForSubmit: boolean;
}

export interface CreateMappingDto {
  formId: string;
  targetEntity: string;
  targetAttribute: string;
}

export interface UpdateMappingDto {
  targetEntity?: string;
  targetAttribute?: string;
}

export class SubmissionMappingService {
  constructor(private readonly webApi: IWebApiAdapter) {}

  async createMapping(dto: CreateMappingDto): Promise<string> {
    const result = await withRetry(
      () =>
        this.webApi.createRecord(ENTITY_NAMES.FORM_SUBMISSION_MAPPING, {
          [FORM_SUBMISSION_MAPPING_ATTRS.FORM_ID]: dto.formId,
          [FORM_SUBMISSION_MAPPING_ATTRS.TARGET_ENTITY]: dto.targetEntity,
          [FORM_SUBMISSION_MAPPING_ATTRS.TARGET_ATTRIBUTE]: dto.targetAttribute,
        }),
      'createMapping'
    );
    return result.id;
  }

  async updateMapping(id: string, dto: UpdateMappingDto): Promise<void> {
    const data: Record<string, unknown> = {};
    if (dto.targetEntity !== undefined) {
      data[FORM_SUBMISSION_MAPPING_ATTRS.TARGET_ENTITY] = dto.targetEntity;
    }
    if (dto.targetAttribute !== undefined) {
      data[FORM_SUBMISSION_MAPPING_ATTRS.TARGET_ATTRIBUTE] = dto.targetAttribute;
    }

    await withRetry(
      () => this.webApi.updateRecord(ENTITY_NAMES.FORM_SUBMISSION_MAPPING, id, data),
      'updateMapping'
    );
  }

  async deleteMapping(id: string): Promise<void> {
    await withRetry(
      () => this.webApi.deleteRecord(ENTITY_NAMES.FORM_SUBMISSION_MAPPING, id),
      'deleteMapping'
    );
  }

  async listMappingsForForm(formId: string): Promise<SubmissionMapping[]> {
    const select = [
      FORM_SUBMISSION_MAPPING_ATTRS.ID,
      FORM_SUBMISSION_MAPPING_ATTRS.FORM_ID_VALUE,
      FORM_SUBMISSION_MAPPING_ATTRS.TARGET_ENTITY,
      FORM_SUBMISSION_MAPPING_ATTRS.TARGET_ATTRIBUTE,
    ].join(',');

    const filter = `${FORM_SUBMISSION_MAPPING_ATTRS.FORM_ID_VALUE} eq ${formId}`;

    const result = await withRetry(
      () =>
        this.webApi.retrieveMultipleRecords(
          ENTITY_NAMES.FORM_SUBMISSION_MAPPING,
          `?$select=${select}&$filter=${filter}`
        ),
      'listMappingsForForm'
    );

    return result.entities.map(record => this.mapRecordToModel(record));
  }

  private mapRecordToModel(record: Record<string, unknown>): SubmissionMapping {
    return {
      id: String(record[FORM_SUBMISSION_MAPPING_ATTRS.ID] ?? ''),
      formId: String(record[FORM_SUBMISSION_MAPPING_ATTRS.FORM_ID_VALUE] ?? ''),
      fieldCode: '',
      targetEntity: String(record[FORM_SUBMISSION_MAPPING_ATTRS.TARGET_ENTITY] ?? ''),
      targetAttribute: String(record[FORM_SUBMISSION_MAPPING_ATTRS.TARGET_ATTRIBUTE] ?? ''),
      isRequiredForSubmit: false,
    };
  }
}
