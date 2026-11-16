import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const audience = createRequire(import.meta.url)('../trigger-audience.js');
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

test('apiErrorText_webApiErrorBody_returnsItsMessageElseAGenericOne', () => {
  assert.deepEqual([audience.apiErrorText({ error: { message: 'Only a Survey Admin…' } }, 400), audience.apiErrorText({}, 500)],
    ['Only a Survey Admin…', 'The request failed (HTTP 500).']);
});
