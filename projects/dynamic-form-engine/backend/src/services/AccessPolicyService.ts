import { LRUCache } from 'lru-cache';
import { CrmBaseService } from './CrmBaseService.js';
import { ForbiddenError } from '../utils/errors.js';
import type { CrmAuthService } from './CrmAuthService.js';

export type AccessType = 'view' | 'submit' | 'draft';

const ACCESS_TYPE_CODE: Record<AccessType, number> = {
  view: 100000001,
  submit: 100000002,
  draft: 100000003,
};

interface ODataCollection<T> { value: T[] }

interface RawAccessPolicy {
  qdb_form_access_policyid: string;
  _qdb_form_definition_id_value: string;
  qdb_role_id: string;
  qdb_access_type: number;
}

export class AccessPolicyService extends CrmBaseService {
  constructor(
    authService: CrmAuthService,
    private readonly cache: LRUCache<string, string[]>,
  ) {
    super(authService);
  }

  async getAllowedRoles(formId: string, accessType: AccessType): Promise<string[]> {
    const cacheKey = `${formId}:${accessType}`;
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) return cached;

    const typeCode = ACCESS_TYPE_CODE[accessType];
    const response = await this.crmFetch<ODataCollection<RawAccessPolicy>>(
      `/qdb_form_access_policies?$filter=_qdb_form_definition_id_value eq '${formId}'` +
        ` and qdb_access_type eq ${typeCode} and statecode eq 0` +
        `&$select=qdb_role_id`,
    );

    const roles = response.value.map((p) => p.qdb_role_id);
    this.cache.set(cacheKey, roles);
    return roles;
  }

  async hasAccess(formId: string, userRoles: string[], accessType: AccessType): Promise<boolean> {
    const allowedRoles = await this.getAllowedRoles(formId, accessType);
    if (allowedRoles.length === 0) return true; // no policies = open access
    return userRoles.some((role) => allowedRoles.includes(role));
  }

  async assertAccess(formId: string, userRoles: string[], accessType: AccessType): Promise<void> {
    const allowed = await this.hasAccess(formId, userRoles, accessType);
    if (!allowed) {
      throw new ForbiddenError(`Access type '${accessType}' is not permitted for this form`);
    }
  }

  invalidatePolicies(formId: string): void {
    for (const accessType of Object.keys(ACCESS_TYPE_CODE) as AccessType[]) {
      this.cache.delete(`${formId}:${accessType}`);
    }
  }
}
