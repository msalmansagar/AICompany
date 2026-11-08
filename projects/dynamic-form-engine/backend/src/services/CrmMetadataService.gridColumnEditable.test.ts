// DEF-002: the designer saves a grid column's Is Editable switch to qdb_is_editable, but the
// publisher never read it, so a column set to No stayed editable. A column set to No now
// publishes as isReadonly: true. Anything else, including an absent value, publishes nothing,
// so every grid published before this stays byte-identical.
//
// fetchGridColumnConfigs is private, so these drive it through the public metadata fetch with
// a mocked Dataverse, as CrmMetadataService.ruleTargets.test.ts does.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LRUCache } from 'lru-cache';
import { CrmMetadataService } from './CrmMetadataService.js';
import type { GridColumnConfig } from '@qdb/shared';

const mockAuthService = { getAccessToken: vi.fn().mockResolvedValue('mock-token') } as never;
const mockFetch = vi.fn();
global.fetch = mockFetch;

const FORM_ID = 'fd-002';
const TAB_ID = 'ba000000-0000-0000-0000-0000000000ab';
const SECTION_ID = 'se000000-0000-0000-0000-0000000000ec';
const GRID_FIELD_ID = 'f2000000-0000-0000-0000-00000000000f';
const COLUMN_ID = 'c1000000-0000-0000-0000-0000000000c1';
const ENTRY_GRID_MODE = 100000001;
const INTERACTIVE_GRID_FIELD_TYPE = 100000021;

function okJson(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    headers: { get: () => null },
  });
}

/** The record each table returns, answered by URL because the service queries in parallel. */
function recordsFor(url: string, column: Record<string, unknown>): unknown[] {
  if (url.includes('qdb_grid_column_configs')) return [column];
  if (url.includes('qdb_form_definitions')) {
    return [{
      qdb_form_definitionid: FORM_ID, qdb_form_code: 'grid-editable-form', qdb_title: 'Grid Editable Form',
      qdb_status: 100000001, qdb_version: 1, createdon: '2026-10-04T00:00:00Z', modifiedon: '2026-10-04T00:00:00Z',
    }];
  }
  if (url.includes('qdb_form_tabs')) {
    return [{ qdb_form_tabid: TAB_ID, _qdb_form_definition_id_value: FORM_ID, qdb_label: 'Tab', qdb_display_order: 1, qdb_is_visible: true }];
  }
  if (url.includes('qdb_form_sections')) {
    return [{ qdb_form_sectionid: SECTION_ID, _qdb_form_tab_id_value: TAB_ID, qdb_label: 'Section', qdb_display_order: 1, qdb_is_visible: true, qdb_columns: 100000001 }];
  }
  if (url.includes('qdb_form_fields')) {
    return [{
      qdb_form_fieldid: GRID_FIELD_ID, _qdb_form_section_id_value: SECTION_ID, qdb_schema_name: 'qdb_items',
      qdb_label: 'Items', qdb_field_type: INTERACTIVE_GRID_FIELD_TYPE, qdb_display_order: 1, qdb_is_visible: true,
      qdb_grid_mode: ENTRY_GRID_MODE, qdb_grid_entity_name: 'qdb_item',
    }];
  }
  return [];
}

/** Publishes a form whose one entry grid has one column, and returns that column. */
async function publishedColumn(isEditable: boolean | undefined): Promise<GridColumnConfig | undefined> {
  const column: Record<string, unknown> = {
    qdb_grid_column_configid: COLUMN_ID, _qdb_form_field_id_value: GRID_FIELD_ID, qdb_display_order: 1,
    qdb_column_label: 'Country of origin', qdb_column_attribute: 'qdb_origin', qdb_column_field_type: 'text',
    qdb_is_visible: true,
  };
  if (isEditable !== undefined) column['qdb_is_editable'] = isEditable;
  mockFetch.mockImplementation((url: string) => okJson({ value: recordsFor(String(url), column) }));

  const service = new CrmMetadataService(
    mockAuthService,
    new LRUCache<string, never>({ max: 10, ttl: 60_000 }) as never,
    null,
  );
  const form = await service.getFormDefinition('grid-editable-form');
  return form.tabs[0]?.sections[0]?.fields[0]?.gridConfig?.columnConfigs?.[0];
}

describe('CrmMetadataService — grid column Is Editable', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('getFormDefinition_ColumnNotEditable_PublishesReadonly', async () => {
    const column = await publishedColumn(false);

    expect(column?.isReadonly).toBe(true);
  });

  it('getFormDefinition_ColumnEditable_PublishesNoReadonlyFlag', async () => {
    const column = await publishedColumn(true);

    expect(column).not.toHaveProperty('isReadonly');
  });

  // Columns on an org that never had qdb_is_editable, or rows written without it, must stay
  // editable: that is how every grid behaved before this fix.
  it('getFormDefinition_IsEditableAbsent_PublishesNoReadonlyFlag', async () => {
    const column = await publishedColumn(undefined);

    expect(column).not.toHaveProperty('isReadonly');
  });
});
