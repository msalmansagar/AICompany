// Xrm-backed replacement for src/api/languageApi.ts. Reads the supported languages from
// qdb_language_config directly, so the language toggle works inside CRM.
import type { LanguageConfig } from '@qdb/shared';
import { webApi } from './xrmClient';

const RTL_CODES = new Set(['ar', 'he', 'fa', 'ur']);

export const languageApi = {
  list: async (): Promise<{ data: LanguageConfig[] }> => {
    const result = await webApi().retrieveMultipleRecords(
      'qdb_language_config',
      '?$filter=statecode eq 0',
    );
    const data: LanguageConfig[] = result.entities.map((row, index) => {
      const code = String(row.qdb_language_code ?? 'en');
      return {
        code,
        displayName: String(row.qdb_display_name ?? row.qdb_name ?? code),
        lcid: typeof row.qdb_lcid === 'number' ? (row.qdb_lcid as number) : undefined,
        isDefault: Boolean(row.qdb_is_default),
        isRtl: row.qdb_is_rtl != null ? Boolean(row.qdb_is_rtl) : RTL_CODES.has(code),
        displayOrder: typeof row.qdb_display_order === 'number' ? (row.qdb_display_order as number) : index,
      };
    });
    return { data };
  },
};
