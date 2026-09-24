import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DISPUTE_LOGGING_NOTICE } from '@dcp/domain';
import { ActivityDialog } from '../views/ActivityDialog.js';
import { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { CrmSessionProvider, OrgProvider, RoleProvider } from '../shell/context.js';
import type { XrmLike } from '../platform/crmContext.js';
import type { WriteTransport } from '../platform/writeTransport.js';

/**
 * WP5 — what logging the "Complaint / Dispute" type actually does, said before it is done.
 *
 * The configured label names both concepts (KI-118), but an activity logged here with no Complaint
 * link is a **Collection Dispute**: it raises no formal Complaint (KI-120 — officers cannot) and
 * changes nothing about collection (KI-119). An officer who picks that label must not be left to
 * believe otherwise.
 */

const CASE_ID = '11111111-1111-1111-1111-111111111111';
const DISPUTE_TYPE_ID = 'type-dispute';
const CALL_TYPE_ID = 'type-call';

const TYPES = [
  { qdb_collectionactivitytypeid: CALL_TYPE_ID, qdb_name: 'Outbound call', qdb_code: 'P6-CALL', qdb_isactive: true, qdb_sequence: 1 },
  { qdb_collectionactivitytypeid: DISPUTE_TYPE_ID, qdb_name: 'Complaint / Dispute', qdb_code: 'P6-DISPUTE', qdb_isactive: true, qdb_sequence: 2 },
];

function fakeXrm(): XrmLike {
  return {
    Utility: {
      getGlobalContext: () => ({
        getClientUrl: () => 'https://org5869857f.crm4.dynamics.com/',
        getVersion: () => '9.2.24091.00203',
        userSettings: { userId: '{1}', userName: 'Tester', languageId: 1033, securityRoles: [] },
        organizationSettings: { uniqueName: 'org5869857f' },
      }),
    },
    WebApi: {
      async retrieveRecord() { throw { status: 404 }; },
      async retrieveMultipleRecords(logicalName: string) {
        return { entities: logicalName === 'qdb_collectionactivitytype' ? TYPES : [] };
      },
    },
  } as unknown as XrmLike;
}

const IDLE_TRANSPORT: WriteTransport = {
  patch: async () => ({ status: 200 }),
  createOnly: async () => ({ status: 201 }),
  post: async () => ({ status: 200 }),
  get: async () => ({ status: 404 }),
} as never;

async function openLogAction(): Promise<HTMLElement> {
  const adapter = new XrmCrmAdapter(fakeXrm(), undefined, IDLE_TRANSPORT);
  render(
    <CrmSessionProvider value={{ context: { userId: '1', userName: 'Tester' } as never, adapter }}>
      <RoleProvider><OrgProvider>
        <ActivityDialog mode="create" caseId={CASE_ID} onClose={() => {}} onSaved={() => {}} />
      </OrgProvider></RoleProvider>
    </CrmSessionProvider>,
  );
  const select = await screen.findByTestId('activity-type');
  await screen.findByRole('option', { name: 'Complaint / Dispute' });
  return select;
}

afterEach(cleanup);

describe('logging the Complaint / Dispute type', () => {
  it('says it records a Collection Dispute, before anything is saved', async () => {
    const select = await openLogAction();

    await userEvent.selectOptions(select, DISPUTE_TYPE_ID);

    expect(screen.getByTestId('activity-dispute-notice').textContent).toContain(DISPUTE_LOGGING_NOTICE);
  });

  it('says it raises no formal Complaint and changes nothing about collection', () => {
    expect(DISPUTE_LOGGING_NOTICE).toMatch(/does not raise a formal Complaint/);
    expect(DISPUTE_LOGGING_NOTICE).toMatch(/changes nothing about collection/);
  });

  /** Selected and then left: the absence follows a real presence, so it cannot be an early look. */
  it('goes away when another type is chosen', async () => {
    const select = await openLogAction();
    await userEvent.selectOptions(select, DISPUTE_TYPE_ID);
    screen.getByTestId('activity-dispute-notice');

    await userEvent.selectOptions(select, CALL_TYPE_ID);

    expect(screen.queryByTestId('activity-dispute-notice')).toBeNull();
  });
});
