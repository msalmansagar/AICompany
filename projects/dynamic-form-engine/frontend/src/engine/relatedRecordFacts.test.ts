import { describe, it, expect, vi } from 'vitest';
import { createRelatedFactResolver } from './relatedRecordFacts';
import { relatedFactName } from '@qdb/shared';
import type { BusinessRule, FieldDefinition } from '@qdb/shared';

const SPONSOR_FIELD = {
  id: 'guid-sponsor', schemaName: 'rb2_sponsor', fieldType: 'lookup',
  lookupConfig: { entityLogicalName: 'account' },
} as unknown as FieldDefinition;

const RULES = [{
  id: 'r1', name: 'r', conditionsLogic: 'AND', action: 'hideField', priority: 1, isActive: true,
  conditions: [
    { fieldId: 'rb2_sponsor', relatedAttribute: 'industrycode', operator: 'equals', value: '6' },
    { fieldId: 'rb2_sponsor', relatedAttribute: 'revenue', operator: 'greaterThan', value: 1 },
  ],
}] as BusinessRule[];

const INDUSTRY = relatedFactName('rb2_sponsor', 'industrycode');
const REVENUE = relatedFactName('rb2_sponsor', 'revenue');

function setup(read = vi.fn().mockResolvedValue({ industrycode: 6, revenue: 5000 })) {
  const resolve = createRelatedFactResolver({ rules: RULES, fields: [SPONSOR_FIELD], read });
  return { resolve, read };
}

describe('createRelatedFactResolver', () => {
  it('should_read_every_named_column_of_the_selected_record_in_one_call', async () => {
    const { resolve, read } = setup();

    const facts = await resolve({ rb2_sponsor: { id: 'acc-1', displayName: 'X' } });

    expect(read).toHaveBeenCalledWith({ fieldSchemaName: 'rb2_sponsor', entityLogicalName: 'account', recordId: 'acc-1', attributes: ['industrycode', 'revenue'] });
    expect(facts).toEqual({ [INDUSTRY]: 6, [REVENUE]: 5000 });
  });

  it('should_give_null_facts_and_read_nothing_when_the_lookup_is_empty', async () => {
    const { resolve, read } = setup();

    const facts = await resolve({ rb2_sponsor: null });

    expect(read).not.toHaveBeenCalled();
    expect(facts).toEqual({ [INDUSTRY]: null, [REVENUE]: null });
  });

  it('should_read_a_record_once_across_evaluations', async () => {
    const { resolve, read } = setup();

    await resolve({ rb2_sponsor: { id: 'acc-1', displayName: 'X' } });
    await resolve({ rb2_sponsor: { id: 'acc-1', displayName: 'X' } });

    expect(read).toHaveBeenCalledTimes(1);
  });

  it('should_give_null_facts_when_the_read_fails', async () => {
    const { resolve } = setup(vi.fn().mockRejectedValue(new Error('403')));

    const facts = await resolve({ rb2_sponsor: { id: 'acc-1', displayName: 'X' } });

    expect(facts).toEqual({ [INDUSTRY]: null, [REVENUE]: null });
  });

  it('should_read_nothing_for_a_form_without_related_conditions', async () => {
    const read = vi.fn();
    const resolve = createRelatedFactResolver({ rules: [], fields: [SPONSOR_FIELD], read });

    expect(await resolve({ rb2_sponsor: { id: 'acc-1', displayName: 'X' } })).toEqual({});
    expect(read).not.toHaveBeenCalled();
  });
});

describe('createRelatedFactResolver column names', () => {
  it('should_never_request_a_column_that_is_not_a_logical_name', async () => {
    const read = vi.fn().mockResolvedValue({ industrycode: 6 });
    const rules = [{
      id: 'r', name: 'r', conditionsLogic: 'AND', action: 'hideField', priority: 1, isActive: true,
      conditions: [
        { fieldId: 'rb2_sponsor', relatedAttribute: 'industrycode', operator: 'equals', value: '6' },
        { fieldId: 'rb2_sponsor', relatedAttribute: 'name,emailaddress1', operator: 'isEmpty' },
      ],
    }] as BusinessRule[];
    const resolve = createRelatedFactResolver({ rules, fields: [SPONSOR_FIELD], read });

    await resolve({ rb2_sponsor: { id: 'acc-1', displayName: 'X' } });

    expect(read).toHaveBeenCalledWith(expect.objectContaining({ attributes: ['industrycode'] }));
  });
});
