// The backend's designer-rule converter hardcoded `targetSectionId: undefined` and
// `targetTabId: undefined`, so a rule aimed at a tab arrived at the runtime aimed at nothing.
// The C# plugin had the same gap by a different route — see DesignerRuleTargetTests.
//
// convertDesignerRule is private, so these drive it through the public metadata fetch with a
// mocked Dataverse.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LRUCache } from 'lru-cache';
import { CrmMetadataService } from './CrmMetadataService.js';
import type { BusinessRule } from '@qdb/shared';

const mockAuthService = { getAccessToken: vi.fn().mockResolvedValue('mock-token') } as never;
const mockFetch = vi.fn();
global.fetch = mockFetch;

const FORM_ID = 'fd-001';
const TAB_ID = 'ba000000-0000-0000-0000-0000000000ab';
const SECTION_ID = 'se000000-0000-0000-0000-0000000000ec';
const FIELD_ID = 'f1000000-0000-0000-0000-00000000000f';
const TRIGGER_CODE = 'qdb_applicant_type';

function okJson(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    headers: { get: () => null },
  });
}

function ruleJson(actionType: string, target: Record<string, string>): string {
  return JSON.stringify({
    version: '1.0',
    trigger_field_code: TRIGGER_CODE,
    trigger_event: 'on_change',
    condition_group: {
      logical_operator: 'AND',
      conditions: [{ field_code: TRIGGER_CODE, operator: 'equals', value: 'individual' }],
    },
    actions: [{ action_type: actionType, ...target }],
  });
}

/**
 * Drives a form with one tab, one section, one field and one business rule through the
 * service, and returns the rules that reached the field.
 */
async function rulesFor(actionType: string, target: Record<string, string>): Promise<BusinessRule[]> {
  mockFetch.mockReset();

  // Answering by URL rather than by call order: the service issues several of these in
  // parallel, so a fixed sequence would bind each response to whichever request happened
  // to be scheduled first.
  mockFetch.mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('qdb_form_business_rules')) {
      return okJson({ value: [{
        qdb_form_business_ruleid: 'br-1',
        _qdb_form_definition_id_value: FORM_ID,
        qdb_name: 'Hide when individual',
        qdb_conditions_json: ruleJson(actionType, target),
        qdb_priority: 1,
        qdb_is_active: true,
      }] });
    }
    if (typeof url === 'string' && url.includes('qdb_form_definitions')) {
      return okJson({ value: [{
        qdb_form_definitionid: FORM_ID,
        qdb_form_code: 'rule-target-form',
        qdb_title: 'Rule Target Form',
        qdb_status: 100000001,
        qdb_version: 1,
        qdb_allow_save_draft: true,
        qdb_confirmation_message: 'Submitted.',
        createdon: '2026-08-01T00:00:00Z',
        modifiedon: '2026-08-01T00:00:00Z',
      }] });
    }
    if (typeof url === 'string' && url.includes('qdb_form_tabs')) {
      return okJson({ value: [{
        qdb_form_tabid: TAB_ID,
        _qdb_form_definition_id_value: FORM_ID,
        qdb_label: 'Tab One',
        qdb_display_order: 1,
        qdb_is_visible: true,
      }] });
    }
    if (typeof url === 'string' && url.includes('qdb_form_sections')) {
      return okJson({ value: [{
        qdb_form_sectionid: SECTION_ID,
        _qdb_form_tab_id_value: TAB_ID,
        qdb_label: 'Section One',
        qdb_display_order: 1,
        qdb_is_visible: true,
        qdb_columns: 100000001,
      }] });
    }
    if (typeof url === 'string' && url.includes('qdb_form_fields')) {
      return okJson({ value: [{
        qdb_form_fieldid: FIELD_ID,
        _qdb_form_section_id_value: SECTION_ID,
        qdb_schema_name: TRIGGER_CODE,
        qdb_label: 'Applicant Type',
        qdb_field_type: 100000001,
        qdb_display_order: 1,
        qdb_is_visible: true,
      }] });
    }
    return okJson({ value: [] });
  });

  const service = new CrmMetadataService(
    mockAuthService,
    new LRUCache<string, never>({ max: 10, ttl: 60_000 }) as never,
    null,
  );
  const form = await service.getFormDefinition('rule-target-form');
  return form.tabs[0]?.sections[0]?.fields[0]?.businessRules ?? [];
}

describe('CrmMetadataService — designer rule targets', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('carriesTheTabTarget_forAHideTabAction', async () => {
    const rules = await rulesFor('hide_tab', { target_tab_id: TAB_ID });

    expect(rules[0]?.action).toBe('hideTab');
    expect(rules[0]?.targetTabId).toBe(TAB_ID);
  });

  it('carriesTheSectionTarget_forAHideSectionAction', async () => {
    const rules = await rulesFor('hide_section', { target_section_id: SECTION_ID });

    expect(rules[0]?.action).toBe('hideSection');
    expect(rules[0]?.targetSectionId).toBe(SECTION_ID);
  });

  it('leavesTheFieldTargetUnset_forATabAction', async () => {
    const rules = await rulesFor('hide_tab', { target_tab_id: TAB_ID });

    expect(rules[0]?.targetFieldId).toBeUndefined();
  });

  it('stillResolvesFieldActionsByCode', async () => {
    const rules = await rulesFor('hide_field', { target_field_code: TRIGGER_CODE });

    expect(rules[0]?.action).toBe('hideField');
    expect(rules[0]?.targetFieldId).toBe(FIELD_ID);
  });

  // An action naming no target cannot be applied to anything.
  it('dropsATabAction_withNoTabId', async () => {
    const rules = await rulesFor('hide_tab', {});

    expect(rules).toEqual([]);
  });
});
