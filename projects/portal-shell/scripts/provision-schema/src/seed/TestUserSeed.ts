import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import { env } from '../config/env.js';
import type { ODataCollectionResponse } from '../types/DataverseMetadata.js';
import type { StepResult } from '../types/ProvisioningResult.js';

// SD-003: Staging smoke test user from BRD Section 10 SD-003.
// Email is BRD-authoritative: smoketest@portalshell.internal
// (not portal-test@qdb.qa which was the architect's deviation from the BRD)
// CHALLENGE 5: SEED_TEST_USER_PASSWORD is optional when DRY_RUN=true.

// BRD field names: qdb_email, qdb_password_hash, qdb_first_name, qdb_last_name,
// qdb_display_name, qdb_roles, qdb_linked_entity_ids, qdb_preferred_language
const TEST_USER_EMAIL = 'smoketest@portalshell.internal';
const BCRYPT_COST_FACTOR = 12;

export async function seedTestUser(
  http: DataverseHttpClient,
): Promise<StepResult> {
  console.log('[PHASE-8] [SD-003] Checking test user seed record...');

  // CHALLENGE 5: Skip entirely if DRY_RUN or password absent
  if (env.DRY_RUN || env.SEED_TEST_USER_PASSWORD === undefined) {
    console.log('[PHASE-8] [DRY-RUN SKIP] [SD-003] Would seed test user. Skipping (DRY_RUN or no password).');
    return { name: 'SD-003 test user', status: 'dry-run' };
  }

  const existing = await http.get<ODataCollectionResponse<{ qdb_portal_usersid: string }>>(
    'qdb_portal_userses',
    {
      filter: `qdb_email eq '${TEST_USER_EMAIL}'`,
      select: ['qdb_portal_usersid'],
      top: 1,
    },
  );

  const existingRecords = existing?.value ?? [];

  if (existingRecords.length > 0) {
    console.log(`[PHASE-8] [SKIP] [SD-003] Test user '${TEST_USER_EMAIL}' already exists.`);
    return { name: 'SD-003 test user', status: 'skipped' };
  }

  const passwordHash = await hashPassword(env.SEED_TEST_USER_PASSWORD);

  await http.post('qdb_portal_userses', {
    qdb_email: TEST_USER_EMAIL,
    qdb_password_hash: passwordHash,
    qdb_first_name: 'Smoke',
    qdb_last_name: 'Tester',
    qdb_display_name: 'Smoke Tester',
    qdb_roles: '["portal_user"]',
    qdb_linked_entity_ids: '[]',
    qdb_preferred_language: 100000001,  // en
  });

  console.log(`[PHASE-8] [PASS] [SD-003] Test user '${TEST_USER_EMAIL}' seeded.`);
  return { name: 'SD-003 test user', status: 'created' };
}

async function hashPassword(plainPassword: string): Promise<string> {
  // Dynamic import to avoid loading bcrypt in dry-run paths
  const { default: bcrypt } = await import('bcrypt');
  console.log(`[PHASE-8] [SD-003] Generating bcrypt hash (cost ${BCRYPT_COST_FACTOR})...`);
  return bcrypt.hash(plainPassword, BCRYPT_COST_FACTOR);
}
