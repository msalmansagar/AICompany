import { describe, it, expect } from 'vitest';
import {
  TranslatableStringsService,
  TranslatableStringsError,
} from '@/services/translations/TranslatableStringsService';
import type {
  IWebApiAdapter,
  WebApiRecord,
  WebApiRetrieveMultipleResult,
} from '@/services/IWebApiAdapter';

const FORM_ID = '11111111-1111-1111-1111-111111111111';
const TAB_ID = '22222222-2222-2222-2222-222222222222';
const SECTION_ID = '33333333-3333-3333-3333-333333333333';
const FIELD_ID = '44444444-4444-4444-4444-444444444444';

/** Records the designer asks Dataverse for, so the walk itself can be asserted. */
class FakeWebApi implements IWebApiAdapter {
  readonly requests: Array<{ entity: string; options?: string }> = [];

  constructor(
    private readonly byEntity: Record<string, WebApiRecord[]> = {},
    private readonly failures: Record<string, Error> = {},
  ) {}

  async retrieveMultipleRecords(
    entityLogicalName: string,
    options?: string,
  ): Promise<WebApiRetrieveMultipleResult> {
    this.requests.push({ entity: entityLogicalName, options });

    const failure = this.failures[entityLogicalName];
    if (failure) throw failure;

    return { entities: this.byEntity[entityLogicalName] ?? [] };
  }

  optionsFor(entity: string): string | undefined {
    return this.requests.find((r) => r.entity === entity)?.options;
  }

  askedFor(entity: string): boolean {
    return this.requests.some((r) => r.entity === entity);
  }

  createRecord(): Promise<never> { return Promise.reject(new Error('unused in these tests')); }
  updateRecord(): Promise<never> { return Promise.reject(new Error('unused in these tests')); }
  deleteRecord(): Promise<never> { return Promise.reject(new Error('unused in these tests')); }
  retrieveRecord(): Promise<never> { return Promise.reject(new Error('unused in these tests')); }
  executeAction(): Promise<never> { return Promise.reject(new Error('unused in these tests')); }
  updateRecordConditional(): Promise<never> { return Promise.reject(new Error('unused in these tests')); }
}

function formGraph(): Record<string, WebApiRecord[]> {
  return {
    qdb_form_definition: [
      { qdb_form_definitionid: FORM_ID, qdb_title: 'Loan Application', qdb_form_code: 'loan' },
    ],
    qdb_form_tab: [
      { qdb_form_tabid: TAB_ID, qdb_label: 'Applicant', qdb_schema_name: 'tab_applicant' },
    ],
    qdb_form_section: [
      { qdb_form_sectionid: SECTION_ID, qdb_label: 'Company details', qdb_schema_name: 'sec_company' },
    ],
    qdb_form_field: [
      { qdb_form_fieldid: FIELD_ID, qdb_label: 'Full name', qdb_schema_name: 'fld_name' },
    ],
  };
}

describe('TranslatableStringsService', () => {
  it('collectForForm_rejectsFormId_whenNotAGuid', async () => {
    const service = new TranslatableStringsService(new FakeWebApi());

    await expect(service.collectForForm("' or 1 eq 1")).rejects.toBeInstanceOf(
      TranslatableStringsError,
    );
  });

  it('collectForForm_filtersRootEntity_byTheFormId', async () => {
    const api = new FakeWebApi(formGraph());

    await new TranslatableStringsService(api).collectForForm(FORM_ID);

    expect(decodeURIComponent(api.optionsFor('qdb_form_definition') ?? '')).toContain(
      `qdb_form_definitionid eq ${FORM_ID}`,
    );
  });

  it('collectForForm_filtersChildEntity_byTheParentIdsFoundAbove', async () => {
    const api = new FakeWebApi(formGraph());

    await new TranslatableStringsService(api).collectForForm(FORM_ID);

    expect(decodeURIComponent(api.optionsFor('qdb_form_section') ?? '')).toContain(
      `_qdb_form_tab_id_value eq ${TAB_ID}`,
    );
  });

  it('collectForForm_returnsARow_perFieldHoldingSourceText', async () => {
    const api = new FakeWebApi(formGraph());

    const { rows } = await new TranslatableStringsService(api).collectForForm(FORM_ID);

    expect(rows).toContainEqual({
      entity: 'qdb_form_field',
      recordId: FIELD_ID,
      field: 'qdb_label',
      source: 'Full name',
      context: 'fld_name',
    });
  });

  it('collectForForm_omitsFields_thatHoldNoText', async () => {
    const graph = formGraph();
    graph.qdb_form_field = [{ qdb_form_fieldid: FIELD_ID, qdb_label: '   ', qdb_description: '' }];
    const api = new FakeWebApi(graph);

    const { rows } = await new TranslatableStringsService(api).collectForForm(FORM_ID);

    expect(rows.filter((r) => r.entity === 'qdb_form_field')).toEqual([]);
  });

  it('collectForForm_asksForNothingBelow_whenALevelIsEmpty', async () => {
    const api = new FakeWebApi({ ...formGraph(), qdb_form_tab: [] });

    await new TranslatableStringsService(api).collectForForm(FORM_ID);

    expect(api.askedFor('qdb_form_section')).toBe(false);
  });

  it('collectForForm_reportsSkipped_whenAnOptionalTableIsAbsent', async () => {
    const api = new FakeWebApi(formGraph(), {
      qdb_info_card_screen: new Error('Resource not found for the segment'),
    });

    const { skipped } = await new TranslatableStringsService(api).collectForForm(FORM_ID);

    expect(skipped).toContainEqual({
      entity: 'qdb_info_card_screen',
      reason: 'Resource not found for the segment',
    });
  });

  it('collectForForm_stillReturnsRows_whenAnOptionalTableIsAbsent', async () => {
    const api = new FakeWebApi(formGraph(), {
      qdb_info_card_screen: new Error('Resource not found for the segment'),
    });

    const { rows } = await new TranslatableStringsService(api).collectForForm(FORM_ID);

    expect(rows.some((r) => r.entity === 'qdb_form_field')).toBe(true);
  });

  it('collectForForm_throws_whenTheFormItselfCannotBeRead', async () => {
    const api = new FakeWebApi(formGraph(), {
      qdb_form_definition: new Error('401 Unauthorized'),
    });

    await expect(new TranslatableStringsService(api).collectForForm(FORM_ID)).rejects.toBeInstanceOf(
      TranslatableStringsError,
    );
  });

  it('collectForForm_ignoresRecordIds_thatAreNotGuids', async () => {
    const graph = formGraph();
    graph.qdb_form_tab = [{ qdb_form_tabid: 'not-a-guid', qdb_label: 'Applicant' }];
    const api = new FakeWebApi(graph);

    await new TranslatableStringsService(api).collectForForm(FORM_ID);

    expect(api.askedFor('qdb_form_section')).toBe(false);
  });
});
