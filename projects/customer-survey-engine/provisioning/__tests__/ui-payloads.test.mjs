/**
 * B8 UI builders: views, charts, forms, sitemap.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VIEWS, CHARTS, FORMS, APP } from '../ui-manifest.mjs';
import { ICONS, iconResourceName } from '../ui-icons.mjs';
import { TABLES } from '../manifest.mjs';
import { buildViewFetchXml, buildViewLayoutXml, buildChartDataXml, buildChartPresentationXml, buildFormXml, buildSiteMapXml, describeField, stableGuid } from '../lib/ui-payloads.mjs';

const viewNamed = (name) => VIEWS.find((v) => v.name === name);
const anyViewId = () => '{00000000-0000-0000-0000-000000000001}';

test('describeField_everyFormField_existsInTheSchemaManifest', () => {
  const fields = FORMS.flatMap((form) => form.tabs.flatMap((tab) => tab.sections.flatMap((section) => (section.fields ?? []).map((field) => [form.table, typeof field === 'string' ? field : field.name]))));

  assert.doesNotThrow(() => fields.forEach(([table, name]) => describeField(table, name)));
});

test('describeField_everyViewColumn_existsInTheSchemaManifest', () => {
  const columns = VIEWS.flatMap((view) => [...view.columns.map(([name]) => [view.table, name]), ...(view.links ?? []).flatMap((link) => link.columns.map(([name]) => [link.table, name]))]);

  assert.doesNotThrow(() => columns.filter(([, name]) => name !== 'qdb_name').forEach(([table, name]) => describeField(table, name)));
});

test('buildViewFetchXml_openInvitations_filtersToActiveAndPending', () => {
  const fetch = buildViewFetchXml(viewNamed('Open Survey Invitations'));

  assert.match(fetch, /<condition attribute="statecode" operator="eq" value="0" \/>/);
  assert.match(fetch, /<condition attribute="qdb_status" operator="eq" value="100000000" \/>/);
  assert.match(fetch, /<order attribute="qdb_generated_on" descending="true" \/>/);
});

test('buildViewFetchXml_answers_linksTheResponseForSetupCustomerAndDate', () => {
  const fetch = buildViewFetchXml(viewNamed('Survey Answers - All'));

  assert.match(fetch, /<link-entity name="qdb_survey_response" from="qdb_survey_responseid" to="qdb_survey_response_id" link-type="outer" alias="response">/);
  assert.match(fetch, /<attribute name="qdb_submitted_on" \/><\/link-entity>/);
});

test('buildViewLayoutXml_answers_namesLinkedCellsAliasDotColumn', () => {
  const layout = buildViewLayoutXml(viewNamed('Survey Answers - All'), 10123);

  assert.match(layout, /object="10123"/);
  assert.match(layout, /<cell name="response.qdb_customer_id" width="180" \/>/);
});

test('buildChartDataXml_responsesByMonth_groupsByMonth', () => {
  const data = buildChartDataXml(CHARTS.find((c) => c.name === 'Responses by Month'));

  assert.match(data, /<attribute name="qdb_submitted_on" groupby="true" dategrouping="month" alias="groupby_column" \/>/);
  assert.match(data, /aggregate="count" alias="aggregate_column"/);
});

test('buildChartDataXml_averageScore_ignoresTextAnswers', () => {
  assert.match(buildChartDataXml(CHARTS.find((c) => c.name === 'Average Score by Question')), /<condition attribute="qdb_answer_numeric" operator="not-null" \/>/);
});

test('buildChartPresentationXml_pie_hasALegend', () => {
  assert.match(buildChartPresentationXml(CHARTS.find((c) => c.type === 'Pie')), /<Legends>/);
});

test('buildFormXml_setup_listsTriggersThroughTheSetupRelationship', () => {
  const formXml = buildFormXml(FORMS.find((f) => f.table === 'qdb_survey_setup'), anyViewId);

  assert.match(formXml, /<RelationshipName>qdb_survey_setup_qdb_survey_trigger_qdb_survey_setup_id<\/RelationshipName>/);
  assert.match(formXml, /<control id="qdb_delivery_digital" classid="\{3EF39988-22BB-4f0b-BBBE-64B5A3748AEE\}" datafieldname="qdb_delivery_digital" \/>/);
});

test('buildFormXml_source_makesActivationReadOnly', () => {
  assert.match(buildFormXml(FORMS.find((f) => f.table === 'qdb_survey_source'), anyViewId), /datafieldname="qdb_is_active" disabled="true"/);
});

test('buildFormXml_sameForm_isIdenticalOnEveryRun', () => {
  const form = FORMS.find((f) => f.table === 'qdb_survey_trigger');

  assert.equal(buildFormXml(form, anyViewId), buildFormXml(form, anyViewId));
});

test('stableGuid_seed_isAVersion4ShapedGuid', () => {
  assert.match(stableGuid('x'), /^\{[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}\}$/);
});

test('ICONS_everySurveyTable_hasAWellFormedIconInTheFormEngineStyle', () => {
  const surveyTables = TABLES.map((t) => t.name).sort();

  assert.deepEqual(Object.keys(ICONS).sort(), surveyTables);
  for (const { svg } of Object.values(ICONS)) {
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 20 20" fill="none">.*<\/svg>$/);
    assert.match(svg, /stroke="#0078d4"/);
  }
});

test('iconResourceName_table_followsTheFormEngineConvention', () => {
  assert.equal(iconResourceName('qdb_survey_setup'), 'qdb_icon_survey_setup');
});

test('buildSiteMapXml_app_hasConfigurationAndResultsGroups', () => {
  const sitemap = buildSiteMapXml(APP);

  assert.match(sitemap, /<Group Id="qdb_survey_config" IsProfile="false">/);
  assert.match(sitemap, /<SubArea Id="sub_qdb_survey_response" Entity="qdb_survey_response" \/>/);
});
