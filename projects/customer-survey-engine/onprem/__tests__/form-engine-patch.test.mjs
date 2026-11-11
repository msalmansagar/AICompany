import { test } from 'node:test';
import assert from 'node:assert/strict';
import { columnsIn, isFormEnginePrerequisite, transformPatchManifest } from '../lib/form-engine-patch.mjs';

const dependency = (required) => `<MissingDependency><Required ${required} /><Dependent type="1" schemaName="qdb_form_field" /></MissingDependency>`;
const manifest = (...dependencies) => `<ImportExportXml version="9.2.26102.136" SolutionPackageVersion="9.2" OrganizationVersion="9.2.26102.136">
  <MissingDependencies>${dependencies.join('')}</MissingDependencies>
</ImportExportXml>`;

test('isFormEnginePrerequisite_formEngineTable_isTrue', () => {
  assert.equal(isFormEnginePrerequisite('<Required type="1" schemaName="qdb_form_field" solution="Active" />'), true);
});

test('isFormEnginePrerequisite_formEngineTableIcon_isTrue', () => {
  assert.equal(isFormEnginePrerequisite('<Required type="61" schemaName="qdb_icon_form_option_value" solution="Active" />'), true);
});

test('isFormEnginePrerequisite_otherTable_isFalse', () => {
  assert.equal(isFormEnginePrerequisite('<Required type="1" schemaName="qdb_form_render_cache" solution="Active" />'), false);
});

test('transformPatchManifest_onlyPrerequisites_keepsThemAndStamps9', () => {
  const result = transformPatchManifest(manifest(dependency('type="1" schemaName="qdb_form_field"'), dependency('type="61" schemaName="qdb_icon_form_field"')));

  assert.equal(result.keptPrerequisites, 2);
  assert.match(result.rootAfter, /SolutionPackageVersion="9.0"/);
});

test('transformPatchManifest_foreignDependency_stopsTheBuild', () => {
  assert.throws(() => transformPatchManifest(manifest(dependency('type="1" schemaName="account"'))), /outside the Form Engine/);
});

test('columnsIn_customizations_listsTableDotColumn', () => {
  const customizations = `<Entity><Name LocalizedName="Form Field" OriginalName="Form Field">qdb_form_field</Name>
    <attribute PhysicalName="qdb_score_max"></attribute><attribute PhysicalName="qdb_score_min"></attribute></Entity>`;

  assert.deepEqual(columnsIn(customizations), ['qdb_form_field.qdb_score_max', 'qdb_form_field.qdb_score_min']);
});
