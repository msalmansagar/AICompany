import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CUSTOMIZATION_TRANSFORMS, PLATFORM_APP_ICON_ID, UnsafeTransformError, assertOnlySurveyAndOutOfBoxRelationships,
  assertSurveyViewTableShells, removeCloudTriggerSteps, removeOutOfBoxTableShells, transformSurveySolutionManifest, useOwnAppIcon,
} from '../lib/survey-onprem-transforms.mjs';

const TYPE_NAME = (plugin) => `Qdb.SurveyEngine.Plugins.${plugin}, Qdb.SurveyEngine, Version=1.0.0.0, Culture=neutral, PublicKeyToken=cf86d1ff95e88037`;

const step = ({ id, plugin, table, imageId }) => `
    <SdkMessageProcessingStep Name="${plugin} on ${table}" SdkMessageProcessingStepId="{${id}}">
      <PluginTypeName>${TYPE_NAME(plugin)}</PluginTypeName>
      <PrimaryEntity>${table}</PrimaryEntity>
      <SdkMessageProcessingStepImages>${imageId ? `
        <SdkMessageProcessingStepImage Name="PreImage">
          <SdkMessageProcessingStepImageId>{${imageId}}</SdkMessageProcessingStepImageId>
        </SdkMessageProcessingStepImage>` : ''}
      </SdkMessageProcessingStepImages>
    </SdkMessageProcessingStep>`;

const steps = (...items) => `<SdkMessageProcessingSteps>${items.map(step).join('')}\n  </SdkMessageProcessingSteps>`;
const DISPATCH = { id: 'bf13cfaa-0000-0000-0000-000000000001', plugin: 'InvitationDispatchPlugin', table: 'qdb_survey_invitation' };
const TRIGGER = { id: '027674a2-0000-0000-0000-000000000002', plugin: 'SurveyTriggerPlugin', table: 'qdb_loan_application', imageId: 'c3a469a2-0000-0000-0000-000000000003' };

test('removeCloudTriggerSteps_triggerStep_isRemovedWithItsImage', () => {
  const result = removeCloudTriggerSteps(steps(DISPATCH, TRIGGER));

  assert.deepEqual(result.removedIds, [TRIGGER.id, TRIGGER.imageId]);
  assert.ok(!result.text.includes('qdb_loan_application'));
});

test('removeCloudTriggerSteps_dispatchStep_isKept', () => {
  assert.ok(removeCloudTriggerSteps(steps(DISPATCH, TRIGGER)).text.includes(DISPATCH.id));
});

test('removeCloudTriggerSteps_otherStepOnAForeignTable_stopsTheBuild', () => {
  const foreign = { id: '11111111-0000-0000-0000-000000000004', plugin: 'InvitationDispatchPlugin', table: 'qdb_loan_application' };

  assert.throws(() => removeCloudTriggerSteps(steps(foreign)), UnsafeTransformError);
});

const ICON_ID = 'a16d17f7-39dd-f111-84ea-000d3abd8313';
const withApp = (appIconId) => `
    <WebResource>
      <WebResourceId>{${ICON_ID}}</WebResourceId>
      <Name>qdb_icon_survey_setup</Name>
    </WebResource>
    <AppModule>
      <UniqueName>qdb_SurveyEngine</UniqueName>
      <WebResourceId>${appIconId}</WebResourceId>
    </AppModule>`;

test('useOwnAppIcon_platformIcon_isReplacedByTheSetupIcon', () => {
  const result = useOwnAppIcon(withApp(PLATFORM_APP_ICON_ID));

  assert.equal(result.removed, 1);
  assert.match(result.text, new RegExp(`<AppModule>[\\s\\S]*<WebResourceId>${ICON_ID}</WebResourceId>`));
});

test('useOwnAppIcon_alreadyOwnIcon_changesNothing', () => {
  assert.equal(useOwnAppIcon(withApp(ICON_ID)).removed, 0);
});

test('useOwnAppIcon_unknownIcon_stopsTheBuild', () => {
  assert.throws(() => useOwnAppIcon(withApp('99999999-9999-9999-9999-999999999999')), UnsafeTransformError);
});

