export type AccessPolicyType = 'view' | 'submit' | 'draft';

export interface DesignerAccessPolicyModel {
  /** CRM GUID or 'tmp_ap_<timestamp>' for unsaved records */
  id: string;
  formId: string;
  name: string;
  roleId: string;
  accessType: AccessPolicyType;
}
