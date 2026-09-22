import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MyWorkView } from '../views/MyWorkView.js';
import { QueuesView } from '../views/index.js';
import { CrmSessionProvider, OrgProvider } from '../shell/context.js';
import { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import type { XrmLike } from '../platform/crmContext.js';

/**
 * Selecting a piece of work opens its case.
 *
 * This exists because the view documented that behaviour and did not have it. Every row rendered,
 * every count was right, every automated test passed — and clicking a row did nothing, which the
 * final browser regression found and no unit test could have, because none of them clicked.
 *
 * What is asserted is the **case** id, not the work item's own id. They are different records, and
 * navigating to the activity would take an officer to a technical row rather than to the case the
 * work belongs to.
 */

const CASE_ID = 'case-0001';
const ACTIVITY_ID = 'act-0001';
const USER_ID = 'user-me';

function platformReturningOneRow(): XrmLike {
  return {
    WebApi: {
      retrieveMultipleRecords: async (logicalName: string) => ({
        entities: logicalName === 'qdb_collectionactivitytype'
          ? []
          : [{
            activityid: ACTIVITY_ID,
            subject: 'Promise to pay',
            statecode: 0,
            createdon: '2026-09-20T08:46:00Z',
            '_qdb_collectioncaseid_value': CASE_ID,
            '_ownerid_value': USER_ID,
          }],
      }),
    },
  } as unknown as XrmLike;
}

function renderMyWork(onOpenCase?: (id: string) => void) {
  const adapter = new XrmCrmAdapter(platformReturningOneRow());
  const session = { adapter, context: { userId: USER_ID } };

  return render(
    <CrmSessionProvider value={session as never}>
      <MyWorkView {...(onOpenCase ? { onOpenCase } : {})} />
    </CrmSessionProvider>,
  );
}

afterEach(cleanup);

describe('selecting a piece of work', () => {
  it('opens the case the work belongs to, not the work record', async () => {
    const opened = vi.fn();
    renderMyWork(opened);

    const row = await screen.findByText('Promise to pay');
    await userEvent.click(row);

    await waitFor(() => expect(opened).toHaveBeenCalledWith(CASE_ID));
  });

  it('renders without a handler rather than failing, since the grid is also read alone', async () => {
    renderMyWork();

    expect(await screen.findByText('Promise to pay')).toBeTruthy();
  });
});

describe('a count that cannot be obtained', () => {
  /**
   * The adapter here has no write transport, so every count rejects — the exact shape that threw
   * two unhandled rejections before this was handled. A bucket must then read *unknown*, because
   * rendering nothing at all invites the reader to assume zero.
   */
  it('renders as unknown rather than rejecting or showing zero', async () => {
    renderMyWork();

    const bucket = await screen.findByTestId('bucket-Legal');

    await waitFor(() => expect(bucket.getAttribute('data-count')).toBe('Unknown'));
    expect(bucket.getAttribute('data-count')).not.toBe('0');
  });
});

describe('the handler survives the journey through Work Queues', () => {
  /**
   * My Work is hosted inside the Work Queues screen rather than given its own navigation entry, so
   * the handler is passed down one level. Rendering the view directly cannot prove that hop — and
   * the hop is precisely what was missing, so it gets its own test rather than being assumed.
   */
  it('opens the case from a row rendered by the Work Queues screen', async () => {
    const opened = vi.fn();
    const adapter = new XrmCrmAdapter(platformReturningOneRow());
    const session = { adapter, context: { userId: USER_ID } };

    render(
      <CrmSessionProvider value={session as never}>
        <OrgProvider><QueuesView onOpenCase={opened} /></OrgProvider>
      </CrmSessionProvider>,
    );

    const view = await screen.findByTestId('view-mywork');
    await userEvent.click(await within(view).findByText('Promise to pay'));

    await waitFor(() => expect(opened).toHaveBeenCalledWith(CASE_ID));
  });
});
