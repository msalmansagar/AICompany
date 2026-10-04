/**
 * On-prem package transform tests.
 * Run: node --test "crm/scripts/lib/*.test.mjs"
 *
 * The transforms may only remove what 9.1 cannot read AND what carries no behaviour. Each test pins
 * one side of that line: a default value is removed, a meaningful value stops the build.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  CUSTOMIZATION_TRANSFORMS, UnsafeTransformError, removeForeignRegardingRelationships, transformSolutionManifest,
} from './onprem-transforms.mjs';

const transform = name => CUSTOMIZATION_TRANSFORMS.find(([key]) => key === name)[2];

const relationship = ({ name, referencing, referenced, attribute }) => `
    <EntityRelationship Name="${name}">
      <ReferencingEntityName>${referencing}</ReferencingEntityName>
      <ReferencedEntityName>${referenced}</ReferencedEntityName>
      <ReferencingAttributeName>${attribute}</ReferencingAttributeName>
    </EntityRelationship>`;

describe('value-guarded transforms', () => {
  test('emptyAutoNumberFormat_EmptyValue_IsRemoved', () => {
    const result = transform('empty-autonumber-format')('<attribute><AutoNumberFormat></AutoNumberFormat></attribute>');
    assert.deepEqual(result, { text: '<attribute></attribute>', removed: 1 });
  });

  test('emptyAutoNumberFormat_RealFormat_StopsTheBuild', () => {
    assert.throws(() => transform('empty-autonumber-format')('<AutoNumberFormat>CASE-{SEQNUM:6}</AutoNumberFormat>'), UnsafeTransformError);
  });

  test('roleAutoAssignedFlag_One_StopsTheBuild', () => {
    assert.throws(() => transform('role-auto-assigned-flag')('<IsAutoAssigned>1</IsAutoAssigned>'), UnsafeTransformError);
  });

  test('optionIsHidden_HiddenOption_StopsTheBuild', () => {
    assert.throws(() => transform('option-is-hidden')('<option value="1" IsHidden="1">'), UnsafeTransformError);
  });

  test('optionIsHidden_VisibleOption_KeepsTheOption', () => {
    assert.equal(transform('option-is-hidden')('<option value="1" IsHidden="0">').text, '<option value="1">');
  });
});

describe('removeForeignRegardingRelationships', () => {
  test('removeForeignRegardingRelationships_CloudOnlyRegardingTable_IsRemoved', () => {
    const xml = relationship({ name: 'msdyn_workorder_qdb_collectionactivities', referencing: 'qdb_collectionactivity', referenced: 'msdyn_workorder', attribute: 'RegardingObjectId' });
    assert.equal(removeForeignRegardingRelationships(xml).removed, 1);
  });

  test('removeForeignRegardingRelationships_OutOfBoxTable_IsKept', () => {
    const xml = relationship({ name: 'account_qdb_collectionactivities', referencing: 'qdb_collectionactivity', referenced: 'Account', attribute: 'RegardingObjectId' });
    assert.equal(removeForeignRegardingRelationships(xml).removed, 0);
  });

  test('removeForeignRegardingRelationships_DcpTable_IsKept', () => {
    const xml = relationship({ name: 'qdb_collectioncase_activities', referencing: 'qdb_collectionactivity', referenced: 'qdb_collectioncase', attribute: 'RegardingObjectId' });
    assert.equal(removeForeignRegardingRelationships(xml).removed, 0);
  });

  test('removeForeignRegardingRelationships_RealLookupToForeignTable_StopsTheBuild', () => {
    const xml = relationship({ name: 'qdb_qdblegal_qdb_collectionactivity', referencing: 'qdb_collectionactivity', referenced: 'qdb_qdblegal', attribute: 'qdb_legalrequestid' });
    assert.throws(() => removeForeignRegardingRelationships(xml), UnsafeTransformError);
  });
});

describe('transformSolutionManifest', () => {
  const manifest = `<ImportExportXml version="9.2.26091.158" SolutionPackageVersion="9.2" languagecode="1033" OrganizationVersion="9.2.26091.158" OrganizationSchemaType="Full" CRMServerServiceabilityVersion="9.2.26091.00158">
  <MissingDependencies>
    <MissingDependency><Required type="SettingDefinition" /><Dependent type="AppSetting" /></MissingDependency>
  </MissingDependencies></ImportExportXml>`;

  test('transformSolutionManifest_CloudStamp_IsStampedForOnPrem', () => {
    const { rootAfter } = transformSolutionManifest(manifest);
    assert.equal(rootAfter, '<ImportExportXml version="9.0.0.0" SolutionPackageVersion="9.0" languagecode="1033">');
  });

  test('transformSolutionManifest_AppSettingDependency_IsRemovedAndNoneRemain', () => {
    const result = transformSolutionManifest(manifest);
    assert.deepEqual([result.removedDependencies, result.remainingDependencies], [1, 0]);
  });

  test('transformSolutionManifest_OtherMissingDependency_IsKeptAndCounted', () => {
    const other = manifest.replace('type="AppSetting"', 'type="Attribute"');
    assert.equal(transformSolutionManifest(other).remainingDependencies, 1);
  });
});
