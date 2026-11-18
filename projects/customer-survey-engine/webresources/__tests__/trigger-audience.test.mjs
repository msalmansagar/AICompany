import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const audience = createRequire(import.meta.url)('../trigger-audience-core.js');
const panel = createRequire(import.meta.url)('../trigger-audience.js');

const viewsModule = createRequire(import.meta.url)('../trigger-audience-views.js');

test('findView_pickerValue_matchesTypeAndId', () => {
  const list = [{ type: 'savedquery', id: 'a', name: 'A' }, { type: 'userquery', id: 'a', name: 'Mine' }];

  assert.deepEqual([viewsModule.findView(list, 'userquery:a').name, viewsModule.findView(list, 'savedquery:b'), viewsModule.findView(list, '')], ['Mine', undefined, undefined]);
});

test('panel_loadsWithTheCoreModule_andExposesInit', () => {
  assert.equal(typeof panel.init, 'function');
});
const { RUN_STATUS } = audience;
const ready = { recordId: 'id', isDirty: false, isActive: true, runStatus: RUN_STATUS.notSent, reachedCount: 0 };

test('builderUrl_objectTypeCode_pointsAtTheCrmConditionPage', () => {
  assert.equal(audience.builderUrl('https://crm.example/org/', 1), 'https://crm.example/org/SFA/goal/ParticipatingQueryCondition.aspx?entitytypecode=1&readonlymode=false');
});

test('builderUrl_nonNumericCode_isRefused', () => {
  assert.throws(() => audience.builderUrl('https://crm.example', '1&x=y'));
});

test('customerTableFor_contactCode_isContactOtherwiseAccount', () => {
  assert.deepEqual([audience.customerTableFor(100000001), audience.customerTableFor(100000000), audience.customerTableFor(null)], ['contact', 'account', 'account']);
});

test('sendAvailability_savedActiveNotSent_canSend', () => {
  assert.deepEqual(audience.sendAvailability(ready), { canSend: true, reason: '' });
});

test('sendAvailability_unsavedDirtyInactiveOrSent_explainsWhy', () => {
  const reasons = [{ recordId: '' }, { isDirty: true }, { isActive: false }, { runStatus: RUN_STATUS.sent }]
    .map((change) => audience.sendAvailability({ ...ready, ...change }));

  assert.ok(reasons.every((answer) => !answer.canSend && answer.reason.length > 0));
});

test('sendAvailability_failedBeforeReachingAnyone_canRetry', () => {
  assert.equal(audience.sendAvailability({ ...ready, runStatus: RUN_STATUS.failed }).canSend, true);
});

test('sendAvailability_failedAfterReachingSome_cannotRetry', () => {
  assert.equal(audience.sendAvailability({ ...ready, runStatus: RUN_STATUS.failed, reachedCount: 3 }).canSend, false);
});

test('describeProgress_incompleteCompleteAndFailed_readAsTheyShould', () => {
  const counts = { Invited: 2, Postponed: 1, Suppressed: 0 };

  assert.deepEqual([
    audience.describeProgress({ ...counts, Status: 'Sending', IsComplete: false }),
    audience.describeProgress({ ...counts, Status: 'Sent', IsComplete: true }),
    audience.describeProgress({ ...counts, Status: 'Failed', IsComplete: true, Message: 'bad filter' }),
  ], ['Sending… 2 invited, 1 postponed, 0 suppressed', 'Sent: 2 invited, 1 postponed, 0 suppressed', 'Failed: bad filter']);
});

test('isBuilderChanged_builderUntouched_isFalseSoTheStoredFilterIsKept', () => {
  // The builder returns a stored "like '%x'" as "eq": writing it back unchanged would alter the audience.
  assert.equal(audience.isBuilderChanged('<fetch>eq</fetch>', '<fetch>eq</fetch>'), false);
});

test('isBuilderChanged_builderEdited_isTrue', () => {
  assert.equal(audience.isBuilderChanged('<a/>', '<b/>'), true);
});

const VIEW_WITH_RELATED = '<fetch version="1.0" output-format="xml-platform" mapping="logical"><entity name="account"><attribute name="name" /><order attribute="name" descending="false" />'
  + '<filter type="and"><condition attribute="address1_city" operator="eq" value="Doha" /></filter>'
  + '<link-entity name="contact" from="parentcustomerid" to="accountid" link-type="inner" alias="ab"><filter type="and"><condition attribute="lastname" operator="not-null" /></filter></link-entity></entity></fetch>';

