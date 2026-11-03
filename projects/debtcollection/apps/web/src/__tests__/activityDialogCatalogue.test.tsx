import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { ActivityDialog } from '../views/ActivityDialog.js';
import { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { CrmSessionProvider, OrgProvider, RoleProvider } from '../shell/context.js';
import type { XrmLike } from '../platform/crmContext.js';
import type { WriteResponse, WriteTransport } from '../platform/writeTransport.js';

/**
 * "No outcomes are configured" is a claim about configuration, and only an answered catalogue can
 * make it (Phase 9 closure review).
 *
 * The dialog is ready once the **activity** is read, but its type's outcomes arrive afterwards. The
 * catalogue was held as an empty list until then — and after a failed read — so every activity,
 * including a Call with seven outcomes, briefly told the officer that none were configured and
 * disabled Complete. Not known is not none.
 */

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';
const CASE_ID = '11111111-1111-1111-1111-111111111111';
const ACTIVITY_ID = '33333333-3333-3333-3333-333333333333';
const CALL_TYPE_ID = 'type-call';

const ACTIVITY: WriteResponse = {
  status: 200,
  etag: 'W/"1"',
  body: {
    activityid: ACTIVITY_ID, subject: 'Called the customer', statuscode: 100000640,
    [`statuscode${FORMATTED}`]: 'Open', statecode: 0, qdb_activitydate: '2026-09-19T09:00:00Z',
    qdb_followupdate: '', description: '', '_qdb_activitytypeid_value': CALL_TYPE_ID,
    qdb_activitynumber: 'ACT-0001',
  },
};

const OUTCOME = {
  qdb_activityoutcomeid: 'o-1', qdb_name: 'Customer contacted', qdb_code: 'CONTACTED', qdb_isactive: true,
  qdb_sequence: 1, qdb_requiresnotes: false, qdb_requiresfollowup: false, qdb_followupdays: 0,
  qdb_escalationrequired: false, qdb_closeactivity: true, '_qdb_activitytypeid_value': CALL_TYPE_ID,
};

const TRANSPORT: WriteTransport = {
  get: async () => ACTIVITY,
  patch: async () => ({ status: 200 }),
  createOnly: async () => ({ status: 201 }),
  post: async () => ({ status: 200 }),
} as never;

/** The outcome read waits until the test answers it, so the gap can be observed deterministically. */
function platform(outcomes: Promise<Record<string, unknown>[]>): XrmLike {
  return {
    WebApi: {
      async retrieveRecord() { throw { status: 404 }; },
      async retrieveMultipleRecords(logicalName: string) {
        if (logicalName === 'qdb_collectionactivitytype') {
          return { entities: [{ qdb_collectionactivitytypeid: CALL_TYPE_ID, qdb_name: 'Call', qdb_code: 'P6-CALL', qdb_isactive: true }] };
        }
        if (logicalName === 'qdb_activityoutcome') return { entities: await outcomes };
        return { entities: [] };
      },
    },
  } as unknown as XrmLike;
}

function openDialog(outcomes: Promise<Record<string, unknown>[]>) {
  const adapter = new XrmCrmAdapter(platform(outcomes), undefined, TRANSPORT);
  render(
    <CrmSessionProvider value={{ context: { userId: '1', userName: 'Tester' } as never, adapter }}>
      <RoleProvider><OrgProvider>
        <ActivityDialog mode="edit" caseId={CASE_ID} activityId={ACTIVITY_ID} onClose={() => {}} onSaved={() => {}} />
      </OrgProvider></RoleProvider>
    </CrmSessionProvider>,
  );
}

afterEach(cleanup);

describe('while the outcome catalogue has not answered', () => {
  it('does not say that no outcomes are configured', async () => {
    openDialog(new Promise(() => {}));

    await screen.findByTestId('activity-subject');

    expect(screen.queryByTestId('conclude-unavailable')).toBeNull();
  });
});

/**
 * The opposite mistake matters more. An unknown count is not permission: the domain's zero-outcome
 * rule cannot apply to a count nobody has, so offering Complete now would let an activity close
 * with nothing recorded against it.
 */
describe('an unknown catalogue', () => {
  it('does not offer completion while it is loading', async () => {
    openDialog(new Promise(() => {}));

    await screen.findByTestId('activity-subject');

    expect(screen.getByTestId('activity-start-complete')).toBeDisabled();
  });

  it('says it could not be read, and does not offer completion', async () => {
    const failed = Promise.reject({ errorCode: 12345, message: 'nope' });
    failed.catch(() => {});
    openDialog(failed);

    await screen.findByTestId('outcomes-unreadable');

    expect(screen.getByTestId('activity-start-complete')).toBeDisabled();
  });
});

describe('when the outcome catalogue cannot be read', () => {
  it('does not say that no outcomes are configured', async () => {
    const failed = Promise.reject({ errorCode: 12345, message: 'nope' });
    failed.catch(() => {});
    openDialog(failed);
    await screen.findByTestId('activity-subject');

    // Settled: the rejected read has been handled before looking.
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(screen.queryByTestId('conclude-unavailable')).toBeNull();
  });
});

describe('when the catalogue answers', () => {
  it('says so for a type that genuinely has none', async () => {
    openDialog(Promise.resolve([]));

    expect(await screen.findByTestId('conclude-unavailable')).toBeTruthy();
  });

  it('offers completion for a type that has outcomes', async () => {
    openDialog(Promise.resolve([OUTCOME]));

    await waitFor(() => expect(screen.getByTestId('activity-start-complete')).not.toBeDisabled());
  });
});
