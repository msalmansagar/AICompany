// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { resolveRouteFilter } from './FetchXmlMetadataResolver';
import type { ICrmAdapter } from './ICrmAdapter';

/**
 * CWFD-013 — conditions must read as words, not codes (user-reported via
 * Agentation): an option-set condition showed "751090002" instead of "CEO",
 * and a lookup condition showed the raw GUID instead of the record's name.
 */

const APPROVED_ID = '9bc789e3-07a0-f111-b8dc-000d3abd8313';

function mockAdapter(): ICrmAdapter {
  return {
    getAttributesMeta: vi.fn(async (entity: string) => {
      if (entity === 'qdb_loan_application') {
        return [
          { logicalName: 'qdb_approval_authority', displayName: 'Approval Authority', attributeType: 'Picklist' },
        ];
      }
      return [
        { logicalName: 'qdb_decision', displayName: 'Decision', attributeType: 'Lookup' },
        { logicalName: 'qdb_approvedamount', displayName: 'Approved Amount', attributeType: 'Money' },
      ];
    }),
    getOptionSetLabels: vi.fn(async () => new Map([[751090002, 'CEO']])),
    getLookupValueName: vi.fn(async () => 'Approve Proposal'),
  } as unknown as ICrmAdapter;
}

const FETCH_PREFIX =
  '<fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false">' +
  '<entity name="qdb_task"><attribute name="activityid"/>';
const FETCH_SUFFIX = '</entity></fetch>';

describe('resolveRouteFilter', () => {
  it('should_resolve_a_link_entity_condition_against_the_linked_entity', async () => {
    const adapter = mockAdapter();
    const xml =
      FETCH_PREFIX +
      '<filter type="and"></filter>' +
      '<link-entity name="qdb_loan_application" from="qdb_loan_applicationid" to="regardingobjectid" alias="application">' +
      '<filter type="and"><condition attribute="qdb_approval_authority" operator="eq" value="751090002"/></filter>' +
      '</link-entity>' +
      FETCH_SUFFIX;
    const resolved = await resolveRouteFilter(xml, adapter);
    expect(resolved!.conditions[0]).toEqual({
      fieldLabel: 'Approval Authority',
      operatorLabel: '=',
      valueLabel: 'CEO',
    });
    expect(adapter.getAttributesMeta).toHaveBeenCalledWith('qdb_loan_application');
  });

  it('should_show_the_record_name_for_a_lookup_guid', async () => {
    const adapter = mockAdapter();
    const xml =
      FETCH_PREFIX +
      `<filter type="and"><condition attribute="qdb_decision" operator="eq" value="{${APPROVED_ID.toUpperCase()}}"/></filter>` +
      FETCH_SUFFIX;
    const resolved = await resolveRouteFilter(xml, adapter);
    expect(resolved!.conditions[0].valueLabel).toBe('Approve Proposal');
  });

  it('should_prefer_the_uiname_the_designer_stored_over_a_fetch', async () => {
    const adapter = mockAdapter();
    const xml =
      FETCH_PREFIX +
      `<filter type="and"><condition attribute="qdb_decision" operator="eq" uiname="Approve" uitype="qdb_outcome" value="{${APPROVED_ID}}"/></filter>` +
      FETCH_SUFFIX;
    const resolved = await resolveRouteFilter(xml, adapter);
    expect(resolved!.conditions[0].valueLabel).toBe('Approve');
    expect(adapter.getLookupValueName).not.toHaveBeenCalled();
  });

  it('should_fall_back_to_the_raw_guid_when_the_record_cannot_be_read', async () => {
    const adapter = mockAdapter();
    (adapter.getLookupValueName as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const guid = '11111111-2222-3333-4444-555555555555';
    const xml =
      FETCH_PREFIX +
      `<filter type="and"><condition attribute="qdb_decision" operator="eq" value="{${guid}}"/></filter>` +
      FETCH_SUFFIX;
    const resolved = await resolveRouteFilter(xml, adapter);
    expect(resolved!.conditions[0].valueLabel).toBe(`{${guid}}`);
  });
});
