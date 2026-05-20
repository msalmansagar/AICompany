import type { OptionValue } from '@dfe/shared';
import { CrmBaseService } from './CrmBaseService.js';
import type { CrmAuthService } from './CrmAuthService.js';

interface ODataCollection<T> {
  value: T[];
}

interface RawOptionRecord {
  _qdb_form_field_id_value: string;
  qdb_value: string;
  qdb_label: string;
  qdb_display_order: number;
  qdb_is_default?: boolean;
  qdb_parent_option_value?: string;
  qdb_is_active?: boolean;
}

export class CrmOptionService extends CrmBaseService {
  constructor(authService: CrmAuthService) {
    super(authService);
  }

  async getOptions(fieldId: string, parentValue?: string): Promise<OptionValue[]> {
    const filters = [
      `_qdb_form_field_id_value eq '${fieldId}'`,
      `qdb_is_active eq true`,
    ];

    if (parentValue) {
      filters.push(
        `(qdb_parent_option_value eq '${parentValue}' or qdb_parent_option_value eq null)`,
      );
    }

    const query = [
      `$filter=${encodeURIComponent(filters.join(' and '))}`,
      `$orderby=qdb_display_order asc`,
    ].join('&');

    const response = await this.crmFetch<ODataCollection<RawOptionRecord>>(
      `/qdb_form_option_values?${query}`,
    );

    return response.value.map((opt) => ({
      value: opt.qdb_value,
      label: opt.qdb_label,
      displayOrder: opt.qdb_display_order,
      isDefault: opt.qdb_is_default ?? false,
      parentOptionValue: opt.qdb_parent_option_value,
      isActive: opt.qdb_is_active ?? true,
    }));
  }
}