const relationship = (referencing, referenced) => `<EntityRelationship Name="r"><ReferencingEntityName>${referencing}</ReferencingEntityName><ReferencedEntityName>${referenced}</ReferencedEntityName></EntityRelationship>`;

test('assertOnlySurveyAndOutOfBoxRelationships_surveyAndOutOfBox_passes', () => {
  assert.doesNotThrow(() => assertOnlySurveyAndOutOfBoxRelationships(relationship('qdb_survey_invitation', 'Contact') + relationship('qdb_survey_answer', 'qdb_survey_response')));
});

test('assertOnlySurveyAndOutOfBoxRelationships_otherProductTable_stopsTheBuild', () => {
  assert.throws(() => assertOnlySurveyAndOutOfBoxRelationships(relationship('qdb_collectionactivity', 'qdb_survey_invitation')), UnsafeTransformError);
});

test('CUSTOMIZATION_TRANSFORMS_debtCollectionRegardingTransform_isLeftOut', () => {
  const names = CUSTOMIZATION_TRANSFORMS.map(([name]) => name);

  assert.ok(!names.includes('foreign-regarding-relationships'));
  assert.ok(names.includes('cloud-trigger-steps') && names.includes('site-map-name'));
});

const manifest = (dependencies) => `<ImportExportXml version="9.2.26102.136" SolutionPackageVersion="9.2" OrganizationVersion="9.2.26102.136">
  <RootComponents>
    <RootComponent type="92" id="{${DISPATCH.id}}" behavior="0" />
    <RootComponent type="92" id="{${TRIGGER.id}}" behavior="0" />
  </RootComponents>
  <MissingDependencies>${dependencies}
  </MissingDependencies>
</ImportExportXml>`;
const dependency = (required, dependent) => `
    <MissingDependency>
      <Required ${required} />
      <Dependent ${dependent} />
    </MissingDependency>`;

test('transformSurveySolutionManifest_knownDependencies_areAllRemoved', () => {
  const text = manifest([
    dependency('type="1" schemaName="qdb_loan_application"', `type="92" id="{${TRIGGER.id}}"`),
    dependency('type="1" schemaName="qdb_loan_application"', `type="93" id="{${TRIGGER.imageId}}"`),
    dependency('type="61" schemaName="msdyn_/Images/AppModule_Default_Icon.png"', 'type="80" schemaName="qdb_SurveyEngine"'),
    dependency('type="1" schemaName="contact" solution="OmnichannelTelephony (1.10.0.316)"', 'type="1" schemaName="contact"'),
  ].join(''));

  const result = transformSurveySolutionManifest(text, { removedStepIds: [TRIGGER.id, TRIGGER.imageId] });

  assert.equal(result.remainingDependencies, 0);
  assert.equal(result.removedRootComponents, 1);
  assert.ok(result.text.includes(DISPATCH.id) && !result.text.includes(`{${TRIGGER.id}}`));
});

test('transformSurveySolutionManifest_unknownDependency_isKeptAndCounted', () => {
  const text = manifest(dependency('type="1" schemaName="qdb_form_definition"', 'type="2" schemaName="qdb_x"'));

  assert.equal(transformSurveySolutionManifest(text, { removedStepIds: [] }).remainingDependencies, 1);
});

const shell = (name, info, ribbon = '') => `
    <Entity>
      <Name LocalizedName="${name}" OriginalName="">${name}</Name>
      <EntityInfo>
        <entity Name="${name}" unmodified="1">${info}</entity>
      </EntityInfo>
      <RibbonDiffXml><CustomActions>${ribbon}</CustomActions></RibbonDiffXml>
    </Entity>`;
const surveyTable = `
    <Entity>
      <Name LocalizedName="Survey Setup" OriginalName="Survey Setup">qdb_survey_setup</Name>
    </Entity>`;

test('removeOutOfBoxTableShells_accountShellWithForeignRibbon_isRemovedAndReported', () => {
  const result = removeOutOfBoxTableShells(shell('Account', '<attributes />', '<CustomAction Id="qdb.account.Form.ReportsFlyout.CustomAction" />') + surveyTable);

  assert.deepEqual(result.dropped, [{ table: 'account', ribbonCustomActions: ['qdb.account.Form.ReportsFlyout.CustomAction'] }]);
  assert.ok(!result.text.includes('Account') && result.text.includes('qdb_survey_setup'));
});

