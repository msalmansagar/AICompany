// A dropdown whose options come from a CRM choice attribute (qdb_option_source_entity +
// qdb_option_source_attribute). The publisher cast every source to PicklistAttributeMetadata,
// which Dataverse answers with 404 for a multi-select choice, and the catch turned that into
// an empty dropdown. The cast now follows the attribute's own type.
//
// fetchCrmOptionSetValues is private, so these drive it through the public metadata fetch with
// a mocked Dataverse, as CrmMetadataService.gridColumnEditable.test.ts does.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LRUCache } from 'lru-cache';
import { CrmMetadataService } from './CrmMetadataService.js';
import type { OptionValue } from '@qdb/shared';

const mockAuthService = { getAccessToken: vi.fn().mockResolvedValue('mock-token') } as never;
const mockFetch = vi.fn();
global.fetch = mockFetch;

const FORM_ID = 'fd-opt';
const TAB_ID = 'ba000000-0000-0000-0000-0000000000ab';
const SECTION_ID = 'se000000-0000-0000-0000-0000000000ec';
const FIELD_ID = 'f3000000-0000-0000-0000-00000000000f';
const DROPDOWN_FIELD_TYPE = 100000006;

function okJson(data: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data), headers: { get: () => null } });
}

const OPTION_SET = {
  OptionSet: {
    Options: [
      { Value: 100000000, Label: { LocalizedLabels: [{ Label: 'Cash flow', LanguageCode: 1033 }] } },
      { Value: 100000001, Label: { LocalizedLabels: [{ Label: 'Hiring', LanguageCode: 1033 }] } },
    ],
  },
};

/** Answers by URL, because the service queries the tables in parallel. */
function respond(url: string, attributeTypeName: string) {
  if (url.includes('MultiSelectPicklistAttributeMetadata')) {
    return attributeTypeName === 'MultiSelectPicklistType' ? okJson(OPTION_SET) : okJson({});
  }
  if (url.includes('PicklistAttributeMetadata')) {
    return attributeTypeName === 'PicklistType' ? okJson(OPTION_SET) : okJson({});
  }
  if (url.includes('AttributeTypeName')) return okJson({ AttributeTypeName: { Value: attributeTypeName } });
  return okJson({ value: recordsFor(url) });
}

function recordsFor(url: string): unknown[] {
  if (url.includes('qdb_form_definitions')) {
    return [{
      qdb_form_definitionid: FORM_ID, qdb_form_code: 'option-source-form', qdb_title: 'Option Source Form',
      qdb_status: 100000001, qdb_version: 1, createdon: '2026-10-19T00:00:00Z', modifiedon: '2026-10-19T00:00:00Z',
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
      qdb_form_fieldid: FIELD_ID, _qdb_form_section_id_value: SECTION_ID, qdb_schema_name: 'qdb_challenge',
      qdb_label: 'Key challenge', qdb_field_type: DROPDOWN_FIELD_TYPE, qdb_display_order: 1, qdb_is_visible: true,
      qdb_option_source_entity: 'qdb_servicerequest', qdb_option_source_attribute: 'qdb_keychallengesinoperationstoday',
    }];
  }
  return [];
}

async function publishedOptions(attributeTypeName: string): Promise<OptionValue[] | undefined> {
  mockFetch.mockImplementation((url: string) => respond(String(url), attributeTypeName));
  const service = new CrmMetadataService(
    mockAuthService,
    new LRUCache<string, never>({ max: 10, ttl: 60_000 }) as never,
    null,
  );
  const form = await service.getFormDefinition('option-source-form');
  return form.tabs[0]?.sections[0]?.fields[0]?.options;
}

describe('CrmMetadataService — CRM option source', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('getFormDefinition_MultiSelectSource_PublishesTheLiveOptions', async () => {
    const options = await publishedOptions('MultiSelectPicklistType');

    expect(options?.map((option) => option.label)).toEqual(['Cash flow', 'Hiring']);
  });

  it('getFormDefinition_PicklistSource_PublishesTheLiveOptions', async () => {
    const options = await publishedOptions('PicklistType');

    expect(options?.map((option) => option.value)).toEqual(['100000000', '100000001']);
  });
});
