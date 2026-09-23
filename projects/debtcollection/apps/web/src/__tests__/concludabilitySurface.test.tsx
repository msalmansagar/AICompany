import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { NO_OUTCOMES_CONFIGURED } from '@dcp/domain';
import { CaseDeceasedReview } from '../views/strategyViews.js';
import { CrmSessionProvider } from '../shell/context.js';
import { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import type { XrmLike } from '../platform/crmContext.js';

/**
 * Why an advanced-process review stays open, said on the card.
 *
 * An officer who records a deceased review and comes back to find it still *Under review* has no
 * way, from the card alone, to tell whether they forgot something, whether the screen is broken, or
 * whether QDB has not configured what concluding one means. It is the third (KI-131), and the card
 * now says so.
 *
 * These tests assert the **generic** behaviour reaching a second surface: the same domain rule and
 * the same sentence the dialog uses, driven only by the type's catalogue.
 */

const WAIT = 5000;
const CASE_ID = 'case-1';
const DECEASED_TYPE = 'type-deceased';
const FORMATTED = '@OData.Community.Display.V1.FormattedValue';

/** Set by the fake the moment the outcome catalogue is asked for. */
let catalogueAnswered = false;

interface Options { outcomes: Record<string, unknown>[] | 'unreadable'; }

/**
 * A platform holding one case with a current QCB indication and an open review.
 *
 * The review exists and carries no outcome, which is the state the card must explain.
 */
function platform(options: Options): XrmLike {
  return {
    WebApi: {
      retrieveRecord: async () => ({
        activityid: 'review-1',
        subject: 'QCB deceased indication — verification required',
        statecode: 0,
        [`statuscode${FORMATTED}`]: 'Open',
      }),
      retrieveMultipleRecords: async (logicalName: string) => {
        if (logicalName === 'qdb_delinquencysnapshot') {
          return {
            entities: [{
              qdb_isdeceasedperqcb: true,
              qdb_snapshotdate: '2026-09-22T00:00:00Z',
              qdb_facilitynumber: 'DEMO-HL-4402',
            }],
          };
        }
        if (logicalName === 'qdb_collectionactivitytype') {
          return {
            entities: [{
              qdb_collectionactivitytypeid: DECEASED_TYPE,
              qdb_name: 'Deceased / Insurance',
              qdb_code: 'P6-DECEASED',
              qdb_isactive: true,
            }],
          };
        }
        if (logicalName === 'qdb_activityoutcome') {
          catalogueAnswered = true;
          if (options.outcomes === 'unreadable') throw { errorCode: 12345, message: 'nope' };
          return { entities: options.outcomes };
        }
        return { entities: [] };
      },
    },
  } as unknown as XrmLike;
}

function renderCard(options: Options) {
  const adapter = new XrmCrmAdapter(platform(options));
  return render(
    <CrmSessionProvider value={{ adapter, context: {} } as never}>
      <CaseDeceasedReview caseId={CASE_ID} />
    </CrmSessionProvider>,
  );
}

const outcome = (id: string) => ({
  qdb_activityoutcomeid: id, qdb_name: id, qdb_code: id, qdb_isactive: true,
});

afterEach(() => { cleanup(); catalogueAnswered = false; });

describe('a review that cannot be concluded', () => {
  it('says so on the card, in the same words the dialog uses', async () => {
    renderCard({ outcomes: [] });

    const banner = await screen.findByTestId('deceased-conclude-unavailable', {}, { timeout: WAIT });

    expect(banner.textContent).toContain(NO_OUTCOMES_CONFIGURED);
  });

  it('names the configuration, never the officer and never a fault', async () => {
    renderCard({ outcomes: [] });

    const banner = await screen.findByTestId('deceased-conclude-unavailable', {}, { timeout: WAIT });

    expect(banner.textContent).not.toMatch(/error|failed|try again|you must|please/i);
  });

  it('still shows the review itself rather than replacing it with the explanation', async () => {
    renderCard({ outcomes: [] });

    const row = await screen.findByTestId('deceased-row', {}, { timeout: WAIT });

    expect(row.dataset['state']).toBe('UnderReview');
  });
});

/**
 * Asserting that something never appears needs a settled screen, not a first glance.
 *
 * `waitFor(() => expect(...).toBeNull())` passes on its very first check — before the catalogue
 * read has resolved and before anything could have rendered — so it would hold however the code
 * behaved. This waits for the card, then for the catalogue to have been answered, and only then
 * looks. The sufficiency of that wait is itself asserted below, against the case that *does* show
 * the banner.
 */
async function settledCard(): Promise<void> {
  await screen.findByTestId('deceased-row', {}, { timeout: WAIT });
  await waitFor(() => expect(catalogueAnswered).toBe(true), { timeout: WAIT });
}

describe('a review that could be concluded', () => {
  it('says nothing, because there is nothing to explain', async () => {
    renderCard({ outcomes: [outcome('o1'), outcome('o2')] });

    await settledCard();

    expect(screen.queryByTestId('deceased-conclude-unavailable')).toBeNull();
  });

  /**
   * Proves the wait above is long enough to be meaningful. If the banner appears within it here,
   * then its absence in the other two cases is a real absence rather than an early look.
   */
  it('and the same wait is long enough for the banner to have appeared', async () => {
    renderCard({ outcomes: [] });

    await settledCard();

    expect(screen.queryByTestId('deceased-conclude-unavailable')).not.toBeNull();
  });
});

/**
 * The distinction the whole mechanism rests on.
 *
 * A catalogue that could not be read is **unknown**, not empty. Reporting it as empty would tell an
 * officer that QDB has configured nothing, on the evidence of a failed request — a different claim,
 * and one nobody established.
 */
describe('a catalogue that could not be read', () => {
  it('is not reported as an empty one', async () => {
    renderCard({ outcomes: 'unreadable' });

    await settledCard();

    expect(screen.queryByTestId('deceased-conclude-unavailable')).toBeNull();
  });
});