test('removeOutOfBoxTableShells_shellWithColumns_stopsTheBuild', () => {
  assert.throws(() => removeOutOfBoxTableShells(shell('Contact', '<attributes><attribute PhysicalName="qdb_x" /></attributes>')), UnsafeTransformError);
});

test('transformSurveySolutionManifest_outOfBoxShellRootComponents_areRemoved', () => {
  const text = manifest('').replace('<RootComponents>', '<RootComponents>\n    <RootComponent type="1" schemaName="account" behavior="1" />\n    <RootComponent type="1" schemaName="qdb_survey_setup" behavior="0" />');

  const result = transformSurveySolutionManifest(text, { removedStepIds: [] });

  assert.ok(!result.text.includes('schemaName="account"') && result.text.includes('schemaName="qdb_survey_setup"'));
});

const savedQuery = (name) => `<savedquery><LocalizedNames><LocalizedName description="${name}" languagecode="1033" /></LocalizedNames></savedquery>`;
const systemJobShell = ({ views, ribbon = '', info = '<attributes />' }) => shell('AsyncOperation', info, ribbon)
  .replace('</EntityInfo>', `</EntityInfo>\n      <SavedQueries><savedqueries>${views.map(savedQuery).join('')}</savedqueries></SavedQueries>`);
const HEALTH_VIEW = 'Survey Jobs - Failed or Suspended';

test('assertSurveyViewTableShells_systemJobShellWithOnlyTheSurveyView_isKeptUnchanged', () => {
  const text = systemJobShell({ views: [HEALTH_VIEW] }) + surveyTable;

  assert.equal(assertSurveyViewTableShells(text).text, text);
});

test('assertSurveyViewTableShells_systemJobShellWithAForeignView_stopsTheBuild', () => {
  assert.throws(() => assertSurveyViewTableShells(systemJobShell({ views: [HEALTH_VIEW, 'Someone Else\'s Jobs'] })), UnsafeTransformError);
});

test('assertSurveyViewTableShells_systemJobShellWithARibbonButton_stopsTheBuild', () => {
  assert.throws(() => assertSurveyViewTableShells(systemJobShell({ views: [HEALTH_VIEW], ribbon: '<CustomAction Id="x.asyncoperation.button" />' })), UnsafeTransformError);
});

test('assertSurveyViewTableShells_systemJobShellWithColumns_stopsTheBuild', () => {
  assert.throws(() => assertSurveyViewTableShells(systemJobShell({ views: [HEALTH_VIEW], info: '<attributes><attribute PhysicalName="qdb_x" /></attributes>' })), UnsafeTransformError);
});

test('CUSTOMIZATION_TRANSFORMS_includeTheSurveyViewTableGuard', () => {
  assert.ok(CUSTOMIZATION_TRANSFORMS.some(([name]) => name === 'survey-view-table-shells'));
});

test('transformSurveySolutionManifest_systemJobSelfDependency_isRemovedAndItsRootComponentKept', () => {
  const text = manifest(dependency('type="1" schemaName="asyncoperation" displayName="AsyncOperation" parentSchemaName="" solution="DataEngineSPsAndIndexes (1.0.10.0)"', 'type="1" schemaName="asyncoperation" displayName="AsyncOperation"'))
    .replace('<RootComponents>', '<RootComponents>\n    <RootComponent type="1" schemaName="asyncoperation" behavior="1" />');

  const result = transformSurveySolutionManifest(text, { removedStepIds: [] });

  assert.equal(result.remainingDependencies, 0);
  assert.ok(result.text.includes('<RootComponent type="1" schemaName="asyncoperation" behavior="1" />'));
});

test('transformSurveySolutionManifest_root_isStampedForOnPrem', () => {
  assert.match(transformSurveySolutionManifest(manifest(''), { removedStepIds: [] }).rootAfter, /SolutionPackageVersion="9.0"/);
});
