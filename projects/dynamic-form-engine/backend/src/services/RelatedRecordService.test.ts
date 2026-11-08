import { describe, it, expect, vi } from 'vitest';
import { RelatedRecordService } from './RelatedRecordService.js';
import { CrmApiError } from '../utils/errors.js';
import type { FormDefinition } from '@qdb/shared';

const RECORD_ID = '09f1b2a3-436a-f111-a826-7ced8d96ec97';

function formWith(conditions: Array<Record<string, unknown>>, filterExpression?: string): FormDefinition {
  return {
    tabs: [{
      id: 't', sections: [{
        id: 's', fields: [
          { id: 'f-sponsor', schemaName: 'rb2_sponsor', fieldType: 'lookup', lookupConfig: { entityLogicalName: 'account', filterExpression }, businessRules: [] },
          { id: 'f-note', schemaName: 'rb2_note', fieldType: 'text', businessRules: [{ id: 'r', conditions, isActive: true }] },
        ],
      }],
    }],
  } as unknown as FormDefinition;
}

type Fetch = (path: string) => Promise<unknown>;

function setup(form: FormDefinition, records: Array<Record<string, unknown>> = [{ industrycode: 6, revenue: 5000, secretcolumn: 'leak' }]) {
  const service = new RelatedRecordService({ getAccessToken: () => Promise.resolve('t') } as never, {
    getFormDefinition: vi.fn().mockResolvedValue(form),
  });
  const crmFetch = vi.fn<Fetch>(async (path: string) => {
    if (path.startsWith('/EntityDefinitions')) return { EntitySetName: 'accounts', PrimaryIdAttribute: 'accountid' };
    return { value: records };
  });
  (service as unknown as { crmFetch: Fetch }).crmFetch = crmFetch;
  return { service, crmFetch };
}

const SPONSOR_CONDITIONS = [
  { fieldId: 'rb2_sponsor', relatedAttribute: 'industrycode', operator: 'equals', value: '6' },
  { fieldId: 'rb2_sponsor', relatedAttribute: 'revenue', operator: 'greaterThan', value: 1 },
];

const read = (service: RelatedRecordService, fieldSchemaName = 'rb2_sponsor', recordId = RECORD_ID) =>
  service.readRuleAttributes({ formCode: 'demo', fieldSchemaName, recordId });

function lastQuery(crmFetch: ReturnType<typeof vi.fn<Fetch>>): string {
  return decodeURIComponent(String(crmFetch.mock.calls.at(-1)![0]));
}

describe('RelatedRecordService.readRuleAttributes', () => {
  it('readRuleAttributes_RuleNamedColumns_SelectsAndReturnsOnlyThose', async () => {
    const { service, crmFetch } = setup(formWith(SPONSOR_CONDITIONS));

    const values = await read(service);

    expect(lastQuery(crmFetch)).toBe(`/accounts?$select=industrycode,revenue&$filter=accountid eq ${RECORD_ID}&$top=1`);
    expect(values).toEqual({ industrycode: 6, revenue: 5000 });
  });

  it('readRuleAttributes_LookupHasAFilter_OnlyReadsRecordsInsideIt', async () => {
    const { service, crmFetch } = setup(formWith(SPONSOR_CONDITIONS, 'statecode eq 0'));

    await read(service);

    expect(lastQuery(crmFetch)).toContain(`$filter=(accountid eq ${RECORD_ID}) and (statecode eq 0)`);
  });

  it('readRuleAttributes_RecordOutsideTheLookupScope_Refuses404', async () => {
    const { service } = setup(formWith(SPONSOR_CONDITIONS, 'statecode eq 0'), []);

    await expect(read(service)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('readRuleAttributes_DataverseError_Refuses404WithoutItsText', async () => {
    const { service, crmFetch } = setup(formWith(SPONSOR_CONDITIONS));
    crmFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/EntityDefinitions')) return { EntitySetName: 'accounts', PrimaryIdAttribute: 'accountid' };
      throw new CrmApiError('Dataverse API error: 400 — accounts has no column secret', 400);
    });

    await expect(read(service)).rejects.toMatchObject({ statusCode: 404, message: 'Related record not found' });
  });

  it('readRuleAttributes_NoRuleReadsTheLookup_RefusesWith404', async () => {
    const { service, crmFetch } = setup(formWith([]));

    await expect(read(service)).rejects.toMatchObject({ statusCode: 404 });
    expect(crmFetch).not.toHaveBeenCalled();
  });

  it('readRuleAttributes_FieldIsNotALookup_RefusesWith404', async () => {
    const { service } = setup(formWith(SPONSOR_CONDITIONS));

    await expect(read(service, 'rb2_note')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('readRuleAttributes_RecordIdNotAGuid_RefusesWith400', async () => {
    const { service, crmFetch } = setup(formWith(SPONSOR_CONDITIONS));

    await expect(read(service, 'rb2_sponsor', "x') or (1 eq 1")).rejects.toMatchObject({ statusCode: 400 });
    expect(crmFetch).not.toHaveBeenCalled();
  });

  it('readRuleAttributes_ColumnNameIsNotALogicalName_IsNeverQueried', async () => {
    const { service, crmFetch } = setup(formWith([
      ...SPONSOR_CONDITIONS,
      { fieldId: 'rb2_sponsor', relatedAttribute: 'name&$expand=x', operator: 'isEmpty' },
    ]));

    await read(service);

    expect(lastQuery(crmFetch)).toContain('$select=industrycode,revenue&');
  });
});
