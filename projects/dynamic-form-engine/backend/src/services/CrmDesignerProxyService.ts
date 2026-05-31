import { CrmBaseService } from './CrmBaseService.js';
import { ValidationError } from '../utils/errors.js';
import type { CrmAuthService } from './CrmAuthService.js';

const ALLOWED_ENTITIES = new Set([
  'qdb_form_definitions',
  'qdb_form_tabs',
  'qdb_form_sections',
  'qdb_form_fields',
  'qdb_form_option_values',
  'qdb_form_validation_rules',
  'qdb_form_lookup_configs',
  'qdb_form_submission_mappings',
  'qdb_form_business_rules',
  'qdb_rule_conditions',
  'qdb_form_designs',
  'qdb_form_design_overrides',
  'qdb_form_versions',
  'qdb_form_buttons',
]);

export interface DesignerProxyCreateResult {
  id: string;
  entityType: string;
}

interface ODataCollection<T> {
  value: T[];
  '@odata.nextLink'?: string;
}

export class CrmDesignerProxyService extends CrmBaseService {
  constructor(authService: CrmAuthService) {
    super(authService);
  }

  assertEntityAllowed(entityLogicalName: string): void {
    if (!ALLOWED_ENTITIES.has(entityLogicalName)) {
      throw new ValidationError(`Entity '${entityLogicalName}' is not accessible via the designer proxy`);
    }
  }

  async listRecords(entityLogicalName: string, rawOdataQuery: string): Promise<{ entities: Record<string, unknown>[]; nextLink?: string }> {
    this.assertEntityAllowed(entityLogicalName);
    const query = rawOdataQuery ? `?${rawOdataQuery}` : '';
    const raw = await this.crmFetch<ODataCollection<Record<string, unknown>>>(`/${entityLogicalName}${query}`);
    return {
      entities: raw.value ?? [],
      nextLink: raw['@odata.nextLink'],
    };
  }

  async getRecord(entityLogicalName: string, id: string, rawOdataQuery: string): Promise<Record<string, unknown>> {
    this.assertEntityAllowed(entityLogicalName);
    const query = rawOdataQuery ? `?${rawOdataQuery}` : '';
    return this.crmFetch<Record<string, unknown>>(`/${entityLogicalName}(${id})${query}`);
  }

  async createRecord(entityLogicalName: string, data: Record<string, unknown>): Promise<DesignerProxyCreateResult> {
    this.assertEntityAllowed(entityLogicalName);
    const token = await this.authService.getAccessToken();
    const response = await fetch(`${this.baseUrl}/${entityLogicalName}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new ValidationError(`Dataverse create failed for '${entityLogicalName}': ${response.status} ${body}`);
    }

    const entityIdHeader = response.headers.get('OData-EntityId') ?? '';
    const idMatch = entityIdHeader.match(/\(([0-9a-f-]{36})\)$/i);
    const id = idMatch?.[1] ?? '';

    return { id, entityType: entityLogicalName };
  }

  async updateRecord(entityLogicalName: string, id: string, data: Record<string, unknown>): Promise<void> {
    this.assertEntityAllowed(entityLogicalName);
    await this.crmFetch<void>(`/${entityLogicalName}(${id})`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteRecord(entityLogicalName: string, id: string): Promise<void> {
    this.assertEntityAllowed(entityLogicalName);
    await this.crmFetch<void>(`/${entityLogicalName}(${id})`, { method: 'DELETE' });
  }
}
