/**
 * FR-CSE-061 — Scoring Mode (None / Weighted) on qdb_form_definition.
 *
 * qdb_scoring_mode is a new column not provisioned on every org. The load path
 * uses a three-tier fallback identical to the form-type column before it:
 *   Tier 1: both qdb_form_type and qdb_scoring_mode available
 *   Tier 2: qdb_form_type only
 *   Tier 3: baseline (neither column)
 *
 * Save only writes the column when isScoringAvailable === true, so a PATCH against
 * an org without the column never names it.
 */

import { describe, it, expect, vi } from 'vitest';
import { FormDefinitionService } from '@/services/FormDefinitionService';
import { FORM_DEFINITION_ATTRS, SCORING_MODE_TO_PICKLIST } from '@/constants/formAttributeNames';
import type { IWebApiAdapter } from '@/services/IWebApiAdapter';

const FORM_ID = '55555555-5555-5555-5555-555555555555';

const BASE_RECORD = {
  '@odata.etag': 'W/"1"',
  [FORM_DEFINITION_ATTRS.ID]: FORM_ID,
  [FORM_DEFINITION_ATTRS.NAME]: 'Satisfaction Survey',
  [FORM_DEFINITION_ATTRS.CODE]: 'srv-satisfaction',
};

function webApiWith(retrieve: (query: string) => Promise<Record<string, unknown>>): IWebApiAdapter {
  return {
    createRecord: vi.fn(),
    updateRecord: vi.fn(),
    deleteRecord: vi.fn(),
    retrieveRecord: vi.fn((_entity: string, _id: string, query: string) => retrieve(query)),
    retrieveMultipleRecords: vi.fn(),
    executeAction: vi.fn(),
    updateRecordConditional: vi.fn().mockResolvedValue(undefined),
  } as unknown as IWebApiAdapter;
}

function patchedData(webApi: IWebApiAdapter): Record<string, unknown> {
  const call = (webApi.updateRecordConditional as ReturnType<typeof vi.fn>).mock.calls[0]!;
  return call[2] as Record<string, unknown>;
}

describe('FormDefinitionService — scoring mode', () => {

  // ── Tier 1: both columns present ───────────────────────────────────────────

  it('getFormWithEtag_bothColumnsDeployed_readsScoringModeWeighted', async () => {
    const service = new FormDefinitionService(webApiWith(async () => ({
      ...BASE_RECORD,
      [FORM_DEFINITION_ATTRS.FORM_TYPE]: 100000001, // Survey
      [FORM_DEFINITION_ATTRS.SCORING_MODE]: SCORING_MODE_TO_PICKLIST.Weighted,
    })));

    const { model } = await service.getFormWithEtag(FORM_ID);

    expect(model.scoringMode).toBe('Weighted');
    expect(model.isScoringAvailable).toBe(true);
  });

  it('getFormWithEtag_scoringModeNone_leavesModelScoringModeUndefined', async () => {
    // The None picklist value means "not weighted" — equivalent to absent
    const service = new FormDefinitionService(webApiWith(async () => ({
      ...BASE_RECORD,
      [FORM_DEFINITION_ATTRS.FORM_TYPE]: 100000001,
      [FORM_DEFINITION_ATTRS.SCORING_MODE]: SCORING_MODE_TO_PICKLIST.None,
    })));

    const { model } = await service.getFormWithEtag(FORM_ID);

    // None → model stays undefined / no scoringMode set
    expect(model.scoringMode).toBeUndefined();
    expect(model.isScoringAvailable).toBe(true);
  });

  // ── Tier 2: only qdb_form_type ─────────────────────────────────────────────

  it('getFormWithEtag_onlyScoringModeColumnMissing_fallsBackAndMarksScoringUnavailable', async () => {
    const queries: string[] = [];
    const service = new FormDefinitionService(webApiWith(async (query) => {
      queries.push(query);
      if (query.includes(FORM_DEFINITION_ATTRS.SCORING_MODE)) {
        throw new Error(`Could not find a property named '${FORM_DEFINITION_ATTRS.SCORING_MODE}'`);
      }
      return { ...BASE_RECORD, [FORM_DEFINITION_ATTRS.FORM_TYPE]: 100000001 };
    }));

    const { model } = await service.getFormWithEtag(FORM_ID);

    expect(model.formType).toBe('Survey');
    expect(model.isScoringAvailable).toBe(false);
    expect(model.scoringMode).toBeUndefined();
    // The final successful query must NOT contain the scoring mode column
    const lastQuery = queries[queries.length - 1]!;
    expect(lastQuery).not.toContain(FORM_DEFINITION_ATTRS.SCORING_MODE);
    expect(lastQuery).toContain(FORM_DEFINITION_ATTRS.FORM_TYPE);
  });

  // ── Tier 3: neither column ─────────────────────────────────────────────────

  it('getFormWithEtag_bothNewColumnsMissing_loadsBaselineAndMarksBothUnavailable', async () => {
    let callCount = 0;
    const service = new FormDefinitionService(webApiWith(async (query) => {
      callCount++;
      if (query.includes(FORM_DEFINITION_ATTRS.SCORING_MODE) || query.includes(FORM_DEFINITION_ATTRS.FORM_TYPE)) {
        throw new Error(`Could not find a property named 'new_column'`);
      }
      return BASE_RECORD;
    }));

    const { model } = await service.getFormWithEtag(FORM_ID);

    expect(model.formType).toBeUndefined();
    expect(model.scoringMode).toBeUndefined();
    expect(model.isFormTypeAvailable).toBe(false);
    expect(model.isScoringAvailable).toBe(false);
    // Should have made exactly 3 attempts (scoring+type, type only, baseline)
    expect(callCount).toBe(3);
  });

  // ── Save path ──────────────────────────────────────────────────────────────

  it('updateForm_scoringModeUnset_sendsNoScoringModeAttribute', async () => {
    const webApi = webApiWith(async () => BASE_RECORD);

    await new FormDefinitionService(webApi).updateForm(FORM_ID, { name: 'Renamed' }, 'W/"1"');

    expect(patchedData(webApi)).not.toHaveProperty(FORM_DEFINITION_ATTRS.SCORING_MODE);
  });

  it('updateForm_scoringModeWeighted_sendsWeightedPicklistValue', async () => {
    const webApi = webApiWith(async () => BASE_RECORD);

    await new FormDefinitionService(webApi).updateForm(FORM_ID, { scoringMode: 'Weighted' }, 'W/"1"');

    expect(patchedData(webApi)[FORM_DEFINITION_ATTRS.SCORING_MODE]).toBe(SCORING_MODE_TO_PICKLIST.Weighted);
  });

  it('updateForm_scoringModeNone_sendsNonePicklistValue', async () => {
    const webApi = webApiWith(async () => BASE_RECORD);

    await new FormDefinitionService(webApi).updateForm(FORM_ID, { scoringMode: 'None' }, 'W/"1"');

    expect(patchedData(webApi)[FORM_DEFINITION_ATTRS.SCORING_MODE]).toBe(SCORING_MODE_TO_PICKLIST.None);
  });
});
