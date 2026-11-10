/**
 * createUntilPresent: retrying metadata creates through Dataverse timeouts without duplicates.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUntilPresent } from '../lib/create-until-present.mjs';
import { DataverseRequestError } from '../lib/dataverse-client.mjs';

const NO_WAIT = { waitMs: 0 };
const sqlTimeout = () => new DataverseRequestError('POST', 'RelationshipDefinitions', 503, 'SQL timeout expired');

test('createUntilPresent_firstAttemptSucceeds_createsOnce', async () => {
  let creates = 0;

  const outcome = await createUntilPresent({ create: async () => { creates += 1; }, isPresent: async () => false }, NO_WAIT);

  assert.equal(outcome, 'created');
  assert.equal(creates, 1);
});

test('createUntilPresent_timeoutButCommitted_doesNotCreateAgain', async () => {
  let creates = 0;

  const outcome = await createUntilPresent({
    create: async () => { creates += 1; throw sqlTimeout(); },
    isPresent: async () => creates > 0,
  }, NO_WAIT);

  assert.equal(outcome, 'present after timeout');
  assert.equal(creates, 1);
});

test('createUntilPresent_timeoutNotCommitted_retriesUntilCreated', async () => {
  let creates = 0;

  const outcome = await createUntilPresent({
    create: async () => { creates += 1; if (creates < 3) throw sqlTimeout(); },
    isPresent: async () => false,
  }, NO_WAIT);

  assert.equal(outcome, 'created');
  assert.equal(creates, 3);
});

test('createUntilPresent_nonTransientError_isRethrownWithoutRetry', async () => {
  let creates = 0;
  const badRequest = new DataverseRequestError('POST', 'RelationshipDefinitions', 400, 'bad payload');

  await assert.rejects(
    createUntilPresent({ create: async () => { creates += 1; throw badRequest; }, isPresent: async () => false }, NO_WAIT),
    badRequest,
  );
  assert.equal(creates, 1);
});

test('createUntilPresent_alwaysTimingOut_throwsTheLastErrorAfterAllAttempts', async () => {
  let creates = 0;

  await assert.rejects(
    createUntilPresent({ create: async () => { creates += 1; throw sqlTimeout(); }, isPresent: async () => false }, { attempts: 3, waitMs: 0 }),
    /SQL timeout expired/,
  );
  assert.equal(creates, 3);
});