test('isFaithful_sameConditionsDifferentFormattingAndColumns_isTrue', () => {
  const reformatted = "<fetch distinct='false' mapping='logical'><entity name='account'><attribute name='accountid' /><filter type='and'><condition value='Doha' operator='eq' attribute='address1_city' /></filter>"
    + "<link-entity alias='x' to='accountid' from='parentcustomerid' name='contact'><filter><condition attribute='lastname' operator='not-null' /></filter></link-entity></entity></fetch>";

  assert.equal(audience.isFaithful(VIEW_WITH_RELATED, reformatted), true);
});

test('isFaithful_editorDroppedTheRelatedEntity_isFalse', () => {
  const dropped = '<fetch><entity name="account"><filter type="and"><condition attribute="address1_city" operator="eq" value="Doha" /></filter></entity></fetch>';

  assert.equal(audience.isFaithful(VIEW_WITH_RELATED, dropped), false);
});

test('isFaithful_editorRewroteLikeAsEq_isFalse', () => {
  const stored = '<fetch><entity name="account"><filter><condition attribute="name" operator="like" value="Survey E2E OT %1" /></filter></entity></fetch>';

  assert.equal(audience.isFaithful(stored, stored.replace('like', 'eq')), false);
});

test('conditionSignature_multiValueCondition_includesItsValues', () => {
  const inThree = '<condition attribute="statuscode" operator="in"><value>1</value><value>2</value></condition>';

  assert.notEqual(audience.conditionSignature(inThree), audience.conditionSignature(inThree.replace('<value>2</value>', '')));
});

test('isViewNewer_viewEditedAfterTheCopy_isTrue', () => {
  assert.deepEqual([
    audience.isViewNewer('2026-12-10T08:00:00Z', '2026-12-01T09:00:00Z'),
    audience.isViewNewer('2026-11-20T08:00:00Z', '2026-12-01T09:00:00Z'),
    audience.isViewNewer(null, '2026-12-01T09:00:00Z'),
  ], [true, false, false]);
});

const MY_ACTIVE = '<fetch><entity name="account"><filter type="and"><condition attribute="ownerid" operator="eq-userid" /><condition attribute="statecode" operator="eq" value="0" /></filter></entity></fetch>';
const ADMIN = '{AB12CD34-0000-1111-2222-333344445555}';

test('resolveCurrentUser_myView_pinsTheConditionToTheAdmin', () => {
  const resolved = audience.resolveCurrentUser(MY_ACTIVE, ADMIN);

  assert.match(resolved, /<condition attribute="ownerid" operator="eq" value="ab12cd34-0000-1111-2222-333344445555" \/>/);
  assert.doesNotMatch(resolved, /userid/);
});

test('resolveCurrentUser_notEqualCurrentUser_becomesNotEqualTheAdmin', () => {
  assert.match(audience.resolveCurrentUser("<condition attribute='ownerid' operator='ne-userid'/>", ADMIN), /operator='ne' value='ab12cd34-0000-1111-2222-333344445555'\/>/);
});

test('resolveCurrentUser_teamOperators_areLeftForTheServerToRefuse', () => {
  const teams = '<condition attribute="ownerid" operator="eq-useroruserteams" />';

  assert.equal(audience.resolveCurrentUser(teams, ADMIN), teams);
});

test('isFaithful_guidInBracesAndCapitals_matchesTheSameGuidBare', () => {
  const resolved = audience.resolveCurrentUser(MY_ACTIVE, ADMIN);
  const fromEditor = resolved.replace('ab12cd34-0000-1111-2222-333344445555', '{AB12CD34-0000-1111-2222-333344445555}').replace(' />', ' uiname="Salman" uitype="systemuser" />');

  assert.equal(audience.isFaithful(resolved, fromEditor), true);
});

test('apiErrorText_webApiErrorBody_returnsItsMessageElseAGenericOne', () => {
  assert.deepEqual([audience.apiErrorText({ error: { message: 'Only a Survey Admin…' } }, 400), audience.apiErrorText({}, 500)],
    ['Only a Survey Admin…', 'The request failed (HTTP 500).']);
});
