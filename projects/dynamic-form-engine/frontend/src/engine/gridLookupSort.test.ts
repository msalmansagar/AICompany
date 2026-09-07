import { describe, it, expect, beforeEach, vi } from 'vitest';
import { lookupApi } from '../../webresource/xrm/lookupApi';

// The in-CRM lookup reads through Xrm.WebApi. Capturing the OData query it builds is the
// only way to prove the maker's sort direction reaches Dataverse.
const retrieveMultipleRecords = vi.fn();

function lastQuery(): string {
  return String(retrieveMultipleRecords.mock.calls[0]?.[1] ?? '');
}

describe('in-CRM grid lookup ordering', () => {
  beforeEach(() => {
    retrieveMultipleRecords.mockReset();
    retrieveMultipleRecords.mockResolvedValue({ entities: [] });
    (globalThis as unknown as { Xrm: unknown }).Xrm = {
      WebApi: { retrieveMultipleRecords },
    };
  });

  it('should_order_by_the_display_attribute_when_sort_is_ascending', async () => {
    await lookupApi.search('qdb_year', { displayAttribute: 'qdb_name', sort: 'asc' });

    expect(lastQuery()).toContain('$orderby=qdb_name asc');
  });

  it('should_order_by_the_display_attribute_when_sort_is_descending', async () => {
    await lookupApi.search('qdb_year', { displayAttribute: 'qdb_name', sort: 'desc' });

    expect(lastQuery()).toContain('$orderby=qdb_name desc');
  });

  it('should_leave_the_query_unordered_when_no_sort_is_configured', async () => {
    await lookupApi.search('qdb_year', { displayAttribute: 'qdb_name' });

    expect(lastQuery()).not.toContain('$orderby');
  });

  it('should_keep_the_search_filter_alongside_the_order', async () => {
    await lookupApi.search('qdb_year', {
      displayAttribute: 'qdb_name',
      search: '2026',
      sort: 'asc',
    });

    expect(lastQuery()).toContain('$filter=');
    expect(lastQuery()).toContain('$orderby=qdb_name asc');
  });
});
