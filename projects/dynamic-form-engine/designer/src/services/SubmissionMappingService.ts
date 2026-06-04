import type { IWebApiAdapter } from './IWebApiAdapter';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { FORM_SUBMISSION_MAPPING_ATTRS } from '@/constants/attributeNames';
import { withRetry } from './crmRetry';

export interface SubmissionMapping {
  id: string;
  formId: string;
  fieldId: string;
  targetEntity: string;
  targetAttribute: string;
  isChildEntity: boolean;
  childEntityRelationshipName: string | null;
  transformExpression: string | null;
  isActive: boolean;
}

export interface CreateMappingDto {
  formId: string;
  fieldId: string;
  targetEntity: string;
  targetAttribute: string;
  isChildEntity?: boolean;
  childEntityRelationshipName?: string | null;
  transformExpression?: string | null;
  isActive?: boolean;
}

export interface UpdateMappingDto {
  fieldId?: string;
  targetEntity?: string;
  targetAttribute?: string;
  isChildEntity?: boolean;
  childEntityRelationshipName?: string | null;
  transformExpression?: string | null;
  isActive?: boolean;
}

export class SubmissionMappingService {
  constructor(private readonly webApi: IWebApiAdapter) {}

  async createMapping(dto: CreateMappingDto): Promise<string> {
    const payload: Record<string, unknown> = {
      [`${FORM_SUBMISSION_MAPPING_ATTRS.FORM_ID}@odata.bind`]: `/qdb_form_definitions(${dto.formId})`,
      [`${FORM_SUBMISSION_MAPPING_ATTRS.FIELD_ID}@odata.bind`]: `/qdb_form_fields(${dto.fieldId})`,
      [FORM_SUBMISSION_MAPPING_ATTRS.TARGET_ENTITY]: dto.targetEntity,
      [FORM_SUBMISSION_MAPPING_ATTRS.TARGET_ATTRIBUTE]: dto.targetAttribute,
      [FORM_SUBMISSION_MAPPING_ATTRS.IS_CHILD_ENTITY]: dto.isChildEntity ?? false,
      [FORM_SUBMISSION_MAPPING_ATTRS.IS_ACTIVE]: dto.isActive ?? true,
    };
    if (dto.childEntityRelationshipName != null) payload[FORM_SUBMISSION_MAPPING_ATTRS.CHILD_ENTITY_RELATIONSHIP_NAME] = dto.childEntityRelationshipName;
    if (dto.transformExpression != null) payload[FORM_SUBMISSION_MAPPING_ATTRS.TRANSFORM_EXPRESSION] = dto.transformExpression;

    const result = await withRetry(
      () => this.webApi.createRecord(ENTITY_NAMES.FORM_SUBMISSION_MAPPING, payload),
      'createMapping'
    );
    return result.id;
  }

  async updateMapping(id: string, dto: UpdateMappingDto): Promise<void> {
    const data: Record<string, unknown> = {};
    if (dto.targetEntity !== undefined) data[FORM_SUBMISSION_MAPPING_ATTRS.TARGET_ENTITY] = dto.targetEntity;
    if (dto.targetAttribute !== undefined) data[FORM_SUBMISSION_MAPPING_ATTRS.TARGET_ATTRIBUTE] = dto.targetAttribute;
    if (dto.isChildEntity !== undefined) data[FORM_SUBMISSION_MAPPING_ATTRS.IS_CHILD_ENTITY] = dto.isChildEntity;
    if (dto.childEntityRelationshipName !== undefined) data[FORM_SUBMISSION_MAPPING_ATTRS.CHILD_ENTITY_RELATIONSHIP_NAME] = dto.childEntityRelationshipName ?? null;
    if (dto.transformExpression !== undefined) data[FORM_SUBMISSION_MAPPING_ATTRS.TRANSFORM_EXPRESSION] = dto.transformExpression ?? null;
    if (dto.isActive !== undefined) data[FORM_SUBMISSION_MAPPING_ATTRS.IS_ACTIVE] = dto.isActive;

    if (Object.keys(data).length === 0) return;
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
      FORM_SUBMISSION_MAPPING_ATTRS.FIELD_ID_VALUE,
      FORM_SUBMISSION_MAPPING_ATTRS.TARGET_ENTITY,
      FORM_SUBMISSION_MAPPING_ATTRS.TARGET_ATTRIBUTE,
      FORM_SUBMISSION_MAPPING_ATTRS.IS_CHILD_ENTITY,
      FORM_SUBMISSION_MAPPING_ATTRS.CHILD_ENTITY_RELATIONSHIP_NAME,
      FORM_SUBMISSION_MAPPING_ATTRS.TRANSFORM_EXPRESSION,
      FORM_SUBMISSION_MAPPING_ATTRS.IS_ACTIVE,
    ].join(',');

    const filter = `${FORM_SUBMISSION_MAPPING_ATTRS.FORM_ID_VALUE} eq ${formId}`;

    const result = await withRetry(
      () => this.webApi.retrieveMultipleRecords(
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
      fieldId: String(record[FORM_SUBMISSION_MAPPING_ATTRS.FIELD_ID_VALUE] ?? ''),
      targetEntity: String(record[FORM_SUBMISSION_MAPPING_ATTRS.TARGET_ENTITY] ?? ''),
      targetAttribute: String(record[FORM_SUBMISSION_MAPPING_ATTRS.TARGET_ATTRIBUTE] ?? ''),
      isChildEntity: Boolean(record[FORM_SUBMISSION_MAPPING_ATTRS.IS_CHILD_ENTITY]),
      childEntityRelationshipName: record[FORM_SUBMISSION_MAPPING_ATTRS.CHILD_ENTITY_RELATIONSHIP_NAME] != null
        ? String(record[FORM_SUBMISSION_MAPPING_ATTRS.CHILD_ENTITY_RELATIONSHIP_NAME])
        : null,
      transformExpression: record[FORM_SUBMISSION_MAPPING_ATTRS.TRANSFORM_EXPRESSION] != null
        ? String(record[FORM_SUBMISSION_MAPPING_ATTRS.TRANSFORM_EXPRESSION])
        : null,
      isActive: record[FORM_SUBMISSION_MAPPING_ATTRS.IS_ACTIVE] !== false,
    };
  }
}
