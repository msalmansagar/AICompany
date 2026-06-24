import { CrmBaseService } from './CrmBaseService.js';
import { ValidationError } from '../utils/errors.js';
import type { CrmAuthService } from './CrmAuthService.js';

// Maps entity logical names (singular — used by Xrm.WebApi) to OData entity set
// names (plural — required by Dataverse REST API).  Both forms are accepted; the
// singular form is normalised to plural before forwarding to Dataverse.
const ENTITY_SET_MAP: Record<string, string> = {
  // singular → plural
  qdb_form_definition:        'qdb_form_definitions',
  qdb_form_tab:               'qdb_form_tabs',
  qdb_form_section:           'qdb_form_sections',
  qdb_form_field:             'qdb_form_fields',
  qdb_form_option_value:      'qdb_form_option_values',
  qdb_form_validation_rule:   'qdb_form_validation_rules',
  qdb_form_lookup_config:     'qdb_form_lookup_configs',
  qdb_form_submission_mapping:'qdb_form_submission_mappings',
  qdb_form_business_rule:     'qdb_form_business_rules',
  qdb_rule_condition:         'qdb_rule_conditions',
  qdb_form_design:            'qdb_form_designs',
  qdb_form_design_override:   'qdb_form_design_overrides',
  qdb_form_version:           'qdb_form_versions',
  qdb_form_button:            'qdb_form_buttons',
  qdb_grid_column_config:     'qdb_grid_column_configs',
  qdb_rule_template:          'qdb_rule_templates',
  qdb_fieldlabel:             'qdb_fieldlabels',
  qdb_theme:                  'qdb_themes',
  qdb_form_access_policy:     'qdb_form_access_policies',
  qdb_form_audit_log:         'qdb_form_audit_logs',
};

// Resolve to the canonical OData entity set name, accepting both singular and plural.
function resolveEntitySetName(name: string): string | undefined {
  if (ENTITY_SET_MAP[name]) return ENTITY_SET_MAP[name];
  const isKnownPlural = Object.values(ENTITY_SET_MAP).includes(name);
  return isKnownPlural ? name : undefined;
}

const ALLOWED_ENTITIES = new Set(Object.values(ENTITY_SET_MAP));

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

  resolveAllowed(entityLogicalName: string): string {
    const setName = resolveEntitySetName(entityLogicalName);
    if (!setName || !ALLOWED_ENTITIES.has(setName)) {
      throw new ValidationError(`Entity '${entityLogicalName}' is not accessible via the designer proxy`);
    }
    return setName;
  }

  async listRecords(entityLogicalName: string, rawOdataQuery: string): Promise<{ entities: Record<string, unknown>[]; nextLink?: string }> {
    const setName = this.resolveAllowed(entityLogicalName);
    const query = rawOdataQuery ? `?${rawOdataQuery}` : '';
    const raw = await this.crmFetch<ODataCollection<Record<string, unknown>>>(`/${setName}${query}`);
    return {
      entities: raw.value ?? [],
      nextLink: raw['@odata.nextLink'],
    };
  }

  async getRecord(entityLogicalName: string, id: string, rawOdataQuery: string): Promise<Record<string, unknown>> {
    const setName = this.resolveAllowed(entityLogicalName);
    const query = rawOdataQuery ? `?${rawOdataQuery}` : '';
    return this.crmFetch<Record<string, unknown>>(`/${setName}(${id})${query}`);
  }

  async createRecord(entityLogicalName: string, data: Record<string, unknown>): Promise<DesignerProxyCreateResult> {
    const setName = this.resolveAllowed(entityLogicalName);
    const token = await this.authService.getAccessToken();
    const response = await fetch(`${this.baseUrl}/${setName}`, {
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
    const setName = this.resolveAllowed(entityLogicalName);
    await this.crmFetch<void>(`/${setName}(${id})`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteRecord(entityLogicalName: string, id: string): Promise<void> {
    const setName = this.resolveAllowed(entityLogicalName);
    await this.crmFetch<void>(`/${setName}(${id})`, { method: 'DELETE' });
  }
}
