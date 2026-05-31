import type { IWebApiAdapter } from './IWebApiAdapter';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { FORM_ACCESS_POLICY_ATTRS, ACCESS_TYPE_TO_PICKLIST, PICKLIST_TO_ACCESS_TYPE } from '@/constants/attributeNames';
import type { DesignerAccessPolicyModel, AccessPolicyType } from '@/state/models/DesignerAccessPolicyModel';
import { withRetry } from './crmRetry';

export interface CreateAccessPolicyDto {
  formId: string;
  roleId: string;
  accessType: AccessPolicyType;
}

export interface UpdateAccessPolicyDto {
  roleId?: string;
  accessType?: AccessPolicyType;
}

export class AccessPolicyService {
  constructor(private readonly webApi: IWebApiAdapter) {}

  async listPoliciesForForm(formId: string): Promise<DesignerAccessPolicyModel[]> {
    const select = [
      FORM_ACCESS_POLICY_ATTRS.ID,
      FORM_ACCESS_POLICY_ATTRS.FORM_ID_VALUE,
      FORM_ACCESS_POLICY_ATTRS.NAME,
      FORM_ACCESS_POLICY_ATTRS.ROLE_ID,
      FORM_ACCESS_POLICY_ATTRS.ACCESS_TYPE,
    ].join(',');

    const filter = `${FORM_ACCESS_POLICY_ATTRS.FORM_ID_VALUE} eq ${formId}`;

    const result = await withRetry(
      () => this.webApi.retrieveMultipleRecords(
        ENTITY_NAMES.FORM_ACCESS_POLICY,
        `?$select=${select}&$filter=${filter}&$orderby=${FORM_ACCESS_POLICY_ATTRS.ACCESS_TYPE} asc`
      ),
      'listPoliciesForForm'
    );

    return result.entities.map(r => this.mapRecordToModel(r));
  }

  async createPolicy(dto: CreateAccessPolicyDto): Promise<string> {
    const autoName = `${dto.formId.slice(0, 8)} — ${dto.roleId} — ${dto.accessType}`;
    const payload: Record<string, unknown> = {
      [`${FORM_ACCESS_POLICY_ATTRS.FORM_ID}@odata.bind`]: `/qdb_form_definitions(${dto.formId})`,
      [FORM_ACCESS_POLICY_ATTRS.NAME]: autoName,
      [FORM_ACCESS_POLICY_ATTRS.ROLE_ID]: dto.roleId,
      [FORM_ACCESS_POLICY_ATTRS.ACCESS_TYPE]: ACCESS_TYPE_TO_PICKLIST[dto.accessType] ?? ACCESS_TYPE_TO_PICKLIST['view'],
    };

    const result = await withRetry(
      () => this.webApi.createRecord(ENTITY_NAMES.FORM_ACCESS_POLICY, payload),
      'createAccessPolicy'
    );
    return result.id;
  }

  async updatePolicy(id: string, dto: UpdateAccessPolicyDto): Promise<void> {
    const data: Record<string, unknown> = {};
    if (dto.roleId !== undefined) data[FORM_ACCESS_POLICY_ATTRS.ROLE_ID] = dto.roleId;
    if (dto.accessType !== undefined) data[FORM_ACCESS_POLICY_ATTRS.ACCESS_TYPE] = ACCESS_TYPE_TO_PICKLIST[dto.accessType] ?? ACCESS_TYPE_TO_PICKLIST['view'];

    if (Object.keys(data).length === 0) return;

    await withRetry(
      () => this.webApi.updateRecord(ENTITY_NAMES.FORM_ACCESS_POLICY, id, data),
      'updateAccessPolicy'
    );
  }

  async deletePolicy(id: string): Promise<void> {
    await withRetry(
      () => this.webApi.deleteRecord(ENTITY_NAMES.FORM_ACCESS_POLICY, id),
      'deleteAccessPolicy'
    );
  }

  private mapRecordToModel(record: Record<string, unknown>): DesignerAccessPolicyModel {
    const accessTypeCode = Number(record[FORM_ACCESS_POLICY_ATTRS.ACCESS_TYPE] ?? 0);
    return {
      id: String(record[FORM_ACCESS_POLICY_ATTRS.ID] ?? ''),
      formId: String(record[FORM_ACCESS_POLICY_ATTRS.FORM_ID_VALUE] ?? ''),
      name: String(record[FORM_ACCESS_POLICY_ATTRS.NAME] ?? ''),
      roleId: String(record[FORM_ACCESS_POLICY_ATTRS.ROLE_ID] ?? ''),
      accessType: (PICKLIST_TO_ACCESS_TYPE[accessTypeCode] ?? 'view') as AccessPolicyType,
    };
  }
}
