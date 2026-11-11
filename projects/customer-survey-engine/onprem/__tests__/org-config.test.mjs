import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TABLES } from '../../provisioning/manifest.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TO_CONFIRM = 'TO_CONFIRM';
const FILES = {
  HL: resolve(HERE, '../../onprem-deploy/2026-11-11/config/HL.json'),
  BFD: resolve(HERE, '../../onprem-deploy/2026-11-11/config/BFD.json'),
  cloud: resolve(HERE, '../../provisioning/seed/org5869857f.json'),
};
const ROW_GROUPS = [['sources', 'qdb_survey_source'], ['smsConfigs', 'qdb_survey_sms_config']];

const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const columnsOf = (tableName) => new Map(TABLES.find((table) => table.name === tableName).columns.map((column) => [column.name, column]));

function rowsOf(config) {
  return [
    ...ROW_GROUPS.flatMap(([group, table]) => (config[group] ?? []).map((row) => ({ table, row }))),
    { table: 'qdb_survey_settings', row: config.settings },
  ];
}

for (const [org, file] of Object.entries(FILES)) {
  test(`config_${org}_everyColumnExistsOnItsTable`, () => {
    const unknown = rowsOf(read(file)).flatMap(({ table, row }) => Object.keys(row).filter((key) => key !== 'qdb_name' && !columnsOf(table).has(key)).map((key) => `${table}.${key}`));

    assert.deepEqual(unknown, []);
  });

  test(`config_${org}_everyChoiceValueIsAnOptionOfItsColumn`, () => {
    const invalid = rowsOf(read(file)).flatMap(({ table, row }) => Object.entries(row)
      .filter(([key, value]) => columnsOf(table).get(key)?.type === 'picklist' && value !== TO_CONFIRM)
      .filter(([key, value]) => !columnsOf(table).get(key).options.some((option) => option.value === value))
      .map(([key, value]) => `${table}.${key}=${value}`));

    assert.deepEqual(invalid, []);
  });
}

for (const org of ['HL', 'BFD']) {
  test(`config_${org}_everyToConfirmValueHasAQuestion`, () => {
    const config = read(FILES[org]);
    const askedPaths = config.questions.map((question) => question.path).join(' ');
    const unasked = rowsOf(config).flatMap(({ row }) => Object.entries(row).filter(([key, value]) => value === TO_CONFIRM && !askedPaths.includes(key)).map(([key]) => key));

    assert.deepEqual(unasked, []);
  });

  test(`config_${org}_questionIdsAreUniqueAndOwned`, () => {
    const { questions } = read(FILES[org]);

    assert.equal(new Set(questions.map((question) => question.id)).size, questions.length);
    assert.ok(questions.every((question) => question.owner && question.blocks));
  });
}

test('config_customerTable_HLIsContactAndBFDIsAccount', () => {
  assert.deepEqual([read(FILES.HL).settings.qdb_customer_table, read(FILES.BFD).settings.qdb_customer_table], [100000001, 100000000]);
});
