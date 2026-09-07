import { describe, it, expect } from 'vitest';
import { ExistingTranslationsReader } from '@/services/translations/ExistingTranslationsReader';
import { translationKey } from '@/services/translations/translatableSpec';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { FakeWebApi } from './fakeWebApi';

const RECORD_ID = '44444444-4444-4444-4444-444444444444';

function translationRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    qdb_entity_name: 'qdb_form_field',
    qdb_record_id: RECORD_ID,
    qdb_field_name: 'qdb_label',
    qdb_language_code: 'ar',
    qdb_translated_value: 'الاسم الكامل',
    qdb_source_value: 'Full name',
    ...overrides,
  };
}

function readerWith(...rows: Record<string, unknown>[]): ExistingTranslationsReader {
  return new ExistingTranslationsReader(new FakeWebApi({ [ENTITY_NAMES.TRANSLATION]: rows }));
}

describe('ExistingTranslationsReader', () => {
  it('forRecords_keysEachTranslation_theWayTheRoundTripKeysIt', async () => {
    const found = await readerWith(translationRow()).forRecords([RECORD_ID]);

    expect(found.has(translationKey('qdb_form_field', RECORD_ID, 'qdb_label', 'ar'))).toBe(true);
  });

  it('forRecords_returnsTheSourceSnapshot_alongsideTheValue', async () => {
    const found = await readerWith(translationRow()).forRecords([RECORD_ID]);

    expect(found.get(translationKey('qdb_form_field', RECORD_ID, 'qdb_label', 'ar'))).toEqual({
      value: 'الاسم الكامل',
      sourceSnapshot: 'Full name',
    });
  });

  it('forRecords_reportsAnEmptySnapshot_whenTheRowPredatesSnapshots', async () => {
    const found = await readerWith(translationRow({ qdb_source_value: null })).forRecords([RECORD_ID]);

    expect(found.get(translationKey('qdb_form_field', RECORD_ID, 'qdb_label', 'ar'))?.sourceSnapshot)
      .toBe('');
  });

  it('forRecords_selectsTheSourceValueColumn', async () => {
    const api = new FakeWebApi({ [ENTITY_NAMES.TRANSLATION]: [translationRow()] });

    await new ExistingTranslationsReader(api).forRecords([RECORD_ID]);

    expect(api.requestsFor(ENTITY_NAMES.TRANSLATION)[0].options).toContain('qdb_source_value');
  });

  it('forRecords_batchesRequests_ratherThanFilteringOnEveryIdAtOnce', async () => {
    const api = new FakeWebApi({ [ENTITY_NAMES.TRANSLATION]: [] });
    const ids = Array.from({ length: 45 }, (_, i) => `id-${i}`);

    await new ExistingTranslationsReader(api).forRecords(ids);

    expect(api.requestsFor(ENTITY_NAMES.TRANSLATION)).toHaveLength(3);
  });

  it('forRecords_asksForNothing_whenThereAreNoRecords', async () => {
    const api = new FakeWebApi({ [ENTITY_NAMES.TRANSLATION]: [] });

    await new ExistingTranslationsReader(api).forRecords([]);

    expect(api.requestsFor(ENTITY_NAMES.TRANSLATION)).toEqual([]);
  });

  it('forRecords_deduplicatesRecordIds_beforeBatching', async () => {
    const api = new FakeWebApi({ [ENTITY_NAMES.TRANSLATION]: [] });

    await new ExistingTranslationsReader(api).forRecords(Array.from({ length: 40 }, () => RECORD_ID));

    expect(api.requestsFor(ENTITY_NAMES.TRANSLATION)).toHaveLength(1);
  });
});
