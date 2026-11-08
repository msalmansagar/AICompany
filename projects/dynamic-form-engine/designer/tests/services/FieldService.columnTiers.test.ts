// The designer must read back the display-style and capture-mode columns, and an org missing
// the newest of them must lose only those, not every extended field setting.

import { describe, it, expect, vi } from 'vitest';
import { FieldService } from '@/services/FieldService';
import type { IWebApiAdapter } from '@/services/IWebApiAdapter';

const SECTION_ID = '00000000-0000-0000-0000-000000000003';

function webApiWith(retrieve: (query: string) => Promise<unknown>) {
  return {
    createRecord: vi.fn(), updateRecord: vi.fn(), deleteRecord: vi.fn(), retrieveRecord: vi.fn(),
    retrieveMultipleRecords: vi.fn((_entity: string, query: string) => retrieve(query)),
    executeAction: vi.fn(),
  } as unknown as IWebApiAdapter;
}

const FIELD_RECORD = {
  qdb_form_fieldid: 'f1', _qdb_form_section_id_value: SECTION_ID, qdb_label: 'Satisfaction', qdb_code: 'sat',
  qdb_field_type: 100000006, qdb_radio_render_style: 100000002, qdb_file_capture_mode: 100000001,
};

describe('FieldService.listFieldsForSection column tiers', () => {
  it('listFieldsForSection_AllColumnsDeployed_ReadsRatingStyleAndCaptureMode', async () => {
    const service = new FieldService(webApiWith(async () => ({ entities: [FIELD_RECORD] })));

    const [field] = await service.listFieldsForSection(SECTION_ID);

    expect(field).toMatchObject({ radioRenderStyle: 'rating', fileCaptureMode: 'camera' });
  });

  it('listFieldsForSection_NewestColumnMissing_KeepsTheExtendedColumns', async () => {
    const queries: string[] = [];
    const service = new FieldService(webApiWith(async (query) => {
      queries.push(query);
      if (query.includes('qdb_file_capture_mode')) throw new Error("Could not find a property named 'qdb_file_capture_mode'");
      return { entities: [] };
    }));

    await service.listFieldsForSection(SECTION_ID);

    const answered = queries[queries.length - 1]!;
    expect(answered).not.toContain('qdb_file_capture_mode');
    expect(answered).toContain('qdb_grid_mode');
  });
});
